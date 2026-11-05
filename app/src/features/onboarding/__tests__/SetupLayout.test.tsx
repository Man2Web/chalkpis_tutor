import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { SetupBoard, SetupLayout } from '../SetupLayout';

it('a sign-up step names itself and says where it is in the four steps', async () => {
  await render(
    <SetupLayout step="details" title="How we reach you" subtitle="Why we ask">
      <Text>form</Text>
    </SetupLayout>,
  );
  expect(screen.getByRole('header', { name: 'How we reach you' })).toBeTruthy();
  expect(screen.getByLabelText('Step 2 of 4')).toBeTruthy();
  expect(screen.getByText('Why we ask')).toBeTruthy();
  expect(screen.getByText('form')).toBeTruthy();
});

it('the laptop board lists the steps, done ones and this one said as such', async () => {
  await render(<SetupBoard step="batch" />);
  expect(screen.getByLabelText('Your centre, done')).toBeTruthy();
  expect(screen.getByLabelText('How we reach you, done')).toBeTruthy();
  expect(screen.getByLabelText('Your first batch, this step')).toBeTruthy();
  expect(screen.getByLabelText('Your first students')).toBeTruthy();
});
