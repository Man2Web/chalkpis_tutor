import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Chip, Skeleton } from '../../components';
import { shortDate } from '../../lib/dates';
import { spacing, type } from '../../theme';
import { useStudentHomework } from './api';

/** On a student's profile: their latest homework and whether they handed it in. */
export function StudentHomeworkCard({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const q = useStudentHomework(studentId);
  const list = q.data ?? [];
  const missed = list.filter((h) => h.status === 'missing').length;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={[type.heading, { flex: 1 }]}>{t('homework.title')}</Text>
        {missed ? (
          <Chip small tone="danger" label={t('homework.statusMissing', { count: missed })} />
        ) : null}
      </View>
      {q.isLoading ? (
        <Skeleton height={50} />
      ) : list.length === 0 ? (
        <Text style={type.caption}>{t('homework.noneForStudent')}</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {list.slice(0, 5).map((h) => (
            <View
              key={h.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.subhead} numberOfLines={1}>
                  {h.subject ? `${h.subject} · ${h.title}` : h.title}
                </Text>
                <Text style={type.caption2}>
                  {t('homework.due')} {shortDate(h.dueOn, 'en-IN')}
                </Text>
              </View>
              {h.status === 'done' ? (
                <Chip small tone="success" label={t('homework.done')} />
              ) : h.status === 'missing' ? (
                <Chip small tone="danger" label={t('homework.missing')} />
              ) : (
                <Chip small label={t('homework.notChecked')} />
              )}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
