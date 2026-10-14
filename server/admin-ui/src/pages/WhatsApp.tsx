import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Empty, ErrorBox, Kpi, Loading, PageHeader } from '@/components/app/bits';
import { Pill } from '@/components/app/pill';
import { toast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { plural, when } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { MESSAGE_TYPES, msgType, type Tone } from '@/lib/names';
import { cn } from '@/lib/utils';
import { ByType } from './Centre';
import { Ring } from './Overview';

type Msg = {
  id: string;
  type: string;
  status: string;
  why: string | null;
  to: string;
  manual: boolean;
  institute: string;
  student: string;
  createdAt: string;
};
type Res = {
  messages: Msg[];
  summary: { type: string; status: string; count: number }[];
  topErrors: { error: string; count: number }[];
};
const STATUS = [
  ['all', 'All'],
  ['failed', 'Failed'],
  ['queued', 'Waiting'],
  ['sent', 'Sent'],
  ['skipped', 'Skipped'],
] as const;
const TONE: Record<string, Tone> = { sent: 'green', failed: 'red', skipped: 'neutral', queued: 'blue', sending: 'blue' };

export function WhatsApp() {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('any');
  const params = new URLSearchParams({ limit: '150' });
  if (status !== 'all') params.set('status', status);
  if (type !== 'any') params.set('type', type);
  const { data, error, loading, reload } = useApi<Res>(`/admin/api/messages?${params}`);
  const [retrying, setRetrying] = useState<string | null>(null);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  const tot = (s: string) => data.summary.filter((r) => r.status === s).reduce((a, r) => a + r.count, 0);
  const total = data.summary.reduce((a, r) => a + r.count, 0);
  const sent = tot('sent');
  const rate = total ? Math.round((sent / total) * 100) : 0;
  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await api('POST', `/admin/api/messages/${id}/retry`);
      toast('Queued again');
      await reload();
    } catch (e) {
      toast((e as ApiError).code === 'cannot_retry' ? 'Too old to retry' : (e as Error).message, false);
    } finally {
      setRetrying(null);
    }
  };
  return (
    <div className="grid gap-6">
      <PageHeader title="WhatsApp" description="Every message Chalkpis sends to parents: what went out, what failed and why. Failed ones can be retried." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sent · 7 d" value={sent} hint="accepted by the WhatsApp gateway" />
        <Kpi label="Failed · 7 d" value={<span className={cn(tot('failed') && 'text-rose-600 dark:text-rose-400')}>{tot('failed')}</span>} hint="the gateway refused them" />
        <Kpi label="Skipped · 7 d" value={tot('skipped')} hint="messages off, opted out or no template" />
        <Card className="flex-row items-center gap-4 px-4 py-4">
          <Ring pct={rate} label="Sent rate" color={rate >= 90 ? 'var(--chart-2)' : 'var(--chart-3)'} />
          <div className="text-sm text-muted-foreground">{plural(total, 'message')} this week</div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Why messages did not go</CardTitle>
            <CardDescription>Top reasons this week</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {data.topErrors.length ? (
              data.topErrors.map((e) => (
                <div key={e.error} className="flex items-center justify-between gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{e.error}</code>
                  <span className="font-medium tabular">{e.count}</span>
                </div>
              ))
            ) : (
              <Empty text="Nothing failed this week." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By message type</CardTitle>
            <CardDescription>Sent of total, this week</CardDescription>
          </CardHeader>
          <CardContent><ByType rows={data.summary} empty="No messages this week." /></CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>{STATUS.map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList>
        </Tabs>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Every type</SelectItem>
            {Object.entries(MESSAGE_TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card className={cn('py-0 transition-opacity', loading && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">When</TableHead>
              <TableHead>Centre · student</TableHead>
              <TableHead className="hidden md:table-cell">Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.messages.length ? (
              data.messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="pl-4 text-muted-foreground">{when(m.createdAt)}</TableCell>
                  <TableCell>
                    <div className="max-w-[16rem] truncate font-medium">{m.institute}</div>
                    <div className="text-xs text-muted-foreground">{m.student} · {m.to}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div>{msgType(m.type)}</div>
                    <div className="text-xs text-muted-foreground">{m.manual ? 'sent by tutor' : 'automatic'}</div>
                  </TableCell>
                  <TableCell>
                    <Pill tone={TONE[m.status] ?? 'neutral'}>{m.status === 'queued' ? 'waiting' : m.status}</Pill>
                    {m.why ? <div className="mt-0.5 text-xs text-muted-foreground">{m.why}</div> : null}
                  </TableCell>
                  <TableCell className="pr-4">
                    {m.status === 'failed' ? (
                      <Button variant="outline" size="sm" disabled={retrying === m.id} onClick={() => void retry(m.id)}>
                        <RotateCcw /> Retry
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={5}><Empty text="No messages." /></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
