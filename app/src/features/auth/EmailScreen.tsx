import { useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Screen } from '../../components';
import type { AuthStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { authErrorKey } from './authErrors';
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
            backgroundColor: colors.shell,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="mail-outline" size={30} color={colors.text} />
        </View>
        <Text style={[type.title1, { textAlign: 'center' }]}>{t('auth.emailTitle')}</Text>
        <Text style={[type.callout, { textAlign: 'center', color: colors.textMuted }]}>
          {t('auth.emailHint')}
        </Text>
      </View>
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
    </Screen>
  );
}
