import './src/global.css';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import { PanelUIProvider } from 'panelui-native/provider';
import { Uniwind } from 'uniwind';
import AnimatedSplash from './src/components/AnimatedSplash';
import { useSession, useSessionBootstrap } from './src/features/auth/session';
import { loadSavedLanguage } from './src/lib/language';
import { queryClient } from './src/lib/queryClient';
import { RootNavigator } from './src/navigation';

// The app is designed in Panel light; screens use the light tokens directly, so PanelUI follows the same theme.
Uniwind.setTheme('light');

// React Query only knows about browser focus; on phones, coming back to the app is "focus", so stale data (the
// announcement banner, today's numbers) refreshes when the tutor reopens the app.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}

/**
 * Ready once the saved sign-in has been checked and Inter has loaded (or failed to); never waits longer than 8 s, so a
 * stuck check cannot hide the app.
 */
function useAppReady() {
  const checked = useSession((s) => s.status !== 'loading');
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (checked && (fontsLoaded || !!fontError)) || timedOut;
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
        {/* PanelUI owns the gesture root, keyboard handling, overlay portals and toasts. */}
        <PanelUIProvider>
          {/* Full width everywhere; each screen centres its own column on wide screens. */}
          <View style={{ flex: 1 }}>
            <AnimatedSplash appReady={appReady}>
              <RootNavigator />
            </AnimatedSplash>
          </View>
        </PanelUIProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
