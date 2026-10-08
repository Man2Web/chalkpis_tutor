import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Screen } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { EmulatorCodeHint } from './EmulatorCodeHint';
import { authErrorKey, confirmCode, RESEND_SECONDS, sendCode } from './phoneAuth';

export function OtpScreen({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'Otp'>) {
  const { t } = useTranslation();
  const { phone } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const verify = async () => {
    if (code.trim().length !== 6) {
      setError(t('auth.errors.invalidCode'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await confirmCode(code); // signing in switches the navigator automatically
    } catch (e) {
      setError(t(`auth.errors.${authErrorKey(e)}`));
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    try {
      await sendCode(phone);
      setSeconds(RESEND_SECONDS);
    } catch (e) {
      setError(t(`auth.errors.${authErrorKey(e)}`));
    }
  };

  return (
    <Screen>
      <Text style={[type.title, { marginTop: spacing.xl }]}>{t('auth.otpTitle')}</Text>
      <Text style={[type.caption, { marginBottom: spacing.lg }]}>
        {t('auth.otpSentTo', { phone })}
      </Text>
      <EmulatorCodeHint phone={phone} onUse={setCode} />
      <Input
        label={t('auth.otpLabel')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        error={error}
        autoFocus
      />
      <Button title={t('auth.verify')} onPress={verify} loading={busy} />
      <Button
        variant="ghost"
        title={seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
        onPress={resend}
        disabled={seconds > 0}
      />
      <Button variant="ghost" title={t('auth.changeNumber')} onPress={() => navigation.goBack()} />
    </Screen>
  );
}
