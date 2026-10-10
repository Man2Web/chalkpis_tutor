import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { EmptyState, Row, Screen, Section, Skeleton, toast } from '../../components';
import { useInstituteId, useNotifySettings, useRefreshData } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { colors, spacing, type } from '../../theme';
import { saveNotifySettings } from './api';
import { clampDays, type NotifySettings } from './settings';

function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const btn = (sign: '−' | '+', delta: number, name: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      disabled={disabled}
      onPress={() => onChange(value + delta)}
      style={{
        width: 40,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.fill,
      }}
      hitSlop={6}
    >
      <Text style={{ fontSize: 20, fontWeight: '500', color: colors.text }}>{sign}</Text>
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: 6,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      {btn('−', -1, `${label} −`)}
      <Text style={[type.heading, { minWidth: 28, textAlign: 'center' }]}>{value}</Text>
      {btn('+', 1, `${label} +`)}
    </View>
  );
}

export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const settings = useNotifySettings();
  const refresh = useRefreshData();

  if (settings.isLoading)
    return (
      <Screen>
        <Skeleton height={120} />
      </Screen>
    );
  if (!settings.data)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void settings.refetch()}
        />
      </Screen>
    );
  const s = settings.data;

  const set = async (patch: Partial<NotifySettings>) => {
    try {
      await saveNotifySettings(instituteId, patch);
      await refresh();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  };
  const off = !s.enabled;

  return (
    <Screen>
      <Section footer={t('messages.masterHint')}>
        <Row
          icon="logo-whatsapp"
          iconColor="#25D366"
          title={t('messages.master')}
          toggle={{ value: s.enabled, onChange: (v) => set({ enabled: v }) }}
        />
      </Section>

      <Section title={t('messages.sendWhen')}>
        <Row
          title={t('messages.absent')}
          toggle={{ value: s.absent, onChange: (v) => set({ absent: v }), disabled: off }}
        />
        <Row
          title={t('messages.late')}
          toggle={{ value: s.late, onChange: (v) => set({ late: v }), disabled: off }}
        />
        <Row
          title={t('messages.paymentReceived')}
          toggle={{
            value: s.paymentReceived,
            onChange: (v) => set({ paymentReceived: v }),
            disabled: off,
          }}
        />
      </Section>

      <Section title={t('messages.feeReminders')} footer={t('messages.overdueHint')}>
        <Row
          title={t('messages.feeDue')}
          toggle={{ value: s.feeDue, onChange: (v) => set({ feeDue: v }), disabled: off }}
        />
        <Stepper
          label={t('messages.daysBefore')}
          value={s.feeDueDaysBefore}
          onChange={(n) => set({ feeDueDaysBefore: clampDays('feeDueDaysBefore', n) })}
          disabled={off || !s.feeDue}
        />
        <Row
          title={t('messages.feeOverdue')}
          toggle={{ value: s.feeOverdue, onChange: (v) => set({ feeOverdue: v }), disabled: off }}
        />
        <Stepper
          label={t('messages.repeatEvery')}
          value={s.overdueEveryDays}
          onChange={(n) => set({ overdueEveryDays: clampDays('overdueEveryDays', n) })}
          disabled={off || !s.feeOverdue}
        />
      </Section>

      <Text style={[type.footnote, { marginHorizontal: spacing.lg }]}>{t('messages.footer')}</Text>
    </Screen>
  );
}
