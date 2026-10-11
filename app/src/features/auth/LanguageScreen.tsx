import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo, Screen, toast } from '../../components';
import { haptic } from '../../lib/haptics';
import { reportError } from '../../lib/analytics';
import type { AuthStackParams } from '../../navigation/types';
import { colors, font, radius, spacing, type } from '../../theme';
import { authErrorKey } from './authErrors';
import { oauthSignIn, signInMethods, type Methods } from './signIn';

const FEATURES = [
  { icon: 'checkmark-circle', color: colors.successFill, key: 'attendance' },
  { icon: 'qr-code', color: colors.infoFill, key: 'fees' },
  { icon: 'logo-whatsapp', color: '#25D366', key: 'parents' },
] as const;

type Look = 'whatsapp' | 'google' | 'apple' | 'email';
const LOOK: Record<
  Look,
  {
    bg: string;
    fg: string;
    border?: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
  }
> = {
  whatsapp: { bg: '#1DA851', fg: '#FFFFFF', icon: 'logo-whatsapp' },
  apple: { bg: '#000000', fg: '#FFFFFF', icon: 'logo-apple' },
  google: {
    bg: colors.surface,
    fg: colors.text,
    border: colors.input,
    icon: 'logo-google',
    iconColor: '#4285F4',
  },
  email: { bg: colors.surface, fg: colors.text, border: colors.input, icon: 'mail-outline' },
};

/** A full-width "Continue with …" button in each provider's own colours. */
function ProviderButton({
  look,
  label,
  onPress,
  busy,
  disabled,
}: {
  look: Look;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const l = LOOK[look];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
          <Ionicons name={l.icon} size={20} color={l.iconColor ?? l.fg} />
          <Text style={{ fontSize: 16, ...font('600'), color: l.fg }}>{label}</Text>
        </>
      )}
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

  useEffect(() => {
    void signInMethods().then(setMethods);
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

  // Apple first on iPhone (what people there expect), Google first elsewhere; WhatsApp leads for everyone.
  const social =
    Platform.OS === 'ios' ? (['apple', 'google'] as const) : (['google', 'apple'] as const);

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
            />
          ) : null,
        )}
        {methods.email ? (
          <ProviderButton
            look="email"
            label={t('auth.continueEmail')}
            onPress={() => navigation.navigate('Email')}
            disabled={!!busy}
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
