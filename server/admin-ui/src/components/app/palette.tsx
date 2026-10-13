import { useEffect, useState } from 'react';
import { Building2, Keyboard, SunMoon } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { api } from '@/lib/api';
import { go, useDebounced } from '@/lib/hooks';
import { PAGES } from '@/lib/nav';
import { PersonAvatar } from './bits';
import { openUser } from './user';

type Found = { users: { id: string; name: string | null; phone: string | null }[]; institutes: { id: string; name: string }[] };

/** ⌘K: jump to a page, or find a person or a centre by name or phone. */
export function Palette({
  open,
  onOpenChange,
  onTheme,
  onHelp,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onTheme: () => void;
  onHelp: () => void;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 180);
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  useEffect(() => {
    let alive = true;
    if (dq.length < 2) {
      setFound(null);
      return;
    }
    api<Found>('GET', `/admin/api/search?q=${encodeURIComponent(dq)}`)
      .then((r) => alive && setFound(r))
      .catch(() => alive && setFound(null));
    return () => {
      alive = false;
    };
  }, [dq]);
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const lq = q.trim().toLowerCase();
  const pages = PAGES.filter((p) => !lq || p.label.toLowerCase().includes(lq));
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search people, centres, or jump to a page">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search people, centres, or jump to…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          {found?.users.length ? (
            <CommandGroup heading="People">
              {found.users.map((u) => (
                <CommandItem key={u.id} value={`user-${u.id}`} onSelect={() => run(() => openUser(u.id))}>
                  <PersonAvatar name={u.name || u.phone || '?'} className="size-6 text-[10px]" />
                  <span>{u.name || u.phone}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{u.phone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {found?.institutes.length ? (
            <CommandGroup heading="Centres">
              {found.institutes.map((c) => (
                <CommandItem key={c.id} value={`centre-${c.id}`} onSelect={() => run(() => go(`centre/${c.id}`))}>
                  <Building2 />
                  <span>{c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Centre</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {pages.length ? (
            <CommandGroup heading="Go to">
              {pages.map((p) => (
                <CommandItem key={p.id} value={`page-${p.id}`} onSelect={() => run(() => go(p.id))}>
                  <p.icon />
                  <span>{p.label}</span>
                  <span className="text-xs text-muted-foreground">{p.group}</span>
                  {p.keys ? <CommandShortcut>{p.keys}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {!lq || 'switch light dark theme'.includes(lq) || 'keyboard shortcuts help'.includes(lq) ? (
            <CommandGroup heading="Actions">
              <CommandItem value="theme" onSelect={() => run(onTheme)}>
                <SunMoon /> Switch light / dark <CommandShortcut>t</CommandShortcut>
              </CommandItem>
              <CommandItem value="help" onSelect={() => run(onHelp)}>
                <Keyboard /> Keyboard shortcuts <CommandShortcut>?</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
