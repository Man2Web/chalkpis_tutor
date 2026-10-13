import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dshort } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Cohort = { week: string; size: number; active: number[] };

export function Cohorts() {
  const { data, error, reload } = useApi<{ cohorts: Cohort[] }>('/admin/api/cohorts?weeks=12');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  const max = Math.max(0, ...data.cohorts.map((c) => c.active.length));
  return (
    <div className="grid gap-6">
      <PageHeader title="Retention" description="Do centres keep using Chalkpis week after week?" />
      <Card>
        <CardHeader>
          <CardTitle>Weekly retention</CardTitle>
          <CardDescription>
            Of the centres that joined each week, the share that used Chalkpis (attendance or a payment) in each week after
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data.cohorts.length ? (
            <Empty text="No centres joined in the last 12 weeks." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joined week</TableHead>
                  <TableHead className="text-right">Centres</TableHead>
                  {Array.from({ length: max }, (_, k) => (
                    <TableHead key={k} className="text-center">W{k}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.cohorts.map((c) => (
                  <TableRow key={c.week}>
                    <TableCell className="font-medium">{dshort(`${c.week}T12:00:00+05:30`)}</TableCell>
                    <TableCell className="text-right tabular">{c.size}</TableCell>
                    {Array.from({ length: max }, (_, k) => {
                      if (k >= c.active.length) return <TableCell key={k} />;
                      const p = c.size ? Math.round((c.active[k] / c.size) * 100) : 0;
                      return (
                        <TableCell key={k} className="p-1 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="rounded-md py-1.5 text-xs font-medium tabular"
                                style={{
                                  background: `color-mix(in oklch, var(--primary) ${Math.max(p, 4)}%, transparent)`,
                                  color: p > 55 ? 'var(--primary-foreground)' : undefined,
                                }}
                              >
                                {p}%
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{c.active[k]} of {c.size} active</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
