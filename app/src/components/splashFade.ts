import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

/** The intro must finish AND the app must be ready; only then does the overlay fade away (and unmount). */
export function useSplashFade(appReady: boolean, animationDone: boolean) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (appReady && animationDone) {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() =>
        setVisible(false),
      );
    }
  }, [appReady, animationDone, opacity]);
  return { opacity, visible };
}
