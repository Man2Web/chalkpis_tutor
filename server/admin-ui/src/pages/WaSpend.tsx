import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, IndianRupee, Plus, Settings2, Trash2, Wallet } from 'lucide-react';
import { Empty, ErrorBox, Kpi, Loading } from '@/components/app/bits';
import { Bars, C } from '@/components/app/charts';
import { confirmDialog } from '@/components/app/dialogs';
import { Pill } from '@/components/app/pill';
import { toast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, can, errorText } from '@/lib/api';
import { dlong, dshort, num, plural, when } from '@/lib/format';
import { go, useApi } from '@/lib/hooks';
import { planName } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { rupees } from './Centre';

type Category = 'utility' | 'authentication' | 'marketing';
type Spend = {
  rates: Record<Category, number>;
  categories: Record<string, Category>;
  kinds: Record<string, string>;
  warnDays: number;
  warnBelow: number;
  updatedBy: string;
  wallet: {
    status: 'ok' | 'low' | 'empty' | 'unknown';
    balance: number | null;
    readAt: string | null;
    rechargedSince: number;
    spentSince: number;
    perDay: number;
    daysLeft: number | null;
    runsOutOn: string | null;
    rechargeBy: string | null;
    suggest: number;
    entries: { id: string; kind: 'recharge' | 'balance'; amount: number; note: string; at: string; by: string }[];
  };
  totals: { today: number; todaySent: number; month: number; monthSent: number; lastMonth: number };
  byDay: { day: string; sent: number; paise: number }[];
  byKind: { kind: string; label: string; category: Category; sent: number; paise: number }[];
};
type ByCentre = {
  days: number;
  centres: { id: string | null; name: string; deleted: boolean; plan: string | null; sent: number; loginCodes: number; paise: number }[];
};

const CAT_LABEL: Record<Category, string> = { utility: 'Utility', authentication: 'Authentication', marketing: 'Marketing' };
const day = (ymd: string) => `${ymd}T12:00:00+05:30`;
const PORTAL = 'https://wa.adsme.in';

/** What WhatsApp costs Chalkpis, the balance at the gateway and when to recharge, and the spend per centre. */
export function WaSpend() {
  const { data, error, reload } = useApi<Spend>('/admin/api/wa-spend?days=30');
  const [entry, setEntry] = useState<'recharge' | 'balance' | null>(null);
  const [rates, setRates] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={8} />;
  const w = data.wallet;
  const manage = can('manage');
  const tone =
    w.status === 'empty' || w.status === 'low'
      ? 'border-rose-500/40 bg-rose-500/5'
      : w.status === 'ok'
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-amber-500/40 bg-amber-500/5';
  return (
    <div className="grid gap-6">
      <Card className={cn('gap-3', tone)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {w.status === 'ok' ? <CheckCircle2 className="size-5 text-emerald-600" /> : <AlertTriangle className={cn('size-5', w.status === 'unknown' ? 'text-amber-600' : 'text-rose-600')} />}
            {w.status === 'unknown'
              ? 'Balance not known yet'
              : w.status === 'empty'
                ? 'The WhatsApp balance has run out (estimated)'
                : w.status === 'low'
                  ? 'Recharge the WhatsApp balance soon'
                  : 'WhatsApp balance is fine'}
          </CardTitle>
          <CardDescription>
            {w.status === 'unknown' ? (
              <>Open wa.adsme.in, read the wallet balance, and enter it here with “Update balance”. From then on the dashboard keeps an estimate and warns you before it runs out.</>
            ) : (
              <>
                About <b className="text-foreground">{rupees(Math.max(0, w.balance ?? 0))}</b> left
                {w.daysLeft !== null ? <> · lasts about <b className="text-foreground">{plural(w.daysLeft, 'day')}</b> at {rupees(w.perDay)} a day</> : null}
                {w.runsOutOn && w.status !== 'empty' ? <> · runs out around {dshort(day(w.runsOutOn))}</> : null}
                {w.rechargeBy && w.status !== 'ok' ? <> · <b className="text-foreground">recharge by {dshort(day(w.rechargeBy))}</b></> : null}
                {w.suggest ? <> · {rupees(w.suggest)} covers the next 30 days</> : null}.
                <span className="mt-1 block">
                  {w.readAt ? `Balance last read from wa.adsme.in ${when(w.readAt)}` : 'Counted from the first recharge'}
                  {w.rechargedSince ? ` · ${rupees(w.rechargedSince)} recharged since` : ''} · {rupees(w.spentSince)} spent since (estimated).
                </span>
              </>
            )}
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={PORTAL} target="_blank" rel="noreferrer"><ExternalLink /> wa.adsme.in</a>
            </Button>
          </CardAction>
        </CardHeader>
        {manage ? (
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEntry('recharge')}><Plus /> I recharged</Button>
            <Button size="sm" variant="outline" onClick={() => setEntry('balance')}><Wallet /> Update balance</Button>
            <Button size="sm" variant="outline" onClick={() => setRates(true)}><Settings2 /> Rates &amp; alerts</Button>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Today" value={rupees(data.totals.today)} hint={plural(data.totals.todaySent, 'message')} icon={<IndianRupee />} />
        <Kpi label="This month" value={rupees(data.totals.month)} hint={plural(data.totals.monthSent, 'message')} icon={<IndianRupee />} />
        <Kpi label="Last month" value={rupees(data.totals.lastMonth)} icon={<IndianRupee />} />
        <Kpi label="A day, last 7 days" value={rupees(w.perDay)} hint={`about ${rupees(w.perDay * 30)} a month`} icon={<IndianRupee />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Spend per day · last 30 days</CardTitle>
            <CardDescription>Messages the gateway accepted, times the rate for their WhatsApp category</CardDescription>
          </CardHeader>
          <CardContent>
            <Bars
              labels={data.byDay.map((d) => dshort(day(d.day)))}
              values={data.byDay.map((d) => d.paise)}
              tips={data.byDay.map((d) => `${dlong(day(d.day))} · ${plural(d.sent, 'message')}`)}
              name="Spend"
              color={C.green}
              isMoney
              height={220}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By message · 30 days</CardTitle>
            <CardDescription>
              Rates: utility {data.rates.utility}p · authentication {data.rates.authentication}p · marketing {data.rates.marketing}p
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.byKind.length ? (
              <dl className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2.5 text-sm">
                {data.byKind.map((k) => (
                  <div key={k.kind} className="contents">
                    <dt className="min-w-0">
                      <div className="truncate">{k.label}</div>
                      <div className="text-xs text-muted-foreground">{CAT_LABEL[k.category]}</div>
                    </dt>
                    <dd className="text-right tabular text-muted-foreground">{num(k.sent)}</dd>
                    <dd className="text-right font-medium tabular">{rupees(k.paise)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Empty text="Nothing sent in 30 days." />
            )}
          </CardContent>
        </Card>
      </div>

      <PerCentre />

      <Card>
        <CardHeader>
          <CardTitle>Wallet history</CardTitle>
          <CardDescription>
            Recharges and balance readings. The wa.adsme.in wallet can also pay for messages that are not Chalkpis’s (another system uses the
            same account), so update the balance from the portal now and then to keep the estimate true.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {w.entries.length ? (
            w.entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Pill tone={e.kind === 'recharge' ? 'green' : 'blue'}>{e.kind === 'recharge' ? 'Recharged' : 'Balance read'}</Pill>
                    <span className="font-medium tabular">{rupees(e.amount)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {when(e.at)} · {e.by}{e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                {manage ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove this entry"
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Remove this entry?', body: 'Only if it was entered by mistake. The balance estimate is worked out again.', action: 'Remove', destructive: true }))
                        await api('DELETE', `/admin/api/wa-spend/wallet/${e.id}`).then(() => toast('Removed')).catch((x) => toast(errorText(x), false));
                    }}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <Empty text="No recharges or balance readings yet." />
          )}
        </CardContent>
      </Card>
      {entry ? <WalletDialog kind={entry} suggest={w.suggest} onClose={() => setEntry(null)} /> : null}
      {rates ? <RatesDialog data={data} onClose={() => setRates(false)} /> : null}
    </div>
  );
}

function PerCentre() {
  const [days, setDays] = useState('30');
  const { data, error, loading, reload } = useApi<ByCentre>(`/admin/api/wa-spend/centres?days=${days}`);
  const total = data?.centres.reduce((a, c) => a + c.paise, 0) ?? 0;
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Spend per centre</CardTitle>
        <CardDescription>{data ? `${plural(data.centres.length, 'centre')} · ${rupees(total)} in all` : 'Which centres send the most'}</CardDescription>
        <CardAction>
          <Tabs value={days} onValueChange={setDays}>
            <TabsList>
              <TabsTrigger value="7">7 d</TabsTrigger>
              <TabsTrigger value="30">30 d</TabsTrigger>
              <TabsTrigger value="90">90 d</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      {error ? (
        <CardContent className="pb-6"><ErrorBox error={error} onRetry={reload} /></CardContent>
      ) : !data ? (
        <CardContent className="pb-6"><Loading rows={5} /></CardContent>
      ) : (
        <Table className={cn('transition-opacity', loading && 'opacity-60')}>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Centre</TableHead>
              <TableHead className="hidden md:table-cell">Plan</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Login codes</TableHead>
              <TableHead className="pr-6 text-right">Spend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.centres.length ? (
              data.centres.map((c) => (
                <TableRow key={c.id ?? 'none'} className={c.id && !c.deleted ? 'cursor-pointer' : ''} onClick={() => (c.id && !c.deleted ? go(`centre/${c.id}?tab=messages`) : undefined)}>
                  <TableCell className={cn('max-w-[18rem] truncate pl-6 font-medium', (!c.id || c.deleted) && 'text-muted-foreground')}>{c.name}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.id && !c.deleted ? planName(c.plan) : '—'}</TableCell>
                  <TableCell className="text-right tabular">{num(c.sent)}</TableCell>
                  <TableCell className="hidden text-right tabular text-muted-foreground sm:table-cell">{num(c.loginCodes)}</TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular">{rupees(c.paise)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={5}><Empty text="Nothing sent in this time." /></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** Rupees typed by a person ("1,500" or "1500.50") to paise, or null. */
const toPaise = (s: string) => {
  const v = Number(s.replace(/[,₹\s]/g, ''));
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
};

function WalletDialog({ kind, suggest, onClose }: { kind: 'recharge' | 'balance'; suggest: number; onClose: () => void }) {
  const [amount, setAmount] = useState(kind === 'recharge' && suggest ? String(suggest / 100) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    const paise = toPaise(amount);
    if (paise === null) return setErr('Enter the amount in rupees.');
    setBusy(true);
    try {
      await api('POST', '/admin/api/wa-spend/wallet', { kind, amount: paise, note: note.trim() });
      toast(kind === 'recharge' ? 'Recharge noted' : 'Balance updated');
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'recharge' ? 'I recharged the WhatsApp wallet' : 'Update the balance'}</DialogTitle>
          <DialogDescription>
            {kind === 'recharge'
              ? 'After you add money on wa.adsme.in, note it here so the balance estimate goes up.'
              : 'Type the wallet balance exactly as wa.adsme.in shows it right now. The estimate starts again from it.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="w-amount">{kind === 'recharge' ? 'Amount added (₹)' : 'Balance now (₹)'}</Label>
            <Input id="w-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2000" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-note">Note (optional)</Label>
            <Input id="w-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'recharge' ? 'UPI ref 1234, invoice…' : ''} />
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !amount.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RatesDialog({ data, onClose }: { data: Spend; onClose: () => void }) {
  const [rates, setRates] = useState({ ...data.rates });
  const [cats, setCats] = useState<Record<string, Category>>({ ...data.categories });
  const [warnDays, setWarnDays] = useState(String(data.warnDays));
  const [warnBelow, setWarnBelow] = useState(String(data.warnBelow / 100));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('PUT', '/admin/api/wa-spend/rates', {
        utility: Number(rates.utility),
        authentication: Number(rates.authentication),
        marketing: Number(rates.marketing),
        categories: cats,
        warnDays: Math.max(1, Math.round(Number(warnDays) || 7)),
        warnBelow: toPaise(warnBelow) ?? 0,
      });
      toast('Rates saved');
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rates &amp; alerts</DialogTitle>
          <DialogDescription>
            What wa.adsme.in takes from the wallet for one message, in paise (100 paise = ₹1), by the category WhatsApp gave the template. The
            portal’s price list or a recent deduction shows the right numbers.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            {(['utility', 'authentication', 'marketing'] as Category[]).map((c) => (
              <div key={c} className="grid gap-1.5">
                <Label htmlFor={`r-${c}`}>{CAT_LABEL[c]}</Label>
                <Input
                  id={`r-${c}`}
                  inputMode="decimal"
                  value={String(rates[c])}
                  onChange={(e) => setRates((r) => ({ ...r, [c]: e.target.value as unknown as number }))}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <Label>Category of each message</Label>
            <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-lg border p-2">
              {Object.entries(data.kinds).map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{label}</span>
                  <Select value={cats[k] ?? 'utility'} onValueChange={(v) => setCats((s) => ({ ...s, [k]: v as Category }))}>
                    <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['utility', 'authentication', 'marketing'] as Category[]).map((c) => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-days">Warn when it lasts fewer than (days)</Label>
              <Input id="r-days" inputMode="numeric" value={warnDays} onChange={(e) => setWarnDays(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-below">or the balance is under (₹)</Label>
              <Input id="r-below" inputMode="decimal" value={warnBelow} onChange={(e) => setWarnBelow(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">While it is low, the super admin gets one email a day, and the Overview shows it.</p>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

