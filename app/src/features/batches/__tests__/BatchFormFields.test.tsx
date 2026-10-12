import { useForm } from 'react-hook-form';
import { render, screen } from '@testing-library/react-native';
import '../../../i18n';
import { BatchFormFields, emptyBatchForm } from '../BatchFormFields';
import type { BatchForm } from '../schema';

let mockCategory: string | undefined;
jest.mock('../../../data/hooks', () => ({
  useInstitute: () => ({ data: { name: 'X', receiptPrefix: 'TD', category: mockCategory } }),
}));

function Fields() {
  const { control } = useForm<BatchForm>({ defaultValues: emptyBatchForm });
  return <BatchFormFields control={control} />;
}

it.each([
  ['tuition', 'Subject', 'Class'],
  ['karate', 'Martial art', 'Belt'],
  ['sports', 'Sport', 'Age group or level'],
  ['dance', 'Dance style', 'Level'],
  [undefined, 'Subject', 'Class'],
])('a %s centre names the batch fields its own way', async (category, subject, level) => {
  mockCategory = category;
  await render(<Fields />);
  expect(screen.getByLabelText(subject)).toBeTruthy();
  expect(screen.getByLabelText(level)).toBeTruthy();
});
