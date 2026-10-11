import { Pressable } from 'react-native';
import { Alert } from 'panelui-native/components/alert';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useLimits } from '../../data/hooks';
import type { MainStackParams } from '../../navigation/types';
import { subscriptionState } from './logic';

/**
 * Top-of-Home alert when the plan needs action: the trial or plan ends within days, or has ended. A trial that
 * is simply running is not shown here; the plan lives in the Account tab.
 */
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
  if (!s.banner || s.banner === 'trial') return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(`billing.banner.${s.banner}`, { count: s.daysLeft })}
      onPress={() => nav.navigate('Billing')}
    >
      <Alert variant={s.banner === 'expired' ? 'destructive' : 'warning'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t(`billing.banner.${s.banner}`, { count: s.daysLeft })}</Alert.Title>
          <Alert.Description>{t('billing.seePlans')}</Alert.Description>
        </Alert.Content>
      </Alert>
    </Pressable>
  );
}
