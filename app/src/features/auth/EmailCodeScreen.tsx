import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OtpInput } from 'panelui-native/components/otp-input';
import { Button, Screen } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { authErrorKey } from './authErrors';
import { RESEND_SECONDS } from './phoneAuth';
import { confirmEmailCode, devEmailCodeFor, sendEmailCode } from './signIn';

/** Email sign-in, step 2: the code from the inbox. A new person then adds their mobile number once. */
export function EmailCodeScreen({
  navigation,
  route,
}: NativeStackScreenProps<AuthStackParams, 'EmailCode'>) {
  const { t } = useTranslation();
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const dev = devEmailCodeFor(email);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const verify = async (value = code) => {
    if (value.trim().length !== 6) {
      setError(t('auth.errors.invalidEmailCode'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const r = await confirmEmailCode(email, value);
      if (r)
        navigation.navigate('Phone', { signupToken: r.signupToken, email: r.email, name: r.name });
      // otherwise signed in: the navigator moves on by itself
    } catch (e) {
      const key = authErrorKey(e);
      setError(t(key === 'invalidCode' ? 'auth.errors.invalidEmailCode' : `auth.errors.${key}`));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    try {
      await sendEmailCode(email);
      setSeconds(RESEND_SECONDS);
    } catch (e) {
      setError(t(`auth.errors.${authErrorKey(e)}`));
    }
  };

  return (
    <Screen>
      <View
        style={{
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.xxl,
          marginBottom: spacing.xl,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.shell,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="mail-open-outline" size={28} color={colors.text} />
        </View>
        <Text style={[type.title1, { textAlign: 'center' }]}>{t('auth.otpTitle')}</Text>
        <Text style={[type.callout, { textAlign: 'center', color: colors.textMuted }]}>
          {t('auth.emailSentTo', { email })}
        </Text>
      </View>
      {dev ? (
        <Button
          variant="secondary"
          size="small"
          title={`Use test code ${dev}`}
          onPress={() => setCode(dev)}
        />
      ) : null}
      <View className="my-4 items-center">
        <OtpInput
          length={6}
          value={code}
          onChangeText={(v) => {
            setError(undefined);
            setCode(v);
          }}
          onComplete={(v) => void verify(v)}
          type="numeric"
          autoFocus
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          isInvalid={!!error}
          errorMessage={error}
          accessibilityLabel={t('auth.otpLabel')}
        />
      </View>
      <Button title={t('auth.verify')} onPress={() => void verify()} loading={busy} />
      <Button
        variant="ghost"
        title={seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
        onPress={resend}
        disabled={seconds > 0}
      />
      <Button variant="ghost" title={t('auth.changeEmail')} onPress={() => navigation.goBack()} />
    </Screen>
  );
}
