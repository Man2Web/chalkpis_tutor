import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Ask = {
  title: string;
  body?: string;
  action: string;
  destructive?: boolean;
  /** with a text box: resolves to its text (or null when cancelled) */
  input?: { label: string; placeholder?: string; maxLength?: number };
  resolve: (v: string | null) => void;
};
let open: (a: Ask) => void = () => undefined;

/** Confirm before an action that cannot be undone. Resolves true / false. */
export const confirmDialog = (o: Omit<Ask, 'resolve' | 'input'>) =>
  new Promise<boolean>((resolve) => open({ ...o, resolve: (v) => resolve(v !== null) }));
/** Ask for a short text (e.g. a block reason). Resolves the text, or null when cancelled. */
export const promptDialog = (o: Omit<Ask, 'resolve'> & { input: NonNullable<Ask['input']> }) =>
  new Promise<string | null>((resolve) => open({ ...o, resolve }));

export function DialogHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    open = (a) => {
      setText('');
      setAsk(a);
    };
  }, []);
  const done = (v: string | null) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <AlertDialog open={!!ask} onOpenChange={(o) => !o && done(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
          {ask?.body ? <AlertDialogDescription>{ask.body}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {ask?.input ? (
          <div className="grid gap-2">
            <Label htmlFor="ask-input">{ask.input.label}</Label>
            <Textarea
              id="ask-input"
              rows={3}
              autoFocus
              value={text}
              maxLength={ask.input.maxLength}
              placeholder={ask.input.placeholder}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => done(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={ask?.destructive ? 'destructive' : 'default'}
            onClick={() => done(ask?.input ? text.trim() : '')}
          >
            {ask?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
