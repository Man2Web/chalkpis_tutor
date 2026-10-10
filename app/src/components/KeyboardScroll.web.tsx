import { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, type StyleProp, type ViewStyle } from 'react-native';

type Props = { children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle> };

/** In the browser the page scrolls the focused field into view by itself. */
export function KeyboardScroll({ children, contentContainerStyle }: Props) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={contentContainerStyle}>
      {children}
    </ScrollView>
  );
}

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const KeyboardAvoid = KeyboardAvoidingView;
