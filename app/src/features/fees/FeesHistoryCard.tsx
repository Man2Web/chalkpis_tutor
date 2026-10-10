import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Card, Chip, Skeleton } from '../../components';
import { useInstituteId } from '../../data/hooks';
import { formatINR } from '../../lib/money';
import { colors, radius, spacing, type } from '../../theme';

interface Month {
  period: string;
  billed: number;
  paid: number;
  owingStudents: number;
}

const BAR = 80;

/** Billed vs collected for the last 6 or 12 months: grey is what was billed, green how much of it came in. */
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
  const max = Math.max(1, ...data.map((m) => m.billed));
  const billed = data.reduce((s, m) => s + m.billed, 0);
  const paid = data.reduce((s, m) => s + m.paid, 0);

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={type.heading}>{t('fees.history')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {([6, 12] as const).map((n) => (
            <Chip
              key={n}
              small
              label={t('fees.historyMonths', { count: n })}
              selected={months === n}
              onPress={() => setMonths(n)}
            />
          ))}
        </View>
      </View>
      {q.isLoading ? (
        <Skeleton height={BAR + 30} />
      ) : billed === 0 ? (
        <Text style={type.caption}>{t('fees.historyEmpty')}</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: BAR + 20 }}>
            {data.map((m) => (
              <View
                key={m.period}
                style={{ flex: 1, alignItems: 'center', gap: 4 }}
                accessibilityLabel={`${m.period}: ${formatINR(m.paid)} / ${formatINR(m.billed)}`}
              >
                <View
                  style={{
                    width: '72%',
                    height: Math.max(3, (m.billed / max) * BAR),
                    borderRadius: radius.sm / 2,
                    backgroundColor: colors.border,
                    justifyContent: 'flex-end',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: m.billed ? `${Math.round((m.paid / m.billed) * 100)}%` : 0,
                      backgroundColor: colors.success,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 10, color: colors.textMuted }}>
                  {new Date(`${m.period}-01T00:00:00Z`).toLocaleDateString(locale, {
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                </Text>
              </View>
            ))}
          </View>
          <Text style={type.caption}>
            {t('fees.historySummary', { paid: formatINR(paid), billed: formatINR(billed) })}
          </Text>
        </>
      )}
    </Card>
  );
}
