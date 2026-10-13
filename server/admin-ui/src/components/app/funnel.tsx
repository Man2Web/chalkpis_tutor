import { Progress } from '@/components/ui/progress';

const STEPS: [string, string][] = [
  ['institutes', 'Created a centre'],
  ['withStudents', 'Added students'],
  ['withAttendance', 'Marked attendance'],
  ['withPayments', 'Recorded a payment'],
  ['canBePaid', 'Set UPI or pay link'],
  ['messagesOn', 'Turned on WhatsApp'],
  ['everPaid', 'Bought a plan'],
];

/** How far new centres get, each step as a share of all centres. */
export function Funnel({ funnel }: { funnel: Record<string, number> }) {
  const base = Math.max(funnel.institutes ?? 0, 1);
  return (
    <div className="grid gap-3">
      {STEPS.map(([k, label]) => {
        const v = funnel[k] ?? 0;
        const p = Math.round((v / base) * 100);
        return (
          <div key={k} className="grid gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span>{label}</span>
              <span className="text-muted-foreground tabular">
                <span className="font-medium text-foreground">{v}</span> · {p}%
              </span>
            </div>
            <Progress value={p} className="h-2" />
          </div>
        );
      })}
    </div>
  );
}
