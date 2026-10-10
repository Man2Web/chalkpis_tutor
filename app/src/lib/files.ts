import { Platform } from 'react-native';
import { File } from 'expo-file-system';

/** Reads a picked file as text on every platform. */
export async function readText(uri: string): Promise<string> {
  if (Platform.OS === 'web') return (await fetch(uri)).text();
  return new File(uri).text();
}

/** Reads a picked file as bytes on every platform. */
export async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  return new File(uri).bytes();
}
