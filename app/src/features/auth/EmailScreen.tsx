import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import { authErrorKey, resendWaitOf } from './authErrors';
import { AuthStepLayout } from './brand';
import { sendEmailCode } from './signIn';

/** Email sign-in, step 1: the address. A 6-digit code is emailed; there is no password. */
export function EmailScreen({ navigation }: NativeStackScreenProps<AuthStackParams, 'Email'>) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())) {
      setError(t('auth.errors.invalidEmail'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const email = await sendEmailCode(value);
      navigation.navigate('EmailCode', { email });
    } catch (e) {
      // a code was sent to this address a moment ago: it is still good, so go and enter it (the server keeps
      // addresses trimmed and in lower case, as here)
      const wait = resendWaitOf(e);
      if (wait)
        navigation.navigate('EmailCode', { email: value.trim().toLowerCase(), resendIn: wait });
      else setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthStepLayout
      icon="mail"
      title={t('auth.emailTitle')}
      subtitle={t('auth.emailHint')}
      onBack={() => navigation.goBack()}
    >
      <Input
        label={t('auth.emailLabel')}
        value={value}
        onChangeText={setValue}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
        error={error}
        autoFocus
        onSubmitEditing={() => void submit()}
        returnKeyType="send"
      />
      <Button title={t('auth.sendCode')} onPress={submit} loading={busy} />
    </AuthStepLayout>
  );
}
