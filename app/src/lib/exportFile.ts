import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/** Saves text as a file and hands it to the share sheet. In the browser preview it downloads the file instead. */
export async function shareTextFile(filename: string, text: string, mimeType = 'text/csv') {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  // A leading BOM makes Excel read Hindi/UTF-8 text correctly.
  file.write(`﻿${text}`);
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Saves bytes (for example an .xlsx) as a file and hands it to the share sheet; downloads it in the browser preview. */
export async function shareBinaryFile(filename: string, bytes: Uint8Array, mimeType = XLSX_MIME) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(bytes);
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
