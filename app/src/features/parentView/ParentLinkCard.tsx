import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Card, Chip, toast } from '../../components';
import { useInstituteId } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { prettyDate, toYmd } from '../../lib/dates';
import { spacing, type } from '../../theme';
import { createParentLink, getParentLinkStatus, revokeParentLinks, type CreatedLink } from './api';
import { LINK_DAYS, type LinkDays } from './logic';

interface Props {
  student: { id: string; name: string; parentName: string; parentPhone: string };
}

/** On a student's profile: make a private read-only link for the parents, send it, or switch every link off. */
export function ParentLinkCard({ student }: Props) {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const qc = useQueryClient();
  const locale = 'en-IN';
  const [days, setDays] = useState<LinkDays>(30);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [confirm, setConfirm] = useState(false);

  const status = useQuery({
    queryKey: ['parentLink', instituteId, student.id],
    queryFn: () => getParentLinkStatus(student.id),
    retry: 0,
  });
  const refreshStatus = () =>
    qc.invalidateQueries({ queryKey: ['parentLink', instituteId, student.id] });

  const create = async () => {
    setBusy(true);
    try {
      const link = await createParentLink(student.id, days);
      setCreated(link);
      await refreshStatus();
      if (link.sent) toast(t('parentLink.sentApi'), 'success');
    } catch (e) {
      reportError(e);
      toast(t('parentLink.failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await revokeParentLinks(student.id);
      setCreated(null);
      setConfirm(false);
      await refreshStatus();
      toast(t('parentLink.revoked'), 'success');
    } catch (e) {
      reportError(e);
      toast(t('parentLink.failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const active = status.data?.active ?? 0;
  const until = status.data?.latestExpiresAt
    ? prettyDate(toYmd(new Date(status.data.latestExpiresAt)), locale)
    : '';

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={type.heading}>{t('parentLink.title')}</Text>
      <Text style={type.caption}>{t('parentLink.help')}</Text>
      <Text style={type.label}>
        {status.isLoading
          ? t('common.loading')
          : active
            ? t('parentLink.active', { count: active, date: until })
            : t('parentLink.none')}
      </Text>

      <Text style={[type.caption, { marginTop: spacing.xs }]}>{t('parentLink.validFor')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {LINK_DAYS.map((d) => (
          <Chip
            key={d}
            label={t('parentLink.days', { count: d })}
            selected={days === d}
            onPress={() => setDays(d)}
          />
        ))}
      </View>
      <Button
        title={t('parentLink.createAndSend')}
        onPress={create}
        loading={busy && !confirm}
        disabled={busy}
      />

      {created ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text
            selectable
            style={[type.caption, { fontSize: 12 }]}
            accessibilityLabel={t('parentLink.linkLabel')}
          >
            {created.url}
          </Text>
        </View>
      ) : null}

      {active > 0 ? (
        <Button
          variant="ghost"
          title={t('parentLink.revokeAll')}
          onPress={() => setConfirm(true)}
          disabled={busy}
        />
      ) : null}

      <BottomSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={t('parentLink.revokeTitle')}
      >
        <Text style={[type.body, { marginBottom: spacing.md }]}>
          {t('parentLink.revokeHelp', { name: student.name })}
        </Text>
        <View style={{ gap: spacing.sm }}>
          <Button
            variant="danger"
            title={t('parentLink.revokeConfirm')}
            onPress={revoke}
            loading={busy}
          />
          <Button
            variant="ghost"
            title={t('common.cancel')}
            onPress={() => setConfirm(false)}
            disabled={busy}
          />
        </View>
      </BottomSheet>
    </Card>
  );
}
