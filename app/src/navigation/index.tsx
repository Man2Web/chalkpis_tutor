import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LanguageScreen } from '../features/auth/LanguageScreen';
import { OtpScreen } from '../features/auth/OtpScreen';
import { PhoneLoginScreen } from '../features/auth/PhoneLoginScreen';
import { useIsStaff, useSession } from '../features/auth/session';
import { StaffScreen } from '../features/staff/StaffScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { BatchScreen } from '../features/onboarding/BatchScreen';
import { ProfileScreen } from '../features/onboarding/ProfileScreen';
import { StudentsScreen } from '../features/onboarding/StudentsScreen';
import { haptic } from '../lib/haptics';
import { colors } from '../theme';
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
      <Auth.Screen name="Language" component={LanguageScreen} />
      <Auth.Screen name="Phone" component={PhoneLoginScreen} />
      <Auth.Screen name="Otp" component={OtpScreen} />
      <Auth.Screen
        name="Legal"
        component={LegalScreen as never}
        options={{ headerShown: true, title: '', ...stackHeader }}
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
  More: 'person-circle-outline',
} as const;

/** iOS-style navigation bar on both platforms: plain background, no shadow, blue back arrow, centred title on iOS. */
const stackHeader = {
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.primary,
  headerTitleStyle: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  headerBackButtonDisplayMode: 'minimal' as const,
  contentStyle: { backgroundColor: colors.bg },
  // Android gets the same push-from-the-right movement as iOS; iOS keeps its native swipe-back.
  animation: Platform.OS === 'android' ? ('ios_from_right' as const) : ('default' as const),
};

function MainTabs() {
  const { t } = useTranslation();
  const staff = useIsStaff();
  return (
    <Tabs.Navigator
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray,
        tabBarStyle: {
          backgroundColor: 'rgba(249,249,249,0.96)',
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(0,0,0,0.2)',
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', letterSpacing: 0.1 },
        tabBarIcon: ({ color, focused }) => {
          const outline = ICONS[route.name as keyof typeof ICONS];
          const name = (focused ? outline.replace('-outline', '') : outline) as typeof outline;
          return <Ionicons name={name} size={26} color={color} />;
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
      <Tabs.Screen name="More" component={MoreScreen} options={{ title: t('tabs.profile') }} />
    </Tabs.Navigator>
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
        options={{ title: t('batches.title') }}
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
        options={({ route }) => ({
          title: route.params.doc === 'privacy' ? t('legal.privacy') : t('legal.terms'),
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
        name="PaymentSettings"
        component={PaymentSettingsScreen}
        options={{ title: t('settings.paymentsTitle') }}
      />
      <Main.Screen
        name="Billing"
        component={BillingScreen}
        options={{ title: t('billing.title') }}
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
        options={{ title: t('messages.logTitle') }}
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

export function RootNavigator() {
  const status = useSession((s) => s.status);
  const hasInstitute = useSession((s) => !!s.profile?.instituteId);

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
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
