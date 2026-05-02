import React, { useCallback, useEffect, useRef } from 'react'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StyleSheet, View, Platform } from 'react-native'
import { WEB_APP_MAX_CONTENT_WIDTH } from './src/constants/webLayout'
import HomeScreen from './src/screens/HomeScreen'
import ExploreScreen from './src/screens/ExploreScreen'
import AIPlanScreen from './src/screens/aiPlan/AIPlanScreenMain'
import CommunitiesScreen from './src/screens/CommunitiesScreen'
import CommunityPostDetailScreen from './src/screens/CommunityPostDetailScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import MyReviewsScreen from './src/screens/MyReviewsScreen'
import SavedPlansScreen from './src/screens/SavedPlansScreen'
import ARScreen from './src/screens/ARScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import BottomControlBar from './src/components/BottomControlBar'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { UserPreferencesProvider, useUserPreferences } from './src/context/UserPreferencesContext'
import { DoorTransitionProvider } from './src/context/DoorTransitionContext'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { SavedPlacesProvider } from './src/context/SavedPlacesContext'
import AuthScreen from './src/screens/AuthScreen'
import { BRAND_WORDMARK_FONT } from './src/constants/brandFont'
import BrandSplashScreen from './src/components/BrandSplashScreen'

/** Hide native splash only after the first real layout so RN content is already painted (avoids blank frame). */
function HideSplashAfterLayout({ children }) {
  const hiddenRef = useRef(false)
  const hide = useCallback(() => {
    if (hiddenRef.current) return
    hiddenRef.current = true
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(hide, 2800)
    return () => clearTimeout(t)
  }, [hide])

  return (
    <View style={styles.appFill} onLayout={hide}>
      {children}
    </View>
  )
}

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()
const ProfileStack = createNativeStackNavigator()
const CommunityStack = createNativeStackNavigator()

function CommunityStackNavigator() {
  return (
    <CommunityStack.Navigator
      screenOptions={{
        headerShown: false,
        headerBackTitleVisible: false,
        headerBackTitle: '',
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <CommunityStack.Screen
        name="CommunityMain"
        component={CommunitiesScreen}
        options={{
          title: '',
        }}
      />
      <CommunityStack.Screen
        name="CommunityPostDetail"
        component={CommunityPostDetailScreen}
        options={{
          headerShown: true,
          title: '',
          headerBackTitleVisible: false,
          headerBackTitle: '',
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
      <ProfileStack.Screen
        name="SavedPlans"
        component={SavedPlansScreen}
        options={{
          headerShown: true,
          title: 'Saved plans',
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

function AppContent() {
  const { isAuthenticated, authLoading } = useAuth()
  const { isOnboardingComplete, isLoading } = useUserPreferences()
  const { isDark } = useTheme()

  if (authLoading || isLoading) {
    return (
      <View style={styles.appStage}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <BrandSplashScreen />
      </View>
    )
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.appStage}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AuthScreen />
      </View>
    )
  }

  if (!isOnboardingComplete) {
    return (
      <View style={styles.appStage}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OnboardingScreen />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <View style={styles.appStage}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={TabsNavigator} />
          <Stack.Screen name="AR" component={ARScreen} options={({ route }) => ({
            presentation: 'fullScreenModal',
            animation: route.params?.fromExplore ? 'none' : 'default',
          })} />
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  )
}

export default function App() {
  useFonts({
    [BRAND_WORDMARK_FONT]: require('./assets/fonts/RusticRoadway.otf'),
  })

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HideSplashAfterLayout>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <SavedPlacesProvider>
                <UserPreferencesProvider>
                  <DoorTransitionProvider>
                    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                      <View style={Platform.OS === 'web' ? styles.webAppColumn : styles.appFill}>
                        <AppContent />
                      </View>
                    </SafeAreaView>
                  </DoorTransitionProvider>
                </UserPreferencesProvider>
              </SavedPlacesProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </HideSplashAfterLayout>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appFill: { flex: 1 },
  /** Fills parent so splash / auth / onboarding are not height-zero inside NavigationContainer */
  appStage: { flex: 1 },
  webAppColumn: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_APP_MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
})
