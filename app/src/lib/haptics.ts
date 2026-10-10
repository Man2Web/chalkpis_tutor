import * as Haptics from 'expo-haptics';

/** Small taps of feedback, as iOS and modern Android apps give. Never throws (some devices have no motor). */
export const haptic = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  select: () => void Haptics.selectionAsync().catch(() => undefined),
  success: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  error: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
