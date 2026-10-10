import { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView, KeyboardProvider } from 'react-native-keyboard-controller';

type Props = { children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle> };

/** Scrolls the focused field above the keyboard on Android and iOS (edge-to-edge safe). */
export function KeyboardScroll({ children, contentContainerStyle }: Props) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={32}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export { KeyboardAvoidingView as KeyboardAvoid } from 'react-native-keyboard-controller';
