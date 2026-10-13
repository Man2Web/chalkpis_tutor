import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';
const KEY = 'adm-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const stored = (): Mode | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
};

/** Light or dark: what the admin chose, else the computer's setting (followed live). */
export function useTheme() {
  const [mode, setMode] = useState<Mode>(() => stored() ?? (media().matches ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [mode]);
  useEffect(() => {
    const m = media();
    const on = () => {
      if (!stored()) setMode(m.matches ? 'dark' : 'light');
    };
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const toggle = () =>
    setMode((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode */
      }
      return next;
    });
  return { mode, toggle };
}
