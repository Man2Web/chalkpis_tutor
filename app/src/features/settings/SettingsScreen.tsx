import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Card, Chip, Input, Screen, Skeleton, toast } from '../../components';
import { useInstitute, useRefreshData } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { open } from '../../lib/contact';
import { api, uploadImage } from '../../api/client';
import { setLanguage, type Lang } from '../../lib/language';
import { colors, spacing, type } from '../../theme';
import { logout, refreshProfile, useSession } from '../auth/session';
import { cleanUpi } from '../../lib/upi';
import { canDelete, cleanPrefix, DELETE_WORD } from './logic';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? '';

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { uid, profile } = useSession();
  const refresh = useRefreshData();
  const institute = useInstitute();

  const [name, setName] = useState<string>();
  const [instName, setInstName] = useState<string>();
  const [address, setAddress] = useState<string>();
  const [phone, setPhone] = useState<string>();
  const [prefix, setPrefix] = useState<string>();
  const [upi, setUpi] = useState<string>();
  const [upiError, setUpiError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState('');

  if (institute.isLoading || !institute.data || !uid)
    return (
      <Screen>
        <Skeleton height={160} />
      </Screen>
    );
  const inst = institute.data;
  const lang: Lang = i18n.language === 'hi' ? 'hi' : 'en';

  const nameV = name ?? profile?.name ?? '';
  const instV = instName ?? inst.name;
  const addrV = address ?? inst.address ?? '';
  const phoneV = phone ?? inst.phone ?? '';
  const prefixV = prefix ?? inst.receiptPrefix;
  const upiV = upi ?? inst.upiId ?? '';

  const save = async () => {
    setError(undefined);
    setUpiError(undefined);
    const clean = cleanPrefix(prefixV);
    const cleanUpiId = cleanUpi(upiV);
    if (nameV.trim().length < 2 || instV.trim().length < 2)
      return setError(t('validation.required'));
    if (!clean) return setError(t('settings.prefixInvalid'));
    if (cleanUpiId === null) return setUpiError(t('settings.upiInvalid'));
    setBusy(true);
    try {
      await api('PATCH', '/me', { name: nameV.trim() });
      await api('PATCH', '/institute', {
        name: instV.trim(),
        address: addrV.trim(),
        phone: phoneV.trim(),
        receiptPrefix: clean,
        upiId: cleanUpiId,
      });
      await refreshProfile();
      await refresh();
      setPrefix(clean);
      setUpi(cleanUpiId);
      toast(t('students.saved'), 'success');
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

  const pickLanguage = async (l: Lang) => {
    await setLanguage(l);
    try {
      await api('PATCH', '/me', { language: l });
    } catch (e) {
      reportError(e); // the screen language already changed; syncing the profile can fail quietly
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await api('DELETE', '/account', { confirm: true });
      try {
        await logout();
      } catch {
        // the account is already gone; the session ends on its own
      }
    } catch (e) {
      reportError(e);
      toast(t('settings.deleteFailed'), 'error');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={type.heading}>{t('settings.profile')}</Text>
      <Input label={t('onboarding.tutorName')} value={nameV} onChangeText={setName} />
      <Input label={t('auth.phoneLabel')} value={profile?.phone ?? ''} editable={false} />

      <Text style={[type.heading, { marginTop: spacing.md }]}>{t('settings.institute')}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginBottom: spacing.md,
        }}
      >
        {inst.logoUrl ? (
          <Image
            source={{ uri: inst.logoUrl }}
            style={{ width: 56, height: 56, borderRadius: 12 }}
          />
        ) : null}
        <Button
          variant="secondary"
          title={inst.logoUrl ? t('onboarding.changeLogo') : t('onboarding.addLogo')}
          onPress={changeLogo}
        />
      </View>
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
      />
      <Text style={[type.caption, { marginBottom: spacing.md }]}>{t('settings.prefixHint')}</Text>
      <Input
        label={t('settings.upiId')}
        value={upiV}
        onChangeText={setUpi}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        maxLength={80}
        error={upiError}
      />
      <Text style={[type.caption, { marginBottom: spacing.md }]}>{t('settings.upiHint')}</Text>
      <Button title={t('common.save')} onPress={save} loading={busy} />

      <Text style={[type.heading, { marginTop: spacing.lg }]}>{t('settings.language')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <Chip label="English" selected={lang === 'en'} onPress={() => pickLanguage('en')} />
        <Chip label="हिन्दी" selected={lang === 'hi'} onPress={() => pickLanguage('hi')} />
      </View>

      {PRIVACY_URL ? (
        <Button
          variant="ghost"
          title={t('settings.privacy')}
          onPress={() => void open(PRIVACY_URL)}
        />
      ) : null}
      <Button variant="secondary" title={t('more.logout')} onPress={() => void logout()} />

      <Card style={{ marginTop: spacing.xl, borderColor: colors.danger, gap: spacing.sm }}>
        <Text style={[type.heading, { color: colors.danger }]}>{t('settings.deleteTitle')}</Text>
        <Text style={type.caption}>{t('settings.deleteWarning')}</Text>
        <Button
          variant="danger"
          title={t('settings.deleteButton')}
          onPress={() => {
            setTyped('');
            setDel(true);
          }}
        />
      </Card>

      <BottomSheet
        visible={del}
        onClose={() => setDel(false)}
        title={t('settings.deleteConfirmTitle')}
      >
        <Text style={[type.body, { marginBottom: spacing.md }]}>
          {t('settings.deleteConfirmHelp', { word: DELETE_WORD })}
        </Text>
        <Input
          label={t('settings.typeToConfirm', { word: DELETE_WORD })}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <View style={{ gap: spacing.sm }}>
          <Button
            variant="danger"
            title={t('settings.deleteForever')}
            onPress={deleteAccount}
            disabled={!canDelete(typed)}
            loading={busy}
          />
          <Button
            variant="ghost"
            title={t('common.cancel')}
            onPress={() => setDel(false)}
            disabled={busy}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
