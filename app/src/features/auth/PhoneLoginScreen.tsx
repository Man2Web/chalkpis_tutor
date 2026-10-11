import { useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Screen } from '../../components';
import { normalizeIndianPhone } from '../../lib/phone';
import type { AuthStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { authErrorKey, sendCode } from './phoneAuth';

export function PhoneLoginScreen({
  navigation,
  route,
}: NativeStackScreenProps<AuthStackParams, 'Phone'>) {
  // Set when a new Google / Apple / email person is adding their mobile number once.
  const signup = route.params?.signupToken ? route.params : null;
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!normalizeIndianPhone(value)) {
      setError(t('validation.phone'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const phone = await sendCode(value);
      navigation.navigate('Otp', { phone, signupToken: signup?.signupToken });
    } catch (e) {
      setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      setBusy(false);
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
            backgroundColor: 'rgba(37,211,102,0.14)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="logo-whatsapp" size={34} color="#1DA851" />
        </View>
        <Text style={[type.title1, { textAlign: 'center' }]}>
          {t(signup ? 'auth.addPhoneTitle' : 'auth.phoneTitle')}
        </Text>
        <Text style={[type.callout, { textAlign: 'center', color: colors.textMuted }]}>
          {t(signup ? 'auth.addPhoneHint' : 'auth.phoneHint')}
        </Text>
        {signup && (signup.email || signup.name) ? (
          <Text style={[type.footnote, { textAlign: 'center' }]}>
            {t('auth.addPhoneFor', { who: signup.email ?? signup.name })}
          </Text>
        ) : null}
      </View>
      <Input
        label={t('auth.phoneLabel')}
        value={value}
        onChangeText={setValue}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={16}
        placeholder="98765 43210"
        prefix="+91"
        error={error}
        autoFocus
      />
      <Button title={t('auth.sendCode')} onPress={submit} loading={busy} />
    </Screen>
  );
}
