import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../../i18n';
import { FeePlanScreen } from '../FeePlanScreen';
import { createFeePlans, updateFeePlan } from '../api';
import { useBatches, useStudents } from '../../../data/hooks';

jest.mock('../../../data/hooks', () => ({
  useStudents: jest.fn(),
  useBatches: jest.fn(),
  useInstituteId: () => 'I1',
  useRefreshData: () => jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../api', () => ({
  createFeePlans: jest.fn().mockResolvedValue({ planIds: ['p1'], created: 1, skipped: [] }),
  updateFeePlan: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/dates', () => ({
  ...jest.requireActual('../../../lib/dates'),
  todayYmd: () => '2026-10-19',
}));
jest.mock('../../../lib/analytics', () => ({ track: jest.fn(), reportError: jest.fn() }));
// The date picker's calendar sheet is tested on its own; here a date is set straight on the field.
jest.mock('../../../components/PickerFields', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextInput } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    ...jest.requireActual('../../../components/PickerFields'),
    DateField: (p: { label: string; value: string; onChange: (v: string) => void }) =>
      React.createElement(TextInput, {
        accessibilityLabel: p.label,
        value: p.value,
        onChangeText: p.onChange,
      }),
  };
});

const q = (data: unknown) => ({ data, isLoading: false, isError: false });
const kid = (over = {}) => ({
  id: 's1',
  name: 'Kavin Kumar',
  status: 'active',
  batchIds: ['b1'],
  monthlyFee: 150000,
  feeCycle: 'monthly',
  dueDay: 5,
  discount: 0,
  ...over,
});
const goBack = jest.fn();
const navigation = { goBack } as never;
const route = { key: 'k', name: 'FeePlan', params: { studentId: 's1' } } as never;

beforeEach(() => {
  jest.clearAllMocks();
  (useStudents as jest.Mock).mockReturnValue(
    q([
      kid(),
      kid({ id: 's2', name: 'Diya S' }),
      kid({ id: 's3', name: 'Left Already', status: 'inactive' }),
      kid({ id: 's4', name: 'Other Batch', batchIds: ['b2'] }),
    ]),
  );
  (useBatches as jest.Mock).mockReturnValue(q([{ id: 'b1', name: 'Maths 10' }]));
});

it('turns a monthly fee into a yearly plan in 3 equal parts and saves it in paise', async () => {
  await render(<FeePlanScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Yearly' }));
  expect(screen.getByLabelText('Plan name').props.value).toBe('Yearly fee 2026-27');
  // a ₹1,500 monthly fee suggests ₹18,000 for the year
  expect(screen.getByLabelText('Fee for the year (₹)').props.value).toBe('18000');
  expect(screen.getByLabelText('Part 1 (₹)').props.value).toBe('6000');
  expect(screen.getByText('Parts add up to ₹18,000')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Create plan' }));
  await waitFor(() => expect(createFeePlans).toHaveBeenCalledTimes(1));
  expect(createFeePlans).toHaveBeenCalledWith(
    {
      studentIds: ['s1'],
      title: 'Yearly fee 2026-27',
      parts: [
        { amount: 600000, dueYmd: '2026-10-19' },
        { amount: 600000, dueYmd: '2027-02-19' },
        { amount: 600000, dueYmd: '2027-06-19' },
      ],
    },
    { idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{24,100}$/) },
  );
  await waitFor(() => expect(goBack).toHaveBeenCalled());
  expect(updateFeePlan).not.toHaveBeenCalled();
});

it('re-splits when the total or the number of parts changes, and keeps manual edits after', async () => {
  await render(<FeePlanScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Yearly' }));
  await fireEvent.changeText(screen.getByLabelText('Fee for the year (₹)'), '24000');
  await fireEvent.press(screen.getByRole('button', { name: '2 parts' }));
  expect(screen.getByLabelText('Part 1 (₹)').props.value).toBe('12000');
  expect(screen.getByLabelText('Part 2 (₹)').props.value).toBe('12000');
  await fireEvent.changeText(screen.getByLabelText('Part 1 (₹)'), '14000');
  await fireEvent.changeText(screen.getByLabelText('Part 2 (₹)'), '10000');
  expect(screen.getByText('Parts add up to ₹24,000')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Part 2 (₹)'), '9000');
  // a hand-edited part that no longer makes the year's fee is pointed out
  expect(screen.getByText(/Parts add up to ₹23,000, not ₹24,000/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Part 2 (₹)'), '10000');
  await fireEvent.press(screen.getByRole('button', { name: 'Create plan' }));
  await waitFor(() => expect(createFeePlans).toHaveBeenCalledTimes(1));
  expect((createFeePlans as jest.Mock).mock.calls[0][0].parts).toEqual([
    { amount: 1400000, dueYmd: '2026-10-19' },
    { amount: 1000000, dueYmd: '2027-04-19' },
  ]);
});

it('can apply the plan to everyone active in the batch', async () => {
  await render(<FeePlanScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Yearly' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Everyone in Maths 10' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Create plan for 2 students' }));
  await waitFor(() => expect(createFeePlans).toHaveBeenCalledTimes(1));
  expect((createFeePlans as jest.Mock).mock.calls[0][0].studentIds).toEqual(['s1', 's2']);
});

it('explains a mistake instead of saving: parts out of order, or the plan already exists', async () => {
  await render(<FeePlanScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Yearly' }));
  const dates = screen.getAllByLabelText('Due date');
  await fireEvent.changeText(dates[1]!, '2026-01-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Create plan' }));
  expect(screen.getByText('Parts must be in date order')).toBeTruthy();
  expect(createFeePlans).not.toHaveBeenCalled();

  await fireEvent.changeText(dates[1]!, '2027-02-19');
  (createFeePlans as jest.Mock).mockRejectedValueOnce(new Error('planExists'));
  await fireEvent.press(screen.getByRole('button', { name: 'Create plan' }));
  await waitFor(() =>
    expect(
      screen.getByText(
        'This student already has a plan with this name. Change the name (for example, the year).',
      ),
    ).toBeTruthy(),
  );
  expect(goBack).not.toHaveBeenCalled();
});

it('a yearly student switched back to monthly must enter a new monthly fee', async () => {
  (useStudents as jest.Mock).mockReturnValue(q([kid({ feeCycle: 'yearly', monthlyFee: 2400000 })]));
  await render(<FeePlanScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Monthly' }));
  expect(screen.getByLabelText('Monthly fee (₹)').props.value).toBe('');
});
