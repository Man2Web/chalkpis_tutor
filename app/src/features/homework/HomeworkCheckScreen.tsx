import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Chip, EmptyState, Screen, Skeleton, toast } from '../../components';
import { useInstitute, useStudents } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { open, whatsappUrl } from '../../lib/contact';
import { prettyDate, todayYmd } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, column, font, spacing, type } from '../../theme';
import { useHomework, useHomeworkActions } from './api';
import { dueLabel, groupMessage, missingMessage, tally, type Check } from './logic';

/**
 * One piece of homework: share it to the batch's group, then tick who handed it in (everyone at once, then the few
 * who did not). Parents of those who did not can be sent a note from the owner's own WhatsApp.
 */
export function HomeworkCheckScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'HomeworkCheck'>) {
  const { t } = useTranslation();
  const id = route.params.id;
  const q = useHomework(id);
  const students = useStudents();
  const institute = useInstitute();
  const { saveChecks } = useHomeworkActions();
  const [checks, setChecks] = useState<Map<string, Check>>(new Map());
  const [dirty, setDirty] = useState(false);

  const saved = q.data?.checks;
  useEffect(() => {
    if (!saved) return;
    setChecks(new Map(saved.map((c) => [c.studentId, c.status])));
    setDirty(false);
  }, [saved]);

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
        <Skeleton height={140} />
        <Skeleton height={300} />
      </Screen>
    );
  if (!q.data)
    return (
      <Screen>
        <EmptyState title={t('homework.notFound')} />
      </Screen>
    );
  const hw = q.data.homework;
  const today = todayYmd();
  const due = dueLabel(t, hw.dueOn, today);
  const dueText = prettyDate(hw.dueOn, 'en-IN');
  const count = tally(roster, checks);
  const savedMap = new Map((saved ?? []).map((c) => [c.studentId, c.status]));
  const like = { ...hw, dueText };

  const set = (sid: string, status: Check) => {
    setChecks((m) => {
      const next = new Map(m);
      if (next.get(sid) === status) next.delete(sid);
      else next.set(sid, status);
      return next;
    });
    setDirty(true);
  };
  const everyoneDone = () => {
    setChecks((m) => {
      const next = new Map(m);
      for (const sid of roster) if (!next.has(sid)) next.set(sid, 'done');
      return next;
    });
    setDirty(true);
  };
  const save = () =>
    saveChecks.mutate(
      {
        id,
        checks: roster.map((sid) => ({ studentId: sid, status: checks.get(sid) ?? null })),
      },
      {
        onSuccess: () => toast(t('homework.checksSaved'), 'success'),
        onError: (e) => {
          reportError(e);
          toast(t('common.error'), 'error');
        },
      },
    );
  const remind = (sid: string) => {
    const s = byId.get(sid);
    const phone = s?.parentPhone || s?.phone;
    if (!s || !phone) {
      toast(t('homework.noParentPhone'), 'error');
      return;
    }
    void open(
      whatsappUrl(
        phone,
        missingMessage(t, {
          institute: institute.data?.name ?? '',
          student: s.name,
          homework: like,
        }),
      ),
    );
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView contentContainerStyle={[column, { padding: spacing.lg, gap: spacing.md }]}>
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.title3}>{hw.title}</Text>
              <Text style={type.footnote}>
                {[hw.subject, hw.batchName].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[type.footnote, due.late ? { color: colors.danger } : null]}>
                {t('homework.dueLine', { date: dueText, when: due.text })}
              </Text>
            </View>
            <Button
              size="small"
              variant="outline"
              title={t('common.edit')}
              onPress={() => navigation.navigate('HomeworkForm', { id })}
            />
          </View>
          {hw.details ? <Text style={type.subhead}>{hw.details}</Text> : null}
          <Button
            size="small"
            variant="secondary"
            title={t('homework.shareGroup')}
            icon={<Ionicons name="logo-whatsapp" size={16} color={colors.text} />}
            onPress={() =>
              void open(`https://wa.me/?text=${encodeURIComponent(groupMessage(t, like))}`)
            }
          />
        </Card>

        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}
        >
          <Chip small tone="success" label={t('homework.doneCount', { count: count.done })} />
          <Chip small tone="danger" label={t('homework.missingCount', { count: count.missing })} />
          <Chip small label={t('homework.uncheckedCount', { count: count.unchecked })} />
          <View style={{ flex: 1 }} />
          {count.unchecked ? (
            <Button
              size="small"
              variant="outline"
              title={t('homework.everyoneDone')}
              onPress={everyoneDone}
            />
          ) : null}
        </View>

        {roster.length === 0 ? (
          <EmptyState icon="people-outline" title={t('homework.noStudents')} />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {roster.map((sid, i) => {
              const s = byId.get(sid)!;
              const c = checks.get(sid);
              const canRemind = !dirty && savedMap.get(sid) === 'missing';
              return (
                <View
                  key={sid}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.border,
                  }}
                >
                  <Avatar name={s.name} uri={s.photoUrl} size={36} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={[type.body, font('500')]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {canRemind ? (
                      <Pressable
                        onPress={() => remind(sid)}
                        accessibilityRole="button"
                        accessibilityLabel={t('homework.remindParent', { name: s.name })}
                        hitSlop={6}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Ionicons name="logo-whatsapp" size={14} color="#1DA851" />
                        <Text style={[type.caption, { color: '#128C4B' }]}>
                          {t('homework.remind')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Chip
                    small
                    label={t('homework.done')}
                    selected={c === 'done'}
                    tone={c === 'done' ? 'success' : 'neutral'}
                    onPress={() => set(sid, 'done')}
                  />
                  <Chip
                    small
                    label={t('homework.missing')}
                    selected={c === 'missing'}
                    tone={c === 'missing' ? 'danger' : 'neutral'}
                    onPress={() => set(sid, 'missing')}
                  />
                </View>
              );
            })}
          </Card>
        )}
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
            title={t('homework.saveChecks')}
            onPress={save}
            loading={saveChecks.isPending}
            disabled={!dirty}
          />
        </View>
      </View>
    </Screen>
  );
}
