import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from 'panelui-native/components/card';
import { Kpi } from 'panelui-native/components/kpi';
import { colors, font, radius } from '../../theme';

type Props = {
  label: string;
  value: string;
  sub?: string;
  /** 0-1: share of this month's fees already collected. */
  progress: number | null;
  progressLabel?: string;
  stats: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap; bad?: boolean }[];
};

/** The navy of the sign-in blackboard, a shade lighter at the top right where the light falls. */
const HERO = ['#16405A', '#0F2D40', '#0B2232'] as const;

/**
 * The money panel on Home: this month's collection on the brand's blackboard navy, how far along it is as a bar,
 * then the key numbers as a PanelUI Kpi group.
 */
export function HomeHero({ label, value, sub, progress, progressLabel, stats }: Props) {
  const pct = progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: radius.xl, overflow: 'hidden' }}>
        <LinearGradient
          colors={HERO}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ padding: 20, gap: 4 }}
        >
          {/* a soft blue glow in the corner, like light on a board */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: -60,
              top: -70,
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: 'rgba(14,119,190,0.18)',
            }}
          />
          <Text style={{ fontSize: 14, lineHeight: 20, ...font('500'), color: 'rgba(255,255,255,0.72)' }}>
            {label}
          </Text>
          <Text
            style={{
              fontSize: 36,
              lineHeight: 42,
              ...font('700'),
              letterSpacing: -1,
              color: '#FFFFFF',
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {value}
          </Text>
          {sub ? (
            <Text style={{ fontSize: 14, lineHeight: 20, ...font('400'), color: 'rgba(255,255,255,0.72)' }}>
              {sub}
            </Text>
          ) : null}
          {pct !== null ? (
            <View style={{ marginTop: 14, gap: 8 }}>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={progressLabel}
                accessibilityValue={{ min: 0, max: 100, now: pct }}
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: colors.successFill,
                  }}
                />
              </View>
              {progressLabel ? (
                <Text style={{ fontSize: 13, lineHeight: 18, ...font('500'), color: 'rgba(255,255,255,0.72)' }}>
                  {progressLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
        </LinearGradient>
      </View>
      <Card className="p-4">
        <Kpi.Group>
          {stats.map((s) => (
            <Kpi key={s.label} surface={false}>
              <Kpi.Header>
                {/* no icon: three titles must fit side by side on a 360-pt phone */}
                <Kpi.Title>{s.label}</Kpi.Title>
              </Kpi.Header>
              <Kpi.Content>
                <Kpi.Value className={s.bad ? 'text-xl text-destructive' : 'text-xl'}>
                  {s.value}
                </Kpi.Value>
              </Kpi.Content>
            </Kpi>
          ))}
        </Kpi.Group>
      </Card>
    </View>
  );
}
