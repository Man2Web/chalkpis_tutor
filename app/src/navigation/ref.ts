import { createNavigationContainerRef } from '@react-navigation/native';

/** Lets code outside screens (a tapped notification) move the app. */
export const navigationRef = createNavigationContainerRef();

/** Opens the screen a push notification points to: Home, the Attendance tab, Plans & billing, or Updates. */
export function openFromPush(screen: unknown) {
  if (!navigationRef.isReady()) return;
  const go = navigationRef.navigate as unknown as (name: string, params?: object) => void;
  if (screen === 'Billing') go('Billing');
  else if (screen === 'Updates') go('Updates');
  else if (screen === 'Attendance') go('Tabs', { screen: 'Attendance' });
  else if (screen === 'Home') go('Tabs', { screen: 'Home' });
}
