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
  const tabBarHeight =
    Platform.OS === 'ios'
      ? TAB_BAR_HEIGHT_IOS
      : TAB_BAR_HEIGHT_ANDROID + insets.bottom;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size, focused }) => {
          if (route.name === 'AI Plan') {
            return <AIPlanTabIcon color={color} size={size} focused={focused} />;
          }
          const iconMap = {
            Home: 'home',
            Explore: 'compass',
            Community: 'people',
            Profile: 'person-circle-outline',
          };
          return (
            <Ionicons
              name={iconMap[route.name]}
              size={size}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: '#FF6B35',
        tabBarInactiveTintColor: '#6c757d',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: tabBarHeight,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          paddingBottom: Platform.OS === 'android' ? insets.bottom : 12,
          paddingTop: 8,
          overflow: 'visible',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        tabBarShowLabel: true,
        headerShown: false,
      })}
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
