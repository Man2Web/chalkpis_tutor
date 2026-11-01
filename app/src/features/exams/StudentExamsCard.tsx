import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chip, Skeleton, toast } from '../../components';
import { useAttendanceRange, useInstitute } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { useCategory } from '../../lib/category';
import { shortDate, todayYmd } from '../../lib/dates';
import { sharePdfHtml } from '../../lib/pdf';
import type { Student } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { studentStats } from '../attendance/logic';
import { useStudentExams } from './api';
import { gradeOf, marksText, reportCardHtml, type CardLabels } from './logic';

const LABELS = [
  'title',
  'student',
  'level',
  'date',
  'test',
  'subject',
  'marks',
  'percent',
  'grade',
  'rank',
  'absent',
  'overall',
  'testsTaken',
  'attendance',
  'remarks',
  'signature',
  'madeWith',
] as const;

/** On a student's profile: their latest results, and the report card (all their tests, with attendance) as a PDF. */
export function StudentExamsCard({ student }: { student: Pick<Student, 'id' | 'name' | 'class'> }) {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const exams = useStudentExams(student.id);
  const institute = useInstitute();
  const list = exams.data ?? [];
  // attendance over the same months as the tests on the card
  const from = list.length ? list[list.length - 1]!.date : todayYmd();
  const attendance = useAttendanceRange(from, todayYmd());

  const printCard = async () => {
    try {
      const L = Object.fromEntries(LABELS.map((k) => [k, t(`exams.card.${k}`)])) as CardLabels;
      L.level = ct('level');
      const stat = studentStats(attendance.data ?? []).get(student.id);
      const rows = [...list].reverse();
      await sharePdfHtml(
        reportCardHtml({
          institute: institute.data?.name ?? '',
          student: student.name,
          level: student.class ? ct('levelValue', { n: student.class }) : '',
          periodText: rows.length
            ? `${shortDate(rows[0]!.date, 'en-IN')} – ${shortDate(rows[rows.length - 1]!.date, 'en-IN')}`
            : '',
          attendancePct: stat?.pct ?? null,
          L,
          rows: rows.map((e) => ({
            name: e.name,
            subject: e.subject,
            dateText: shortDate(e.date, 'en-IN'),
            maxMarks: e.maxMarks,
            marks: e.marks,
            absent: e.absent,
            rank: e.rank,
            of: e.of,
            remark: e.remark,
          })),
        }),
        `report-card-${student.name}`,
      );
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={[type.heading, { flex: 1 }]}>{t('exams.title')}</Text>
        {list.length ? (
          <Button
            size="small"
            variant="outline"
            title={t('exams.reportCard')}
            onPress={() => void printCard()}
          />
        ) : null}
      </View>
      {exams.isLoading ? (
        <Skeleton height={60} />
      ) : list.length === 0 ? (
        <Text style={type.caption}>{t('exams.noResults')}</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {list.slice(0, 5).map((e) => (
            <View
              key={e.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              accessible
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.subhead} numberOfLines={1}>
                  {e.subject ? `${e.name} · ${e.subject}` : e.name}
                </Text>
                <Text style={type.caption2}>
                  {[
                    shortDate(e.date, 'en-IN'),
                    e.rank ? t('exams.rankOf', { rank: e.rank, of: e.of }) : '',
                    e.classAverage === null
                      ? ''
                      : t('exams.classAvgShort', { average: marksText(e.classAverage) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {e.absent || e.marks === null ? (
                <Chip small tone="warning" label={t('exams.absent')} />
              ) : (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.label, { color: colors.text }]}>
                    {marksText(e.marks)} / {marksText(e.maxMarks)}
                  </Text>
                  <Text style={type.caption2}>
                    {e.percent}% · {gradeOf(e.percent ?? 0)}
                  </Text>
                </View>
              )}
            </View>
          ))}
          {list.length > 5 ? (
            <Text style={type.caption}>{t('exams.moreInCard', { count: list.length - 5 })}</Text>
          ) : null}
        </View>
      )}
      <Button
        size="small"
        variant="ghost"
        title={t('exams.allTests')}
        onPress={() => nav.navigate('Exams')}
      />
    </Card>
  );
}
