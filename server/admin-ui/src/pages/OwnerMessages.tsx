import { useState } from 'react';
import { Send } from 'lucide-react';
import { Empty, ErrorBox, Kpi, Loading } from '@/components/app/bits';
import { confirmDialog } from '@/components/app/dialogs';
import { Pill } from '@/components/app/pill';
import { toast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { go, useApi } from '@/lib/hooks';
import { plural, when } from '@/lib/format';
import { msgType, type Tone } from '@/lib/names';
import { cn } from '@/lib/utils';
import { ByType } from './Centre';

type OwnerMsg = {
  instituteId: string;
  type: string;
  status: string;
  why: string;
  to: string;
  recipient: string;
  toOwner: boolean;
  institute: string;
  createdAt: string;
};
type Res = {
  messages: OwnerMsg[];
  summary: { type: string; status: string; count: number }[];
  topErrors: { error: string; count: number }[];
  noWelcome: { instituteId: string; name: string; owner: string; createdAt: string; hasPhone: boolean }[];
};
const STATUS = [
  ['all', 'All'],
  ['failed', 'Failed'],
  ['queued', 'Waiting'],
  ['sent', 'Sent'],
  ['skipped', 'Skipped'],
] as const;
const TONE: Record<string, Tone> = { sent: 'green', failed: 'red', skipped: 'neutral', queued: 'blue', sending: 'blue' };
/** Plain words for why a message to an owner did not go. */
const WHY: Record<string, string> = {
  'bad-phone': 'no valid mobile number',
  'no-template': 'no WhatsApp template set for it',
  'not-configured': 'WhatsApp not set up on the server',
};

/**
 * Messages Chalkpis sends to a centre's own people: the owner's welcome, plan active, plan ending and ended, and helper
 * invites. New centres whose owner never got a welcome are listed on their own, with a button to send it.
 */
export function OwnerMessages() {
  const [status, setStatus] = useState('all');
  const params = new URLSearchParams({ limit: '150' });
  if (status !== 'all') params.set('status', status);
  const { data, error, loading, reload } = useApi<Res>(`/admin/api/owner-messages?${params}`);
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  const tot = (s: string) => data.summary.filter((r) => r.status === s).reduce((a, r) => a + r.count, 0);

  const sendWelcome = async (instituteId: string, name: string, again: boolean) => {
    const ok = await confirmDialog({
      title: again ? `Send ${name}'s welcome again?` : `Send ${name} its welcome?`,
      body: "The owner gets the welcome message on WhatsApp now, with today's trial end date.",
      action: 'Send welcome',
    });
    if (!ok) return;
    setBusy(instituteId);
    try {
      await api('POST', `/admin/api/institutes/${instituteId}/welcome`);
      toast('Welcome queued; it goes out within a minute');
      await reload();
    } catch (e) {
      const code = (e as ApiError).code;
      toast(code === 'no_phone' ? 'The owner has no mobile number' : code === 'in_progress' ? 'One is already on its way' : (e as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Sent · 7 d" value={tot('sent')} hint="accepted by the WhatsApp gateway" />
        <Kpi
          label="Failed · 7 d"
          value={<span className={cn(tot('failed') && 'text-rose-600 dark:text-rose-400')}>{tot('failed')}</span>}
          hint="the gateway refused them, after 3 tries"
        />
        <Kpi label="Skipped · 7 d" value={tot('skipped')} hint="no mobile number or no template" />
      </div>

      {data.noWelcome.length ? (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle>New centres without a welcome</CardTitle>
            <CardDescription>
              Made in the last 30 days, but no welcome message was ever queued for the owner ({plural(data.noWelcome.length, 'centre')}).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {data.noWelcome.map((c) => (
              <div key={c.instituteId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <button className="min-w-0 text-left" onClick={() => go(`centre/${c.instituteId}`)}>
                  <span className="block truncate font-medium hover:underline">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.owner || 'Owner'} · joined {when(c.createdAt)}
                    {c.hasPhone ? '' : ' · no mobile number'}
                  </span>
                </button>
                <Button size="sm" variant="outline" disabled={!c.hasPhone || busy === c.instituteId} onClick={() => void sendWelcome(c.instituteId, c.name, false)}>
                  <Send /> Send welcome
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

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
                  <span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{e.error}</code>
                    {WHY[e.error] ? <span className="ml-2 text-muted-foreground">{WHY[e.error]}</span> : null}
                  </span>
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
          <CardContent>
            <ByType rows={data.summary} empty="No messages to owners this week." />
          </CardContent>
        </Card>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {STATUS.map(([k, l]) => (
            <TabsTrigger key={k} value={k}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Card className={cn('py-0 transition-opacity', loading && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">When</TableHead>
              <TableHead>Centre · to</TableHead>
              <TableHead className="hidden md:table-cell">Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.messages.length ? (
              data.messages.map((m) => (
                <TableRow key={`${m.instituteId}-${m.type}-${m.createdAt}`}>
                  <TableCell className="pl-4 text-muted-foreground">{when(m.createdAt)}</TableCell>
                  <TableCell>
                    <button className="max-w-[16rem] truncate text-left font-medium hover:underline" onClick={() => go(`centre/${m.instituteId}`)}>
                      {m.institute}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {m.recipient || (m.toOwner ? 'Owner' : 'Helper')} {m.toOwner ? '(owner)' : '(helper)'} · {m.to}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{msgType(m.type)}</TableCell>
                  <TableCell>
                    <Pill tone={TONE[m.status] ?? 'neutral'}>{m.status === 'queued' ? 'waiting' : m.status}</Pill>
                    {m.why ? <div className="mt-0.5 text-xs text-muted-foreground">{WHY[m.why] ?? m.why}</div> : null}
                  </TableCell>
                  <TableCell className="pr-4">
                    {m.type === 'centre_welcome' && (m.status === 'failed' || m.status === 'skipped' || m.status === 'sent') ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === m.instituteId}
                        onClick={() => void sendWelcome(m.instituteId, m.institute, true)}
                      >
                        <Send /> {m.status === 'sent' ? 'Send again' : 'Retry'}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty text="No messages to owners yet." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
