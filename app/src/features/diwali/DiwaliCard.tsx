import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinear,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { MainStackParams } from '../../navigation/types';
import { haptic } from '../../lib/haptics';
import { readFlag, setFlag } from '../../lib/onceFlag';
import { font, radius } from '../../theme';
import { isDiwali } from './season';

const NATIVE = Platform.OS !== 'web';
/** The money card's navy and the Diwali poster's colours (marketing/diwali). */
const NAVY = ['#16405A', '#0F2D40', '#0B2232'] as const;
const C = { chalk: '#F4F1EA', yellow: '#F2D06B', blue: '#2E8FD3', marigold: '#E8892B' };
const LIT = 'diwali2026_lit';
const HIDDEN = 'diwali2026_hidden';

/**
 * Diwali on Home, 7 to 9 Nov 2026 only (season.ts): an unlit diya on the blackboard navy with a chalk kolam behind it.
 * A tap lights it (and remembers), the kolam warms up, and the card offers the Diwali poster for parents.
 * The cross hides it for good.
 */
export function DiwaliCard() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  // null until the saved flags are read, so a lit diya never flashes unlit
  const [state, setState] = useState<{ lit: boolean; hidden: boolean } | null>(null);
  const on = isDiwali();

  useEffect(() => {
    if (!on) return;
    let alive = true;
    void Promise.all([readFlag(LIT), readFlag(HIDDEN)]).then(([lit, hidden]) => {
      if (alive) setState({ lit, hidden });
    });
    return () => {
      alive = false;
    };
  }, [on]);

  if (!on || !state || state.hidden) return null;

  const light = () => {
    if (state.lit) return;
    haptic.success();
    setState({ ...state, lit: true });
    void setFlag(LIT);
  };
  const hide = () => {
    haptic.tap();
    setState({ ...state, hidden: true });
    void setFlag(HIDDEN);
  };

  return (
    <View style={{ borderRadius: radius.xl, overflow: 'hidden' }}>
      <LinearGradient
        colors={NAVY}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingRight: 44 }}
      >
        <Kolam lit={state.lit} />
        <Diya lit={state.lit} onPress={light} label={t('diwali.light')} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 16, lineHeight: 22, ...font('600'), color: '#FFFFFF' }}>
            {state.lit ? t('diwali.wish') : t('diwali.title')}
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 18, ...font('400'), color: 'rgba(255,255,255,0.72)' }}>
            {state.lit ? t('diwali.from') : t('diwali.tap')}
          </Text>
          {state.lit ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic.tap();
                nav.navigate('Poster', { kind: 'festival' });
              }}
              hitSlop={8}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: radius.pill,
                backgroundColor: C.yellow,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name="image" size={15} color="#3A2A05" />
              <Text style={{ fontSize: 13, lineHeight: 18, ...font('600'), color: '#3A2A05' }}>
                {t('diwali.poster')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={hide}
          hitSlop={10}
          style={{ position: 'absolute', top: 10, right: 10, padding: 4 }}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </LinearGradient>
    </View>
  );
}

/** Reduce Motion, read once; a failure reads as "off". */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void (AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false))
      .catch(() => false)
      .then((r) => alive && setReduced(r));
    return () => {
      alive = false;
    };
  }, []);
  return reduced;
}

/** A brass diya. Lit: the flame rises out of the wick, then breathes; a warm glow comes up behind it. */
function Diya({ lit, onPress, label }: { lit: boolean; onPress: () => void; label: string }) {
  const reduced = useReducedMotion();
  const flame = useRef(new Animated.Value(lit ? 1 : 0)).current;
  const flicker = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!lit) return;
    if (reduced) {
      flame.setValue(1);
      return;
    }
    Animated.spring(flame, { toValue: 1, friction: 5, tension: 60, useNativeDriver: NATIVE }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
        Animated.timing(flicker, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [lit, reduced, flame, flicker]);

  const scaleY = Animated.multiply(
    flame,
    flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }),
  );
  const scaleX = Animated.multiply(
    flame,
    flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: lit }}
      disabled={lit}
      onPress={onPress}
      hitSlop={8}
      style={{ width: 64, height: 72 }}
    >
      {/* the glow */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -18,
          top: -18,
          width: 100,
          height: 100,
          opacity: Animated.multiply(
            flame,
            flicker.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
          ),
        }}
      >
        <Svg width={100} height={100}>
          <Defs>
            <RadialGradient id="dg" cx="50" cy="44" r="50" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFC35C" stopOpacity="0.55" />
              <Stop offset="0.45" stopColor="#E8892B" stopOpacity="0.18" />
              <Stop offset="1" stopColor="#E8892B" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={44} r={50} fill="url(#dg)" />
        </Svg>
      </Animated.View>

      {/* the flame, growing from its base at the wick */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 20,
          top: 4,
          width: 24,
          height: 36,
          transformOrigin: '50% 100%',
          opacity: flame,
          transform: [{ scaleX }, { scaleY }],
        }}
      >
        <Svg width={24} height={36} viewBox="0 0 24 36">
          <Defs>
            <SvgLinear id="df" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FF9A3A" />
              <Stop offset="0.55" stopColor="#FFB347" />
              <Stop offset="1" stopColor="#FFE3A0" />
            </SvgLinear>
          </Defs>
          <Path d="M12 1 C16 10 22 17 12 35 C2 17 8 10 12 1 Z" fill="url(#df)" />
          <Path d="M12 14 C14 19 17 24 12 33 C7 24 10 19 12 14 Z" fill="#FFF4CF" />
        </Svg>
      </Animated.View>

      {/* the lamp */}
      <Svg width={64} height={72} viewBox="0 0 64 72" style={{ position: 'absolute', left: 0, top: 0 }}>
        <Defs>
          <SvgLinear id="db" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFD27A" />
            <Stop offset="0.5" stopColor="#C8902F" />
            <Stop offset="1" stopColor="#6E4512" />
          </SvgLinear>
        </Defs>
        {/* wick */}
        <Path d="M32 40 L32 34" stroke={lit ? '#3A1D04' : '#8A7A66'} strokeWidth={2} strokeLinecap="round" />
        {/* foot */}
        <Ellipse cx={32} cy={64} rx={10} ry={3} fill="#6E4512" />
        <Path d="M27 56 L37 56 L35 63 L29 63 Z" fill="#9A6A22" />
        {/* bowl, then the oil seen over the rim */}
        <Path d="M6 42 C8 58 56 58 58 42 Z" fill="url(#db)" />
        <Ellipse cx={32} cy={42} rx={26} ry={5} fill="#E3B458" />
        <Ellipse cx={32} cy={42} rx={22} ry={3.4} fill={lit ? '#5E3509' : '#3E2A10'} />
        {/* chalk line on the bowl, like the poster's brass */}
        <Path d="M12 48 C20 53 44 53 52 48" stroke="#FFE3A0" strokeOpacity={0.55} strokeWidth={1.2} fill="none" />
      </Svg>
    </Pressable>
  );
}

/** A chalk kolam at the right edge of the card, faint until the diya is lit, when its colours come up. */
function Kolam({ lit }: { lit: boolean }) {
  const glow = useRef(new Animated.Value(lit ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(glow, {
      toValue: lit ? 1 : 0,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE,
    }).start();
  }, [lit, glow]);

  const petal = (r0: number, r1: number, w: number) =>
    `M${r0} 0 C${r0 + (r1 - r0) * 0.35} ${-w} ${r0 + (r1 - r0) * 0.75} ${-w * 0.6} ${r1} 0 C${r0 + (r1 - r0) * 0.75} ${w * 0.6} ${r0 + (r1 - r0) * 0.35} ${w} ${r0} 0 Z`;
  const ring = (n: number, f: (i: number, a: number) => ReactNode) =>
    Array.from({ length: n }, (_, i) => f(i, (360 / n) * i));

  const art = (colour: boolean) => (
    <Svg width={220} height={220} viewBox="-110 -110 220 220">
      <G>
        <Circle r={14} fill={colour ? C.marigold : 'none'} fillOpacity={0.5} stroke={C.chalk} strokeWidth={1.4} />
        {ring(8, (i, a) => (
          <Path
            key={`p${i}`}
            transform={`rotate(${a})`}
            d={petal(16, 52, 13)}
            fill={colour ? (i % 2 ? C.marigold : C.yellow) : 'none'}
            fillOpacity={0.45}
            stroke={C.chalk}
            strokeWidth={1.4}
          />
        ))}
        <Circle r={60} fill="none" stroke={C.chalk} strokeWidth={1.4} />
        {ring(24, (i, a) => (
          <Circle key={`d${i}`} transform={`rotate(${a})`} cx={66} cy={0} r={1.6} fill={C.chalk} />
        ))}
        {ring(16, (i, a) => (
          <Path
            key={`o${i}`}
            transform={`rotate(${a + 11.25})`}
            d={petal(72, 96, 8)}
            fill={colour ? (i % 2 ? C.blue : C.yellow) : 'none'}
            fillOpacity={0.4}
            stroke={C.chalk}
            strokeWidth={1.2}
          />
        ))}
        {ring(16, (i, a) => (
          <Circle key={`t${i}`} transform={`rotate(${a + 11.25})`} cx={102} cy={0} r={1.8} fill={C.yellow} />
        ))}
      </G>
    </Svg>
  );

  // mostly off the card's right edge, so the words never sit on its colours
  const box = { position: 'absolute' as const, right: -126, top: '50%' as const, marginTop: -110 };
  return (
    <>
      {/* the chalk lines, always there */}
      <View pointerEvents="none" style={[box, { opacity: 0.16 }]}>
        {art(false)}
      </View>
      {/* the colours, brought up by the diya's light */}
      <Animated.View
        pointerEvents="none"
        style={[box, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.26] }) }]}
      >
        {art(true)}
      </Animated.View>
    </>
  );
}
