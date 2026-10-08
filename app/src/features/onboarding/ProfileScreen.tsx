import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, FormInput, Screen, toast } from '../../components';
import { reportError } from '../../lib/analytics';
import { api, uploadImage } from '../../api/client';
import { refreshProfile } from '../auth/session';
import type { OnboardingStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';

const schema = z.object({
  tutorName: z.string().trim().min(2, 'required').max(80),
  instituteName: z.string().trim().min(2, 'required').max(120),
});
type Form = z.infer<typeof schema>;

export function ProfileScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Profile'>) {
  const { t, i18n } = useTranslation();
  const [logoUri, setLogoUri] = useState<string>();
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { tutorName: '', instituteName: '' },
  });

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!res.canceled) setLogoUri(res.assets[0].uri);
  };

  const submit = handleSubmit(async (values) => {
    try {
      await api('POST', '/institutes', {
        ...values,
        language: i18n.language === 'hi' ? 'hi' : 'en',
      });
      if (logoUri) {
        try {
          await uploadImage('/institute/logo', logoUri);
        } catch (e) {
          reportError(e); // the logo is optional; carry on without it
        }
      }
      await refreshProfile();
      navigation.navigate('Batch');
    } catch (e) {
      reportError(e);
      toast(t('onboarding.setupError'), 'error');
    }
  });

  return (
    <Screen>
      <Text style={[type.title, { marginVertical: spacing.lg }]}>
        {t('onboarding.profileTitle')}
      </Text>
      <FormInput
        control={control}
        name="tutorName"
        label={t('onboarding.tutorName')}
        autoComplete="name"
      />
      <FormInput control={control} name="instituteName" label={t('onboarding.instituteName')} />
      <Text style={type.label}>{t('onboarding.logo')}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginBottom: spacing.lg,
        }}
      >
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={{ width: 64, height: 64, borderRadius: 12 }} />
        ) : null}
        <Button
          variant="secondary"
          title={logoUri ? t('onboarding.changeLogo') : t('onboarding.addLogo')}
          onPress={pickLogo}
        />
      </View>
      <Button title={t('common.next')} onPress={submit} loading={formState.isSubmitting} />
    </Screen>
  );
}
