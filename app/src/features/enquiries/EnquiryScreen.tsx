import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
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
import { prettyDate, shortDate, todayYmd } from '../../lib/dates';
import { normalizeIndianPhone } from '../../lib/phone';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { DateStrip } from '../attendance/DateStrip';
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
  const e = q.data?.enquiry;
  useEffect(() => {
    if (!e) return;
    setJName(e.name);
    setJParent(e.parentName);
    setJPhone(e.phone.replace(/^\+91/, ''));
    setJLevel(e.class);
    setJBatches(e.batchId ? [e.batchId] : []);
    const b = batches.data?.find((x) => x.id === e.batchId);
    if (b) setJFee(String(b.defaultFee / 100));
  }, [e, batches.data]);

  if (q.isLoading)
    return (
      <Screen>
        <Skeleton height={300} />
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
      setJoinOpen(true);
      return;
    }
    update.mutate({ id, status: s }, { onError: fail });
  };
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
  const fee = Number(jFee || '0');
  const joinValid =
    jName.trim().length >= 2 && !!normalizeIndianPhone(jPhone) && Number.isFinite(fee) && fee >= 0;
  const admit = () =>
    join.mutate(
      {
        id,
        student: {
          name: jName.trim(),
          parentName: jParent.trim(),
          parentPhone: jPhone,
          class: jLevel.trim(),
          monthlyFee: Math.round(fee * 100),
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

  return (
    <Screen>
      <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.title3}>{e.name}</Text>
            <Text style={type.footnote}>{[e.parentName, e.phone].filter(Boolean).join(' · ')}</Text>
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
            icon={<Ionicons name="logo-whatsapp" size={16} color="#1DA851" />}
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
          onPress={() => setJoinOpen(true)}
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
                onPress={() => setFollowUp(qf.date)}
              />
            ))}
            {e.nextFollowUp ? (
              <Chip label={t('enquiries.clearFollowUp')} onPress={() => setFollowUp(null)} />
            ) : null}
          </View>
          {e.nextFollowUp ? (
            <DateStrip date={e.nextFollowUp} onChange={(d) => setFollowUp(d)} allowFuture />
          ) : null}
        </View>
      )}

      <Section title={t('enquiries.details')}>
        {e.class ? <Row title={ct('level')} value={e.class} /> : null}
        {e.interest ? <Row title={t('enquiries.interest')} value={e.interest} /> : null}
        {e.batchName ? <Row title={t('enquiries.batch')} value={e.batchName} /> : null}
        <Row title={t('enquiries.source')} value={t(`enquiries.sources.${e.source}`)} />
        <Row title={t('enquiries.added')} value={prettyDate(e.createdAt.slice(0, 10), 'en-IN')} />
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
                keyboardType="number-pad"
                maxLength={8}
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
            disabled={!joinValid}
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
