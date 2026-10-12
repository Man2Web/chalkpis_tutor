import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo } from '../../components';
import { haptic } from '../../lib/haptics';
import type { AuthStackParams } from '../../navigation/types';
import { colors, column, font, radius, spacing, type } from '../../theme';
import { BrandBackdrop, BRAND_DEEP, Float, PreviewCard } from './brand';

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

/** The full-width "Continue with WhatsApp" button, in WhatsApp green. */
function WhatsAppButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: radius.md + 2,
        backgroundColor: '#1DA851',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
      <Text style={{ fontSize: 16, ...font('600'), color: '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * First screen, for new and returning tutors alike: what Chalkpis does, then one tap to continue with WhatsApp.
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
              style={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: 13,
                ...font('600'),
                marginTop: spacing.xl,
                letterSpacing: 0.3,
              }}
            >
              {t('auth.welcomeKicker').toUpperCase()}
            </Text>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}
              style={{
                color: '#FFFFFF',
                fontSize: 32,
                lineHeight: 38,
                ...font('800'),
                marginTop: 6,
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
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          <View style={[column, { width: '100%', gap: spacing.sm }]}>
            <WhatsAppButton
              label={t('auth.continueWhatsApp')}
              onPress={() => navigation.navigate('Phone')}
            />
            <Text style={[type.footnote, { textAlign: 'center', marginTop: spacing.xs }]}>
              {t('auth.newHere')}
            </Text>
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
