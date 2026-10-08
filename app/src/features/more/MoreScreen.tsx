import { useTranslation } from 'react-i18next';
import { Button, Screen } from '../../components';
import { logout } from '../auth/session';

export function MoreScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Button variant="secondary" title={t('more.logout')} onPress={() => void logout()} />
    </Screen>
  );
}
