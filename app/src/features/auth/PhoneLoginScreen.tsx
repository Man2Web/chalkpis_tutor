import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { normalizeIndianPhone } from '../../lib/phone';
import type { AuthStackParams } from '../../navigation/types';
import { resendWaitOf } from './authErrors';
import { authErrorKey, sendCode } from './phoneAuth';
import { PhoneField, PrimaryButton, SignInLayout, Subtle, WhatsAppNote } from './signin';

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
    <SignInLayout
      title={t('auth.phoneTitle')}
      subtitle={<Subtle>{t('auth.phoneHint')}</Subtle>}
      onBack={() => navigation.goBack()}
      footer={<PrimaryButton title={t('auth.sendCode')} onPress={submit} loading={busy} />}
    >
      <PhoneField
        label={t('auth.phoneLabel')}
        value={value}
        onChangeText={(v) => {
          setError(undefined);
          setValue(v);
        }}
        error={error}
        autoFocus
        onSubmit={() => void submit()}
      />
      <WhatsAppNote text={t('auth.otpCheckWhatsApp')} />
    </SignInLayout>
  );
}
