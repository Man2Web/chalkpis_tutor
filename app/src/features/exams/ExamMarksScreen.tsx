import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Chip, EmptyState, Screen, Skeleton, toast } from '../../components';
import { useInstitute, useStudents } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { open, whatsappUrl } from '../../lib/contact';
import { shortDate } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, column, font, radius, spacing, type } from '../../theme';
import { useExam, useExamActions } from './api';
import {
  gradeOf,
  marksText,
  parseMarks,
  percentOf,
  ranks,
  resultMessage,
  summary,
  toppersMessage,
  type Result,
} from './logic';

interface Entry {
  text: string;
  absent: boolean;
  remark: string;
  /** the remark box is open */
  noting: boolean;
}
const EMPTY: Entry = { text: '', absent: false, remark: '', noting: false };

/**
 * Marks for one test: everyone in the batch with a box for marks (Enter moves to the next), Absent, an optional
 * remark, and the rank, percentage and grade as they are typed. After saving, each parent can be sent their child's
 * result on WhatsApp, and the toppers can go to the batch's group.
 */
export function ExamMarksScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'ExamMarks'>) {
  const { t } = useTranslation();
  const id = route.params.id;
  const q = useExam(id);
  const students = useStudents();
  const institute = useInstitute();
  const { saveMarks } = useExamActions();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [dirty, setDirty] = useState(false);
  const inputs = useRef<Record<string, TextInput | null>>({});

  // what the server has, as boxes to edit (again whenever a save brings fresh results)
  const results = q.data?.results;
  useEffect(() => {
    if (!results) return;
    setEntries(
      Object.fromEntries(
        results.map((r) => [
          r.studentId,
          {
            text: r.marks === null ? '' : marksText(r.marks),
            absent: r.absent,
            remark: r.remark,
            noting: false,
          },
        ]),
      ),
    );
    setDirty(false);
  }, [results]);

  const byId = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);
  const roster = useMemo(
    () =>
      (q.data?.roster ?? [])
        .filter((sid) => byId.has(sid))
        .sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)),
    [q.data?.roster, byId],
  );

  if (q.isLoading || students.isLoading)
    return (
      <Screen>
        <Skeleton height={120} />
        <Skeleton height={320} />
      </Screen>
    );
  if (!q.data)
    return (
      <Screen>
        <EmptyState title={t('exams.notFound')} />
      </Screen>
    );
  const exam = q.data.exam;
  const max = exam.maxMarks;

  const entry = (sid: string) => entries[sid] ?? EMPTY;
  const live: Result[] = roster.map((sid) => {
    const e = entry(sid);
    const m = parseMarks(e.text, max);
    return { studentId: sid, absent: e.absent, marks: e.absent || m === 'invalid' ? null : m };
  });
  const rank = ranks(live);
  const sum = summary(live, max, exam.passPercent);
  const saved = new Map(q.data.results.map((r) => [r.studentId, r]));
  const savedRanks = ranks(q.data.results);
  const savedAvg = summary(q.data.results, max, exam.passPercent).average;
  const invalid = roster.filter((sid) => {
    const e = entry(sid);
    return !e.absent && parseMarks(e.text, max) === 'invalid';
  });

  const change = (sid: string, patch: Partial<Entry>) => {
    setEntries((all) => ({ ...all, [sid]: { ...(all[sid] ?? EMPTY), ...patch } }));
    setDirty(true);
  };
  const focusNext = (sid: string) => {
    const i = roster.indexOf(sid);
    const next = roster.slice(i + 1).find((x) => !entry(x).absent);
    if (next) inputs.current[next]?.focus();
  };

  const save = () => {
    if (invalid.length) {
      toast(t('exams.fixMarks', { count: invalid.length }), 'error');
      inputs.current[invalid[0]!]?.focus();
      return;
    }
    const marks = roster.map((sid) => {
      const e = entry(sid);
      const m = parseMarks(e.text, max);
      return {
        studentId: sid,
        absent: e.absent,
        marks: e.absent || m === 'invalid' ? null : m,
        remark: e.remark.trim(),
      };
    });
    saveMarks.mutate(
      { id, marks },
      {
        onSuccess: () => toast(t('exams.marksSaved'), 'success'),
        onError: (e) => {
          reportError(e);
          toast(t('common.error'), 'error');
        },
      },
    );
  };

  const dateText = shortDate(exam.date, 'en-IN');
  const sendToParent = (sid: string) => {
    const s = byId.get(sid);
    const r = saved.get(sid);
    if (!s || !r) return;
    const phone = s.parentPhone || s.phone;
    if (!phone) {
      toast(t('exams.noParentPhone'), 'error');
      return;
    }
    void open(
      whatsappUrl(
        phone,
        resultMessage(t, {
          institute: institute.data?.name ?? '',
          student: s.name,
          exam,
          dateText,
          marks: r.marks,
          absent: r.absent,
          rank: savedRanks.get(sid),
          of: savedRanks.size,
          average: savedAvg,
          remark: r.remark,
        }),
      ),
    );
  };
  const shareToppers = () =>
    void open(
      `https://wa.me/?text=${encodeURIComponent(
        toppersMessage(t, exam, q.data!.results, (sid) => byId.get(sid)?.name ?? ''),
      )}`,
    );

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[column, { padding: spacing.lg, gap: spacing.md }]}
      >
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.title3}>{exam.name}</Text>
              <Text style={type.footnote}>
                {[exam.subject, exam.batchName, dateText].filter(Boolean).join(' · ')}
              </Text>
              <Text style={type.footnote}>
                {t('exams.outOf', { max: marksText(max), pass: exam.passPercent })}
              </Text>
            </View>
            <Button
              size="small"
              variant="outline"
              title={t('common.edit')}
              onPress={() => navigation.navigate('ExamForm', { id })}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Chip small label={t('exams.satOf', { sat: sum.sat, total: roster.length })} />
            {sum.absent ? (
              <Chip small tone="warning" label={t('exams.absentCount', { count: sum.absent })} />
            ) : null}
            {sum.average !== null ? (
              <Chip
                small
                tone="accent"
                label={t('exams.avg', { average: marksText(sum.average) })}
              />
            ) : null}
            {sum.highest !== null ? (
              <Chip
                small
                tone="success"
                label={t('exams.top', { marks: marksText(sum.highest) })}
              />
            ) : null}
            {sum.sat ? (
              <Chip
                small
                tone={sum.failed ? 'danger' : 'success'}
                label={t('exams.passFail', { passed: sum.passed, failed: sum.failed })}
              />
            ) : null}
          </View>
          {q.data.results.some((r) => !r.absent && r.marks !== null) && !dirty ? (
            <Button
              size="small"
              variant="secondary"
              title={t('exams.shareToppers')}
              icon={<Ionicons name="logo-whatsapp" size={16} color={colors.text} />}
              onPress={shareToppers}
            />
          ) : null}
        </Card>

        {roster.length === 0 ? (
          <EmptyState icon="people-outline" title={t('exams.noStudents')} />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {roster.map((sid, i) => {
              const s = byId.get(sid)!;
              const e = entry(sid);
              const m = parseMarks(e.text, max);
              const bad = !e.absent && m === 'invalid';
              const pct = typeof m === 'number' && !e.absent ? percentOf(m, max) : null;
              const r = rank.get(sid);
              const canSend = !dirty && saved.has(sid);
              return (
                <View
                  key={sid}
                  style={{
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    gap: spacing.sm,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Avatar name={s.name} uri={s.photoUrl} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.body, font('500')]} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text style={[type.caption2, bad ? { color: colors.danger } : null]}>
                        {e.absent
                          ? t('exams.absent')
                          : bad
                            ? t('exams.invalidMarks', { max: marksText(max) })
                            : pct !== null
                              ? `${pct}% · ${gradeOf(pct)}${r ? ` · ${t('exams.rankN', { rank: r })}` : ''}`
                              : t('exams.notEntered')}
                      </Text>
                    </View>
                    <TextInput
                      ref={(el) => {
                        inputs.current[sid] = el;
                      }}
                      value={e.absent ? '' : e.text}
                      editable={!e.absent}
                      onChangeText={(v) => change(sid, { text: v })}
                      onSubmitEditing={() => focusNext(sid)}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      maxLength={7}
                      placeholder="—"
                      placeholderTextColor={colors.textFaint}
                      accessibilityLabel={t('exams.marksFor', { name: s.name })}
                      selectTextOnFocus
                      style={[
                        type.body,
                        font('600'),
                        {
                          width: 72,
                          height: 44,
                          textAlign: 'center',
                          borderWidth: 1,
                          borderRadius: radius.md,
                          borderColor: bad ? colors.danger : colors.input,
                          backgroundColor: e.absent ? colors.fill : colors.surface,
                        },
                      ]}
                    />
                    <Text style={[type.caption, { width: 34 }]}>/ {marksText(max)}</Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      paddingLeft: 36 + spacing.md,
                    }}
                  >
                    <Chip
                      small
                      label={t('exams.absent')}
                      selected={e.absent}
                      // grey until chosen, so the list does not read as everyone absent
                      tone={e.absent ? 'warning' : 'neutral'}
                      onPress={() => change(sid, { absent: !e.absent })}
                    />
                    <Chip
                      small
                      label={e.remark ? t('exams.remarkAdded') : t('exams.addRemark')}
                      selected={e.noting}
                      onPress={() =>
                        setEntries((all) => ({ ...all, [sid]: { ...e, noting: !e.noting } }))
                      }
                    />
                    <View style={{ flex: 1 }} />
                    {canSend ? (
                      <Pressable
                        onPress={() => sendToParent(sid)}
                        accessibilityRole="button"
                        accessibilityLabel={t('exams.sendToParent', { name: s.name })}
                        hitSlop={8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Ionicons name="logo-whatsapp" size={18} color="#1DA851" />
                        <Text style={[type.caption, { color: '#128C4B' }]}>{t('exams.send')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {e.noting ? (
                    <TextInput
                      value={e.remark}
                      onChangeText={(v) => change(sid, { remark: v })}
                      placeholder={t('exams.remarkPlaceholder')}
                      placeholderTextColor={colors.textFaint}
                      maxLength={200}
                      accessibilityLabel={t('exams.remarkFor', { name: s.name })}
                      style={[
                        type.subhead,
                        {
                          marginLeft: 36 + spacing.md,
                          minHeight: 40,
                          paddingHorizontal: spacing.md,
                          borderWidth: 1,
                          borderRadius: radius.md,
                          borderColor: colors.input,
                        },
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
          </Card>
        )}
        {dirty ? null : q.data.results.length ? (
          <Text style={[type.caption, { textAlign: 'center' }]}>{t('exams.sendHint')}</Text>
        ) : null}
      </ScrollView>
      <View
        style={{
          padding: spacing.lg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <View style={column}>
          <Button
            title={t('exams.saveMarks')}
            onPress={save}
            loading={saveMarks.isPending}
            disabled={!dirty}
          />
        </View>
      </View>
    </Screen>
  );
}
