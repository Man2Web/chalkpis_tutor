import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { BillingKpis, StatusBadge } from '@/components/app/billing';
import { STORE_NAME, isPlan, planName, planPrice, subscriptionState } from '@/lib/plans';
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateOnly, plural } from '@/lib/format';
import { go, useApi, useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { CentreRow } from './types';

const VIEWS = [
  ['all', 'All'],
  ['paying', 'Paying'],
  ['trial', 'Trial'],
  ['ending', 'Ending soon'],
  ['ended', 'Ended'],
] as const;
type View = (typeof VIEWS)[number][0];

const usage = (used: number, limit: number | null | undefined) => (limit == null ? `${used}` : `${used} / ${limit}`);

/** Every centre's subscription in one list: who pays, who is trying it, who ends soon, who has ended. */
export function Subscriptions({ query = {} }: { query?: Record<string, string> }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>(
    VIEWS.some(([k]) => k === query.view) ? (query.view as View) : 'all',
  );
  const dq = useDebounced(q.trim(), 280);
  const { data, error, loading, reload } = useApi<{ institutes: CentreRow[] }>(
    `/admin/api/institutes?q=${encodeURIComponent(dq)}&sort=expiring&filter=all`,
  );
  const all = data?.institutes ?? [];
  const rows = all
    .filter((c) => {
      const s = subscriptionState(c).key;
      if (view === 'paying') return (s === 'active' || s === 'ending') && c.plan !== 'trial';
      if (view === 'trial') return c.plan === 'trial' && s !== 'ended';
      if (view === 'ending') return s === 'ending';
      if (view === 'ended') return s === 'ended';
      return true;
    })
    // the ones that need attention first: ending soon, then by end date; ended ones last, most recent first
    .sort((a, b) => {
      const ea = subscriptionState(a).key === 'ended';
      const eb = subscriptionState(b).key === 'ended';
      if (ea !== eb) return ea ? 1 : -1;
      const ta = a.expiresAt ? Date.parse(a.expiresAt) : 0;
      const tb = b.expiresAt ? Date.parse(b.expiresAt) : 0;
      return ea ? tb - ta : ta - tb;
    });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Subscriptions"
        description="Every centre's plan: who pays, who is on a free trial, who ends soon and who has ended. Open a centre to extend, change or end it."
      />
      <BillingKpis onPick={(v) => setView(v)} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList className="flex h-auto flex-wrap">
            {VIEWS.map(([k, l]) => (
              <TabsTrigger key={k} value={k}>
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative lg:w-80">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search centre, owner or phone" className="pl-8" />
        </div>
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading rows={8} />
      ) : (
        <Card className={cn('py-0 transition-opacity', loading && 'opacity-60')}>
          {rows.length ? (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Centre</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ends on</TableHead>
                      <TableHead className="text-right">Students</TableHead>
                      <TableHead className="text-right">Batches</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => {
                      const st = subscriptionState(c);
                      return (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => go(`centre/${c.id}?tab=billing`)}>
                          <TableCell className="max-w-64 pl-4">
                            <span className="block truncate font-medium">{c.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{c.owner?.name || c.owner?.phone || '—'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="block">{planName(c.plan)}</span>
                            {isPlan(c.plan) && c.plan !== 'trial' ? (
                              <span className="block text-xs text-muted-foreground">
                                {c.cycle ? planPrice(c.plan, c.cycle) : 'Set by admin or an older pack'}
                                {c.store ? ` · ${STORE_NAME[c.store.name] ?? c.store.name}${c.store.willRenew ? ', renews' : ''}` : ''}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <StatusBadge s={c} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="block">{c.expiresAt ? dateOnly(c.expiresAt) : '—'}</span>
                            {st.key !== 'ended' && st.daysLeft != null ? (
                              <span className="block text-xs text-muted-foreground">{plural(st.daysLeft, 'day')} left</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular">{usage(c.students, c.studentLimit)}</TableCell>
                          <TableCell className="text-right tabular">{usage(c.batches, c.batchLimit)}</TableCell>
                          <TableCell>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-1 p-2 md:hidden">
                {rows.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => go(`centre/${c.id}?tab=billing`)}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {planName(c.plan)} · {c.expiresAt ? `until ${dateOnly(c.expiresAt)}` : '—'}
                      </span>
                    </span>
                    <StatusBadge s={c} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Empty text={dq ? 'No centre matches your search.' : 'No centre in this list right now.'} />
          )}
        </Card>
      )}
    </div>
  );
}
