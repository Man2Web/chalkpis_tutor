import { useEffect, useState } from 'react';
import { CalendarPlus, CircleStop, IndianRupee, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, ApiError } from '@/lib/api';
import { dshort, money, ymdIst } from '@/lib/format';
import { confirmDialog } from './dialogs';
import { toast } from './toast';

type PlanKey = 'trial' | 'starter' | 'standard' | 'pro';
const PLANS: [PlanKey, string][] = [
  ['trial', 'Trial'],
  ['starter', 'Starter'],
  ['standard', 'Standard'],
  ['pro', 'Pro'],
];
/** Each plan's own limits (null = unlimited) and price; the server's billing/plans.ts is the authority. */
const DEFAULTS: Record<PlanKey, { students: number | null; batches: number | null; paise: number }> = {
  trial: { students: null, batches: null, paise: 0 },
  starter: { students: 50, batches: 3, paise: 39900 },
  standard: { students: 100, batches: 5, paise: 69900 },
  pro: { students: null, batches: null, paise: 99900 },
};
const LENGTHS = [
  ['7', '7d'],
  ['30', '30d'],
  ['90', '90d'],
  ['365', '1 yr'],
] as const;
const METHODS = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['bank', 'Bank'],
  ['other', 'Other'],
] as const;

const isPlan = (p?: string | null): p is PlanKey => !!p && p in DEFAULTS;
const limitText = (n: number | null) => (n === null ? 'unlimited' : String(n));
const toLimit = (s: string) => (s.trim() === '' ? null : Math.max(1, Math.round(Number(s))));

type Props = {
  instituteId: string;
  plan?: string | null;
  active?: boolean;
  planStatus?: string | null;
  expiresAt?: string | null;
  studentLimit?: number | null;
  batchLimit?: number | null;
  onDone: () => void;
};

/**
 * Full control of a centre's subscription: extend or end it in one tap, set every part of it exactly (plan, status,
 * last day, limits), and record a plan payment made outside the gateway.
 */
export function PlanEditor(props: Props) {
  return (
    <>
      <SubscriptionCard {...props} />
      <PaymentCard {...props} />
    </>
  );
}

function SubscriptionCard({ instituteId, plan, active, planStatus, expiresAt, studentLimit, batchLimit, onDone }: Props) {
  const current: PlanKey = isPlan(plan) ? plan : 'trial';
  const [p, setP] = useState<PlanKey>(current);
  const [status, setStatus] = useState<'active' | 'expired'>(planStatus === 'expired' ? 'expired' : 'active');
  const [endsOn, setEndsOn] = useState(expiresAt ? ymdIst(expiresAt) : ymdIst(new Date().toISOString()));
  const [students, setStudents] = useState(studentLimit == null ? '' : String(studentLimit));
  const [batches, setBatches] = useState(batchLimit == null ? '' : String(batchLimit));
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  // follow the centre when it reloads after a save
  useEffect(() => {
    setP(current);
    setStatus(planStatus === 'expired' ? 'expired' : 'active');
    setEndsOn(expiresAt ? ymdIst(expiresAt) : ymdIst(new Date().toISOString()));
    setStudents(studentLimit == null ? '' : String(studentLimit));
    setBatches(batchLimit == null ? '' : String(batchLimit));
  }, [current, planStatus, expiresAt, studentLimit, batchLimit]);

  const pickPlan = (v: PlanKey) => {
    setP(v);
    setStudents(DEFAULTS[v].students == null ? '' : String(DEFAULTS[v].students));
    setBatches(DEFAULTS[v].batches == null ? '' : String(DEFAULTS[v].batches));
  };

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setErr('');
    try {
      toast(await fn());
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy('');
    }
  };
  const put = (body: object) => api<{ expiresAt: string }>('PUT', `/admin/api/institutes/${instituteId}/subscription`, body);

  const extend = () =>
    run('extend', async () => {
      const r = await api<{ plan: string; expiresAt: string }>('POST', `/admin/api/institutes/${instituteId}/plan`, {
        plan: current,
        days: Number(days),
      });
      return `${r.plan} extended until ${dshort(r.expiresAt)}`;
    });
  const endNow = async () => {
    const ok = await confirmDialog({
      title: 'End this subscription now?',
      body: 'The app becomes read-only for this centre today. Nothing they saved is deleted.',
      action: 'End now',
      destructive: true,
    });
    if (!ok) return;
    await run('end', async () => {
      await put({
        plan: current,
        status: 'expired',
        endsOn: ymdIst(new Date(Date.now() - 86_400_000).toISOString()),
        studentLimit: studentLimit ?? null,
        batchLimit: batchLimit ?? null,
      });
      return 'Subscription ended';
    });
  };
  const save = async () => {
    const s = toLimit(students);
    const b = toLimit(batches);
    const ok = await confirmDialog({
      title: 'Save this subscription?',
      body: `${PLANS.find(([k]) => k === p)![1]}, ${status === 'active' ? 'active' : 'ended'}, last day ${endsOn}, students ${limitText(s)}, batches ${limitText(b)}.`,
      action: 'Save',
    });
    if (!ok) return;
    await run('save', async () => {
      await put({ plan: p, status, endsOn, studentLimit: s, batchLimit: b });
      return 'Subscription saved';
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <CardDescription>
          <span className="capitalize">{plan || '—'}</span>
          {expiresAt ? `${active ? ', active until ' : ', ended '}${dshort(expiresAt)}` : ''}
          {` · students ${limitText(studentLimit ?? null)} · batches ${limitText(batchLimit ?? null)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label>Quick</Label>
          <ToggleGroup type="single" variant="outline" value={days} onValueChange={(v) => v && setDays(v)} className="w-full">
            {LENGTHS.map(([k, l]) => (
              <ToggleGroupItem key={k} value={k} className="flex-1">
                {l}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={extend} disabled={!!busy}>
              <CalendarPlus /> Extend {days} days
            </Button>
            <Button variant="outline" onClick={endNow} disabled={!!busy || !active}>
              <CircleStop /> End now
            </Button>
          </div>
        </div>

        <div className="grid gap-3 border-t pt-4">
          <Label>Set exactly</Label>
          <ToggleGroup type="single" variant="outline" value={p} onValueChange={(v) => v && pickPlan(v as PlanKey)} className="w-full">
            {PLANS.map(([k, l]) => (
              <ToggleGroupItem key={k} value={k} className="flex-1">
                {l}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup type="single" variant="outline" value={status} onValueChange={(v) => v && setStatus(v as 'active' | 'expired')} className="w-full">
            <ToggleGroupItem value="active" className="flex-1">Active</ToggleGroupItem>
            <ToggleGroupItem value="expired" className="flex-1">Ended</ToggleGroupItem>
          </ToggleGroup>
          <div className="grid gap-1.5">
            <Label htmlFor="ends-on">Last day</Label>
            <Input id="ends-on" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
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
          <Button variant="secondary" onClick={save} disabled={!!busy || !endsOn}>
            <Save /> Save subscription
          </Button>
        </div>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </CardContent>
    </Card>
  );
}

function PaymentCard({ instituteId, onDone }: Props) {
  const [planId, setPlanId] = useState<Exclude<PlanKey, 'trial'>>('starter');
  const [rupees, setRupees] = useState(String(DEFAULTS.starter.paise / 100));
  const [method, setMethod] = useState<string>('upi');
  const [reference, setReference] = useState('');
  const [apply, setApply] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const record = async () => {
    const amountPaise = Math.round(Number(rupees || 0) * 100);
    const ok = await confirmDialog({
      title: 'Record this payment?',
      body: `${money(amountPaise)} for ${planId} by ${method}${reference ? ` (${reference})` : ''}. ${apply ? 'The plan is applied now and the owner gets the WhatsApp.' : 'Only the money is recorded; the plan does not change.'}`,
      action: 'Record',
    });
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ plan: string; expiresAt: string }>('POST', `/admin/api/institutes/${instituteId}/plan-payments`, {
        planId,
        amountPaise,
        method,
        reference,
        apply,
      });
      toast(apply ? `${r.plan} until ${dshort(r.expiresAt)}` : 'Payment recorded');
      setReference('');
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a payment</CardTitle>
        <CardDescription>A plan paid outside the payment page: cash, bank transfer or UPI to M2W.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={planId}
          onValueChange={(v) => {
            if (!v) return;
            setPlanId(v as Exclude<PlanKey, 'trial'>);
            setRupees(String(DEFAULTS[v as PlanKey].paise / 100));
          }}
          className="w-full"
        >
          {PLANS.filter(([k]) => k !== 'trial').map(([k, l]) => (
            <ToggleGroupItem key={k} value={k} className="flex-1">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-amt">Amount (₹)</Label>
            <Input id="pay-amt" inputMode="decimal" value={rupees} onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-ref">Reference</Label>
            <Input id="pay-ref" maxLength={80} placeholder="UTR / note" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <ToggleGroup type="single" variant="outline" value={method} onValueChange={(v) => v && setMethod(v)} className="w-full">
          {METHODS.map(([k, l]) => (
            <ToggleGroupItem key={k} value={k} className="flex-1">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Apply the plan (renew, or upgrade with credit for days left)</span>
          <Switch checked={apply} onCheckedChange={setApply} />
        </label>
        <Button onClick={record} disabled={busy || !rupees}>
          <IndianRupee /> Record payment
        </Button>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </CardContent>
    </Card>
  );
}
