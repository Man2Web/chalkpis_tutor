import { useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DialogHost } from '@/components/app/dialogs';
import { Shell } from '@/components/app/shell';
import { Toaster } from '@/components/app/toast';
import { UserSheet } from '@/components/app/user';
import { clearSession, getSession, setOnExpired } from '@/lib/api';
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
import { Signins } from '@/pages/Signins';
import { Subscriptions } from '@/pages/Subscriptions';
import { System } from '@/pages/System';
import { WhatsApp } from '@/pages/WhatsApp';

export default function App() {
  const { mode, toggle } = useTheme();
  const [signedIn, setSignedIn] = useState(() => !!getSession());
  const [flash, setFlash] = useState('');
  const route = useHashRoute();
  const [centreName, setCentreName] = useState('');

  useEffect(() => {
    setOnExpired(() => {
      setFlash('Your admin session ended. Please sign in again.');
      setSignedIn(false);
    });
  }, []);

  const signOut = async () => {
    const s = getSession();
    if (s) await fetch('/admin/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` } }).catch(() => undefined);
    clearSession();
    setFlash('');
    setSignedIn(false);
  };

  if (!signedIn)
    return (
      <TooltipProvider>
        <Login
          flash={flash}
          onSignedIn={() => {
            setFlash('');
            setSignedIn(true);
          }}
        />
        <Toaster />
      </TooltipProvider>
    );

  const view = route.parts[0] && (pageOf(route.parts[0]) || route.parts[0] === 'centre') ? route.parts[0] : 'overview';
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
    logins: <Logins />,
    leaders: <Leaders />,
    activity: <Activity />,
    whatsapp: <WhatsApp />,
    announce: <Announcements />,
    signins: <Signins />,
    audit: <Audit />,
    system: <System />,
  };
  return (
    <TooltipProvider>
      <Shell view={view} title={title} onSignOut={() => void signOut()} theme={mode} onTheme={toggle}>
        {pages[view]}
      </Shell>
      <UserSheet />
      <DialogHost />
      <Toaster />
    </TooltipProvider>
  );
}
