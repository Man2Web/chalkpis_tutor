import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OtpInput } from 'panelui-native/components/otp-input';
import { Button, toast } from '../../components';
import { formatIndianPhone } from '../../lib/phone';
import type { AuthStackParams } from '../../navigation/types';
import { resendWaitOf } from './authErrors';
import { AuthStepLayout, WhatsAppPreview } from './brand';
import { DevCodeHint } from './DevCodeHint';
import { authErrorKey, confirmCode, RESEND_SECONDS, sendCode } from './phoneAuth';

export function OtpScreen({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'Otp'>) {
  const { t } = useTranslation();
  const { phone, signupToken, resendIn } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(resendIn ?? RESEND_SECONDS);
  // the last cell (auto-submit) and the Verify button can land in the same frame; one check per code
  const inFlight = useRef(false);
  // six 44 dp cells do not fit beside the sheet padding on the narrowest phones
  const small = useWindowDimensions().width < 360;

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const verify = async (value = code) => {
    if (inFlight.current) return;
    if (value.trim().length !== 6) {
      setError(t('auth.errors.invalidCode'));
      return;
    }
    inFlight.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await confirmCode(phone, value, signupToken); // signing in switches the navigator automatically
    } catch (e) {
      const key = authErrorKey(e);
      setBusy(false);
      // the pending Google / Apple / email sign-up ran out: back to the start rather than a dead end
      if (key === 'signupExpired') {
        toast(t('auth.errors.signupExpired'), 'error');
        navigation.popToTop();
      } else setError(t(`auth.errors.${key}`));
    } finally {
      inFlight.current = false;
    }
  };

  const resend = async () => {
    if (resending) return;
    setError(undefined);
    setResending(true);
    try {
      await sendCode(phone);
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
      icon="chatbubble-ellipses"
      title={t('auth.otpTitle')}
      subtitle={t('auth.otpSentTo', { phone: formatIndianPhone(phone) })}
      step={signupToken ? [2, 2] : undefined}
      onBack={() => navigation.goBack()}
    >
      <WhatsAppPreview />
      <DevCodeHint phone={phone} onUse={setCode} />
      <View className="my-4 items-center">
        <OtpInput
          length={6}
          size={small ? 'sm' : 'md'}
          value={code}
          onChangeText={(v) => {
            setError(undefined);
            setCode(v);
          }}
          onComplete={(v) => {
            setCode(v);
            void verify(v);
          }}
          type="numeric"
          autoFocus
          autoComplete="sms-otp"
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
        loading={resending}
      />
      <Button variant="ghost" title={t('auth.changeNumber')} onPress={() => navigation.goBack()} />
    </AuthStepLayout>
  );
}
