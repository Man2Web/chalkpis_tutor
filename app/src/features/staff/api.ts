import { api, ApiError } from '../../api/client';
import { normalizeIndianPhone } from '../../lib/phone';

export interface StaffMember {
  id: string;
  phone: string;
  name: string;
  addedAt: string;
  batchIds: string[];
}

export type StaffErrorKey = 'alreadyMember' | 'staffLimit' | 'planExpired' | 'invalid' | 'generic';

/** The server's short reason, as a translation key under `staff.errors.*`. */
export function staffErrorKey(e: unknown): StaffErrorKey {
  if (!(e instanceof ApiError)) return 'generic';
  switch (e.code) {
    case 'already_member':
      return 'alreadyMember';
    case 'staff_limit':
      return 'staffLimit';
    case 'plan_expired':
      return 'planExpired';
    case 'bad_request':
    case 'unknown_batch':
      return 'invalid';
    default:
      return 'generic';
  }
}

/** Why a new helper's details cannot be sent yet (null = fine). */
export function staffFormError(name: string, phone: string): 'invalid' | null {
  return name.trim().length >= 2 && normalizeIndianPhone(phone) ? null : 'invalid';
}

export async function addStaff(a: { name: string; phone: string; batchIds: string[] }) {
  await api('POST', '/staff', { name: a.name.trim(), phone: a.phone.trim(), batchIds: a.batchIds });
}

export async function setStaffBatches(userId: string, batchIds: string[]) {
  await api('PUT', `/staff/${userId}/batches`, { batchIds });
}

export async function removeStaff(userId: string) {
  await api('DELETE', `/staff/${userId}`);
}
