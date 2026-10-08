/** Receipt prefix: 2-6 letters/digits, stored upper-case. Returns the cleaned prefix or null. */
export function cleanPrefix(input: string): string | null {
  const p = input.trim().toUpperCase();
  return /^[A-Z0-9]{2,6}$/.test(p) ? p : null;
}

/** The word the owner must type before deleting the account (same in every language, so it is easy to type). */
export const DELETE_WORD = 'DELETE';
export const canDelete = (typed: string) => typed.trim().toUpperCase() === DELETE_WORD;
