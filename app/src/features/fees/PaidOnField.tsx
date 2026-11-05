import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Chip, DateField } from '../../components';
import { addDays, todayYmd } from '../../lib/dates';
import { spacing } from '../../theme';

/**
 * The day the money came in: a tap-to-pick date (never in the future) with "Today" and "Yesterday" one tap away,
 * because nearly every payment is recorded the same day or the day after.
 */
export function PaidOnField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (ymd: string) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const today = todayYmd();
  const yesterday = addDays(today, -1);
  return (
    <View>
      <DateField
        label={t('fees.paymentDate')}
        value={value}
        onChange={onChange}
        maxDate={today}
        error={error}
      />
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.sm,
          marginTop: -spacing.xs,
          marginBottom: spacing.md,
        }}
      >
        <Chip
          small
          label={t('fees.today')}
          selected={value === today}
          onPress={() => onChange(today)}
        />
        <Chip
          small
          label={t('fees.yesterday')}
          selected={value === yesterday}
          onPress={() => onChange(yesterday)}
        />
      </View>
    </View>
  );
}
