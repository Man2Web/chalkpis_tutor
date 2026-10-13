import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { compact, dlong, dshort, money } from '@/lib/format';

/**
 * Colours are passed straight to each series (not through ChartContainer's injected <style>, which the admin CSP
 * blocks), so every chart reads the theme variables directly.
 */
export const C = {
  blue: 'var(--chart-1)',
  green: 'var(--chart-2)',
  amber: 'var(--chart-3)',
  violet: 'var(--chart-4)',
  rose: 'var(--chart-5)',
} as const;

export type Series = { key: string; name: string; color: string };

const day = (d: string) => `${d}T12:00:00+05:30`;

/** Daily lines (first one filled), x = YYYY-MM-DD dates. */
export function TrendChart({
  dates,
  series,
  values,
  isMoney,
  height = 240,
}: {
  dates: string[];
  series: Series[];
  values: Record<string, number[]>;
  isMoney?: boolean;
  height?: number;
}) {
  const data = dates.map((d, i) => {
    const row: Record<string, string | number> = { d };
    for (const s of series) row[s.key] = values[s.key]?.[i] ?? 0;
    return row;
  });
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.name, color: s.color }])) as ChartConfig;
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis
          dataKey="d"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(d: string) => dshort(day(d))}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          allowDecimals={false}
          tickFormatter={(v: number) => (isMoney ? `₹${compact(v / 100)}` : compact(v))}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, p) => dlong(day(String(p?.[0]?.payload?.d ?? '')))}
              formatter={(v, name, item) => (
                <div className="flex w-full items-center gap-2">
                  <span className="size-2.5 rounded-[2px]" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                  <span className="ml-auto font-mono font-medium tabular">
                    {isMoney ? money(Number(v)) : Number(v).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            />
          }
        />
        {series.map((s, i) => (
          <Area
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={s.color}
            strokeWidth={2.2}
            fill={i === 0 ? `url(#fill-${s.key})` : 'transparent'}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </AreaChart>
    </ChartContainer>
  );
}

/** Bars with a label per bar (months, weeks…). */
export function Bars({
  labels,
  values,
  name,
  color = C.blue,
  isMoney,
  tips,
  height = 220,
}: {
  labels: string[];
  values: number[];
  name: string;
  color?: string;
  isMoney?: boolean;
  tips?: string[];
  height?: number;
}) {
  const data = labels.map((l, i) => ({ l, v: values[i] ?? 0, t: tips?.[i] ?? l }));
  return (
    <ChartContainer config={{ v: { label: name, color } }} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="l" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={46}
          allowDecimals={false}
          tickFormatter={(v: number) => (isMoney ? `₹${compact(v / 100)}` : compact(v))}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, p) => String(p?.[0]?.payload?.t ?? '')}
              formatter={(v) => (
                <div className="flex w-full items-center gap-2">
                  <span className="size-2.5 rounded-[2px]" style={{ background: color }} />
                  <span className="text-muted-foreground">{name}</span>
                  <span className="ml-auto font-mono font-medium tabular">
                    {isMoney ? money(Number(v)) : Number(v).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="v" fill={color} radius={[5, 5, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ChartContainer>
  );
}

/** A donut with the total in the middle and a legend beside it. */
export function Donut({
  parts,
  center = 'total',
}: {
  parts: { name: string; value: number; color: string }[];
  center?: string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const config = Object.fromEntries(parts.map((p) => [p.name, { label: p.name, color: p.color }])) as ChartConfig;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-36">
        <ChartContainer config={config} className="size-36">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
            <Pie
              data={total ? parts : [{ name: 'none', value: 1, color: 'var(--muted)' }]}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={68}
              strokeWidth={2}
              paddingAngle={total ? 2 : 0}
            >
              {(total ? parts : [{ color: 'var(--muted)' }]).map((p, i) => (
                <Cell key={i} fill={p.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular">{total}</span>
          <span className="text-xs text-muted-foreground">{center}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        {parts.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto pl-4 font-medium tabular">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
