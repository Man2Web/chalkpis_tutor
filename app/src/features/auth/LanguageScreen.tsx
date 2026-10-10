import { Image, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import appIcon from '../../../assets/icon.png';
import { colors, spacing, type } from '../../theme';

const FEATURES = [
  { icon: 'checkmark-circle', color: colors.successFill, key: 'attendance' },
  { icon: 'qr-code', color: colors.primary, key: 'fees' },
  { icon: 'logo-whatsapp', color: '#25D366', key: 'parents' },
] as const;

/** First screen: Apple-style welcome with what the app does, the language switch and Continue. */
export function LanguageScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParams, 'Language'>) {
  const { t } = useTranslation();

  return (
    <Screen>
      <View
        style={{ flex: 1, justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.xl }}
      >
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Image
            source={appIcon}
            style={{ width: 88, height: 88, borderRadius: 20 }}
            accessibilityIgnoresInvertColors
          />
          <Text style={[type.largeTitle, { textAlign: 'center' }]}>{t('welcome.title')}</Text>
          <Text style={[type.callout, { textAlign: 'center', color: colors.textMuted }]}>
            {t('app.tagline')}
          </Text>
        </View>

        <View style={{ gap: spacing.lg, paddingHorizontal: spacing.sm }}>
          {FEATURES.map((f) => (
            <View
              key={f.key}
              style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}
            >
              <Ionicons name={f.icon} size={34} color={f.color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.heading}>{t(`welcome.${f.key}Title`)}</Text>
                <Text style={[type.subhead, { color: colors.textMuted }]}>
                  {t(`welcome.${f.key}Text`)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <Button title={t('language.continue')} onPress={() => navigation.navigate('Phone')} />
      <Text style={[type.footnote, { textAlign: 'center', marginTop: spacing.sm }]}>
        {t('legal.agreePrefix')}{' '}
        <Text
          style={{ color: colors.primaryDark, fontWeight: '600' }}
          onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
          accessibilityRole="link"
        >
          {t('legal.terms')}
        </Text>{' '}
        {t('legal.and')}{' '}
        <Text
          style={{ color: colors.primaryDark, fontWeight: '600' }}
          onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
          accessibilityRole="link"
        >
          {t('legal.privacy')}
        </Text>
        .
      </Text>
    </Screen>
  );
}
