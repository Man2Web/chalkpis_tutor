import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Row, SearchField, Section, toast } from '../../components';
import { useRefreshData, useStudents } from '../../data/hooks';
import { ApiError } from '../../api/client';
import { reportError } from '../../lib/analytics';
import { useCategory } from '../../lib/category';
import { formatINR } from '../../lib/money';
import type { Student } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useIsStaff } from '../auth/session';
import { linkSibling, unlinkSibling, useFamily } from './api';
import { linkCandidates, siblingsOf } from './family';

/**
 * A child's brothers and sisters (decision 155): each one with what they owe, the family's total, and ways to add a
 * new one, link one already here, or unlink this child. One parent link opens all of them. Owners only.
 */
export function FamilySection({ student }: { student: Student }) {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const staff = useIsStaff();
  const students = useStudents();
  const refresh = useRefreshData();
  const linked = !!student.familyId;
  const family = useFamily(student.id, linked && !staff);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [unlinking, setUnlinking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (staff) return null;

  const siblings = siblingsOf(students.data ?? [], student);
  const owes = (id: string) => family.data?.members.find((m) => m.id === id)?.outstanding ?? 0;
  const line = (x: Student) =>
    [x.class && ct('levelValue', { n: x.class }), x.status === 'inactive' && t('students.inactive')]
      .filter(Boolean)
      .join(' · ');

  const fail = (e: unknown) => {
    reportError(e);
    toast(
      t(e instanceof ApiError && e.code === 'family_too_big' ? 'family.tooBig' : 'common.error'),
      'error',
    );
  };
  const link = async (other: Student) => {
    setBusy(true);
    try {
      await linkSibling(student.id, other.id);
      await refresh();
      setPicking(false);
      setQuery('');
      toast(t('family.linked', { name: other.name }), 'success');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setBusy(true);
    try {
      await unlinkSibling(student.id);
      await refresh();
      setUnlinking(false);
      toast(t('family.unlinked'), 'success');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const candidates = picking ? linkCandidates(students.data ?? [], student, query) : [];

  return (
    <>
      <Section
        title={t('family.title')}
        footer={siblings.length ? t('family.footer') : t('family.footerNone')}
      >
        {siblings.map((x) => {
          const due = owes(x.id);
          return (
            <Row
              key={x.id}
              icon="person"
              iconColor={colors.indigo}
              title={x.name}
              subtitle={line(x) || undefined}
              value={family.data ? (due ? formatINR(due) : t('students.allPaid')) : undefined}
              onPress={() => nav.push('StudentProfile', { id: x.id })}
            />
          );
        })}
        {siblings.length && family.data?.outstanding ? (
          <Row
            icon="wallet"
            iconColor={colors.warningFill}
            title={t('family.totalDue')}
            value={formatINR(family.data.outstanding)}
          />
        ) : null}
        <Row
          icon="person-add"
          iconColor={colors.successFill}
          title={t('family.add')}
          onPress={() => nav.navigate('StudentForm', { siblingOf: student.id })}
        />
        <Row
          icon="link"
          iconColor={colors.infoFill}
          title={t('family.linkExisting')}
          onPress={() => setPicking(true)}
        />
        {siblings.length ? (
          <Row
            icon="unlink"
            iconColor={colors.gray}
            title={t('family.unlink', { name: student.name })}
            destructive
            onPress={() => setUnlinking(true)}
          />
        ) : null}
      </Section>

      <BottomSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t('family.pickTitle', { name: student.name })}
      >
        <SearchField value={query} onChangeText={setQuery} placeholder={t('family.search')} />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {candidates.length === 0 ? (
            <Text style={[type.caption, { padding: spacing.md }]}>{t('family.noneFound')}</Text>
          ) : (
            <Section>
              {candidates.map((x) => (
                <Row
                  key={x.id}
                  title={x.name}
                  subtitle={
                    [line(x), x.parentPhone === student.parentPhone && t('family.sameNumber')]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  onPress={busy ? undefined : () => void link(x)}
                />
              ))}
            </Section>
          )}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={unlinking}
        onClose={() => setUnlinking(false)}
        title={t('family.unlinkTitle', { name: student.name })}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={type.body}>{t('family.unlinkText', { name: student.name })}</Text>
          <Button
            variant="danger"
            title={t('family.unlinkConfirm')}
            loading={busy}
            onPress={() => void unlink()}
          />
          <Button
            variant="secondary"
            title={t('common.cancel')}
            onPress={() => setUnlinking(false)}
          />
        </View>
      </BottomSheet>
    </>
  );
}
