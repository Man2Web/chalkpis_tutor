import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Button, Card, toast } from '../../components';
import { useInstituteId, useRefreshData } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { formatINR } from '../../lib/money';
import { colors, spacing, type } from '../../theme';

interface PaymentReport {
  id: string;
  studentName: string;
  amountPaise: number;
  owePaise: number;
  upiRef: string;
  reportedAt: string;
}

/**
 * Parents who tapped "I've paid" in a fee reminder (they paid the tutor directly, which Chalkpis cannot see). Confirm
 * records the payment and sends the WhatsApp receipt; Not received just closes it. Hidden when there are none.
 */
export function PaymentReportsCard() {
  const { t } = useTranslation();
  const id = useInstituteId();
  const refresh = useRefreshData();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['paymentReports', id],
    queryFn: async () => (await api<{ reports: PaymentReport[] }>('GET', '/fees/reports')).reports,
    refetchInterval: 60_000,
  });
  const reports = q.data ?? [];
  if (!reports.length) return null;

  const decide = async (r: PaymentReport, confirm: boolean) => {
    setBusy(`${r.id}:${confirm}`);
    try {
      await api('POST', `/fees/reports/${r.id}/${confirm ? 'confirm' : 'reject'}`);
      toast(
        t(confirm ? 'paidReports.confirmed' : 'paidReports.rejected', { name: r.studentName }),
        'success',
      );
      await refresh();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <Text style={type.heading}>{t('paidReports.title', { count: reports.length })}</Text>
      {reports.map((r) => (
        <View key={r.id} style={{ gap: spacing.xs }}>
          <Text style={type.body}>
            {t('paidReports.says', { name: r.studentName, amount: formatINR(r.amountPaise) })}
          </Text>
          {r.upiRef ? (
            <Text style={[type.caption, { color: colors.textMuted }]}>
              {t('paidReports.ref', { ref: r.upiRef })}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                size="small"
                title={t('paidReports.confirm')}
                onPress={() => void decide(r, true)}
                loading={busy === `${r.id}:true`}
                disabled={busy !== null}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                size="small"
                variant="secondary"
                title={t('paidReports.notReceived')}
                onPress={() => void decide(r, false)}
                loading={busy === `${r.id}:false`}
                disabled={busy !== null}
              />
            </View>
          </View>
        </View>
      ))}
      <Text style={type.caption}>{t('paidReports.hint')}</Text>
    </Card>
  );
}
