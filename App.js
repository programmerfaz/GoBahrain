import { StatusBar } from 'expo-status-bar';
import { Platform, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import AIPlanScreen from './src/screens/AIPlanScreen';
import CommunitiesScreen from './src/screens/CommunitiesScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const TAB_BAR_HEIGHT_IOS = 70;
const TAB_BAR_HEIGHT_ANDROID = 60;
const CENTER_CIRCLE_SIZE = 58;
const CENTER_ICON_OFFSET_TOP = -18;

function AIPlanTabIcon({ color, size, focused }) {
  const isActive = focused;
  return (
    <View
      style={[
        styles.centerCircle,
        isActive ? styles.centerCircleActive : styles.centerCircleInactive,
      ]}
    >
      <Ionicons
        name="sparkles"
        size={size + 8}
        color={isActive ? '#FFFFFF' : '#6c757d'}
      />
    </View>
  );
}

function TabsNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: { height: 0, display: 'none' },
        tabBarShowLabel: false,
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="AI Plan" component={AIPlanScreen} />
      <Tab.Screen
        name="Community"
        component={CommunitiesScreen}
        options={{ tabBarLabel: 'Community' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  centerCircle: {
    width: CENTER_CIRCLE_SIZE,
    height: CENTER_CIRCLE_SIZE,
    borderRadius: CENTER_CIRCLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: CENTER_ICON_OFFSET_TOP,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  centerCircleInactive: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  centerCircleActive: {
    backgroundColor: '#FF6B35',
    borderWidth: 1,
    borderColor: '#FF6B35',
    shadowColor: '#FF6B35',
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <TabsNavigator />
        <StatusBar style="dark" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
