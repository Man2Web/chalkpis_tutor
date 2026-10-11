import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import lottie from 'lottie-web';
import intro from '../../assets/chalkpis-intro.json';
import { BrandReveal } from './BrandReveal';
import { useSplashFade } from './splashFade';

interface Props {
  appReady: boolean;
  children: ReactNode;
}

/** Browser preview of the same intro (there is no native splash in a browser). */
export default function AnimatedSplash({ appReady, children }: Props) {
  const [drawn, setDrawn] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const { opacity, visible } = useSplashFade(appReady, animationDone);
  const box = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const anim = lottie.loadAnimation({
      container: box.current,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: intro,
    });
    anim.setSpeed(1.5);
    anim.addEventListener('complete', () => setDrawn(true));
    return () => anim.destroy();
  }, [visible]);

  return (
    <View style={styles.root}>
      {children}
      {visible && (
        <Animated.View style={[styles.overlay, { opacity }]}>
          {createElement('div', {
            ref: (el: HTMLElement | null) => {
              box.current = el;
            },
            style: { width: 320, height: 320 },
          })}
          {drawn ? <BrandReveal onDone={() => setAnimationDone(true)} /> : null}
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
});
