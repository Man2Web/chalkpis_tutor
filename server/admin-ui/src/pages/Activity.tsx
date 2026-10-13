import { useEffect, useState } from 'react';
import { ArrowUp, Check, RefreshCw } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/app/bits';
import { DayFeed, type Ev } from '@/components/app/events';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { api } from '@/lib/api';
import { useApi, useStored } from '@/lib/hooks';
import { KIND } from '@/lib/names';
import { cn } from '@/lib/utils';

const KINDS = Object.keys(KIND).filter((k) => k !== 'message');

export function Activity() {
  const [kinds, setKinds] = useStored<string[]>('adm-feed-kinds', []);
  const url = `/admin/api/events?limit=200${kinds.length ? `&kinds=${kinds.join(',')}` : ''}`;
  const { data, error, loading, reload } = useApi<{ events: Ev[] }>(url);
  const [fresh, setFresh] = useState(0);
  // every 15 s: count what is newer than the top row, without redrawing
  useEffect(() => {
    setFresh(0);
    const id = setInterval(async () => {
      if (document.hidden || !data?.events.length) return;
      try {
        const r = await api<{ events: Ev[] }>('GET', url);
        setFresh(r.events.filter((e) => e.at > data.events[0].at).length);
      } catch {
        /* next time */
      }
    }, 15000);
    return () => clearInterval(id);
  }, [url, data]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Live activity"
        description="Everything happening on Chalkpis, as it happens"
        actions={<Button variant="outline" onClick={() => void reload()}><RefreshCw className={cn(loading && 'animate-spin')} /> Refresh</Button>}
      />
      <div className="flex flex-wrap gap-1.5">
        <Toggle size="sm" variant="outline" pressed={!kinds.length} onPressedChange={() => setKinds([])}>
          {!kinds.length ? <Check /> : null} Everything
        </Toggle>
        {KINDS.map((k) => {
          const on = kinds.includes(k);
          const Icon = KIND[k].icon;
          return (
            <Toggle key={k} size="sm" variant="outline" pressed={on} onPressedChange={() => setKinds(on ? kinds.filter((x) => x !== k) : [...kinds, k])}>
              <Icon /> {KIND[k].label}
            </Toggle>
          );
        })}
      </div>
      {fresh ? (
        <div className="sticky top-16 z-20 flex justify-center">
          <Button
            size="sm"
            className="rounded-full shadow-lg"
            onClick={() => {
              setFresh(0);
              void reload();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <ArrowUp /> {fresh} new
          </Button>
        </div>
      ) : null}
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data ? (
        <Loading rows={10} />
      ) : (
        <Card>
          <CardContent className="px-3">
            {data.events.length ? <DayFeed events={data.events} /> : <Empty text="Nothing yet. Events appear here the moment tutors use Chalkpis." />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
