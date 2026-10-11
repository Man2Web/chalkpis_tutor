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

/** PanelUI Chip: a filter when it has onPress (selected = on), otherwise a status label. */
export function Chip({ label, selected, onPress, tone = 'neutral', small }: Props) {
  const interactive = !!onPress;
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
      hitSlop={small && interactive ? 10 : undefined}
      onPress={
        onPress
          ? () => {
              haptic.select();
              onPress();
            }
          : undefined
      }
      className="self-start"
      // a status label is not disabled, it is just not a button: keep it at full strength
      style={!interactive ? { opacity: 1 } : undefined}
    >
      {label}
    </PanelChip>
  );
}
