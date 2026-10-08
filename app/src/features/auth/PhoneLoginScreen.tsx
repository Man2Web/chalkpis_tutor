import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Screen } from '../../components';
import { normalizeIndianPhone } from '../../lib/phone';
import type { AuthStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { authErrorKey, sendCode } from './phoneAuth';

export function PhoneLoginScreen({ navigation }: NativeStackScreenProps<AuthStackParams, 'Phone'>) {
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
      navigation.navigate('Otp', { phone });
    } catch (e) {
      setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={[type.title, { marginTop: spacing.xl }]}>{t('auth.phoneTitle')}</Text>
      <Text style={[type.caption, { marginBottom: spacing.lg }]}>{t('auth.phoneHint')}</Text>
      <Input
        label={t('auth.phoneLabel')}
        value={value}
        onChangeText={setValue}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={16}
        placeholder="98765 43210"
        error={error}
        autoFocus
      />
      <Button title={t('auth.sendCode')} onPress={submit} loading={busy} />
    </Screen>
  );
}
