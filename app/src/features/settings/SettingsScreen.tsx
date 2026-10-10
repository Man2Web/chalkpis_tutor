import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { api, uploadImage } from '../../api/client';
import { Avatar, Button, Input, Screen, Section, Skeleton, toast } from '../../components';
import { useInstitute, useRefreshData } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { cleanUpi, upiLink } from '../../lib/upi';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { refreshProfile, useSession } from '../auth/session';
import { UpiQr } from '../../components/UpiQr';
import { cleanPrefix } from './logic';

const Loading = () => (
  <Screen>
    <Skeleton height={160} />
  </Screen>
);

/** Institute details shown on receipts: logo, name, address, phone, receipt prefix. */
export function SettingsScreen({
  navigation,
}: Partial<NativeStackScreenProps<MainStackParams, 'Settings'>>) {
  const { t } = useTranslation();
  const refresh = useRefreshData();
  const institute = useInstitute();
  const [instName, setInstName] = useState<string>();
  const [address, setAddress] = useState<string>();
  const [phone, setPhone] = useState<string>();
  const [prefix, setPrefix] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (institute.isLoading || !institute.data) return <Loading />;
  const inst = institute.data;
  const instV = instName ?? inst.name;
  const addrV = address ?? inst.address ?? '';
  const phoneV = phone ?? inst.phone ?? '';
  const prefixV = prefix ?? inst.receiptPrefix;

  const save = async () => {
    setError(undefined);
    const clean = cleanPrefix(prefixV);
    if (instV.trim().length < 2) return setError(t('validation.required'));
    if (!clean) return setError(t('settings.prefixInvalid'));
    setBusy(true);
    try {
      await api('PATCH', '/institute', {
        name: instV.trim(),
        address: addrV.trim(),
        phone: phoneV.trim(),
        receiptPrefix: clean,
      });
      await refresh();
      setPrefix(clean);
      toast(t('students.saved'), 'success');
      navigation?.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (res.canceled) return;
    try {
      await uploadImage('/institute/logo', res.assets[0].uri);
      await refresh();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      <Pressable
        onPress={changeLogo}
        accessibilityRole="button"
        accessibilityLabel={inst.logoUrl ? t('onboarding.changeLogo') : t('onboarding.addLogo')}
        style={{ alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md }}
      >
        {inst.logoUrl ? (
          <Image
            source={{ uri: inst.logoUrl }}
            style={{ width: 88, height: 88, borderRadius: 20 }}
          />
        ) : (
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              backgroundColor: colors.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="image-outline" size={34} color={colors.gray} />
          </View>
        )}
        <Text style={[type.subhead, { color: colors.primaryDark, fontWeight: '600' }]}>
          {inst.logoUrl ? t('onboarding.changeLogo') : t('onboarding.addLogo')}
        </Text>
      </Pressable>
      <Input label={t('onboarding.instituteName')} value={instV} onChangeText={setInstName} />
      <Input label={t('settings.address')} value={addrV} onChangeText={setAddress} multiline />
      <Input
        label={t('settings.institutePhone')}
        value={phoneV}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={20}
      />
      <Input
        label={t('settings.receiptPrefix')}
        value={prefixV}
        onChangeText={(v) => setPrefix(v.toUpperCase())}
        autoCapitalize="characters"
        maxLength={6}
        error={error}
        hint={t('settings.prefixHint')}
      />
      <Button title={t('common.save')} onPress={save} loading={busy} />
    </Screen>
  );
}

/** The tutor's own name (shown in the app) and the phone they sign in with. */
export function EditProfileScreen({
  navigation,
}: NativeStackScreenProps<MainStackParams, 'EditProfile'>) {
  const { t } = useTranslation();
  const { profile } = useSession();
  const [name, setName] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameV = name ?? profile?.name ?? '';

  const save = async () => {
    if (nameV.trim().length < 2) return setError(t('validation.required'));
    setBusy(true);
    try {
      await api('PATCH', '/me', { name: nameV.trim() });
      await refreshProfile();
      toast(t('students.saved'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
        <Avatar name={nameV || '?'} size={88} />
      </View>
      <Input
        label={t('onboarding.tutorName')}
        value={nameV}
        onChangeText={setName}
        error={error}
        autoComplete="name"
      />
      <Input
        label={t('auth.phoneLabel')}
        value={profile?.phone ?? ''}
        editable={false}
        hint={t('settings.phoneHint')}
      />
      <Button title={t('common.save')} onPress={save} loading={busy} />
    </Screen>
  );
}

/** Where parents pay: the tutor's UPI id (shown as a QR in reminders) or their own payment link. */
export function PaymentSettingsScreen({
  navigation,
}: NativeStackScreenProps<MainStackParams, 'PaymentSettings'>) {
  const { t } = useTranslation();
  const refresh = useRefreshData();
  const institute = useInstitute();
  const [upi, setUpi] = useState<string>();
  const [link, setLink] = useState<string>();
  const [upiError, setUpiError] = useState<string>();
  const [linkError, setLinkError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (institute.isLoading || !institute.data) return <Loading />;
  const inst = institute.data;
  const upiV = upi ?? inst.upiId ?? '';
  const linkV = link ?? inst.paymentLink ?? '';
  const preview = cleanUpi(upiV);

  const save = async () => {
    setUpiError(undefined);
    setLinkError(undefined);
    const cleanUpiId = cleanUpi(upiV);
    if (cleanUpiId === null) return setUpiError(t('settings.upiInvalid'));
    const cleanLink = linkV.trim();
    if (cleanLink && !/^https:\/\/[^\s<>"]+$/i.test(cleanLink))
      return setLinkError(t('settings.linkInvalid'));
    setBusy(true);
    try {
      await api('PATCH', '/institute', { upiId: cleanUpiId, paymentLink: cleanLink });
      await refresh();
      toast(t('students.saved'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Input
        label={t('settings.upiId')}
        value={upiV}
        onChangeText={setUpi}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        maxLength={80}
        placeholder="name@okhdfcbank"
        error={upiError}
        hint={t('settings.upiHint')}
      />
      {preview ? (
        <Section title={t('settings.qrPreview')} footer={t('settings.qrPreviewHint')}>
          <View style={{ alignItems: 'center', padding: spacing.lg, gap: spacing.sm }}>
            <UpiQr value={upiLink({ upiId: preview, payeeName: inst.name })} size={180} />
            <Text style={type.footnote}>{preview}</Text>
          </View>
        </Section>
      ) : null}
      <Input
        label={t('settings.paymentLink')}
        value={linkV}
        onChangeText={setLink}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={300}
        placeholder="https://"
        error={linkError}
        hint={t('settings.paymentLinkHint')}
      />
      <Button title={t('common.save')} onPress={save} loading={busy} />
    </Screen>
  );
}
