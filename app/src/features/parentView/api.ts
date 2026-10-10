import { api } from '../../api/client';

export interface CreatedLink {
  url: string;
  expiresAt: string; // ISO
}

export interface LinkStatus {
  active: number;
  latestExpiresAt: string | null;
}

/** Makes a new private link and (by default) has the server send it to the parent through the WhatsApp API. */
export async function createParentLink(
  studentId: string,
  days: number,
  sendWhatsApp = true,
): Promise<CreatedLink & { sent: boolean }> {
  const r = await api<{ url: string; expiresAt: string; sent?: boolean }>(
    'POST',
    `/students/${studentId}/parent-link`,
    { days, sendWhatsApp },
  );
  return { url: r.url, expiresAt: r.expiresAt, sent: !!r.sent };
}

export async function revokeParentLinks(studentId: string): Promise<number> {
  return (await api<{ revoked: number }>('DELETE', `/students/${studentId}/parent-link`)).revoked;
}

export async function getParentLinkStatus(studentId: string): Promise<LinkStatus> {
  return api<LinkStatus>('GET', `/students/${studentId}/parent-link`);
}
