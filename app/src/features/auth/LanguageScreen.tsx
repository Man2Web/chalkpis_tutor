import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo } from '../../components';
import { haptic } from '../../lib/haptics';
import type { AuthStackParams } from '../../navigation/types';
import { colors, column, font, spacing, type } from '../../theme';
import { BrandBackdrop, BRAND_DEEP, Float, PreviewCard } from './brand';
import { CountryChip, PrimaryButton, SIGNIN } from './signin';

/** What a tutor's day looks like in Chalkpis, as three little cards floating in the hero. */
const CARDS = [
  {
    icon: 'checkmark-circle',
    tint: '#16A34A',
    key: 'Attendance',
    rotate: '-3deg',
    align: 'flex-start',
  },
  { icon: 'cash-outline', tint: '#0E77BE', key: 'Fee', rotate: '2.5deg', align: 'flex-end' },
  { icon: 'logo-whatsapp', tint: '#1DA851', key: 'Parent', rotate: '-1.5deg', align: 'center' },
] as const;

/**
 * First screen, for new and returning teachers alike (tuition, coaching, abacus, karate, dance, yoga, sports): what
 * Chalkpis does, then one tap to continue with WhatsApp.
 * Signing up and signing in are the same step: a WhatsApp code to the tutor's mobile number.
 */
export function LanguageScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParams, 'Language'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // the cards only show when the hero has room for them (they are illustration, never needed to sign in)
  const [heroH, setHeroH] = useState(0);
  const cards = heroH >= 430 ? 3 : heroH >= 340 ? 2 : heroH >= 260 ? 1 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: BRAND_DEEP }}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero: brand blue, the logo, the promise, and a glimpse of the app */}
        <View
          style={{
            flex: 1,
            minHeight: 230,
            paddingTop: Math.max(insets.top, spacing.lg) + spacing.lg,
            overflow: 'hidden',
          }}
          onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}
        >
          <BrandBackdrop />
          <View style={[column, { width: '100%', flex: 1, paddingHorizontal: spacing.xl }]}>
            <Logo height={30} variant="full" color="#FFFFFF" markColor="#FFFFFF" />
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}
              style={{
                color: '#FFFFFF',
                fontSize: 32,
                lineHeight: 38,
                ...font('800'),
                marginTop: spacing.xl,
              }}
            >
              {t('auth.welcomeHeadline')}
            </Text>
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                gap: spacing.md,
                paddingTop: spacing.lg,
                paddingBottom: 44,
              }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {CARDS.slice(0, cards).map((c, i) => (
                <View key={c.key} style={{ alignSelf: c.align }}>
                  <Float delay={250 + i * 160} drift={5 + i} rotate={c.rotate}>
                    <PreviewCard
                      icon={c.icon}
                      tint={c.tint}
                      title={t(`welcome.card${c.key}Title`)}
                      text={t(`welcome.card${c.key}Text`)}
                    />
                  </Float>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Sheet: the way in, sign-up and sign-in alike */}
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            marginTop: -28,
            paddingTop: spacing.xl,
            paddingHorizontal: spacing.lg + 4,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          <View style={[column, { width: '100%', gap: spacing.md }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, height: 1, backgroundColor: SIGNIN.line }} />
              <Text
                accessibilityRole="header"
                style={{ fontSize: 15, ...font('700'), color: SIGNIN.muted }}
              >
                {t('auth.loginOrSignup')}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: SIGNIN.line }} />
            </View>
            {/* looks like the number field; the real one opens on the next screen with the keyboard up */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('auth.enterMobile')}
              onPress={() => {
                haptic.tap();
                navigation.navigate('Phone');
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 60,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: SIGNIN.line,
                backgroundColor: pressed ? SIGNIN.field : '#FFFFFF',
              })}
            >
              <CountryChip />
              <View
                style={{ width: 1.5, height: 26, backgroundColor: SIGNIN.line, marginHorizontal: 12 }}
              />
              <Text style={{ flex: 1, fontSize: 17, ...font('500'), color: '#9CA3AF' }}>
                {t('auth.enterMobile')}
              </Text>
            </Pressable>
            <PrimaryButton
              title={t('auth.continueWhatsApp')}
              icon="logo-whatsapp"
              onPress={() => navigation.navigate('Phone')}
            />
            <Text style={[type.footnote, { textAlign: 'center' }]}>{t('auth.newHere')}</Text>
            <Text style={[type.caption2, { textAlign: 'center', marginTop: spacing.sm }]}>
              {t('legal.agreePrefix')}{' '}
              <Text
                style={{ color: colors.text, ...font('600') }}
                onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
                accessibilityRole="link"
              >
                {t('legal.terms')}
              </Text>{' '}
              {t('legal.and')}{' '}
              <Text
                style={{ color: colors.text, ...font('600') }}
                onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
                accessibilityRole="link"
              >
                {t('legal.privacy')}
              </Text>
              .
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
