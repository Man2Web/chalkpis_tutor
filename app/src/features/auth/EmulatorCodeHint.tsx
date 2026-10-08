import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Button, Card } from '../../components';
import { colors, spacing, type } from '../../theme';

const ENABLED = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR === 'true';
const HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? '10.0.2.2';
const URL = `http://${HOST}:9099/emulator/v1/projects/demo-tutordesk/verificationCodes`;

/** Newest code for a phone from the Auth emulator's response, or null. */
export function latestCode(
  body: { verificationCodes?: { phoneNumber: string; code: string }[] },
  phone: string,
) {
  const mine = (body.verificationCodes ?? []).filter((v) => v.phoneNumber === phone);
  return mine.length ? mine[mine.length - 1].code : null;
}

/**
 * Local testing only: the Auth emulator sends no SMS, so show the code on screen.
 * Renders nothing unless EXPO_PUBLIC_FIREBASE_EMULATOR=true (never in a real build).
 */
export function EmulatorCodeHint({
  phone,
  onUse,
}: {
  phone: string;
  onUse: (code: string) => void;
}) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!ENABLED) return;
    let alive = true;
    const poll = async () => {
      try {
        const body = await (await fetch(URL)).json();
        if (alive) setCode(latestCode(body, phone));
      } catch {
        // emulator not reachable; stay silent
      }
    };
    void poll();
    const id = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phone]);

  if (!ENABLED) return null;
  return (
    <Card
      style={{ backgroundColor: colors.warningSoft, gap: spacing.xs, marginBottom: spacing.md }}
    >
      <Text style={type.label}>Test mode (no SMS is sent)</Text>
      {code ? (
        <>
          <Text style={type.title}>{code}</Text>
          <Button variant="secondary" title="Use this code" onPress={() => onUse(code)} />
        </>
      ) : (
        <Text style={type.caption}>Waiting for the emulator… is `npm run emulators` running?</Text>
      )}
    </Card>
  );
}
