import { useEffect, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OtpInput } from 'panelui-native/components/otp-input';
import { Button } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import { type } from '../../theme';
import { authErrorKey, resendWaitOf } from './authErrors';
import { AuthStepLayout } from './brand';
import { RESEND_SECONDS } from './phoneAuth';
import { confirmEmailCode, devEmailCodeFor, sendEmailCode } from './signIn';

/** Email sign-in, step 2: the code from the inbox. A new person then adds their mobile number once. */
export function EmailCodeScreen({
  navigation,
  route,
}: NativeStackScreenProps<AuthStackParams, 'EmailCode'>) {
  const { t } = useTranslation();
  const { email, resendIn } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(resendIn ?? RESEND_SECONDS);
  // the last cell (auto-submit) and the Verify button can land in the same frame; one check per code
  const inFlight = useRef(false);
  // six 44 dp cells do not fit beside the sheet padding on the narrowest phones
  const small = useWindowDimensions().width < 360;
  const dev = devEmailCodeFor(email);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const verify = async (value = code) => {
    if (inFlight.current) return;
    if (value.trim().length !== 6) {
      setError(t('auth.errors.invalidEmailCode'));
      return;
    }
    inFlight.current = true;
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
      inFlight.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resending) return;
    setError(undefined);
    setResending(true);
    try {
      await sendEmailCode(email);
      setSeconds(RESEND_SECONDS);
    } catch (e) {
      const wait = resendWaitOf(e);
      if (wait) setSeconds(wait);
      else setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthStepLayout
      icon="mail-open"
      title={t('auth.otpTitle')}
      subtitle={t('auth.emailSentTo', { email })}
      onBack={() => navigation.goBack()}
    >
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
          size={small ? 'sm' : 'md'}
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
      <Text style={[type.footnote, { textAlign: 'center' }]}>{t('auth.emailSpamHint')}</Text>
      <Button
        variant="ghost"
        title={seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
        onPress={resend}
        disabled={seconds > 0}
        loading={resending}
      />
      <Button variant="ghost" title={t('auth.changeEmail')} onPress={() => navigation.goBack()} />
    </AuthStepLayout>
  );
}
