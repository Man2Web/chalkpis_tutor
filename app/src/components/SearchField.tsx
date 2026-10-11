import { SearchBar } from 'panelui-native/components/search-bar';

/** PanelUI search bar with a clear button. */
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
    <SearchBar
      value={value}
      onChangeText={onChangeText}
      onClear={() => onChangeText('')}
      placeholder={placeholder}
      accessibilityLabel={placeholder}
      autoCorrect={false}
      returnKeyType="search"
      isClearable
      cancel="never"
      panel="never"
    />
  );
}
