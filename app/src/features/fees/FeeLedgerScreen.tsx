import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  ActionButton,
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  ListItem,
  Screen,
  Section,
  Skeleton,
  toast,
} from '../../components';
import {
  useInstituteId,
  useRefreshData,
  useStudentDues,
  useStudentPayments,
  useStudents,
} from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { prettyDate, todayYmd, toYmd } from '../../lib/dates';
import { formatINR, parseRupeesToPaise } from '../../lib/money';
import type { FeeDue } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { addCharge, setDiscount, setWaived, type FeeApiError } from './api';
import { isOverdue, netDue, outstanding, periodLabel, reversedIds } from './logic';

const PRESETS = ['admission', 'books', 'other'] as const;

export function FeeLedgerScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'FeeLedger'>) {
  const { t, i18n } = useTranslation();
  const { studentId } = route.params;
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const students = useStudents();
  const dues = useStudentDues(studentId);
  const payments = useStudentPayments(studentId);
  const student = students.data?.find((s) => s.id === studentId);
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const today = todayYmd();

  const [charge, setCharge] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [chargeDate, setChargeDate] = useState(today);
  const [selected, setSelected] = useState<FeeDue | null>(null);
  const [discount, setDiscountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();

  if (students.isLoading || dues.isLoading)
    return (
      <Screen>
        <Skeleton height={96} />
      </Screen>
    );
  if (!student)
    return (
      <Screen>
        <EmptyState title={t('students.notFound')} />
      </Screen>
    );

  const list = dues.data ?? [];
  const owe = list.reduce((s, d) => s + outstanding(d), 0);
  const reversed = reversedIds(payments.data ?? []);
  const nextDue = [...list]
    .filter((d) => outstanding(d) > 0)
    .sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis())[0];

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setFormError(undefined);
    try {
      await fn();
      await refresh();
      if (done) toast(done, 'success');
      return true;
    } catch (e) {
      const key = (e as Error).message as FeeApiError;
      if (key === 'amount' || key === 'tooBig') setFormError(t(`fees.errors.${key}`));
      else {
        reportError(e);
        toast(t('common.error'), 'error');
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveCharge = async () => {
    const paise = parseRupeesToPaise(amount);
    if (!desc.trim()) return setFormError(t('validation.required'));
    if (paise === null || paise <= 0) return setFormError(t('fees.errors.amount'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chargeDate)) return setFormError(t('validation.date'));
    const ok = await run(
      () =>
        addCharge({
          instituteId,
          studentId,
          description: desc,
          amount: paise,
          dueYmd: chargeDate,
        }).then(() => undefined),
      t('fees.chargeAdded'),
    );
    if (ok) {
      setCharge(false);
      setDesc('');
      setAmount('');
    }
  };

  const saveDiscount = async () => {
    if (!selected) return;
    const paise = parseRupeesToPaise(discount || '0');
    if (paise === null) return setFormError(t('fees.errors.amount'));
    const ok = await run(
      () => setDiscount({ instituteId, due: selected, discount: paise }),
      t('fees.discountSaved'),
    );
    if (ok) setSelected(null);
  };

  const toggleWaive = async () => {
    if (!selected) return;
    const ok = await run(
      () => setWaived({ instituteId, due: selected, waived: selected.status !== 'waived' }),
      t(selected.status === 'waived' ? 'fees.restored' : 'fees.waivedToast'),
    );
    if (ok) setSelected(null);
  };

  const statusChip = (d: FeeDue) => {
    if (d.status === 'paid') return <Chip small label={t('fees.status.paid')} tone="success" />;
    if (d.status === 'waived') return <Chip small label={t('fees.status.waived')} />;
    if (isOverdue({ ...d, dueDate: toYmd(d.dueDate.toDate()) }, today))
      return <Chip small label={t('fees.overdue')} tone="danger" />;
    return (
      <Chip
        small
        label={t(d.status === 'partial' ? 'fees.status.partial' : 'fees.status.pending')}
        tone="warning"
      />
    );
  };

  const owesTone = owe > 0 ? colors.warning : colors.success;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 4, marginTop: spacing.sm }}>
        <Avatar name={student.name} uri={student.photoUrl} size={64} />
        <Text style={[type.title3, { textAlign: 'center' }]}>{student.name}</Text>
        <Text style={type.footnote}>
          {t('fees.monthlyIs', { fee: formatINR(student.monthlyFee) })}
        </Text>
      </View>

      <Card style={{ alignItems: 'center', gap: 2, marginVertical: spacing.md }}>
        <Text style={type.footnote}>{owe > 0 ? t('fees.totalDue') : t('students.allPaid')}</Text>
        <Text style={[type.largeTitle, { color: owe > 0 ? colors.text : owesTone }]}>
          {formatINR(owe)}
        </Text>
        {nextDue ? (
          <Button
            style={{ alignSelf: 'stretch', marginTop: spacing.md }}
            title={t('fees.collect')}
            onPress={() => navigation.navigate('CollectFee', { dueId: nextDue.id })}
          />
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        <ActionButton
          icon="add-circle"
          label={t('fees.addChargeShort')}
          onPress={() => {
            setFormError(undefined);
            setCharge(true);
          }}
        />
        {student.feeCycle === 'monthly' && student.monthlyFee > 0 ? (
          <ActionButton
            icon="calendar"
            label={t('fees.advanceShort')}
            onPress={() => navigation.navigate('AdvancePayment', { studentId })}
          />
        ) : null}
        <ActionButton
          icon="options"
          label={t('fees.planShort')}
          onPress={() => navigation.navigate('FeePlan', { studentId })}
        />
        <ActionButton
          icon="notifications"
          label={t('fees.remind')}
          onPress={() => navigation.navigate('Reminder', { studentId })}
          disabled={owe <= 0}
        />
      </View>

      <Section title={t('fees.dues')} footer={list.length ? t('fees.duesFooter') : undefined}>
        {list.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title={t('fees.noDues')}
            message={t('fees.noDuesHint')}
          />
        ) : null}
        {list.map((d) => (
          <ListItem
            key={d.id}
            title={`${d.description} · ${periodLabel(d.period, locale)}`}
            subtitle={`${formatINR(netDue(d))}${d.discount ? ` (${t('fees.discountOf', { amount: formatINR(d.discount) })})` : ''} · ${t('fees.paidOf', { amount: formatINR(d.paid) })}`}
            right={statusChip(d)}
            onPress={() => {
              setSelected(d);
              setDiscountText(String(d.discount / 100));
              setFormError(undefined);
            }}
          />
        ))}
      </Section>

      <Section title={t('fees.payments')}>
        {(payments.data ?? []).length === 0 ? (
          <Text style={[type.subhead, { padding: spacing.lg, color: colors.textMuted }]}>
            {t('fees.noPayments')}
          </Text>
        ) : null}
        {(payments.data ?? []).map((p) => (
          <ListItem
            key={p.id}
            title={p.amount < 0 ? t('fees.reversalTitle') : (p.receiptNo ?? '')}
            subtitle={`${prettyDate(toYmd(p.paidAt.toDate()), locale)} · ${t(`fees.mode.${p.mode}`)}`}
            right={
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text
                  style={[type.label, { color: p.amount < 0 ? colors.danger : colors.success }]}
                >
                  {formatINR(p.amount)}
                </Text>
                {reversed.has(p.id) ? (
                  <Chip small label={t('fees.reversedChip')} tone="danger" />
                ) : null}
              </View>
            }
            onPress={() => navigation.navigate('Receipt', { paymentId: p.id })}
          />
        ))}
      </Section>

      <BottomSheet visible={charge} onClose={() => setCharge(false)} title={t('fees.addCharge')}>
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            marginBottom: spacing.md,
            flexWrap: 'wrap',
          }}
        >
          {PRESETS.filter((p) => p !== 'other').map((p) => (
            <Chip
              key={p}
              label={t(`fees.preset.${p}`)}
              selected={desc === t(`fees.preset.${p}`)}
              onPress={() => setDesc(t(`fees.preset.${p}`))}
            />
          ))}
        </View>
        <Input label={t('fees.chargeFor')} value={desc} onChangeText={setDesc} maxLength={60} />
        <Input
          label={t('fees.chargeAmount')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
        <Input
          label={t('fees.dueDate')}
          value={chargeDate}
          onChangeText={setChargeDate}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          error={formError}
        />
        <Button title={t('common.save')} onPress={saveCharge} loading={busy} />
      </BottomSheet>

      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.description} • ${periodLabel(selected.period, locale)}` : ''}
      >
        {selected ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={type.body}>
              {t('fees.balanceDue', { amount: formatINR(outstanding(selected)) })}
            </Text>
            {outstanding(selected) > 0 ? (
              <Button
                title={t('fees.collect')}
                onPress={() => {
                  const id = selected.id;
                  setSelected(null);
                  navigation.navigate('CollectFee', { dueId: id });
                }}
              />
            ) : null}
            <Input
              label={t('fees.discountAmount')}
              value={discount}
              onChangeText={setDiscountText}
              keyboardType="decimal-pad"
              error={formError}
            />
            <Button
              variant="secondary"
              title={t('fees.saveDiscount')}
              onPress={saveDiscount}
              loading={busy}
            />
            <Button
              variant={selected.status === 'waived' ? 'secondary' : 'danger'}
              title={t(selected.status === 'waived' ? 'fees.restore' : 'fees.waive')}
              onPress={toggleWaive}
              disabled={busy}
            />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
