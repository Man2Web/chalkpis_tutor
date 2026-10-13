import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BRAND } from '../../components';
import { formatIndianPhone } from '../../lib/phone';
import type { AuthStackParams } from '../../navigation/types';
import { font, spacing } from '../../theme';
import { resendWaitOf } from './authErrors';
import { DevCodeHint } from './DevCodeHint';
import { authErrorKey, confirmCode, RESEND_SECONDS, sendCode } from './phoneAuth';
import {
  CodeBoxes,
  ErrorText,
  INK,
  PrimaryButton,
  SignInLayout,
  SIGNIN,
  Subtle,
  TextButton,
  WhatsAppCodeCard,
} from './signin';

export function OtpScreen({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'Otp'>) {
  const { t } = useTranslation();
  const { phone, resendIn } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(resendIn ?? RESEND_SECONDS);
  // the last box (auto-submit) and the Verify button can land in the same frame; one check per code
  const inFlight = useRef(false);

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
      await confirmCode(phone, value); // signing in switches the navigator automatically
    } catch (e) {
      setBusy(false);
      setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      inFlight.current = false;
    }
  };

  const resend = async () => {
    if (resending) return;
    setError(undefined);
    setCode('');
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
    <SignInLayout
      title={t('auth.otpTitle')}
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Subtle>{t('auth.otpSentTo', { phone: formatIndianPhone(phone) })}</Subtle>
          <Text
            accessibilityRole="link"
            onPress={() => navigation.goBack()}
            style={{ fontSize: 15, ...font('700'), color: BRAND }}
          >
            {t('auth.edit')}
          </Text>
        </View>
      }
      onBack={() => navigation.goBack()}
      footer={
        <PrimaryButton title={t('auth.verify')} onPress={() => void verify()} loading={busy} />
      }
    >
      <DevCodeHint phone={phone} onUse={setCode} />
      <CodeBoxes
        value={code}
        onChange={(v) => {
          setError(undefined);
          setCode(v);
        }}
        onComplete={(v) => void verify(v)}
        error={!!error}
        label={t('auth.otpLabel')}
        autoFocus
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 14, ...font('500'), color: SIGNIN.muted }}>
          {t('auth.didntGet')}
        </Text>
        <TextButton
          title={seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
          onPress={() => void resend()}
          disabled={seconds > 0}
          loading={resending}
          color={BRAND}
        />
      </View>
      <WhatsAppCodeCard />
      <TextButton title={t('auth.changeNumber')} onPress={() => navigation.goBack()} color={INK} />
    </SignInLayout>
  );
}
