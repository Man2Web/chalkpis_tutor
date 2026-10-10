import { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, column, spacing } from '../theme';
import { KeyboardAvoid, KeyboardScroll } from './KeyboardScroll';

type Props = { children: ReactNode; scroll?: boolean; padded?: boolean };

/**
 * Every screen's frame: safe areas, the keyboard (the focused field always stays visible)
 * and a centred column that does not stretch across tablets or the browser.
 */
export function Screen({ children, scroll = true, padded = true }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {scroll ? (
        <KeyboardScroll contentContainerStyle={[styles.content, padded && styles.padded]}>
          {children}
        </KeyboardScroll>
      ) : (
        <KeyboardAvoid style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.root, column]}>{children}</View>
        </KeyboardAvoid>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, gap: spacing.sm, ...column },
  padded: { padding: spacing.lg },
});
