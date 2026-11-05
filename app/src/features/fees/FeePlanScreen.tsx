import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useIdempotencyKey } from '../../api/idempotency';
import {
  Button,
  Card,
  Chip,
  DateField,
  EmptyState,
  FormInput,
  Input,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import { useBatches, useInstituteId, useRefreshData, useStudents } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { todayYmd } from '../../lib/dates';
import { formatINR, parseRupeesToPaise } from '../../lib/money';
import type { FeeCycle, Student } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { createFeePlans, updateFeePlan, type FeeApiError } from './api';
import { academicYear, PART_CHOICES, partsError, splitYearly } from './plan';

const schema = z.object({
  monthlyFee: z.string().refine((v) => parseRupeesToPaise(v) !== null, 'amount'),
  feeCycle: z.enum(['monthly', 'quarterly', 'one-time', 'yearly']),
  dueDay: z.number().int('dueDay').min(1, 'dueDay').max(31, 'dueDay'),
  discount: z.string().refine((v) => v === '' || parseRupeesToPaise(v) !== null, 'amount'),
});
type Form = z.infer<typeof schema>;
const CYCLES: FeeCycle[] = ['monthly', 'quarterly', 'one-time', 'yearly'];
const cycleKey = (c: FeeCycle) => (c === 'one-time' ? 'oneTime' : c);

export function FeePlanScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'FeePlan'>) {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const students = useStudents();
  const student = students.data?.find((s) => s.id === route.params.studentId);
  const [busy, setBusy] = useState(false);
  const [cycle, setCycle] = useState<FeeCycle | null>(null);

  const values: Form | undefined = useMemo(
    () =>
      student
        ? {
            monthlyFee: String(student.monthlyFee / 100),
            feeCycle: student.feeCycle,
            dueDay: student.dueDay,
            discount: String(((student as { discount?: number }).discount ?? 0) / 100),
          }
        : undefined,
    [student],
  );
  const { control, handleSubmit, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    values,
  });

  if (students.isLoading)
    return (
      <Screen>
        <Skeleton height={48} />
      </Screen>
    );
  // a failed load with nothing cached is not "not found": offer to try again
  if (students.isError && !students.data)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void students.refetch()}
        />
      </Screen>
    );
  if (!student)
    return (
      <Screen>
        <EmptyState title={t('students.notFound')} />
      </Screen>
    );

  const shown = cycle ?? student.feeCycle;

  const submit = handleSubmit(async (f) => {
    setBusy(true);
    try {
      await updateFeePlan({
        instituteId,
        studentId: student.id,
        monthlyFee: parseRupeesToPaise(f.monthlyFee) ?? 0,
        feeCycle: shown,
        dueDay: f.dueDay,
        discount: parseRupeesToPaise(f.discount || '0') ?? 0,
      });
      await refresh();
      toast(t('students.saved'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  });

  return (
    <Screen>
      <Text style={type.title}>{student.name}</Text>
      <Text style={type.fieldLabel}>{t('students.feeCycle')}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        {CYCLES.map((c) => (
          <Chip
            key={c}
            label={t(`students.cycle.${cycleKey(c)}`)}
            selected={shown === c}
            onPress={() => {
              setCycle(c);
              // a yearly student's fee is the year's total: never let it become the monthly fee unnoticed
              if (student.feeCycle === 'yearly' && c !== 'yearly') setValue('monthlyFee', '');
            }}
          />
        ))}
      </View>

      {shown === 'yearly' ? (
        <YearlyPlanForm
          student={student}
          students={students.data ?? []}
          onDone={async () => {
            await refresh();
            navigation.goBack();
          }}
        />
      ) : (
        <>
          <Text style={[type.caption, { marginBottom: spacing.md }]}>{t('fees.planHint')}</Text>
          <FormInput
            control={control}
            name="monthlyFee"
            label={t('onboarding.monthlyFee')}
            keyboardType="decimal-pad"
          />
          <Controller
            control={control}
            name="dueDay"
            render={({ field, fieldState }) => (
              <Input
                label={t('students.dueDay')}
                value={field.value ? String(field.value) : ''}
                onChangeText={(v) => field.onChange(Number(v.replace(/\D/g, '').slice(0, 2)))}
                keyboardType="number-pad"
                error={fieldState.error ? t('validation.dueDay') : undefined}
              />
            )}
          />
          <FormInput
            control={control}
            name="discount"
            label={t('fees.recurringDiscount')}
            keyboardType="decimal-pad"
          />
          <Button title={t('common.save')} onPress={submit} loading={busy} />
        </>
      )}
    </Screen>
  );
}

interface PartText {
  amount: string;
  dueYmd: string;
}

const toText = (parts: { amount: number; dueYmd: string }[]): PartText[] =>
  parts.map((p) => ({ amount: String(p.amount / 100), dueYmd: p.dueYmd }));

/**
 * The year's fee in parts: a name, the total, how many parts and when the first is due. The parts are worked out
 * (equal, spread over the year) and can then be changed one by one. It can go to this student or to everyone active
 * in one of their batches.
 */
function YearlyPlanForm({
  student,
  students,
  onDone,
}: {
  student: Student;
  students: Student[];
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const batches = useBatches();
  const key = useIdempotencyKey();
  const today = todayYmd();
  const startTotal =
    student.feeCycle === 'yearly'
      ? student.monthlyFee
      : student.feeCycle === 'monthly'
        ? student.monthlyFee * 12
        : 0;

  const [title, setTitle] = useState(`${t('fees.yearly.defaultTitle')} ${academicYear(today)}`);
  const [total, setTotal] = useState(startTotal ? String(startTotal / 100) : '');
  const [count, setCount] = useState(3);
  const [first, setFirst] = useState(today);
  const [parts, setParts] = useState<PartText[]>(() => toText(splitYearly(startTotal, 3, today)));
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const resplit = (next: { total?: string; count?: number; first?: string }) => {
    const tot = next.total ?? total;
    const n = next.count ?? count;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(next.first ?? first) ? (next.first ?? first) : today;
    setParts(toText(splitYearly(parseRupeesToPaise(tot) ?? 0, n, start)));
  };

  const myBatches = (batches.data ?? []).filter((b) => student.batchIds.includes(b.id));
  const targets = batchId
    ? students.filter((s) => s.status === 'active' && s.batchIds.includes(batchId))
    : [student];
  const paise = parts.map((p) => ({
    amount: parseRupeesToPaise(p.amount),
    dueYmd: p.dueYmd.trim(),
  }));
  const sum = paise.reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalPaise = parseRupeesToPaise(total);
  // after a part is changed by hand the parts may no longer make the year's fee: say so, in red
  const sumOff = totalPaise !== null && sum !== totalPaise;

  const save = async () => {
    setError(undefined);
    if (!title.trim()) return setError(t('validation.required'));
    const bad = partsError(paise);
    if (bad) return setError(t(`fees.yearly.errors.${bad}`));
    setBusy(true);
    try {
      const r = await createFeePlans(
        {
          studentIds: targets.map((s) => s.id),
          title,
          parts: paise.map((p) => ({ amount: p.amount!, dueYmd: p.dueYmd })),
        },
        { idempotencyKey: key.key },
      ).then(
        (res) => {
          key.reset();
          return res;
        },
        (e: unknown) => {
          key.settle(e);
          throw e;
        },
      );
      toast(
        r.skipped.length
          ? t('fees.yearly.createdSkipped', { count: r.created, skipped: r.skipped.length })
          : t('fees.yearly.created', { count: r.created }),
        'success',
      );
      await onDone();
    } catch (e) {
      const k = (e as Error).message as FeeApiError;
      if (k === 'planExists' || k === 'partsOrder' || k === 'amount')
        setError(
          t(
            `fees.yearly.errors.${k === 'amount' ? 'amount' : k === 'partsOrder' ? 'order' : 'exists'}`,
          ),
        );
      else {
        reportError(e);
        toast(t('common.error'), 'error');
      }
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>
        {t('fees.yearly.hint', { name: student.name })}
      </Text>
      <Input label={t('fees.yearly.title')} value={title} onChangeText={setTitle} maxLength={60} />
      <Input
        label={t('fees.yearly.total')}
        value={total}
        onChangeText={(v) => {
          setTotal(v);
          resplit({ total: v });
        }}
        keyboardType="decimal-pad"
      />
      <Text style={type.fieldLabel}>{t('fees.yearly.parts')}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        {PART_CHOICES.map((n) => (
          <Chip
            key={n}
            label={t('fees.yearly.partsCount', { count: n })}
            selected={count === n}
            onPress={() => {
              setCount(n);
              resplit({ count: n });
            }}
          />
        ))}
      </View>
      <DateField
        label={t('fees.yearly.firstDue')}
        value={first}
        onChange={(v) => {
          setFirst(v);
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) resplit({ first: v });
        }}
      />

      <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
        {parts.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('fees.yearly.partAmount', { n: i + 1 })}
                value={p.amount}
                onChangeText={(v) =>
                  setParts((all) => all.map((x, j) => (j === i ? { ...x, amount: v } : x)))
                }
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <DateField
                label={t('fees.dueDate')}
                value={p.dueYmd}
                onChange={(v) =>
                  setParts((all) => all.map((x, j) => (j === i ? { ...x, dueYmd: v } : x)))
                }
              />
            </View>
          </View>
        ))}
        <Text
          style={[type.footnote, { color: sumOff ? colors.danger : colors.textMuted }]}
          accessibilityLiveRegion="polite"
        >
          {sumOff
            ? t('fees.yearly.sumOff', { amount: formatINR(sum), total: formatINR(totalPaise ?? 0) })
            : t('fees.yearly.sum', { amount: formatINR(sum) })}
        </Text>
      </Card>

      {myBatches.length ? (
        <>
          <Text style={type.fieldLabel}>{t('fees.yearly.for')}</Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            <Chip
              label={t('fees.yearly.onlyStudent', { name: student.name })}
              selected={batchId === null}
              onPress={() => setBatchId(null)}
            />
            {myBatches.map((b) => (
              <Chip
                key={b.id}
                label={t('fees.yearly.wholeBatch', { batch: b.name })}
                selected={batchId === b.id}
                onPress={() => setBatchId(b.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      {error ? (
        <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.sm }]}>
          {error}
        </Text>
      ) : null}
      <Button
        title={t('fees.yearly.save', { count: targets.length })}
        onPress={save}
        loading={busy}
        disabled={!targets.length}
      />
    </View>
  );
}
