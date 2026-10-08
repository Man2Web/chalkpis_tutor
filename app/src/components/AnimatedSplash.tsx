import { useCallback, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';
import * as SplashScreen from 'expo-splash-screen';
import intro from '../../assets/chalkpis-intro.json';
import { useSplashFade } from './splashFade';

// Keep the native splash (plain white, from app.json) up until the Lottie overlay is on screen,
// so the hand-off is invisible.
void SplashScreen.preventAutoHideAsync();

interface Props {
  /** true once the saved sign-in has been checked */
  appReady: boolean;
  children: ReactNode;
}

export default function AnimatedSplash({ appReady, children }: Props) {
  const [animationDone, setAnimationDone] = useState(false);
  const { opacity, visible } = useSplashFade(appReady, animationDone);
  const onLayout = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.root}>
      {children}
      {visible && (
        <Animated.View style={[styles.overlay, { opacity }]} onLayout={onLayout}>
          <LottieView
            source={intro}
            autoPlay
            loop={false}
            resizeMode="contain"
            onAnimationFinish={() => setAnimationDone(true)}
            style={styles.animation}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 320 x 320 keeps the mark at 104 dp, matching the canvas design
  animation: { width: 320, height: 320 },
});
