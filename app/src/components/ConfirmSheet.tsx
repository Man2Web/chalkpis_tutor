import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** What will happen, in one or two plain sentences. */
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Red confirm button for something that removes or cannot be undone. */
  destructive?: boolean;
  loading?: boolean;
  cancelLabel?: string;
};

/**
 * "Are you sure?" as a bottom sheet (Alert.alert does nothing in the browser version): the question, what it does,
 * then the action and Cancel. Used before removing, archiving, signing out and leaving unsaved work.
 */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  destructive,
  loading,
  cancelLabel,
}: Props) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: spacing.md }}>
        {message ? <Text style={[type.body, { lineHeight: 23 }]}>{message}</Text> : null}
        <Button
          variant={destructive ? 'danger' : 'primary'}
          title={confirmLabel}
          loading={loading}
          onPress={onConfirm}
        />
        <Button variant="secondary" title={cancelLabel ?? t('common.cancel')} onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

/**
 * Keeps a screen with unsaved work (typed marks, ticked homework, attendance taps) from being closed by Back, a swipe
 * or the browser: it asks "Discard changes?" first. Render `sheet`; call `allowLeave()` right before navigating away
 * after a successful save, so that exit is not stopped.
 */
export function useDiscardGuard(dirty: boolean) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const bypass = useRef(false);
  const [pending, setPending] = useState<null | (() => void)>(null);

  usePreventRemove(dirty, ({ data }) => {
    if (bypass.current) {
      navigation.dispatch(data.action);
      return;
    }
    setPending(() => () => navigation.dispatch(data.action));
  });

  const allowLeave = useCallback(() => {
    bypass.current = true;
  }, []);

  const sheet = (
    <ConfirmSheet
      visible={!!pending}
      onClose={() => setPending(null)}
      title={t('discard.title')}
      message={t('discard.text')}
      confirmLabel={t('discard.confirm')}
      cancelLabel={t('discard.keep')}
      destructive
      onConfirm={() => {
        const go = pending;
        setPending(null);
        bypass.current = true;
        go?.();
      }}
    />
  );
  return { sheet, allowLeave };
}
