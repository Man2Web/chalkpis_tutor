import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Input } from './Input';

type Props<T extends FieldValues> = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  control: Control<T>;
  name: Path<T>;
  label: string;
};

/** react-hook-form field; error messages are translation keys under `validation.*`. */
export function FormInput<T extends FieldValues>({ control, name, label, ...rest }: Props<T>) {
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          label={label}
          value={field.value ?? ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={
            fieldState.error?.message
              ? t(`validation.${fieldState.error.message}`, {
                  defaultValue: t('validation.required'),
                })
              : undefined
          }
          {...rest}
        />
      )}
    />
  );
}
