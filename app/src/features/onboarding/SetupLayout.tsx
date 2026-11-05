import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../components/KeyboardScroll';
import { useDesktop } from '../../desktop/useDesktop';
import { colors, font, spacing, type } from '../../theme';
import { AuthSplit } from '../auth/AuthSplit';
import { BOARD, BoardHeader, ChalkTick, ChalkUnderline, SIGNIN_INNER } from '../auth/board';

/** The four sign-up steps, in order (decision 156 put the owner's details second). */
export const SETUP_STEPS = ['centre', 'details', 'batch', 'students'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * A sign-up step. On a phone: the board on top with "Step n of 4", the title and a line on why it is asked, and the
 * form on the paper below, kept above the keyboard. On a laptop the board on the left lists the four steps, ticked
 * off as they are done, and the form stands on the right.
 */
export function SetupLayout({
  step,
  title,
  subtitle,
  children,
}: {
  step: SetupStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const n = SETUP_STEPS.indexOf(step) + 1;

  if (desktop)
    return (
      <AuthSplit board={<SetupBoard step={step} />}>
        <Text style={[type.largeTitle, { ...font('800') }]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.callout, { color: colors.textMuted, marginTop: spacing.sm }]}>
            {subtitle}
          </Text>
        ) : null}
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>{children}</View>
      </AuthSplit>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      {/* slate behind the top, so pulling the page down past its start (iPhone) shows more board, not white */}
      {Platform.OS === 'ios' ? <View pointerEvents="none" style={styles.overscroll} /> : null}
      <KeyboardScroll contentContainerStyle={{ flexGrow: 1 }}>
        <BoardHeader
          title={title}
          subtitle={subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : undefined}
          step={[n, SETUP_STEPS.length]}
          topInset={insets.top}
        />
        <View style={[styles.paper, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={[SIGNIN_INNER, { gap: spacing.sm }]}>{children}</View>
        </View>
      </KeyboardScroll>
    </View>
  );
}

/** The laptop board during sign-up: the four steps as a list, done ones ticked, this one underlined in chalk. */
export function SetupBoard({ step }: { step: SetupStep }) {
  const { t } = useTranslation();
  const current = SETUP_STEPS.indexOf(step);
  return (
    <View>
      <Text style={styles.boardTitle} accessibilityRole="header">
        {t('onboarding.board.title')}
      </Text>
      <View style={{ marginTop: 14 }}>
        <ChalkUnderline width={200} delay={150} />
      </View>
      <View style={{ marginTop: 40, gap: 22 }}>
        {SETUP_STEPS.map((s, i) => {
          const done = i < current;
          const now = i === current;
          const label = t(`onboarding.board.${s}`);
          return (
            <View
              key={s}
              accessible
              accessibilityLabel={
                done
                  ? t('onboarding.board.doneLabel', { step: label })
                  : now
                    ? t('onboarding.board.nowLabel', { step: label })
                    : label
              }
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <View style={{ width: 28, alignItems: 'center' }}>
                {done ? (
                  <ChalkTick size={24} delay={300 + i * 200} />
                ) : (
                  <Text style={[styles.num, now && { color: BOARD.yellow }]}>{i + 1}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.item,
                  done && { color: BOARD.chalkDim },
                  !done && !now && { color: BOARD.chalkMuted },
                  now && { color: BOARD.chalk },
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overscroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '50%',
    backgroundColor: BOARD.slate,
  },
  paper: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg + 4,
    paddingTop: spacing.xl,
  },
  subtitle: { fontSize: 15, lineHeight: 22, ...font('500'), color: BOARD.chalkDim },
  boardTitle: {
    color: BOARD.chalk,
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -1,
    ...font('800'),
  },
  num: { fontSize: 22, ...font('800'), color: BOARD.chalkMuted },
  item: { fontSize: 21, lineHeight: 28, ...font('700') },
});
