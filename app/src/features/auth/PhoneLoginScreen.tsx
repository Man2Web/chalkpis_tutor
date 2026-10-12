import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input } from '../../components';
import { normalizeIndianPhone } from '../../lib/phone';
import type { AuthStackParams } from '../../navigation/types';
import { AuthStepLayout } from './brand';
import { resendWaitOf } from './authErrors';
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
      // a code was sent to this number a moment ago (back, then Send again): it is still good, so go and enter it
      const wait = resendWaitOf(e);
      const phone = normalizeIndianPhone(value);
      if (wait && phone) navigation.navigate('Otp', { phone, resendIn: wait });
      else setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthStepLayout
      icon="logo-whatsapp"
      iconColor="#1DA851"
      title={t('auth.phoneTitle')}
      subtitle={t('auth.phoneHint')}
      onBack={() => navigation.goBack()}
    >
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
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
      />
      <Button title={t('auth.sendCode')} onPress={submit} loading={busy} />
    </AuthStepLayout>
  );
}
