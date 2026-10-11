import { DimensionValue, ViewStyle } from 'react-native';
import { Skeleton as PanelSkeleton } from 'panelui-native/components/skeleton';

type Props = { width?: DimensionValue; height?: number; style?: ViewStyle };

/** PanelUI shimmer placeholder. */
export function Skeleton({ width = '100%', height = 16, style }: Props) {
  return <PanelSkeleton className="rounded-xl" style={[{ width, height }, style]} />;
}
