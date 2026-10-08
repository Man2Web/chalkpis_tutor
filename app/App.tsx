import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import { ToastHost } from './src/components';
import { useSessionBootstrap } from './src/features/auth/session';
import { loadSavedLanguage } from './src/lib/language';
import { RootNavigator } from './src/navigation';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function App() {
  useSessionBootstrap();
  useEffect(() => {
    void loadSavedLanguage();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* Browser preview: show the app at phone width, centred. */}
        <View
          style={
            Platform.OS === 'web'
              ? { flex: 1, alignItems: 'center', backgroundColor: '#E5E7EB' }
              : { flex: 1 }
          }
        >
          <View
            style={
              Platform.OS === 'web'
                ? { flex: 1, width: '100%', maxWidth: 480, overflow: 'hidden' }
                : { flex: 1 }
            }
          >
            <RootNavigator />
            <ToastHost />
          </View>
        </View>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
