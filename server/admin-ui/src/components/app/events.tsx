import { Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { ago, dlong, money, ymdIst } from '@/lib/format';
import { go } from '@/lib/hooks';
import { DEVICE, kindOf } from '@/lib/names';
import { cn } from '@/lib/utils';
import { openUser } from './user';

export type Ev = {
  kind: string;
  at: string;
  actor: string;
  text: string;
  platform?: string | null;
  amount?: number | null;
  userId?: string | null;
  instituteId?: string | null;
  institute?: string | null;
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** One thing that happened. `inCentre`: inside a centre's log (clicks open the person, not the centre). */
export function EventRow({
  e,
  compact,
  inCentre,
  fresh,
}: {
  e: Ev;
  compact?: boolean;
  inCentre?: boolean;
  fresh?: boolean;
}) {
  const k = kindOf(e.kind);
  const Icon = k.icon;
  const open =
    !inCentre && e.instituteId
      ? () => go(`centre/${e.instituteId}`)
      : e.userId
        ? () => openUser(e.userId!)
        : undefined;
  return (
    <div
      role={open ? 'button' : undefined}
      tabIndex={open ? 0 : undefined}
      onClick={open}
      onKeyDown={(ev) => open && (ev.key === 'Enter' || ev.key === ' ') && open()}
      className={cn(
        'flex items-start gap-3 rounded-lg px-2 py-2',
        open && 'cursor-pointer hover:bg-accent/60',
        fresh && 'bg-primary/5',
      )}
    >
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', k.tint)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm leading-snug', compact && 'line-clamp-2')}>
          <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{e.text}</span>
          {e.amount != null ? (
            <span
              className={cn(
                'ml-1 font-medium tabular',
                e.amount < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {money(e.amount)}
            </span>
          ) : null}
          {e.platform && DEVICE[e.platform] ? (
            <Badge variant="outline" className="ml-1.5 align-middle text-[10px]" title={`From ${DEVICE[e.platform]}`}>
              {DEVICE[e.platform]}
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {compact ? ago(e.at) : !inCentre && e.institute && e.institute !== e.actor ? e.institute : null}
        </div>
      </div>
      {!compact ? <span className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular">{time(e.at)}</span> : null}
    </div>
  );
}

const dayLabel = (iso: string) => {
  const d = ymdIst(iso);
  const today = ymdIst(new Date().toISOString());
  const yest = ymdIst(new Date(Date.now() - 86400000).toISOString());
  return d === today ? 'Today' : d === yest ? 'Yesterday' : dlong(iso);
};

/** Events grouped under Today / Yesterday / the date (IST). */
export function DayFeed({ events, inCentre }: { events: Ev[]; inCentre?: boolean }) {
  let last = '';
  return (
    <div className="flex flex-col">
      {events.map((e, i) => {
        const d = ymdIst(e.at);
        const head = d !== last ? dayLabel(e.at) : null;
        last = d;
        return (
          <Fragment key={`${e.at}-${i}`}>
            {head ? (
              <div className="sticky top-0 z-10 bg-card/95 px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur first:pt-0">
                {head}
              </div>
            ) : null}
            <EventRow e={e} inCentre={inCentre} />
          </Fragment>
        );
      })}
    </div>
  );
}
