import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StackActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Logo, UpgradePrompt } from '../components';
import { useAddGuard } from '../data/guards';
import { useInstitute, useStudents } from '../data/hooks';
import { useCategory } from '../lib/category';
import { formatIndianPhone } from '../lib/phone';
import { navigationRef } from '../navigation/ref';
import { colors, font, radius, shadow, spacing, type } from '../theme';
import { useUpdates } from '../features/announcements/updates';
import { useIsStaff, useSession } from '../features/auth/session';
import { filterStudents } from '../features/students/logic';
import { SECTIONS, sectionOf, sectionsFor, type SectionItem } from './nav';
import { card, SIDEBAR_WIDTH, type HoverState } from './parts';

const go = (name: string, params?: object) =>
  (navigationRef.navigate as unknown as (n: string, p?: object) => void)(name, params);

/** Opens a sidebar place: back to the tabs first, so the stack never grows from moving around the sidebar. */
export function openSection(item: SectionItem) {
  if (!navigationRef.isReady()) return;
  if ((navigationRef.getRootState()?.index ?? 0) > 0)
    navigationRef.dispatch(StackActions.popToTop());
  if (item.tab) go('Tabs', { screen: item.tab });
  else if (item.route) go(item.route);
}
const openKey = (key: SectionItem['key']) => {
  const item = SECTIONS.find((s) => s.key === key);
  if (item) openSection(item);
};

/** The screen on top of the main stack and the focused tab, kept current as the person moves around. */
function useMainRoute() {
  const read = () => {
    if (!navigationRef.isReady()) return { top: undefined, tab: undefined };
    const root = navigationRef.getRootState();
    const tabs = root?.routes.find((r) => r.name === 'Tabs')?.state;
    return {
      top: root?.routes[root.index]?.name,
      tab: tabs && typeof tabs.index === 'number' ? tabs.routes[tabs.index]?.name : undefined,
    };
  };
  const [where, setWhere] = useState(read);
  useEffect(() => {
    const update = () => setWhere(read());
    const off = navigationRef.addListener('state', update);
    // the first state is not announced: look again until the navigator is up
    const timer = setInterval(() => {
      if (navigationRef.isReady()) {
        update();
        clearInterval(timer);
      }
    }, 100);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);
  return where;
}

/**
 * The browser version on a laptop or desktop: a sidebar with every place in the app, a top bar with student search
 * and the everyday actions, and the page in the space that is left. `enabled` is false on a phone-sized window,
 * where the page is shown alone; the frame stays mounted either way so resizing never resets where the person is.
 */
export function DesktopShell({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const staff = useIsStaff();
  const where = useMainRoute();
  const active = sectionOf(where.top, where.tab ?? (staff ? 'Attendance' : 'Home'));
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {enabled ? <Sidebar active={active} staff={staff} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {enabled ? <TopBar staff={staff} /> : null}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </View>
  );
}

function Sidebar({ active, staff }: { active: SectionItem['key']; staff: boolean }) {
  const { t } = useTranslation();
  const institute = useInstitute();
  const name = useSession((s) => s.profile?.name) ?? '';
  const items = sectionsFor(staff);
  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        backgroundColor: colors.shell,
        borderRightWidth: 1,
        borderRightColor: colors.border,
      }}
    >
      <Pressable
        onPress={() => openKey(staff ? 'attendance' : 'home')}
        accessibilityRole="link"
        accessibilityLabel="ChalkPis Tutor"
        style={{ height: 64, justifyContent: 'center', paddingHorizontal: 22 }}
      >
        <Logo height={24} />
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.lg }}>
        {(['run', 'grow', 'manage'] as const).map((group) => {
          const list = items.filter((i) => i.group === group);
          if (!list.length) return null;
          return (
            <View key={group} style={{ gap: 2 }} accessibilityRole="menu">
              <Text style={[type.sectionHeader, { paddingHorizontal: 10, marginBottom: 4 }]}>
                {t(`desktop.groups.${group}`)}
              </Text>
              {list.map((item) => (
                <NavItem
                  key={item.key}
                  icon={item.icon}
                  label={t(item.label)}
                  active={active === item.key}
                  onPress={() => openSection(item)}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={() => openKey('account')}
        accessibilityRole="link"
        style={(s: HoverState) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          margin: spacing.md,
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: s.hovered ? colors.fill : 'transparent',
        })}
      >
        <Avatar
          name={institute.data?.name || name || '?'}
          uri={institute.data?.logoUrl}
          size={36}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.label, { fontSize: 13 }]} numberOfLines={1}>
            {institute.data?.name ?? ''}
          </Text>
          <Text style={type.caption2} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: SectionItem['icon'];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const filled = icon.replace('-outline', '') as SectionItem['icon'];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      style={(s: HoverState) => [
        {
          height: 38,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: 10,
          borderRadius: radius.md,
          backgroundColor: active ? colors.surface : s.hovered ? colors.fill : 'transparent',
        },
        active ? [shadow.control, { borderWidth: 1, borderColor: colors.border }] : null,
      ]}
    >
      <Ionicons
        name={active ? filled : icon}
        size={18}
        color={active ? colors.text : colors.textMuted}
      />
      <Text
        style={[
          type.subhead,
          active ? font('600') : font('500'),
          { flex: 1, color: active ? colors.text : colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TopBar({ staff }: { staff: boolean }) {
  const { t } = useTranslation();
  const guard = useAddGuard();
  // under this window width the two quick actions lose their labels so the bar fits
  const compact = useWindowDimensions().width < 1200;
  const addStudent = () => {
    if (guard.check('student')) go('StudentForm');
  };
  return (
    <View
      style={{
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.xl,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
        // the search results open over the page below
        zIndex: 10,
      }}
    >
      {staff ? null : <StudentSearch />}
      <View style={{ flex: 1 }} />
      {staff ? null : (
        <>
          {compact ? (
            <>
              <IconAction
                icon="checkmark-circle-outline"
                label={t('desktop.markAttendance')}
                onPress={() => openKey('attendance')}
              />
              <IconAction
                icon="wallet-outline"
                label={t('desktop.collectFee')}
                onPress={() => openKey('fees')}
              />
            </>
          ) : (
            <>
              <Button
                size="small"
                variant="ghost"
                title={t('desktop.markAttendance')}
                icon={<Ionicons name="checkmark-circle-outline" size={16} color={colors.text} />}
                onPress={() => openKey('attendance')}
              />
              <Button
                size="small"
                variant="ghost"
                title={t('desktop.collectFee')}
                icon={<Ionicons name="wallet-outline" size={16} color={colors.text} />}
                onPress={() => openKey('fees')}
              />
            </>
          )}
          <Button
            size="small"
            title={t('desktop.addStudent')}
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={addStudent}
          />
        </>
      )}
      <Bell />
      <UpgradePrompt
        visible={!!guard.blocked}
        kind={guard.blocked?.kind ?? 'student'}
        limit={guard.blocked?.limit}
        onClose={guard.close}
      />
    </View>
  );
}

const iconButton = (s: HoverState) => ({
  width: 40,
  height: 40,
  borderRadius: radius.md,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: s.hovered ? colors.fill : 'transparent',
});

/** A quick action as an icon alone, for a laptop too narrow for its label (the label is still read out). */
function IconAction({
  icon,
  label,
  onPress,
}: {
  icon: SectionItem['icon'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={iconButton}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

function Bell() {
  const { t } = useTranslation();
  const unread = useUpdates().data?.unread ?? 0;
  return (
    <Pressable
      onPress={() => go('Updates')}
      accessibilityRole="button"
      accessibilityLabel={unread ? t('updates.bellUnread', { count: unread }) : t('updates.title')}
      style={iconButton}
    >
      <Ionicons
        name={unread ? 'notifications' : 'notifications-outline'}
        size={20}
        color={colors.text}
      />
      {unread ? (
        <View
          style={{
            position: 'absolute',
            top: 5,
            right: 4,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 8,
            backgroundColor: colors.dangerFill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={[type.caption2, font('600'), { color: '#FFFFFF', fontSize: 10, lineHeight: 12 }]}
          >
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Find a student from anywhere: name or phone, results under the box, Enter opens the first. "/" jumps here. */
function StudentSearch() {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const students = useStudents();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<TextInput>(null);
  const results = useMemo(
    () => (q.trim() ? filterStudents(students.data ?? [], { search: q }).slice(0, 8) : []),
    [q, students.data],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (id: string) => {
    setQ('');
    setOpen(false);
    input.current?.blur();
    go('StudentProfile', { id });
  };

  return (
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 180, maxWidth: 380, zIndex: 20 }}>
      <View
        style={{
          height: 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.fill,
        }}
      >
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          ref={input}
          value={q}
          onChangeText={(v) => {
            setQ(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // a click on a result lands before the list closes
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onSubmitEditing={() => results[0] && pick(results[0].id)}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Escape') {
              setQ('');
              input.current?.blur();
            }
          }}
          placeholder={t('desktop.search')}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={t('desktop.search')}
          style={[type.subhead, { flex: 1, height: 40, outlineStyle: 'none' } as object]}
        />
        {q ? null : (
          <Text
            style={[
              type.caption2,
              {
                paddingHorizontal: 6,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: colors.input,
                color: colors.textMuted,
              },
            ]}
          >
            /
          </Text>
        )}
      </View>
      {open && q.trim() ? (
        <View
          style={[
            card,
            shadow.raised,
            {
              position: 'absolute',
              top: 46,
              left: 0,
              right: 0,
              borderRadius: radius.md,
              paddingVertical: spacing.xs,
            },
          ]}
        >
          {results.length ? (
            results.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => pick(s.id)}
                accessibilityRole="link"
                style={(st: HoverState) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  backgroundColor: st.hovered ? colors.fill : 'transparent',
                })}
              >
                <Avatar name={s.name} uri={s.photoUrl} size={30} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.subhead, font('500')]} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={type.caption2} numberOfLines={1}>
                    {[
                      s.class && ct('levelValue', { n: s.class }),
                      formatIndianPhone(s.parentPhone || s.phone || ''),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {s.status === 'inactive' ? (
                  <Text style={type.caption2}>{t('students.inactive')}</Text>
                ) : null}
              </Pressable>
            ))
          ) : (
            <Text style={[type.footnote, { padding: spacing.md }]}>{t('desktop.noStudent')}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
