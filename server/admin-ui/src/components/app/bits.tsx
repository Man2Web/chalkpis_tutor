import type { ReactNode } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Inbox, Minus, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { hue, initials, pctChange } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** "↑ 12%" green, "↓ 8%" red, "New", or "—". */
export function Delta({ now, before }: { now: number; before: number }) {
  const p = pctChange(now, before);
  if (p === null)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" />—
      </span>
    );
  if (p === 'new')
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">New</span>;
  const up = p > 0;
  const flat = p === 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular',
        flat
          ? 'text-muted-foreground'
          : up
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400',
      )}
    >
      {flat ? <Minus className="size-3" /> : up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(p)}%
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  icon,
  children,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn('gap-2 py-4', onClick && 'cursor-pointer transition-colors hover:bg-accent/40')}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      </CardHeader>
      <CardContent className="px-4">
        <div className="text-2xl font-semibold tracking-tight tabular">{value}</div>
        {hint ? <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{hint}</div> : null}
        {children}
      </CardContent>
    </Card>
  );
}

export function Empty({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <span className="[&_svg]:size-8 [&_svg]:opacity-40">{icon ?? <Inbox />}</span>
      {text}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex items-center gap-3 py-2">
        <AlertCircle className="size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Could not load</div>
          <div className="truncate text-sm text-muted-foreground">{error.message}</div>
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn('size-8', className)}>
      <AvatarFallback className="text-xs font-semibold text-white" style={{ background: hue(name) }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** 0-100 health score: green 70+, amber 40+, red below. */
export function Health({ score }: { score: number }) {
  const tone = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2" title={`Health ${score}/100`}>
      <span className="w-7 text-right text-sm font-medium tabular">{score}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const PLAN_TONE: Record<string, string> = {
  trial: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  starter: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
  standard: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
  pro: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  expired: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
};
export function PlanBadge({ plan, expired }: { plan?: string | null; expired?: boolean }) {
  if (!plan) return <Badge variant="outline">No centre</Badge>;
  const key = expired ? 'expired' : plan.toLowerCase();
  return (
    <Badge variant="outline" className={cn('capitalize', PLAN_TONE[key])}>
      {expired ? `${plan} · ended` : plan}
    </Badge>
  );
}

export function StatusDot({ tone }: { tone: 'green' | 'amber' | 'red' | 'grey' }) {
  const c = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', grey: 'bg-muted-foreground/40' }[tone];
  return <span className={cn('inline-block size-2 rounded-full', c)} aria-hidden />;
}
