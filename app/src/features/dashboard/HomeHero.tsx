import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from 'panelui-native/components/card';
import { Kpi } from 'panelui-native/components/kpi';
import { Progress } from 'panelui-native/components/progress';

type Props = {
  label: string;
  value: string;
  sub?: string;
  /** 0-1: share of this month's fees already collected. */
  progress: number | null;
  progressLabel?: string;
  stats: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap; bad?: boolean }[];
};

/**
 * The money panel on Home: this month's collection on a dark PanelUI card with how far along it is, then the key
 * numbers as a PanelUI Kpi group.
 */
export function HomeHero({ label, value, sub, progress, progressLabel, stats }: Props) {
  return (
    <View className="gap-3">
      <Card className="gap-1 border-neutral-800 bg-neutral-900 p-5">
        <Text className="text-sm font-medium text-white/60">{label}</Text>
        <Text
          className="text-4xl font-bold tracking-tighter text-white"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        {sub ? <Text className="text-sm text-white/60">{sub}</Text> : null}
        {progress !== null ? (
          <View className="mt-3 gap-2">
            <Progress
              value={Math.round(Math.min(1, progress) * 100)}
              color="success"
              size="md"
              accessibilityLabel={progressLabel}
            />
            {progressLabel ? <Text className="text-sm text-white/60">{progressLabel}</Text> : null}
          </View>
        ) : null}
      </Card>
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
