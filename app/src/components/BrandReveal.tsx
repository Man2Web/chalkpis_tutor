import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { font } from '../theme';
import { BRAND, Logo } from './Logo';

const NATIVE = Platform.OS !== 'web';
const DEEP = '#0A5A91';

/**
 * The launch finale, after the logo has drawn itself: brand blue bursts out from the centre, the white logo and
 * the tagline rise into place, then `onDone`. About 1.1 s; skipped straight to `onDone` when Reduce Motion is on.
 * The welcome screen opens on the same blue, so launch flows straight into it.
 */
export function BrandReveal({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const burst = useRef(new Animated.Value(0)).current;
  const content = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let alive = true;
    void (AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false))
      .catch(() => false)
      .then((reduced) => {
        if (!alive) return;
        if (reduced) return done.current();
        anim = Animated.sequence([
          Animated.timing(burst, {
            toValue: 1,
            duration: 480,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: NATIVE,
          }),
          Animated.timing(content, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: NATIVE,
          }),
          Animated.delay(320),
        ]);
        anim.start(({ finished }) => finished && done.current());
      });
    return () => {
      alive = false;
      anim?.stop();
    };
  }, [burst, content]);

  // a circle just big enough to cover the corners when it reaches full size
  const size = Math.hypot(width, height) + 8;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          left: (width - size) / 2,
          top: (height - size) / 2,
          backgroundColor: BRAND,
          transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.02, 1] }) }],
        }}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: DEEP,
            opacity: content.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
          },
        ]}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            opacity: content,
            transform: [
              { translateY: content.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            ],
          },
        ]}
      >
        <Logo height={46} color="#FFFFFF" markColor="#FFFFFF" />
        {/* the same brand line the logo animation ends on, now in white */}
        <Text
          style={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: 13,
            letterSpacing: 2.6,
            ...font('600'),
          }}
        >
          MANAGE • TEACH • GROW
        </Text>
      </Animated.View>
    </View>
  );
}
