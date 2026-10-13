import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { money, num } from '@/lib/format';
import { go, useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { CentreRow } from './types';

const BOARDS = [
  { title: 'Most students', sub: 'Active students', key: 'students', fmt: num, bar: 'bg-sky-500' },
  { title: 'Top collectors', sub: 'Fees recorded, last 30 days', key: 'collected30', fmt: money, bar: 'bg-emerald-500' },
  { title: 'Most engaged with parents', sub: 'WhatsApp sent, last 30 days', key: 'messages30', fmt: num, bar: 'bg-teal-500' },
] as const;
const MEDAL = ['text-yellow-500', 'text-zinc-400', 'text-orange-700'];

export function Leaders() {
  const { data, error, reload } = useApi<{ institutes: CentreRow[] }>('/admin/api/institutes?sort=students');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  return (
    <div className="grid gap-6">
      <PageHeader title="Leaderboard" description="The centres doing the most with Chalkpis" />
      <div className="grid gap-4 xl:grid-cols-3">
        {BOARDS.map((b) => {
          const rows = [...data.institutes]
            .filter((c) => (c[b.key] as number) > 0)
            .sort((x, y) => (y[b.key] as number) - (x[b.key] as number))
            .slice(0, 10);
          const max = rows.length ? (rows[0][b.key] as number) : 1;
          return (
            <Card key={b.key}>
              <CardHeader>
                <CardTitle>{b.title}</CardTitle>
                <CardDescription>{b.sub}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 px-3">
                {rows.length ? (
                  rows.map((c, i) => (
                    <button key={c.id} onClick={() => go(`centre/${c.id}`)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/60">
                      <span className={cn('w-5 text-center text-sm font-semibold tabular', MEDAL[i] ?? 'text-muted-foreground')}>{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="tabular">{b.fmt(c[b.key] as number)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span className={cn('block h-full rounded-full', b.bar)} style={{ width: `${((c[b.key] as number) / max) * 100}%` }} />
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <Empty text="Nothing to rank yet." />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
