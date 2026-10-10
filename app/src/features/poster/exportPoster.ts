import type Svg from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/** Renders the poster to a full-size PNG and opens the share sheet (WhatsApp status, Instagram, gallery...). */
export function exportPoster(svg: Svg | null, size: { w: number; h: number }, name: string) {
  return new Promise<void>((resolve, reject) => {
    if (!svg) return reject(new Error('no poster'));
    svg.toDataURL(
      async (b64: string) => {
        try {
          const file = new File(Paths.cache, `${name}.png`);
          file.create({ overwrite: true });
          file.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
          if (await Sharing.isAvailableAsync())
            await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      { width: size.w, height: size.h },
    );
  });
}
