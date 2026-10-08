import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing, TAP, type } from '../theme';

type Props = TextInputProps & { label: string; error?: string };

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, !!error && { borderColor: colors.danger }, style]}
        {...rest}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={[type.caption, { color: colors.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginBottom: spacing.md },
  input: {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md - 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
});
