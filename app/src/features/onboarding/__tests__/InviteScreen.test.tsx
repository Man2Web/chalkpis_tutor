import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { ApiError } from '../../../api/client';
import type { CentreInvite } from '../../../lib/types';
import { refreshProfile } from '../../auth/session';
import { acceptInvite, declineInvite } from '../../staff/api';
import { InviteScreen, inviteErrorKey } from '../InviteScreen';

const KIRAN: CentreInvite = {
  instituteId: 'i1',
  centreName: 'Kiran Karate Academy',
  ownerName: 'Kiran',
  invitedAt: '2026-11-09T05:00:00Z',
};
const ASHA: CentreInvite = {
  instituteId: 'i2',
  centreName: 'Asha Tuitions',
  ownerName: 'Asha',
  invitedAt: '2026-11-08T05:00:00Z',
};

const mockState = { profile: { invites: [KIRAN] as CentreInvite[] } };
jest.mock('../../auth/session', () => {
  const useSession = (sel: (s: unknown) => unknown) => sel(mockState);
  useSession.getState = () => mockState;
  return { useSession, refreshProfile: jest.fn().mockResolvedValue(undefined) };
});
jest.mock('../../staff/api', () => ({
  acceptInvite: jest.fn().mockResolvedValue(undefined),
  declineInvite: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/analytics', () => ({ reportError: jest.fn() }));

const nav = { navigate: jest.fn(), replace: jest.fn() };
const props = {
  navigation: nav,
  route: { key: 'Invite', name: 'Invite', params: undefined },
} as unknown as ComponentProps<typeof InviteScreen>;

beforeEach(() => {
  jest.clearAllMocks();
  mockState.profile.invites = [KIRAN];
});

it('asks "Join <centre>?" and says who invited them and what a helper can see', async () => {
  await render(<InviteScreen {...props} />);
  expect(screen.getAllByText('Join Kiran Karate Academy?').length).toBeGreaterThan(0);
  expect(screen.getByText('Invited by Kiran')).toBeTruthy();
  expect(screen.getByText(/You do not see fees or parents' numbers/)).toBeTruthy();
});

it('joins only when they tap Join, then reloads the profile so the app opens', async () => {
  await render(<InviteScreen {...props} />);
  expect(acceptInvite).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
  await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith('i1'));
  await waitFor(() => expect(refreshProfile).toHaveBeenCalled());
});

it('asks before saying no, then moves on to setting up their own centre', async () => {
  await render(<InviteScreen {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'No thanks' }));
  expect(declineInvite).not.toHaveBeenCalled();
  expect(screen.getByText('Say no to Kiran Karate Academy?')).toBeTruthy();
  mockState.profile.invites = []; // what the server says after declining
  const buttons = screen.getAllByRole('button', { name: 'No thanks' });
  await fireEvent.press(buttons[buttons.length - 1]!);
  await waitFor(() => expect(declineInvite).toHaveBeenCalledWith('i1'));
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('Profile'));
});

it('lists every centre when more than one invited them', async () => {
  mockState.profile.invites = [KIRAN, ASHA];
  await render(<InviteScreen {...props} />);
  expect(screen.getAllByText('Centres that invited you').length).toBeGreaterThan(0);
  expect(screen.getByText('Kiran Karate Academy')).toBeTruthy();
  expect(screen.getByText('Asha Tuitions')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Join' })).toHaveLength(2);
});

it('can set up a centre of their own instead, coming back with Back', async () => {
  await render(<InviteScreen {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Set up my own centre' }));
  expect(nav.navigate).toHaveBeenCalledWith('Profile');
});

it('names why joining did not work', () => {
  expect(inviteErrorKey(new ApiError(404, 'not_found'))).toBe('gone');
  expect(inviteErrorKey(new ApiError(402, 'plan_expired'))).toBe('planExpired');
  expect(inviteErrorKey(new ApiError(402, 'staff_limit'))).toBe('full');
  expect(inviteErrorKey(new Error('x'))).toBe('generic');
});
