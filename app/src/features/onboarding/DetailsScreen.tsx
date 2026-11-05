import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { toast } from '../../components';
import type { OnboardingStackParams } from '../../navigation/types';
import { refreshProfile, useSession } from '../auth/session';
import { OwnerDetailsForm } from './OwnerDetailsForm';
import { SetupLayout } from './SetupLayout';

/**
 * Sign-up, step 2 (decision 156): the owner's email, where the centre is, and how they heard about Chalkpis.
 * An owner whose centre is already set up but skipped this step (a phone's first launch ran the store build's older
 * sign-up) gets it on its own before anything else, with no way to put it off (decision 162).
 */
export function DetailsScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Details'>) {
  const { t } = useTranslation();
  const finishing = useSession((s) => !!s.profile?.onboardingDone);
  return (
    <SetupLayout
      step="details"
      finishing={finishing}
      title={t(finishing ? 'ownerDetails.promptTitle' : 'ownerDetails.title')}
      subtitle={t(finishing ? 'ownerDetails.requiredText' : 'ownerDetails.subtitle')}
    >
      <OwnerDetailsForm
        submitLabel={t(finishing ? 'common.save' : 'common.next')}
        onSaved={async () => {
          await refreshProfile();
          // still signing up: on to the first batch. Otherwise the app itself opens now.
          if (useSession.getState().status === 'needsOnboarding') navigation.replace('Batch');
          else toast(t('ownerDetails.saved'), 'success');
        }}
      />
    </SetupLayout>
  );
}
