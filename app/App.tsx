import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import { ToastHost } from './src/components';
import { KeyboardRoot } from './src/components/KeyboardScroll';
import AnimatedSplash from './src/components/AnimatedSplash';
import { useSession, useSessionBootstrap } from './src/features/auth/session';
import { loadSavedLanguage } from './src/lib/language';
import { RootNavigator } from './src/navigation';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/** Ready once the saved sign-in has been checked; never waits longer than 8 s, so a stuck check cannot hide the app. */
function useAppReady() {
  const checked = useSession((s) => s.status !== 'loading');
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return checked || timedOut;
}

export default function App() {
  useSessionBootstrap();
  const appReady = useAppReady();
  useEffect(() => {
    void loadSavedLanguage();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <KeyboardRoot>
          {/* Full width everywhere; each screen centres its own column on wide screens. */}
          <View style={{ flex: 1 }}>
            <AnimatedSplash appReady={appReady}>
              <RootNavigator />
              <ToastHost />
            </AnimatedSplash>
          </View>
        </KeyboardRoot>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
