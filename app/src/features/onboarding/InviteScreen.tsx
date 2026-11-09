import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, ConfirmSheet, toast } from '../../components';
import { ApiError } from '../../api/client';
import { reportError } from '../../lib/analytics';
import type { CentreInvite } from '../../lib/types';
import type { OnboardingStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { refreshProfile, useSession } from '../auth/session';
import { acceptInvite, declineInvite } from '../staff/api';
import { SetupLayout } from './SetupLayout';

/** Why joining did not work, as a key under `invite.errors.*`. */
export function inviteErrorKey(e: unknown): 'gone' | 'planExpired' | 'full' | 'generic' {
  if (!(e instanceof ApiError)) return 'generic';
  if (e.status === 404) return 'gone';
  if (e.code === 'plan_expired') return 'planExpired';
  if (e.code === 'staff_limit') return 'full';
  return 'generic';
}

/**
 * Someone a centre invited as a helper, who belongs to no centre yet (decision 174): "Join Kiran Karate Academy?" with
 * Join and No thanks for each invite, and a way to set up a centre of their own instead. Nothing ties them to a centre
 * until they tap Join; then the app opens on that centre.
 */
export function InviteScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Invite'>) {
  const { t } = useTranslation();
  const invites = useSession((s) => s.profile?.invites ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<CentreInvite | null>(null);

  const reload = async () => {
    await refreshProfile();
    // nothing left to answer: on to setting up a centre of their own
    if (!useSession.getState().profile?.invites?.length) navigation.replace('Profile');
  };

  const join = async (inv: CentreInvite) => {
    setBusy(inv.instituteId);
    try {
      await acceptInvite(inv.instituteId);
      toast(t('invite.joined', { centre: inv.centreName }), 'success');
      await refreshProfile(); // now in the centre: the app itself opens
    } catch (e) {
      const key = inviteErrorKey(e);
      if (key === 'generic') reportError(e);
      toast(t(key === 'generic' ? 'common.error' : `invite.errors.${key}`), 'error');
      if (key === 'gone') await reload().catch(reportError);
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    if (!declining) return;
    setBusy(declining.instituteId);
    try {
      await declineInvite(declining.instituteId);
      setDeclining(null);
      await reload();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const one = invites.length === 1 ? invites[0] : undefined;
  return (
    <SetupLayout
      boardTitle={t('invite.boardTitle')}
      title={one ? t('invite.title', { centre: one.centreName }) : t('invite.titleMany')}
      subtitle={t('invite.subtitle')}
    >
      {invites.map((inv) => (
        <Card key={inv.instituteId} style={{ gap: spacing.md, marginBottom: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={type.title3} numberOfLines={2} accessibilityRole="header">
              {inv.centreName}
            </Text>
            <Text style={type.footnote}>{t('invite.from', { owner: inv.ownerName })}</Text>
          </View>
          <Button
            title={t('invite.join')}
            onPress={() => void join(inv)}
            loading={busy === inv.instituteId && !declining}
            disabled={!!busy}
          />
          <Button
            variant="outline"
            title={t('invite.decline')}
            onPress={() => setDeclining(inv)}
            disabled={!!busy}
          />
        </Card>
      ))}
      <Text style={[type.footnote, { marginTop: spacing.md, textAlign: 'center' }]}>
        {t('invite.ownCentreHint')}
      </Text>
      <Button
        variant="ghost"
        title={t('invite.ownCentre')}
        onPress={() => navigation.navigate('Profile')}
        disabled={!!busy}
      />

      <ConfirmSheet
        visible={!!declining}
        onClose={() => setDeclining(null)}
        title={t('invite.declineTitle', { centre: declining?.centreName ?? '' })}
        message={t('invite.declineText')}
        confirmLabel={t('invite.decline')}
        destructive
        loading={!!busy}
        onConfirm={() => void decline()}
      />
    </SetupLayout>
  );
}
