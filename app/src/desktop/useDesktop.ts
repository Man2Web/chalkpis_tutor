import { Platform, useWindowDimensions } from 'react-native';

/** From this width the browser version is laid out for a laptop or desktop: sidebar, tables and wide dashboards. */
export const DESKTOP_MIN_WIDTH = 1024;

/** True on a laptop or desktop browser. Phones and tablets, and the phone apps, keep the phone layout. */
export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}
