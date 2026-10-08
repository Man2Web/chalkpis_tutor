// Browser-preview shim for '@react-native-firebase/storage': adds putFile (native-only API).
import { uploadBytes, type StorageReference } from 'firebase/storage';

export * from 'firebase/storage';

export async function putFile(ref: StorageReference, uri: string) {
  const blob = await (await fetch(uri)).blob();
  return uploadBytes(ref, blob);
}
