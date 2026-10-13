import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Building2, ChevronRight, IndianRupee, MessageCircle, UserPlus } from 'lucide-react';
import { Delta, Empty, ErrorBox, Health, Kpi, Loading, PageHeader } from '@/components/app/bits';
import { C, Donut, TrendChart } from '@/components/app/charts';
import { EventRow, type Ev } from '@/components/app/events';
import { Funnel } from '@/components/app/funnel';
import { Pill } from '@/components/app/pill';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ago, dlong, money, num, plural } from '@/lib/format';
import { go, useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { Analytics, CentreRow } from './types';

type Ov = {
  signedIn: number;
  users: number;
  owners: number;
  staff: number;
  institutes: number;
  trials: number;
  paid: number;
  expired: number;
  students: number;
  blocked: number;
};

const METRICS = [
  { key: 'activeInstitutes', label: 'Active centres', color: C.blue },
  { key: 'signIns', label: 'Sign-ins', color: C.violet },
  { key: 'attendanceSaved', label: 'Attendance', color: C.green },
  { key: 'feesRecorded', label: 'Fees', color: C.green, money: true },
  { key: 'messagesSent', label: 'WhatsApp', color: '#0d9488' },
] as const;

const METHOD_NAMES: Record<string, [string, string]> = {
  whatsapp: ['WhatsApp', '#1DA851'],
  google: ['Google', '#4285F4'],
  apple: ['Apple', 'var(--foreground)'],
  email: ['Email', 'var(--chart-4)'],
};
const DEVICE_NAMES: Record<string, [string, string]> = {
  ios: ['iPhone', 'var(--chart-1)'],
  android: ['Android', '#3DDC84'],
  web: ['Web', '#0d9488'],
};
const parts = (m: Record<string, number>, names: Record<string, [string, string]>) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ name: names[k]?.[0] ?? 'Before tracking', value: v, color: names[k]?.[1] ?? 'var(--muted-foreground)' }));

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const data = values.map((v, i) => ({ i, v }));
  const id = `sp-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div className="mt-3 h-10">
      <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area dataKey="v" type="monotone" stroke={color} strokeWidth={1.8} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Overview() {
  const ov = useApi<Ov>('/admin/api/overview');
  const an = useApi<Analytics>('/admin/api/analytics?days=30');
  const risk = useApi<{ institutes: CentreRow[] }>('/admin/api/institutes?filter=at-risk&sort=health');
  const ev = useApi<{ events: Ev[] }>('/admin/api/events?limit=12');
  const [metric, setMetric] = useState<string>('activeInstitutes');
  const [watch, setWatch] = useState<'top' | 'quiet'>('top');

  const err = ov.error || an.error;
  if (err) return <ErrorBox error={err} onRetry={() => { void ov.reload(); void an.reload(); }} />;
  if (!ov.data || !an.data)
    return (
      <div className="grid gap-4">
        <Loading rows={2} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Loading key={i} rows={2} />)}</div>
      </div>
    );
  const o = ov.data;
  const a = an.data;
  const m = METRICS.find((x) => x.key === metric)!;
  const t = (k: string) => a.totals[k] ?? { now: 0, before: 0 };
  const top = a.topCentres;
  const maxTop = Math.max(1, ...top.map((x) => x.events));

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`${greeting()} 👋`}
        description={`${dlong(new Date().toISOString())} · ${plural(o.signedIn, 'tutor')} signed in right now`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Active centres" value={num(t('activeInstitutes').now)} icon={<Building2 />} hint={<><Delta {...t('activeInstitutes')} /> vs previous 30 days</>} onClick={() => go('analytics')}>
          <Spark values={a.series.activeInstitutes} color={C.blue} />
        </Kpi>
        <Kpi label="New sign-ups" value={num(t('signups').now)} icon={<UserPlus />} hint={<><Delta {...t('signups')} /> vs previous 30 days</>} onClick={() => go('logins')}>
          <Spark values={a.series.signups} color={C.violet} />
        </Kpi>
        <Kpi label="Fees recorded" value={money(t('feesRecorded').now)} icon={<IndianRupee />} hint={<><Delta {...t('feesRecorded')} /> vs previous 30 days</>} onClick={() => go('analytics')}>
          <Spark values={a.series.feesRecorded} color={C.green} />
        </Kpi>
        <Kpi label="WhatsApp delivered" value={num(t('messagesSent').now)} icon={<MessageCircle />} hint={<><Delta {...t('messagesSent')} /> vs previous 30 days</>} onClick={() => go('whatsapp')}>
          <Spark values={a.series.messagesSent} color="#0d9488" />
        </Kpi>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
            <CardDescription>Hover the chart for daily numbers</CardDescription>
            <CardAction>
              <ToggleGroup type="single" variant="outline" size="sm" value={metric} onValueChange={(v) => v && setMetric(v)} className="hidden lg:flex">
                {METRICS.map((x) => (
                  <ToggleGroupItem key={x.key} value={x.key} className="px-3">{x.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ToggleGroup type="single" variant="outline" size="sm" value={metric} onValueChange={(v) => v && setMetric(v)} className="mb-3 flex w-full flex-wrap lg:hidden">
              {METRICS.map((x) => (
                <ToggleGroupItem key={x.key} value={x.key} className="flex-1">{x.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <TrendChart
              dates={a.dates}
              series={[{ key: m.key, name: m.label, color: m.color }]}
              values={{ [m.key]: a.series[m.key] ?? [] }}
              isMoney={'money' in m}
              height={260}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Happening now</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => go('activity')}>See all <ChevronRight /></Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-0.5 px-3">
            {ev.data?.events.length ? ev.data.events.slice(0, 8).map((e, i) => <EventRow key={i} e={e} compact />) : <Empty text="Nothing yet today." />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Platform</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Logins</dt>
              <dd className="text-right tabular">{num(o.users)} <span className="text-muted-foreground">({plural(o.owners, 'tutor')}, {plural(o.staff, 'helper')})</span></dd>
              <dt className="text-muted-foreground">Centres</dt><dd className="text-right tabular">{num(o.institutes)}</dd>
              <dt className="text-muted-foreground">On trial · paid · ended</dt><dd className="text-right tabular">{o.trials} · {o.paid} · {o.expired}</dd>
              <dt className="text-muted-foreground">Active students</dt><dd className="text-right tabular">{num(o.students)}</dd>
              <dt className="text-muted-foreground">Blocked logins</dt><dd className="text-right tabular">{o.blocked}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Health</CardTitle>
            <CardDescription>Share of centres using Chalkpis</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <Ring pct={Math.round(a.retention.rate7 * 100)} label="This week" color={C.blue} />
            <Ring pct={Math.round(a.retention.rate30 * 100)} label="This month" color={C.violet} />
            <Ring pct={Math.round(a.conversion * 100)} label="Trial → paid" color={C.green} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Lowest health first</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => go('centres?filter=at-risk&sort=health')}>All <ChevronRight /></Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-1 px-3">
            {risk.data?.institutes.length ? (
              risk.data.institutes.slice(0, 5).map((c) => (
                <button key={c.id} onClick={() => go(`centre/${c.id}`)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/60">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">{c.name.slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{plural(c.students, 'student')} · active {ago(c.lastActivityAt)}</span>
                  </span>
                  <Health score={c.health} />
                </button>
              ))
            ) : (
              <Empty text="Every centre looks healthy." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How tutors sign in</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(a.signInMethods).length ? <Donut parts={parts(a.signInMethods, METHOD_NAMES)} center="sign-ins" /> : <Empty text="No sign-ins yet." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Their phones</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(a.signInPlatforms).length ? <Donut parts={parts(a.signInPlatforms, DEVICE_NAMES)} center="sign-ins" /> : <Empty text="No sign-ins yet." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Centres to watch</CardTitle>
            <CardDescription>Changes and sign-ins, 30 days</CardDescription>
            <CardAction>
              <ToggleGroup type="single" variant="outline" size="sm" value={watch} onValueChange={(v) => v && setWatch(v as 'top' | 'quiet')}>
                <ToggleGroupItem value="top" className="px-2.5">Most active</ToggleGroupItem>
                <ToggleGroupItem value="quiet" className="px-2.5">Gone quiet</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-1 px-3">
            {watch === 'top' ? (
              top.length ? (
                top.map((c) => (
                  <button key={c.id} onClick={() => go(`centre/${c.id}`)} className="grid gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-accent/60">
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="tabular text-muted-foreground">{c.events}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-violet-500" style={{ width: `${(c.events / maxTop) * 100}%` }} />
                    </span>
                  </button>
                ))
              ) : (
                <Empty text="No activity yet." />
              )
            ) : a.quietCentres.length ? (
              a.quietCentres.map((c) => (
                <button key={c.id} onClick={() => go(`centre/${c.id}`)} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent/60">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">last active {ago(c.lastAt)}</span>
                  </span>
                  <Pill tone="orange">Call</Pill>
                </button>
              ))
            ) : (
              <Empty text="No centre has gone quiet this week." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activation funnel</CardTitle>
          <CardDescription>How far new centres get</CardDescription>
        </CardHeader>
        <CardContent>
          <Funnel funnel={a.funnel} />
        </CardContent>
      </Card>
    </div>
  );
}

export function Ring({ pct, label, color }: { pct: number; label: string; color: string }) {
  const R = 30;
  const Cc = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 80 80" className="size-20" role="img" aria-label={`${label} ${pct}%`}>
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--muted)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(Cc * pct) / 100} ${Cc}`}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="45" textAnchor="middle" className={cn('fill-foreground text-[15px] font-semibold')}>
          {pct}%
        </text>
      </svg>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
