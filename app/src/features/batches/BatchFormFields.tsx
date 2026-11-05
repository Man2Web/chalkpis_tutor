import { Text, View } from 'react-native';
import { Control, Controller, useController } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Chip, FormInput } from '../../components';
import { TimeField } from '../../components/PickerFields';
import { useCategory } from '../../lib/category';
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

/**
 * Shared by onboarding and the batch add/edit screen. The subject and class fields are named for what the centre
 * teaches (Subject / Class for tuition, Martial art / Belt for karate, Sport / Age group for sports, ...).
 */
export function BatchFormFields({ control }: { control: Control<BatchForm> }) {
  const { t } = useTranslation();
  const { ct } = useCategory();
  return (
    <>
      <FormInput
        control={control}
        name="name"
        label={t('onboarding.batchName')}
        placeholder={ct('batchHint')}
        maxLength={60}
      />
      <FormInput
        control={control}
        name="subject"
        label={ct('subject')}
        placeholder={ct('subjectHint')}
        maxLength={60}
      />
      <FormInput
        control={control}
        name="class"
        label={ct('level')}
        placeholder={ct('levelHint')}
        maxLength={30}
      />
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
      {/* tap to pick: nobody has to type "17:30" */}
      <ClassTimes control={control} />
      <FormInput
        control={control}
        name="defaultFee"
        label={t('onboarding.defaultFee')}
        keyboardType="decimal-pad"
        prefix="₹"
        placeholder="0"
      />
    </>
  );
}

/** "17:30" plus minutes, kept within the day. */
const later = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(23 * 60 + 55, (h ?? 0) * 60 + (m ?? 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Start and end side by side. Moving the start past the end carries the end along, keeping the class as long as it
 * was (an hour if it was not), so the owner never has to fix a second field.
 */
function ClassTimes({ control }: { control: Control<BatchForm> }) {
  const { t } = useTranslation();
  const start = useController({ control, name: 'startTime' });
  const end = useController({ control, name: 'endTime' });
  const err = (m?: string) =>
    m ? t(`validation.${m}`, { defaultValue: t('validation.required') }) : undefined;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ flex: 1 }}>
        <TimeField
          label={t('onboarding.startTime')}
          value={start.field.value}
          error={err(start.fieldState.error?.message)}
          onChange={(v) => {
            const length = minutesOf(end.field.value) - minutesOf(start.field.value);
            start.field.onChange(v);
            if (minutesOf(end.field.value) <= minutesOf(v))
              end.field.onChange(later(v, length > 0 ? length : 60));
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <TimeField
          label={t('onboarding.endTime')}
          value={end.field.value}
          error={err(end.fieldState.error?.message)}
          onChange={end.field.onChange}
        />
      </View>
    </View>
  );
}
