import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { api } from '../../../api/client';
import { ProfileScreen } from '../ProfileScreen';

jest.mock('../../../api/client', () => ({
  ...jest.requireActual('../../../api/client'),
  api: jest.fn().mockResolvedValue({ instituteId: 'I1', created: true }),
  uploadImage: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('../../../lib/analytics', () => ({ reportError: jest.fn() }));
jest.mock('../../auth/session', () => ({ refreshProfile: jest.fn().mockResolvedValue(undefined) }));

const nav = { navigate: jest.fn() };
const props = {
  navigation: nav,
  route: { key: 'Profile', name: 'Profile', params: undefined },
} as unknown as ComponentProps<typeof ProfileScreen>;

beforeEach(() => jest.clearAllMocks());

async function fillNames() {
  await fireEvent.changeText(screen.getByLabelText('Your name'), 'Kiran');
  await fireEvent.changeText(
    screen.getByLabelText('Name of your class, academy or institute'),
    'Kiran Karate Academy',
  );
}

it('offers every kind of centre', async () => {
  await render(<ProfileScreen {...props} />);
  for (const name of [
    'Tuition',
    'Coaching',
    'Abacus',
    'Karate',
    'Dance',
    'Yoga',
    'Sports',
    'Other',
  ])
    expect(screen.getByRole('radio', { name })).toBeTruthy();
});

it('asks what the centre teaches before setting it up', async () => {
  await render(<ProfileScreen {...props} />);
  await fillNames();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Pick what you teach')).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
});

it('sets up the centre with what it teaches', async () => {
  await render(<ProfileScreen {...props} />);
  await fireEvent.press(screen.getByRole('radio', { name: 'Karate' }));
  await fillNames();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'POST',
      '/institutes',
      expect.objectContaining({
        category: 'karate',
        tutorName: 'Kiran',
        instituteName: 'Kiran Karate Academy',
      }),
      expect.anything(),
    ),
  );
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Batch'));
});
