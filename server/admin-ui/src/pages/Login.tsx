import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, saveSession } from '@/lib/api';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'code' | 'forgot' | 'reset';
const ERR: Record<string, string> = {
  invalid_credentials: 'Email or password is wrong.',
  invalid_code: 'That code is wrong or has expired.',
  unavailable: 'Email is not working right now. Try again later.',
  too_short: 'Use at least 12 characters.',
  too_long: 'Use at most 128 characters.',
  needs_mix: 'Use upper and lower case letters, a number and a symbol.',
  too_common: 'That password is too common. Choose another.',
  contains_email: 'Do not use your email name in the password.',
  rate_limited: 'Too many tries. Wait a few minutes.',
};
const COPY: Record<Mode, { title: string; sub: string; button: string; link: string; to: Mode }> = {
  login: { title: 'Admin sign in', sub: 'Email and password, then a code we email you.', button: 'Continue', link: 'Forgot password?', to: 'forgot' },
  code: { title: 'Check your email', sub: 'Enter the 6-digit code. It works for 10 minutes.', button: 'Sign in', link: 'Start again', to: 'login' },
  forgot: { title: 'Reset password', sub: 'We email a code to your admin address.', button: 'Send code', link: 'Back to sign in', to: 'login' },
  reset: {
    title: 'Choose a new password',
    sub: 'At least 12 characters with upper and lower case, a number and a symbol.',
    button: 'Save password',
    link: 'Back to sign in',
    to: 'login',
  },
};

export function Login({ flash, onSignedIn }: { flash?: string; onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [challenge, setChallenge] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(flash ? { text: flash, ok: false } : null);

  const switchTo = (m: Mode, note?: { text: string; ok: boolean }) => {
    setMode(m);
    setCode('');
    setPw1('');
    setPw2('');
    setMsg(note ?? null);
  };
  const fail = (e: unknown) => {
    const err = e as ApiError;
    setMsg({ text: ERR[err.code ?? ''] ?? err.message, ok: false });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'login') {
        const r = await api<{ challenge: string; devCode?: string }>('POST', '/admin/auth/login', {
          email: email.trim(),
          password,
        });
        setChallenge(r.challenge);
        switchTo('code', {
          text: r.devCode ? `Test mode code: ${r.devCode}` : `We emailed a 6-digit code to ${email.trim()}.`,
          ok: true,
        });
      } else if (mode === 'code') {
        const r = await api<{ token: string; email: string }>('POST', '/admin/auth/verify', {
          email: email.trim(),
          challenge,
          code: code.trim(),
        });
        saveSession({ token: r.token, email: r.email });
        onSignedIn();
      } else if (mode === 'forgot') {
        const r = await api<{ devCode?: string }>('POST', '/admin/auth/forgot', { email: email.trim() });
        switchTo('reset', {
          text: r.devCode ? `Test mode code: ${r.devCode}` : `If ${email.trim()} is an admin, a code is on its way.`,
          ok: true,
        });
      } else {
        if (pw1 !== pw2) {
          setMsg({ text: 'The two passwords are not the same.', ok: false });
          return;
        }
        await api('POST', '/admin/auth/reset', { email: email.trim(), code: code.trim(), password: pw1 });
        setPassword('');
        switchTo('login', {
          text: 'Password saved. Every admin session was signed out. Sign in with the new password.',
          ok: true,
        });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const c = COPY[mode];
  const codeInput = (
    <div className="grid gap-2">
      <Label htmlFor="code">6-digit code</Label>
      <Input
        id="code"
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
  );

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <img src="/admin-logo/logo.svg" alt="Chalkpis" className="h-8 dark:hidden" />
      <img src="/admin-logo/logo-dark.svg" alt="Chalkpis" className="hidden h-8 dark:block" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{c.title}</CardTitle>
          <CardDescription>{c.sub}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            {mode === 'login' || mode === 'forgot' ? (
              <div className="grid gap-2">
                <Label htmlFor="email">Admin email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus={!email}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
            ) : null}
            {mode === 'login' ? (
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  autoFocus={!!email}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            ) : null}
            {mode === 'code' || mode === 'reset' ? codeInput : null}
            {mode === 'reset' ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pw1">New password</Label>
                  <Input id="pw1" type="password" autoComplete="new-password" maxLength={128} required value={pw1} onChange={(e) => setPw1(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pw2">New password again</Label>
                  <Input id="pw2" type="password" autoComplete="new-password" maxLength={128} required value={pw2} onChange={(e) => setPw2(e.target.value)} />
                </div>
              </>
            ) : null}
            {msg ? (
              <p role="status" className={cn('text-sm', msg.ok ? 'text-muted-foreground' : 'text-destructive')}>
                {msg.text}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {c.button}
            </Button>
            <Button type="button" variant="link" className="h-auto p-0" onClick={() => switchTo(c.to)}>
              {c.link}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">M2W Technologies Private Limited</p>
    </div>
  );
}
