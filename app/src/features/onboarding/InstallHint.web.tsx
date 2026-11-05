import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '../../components';
import { readFlag, setFlag } from '../../lib/onceFlag';
import { colors, spacing, type } from '../../theme';

const FLAG = 'install_hint_hidden';
const STORE_URL = {
  android:
    'https://play.google.com/store/apps/details?id=in.chalkpis.tutors&referrer=utm_source%3Dtutor.chalkpis.com%26utm_medium%3Dweb_app',
  iphone: 'https://apps.apple.com/in/app/chalkpis-class-fee-manager/id6822059424',
} as const;

/** Which hint this browser gets: none when Chalkpis already opens from the Home Screen, or on a computer. */
function hintKind(): 'iphone' | 'android' | null {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen gives it away
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return null;
}

/**
 * On Home in the browser version on a phone: the store app for that phone (App Store on an iPhone or iPad, Google
 * Play on Android), which is faster and sends notifications. Hidden for good once dismissed.
 */
export function InstallHint() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'iphone' | 'android' | null>(null);
  useEffect(() => {
    let live = true;
    const k = hintKind();
    if (k) void readFlag(FLAG).then((hidden) => live && !hidden && setKind(k));
    return () => {
      live = false;
    };
  }, []);
  if (!kind) return null;

  const hide = () => {
    setKind(null);
    void setFlag(FLAG);
  };
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ionicons
          name={kind === 'iphone' ? 'logo-apple-appstore' : 'logo-google-playstore'}
          size={22}
          color={colors.brand}
        />
        <Text style={[type.heading, { flex: 1 }]}>{t(`installHint.${kind}Title`)}</Text>
        <Pressable accessibilityRole="button" onPress={hide} hitSlop={10}>
          <Text style={[type.footnote, { color: colors.textMuted }]}>
            {t('installHint.dismiss')}
          </Text>
        </Pressable>
      </View>
      <Text style={[type.footnote, { color: colors.textMuted }]}>
        {t(`installHint.${kind}Text`)}
      </Text>
      <Button
        title={t(`installHint.${kind}Button`)}
        size="small"
        variant="outline"
        onPress={() => void Linking.openURL(STORE_URL[kind])}
      />
    </Card>
  );
}
