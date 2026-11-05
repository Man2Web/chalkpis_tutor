import { useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DialogHost } from '@/components/app/dialogs';
import { DeleteHost } from '@/components/app/delete';
import { Shell } from '@/components/app/shell';
import { Toaster } from '@/components/app/toast';
import { UserSheet } from '@/components/app/user';
import { can, clearSession, getSession, loadMe, setOnExpired } from '@/lib/api';
import { useHashRoute } from '@/lib/hooks';
import { pageOf } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import { Login } from '@/pages/Login';
import { Activity } from '@/pages/Activity';
import { Analytics } from '@/pages/Analytics';
import { Announcements } from '@/pages/Announcements';
import { Audit } from '@/pages/Audit';
import { Centre } from '@/pages/Centre';
import { Centres } from '@/pages/Centres';
import { Cohorts } from '@/pages/Cohorts';
import { Leaders } from '@/pages/Leaders';
import { Logins } from '@/pages/Logins';
import { Overview } from '@/pages/Overview';
import { Payments } from '@/pages/Payments';
import { Revenue } from '@/pages/Revenue';
import { Signins } from '@/pages/Signins';
import { Subscriptions } from '@/pages/Subscriptions';
import { System } from '@/pages/System';
import { Team } from '@/pages/Team';
import { Empty } from '@/components/app/bits';
import { WhatsApp } from '@/pages/WhatsApp';

export default function App() {
  const { mode, toggle } = useTheme();
  const [signedIn, setSignedIn] = useState(() => !!getSession());
  const [flash, setFlash] = useState('');
  const route = useHashRoute();
  const [centreName, setCentreName] = useState('');
  // the role (and so the sidebar) is read again on every load: a change on the Team page shows at once
  const [ready, setReady] = useState(() => !!getSession()?.caps);

  useEffect(() => {
    setOnExpired(() => {
      setFlash('Your admin session ended. Please sign in again.');
      setSignedIn(false);
    });
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    // a failed read still shows the dashboard (with the last known role, or view-only); a 401 signs out instead
    loadMe()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [signedIn]);

  const signOut = async () => {
    const s = getSession();
    if (s) await fetch('/admin/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` } }).catch(() => undefined);
    clearSession();
    setFlash('');
    setSignedIn(false);
  };

  if (signedIn && !ready) return null;
  if (!signedIn)
    return (
      <TooltipProvider>
        <Login
          flash={flash}
          onSignedIn={() => {
            setFlash('');
            setReady(false);
            setSignedIn(true);
          }}
        />
        <Toaster />
      </TooltipProvider>
    );

  const view = route.parts[0] && (pageOf(route.parts[0]) || route.parts[0] === 'centre') ? route.parts[0] : 'overview';
  const allowed = view === 'centre' || can(pageOf(view)?.cap ?? 'view');
  const id = route.parts[1];
  const title = view === 'centre' ? centreName || 'Centre' : (pageOf(view)?.label ?? 'Overview');
  const pages: Record<string, React.ReactNode> = {
    overview: <Overview />,
    analytics: <Analytics />,
    cohorts: <Cohorts />,
    centres: <Centres key={route.key} query={route.query} />,
    centre: id ? <Centre key={id} id={id} tab={route.query.tab} onName={setCentreName} /> : <Overview />,
    subscriptions: <Subscriptions key={route.key} query={route.query} />,
    payments: <Payments />,
    revenue: <Revenue />,
    logins: <Logins />,
    leaders: <Leaders />,
    activity: <Activity />,
    whatsapp: <WhatsApp key={route.key} query={route.query} />,
    announce: <Announcements />,
    signins: <Signins />,
    audit: <Audit />,
    system: <System />,
    team: <Team />,
  };
  return (
    <TooltipProvider>
      <Shell view={view} title={title} onSignOut={() => void signOut()} theme={mode} onTheme={toggle}>
        {allowed ? pages[view] : <Empty text="Your role does not include this page. Ask the super admin if you need it." />}
      </Shell>
      <UserSheet />
      <DialogHost />
      <DeleteHost />
      <Toaster />
    </TooltipProvider>
  );
}
