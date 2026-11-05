import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParams } from '../../navigation/types';
import { refreshProfile } from '../auth/session';
import { OwnerDetailsForm } from './OwnerDetailsForm';
import { SetupLayout } from './SetupLayout';

/** Sign-up, step 2 (decision 156): the owner's email, where the centre is, and how they heard about Chalkpis. */
export function DetailsScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Details'>) {
  const { t } = useTranslation();
  return (
    <SetupLayout
      step="details"
      title={t('ownerDetails.title')}
      subtitle={t('ownerDetails.subtitle')}
    >
      <OwnerDetailsForm
        submitLabel={t('common.next')}
        onSaved={async () => {
          await refreshProfile();
          navigation.navigate('Batch');
        }}
      />
    </SetupLayout>
  );
}
