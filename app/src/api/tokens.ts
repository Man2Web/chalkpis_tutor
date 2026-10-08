import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS = 'chalkpis.access';
const REFRESH = 'chalkpis.refresh';

/** Sign-in tokens. On a phone they live in the secure keychain/keystore; in the browser preview, in localStorage. */
const store = {
  get: async (k: string): Promise<string | null> => {
    try {
      return Platform.OS === 'web'
        ? (globalThis.localStorage?.getItem(k) ?? null)
        : await SecureStore.getItemAsync(k);
    } catch {
      return null;
    }
  },
  set: async (k: string, v: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(k, v);
    else await SecureStore.setItemAsync(k, v);
  },
  del: async (k: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(k);
    else await SecureStore.deleteItemAsync(k).catch(() => undefined);
  },
};

let access: string | null = null;

export const tokens = {
  /** The access token (15 minutes); kept in memory, restored from storage on first use. */
  async getAccess() {
    return (access ??= await store.get(ACCESS));
  },
  /** Synchronous peek for places that cannot await (picture headers). May be null before the first call. */
  peekAccess: () => access,
  getRefresh: () => store.get(REFRESH),
  async save(a: string, r: string) {
    access = a;
    await Promise.all([store.set(ACCESS, a), store.set(REFRESH, r)]);
  },
  async clear() {
    access = null;
    await Promise.all([store.del(ACCESS), store.del(REFRESH)]);
  },
};
