import { AccessibilityInfo, Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import AnimatedSplash from '../AnimatedSplash';

const mockLottie = jest.fn(() => null);
jest.mock('lottie-react-native', () => ({ __esModule: true, default: mockLottie }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

const tagline = 'MANAGE • TEACH • GROW';

afterEach(() => jest.restoreAllMocks());

it('launches on the blue brand screen alone, with no logo drawing before it', async () => {
  await render(
    <AnimatedSplash appReady={false}>
      <Text>app</Text>
    </AnimatedSplash>,
  );
  expect(screen.getByText(tagline)).toBeTruthy();
  expect(screen.getByLabelText('ChalkPis Tutor')).toBeTruthy();
  // the white logo-drawing animation that used to come first is gone
  expect(mockLottie).not.toHaveBeenCalled();
  // the native white splash hands over once the overlay is on screen
  await fireEvent(screen.getByTestId('launch-splash'), 'layout', {
    nativeEvent: { layout: { width: 375, height: 812 } },
  });
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

it('with Reduce Motion it shows the blue screen still, until the app is ready, then goes', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const { rerender } = await render(
    <AnimatedSplash appReady={false}>
      <Text>app</Text>
    </AnimatedSplash>,
  );
  expect(screen.getByText(tagline)).toBeTruthy();
  await rerender(
    <AnimatedSplash appReady>
      <Text>app</Text>
    </AnimatedSplash>,
  );
  await waitFor(() => expect(screen.queryByTestId('launch-splash')).toBeNull());
  expect(screen.getByText('app')).toBeTruthy();
});
