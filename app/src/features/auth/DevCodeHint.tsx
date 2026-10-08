import { Text } from 'react-native';
import { Button, Card } from '../../components';
import { colors, spacing, type } from '../../theme';
import { devCodeFor } from './phoneAuth';

/**
 * Local testing only: when the server runs in test mode it returns the login code instead of relying on WhatsApp,
 * so show it on screen. Renders nothing when the server did not send one (always the case in production).
 */
export function DevCodeHint({ phone, onUse }: { phone: string; onUse: (code: string) => void }) {
  const code = devCodeFor(phone);
  if (!code) return null;
  return (
    <Card
      style={{ backgroundColor: colors.warningSoft, gap: spacing.xs, marginBottom: spacing.md }}
    >
      <Text style={type.label}>Test mode (no WhatsApp message is sent)</Text>
      <Text style={type.title}>{code}</Text>
      <Button variant="secondary" title="Use this code" onPress={() => onUse(code)} />
    </Card>
  );
}
