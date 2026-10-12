import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LanguageScreen } from '../features/auth/LanguageScreen';
import { OtpScreen } from '../features/auth/OtpScreen';
import { PhoneLoginScreen } from '../features/auth/PhoneLoginScreen';
import { useIsStaff, useSession } from '../features/auth/session';
import { StaffScreen } from '../features/staff/StaffScreen';
import { AccountScreen } from '../features/account/AccountScreen';
import { AddPhoneScreen } from '../features/account/AddPhoneScreen';
import { BatchScreen } from '../features/onboarding/BatchScreen';
import { ProfileScreen } from '../features/onboarding/ProfileScreen';
import { StudentsScreen } from '../features/onboarding/StudentsScreen';
import { haptic } from '../lib/haptics';
import { colors, font, spacing, type } from '../theme';
import { CollectFeeScreen } from '../features/fees/CollectFeeScreen';
import { FeeLedgerScreen } from '../features/fees/FeeLedgerScreen';
import { FeePlanScreen } from '../features/fees/FeePlanScreen';
import { FeesOverviewScreen } from '../features/fees/FeesOverviewScreen';
import { ReceiptScreen } from '../features/fees/ReceiptScreen';
import { ReminderScreen } from '../features/fees/ReminderScreen';
import { AdvancePaymentScreen } from '../features/fees/AdvancePaymentScreen';
import { PosterScreen } from '../features/poster/PosterScreen';
import { LegalScreen } from '../features/legal/LegalScreen';
import { BillingScreen } from '../features/billing/BillingScreen';
import { MessageLogScreen } from '../features/messages/MessageLogScreen';
import { NotificationSettingsScreen } from '../features/messages/NotificationSettingsScreen';
import { HomeScreen } from '../features/dashboard/HomeScreen';
import { ReportsScreen } from '../features/reports/ReportsScreen';
import {
  EditProfileScreen,
  PaymentSettingsScreen,
  SettingsScreen,
} from '../features/settings/SettingsScreen';
import { AttendanceHomeScreen } from '../features/attendance/AttendanceHomeScreen';
import { AttendanceReportScreen } from '../features/attendance/AttendanceReportScreen';
import { MarkAttendanceScreen } from '../features/attendance/MarkAttendanceScreen';
import { BatchDetailScreen } from '../features/batches/BatchDetailScreen';
import { BatchFormScreen } from '../features/batches/BatchFormScreen';
import { BatchesScreen } from '../features/batches/BatchesScreen';
import { ImportScreen } from '../features/students/ImportScreen';
import { StudentFormScreen } from '../features/students/StudentFormScreen';
import { StudentProfileScreen } from '../features/students/StudentProfileScreen';
import { StudentsListScreen } from '../features/students/StudentsListScreen';
import type { AuthStackParams, MainStackParams, OnboardingStackParams } from './types';

const Auth = createNativeStackNavigator<AuthStackParams>();
const Onboarding = createNativeStackNavigator<OnboardingStackParams>();
const Tabs = createBottomTabNavigator();
const Main = createNativeStackNavigator<MainStackParams>();

function AuthStack() {
  return (
    <Auth.Navigator screenOptions={{ headerShown: false }}>
      {/* titles name the page in the browser tab and for screen readers; no header is shown */}
      <Auth.Screen
        name="Language"
        component={LanguageScreen}
        options={{ title: 'Welcome · Chalkpis' }}
      />
      <Auth.Screen
        name="Phone"
        component={PhoneLoginScreen}
        options={{ title: 'Sign in · Chalkpis' }}
      />
      <Auth.Screen name="Otp" component={OtpScreen} options={{ title: 'Enter code · Chalkpis' }} />
      <Auth.Screen
        name="Legal"
        component={LegalScreen as never}
        options={({ route }) => ({
          ...stackHeader,
          headerShown: true,
          headerTitle: '',
          title:
            (route.params as { doc?: string } | undefined)?.doc === 'privacy'
              ? 'Privacy Policy'
              : 'Terms and Conditions',
        })}
      />
    </Auth.Navigator>
  );
}

function OnboardingStack({ resume }: { resume: boolean }) {
  return (
    <Onboarding.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={resume ? 'Batch' : 'Profile'}
    >
      <Onboarding.Screen name="Profile" component={ProfileScreen} />
      <Onboarding.Screen name="Batch" component={BatchScreen} />
      <Onboarding.Screen name="Students" component={StudentsScreen} />
    </Onboarding.Navigator>
  );
}

const ICONS = {
  Home: 'home-outline',
  Students: 'people-outline',
  Attendance: 'checkmark-circle-outline',
  Fees: 'wallet-outline',
  Account: 'person-circle-outline',
} as const;

/** Navigation bar on both platforms: plain white background, no shadow, dark back arrow, centred title on iOS. */
const stackHeader = {
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.primary,
  headerTitleStyle: { fontSize: 16, ...font('600'), color: colors.text },
  headerBackButtonDisplayMode: 'minimal' as const,
  contentStyle: { backgroundColor: colors.bg },
  // Android gets the same push-from-the-right movement as iOS; iOS keeps its native swipe-back.
  animation: Platform.OS === 'android' ? ('ios_from_right' as const) : ('default' as const),
};

function MainTabs() {
  const { t } = useTranslation();
  const staff = useIsStaff();
  // The bar sits above the phone's home indicator / gesture area, with room for an icon and a full label.
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 6);
  const narrow = useWindowDimensions().width < 350;
  return (
    <>
      <Tabs.Navigator
        screenListeners={{ tabPress: () => haptic.select() }}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            // icon (28) + label line (16) + the tab's own padding (10), with breathing room
            height: 64 + bottom,
            paddingTop: 4,
            paddingBottom: bottom,
          },
          tabBarLabel: ({ color, children }) => (
            <Text
              numberOfLines={1}
              // a long label shrinks a little instead of being cut; big system text is capped so it fits the bar
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.25}
              style={{
                // the smallest phones (under 350 pt) get a slightly smaller label so "Attendance" fits
                fontSize: narrow ? 10 : 11,
                // tall enough for Inter, so the bottoms of the letters are not clipped
                lineHeight: 16,
                letterSpacing: -0.1,
                ...font('500'),
                color,
                marginTop: 1,
              }}
            >
              {children}
            </Text>
          ),
          tabBarIcon: ({ color, focused }) => {
            const outline = ICONS[route.name as keyof typeof ICONS];
            const name = (focused ? outline.replace('-outline', '') : outline) as typeof outline;
            return <Ionicons name={name} size={24} color={color} />;
          },
        })}
      >
        {/* A helper (staff) only takes attendance: no home numbers, student list or fees. */}
        {!staff && (
          <Tabs.Screen name="Home" component={HomeScreen} options={{ title: t('tabs.home') }} />
        )}
        {!staff && (
          <Tabs.Screen
            name="Students"
            component={StudentsListScreen}
            options={{ title: t('tabs.students') }}
          />
        )}
        <Tabs.Screen
          name="Attendance"
          component={AttendanceHomeScreen}
          options={{ title: t('tabs.attendance') }}
        />
        {!staff && (
          <Tabs.Screen
            name="Fees"
            component={FeesOverviewScreen}
            options={{ title: t('tabs.fees') }}
          />
        )}
        {/* Profile, settings, tools, plan and help: one place, one tab. */}
        <Tabs.Screen
          name="Account"
          component={AccountScreen}
          options={{ title: t('tabs.account') }}
        />
      </Tabs.Navigator>
    </>
  );
}

function MainStack() {
  const { t } = useTranslation();
  return (
    <Main.Navigator screenOptions={stackHeader}>
      <Main.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Main.Screen
        name="StudentForm"
        component={StudentFormScreen}
        options={{ title: t('students.formTitle') }}
      />
      <Main.Screen
        name="StudentProfile"
        component={StudentProfileScreen}
        options={{ title: t('students.profile') }}
      />
      <Main.Screen
        name="StudentImport"
        component={ImportScreen}
        options={{ title: t('import.title') }}
      />
      <Main.Screen
        name="Batches"
        component={BatchesScreen}
        options={{ title: t('batches.title'), headerTitle: '' }} // the screen shows its own large title
      />
      <Main.Screen
        name="BatchForm"
        component={BatchFormScreen}
        options={{ title: t('batches.formTitle') }}
      />
      <Main.Screen
        name="MarkAttendance"
        component={MarkAttendanceScreen}
        options={{ title: t('attendance.markTitle') }}
      />
      <Main.Screen
        name="FeeLedger"
        component={FeeLedgerScreen}
        options={{ title: t('fees.ledgerTitle') }}
      />
      <Main.Screen
        name="CollectFee"
        component={CollectFeeScreen}
        options={{ title: t('fees.collectTitle') }}
      />
      <Main.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{ title: t('fees.receipt') }}
      />
      <Main.Screen
        name="FeePlan"
        component={FeePlanScreen}
        options={{ title: t('fees.planTitle') }}
      />
      <Main.Screen
        name="Reminder"
        component={ReminderScreen}
        options={{ title: t('fees.remind') }}
      />
      <Main.Screen name="Poster" component={PosterScreen} options={{ title: t('poster.title') }} />
      <Main.Screen
        name="Legal"
        component={LegalScreen}
        // the document shows its own title; the browser tab still gets one
        options={({ route }) => ({
          title: route.params.doc === 'privacy' ? t('legal.privacy') : t('legal.terms'),
          headerTitle: '',
        })}
      />
      <Main.Screen
        name="AdvancePayment"
        component={AdvancePaymentScreen}
        options={{ title: t('fees.advanceTitle') }}
      />
      <Main.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: t('reports.title') }}
      />
      <Main.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('settings.instituteTitle') }}
      />
      <Main.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: t('settings.editProfile') }}
      />
      <Main.Screen
        name="AddPhone"
        component={AddPhoneScreen}
        // the brand step layout has its own back button and title; this one names the page for screen readers
        options={{ title: t('addPhone.title'), headerShown: false }}
      />
      <Main.Screen
        name="PaymentSettings"
        component={PaymentSettingsScreen}
        options={{ title: t('settings.paymentsTitle') }}
      />
      <Main.Screen
        name="Billing"
        component={BillingScreen}
        options={{ title: t('billing.title'), headerTitle: '' }} // the screen shows its own large title
      />
      <Main.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: t('messages.settingsTitle') }}
      />
      <Main.Screen name="Staff" component={StaffScreen} options={{ title: t('staff.title') }} />
      <Main.Screen
        name="MessageLog"
        component={MessageLogScreen}
        options={{ title: t('messages.logTitle'), headerTitle: '' }} // the screen shows its own large title
      />
      <Main.Screen
        name="AttendanceReport"
        component={AttendanceReportScreen}
        options={{ title: t('more.attendanceReport') }}
      />
      <Main.Screen
        name="BatchDetail"
        component={BatchDetailScreen}
        options={{ title: t('batches.detail') }}
      />
    </Main.Navigator>
  );
}

/**
 * While the saved sign-in is being checked. The check retries on its own when there is no network, so after a
 * while say so instead of spinning silently.
 */
function RestoringSession() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, []);
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        backgroundColor: colors.bg,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      {slow ? (
        <Text style={[type.footnote, { textAlign: 'center' }]} accessibilityLiveRegion="polite">
          {t('common.reconnecting')}
        </Text>
      ) : null}
    </View>
  );
}

export function RootNavigator() {
  const status = useSession((s) => s.status);
  const hasInstitute = useSession((s) => !!s.profile?.instituteId);

  if (status === 'loading') return <RestoringSession />;
  return (
    <NavigationContainer>
      {status === 'signedOut' ? (
        <AuthStack />
      ) : status === 'needsOnboarding' ? (
        <OnboardingStack resume={hasInstitute} />
      ) : (
        <MainStack />
      )}
    </NavigationContainer>
  );
}
