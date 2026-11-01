import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Logo } from '../../components';
import { font, spacing } from '../../theme';
import { BrandBackdrop, BRAND_DEEP, Float, PreviewCard } from './brand';

/** What a tutor's day looks like in Chalkpis, as three little cards floating on the brand blue. */
export const WELCOME_CARDS = [
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
 * Signing in on a laptop or desktop: the brand panel on the left (the promise and a glimpse of the app), the form
 * centred on the right. Each sign-in step keeps the panel and changes only the form.
 */
export function AuthSplit({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" />
      <View
        style={{ width: '46%', maxWidth: 680, backgroundColor: BRAND_DEEP, overflow: 'hidden' }}
      >
        <BrandBackdrop />
        <View style={{ flex: 1, padding: 56, justifyContent: 'space-between', gap: spacing.xl }}>
          <Logo height={32} variant="full" color="#FFFFFF" markColor="#FFFFFF" />
          <View style={{ gap: spacing.lg, maxWidth: 520 }}>
            <Text
              accessibilityRole="header"
              style={{ color: '#FFFFFF', fontSize: 44, lineHeight: 52, ...font('800') }}
            >
              {t('auth.welcomeHeadline')}
            </Text>
            <Text
              style={{
                color: 'rgba(255,255,255,0.82)',
                fontSize: 17,
                lineHeight: 26,
                ...font('500'),
              }}
            >
              {t('desktop.signin.pitch')}
            </Text>
          </View>
          <View
            style={{ gap: spacing.md, maxWidth: 440 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {WELCOME_CARDS.map((c, i) => (
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
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
        }}
      >
        <View style={{ width: '100%', maxWidth: 420 }}>{children}</View>
      </ScrollView>
    </View>
  );
}
