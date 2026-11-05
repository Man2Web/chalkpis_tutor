import { useLayoutEffect } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useCategory } from '../../lib/category';
import {
  ActionButton,
  Avatar,
  Button,
  Chip,
  EmptyState,
  Row,
  Screen,
  Section,
  Skeleton,
  toast,
} from '../../components';
import { useBatches, usePendingStudentIds, useStudents } from '../../data/hooks';
import { AttendanceSummary } from '../attendance/AttendanceSummary';
import { ParentLinkCard } from '../parentView/ParentLinkCard';
import { FamilySection } from './FamilySection';
import { StudentExamsCard } from '../exams/StudentExamsCard';
import { StudentHomeworkCard } from '../homework/StudentHomeworkCard';
import { callUrl, open, whatsappUrl } from '../../lib/contact';
import { formatINR } from '../../lib/money';
import { formatIndianPhone } from '../../lib/phone';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { ordinalDay } from './logic';

/** A student's card, laid out like a contact in iOS Contacts: who, quick actions, then grouped details. */
export function StudentProfileScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'StudentProfile'>) {
  const { t, i18n } = useTranslation();
  const { ct } = useCategory();
  const students = useStudents();
  const batches = useBatches();
  const pending = usePendingStudentIds();
  const s = students.data?.find((x) => x.id === route.params.id);

  useLayoutEffect(() => {
    if (!s) return;
    navigation.setOptions({
      headerRight: () => (
        <Button
          variant="ghost"
          size="small"
          title={t('common.edit')}
          onPress={() => navigation.navigate('StudentForm', { id: s.id })}
        />
      ),
    });
  }, [navigation, s, t]);

  if (students.isLoading)
    return (
      <Screen>
        <Skeleton height={80} />
      </Screen>
    );
  // a failed load with nothing cached is not "not found": offer to try again
  if (students.isError && !students.data)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void students.refetch()}
        />
      </Screen>
    );
  if (!s)
    return (
      <Screen>
        <EmptyState title={t('students.notFound')} />
      </Screen>
    );

  const go = async (url: string) => {
    if (!(await open(url))) toast(t('students.cannotOpen'), 'error');
  };
  const cycleKey = s.feeCycle === 'one-time' ? 'oneTime' : s.feeCycle;
  const names = s.batchIds
    .map((id) => batches.data?.find((b) => b.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  // undefined while the dues load or after they failed: then no fee pill at all, never a wrong "All paid"
  const owes = pending.data ? pending.data.has(s.id) : undefined;
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const dob = s.dob
    ? new Date(`${s.dob}T00:00:00Z`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';
  const active = s.status === 'active';

  return (
    <Screen>
      <View
        style={{ alignItems: 'center', gap: 6, marginTop: spacing.sm, marginBottom: spacing.lg }}
      >
        <Avatar name={s.name} uri={s.photoUrl} size={96} />
        <Text style={[type.title1, { textAlign: 'center' }]}>{s.name}</Text>
        <Text style={[type.subhead, { color: colors.textMuted, textAlign: 'center' }]}>
          {[s.class && ct('levelValue', { n: s.class }), names].filter(Boolean).join(' · ')}
        </Text>
        {/* wrapped: Chip aligns itself to the start, and this header is centred */}
        <View>
          {!active ? (
            <Chip small label={t('students.inactive')} />
          ) : owes === undefined ? null : (
            <Chip
              small
              label={t(owes ? 'students.feesPending' : 'students.allPaid')}
              tone={owes ? 'warning' : 'success'}
            />
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        <ActionButton
          icon="call"
          label={t('students.call')}
          onPress={() => go(callUrl(s.parentPhone))}
          disabled={!s.parentPhone}
        />
        <ActionButton
          icon="logo-whatsapp"
          label="WhatsApp"
          onPress={() => go(whatsappUrl(s.parentPhone))}
          disabled={!s.parentPhone}
        />
      </View>

      <Section title={t('students.parentSection')}>
        <Row title={t('students.parentName')} value={s.parentName || '—'} />
        <Row
          title={t('students.parentPhone')}
          value={formatIndianPhone(s.parentPhone)}
          onPress={() => go(callUrl(s.parentPhone))}
        />
        {s.phone ? (
          <Row
            title={t('students.phone')}
            value={formatIndianPhone(s.phone)}
            onPress={() => go(callUrl(s.phone))}
          />
        ) : null}
      </Section>

      <FamilySection student={s} />

      <Section title={t('students.fees')}>
        <Row
          icon="wallet"
          iconColor={colors.successFill}
          title={t('students.feesAndPayments')}
          onPress={() => navigation.navigate('FeeLedger', { studentId: s.id })}
        />
        <Row
          title={t(s.feeCycle === 'yearly' ? 'fees.yearlyFee' : 'onboarding.monthlyFee')}
          value={formatINR(s.monthlyFee)}
        />
        <Row title={t('students.feeCycle')} value={t(`students.cycle.${cycleKey}`)} />
        {s.feeCycle === 'yearly' ? null : (
          <Row
            title={t('students.dueDay')}
            value={t('students.dueDayValue', { day: ordinalDay(s.dueDay) })}
          />
        )}
      </Section>

      <Section title={t('students.details')}>
        {s.class ? <Row title={ct('level')} value={s.class} /> : null}
        {names ? <Row title={t('students.batches')} value={names} /> : null}
        {dob ? <Row title={t('students.dobShort')} value={dob} /> : null}
        {s.gender ? (
          <Row title={t('students.genderShort')} value={t(`students.genders.${s.gender}`)} />
        ) : null}
        <Row
          title={t('students.joinedOn')}
          value={s.joinedAt.toDate().toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        />
      </Section>

      {s.notes ? (
        <Section title={t('students.notes')}>
          <View style={{ padding: spacing.lg }}>
            <Text style={type.body}>{s.notes}</Text>
          </View>
        </Section>
      ) : null}

      <View style={{ marginBottom: spacing.xl }}>
        <StudentExamsCard student={s} />
      </View>
      <View style={{ marginBottom: spacing.xl }}>
        <StudentHomeworkCard studentId={s.id} />
      </View>
      <View style={{ marginBottom: spacing.xl }}>
        <AttendanceSummary studentId={s.id} />
      </View>
      <View style={{ marginBottom: spacing.xl }}>
        <ParentLinkCard
          student={{ id: s.id, name: s.name, parentName: s.parentName, parentPhone: s.parentPhone }}
        />
      </View>
    </Screen>
  );
}
