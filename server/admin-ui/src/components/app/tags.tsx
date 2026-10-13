import { Badge } from '@/components/ui/badge';
import { TAG_TONE, tagLabel } from '@/lib/names';
import { cn } from '@/lib/utils';

export function Tag({ t }: { t: string }) {
  return (
    <Badge variant="outline" className={cn('capitalize', TAG_TONE[t])}>
      {tagLabel(t)}
    </Badge>
  );
}
