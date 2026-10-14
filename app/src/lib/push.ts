import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

// a notification that arrives while the app is open still shows as a banner
if (Platform.OS !== 'web')
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

let registered: string | null = null;

/**
 * Asks once for permission and registers this device for push (Expo's push service). Quietly does nothing when there
 * is no permission, on a simulator, or without network: push is a nicety, never a reason for an error.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Chalkpis',
        importance: Notifications.AndroidImportance.HIGH,
      });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await api('POST', '/me/push-token', { token: data, platform: Platform.OS });
    registered = data;
  } catch {
    /* no push on this device for now */
  }
}

/** At sign-out: this device stops getting the signed-out person's notifications. */
export async function unregisterPush(): Promise<void> {
  const token = registered;
  registered = null;
  if (!token) return;
  try {
    await api('POST', '/me/push-token/remove', { token });
  } catch {
    /* the server drops it anyway when Expo reports the device gone */
  }
}
