import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerForPush } from '../../lib/push';
import { track } from '../announcements/updates';
import { openFromPush } from '../../navigation/ref';

// the last tap already acted on, for the whole app run: MainStack remounts at every sign-in, and an old tap must not
// open its screen again then
let handled: string | null = null;

/** An announcement's push that was tapped counts as opened in the dashboard. */
const opened = (data: unknown) => {
  const id = (data as { announcementId?: unknown } | undefined)?.announcementId;
  if (typeof id === 'string' && id) void track(id, 'opened');
};

/**
 * Signed-in only: registers for push a moment after the app settles (so the permission question does not land on top
 * of the first screen), and opens the right screen when a notification is tapped, also from a cold start.
 */
// Expo has no "last notification response" on the web (calling it there throws); the platform never changes while the
// app runs, so the web gets a stand-in hook and every render calls the same one.
const useLastResponse: () => Notifications.NotificationResponse | null | undefined =
  Platform.OS === 'web' ? () => null : Notifications.useLastNotificationResponse;

export function usePushSetup() {
  const last = useLastResponse();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const t = setTimeout(() => void registerForPush(), 2500);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handled = r.notification.request.identifier;
      Notifications.clearLastNotificationResponse();
      opened(r.notification.request.content.data);
      openFromPush(r.notification.request.content.data?.screen);
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, []);

  // the tap that opened the app from closed
  useEffect(() => {
    if (!last || handled === last.notification.request.identifier) return;
    handled = last.notification.request.identifier;
    const screen = last.notification.request.content.data?.screen;
    opened(last.notification.request.content.data);
    // not cancelled on cleanup: clearing the response changes `last`, which must not undo the jump
    setTimeout(() => {
      openFromPush(screen);
      Notifications.clearLastNotificationResponse();
    }, 300);
  }, [last]);
}
