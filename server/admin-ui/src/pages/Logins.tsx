import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader, PersonAvatar } from '@/components/app/bits';
import { Pill } from '@/components/app/pill';
import { toast } from '@/components/app/toast';
import { openUser, UserStatus, type UserRow } from '@/components/app/user';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadCsv } from '@/lib/api';
import { ago, plural } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { NOPHONE } from '@/lib/names';
import { cn } from '@/lib/utils';

const FILTERS = [
  ['all', 'Everyone'],
  ['owners', 'Tutors'],
  ['staff', 'Helpers'],
  ['blocked', 'Blocked'],
  ['no-institute', 'Not set up'],
] as const;
const PAGE = 50;

export function Logins() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q.trim(), 280);
  const { data, error, loading, reload } = useApi<{ users: UserRow[] }>(
    `/admin/api/users?q=${encodeURIComponent(dq)}&filter=${filter}&limit=${PAGE}&offset=${offset}`,
  );
  const rows = data?.users ?? [];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="People"
        description="Every tutor and helper who has signed in. Open someone to block them, sign them out or see their centre."
        actions={
          <Button
            variant="outline"
            onClick={() => downloadCsv('/admin/api/export/users.csv', 'chalkpis-logins.csv').then(() => toast('Downloaded chalkpis-logins.csv')).catch((e: Error) => toast(e.message, false))}
          >
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="Search name, phone or centre"
            className="pl-8"
          />
        </div>
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
        >
          <TabsList className="flex h-auto flex-wrap">
            {FILTERS.map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading rows={8} />
      ) : (
        <Card className={cn('py-0 transition-opacity', loading && 'opacity-60')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Person</TableHead>
                <TableHead className="hidden md:table-cell">Role</TableHead>
                <TableHead className="hidden lg:table-cell">Centre</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="hidden md:table-cell">Last login</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer" onClick={() => openUser(u.id)}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <PersonAvatar name={u.name || u.phone || '?'} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.name || '(no name)'}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.phone || NOPHONE}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.role === 'owner' ? 'Tutor' : u.role === 'staff' ? 'Helper' : '—'}</TableCell>
                    <TableCell className="hidden max-w-[14rem] truncate lg:table-cell">{u.institute?.name ?? '—'}</TableCell>
                    <TableCell>
                      {u.institute ? (
                        <Pill tone={u.institute.active ? 'green' : 'orange'} className="capitalize">
                          {u.institute.plan}{u.institute.active ? '' : ' · ended'}
                        </Pill>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div>{ago(u.lastLoginAt)}</div>
                      <div className="text-xs text-muted-foreground">{plural(u.activeSessions, 'device')}</div>
                    </TableCell>
                    <TableCell className="pr-4"><UserStatus u={u} /></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6}><Empty text="No logins match." /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {rows.length ? `${offset + 1}–${offset + rows.length}` : '0'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!offset} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
                <ChevronLeft /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={rows.length < PAGE} onClick={() => setOffset((o) => o + PAGE)}>
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
