import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  Info,
  Lightbulb,
  Megaphone,
  Rocket,
  Scale,
  Send,
  Smartphone,
  Sparkles,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { dateOnly } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { CATEGORY } from '@/lib/names';
import { cn } from '@/lib/utils';
import { ANN_CATEGORY, EMPTY, PLAN_LABEL, PRIORITY, SCREENS, audienceText, type AnnCategory, type AnnPriority, type Draft } from '@/lib/announce';
import { confirmDialog } from './dialogs';
import { toast } from './toast';

/** Ready-made messages in a consistent, professional voice; every word can be changed. */
const TEMPLATES: { name: string; icon: LucideIcon; draft: Partial<Draft> }[] = [
  {
    name: 'New feature',
    icon: Rocket,
    draft: {
      category: 'feature',
      title: 'New in Chalkpis: [feature]',
      body: 'You can now [what it does]. Open it from [where] and try it today.',
      ctaLabel: 'Try it',
      action: 'screen',
      screen: 'Home',
      audience: 'owners',
      push: true,
    },
  },
  {
    name: 'Scheduled maintenance',
    icon: Wrench,
    draft: {
      category: 'maintenance',
      priority: 'important',
      title: 'Scheduled maintenance on [day], [time]',
      body: 'Chalkpis will be unavailable for about [duration] while we upgrade our systems. Your data is safe and nothing needs to be done.',
      audience: 'all',
      push: true,
      days: '1',
    },
  },
  {
    name: 'Service restored',
    icon: Check,
    draft: {
      category: 'maintenance',
      priority: 'critical',
      title: 'Chalkpis is working normally again',
      body: 'The earlier issue has been fixed. Thank you for your patience, and sorry for the trouble.',
      audience: 'all',
      push: true,
      days: '1',
    },
  },
  {
    name: 'Trial ending',
    icon: CreditCard,
    draft: {
      category: 'billing',
      title: 'Your free trial ends soon',
      body: 'Keep your students, attendance and fee records going: choose a plan before your trial ends. Your data is never deleted.',
      ctaLabel: 'See plans',
      action: 'screen',
      screen: 'Billing',
      audience: 'owners',
      plan: 'trial',
    },
  },
  {
    name: 'Tip of the week',
    icon: Lightbulb,
    draft: {
      category: 'tip',
      title: 'Tip: [short tip]',
      body: '[One sentence on how it saves time.]',
      audience: 'owners',
    },
  },
  {
    name: 'Policy update',
    icon: Scale,
    draft: {
      category: 'policy',
      title: 'We have updated our [Terms / Privacy Policy]',
      body: 'The changes take effect on [date]. Nothing changes in how you use Chalkpis.',
      ctaLabel: 'Read it',
      action: 'link',
      link: 'https://tutor.chalkpis.com/privacy',
      audience: 'owners',
      days: '30',
    },
  },
];

const toneOf = (d: Pick<Draft, 'category' | 'priority'>) =>
  d.priority === 'critical' || d.category === 'maintenance' ? 'warning' : d.category === 'feature' ? 'success' : 'info';
const BANNER_TINT = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-950 dark:text-sky-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
  warning: 'border-amber-500/40 bg-amber-500/12 text-amber-950 dark:text-amber-100',
} as const;
const BANNER_ICON = { info: Info, success: Sparkles, warning: AlertTriangle } as const;

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{n}</span>
        <h3 className="font-semibold">{title}</h3>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="grid gap-3 pl-7">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; hint?: string }[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg border px-2.5 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent/50',
            )}
          >
            <span className="block font-medium">{o.label}</span>
            {o.hint ? <span className="block text-[11px] leading-tight text-muted-foreground">{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The phone: the push on the lock screen (when on), the banner on Home, and the item in Updates. */
function Preview({ d }: { d: Draft }) {
  const tone = toneOf(d);
  const Icon = BANNER_ICON[tone];
  const cat = ANN_CATEGORY[d.category];
  const title = d.title.trim() || 'Your title';
  const body = d.body.trim();
  const cta = d.action !== 'none' && d.ctaLabel.trim() ? d.ctaLabel.trim() : '';
  return (
    <div className="grid gap-4">
      {d.push ? (
        <div className="grid gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">Push notification</div>
          <div className="rounded-2xl border bg-muted/60 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <img src="/admin-logo/logo-mark.svg" alt="" className="size-4 rounded" />
              <span className="font-medium uppercase tracking-wide">Chalkpis</span>
              <span className="ml-auto">{d.when === 'later' ? 'scheduled' : 'now'}</span>
            </div>
            <div className="mt-1.5 text-sm font-semibold">{title}</div>
            <div className="line-clamp-3 text-xs text-muted-foreground">{body || 'Open Chalkpis to read it.'}</div>
          </div>
        </div>
      ) : null}
      {d.banner ? (
        <div className="grid gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">Banner on Home</div>
          <div className={cn('flex gap-2 rounded-xl border p-3', BANNER_TINT[tone])}>
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{title}</div>
              {body ? <div className="mt-0.5 text-xs opacity-85">{body}</div> : null}
              {cta ? (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-foreground/90 px-2.5 py-1 text-xs font-medium text-background">
                  {cta} <ChevronRight className="size-3" />
                </div>
              ) : null}
            </div>
            <X className="size-4 shrink-0 opacity-60" />
          </div>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <div className="text-xs font-medium text-muted-foreground">In Updates (the bell in the app)</div>
        <div className="flex gap-3 rounded-xl border bg-card p-3">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border', cat.tint)}>
            <cat.icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{cat.label}</span>
              {d.priority !== 'normal' ? <span className="font-medium text-amber-700 dark:text-amber-300">· {PRIORITY[d.priority].label}</span> : null}
              <span className="ml-auto inline-block size-2 rounded-full bg-primary" aria-label="Unread" />
            </div>
            <div className="truncate text-sm font-semibold">{title}</div>
            {body ? <div className="line-clamp-2 text-xs text-muted-foreground">{body}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Local "YYYY-MM-DDTHH:mm" in IST → ISO with offset. */
const istIso = (local: string) => `${local}:00+05:30`;
const nowLocalIst = (plusMinutes = 0) => new Date(Date.now() + plusMinutes * 60_000 + 5.5 * 3_600_000).toISOString().slice(0, 16);

/**
 * Write, target, schedule and test an announcement, with a live preview of how it looks on a phone. Publishing asks for
 * confirmation when a push is involved, since a notification cannot be taken back.
 */
export function Composer({ initial, onClose, onDone }: { initial: Draft; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [minLocal] = useState(() => nowLocalIst());
  const [estimate, setEstimate] = useState<{ people: number; phones: number } | null>(null);
  const target = useDebounced(`${d.audience}|${d.plan}|${d.centreCategory}`, 250);

  useEffect(() => {
    const [audience, plan, centreCategory] = target.split('|');
    let live = true;
    void api<{ people: number; phones: number }>('POST', '/admin/api/announcements/estimate', { audience, plan, centreCategory })
      .then((r) => live && setEstimate(r))
      .catch(() => live && setEstimate(null));
    return () => {
      live = false;
    };
  }, [target]);

  // quiet hours right now (IST), worked out once when the composer opens
  const [quietNow] = useState(() => {
    const h = new Date(Date.now() + 5.5 * 3_600_000).getUTCHours();
    return h >= 21 || h < 8;
  });

  const body = () => ({
    title: d.title.trim(),
    body: d.body.trim(),
    category: d.category,
    priority: d.priority,
    ctaLabel: d.action === 'none' ? '' : d.ctaLabel.trim(),
    screen: d.action === 'screen' ? d.screen : '',
    link: d.action === 'link' ? d.link.trim() : '',
    audience: d.audience,
    plan: d.plan,
    centreCategory: d.centreCategory,
    banner: d.banner,
    push: d.push,
    startsAt: d.when === 'later' && d.startsAt ? istIso(d.startsAt) : null,
    days: d.days === 'none' ? null : Number(d.days),
  });

  const check = () => {
    if (d.title.trim().length < 2) return 'Add a title (at least 2 letters).';
    if (!d.banner && !d.push) return 'Choose at least one channel: the banner, a push, or both.';
    if (d.action !== 'none' && !d.ctaLabel.trim()) return 'Give the button a short label, like "See plans".';
    if (d.action === 'link' && !/^https:\/\/\S+$/.test(d.link.trim())) return 'The button link must start with https://';
    if (d.when === 'later' && (!d.startsAt || Date.parse(istIso(d.startsAt)) < Date.now())) return 'Pick a time in the future.';
    return '';
  };

  const publish = async () => {
    const problem = check();
    setErr(problem);
    if (problem) return;
    if (d.push) {
      const who = audienceText(d).toLowerCase();
      const ok = await confirmDialog({
        title: d.when === 'later' ? 'Schedule this push notification?' : 'Send this push notification now?',
        body: `“${d.title.trim()}” will pop up on the phones of ${estimate ? `${estimate.phones} ${estimate.phones === 1 ? 'device' : 'devices'} (` : ''}${who}${estimate ? ')' : ''}. A notification cannot be taken back once it is sent.`,
        action: d.when === 'later' ? 'Schedule' : 'Publish and send',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await api<{ id: string; pushAt: string | null; startsAt: string; audience: number }>('POST', '/admin/api/announcements', body());
      const later = Date.parse(r.startsAt) > Date.now() + 30_000;
      toast(
        later
          ? `Scheduled for ${dateOnly(r.startsAt)}`
          : r.pushAt && Date.parse(r.pushAt) > Date.now() + 30_000
            ? `Live in the app · the push goes at 8 am (quiet hours)`
            : d.push
              ? 'Published · push sent'
              : 'Published in the app',
      );
      onClose();
      onDone();
    } catch (e) {
      setErr((e as ApiError).code === 'bad_request' ? 'Something is not right in the form: check the title, the link and the time.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (d.title.trim().length < 2) return setErr('Add a title before sending a test.');
    try {
      const r = await api<{ found: boolean; phones: number; sent: number }>('POST', '/admin/api/announcements/test-push', {
        phone: testPhone,
        title: d.title.trim(),
        body: d.body.trim(),
      });
      toast(
        !r.found
          ? 'No Chalkpis account has that number'
          : r.phones
            ? `Test sent to ${r.sent} of ${r.phones} ${r.phones === 1 ? 'phone' : 'phones'}`
            : 'That person has no phone with notifications switched on yet',
        r.found && r.sent > 0,
      );
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  const action = d.when === 'later' ? 'Schedule' : d.push ? 'Publish and send push' : 'Publish';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>New announcement</DialogTitle>
          <DialogDescription>Reach tutors and helpers in the app, on their phones, or both.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[calc(92vh-9rem)] overflow-y-auto lg:grid-cols-[1fr_20rem]">
          <div className="grid gap-7 px-6 py-5">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Start from a template</Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <Button key={t.name} type="button" variant="outline" size="sm" onClick={() => setD({ ...EMPTY, ...t.draft })}>
                    <t.icon /> {t.name}
                  </Button>
                ))}
              </div>
            </div>

            <Section n={1} title="Message">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Category</Label>
                  <Select value={d.category} onValueChange={(v) => set('category', v as AnnCategory)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ANN_CATEGORY) as AnnCategory[]).map((k) => {
                        const C = ANN_CATEGORY[k];
                        return (
                          <SelectItem key={k} value={k}>
                            <C.icon /> {C.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Priority</Label>
                  <Segmented
                    value={d.priority}
                    onChange={(v) => set('priority', v)}
                    options={(Object.keys(PRIORITY) as AnnPriority[]).map((k) => ({ value: k, label: PRIORITY[k].label }))}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="c-title">Title</Label>
                  <span className="text-xs text-muted-foreground tabular">{d.title.length} / 80</span>
                </div>
                <Input id="c-title" maxLength={80} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Short and clear, like a headline" />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="c-body">Message</Label>
                  <span className="text-xs text-muted-foreground tabular">{d.body.length} / 400</span>
                </div>
                <Textarea id="c-body" rows={3} maxLength={400} value={d.body} onChange={(e) => set('body', e.target.value)} placeholder="One or two sentences: what it is and why it matters to them" />
              </div>
              <div className="grid gap-1.5">
                <Label>Button</Label>
                <Segmented
                  value={d.action}
                  onChange={(v) => set('action', v)}
                  options={[
                    { value: 'none', label: 'No button' },
                    { value: 'screen', label: 'Open a screen' },
                    { value: 'link', label: 'Open a link' },
                  ]}
                />
                {d.action !== 'none' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input maxLength={30} value={d.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} placeholder="Button label, e.g. See plans" aria-label="Button label" />
                    {d.action === 'screen' ? (
                      <Select value={d.screen} onValueChange={(v) => set('screen', v)}>
                        <SelectTrigger className="w-full" aria-label="Screen to open"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SCREENS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input maxLength={300} value={d.link} onChange={(e) => set('link', e.target.value)} placeholder="https://" aria-label="Link" />
                    )}
                  </div>
                ) : null}
              </div>
            </Section>

            <Section n={2} title="Audience">
              <div className="grid gap-1.5">
                <Label>Who</Label>
                <Segmented
                  value={d.audience}
                  onChange={(v) => set('audience', v)}
                  options={[
                    { value: 'all', label: 'Everyone', hint: 'Tutors and helpers' },
                    { value: 'owners', label: 'Tutors', hint: 'Centre owners' },
                    { value: 'staff', label: 'Helpers', hint: 'Staff' },
                  ]}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Their plan</Label>
                  <Select value={d.plan} onValueChange={(v) => set('plan', v as Draft['plan'])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Kind of centre</Label>
                  <Select value={d.centreCategory || 'any'} onValueChange={(v) => set('centreCategory', v === 'any' ? '' : v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Every kind</SelectItem>
                      {Object.entries(CATEGORY).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                <Users className="size-4 shrink-0 text-muted-foreground" />
                {estimate ? (
                  <span>
                    Reaches <strong>{estimate.people}</strong> {estimate.people === 1 ? 'person' : 'people'}
                    {' · '}
                    <strong>{estimate.phones}</strong> {estimate.phones === 1 ? 'device' : 'devices'} can get a push
                  </span>
                ) : (
                  <span className="text-muted-foreground">Counting…</span>
                )}
              </div>
            </Section>

            <Section n={3} title="Delivery">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', d.banner && 'border-primary bg-primary/5')}>
                  <Checkbox checked={d.banner} onCheckedChange={(v) => set('banner', !!v)} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium"><Megaphone className="size-4" /> Banner in the app</span>
                    <span className="block text-xs text-muted-foreground">On Home until it ends or they close it</span>
                  </span>
                </label>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', d.push && 'border-primary bg-primary/5')}>
                  <Checkbox checked={d.push} onCheckedChange={(v) => set('push', !!v)} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium"><BellRing className="size-4" /> Push notification</span>
                    <span className="block text-xs text-muted-foreground">Pops up once on their phones (app 1.1+)</span>
                  </span>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>When</Label>
                  <Segmented
                    value={d.when}
                    onChange={(v) => {
                      set('when', v);
                      if (v === 'later' && !d.startsAt) set('startsAt', nowLocalIst(60));
                    }}
                    options={[
                      { value: 'now', label: 'Now' },
                      { value: 'later', label: 'Schedule' },
                    ]}
                  />
                  {d.when === 'later' ? (
                    <Input type="datetime-local" value={d.startsAt} min={minLocal} onChange={(e) => set('startsAt', e.target.value)} aria-label="Start time (IST)" />
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <Label>Banner shows for</Label>
                  <Select value={d.days} onValueChange={(v) => set('days', v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="none">Until I take it down</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {d.push ? (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                  Quiet hours: pushes are not delivered between 9 pm and 8 am; they wait for 8 am. Critical ones go at
                  once.{quietNow && d.when === 'now' && d.priority !== 'critical' ? ' It is quiet hours now, so this one will go at 8 am.' : ''}
                </p>
              ) : null}
            </Section>

            {d.push ? (
              <Section n={4} title="Test it first" hint="Optional">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input inputMode="tel" maxLength={16} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Your mobile number (with the Chalkpis app)" aria-label="Test phone number" />
                  <Button type="button" variant="outline" onClick={() => void sendTest()} disabled={testPhone.replace(/\D/g, '').length < 10}>
                    <Smartphone /> Send test
                  </Button>
                </div>
              </Section>
            ) : null}
          </div>

          <aside className="border-t bg-muted/30 px-5 py-5 lg:border-t-0 lg:border-l">
            <div className="sticky top-0 grid gap-3">
              <div className="text-sm font-semibold">Preview</div>
              <Preview d={d} />
            </div>
          </aside>
        </div>
        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">{audienceText(d)}</span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {err ? <span className="self-center text-sm text-destructive">{err}</span> : null}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void publish()} disabled={busy}>
              {d.push ? <Send /> : <Megaphone />} {action}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
