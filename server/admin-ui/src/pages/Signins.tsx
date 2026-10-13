import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { Pill } from '@/components/app/pill';
import { openUser } from '@/components/app/user';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { when } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type Row = { phone: string; userId: string | null; name: string | null; at: string; result: string };

export function Signins() {
  const { data, error, reload } = useApi<{ logins: Row[] }>('/admin/api/logins');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  return (
    <div className="grid gap-6">
      <PageHeader title="Sign-ins" description="The last 100 login codes asked for in the app, and what happened" />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">When</TableHead>
              <TableHead>Number</TableHead>
              <TableHead className="hidden md:table-cell">Name</TableHead>
              <TableHead className="pr-4">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.logins.length ? (
              data.logins.map((r, i) => (
                <TableRow key={i} className={cn(r.userId && 'cursor-pointer')} onClick={() => r.userId && openUser(r.userId)}>
                  <TableCell className="pl-4 text-muted-foreground">{when(r.at)}</TableCell>
                  <TableCell className="tabular">{r.phone}</TableCell>
                  <TableCell className="hidden md:table-cell">{r.name || '—'}</TableCell>
                  <TableCell className="pr-4">
                    <Pill tone={r.result === 'signed in' ? 'green' : r.result.startsWith('wrong') ? 'red' : 'neutral'}>{r.result}</Pill>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={4}><Empty text="No login codes in the last day." /></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
