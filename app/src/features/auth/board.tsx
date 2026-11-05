import { createContext, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { G, Path, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { BRAND } from '../../components';
import { font, spacing } from '../../theme';
import { useReducedMotion } from './brand';

/**
 * The sign-in and sign-up look: a classroom board on top (what this step is, written in chalk) and white paper below
 * (what you fill in). The board is the brand blue taken down to slate, the chalk is a warm white, and yellow chalk
 * marks what matters, the way a teacher underlines on the board. A wooden ledge with two chalk pieces, one of them
 * brand blue, closes the board: ChalkPis is named after them.
 */
export const BOARD = {
  slate: '#0F2D40',
  chalk: '#F4F1EA',
  chalkDim: 'rgba(244,241,234,0.72)',
  /** the faintest chalk that still reads as text (4.5:1 on the slate) */
  chalkMuted: 'rgba(244,241,234,0.56)',
  chalkFaint: 'rgba(244,241,234,0.22)',
  chalkGhost: 'rgba(244,241,234,0.06)',
  yellow: '#F2D06B',
  ledgeTop: '#A8774A',
  ledge: '#87592F',
  ledgeEdge: '#6A4424',
} as const;

const NATIVE = Platform.OS !== 'web';

/**
 * The sign-in and sign-up column on a phone-sized layout: the full width on a phone, a narrow centred column on a
 * tablet, so a field and a button never stretch across the screen. With the 20 px side padding inside, content is
 * 480 px at most.
 */
export const SIGNIN_COLUMN = { width: '100%', maxWidth: 520, alignSelf: 'center' } as const;
/** The same column for content placed inside padding of its own. */
export const SIGNIN_INNER = { width: '100%', maxWidth: 480, alignSelf: 'center' } as const;

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  'aria-hidden': true,
};

/** Today the way a teacher writes it in the board's top corner: 05.11.2026. */
export function boardDate(d = new Date()) {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Strokes already drawn in (see `once`). */
const drawn = new Set<string>();

/**
 * Draws its child in from left to right, like a stroke of chalk (`width` × `height` is the child's size). Still, and
 * drawn at once, when the person asked for less motion.
 */
export function ChalkReveal({
  width,
  height,
  delay = 0,
  duration = 420,
  once,
  children,
}: {
  width: number;
  height: number;
  delay?: number;
  duration?: number;
  /** a name for this stroke: it is drawn in only the first time it shows while the app is open, then stays drawn */
  once?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const seen = useRef(once ? drawn.has(once) : false).current;
  const p = useRef(new Animated.Value(seen ? 1 : 0)).current;
  useEffect(() => {
    if (once) drawn.add(once);
    if (reduced || seen) {
      p.setValue(1);
      return;
    }
    const a = Animated.timing(p, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE,
    });
    a.start();
    return () => a.stop();
  }, [delay, duration, once, p, reduced, seen]);
  // the clipping window slides in from the left while the stroke inside slides the other way, so the stroke stays
  // put and shows a little more each frame (transforms only, so the phone's animation thread can run it)
  return (
    <View style={{ width, height }} {...hidden}>
      <Animated.View
        style={{
          width,
          height,
          overflow: 'hidden',
          transform: [
            { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) },
          ],
        }}
      >
        <Animated.View
          style={{
            width,
            height,
            transform: [
              { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) },
            ],
          }}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** One chalk stroke: a firm line with a thin, offset dry edge, so it reads as chalk rather than ink. */
function Stroke({ d, color, width }: { d: string; color: string; width: number }) {
  return (
    <G>
      <Path
        d={d}
        stroke={color}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      <Path
        d={d}
        stroke={color}
        strokeWidth={width * 0.45}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
        transform="translate(0.9 0.7)"
      />
    </G>
  );
}

/** A hand-drawn tick in yellow chalk. */
export function ChalkTick({
  size = 22,
  delay = 0,
  once,
}: {
  size?: number;
  delay?: number;
  once?: string;
}) {
  const h = (size * 24) / 28;
  return (
    <ChalkReveal width={size} height={h} delay={delay} duration={300} once={once}>
      <Svg width={size} height={h} viewBox="0 0 28 24">
        <Stroke
          d="M3 13.6 C5.6 15.2 8 17.6 10.3 20.6 C13.6 13.8 18.6 7.6 25.2 2.8"
          color={BOARD.yellow}
          width={3.2}
        />
      </Svg>
    </ChalkReveal>
  );
}

/** A hand-drawn underline in yellow chalk, `width` wide. */
export function ChalkUnderline({
  width = 120,
  delay = 0,
  color = BOARD.yellow,
  once,
}: {
  width?: number;
  delay?: number;
  color?: string;
  once?: string;
}) {
  return (
    <ChalkReveal width={width} height={12} delay={delay} duration={520} once={once}>
      <Svg width={width} height={12} viewBox="0 0 200 12" preserveAspectRatio="none">
        <Stroke d="M3 8.4 C40 5.2 82 4.4 120 5.6 S178 7.6 197 4.2" color={color} width={3.4} />
      </Svg>
    </ChalkReveal>
  );
}

/**
 * The board: flat slate with what a used board really has, two faint duster swipes and the ghost of the last class's
 * sum. Purely decorative, so screen readers skip it.
 */
export function BoardSurface({ children, style }: { children?: ReactNode; style?: object }) {
  return (
    <View style={[{ backgroundColor: BOARD.slate, overflow: 'hidden' }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" {...hidden}>
        <Svg width="100%" height="100%" viewBox="0 0 390 460" preserveAspectRatio="xMidYMid slice">
          <Path
            d="M-30 128 C70 70 230 78 430 150"
            stroke={BOARD.chalk}
            strokeOpacity={0.035}
            strokeWidth={54}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M-40 352 C110 300 250 322 440 268"
            stroke={BOARD.chalk}
            strokeOpacity={0.03}
            strokeWidth={70}
            strokeLinecap="round"
            fill="none"
          />
          <SvgText
            x={196}
            y={404}
            fill={BOARD.chalk}
            fillOpacity={0.07}
            fontSize={22}
            fontStyle="italic"
          >
            x² + 5x + 6 = 0
          </SvgText>
          <Path
            d="M194 416 C228 412 278 414 320 410"
            stroke={BOARD.chalk}
            strokeOpacity={0.06}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/** The wooden ledge under the board, with a white chalk piece and a short brand-blue one lying on it. */
export function BoardLedge({ pieces = true }: { pieces?: boolean }) {
  return (
    <View {...hidden} pointerEvents="none" style={{ backgroundColor: BOARD.slate }}>
      {pieces ? (
        <View style={styles.pieces}>
          <Svg width={92} height={12} viewBox="0 0 92 12">
            <G transform="rotate(-3 30 6)">
              <Rect x={4} y={3} width={46} height={8} rx={3} fill={BOARD.chalk} />
              <Rect x={4} y={3} width={46} height={3} rx={1.5} fill="#FFFFFF" opacity={0.6} />
            </G>
            <G transform="rotate(4 74 7)">
              <Rect x={62} y={4} width={22} height={8} rx={3} fill={BRAND} />
              <Rect x={62} y={4} width={22} height={3} rx={1.5} fill="#5FB0E6" opacity={0.7} />
            </G>
          </Svg>
        </View>
      ) : null}
      <View style={{ height: 5, backgroundColor: BOARD.ledgeTop }} />
      <View style={{ height: 7, backgroundColor: BOARD.ledge }} />
      <View style={{ height: 2, backgroundColor: BOARD.ledgeEdge }} />
    </View>
  );
}

/** "Date: 05.11.2026", top right of the board, underlined in chalk. */
export function BoardDate() {
  const { t } = useTranslation();
  return (
    <View style={{ alignItems: 'flex-end' }} {...hidden}>
      <Text style={styles.date} maxFontSizeMultiplier={1.3}>
        {t('auth.board.date', { date: boardDate() })}
      </Text>
      <ChalkUnderline width={74} delay={150} color={BOARD.chalkDim} once="date" />
    </View>
  );
}

/**
 * Where you are in sign-up, top right of the board: "Step 2 of 4" over four chalk strokes, the ones done and the
 * current one in full chalk, the rest faint.
 */
export function BoardSteps({ step }: { step: [number, number] }) {
  const { t } = useTranslation();
  const [n, total] = step;
  const label = t('auth.step', { n, total });
  return (
    <View accessible accessibilityLabel={label} style={{ alignItems: 'flex-end', gap: 6 }}>
      <Text style={styles.date} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 4,
              borderRadius: 2,
              transform: [{ rotate: i % 2 ? '-4deg' : '3deg' }],
              backgroundColor:
                i < n ? (i === n - 1 ? BOARD.yellow : BOARD.chalk) : BOARD.chalkFaint,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** A back arrow in a chalk ring. */
export function BoardBack({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={8}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="arrow-back" size={21} color={BOARD.chalk} />
    </Pressable>
  );
}

/** True inside the board, so shared texts (a subtitle, a link) switch to chalk colours there. */
export const OnBoard = createContext(false);

/**
 * The top of every sign-in and sign-up step on a phone: back (or nothing), the step count, the title in chalk with a
 * yellow underline and the subtitle, then the ledge. The form goes on the paper below.
 */
export function BoardHeader({
  title,
  subtitle,
  onBack,
  step,
  topInset,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  step?: [number, number];
  topInset: number;
}) {
  return (
    <OnBoard.Provider value>
      <BoardSurface>
        <View
          style={[
            SIGNIN_COLUMN,
            {
              paddingTop: Math.max(topInset, spacing.md) + spacing.sm,
              paddingHorizontal: spacing.lg + 4,
              paddingBottom: spacing.xl + spacing.xs,
            },
          ]}
        >
          {onBack || step ? (
            // without a back button the step count needs no room of its own beside it
            <View style={[styles.headerRow, !onBack && { minHeight: 0, marginBottom: spacing.md }]}>
              {onBack ? <BoardBack onPress={onBack} /> : <View />}
              {step ? <BoardSteps step={step} /> : null}
            </View>
          ) : null}
          <Text style={styles.stepTitle} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
          <View style={{ marginTop: 8 }}>
            <ChalkUnderline width={64} delay={120} />
          </View>
          {subtitle ? <View style={{ marginTop: spacing.md }}>{subtitle}</View> : null}
        </View>
      </BoardSurface>
      <BoardLedge />
    </OnBoard.Provider>
  );
}

/** A line on the board with a yellow chalk tick in front, drawn in after `delay`. */
export function TickLine({
  text,
  delay = 0,
  size = 16,
  once,
}: {
  text: string;
  delay?: number;
  size?: number;
  once?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 24 }}>
        <ChalkTick size={22} delay={delay} once={once} />
      </View>
      <Text
        style={[styles.line, { fontSize: size, lineHeight: size * 1.35 }]}
        maxFontSizeMultiplier={1.3}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * The welcome board: logo and today's date, the promise in chalk, three ticked lines on what the app does, and
 * (when `kinds`) the kinds of class it is for. `lines` shows only as many lines as fit.
 */
export function WelcomeBoard({
  lines = 3,
  kinds = false,
  big = false,
}: {
  lines?: number;
  kinds?: boolean;
  big?: boolean;
}) {
  const { t } = useTranslation();
  const items = [t('auth.board.line1'), t('auth.board.line2'), t('auth.board.line3')].slice(
    0,
    lines,
  );
  return (
    <>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.3}
        style={[styles.headline, big && { fontSize: 46, lineHeight: 54, letterSpacing: -1 }]}
      >
        {t('auth.welcomeHeadline')}
      </Text>
      <View style={{ marginTop: big ? 14 : 8 }}>
        <ChalkUnderline width={big ? 240 : 170} delay={250} once="welcome" />
      </View>
      {items.length ? (
        <View style={{ gap: big ? 18 : 14, marginTop: big ? 40 : 26 }}>
          {items.map((text, i) => (
            <TickLine
              key={text}
              text={text}
              delay={650 + i * 280}
              size={big ? 19 : 16}
              once={`welcome-${i}`}
            />
          ))}
        </View>
      ) : null}
      {kinds ? (
        <Text style={[styles.kinds, big && { fontSize: 14 }]} maxFontSizeMultiplier={1.3}>
          {t('auth.board.kinds')}
        </Text>
      ) : null}
    </>
  );
}

/** A small India flag (an emoji flag shows as the letters "IN" on Windows). */
export function IndiaFlag({ width = 22 }: { width?: number }) {
  const h = (width * 2) / 3;
  return (
    <View {...hidden}>
      <Svg width={width} height={h} viewBox="0 0 30 20">
        <Rect x={0} y={0} width={30} height={20} rx={2.5} fill="#FFFFFF" />
        <Path
          d="M2.5 0 H27.5 A2.5 2.5 0 0 1 30 2.5 V6.67 H0 V2.5 A2.5 2.5 0 0 1 2.5 0 Z"
          fill="#FF9933"
        />
        <Path
          d="M0 13.33 H30 V17.5 A2.5 2.5 0 0 1 27.5 20 H2.5 A2.5 2.5 0 0 1 0 17.5 Z"
          fill="#138808"
        />
        <Circle cx={15} cy={10} r={2.4} stroke="#000080" strokeWidth={0.9} fill="none" />
        <Rect
          x={0.4}
          y={0.4}
          width={29.2}
          height={19.2}
          rx={2.2}
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={0.8}
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pieces: { position: 'absolute', right: 22, top: -8, zIndex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    marginBottom: spacing.lg,
  },
  stepTitle: {
    color: BOARD.chalk,
    fontSize: 28,
    lineHeight: 34,
    ...font('800'),
    letterSpacing: -0.5,
  },
  date: { fontSize: 13, ...font('600'), color: BOARD.chalkDim, letterSpacing: 0.3 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: BOARD.chalkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    color: BOARD.chalk,
    fontSize: 34,
    lineHeight: 40,
    ...font('800'),
    letterSpacing: -0.7,
    marginTop: spacing.xl,
  },
  line: { flex: 1, color: BOARD.chalk, ...font('600') },
  kinds: {
    marginTop: spacing.xl,
    color: BOARD.chalkDim,
    fontSize: 13,
    lineHeight: 19,
    ...font('500'),
    letterSpacing: 0.2,
  },
});
