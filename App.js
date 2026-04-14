import React, { useRef, useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StyleSheet, View, Animated, Easing, Text } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import HomeScreen from './src/screens/HomeScreen'
import ExploreScreen from './src/screens/ExploreScreen'
import AIPlanScreen from './src/screens/AIPlanScreen'
import CommunitiesScreen from './src/screens/CommunitiesScreen'
import CommunityPostDetailScreen from './src/screens/CommunityPostDetailScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import MyReviewsScreen from './src/screens/MyReviewsScreen'
import ARScreen from './src/screens/ARScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import BottomControlBar from './src/components/BottomControlBar'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { UserPreferencesProvider, useUserPreferences } from './src/context/UserPreferencesContext'
import { DoorTransitionProvider } from './src/context/DoorTransitionContext'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { SavedPlacesProvider } from './src/context/SavedPlacesContext'
import AuthScreen from './src/screens/AuthScreen'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()
const ProfileStack = createNativeStackNavigator()
const CommunityStack = createNativeStackNavigator()

function CommunityStackNavigator() {
  return (
    <CommunityStack.Navigator screenOptions={{ headerShown: false }}>
      <CommunityStack.Screen name="CommunityMain" component={CommunitiesScreen} />
      <CommunityStack.Screen
        name="CommunityPostDetail"
        component={CommunityPostDetailScreen}
        options={{
          headerShown: true,
          headerBackTitleVisible: false,
        }}
      />
    </CommunityStack.Navigator>
  )
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen
        name="MyReviews"
        component={MyReviewsScreen}
        options={{
          headerShown: true,
          title: 'My reviews',
        }}
      />
    </ProfileStack.Navigator>
  )
}

function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomControlBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="AI Plan" component={AIPlanScreen} />
      <Tab.Screen name="Community" component={CommunityStackNavigator} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} />
    </Tab.Navigator>
  )
}

function SplashLoader() {
  const { colors, isDark } = useTheme()
  const pulse = useRef(new Animated.Value(0.4)).current
  const logoScale = useRef(new Animated.Value(0.8)).current
  const logoOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, damping: 12, stiffness: 100, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [pulse, logoScale, logoOpacity])

  const bgColors = isDark
    ? ['#0F172A', '#1A1033', '#0F172A']
    : ['#F8FAFC', '#EFF6FF', '#F8FAFC']

  return (
    <View style={styles.loadingWrap}>
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />
      <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center' }}>
        <View style={[styles.loadingLogo, { backgroundColor: `${colors.primary}15` }]}>
          <Ionicons name="compass" size={36} color={colors.primary} />
        </View>
        <Text style={[styles.loadingBrand, { color: colors.primary }]}>Go Bahrain</Text>
        <Animated.View style={{ opacity: pulse, marginTop: 20 }}>
          <View style={[styles.loadingDots]}>
            <View style={[styles.loadingDot, { backgroundColor: colors.primary }]} />
            <View style={[styles.loadingDot, { backgroundColor: colors.primary, opacity: 0.6 }]} />
            <View style={[styles.loadingDot, { backgroundColor: colors.primary, opacity: 0.3 }]} />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

function AppContent() {
  const { isAuthenticated, authLoading } = useAuth()
  const { isOnboardingComplete, isLoading } = useUserPreferences()
  const { isDark } = useTheme()

  if (authLoading || isLoading) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SplashLoader />
      </>
    )
  }

  if (!isAuthenticated) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AuthScreen />
      </>
    )
  }

  if (!isOnboardingComplete) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OnboardingScreen />
      </>
    )
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabsNavigator} />
        <Stack.Screen name="AR" component={ARScreen} options={({ route }) => ({
          presentation: 'fullScreenModal',
          animation: route.params?.fromExplore ? 'none' : 'default',
        })} />
      </Stack.Navigator>
    </>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <SavedPlacesProvider>
              <UserPreferencesProvider>
                <DoorTransitionProvider>
                  <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                    <NavigationContainer>
                      <AppContent />
                    </NavigationContainer>
                  </SafeAreaView>
                </DoorTransitionProvider>
              </UserPreferencesProvider>
            </SavedPlacesProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  loadingBrand: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
