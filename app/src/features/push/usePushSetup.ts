import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerForPush } from '../../lib/push';
import { openFromPush } from '../../navigation/ref';

/**
 * Signed-in only: registers for push a moment after the app settles (so the permission question does not land on top
 * of the first screen), and opens the right screen when a notification is tapped, also from a cold start.
 */
export function usePushSetup() {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const t = setTimeout(() => void registerForPush(), 2500);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handled.current = r.notification.request.identifier;
      openFromPush(r.notification.request.content.data?.screen);
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, []);

  // the tap that opened the app from closed
  useEffect(() => {
    if (!last || handled.current === last.notification.request.identifier) return;
    handled.current = last.notification.request.identifier;
    const id = setTimeout(() => openFromPush(last.notification.request.content.data?.screen), 300);
    return () => clearTimeout(id);
  }, [last]);
}
