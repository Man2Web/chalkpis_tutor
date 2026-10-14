import { useState } from 'react';
import { Search } from 'lucide-react';
import { PaymentsTable, type BillingData } from '@/components/app/billing';
import { Delta, ErrorBox, Kpi, Loading, PageHeader } from '@/components/app/bits';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money, plural } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const VIEWS = [
  ['all', 'All'],
  ['paid', 'Paid'],
  ['refunded', 'Refunded'],
  ['refused', 'Refused'],
  ['test', 'Store tests'],
] as const;

/** Every plan payment: in the store apps, through the payment link (Razorpay) or recorded by an admin. */
export function Payments() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof VIEWS)[number][0]>('all');
  const dq = useDebounced(q.trim(), 280);
  const { data, error, loading, reload } = useApi<BillingData>(
    `/admin/api/billing?status=${status}&q=${encodeURIComponent(dq)}&limit=300`,
  );
  const s = data?.summary;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Payments"
        description="Every plan payment, newest first: in the iPhone and Android apps (App Store, Google Play), on the website (Razorpay), or recorded by an admin (cash, bank, UPI). Refused ones were not applied, usually because the amount did not match the plan. Store tests are App Review and tester purchases; they are not revenue."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="This month"
          value={s ? money(s.revenueThisMonth) : '…'}
          hint={s ? <><Delta now={s.revenueThisMonth} before={s.revenueLastMonth} /> vs last month</> : undefined}
        />
        <Kpi label="Last month" value={s ? money(s.revenueLastMonth) : '…'} />
        <Kpi label="All time" value={s ? money(s.revenueAllTime) : '…'} hint={s ? plural(s.paymentsAllTime, 'payment') : undefined} />
        <Kpi label="Monthly recurring revenue" value={s ? money(s.mrr) : '…'} hint="From the plans running now" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList>
            {VIEWS.map(([k, l]) => (
              <TabsTrigger key={k} value={k}>
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-80">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search centre, payment id or reference" className="pl-8" />
        </div>
      </div>
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading rows={8} />
      ) : (
        <Card className={cn('transition-opacity', loading && 'opacity-60')}>
          <CardContent>
            <PaymentsTable rows={data.payments} showCentre empty={dq || status !== 'all' ? 'No payment matches.' : 'No plan payments yet.'} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
