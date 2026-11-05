import { Chip as PanelChip } from 'panelui-native/components/chip';
import { haptic } from '../lib/haptics';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  /** Compact status label for list rows. */
  small?: boolean;
};

const VARIANT = {
  neutral: 'default',
  accent: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
} as const;

/**
 * PanelUI Chip: a filter when it has onPress (selected = on), otherwise a status label. A selected filter is filled
 * with the primary navy and white text, so "on" reads at a glance (PanelUI's own selected wash is too faint on a
 * phone in daylight); an unselected one is an outline.
 */
export function Chip({ label, selected, onPress, tone = 'neutral', small }: Props) {
  const interactive = !!onPress;
  const on = interactive && !!selected;
  return (
    <PanelChip
      variant={interactive && tone === 'neutral' && !selected ? 'outline' : VARIANT[tone]}
      size={small ? 'sm' : 'md'}
      selected={selected}
      disabled={!interactive}
      haptics={false}
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      aria-selected={interactive ? !!selected : undefined}
      hitSlop={interactive ? (small ? 10 : 6) : undefined}
      onPress={
        onPress
          ? () => {
              haptic.select();
              onPress();
            }
          : undefined
      }
      // a filter is a finger target: 36 high (48 with the slop); a status label stays compact
      className={[
        'self-start',
        interactive && !small ? 'h-9 px-3.5' : '',
        on ? 'border-primary bg-primary' : '',
      ].join(' ')}
      labelClassName={on ? 'text-primary-foreground' : undefined}
      // a status label is not disabled, it is just not a button: keep it at full strength
      style={!interactive ? { opacity: 1 } : undefined}
    >
      {label}
    </PanelChip>
  );
}
