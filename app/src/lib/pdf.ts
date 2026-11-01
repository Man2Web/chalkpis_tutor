import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Turns HTML into a PDF and opens the share sheet. In the browser it opens the print dialog for this document only
 * (expo-print would print the whole screen there); "Save as PDF" is one of the dialog's printers.
 */
export async function sharePdfHtml(html: string, dialogTitle: string) {
  if (Platform.OS === 'web') {
    const frame = document.createElement('iframe');
    frame.title = dialogTitle;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    await new Promise<void>((loaded) => {
      frame.onload = () => loaded();
      frame.srcdoc = html;
      document.body.appendChild(frame);
    });
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // the dialog may stay open; the frame goes once it surely has closed
    setTimeout(() => frame.remove(), 60_000);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: 'com.adobe.pdf',
    });
  }
}
