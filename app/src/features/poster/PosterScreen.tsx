import { useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import type Svg from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chip, Input, Screen, toast } from '../../components';
import { useInstitute } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { colors, MAX_CONTENT, spacing, type } from '../../theme';
import { exportPoster } from './exportPoster';
import { SIZES, type PosterKind, type PosterSize } from './layout';
import { Poster, type PosterData, type Topper } from './Poster';

const KINDS: PosterKind[] = ['toppers', 'admission', 'festival'];

/** Square photo as a data URI, so it stays inside the exported picture. */
async function pickPhoto(): Promise<string | undefined> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  });
  if (res.canceled || !res.assets[0]?.base64) return undefined;
  return `data:${res.assets[0].mimeType ?? 'image/jpeg'};base64,${res.assets[0].base64}`;
}

/** Posters for WhatsApp status and Instagram: toppers, admissions, festival greetings. Free, made on the phone. */
export function PosterScreen() {
  const { t } = useTranslation();
  const inst = useInstitute();
  const { width } = useWindowDimensions();
  const ref = useRef<Svg>(null);
  const [kind, setKind] = useState<PosterKind>('toppers');
  const [size, setSize] = useState<PosterSize>('square');
  const [headline, setHeadline] = useState<string>();
  const [subline, setSubline] = useState<string>();
  const [toppers, setToppers] = useState<Topper[]>([{ name: '', detail: '' }]);
  const [centre, setCentre] = useState<string>();
  const [address, setAddress] = useState<string>();
  const [phone, setPhone] = useState<string>();
  const [logo, setLogo] = useState<string>();
  const [busy, setBusy] = useState(false);

  const data: PosterData = {
    kind,
    size,
    headline: headline ?? t(`poster.defaults.${kind}.headline`),
    subline: subline ?? t(`poster.defaults.${kind}.subline`),
    toppers,
    centre: centre ?? inst.data?.name ?? '',
    address: address ?? inst.data?.address ?? '',
    phone: phone ?? inst.data?.phone ?? '',
    logo,
  };
  const previewW = Math.min(width, MAX_CONTENT) - spacing.lg * 2;

  const setTopper = (i: number, patch: Partial<Topper>) =>
    setToppers((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const download = async () => {
    setBusy(true);
    try {
      await exportPoster(ref.current, SIZES[size], `poster-${kind}-${size}`);
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={[type.caption, { marginBottom: spacing.sm }]}>{t('poster.hint')}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {KINDS.map((k) => (
          <Chip
            key={k}
            label={t(`poster.kinds.${k}`)}
            selected={kind === k}
            onPress={() => {
              setKind(k);
              setHeadline(undefined);
              setSubline(undefined);
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        {(['square', 'status'] as const).map((s) => (
          <Chip
            key={s}
            small
            label={t(`poster.sizes.${s}`)}
            selected={size === s}
            onPress={() => setSize(s)}
          />
        ))}
      </View>

      <View nativeID="poster-canvas" style={{ alignItems: 'center', marginBottom: spacing.md }}>
        <Poster ref={ref} data={data} width={size === 'status' ? previewW * 0.75 : previewW} />
      </View>

      <Button title={t('poster.download')} onPress={download} loading={busy} />

      <Input
        label={t('poster.headline')}
        value={data.headline}
        onChangeText={setHeadline}
        maxLength={40}
      />
      <Input
        label={t('poster.subline')}
        value={data.subline}
        onChangeText={setSubline}
        maxLength={70}
      />

      {kind === 'toppers' ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={type.heading}>{t('poster.students')}</Text>
          {toppers.map((tp, i) => (
            <View key={i} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Pressable
                  onPress={async () => {
                    const p = await pickPhoto();
                    if (p) setTopper(i, { photo: p });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('poster.addPhoto')}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: tp.photo ? colors.successSoft : colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={tp.photo ? 'checkmark' : 'camera-outline'}
                    size={22}
                    color={tp.photo ? colors.success : colors.primary}
                  />
                </Pressable>
                <Text style={[type.label, { flex: 1 }]}>{t('poster.studentN', { n: i + 1 })}</Text>
                {toppers.length > 1 ? (
                  <Chip
                    small
                    tone="danger"
                    label={t('poster.remove')}
                    onPress={() => setToppers((l) => l.filter((_, j) => j !== i))}
                  />
                ) : null}
              </View>
              <Input
                label={t('poster.studentName')}
                value={tp.name}
                onChangeText={(v) => setTopper(i, { name: v })}
                maxLength={30}
              />
              <Input
                label={t('poster.studentDetail')}
                value={tp.detail}
                onChangeText={(v) => setTopper(i, { detail: v })}
                placeholder={t('poster.studentDetailHint')}
                maxLength={30}
              />
            </View>
          ))}
          {toppers.length < 6 ? (
            <Button
              variant="secondary"
              title={t('poster.addStudent')}
              onPress={() => setToppers((l) => [...l, { name: '', detail: '' }])}
            />
          ) : null}
        </Card>
      ) : null}

      <Input
        label={t('poster.centre')}
        value={data.centre}
        onChangeText={setCentre}
        maxLength={40}
      />
      <Input
        label={t('settings.address')}
        value={data.address}
        onChangeText={setAddress}
        maxLength={60}
      />
      <Input
        label={t('poster.phone')}
        value={data.phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={20}
      />
      <Button
        variant="secondary"
        title={logo ? t('poster.changeLogo') : t('poster.addLogo')}
        onPress={async () => setLogo((await pickPhoto()) ?? logo)}
      />
      <Button title={t('poster.download')} onPress={download} loading={busy} />
    </Screen>
  );
}
