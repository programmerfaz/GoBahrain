import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFonts } from 'expo-font'
import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Animated, StyleSheet, View, Platform } from 'react-native'
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
import CartScreen from './src/screens/CartScreen'
import BahrainGuideDetailScreen from './src/screens/BahrainGuideDetailScreen'
import EventDetailScreen from './src/screens/EventDetailScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import AccountBlockedScreen from './src/screens/AccountBlockedScreen'
import BottomControlBar from './src/components/BottomControlBar'
import BottomTabBarIcon from './src/components/BottomTabBarIcon'
import KhalidChatScreen from './src/screens/KhalidChatScreen'
import { CartProvider } from './src/context/CartContext'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { UserPreferencesProvider, useUserPreferences } from './src/context/UserPreferencesContext'
import { DoorTransitionProvider } from './src/context/DoorTransitionContext'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { SavedPlacesProvider } from './src/context/SavedPlacesContext'
import AuthScreen from './src/screens/AuthScreen'
import { BRAND_WORDMARK_FONT, FONT_POPPINS_SEMIBOLD } from './src/constants/brandFont'
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
const ExploreStack = createNativeStackNavigator()

function ExploreStackNavigator() {
  return (
    <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
      <ExploreStack.Screen name="ExploreMain" component={ExploreScreen} />
      <ExploreStack.Screen
        name="BahrainGuideDetail"
        component={BahrainGuideDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <ExploreStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </ExploreStack.Navigator>
  )
}

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
  const { colors, isDark } = useTheme()
  const inactiveTint = isDark ? '#A8A8A8' : '#8E8E8E'
  const createLeaveProfileTabListener = (targetRouteName) => ({ navigation }) => ({
    tabPress: (e) => {
      const rootState = navigation.getState()
      const activeRoute = rootState.routes[rootState.index]
      if (activeRoute?.name !== 'Profile') return
      e.preventDefault()
      navigation.navigate(targetRouteName)
    },
  })

  return (
    <View style={styles.tabsShell}>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size, focused }) => (
          <BottomTabBarIcon routeName={route.name} color={color} size={size} focused={focused} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: inactiveTint,
        tabBarStyle: {
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: FONT_POPPINS_SEMIBOLD,
          letterSpacing: Platform.OS === 'ios' ? 0.12 : 0,
        },
      })}
      tabBar={(props) => <BottomControlBar {...props} />}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const rootState = navigation.getState()
            const activeRoute = rootState.routes[rootState.index]
            if (activeRoute?.name === 'Profile') {
              e.preventDefault()
              navigation.navigate('Home')
              return
            }
            if (activeRoute?.name !== 'Home') return
            e.preventDefault()
            navigation.navigate('Home', {
              scrollToTop: true,
              timestamp: Date.now(),
            })
          },
        })}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreStackNavigator}
        listeners={createLeaveProfileTabListener('Explore')}
      />
      <Tab.Screen
        name="AI Plan"
        component={AIPlanScreen}
        options={{ tabBarLabel: 'Plan' }}
        listeners={createLeaveProfileTabListener('AI Plan')}
      />
      <Tab.Screen
        name="Khalid"
        component={KhalidChatScreen}
        options={{ tabBarLabel: 'Khalid' }}
        listeners={createLeaveProfileTabListener('Khalid')}
      />
      <Tab.Screen
        name="Community"
        component={CommunityStackNavigator}
        listeners={createLeaveProfileTabListener('Community')}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
      />
    </Tab.Navigator>
    </View>
  )
}

function AppContent() {
  const { isAuthenticated, authLoading, isOwnerProfileDisabled, profileLoading } = useAuth()
  const { isOnboardingComplete, isLoading } = useUserPreferences()
  const { isDark } = useTheme()
  const [isStartupSplashVisible, setIsStartupSplashVisible] = useState(true)
  const startupSplashOpacity = useRef(new Animated.Value(1)).current
  const isClosingStartupSplash = useRef(false)

  const closeStartupSplash = useCallback(() => {
    if (isClosingStartupSplash.current) return
    isClosingStartupSplash.current = true
    Animated.timing(startupSplashOpacity, {
      toValue: 0,
      duration: 420,
      useNativeDriver: true,
    }).start(() => {
      setIsStartupSplashVisible(false)
    })
  }, [startupSplashOpacity])

  useEffect(() => {
    const timer = setTimeout(closeStartupSplash, 12000)
    return () => clearTimeout(timer)
  }, [closeStartupSplash])

  let content = null

  if (authLoading || isLoading || (isAuthenticated && profileLoading)) {
    content = <BrandSplashScreen />
  } else if (!isAuthenticated) {
    content = <AuthScreen />
  } else if (isOwnerProfileDisabled) {
    content = <AccountBlockedScreen />
  } else if (!isOnboardingComplete) {
    content = <OnboardingScreen />
  } else {
    content = (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={TabsNavigator} />
          <Stack.Screen name="AR" component={ARScreen} options={({ route }) => ({
            presentation: 'fullScreenModal',
            animation: route.params?.fromExplore ? 'none' : 'default',
          })} />
          <Stack.Screen name="Cart" component={CartScreen} options={{ presentation: 'modal', headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    )
  }

  return (
    <View style={styles.appStage}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {content}
      {isStartupSplashVisible && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: startupSplashOpacity }]}>
          <BrandSplashScreen onComplete={closeStartupSplash} />
        </Animated.View>
      )}
    </View>
  )
}

export default function App() {
  useFonts({
    [BRAND_WORDMARK_FONT]: require('./assets/fonts/RusticRoadway.otf'),
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  })

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HideSplashAfterLayout>
        <SafeAreaProvider>
          <ThemeProvider>
            <CartProvider>
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
            </CartProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </HideSplashAfterLayout>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  tabsShell: { flex: 1 },
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
