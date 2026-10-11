import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo, toast } from '../../components';
import { haptic } from '../../lib/haptics';
import { reportError } from '../../lib/analytics';
import type { AuthStackParams } from '../../navigation/types';
import { colors, column, font, radius, spacing, type } from '../../theme';
import { BrandBackdrop, BRAND_DEEP, Float, PreviewCard } from './brand';
import { authErrorKey } from './authErrors';
import { lastSignInMethod, type SignInMethod } from './phoneAuth';
import { oauthSignIn, signInMethods, type Methods } from './signIn';

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

/** Google's four-colour "G", as its sign-in branding asks for (never a one-colour icon). */
function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

type Look = SignInMethod;
/**
 * Each provider in its own official style: WhatsApp green, Apple's black button (Human Interface Guidelines),
 * Google's white button with a grey outline and the colour "G" (Google sign-in branding).
 */
const LOOK: Record<
  Look,
  {
    bg: string;
    fg: string;
    border?: string;
    icon?: keyof typeof Ionicons.glyphMap;
  }
> = {
  whatsapp: { bg: '#1DA851', fg: '#FFFFFF', icon: 'logo-whatsapp' },
  apple: { bg: '#000000', fg: '#FFFFFF', icon: 'logo-apple' },
  google: { bg: '#FFFFFF', fg: '#1F1F1F', border: '#747775' },
  email: { bg: colors.surface, fg: colors.text, border: colors.input, icon: 'mail-outline' },
};

/** A full-width "Continue with …" button in each provider's own colours. */
function ProviderButton({
  look,
  label,
  onPress,
  busy,
  disabled,
  lastUsed,
}: {
  look: Look;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  lastUsed?: string;
}) {
  const l = LOOK[look];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lastUsed ? `${label}, ${lastUsed}` : label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: radius.md + 2,
        backgroundColor: l.bg,
        borderWidth: l.border ? 1 : 0,
        borderColor: l.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        opacity: disabled && !busy ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {busy ? (
        <ActivityIndicator color={l.fg} />
      ) : (
        <>
          {l.icon ? <Ionicons name={l.icon} size={20} color={l.fg} /> : <GoogleG />}
          <Text style={{ fontSize: 16, ...font('600'), color: l.fg }}>{label}</Text>
        </>
      )}
      {lastUsed && !busy ? (
        <View
          style={{
            position: 'absolute',
            top: -9,
            right: 12,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: colors.text,
          }}
        >
          <Text style={{ fontSize: 11, ...font('600'), color: colors.surface }}>{lastUsed}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * First screen, for new and returning tutors alike: what Chalkpis does, then one tap to continue with WhatsApp,
 * Google, Apple or email. Signing up and signing in are the same step; only methods that are switched on show.
 */
export function LanguageScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParams, 'Language'>) {
  const { t } = useTranslation();
  const [methods, setMethods] = useState<Methods>({
    whatsapp: true,
    email: false,
    google: false,
    apple: false,
  });
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [last, setLast] = useState<SignInMethod | null>(null);
  // `busy` disables the buttons only after a render; two taps in one frame must not open two sign-in sheets
  const opening = useRef(false);

  useEffect(() => {
    void signInMethods().then(setMethods);
    void lastSignInMethod().then(setLast);
  }, []);

  const withProvider = async (p: 'google' | 'apple') => {
    if (opening.current) return;
    opening.current = true;
    setBusy(p);
    try {
      const r = await oauthSignIn(p);
      if (r && r !== 'cancelled')
        navigation.navigate('Phone', { signupToken: r.signupToken, email: r.email, name: r.name });
      // signed in: the navigator moves on by itself; cancelled: stay here quietly
    } catch (e) {
      const key = authErrorKey(e);
      if (key === 'generic' || key === 'signupExpired') reportError(e);
      toast(
        key === 'generic'
          ? t('auth.errors.providerFailed', { provider: p === 'google' ? 'Google' : 'Apple' })
          : t(`auth.errors.${key}`),
        'error',
      );
    } finally {
      opening.current = false;
      setBusy(null);
    }
  };

  // WhatsApp leads for everyone (every tutor has it). On iPhone: Apple, then Google, as Apple asks apps that offer
  // Google sign-in to offer Apple too. On Android: Google only; Apple sign-in there is a web page few people have
  // an account for, so it would only be a dead end.
  const social: ('apple' | 'google')[] = Platform.OS === 'ios' ? ['apple', 'google'] : ['google'];
  const tag = (m: SignInMethod) => (last === m ? t('auth.lastUsed') : undefined);

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

        {/* Sheet: every way in, sign-up and sign-in alike */}
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
            {methods.whatsapp ? (
              <ProviderButton
                look="whatsapp"
                label={t('auth.continueWhatsApp')}
                onPress={() => navigation.navigate('Phone')}
                disabled={!!busy}
                lastUsed={tag('whatsapp')}
              />
            ) : null}
            {social.map((p) =>
              methods[p] ? (
                <ProviderButton
                  key={p}
                  look={p}
                  label={t(p === 'google' ? 'auth.continueGoogle' : 'auth.continueApple')}
                  onPress={() => void withProvider(p)}
                  busy={busy === p}
                  disabled={!!busy}
                  lastUsed={tag(p)}
                />
              ) : null,
            )}
            {methods.email ? (
              <ProviderButton
                look="email"
                label={t('auth.continueEmail')}
                onPress={() => navigation.navigate('Email')}
                disabled={!!busy}
                lastUsed={tag('email')}
              />
            ) : null}
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
