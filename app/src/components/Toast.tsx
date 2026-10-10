import { useEffect } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { haptic } from '../lib/haptics';
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
    if (kind === 'success') haptic.success();
    if (kind === 'error') haptic.error();
    const t = setTimeout(hide, 3000);
    return () => clearTimeout(t);
  }, [message, hide]);
  if (!message) return null;
  const icon =
    kind === 'error'
      ? 'alert-circle'
      : kind === 'success'
        ? 'checkmark-circle'
        : 'information-circle';
  const tint =
    kind === 'error' ? colors.dangerFill : kind === 'success' ? colors.successFill : '#FFFFFF';
  return (
    <SafeAreaView pointerEvents="none" style={styles.host} edges={['bottom']}>
      <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Ionicons name={icon} size={20} color={tint} />
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
    bottom: 72,
    alignItems: 'center',
    padding: spacing.lg,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    maxWidth: 480,
    backgroundColor: 'rgba(28,28,30,0.94)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '500', letterSpacing: -0.24, flexShrink: 1 },
});
