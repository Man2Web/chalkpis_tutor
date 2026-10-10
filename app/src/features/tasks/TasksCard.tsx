import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton, toast } from '../../components';
import { reportError } from '../../lib/analytics';
import { haptic } from '../../lib/haptics';
import { colors, radius, spacing, TAP, type } from '../../theme';
import { useTaskActions, useTasks, type Task } from './api';

/** Home card: the tutor's own list for the day, with a quick-add field. */
export function TasksCard({ date }: { date: string }) {
  const { t } = useTranslation();
  const tasks = useTasks(date);
  const { add, toggle, remove } = useTaskActions(date);
  const [text, setText] = useState('');

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    add.mutate(title, {
      onSuccess: () => setText(''),
      onError: (e) => {
        reportError(e);
        toast(t('common.error'), 'error');
      },
    });
  };

  const list = tasks.data ?? [];
  const open = list.filter((x) => !x.done).length;

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={type.heading}>{t('tasks.title')}</Text>
        {list.length ? <Text style={type.caption}>{t('tasks.left', { count: open })}</Text> : null}
      </View>
      {tasks.isLoading ? <Skeleton height={44} /> : null}
      {!tasks.isLoading && list.length === 0 ? (
        <Text style={type.caption}>{t('tasks.empty')}</Text>
      ) : null}
      {list.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          overdue={task.dueOn < date && !task.done}
          onToggle={() => {
            if (task.done) haptic.select();
            else haptic.success();
            toggle.mutate(task);
          }}
          onRemove={() => remove.mutate(task)}
          removeLabel={t('tasks.remove')}
        />
      ))}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderRadius: radius.md,
          backgroundColor: colors.bg,
          paddingLeft: spacing.md,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('tasks.placeholder')}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={submit}
          returnKeyType="done"
          maxLength={200}
          style={{ flex: 1, minHeight: TAP, fontSize: 15, color: colors.text }}
          accessibilityLabel={t('tasks.placeholder')}
        />
        <Pressable
          onPress={submit}
          disabled={!text.trim() || add.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('tasks.add')}
          style={{
            width: TAP,
            height: TAP,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: text.trim() ? 1 : 0.4,
          }}
        >
          <Ionicons name="add-circle" size={30} color={colors.primary} />
        </Pressable>
      </View>
    </Card>
  );
}

function TaskRow({
  task,
  overdue,
  onToggle,
  onRemove,
  removeLabel,
}: {
  task: Task;
  overdue: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TAP }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.title}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        <Ionicons
          name={task.done ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={task.done ? colors.success : overdue ? colors.warning : colors.textMuted}
        />
        <Text
          style={[
            type.body,
            { flex: 1 },
            task.done && { color: colors.textMuted, textDecorationLine: 'line-through' },
          ]}
        >
          {task.title}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        hitSlop={8}
        style={{ padding: spacing.sm }}
      >
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
