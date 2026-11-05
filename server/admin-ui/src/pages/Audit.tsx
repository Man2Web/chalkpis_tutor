import { useState } from 'react';
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { Pill } from '@/components/app/pill';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateOnly, when } from '@/lib/format';
import { go, useApi } from '@/lib/hooks';
import { AUDIT } from '@/lib/names';
import { cn } from '@/lib/utils';

type Row = { at: string; admin: string; action: string; target: string | null; instituteId: string | null; detail: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOW = [
  ['changes', 'Changes'],
  ['sign-ins', 'Team sign-ins'],
  ['all', 'Everything'],
] as const;

export function Audit() {
  const [show, setShow] = useState<string>('changes');
  const { data, error, loading, reload } = useApi<{ audit: Row[] }>(`/admin/api/audit?show=${show}&limit=300`);
  return (
    <div className="grid gap-6">
      <PageHeader title="Audit log" description="What the team changed, exported or deleted, and every dashboard sign-in: who, what and when. Newest first, the last 300." />
      <Tabs value={show} onValueChange={setShow}>
        <TabsList>{SHOW.map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList>
      </Tabs>
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading rows={8} />
      ) : (
        <Card className={cn('py-0 transition-opacity', loading && 'opacity-60')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Team member</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">On</TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.audit.length ? (
                data.audit.map((r, i) => {
                  const a = AUDIT[r.action] ?? { label: r.action.replace(/-/g, ' '), tone: r.action.includes('fail') || r.action.includes('locked') ? 'red' : 'blue' };
                  return (
                    <TableRow key={i}>
                      <TableCell className="pl-4 text-muted-foreground" title={dateOnly(r.at)}>{when(r.at)}, {new Date(r.at).getFullYear()}</TableCell>
                      <TableCell className="max-w-[14rem] truncate">{r.admin}</TableCell>
                      <TableCell><Pill tone={a.tone}>{a.label}</Pill></TableCell>
                      <TableCell className="hidden md:table-cell">
                        {r.instituteId ? (
                          <button className="text-left hover:underline" onClick={() => go(`centre/${r.instituteId}`)}>{r.target}</button>
                        ) : (
                          r.target || '—'
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[24rem] truncate pr-4 text-muted-foreground lg:table-cell" title={r.detail ?? ''}>
                        {r.detail && !UUID.test(r.detail) ? r.detail : ''}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={5}><Empty text="Nothing yet." /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
