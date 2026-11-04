import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '../../components';
import { readText } from '../../lib/onceFlag';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { shouldAsk } from './ownerDetails';
import { laterKey } from './OwnerDetailsScreen';

type Nav = NativeStackNavigationProp<MainStackParams>;

/** True for an owner whose basic details (decision 156) are not in yet. */
const useDetailsMissing = () =>
  useSession((s) => s.profile?.role === 'owner' && s.profile.detailsDone === false);

/** On Home until an older centre's owner has filled in their details; it cannot be hidden. */
export function OwnerDetailsCard() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  if (!useDetailsMissing()) return null;
  return (
    <Card style={{ gap: spacing.sm, backgroundColor: colors.infoSoft, borderColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="person-circle-outline" size={22} color={colors.text} />
        <Text style={[type.heading, { flex: 1 }]}>{t('ownerDetails.cardTitle')}</Text>
      </View>
      <Text style={[type.footnote, { color: colors.text }]}>{t('ownerDetails.cardText')}</Text>
      <Button
        title={t('ownerDetails.cardAction')}
        onPress={() => nav.navigate('OwnerDetails', { from: 'card' })}
      />
    </Card>
  );
}

let askedThisLaunch = false;

/**
 * Mount in the main tabs: opens the request once per launch for an owner whose details are missing, unless they put it
 * off ("Later") in the last few days.
 */
export function useAskOwnerDetails() {
  const nav = useNavigation<Nav>();
  const uid = useSession((s) => s.uid);
  const role = useSession((s) => s.profile?.role);
  const detailsDone = useSession((s) => s.profile?.detailsDone);
  useEffect(() => {
    if (askedThisLaunch || !uid || role !== 'owner' || detailsDone !== false) return;
    let live = true;
    void readText(laterKey(uid)).then((v) => {
      const until = v ? Number(v) : null;
      if (!live || askedThisLaunch) return;
      if (
        !shouldAsk({
          role,
          detailsDone,
          laterUntil: Number.isFinite(until) ? until : null,
          now: Date.now(),
        })
      )
        return;
      askedThisLaunch = true;
      nav.navigate('OwnerDetails', { from: 'prompt' });
    });
    return () => {
      live = false;
    };
  }, [nav, uid, role, detailsDone]);
}
