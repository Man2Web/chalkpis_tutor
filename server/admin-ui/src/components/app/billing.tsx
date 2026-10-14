import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarPlus,
  Check,
  CircleStop,
  Copy,
  CreditCard,
  ExternalLink,
  IndianRupee,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Repeat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { dateOnly, money, ymdIst } from '@/lib/format';
import { go, useApi } from '@/lib/hooks';
import type { Tone } from '@/lib/names';
import { cn } from '@/lib/utils';
import { Delta, Empty, Kpi } from './bits';
import { confirmDialog } from './dialogs';
import { Pill } from './pill';
import { toast } from './toast';

// ---------- the plan catalogue (the server's billing/plans.ts is the authority) ----------

export type PlanKey = 'trial' | 'starter' | 'standard' | 'pro';
export const PLAN_INFO: Record<PlanKey, { name: string; paise: number; months: number; students: number | null; batches: number | null }> = {
  trial: { name: 'Free trial', paise: 0, months: 0, students: null, batches: null },
  starter: { name: 'Starter', paise: 39900, months: 3, students: 50, batches: 3 },
  standard: { name: 'Standard', paise: 69900, months: 6, students: 100, batches: 5 },
  pro: { name: 'Pro', paise: 99900, months: 12, students: null, batches: null },
};
const PLAN_KEYS = Object.keys(PLAN_INFO) as PlanKey[];
export const isPlan = (p?: string | null): p is PlanKey => !!p && p in PLAN_INFO;
export const planName = (p?: string | null) => (isPlan(p) ? PLAN_INFO[p].name : p ? p[0]!.toUpperCase() + p.slice(1) : 'No plan');
export const planPrice = (p?: string | null) =>
  isPlan(p) && p !== 'trial' ? `${money(PLAN_INFO[p].paise)} every ${PLAN_INFO[p].months} months` : 'No charge';
const limitText = (n: number | null | undefined) => (n == null ? 'Unlimited' : String(n));

const DAY = 86_400_000;

// ---------- where a subscription stands, in words anyone understands ----------

export type SubFacts = { plan?: string | null; planActive?: boolean; expiresAt?: string | null };
export type SubState = { key: 'none' | 'trial' | 'active' | 'ending' | 'ended'; label: string; tone: Tone; daysLeft: number | null };

export function subscriptionState(s: SubFacts, now = Date.now()): SubState {
  if (!s.plan) return { key: 'none', label: 'No plan', tone: 'neutral', daysLeft: null };
  const end = s.expiresAt ? Date.parse(s.expiresAt) : 0;
  if (!s.planActive || end <= now) return { key: 'ended', label: 'Ended', tone: 'red', daysLeft: 0 };
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY));
  if (daysLeft <= 7) return { key: 'ending', label: daysLeft <= 1 ? 'Ends today' : `Ends in ${daysLeft} days`, tone: 'orange', daysLeft };
  if (s.plan === 'trial') return { key: 'trial', label: 'Trial', tone: 'blue', daysLeft };
  return { key: 'active', label: 'Active', tone: 'green', daysLeft };
}

export function StatusBadge({ s, className }: { s: SubFacts; className?: string }) {
  const st = subscriptionState(s);
  return (
    <Pill tone={st.tone} className={className}>
      {st.label}
    </Pill>
  );
}

/** "Paid via Razorpay", "Cash · recorded by admin"… */
const GATEWAY: Record<string, string> = { razorpay: 'Razorpay', cashfree: 'Cashfree', phonepe: 'PhonePe', mock: 'Test payment' };
const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', other: 'Other' };
export const paidVia = (provider: string, method?: string | null) =>
  provider === 'manual' ? `${METHOD[method ?? ''] ?? 'Offline'} · recorded by admin` : (GATEWAY[provider] ?? provider);

// ---------- the subscription card on a centre ----------

type CentreBilling = SubFacts & {
  id: string;
  name: string;
  planStatus?: string | null;
  studentLimit?: number | null;
  batchLimit?: number | null;
  students: number;
  batches: number;
};

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit != null && used > limit;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium tabular', over && 'text-rose-600 dark:text-rose-400')}>
          {used} <span className="font-normal text-muted-foreground">/ {limitText(limit)}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', over ? 'bg-rose-500' : pct >= 85 ? 'bg-amber-500' : 'bg-primary')}
          style={{ width: limit == null ? '100%' : `${pct}%`, opacity: limit == null ? 0.25 : 1 }}
        />
      </div>
    </div>
  );
}

/**
 * One card that says everything about a centre's subscription, the way SaaS billing pages do: the plan and its price,
 * where it stands (trial, active, ending, ended) and until when, how much of the plan is used, and the actions.
 */
export function SubscriptionCard({ c, onDone }: { c: CentreBilling; onDone: () => void }) {
  const st = subscriptionState(c);
  const [open, setOpen] = useState<'' | 'extend' | 'change' | 'record'>('');
  const plan = isPlan(c.plan) ? c.plan : null;
  const period = plan === 'trial' ? 7 : plan ? PLAN_INFO[plan].months * 30.4 : 30;
  const leftPct = st.daysLeft == null ? 0 : Math.min(100, Math.round((st.daysLeft / period) * 100));

  const endNow = async () => {
    const ok = await confirmDialog({
      title: `End ${c.name}'s subscription today?`,
      body: 'The centre can still open the app and see everything, but cannot add or change anything until a plan is paid. Nothing is deleted.',
      action: 'End subscription',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api('PUT', `/admin/api/institutes/${c.id}/subscription`, {
        plan: plan ?? 'trial',
        status: 'expired',
        endsOn: ymdIst(new Date(Date.now() - DAY).toISOString()),
        studentLimit: c.studentLimit ?? null,
        batchLimit: c.batchLimit ?? null,
      });
      toast('Subscription ended');
      onDone();
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Subscription <StatusBadge s={c} />
        </CardTitle>
        <CardDescription>What the centre is on now, and until when.</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setOpen('change')}>
                <Repeat /> Change plan or dates
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={st.key === 'ended'} onSelect={() => void endNow()}>
                <CircleStop /> End subscription now
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tracking-tight">{planName(c.plan)}</div>
            <div className="text-sm text-muted-foreground">{planPrice(c.plan)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">
              {st.key === 'ended' ? 'Ended on' : plan === 'trial' ? 'Trial ends' : 'Paid until'}
            </div>
            <div className="font-medium">{c.expiresAt ? dateOnly(c.expiresAt) : '—'}</div>
          </div>
        </div>

        {st.key !== 'ended' && st.key !== 'none' ? (
          <div className="grid gap-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', st.key === 'ending' ? 'bg-amber-500' : 'bg-emerald-500')}
                style={{ width: `${Math.max(3, leftPct)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {st.daysLeft} {st.daysLeft === 1 ? 'day' : 'days'} left
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-rose-500/25 bg-rose-500/5 px-3 py-2 text-sm">
            The app is read-only for this centre until a plan is paid. Send them the payment link, or extend the
            subscription.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Meter label="Students" used={c.students} limit={c.studentLimit} />
          <Meter label="Batches" used={c.batches} limit={c.batchLimit} />
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => setOpen('extend')}>
            <CalendarPlus /> Extend
          </Button>
          <Button variant="outline" onClick={() => setOpen('record')}>
            <IndianRupee /> Record a payment
          </Button>
          <Button variant="outline" onClick={() => setOpen('change')}>
            <Repeat /> Change plan
          </Button>
        </div>
      </CardContent>

      {open === 'extend' ? <ExtendDialog c={c} onClose={() => setOpen('')} onDone={onDone} /> : null}
      {open === 'change' ? <ChangePlanDialog c={c} onClose={() => setOpen('')} onDone={onDone} /> : null}
      {open === 'record' ? <RecordPaymentDialog c={c} onClose={() => setOpen('')} onDone={onDone} /> : null}
    </Card>
  );
}

// ---------- dialogs ----------

function Choice<T extends string>({
  value,
  options,
  onChange,
  columns = 4,
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup">
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
              'relative rounded-lg border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent/50',
            )}
          >
            <span className="block font-medium">{o.label}</span>
            {o.hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span> : null}
            {on ? <Check className="absolute right-2 top-2 size-3.5 text-primary" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Summary({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">{children}</div>;
}

function useRun(onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setErr('');
    try {
      toast(await fn());
      onClose();
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, setErr, run };
}

const LENGTHS = [
  { value: '7', label: '1 week' },
  { value: '30', label: '1 month' },
  { value: '90', label: '3 months' },
  { value: '365', label: '1 year' },
];

/** Adds days to the current end date (or to today, once it has ended). Same plan. */
function ExtendDialog({ c, onClose, onDone }: { c: CentreBilling; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState('30');
  const [opened] = useState(() => Date.now());
  const { busy, err, run } = useRun(onDone, onClose);
  const st = subscriptionState(c, opened);
  const from = st.key !== 'ended' && c.expiresAt ? Date.parse(c.expiresAt) : opened;
  const until = new Date(from + Number(days) * DAY).toISOString();
  const plan = isPlan(c.plan) ? c.plan : 'trial';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extend subscription</DialogTitle>
          <DialogDescription>
            Adds free time to {c.name}'s {planName(plan)} plan. No payment is recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Choice value={days} onChange={setDays} options={LENGTHS} />
          <Summary>
            {st.key === 'ended' ? 'Starts today and runs until ' : `Now ends on ${dateOnly(c.expiresAt)}. After this it runs until `}
            <strong>{dateOnly(until)}</strong>.
          </Summary>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await api<{ plan: string; expiresAt: string }>('POST', `/admin/api/institutes/${c.id}/plan`, {
                  plan,
                  days: Number(days),
                });
                return `Extended until ${dateOnly(r.expiresAt)}`;
              })
            }
          >
            <CalendarPlus /> Extend until {dateOnly(until)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sets the subscription exactly: plan, active or ended, last day, and (rarely) custom limits. */
function ChangePlanDialog({ c, onClose, onDone }: { c: CentreBilling; onClose: () => void; onDone: () => void }) {
  const current: PlanKey = isPlan(c.plan) ? c.plan : 'trial';
  const own = PLAN_INFO[current];
  const [plan, setPlan] = useState<PlanKey>(current);
  const [status, setStatus] = useState<'active' | 'expired'>(c.planStatus === 'expired' || !c.planActive ? 'expired' : 'active');
  const [endsOn, setEndsOn] = useState(() => ymdIst(c.expiresAt ?? new Date().toISOString()));
  // custom limits are on when the centre's limits differ from its plan's own
  const [custom, setCustom] = useState((c.studentLimit ?? null) !== own.students || (c.batchLimit ?? null) !== own.batches);
  const [students, setStudents] = useState(c.studentLimit == null ? '' : String(c.studentLimit));
  const [batches, setBatches] = useState(c.batchLimit == null ? '' : String(c.batchLimit));
  const { busy, err, run } = useRun(onDone, onClose);

  const pick = (p: PlanKey) => {
    setPlan(p);
    if (!custom) {
      setStudents(PLAN_INFO[p].students == null ? '' : String(PLAN_INFO[p].students));
      setBatches(PLAN_INFO[p].batches == null ? '' : String(PLAN_INFO[p].batches));
    }
  };
  const toLimit = (s: string) => (s.trim() === '' ? null : Math.max(1, Math.round(Number(s))));
  const sLimit = custom ? toLimit(students) : PLAN_INFO[plan].students;
  const bLimit = custom ? toLimit(batches) : PLAN_INFO[plan].batches;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>Set {c.name}'s subscription exactly. No payment is recorded and nothing is charged.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Plan</Label>
            <Choice
              value={plan}
              onChange={pick}
              columns={2}
              options={PLAN_KEYS.map((k) => ({
                value: k,
                label: PLAN_INFO[k].name,
                hint: `${limitText(PLAN_INFO[k].students)} students · ${limitText(PLAN_INFO[k].batches)} batches`,
              }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Choice
                value={status}
                onChange={setStatus}
                columns={2}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'expired', label: 'Ended' },
                ]}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ends-on">{status === 'active' ? 'Last day' : 'Ended on'}</Label>
              <Input id="ends-on" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 rounded-lg border p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">Custom limits</span>
                <span className="block text-xs text-muted-foreground">Leave off to use the plan's own limits.</span>
              </span>
              <Switch checked={custom} onCheckedChange={setCustom} />
            </label>
            {custom ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="lim-s">Students</Label>
                  <Input id="lim-s" inputMode="numeric" placeholder="Unlimited" value={students} onChange={(e) => setStudents(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lim-b">Batches</Label>
                  <Input id="lim-b" inputMode="numeric" placeholder="Unlimited" value={batches} onChange={(e) => setBatches(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
            ) : null}
          </div>
          <Summary>
            <strong>{PLAN_INFO[plan].name}</strong>, {status === 'active' ? 'active until' : 'ended on'}{' '}
            <strong>{endsOn ? dateOnly(`${endsOn}T12:00:00+05:30`) : '—'}</strong> · {limitText(sLimit)} students ·{' '}
            {limitText(bLimit)} batches
          </Summary>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !endsOn}
            onClick={() =>
              void run(async () => {
                await api('PUT', `/admin/api/institutes/${c.id}/subscription`, {
                  plan,
                  status,
                  endsOn,
                  studentLimit: sLimit,
                  batchLimit: bLimit,
                });
                return 'Subscription updated';
              })
            }
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A plan paid outside the payment page (cash, bank transfer, UPI straight to M2W). */
function RecordPaymentDialog({ c, onClose, onDone }: { c: CentreBilling; onClose: () => void; onDone: () => void }) {
  const first = isPlan(c.plan) && c.plan !== 'trial' ? c.plan : 'starter';
  const [plan, setPlan] = useState<Exclude<PlanKey, 'trial'>>(first);
  const [rupees, setRupees] = useState(String(PLAN_INFO[first].paise / 100));
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [apply, setApply] = useState(true);
  const { busy, err, run } = useRun(onDone, onClose);
  const paise = Math.round(Number(rupees || 0) * 100);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            For a plan {c.name} paid outside the payment link: cash, a bank transfer or UPI straight to M2W.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Plan paid for</Label>
            <Choice
              value={plan}
              columns={3}
              onChange={(p) => {
                setPlan(p);
                setRupees(String(PLAN_INFO[p].paise / 100));
              }}
              options={(['starter', 'standard', 'pro'] as const).map((k) => ({
                value: k,
                label: PLAN_INFO[k].name,
                hint: `${money(PLAN_INFO[k].paise)} · ${PLAN_INFO[k].months} months`,
              }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Paid by</Label>
            <Choice
              value={method}
              onChange={setMethod}
              options={Object.entries(METHOD).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pay-amt">Amount received (₹)</Label>
              <Input id="pay-amt" inputMode="decimal" value={rupees} onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-ref">Reference (optional)</Label>
              <Input id="pay-ref" maxLength={80} placeholder="UTR, receipt no., note" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              <span className="font-medium">Start the plan now</span>
              <span className="block text-xs text-muted-foreground">
                Renews or upgrades the subscription (days already paid are credited) and sends the owner the
                "plan active" WhatsApp. Turn off to record the money only.
              </span>
            </span>
            <Switch checked={apply} onCheckedChange={setApply} />
          </label>
          <Summary>
            <strong>{money(paise)}</strong> by {METHOD[method]} for {PLAN_INFO[plan].name}
            {reference ? ` (${reference})` : ''}. {apply ? 'The plan starts now.' : 'The plan does not change.'}
          </Summary>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !rupees}
            onClick={() =>
              void run(async () => {
                const r = await api<{ plan: string; expiresAt: string }>('POST', `/admin/api/institutes/${c.id}/plan-payments`, {
                  planId: plan,
                  amountPaise: paise,
                  method,
                  reference,
                  apply,
                });
                return apply ? `Payment recorded · ${planName(r.plan)} until ${dateOnly(r.expiresAt)}` : 'Payment recorded';
              })
            }
          >
            <IndianRupee /> Record {money(paise)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- payment history ----------

export type PaymentRow = {
  paymentId: string;
  at: string;
  instituteId?: string | null;
  centre?: string | null;
  plan: string | null;
  amount: number;
  provider: string;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  status?: 'paid' | 'refused';
  refusedBecause?: string | null;
  validUntil: string | null;
};

const REFUSED: Record<string, string> = {
  amount_mismatch: 'Wrong amount',
  unknown_link: 'Unknown order',
};

/** Every plan payment as a table (a stacked list on phones). */
export function PaymentsTable({ rows, showCentre = false, empty = 'No payments yet.' }: { rows: PaymentRow[]; showCentre?: boolean; empty?: string }) {
  if (!rows.length) return <Empty text={empty} icon={<CreditCard />} />;
  const status = (r: PaymentRow) =>
    r.status === 'refused' ? (
      <Pill tone="red">Refused{r.refusedBecause ? ` · ${REFUSED[r.refusedBecause] ?? r.refusedBecause}` : ''}</Pill>
    ) : (
      <Pill tone="green">Paid</Pill>
    );
  const ref = (r: PaymentRow) => r.reference ?? r.note ?? '';
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {showCentre ? <TableHead>Centre</TableHead> : null}
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Paid via</TableHead>
              <TableHead>Valid until</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.paymentId}>
                <TableCell className="whitespace-nowrap">{dateOnly(r.at)}</TableCell>
                {showCentre ? (
                  <TableCell className="max-w-48">
                    {r.instituteId ? (
                      <button className="truncate text-left font-medium hover:underline" onClick={() => go(`centre/${r.instituteId}`)}>
                        {r.centre ?? 'Centre'}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
                <TableCell>{planName(r.plan)}</TableCell>
                <TableCell className="text-right font-medium tabular">{money(r.amount)}</TableCell>
                <TableCell>
                  <span className="block">{paidVia(r.provider, r.method)}</span>
                  {ref(r) ? <span className="block max-w-56 truncate text-xs text-muted-foreground" title={ref(r)}>{ref(r)}</span> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.validUntil ? dateOnly(r.validUntil) : '—'}</TableCell>
                <TableCell>{status(r)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-2 md:hidden">
        {rows.map((r) => (
          <div key={r.paymentId} className="grid gap-1 rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium tabular">{money(r.amount)}</span>
              {status(r)}
            </div>
            {showCentre && r.centre ? <span className="font-medium">{r.centre}</span> : null}
            <span className="text-muted-foreground">
              {planName(r.plan)} · {paidVia(r.provider, r.method)} · {dateOnly(r.at)}
              {r.validUntil ? ` · until ${dateOnly(r.validUntil)}` : ''}
            </span>
            {ref(r) ? <span className="truncate text-xs text-muted-foreground">{ref(r)}</span> : null}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- the centre's payment link ----------

const digits = (p: string) => p.replace(/\D/g, '');

/** The centre's own page to choose a plan and pay: copy it, send it on WhatsApp, or open it. */
export function PayLinkCard({ url, centre, ownerName, ownerPhone }: { url: string; centre: string; ownerName: string | null; ownerPhone: string | null }) {
  const text = useMemo(
    () => `Hi${ownerName ? ` ${ownerName.split(' ')[0]}` : ''}, here is the link to choose and pay for your Chalkpis plan for ${centre}: ${url}`,
    [ownerName, centre, url],
  );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Payment link</CardTitle>
        <CardDescription>
          The centre's own page to pick a plan and pay online (UPI, card, net banking). The plan starts by itself once
          the payment goes through.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>{url}</span>
        </div>
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
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- the billing summary at the top of Subscriptions and Payments ----------

export type BillingSummary = {
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueAllTime: number;
  paymentsThisMonth: number;
  paymentsAllTime: number;
  mrr: number;
  paying: number;
  trials: number;
  endingSoon: number;
  ended: number;
  byPlan: Record<string, number>;
};
export type BillingData = { summary: BillingSummary; payments: PaymentRow[] };

/** Recurring revenue, this month's money, and the subscriptions that need attention. Tapping a count filters the list. */
export function BillingKpis({ onPick }: { onPick?: (view: 'paying' | 'trial' | 'ending' | 'ended') => void }) {
  const { data } = useApi<BillingData>('/admin/api/billing?limit=1');
  const s = data?.summary;
  const v = (x: ReactNode) => (s ? x : '…');
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Kpi
        label="Monthly recurring revenue"
        value={v(money(s?.mrr))}
        hint={s ? `From ${s.paying} paying ${s.paying === 1 ? 'centre' : 'centres'}` : undefined}
        onClick={onPick ? () => onPick('paying') : undefined}
      />
      <Kpi
        label="Revenue this month"
        value={v(money(s?.revenueThisMonth))}
        hint={s ? (<><Delta now={s.revenueThisMonth} before={s.revenueLastMonth} /> vs {money(s.revenueLastMonth)} last month</>) : undefined}
      />
      <Kpi
        label="On free trial"
        value={v(s?.trials)}
        hint="Trying Chalkpis for free"
        onClick={onPick ? () => onPick('trial') : undefined}
      />
      <Kpi
        label="Ending in 7 days"
        value={v(s?.endingSoon)}
        hint="Remind them to renew"
        onClick={onPick ? () => onPick('ending') : undefined}
      />
      <Kpi
        label="Ended"
        value={v(s?.ended)}
        hint="Read-only until they pay"
        onClick={onPick ? () => onPick('ended') : undefined}
      />
    </div>
  );
}
