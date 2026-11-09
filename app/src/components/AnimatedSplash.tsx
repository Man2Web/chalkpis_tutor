import { useCallback, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { BrandReveal } from './BrandReveal';
import { useSplashFade } from './splashFade';

// Keep the native splash (plain white, from app.json) up until the overlay is on screen, so the hand-off is
// invisible: the blue then grows out of that same white.
void SplashScreen.preventAutoHideAsync();

interface Props {
  /** true once the saved sign-in has been checked */
  appReady: boolean;
  children: ReactNode;
}

/**
 * The one launch screen, on phones and in the browser alike: brand blue with the white logo and "Manage • Teach •
 * Grow" (see BrandReveal), held until the app is ready, then faded away.
 */
export default function AnimatedSplash({ appReady, children }: Props) {
  const [revealed, setRevealed] = useState(false);
  const { opacity, visible } = useSplashFade(appReady, revealed);
  const onLayout = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.root}>
      {children}
      {visible && (
        <Animated.View
          testID="launch-splash"
          style={[styles.overlay, { opacity }]}
          onLayout={onLayout}
        >
          <BrandReveal onDone={() => setRevealed(true)} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#FFFFFF' },
});
