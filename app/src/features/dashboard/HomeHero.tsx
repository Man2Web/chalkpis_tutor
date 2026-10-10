import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, shadow, spacing } from '../../theme';

type Props = {
  label: string;
  value: string;
  sub?: string;
  /** 0-1: share of this month's fees already collected. */
  progress: number | null;
  progressLabel?: string;
  stats: { label: string; value: string }[];
};

/** The money card on Home: this month's collection in big type, how far along it is, and the key counts. */
export function HomeHero({ label, value, sub, progress, progressLabel, stats }: Props) {
  return (
    <View style={styles.card}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1C8CFF" />
            <Stop offset="1" stopColor="#0051C7" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#hero)" />
        <Circle cx="96" cy="4" r="30" fill="#FFFFFF" opacity="0.07" />
      </Svg>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {progress !== null ? (
        <View style={{ gap: 6, marginTop: spacing.md }}>
          <View style={styles.track} accessibilityLabel={progressLabel}>
            <View style={[styles.fill, { width: `${Math.round(Math.min(1, progress) * 100)}%` }]} />
          </View>
          {progressLabel ? <Text style={styles.sub}>{progressLabel}</Text> : null}
        </View>
      ) : null}
      <View style={styles.row}>
        {stats.map((s, i) => (
          <View key={s.label} style={[styles.stat, i > 0 && styles.divider]}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {s.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const white = (a: number) => `rgba(255,255,255,${a})`;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: spacing.lg + 2,
    backgroundColor: colors.primary,
    ...shadow.raised,
  },
  label: { color: white(0.85), fontSize: 13, fontWeight: '600', letterSpacing: -0.08 },
  value: { color: '#FFFFFF', fontSize: 38, lineHeight: 46, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: white(0.8), fontSize: 13 },
  track: { height: 6, borderRadius: 3, backgroundColor: white(0.25), overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  row: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: white(0.3),
  },
  stat: { flex: 1, gap: 2, paddingHorizontal: spacing.xs },
  divider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: white(0.3),
    paddingLeft: spacing.md,
  },
  statValue: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  statLabel: { color: white(0.8), fontSize: 12 },
});
