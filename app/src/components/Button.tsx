import { ReactNode } from 'react';
import { ViewStyle } from 'react-native';
import { Button as PanelButton } from 'panelui-native/components/button';
import { haptic } from '../lib/haptics';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  /** PanelUI variants: primary = solid, secondary = grey, outline = bordered, danger = destructive, ghost = text only. */
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  size?: 'large' | 'small';
  /** An icon before the label. */
  icon?: ReactNode;
  style?: ViewStyle;
};

const VARIANT = {
  primary: 'primary',
  secondary: 'secondary',
  outline: 'outline',
  danger: 'destructive',
  ghost: 'ghost',
} as const;

/** PanelUI Button with our haptics; full width when large, compact when small. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  size = 'large',
  icon,
  style,
}: Props) {
  return (
    <PanelButton
      variant={VARIANT[variant]}
      size={size === 'small' ? 'sm' : 'lg'}
      loading={loading}
      disabled={disabled}
      startContent={icon}
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={style}
    >
      {title}
    </PanelButton>
  );
}
