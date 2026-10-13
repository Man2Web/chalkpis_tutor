import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Download, ExternalLink, MessageCircle, Phone, Search, Tags, Trash2 } from 'lucide-react';
import { Empty, ErrorBox, Health, Kpi, Loading, PersonAvatar } from '@/components/app/bits';
import { Bars, C, Donut } from '@/components/app/charts';
import { confirmDialog } from '@/components/app/dialogs';
import { DayFeed, type Ev } from '@/components/app/events';
import { Pill } from '@/components/app/pill';
import { PlanEditor } from '@/components/app/plan';
import { Tag } from '@/components/app/tags';
import { toast } from '@/components/app/toast';
import { openUser } from '@/components/app/user';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { api, downloadCsv } from '@/lib/api';
import { ago, dlong, dshort, money, plural, when } from '@/lib/format';
import { go, useApi, useDebounced } from '@/lib/hooks';
import { AREA, category, DEVICE, KIND, METHOD, msgType, NOPHONE, TAGS, tagLabel } from '@/lib/names';
import { cn } from '@/lib/utils';
import type { CentreRow } from './types';

type Detail = {
  institute: CentreRow;
  activity: { attendance30: number; payments30: number; outstanding: number };
  people: {
    id: string;
    name: string | null;
    phone: string | null;
    role: string;
    lastLoginAt: string | null;
    lastMethod: string | null;
    lastPlatform: string | null;
    logins30: number;
    blocked: boolean;
  }[];
  trend: { dates: string[]; values: number[] };
  areas: { area: string; count: number }[];
  messages: { type: string; status: string; count: number }[];
  billing: { plan: string; amount: number; at: string }[];
  payUrl: string;
};

const digits = (p: string) => p.replace(/\D/g, '');

export function Centre({ id, onName }: { id: string; onName: (n: string) => void }) {
  const { data, error, reload } = useApi<Detail>(`/admin/api/institutes/${id}`);
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    onName(data?.institute.name ?? '');
  }, [data, onName]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  const c = data.institute;
  const owner = c.owner;

  const setTags = async (tags: string[]) => {
    try {
      await api('PUT', `/admin/api/institutes/${id}/tags`, { tags });
      toast('Tags saved');
      await reload();
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => (history.length > 1 ? history.back() : go('centres'))}>
          <ArrowLeft /> Centres
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
              {c.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  category(c.category),
                  owner ? [owner.name, owner.phone || NOPHONE].filter(Boolean).join(' · ') : null,
                  `joined ${dshort(c.createdAt)}`,
                  `last active ${ago(c.lastActivityAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {c.tags.map((t) => <Tag key={t} t={t} />)}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="xs"><Tags /> {c.tags.length ? 'Edit tags' : 'Add tag'}</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Tags</DropdownMenuLabel>
                    {TAGS.map((t) => (
                      <DropdownMenuCheckboxItem
                        key={t}
                        checked={c.tags.includes(t)}
                        className="capitalize"
                        onCheckedChange={(on) => void setTags(on ? [...c.tags, t] : c.tags.filter((x) => x !== t))}
                      >
                        {tagLabel(t)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          {owner?.phone ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild><a href={`tel:${owner.phone}`}><Phone /> Call</a></Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`https://wa.me/${digits(owner.phone)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(owner.phone!).then(() => toast('Number copied'))}
              >
                <Copy /> Copy number
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Health" value={<Health score={c.health} />} hint="Activity, students, payments and WhatsApp" />
        <Kpi label="Students" value={c.students} hint={`${plural(c.batches, 'batch', 'batches')} · ${plural(c.staff, 'helper')}`} />
        <Kpi label="Fees recorded · 30 d" value={money(c.collected30)} hint={`${money(data.activity.outstanding)} still owed`} />
        <Kpi
          label="Plan"
          value={<span className="capitalize">{c.plan || '—'}</span>}
          hint={c.expiresAt ? `${c.planActive ? 'until' : 'ended'} ${dshort(c.expiresAt)}` : undefined}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start sm:w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="messages">WhatsApp</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="billing">Plan & billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Activity · last 30 days</CardTitle>
              <CardDescription>
                {data.trend.values.some(Boolean) ? `${plural(data.trend.values.reduce((a, b) => a + b, 0), 'action')} and sign-ins` : 'Nothing recorded yet'}
              </CardDescription>
              <CardAction><Button variant="ghost" size="sm" onClick={() => setTab('logs')}>Open logs</Button></CardAction>
            </CardHeader>
            <CardContent>
              {data.trend.values.some(Boolean) ? (
                <Bars
                  labels={data.trend.dates.map((d) => dshort(`${d}T12:00:00+05:30`))}
                  values={data.trend.values}
                  tips={data.trend.dates.map((d) => dlong(`${d}T12:00:00+05:30`))}
                  name="Actions"
                  color={C.violet}
                  height={200}
                />
              ) : (
                <Empty text="Changes and sign-ins show here from now on." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>What they use</CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {data.areas.length ? (
                <Donut
                  parts={data.areas.map((a) => ({ name: AREA[a.area]?.label ?? a.area, value: a.count, color: AREA[a.area]?.color ?? '#a3a3a3' }))}
                  center="actions"
                />
              ) : (
                <Empty text="No changes yet." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Last 30 days</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Attendance days saved</dt><dd className="text-right tabular">{data.activity.attendance30}</dd>
                <dt className="text-muted-foreground">Payments recorded</dt><dd className="text-right tabular">{data.activity.payments30} · {money(c.collected30)}</dd>
                <dt className="text-muted-foreground">WhatsApp sent</dt>
                <dd className="text-right tabular">{c.messages30}{c.failed30 ? <span className="text-rose-600 dark:text-rose-400"> ({c.failed30} failed)</span> : null}</dd>
              </dl>
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Setup</CardTitle>
              <CardDescription>What helps a centre succeed</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2.5 text-sm sm:grid-cols-2">
              {[
                ['Parents can pay (UPI / link)', c.canBePaid],
                ['Parent WhatsApp messages', c.messagesOn],
                ['Has students', c.students > 0],
                ['Has a helper', c.staff > 0],
              ].map(([l, ok]) => (
                <div key={String(l)} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>{l}</span>
                  <Pill tone={ok ? 'green' : 'orange'}>{ok ? 'Yes' : 'No'}</Pill>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Logs id={id} name={c.name} />
        </TabsContent>

        <TabsContent value="people" className="mt-4">
          <Card className="py-2">
            <CardContent className="grid gap-1 px-2">
              {data.people.length ? (
                data.people.map((p) => (
                  <button key={p.id} onClick={() => openUser(p.id)} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent/60">
                    <PersonAvatar name={p.name || p.phone || '?'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name || p.phone || NOPHONE}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[p.phone, p.role === 'owner' ? 'Tutor' : 'Helper', `${plural(p.logins30, 'sign-in')} in 30 days`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {p.blocked ? (
                      <Pill tone="red">Blocked</Pill>
                    ) : (
                      <span className="text-right text-xs text-muted-foreground">
                        <span className="block">{ago(p.lastLoginAt)}</span>
                        {p.lastMethod ? <span className="block">{METHOD[p.lastMethod] ?? p.lastMethod}{p.lastPlatform ? ` on ${DEVICE[p.lastPlatform] ?? p.lastPlatform}` : ''}</span> : null}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <Empty text="No people yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp · last 30 days</CardTitle>
              <CardDescription>Sent of total, by message</CardDescription>
            </CardHeader>
            <CardContent><ByType rows={data.messages} empty="No messages yet." /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Notes id={id} />
        </TabsContent>

        <TabsContent value="billing" className="mt-4 grid gap-4 lg:grid-cols-2">
          <PayLink url={new URL(data.payUrl, location.origin).href} centre={c.name} ownerName={owner?.name ?? null} ownerPhone={owner?.phone ?? null} />
          <PlanEditor instituteId={id} plan={c.plan} active={c.planActive} expiresAt={c.expiresAt} onDone={reload} />
          <Card>
            <CardHeader><CardTitle>Plan payments</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {data.billing.length ? (
                data.billing.map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                    <span className="text-muted-foreground">{when(b.at)}</span>
                    <span><span className="capitalize">{b.plan}</span> · <span className="font-medium tabular">{money(b.amount)}</span></span>
                  </div>
                ))
              ) : (
                <Empty text="No plan payments yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The centre's own pay page: copy it, open it, or send it to the owner on WhatsApp with a short note. */
function PayLink({ url, centre, ownerName, ownerPhone }: { url: string; centre: string; ownerName: string | null; ownerPhone: string | null }) {
  const text = `Hi${ownerName ? ` ${ownerName.split(' ')[0]}` : ''}, here is the link to choose and pay for your Chalkpis plan for ${centre}: ${url}`;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Payment link</CardTitle>
        <CardDescription>
          The centre's own page to choose a plan and pay online. The plan switches on by itself once the payment is confirmed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="Payment link" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void navigator.clipboard.writeText(url).then(() => toast('Payment link copied'))}>
            <Copy /> Copy link
          </Button>
          {ownerPhone ? (
            <Button size="sm" variant="outline" asChild>
              <a href={`https://wa.me/${digits(ownerPhone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                <MessageCircle /> Send on WhatsApp
              </a>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Open</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Sent of total per message type. */
export function ByType({ rows, empty }: { rows: { type: string; status: string; count: number }[]; empty: string }) {
  const by = new Map<string, { ok: number; all: number }>();
  for (const r of rows) {
    const x = by.get(r.type) ?? { ok: 0, all: 0 };
    x.all += r.count;
    if (r.status === 'sent') x.ok += r.count;
    by.set(r.type, x);
  }
  if (!by.size) return <Empty text={empty} />;
  return (
    <div className="grid gap-3">
      {[...by.entries()].map(([type, x]) => (
        <div key={type} className="grid gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>{msgType(type)}</span>
            <span className="text-muted-foreground tabular"><span className="font-medium text-foreground">{x.ok}</span> / {x.all}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${x.all ? (x.ok / x.all) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const LOG_KINDS = ['activity', 'login', 'payment', 'attendance', 'message', 'message-failed', 'reversal', 'plan', 'admin'];
const LOG_LABEL: Record<string, string> = {
  activity: 'Changes',
  login: 'Sign-ins',
  payment: 'Payments',
  attendance: 'Attendance',
  message: 'WhatsApp',
  'message-failed': 'Failures',
  reversal: 'Corrections',
  plan: 'Plan',
  admin: 'Admin',
};

function Logs({ id, name }: { id: string; name: string }) {
  const [q, setQ] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const dq = useDebounced(q.trim(), 280);
  const base = `/admin/api/events?limit=100&institute=${id}&kinds=${(kinds.length ? kinds : LOG_KINDS).join(',')}&q=${encodeURIComponent(dq)}`;
  const { data, error, loading, reload } = useApi<{ events: Ev[] }>(base);
  const [older, setOlder] = useState<Ev[]>([]);
  const [more, setMore] = useState(false);
  useEffect(() => {
    setOlder([]);
    setMore((data?.events.length ?? 0) === 100);
  }, [data]);
  const all = [...(data?.events ?? []), ...older];
  const loadOlder = async () => {
    const last = all[all.length - 1];
    if (!last) return;
    const r = await api<{ events: Ev[] }>('GET', `${base}&before=${encodeURIComponent(last.at)}`);
    setOlder((o) => [...o, ...r.events]);
    setMore(r.events.length === 100);
  };
  const file = `chalkpis-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-logs.csv`;
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this centre’s log: a student, a batch, a person" className="pl-8" />
          </div>
          <Button
            variant="outline"
            onClick={() => downloadCsv(`/admin/api/institutes/${id}/logs.csv`, file).then(() => toast(`Downloaded ${file}`)).catch((e: Error) => toast(e.message, false))}
          >
            <Download /> Export
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Toggle size="sm" variant="outline" pressed={!kinds.length} onPressedChange={() => setKinds([])}>
            {!kinds.length ? <Check /> : null} Everything
          </Toggle>
          {LOG_KINDS.map((k) => {
            const on = kinds.includes(k);
            const Icon = KIND[k]?.icon;
            return (
              <Toggle key={k} size="sm" variant="outline" pressed={on} onPressedChange={() => setKinds((s) => (on ? s.filter((x) => x !== k) : [...s, k]))}>
                {Icon ? <Icon /> : null} {LOG_LABEL[k]}
              </Toggle>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className={cn('px-3 transition-opacity', loading && 'opacity-60')}>
        {error ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : !data ? (
          <Loading rows={6} />
        ) : all.length ? (
          <>
            <DayFeed events={all} inCentre />
            {more ? (
              <div className="mt-3 flex justify-center">
                <Button variant="outline" onClick={() => void loadOlder()}>Load older</Button>
              </div>
            ) : null}
          </>
        ) : (
          <Empty text={kinds.length || dq ? 'Nothing matches.' : 'Nothing in the last 30 days.'} />
        )}
      </CardContent>
    </Card>
  );
}

function Notes({ id }: { id: string }) {
  const { data, reload } = useApi<{ notes: { id: string; author: string; body: string; at: string }[] }>(`/admin/api/institutes/${id}/notes`);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api('POST', `/admin/api/institutes/${id}/notes`, { body });
      setText('');
      toast('Note added');
      await reload();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>A private timeline for your team</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Textarea
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a private note (only admins see it): calls, promises, problems…"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground tabular">{text.length} / 1000</span>
            <Button onClick={() => void add()} disabled={busy || !text.trim()}>Add note</Button>
          </div>
        </div>
        {data?.notes.length ? (
          <div className="grid gap-3">
            {data.notes.map((n) => (
              <div key={n.id} className="flex gap-3 rounded-lg border p-3">
                <PersonAvatar name={n.author} className="size-7" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-medium">{n.author}</span> <span className="text-muted-foreground">· {when(n.at)}</span></div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete note"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Delete this note?', action: 'Delete', destructive: true })) {
                      await api('DELETE', `/admin/api/institutes/${id}/notes/${n.id}`).catch((e: Error) => toast(e.message, false));
                      await reload();
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No notes yet." />
        )}
      </CardContent>
    </Card>
  );
}

