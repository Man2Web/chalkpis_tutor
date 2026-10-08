import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useLimits } from '../../data/hooks';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, spacing, type } from '../../theme';
import { subscriptionState, type BannerKind } from './logic';

const LOOK: Record<Exclude<BannerKind, null>, { bg: string; fg: string }> = {
  expired: { bg: colors.dangerSoft, fg: colors.danger },
  expiringSoon: { bg: colors.warningSoft, fg: colors.warning },
  trialEnding: { bg: colors.warningSoft, fg: colors.warning },
  trial: { bg: colors.primarySoft, fg: colors.primaryDark },
};

/** Top-of-Home note about the plan: trial running, ending soon, or ended (read-only). Hidden when all is well. */
export function PlanBanner() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const limits = useLimits();
  const l = limits.data;
  if (!l) return null;
  const s = subscriptionState(
    {
      plan: l.plan,
      status: l.status,
      expiresAtMs: l.expiresAtMs,
      studentLimit: l.studentLimit,
      batchLimit: l.batchLimit,
    },
    Date.now(),
  );
  if (!s.banner) return null;
  const look = LOOK[s.banner];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(`billing.banner.${s.banner}`, { count: s.daysLeft })}
      onPress={() => nav.navigate('Billing')}
      style={{
        backgroundColor: look.bg,
        borderRadius: radius.md,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { color: look.fg }]}>
          {t(`billing.banner.${s.banner}`, { count: s.daysLeft })}
        </Text>
      </View>
      <Text style={[type.label, { color: look.fg }]}>{t('billing.seePlans')}</Text>
    </Pressable>
  );
}
