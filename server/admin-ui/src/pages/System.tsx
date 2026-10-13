import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { Pill } from '@/components/app/pill';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ago } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type H = {
  server: { version: string; node: string; uptimeSeconds: number; memoryMb: number; publicBaseUrl: string | null };
  database: { ok: boolean; pingMs: number; sizeMb: number; lastMigration: string };
  queue: { queued: number; sending: number; failed24h: number; oldestQueuedMinutes: number };
  whatsapp: { provider: string; templates: string[] };
  jobs: { job: string; lastRunAt: string | null }[];
};
const uptime = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d ? `${d}d ` : ''}${h}h ${m}m`;
};
function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 truncate text-right tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function System() {
  const { data, error, loading, reload } = useApi<H>('/admin/api/health');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  const qok = data.queue.oldestQueuedMinutes < 10 && data.queue.failed24h < 20;
  const wok = data.whatsapp.provider !== 'none';
  const ok = qok && wok && data.database.ok;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {ok ? <CheckCircle2 className="size-6 text-emerald-500" /> : <AlertTriangle className="size-6 text-amber-500" />}
            {ok ? 'All systems normal' : 'Needs a look'}
          </span>
        }
        description={`Checked ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`}
        actions={<Button variant="outline" onClick={() => void reload()}><RefreshCw className={cn(loading && 'animate-spin')} /> Check again</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Server</CardTitle><CardAction><Pill tone="green">Running</Pill></CardAction></CardHeader>
          <CardContent>
            <Rows rows={[
              ['Version', `v${data.server.version}`],
              ['Node', data.server.node],
              ['Up for', uptime(data.server.uptimeSeconds)],
              ['Memory', `${data.server.memoryMb} MB`],
              ['Address', data.server.publicBaseUrl || 'not set'],
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Database</CardTitle><CardAction><Pill tone={data.database.ok ? 'green' : 'red'}>{data.database.ok ? 'Connected' : 'Down'}</Pill></CardAction></CardHeader>
          <CardContent>
            <Rows rows={[
              ['Response', `${data.database.pingMs} ms`],
              ['Size', `${data.database.sizeMb} MB`],
              ['Last migration', data.database.lastMigration],
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Message queue</CardTitle><CardAction><Pill tone={qok ? 'green' : 'orange'}>{qok ? 'Healthy' : 'Backlog'}</Pill></CardAction></CardHeader>
          <CardContent>
            <Rows rows={[
              ['Waiting', data.queue.queued],
              ['Sending', data.queue.sending],
              ['Failed (24 h)', data.queue.failed24h],
              ['Oldest waiting', `${data.queue.oldestQueuedMinutes} min`],
            ]} />
          </CardContent>
        </Card>
        <Card className="md:col-span-2 xl:col-span-2">
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
            <CardDescription>The template used for each message</CardDescription>
            <CardAction><Pill tone={wok ? 'green' : 'orange'}>{wok ? data.whatsapp.provider : 'Not set up'}</Pill></CardAction>
          </CardHeader>
          <CardContent>
            {data.whatsapp.templates.length ? (
              <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                {data.whatsapp.templates.map((t) => {
                  const [k, v] = t.split(': ');
                  return (
                    <div key={t} className="flex items-center justify-between gap-2 border-b pb-2">
                      <span className="text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                      <code className="text-xs">{v}</code>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty text="No templates set." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Scheduled jobs</CardTitle><CardDescription>When each last ran</CardDescription></CardHeader>
          <CardContent>
            {data.jobs.length ? <Rows rows={data.jobs.map((j) => [j.job, ago(j.lastRunAt)])} /> : <Empty text="No job has run yet." />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
