import { useEffect, useState } from 'react';
import { Building2, LogOut, MessageCircle, Phone, ShieldBan, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, ApiError } from '@/lib/api';
import { ago, when } from '@/lib/format';
import { go, useApi } from '@/lib/hooks';
import { NOPHONE } from '@/lib/names';
import { ErrorBox, Loading, PersonAvatar } from './bits';
import { confirmDialog, promptDialog } from './dialogs';
import { Pill } from './pill';
import { PlanEditor } from './plan';
import { toast } from './toast';

export type UserRow = {
  id: string;
  phone: string | null;
  name: string | null;
  role: 'owner' | 'staff' | null;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  blocked: boolean;
  blockedReason: string | null;
  activeSessions: number;
  institute: { id: string; name: string; plan: string; active: boolean; expiresAt: string | null; students: number } | null;
};
type Detail = {
  user: UserRow;
  sessions: { startedAt: string; lastUsedAt: string; expiresAt: string; status: string }[];
  codes: { at: string; result: string }[];
};

let setOpenId: (id: string | null) => void = () => undefined;
/** Opens the person panel from anywhere (tables, feeds, search). */
export const openUser = (id: string) => setOpenId(id);

export function UserStatus({ u }: { u: Pick<UserRow, 'blocked' | 'isAdmin' | 'activeSessions'> }) {
  if (u.blocked) return <Pill tone="red">Blocked</Pill>;
  if (u.isAdmin) return <Pill tone="blue">Admin</Pill>;
  if (u.activeSessions) return <Pill tone="green">Online</Pill>;
  return <Pill>Offline</Pill>;
}

const digits = (p: string) => p.replace(/\D/g, '');

export function UserSheet() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setOpenId = setId;
  }, []);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && setId(null)}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {id ? <UserBody id={id} close={() => setId(null)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function UserBody({ id, close }: { id: string; close: () => void }) {
  const { data, error, loading, reload } = useApi<Detail>(`/admin/api/users/${id}`);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (error) return <div className="p-6"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data || (loading && !data)) return <div className="p-6"><Loading rows={6} /></div>;
  const u = data.user;
  const who = u.name || u.phone || 'this person';
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      toast(ok);
      await reload();
    } catch (e) {
      const code = (e as ApiError).code;
      setErr(code === 'cannot_change_admin' ? 'Admin accounts cannot be changed here.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SheetHeader className="gap-3 border-b p-6">
        <div className="flex items-center gap-3">
          <PersonAvatar name={u.name || u.phone || '?'} className="size-12 text-base" />
          <div className="min-w-0">
            <SheetTitle className="truncate text-lg">{u.name || '(no name)'}</SheetTitle>
            <SheetDescription>{u.phone || NOPHONE}</SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {u.phone ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${u.phone}`}><Phone /> Call</a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`https://wa.me/${digits(u.phone)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
              </Button>
            </>
          ) : null}
          {u.institute ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                close();
                go(`centre/${u.institute!.id}`);
              }}
            >
              <Building2 /> Open centre
            </Button>
          ) : null}
        </div>
      </SheetHeader>
      <div className="grid gap-4 p-6">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Status</dt><dd><UserStatus u={u} /></dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>{u.role === 'owner' ? 'Tutor (owner)' : u.role === 'staff' ? 'Helper' : 'Not set up yet'}</dd>
              <dt className="text-muted-foreground">Centre</dt><dd>{u.institute?.name ?? '—'}</dd>
              <dt className="text-muted-foreground">Joined</dt><dd>{when(u.createdAt)}</dd>
              <dt className="text-muted-foreground">Last login</dt><dd>{when(u.lastLoginAt)}</dd>
              <dt className="text-muted-foreground">Devices</dt><dd className="tabular">{u.activeSessions}</dd>
              {u.blocked ? (<><dt className="text-muted-foreground">Block reason</dt><dd>{u.blockedReason || '—'}</dd></>) : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || u.isAdmin || !u.activeSessions}
              onClick={async () => {
                if (await confirmDialog({ title: `Sign ${who} out on every device?`, action: 'Sign out everywhere' }))
                  void act(() => api('POST', `/admin/api/users/${u.id}/sign-out`), 'Signed out everywhere');
              }}
            >
              <LogOut /> Sign out everywhere
            </Button>
            {u.blocked ? (
              <Button variant="outline" disabled={busy} onClick={() => void act(() => api('POST', `/admin/api/users/${u.id}/unblock`), 'Unblocked')}>
                <ShieldCheck /> Unblock
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={busy || u.isAdmin}
                onClick={async () => {
                  const reason = await promptDialog({
                    title: `Block ${who}?`,
                    body: 'They are signed out at once and cannot sign in.',
                    action: 'Block',
                    destructive: true,
                    input: { label: 'Reason (optional)', maxLength: 200 },
                  });
                  if (reason !== null) void act(() => api('POST', `/admin/api/users/${u.id}/block`, { reason }), 'Blocked');
                }}
              >
                <ShieldBan /> Block
              </Button>
            )}
            {err ? <p className="w-full text-sm text-destructive">{err}</p> : null}
          </CardContent>
        </Card>
        {u.institute && u.role === 'owner' ? (
          <PlanEditor
            instituteId={u.institute.id}
            plan={u.institute.plan}
            active={u.institute.active}
            expiresAt={u.institute.expiresAt}
            onDone={reload}
          />
        ) : null}
        <Card>
          <CardHeader><CardTitle>Devices</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {data.sessions.length ? (
              data.sessions.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Since {when(s.startedAt)} · used {ago(s.lastUsedAt)}</span>
                  <Pill tone={s.status === 'active' ? 'green' : 'neutral'}>{s.status}</Pill>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No sign-ins.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent login codes</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {data.codes.length ? (
              data.codes.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{when(c.at)}</span>
                  <Pill tone={c.result === 'used' ? 'green' : c.result.startsWith('wrong') ? 'red' : 'neutral'}>{c.result}</Pill>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">None.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
