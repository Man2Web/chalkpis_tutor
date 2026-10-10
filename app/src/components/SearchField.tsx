import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing } from '../theme';

/** iOS search bar: grey rounded field with a magnifier and a clear button. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={17} color={colors.gray} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.gray}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        returnKeyType="search"
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        style={styles.input}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear"
          hitSlop={10}
        >
          <Ionicons name="close-circle" size={17} color={colors.gray} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.fill,
  },
  input: { flex: 1, fontSize: 17, letterSpacing: -0.41, color: colors.text, paddingVertical: 8 },
});
