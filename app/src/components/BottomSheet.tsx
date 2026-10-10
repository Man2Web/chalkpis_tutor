import { ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../theme';
import { KeyboardAvoid } from './KeyboardScroll';

type Props = { visible: boolean; onClose: () => void; title?: string; children: ReactNode };

export function BottomSheet({ visible, onClose, title, children }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* The sheet rises with the keyboard, so a field inside it is never hidden. */}
      <KeyboardAvoid style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          {!!title && <Text style={[type.heading, { marginBottom: spacing.md }]}>{title}</Text>}
          {children}
        </SafeAreaView>
      </KeyboardAvoid>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: spacing.lg,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C7C7CC',
    marginBottom: spacing.md,
  },
});
