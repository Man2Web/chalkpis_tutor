import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Empty, ErrorBox, Health, Loading, PageHeader } from '@/components/app/bits';
import { StatusBadge } from '@/components/app/billing';
import { planName, subscriptionState } from '@/lib/plans';
import { Tag } from '@/components/app/tags';
import { toast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadCsv } from '@/lib/api';
import { ago, dateOnly, money, plural } from '@/lib/format';
import { go, useApi, useDebounced } from '@/lib/hooks';
import { category, TAGS, tagLabel } from '@/lib/names';
import { cn } from '@/lib/utils';
import type { CentreRow } from './types';

const FILTERS = [
  ['all', 'All centres'],
  ['trial', 'On trial'],
  ['paid', 'Paid'],
  ['ended', 'Plan ended'],
  ['at-risk', 'At risk'],
] as const;
const SORTS = [
  ['activity', 'Last active'],
  ['students', 'Most students'],
  ['health', 'Lowest health'],
  ['newest', 'Newest'],
  ['expiring', 'Plan ending soon'],
] as const;

export function PlanCell({ plan, active, expiresAt }: { plan: string | null; active: boolean; expiresAt: string | null }) {
  const st = subscriptionState({ plan, planActive: active, expiresAt });
  return (
    <div className="grid gap-0.5">
      <span className="flex items-center gap-1.5">
        {planName(plan)} <StatusBadge s={{ plan, planActive: active, expiresAt }} />
      </span>
      {expiresAt ? (
        <span className="text-xs text-muted-foreground">
          {st.key === 'ended' ? 'Ended' : 'Until'} {dateOnly(expiresAt)}
        </span>
      ) : null}
    </div>
  );
}

export function Centres({ query }: { query: Record<string, string> }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(query.filter ?? 'all');
  const [sort, setSort] = useState(query.sort ?? 'activity');
  const [tag, setTag] = useState('any');
  const dq = useDebounced(q.trim(), 280);
  const url = `/admin/api/institutes?q=${encodeURIComponent(dq)}&sort=${sort}&filter=${filter}`;
  const { data, error, loading, reload } = useApi<{ institutes: CentreRow[] }>(url);
  const rows = (data?.institutes ?? []).filter((c) => tag === 'any' || c.tags.includes(tag));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Centres"
        description={`Every class, academy and institute using Chalkpis${data ? ` · ${plural(rows.length, 'centre')}${tag !== 'any' || filter !== 'all' || dq ? ' match' : ''}` : ''}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv('/admin/api/export/institutes.csv', 'chalkpis-centres.csv')
                .then(() => toast('Downloaded chalkpis-centres.csv'))
                .catch((e: Error) => toast(e.message, false))
            }
          >
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search centre, owner or phone" className="pl-8" />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full lg:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{FILTERS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-full lg:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any tag</SelectItem>
              {TAGS.map((t) => <SelectItem key={t} value={t} className="capitalize">{tagLabel(t)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full lg:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading rows={8} />
      ) : (
        <Card className={cn('py-0 transition-opacity', loading && 'opacity-60')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Centre</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="hidden md:table-cell">Last active</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Fees · 30d</TableHead>
                <TableHead className="hidden text-right lg:table-cell">WhatsApp · 30d</TableHead>
                <TableHead className="pr-4">Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => go(`centre/${c.id}`)}>
                    <TableCell className="max-w-[18rem] pl-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                          {c.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {category(c.category)} · {c.owner ? [c.owner.name, c.owner.phone].filter(Boolean).join(' · ') || '—' : '—'}
                          </div>
                          {c.tags.length ? <div className="mt-1 flex flex-wrap gap-1">{c.tags.map((t) => <Tag key={t} t={t} />)}</div> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><PlanCell plan={c.plan} active={c.planActive} expiresAt={c.expiresAt} /></TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium tabular">{c.students}</div>
                      <div className="text-xs text-muted-foreground">{plural(c.batches, 'batch', 'batches')} · {plural(c.staff, 'helper')}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{ago(c.lastActivityAt)}</TableCell>
                    <TableCell className="hidden text-right tabular lg:table-cell">{money(c.collected30)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      <div className="tabular">{c.messages30}</div>
                      {c.failed30 ? <div className="text-xs text-rose-600 dark:text-rose-400">{c.failed30} failed</div> : null}
                    </TableCell>
                    <TableCell className="pr-4"><Health score={c.health} /></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={7}><Empty text="No centres match." /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
