import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { LanguageScreen } from '../LanguageScreen';

const nav = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
// the screen only uses navigate and the route params
const welcomeProps = {
  navigation: nav,
  route: { key: 'Language', name: 'Language', params: undefined },
} as unknown as ComponentProps<typeof LanguageScreen>;

beforeEach(() => jest.clearAllMocks());

describe('welcome', () => {
  it('offers WhatsApp as the only way in, for sign-up and sign-in alike', async () => {
    await render(<LanguageScreen {...welcomeProps} />);
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((l) => /^Continue with/.test(l ?? ''));
    expect(labels).toEqual(['Continue with WhatsApp']);
    expect(screen.queryByText(/Google|Apple|email/)).toBeNull();
  });

  it('continues to the mobile number', async () => {
    await render(<LanguageScreen {...welcomeProps} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with WhatsApp' }));
    expect(nav.navigate).toHaveBeenCalledWith('Phone');
  });
});
