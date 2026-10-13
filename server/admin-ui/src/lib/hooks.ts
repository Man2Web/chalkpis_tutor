import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Loads `url` and reloads when it changes. Only the newest request may draw (a slow older answer is dropped), and the
 * previous data stays on screen while the next answer is on its way. `null` url = do not load.
 */
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>('GET', url);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(e as Error);
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => {
    void load();
  }, [load]);
  // live refresh: pages reload when the shell broadcasts a tick
  useEffect(() => {
    const on = () => void load();
    window.addEventListener('adm:refresh', on);
    return () => window.removeEventListener('adm:refresh', on);
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** A value kept in localStorage (per browser). */
export function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s == null ? initial : (JSON.parse(s) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  }, [key, v]);
  return [v, setV] as const;
}

/** Waits `ms` after the last change before passing the value on (search boxes). */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** The page in the address bar after "#/", e.g. "#/centres?filter=at-risk" -> { parts: ["centres"], query }. */
export function useHashRoute() {
  const read = () => {
    const [path, qs = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
    return {
      parts: path.split('/').filter(Boolean).map(decodeURIComponent),
      query: Object.fromEntries(new URLSearchParams(qs)),
      key: window.location.hash,
    };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (path: string) => {
  window.location.hash = `#/${path}`;
};
