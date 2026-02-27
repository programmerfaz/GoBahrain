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
import { UserPreferencesProvider, useUserPreferences } from './src/context/UserPreferencesContext';

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
  const { isOnboardingComplete, isLoading } = useUserPreferences();

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#C8102E" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!isOnboardingComplete) {
    return <OnboardingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} />
      <Stack.Screen name="AR" component={ARScreen} options={{ presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <UserPreferencesProvider>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
          <NavigationContainer>
            <AppContent />
          </NavigationContainer>
          <StatusBar style="dark" />
        </SafeAreaView>
      </UserPreferencesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: 'rgba(203,213,225,0.8)',
  },
});
