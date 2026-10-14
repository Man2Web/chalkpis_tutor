import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { Pill } from '@/components/app/pill';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { when } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { AUDIT } from '@/lib/names';

type Row = { at: string; admin: string; action: string; target: string | null; detail: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Audit() {
  const { data, error, reload } = useApi<{ audit: Row[] }>('/admin/api/audit');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  return (
    <div className="grid gap-6">
      <PageHeader title="Audit log" description="Everything an admin changed, exported or signed in for, newest first: who, what and when." />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">When</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="hidden md:table-cell">Who</TableHead>
              <TableHead className="hidden pr-4 lg:table-cell">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.audit.length ? (
              data.audit.map((r, i) => {
                const a = AUDIT[r.action] ?? { label: r.action.replace(/-/g, ' '), tone: r.action.includes('fail') || r.action.includes('locked') ? 'red' : 'blue' };
                return (
                  <TableRow key={i}>
                    <TableCell className="pl-4 text-muted-foreground">{when(r.at)}</TableCell>
                    <TableCell className="max-w-[14rem] truncate">{r.admin}</TableCell>
                    <TableCell><Pill tone={a.tone} className="capitalize">{a.label}</Pill></TableCell>
                    <TableCell className="hidden md:table-cell">{r.target || '—'}</TableCell>
                    <TableCell className="hidden max-w-[20rem] truncate pr-4 text-muted-foreground lg:table-cell">
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
    </div>
  );
}
