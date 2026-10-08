import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../../lib/firebase';

export interface CreatedLink {
  url: string;
  expiresAt: string; // ISO
}

export interface LinkStatus {
  active: number;
  latestExpiresAt: string | null;
}

export async function createParentLink(studentId: string, days: number): Promise<CreatedLink> {
  const { data } = await httpsCallable<{ studentId: string; days: number }, CreatedLink>(
    functions,
    'createParentLink',
  )({ studentId, days });
  return data;
}

export async function revokeParentLinks(studentId: string): Promise<number> {
  const { data } = await httpsCallable<{ studentId: string }, { revoked: number }>(
    functions,
    'revokeParentLinks',
  )({ studentId });
  return data.revoked;
}

export async function getParentLinkStatus(studentId: string): Promise<LinkStatus> {
  const { data } = await httpsCallable<{ studentId: string }, LinkStatus>(
    functions,
    'parentLinkStatus',
  )({ studentId });
  return data;
}
