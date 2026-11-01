import { useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Table } from 'panelui-native/components/table';
import { Button, Chip, EmptyState, Skeleton } from '../components';
import { useBatches } from '../data/hooks';
import { shortDate } from '../lib/dates';
import type { MainStackParams } from '../navigation/types';
import { colors, font, spacing, type } from '../theme';
import { useExams } from '../features/exams/api';
import { marksText } from '../features/exams/logic';
import { examStatus } from '../features/exams/ExamsScreen';
import { card, DesktopPage, Dropdown } from './parts';

/** Tests & marks on a laptop or desktop: every test in a table, one batch at a time if wanted. */
export function DesktopExams() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const [batchId, setBatchId] = useState('');
  const exams = useExams(batchId || undefined);
  const batches = useBatches();
  const active = (batches.data ?? []).filter((b) => b.status === 'active');
  const list = exams.data ?? [];

  return (
    <DesktopPage
      title={t('exams.title')}
      subtitle={t('exams.desktopSubtitle')}
      actions={
        <Button
          size="small"
          title={t('exams.new')}
          icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
          onPress={() => nav.navigate('ExamForm', batchId ? { batchId } : undefined)}
        />
      }
    >
      {active.length > 1 ? (
        <View style={{ flexDirection: 'row', zIndex: 5 }}>
          <Dropdown
            label={t('exams.batch')}
            value={batchId}
            onChange={setBatchId}
            width={240}
            options={[
              { value: '', label: t('exams.allBatches') },
              ...active.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </View>
      ) : null}
      {exams.isLoading ? (
        <Skeleton height={240} />
      ) : exams.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void exams.refetch()}
        />
      ) : list.length === 0 ? (
        <View style={[card, { padding: spacing.xl }]}>
          <EmptyState
            icon="document-text-outline"
            title={t('exams.emptyTitle')}
            message={t('exams.emptyText')}
            actionLabel={t('exams.new')}
            onAction={() => nav.navigate('ExamForm', batchId ? { batchId } : undefined)}
          />
        </View>
      ) : (
        <View style={[card, { overflow: 'hidden' }]}>
          <Table
            columns={[
              { flex: 2.2 },
              { flex: 1.6 },
              { flex: 1 },
              { flex: 1, align: 'end' },
              { flex: 1.1, align: 'end' },
              { flex: 1.4 },
              { width: 24 },
            ]}
          >
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('exams.col.test')}</Table.Head>
                <Table.Head>{t('exams.batch')}</Table.Head>
                <Table.Head>{t('exams.date')}</Table.Head>
                <Table.Head>{t('exams.maxMarks')}</Table.Head>
                <Table.Head>{t('exams.col.average')}</Table.Head>
                <Table.Head>{t('exams.col.marks')}</Table.Head>
                <Table.Head> </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {list.map((e) => {
                const st = examStatus(e, t);
                return (
                  <Table.Row key={e.id} onPress={() => nav.navigate('ExamMarks', { id: e.id })}>
                    <Table.Cell>
                      <View style={{ minWidth: 0 }}>
                        <Text style={[type.subhead, font('600')]} numberOfLines={1}>
                          {e.name}
                        </Text>
                        {e.subject ? (
                          <Text style={type.caption2} numberOfLines={1}>
                            {e.subject}
                          </Text>
                        ) : null}
                      </View>
                    </Table.Cell>
                    <Table.Cell>{e.batchName}</Table.Cell>
                    <Table.Cell>{shortDate(e.date, 'en-IN')}</Table.Cell>
                    <Table.Cell>{marksText(e.maxMarks)}</Table.Cell>
                    <Table.Cell>{e.average === null ? '—' : marksText(e.average)}</Table.Cell>
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
