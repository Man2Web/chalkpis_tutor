import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Chip, EmptyState, Screen, Skeleton, toast } from '../../components';
import { useBatches, useStudents } from '../../data/hooks';
import { AttendanceSummary } from '../attendance/AttendanceSummary';
import { callUrl, open, whatsappUrl } from '../../lib/contact';
import { formatINR } from '../../lib/money';
import { nationalNumber } from '../../lib/phone';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.body, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

export function StudentProfileScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'StudentProfile'>) {
  const { t } = useTranslation();
  const students = useStudents();
  const batches = useBatches();
  const s = students.data?.find((x) => x.id === route.params.id);

  if (students.isLoading)
    return (
      <Screen>
        <Skeleton height={80} />
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

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg }}>
        <Avatar name={s.name} uri={s.photoUrl} size={88} />
        <Text style={type.title}>{s.name}</Text>
        <Chip
          label={t(s.status === 'active' ? 'students.active' : 'students.inactive')}
          tone={s.status === 'active' ? 'success' : 'neutral'}
        />
      </View>

      {s.parentPhone ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            style={{ flex: 1 }}
            title={t('students.callParent')}
            onPress={() => go(callUrl(s.parentPhone))}
          />
          <Button
            style={{ flex: 1 }}
            variant="secondary"
            title="WhatsApp"
            onPress={() => go(whatsappUrl(s.parentPhone))}
          />
        </View>
      ) : null}
      {s.phone ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            style={{ flex: 1 }}
            variant="ghost"
            title={t('students.callStudent')}
            onPress={() => go(callUrl(s.phone))}
          />
          <Button
            style={{ flex: 1 }}
            variant="ghost"
            title={t('students.whatsappStudent')}
            onPress={() => go(whatsappUrl(s.phone))}
          />
        </View>
      ) : null}

      <Card style={{ marginTop: spacing.md }}>
        <Row label={t('students.parentName')} value={s.parentName} />
        <Row label={t('students.parentPhone')} value={nationalNumber(s.parentPhone)} />
        <Row label={t('students.phone')} value={s.phone ? nationalNumber(s.phone) : ''} />
        <Row label={t('onboarding.class')} value={s.class} />
        <Row label={t('students.batches')} value={names} />
        <Row label={t('onboarding.monthlyFee')} value={formatINR(s.monthlyFee)} />
        <Row label={t('students.feeCycle')} value={t(`students.cycle.${cycleKey}`)} />
        <Row label={t('students.dueDay')} value={String(s.dueDay)} />
        <Row
          label={t('students.joinedOn')}
          value={s.joinedAt.toDate().toLocaleDateString('en-GB')}
        />
        <Row label={t('students.notes')} value={s.notes} />
      </Card>

      <Button
        style={{ marginTop: spacing.md }}
        variant="secondary"
        title={t('students.fees')}
        onPress={() => navigation.navigate('FeeLedger', { studentId: s.id })}
      />

      <View style={{ marginTop: spacing.md }}>
        <AttendanceSummary studentId={s.id} />
      </View>

      <Button
        style={{ marginTop: spacing.lg }}
        title={t('students.edit')}
        onPress={() => navigation.navigate('StudentForm', { id: s.id })}
      />
    </Screen>
  );
}
