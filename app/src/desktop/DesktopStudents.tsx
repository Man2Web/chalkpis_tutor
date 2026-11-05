import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Table, type TableSortDirection } from 'panelui-native/components/table';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  SearchField,
  Segmented,
  Skeleton,
  UpgradePrompt,
} from '../components';
import { useAddGuard } from '../data/guards';
import { useBatches, usePendingStudentIds, useStudents } from '../data/hooks';
import { useCategory } from '../lib/category';
import { formatINR } from '../lib/money';
import { formatIndianPhone } from '../lib/phone';
import type { Student } from '../lib/types';
import type { MainStackParams } from '../navigation/types';
import { colors, font, spacing, type } from '../theme';
import { distinctClasses, filterStudents } from '../features/students/logic';
import { card, DesktopPage, Dropdown } from './parts';

type SortKey = 'name' | 'class' | 'fee';
/** Rows drawn at first; a long list shows the rest on request so the page stays quick. */
const PAGE = 100;

const compare: Record<SortKey, (a: Student, b: Student) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  class: (a, b) => a.class.localeCompare(b.class, undefined, { numeric: true }),
  fee: (a, b) => a.monthlyFee - b.monthlyFee,
};

/** Students on a laptop or desktop: filters in one toolbar and everyone in a sortable table. */
export function DesktopStudents() {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const students = useStudents();
  const batches = useBatches();
  const pending = usePendingStudentIds();
  const guard = useAddGuard();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'active' | 'inactive'>('active');
  const [batchId, setBatchId] = useState('');
  const [className, setClassName] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: TableSortDirection }>({
    key: 'name',
    dir: 'asc',
  });
  const [shown, setShown] = useState(PAGE);

  const inTab = useMemo(
    () => (students.data ?? []).filter((s) => s.status === tab),
    [students.data, tab],
  );
  const list = useMemo(() => {
    const f = filterStudents(
      inTab,
      { search, batchId: batchId || undefined, className: className || undefined, pendingOnly },
      pending.data,
    );
    const by = compare[sort.key];
    return f.sort((a, b) => (sort.dir === 'asc' ? by(a, b) : by(b, a)));
  }, [inTab, search, batchId, className, pendingOnly, pending.data, sort]);
  const classes = useMemo(() => distinctClasses(inTab), [inTab]);
  const activeBatches = (batches.data ?? []).filter((b) => b.status === 'active');
  const batchName = (id: string) => batches.data?.find((b) => b.id === id)?.name;

  const add = () => {
    if (guard.check('student')) nav.navigate('StudentForm');
  };
  const sortBy = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const head = (key: SortKey) => ({
    sortable: true,
    sortDirection: sort.key === key ? sort.dir : undefined,
    onPress: () => sortBy(key),
  });

  return (
    <DesktopPage
      title={t('tabs.students')}
      subtitle={t('desktop.students.subtitle', { count: inTab.length })}
      actions={
        <>
          <Button
            size="small"
            variant="outline"
            title={t('desktop.students.import')}
            icon={<Ionicons name="cloud-upload-outline" size={16} color={colors.text} />}
            onPress={() => nav.navigate('StudentImport', { mode: 'csv' })}
          />
          <Button
            size="small"
            title={t('desktop.addStudent')}
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={add}
          />
        </>
      }
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: spacing.md,
          zIndex: 5,
        }}
      >
        <View style={{ flex: 1, minWidth: 260, maxWidth: 380 }}>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder={t('students.searchHint')}
          />
        </View>
        <View style={{ width: 220 }}>
          <Segmented
            options={[
              { value: 'active', label: t('students.active') },
              { value: 'inactive', label: t('students.inactive') },
            ]}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setShown(PAGE);
            }}
          />
        </View>
        <Dropdown
          label={t('desktop.col.batches')}
          value={batchId}
          onChange={setBatchId}
          options={[
            { value: '', label: t('desktop.students.allBatches') },
            ...activeBatches.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        {classes.length ? (
          <Dropdown
            label={ct('level')}
            value={className}
            onChange={setClassName}
            width={160}
            options={[
              { value: '', label: t('desktop.students.allLevels', { level: ct('level') }) },
              ...classes.map((c) => ({ value: c, label: ct('levelValue', { n: c }) })),
            ]}
          />
        ) : null}
        <Chip
          label={t('students.feesPending')}
          selected={pendingOnly}
          onPress={() => setPendingOnly((v) => !v)}
          tone="warning"
        />
      </View>

      {students.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void students.refetch()}
        />
      ) : students.isLoading ? (
        <Skeleton height={320} />
      ) : inTab.length === 0 && tab === 'active' ? (
        <View style={[card, { padding: spacing.xl }]}>
          <EmptyState
            icon="people-outline"
            title={t('students.emptyTitle')}
            message={t('students.emptyMessage')}
            actionLabel={t('desktop.addStudent')}
            onAction={add}
          />
        </View>
      ) : (
        <View style={[card, { overflow: 'hidden' }]}>
          <Table
            columns={[
              { flex: 2.4 },
              { flex: 1 },
              { flex: 2 },
              { flex: 1.8 },
              { flex: 1.1, align: 'end' },
              { flex: 1.1 },
              { width: 24 },
            ]}
          >
            <Table.Header>
              <Table.Row>
                <Table.Head {...head('name')}>{t('desktop.col.student')}</Table.Head>
                <Table.Head {...head('class')}>{ct('level')}</Table.Head>
                <Table.Head>{t('desktop.col.batches')}</Table.Head>
                <Table.Head>{t('desktop.col.parent')}</Table.Head>
                <Table.Head {...head('fee')}>{t('desktop.col.fee')}</Table.Head>
                <Table.Head>{t('desktop.col.fees')}</Table.Head>
                <Table.Head> </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {list.slice(0, shown).map((s) => (
                <Table.Row key={s.id} onPress={() => nav.navigate('StudentProfile', { id: s.id })}>
                  <Table.Cell>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <Avatar name={s.name} uri={s.photoUrl} size={34} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[type.subhead, font('600')]} numberOfLines={1}>
                          {s.name}
                        </Text>
                        {s.phone ? (
                          <Text style={type.caption2} numberOfLines={1}>
                            {formatIndianPhone(s.phone)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </Table.Cell>
                  <Table.Cell>{s.class ? ct('levelValue', { n: s.class }) : '—'}</Table.Cell>
                  <Table.Cell>
                    {s.batchIds.map(batchName).filter(Boolean).join(', ') || '—'}
                  </Table.Cell>
                  <Table.Cell>
                    <View style={{ minWidth: 0 }}>
                      <Text style={type.subhead} numberOfLines={1}>
                        {s.parentName || '—'}
                      </Text>
                      {s.parentPhone ? (
                        <Text style={type.caption2} numberOfLines={1}>
                          {formatIndianPhone(s.parentPhone)}
                        </Text>
                      ) : null}
                    </View>
                  </Table.Cell>
                  <Table.Cell>{s.monthlyFee ? formatINR(s.monthlyFee) : '—'}</Table.Cell>
                  <Table.Cell>
                    {/* nobody is "Paid up" until the fees are known: a dash while they load or if they failed */}
                    {!pending.data ? (
                      <Text style={[type.subhead, { color: colors.textFaint }]}>—</Text>
                    ) : pending.data.has(s.id) ? (
                      <Chip small tone="warning" label={t('desktop.students.pending')} />
                    ) : (
                      <Chip small tone="success" label={t('desktop.students.paidUp')} />
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          {list.length === 0 ? (
            <Text style={[type.subhead, { color: colors.textMuted, padding: spacing.xl }]}>
              {t('students.noMatch')}
            </Text>
          ) : null}
          {list.length > shown ? (
            <View style={{ padding: spacing.md, alignItems: 'center' }}>
              <Button
                size="small"
                variant="ghost"
                title={t('desktop.showAll', { count: list.length })}
                onPress={() => setShown(list.length)}
              />
            </View>
          ) : null}
        </View>
      )}
      <UpgradePrompt
        visible={!!guard.blocked}
        kind={guard.blocked?.kind ?? 'student'}
        limit={guard.blocked?.limit}
        onClose={guard.close}
      />
    </DesktopPage>
  );
}
