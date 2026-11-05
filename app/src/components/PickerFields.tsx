import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'panelui-native/components/calendar';
import { haptic } from '../lib/haptics';
import { colors, font, spacing } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

/*
 * Tap-to-pick fields for times and dates. They look exactly like Input (PanelUI: a 14-pt label, a 48-high box with a
 * hairline border and 10 corners, the error in red underneath) and open a bottom sheet, so nobody has to type
 * "17:30" or "2026-11-05". Values stay in the forms' existing formats: "HH:MM" (24-hour) and "YYYY-MM-DD".
 */

// ---------- time ----------

/** "17:30" -> { h12: 5, m: 30, pm: true }. Anything unreadable is 5:00 PM, the usual start of an evening class. */
export function splitTime(value: string): { h12: number; m: number; pm: boolean } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  const h = match ? Math.min(23, Number(match[1])) : 17;
  const m = match ? Math.min(59, Number(match[2])) : 0;
  return { h12: h % 12 === 0 ? 12 : h % 12, m, pm: h >= 12 };
}

/** 5, 30, true -> "17:30". */
export function joinTime(h12: number, m: number, pm: boolean): string {
  const h = (h12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "17:30" -> "5:30 PM", as the rest of the app shows class times. */
export function formatTime12(value: string): string {
  const { h12, m, pm } = splitTime(value);
  return `${h12}:${String(m).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// ---------- dates ----------

/** "2026-11-05" as a local Date at midnight, and back. */
export const ymdToDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
export const dateToYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isYmd = (v: string | undefined | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** "2026-11-05" -> "5 Nov 2026". */
export function formatLongDate(ymd: string): string {
  return ymdToDate(ymd).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ---------- the box both fields share ----------

function FieldBox({
  label,
  text,
  placeholder,
  icon,
  error,
  hint,
  onPress,
  disabled,
}: {
  label: string;
  text?: string;
  placeholder?: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6, marginBottom: spacing.md }}>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          ...font('500'),
          color: error ? colors.dangerFill : colors.text,
        }}
      >
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text ?? placeholder ?? ''}`}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        style={({ pressed }) => ({
          height: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: error ? colors.dangerFill : colors.input,
          backgroundColor: pressed ? colors.fill : colors.bg,
          opacity: disabled ? 0.64 : 1,
        })}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            ...font('400'),
            color: text ? colors.text : colors.textFaint,
          }}
          numberOfLines={1}
        >
          {text ?? placeholder ?? ''}
        </Text>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text style={{ fontSize: 14, lineHeight: 20, ...font('400'), color: colors.dangerFill }}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ fontSize: 14, lineHeight: 20, ...font('400'), color: colors.textMuted }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A grid of round-cornered cells, 6 to a row; the chosen one filled navy. */
function Grid<T extends number>({
  items,
  value,
  onPick,
  label,
}: {
  items: T[];
  value: T;
  onPick: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((v) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic.select();
              onPick(v);
            }}
            style={({ pressed }) => ({
              // six per row on any phone: (100% - 5 gaps) / 6
              width: '14.6%',
              flexGrow: 1,
              height: 44,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.input,
              backgroundColor: on ? colors.primary : pressed ? colors.fill : colors.bg,
            })}
          >
            <Text
              style={{ fontSize: 16, ...font(on ? '600' : '500'), color: on ? '#FFFFFF' : colors.text }}
            >
              {label(v)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SheetLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: 13, lineHeight: 18, ...font('600'), color: colors.textMuted }}>
      {children}
    </Text>
  );
}

// ---------- TimeField ----------

type TimeProps = {
  label: string;
  /** "HH:MM", 24-hour. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
};

/** A class time: shows "5:30 PM"; the sheet picks hour, minutes and AM/PM with one tap each. */
export function TimeField({ label, value, onChange, error, hint }: TimeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => splitTime(value));
  const show = () => {
    setDraft(splitTime(value));
    setOpen(true);
  };
  // a time not on the 5-minute grid (typed before) is still shown as chosen at the nearest step
  const minute = MINUTES.reduce((a, b) => (Math.abs(b - draft.m) < Math.abs(a - draft.m) ? b : a));

  return (
    <>
      <FieldBox
        label={label}
        text={value ? formatTime12(value) : undefined}
        placeholder={t('picker.chooseTime')}
        icon="time-outline"
        error={error}
        hint={hint}
        onPress={show}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        <Text
          style={{
            fontSize: 34,
            lineHeight: 40,
            ...font('700'),
            letterSpacing: -0.8,
            color: colors.text,
            textAlign: 'center',
          }}
          accessibilityLiveRegion="polite"
        >
          {formatTime12(joinTime(draft.h12, minute, draft.pm))}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([false, true] as const).map((pm) => {
            const on = draft.pm === pm;
            return (
              <Pressable
                key={String(pm)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select();
                  setDraft((d) => ({ ...d, pm }));
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: on ? colors.primary : colors.input,
                  backgroundColor: on ? colors.primary : colors.bg,
                }}
              >
                <Text style={{ fontSize: 16, ...font('600'), color: on ? '#FFFFFF' : colors.text }}>
                  {pm ? 'PM' : 'AM'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <SheetLabel>{t('picker.hour')}</SheetLabel>
        <Grid
          items={HOURS}
          value={draft.h12}
          onPick={(h12) => setDraft((d) => ({ ...d, h12 }))}
          label={String}
        />
        <SheetLabel>{t('picker.minutes')}</SheetLabel>
        <Grid
          items={MINUTES}
          value={minute}
          onPick={(m) => setDraft((d) => ({ ...d, m }))}
          label={(m) => `:${String(m).padStart(2, '0')}`}
        />
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title={t('picker.done')}
            onPress={() => {
              onChange(joinTime(draft.h12, minute, draft.pm));
              setOpen(false);
            }}
          />
        </View>
      </BottomSheet>
    </>
  );
}

// ---------- DateField ----------

type DateProps = {
  label: string;
  /** "YYYY-MM-DD", or "" for none. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  /** "YYYY-MM-DD" bounds. */
  minDate?: string;
  maxDate?: string;
  /** A birthday: month and year dropdowns, reaching back a few decades. */
  birthday?: boolean;
  /** Shows "Clear" in the sheet for an optional date. */
  clearable?: boolean;
};

/** A date: shows "5 Nov 2026"; the sheet is the same calendar as the attendance date strip. */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  minDate,
  maxDate,
  birthday,
  clearable,
}: DateProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const has = isYmd(value);
  const max = isYmd(maxDate) ? ymdToDate(maxDate) : undefined;
  const min = isYmd(minDate) ? ymdToDate(minDate) : undefined;
  const now = new Date();
  return (
    <>
      <FieldBox
        label={label}
        text={has ? formatLongDate(value) : undefined}
        placeholder={placeholder ?? t('picker.chooseDate')}
        icon="calendar-outline"
        error={error}
        hint={hint}
        onPress={() => setOpen(true)}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        <Calendar
          mode="single"
          selected={has ? ymdToDate(value) : undefined}
          defaultMonth={
            has
              ? ymdToDate(value)
              : birthday
                ? new Date(now.getFullYear() - 10, now.getMonth(), 1)
                : (max ?? now)
          }
          minDate={min}
          maxDate={max}
          weekStartsOn={1}
          captionLayout={birthday ? 'dropdown' : 'label'}
          startMonth={birthday ? new Date(now.getFullYear() - 70, 0, 1) : undefined}
          endMonth={birthday ? (max ?? now) : undefined}
          onSelect={(d) => {
            if (!d) return;
            haptic.select();
            onChange(dateToYmd(d));
            setOpen(false);
          }}
        />
        {clearable && has ? (
          <Button
            variant="ghost"
            title={t('picker.clear')}
            onPress={() => {
              onChange('');
              setOpen(false);
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}

// ---------- react-hook-form wrappers ----------

type FormBase<T extends FieldValues> = { control: Control<T>; name: Path<T>; label: string; hint?: string };

function useErrorText() {
  const { t } = useTranslation();
  return (message?: string) =>
    message ? t(`validation.${message}`, { defaultValue: t('validation.required') }) : undefined;
}

export function FormTimeField<T extends FieldValues>({ control, name, label, hint }: FormBase<T>) {
  const errorText = useErrorText();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TimeField
          label={label}
          hint={hint}
          value={field.value ?? ''}
          onChange={field.onChange}
          error={errorText(fieldState.error?.message)}
        />
      )}
    />
  );
}

export function FormDateField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  ...rest
}: FormBase<T> & Omit<DateProps, 'label' | 'value' | 'onChange' | 'error' | 'hint'>) {
  const errorText = useErrorText();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DateField
          label={label}
          hint={hint}
          value={field.value ?? ''}
          onChange={field.onChange}
          error={errorText(fieldState.error?.message)}
          {...rest}
        />
      )}
    />
  );
}
