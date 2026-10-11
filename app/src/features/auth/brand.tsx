import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { BRAND } from '../../components';
import { KeyboardScroll } from '../../components/KeyboardScroll';
import { colors, column, font, radius, spacing } from '../../theme';

/** The sign-in screens' brand blue, a shade deeper at the bottom so white text stays crisp. */
export const BRAND_DEEP = '#0A5A91';
const NATIVE = Platform.OS !== 'web';

/** True when the person asked their phone for less motion; animations then stay still. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduced;
}

/**
 * Brand blue with faint chalk doodles, the marks a tutor leaves on a blackboard: an underline, a tick, a star,
 * "A+", a rupee. Purely decorative, so screen readers skip it.
 */
export function BrandBackdrop({ children }: { children?: ReactNode }) {
  const chalk = 'rgba(255,255,255,0.2)';
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <LinearGradient colors={[BRAND, BRAND_DEEP]} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" viewBox="0 0 390 460" preserveAspectRatio="xMidYMid slice">
        <Path
          d="M18 92 q 26 -22 52 0 t 52 0"
          stroke={chalk}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M318 64 l 12 14 l 26 -32"
          stroke={chalk}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M340 300 l 6 13 l 14 2 l -10 10 l 3 14 l -13 -7 l -13 7 l 3 -14 l -10 -10 l 14 -2 z"
          stroke={chalk}
          strokeWidth={3}
          fill="none"
          strokeLinejoin="round"
        />
        <SvgText x={22} y={360} fill={chalk} fontSize={40} fontWeight="800" fontStyle="italic">
          A+
        </SvgText>
        <SvgText x={300} y={190} fill={chalk} fontSize={34} fontWeight="700">
          ₹
        </SvgText>
        <Circle cx={60} cy={230} r={20} stroke={chalk} strokeWidth={3} fill="none" />
        <Path
          d="M150 420 h 90"
          stroke={chalk}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray="2 12"
        />
        <Path d="M246 30 v 18 M237 39 h 18" stroke={chalk} strokeWidth={3} strokeLinecap="round" />
        <Path
          d="M108 168 v 14 M101 175 h 14"
          stroke={chalk}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

/** Rises into place once, then bobs gently (still when Reduce Motion is on). */
export function Float({
  children,
  delay = 0,
  drift = 6,
  rotate = '0deg',
}: {
  children: ReactNode;
  delay?: number;
  drift?: number;
  rotate?: string;
}) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const rise = Animated.timing(enter, {
      toValue: 1,
      duration: reduced ? 0 : 520,
      delay: reduced ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE,
    });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
      ]),
    );
    rise.start(() => {
      if (!reduced) loop.start();
    });
    return () => {
      rise.stop();
      loop.stop();
    };
  }, [bob, delay, enter, reduced]);
  const translateY = Animated.add(
    enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -drift] }),
  );
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY }, { rotate }] }}>
      {children}
    </Animated.View>
  );
}

/** A small white "app preview" card for the welcome hero. */
export function PreviewCard({
  icon,
  tint,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.cardText} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/**
 * Every step after the welcome screen: the brand header (back, optional step count, an icon, title, subtitle)
 * and a white sheet holding the form. Header and sheet scroll as one page, so on a small phone with the keyboard
 * up the button under the field can still be reached; the focused field is kept above the keyboard.
 */
export function AuthStepLayout({
  icon,
  iconColor = BRAND,
  title,
  subtitle,
  step,
  onBack,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: ReactNode;
  /** e.g. [1, 2] shows "Step 1 of 2" (only while signing up) */
  step?: [number, number];
  onBack?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: BRAND_DEEP }}>
      <StatusBar style="light" />
      {/* white behind the lower half, so pulling the page up past its end shows the sheet, not blue */}
      <View style={styles.underSheet} pointerEvents="none" />
      <KeyboardScroll contentContainerStyle={{ flexGrow: 1 }}>
        <View
          style={{
            paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
            paddingBottom: spacing.xxl + spacing.lg,
          }}
        >
          <BrandBackdrop />
          <View style={[column, { paddingHorizontal: spacing.lg, width: '100%' }]}>
            <View style={styles.topRow}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                </Pressable>
              ) : (
                <View style={{ width: 40 }} />
              )}
              {step ? (
                <View style={styles.stepPill}>
                  {Array.from({ length: step[1] }, (_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i < step[0] && { backgroundColor: '#FFFFFF', width: 16 }]}
                    />
                  ))}
                  <Text style={styles.stepText} maxFontSizeMultiplier={1.4}>
                    {t('auth.step', { n: step[0], total: step[1] })}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.iconTile}>
              <Ionicons name={icon} size={30} color={iconColor} />
            </View>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={[styles.sheetContent, column, { width: '100%' }]}>{children}</View>
        </View>
      </KeyboardScroll>
    </View>
  );
}

/**
 * What the code message looks like in WhatsApp, so people know what to look for, with a shortcut to open
 * WhatsApp. Opening may fail (not installed, or a browser): then nothing happens.
 */
export function WhatsAppPreview() {
  const { t } = useTranslation();
  return (
    <View style={styles.wa}>
      <View style={styles.waHead}>
        <View style={styles.waAvatar}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, ...font('800') }}>C</Text>
        </View>
        <Text style={{ fontSize: 14, ...font('700'), color: colors.text }}>
          {t('auth.otpPreviewFrom')}
        </Text>
        <Ionicons name="checkmark-circle" size={15} color="#1DA851" />
      </View>
      <View style={styles.waBubble}>
        <Text style={{ fontSize: 14, lineHeight: 20, ...font('500'), color: colors.text }}>
          {t('auth.otpPreviewText')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void Linking.openURL('whatsapp://').catch(() => undefined)}
        style={({ pressed }) => [styles.waOpen, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="logo-whatsapp" size={16} color="#1DA851" />
        <Text style={{ fontSize: 14, ...font('600'), color: '#128C4B' }}>
          {t('auth.openWhatsApp')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wa: { backgroundColor: '#EFEAE2', borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
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
    maxWidth: '92%',
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
    minHeight: 44,
    paddingVertical: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#062F4D',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    maxWidth: 320,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, ...font('700'), color: colors.text },
  cardText: { fontSize: 12.5, ...font('500'), color: colors.textMuted, marginTop: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  stepText: { color: '#FFFFFF', fontSize: 12, ...font('600'), marginLeft: 4 },
  iconTile: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, ...font('800') },
  subtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 15,
    lineHeight: 21,
    ...font('500'),
    marginTop: 6,
  },
  underSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    backgroundColor: colors.bg,
  },
  sheet: {
    flexGrow: 1,
    marginTop: -spacing.xxl,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  sheetContent: { flexGrow: 1, gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.xl },
});
