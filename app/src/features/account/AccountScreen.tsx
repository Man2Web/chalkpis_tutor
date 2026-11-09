import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge } from 'panelui-native/components/badge';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  Row,
  Screen,
  Section,
  TopBar,
  toast,
} from '../../components';
import { reportError } from '../../lib/analytics';
import { queryClient } from '../../lib/queryClient';
import { leaveCentre } from '../staff/api';
import { formatIndianPhone } from '../../lib/phone';
import { useInstitute, useLimits } from '../../data/hooks';
import { open as openUrl } from '../../lib/contact';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { logout, refreshProfile, useIsStaff, useSession } from '../auth/session';
import { subscriptionState } from '../billing/logic';
import { mailto, SUPPORT_EMAIL } from '../legal/LegalScreen';
import { DeleteAccountSheet } from '../settings/DeleteAccountSheet';

const VERSION = Constants.expoConfig?.version ?? '';
type Nav = NativeStackNavigationProp<MainStackParams>;

/** The top of Account: the tutor's photo or logo, name, institute, phone and plan, and Edit profile. */
function ProfileCard({ onEdit, plan }: { onEdit?: () => void; plan?: string }) {
  const { t } = useTranslation();
  const profile = useSession((s) => s.profile);
  const inst = useInstitute();
  const name = profile?.name ?? '';
  return (
    <Card
      style={{
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.xl,
        marginBottom: spacing.xl,
      }}
    >
      {inst.data?.logoUrl ? (
        <Image
          source={{ uri: inst.data.logoUrl }}
          style={{ width: 76, height: 76, borderRadius: 38 }}
          accessibilityLabel={name}
        />
      ) : (
        <Avatar name={name || '?'} size={76} />
      )}
      <Text style={[type.title3, { marginTop: spacing.sm, textAlign: 'center' }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[type.footnote, { textAlign: 'center' }]} numberOfLines={1}>
        {[inst.data?.name, profile?.phone ? formatIndianPhone(profile.phone) : undefined]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {plan ? (
        <Badge variant="secondary" className="mt-1 self-center">
          {plan}
        </Badge>
      ) : null}
      {onEdit ? (
        <View style={{ marginTop: spacing.md }}>
          <Button size="small" variant="outline" title={t('menu.editProfile')} onPress={onEdit} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * How this account signs in: WhatsApp, with the mobile number. An older account made without a number offers to
 * add one here.
 */
function SignInSection({ onAddPhone }: { onAddPhone: () => void }) {
  const { t } = useTranslation();
  const phone = useSession((s) => s.profile?.phone);
  return (
    <Section title={t('account.signIn')}>
      {phone ? (
        <Row
          icon="logo-whatsapp"
          iconColor={colors.whatsapp}
          title="WhatsApp"
          value={formatIndianPhone(phone)}
        />
      ) : (
        <Row
          icon="logo-whatsapp"
          iconColor={colors.whatsapp}
          title="WhatsApp"
          subtitle={t('addPhone.title')}
          value={t('account.notAdded')}
          onPress={onAddPhone}
        />
      )}
    </Section>
  );
}

/** Everything that is not a daily task: profile, business settings, parent messages, tools, plan, help, sign out. */
function AccountContent({
  go,
  onDelete,
  onLogout,
  onLeave,
}: {
  go: Nav['navigate'];
  onDelete: () => void;
  onLogout: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const staff = useIsStaff();
  const inst = useInstitute();
  const limits = useLimits();

  const about = (
    <Section title={t('legal.about')} footer={t('legal.builtBy')}>
      <Row
        icon="shield-checkmark"
        iconColor={colors.gray}
        title={t('legal.privacy')}
        onPress={() => go('Legal', { doc: 'privacy' })}
      />
      <Row
        icon="document-text"
        iconColor={colors.gray}
        title={t('legal.terms')}
        onPress={() => go('Legal', { doc: 'terms' })}
      />
      <Row
        icon="mail"
        iconColor={colors.infoFill}
        title={t('legal.contact')}
        // under the title, so neither is cut short on a narrow phone
        subtitle={SUPPORT_EMAIL}
        onPress={() => void openUrl(mailto('Chalkpis support'))}
      />
    </Section>
  );
  const footer = (
    <Text style={[type.caption2, { textAlign: 'center', marginBottom: spacing.lg }]}>
      Chalkpis{VERSION ? ` · ${VERSION}` : ''}
      {'\n'}© 2026 M2W Technologies Private Limited
    </Text>
  );

  // A helper only sees who they are, help and signing out; everything else is the owner's.
  if (staff)
    return (
      <>
        <ProfileCard />
        <Text style={[type.footnote, { marginHorizontal: spacing.xs, marginBottom: spacing.lg }]}>
          {t('more.staffNote')}
        </Text>
        {about}
        <Section>
          <Row title={t('more.logout')} onPress={onLogout} destructive />
        </Section>
        <Section footer={t('more.leaveFooter')}>
          <Row title={t('more.leaveCentre')} onPress={onLeave} destructive />
        </Section>
        {footer}
      </>
    );

  const l = limits.data;
  const sub = l
    ? subscriptionState(
        {
          plan: l.plan,
          status: l.status,
          expiresAtMs: l.expiresAtMs,
          studentLimit: l.studentLimit,
          batchLimit: l.batchLimit,
        },
        Date.now(),
      )
    : null;
  const planName = l ? t(`billing.plan.${l.plan}`, { defaultValue: l.plan }) : undefined;
  const planLabel = planName
    ? `${planName}${sub && l?.status === 'active' ? ` · ${t('more.daysLeft', { count: sub.daysLeft })}` : ''}`
    : undefined;

  return (
    <>
      <ProfileCard onEdit={() => go('EditProfile')} plan={planLabel} />
      <SignInSection onAddPhone={() => go('AddPhone')} />

      <Section title={t('more.business')}>
        <Row
          icon="business"
          iconColor={colors.indigo}
          title={t('settings.instituteTitle')}
          onPress={() => go('Settings')}
        />
        <Row
          icon="qr-code"
          iconColor={colors.successFill}
          title={t('settings.paymentsTitle')}
          value={
            inst.data?.upiId
              ? 'UPI'
              : inst.data?.paymentLink
                ? t('more.linkSet')
                : t('settings.notSet')
          }
          onPress={() => go('PaymentSettings')}
        />
        <Row
          icon="layers"
          iconColor={colors.warningFill}
          title={t('batches.title')}
          onPress={() => go('Batches')}
        />
        <Row
          icon="people"
          iconColor={colors.teal}
          title={t('staff.title')}
          onPress={() => go('Staff')}
        />
      </Section>

      <Section title={t('more.parents')}>
        <Row
          icon="chatbubble-ellipses"
          iconColor={colors.successFill}
          title={t('messages.settingsTitle')}
          onPress={() => go('NotificationSettings')}
        />
        <Row
          icon="time"
          iconColor={colors.gray}
          title={t('messages.logTitle')}
          onPress={() => go('MessageLog')}
        />
      </Section>

      <Section title={t('more.tools')}>
        <Row
          icon="calendar"
          iconColor={colors.infoFill}
          title={t('calendar.title')}
          onPress={() => go('Timetable')}
        />
        <Row
          icon="school"
          iconColor={colors.indigo}
          title={t('exams.title')}
          onPress={() => go('Exams')}
        />
        <Row
          icon="book"
          iconColor={colors.teal}
          title={t('homework.title')}
          onPress={() => go('Homework')}
        />
        <Row
          icon="person-add"
          iconColor={colors.successFill}
          title={t('enquiries.title')}
          onPress={() => go('Enquiries')}
        />
        <Row
          icon="bar-chart"
          iconColor={colors.infoFill}
          title={t('more.feeReport')}
          onPress={() => go('Reports')}
        />
        <Row
          icon="image"
          iconColor={colors.pink}
          title={t('poster.title')}
          onPress={() => go('Poster')}
        />
      </Section>

      <Section title={t('more.account')}>
        <Row
          icon="card"
          iconColor={colors.purple}
          title={t('billing.title')}
          onPress={() => go('Billing')}
        />
      </Section>

      {about}

      <Section>
        <Row title={t('more.logout')} onPress={onLogout} destructive />
      </Section>
      <Section footer={t('more.deleteFooter')}>
        <Row title={t('settings.deleteButton')} onPress={onDelete} destructive />
      </Section>
      {footer}
    </>
  );
}

/**
 * The Account tab: who you are, then every setting and tool that is not a daily task. The only way into them,
 * so each lives in exactly one place.
 */
export function AccountScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // a helper stepping out of the centre (decision 174); the app goes back to "set up your centre"
  const [quitting, setQuitting] = useState(false);
  const [quitBusy, setQuitBusy] = useState(false);
  const inst = useInstitute();
  const quit = async () => {
    setQuitBusy(true);
    try {
      await leaveCentre();
      setQuitting(false);
      toast(t('more.leftCentre'), 'success');
      await refreshProfile();
      queryClient.clear(); // nothing of the centre stays on this phone
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    } finally {
      setQuitBusy(false);
    }
  };
  return (
    <Screen>
      <TopBar title={t('tabs.account')} />
      <View style={{ height: spacing.sm }} />
      <AccountContent
        go={nav.navigate}
        onDelete={() => setDeleting(true)}
        onLogout={() => setLeaving(true)}
        onLeave={() => setQuitting(true)}
      />
      <ConfirmSheet
        visible={quitting}
        onClose={() => setQuitting(false)}
        title={t('more.leaveTitle', { centre: inst.data?.name ?? '' })}
        message={t('more.leaveText')}
        confirmLabel={t('more.leaveCentre')}
        destructive
        loading={quitBusy}
        onConfirm={() => void quit()}
      />
      <DeleteAccountSheet visible={deleting} onClose={() => setDeleting(false)} />
      {/* signing back in needs a WhatsApp code, so ask first */}
      <ConfirmSheet
        visible={leaving}
        onClose={() => setLeaving(false)}
        title={t('more.logoutTitle')}
        message={t('more.logoutText')}
        confirmLabel={t('more.logout')}
        destructive
        loading={signingOut}
        onConfirm={() => {
          setSigningOut(true);
          void logout().finally(() => setSigningOut(false));
        }}
      />
    </Screen>
  );
}
