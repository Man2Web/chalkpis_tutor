import { useWindowDimensions } from 'react-native';

/** Widest the main column gets on tablets and in the browser; phones use the full width. */
export const MAX_CONTENT = 720;

/** Centres a column and stops it stretching across a tablet or desktop screen. */
export const column = { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' } as const;

/** Phone, tablet or wide (landscape tablet / desktop browser). */
export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, isTablet: width >= 600, isWide: width >= 900 };
}
