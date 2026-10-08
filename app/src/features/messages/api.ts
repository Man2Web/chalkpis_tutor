import { doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { db } from '../../lib/firebase';
import type { NotifySettings } from './settings';

/** Saves part of the settings (merged, so other choices stay). The server re-checks every value it uses. */
export function saveNotifySettings(instituteId: string, patch: Partial<NotifySettings>) {
  return setDoc(
    doc(db, 'institutes', instituteId, 'settings', 'notifications'),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
