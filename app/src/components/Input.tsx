import { forwardRef } from 'react';
import { Text, TextInput, TextInputProps } from 'react-native';
import { Input as PanelInput } from 'panelui-native/components/input';

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  /** Fixed text before the value, e.g. "+91". */
  prefix?: string;
};

/** PanelUI field: label above, the box, then a hint or the error in red; the keyboard never covers it. */
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, hint, prefix, ...rest },
  ref,
) {
  return (
    <PanelInput
      ref={ref}
      label={label}
      accessibilityLabel={label}
      description={error ? undefined : hint}
      errorMessage={error}
      startContent={
        prefix ? (
          <Text className="text-base font-medium text-muted-foreground">{prefix}</Text>
        ) : undefined
      }
      containerClassName="mb-3"
      {...rest}
    />
  );
});
