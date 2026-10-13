import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, ApiError } from '@/lib/api';
import { dshort } from '@/lib/format';
import { toast } from './toast';

const PLANS = [
  ['trial', 'Trial'],
  ['starter', 'Starter'],
  ['standard', 'Standard'],
  ['pro', 'Pro'],
] as const;
const LENGTHS = [
  ['7', '7d'],
  ['30', '30d'],
  ['90', '90d'],
  ['365', '1 yr'],
] as const;

/** Change a centre's plan and extend it (from the current end if still active, else from today). */
export function PlanEditor({
  instituteId,
  plan,
  active,
  expiresAt,
  onDone,
}: {
  instituteId: string;
  plan?: string | null;
  active?: boolean;
  expiresAt?: string | null;
  onDone: () => void;
}) {
  const [p, setP] = useState(plan && PLANS.some(([k]) => k === plan) ? plan : 'trial');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ plan: string; expiresAt: string }>('POST', `/admin/api/institutes/${instituteId}/plan`, {
        plan: p,
        days: Number(days),
      });
      toast(`${r.plan} until ${dshort(r.expiresAt)}`);
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
        <CardTitle>Plan</CardTitle>
        <CardDescription>
          <span className="capitalize">{plan || '—'}</span>
          {expiresAt ? `${active ? ', active until ' : ', ended '}${dshort(expiresAt)}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ToggleGroup type="single" variant="outline" value={p} onValueChange={(v) => v && setP(v)} className="w-full">
          {PLANS.map(([k, l]) => (
            <ToggleGroupItem key={k} value={k} className="flex-1">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" value={days} onValueChange={(v) => v && setDays(v)} className="w-full">
          {LENGTHS.map(([k, l]) => (
            <ToggleGroupItem key={k} value={k} className="flex-1">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button onClick={save} disabled={busy}>
          <CalendarPlus /> Extend by {days} days
        </Button>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </CardContent>
    </Card>
  );
}
