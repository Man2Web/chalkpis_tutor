import { api, ApiError, type ApiOptions } from '../../api/client';

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
  opts?: ApiOptions,
): Promise<CreatedLink & { sent: boolean }> {
  const r = await api<{ url?: string; expiresAt: string; sent?: boolean }>(
    'POST',
    `/students/${studentId}/parent-link`,
    { days, sendWhatsApp },
    opts,
  );
  // A retry the server answered from its record of the first try carries no link (the server never keeps it). If the
  // link was sent by WhatsApp that is fine; to share it ourselves we need it, so this counts as a definite failure and
  // the next tap (a new key) makes a fresh link.
  if (!r.url && !r.sent) throw new ApiError(409, 'link_not_kept');
  return { url: r.url ?? '', expiresAt: r.expiresAt, sent: !!r.sent };
}

export async function revokeParentLinks(studentId: string): Promise<number> {
  return (await api<{ revoked: number }>('DELETE', `/students/${studentId}/parent-link`)).revoked;
}

export async function getParentLinkStatus(studentId: string): Promise<LinkStatus> {
  return api<LinkStatus>('GET', `/students/${studentId}/parent-link`);
}
