import { api } from '../../api/client';

export interface CreatedLink {
  url: string;
  expiresAt: string; // ISO
}

export interface LinkStatus {
  active: number;
  latestExpiresAt: string | null;
}

export async function createParentLink(studentId: string, days: number): Promise<CreatedLink> {
  const r = await api<{ url: string; expiresAt: string }>(
    'POST',
    `/students/${studentId}/parent-link`,
    { days },
  );
  return { url: r.url, expiresAt: r.expiresAt };
}

export async function revokeParentLinks(studentId: string): Promise<number> {
  return (await api<{ revoked: number }>('DELETE', `/students/${studentId}/parent-link`)).revoked;
}

export async function getParentLinkStatus(studentId: string): Promise<LinkStatus> {
  return api<LinkStatus>('GET', `/students/${studentId}/parent-link`);
}
