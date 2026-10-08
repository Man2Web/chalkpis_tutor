import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, ListItem, Screen } from '../../components';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing } from '../../theme';
import { logout } from '../auth/session';

export function MoreScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const chevron = <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />;
  return (
    <Screen padded={false}>
      <View style={{ paddingTop: spacing.lg }}>
        <ListItem
          title={t('billing.title')}
          right={chevron}
          onPress={() => nav.navigate('Billing')}
        />
        <ListItem
          title={t('messages.settingsTitle')}
          right={chevron}
          onPress={() => nav.navigate('NotificationSettings')}
        />
        <ListItem
          title={t('messages.logTitle')}
          right={chevron}
          onPress={() => nav.navigate('MessageLog')}
        />
        <ListItem
          title={t('batches.title')}
          right={chevron}
          onPress={() => nav.navigate('Batches')}
        />
        <ListItem
          title={t('reports.title')}
          right={chevron}
          onPress={() => nav.navigate('Reports')}
        />
        <ListItem
          title={t('import.fromCsv')}
          right={chevron}
          onPress={() => nav.navigate('StudentImport', { mode: 'csv' })}
        />
        <ListItem
          title={t('import.fromContacts')}
          right={chevron}
          onPress={() => nav.navigate('StudentImport', { mode: 'contacts' })}
        />
        <ListItem
          title={t('settings.title')}
          right={chevron}
          onPress={() => nav.navigate('Settings')}
        />
      </View>
      <View style={{ padding: spacing.lg }}>
        <Button variant="secondary" title={t('more.logout')} onPress={() => void logout()} />
      </View>
    </Screen>
  );
}
