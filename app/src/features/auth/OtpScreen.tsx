import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Screen } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { DevCodeHint } from './DevCodeHint';
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
      await confirmCode(phone, code); // signing in switches the navigator automatically
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
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="lock-closed" size={30} color={colors.primary} />
        </View>
        <Text style={[type.title1, { textAlign: 'center' }]}>{t('auth.otpTitle')}</Text>
        <Text style={[type.callout, { textAlign: 'center', color: colors.textMuted }]}>
          {t('auth.otpSentTo', { phone })}
        </Text>
      </View>
      <DevCodeHint phone={phone} onUse={setCode} />
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
        placeholder="••••••"
        style={{ fontSize: 28, letterSpacing: 10, textAlign: 'center', fontWeight: '600' }}
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
