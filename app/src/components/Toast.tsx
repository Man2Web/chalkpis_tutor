import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, radius, spacing } from '../theme';

type Kind = 'info' | 'success' | 'error';
type State = {
  message: string | null;
  kind: Kind;
  show: (message: string, kind?: Kind) => void;
  hide: () => void;
};

export const useToast = create<State>((set) => ({
  message: null,
  kind: 'info',
  show: (message, kind = 'info') => set({ message, kind }),
  hide: () => set({ message: null }),
}));

export const toast = (message: string, kind: Kind = 'info') =>
  useToast.getState().show(message, kind);

/** Mount once at the app root. */
export function ToastHost() {
  const { message, kind, hide } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3000);
    return () => clearTimeout(t);
  }, [message, hide]);
  if (!message) return null;
  const bg = kind === 'error' ? colors.danger : kind === 'success' ? colors.success : colors.text;
  return (
    <SafeAreaView pointerEvents="none" style={styles.host} edges={['bottom']}>
      <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: bg }]}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    padding: spacing.lg,
  },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    maxWidth: '100%',
  },
  text: { color: '#fff', fontSize: 15 },
});
