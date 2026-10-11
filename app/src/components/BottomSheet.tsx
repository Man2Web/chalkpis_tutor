import { ReactNode } from 'react';
import { View } from 'react-native';
import { BottomSheet as PanelSheet } from 'panelui-native/components/bottom-sheet';

type Props = { visible: boolean; onClose: () => void; title?: string; children: ReactNode };

/** PanelUI bottom sheet: grabber, title, scrollable body; swipe down, tap outside or press back to close. */
export function BottomSheet({ visible, onClose, title, children }: Props) {
  return (
    <PanelSheet open={visible} onOpenChange={(open) => !open && onClose()}>
      <PanelSheet.Content>
        {title ? <PanelSheet.Header title={title} /> : null}
        <PanelSheet.Body>
          <View className="gap-3 pb-6">{children}</View>
        </PanelSheet.Body>
      </PanelSheet.Content>
    </PanelSheet>
  );
}
