import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import {
  InsetSeparator,
  listCard,
  SearchField,
  Avatar,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ListItem,
  Screen,
  Skeleton,
  UpgradePrompt,
} from '../../components';
import { useAddGuard } from '../../data/guards';
import { useBatches, usePendingStudentIds, useStudents } from '../../data/hooks';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { distinctClasses, filterStudents } from './logic';

export function StudentsListScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const students = useStudents();
  const batches = useBatches();
  const pending = usePendingStudentIds();
  const guard = useAddGuard();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'active' | 'inactive'>('active');
  const [batchId, setBatchId] = useState<string>();
  const [className, setClassName] = useState<string>();
  const [pendingOnly, setPendingOnly] = useState(false);
  const [menu, setMenu] = useState(false);

  const inTab = useMemo(
    () => (students.data ?? []).filter((s) => s.status === tab),
    [students.data, tab],
  );
  const list = useMemo(
    () => filterStudents(inTab, { search, batchId, className, pendingOnly }, pending.data),
    [inTab, search, batchId, className, pendingOnly, pending.data],
  );
  const classes = useMemo(() => distinctClasses(inTab), [inTab]);
  const batchName = (id: string) => batches.data?.find((b) => b.id === id)?.name;

  const add = () => {
    if (guard.check('student')) nav.navigate('StudentForm');
  };

  if (students.isError) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void students.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={type.largeTitle}>{t('tabs.students')}</Text>
          <Button size="small" title={t('students.add')} onPress={() => setMenu(true)} />
        </View>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={t('students.searchHint')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          <Chip
            label={t('students.active')}
            selected={tab === 'active'}
            onPress={() => setTab('active')}
          />
          <Chip
            label={t('students.inactive')}
            selected={tab === 'inactive'}
            onPress={() => setTab('inactive')}
          />
          <Chip
            label={t('students.feesPending')}
            selected={pendingOnly}
            onPress={() => setPendingOnly((v) => !v)}
            tone="warning"
          />
          {(batches.data ?? [])
            .filter((b) => b.status === 'active')
            .map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                selected={batchId === b.id}
                onPress={() => setBatchId(batchId === b.id ? undefined : b.id)}
              />
            ))}
          {classes.map((c) => (
            <Chip
              key={c}
              label={t('students.classN', { n: c })}
              selected={className === c}
              onPress={() => setClassName(className === c ? undefined : c)}
            />
          ))}
        </ScrollView>
        <Text style={type.caption}>{t('students.count', { count: list.length })}</Text>
      </View>

      {students.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={listCard}
          data={list}
          keyExtractor={(s) => s.id}
          initialNumToRender={15}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={students.isRefetching}
              onRefresh={() => void students.refetch()}
            />
          }
          ItemSeparatorComponent={InsetSeparator}
          ListEmptyComponent={
            inTab.length === 0 && tab === 'active' ? (
              <EmptyState
                icon="people-outline"
                title={t('students.emptyTitle')}
                message={t('students.emptyMessage')}
                actionLabel={t('students.add')}
                onAction={add}
              />
            ) : (
              <EmptyState icon="search-outline" title={t('students.noMatch')} />
            )
          }
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={[
                item.class && t('students.classN', { n: item.class }),
                item.batchIds.map(batchName).filter(Boolean).join(', '),
              ]
                .filter(Boolean)
                .join(' • ')}
              left={<Avatar name={item.name} uri={item.photoUrl} />}
              below={
                pending.data?.has(item.id) ? (
                  <Chip label={t('students.feesPending')} tone="warning" small />
                ) : undefined
              }
              right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
              onPress={() => nav.navigate('StudentProfile', { id: item.id })}
            />
          )}
        />
      )}

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title={t('students.add')}>
        <View style={{ gap: spacing.sm }}>
          <Button
            title={t('students.addManually')}
            onPress={() => {
              setMenu(false);
              add();
            }}
          />
          <Button
            variant="secondary"
            title={t('import.fromFile')}
            onPress={() => {
              setMenu(false);
              nav.navigate('StudentImport', { mode: 'csv' });
            }}
          />
          <Button
            variant="secondary"
            title={t('import.fromContacts')}
            onPress={() => {
              setMenu(false);
              nav.navigate('StudentImport', { mode: 'contacts' });
            }}
          />
        </View>
      </BottomSheet>
      <UpgradePrompt
        visible={!!guard.blocked}
        kind={guard.blocked?.kind ?? 'student'}
        limit={guard.blocked?.limit}
        onClose={guard.close}
      />
    </Screen>
  );
}
