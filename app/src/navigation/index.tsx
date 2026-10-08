import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components';
import { LanguageScreen } from '../features/auth/LanguageScreen';
import { OtpScreen } from '../features/auth/OtpScreen';
import { PhoneLoginScreen } from '../features/auth/PhoneLoginScreen';
import { useSession } from '../features/auth/session';
import { MoreScreen } from '../features/more/MoreScreen';
import { BatchScreen } from '../features/onboarding/BatchScreen';
import { ProfileScreen } from '../features/onboarding/ProfileScreen';
import { StudentsScreen } from '../features/onboarding/StudentsScreen';
import { colors, type } from '../theme';
import type { AuthStackParams, OnboardingStackParams } from './types';

const Auth = createNativeStackNavigator<AuthStackParams>();
const Onboarding = createNativeStackNavigator<OnboardingStackParams>();
const Tabs = createBottomTabNavigator();

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

// Tab content for these arrives with their features (students, attendance, fees, dashboard).
function Soon({ title }: { title: string }) {
  return (
    <Screen>
      <Text style={type.title}>{title}</Text>
    </Screen>
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
        tabBarStyle: { minHeight: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name as keyof typeof ICONS]} size={size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="Home" options={{ title: t('tabs.home') }}>
        {() => <Soon title={t('tabs.home')} />}
      </Tabs.Screen>
      <Tabs.Screen name="Students" options={{ title: t('tabs.students') }}>
        {() => <Soon title={t('tabs.students')} />}
      </Tabs.Screen>
      <Tabs.Screen name="Attendance" options={{ title: t('tabs.attendance') }}>
        {() => <Soon title={t('tabs.attendance')} />}
      </Tabs.Screen>
      <Tabs.Screen name="Fees" options={{ title: t('tabs.fees') }}>
        {() => <Soon title={t('tabs.fees')} />}
      </Tabs.Screen>
      <Tabs.Screen name="More" component={MoreScreen} options={{ title: t('tabs.more') }} />
    </Tabs.Navigator>
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
        <MainTabs />
      )}
    </NavigationContainer>
  );
}
