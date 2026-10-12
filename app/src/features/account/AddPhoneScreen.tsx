import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OtpInput } from 'panelui-native/components/otp-input';
import { Button, Input, toast } from '../../components';
import { reportError } from '../../lib/analytics';
import { formatIndianPhone, normalizeIndianPhone } from '../../lib/phone';
import type { MainStackParams } from '../../navigation/types';
import { authErrorKey, resendWaitOf } from '../auth/authErrors';
import { AuthStepLayout, WhatsAppPreview } from '../auth/brand';
import { DevCodeHint } from '../auth/DevCodeHint';
import { refreshProfile } from '../auth/session';
import { devPhoneCodeFor, requestPhoneCode, verifyPhoneCode } from './addPhone';

/**
 * Adds a mobile number to an older account that has none: the number, then the WhatsApp code. Once it is on the
 * account the person can sign in with WhatsApp again, and parents and helpers can reach them.
 */
export function AddPhoneScreen({
  navigation,
}: NativeStackScreenProps<MainStackParams, 'AddPhone'>) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  // set once a code is on its way: step 2
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // the last cell (auto-submit) and the Verify button can land in the same frame; one check per code
  const inFlight = useRef(false);
  // six 44 dp cells do not fit beside the sheet padding on the narrowest phones
  const small = useWindowDimensions().width < 360;

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  /** The words for a failed call; "unavailable" and "generic" read as adding a number, not signing in. */
  const message = (e: unknown) => {
    const key = authErrorKey(e);
    if (key === 'generic') reportError(e);
    if (key === 'unavailable') return t('addPhone.unavailable');
    if (key === 'generic') return t('addPhone.failed');
    return t(`auth.errors.${key}`);
  };

  /** The account got a number elsewhere in the meantime (another phone): show it and leave. */
  const alreadySet = () => {
    toast(t('auth.errors.phoneAlreadySet'), 'error');
    void refreshProfile().catch(() => undefined);
    navigation.goBack();
  };

  const send = async () => {
    if (busy) return;
    const normal = normalizeIndianPhone(value);
    if (!normal) {
      setError(t('validation.phone'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const r = await requestPhoneCode(value);
      setCode('');
      setSeconds(r.resendIn);
      setPhone(r.phone);
    } catch (e) {
      // a code went to this number a moment ago (back, then Send again): it is still good, so go and enter it
      const wait = resendWaitOf(e);
      if (wait) {
        setSeconds(wait);
        setPhone(normal);
      } else if (authErrorKey(e) === 'phoneAlreadySet') alreadySet();
      else setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (v = code) => {
    if (!phone || inFlight.current) return;
    if (v.trim().length !== 6) {
      setError(t('auth.errors.invalidCode'));
      return;
    }
    inFlight.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await verifyPhoneCode(phone, v);
      toast(t('addPhone.added'), 'success');
      navigation.goBack();
    } catch (e) {
      setBusy(false);
      if (authErrorKey(e) === 'phoneAlreadySet') alreadySet();
      else setError(message(e));
    } finally {
      inFlight.current = false;
    }
  };

  const resend = async () => {
    if (!phone || resending) return;
    setError(undefined);
    setResending(true);
    try {
      const r = await requestPhoneCode(phone);
      setSeconds(r.resendIn);
    } catch (e) {
      const wait = resendWaitOf(e);
      if (wait) setSeconds(wait);
      else setError(message(e));
    } finally {
      setResending(false);
    }
  };

  const back = () => {
    if (!phone) return navigation.goBack();
    // back to the number, to fix a typo
    setPhone(null);
    setCode('');
    setError(undefined);
  };

  if (!phone)
    return (
      <AuthStepLayout
        icon="logo-whatsapp"
        iconColor="#1DA851"
        title={t('addPhone.title')}
        subtitle={t('addPhone.hint')}
        step={[1, 2]}
        onBack={back}
      >
        <Input
          label={t('auth.phoneLabel')}
          value={value}
          onChangeText={(v) => {
            setError(undefined);
            setValue(v);
          }}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={16}
          placeholder="98765 43210"
          prefix="+91"
          error={error}
          autoFocus
          returnKeyType="send"
          onSubmitEditing={() => void send()}
        />
        <Button title={t('auth.sendCode')} onPress={() => void send()} loading={busy} />
      </AuthStepLayout>
    );

  return (
    <AuthStepLayout
      icon="chatbubble-ellipses"
      title={t('auth.otpTitle')}
      subtitle={t('auth.otpSentTo', { phone: formatIndianPhone(phone) })}
      step={[2, 2]}
      onBack={back}
    >
      <WhatsAppPreview />
      <DevCodeHint phone={phone} code={devPhoneCodeFor(phone)} onUse={setCode} />
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
      <Button variant="ghost" title={t('auth.changeNumber')} onPress={back} />
    </AuthStepLayout>
  );
}
