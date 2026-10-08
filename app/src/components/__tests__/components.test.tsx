import { fireEvent, render, screen } from '@testing-library/react-native';
import { Avatar, Button, EmptyState, Input } from '..';

describe('design system', () => {
  it('Button fires onPress and is blocked while loading', async () => {
    const onPress = jest.fn();
    const view = await render(<Button title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.rerender(<Button title="Save" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Input shows its error', async () => {
    await render(<Input label="Phone" error="Required" />);
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('Avatar falls back to initials', async () => {
    await render(<Avatar name="Asha Rao" />);
    expect(screen.getByText('AR')).toBeTruthy();
  });

  it('EmptyState renders action', async () => {
    const onAction = jest.fn();
    await render(<EmptyState title="No students" actionLabel="Add student" onAction={onAction} />);
    await fireEvent.press(screen.getByText('Add student'));
    expect(onAction).toHaveBeenCalled();
  });
});
