import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, MailCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, errorText, getSession } from '@/lib/api';
import { ago, dateOnly, money, plural } from '@/lib/format';
import { planName } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { toast } from './toast';

type Kind = 'centre' | 'person';
type Item = {
  id: string;
  name: string;
  warnings: string[];
  blocker: string | null;
  // centre
  owner?: string;
  phone?: string | null;
  students?: number;
  batches?: number;
  helpers?: number;
  feesRecorded?: number;
  planPaid?: number;
  plan?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  // person
  role?: 'owner' | 'staff' | null;
  centre?: string | null;
  lastLoginAt?: string | null;
};
type Ask = { kind: Kind; ids: string[]; onDone?: (deleted: number) => void };

let open: (a: Ask) => void = () => undefined;
/**
 * Deletes test or dummy centres or people (decision 158): shows what goes, emails a code to the super admin, and
 * deletes only with that code. Works for one or many of the same kind.
 */
export const deleteDialog = (a: Ask) => open(a);

const what = (kind: Kind, n: number) => (kind === 'centre' ? plural(n, 'centre') : n === 1 ? '1 person' : `${n} people`);

export function DeleteHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    open = setAsk;
  }, []);
  return (
    <Dialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {ask ? <Body key={ask.ids.join()} ask={ask} close={() => setAsk(null)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ ask, close }: { ask: Ask; close: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [step, setStep] = useState<'check' | 'code'>('check');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [req, setReq] = useState<{ id: string; sentTo: string[]; devCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isSuper = getSession()?.role === 'super';

  useEffect(() => {
    api<{ items: Item[] }>('POST', '/admin/api/deletions/preview', { kind: ask.kind, ids: ask.ids })
      .then((r) => setItems(r.items))
      .catch((e) => setErr(errorText(e)));
  }, [ask]);

  const blocked = items?.filter((i) => i.blocker) ?? [];
  const n = items?.length ?? ask.ids.length;

  const sendCode = async () => {
    setBusy(true);
    setErr('');
    try {
      setReq(await api('POST', '/admin/api/deletions', { kind: ask.kind, ids: ask.ids, reason: reason.trim() }));
      setStep('code');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!req) return;
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ deleted: number; skipped: { name: string; why: string }[] }>(
        'POST',
        `/admin/api/deletions/${req.id}/confirm`,
        { code },
      );
      toast(
        `Deleted ${what(ask.kind, r.deleted)}${r.skipped.length ? ` · ${r.skipped.length} not deleted: ${r.skipped.map((s) => s.name).join(', ')}` : ''}`,
        !r.skipped.length,
      );
      ask.onDone?.(r.deleted);
      close();
    } catch (e) {
      const left = (e as ApiError).data?.triesLeft;
      setErr(`${errorText(e)}${typeof left === 'number' ? ` ${plural(left, 'try', 'tries')} left.` : ''}`);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Trash2 className="size-5 text-destructive" /> Delete {what(ask.kind, n)} for good?
        </DialogTitle>
        <DialogDescription>
          {ask.kind === 'centre'
            ? 'For test and dummy sign-ups. Everything in the centre goes: students, batches, attendance, fees, tests, homework, enquiries, messages, and the owner and helper logins. Plan payment records are kept for the accounts.'
            : 'For test and dummy logins. The login and its sign-ins go; a helper’s centre stays.'}{' '}
          It cannot be undone.
        </DialogDescription>
      </DialogHeader>

      {step === 'check' ? (
        <div className="grid gap-4">
          {!items && !err ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking…</div>
          ) : null}
          {items ? (
            <div className="grid max-h-72 gap-2 overflow-y-auto">
              {items.map((i) => (
                <div key={i.id} className={cn('rounded-lg border p-3 text-sm', i.blocker && 'border-destructive/50 bg-destructive/5')}>
                  <div className="font-medium">{i.name || '(no name)'}</div>
                  <div className="text-xs text-muted-foreground">
                    {ask.kind === 'centre'
                      ? [
                          `${i.owner || 'no name'}${i.phone ? ` · ${i.phone}` : ''}`,
                          `${plural(i.students ?? 0, 'student')} · ${plural(i.batches ?? 0, 'batch', 'batches')} · ${plural(i.helpers ?? 0, 'helper')}`,
                          `${planName(i.plan ?? null)} · joined ${dateOnly(i.createdAt)} · last used ${ago(i.lastActivityAt)}`,
                          i.planPaid ? `paid ${money(i.planPaid)} for plans` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : [
                          i.phone ?? '',
                          i.role === 'staff' ? `helper at ${i.centre}` : i.role === 'owner' ? `owner of ${i.centre}` : 'never set up a centre',
                          `joined ${dateOnly(i.createdAt)} · last login ${ago(i.lastLoginAt)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </div>
                  {i.blocker ? <div className="mt-1.5 text-xs font-medium text-destructive">{i.blocker}</div> : null}
                  {i.warnings.map((w) => (
                    <div key={w} className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3.5 shrink-0" /> {w}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="del-reason">Why (goes in the email and the audit log)</Label>
            <Textarea id="del-reason" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Test sign-up / dummy account / duplicate" />
          </div>
          <p className="text-xs text-muted-foreground">
            {isSuper
              ? 'A 6-digit code goes to your email. Nothing is deleted until you enter it.'
              : 'A 6-digit code goes to the super admin’s email. Nothing is deleted unless they give you the code.'}
          </p>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button variant="destructive" disabled={busy || !items || blocked.length > 0} onClick={() => void sendCode()}>
              {busy ? <Loader2 className="animate-spin" /> : <MailCheck />} {isSuper ? 'Email me the code' : 'Email the code to the super admin'}
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <p className="rounded-lg bg-muted p-3 text-sm">
            {isSuper ? 'We emailed the code to you' : 'We emailed the code to the super admin'} ({req?.sentTo.join(', ')}).{' '}
            {isSuper ? '' : 'Ask them for it. '}It works for 10 minutes, once, and only for this deletion.
            {req?.devCode ? <span className="mt-1 block font-mono text-xs">Test mode code: {req.devCode}</span> : null}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="del-code">6-digit code</Label>
            <Input
              id="del-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="h-12 text-center text-xl font-semibold tracking-[0.4em]"
              placeholder="••••••"
            />
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (req) void api('POST', `/admin/api/deletions/${req.id}/cancel`).catch(() => undefined);
                close();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete {what(ask.kind, n)}
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
}
