import { useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Table } from 'panelui-native/components/table';
import { Button, Chip, EmptyState, Skeleton } from '../components';
import { useBatches } from '../data/hooks';
import { shortDate, todayYmd } from '../lib/dates';
import type { MainStackParams } from '../navigation/types';
import { colors, font, spacing, type } from '../theme';
import { useHomeworkList } from '../features/homework/api';
import { homeworkStatus } from '../features/homework/HomeworkScreen';
import { dueLabel } from '../features/homework/logic';
import { card, DesktopPage, Dropdown } from './parts';

/** Homework on a laptop or desktop: everything set, in a table, one batch at a time if wanted. */
export function DesktopHomework() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const [batchId, setBatchId] = useState('');
  const list = useHomeworkList(batchId || undefined);
  const batches = useBatches();
  const active = (batches.data ?? []).filter((b) => b.status === 'active');
  const items = list.data ?? [];
  const today = todayYmd();
  const add = () => nav.navigate('HomeworkForm', batchId ? { batchId } : undefined);

  return (
    <DesktopPage
      title={t('homework.title')}
      subtitle={t('homework.desktopSubtitle')}
      actions={
        <Button
          size="small"
          title={t('homework.new')}
          icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
          onPress={add}
        />
      }
    >
      {active.length > 1 ? (
        <View style={{ flexDirection: 'row', zIndex: 5 }}>
          <Dropdown
            label={t('homework.batch')}
            value={batchId}
            onChange={setBatchId}
            width={240}
            options={[
              { value: '', label: t('homework.allBatches') },
              ...active.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </View>
      ) : null}
      {list.isLoading ? (
        <Skeleton height={240} />
      ) : list.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <View style={[card, { padding: spacing.xl }]}>
          <EmptyState
            icon="book-outline"
            title={t('homework.emptyTitle')}
            message={t('homework.emptyText')}
            actionLabel={t('homework.new')}
            onAction={add}
          />
        </View>
      ) : (
        <View style={[card, { overflow: 'hidden' }]}>
          <Table
            columns={[{ flex: 2.6 }, { flex: 1.4 }, { flex: 1.6 }, { flex: 1.6 }, { width: 24 }]}
          >
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('homework.workTitle')}</Table.Head>
                <Table.Head>{t('homework.batch')}</Table.Head>
                <Table.Head>{t('homework.dueOn')}</Table.Head>
                <Table.Head>{t('homework.handedIn')}</Table.Head>
                <Table.Head> </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {items.map((h) => {
                const st = homeworkStatus(h, t);
                const due = dueLabel(t, h.dueOn, today);
                return (
                  <Table.Row key={h.id} onPress={() => nav.navigate('HomeworkCheck', { id: h.id })}>
                    <Table.Cell>
                      <View style={{ minWidth: 0 }}>
                        <Text style={[type.subhead, font('600')]} numberOfLines={1}>
                          {h.title}
                        </Text>
                        {h.subject ? (
                          <Text style={type.caption2} numberOfLines={1}>
                            {h.subject}
                          </Text>
                        ) : null}
                      </View>
                    </Table.Cell>
                    <Table.Cell>{h.batchName}</Table.Cell>
                    <Table.Cell>
                      <View>
                        <Text style={type.subhead}>{shortDate(h.dueOn, 'en-IN')}</Text>
                        <Text style={[type.caption2, due.late ? { color: colors.danger } : null]}>
                          {due.text}
                        </Text>
                      </View>
                    </Table.Cell>
                    <Table.Cell>
                      <Chip small label={st.label} tone={st.tone} />
                    </Table.Cell>
                    <Table.Cell>
                      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </View>
      )}
    </DesktopPage>
  );
}
