import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  kind: 'student' | 'batch' | 'expired';
  limit?: number | null;
};

/** Shown when a plan limit (or an expired plan) blocks an add. Billing arrives in Phase 2. */
export function UpgradePrompt({ visible, onClose, kind, limit }: Props) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('limits.title')}>
      <Text style={[type.body, { marginBottom: 16 }]}>
        {kind === 'expired' ? t('limits.expired') : t(`limits.${kind}`, { limit })}
      </Text>
      <Button title={t('common.done')} onPress={onClose} />
    </BottomSheet>
  );
}
