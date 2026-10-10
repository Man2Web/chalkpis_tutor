import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { BottomSheet, Button, Input, toast } from '../../components';
import { reportError } from '../../lib/analytics';
import { spacing, type } from '../../theme';
import { logout } from '../auth/session';
import { canDelete, DELETE_WORD } from './logic';

/** Permanent account deletion, locked until the owner types DELETE (Play Store and App Store both require it). */
export function DeleteAccountSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await api('DELETE', '/account', { confirm: true });
      try {
        await logout();
      } catch {
        // the account is already gone; the session ends on its own
      }
    } catch (e) {
      reportError(e);
      toast(t('settings.deleteFailed'), 'error');
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('settings.deleteConfirmTitle')}>
      <Text style={[type.body, { marginBottom: spacing.md }]}>
        {t('settings.deleteConfirmHelp', { word: DELETE_WORD })}
      </Text>
      <Input
        label={t('settings.typeToConfirm', { word: DELETE_WORD })}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={{ gap: spacing.sm }}>
        <Button
          variant="danger"
          title={t('settings.deleteForever')}
          onPress={deleteAccount}
          disabled={!canDelete(typed)}
          loading={busy}
        />
        <Button variant="ghost" title={t('common.cancel')} onPress={onClose} disabled={busy} />
      </View>
    </BottomSheet>
  );
}
