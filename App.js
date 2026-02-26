import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import AIPlanScreen from './src/screens/AIPlanScreen';
import CommunitiesScreen from './src/screens/CommunitiesScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ARScreen from './src/screens/ARScreen';
import BottomControlBar from './src/components/BottomControlBar';

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

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={TabsNavigator} />
            <Stack.Screen name="AR" component={ARScreen} options={{ presentation: 'fullScreenModal' }} />
          </Stack.Navigator>
          <StatusBar style="dark" />
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
