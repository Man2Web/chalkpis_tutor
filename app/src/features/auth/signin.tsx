import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BRAND } from '../../components';
import { KeyboardAvoid } from '../../components/KeyboardScroll';
import { haptic } from '../../lib/haptics';
import { column, font, spacing } from '../../theme';
import { useReducedMotion } from './brand';

/**
 * The sign-in design: white screens, one bold title, one big field and one black button that rides above the
 * keyboard (the pattern people know from food-delivery and ride apps), with the brand blue only for focus and links
 * and WhatsApp green only where WhatsApp is meant.
 */
export const INK = '#111111';
export const SIGNIN = {
  ink: INK,
  muted: '#6B7280',
  line: '#E5E7EB',
  field: '#F6F7F9',
  error: '#DC2626',
  whatsapp: '#1DA851',
  whatsappDeep: '#128C4B',
} as const;
const NATIVE = Platform.OS !== 'web';

/**
 * A sign-in step: back button, title and subtitle at the top, the form below, and `footer` (the main button) pinned
 * to the bottom, lifted above the keyboard while typing.
 */
export function SignInLayout({
  title,
  subtitle,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" />
      <KeyboardAvoid style={{ flex: 1 }} behavior="padding">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
            paddingBottom: spacing.lg,
          }}
        >
          <View style={[column, styles.page]}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                hitSlop={8}
                style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="arrow-back" size={22} color={INK} />
              </Pressable>
            ) : null}
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
            {subtitle ? <View style={{ marginTop: spacing.sm }}>{subtitle}</View> : null}
            <View style={{ marginTop: spacing.xl, gap: spacing.md }}>{children}</View>
          </View>
        </ScrollView>
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs },
            ]}
          >
            <View style={[column, { width: '100%', gap: spacing.sm }]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoid>
    </View>
  );
}

/** Subtitle text in the muted grey. */
export function Subtle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtle}>{children}</Text>;
}

/** The black, full-width main button. Shows a spinner while `loading`. */
export function PrimaryButton({
  title,
  onPress,
  loading,
  icon,
  tone = 'ink',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'ink' | 'whatsapp';
}) {
  const bg = tone === 'whatsapp' ? SIGNIN.whatsapp : INK;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy: !!loading }}
      onPress={() => {
        if (loading) return;
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: bg, opacity: pressed ? 0.88 : 1 },
        { transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color="#FFFFFF" /> : null}
          <Text style={styles.primaryText} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** A quiet text button (resend, change number). */
export function TextButton({
  title,
  onPress,
  disabled,
  loading,
  color = INK,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Text
          style={[styles.textButtonText, { color: disabled ? SIGNIN.muted : color }]}
          maxFontSizeMultiplier={1.4}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** The India country chip in front of a mobile number. */
export function CountryChip() {
  return (
    <View style={styles.country} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={{ fontSize: 18 }}>🇮🇳</Text>
      <Text style={styles.countryCode}>+91</Text>
    </View>
  );
}

/** Keeps the digits of an Indian mobile number and shows them as "98765 43210". */
export function formatMobileInput(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/** The mobile number field: country chip, large digits, brand-blue ring while focused, red with a reason on error. */
export function PhoneField({
  label,
  value,
  onChangeText,
  error,
  onSubmit,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const ref = useRef<TextInput>(null);
  const border = error ? SIGNIN.error : focused ? BRAND : SIGNIN.line;
  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        onPress={() => ref.current?.focus()}
        accessible={false}
        style={[styles.field, { borderColor: border, borderWidth: focused || error ? 2 : 1.5 }]}
      >
        <CountryChip />
        <View style={styles.fieldDivider} />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(v) => onChangeText(formatMobileInput(v))}
          accessibilityLabel={label}
          placeholder={t('auth.enterMobile')}
          placeholderTextColor="#9CA3AF"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={14}
          autoFocus={autoFocus}
          returnKeyType="send"
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.fieldInput}
          maxFontSizeMultiplier={1.3}
        />
      </Pressable>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

/** A red reason with a small alert icon. */
export function ErrorText({ children }: { children: string }) {
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={16} color={SIGNIN.error} />
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

/** "The code comes on WhatsApp" with the WhatsApp mark: sets the expectation before the code is sent. */
export function WhatsAppNote({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <View style={styles.noteIcon}>
        <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
      </View>
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

/**
 * Six code boxes over one hidden field (so paste, autofill and the number keyboard all work). The box being typed
 * into is outlined in brand blue; a wrong code turns them red and shakes them once.
 */
export function CodeBoxes({
  value,
  onChange,
  onComplete,
  error,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
  error?: boolean;
  label: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const reduced = useReducedMotion();
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error || reduced) return;
    haptic.error();
    shake.setValue(0);
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((toValue) =>
        Animated.timing(shake, {
          toValue,
          duration: 55,
          easing: Easing.linear,
          useNativeDriver: NATIVE,
        }),
      ),
    ).start();
  }, [error, reduced, shake]);

  const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  const active = Math.min(value.length, 5);
  return (
    <Animated.View style={{ transform: [{ translateX: shake }] }}>
      <Pressable onPress={() => ref.current?.focus()} accessible={false} style={styles.codeRow}>
        {cells.map((c, i) => {
          const isActive = focused && i === active && value.length < 6;
          const borderColor = error
            ? SIGNIN.error
            : isActive
              ? BRAND
              : c
                ? INK
                : SIGNIN.line;
          return (
            <View
              key={i}
              style={[
                styles.codeBox,
                { borderColor, borderWidth: isActive || error ? 2 : 1.5 },
                c ? { backgroundColor: '#FFFFFF' } : null,
              ]}
            >
              <Text style={styles.codeDigit} maxFontSizeMultiplier={1.2}>
                {c}
              </Text>
              {isActive && !c ? <View style={styles.caret} /> : null}
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 6);
          onChange(digits);
          if (digits.length === 6) onComplete(digits);
        }}
        accessibilityLabel={label}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={6}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        style={styles.hiddenInput}
      />
    </Animated.View>
  );
}

/** What the code message looks like in WhatsApp, with a button to open WhatsApp. */
export function WhatsAppCodeCard() {
  const { t } = useTranslation();
  return (
    <View style={styles.wa}>
      <View style={styles.waHead}>
        <View style={styles.waAvatar}>
          <Text style={{ color: '#FFFFFF', fontSize: 12, ...font('800') }}>C</Text>
        </View>
        <Text style={{ fontSize: 14, ...font('700'), color: INK }}>{t('auth.otpPreviewFrom')}</Text>
        <Ionicons name="checkmark-circle" size={15} color={SIGNIN.whatsapp} />
      </View>
      <View style={styles.waBubble}>
        <Text style={{ fontSize: 14, lineHeight: 20, ...font('500'), color: INK }}>
          {t('auth.otpPreviewText')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void Linking.openURL('whatsapp://').catch(() => undefined)}
        style={({ pressed }) => [styles.waOpen, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
        <Text style={{ fontSize: 14, ...font('700'), color: '#FFFFFF' }}>
          {t('auth.openWhatsApp')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', paddingHorizontal: spacing.lg + 4 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: SIGNIN.field,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 30, lineHeight: 36, ...font('800'), color: INK, letterSpacing: -0.4 },
  subtle: { fontSize: 15, lineHeight: 22, ...font('500'), color: SIGNIN.muted },
  footer: {
    paddingHorizontal: spacing.lg + 4,
    paddingTop: spacing.md,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SIGNIN.line,
  },
  primary: {
    minHeight: 56,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryText: { color: '#FFFFFF', fontSize: 17, ...font('700'), letterSpacing: 0.1 },
  textButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  textButtonText: { fontSize: 15, ...font('700') },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14 },
  countryCode: { fontSize: 19, ...font('700'), color: INK },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  fieldDivider: { width: 1.5, height: 26, backgroundColor: SIGNIN.line, marginHorizontal: 12 },
  fieldInput: {
    flex: 1,
    alignSelf: 'stretch',
    fontSize: 20,
    ...font('700'),
    color: INK,
    letterSpacing: 0.8,
    paddingRight: 14,
    // the browser draws its own focus outline: the field's ring already shows focus
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorText: { flex: 1, fontSize: 14, lineHeight: 19, ...font('600'), color: SIGNIN.error },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#EEFBF3',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noteIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: SIGNIN.whatsapp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: { flex: 1, fontSize: 14, lineHeight: 19, ...font('600'), color: SIGNIN.whatsappDeep },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  codeBox: {
    flex: 1,
    maxWidth: 54,
    aspectRatio: 0.86,
    borderRadius: 14,
    backgroundColor: SIGNIN.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigit: { fontSize: 26, ...font('800'), color: INK },
  caret: { position: 'absolute', width: 2, height: 26, borderRadius: 1, backgroundColor: BRAND },
  hiddenInput: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.011,
    color: 'transparent',
    fontSize: 1,
  },
  wa: {
    backgroundColor: '#EFEAE2',
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
  },
  waHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waBubble: {
    alignSelf: 'flex-start',
    maxWidth: '94%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderTopLeftRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  waOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: SIGNIN.whatsapp,
  },
});
