import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo, Screen, toast } from '../../components';
import { haptic } from '../../lib/haptics';
import { reportError } from '../../lib/analytics';
import type { AuthStackParams } from '../../navigation/types';
import { colors, font, radius, spacing, type } from '../../theme';
import { authErrorKey } from './authErrors';
import { lastSignInMethod, type SignInMethod } from './phoneAuth';
import { oauthSignIn, signInMethods, type Methods } from './signIn';

const FEATURES = [
  { icon: 'checkmark-circle', color: colors.successFill, key: 'attendance' },
  { icon: 'qr-code', color: colors.infoFill, key: 'fees' },
  { icon: 'logo-whatsapp', color: '#25D366', key: 'parents' },
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

  useEffect(() => {
    void signInMethods().then(setMethods);
    void lastSignInMethod().then(setLast);
  }, []);

  const withProvider = async (p: 'google' | 'apple') => {
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
      setBusy(null);
    }
  };

  // WhatsApp leads for everyone (every tutor has it). On iPhone: Apple, then Google, as Apple asks apps that offer
  // Google sign-in to offer Apple too. On Android: Google only; Apple sign-in there is a web page few people have
  // an account for, so it would only be a dead end.
  const social: ('apple' | 'google')[] = Platform.OS === 'ios' ? ['apple', 'google'] : ['google'];
  const tag = (m: SignInMethod) => (last === m ? t('auth.lastUsed') : undefined);

  return (
    <Screen>
      <View
        style={{ flex: 1, justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.lg }}
      >
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Logo height={34} />
          <Text style={[type.title1, { textAlign: 'center' }]}>{t('auth.welcomeHeadline')}</Text>
          <Text style={[type.callout, { textAlign: 'center', color: colors.textMuted }]}>
            {t('app.tagline')}
          </Text>
        </View>

        <View style={{ gap: spacing.md, paddingHorizontal: spacing.sm }}>
          {FEATURES.map((f) => (
            <View
              key={f.key}
              style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}
            >
              <Ionicons name={f.icon} size={26} color={f.color} />
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{t(`welcome.${f.key}Title`)}</Text>
                <Text style={type.footnote}>{t(`welcome.${f.key}Text`)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
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
      </View>

      <Text style={[type.caption2, { textAlign: 'center', marginTop: spacing.md }]}>
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
    </Screen>
  );
}
