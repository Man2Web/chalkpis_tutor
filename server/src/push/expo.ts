import type { Pool } from '../db.js';

/** Where a tap on the notification takes the tutor in the app. */
export type PushScreen = 'Home' | 'Attendance' | 'Billing';

export interface PushMessage {
  title: string;
  body: string;
  screen: PushScreen;
}

/** Sends to Expo's push service; a stand-in in tests and locally. */
export interface PushSender {
  send(
    batch: { to: string; title: string; body: string; data: Record<string, string> }[],
  ): Promise<{ to: string; error?: string }[]>;
}

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

/** Expo's free push service: Expo forwards to Apple and Google. Up to 100 messages a request. */
export class ExpoPushSender implements PushSender {
  constructor(private fetchFn: typeof fetch = fetch) {}
  async send(batch: { to: string; title: string; body: string; data: Record<string, string> }[]) {
    const out: { to: string; error?: string }[] = [];
    for (let i = 0; i < batch.length; i += 100) {
      const part = batch
        .slice(i, i + 100)
        .map((m) => ({ ...m, sound: 'default', priority: 'high' }));
      try {
        const res = await this.fetchFn(EXPO_PUSH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(part),
        });
        const body = (await res.json().catch(() => ({}))) as {
          data?: { status?: string; details?: { error?: string } }[];
        };
        part.forEach((m, j) => {
          const t = body.data?.[j];
          out.push({
            to: m.to,
            error: t?.status === 'error' ? (t.details?.error ?? 'error') : undefined,
          });
        });
      } catch {
        part.forEach((m) => out.push({ to: m.to, error: 'network' }));
      }
    }
    return out;
  }
}

export class MockPushSender implements PushSender {
  sent: { to: string; title: string; body: string; data: Record<string, string> }[] = [];
  async send(batch: { to: string; title: string; body: string; data: Record<string, string> }[]) {
    this.sent.push(...batch);
    return batch.map((m) => ({ to: m.to }));
  }
}

/**
 * Sends one notification to every device of the given users, once per `key` (push_log). Tokens Expo reports as gone
 * (the app was uninstalled) are removed. Never throws: a notification is a nicety, not part of the action.
 */
export async function pushToUsers(
  pool: Pool,
  sender: PushSender | null,
  userIds: string[],
  key: string,
  m: PushMessage,
): Promise<number> {
  if (!sender || !userIds.length) return 0;
  try {
    const [r] = (await pool.query('INSERT IGNORE INTO push_log (push_key) VALUES (?)', [
      key.slice(0, 120),
    ])) as unknown as [{ affectedRows: number }];
    if (r.affectedRows !== 1) return 0;
    const [rows] = (await pool.query(
      `SELECT token FROM push_tokens WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
      userIds,
    )) as unknown as [{ token: string }[]];
    if (!rows.length) return 0;
    const results = await sender.send(
      rows.map((t) => ({ to: t.token, title: m.title, body: m.body, data: { screen: m.screen } })),
    );
    const gone = results.filter((x) => x.error === 'DeviceNotRegistered').map((x) => x.to);
    if (gone.length)
      await pool.query(
        `DELETE FROM push_tokens WHERE token IN (${gone.map(() => '?').join(',')})`,
        gone,
      );
    return results.filter((x) => !x.error).length;
  } catch {
    return 0;
  }
}

/** The centre's owner (the person a plan or a parent's payment concerns). */
export async function ownerOf(pool: Pool, instituteId: string): Promise<string[]> {
  const [rows] = (await pool.query('SELECT owner_user_id FROM institutes WHERE id = ?', [
    instituteId,
  ])) as unknown as [{ owner_user_id: string }[]];
  return rows.map((r) => r.owner_user_id);
}
