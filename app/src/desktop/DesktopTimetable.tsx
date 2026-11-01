import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Segmented, Skeleton } from '../components';
import { addDays, todayYmd, weekdayOf } from '../lib/dates';
import type { MainStackParams } from '../navigation/types';
import { colors, font, radius, spacing, type } from '../theme';
import { useCalendar } from '../features/calendar/api';
import { DayAgenda } from '../features/calendar/DayAgenda';
import {
  addMonths,
  classesOn,
  holidayFor,
  itemsOn,
  monthGrid,
  rangeOf,
  weekDays,
  weeklyHours,
} from '../features/calendar/logic';
import { ClashCard, monthLabel, PeriodBar, weekLabel } from '../features/calendar/TimetableScreen';
import { useTimetable } from '../features/calendar/useTimetable';
import { card, DesktopPage, StatCard, StatGrid, type HoverState } from './parts';

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * The timetable on a laptop or desktop: the week as seven columns (classes in time order with who takes them, and
 * holidays, tests and homework due on top), or the month as a full grid. A day in the month opens its week.
 */
export function DesktopTimetable() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const today = todayYmd();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(today);
  const tt = useTimetable();
  const week = weekDays(anchor);
  const grid = monthGrid(anchor);
  const { from, to } = rangeOf(mode === 'week' ? week : grid.flat());
  const cal = useCalendar(from, to);
  const month = anchor.slice(0, 7);
  const active = tt.batches.filter((b) => b.status === 'active');
  const sessions = active.reduce((s, b) => s + b.days.length, 0);
  const upcoming = (cal.data?.events ?? []).filter((e) => e.endsOn >= today).length;

  const isCurrent = mode === 'week' ? week.includes(today) : month === today.slice(0, 7);
  const step = (n: number) =>
    setAnchor(mode === 'week' ? addDays(week[0]!, 7 * n) : addMonths(anchor, n));

  return (
    <DesktopPage
      title={t('calendar.title')}
      subtitle={t('calendar.desktopSubtitle')}
      actions={
        <>
          <View style={{ width: 200 }}>
            <Segmented
              options={[
                { value: 'week', label: t('calendar.week') },
                { value: 'month', label: t('calendar.month') },
              ]}
              value={mode}
              onChange={setMode}
            />
          </View>
          <Button
            size="small"
            title={t('calendar.add')}
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() => nav.navigate('EventForm', { date: isCurrent ? today : anchor })}
          />
        </>
      }
    >
      {tt.loading ? (
        <Skeleton height={420} />
      ) : tt.error ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={tt.refetch}
        />
      ) : (
        <>
          <StatGrid>
            <StatCard
              label={t('calendar.statClasses')}
              value={String(sessions)}
              icon="time-outline"
              tone="info"
              sub={t('calendar.statClassesSub', { count: active.length })}
            />
            <StatCard
              label={t('calendar.statHours')}
              value={String(weeklyHours(active))}
              icon="hourglass-outline"
              tone="neutral"
              sub={t('calendar.statHoursSub')}
            />
            <StatCard
              label={t('calendar.statUpcoming')}
              value={String(upcoming)}
              icon="flag-outline"
              tone="success"
              sub={t(mode === 'week' ? 'calendar.statThisWeek' : 'calendar.statThisMonth')}
            />
            <StatCard
              label={t('calendar.statClashes')}
              value={String(tt.clashes.length)}
              icon="warning-outline"
              tone="warning"
              valueTone={tt.clashes.length ? 'warning' : 'neutral'}
              sub={t(tt.clashes.length ? 'calendar.statClashesSub' : 'calendar.statNoClashes')}
            />
          </StatGrid>
          <ClashCard list={tt} />
          <View style={{ maxWidth: 420, alignSelf: 'center', width: '100%' }}>
            <PeriodBar
              label={mode === 'week' ? weekLabel(week) : monthLabel(anchor)}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onToday={isCurrent ? undefined : () => setAnchor(today)}
            />
          </View>
          {mode === 'week' ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' }}>
              {week.map((d) => {
                const items = itemsOn(cal.data, d);
                const off = holidayFor(items.events);
                const isToday = d === today;
                return (
                  <View
                    key={d}
                    style={[
                      card,
                      {
                        flex: 1,
                        minWidth: 0,
                        padding: spacing.sm,
                        backgroundColor: off ? colors.warningSoft : colors.shell,
                        borderColor: isToday ? colors.primary : colors.border,
                        borderWidth: isToday ? 1.5 : 1,
                        minHeight: 360,
                      },
                    ]}
                  >
                    <View style={{ paddingHorizontal: 4, paddingBottom: spacing.xs }}>
                      <Text style={[type.caption2, font('600'), { color: colors.textMuted }]}>
                        {t(`days.${weekdayOf(d)}`).toUpperCase()}
                      </Text>
                      <Text style={[type.title3, font('700'), { color: colors.text }]}>
                        {Number(d.slice(8))}
                        {isToday ? (
                          <Text style={[type.caption2, font('600'), { color: colors.info }]}>
                            {`  ${t('calendar.today')}`}
                          </Text>
                        ) : null}
                      </Text>
                    </View>
                    <DayAgenda
                      dense
                      classes={classesOn(tt.batches, weekdayOf(d))}
                      items={items}
                      helpersOf={tt.helpersOf}
                    />
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={[card, { padding: 0, overflow: 'hidden' }]}>
              <View style={{ flexDirection: 'row', backgroundColor: colors.shell }}>
                {WEEK.map((w) => (
                  <Text
                    key={w}
                    style={[
                      type.caption2,
                      font('600'),
                      { flex: 1, padding: spacing.sm, color: colors.textMuted },
                    ]}
                  >
                    {t(`days.${w}`).toUpperCase()}
                  </Text>
                ))}
              </View>
              {grid.map((wk) => (
                <View
                  key={wk[0]}
                  style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border }}
                >
                  {wk.map((d, i) => (
                    <MonthCell
                      key={d}
                      day={d}
                      today={today}
                      inMonth={d.slice(0, 7) === month}
                      last={i === 6}
                      classes={classesOn(tt.batches, weekdayOf(d)).length}
                      items={itemsOn(cal.data, d)}
                      onPress={() => {
                        setAnchor(d);
                        setMode('week');
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </DesktopPage>
  );
}

function MonthCell({
  day,
  today,
  inMonth,
  last,
  classes,
  items,
  onPress,
}: {
  day: string;
  today: string;
  inMonth: boolean;
  last: boolean;
  classes: number;
  items: ReturnType<typeof itemsOn>;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const off = holidayFor(items.events);
  const lines = [
    ...items.events.map((e) => ({
      key: e.id,
      text: e.title,
      color: e.kind === 'holiday' ? colors.warning : colors.purple,
    })),
    ...items.exams.map((x) => ({ key: x.id, text: x.name, color: colors.indigo })),
    ...items.homework.map((h) => ({
      key: h.id,
      text: `${t('calendar.due')} ${h.title}`,
      color: colors.teal,
    })),
  ];
  const isToday = day === today;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={day}
      style={(s: HoverState) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 104,
        padding: spacing.sm,
        gap: 2,
        borderRightWidth: last ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: s.hovered ? colors.shell : off ? colors.warningSoft : colors.surface,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <View
          style={{
            minWidth: 26,
            height: 26,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isToday ? colors.primary : 'transparent',
          }}
        >
          <Text
            style={[
              type.caption,
              font(isToday ? '700' : '600'),
              {
                color: isToday ? colors.onPrimary : inMonth ? colors.text : colors.textFaint,
              },
            ]}
          >
            {Number(day.slice(8))}
          </Text>
        </View>
        {classes && inMonth && !off ? (
          <Text style={[type.caption2, { color: colors.textMuted }]} numberOfLines={1}>
            {t('calendar.classesCount', { count: classes })}
          </Text>
        ) : null}
      </View>
      {lines.slice(0, 3).map((l) => (
        <Text
          key={l.key}
          style={[type.caption2, font('600'), { color: l.color, opacity: inMonth ? 1 : 0.5 }]}
          numberOfLines={1}
        >
          {l.text}
        </Text>
      ))}
      {lines.length > 3 ? (
        <Text style={[type.caption2, { color: colors.textMuted }]}>
          {t('calendar.more', { count: lines.length - 3 })}
        </Text>
      ) : null}
    </Pressable>
  );
}
