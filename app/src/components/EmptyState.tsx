import Ionicons from '@expo/vector-icons/Ionicons';
import { EmptyState as PanelEmpty } from 'panelui-native/components/empty-state';
import { colors } from '../theme';
import { Button } from './Button';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** PanelUI empty state: icon, title, a line of help and one action. */
export function EmptyState({
  icon = 'folder-open-outline',
  title,
  message,
  actionLabel,
  onAction,
}: Props) {
  return (
    <PanelEmpty>
      <PanelEmpty.Header>
        <PanelEmpty.Media variant="icon" size="lg">
          <Ionicons name={icon} size={22} color={colors.textMuted} />
        </PanelEmpty.Media>
        <PanelEmpty.Title>{title}</PanelEmpty.Title>
        {message ? <PanelEmpty.Description>{message}</PanelEmpty.Description> : null}
      </PanelEmpty.Header>
      {actionLabel && onAction ? (
        <PanelEmpty.Content>
          <Button title={actionLabel} onPress={onAction} size="small" />
        </PanelEmpty.Content>
      ) : null}
    </PanelEmpty>
  );
}
