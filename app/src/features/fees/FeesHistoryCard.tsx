import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { BarChart } from 'panelui-native/components/bar-chart';
import { Panel, Segmented, Skeleton } from '../../components';
import { useInstituteId } from '../../data/hooks';
import { formatINR } from '../../lib/money';
import { colors, spacing, type } from '../../theme';

/** What was billed: a grey that stays visible next to the green and on a white card. */
const BILLED = '#D4D4D4';

interface Month {
  period: string;
  billed: number;
  paid: number;
  owingStudents: number;
}

/**
 * Billed (grey) against collected (green) for the last 6 or 12 months, with the share collected in the header, an
 * amount axis and a legend; touch a month for the exact figures.
 */
export function FeesHistoryCard() {
  const { t, i18n } = useTranslation();
  const id = useInstituteId();
  const [months, setMonths] = useState<6 | 12>(6);
  const q = useQuery({
    queryKey: ['feesHistory', id, months],
    queryFn: async () =>
      (await api<{ months: Month[] }>('GET', `/reports/fees-history?months=${months}`)).months,
  });
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const data = q.data ?? [];
  const billed = data.reduce((s, m) => s + m.billed, 0);
  const paid = data.reduce((s, m) => s + m.paid, 0);

  const monthName = (period: string) =>
    new Date(`${period}-01T00:00:00Z`).toLocaleDateString(locale, {
      month: 'short',
      timeZone: 'UTC',
    });

  const share = billed > 0 ? Math.round((paid / billed) * 100) : null;
  // ₹12,000 -> "₹12k" on the axis; the tooltip shows the exact amount
  const axis = (rupees: number) =>
    rupees >= 100000
      ? `₹${(rupees / 100000).toFixed(rupees % 100000 ? 1 : 0)}L`
      : rupees >= 1000
        ? `₹${(rupees / 1000).toFixed(rupees % 1000 ? 1 : 0)}k`
        : `₹${rupees}`;

  return (
    <Panel
      title={t('fees.history')}
      right={share !== null ? t('fees.historyShare', { percent: share }) : undefined}
      bodyStyle={{ gap: spacing.md }}
    >
      <Segmented
        options={[
          { value: '6', label: t('fees.historyMonths', { count: 6 }) },
          { value: '12', label: t('fees.historyMonths', { count: 12 }) },
        ]}
        value={String(months) as '6' | '12'}
        onChange={(v) => setMonths(Number(v) as 6 | 12)}
      />
      {q.isLoading ? (
        <Skeleton height={180} />
      ) : billed === 0 ? (
        <Text style={[type.caption, { textAlign: 'center', paddingVertical: spacing.xl }]}>
          {t('fees.historyEmpty')}
        </Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <View
            accessibilityLabel={data
              .map((m) => `${monthName(m.period)}: ${formatINR(m.paid)} of ${formatINR(m.billed)}`)
              .join(', ')}
          >
            <BarChart
              data={data.map((m) => ({
                month: monthName(m.period),
                billed: m.billed / 100,
                collected: m.paid / 100,
              }))}
              xDataKey="month"
              aspectRatio={1.8}
            >
              <BarChart.Grid />
              <BarChart.Bar dataKey="billed" color={BILLED} cornerRadius={5} />
              <BarChart.Bar dataKey="collected" color={colors.successFill} cornerRadius={5} />
              <BarChart.YAxis ticks={3} format={axis} />
              {/* a year of month names does not fit a phone: one letter each, as phone charts do (touch for the month) */}
              <BarChart.XAxis
                format={(d) => (months === 12 ? String(d.month).slice(0, 1) : String(d.month))}
              />
              <BarChart.Tooltip formatValue={(v) => formatINR(v * 100)} />
            </BarChart>
          </View>
          {/* the legend sits under the chart, never over the bars */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.lg }}>
            {[
              [BILLED, t('fees.billed')],
              [colors.successFill, t('fees.collected')],
            ].map(([c, label]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
                <Text style={type.caption}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={[type.caption, { textAlign: 'center' }]}>
            {t('fees.historySummary', { paid: formatINR(paid), billed: formatINR(billed) })}
          </Text>
        </View>
      )}
    </Panel>
  );
}
