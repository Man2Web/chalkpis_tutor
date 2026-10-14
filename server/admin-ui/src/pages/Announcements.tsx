import { useState } from 'react';
import { BellRing, Copy, Megaphone, MoreHorizontal, Plus, StopCircle } from 'lucide-react';
import { Empty, ErrorBox, Kpi, Loading, PageHeader } from '@/components/app/bits';
import { Composer } from '@/components/app/composer';
import { ANN_CATEGORY, EMPTY, PRIORITY, audienceText, type AnnCategory, type AnnPriority, type Draft } from '@/lib/announce';
import { confirmDialog } from '@/components/app/dialogs';
import { Pill } from '@/components/app/pill';
import { toast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { ago, dateOnly, when } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Tone } from '@/lib/names';
import { cn } from '@/lib/utils';

type Ann = {
  id: string;
  title: string;
  body: string;
  category: AnnCategory;
  priority: AnnPriority;
  audience: 'all' | 'owners' | 'staff';
  plan: Draft['plan'];
  centreCategory: string;
  banner: boolean;
  push: boolean;
  pushStatus: 'none' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  pushAt: string | null;
  pushSentAt: string | null;
  pushPhones: number;
  pushSent: number;
  audienceSize: number | null;
  link: string;
  ctaLabel: string;
  screen: string;
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
  status: 'scheduled' | 'live' | 'ended';
  stats: { seen: number; clicked: number; dismissed: number; opened: number };
};
type Data = {
  announcements: Ann[];
  summary: { live: number; scheduled: number; pushes30: number; phones30: number; seenRate: number | null; lastPushAt: string | null };
};

const STATUS: Record<Ann['status'], { label: string; tone: Tone }> = {
  scheduled: { label: 'Scheduled', tone: 'blue' },
  live: { label: 'Live', tone: 'green' },
  ended: { label: 'Ended', tone: 'neutral' },
};
const PUSH: Record<Ann['pushStatus'], string> = {
  none: '',
  scheduled: 'Push scheduled',
  sending: 'Sending…',
  sent: 'Push sent',
  cancelled: 'Push cancelled',
};
const VIEWS = [
  ['all', 'All'],
  ['live', 'Live'],
  ['scheduled', 'Scheduled'],
  ['ended', 'Ended'],
] as const;

const pct = (n: number, of: number | null) => (of ? `${Math.min(100, Math.round((n / of) * 100))}%` : '—');

/** A draft from an existing announcement, to send it again or to a different audience. */
const duplicate = (a: Ann): Draft => ({
  ...EMPTY,
  title: a.title,
  body: a.body,
  category: a.category,
  priority: a.priority,
  ctaLabel: a.ctaLabel,
  action: a.link ? 'link' : a.screen ? 'screen' : 'none',
  screen: a.screen || 'Home',
  link: a.link,
  audience: a.audience,
  plan: a.plan,
  centreCategory: a.centreCategory,
  banner: a.banner,
  push: a.push,
});

export function Announcements() {
  const { data, error, loading, reload } = useApi<Data>('/admin/api/announcements');
  const [composer, setComposer] = useState<Draft | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('all');
  const rows = (data?.announcements ?? []).filter((a) => view === 'all' || a.status === view);
  const s = data?.summary;

  const end = async (a: Ann) => {
    const ok = await confirmDialog({
      title: `Take down “${a.title}”?`,
      body: a.pushStatus === 'scheduled' ? 'The banner comes off now and the scheduled push is cancelled.' : 'The banner comes off the app now. It stays in people’s Updates.',
      action: 'Take down',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api('POST', `/admin/api/announcements/${a.id}/end`);
      toast('Taken down');
      await reload();
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Announcements"
        description="Tell tutors and helpers about new features, maintenance, billing and tips: as a banner in the app, a push notification on their phones, or both. Every announcement also stays in the app’s Updates."
        actions={
          <Button onClick={() => setComposer(EMPTY)}>
            <Plus /> New announcement
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Live now" value={s ? s.live : '…'} hint="Showing in the app" icon={<Megaphone />} onClick={() => setView('live')} />
        <Kpi label="Scheduled" value={s ? s.scheduled : '…'} hint="Waiting to start or to push" onClick={() => setView('scheduled')} />
        <Kpi
          label="Pushes · 30 days"
          value={s ? s.pushes30 : '…'}
          icon={<BellRing />}
          hint={s ? `${s.phones30} ${s.phones30 === 1 ? 'device' : 'devices'} reached${s.lastPushAt ? ` · last ${ago(s.lastPushAt)}` : ''}` : undefined}
        />
        <Kpi label="Seen by" value={s?.seenRate != null ? `${s.seenRate}%` : '—'} hint="Average of the audience who saw it" />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          {VIEWS.map(([k, l]) => (
            <TabsTrigger key={k} value={k}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading rows={5} />
      ) : (
        <Card className={cn('py-0 transition-opacity', loading && 'opacity-60')}>
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Announcement</TableHead>
                  <TableHead className="hidden lg:table-cell">Audience</TableHead>
                  <TableHead className="hidden md:table-cell">Channels</TableHead>
                  <TableHead className="hidden md:table-cell">Performance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => {
                  const C = ANN_CATEGORY[a.category] ?? ANN_CATEGORY.update;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-80 pl-4">
                        <div className="flex items-start gap-3">
                          <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border', C.tint)}>
                            <C.icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {C.label}
                              {a.priority !== 'normal' ? ` · ${PRIORITY[a.priority].label}` : ''} · {when(a.startsAt)}
                              {a.endsAt && a.status !== 'ended' ? ` → ${dateOnly(a.endsAt)}` : ''}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-56 lg:table-cell">
                        <span className="block truncate text-sm">{audienceText(a)}</span>
                        <span className="block text-xs text-muted-foreground">{a.audienceSize != null ? `${a.audienceSize} ${a.audienceSize === 1 ? 'person' : 'people'}` : ''}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="grid gap-0.5 text-xs">
                          {a.banner ? <span className="flex items-center gap-1"><Megaphone className="size-3.5" /> Banner</span> : null}
                          {a.push ? (
                            <span className="flex items-center gap-1">
                              <BellRing className="size-3.5" /> {PUSH[a.pushStatus]}
                              {a.pushStatus === 'sent' ? ` · ${a.pushSent} ${a.pushSent === 1 ? 'device' : 'devices'}` : a.pushStatus === 'scheduled' && a.pushAt ? ` · ${when(a.pushAt)}` : ''}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="grid gap-0.5 text-xs tabular">
                          <span><strong className="text-sm">{a.stats.seen}</strong> seen <span className="text-muted-foreground">({pct(a.stats.seen, a.audienceSize)})</span></span>
                          <span className="text-muted-foreground">
                            {a.stats.clicked} clicked{a.push ? ` · ${a.stats.opened} opened push` : ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
                      </TableCell>
                      <TableCell className="pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.title}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setComposer(duplicate(a))}>
                              <Copy /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" disabled={a.status === 'ended'} onSelect={() => void end(a)}>
                              <StopCircle /> Take down
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty
              icon={<Megaphone />}
              text={view === 'all' ? 'No announcements yet. Start with a template: a new feature, maintenance or a tip.' : 'Nothing here right now.'}
            />
          )}
        </Card>
      )}

      {composer ? <Composer initial={composer} onClose={() => setComposer(null)} onDone={() => void reload()} /> : null}
    </div>
  );
}
