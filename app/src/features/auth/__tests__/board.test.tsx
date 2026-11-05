import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { boardDate, BoardSteps } from '../board';
import { LanguageScreen } from '../LanguageScreen';
import { PhoneField } from '../signin';

const welcomeProps = {
  navigation: { navigate: jest.fn() },
  route: { key: 'Language', name: 'Language', params: undefined },
} as unknown as ComponentProps<typeof LanguageScreen>;

it('writes the date the way a teacher does on the board', () => {
  expect(boardDate(new Date(2026, 10, 5))).toBe('05.11.2026');
  expect(boardDate(new Date(2027, 0, 31))).toBe('31.01.2027');
});

it('reads the step count as one label', async () => {
  await render(<BoardSteps step={[2, 4]} />);
  expect(screen.getByLabelText('Step 2 of 4')).toBeTruthy();
});

describe('welcome board', () => {
  it('shows the promise, and the ticked lines only once the board has room for them', async () => {
    await render(<LanguageScreen {...welcomeProps} />);
    expect(screen.getByRole('header', { name: 'Run your classes from your phone' })).toBeTruthy();
    expect(screen.queryByText('Attendance registers')).toBeNull();

    await fireEvent(screen.getByTestId('welcome-board'), 'layout', {
      nativeEvent: { layout: { height: 520 } },
    });
    expect(screen.getByText('Attendance registers')).toBeTruthy();
    expect(screen.getByText('Fee reminders with your UPI QR')).toBeTruthy();
    expect(screen.getByText('WhatsApp updates to parents')).toBeTruthy();
  });

  it('a small phone keeps one line, so the way in stays on screen', async () => {
    await render(<LanguageScreen {...welcomeProps} />);
    await fireEvent(screen.getByTestId('welcome-board'), 'layout', {
      nativeEvent: { layout: { height: 330 } },
    });
    expect(screen.getByText('Attendance registers')).toBeTruthy();
    expect(screen.queryByText('WhatsApp updates to parents')).toBeNull();
  });
});

it('the number field shows +91 without an emoji flag (Windows shows those as letters)', async () => {
  await render(<PhoneField label="Mobile number" value="" onChangeText={jest.fn()} />);
  // the chip is hidden from screen readers (the field's label says it all), so look among hidden elements too
  expect(screen.getByText('+91', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByText('🇮🇳', { includeHiddenElements: true })).toBeNull();
  expect(screen.getByLabelText('Mobile number').props.placeholder).toBe('10-digit number');
});
