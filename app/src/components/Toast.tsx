import { toast as panelToast } from 'panelui-native/components/toast';
import { haptic } from '../lib/haptics';

type Kind = 'info' | 'success' | 'error';

const VARIANT = { info: 'default', success: 'success', error: 'destructive' } as const;

/** Shows a PanelUI toast (the viewport lives in PanelUIProvider) with a matching haptic. */
export function toast(message: string, kind: Kind = 'info') {
  if (kind === 'success') haptic.success();
  if (kind === 'error') haptic.error();
  panelToast.show({ label: message, variant: VARIANT[kind], placement: 'bottom', duration: 3000 });
}
