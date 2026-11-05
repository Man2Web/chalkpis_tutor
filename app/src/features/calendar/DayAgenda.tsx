import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Chip } from '../../components';
import { formatTime12 } from '../../components/PickerFields';
import type { Batch } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, font, radius, spacing, type } from '../../theme';
import { timeRange } from '../batches/format';
import { holidayFor, kindTone, type itemsOn } from './logic';

type Nav = NativeStackNavigationProp<MainStackParams>;

/** One line of the day: an icon, a title and a line under it, and a chip on the right. Opens what it is. */
export function AgendaRow({
  icon,
  iconColor,
  title,
  sub,
  chip,
  muted,
  onPress,
  dense,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  title: string;
  sub?: string;
  chip?: { label: string; tone: React.ComponentProps<typeof Chip>['tone'] };
  muted?: boolean;
  onPress?: () => void;
  dense?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: dense ? 6 : spacing.sm,
        opacity: muted ? 0.5 : 1,
      }}
    >
      <Ionicons name={icon} size={dense ? 14 : 18} color={iconColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[dense ? type.caption : type.subhead, font('600'), { color: colors.text }]}
          numberOfLines={dense ? 2 : 1}
        >
          {title}
        </Text>
        {sub ? (
          <Text style={type.caption2} numberOfLines={dense ? 2 : 1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {chip ? <Chip small tone={chip.tone} label={chip.label} /> : null}
    </Pressable>
  );
}

/**
 * Everything on one day: holidays and events first, then tests and homework due, then the classes in time order with
 * who takes them. A class on a holiday shows faded.
 */
export function DayAgenda({
  classes,
  items,
  helpersOf,
  dense,
}: {
  classes: Batch[];
  items: ReturnType<typeof itemsOn>;
  /** A batch's helpers' names; empty when the owner takes it. */
  helpersOf: (batchId: string) => string[];
  dense?: boolean;
}) {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const nothing =
    !classes.length && !items.events.length && !items.exams.length && !items.homework.length;
  if (nothing)
    return (
      <Text style={[type.caption, { paddingVertical: spacing.sm }]}>{t('calendar.nothing')}</Text>
    );
  return (
    <View>
      {items.events.map((e) => (
        <AgendaRow
          key={e.id}
          dense={dense}
          icon={e.kind === 'holiday' ? 'sunny-outline' : 'flag-outline'}
          iconColor={e.kind === 'holiday' ? colors.warningFill : colors.purple}
          title={e.title}
          sub={e.batchName ?? t('calendar.wholeCentre')}
          chip={
            dense ? undefined : { label: t(`calendar.kinds.${e.kind}`), tone: kindTone(e.kind) }
          }
          onPress={() => nav.navigate('EventForm', { id: e.id })}
        />
      ))}
      {items.exams.map((x) => (
        <AgendaRow
          key={x.id}
          dense={dense}
          icon="school-outline"
          iconColor={colors.indigo}
          title={x.subject ? `${x.name} · ${x.subject}` : x.name}
          sub={`${t('calendar.test')} · ${x.batchName}`}
          onPress={() => nav.navigate('ExamMarks', { id: x.id })}
        />
      ))}
      {items.homework.map((h) => (
        <AgendaRow
          key={h.id}
          dense={dense}
          icon="book-outline"
          iconColor={colors.teal}
          title={h.subject ? `${h.title} · ${h.subject}` : h.title}
          sub={`${t('calendar.homeworkDue')} · ${h.batchName}`}
          onPress={() => nav.navigate('HomeworkCheck', { id: h.id })}
        />
      ))}
      {classes.map((b) => {
        const off = holidayFor(items.events, b.id);
        const helpers = helpersOf(b.id);
        return (
          <Pressable
            key={b.id}
            onPress={() => nav.navigate('BatchDetail', { id: b.id })}
            accessibilityRole="button"
            accessibilityLabel={`${b.name}, ${timeRange(b.startTime, b.endTime)}`}
            style={{
              flexDirection: dense ? 'column' : 'row',
              gap: dense ? 2 : spacing.md,
              alignItems: dense ? 'stretch' : 'center',
              paddingVertical: dense ? 6 : spacing.sm,
              paddingHorizontal: dense ? spacing.sm : 0,
              marginTop: dense ? spacing.xs : 0,
              borderRadius: dense ? radius.md : 0,
              backgroundColor: dense ? colors.surface : undefined,
              borderWidth: dense ? 1 : 0,
              borderColor: colors.border,
              borderLeftWidth: dense ? 3 : 0,
              borderLeftColor: off ? colors.gray : colors.infoFill,
              opacity: off ? 0.55 : 1,
            }}
          >
            {dense ? (
              <Text style={[type.caption2, font('600'), { color: colors.textMuted }]}>
                {timeRange(b.startTime, b.endTime)}
              </Text>
            ) : (
              // start over end, so "11:30 AM – 1:00 PM" never wraps mid-time on a narrow phone
              <View style={{ width: 72 }}>
                <Text style={[type.caption, font('600'), { color: colors.text }]} numberOfLines={1}>
                  {formatTime12(b.startTime)}
                </Text>
                <Text style={[type.caption2, { color: colors.textMuted }]} numberOfLines={1}>
                  {formatTime12(b.endTime)}
                </Text>
              </View>
            )}
            <View style={{ flex: dense ? undefined : 1, minWidth: 0 }}>
              <Text
                style={[
                  dense ? type.caption : type.subhead,
                  font('600'),
                  { color: colors.text, textDecorationLine: off ? 'line-through' : 'none' },
                ]}
                numberOfLines={1}
              >
                {b.name}
              </Text>
              <Text style={type.caption2} numberOfLines={1}>
                {[
                  t('calendar.students', { count: b.studentCount }),
                  helpers.length ? helpers.join(', ') : t('calendar.you'),
                ].join(' · ')}
              </Text>
            </View>
            {off && !dense ? (
              <Chip small tone="warning" label={t('calendar.kinds.holiday')} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
