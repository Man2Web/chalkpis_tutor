import { forwardRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  /** Fixed text before the value, e.g. "+91". */
  prefix?: string;
};

/** iOS-style field: small grey label above, a white rounded box, a blue ring while typing, red when wrong. */
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, hint, prefix, style, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.box,
          focused && styles.focused,
          !!error && { borderColor: colors.dangerFill },
        ]}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.text, multiline && styles.multiline, style]}
          {...rest}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[type.footnote, { marginLeft: 4 }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: spacing.md },
  label: { ...type.footnote, fontWeight: '500', marginLeft: 4 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md - 2,
    paddingHorizontal: spacing.md + 2,
    backgroundColor: colors.surface,
  },
  focused: { borderColor: colors.primary },
  prefix: { fontSize: 17, fontWeight: '500', color: colors.text },
  text: {
    flex: 1,
    minHeight: 45,
    paddingVertical: 11,
    fontSize: 17,
    letterSpacing: -0.41,
    color: colors.text,
    // the blue ring already shows focus; drop the browser's own outline in the web preview
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
});
