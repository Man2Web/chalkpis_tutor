import { Badge } from '@/components/ui/badge';
import { TONE, type Tone } from '@/lib/names';
import { cn } from '@/lib/utils';

export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', TONE[tone], className)}>
      {children}
    </Badge>
  );
}
