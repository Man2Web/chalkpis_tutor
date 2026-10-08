import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme';

type Props = { present: number; total: number; size?: number };

/** Circular progress: present out of marked. Empty ring when nothing is marked yet. */
export function AttendanceRing({ present, total, size = 92 }: Props) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, present / total) : 0;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={total ? `${present} of ${total}` : '—'}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#ECEFF8"
          strokeWidth={stroke}
          fill="none"
        />
        {frac > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.primary}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * frac} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View
        style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>
          {total ? `${present}/${total}` : '—'}
        </Text>
      </View>
    </View>
  );
}
