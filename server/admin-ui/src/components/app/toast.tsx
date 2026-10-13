import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

type T = { id: number; text: string; ok: boolean };
let push: (t: T) => void = () => undefined;
let seq = 0;

/** A short message at the bottom of the screen. (A tiny own toast: the admin CSP allows no injected styles.) */
export function toast(text: string, ok = true) {
  push({ id: ++seq, text, ok });
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => {
      setItems((s) => [...s.slice(-2), t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 2800);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2"
        >
          {t.ok ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : (
            <AlertCircle className="size-4 text-destructive" />
          )}
          {t.text}
        </div>
      ))}
    </div>
  );
}
