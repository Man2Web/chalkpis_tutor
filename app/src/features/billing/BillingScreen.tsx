import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import {
  useBillingHistory,
  useLimits,
  usePaymentsAvailable,
  useRefreshData,
} from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { open } from '../../lib/contact';
import { toYmd, prettyDate } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { colors, radius, spacing, type } from '../../theme';
import { createPlanLink, mockCompletePayment, type PlanLink } from './api';
import { billingError } from './errors';
import { planAction, subscriptionState, usageFraction, usageLevel } from './logic';
import { PLANS, type PlanId } from './plans';

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

export function BillingScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const limits = useLimits();
  const history = useBillingHistory();
  const payments = usePaymentsAvailable();
  // Unknown while loading counts as available; only a clear "no" from the server hides the buy buttons.
  const canPay = payments.data !== false;
  const refresh = useRefreshData();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [link, setLink] = useState<{ plan: PlanId; data: PlanLink } | null>(null);
  const [paying, setPaying] = useState(false);

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

  const choose = async (planId: PlanId) => {
    setBusyPlan(planId);
    try {
      const data = await createPlanLink(planId);
      if (data.provider === 'mock') setLink({ plan: planId, data });
      else {
        setLink({ plan: planId, data });
        if (!(await open(data.url))) toast(t('students.cannotOpen'), 'error');
      }
    } catch (e) {
      if (billingError(e) === 'not-configured') toast(t('billing.notConfigured'), 'error');
      else {
        reportError(e);
        toast(t('billing.failed'), 'error');
      }
    } finally {
      setBusyPlan(null);
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

  const checkNow = async () => {
    await refresh();
    setLink(null);
  };

  const expiryText = l.expiresAtMs ? prettyDate(toYmd(new Date(l.expiresAtMs)), locale) : '—';

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
            <Text style={type.heading}>{planName(l.plan)}</Text>
            <Chip
              label={t(state.expired ? 'billing.expired' : 'billing.active')}
              tone={state.expired ? 'danger' : 'success'}
            />
          </View>
          <Text style={type.caption}>
            {state.expired
              ? t('billing.endedOn', { date: expiryText })
              : t('billing.endsOn', { date: expiryText, count: state.daysLeft })}
          </Text>
          {state.expired ? (
            <Text style={[type.caption, { color: colors.danger }]}>{t('billing.readOnly')}</Text>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={type.heading}>{t('billing.usage')}</Text>
          <Meter label={t('home.students')} used={l.activeStudentCount} limit={l.studentLimit} />
          <Meter label={t('home.batches')} used={l.batchCount} limit={l.batchLimit} />
        </Card>

        {!canPay ? (
          <Card style={{ gap: spacing.xs }}>
            <Text style={type.heading}>{t('billing.paymentsOffTitle')}</Text>
            <Text style={type.body}>{t('billing.paymentsOffMessage')}</Text>
          </Card>
        ) : (
          <Text style={[type.heading, { fontSize: 20, paddingHorizontal: 4 }]}>
            {t('billing.choosePlan')}
          </Text>
        )}
        {(canPay ? PLANS : []).map((p) => {
          const action = planAction({ plan: l.plan, expired: state.expired }, p.id);
          return (
            <Card key={p.id} style={{ gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Text style={type.heading}>{planName(p.id)}</Text>
                <Text style={[type.heading, { fontSize: 22, fontWeight: '700' }]}>
                  {formatINR(p.pricePaise)}
                </Text>
              </View>
              <Text style={type.caption}>{t('billing.forMonths', { count: p.months })}</Text>
              <Text style={type.body}>
                {p.studentLimit === null
                  ? t('billing.unlimitedStudents')
                  : t('billing.upToStudents', { count: p.studentLimit })}
              </Text>
              <Text style={type.body}>
                {p.batchLimit === null
                  ? t('billing.unlimitedBatches')
                  : t('billing.upToBatches', { count: p.batchLimit })}
              </Text>
              <Button
                variant={action === 'renew' ? 'secondary' : 'primary'}
                title={t(action === 'renew' ? 'billing.renew' : 'billing.choose', {
                  plan: planName(p.id),
                })}
                onPress={() => choose(p.id)}
                loading={busyPlan === p.id}
                disabled={busyPlan !== null}
              />
            </Card>
          );
        })}

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
              <View>
                <Text style={type.body}>{planName(r.planId)}</Text>
                <Text style={type.caption}>{prettyDate(toYmd(r.createdAt.toDate()), locale)}</Text>
              </View>
              <Text style={type.label}>{formatINR(r.amountPaise)}</Text>
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
                amount: formatINR(PLANS.find((p) => p.id === link.plan)?.pricePaise ?? 0),
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
            <Button title={t('billing.paidRefresh')} onPress={checkNow} />
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
