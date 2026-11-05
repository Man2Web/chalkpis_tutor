import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo } from '../../components';
import { haptic } from '../../lib/haptics';
import type { AuthStackParams } from '../../navigation/types';
import { colors, font, spacing, type } from '../../theme';
import { useDesktop } from '../../desktop/useDesktop';
import { AuthSplit } from './AuthSplit';
import {
  BOARD,
  BoardDate,
  BoardLedge,
  BoardSurface,
  SIGNIN_COLUMN,
  SIGNIN_INNER,
  WelcomeBoard,
} from './board';
import { CountryChip, PrimaryButton, SIGNIN } from './signin';

/**
 * First screen, for new and returning teachers alike (tuition, coaching, abacus, karate, dance, yoga, sports): the
 * board says what Chalkpis does, the paper under it is the way in.
 * Signing up and signing in are the same step: a WhatsApp code to the tutor's mobile number.
 */
export function LanguageScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParams, 'Language'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // the ticked lines only show when the board has room for them (they are illustration, never needed to sign in)
  const [boardH, setBoardH] = useState(0);
  const lines = boardH >= 400 ? 3 : boardH >= 360 ? 2 : boardH >= 320 ? 1 : 0;
  const desktop = useDesktop();

  // the way in, sign-up and sign-in alike: the paper under the board on a phone, beside the board on a laptop
  const signIn = (
    <View style={[SIGNIN_INNER, { gap: spacing.md }]}>
      {desktop ? (
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 30,
            lineHeight: 36,
            ...font('800'),
            color: colors.text,
            letterSpacing: -0.5,
            marginBottom: spacing.sm,
          }}
        >
          {t('auth.loginOrSignup')}
        </Text>
      ) : (
        <Text
          accessibilityRole="header"
          style={{ fontSize: 15, ...font('700'), color: SIGNIN.ink }}
        >
          {t('auth.loginOrSignup')}
        </Text>
      )}
      {/* looks like the number field; the real one opens on the next screen with the keyboard up */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth.enterMobile')}
        onPress={() => {
          haptic.tap();
          navigation.navigate('Phone');
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 60,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: SIGNIN.line,
          backgroundColor: pressed ? SIGNIN.field : '#FFFFFF',
        })}
      >
        <CountryChip />
        <View
          style={{ width: 1.5, height: 26, backgroundColor: SIGNIN.line, marginHorizontal: 12 }}
        />
        <Text style={{ flex: 1, fontSize: 17, ...font('500'), color: '#9CA3AF' }}>
          {t('auth.enterMobile')}
        </Text>
      </Pressable>
      <PrimaryButton
        title={t('auth.continueWhatsApp')}
        icon="logo-whatsapp"
        onPress={() => navigation.navigate('Phone')}
      />
      <Text style={[type.footnote, { textAlign: 'center' }]}>{t('auth.newHere')}</Text>
      <Text style={[type.caption2, { textAlign: 'center', marginTop: spacing.sm }]}>
        {t('legal.agreePrefix')}{' '}
        <Text
          style={{ color: colors.text, ...font('600') }}
          onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
          accessibilityRole="link"
        >
          {t('legal.terms')}
        </Text>{' '}
        {t('legal.and')}{' '}
        <Text
          style={{ color: colors.text, ...font('600') }}
          onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
          accessibilityRole="link"
        >
          {t('legal.privacy')}
        </Text>
        .
      </Text>
    </View>
  );

  if (desktop) return <AuthSplit>{signIn}</AuthSplit>;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="light" />
      {/* slate behind the top, so pulling the page down past its start (iPhone) shows more board, not white */}
      {Platform.OS === 'ios' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '50%',
            backgroundColor: BOARD.slate,
          }}
        />
      ) : null}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* The board: logo and date, the promise, and what the app does, ticked in chalk */}
        <BoardSurface style={{ flex: 1, minHeight: 250 }}>
          <View
            testID="welcome-board"
            onLayout={(e) => setBoardH(e.nativeEvent.layout.height)}
            style={[
              SIGNIN_COLUMN,
              {
                flex: 1,
                paddingTop: Math.max(insets.top, spacing.lg) + spacing.md,
                paddingHorizontal: spacing.lg + 4,
                paddingBottom: spacing.xl + spacing.sm,
              },
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <Logo height={26} variant="full" color={BOARD.chalk} markColor={BOARD.chalk} />
              <BoardDate />
            </View>
            <View style={{ flex: 1, justifyContent: 'center', paddingTop: spacing.md }}>
              <WelcomeBoard lines={lines} />
            </View>
          </View>
        </BoardSurface>
        <BoardLedge />

        {/* The paper: the way in, sign-up and sign-in alike */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: spacing.xl,
            paddingHorizontal: spacing.lg + 4,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          {signIn}
        </View>
      </ScrollView>
    </View>
  );
}
