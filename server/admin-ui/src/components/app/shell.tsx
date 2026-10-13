import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Keyboard, LogOut, Moon, Search, Sun } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, getSession } from '@/lib/api';
import { go, useStored } from '@/lib/hooks';
import { JUMP, NAV, pageOf } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { PersonAvatar } from './bits';
import { EventRow, type Ev } from './events';
import { Palette } from './palette';

const BELL_KINDS = 'signup,centre,payment,message-failed,plan';

export function Shell({
  view,
  title,
  onSignOut,
  theme,
  onTheme,
  children,
}: {
  view: string;
  title: string;
  onSignOut: () => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  children: ReactNode;
}) {
  const [sideOpen, setSideOpen] = useStored('adm-side-open', true);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [live, setLive] = useStored('adm-live', false);
  const page = pageOf(view === 'centre' ? 'centres' : view);

  useEffect(() => {
    document.title = `${title} · Chalkpis Admin`;
  }, [title]);

  // Live: every 30 s the open page reloads its data (not while a panel or dialog is open, or the tab is hidden).
  useEffect(() => {
    if (!live || view === 'activity') return;
    const id = setInterval(() => {
      if (document.hidden || document.querySelector('[role="dialog"]')) return;
      window.dispatchEvent(new Event('adm:refresh'));
    }, 30000);
    return () => clearInterval(id);
  }, [live, view]);

  // Keyboard: ⌘K or / search, ? help, t theme, [ sidebar, g then a letter jumps.
  const gAt = useRef(0);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (Date.now() - gAt.current < 900 && JUMP[e.key]) {
        gAt.current = 0;
        go(JUMP[e.key]);
        return;
      }
      if (e.key === 'g') gAt.current = Date.now();
      else if (e.key === '/') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '?') setHelp(true);
      else if (e.key === 't') onTheme();
      else if (e.key === '[') setSideOpen((o) => !o);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onTheme, setSideOpen]);

  return (
    <SidebarProvider open={sideOpen} onOpenChange={setSideOpen}>
      <AppSidebar view={view} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground">{page?.group ?? ''}</div>
            <div className="-mt-0.5 truncate text-sm font-medium">{title}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="hidden w-52 justify-start gap-2 text-muted-foreground sm:flex"
            onClick={() => setPalette(true)}
          >
            <Search />
            Search…
            <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
          </Button>
          <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setPalette(true)} aria-label="Search">
            <Search />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="hidden gap-2 md:flex"
                aria-pressed={live}
                onClick={() => setLive((v) => !v)}
              >
                <span className="relative flex size-2">
                  {live ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /> : null}
                  <span className={cn('relative inline-flex size-2 rounded-full', live ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                </span>
                {live ? 'Live' : 'Paused'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{live ? 'Refreshing every 30 seconds' : 'Turn on to refresh every 30 seconds'}</TooltipContent>
          </Tooltip>
          <Notifications />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
                <PersonAvatar name={getSession()?.email ?? 'Admin'} className="size-7" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-xs text-muted-foreground">Signed in as</div>
                <div className="truncate text-sm font-medium">{getSession()?.email ?? 'Admin'}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onTheme}>
                {theme === 'dark' ? <Sun /> : <Moon />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHelp(true)}>
                <Keyboard /> Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
      <Palette open={palette} onOpenChange={setPalette} onTheme={onTheme} onHelp={() => setHelp(true)} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </SidebarProvider>
  );
}

function AppSidebar({ view }: { view: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const active = view === 'centre' ? 'centres' : view;
  const email = getSession()?.email ?? 'Admin';
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <a href="#/overview" className="flex h-10 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img src="/admin-logo/logo-mark.svg" alt="" className="hidden size-6 group-data-[collapsible=icon]:block" />
          <img src="/admin-logo/logo.svg" alt="Chalkpis" className="h-6 group-data-[collapsible=icon]:hidden dark:hidden" />
          <img src="/admin-logo/logo-dark.svg" alt="Chalkpis" className="hidden h-6 group-data-[collapsible=icon]:hidden dark:block dark:group-data-[collapsible=icon]:hidden" />
          <Badge variant="secondary" className="ml-auto group-data-[collapsible=icon]:hidden">Admin</Badge>
        </a>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => (
          <SidebarGroup key={g.group}>
            <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
            <SidebarMenu>
              {g.pages.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton asChild isActive={active === p.id} tooltip={p.label}>
                    <a
                      href={`#/${p.id}`}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <p.icon />
                      <span>{p.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg p-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <PersonAvatar name={email} className="size-7" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-xs text-muted-foreground">Admin</div>
            <div className="truncate text-sm">{email}</div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** New sign-ups, centres, payments, failed messages and plans since you last looked. */
function Notifications() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [seenBefore, setSeenBefore] = useState('');
  useEffect(() => {
    const poll = async () => {
      const seen = localStorage.getItem('adm-seen');
      if (!seen) {
        localStorage.setItem('adm-seen', new Date().toISOString());
        return;
      }
      try {
        const r = await api<{ events: Ev[] }>('GET', `/admin/api/events?limit=100&kinds=${BELL_KINDS}`);
        setCount(r.events.filter((e) => e.at > seen).length);
      } catch {
        /* the next poll tries again */
      }
    };
    void poll();
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, []);
  const openBell = async (o: boolean) => {
    setOpen(o);
    if (!o) return;
    setSeenBefore(localStorage.getItem('adm-seen') ?? '');
    localStorage.setItem('adm-seen', new Date().toISOString());
    setCount(0);
    setEvents(null);
    try {
      setEvents((await api<{ events: Ev[] }>('GET', `/admin/api/events?limit=40&kinds=${BELL_KINDS}`)).events);
    } catch {
      setEvents([]);
    }
  };
  return (
    <Popover open={open} onOpenChange={(o) => void openBell(o)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${count ? `, ${count} new` : ''}`}>
          <Bell />
          {count ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { setOpen(false); go('activity'); }}>
            Open feed
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {events === null ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : events.length ? (
            events.map((e, i) => <EventRow key={i} e={e} compact fresh={!!seenBefore && e.at > seenBefore} />)
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">All caught up.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Search anything', '⌘ K'],
  ['Go to Overview', 'g o'],
  ['Go to Analytics', 'g a'],
  ['Go to Retention', 'g r'],
  ['Go to Centres', 'g c'],
  ['Go to Logins', 'g l'],
  ['Go to Live activity', 'g f'],
  ['Go to WhatsApp', 'g w'],
  ['Go to Announcements', 'g n'],
  ['Go to System health', 'g s'],
  ['Toggle light / dark', 't'],
  ['Collapse the sidebar', '['],
  ['Close a panel', 'esc'],
  ['This help', '?'],
];
function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without the mouse.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 text-sm">
          {SHORTCUTS.map(([a, k]) => (
            <div key={a} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted">
              <span>{a}</span>
              <span className="flex gap-1">
                {k.split(' ').map((x) => (
                  <kbd key={x} className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs">
                    {x}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
