import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';

export const newId = () => randomUUID();

/** An opaque secret for the client (refresh token): 256 random bits, URL-safe. Only its hash is stored. */
export const newSecretToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A 6-digit login code, uniformly random (no modulo bias). */
export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** The stored form of a login code: keyed with a server secret and tied to the phone, so a database leak cannot be brute-forced offline. */
export const hashOtp = (pepper: string, phone: string, code: string) =>
  createHmac('sha256', pepper).update(`${phone}:${code}`).digest('hex');

/** A number that has had a free trial, as kept in used_trials: keyed and one-way, never the number itself. */
export const hashTrialPhone = (pepper: string, phone: string) =>
  createHmac('sha256', pepper).update(`trial:${phone}`).digest('hex');
