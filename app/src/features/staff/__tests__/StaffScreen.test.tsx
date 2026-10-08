import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { ApiError } from '../../../api/client';
import { StaffScreen } from '../StaffScreen';
import { addStaff, removeStaff, setStaffBatches } from '../api';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../lib/analytics', () => ({ reportError: jest.fn() }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  addStaff: jest.fn().mockResolvedValue(undefined),
  setStaffBatches: jest.fn().mockResolvedValue(undefined),
  removeStaff: jest.fn().mockResolvedValue(undefined),
}));
const mockRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../data/hooks', () => ({
  useStaff: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: 'u1',
        name: 'Meena',
        phone: '+919876511111',
        addedAt: '2026-10-08T00:00:00Z',
        batchIds: ['b1'],
      },
      {
        id: 'u2',
        name: 'Ravi',
        phone: '+919876522222',
        addedAt: '2026-10-08T00:00:00Z',
        batchIds: [],
      },
    ],
  }),
  useBatches: () => ({
    isLoading: false,
    data: [
      { id: 'b1', name: 'Maths 10', status: 'active' },
      { id: 'b2', name: 'Science 10', status: 'active' },
      { id: 'b3', name: 'Old Batch', status: 'archived' },
    ],
  }),
  useRefreshData: () => mockRefresh,
}));

beforeEach(() => jest.clearAllMocks());

it('lists helpers with their phone and assigned batches', async () => {
  await render(<StaffScreen />);
  expect(screen.getByText('Meena')).toBeTruthy();
  expect(screen.getByText('+919876511111 • Maths 10')).toBeTruthy();
  expect(screen.getByText('+919876522222 • No batches assigned')).toBeTruthy();
});

it('adds a helper with the chosen batches and refreshes the lists', async () => {
  await render(<StaffScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a helper' }));
  await fireEvent.changeText(screen.getByLabelText("Helper's name"), 'Sunita');
  await fireEvent.changeText(screen.getByLabelText('Mobile number (WhatsApp)'), '98765 43210');
  await fireEvent.press(screen.getByRole('button', { name: 'Science 10' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add helper' }));
  await waitFor(() =>
    expect(addStaff).toHaveBeenCalledWith({
      name: 'Sunita',
      phone: '98765 43210',
      batchIds: ['b2'],
    }),
  );
  expect(mockRefresh).toHaveBeenCalled();
});

it('archived batches cannot be assigned', async () => {
  await render(<StaffScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a helper' }));
  expect(screen.queryByRole('button', { name: 'Old Batch' })).toBeNull();
});

it('does not send a bad number, and says why', async () => {
  await render(<StaffScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a helper' }));
  await fireEvent.changeText(screen.getByLabelText("Helper's name"), 'Sunita');
  await fireEvent.changeText(screen.getByLabelText('Mobile number (WhatsApp)'), '123');
  await fireEvent.press(screen.getByRole('button', { name: 'Add helper' }));
  expect(screen.getByText('Check the name and the 10-digit mobile number.')).toBeTruthy();
  expect(addStaff).not.toHaveBeenCalled();
});

it('explains a number that is already in use', async () => {
  (addStaff as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'already_member'));
  await render(<StaffScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a helper' }));
  await fireEvent.changeText(screen.getByLabelText("Helper's name"), 'Sunita');
  await fireEvent.changeText(screen.getByLabelText('Mobile number (WhatsApp)'), '9876543210');
  await fireEvent.press(screen.getByRole('button', { name: 'Add helper' }));
  await waitFor(() =>
    expect(screen.getByText('This number is already used in an institute.')).toBeTruthy(),
  );
});

it('changes the batches of an existing helper', async () => {
  await render(<StaffScreen />);
  await fireEvent.press(screen.getByText('Meena'));
  await fireEvent.press(screen.getByRole('button', { name: 'Science 10' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(setStaffBatches).toHaveBeenCalledWith('u1', ['b1', 'b2']));
});

it('removes a helper', async () => {
  await render(<StaffScreen />);
  await fireEvent.press(screen.getByText('Ravi'));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove helper' }));
  await waitFor(() => expect(removeStaff).toHaveBeenCalledWith('u2'));
});
