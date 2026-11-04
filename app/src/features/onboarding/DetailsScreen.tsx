import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components';
import type { OnboardingStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { refreshProfile } from '../auth/session';
import { OwnerDetailsForm } from './OwnerDetailsForm';

/** Sign-up, step 2 (decision 156): the owner's email, where the centre is, and how they heard about Chalkpis. */
export function DetailsScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Details'>) {
  const { t } = useTranslation();
  return (
    <Screen>
      <Text style={[type.title, { marginTop: spacing.lg }]}>{t('ownerDetails.title')}</Text>
      <Text style={[type.footnote, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
        {t('ownerDetails.subtitle')}
      </Text>
      <OwnerDetailsForm
        submitLabel={t('common.next')}
        onSaved={async () => {
          await refreshProfile();
          navigation.navigate('Batch');
        }}
      />
    </Screen>
  );
}
