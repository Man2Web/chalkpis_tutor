import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Logo } from '../../components';
import { spacing } from '../../theme';
import { BOARD, BoardDate, BoardLedge, BoardSurface, OnBoard, WelcomeBoard } from './board';

/**
 * Signing in or setting up on a laptop or desktop: the board on the left (what Chalkpis does, or with `board`
 * something else written on it, such as the sign-up steps), the form centred on white paper on the right. Each step
 * keeps the board and changes only the form.
 */
export function AuthSplit({ children, board }: { children: ReactNode; board?: ReactNode }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" />
      <View style={{ width: '46%', maxWidth: 680, backgroundColor: BOARD.slate }}>
        <OnBoard.Provider value>
          <BoardSurface style={{ flex: 1 }}>
            <View style={{ flex: 1, padding: 56, paddingBottom: 48, gap: spacing.xl }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <Logo height={32} variant="full" color={BOARD.chalk} markColor={BOARD.chalk} />
                <BoardDate />
              </View>
              <View style={{ flex: 1, justifyContent: 'center', maxWidth: 520 }}>
                {board ?? <WelcomeBoard big kinds />}
              </View>
            </View>
          </BoardSurface>
          <BoardLedge />
        </OnBoard.Provider>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
        }}
      >
        <View style={{ width: '100%', maxWidth: 420 }}>{children}</View>
      </ScrollView>
    </View>
  );
}
