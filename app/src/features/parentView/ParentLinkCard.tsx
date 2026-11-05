import { useIdempotencyKey } from '../../api/idempotency';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Card, Chip, toast } from '../../components';
import { useInstitute, useInstituteId } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { open, whatsappUrl } from '../../lib/contact';
import { prettyDate, toYmd } from '../../lib/dates';
import { formatIndianPhone } from '../../lib/phone';
import { colors, radius, spacing, type } from '../../theme';
import { createParentLink, getParentLinkStatus, revokeParentLinks, type CreatedLink } from './api';
import { LINK_DAYS, linkMessage, type LinkDays } from './logic';

interface Props {
  student: { id: string; name: string; parentName: string; parentPhone: string };
}

/** On a student's profile: make a private read-only link for the parents, send it, or switch every link off. */
export function ParentLinkCard({ student }: Props) {
  const { t } = useTranslation();
  const idem = useIdempotencyKey();
  const instituteId = useInstituteId();
  const institute = useInstitute();
  const qc = useQueryClient();
  const locale = 'en-IN';
  const [days, setDays] = useState<LinkDays>(30);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<(CreatedLink & { sent: boolean }) | null>(null);
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
      const link = await createParentLink(student.id, days, true, {
        idempotencyKey: `${idem.key}-${days}`,
      });
      idem.reset();
      setCreated(link);
      await refreshStatus();
      if (link.sent) toast(t('parentLink.sentApi'), 'success');
    } catch (e) {
      idem.settle(e);
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

  // The note that goes with the link, for the owner to send themselves when the server could not.
  const message = (url: string) =>
    linkMessage('en', {
      parent: student.parentName,
      student: student.name,
      institute: institute.data?.name ?? '',
      url,
    });
  const sendOnWhatsApp = async (url: string) => {
    if (!(await open(whatsappUrl(student.parentPhone, message(url)))))
      toast(t('students.cannotOpen'), 'error');
  };
  const share = async (url: string) => {
    try {
      await Share.share({ message: message(url) });
    } catch (e) {
      reportError(e);
      toast(t('parentLink.cannotShare'), 'error');
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
      {status.isError ? (
        // not knowing is not "no link": say so, and let them ask again
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={[type.label, { flex: 1, color: colors.danger }]}>
            {t('parentLink.statusFailed')}
          </Text>
          <Button
            variant="outline"
            size="small"
            title={t('common.retry')}
            onPress={() => void status.refetch()}
          />
        </View>
      ) : (
        <Text style={type.label}>
          {status.isLoading
            ? t('common.loading')
            : active
              ? t('parentLink.active', { count: active, date: until })
              : t('parentLink.none')}
        </Text>
      )}

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
          <Text style={[type.subhead, { color: created.sent ? colors.success : colors.warning }]}>
            {created.sent
              ? t('parentLink.sentTo', { phone: formatIndianPhone(student.parentPhone) })
              : t('parentLink.notSent')}
          </Text>
          <View
            style={{
              backgroundColor: colors.fill,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Text selectable style={type.caption2} accessibilityLabel={t('parentLink.linkLabel')}>
              {created.url}
            </Text>
          </View>
          {created.sent ? null : (
            <Button
              title={t('parentLink.sendWhatsapp')}
              icon={<Ionicons name="logo-whatsapp" size={18} color={colors.onPrimary} />}
              onPress={() => void sendOnWhatsApp(created.url)}
            />
          )}
          <Button
            variant="outline"
            title={t('parentLink.share')}
            icon={<Ionicons name="share-outline" size={18} color={colors.text} />}
            onPress={() => void share(created.url)}
          />
        </View>
      ) : null}

      {/* when the status could not be read there may be links, so switching them off stays possible */}
      {active > 0 || status.isError ? (
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
