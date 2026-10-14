import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components';
import { useInstituteId } from '../../data/hooks';
import { haptic } from '../../lib/haptics';
import { readFlag, setFlag } from '../../lib/onceFlag';
import { colors, spacing, type } from '../../theme';

const SLIDES = [
  { key: 'start', icon: 'albums-outline' },
  { key: 'attendance', icon: 'checkmark-done-outline' },
  { key: 'fees', icon: 'wallet-outline' },
  { key: 'parents', icon: 'chatbubbles-outline' },
] as const;

/**
 * A short tour the first time an owner opens Home: four quiet slides (swipe or Next), Skip at any time. Shown once per
 * centre on this device.
 */
export function WelcomeTour() {
  const { t } = useTranslation();
  const id = useInstituteId();
  const flag = `tour_${id}`;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let live = true;
    void readFlag(flag).then((seen) => live && !seen && setOpen(true));
    return () => {
      live = false;
    };
  }, [flag]);

  const close = () => {
    setOpen(false);
    void setFlag(flag);
  };
  const go = (to: number) => {
    scroller.current?.scrollTo({ x: to * width, animated: true });
    setPage(to);
    haptic.select();
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };
  const last = page === SLIDES.length - 1;

  return (
    <Modal visible={open} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <View
          style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
        >
          {last ? (
            <View style={{ height: 36 }} />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={close}
              hitSlop={12}
              style={{ padding: spacing.sm }}
            >
              <Text style={[type.subhead, { color: colors.textMuted }]}>{t('tour.skip')}</Text>
            </Pressable>
          )}
        </View>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          style={{ flex: 1 }}
        >
          {SLIDES.map((s) => (
            <View
              key={s.key}
              style={{
                width,
                flex: 1,
                justifyContent: 'center',
                paddingHorizontal: spacing.xl * 1.5,
                gap: spacing.lg,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={s.icon} size={30} color={colors.text} />
              </View>
              <Text style={[type.title1, { color: colors.text }]} accessibilityRole="header">
                {t(`tour.${s.key}.title`)}
              </Text>
              <Text style={[type.body, { color: colors.textMuted, lineHeight: 24 }]}>
                {t(`tour.${s.key}.text`)}
              </Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.lg }}>
          <View
            style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}
            accessibilityElementsHidden
          >
            {SLIDES.map((s, i) => (
              <View
                key={s.key}
                style={{
                  width: i === page ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === page ? colors.text : colors.border,
                }}
              />
            ))}
          </View>
          <Button
            title={t(last ? 'tour.done' : 'tour.next')}
            onPress={() => (last ? close() : go(page + 1))}
          />
        </View>
      </View>
    </Modal>
  );
}
