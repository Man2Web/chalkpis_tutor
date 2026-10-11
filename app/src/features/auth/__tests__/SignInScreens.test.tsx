import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { EmailScreen } from '../EmailScreen';
import { LanguageScreen } from '../LanguageScreen';
import { oauthSignIn, sendEmailCode, signInMethods } from '../signIn';

jest.mock('../signIn', () => ({
  signInMethods: jest.fn(),
  oauthSignIn: jest.fn(),
  sendEmailCode: jest.fn(),
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
// the screens only use navigate / goBack / popToTop and the route params
const welcomeProps = {
  navigation: nav,
  route: { key: 'Language', name: 'Language', params: undefined },
} as unknown as ComponentProps<typeof LanguageScreen>;
const emailProps = {
  navigation: nav,
  route: { key: 'Email', name: 'Email', params: undefined },
} as unknown as ComponentProps<typeof EmailScreen>;

beforeEach(() => jest.clearAllMocks());

describe('welcome', () => {
  it('shows only the sign-in methods that are switched on', async () => {
    (signInMethods as jest.Mock).mockResolvedValue({
      whatsapp: true,
      email: true,
      google: false,
      apple: false,
    });
    await render(<LanguageScreen {...welcomeProps} />);
    expect(await screen.findByRole('button', { name: 'Continue with email' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with WhatsApp' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  });

  it('a new Google user is asked for their mobile number, with the sign-up carried along', async () => {
    (signInMethods as jest.Mock).mockResolvedValue({
      whatsapp: true,
      email: true,
      google: true,
      apple: true,
    });
    (oauthSignIn as jest.Mock).mockResolvedValue({
      needsPhone: true,
      signupToken: 'tok',
      email: 'ravi@gmail.com',
      name: 'Ravi',
    });
    await render(<LanguageScreen {...welcomeProps} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));
    await waitFor(() =>
      expect(nav.navigate).toHaveBeenCalledWith('Phone', {
        signupToken: 'tok',
        email: 'ravi@gmail.com',
        name: 'Ravi',
      }),
    );
  });

  it('cancelling Google stays on the welcome screen quietly', async () => {
    (signInMethods as jest.Mock).mockResolvedValue({
      whatsapp: true,
      email: false,
      google: true,
      apple: false,
    });
    (oauthSignIn as jest.Mock).mockResolvedValue('cancelled');
    await render(<LanguageScreen {...welcomeProps} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(oauthSignIn).toHaveBeenCalledWith('google'));
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});

describe('email', () => {
  it('refuses an address that cannot be right, without sending anything', async () => {
    await render(<EmailScreen {...emailProps} />);
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'priya@');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(screen.getByText('That email address does not look right.')).toBeTruthy();
    expect(sendEmailCode).not.toHaveBeenCalled();
  });

  it('sends the code and moves to the code screen', async () => {
    (sendEmailCode as jest.Mock).mockResolvedValue('priya@example.com');
    await render(<EmailScreen {...emailProps} />);
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'Priya@Example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() =>
      expect(nav.navigate).toHaveBeenCalledWith('EmailCode', { email: 'priya@example.com' }),
    );
  });
});
