import { Text, View } from 'react-native';
import { Control, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Chip, FormInput } from '../../components';
import { WEEKDAYS } from '../../lib/types';
import { colors, spacing, type } from '../../theme';
import type { BatchForm } from './schema';

export const emptyBatchForm: BatchForm = {
  name: '',
  subject: '',
  class: '',
  days: [],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: '',
};

/** Shared by onboarding and the batch add/edit screen. */
export function BatchFormFields({ control }: { control: Control<BatchForm> }) {
  const { t } = useTranslation();
  return (
    <>
      <FormInput control={control} name="name" label={t('onboarding.batchName')} />
      <FormInput control={control} name="subject" label={t('onboarding.subject')} />
      <FormInput control={control} name="class" label={t('onboarding.class')} />
      <Text style={type.fieldLabel}>{t('onboarding.days')}</Text>
      <Controller
        control={control}
        name="days"
        render={({ field, fieldState }) => (
          <View style={{ marginBottom: spacing.md, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {WEEKDAYS.map((d) => {
                const on = field.value.includes(d);
                return (
                  <Chip
                    key={d}
                    label={t(`days.${d}`)}
                    selected={on}
                    onPress={() =>
                      field.onChange(on ? field.value.filter((x) => x !== d) : [...field.value, d])
                    }
                  />
                );
              })}
            </View>
            {fieldState.error ? (
              <Text style={[type.caption, { color: colors.danger }]}>{t('validation.days')}</Text>
            ) : null}
          </View>
        )}
      />
      <FormInput
        control={control}
        name="startTime"
        label={t('onboarding.startTime')}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
      <FormInput
        control={control}
        name="endTime"
        label={t('onboarding.endTime')}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
      <FormInput
        control={control}
        name="defaultFee"
        label={t('onboarding.defaultFee')}
        keyboardType="decimal-pad"
      />
    </>
  );
}
