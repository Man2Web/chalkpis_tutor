import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OtpInput } from 'panelui-native/components/otp-input';
import { Button, Screen } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { DevCodeHint } from './DevCodeHint';
import { authErrorKey, confirmCode, RESEND_SECONDS, sendCode } from './phoneAuth';

export function OtpScreen({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'Otp'>) {
  const { t } = useTranslation();
  const { phone, signupToken } = route.params;
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
      await confirmCode(phone, code, signupToken); // signing in switches the navigator automatically
    } catch (e) {
      const key = authErrorKey(e);
      setError(t(`auth.errors.${key}`));
      setBusy(false);
      // the pending Google / Apple / email sign-up ran out: back to the start rather than a dead end
      if (key === 'signupExpired') navigation.popToTop();
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
            backgroundColor: colors.shell,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chatbubble-ellipses" size={28} color={colors.text} />
        </View>
        <Text style={[type.title1, { textAlign: 'center' }]}>{t('auth.otpTitle')}</Text>
        <Text style={[type.callout, { textAlign: 'center', color: colors.textMuted }]}>
          {t('auth.otpSentTo', { phone })}
        </Text>
      </View>
      <DevCodeHint phone={phone} onUse={setCode} />
      <View className="mb-4 items-center">
        <OtpInput
          length={6}
          value={code}
          onChangeText={(v) => {
            setError(undefined);
            setCode(v);
          }}
          onComplete={(v) => {
            setCode(v);
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
