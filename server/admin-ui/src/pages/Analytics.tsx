import { useState } from 'react';
import { Delta, Empty, ErrorBox, Kpi, Loading, PageHeader } from '@/components/app/bits';
import { Bars, C, Donut, TrendChart } from '@/components/app/charts';
import { Funnel } from '@/components/app/funnel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { money, num } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { PLAN_COLOR } from '@/lib/names';
import type { Analytics as A } from './types';

const RANGES = [
  ['7', '7 days'],
  ['30', '30 days'],
  ['90', '90 days'],
  ['180', '6 months'],
] as const;

export function Analytics() {
  const [days, setDays] = useState('30');
  const { data: a, error, reload } = useApi<A>(`/admin/api/analytics?days=${days}`);
  const picker = (
    <ToggleGroup type="single" variant="outline" size="sm" value={days} onValueChange={(v) => v && setDays(v)}>
      {RANGES.map(([k, l]) => (
        <ToggleGroupItem key={k} value={k} className="px-3">{l}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!a) return <><PageHeader title="Analytics" actions={picker} /><div className="mt-6"><Loading rows={6} /></div></>;
  const t = (k: string) => a.totals[k] ?? { now: 0, before: 0 };
  const hint = (k: string) => <><Delta {...t(k)} /> vs the {days} days before</>;
  return (
    <div className="grid gap-6">
      <PageHeader title="Analytics" description="How Chalkpis is growing and being used" actions={picker} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sign-ups" value={num(t('signups').now)} hint={hint('signups')} />
        <Kpi label="Sign-ins" value={num(t('signIns').now)} hint={hint('signIns')} />
        <Kpi label="Active centres" value={num(t('activeInstitutes').now)} hint={hint('activeInstitutes')} />
        <Kpi label="Plan revenue" value={money(t('revenue').now)} hint={hint('revenue')} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Growth</CardTitle>
            <CardDescription>New tutors and how often they come back</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              dates={a.dates}
              series={[{ key: 'signups', name: 'Sign-ups', color: C.violet }, { key: 'signIns', name: 'Sign-ins', color: C.blue }]}
              values={a.series}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fees recorded by tutors</CardTitle>
            <CardDescription>Money tutors collected from parents (not Chalkpis revenue)</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart dates={a.dates} series={[{ key: 'feesRecorded', name: 'Fees', color: C.green }]} values={a.series} isMoney />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp delivery</CardTitle>
            <CardDescription>Messages accepted vs failed each day</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              dates={a.dates}
              series={[{ key: 'messagesSent', name: 'Delivered', color: '#0d9488' }, { key: 'messagesFailed', name: 'Failed', color: C.rose }]}
              values={a.series}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attendance saved</CardTitle>
            <CardDescription>Class days marked</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart dates={a.dates} series={[{ key: 'attendanceSaved', name: 'Days', color: C.blue }]} values={a.series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active plans</CardTitle>
            <CardDescription>Centres on each plan right now</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              parts={a.plans.map((p) => ({ name: p.plan, value: p.active, color: PLAN_COLOR[p.plan] ?? 'var(--muted-foreground)' }))}
              center="centres"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Plan revenue by month</CardTitle>
            <CardDescription>What centres paid Chalkpis</CardDescription>
          </CardHeader>
          <CardContent>
            {a.revenueByMonth.length ? (
              <Bars
                labels={a.revenueByMonth.map((r) => `${r.month.slice(5)}/${r.month.slice(2, 4)}`)}
                values={a.revenueByMonth.map((r) => r.amount)}
                name="Revenue"
                color={C.green}
                isMoney
              />
            ) : (
              <Empty text="No plan payments yet." />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Activation funnel</CardTitle>
          <CardDescription>How far new centres get</CardDescription>
        </CardHeader>
        <CardContent><Funnel funnel={a.funnel} /></CardContent>
      </Card>
    </div>
  );
}
