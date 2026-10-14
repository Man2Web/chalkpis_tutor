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
  // a store subscription renewing by itself is not "ending"; one whose payment failed needs the owner
  const issue = !s.expired && l.store?.issue === 'billing';
  if (issue) s.banner = 'storeIssue';
  else if (s.banner === 'expiringSoon' && l.store?.willRenew) return null;
  if (!s.banner || s.banner === 'trial') return null;
  const title = t(`billing.banner.${s.banner}`, {
    count: s.daysLeft,
    store: t(`billing.store.${l.store?.name ?? 'app_store'}`),
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => nav.navigate('Billing')}
    >
      <Alert variant={s.banner === 'expired' ? 'destructive' : 'warning'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>{t('billing.seePlans')}</Alert.Description>
        </Alert.Content>
      </Alert>
    </Pressable>
  );
}
