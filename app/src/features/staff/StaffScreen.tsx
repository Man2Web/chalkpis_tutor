import { useIdempotencyKey } from '../../api/idempotency';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  EmptyState,
  Input,
  InsetSeparator,
  ListItem,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import { useBatches, useRefreshData, useStaff } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { formatIndianPhone } from '../../lib/phone';
import { colors, radius, spacing, type } from '../../theme';
import {
  addStaff,
  removeStaff,
  setStaffBatches,
  staffErrorKey,
  staffFormError,
  type StaffMember,
} from './api';

/** The owner's helpers: invite by phone, choose which batches each may take attendance for, remove. */
export function StaffScreen() {
  const { t } = useTranslation();
  const idem = useIdempotencyKey();
  const staff = useStaff();
  const batches = useBatches();
  const refresh = useRefreshData();
  const active = (batches.data ?? []).filter((b) => b.status === 'active');
  const nameOfBatch = (id: string) => batches.data?.find((b) => b.id === id)?.name ?? '—';

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  // the helper waiting for "Remove?"; the edit sheet closes first so two sheets never stack
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const fail = (e: unknown) => {
    reportError(e);
    const key = staffErrorKey(e);
    setError(t(key === 'generic' ? 'common.error' : `staff.errors.${key}`));
  };

  const openAdd = () => {
    setName('');
    setPhone('');
    setPicked([]);
    setError(undefined);
    setAdding(true);
  };
  const openEdit = (m: StaffMember) => {
    setPicked(m.batchIds);
    setError(undefined);
    setEditing(m);
  };

  const submitAdd = async () => {
    if (staffFormError(name, phone)) return setError(t('staff.errors.invalid'));
    setBusy(true);
    setError(undefined);
    try {
      await addStaff({ name, phone, batchIds: picked }, { idempotencyKey: idem.key });
      idem.reset();
      await refresh();
      setAdding(false);
      toast(t('staff.added'), 'success');
    } catch (e) {
      idem.settle(e);
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setError(undefined);
    try {
      await setStaffBatches(editing.id, picked);
      await refresh();
      setEditing(null);
      toast(t('staff.saved'), 'success');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await removeStaff(removing.id);
      await refresh();
      setRemoving(null);
      toast(t(removing.status === 'invited' ? 'staff.cancelled' : 'staff.removed'), 'success');
    } catch (e) {
      // the edit sheet is closed by now, so the reason goes in a toast
      reportError(e);
      const key = staffErrorKey(e);
      toast(t(key === 'generic' ? 'common.error' : `staff.errors.${key}`), 'error');
    } finally {
      setBusy(false);
    }
  };

  const batchChips = (
    <View style={{ gap: spacing.sm }}>
      <Text style={type.fieldLabel}>{t('staff.batches')}</Text>
      {active.length === 0 ? (
        <Text style={type.caption}>{t('staff.noBatchesYet')}</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {active.map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              selected={picked.includes(b.id)}
              onPress={() => toggle(b.id)}
            />
          ))}
        </View>
      )}
    </View>
  );

  if (staff.isLoading || batches.isLoading)
    return (
      <Screen>
        <Skeleton height={120} />
      </Screen>
    );
  // a failed refresh keeps the list on screen; only a first load with nothing to show becomes an error
  if (staff.isError && !staff.data)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void staff.refetch()}
        />
      </Screen>
    );

  const list = staff.data ?? [];
  return (
    <Screen>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>{t('staff.help')}</Text>
      {list.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t('staff.emptyTitle')}
          message={t('staff.emptyMessage')}
        />
      ) : (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {list.map((m, i) => (
            <View key={m.id}>
              {i > 0 ? <InsetSeparator /> : null}
              <ListItem
                title={m.name}
                subtitle={[
                  m.status === 'invited' ? t('staff.invitedNotJoined') : undefined,
                  formatIndianPhone(m.phone),
                  m.batchIds.length
                    ? m.batchIds.map(nameOfBatch).join(', ')
                    : t('staff.noneAssigned'),
                ]
                  .filter(Boolean)
                  .join(' • ')}
                left={<Avatar name={m.name} />}
                onPress={() => openEdit(m)}
              />
            </View>
          ))}
        </View>
      )}
      <View style={{ height: spacing.lg }} />
      <Button title={t('staff.add')} onPress={openAdd} />

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title={t('staff.add')}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
          <Input label={t('staff.name')} value={name} onChangeText={setName} autoComplete="name" />
          <Input
            label={t('staff.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            prefix="+91"
            maxLength={16}
            placeholder="98765 43210"
            error={error}
          />
          {batchChips}
          <Button title={t('staff.invite')} onPress={submitAdd} loading={busy} />
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.name}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
          <Card style={{ gap: spacing.xs }}>
            <Text style={type.body}>{editing ? formatIndianPhone(editing.phone) : ''}</Text>
          </Card>
          {batchChips}
          {!!error && <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>}
          <Button title={t('common.save')} onPress={submitEdit} loading={busy} />
          {editing?.status === 'invited' ? (
            <Text style={type.caption}>{t('staff.invitedNote')}</Text>
          ) : null}
          <Button
            variant="danger"
            title={t(editing?.status === 'invited' ? 'staff.cancelInvite' : 'staff.remove')}
            onPress={() => {
              setRemoving(editing);
              setEditing(null);
            }}
            disabled={busy}
          />
        </ScrollView>
      </BottomSheet>

      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title={t(removing?.status === 'invited' ? 'staff.cancelTitle' : 'staff.removeTitle', {
          name: removing?.name ?? '',
        })}
        message={t(removing?.status === 'invited' ? 'staff.cancelNote' : 'staff.removeNote')}
        confirmLabel={t(
          removing?.status === 'invited' ? 'staff.cancelConfirm' : 'staff.removeConfirm',
        )}
        onConfirm={remove}
        loading={busy}
        destructive
      />
    </Screen>
  );
}
