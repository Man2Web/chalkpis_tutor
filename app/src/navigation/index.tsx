import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LanguageScreen } from '../features/auth/LanguageScreen';
import { OtpScreen } from '../features/auth/OtpScreen';
import { PhoneLoginScreen } from '../features/auth/PhoneLoginScreen';
import { useSession } from '../features/auth/session';
import { MoreScreen } from '../features/more/MoreScreen';
import { BatchScreen } from '../features/onboarding/BatchScreen';
import { ProfileScreen } from '../features/onboarding/ProfileScreen';
import { StudentsScreen } from '../features/onboarding/StudentsScreen';
import { colors } from '../theme';
import { CollectFeeScreen } from '../features/fees/CollectFeeScreen';
import { FeeLedgerScreen } from '../features/fees/FeeLedgerScreen';
import { FeePlanScreen } from '../features/fees/FeePlanScreen';
import { FeesOverviewScreen } from '../features/fees/FeesOverviewScreen';
import { ReceiptScreen } from '../features/fees/ReceiptScreen';
import { ReminderScreen } from '../features/fees/ReminderScreen';
import { HomeScreen } from '../features/dashboard/HomeScreen';
import { ReportsScreen } from '../features/reports/ReportsScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
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
  Attendance: 'checkmark-done-outline',
  Fees: 'cash-outline',
  More: 'menu-outline',
} as const;

function MainTabs() {
  const { t } = useTranslation();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          minHeight: 66,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: 'rgba(249,249,251,0.97)',
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(60,60,67,0.18)',
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const outline = ICONS[route.name as keyof typeof ICONS];
          const name = (focused ? outline.replace('-outline', '') : outline) as typeof outline;
          return <Ionicons name={name} size={size + 2} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: t('tabs.home') }} />
      <Tabs.Screen
        name="Students"
        component={StudentsListScreen}
        options={{ title: t('tabs.students') }}
      />
      <Tabs.Screen
        name="Attendance"
        component={AttendanceHomeScreen}
        options={{ title: t('tabs.attendance') }}
      />
      <Tabs.Screen name="Fees" component={FeesOverviewScreen} options={{ title: t('tabs.fees') }} />
      <Tabs.Screen name="More" component={MoreScreen} options={{ title: t('tabs.more') }} />
    </Tabs.Navigator>
  );
}

function MainStack() {
  const { t } = useTranslation();
  return (
    <Main.Navigator>
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
      <Main.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: t('reports.title') }}
      />
      <Main.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('settings.title') }}
      />
      <Main.Screen
        name="AttendanceReport"
        component={AttendanceReportScreen}
        options={{ title: t('attendance.reports') }}
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
