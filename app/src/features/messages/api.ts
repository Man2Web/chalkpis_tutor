import { api } from '../../api/client';
import { DEFAULT_SETTINGS, normalizeSettings, type NotifySettings } from './settings';

/** Saves part of the settings: the current choices are read, changed, and written back whole. The server re-checks every value. */
export async function saveNotifySettings(_instituteId: string, patch: Partial<NotifySettings>) {
  let current: NotifySettings = DEFAULT_SETTINGS;
  try {
    current = normalizeSettings(
      await api<Record<string, unknown>>('GET', '/settings/notifications'),
    );
  } catch {
    // fall back to the safe defaults; the write below still goes through the server's checks
  }
  await api('PUT', '/settings/notifications', normalizeSettings({ ...current, ...patch }));
}
