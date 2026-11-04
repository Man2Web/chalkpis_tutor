import { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Skeleton, toast } from '../../components';
import { useInstitute, useRefreshData } from '../../data/hooks';
import { writeText } from '../../lib/onceFlag';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { refreshProfile, useSession } from '../auth/session';
import { laterUntil } from './ownerDetails';
import { OwnerDetailsForm } from './OwnerDetailsForm';

/** Where "Later" is remembered on this device, per person. */
export const laterKey = (uid: string) => `owner_details_later_${uid}`;

/**
 * The owner's basic details (decision 156) after sign-up. `from: 'prompt'` is the request an older centre gets on
 * opening the app: it can be put off ("Later", or just going back), and comes back after a few days. From the Home card
 * or the profile it simply edits them.
 */
export function OwnerDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'OwnerDetails'>) {
  const { t } = useTranslation();
  const uid = useSession((s) => s.uid);
  const done = useSession((s) => s.profile?.detailsDone !== false);
  const institute = useInstitute();
  const refresh = useRefreshData();
  const prompt = route.params?.from === 'prompt';
  const saved = useRef(false);

  // leaving the request without answering, by any way (Later, back, swipe), puts it off for a few days
  useEffect(
    () => () => {
      if (prompt && !saved.current && uid)
        void writeText(laterKey(uid), String(laterUntil(Date.now())));
    },
    [prompt, uid],
  );

  if (institute.isPending)
    return (
      <Screen>
        <Skeleton height={320} />
      </Screen>
    );

  return (
    <Screen>
      {!done ? (
        <>
          <Text style={[type.title, { marginTop: spacing.md }]}>
            {t('ownerDetails.promptTitle')}
          </Text>
          <Text style={[type.footnote, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
            {t('ownerDetails.promptText')}
          </Text>
        </>
      ) : null}
      <OwnerDetailsForm
        initial={institute.data?.details}
        submitLabel={t('common.save')}
        onSaved={async () => {
          saved.current = true;
          await Promise.all([refreshProfile(), refresh()]);
          toast(t('ownerDetails.saved'), 'success');
          navigation.goBack();
        }}
      />
      {prompt ? (
        <Button
          variant="ghost"
          title={t('ownerDetails.later')}
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </Screen>
  );
}
