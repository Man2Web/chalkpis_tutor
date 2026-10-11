import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { todayYmd, addDays } from '../../../lib/dates';
import { DateStrip } from '../DateStrip';

it('steps a day back, and cannot step into the future', async () => {
  const onChange = jest.fn();
  const today = todayYmd();
  await render(<DateStrip date={today} onChange={onChange} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
  expect(onChange).toHaveBeenCalledWith(addDays(today, -1));
  expect(screen.getByRole('button', { name: 'Next day' }).props.accessibilityState.disabled).toBe(
    true,
  );
});

it('tapping the date opens the calendar, tapping again closes it', async () => {
  await render(<DateStrip date={todayYmd()} onChange={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: /open calendar/ }));
  expect(screen.getByRole('button', { name: /close calendar/ })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /close calendar/ }));
  expect(screen.getByRole('button', { name: /open calendar/ })).toBeTruthy();
});

it('on a past day the calendar offers a way back to today', async () => {
  const onChange = jest.fn();
  await render(<DateStrip date={addDays(todayYmd(), -5)} onChange={onChange} />);
  await fireEvent.press(screen.getByRole('button', { name: /open calendar/ }));
  await fireEvent.press(screen.getByText('Go to today'));
  expect(onChange).toHaveBeenCalledWith(todayYmd());
});
