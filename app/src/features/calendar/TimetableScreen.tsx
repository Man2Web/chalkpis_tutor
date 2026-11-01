import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, Screen, Segmented, Skeleton } from '../../components';
import { addDays, prettyDate, shortDate, todayYmd, weekdayOf } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, font, radius, spacing, type } from '../../theme';
import { timeRange } from '../batches/format';
import { useCalendar } from './api';
import { DayAgenda } from './DayAgenda';
import {
  addMonths,
  classesOn,
  holidayFor,
  itemsOn,
  monthGrid,
  rangeOf,
  weekDays,
  type CalendarRange,
} from './logic';
import { useTimetable } from './useTimetable';

type Mode = 'week' | 'month';

/** "2 – 8 Nov", or "30 Nov – 6 Dec" across months. */
export const weekLabel = (days: string[]) =>
  `${shortDate(days[0]!, 'en-IN')} – ${shortDate(days[6]!, 'en-IN')}`;
export const monthLabel = (ymd: string) =>
  new Date(`${ymd.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Arrows either side of what is shown, and a way back to today. */
export function PeriodBar({
  label,
  onPrev,
  onNext,
  onToday,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
}) {
  const { t } = useTranslation();
  const arrow = (dir: 'back' | 'forward', onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t(dir === 'back' ? 'calendar.previous' : 'calendar.next')}
      hitSlop={8}
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.fill,
      }}
    >
      <Ionicons name={`chevron-${dir}`} size={18} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {arrow('back', onPrev)}
      <Text style={[type.heading, { flex: 1, textAlign: 'center' }]}>{label}</Text>
      {onToday ? (
        <Pressable onPress={onToday} accessibilityRole="button" hitSlop={8}>
          <Text style={[type.caption, font('600'), { color: colors.info }]}>
            {t('calendar.today')}
          </Text>
        </Pressable>
      ) : null}
      {arrow('forward', onNext)}
    </View>
  );
}

/** The clashes in the weekly timetable: one teacher in two places at once. */
export function ClashCard({ list }: { list: ReturnType<typeof useTimetable> }) {
  const { t } = useTranslation();
  if (!list.clashes.length) return null;
  return (
    <View
      style={{
        backgroundColor: colors.warningSoft,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={[type.subhead, font('600'), { color: colors.warning, flex: 1 }]}>
          {t('calendar.clashTitle', { count: list.clashes.length })}
        </Text>
      </View>
      {list.clashes.slice(0, 5).map((c) => (
        <Text key={`${c.day}${c.a.id}${c.b.id}`} style={[type.caption, { color: colors.text }]}>
          {t('calendar.clashLine', {
            day: t(`days.${c.day}`),
            a: `${c.a.name} (${timeRange(c.a.startTime, c.a.endTime)})`,
            b: `${c.b.name} (${timeRange(c.b.startTime, c.b.endTime)})`,
            who: c.teacher ? list.nameOf(c.teacher) : t('calendar.youInLine'),
          })}
        </Text>
      ))}
      <Text style={type.caption2}>{t('calendar.clashHint')}</Text>
    </View>
  );
}

const DOT = {
  holiday: colors.warningFill,
  event: colors.purple,
  exam: colors.indigo,
  hw: colors.teal,
};

/** Dots for what is on a day in the month grid. */
function dotsFor(range: CalendarRange | undefined, day: string) {
  const it = itemsOn(range, day);
  const dots: string[] = [];
  if (it.events.some((e) => e.kind === 'holiday')) dots.push(DOT.holiday);
  if (it.events.some((e) => e.kind !== 'holiday')) dots.push(DOT.event);
  if (it.exams.length) dots.push(DOT.exam);
  if (it.homework.length) dots.push(DOT.hw);
  return dots;
}

/**
 * The timetable on a phone: this week day by day (classes, holidays, tests, homework due), or the month as a grid
 * with the chosen day under it. Holidays and events are added here; classes come from the batches.
 */
export function TimetableScreen({
  navigation,
}: NativeStackScreenProps<MainStackParams, 'Timetable'>) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(today);
  const [picked, setPicked] = useState(today);
  const tt = useTimetable();
  const week = weekDays(anchor);
  const grid = monthGrid(anchor);
  const { from, to } = rangeOf(mode === 'week' ? week : grid.flat());
  const cal = useCalendar(from, to);
  const month = anchor.slice(0, 7);

  const header = (
    <View style={{ gap: spacing.md }}>
      <Segmented
        options={[
          { value: 'week', label: t('calendar.week') },
          { value: 'month', label: t('calendar.month') },
        ]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          // the week shows the day picked in the month; the month opens on the week's month
          if (v === 'week') setAnchor(picked);
          else if (picked.slice(0, 7) !== anchor.slice(0, 7)) setPicked(anchor);
        }}
      />
      <Button
        title={t('calendar.add')}
        icon={<Ionicons name="add" size={18} color={colors.onPrimary} />}
        onPress={() => navigation.navigate('EventForm', { date: picked })}
      />
      <ClashCard list={tt} />
    </View>
  );

  if (tt.loading)
    return (
      <Screen>
        {header}
        <Skeleton height={320} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  if (tt.error)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={tt.refetch}
        />
      </Screen>
    );

  return (
    <Screen>
      {header}
      {mode === 'week' ? (
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <PeriodBar
            label={weekLabel(week)}
            onPrev={() => setAnchor(addDays(week[0]!, -7))}
            onNext={() => setAnchor(addDays(week[0]!, 7))}
            onToday={week.includes(today) ? undefined : () => setAnchor(today)}
          />
          {week.map((d) => {
            const items = itemsOn(cal.data, d);
            const off = holidayFor(items.events);
            return (
              <Card
                key={d}
                style={{
                  gap: spacing.xs,
                  borderWidth: d === today ? 1.5 : undefined,
                  borderColor: d === today ? colors.primary : undefined,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={[type.subhead, font('700'), { flex: 1 }]}>
                    {prettyDate(d, 'en-IN')}
                  </Text>
                  {d === today ? (
                    <Text style={[type.caption2, font('600'), { color: colors.info }]}>
                      {t('calendar.today')}
                    </Text>
                  ) : null}
                  {off ? (
                    <Text style={[type.caption2, font('600'), { color: colors.warning }]}>
                      {off.title}
                    </Text>
                  ) : null}
                </View>
                <DayAgenda
                  classes={classesOn(tt.batches, weekdayOf(d))}
                  items={items}
                  helpersOf={tt.helpersOf}
                />
              </Card>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <PeriodBar
            label={monthLabel(anchor)}
            onPrev={() => setAnchor(addMonths(anchor, -1))}
            onNext={() => setAnchor(addMonths(anchor, 1))}
            onToday={
              month === today.slice(0, 7)
                ? undefined
                : () => {
                    setAnchor(today);
                    setPicked(today);
                  }
            }
          />
          <Card style={{ padding: spacing.sm }}>
            <View style={{ flexDirection: 'row' }}>
              {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((w) => (
                <Text
                  key={w}
                  style={[
                    type.caption2,
                    font('600'),
                    { flex: 1, textAlign: 'center', paddingVertical: 4 },
                  ]}
                >
                  {t(`days.${w}`)}
                </Text>
              ))}
            </View>
            {grid.map((wk) => (
              <View key={wk[0]} style={{ flexDirection: 'row' }}>
                {wk.map((d) => {
                  const inMonth = d.slice(0, 7) === month;
                  const sel = d === picked;
                  const dots = dotsFor(cal.data, d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setPicked(d)}
                      accessibilityRole="button"
                      accessibilityLabel={prettyDate(d, 'en-IN')}
                      accessibilityState={{ selected: sel }}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 3 }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: radius.pill,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: sel ? colors.primary : 'transparent',
                          borderWidth: d === today && !sel ? 1.5 : 0,
                          borderColor: colors.primary,
                        }}
                      >
                        <Text
                          style={[
                            type.callout,
                            font(sel || d === today ? '700' : '500'),
                            {
                              color: sel
                                ? colors.onPrimary
                                : inMonth
                                  ? colors.text
                                  : colors.textFaint,
                            },
                          ]}
                        >
                          {Number(d.slice(8))}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 2, height: 5 }}>
                        {dots.map((c) => (
                          <View
                            key={c}
                            style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c }}
                          />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Card>
          <Card style={{ gap: spacing.xs }}>
            <Text style={[type.subhead, font('700')]}>{prettyDate(picked, 'en-IN')}</Text>
            <DayAgenda
              classes={classesOn(tt.batches, weekdayOf(picked))}
              items={itemsOn(cal.data, picked)}
              helpersOf={tt.helpersOf}
            />
          </Card>
        </View>
      )}
    </Screen>
  );
}
