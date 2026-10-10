import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar, Row, Screen, Section } from '../../components';
import { useInstitute, useLimits } from '../../data/hooks';
import { open } from '../../lib/contact';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, shadow, spacing, type } from '../../theme';
import { logout, useIsStaff, useSession } from '../auth/session';
import { subscriptionState } from '../billing/logic';
import { DeleteAccountSheet } from '../settings/DeleteAccountSheet';
import { mailto, SUPPORT_EMAIL } from '../legal/LegalScreen';

const VERSION = Constants.expoConfig?.version ?? '';

/** The tutor's card at the top of Profile: photo or logo, name, institute, phone and plan. */
function ProfileHeader({ onPress, plan }: { onPress?: () => void; plan?: string }) {
  const profile = useSession((s) => s.profile);
  const inst = useInstitute();
  const name = profile?.name ?? '';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        padding: spacing.lg,
        marginBottom: spacing.xl,
        backgroundColor: pressed ? '#E5E5EA' : colors.surface,
        borderRadius: radius.md - 2,
        ...shadow.card,
      })}
    >
      {inst.data?.logoUrl ? (
        <Image
          source={{ uri: inst.data.logoUrl }}
          style={{ width: 64, height: 64, borderRadius: 32 }}
        />
      ) : (
        <Avatar name={name || '?'} size={64} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.title3} numberOfLines={1}>
          {name}
        </Text>
        {inst.data?.name ? (
          <Text style={[type.subhead, { color: colors.textMuted }]} numberOfLines={1}>
            {inst.data.name}
          </Text>
        ) : null}
        <Text style={type.footnote}>{profile?.phone}</Text>
        {plan ? (
          <View
            style={{
              alignSelf: 'flex-start',
              marginTop: 4,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: colors.primarySoft,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primaryDark }}>
              {plan}
            </Text>
          </View>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </Pressable>
  );
}

/** Profile: who you are, then every setting and tool in iOS Settings-style groups. */
export function MoreScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const staff = useIsStaff();
  const inst = useInstitute();
  const limits = useLimits();
  const [deleting, setDeleting] = useState(false);

  const footer = (
    <Text style={[type.footnote, { textAlign: 'center', marginBottom: spacing.xl }]}>
      Chalkpis for Tutors{VERSION ? ` · ${VERSION}` : ''}
      {'\n'}© 2026 M2W Technologies Private Limited
    </Text>
  );

  // A helper only sees who they are, the language and signing out; everything else is the owner's.
  if (staff)
    return (
      <Screen>
        <Text style={[type.largeTitle, { marginBottom: spacing.md }]}>{t('tabs.profile')}</Text>
        <ProfileHeader />
        <Text style={[type.footnote, { marginHorizontal: spacing.lg, marginBottom: spacing.xl }]}>
          {t('more.staffNote')}
        </Text>
        <Section title={t('legal.about')} footer={t('legal.builtBy')}>
          <Row
            icon="shield-checkmark"
            iconColor={colors.gray}
            title={t('legal.privacy')}
            onPress={() => nav.navigate('Legal', { doc: 'privacy' })}
          />
          <Row
            icon="document-text"
            iconColor={colors.gray}
            title={t('legal.terms')}
            onPress={() => nav.navigate('Legal', { doc: 'terms' })}
          />
          <Row
            icon="mail"
            iconColor={colors.primary}
            title={t('legal.contact')}
            value={SUPPORT_EMAIL}
            onPress={() => void open(mailto('Chalkpis support'))}
          />
        </Section>

        <Section>
          <Row title={t('more.logout')} onPress={() => void logout()} destructive />
        </Section>
        {footer}
      </Screen>
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
  const planLabel = l
    ? `${t(`billing.plan.${l.plan}`, { defaultValue: l.plan })}${
        sub && l.status === 'active' ? ` · ${t('more.daysLeft', { count: sub.daysLeft })}` : ''
      }`
    : undefined;

  return (
    <Screen>
      <Text style={[type.largeTitle, { marginBottom: spacing.md }]}>{t('tabs.profile')}</Text>
      <ProfileHeader onPress={() => nav.navigate('EditProfile')} plan={planLabel} />

      <Section title={t('more.business')}>
        <Row
          icon="business"
          iconColor={colors.indigo}
          title={t('settings.instituteTitle')}
          onPress={() => nav.navigate('Settings')}
        />
        <Row
          icon="qr-code"
          iconColor={colors.successFill}
          title={t('settings.paymentsTitle')}
          value={
            inst.data?.upiId || (inst.data?.paymentLink ? t('more.linkSet') : t('settings.notSet'))
          }
          onPress={() => nav.navigate('PaymentSettings')}
        />
        <Row
          icon="layers"
          iconColor={colors.warningFill}
          title={t('batches.title')}
          onPress={() => nav.navigate('Batches')}
        />
        <Row
          icon="people"
          iconColor={colors.teal}
          title={t('staff.title')}
          onPress={() => nav.navigate('Staff')}
        />
      </Section>

      <Section title={t('more.parents')}>
        <Row
          icon="chatbubble-ellipses"
          iconColor={colors.successFill}
          title={t('messages.settingsTitle')}
          onPress={() => nav.navigate('NotificationSettings')}
        />
        <Row
          icon="time"
          iconColor={colors.gray}
          title={t('messages.logTitle')}
          onPress={() => nav.navigate('MessageLog')}
        />
      </Section>

      <Section title={t('more.tools')}>
        <Row
          icon="bar-chart"
          iconColor={colors.primary}
          title={t('more.feeReport')}
          onPress={() => nav.navigate('Reports')}
        />
        <Row
          icon="stats-chart"
          iconColor={colors.purple}
          title={t('more.attendanceReport')}
          onPress={() => nav.navigate('AttendanceReport')}
        />
        <Row
          icon="image"
          iconColor={colors.pink}
          title={t('poster.title')}
          onPress={() => nav.navigate('Poster')}
        />
        <Row
          icon="document-text"
          iconColor={colors.indigo}
          title={t('import.fromFile')}
          onPress={() => nav.navigate('StudentImport', { mode: 'csv' })}
        />
        <Row
          icon="person-add"
          iconColor={colors.teal}
          title={t('import.fromContacts')}
          onPress={() => nav.navigate('StudentImport', { mode: 'contacts' })}
        />
      </Section>

      <Section title={t('more.account')}>
        <Row
          icon="card"
          iconColor={colors.primary}
          title={t('billing.title')}
          value={l ? t(`billing.plan.${l.plan}`, { defaultValue: l.plan }) : undefined}
          onPress={() => nav.navigate('Billing')}
        />
      </Section>

      <Section title={t('legal.about')} footer={t('legal.builtBy')}>
        <Row
          icon="shield-checkmark"
          iconColor={colors.gray}
          title={t('legal.privacy')}
          onPress={() => nav.navigate('Legal', { doc: 'privacy' })}
        />
        <Row
          icon="document-text"
          iconColor={colors.gray}
          title={t('legal.terms')}
          onPress={() => nav.navigate('Legal', { doc: 'terms' })}
        />
        <Row
          icon="mail"
          iconColor={colors.primary}
          title={t('legal.contact')}
          value={SUPPORT_EMAIL}
          onPress={() => void open(mailto('Chalkpis support'))}
        />
      </Section>

      <Section>
        <Row title={t('more.logout')} onPress={() => void logout()} destructive />
      </Section>
      <Section footer={t('more.deleteFooter')}>
        <Row title={t('settings.deleteButton')} onPress={() => setDeleting(true)} destructive />
      </Section>
      {footer}
      <DeleteAccountSheet visible={deleting} onClose={() => setDeleting(false)} />
    </Screen>
  );
}
