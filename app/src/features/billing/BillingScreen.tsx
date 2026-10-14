import { useIdempotencyKey } from '../../api/idempotency';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  Segmented,
  Skeleton,
  toast,
} from '../../components';
import {
  useBillingCatalogue,
  useBillingHistory,
  useInstituteId,
  useLimits,
  useRefreshData,
  type Limits,
} from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { open } from '../../lib/contact';
import { toYmd, fullDate } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import {
  buyOffer,
  manageStore,
  restoreStore,
  startStore,
  storeAvailable,
  storeOffers,
  type StoreOffer,
} from '../../lib/purchases';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, spacing, type, font } from '../../theme';
import {
  checkPlanOrder,
  createPlanLink,
  mockCompletePayment,
  syncStorePlan,
  type PlanLink,
} from './api';
import { billingError } from './errors';
import { planAction, storeAction, subscriptionState, usageFraction, usageLevel } from './logic';
import { rupeesPerDay, type Cycle, type PlanId, type PlanInfo } from './plans';

const LEVEL_COLOR = { ok: colors.primary, near: colors.warning, full: colors.danger } as const;

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { t } = useTranslation();
  const level = usageLevel(used, limit);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={type.body}>{label}</Text>
        <Text style={[type.label, { color: level === 'ok' ? colors.text : LEVEL_COLOR[level] }]}>
          {limit === null ? t('billing.unlimitedUsed', { used }) : `${used} / ${limit}`}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: '#ECEFF8', overflow: 'hidden' }}>
        <View
          style={{
            width: `${usageFraction(used, limit) * 100}%`,
            height: '100%',
            borderRadius: 4,
            backgroundColor: LEVEL_COLOR[level],
          }}
        />
      </View>
    </View>
  );
}

/** One plan card: name, price, the small print under it, the limits and its button. */
function PlanCard({
  plan,
  price,
  per,
  note,
  button,
}: {
  plan: PlanInfo;
  price: string;
  per: string;
  note: string | null;
  button: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card
      style={{
        gap: spacing.sm,
        borderRadius: radius.xl,
        ...(plan.popular ? { borderWidth: 2, borderColor: colors.primary } : null),
      }}
    >
      {plan.popular ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Chip label={t('billing.popular')} tone="accent" />
        </View>
      ) : null}
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <Text style={type.heading}>{t(`billing.plan.${plan.id}`)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={[type.heading, { fontSize: 22, ...font('700') }]}>{price}</Text>
          <Text style={type.caption}>{per}</Text>
        </View>
      </View>
      {note ? <Text style={[type.caption, { color: colors.primaryDark }]}>{note}</Text> : null}
      <Text style={type.body}>
        {plan.studentLimit === null
          ? t('billing.unlimitedStudents')
          : t('billing.upToStudents', { count: plan.studentLimit })}
      </Text>
      <Text style={type.body}>
        {plan.batchLimit === null
          ? t('billing.unlimitedBatches')
          : t('billing.upToBatches', { count: plan.batchLimit })}
      </Text>
      {button}
    </Card>
  );
}

/**
 * Plans & billing, for the owner: the plan, its usage, and buying.
 * - iPhone / Android: auto-renewing App Store / Google Play subscriptions (store prices, the ₹49 first month for those
 *   who can still get it, Restore and Manage), the only way a store app may sell a plan. With no store keys from the
 *   server it shows the plan only.
 * - Web: the website's one-time Razorpay payment, for a month or a year.
 */
export function BillingScreen() {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const idem = useIdempotencyKey();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const instituteId = useInstituteId();
  const limits = useLimits();
  const history = useBillingHistory();
  const catalogue = useBillingCatalogue();
  const refresh = useRefreshData();
  const [cycle, setCycle] = useState<Cycle>('year');

  const storeKey =
    Platform.OS === 'ios'
      ? catalogue.data?.store?.ios
      : Platform.OS === 'android'
        ? catalogue.data?.store?.android
        : null;
  const inStore = storeAvailable && !!storeKey;
  // In the browser, unknown while loading counts as available; only a clear "no" from the server hides the buttons.
  const canPayWeb = Platform.OS === 'web' && catalogue.data?.paymentsAvailable !== false;
  const offers = useQuery({
    queryKey: ['storeOffers', instituteId, storeKey],
    enabled: inStore,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      await startStore(storeKey!, instituteId);
      return storeOffers();
    },
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [link, setLink] = useState<{ plan: PlanId; cycle: Cycle; data: PlanLink } | null>(null);
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);

  // Web: while a checkout is open, ask the server where the order stands: when the tutor comes back to the app, and
  // every few seconds for ten minutes. The plan switches on here the moment Razorpay confirms.
  const pending = link?.data.provider === 'gateway' ? link.data.referenceId : null;
  const settled = useRef(false);
  const check = async (orderId: string, manual = false) => {
    if (settled.current) return;
    if (manual) setChecking(true);
    try {
      const state = await checkPlanOrder(orderId);
      if (state === 'paid') {
        settled.current = true;
        await refresh();
        toast(t('billing.activated'), 'success');
        setLink(null);
      } else if (state === 'failed') {
        settled.current = true;
        toast(t('billing.paymentFailed'), 'error');
        setLink(null);
      } else if (manual) toast(t('billing.stillPending'));
    } catch (e) {
      if (manual) {
        reportError(e);
        toast(t('billing.failed'), 'error');
      }
    } finally {
      if (manual) setChecking(false);
    }
  };
  useEffect(() => {
    if (!pending) return;
    settled.current = false;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 10 * 60_000) clearInterval(timer);
      else void check(pending);
    }, 5000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check(pending);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [pending]);

  if (limits.isLoading)
    return (
      <Screen>
        <Skeleton height={160} />
      </Screen>
    );
  const l = limits.data;
  if (!l)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void limits.refetch()}
        />
      </Screen>
    );

  const state = subscriptionState(
    {
      plan: l.plan,
      status: l.status,
      expiresAtMs: l.expiresAtMs,
      studentLimit: l.studentLimit,
      batchLimit: l.batchLimit,
    },
    Date.now(),
  );
  const planName = (id: string) => t(`billing.plan.${id}`, { defaultValue: id });
  const date = (ms: number) => fullDate(toYmd(new Date(ms)), locale);
  const expiryText = l.expiresAtMs ? date(l.expiresAtMs) : '—';
  const storeName = (n: NonNullable<Limits['store']>['name']) => t(`billing.store.${n}`);
  const plans = catalogue.data?.plans ?? [];

  // ---- store (iPhone / Android) ----

  const afterStore = async (done: () => void) => {
    // the server reads the store subscription at once (its webhook does the same moments later)
    await syncStorePlan().catch(reportError);
    await refresh();
    done();
  };
  const buy = async (o: StoreOffer) => {
    setBusy(o.productId);
    try {
      const r = await buyOffer(o, l.store?.product ?? null);
      if (r === 'cancelled') return;
      if (r === 'pending') {
        toast(t('billing.pending'));
        return;
      }
      await afterStore(() => toast(t('billing.activated'), 'success'));
    } catch (e) {
      reportError(e);
      toast(t('billing.storeFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };
  const restore = async () => {
    setRestoring(true);
    try {
      await restoreStore();
      const r = await syncStorePlan();
      await refresh();
      toast(t(r.state === 'store' ? 'billing.restored' : 'billing.nothingToRestore'));
    } catch (e) {
      reportError(e);
      toast(t('billing.storeFailed'), 'error');
    } finally {
      setRestoring(false);
    }
  };
  const manage = () =>
    manageStore().catch((e) => {
      reportError(e);
      toast(t('students.cannotOpen'), 'error');
    });

  // ---- website (web app) ----

  const choose = async (planId: PlanId) => {
    setBusy(planId);
    try {
      // per plan and cycle: a retry after a lost answer gets the same order, another choice is a new one
      const data = await createPlanLink(planId, cycle, {
        idempotencyKey: `${idem.key}-${planId}-${cycle}`,
      });
      idem.reset();
      setLink({ plan: planId, cycle, data });
      if (data.provider !== 'mock' && !(await open(data.url)))
        toast(t('students.cannotOpen'), 'error');
    } catch (e) {
      idem.settle(e);
      if (billingError(e) === 'not-configured') toast(t('billing.notConfigured'), 'error');
      else {
        reportError(e);
        toast(t('billing.failed'), 'error');
      }
    } finally {
      setBusy(null);
    }
  };
  const simulate = async () => {
    if (!link) return;
    setPaying(true);
    try {
      await mockCompletePayment(link.data.referenceId);
      await refresh();
      toast(t('billing.activated'), 'success');
      setLink(null);
    } catch (e) {
      reportError(e);
      toast(t('billing.failed'), 'error');
    } finally {
      setPaying(false);
    }
  };

  const cycleSwitch = (
    <Segmented
      options={[
        { value: 'year' as const, label: t('billing.yearly') },
        { value: 'month' as const, label: t('billing.monthly') },
      ]}
      value={cycle}
      onChange={setCycle}
    />
  );
  // a running trial or website plan is kept for after a new store subscription (the server banks those days)
  const keptNote =
    inStore && !l.store && !state.expired
      ? t(l.plan === 'trial' ? 'billing.keptTrial' : 'billing.keptPaid', { date: expiryText })
      : null;

  const storeCards = () => {
    if (offers.isLoading) return <Skeleton height={200} />;
    const list = (offers.data ?? []).filter((o) => o.cycle === cycle);
    if (!list.length)
      return (
        <Card>
          <Text style={type.body}>{t('billing.storeUnavailable')}</Text>
          <Button variant="ghost" title={t('common.retry')} onPress={() => void offers.refetch()} />
        </Card>
      );
    return plans.map((p) => {
      const o = list.find((x) => x.plan === p.id);
      if (!o) return null;
      const action = storeAction(l.store?.product ?? null, o.productId);
      const note =
        o.intro && o.cycle === 'month'
          ? t('billing.intro', { intro: o.intro, price: o.price })
          : o.currency === 'INR'
            ? t('billing.perDay', { amount: rupeesPerDay(o.amount * 100, o.cycle) })
            : null;
      return (
        <PlanCard
          key={p.id}
          plan={p}
          price={o.price}
          per={t(o.cycle === 'year' ? 'billing.perYear' : 'billing.perMonth')}
          note={note}
          button={
            <Button
              variant={action === 'current' ? 'secondary' : p.popular ? 'primary' : 'secondary'}
              title={
                action === 'current'
                  ? t('billing.currentPlan')
                  : action === 'switch'
                    ? t('billing.switchTo', { plan: planName(p.id) })
                    : o.intro && o.cycle === 'month'
                      ? t('billing.startFor', { intro: o.intro })
                      : t('billing.subscribe')
              }
              onPress={() => void buy(o)}
              loading={busy === o.productId}
              disabled={action === 'current' || busy !== null}
            />
          }
        />
      );
    });
  };

  const webCards = () =>
    plans.map((p) => {
      const action = planAction({ plan: l.plan, expired: state.expired }, p.id);
      const price = p.prices[cycle];
      return (
        <PlanCard
          key={p.id}
          plan={p}
          price={formatINR(price)}
          per={t(cycle === 'year' ? 'billing.perYear' : 'billing.perMonth')}
          note={t('billing.perDay', { amount: rupeesPerDay(price, cycle) })}
          button={
            <Button
              variant={action === 'renew' || !p.popular ? 'secondary' : 'primary'}
              title={t(action === 'renew' ? 'billing.renew' : 'billing.choose', {
                plan: planName(p.id),
              })}
              onPress={() => void choose(p.id)}
              loading={busy === p.id}
              disabled={busy !== null}
            />
          }
        />
      );
    });

  const accountName = Platform.OS === 'ios' ? 'Apple ID' : 'Google Play';

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={limits.isRefetching} onRefresh={() => void refresh()} />
        }
      >
        <Text style={type.largeTitle}>{t('billing.title')}</Text>

        <Card style={{ gap: spacing.xs, borderRadius: radius.xl }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={type.heading}>
              {planName(l.plan)}
              {l.cycle ? ` · ${t(l.cycle === 'year' ? 'billing.yearly' : 'billing.monthly')}` : ''}
            </Text>
            <Chip
              label={t(state.expired ? 'billing.expired' : 'billing.active')}
              tone={state.expired ? 'danger' : 'success'}
            />
          </View>
          <Text style={type.caption}>
            {state.expired
              ? t('billing.endedOn', { date: expiryText })
              : l.store?.willRenew
                ? t('billing.renewsOn', { date: expiryText, store: storeName(l.store.name) })
                : l.store
                  ? t('billing.endsNoRenew', { date: expiryText })
                  : t('billing.endsOn', { date: expiryText, count: state.daysLeft })}
          </Text>
          {l.store?.issue === 'billing' && !state.expired ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              {t('billing.storeIssue', { store: storeName(l.store.name) })}
            </Text>
          ) : null}
          {l.store?.thenUntilMs ? (
            <Text style={type.caption}>
              {t('billing.thenUntil', { date: date(l.store.thenUntilMs) })}
            </Text>
          ) : null}
          {state.expired ? (
            <Text style={[type.caption, { color: colors.danger }]}>{t('billing.readOnly')}</Text>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={type.heading}>{t('billing.usage')}</Text>
          <Meter label={t('home.students')} used={l.activeStudentCount} limit={l.studentLimit} />
          <Meter label={t('home.batches')} used={l.batchCount} limit={l.batchLimit} />
        </Card>

        {inStore || canPayWeb ? (
          <>
            <Text style={[type.heading, { fontSize: 20, paddingHorizontal: 4 }]}>
              {t(l.store ? 'billing.changePlan' : 'billing.choosePlan')}
            </Text>
            {cycleSwitch}
            <Text style={[type.caption, { paddingHorizontal: 4 }]}>
              {t(cycle === 'year' ? 'billing.yearlySaves' : 'billing.monthlyNote')}
            </Text>
            {keptNote ? (
              <Text style={[type.caption, { paddingHorizontal: 4 }]}>{keptNote}</Text>
            ) : null}
            {inStore ? storeCards() : webCards()}
            {inStore ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[type.caption, { paddingHorizontal: 4 }]}>
                  {t('billing.autoRenewNote', {
                    account: accountName,
                    where: t(Platform.OS === 'ios' ? 'billing.whereIos' : 'billing.whereAndroid'),
                  })}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.lg, paddingHorizontal: 4 }}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => nav.navigate('Legal', { doc: 'terms' })}
                    hitSlop={8}
                  >
                    <Text style={[type.caption, { color: colors.primaryDark }]}>
                      {t('billing.terms')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => nav.navigate('Legal', { doc: 'privacy' })}
                    hitSlop={8}
                  >
                    <Text style={[type.caption, { color: colors.primaryDark }]}>
                      {t('billing.privacy')}
                    </Text>
                  </Pressable>
                </View>
                <Button
                  variant="ghost"
                  title={t('billing.restore')}
                  onPress={() => void restore()}
                  loading={restoring}
                  disabled={busy !== null}
                />
                {l.store ? (
                  <Button
                    variant="ghost"
                    title={t('billing.manage')}
                    onPress={() => void manage()}
                  />
                ) : null}
              </View>
            ) : (
              <Text style={[type.caption, { paddingHorizontal: 4 }]}>{t('billing.webNote')}</Text>
            )}
          </>
        ) : (
          <Card style={{ gap: spacing.xs }}>
            <Text style={type.heading}>{t('billing.paymentsOffTitle')}</Text>
            <Text style={type.body}>{t('billing.paymentsOffMessage')}</Text>
          </Card>
        )}

        <Text style={[type.heading, { fontSize: 20, paddingHorizontal: 4, marginTop: spacing.sm }]}>
          {t('billing.history')}
        </Text>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {(history.data ?? []).length === 0 ? (
            <Text style={[type.caption, { padding: spacing.lg }]}>{t('billing.noHistory')}</Text>
          ) : null}
          {(history.data ?? []).map((r, i) => (
            <View
              key={r.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                padding: spacing.lg,
                borderTopWidth: i ? 0.5 : 0,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={type.body}>
                  {planName(r.planId)}
                  {r.cycle
                    ? ` · ${t(r.cycle === 'year' ? 'billing.yearly' : 'billing.monthly')}`
                    : ''}
                </Text>
                <Text style={type.caption}>
                  {fullDate(toYmd(r.createdAt.toDate()), locale)}
                  {r.provider === 'apple' || r.provider === 'google'
                    ? ` · ${t(`billing.paidVia.${r.provider}`)}`
                    : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={type.label}>
                  {r.currency === 'INR'
                    ? formatINR(r.amountPaise)
                    : `${r.currency} ${(r.amountPaise / 100).toFixed(2)}`}
                </Text>
                {r.refunded ? (
                  <Text style={[type.caption, { color: colors.danger }]}>
                    {t('billing.refunded')}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      <BottomSheet
        visible={!!link}
        onClose={() => setLink(null)}
        title={link ? planName(link.plan) : ''}
      >
        {link?.data.provider === 'mock' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={type.body}>{t('billing.testMode')}</Text>
            <Button
              title={t('billing.simulatePay', {
                amount: formatINR(plans.find((p) => p.id === link.plan)?.prices[link.cycle] ?? 0),
              })}
              onPress={simulate}
              loading={paying}
            />
            <Button
              variant="ghost"
              title={t('common.cancel')}
              onPress={() => setLink(null)}
              disabled={paying}
            />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={type.body}>{t('billing.completeInBrowser')}</Text>
            <Button
              title={t('billing.paidRefresh')}
              onPress={() => link && void check(link.data.referenceId, true)}
              loading={checking}
            />
            <Button
              variant="ghost"
              title={t('billing.openAgain')}
              onPress={() => link && void open(link.data.url)}
            />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}
