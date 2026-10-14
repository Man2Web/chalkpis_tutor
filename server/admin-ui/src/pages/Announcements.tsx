import { useState } from 'react';
import { AlertTriangle, Megaphone, Sparkles, X } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { confirmDialog } from '@/components/app/dialogs';
import { Pill } from '@/components/app/pill';
import { toast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, ApiError } from '@/lib/api';
import { dshort } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type Ann = { id: string; title: string; body: string; tone: string; audience: string; link: string | null; startsAt: string; endsAt: string | null; live: boolean };
const TONES = { info: ['Info', Megaphone, 'border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-100'], success: ['Good news', Sparkles, 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'], warning: ['Warning', AlertTriangle, 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100'] } as const;
const AUDIENCE: Record<string, string> = { all: 'Everyone', owners: 'Tutors', staff: 'Helpers' };

export function Announcements() {
  const { data, error, reload } = useApi<{ announcements: Ann[] }>('/admin/api/announcements');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [tone, setTone] = useState<keyof typeof TONES>('info');
  const [audience, setAudience] = useState('all');
  const [days, setDays] = useState('7');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    setErr('');
    if (title.trim().length < 2) return setErr('Add a title (at least 2 letters).');
    if (link.trim() && !/^https:\/\/\S+$/.test(link.trim())) return setErr('The link must start with https://');
    setBusy(true);
    try {
      await api('POST', '/admin/api/announcements', {
        title: title.trim(),
        body: body.trim(),
        link: link.trim(),
        tone,
        audience,
        days: days === 'none' ? null : Number(days),
      });
      toast('Live in the app');
      setTitle('');
      setBody('');
      setLink('');
      await reload();
    } catch (e) {
      setErr((e as ApiError).code === 'bad_request' ? 'A title of at least 2 letters is needed, and links must start with https://' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const [, Icon, tint] = TONES[tone];

  return (
    <div className="grid gap-6">
      <PageHeader title="Announcements" description="A banner on every tutor’s Home screen in the app, for news, offers and maintenance notices." />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>New announcement</CardTitle>
            <CardDescription>Shows as a banner on Home until it ends; tutors can close it</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="a-title">Title</Label>
              <Input id="a-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New: poster maker" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-body">Message</Label>
              <Textarea id="a-body" rows={3} maxLength={400} value={body} onChange={(e) => setBody(e.target.value)} placeholder="One or two short sentences" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-link">Link (optional)</Label>
              <Input id="a-link" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Look</Label>
                <ToggleGroup type="single" variant="outline" size="sm" value={tone} onValueChange={(v) => v && setTone(v as keyof typeof TONES)}>
                  {Object.entries(TONES).map(([k, [l]]) => <ToggleGroupItem key={k} value={k} className="flex-1">{l}</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
              <div className="grid gap-2">
                <Label>Who sees it</Label>
                <ToggleGroup type="single" variant="outline" size="sm" value={audience} onValueChange={(v) => v && setAudience(v)}>
                  {Object.entries(AUDIENCE).map(([k, l]) => <ToggleGroupItem key={k} value={k} className="flex-1">{l}</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
              <div className="grid gap-2">
                <Label>Show for</Label>
                <ToggleGroup type="single" variant="outline" size="sm" value={days} onValueChange={(v) => v && setDays(v)}>
                  {[['1', '1 day'], ['7', '7 days'], ['30', '30 days'], ['none', 'No end']].map(([k, l]) => <ToggleGroupItem key={k} value={k} className="flex-1">{l}</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
            </div>
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
            <div><Button onClick={() => void publish()} disabled={busy}><Megaphone /> Publish</Button></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Tutor’s Home screen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mx-auto w-full max-w-[17rem] rounded-[2rem] border-8 border-foreground/90 bg-background p-3 shadow-xl">
              <div className={cn('flex gap-2 rounded-xl border p-3', tint)}>
                <Icon className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{title.trim() || 'Your title'}</div>
                  {body.trim() ? <div className="mt-0.5 text-xs opacity-80">{body}</div> : null}
                  {link.trim() ? <div className="mt-1 text-xs font-medium underline">Open</div> : null}
                </div>
                <X className="size-4 shrink-0 opacity-60" />
              </div>
              <div className="mt-3 h-24 rounded-xl bg-gradient-to-br from-primary/70 to-primary" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-14 rounded-lg bg-muted" />
                <div className="h-14 rounded-lg bg-muted" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3">
        <h2 className="text-lg font-semibold">History</h2>
        {error ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : !data ? (
          <Loading rows={4} />
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Announcement</TableHead>
                  <TableHead className="hidden md:table-cell">Audience</TableHead>
                  <TableHead className="hidden md:table-cell">Shown</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.announcements.length ? (
                  data.announcements.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-[24rem] pl-4">
                        <div className="truncate font-medium">{a.title}</div>
                        {a.body ? <div className="truncate text-xs text-muted-foreground">{a.body}</div> : null}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{AUDIENCE[a.audience] ?? a.audience}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {dshort(a.startsAt)} → {a.endsAt ? dshort(a.endsAt) : 'no end'}
                      </TableCell>
                      <TableCell><Pill tone={a.live ? 'green' : 'neutral'}>{a.live ? 'Live' : 'Ended'}</Pill></TableCell>
                      <TableCell className="pr-4">
                        {a.live ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!(await confirmDialog({ title: `Take “${a.title}” down now?`, action: 'End', destructive: true }))) return;
                              try {
                                await api('POST', `/admin/api/announcements/${a.id}/end`);
                                toast('Taken down');
                                await reload();
                              } catch (e) {
                                toast((e as Error).message, false);
                              }
                            }}
                          >
                            End
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5}><Empty text="No announcements yet." /></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
