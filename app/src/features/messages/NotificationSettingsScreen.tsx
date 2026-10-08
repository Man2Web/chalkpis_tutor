import { Pressable, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Chip, EmptyState, Screen, Skeleton, toast } from '../../components';
import { useInstituteId, useNotifySettings, useRefreshData } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { colors, radius, spacing, TAP, type } from '../../theme';
import { saveNotifySettings } from './api';
import { clampDays, type NotifySettings } from './settings';

function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: TAP + 8,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body}>{label}</Text>
        {hint ? <Text style={type.caption}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
      />
    </View>
  );
}

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
        width: TAP,
        height: TAP,
        borderRadius: TAP / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: '600', color: colors.primary }}>{sign}</Text>
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        justifyContent: 'space-between',
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={[type.caption, { flex: 1, fontSize: 14 }]}>{label}</Text>
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
      <Text style={type.largeTitle}>{t('messages.settingsTitle')}</Text>
      <Text style={[type.caption, { marginBottom: spacing.sm }]}>{t('messages.settingsHint')}</Text>

      <Card style={{ borderRadius: radius.xl }}>
        <SwitchRow
          label={t('messages.master')}
          hint={t('messages.masterHint')}
          value={s.enabled}
          onChange={(v) => set({ enabled: v })}
        />
      </Card>

      <Text style={[type.heading, { marginTop: spacing.md }]}>{t('messages.sendWhen')}</Text>
      <Card style={{ gap: spacing.xs }}>
        <SwitchRow
          label={t('messages.absent')}
          value={s.absent}
          onChange={(v) => set({ absent: v })}
          disabled={off}
        />
        <SwitchRow
          label={t('messages.late')}
          value={s.late}
          onChange={(v) => set({ late: v })}
          disabled={off}
        />
        <SwitchRow
          label={t('messages.paymentReceived')}
          value={s.paymentReceived}
          onChange={(v) => set({ paymentReceived: v })}
          disabled={off}
        />
      </Card>

      <Text style={[type.heading, { marginTop: spacing.md }]}>{t('messages.feeReminders')}</Text>
      <Card style={{ gap: spacing.xs }}>
        <SwitchRow
          label={t('messages.feeDue')}
          value={s.feeDue}
          onChange={(v) => set({ feeDue: v })}
          disabled={off}
        />
        <Stepper
          label={t('messages.daysBefore')}
          value={s.feeDueDaysBefore}
          onChange={(n) => set({ feeDueDaysBefore: clampDays('feeDueDaysBefore', n) })}
          disabled={off || !s.feeDue}
        />
        <SwitchRow
          label={t('messages.feeOverdue')}
          value={s.feeOverdue}
          onChange={(v) => set({ feeOverdue: v })}
          disabled={off}
        />
        <Stepper
          label={t('messages.repeatEvery')}
          value={s.overdueEveryDays}
          onChange={(n) => set({ overdueEveryDays: clampDays('overdueEveryDays', n) })}
          disabled={off || !s.feeOverdue}
        />
        <Text style={type.caption}>{t('messages.overdueHint')}</Text>
      </Card>

      <Text style={[type.heading, { marginTop: spacing.md }]}>{t('messages.language')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Chip
          label="English"
          selected={s.language === 'en'}
          onPress={() => set({ language: 'en' })}
        />
        <Chip
          label="हिन्दी"
          selected={s.language === 'hi'}
          onPress={() => set({ language: 'hi' })}
        />
      </View>
      <Text style={[type.caption, { marginTop: spacing.sm }]}>{t('messages.footer')}</Text>
    </Screen>
  );
}
