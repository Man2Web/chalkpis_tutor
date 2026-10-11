import { Text, View } from 'react-native';
import { RingChart } from 'panelui-native/components/ring-chart';
import { colors } from '../../theme';

type Props = { present: number; total: number; size?: number };

/** PanelUI ring: present out of marked today, with the count in the middle. Empty track before anything is marked. */
export function AttendanceRing({ present, total, size = 96 }: Props) {
  return (
    <View accessible accessibilityLabel={total ? `${present} of ${total}` : '—'}>
      <RingChart
        data={[
          {
            label: 'Present',
            value: present,
            maxValue: Math.max(total, 1),
            // nothing marked yet: a quiet grey ring
            color: total ? colors.successFill : colors.border,
          },
        ]}
        size={size}
        strokeWidth={10}
      >
        <RingChart.Ring index={0} />
        <RingChart.Center>
          {() => (
            <Text className="text-xl font-bold tracking-tight text-foreground">
              {total ? `${present}/${total}` : '—'}
            </Text>
          )}
        </RingChart.Center>
      </RingChart>
    </View>
  );
}
