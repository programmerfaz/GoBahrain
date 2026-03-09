import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import AIPlanScreen from './src/screens/AIPlanScreen';
import CommunitiesScreen from './src/screens/CommunitiesScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ARScreen from './src/screens/ARScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import BottomControlBar from './src/components/BottomControlBar';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { UserPreferencesProvider, useUserPreferences } from './src/context/UserPreferencesContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SavedPlacesProvider } from './src/context/SavedPlacesContext';
import AuthScreen from './src/screens/AuthScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <BottomControlBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="AI Plan" component={AIPlanScreen} />
      <Tab.Screen name="Community" component={CommunitiesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { isAuthenticated, authLoading } = useAuth();
  const { isOnboardingComplete, isLoading } = useUserPreferences();
  const { isDark, colors } = useTheme();

  if (authLoading || isLoading) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading…</Text>
        </View>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AuthScreen />
      </>
    );
  }

  if (!isOnboardingComplete) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OnboardingScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabsNavigator} />
        <Stack.Screen name="AR" component={ARScreen} options={{ presentation: 'fullScreenModal' }} />
      </Stack.Navigator>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <SavedPlacesProvider>
            <UserPreferencesProvider>
              <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <NavigationContainer>
                  <AppContent />
                </NavigationContainer>
              </SafeAreaView>
            </UserPreferencesProvider>
          </SavedPlacesProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
});
