import { useMemo, useState } from 'react';
import { FlatList, Platform, Share, Text, View } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  Screen,
  toast,
  UpgradePrompt,
} from '../../components';
import {
  useBatches,
  useInstituteId,
  useLimits,
  useRefreshData,
  useStudents,
} from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { readText } from '../../lib/files';
import { parseCsv, toCsv } from '../../lib/csv';
import { normalizeIndianPhone } from '../../lib/phone';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { bulkCreateStudents } from './api';
import { isImportable, mapImportRows, type ImportRow } from './importRows';
import { remainingCapacity } from './logic';

interface Contact {
  id: string;
  name: string;
  phone: string;
}

export function ImportScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'StudentImport'>) {
  const { t } = useTranslation();
  const { mode } = route.params;
  const instituteId = useInstituteId();
  const batches = useBatches();
  const students = useStudents();
  const limits = useLimits();
  const refresh = useRefreshData();

  const activeBatches = (batches.data ?? []).filter((b) => b.status === 'active');
  const [defaultBatchId, setDefaultBatchId] = useState<string>();
  const [rows, setRows] = useState<ImportRow[]>();
  const [contacts, setContacts] = useState<Contact[]>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState(false);

  const ctx = () => ({
    batches: (batches.data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      defaultFee: b.defaultFee,
    })),
    defaultBatchId,
    existing: (students.data ?? []).map((s) => ({ name: s.name, parentPhone: s.parentPhone })),
  });

  const pickCsv = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const text = await readText(res.assets[0].uri);
      const parsed = mapImportRows(parseCsv(text), ctx());
      if (!parsed.length) toast(t('import.emptyFile'), 'error');
      else setRows(parsed);
    } catch (e) {
      reportError(e);
      toast(t('import.readFailed'), 'error');
    }
  };

  const loadContacts = async () => {
    if (Platform.OS === 'web') {
      toast(t('import.contactsWeb'), 'error');
      return;
    }
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        toast(t('import.noPermission'), 'error');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const list: Contact[] = [];
      for (const c of data) {
        const phone = c.phoneNumbers
          ?.map((p) => normalizeIndianPhone(p.number ?? ''))
          .find(Boolean);
        if (c.name && phone && c.id) list.push({ id: c.id, name: c.name, phone });
      }
      setContacts(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      reportError(e);
      toast(t('import.readFailed'), 'error');
    }
  };

  const shown = useMemo(
    () =>
      (contacts ?? []).filter(
        (c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()),
      ),
    [contacts, filter],
  );

  const previewContacts = () => {
    const chosen = (contacts ?? []).filter((c) => picked.has(c.id));
    const table = [['name', 'parent phone'], ...chosen.map((c) => [c.name, c.phone])];
    setRows(mapImportRows(table, ctx()));
  };

  const ok = (rows ?? []).filter(isImportable);
  const bad = (rows ?? []).filter((r) => !isImportable(r));

  const shareErrors = () =>
    Share.share({
      message: toCsv([
        ['line', 'name', 'parent phone', 'problems'],
        ...bad.map((r) => [
          r.line,
          r.name,
          r.parentPhone,
          r.errors.map((e) => t(`import.errors.${e}`)).join('; '),
        ]),
      ]),
    });

  const run = async () => {
    const room = remainingCapacity(limits.data?.activeStudentCount ?? 0, limits.data?.studentLimit);
    if (limits.data && !limits.data.active) return setUpgrade(true);
    if (ok.length > room) {
      toast(t('import.overLimit', { room }), 'error');
      return setUpgrade(true);
    }
    setBusy(true);
    try {
      const n = await bulkCreateStudents(
        instituteId,
        ok.map((r) => ({
          name: r.name,
          phone: r.phone,
          parentName: r.parentName,
          parentPhone: r.parentPhone,
          className: r.className,
          monthlyFeePaise: r.monthlyFeePaise ?? 0,
          feeCycle: r.feeCycle,
          dueDay: r.dueDay,
          batchIds: r.batchIds,
        })),
      );
      await refresh();
      toast(t('import.done', { count: n }), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  };

  const batchPicker = (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <Text style={type.label}>{t('import.defaultBatch')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {activeBatches.map((b) => (
          <Chip
            key={b.id}
            label={b.name}
            selected={defaultBatchId === b.id}
            onPress={() => setDefaultBatchId(defaultBatchId === b.id ? undefined : b.id)}
          />
        ))}
      </View>
    </View>
  );

  // Step 3: preview and error report
  if (rows) {
    return (
      <Screen scroll={false}>
        <View style={{ padding: spacing.lg, gap: spacing.sm, flex: 1 }}>
          <Text style={type.title}>{t('import.previewTitle')}</Text>
          <Text style={type.body}>{t('import.summary', { ok: ok.length, bad: bad.length })}</Text>
          <FlatList
            data={[...bad, ...ok]}
            keyExtractor={(r) => String(r.line)}
            renderItem={({ item }) => (
              <Card
                style={{
                  marginBottom: spacing.sm,
                  borderColor: isImportable(item) ? colors.border : colors.danger,
                }}
              >
                <Text style={type.label}>{item.name || t('import.noName')}</Text>
                <Text style={type.caption}>{item.parentPhone}</Text>
                {item.errors.map((e) => (
                  <Text key={e} style={[type.caption, { color: colors.danger }]}>
                    {t(`import.errors.${e}`)}
                  </Text>
                ))}
              </Card>
            )}
          />
          {bad.length > 0 ? (
            <Button variant="secondary" title={t('import.shareErrors')} onPress={shareErrors} />
          ) : null}
          <Button
            title={t('import.importN', { count: ok.length })}
            onPress={run}
            loading={busy}
            disabled={ok.length === 0}
          />
          <Button
            variant="ghost"
            title={t('common.back')}
            onPress={() => setRows(undefined)}
            disabled={busy}
          />
        </View>
        <UpgradePrompt
          visible={upgrade}
          kind={limits.data && !limits.data.active ? 'expired' : 'student'}
          limit={limits.data?.studentLimit}
          onClose={() => setUpgrade(false)}
        />
      </Screen>
    );
  }

  if (mode === 'csv') {
    return (
      <Screen>
        <Text style={type.title}>{t('import.csvTitle')}</Text>
        <Text style={[type.caption, { marginBottom: spacing.md }]}>{t('import.csvHelp')}</Text>
        {batchPicker}
        <Button title={t('import.chooseFile')} onPress={pickCsv} />
      </Screen>
    );
  }

  // contacts mode
  if (!contacts) {
    return (
      <Screen>
        <Text style={type.title}>{t('import.contactsTitle')}</Text>
        <Text style={[type.caption, { marginBottom: spacing.md }]}>{t('import.contactsHelp')}</Text>
        {batchPicker}
        <Button title={t('import.allowContacts')} onPress={loadContacts} />
      </Screen>
    );
  }
  return (
    <Screen scroll={false}>
      <View style={{ padding: spacing.lg, gap: spacing.sm, flex: 1 }}>
        <Input label={t('students.search')} value={filter} onChangeText={setFilter} />
        <Text style={type.caption}>{t('import.selected', { count: picked.size })}</Text>
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={<EmptyState icon="people-outline" title={t('import.noContacts')} />}
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing.xs }}>
              <Chip
                label={`${item.name} • ${item.phone.slice(3)}`}
                selected={picked.has(item.id)}
                onPress={() =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (n.has(item.id)) n.delete(item.id);
                    else n.add(item.id);
                    return n;
                  })
                }
              />
            </View>
          )}
        />
        <Button
          title={t('import.preview')}
          onPress={previewContacts}
          disabled={picked.size === 0}
        />
      </View>
    </Screen>
  );
}
