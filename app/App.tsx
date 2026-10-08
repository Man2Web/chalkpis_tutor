import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import './src/i18n';
import { ToastHost } from './src/components';
import { colors, type } from './src/theme';

export default function App() {
  const { t } = useTranslation();
  return (
    <SafeAreaProvider>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <Text style={type.title}>{t('app.name')}</Text>
        <Text style={type.caption}>{t('app.tagline')}</Text>
      </View>
      <ToastHost />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
