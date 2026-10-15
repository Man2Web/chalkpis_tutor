import { Download } from 'lucide-react';
import type { BillingData } from '@/components/app/billing';
import { ErrorBox, Kpi, Loading, PageHeader } from '@/components/app/bits';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money } from '@/lib/format';
import { planName } from '@/lib/plans';
import { useApi } from '@/lib/hooks';

const SOURCES = [
  ['appStore', 'App Store (in the iPhone app)'],
  ['googlePlay', 'Google Play (in the Android app)'],
  ['website', 'Website (Razorpay)'],
  ['manual', 'Recorded by an admin'],
] as const;

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const monthName = (ym: string) =>
  new Date(`${ym}-15T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

/** One CSV of every number on this page, for investors and the accountant (a leading =, +, - or @ is neutralised). */
function toCsv(d: BillingData): string {
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rupees = (p: number) => (p / 100).toFixed(2);
  const s = d.summary;
  const lines: unknown[][] = [
    ['Chalkpis revenue and growth', new Date().toISOString().slice(0, 10)],
    [],
    ['Metric', 'Value'],
    ['MRR (INR)', rupees(s.mrr)],
    ['ARR (INR)', rupees(s.arr)],
    ['ARPU per month (INR)', rupees(s.arpu)],
    ['Paying centres', s.paying],
    ['Paying in the app (App Store / Google Play)', s.inStore],
    ['On free trial', s.trials],
    ['Renewing automatically', s.autoRenewing],
    ['  of them on the website (UPI Autopay / card)', s.autoRenewingWeb],
    ['Monthly plans', s.byCycle.month],
    ['Yearly plans', s.byCycle.year],
    ['Older packs', s.byCycle.pack],
    ['Churn last month (centres)', `${s.churnLastMonth.churned} of ${s.churnLastMonth.paying}`],
    ['Revenue this month, gross (INR)', rupees(s.revenueThisMonth)],
    ['Revenue this month, net of store fees (INR)', rupees(s.netThisMonth)],
    ['Revenue all time, gross (INR)', rupees(s.revenueAllTime)],
    ['Revenue all time, net of store fees (INR)', rupees(s.netAllTime)],
    [],
    ['Month', 'Gross (INR)', 'Net (INR)', 'Payments'],
    ...d.months.map((m) => [m.month, rupees(m.gross), rupees(m.net), m.payments]),
    [],
    ['Source', 'Gross this month', 'Net this month', 'Gross all time', 'Net all time', 'Payments'],
    ...SOURCES.map(([k, label]) => {
      const x = d.sources[k];
      return [label, rupees(x.grossThisMonth), rupees(x.netThisMonth), rupees(x.grossAllTime), rupees(x.netAllTime), x.payments];
    }),
    [],
    ['Sign-up month', 'Sign-ups', 'Paid', 'Conversion'],
    ...d.conversion.map((c) => [c.month, c.signups, c.paid, pct(c.paid, c.signups)]),
  ];
  return lines.map((r) => r.map(cell).join(',')).join('\n');
}

function download(d: BillingData) {
  const url = URL.createObjectURL(new Blob([toCsv(d)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `chalkpis-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Revenue and growth: the numbers investors ask for (MRR, ARR, ARPU, conversion, churn), revenue month by month and
 * by where it was paid, and how centres pay. Store test purchases are left out everywhere.
 */
export function Revenue() {
  const { data, error, reload } = useApi<BillingData>('/admin/api/billing?limit=1');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  const s = data.summary;
  const signups = data.conversion.reduce((a, c) => a + c.signups, 0);
  const paid = data.conversion.reduce((a, c) => a + c.paid, 0);
  const top = Math.max(1, ...data.months.map((m) => m.gross));
  const churn = s.churnLastMonth;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Revenue & growth"
        description="Recurring revenue, conversion and churn, revenue by month and by where it was paid. Net is after Apple's and Google's tax and commission; store test purchases are not counted."
        actions={
          <Button variant="outline" onClick={() => download(data)}>
            <Download /> Download CSV
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Monthly recurring revenue" value={money(s.mrr)} hint="List price of the plans running now, per month" />
        <Kpi label="Annual run rate (ARR)" value={money(s.arr)} hint="MRR × 12" />
        <Kpi label="Average per paying centre" value={money(s.arpu)} hint="ARPU, per month" />
        <Kpi
          label="Paying centres"
          value={s.paying}
          hint={`${s.inStore} paying in the app · ${s.trials} on free trial`}
        />
        <Kpi
          label="Renewing automatically"
          value={`${s.autoRenewing} (${pct(s.autoRenewing, s.paying)})`}
          hint={`${s.autoRenewingWeb} by UPI Autopay or card on the website · ${s.autoRenewing - s.autoRenewingWeb} in the apps`}
        />
        <Kpi
          label="Trial to paid"
          value={pct(paid, signups)}
          hint={`${paid} of ${signups} centres that joined in the last 6 months have paid`}
        />
        <Kpi
          label="Churn last month"
          value={churn.rate == null ? '—' : `${Math.round(churn.rate * 100)}%`}
          hint={`${churn.churned} of ${churn.paying} paying centres did not renew`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by month</CardTitle>
            <CardDescription>Gross money received; the darker part is what we keep after store fees.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.months.map((m) => (
              <div key={m.month} className="grid grid-cols-[4.5rem_1fr_6rem] items-center gap-3 text-sm">
                <span className="text-muted-foreground">{monthName(m.month)}</span>
                <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${(m.gross / top) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(m.net / top) * 100}%` }} />
                </div>
                <span className="text-right font-medium tabular">{money(m.gross)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How centres pay</CardTitle>
            <CardDescription>Plans running now.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Yearly</TableCell>
                  <TableCell className="text-right tabular">{s.byCycle.year}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(s.byCycle.year, s.paying)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Monthly</TableCell>
                  <TableCell className="text-right tabular">{s.byCycle.month}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(s.byCycle.month, s.paying)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Older packs or set by an admin</TableCell>
                  <TableCell className="text-right tabular">{s.byCycle.pack}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(s.byCycle.pack, s.paying)}</TableCell>
                </TableRow>
                {(['starter', 'standard', 'pro'] as const).map((p) => (
                  <TableRow key={p}>
                    <TableCell>{planName(p)}</TableCell>
                    <TableCell className="text-right tabular">{s.byPlan[p] ?? 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{pct(s.byPlan[p] ?? 0, s.paying)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by where it was paid</CardTitle>
          <CardDescription>In the apps through Apple and Google (about 15% commission), or on the website through Razorpay (about 2%).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">This month</TableHead>
                <TableHead className="text-right">Net this month</TableHead>
                <TableHead className="text-right">All time</TableHead>
                <TableHead className="text-right">Net all time</TableHead>
                <TableHead className="text-right">Payments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SOURCES.map(([k, label]) => {
                const x = data.sources[k];
                return (
                  <TableRow key={k}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="text-right tabular">{money(x.grossThisMonth)}</TableCell>
                    <TableCell className="text-right tabular">{money(x.netThisMonth)}</TableCell>
                    <TableCell className="text-right tabular">{money(x.grossAllTime)}</TableCell>
                    <TableCell className="text-right tabular">{money(x.netAllTime)}</TableCell>
                    <TableCell className="text-right tabular">{x.payments}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trial to paid, by sign-up month</CardTitle>
          <CardDescription>Of the centres that joined each month, how many have paid for a plan so far.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Centres</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.conversion.length ? (
                data.conversion.map((c) => (
                  <TableRow key={c.month}>
                    <TableCell>{monthName(c.month)}</TableCell>
                    <TableCell className="text-right tabular">{c.signups}</TableCell>
                    <TableCell className="text-right tabular">{c.paid}</TableCell>
                    <TableCell className="text-right font-medium tabular">{pct(c.paid, c.signups)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No sign-ups in the last 6 months.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
