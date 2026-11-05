import { useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  DateField,
  EmptyState,
  Input,
  Row,
  Screen,
  Section,
  Skeleton,
  toast,
} from '../../components';
import { useBatches, useInstitute } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { useCategory } from '../../lib/category';
import { callUrl, open, whatsappUrl } from '../../lib/contact';
import { prettyDate, shortDate, todayYmd, toYmd } from '../../lib/dates';
import { parseRupeesToPaise } from '../../lib/money';
import { formatIndianPhone, nationalNumber, normalizeIndianPhone } from '../../lib/phone';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useEnquiry, useEnquiryActions } from './api';
import {
  followUpLabel,
  quickFollowUps,
  STAGES,
  stageTone,
  welcomeMessage,
  type Stage,
} from './logic';

/**
 * One enquiry: call or WhatsApp the family, move it along (New → Follow-up → Trial class → Joined, or Not
 * interested), set the next follow-up, keep notes of every talk, and admit the child as a student in one step.
 */
export function EnquiryScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'Enquiry'>) {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const id = route.params.id;
  const q = useEnquiry(id);
  const institute = useInstitute();
  const batches = useBatches();
  const { update, addNote, remove, join } = useEnquiryActions();
  const [note, setNote] = useState('');
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // the admission form, filled from the enquiry
  const [jName, setJName] = useState('');
  const [jParent, setJParent] = useState('');
  const [jPhone, setJPhone] = useState('');
  const [jLevel, setJLevel] = useState('');
  const [jFee, setJFee] = useState('');
  const [jBatches, setJBatches] = useState<string[]>([]);
  // the admission form's mistakes, shown once Add student is tapped
  const [jTried, setJTried] = useState(false);
  const e = q.data?.enquiry;

  if (q.isLoading)
    return (
      <Screen>
        <Skeleton height={300} />
      </Screen>
    );
  // a failed load (no internet) is not a deleted enquiry: offer to try again
  if (q.isError && !e)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void q.refetch()}
        />
      </Screen>
    );
  if (!e)
    return (
      <Screen>
        <EmptyState title={t('enquiries.notFound')} />
      </Screen>
    );

  const today = todayYmd();
  const follow = followUpLabel(t, e.nextFollowUp, today, (d) => shortDate(d, 'en-IN'));
  const closed = e.status === 'joined' || e.status === 'lost';
  const fail = (err: unknown) => {
    reportError(err);
    toast(t('common.error'), 'error');
  };
  const setStage = (s: Stage) => {
    if (s === e.status) return;
    if (s === 'lost') {
      setLostReason(e.lostReason);
      setLostOpen(true);
      return;
    }
    if (s === 'joined' && !e.studentId) {
      openJoin();
      return;
    }
    update.mutate({ id, status: s }, { onError: fail });
  };
  // the screen shows the new day at once (the enquiry is updated in place before the server answers)
  const setFollowUp = (d: string | null) =>
    update.mutate(
      { id, nextFollowUp: d, ...(d && e.status === 'new' ? { status: 'follow_up' as const } : {}) },
      { onError: fail },
    );
  const sendNote = () => {
    const text = note.trim();
    if (!text) return;
    addNote.mutate({ id, note: text }, { onSuccess: () => setNote(''), onError: fail });
  };
  // the admission form, filled from the enquiry each time it opens
  const openJoin = () => {
    setJName(e.name);
    setJParent(e.parentName);
    setJPhone(nationalNumber(e.phone));
    setJLevel(e.class);
    setJBatches(e.batchId ? [e.batchId] : []);
    const b = batches.data?.find((x) => x.id === e.batchId);
    setJFee(b ? String(b.defaultFee / 100) : '');
    setJTried(false);
    setJoinOpen(true);
  };
  // "1,500" and "₹1500" are both fine; an empty fee is no fee
  const fee = jFee.trim() ? parseRupeesToPaise(jFee) : 0;
  const joinErrors = {
    name: jName.trim().length < 2 ? t('enquiries.nameTooShort') : undefined,
    phone: !normalizeIndianPhone(jPhone) ? t('validation.phone') : undefined,
    fee: fee === null ? t('validation.amount') : undefined,
  };
  const admit = () => {
    setJTried(true);
    if (fee === null || Object.values(joinErrors).some(Boolean)) return;
    join.mutate(
      {
        id,
        student: {
          name: jName.trim(),
          parentName: jParent.trim(),
          parentPhone: jPhone,
          class: jLevel.trim(),
          monthlyFee: fee,
          batchIds: jBatches,
        },
      },
      {
        onSuccess: (r) => {
          setJoinOpen(false);
          toast(t('enquiries.admitted', { name: jName.trim() }), 'success');
          navigation.replace('StudentProfile', { id: r.studentId });
        },
        onError: (err) => {
          const code = (err as { code?: string }).code;
          if (code === 'plan_limit') toast(t('enquiries.planLimit'), 'error');
          else fail(err);
        },
      },
    );
  };

  return (
    <Screen>
      <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.title3}>{e.name}</Text>
            <Text style={type.footnote}>
              {[e.parentName, formatIndianPhone(e.phone)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Chip small tone={stageTone(e.status)} label={t(`enquiries.stage.${e.status}`)} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            size="small"
            variant="outline"
            title={t('enquiries.call')}
            icon={<Ionicons name="call-outline" size={16} color={colors.text} />}
            onPress={() => void open(callUrl(e.phone))}
          />
          <Button
            size="small"
            variant="outline"
            title={t('enquiries.whatsapp')}
            icon={<Ionicons name="logo-whatsapp" size={16} color={colors.whatsapp} />}
            onPress={() =>
              void open(
                whatsappUrl(
                  e.phone,
                  welcomeMessage(t, {
                    institute: institute.data?.name ?? '',
                    parent: e.parentName,
                    child: e.name,
                    interest: e.interest || e.batchName || '',
                  }),
                ),
              )
            }
          />
        </View>
      </Card>

      <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>
        {t('enquiries.stageLabel')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.lg,
        }}
      >
        {STAGES.map((s) => (
          <Chip
            key={s}
            label={t(`enquiries.stage.${s}`)}
            selected={e.status === s}
            tone={e.status === s ? stageTone(s) : 'neutral'}
            onPress={() => setStage(s)}
          />
        ))}
      </View>
      {e.status === 'lost' && e.lostReason ? (
        <Text style={[type.caption, { marginTop: -spacing.md, marginBottom: spacing.lg }]}>
          {t('enquiries.lostBecause', { reason: e.lostReason })}
        </Text>
      ) : null}

      {e.studentId ? (
        <Button
          variant="secondary"
          title={t('enquiries.openStudent')}
          onPress={() => navigation.navigate('StudentProfile', { id: e.studentId! })}
          style={{ marginBottom: spacing.lg }}
        />
      ) : (
        <Button
          title={t('enquiries.admit')}
          icon={<Ionicons name="person-add-outline" size={18} color={colors.onPrimary} />}
          onPress={openJoin}
          style={{ marginBottom: spacing.lg }}
        />
      )}

      {closed ? null : (
        <View style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={[type.fieldLabel, { flex: 1 }]}>{t('enquiries.nextFollowUp')}</Text>
            {follow ? <Chip small tone={follow.tone} label={follow.text} /> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {quickFollowUps(today).map((qf) => (
              <Chip
                key={qf.key}
                label={t(`enquiries.quick.${qf.key}`)}
                selected={e.nextFollowUp === qf.date}
                onPress={() => {
                  if (e.nextFollowUp !== qf.date) setFollowUp(qf.date);
                }}
              />
            ))}
            <Chip
              label={t('enquiries.noFollowUp')}
              selected={!e.nextFollowUp}
              onPress={() => {
                if (e.nextFollowUp) setFollowUp(null);
              }}
            />
          </View>
          <DateField
            label={t('enquiries.followUpDate')}
            value={e.nextFollowUp ?? ''}
            onChange={(d) => setFollowUp(d || null)}
            minDate={today}
            clearable
          />
        </View>
      )}

      <Section title={t('enquiries.details')}>
        {e.class ? <Row title={ct('level')} value={e.class} /> : null}
        {e.interest ? <Row title={t('enquiries.interest')} value={e.interest} /> : null}
        {e.batchName ? <Row title={t('enquiries.batch')} value={e.batchName} /> : null}
        <Row title={t('enquiries.source')} value={t(`enquiries.sources.${e.source}`)} />
        <Row
          title={t('enquiries.added')}
          // the day in India, not in UTC (an enquiry at 1 am is not the day before)
          value={prettyDate(toYmd(new Date(e.createdAt)), 'en-IN')}
        />
        <Row
          icon="create-outline"
          iconColor={colors.gray}
          title={t('enquiries.editDetails')}
          onPress={() => navigation.navigate('EnquiryForm', { id })}
        />
      </Section>

      <Card style={{ gap: spacing.md, marginBottom: spacing.lg }}>
        <Text style={type.heading}>{t('enquiries.notes')}</Text>
        <Input
          label={t('enquiries.addNote')}
          value={note}
          onChangeText={setNote}
          placeholder={t('enquiries.notePlaceholder')}
          maxLength={1000}
          onSubmitEditing={sendNote}
          returnKeyType="send"
        />
        <Button
          size="small"
          variant="secondary"
          title={t('enquiries.saveNote')}
          onPress={sendNote}
          loading={addNote.isPending}
          disabled={!note.trim()}
        />
        {(q.data?.notes ?? []).map((n) => (
          <View
            key={n.id}
            style={{
              gap: 2,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: spacing.sm,
            }}
          >
            <Text style={type.caption2}>
              {new Date(n.createdAt).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
            <Text style={type.subhead}>{n.note}</Text>
          </View>
        ))}
      </Card>

      <Button variant="ghost" title={t('enquiries.delete')} onPress={() => setDeleteOpen(true)} />

      <BottomSheet
        visible={lostOpen}
        onClose={() => setLostOpen(false)}
        title={t('enquiries.lostTitle')}
      >
        <View style={{ gap: spacing.md }}>
          <Input
            label={t('enquiries.lostReason')}
            value={lostReason}
            onChangeText={setLostReason}
            placeholder={t('enquiries.lostPlaceholder')}
            maxLength={200}
          />
          <Button
            title={t('enquiries.markLost')}
            loading={update.isPending}
            onPress={() =>
              update.mutate(
                { id, status: 'lost', lostReason: lostReason.trim() },
                { onSuccess: () => setLostOpen(false), onError: fail },
              )
            }
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={joinOpen}
        onClose={() => setJoinOpen(false)}
        title={t('enquiries.admitTitle')}
      >
        <View style={{ gap: spacing.sm }}>
          <Input
            label={t('enquiries.childName')}
            value={jName}
            onChangeText={setJName}
            maxLength={80}
            error={jTried ? joinErrors.name : undefined}
          />
          <Input
            label={t('enquiries.parentName')}
            value={jParent}
            onChangeText={setJParent}
            maxLength={80}
          />
          <Input
            label={t('enquiries.phone')}
            value={jPhone}
            onChangeText={setJPhone}
            prefix="+91"
            keyboardType="phone-pad"
            maxLength={14}
            error={jTried ? joinErrors.phone : undefined}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input label={ct('level')} value={jLevel} onChangeText={setJLevel} maxLength={30} />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={t('enquiries.monthlyFee')}
                value={jFee}
                onChangeText={setJFee}
                prefix="₹"
                keyboardType="decimal-pad"
                maxLength={10}
                error={jTried ? joinErrors.fee : undefined}
              />
            </View>
          </View>
          <Text style={type.fieldLabel}>{t('enquiries.batches')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(batches.data ?? [])
              .filter((b) => b.status === 'active')
              .map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  selected={jBatches.includes(b.id)}
                  onPress={() =>
                    setJBatches((xs) =>
                      xs.includes(b.id) ? xs.filter((x) => x !== b.id) : [...xs, b.id],
                    )
                  }
                />
              ))}
          </View>
          <Button
            title={t('enquiries.admitConfirm')}
            loading={join.isPending}
            onPress={admit}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('enquiries.deleteTitle')}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={type.body}>{t('enquiries.deleteText')}</Text>
          <Button
            variant="danger"
            title={t('enquiries.delete')}
            loading={remove.isPending}
            onPress={() =>
              remove.mutate(id, {
                onSuccess: () => {
                  setDeleteOpen(false);
                  navigation.goBack();
                },
                onError: fail,
              })
            }
          />
          <Button
            variant="secondary"
            title={t('common.cancel')}
            onPress={() => setDeleteOpen(false)}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
