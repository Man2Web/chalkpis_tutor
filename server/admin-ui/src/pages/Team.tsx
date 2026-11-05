import { useState } from 'react';
import { LogOut, Plus, ShieldCheck, UserMinus } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader, PersonAvatar } from '@/components/app/bits';
import { confirmDialog } from '@/components/app/dialogs';
import { Pill } from '@/components/app/pill';
import { toast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorText, getSession } from '@/lib/api';
import { ago, dateOnly } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Member = {
  id: string;
  email: string;
  name: string;
  role: 'super' | 'admin' | 'support';
  status: 'active' | 'invited' | 'removed';
  addedBy: string;
  lastLoginAt: string | null;
  removedAt: string | null;
  createdAt: string;
  signedIn: boolean;
};

export const ROLES: { id: 'super' | 'admin' | 'support'; label: string; can: string; cannot: string }[] = [
  {
    id: 'super',
    label: 'Super admin',
    can: 'Everything, plus this Team page. Every deletion code is emailed here.',
    cannot: 'Set on the server (ADMIN_EMAILS), so nobody can change or remove it from the dashboard.',
  },
  {
    id: 'admin',
    label: 'Admin',
    can: 'Runs Chalkpis day to day: plans and plan payments, block people, announcements, revenue, exports, the WhatsApp wallet, the audit log. Can ask to delete test centres and people.',
    cannot: 'Cannot manage the team, and a deletion only goes through with the code emailed to the super admin.',
  },
  {
    id: 'support',
    label: 'Customer support',
    can: 'Looks up centres and people, login codes, WhatsApp messages and spend, live activity. Signs people out, retries messages, resends the welcome, keeps notes and tags.',
    cannot: 'Cannot change plans or payments, block, send announcements, see revenue, export data or delete.',
  },
];
const roleLabel = (r: string) => ROLES.find((x) => x.id === r)?.label ?? r;
const TONE = { super: 'blue', admin: 'green', support: 'neutral' } as const;

export function Team() {
  const { data, error, reload } = useApi<{ team: Member[] }>('/admin/api/team');
  const [adding, setAdding] = useState(false);
  const me = getSession()?.email;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading rows={6} />;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(errorText(e), false);
    }
  };
  const live = data.team.filter((m) => m.status !== 'removed');
  const removed = data.team.filter((m) => m.status === 'removed');
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Team"
        description="Who can open this dashboard. A new member gets an email with how to set their password; every sign-in also needs a code sent to their email."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add member
          </Button>
        }
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {live.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={m.name || m.email} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {m.name || m.email.split('@')[0]} {m.email === me ? <span className="text-muted-foreground">(you)</span> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {m.role === 'super' ? (
                    <Pill tone="blue"><ShieldCheck className="size-3" /> Super admin</Pill>
                  ) : (
                    <Select
                      value={m.role}
                      onValueChange={(role) =>
                        void act(() => api('PUT', `/admin/api/team/${m.id}`, { role }), `${m.name || m.email} is now ${roleLabel(role)}`)
                      }
                    >
                      <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="support">Customer support</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {m.status === 'invited' ? (
                    <Pill tone="orange">Password not set yet</Pill>
                  ) : m.signedIn ? (
                    <Pill tone="green">Signed in</Pill>
                  ) : (
                    <Pill>Active</Pill>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{ago(m.lastLoginAt)}</TableCell>
                <TableCell className="pr-4">
                  {m.role === 'super' ? (
                    <div className="text-right text-xs text-muted-foreground">Set on the server</div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!m.signedIn}
                        onClick={async () => {
                          if (await confirmDialog({ title: `Sign ${m.name || m.email} out?`, body: 'Every open dashboard session of theirs ends. They can sign in again.', action: 'Sign out' }))
                            void act(() => api('POST', `/admin/api/team/${m.id}/sign-out`), 'Signed out');
                        }}
                      >
                        <LogOut /> <span className="hidden xl:inline">Sign out</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={async () => {
                          if (
                            await confirmDialog({
                              title: `Remove ${m.name || m.email} from the team?`,
                              body: 'They lose access at once and are signed out. You can add them again later.',
                              action: 'Remove',
                              destructive: true,
                            })
                          )
                            void act(() => api('DELETE', `/admin/api/team/${m.id}`), 'Removed from the team');
                        }}
                      >
                        <UserMinus /> <span className="hidden xl:inline">Remove</span>
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pill tone={TONE[r.id]}>{r.label}</Pill>
              </CardTitle>
              <CardDescription>{r.can}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{r.cannot}</CardContent>
          </Card>
        ))}
      </div>

      {removed.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Removed</CardTitle>
            <CardDescription>No access. Kept so the audit log still says who did what.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {removed.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span>{m.name || m.email} <span className="text-muted-foreground">· {m.email}</span></span>
                <span className="text-muted-foreground">removed {dateOnly(m.removedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {!live.length ? <Empty text="Nobody yet." /> : null}
      <AddMember open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function AddMember({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'support'>('support');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ emailed: boolean }>('POST', '/admin/api/team', { email: email.trim(), name: name.trim(), role });
      toast(r.emailed ? `Added. We emailed ${email.trim()} how to start.` : 'Added, but the email did not go. Tell them to use "First time? Set a password".');
      setEmail('');
      setName('');
      onOpenChange(false);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>They get an email telling them to open this dashboard and set their own password.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="m-name">Name</Label>
            <Input id="m-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Sanjay Kumar" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="m-email">Work email</Label>
            <Input id="m-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@man2web.com" />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="support">Customer support</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.id === role)!.can}</p>
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !email.trim()}>Add and email them</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
