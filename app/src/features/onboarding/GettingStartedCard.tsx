import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components';
import {
  useBatches,
  useInstitute,
  useInstituteId,
  useNotifySettings,
  useStudents,
} from '../../data/hooks';
import { todayYmd } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { readFlag, setFlag } from '../../lib/onceFlag';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';

/**
 * "Get started" on Home for a new centre: the four things that make Chalkpis useful, each ticked off by what the owner
 * has actually done, each one tap away. It disappears once all are done, or when the owner hides it.
 */
export function GettingStartedCard({ hasAttendance }: { hasAttendance: boolean }) {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const id = useInstituteId();
  const flag = `checklist_hidden_${id}`;
  const [hidden, setHidden] = useState<boolean | null>(null);
  const students = useStudents();
  const batches = useBatches();
  const inst = useInstitute();
  const notify = useNotifySettings();

  useEffect(() => {
    let live = true;
    void readFlag(flag).then((h) => live && setHidden(h));
    return () => {
      live = false;
    };
  }, [flag]);

  if (hidden !== false || !students.data || !batches.data || !inst.data || !notify.data)
    return null;
  const firstBatch = batches.data[0];
  const steps = [
    {
      key: 'students',
      done: students.data.length > 0,
      go: () => nav.navigate('StudentForm', firstBatch ? { batchId: firstBatch.id } : undefined),
    },
    {
      key: 'attendance',
      done: hasAttendance,
      go: () =>
        firstBatch
          ? nav.navigate('MarkAttendance', { batchId: firstBatch.id, date: todayYmd() })
          : nav.navigate('BatchForm'),
    },
    {
      key: 'payments',
      done: !!(inst.data.upiId || inst.data.paymentLink),
      go: () => nav.navigate('PaymentSettings'),
    },
    {
      key: 'messages',
      done: !!notify.data.enabled,
      go: () => nav.navigate('NotificationSettings'),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    void setFlag(flag);
  };

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={type.heading}>{t('getStarted.title')}</Text>
          <Pressable accessibilityRole="button" onPress={hide} hitSlop={10}>
            <Text style={[type.footnote, { color: colors.textMuted }]}>{t('getStarted.hide')}</Text>
          </Pressable>
        </View>
        <Text style={[type.footnote, { color: colors.textMuted }]}>
          {t('getStarted.progress', { done, total: steps.length })}
        </Text>
        <View
          style={{ height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden' }}
        >
          <View
            style={{
              width: `${(done / steps.length) * 100}%`,
              height: '100%',
              backgroundColor: colors.text,
            }}
          />
        </View>
      </View>
      {steps.map((s) => (
        <Pressable
          key={s.key}
          accessibilityRole="button"
          accessibilityState={{ checked: s.done }}
          disabled={s.done}
          onPress={() => {
            haptic.select();
            s.go();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: pressed ? colors.fill : 'transparent',
          })}
        >
          <Ionicons
            name={s.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={s.done ? colors.success : colors.textFaint}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[
                type.body,
                s.done ? { color: colors.textMuted, textDecorationLine: 'line-through' } : null,
              ]}
            >
              {t(`getStarted.${s.key}.title`)}
            </Text>
            {s.done ? null : (
              <Text style={[type.footnote, { color: colors.textMuted }]}>
                {t(`getStarted.${s.key}.text`)}
              </Text>
            )}
          </View>
          {s.done ? null : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
        </Pressable>
      ))}
    </Card>
  );
}
