import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Platform, Animated } from 'react-native'
import { BottomTabBar } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { aiPlanSheetLink } from '../utils/aiPlanSheetLink'
import { khalidChatLink } from '../utils/khalidChatLink'
import { usePlanMapOrbitActive } from '../screens/aiPlan/planMapOrbitStore'
import { ORBIT_TAB_BAR_PULL_DOWN } from '../screens/aiPlan/constants'
import { useTheme } from '../context/ThemeContext'

const PROFILE_TAB_NAME = 'Profile'

/**
 * Profile stays a tab route for navigation but must not render in the bar (orb opens it).
 * Feeding BottomTabBar a state without Profile fixes flex layout and icon alignment.
 */
const getBarPropsWithoutProfileTab = (tabBarProps, lastVisibleIndexRef) => {
  const { state } = tabBarProps
  const profileIdx = state.routes.findIndex((r) => r.name === PROFILE_TAB_NAME)
  if (profileIdx === -1) return tabBarProps

  const routes = state.routes.filter((r) => r.name !== PROFILE_TAB_NAME)
  const currentName = state.routes[state.index]?.name
  let index
  if (currentName === PROFILE_TAB_NAME) {
    index = Math.min(Math.max(lastVisibleIndexRef.current, 0), routes.length - 1)
  } else {
    index = state.index > profileIdx ? state.index - 1 : state.index
  }

  return {
    ...tabBarProps,
    state: {
      ...state,
      routes,
      index,
    },
  }
}

/**
 * Wraps React Navigation `BottomTabBar`. Orbit map "Ask Khalid" jumps to the `Khalid` tab via params.
 */
export default function BottomControlBar(tabBarProps) {
  const { state, navigation } = tabBarProps
  const lastVisibleTabIndexRef = useRef(0)
  const { isDark } = useTheme()
  const themeStyles = React.useMemo(
    () => ({ wrapper: { backgroundColor: isDark ? '#000000' : 'transparent' } }),
    [isDark],
  )
  const isPlanOrbitDock = usePlanMapOrbitActive()

  useEffect(() => {
    const profileIdx = state.routes.findIndex((r) => r.name === PROFILE_TAB_NAME)
    if (profileIdx === -1) return
    if (state.routes[state.index]?.name === PROFILE_TAB_NAME) return
    let idx = state.index
    if (idx > profileIdx) idx -= 1
    lastVisibleTabIndexRef.current = idx
  }, [state])

  const barPropsForView = useMemo(
    () => getBarPropsWithoutProfileTab(tabBarProps, lastVisibleTabIndexRef),
    [tabBarProps],
  )

  const focusedTabName = state.routes[state.index]?.name
  const orbitTabBarShift =
    isPlanOrbitDock && focusedTabName === 'AI Plan' ? ORBIT_TAB_BAR_PULL_DOWN : 0

  const communityFocusedChild = React.useMemo(() => {
    const route = state.routes[state.index]
    if (route?.name !== 'Community' || route.state == null) return null
    return getFocusedRouteNameFromRoute(route)
  }, [state])

  const hideTabBarForCommunityDetail = communityFocusedChild === 'CommunityPostDetail'
  const hideTabBar = hideTabBarForCommunityDetail

  const [aiPlanSheetAnim, setAiPlanSheetAnim] = useState(null)
  useEffect(() => aiPlanSheetLink.subscribe(setAiPlanSheetAnim), [])

  useEffect(() => {
    const unsub = khalidChatLink.subscribe((payload) => {
      if (!payload || payload.source !== 'orbit') return
      const ts = Number(payload.ts || 0)
      if (!ts) return
      navigation.navigate('Khalid', {
        orbitChat: {
          ts,
          place: payload.place || '',
          summary: payload.summary || '',
          clientId: payload.clientId || '',
        },
      })
    })
    return unsub
  }, [navigation])

  const TabBarRoot = aiPlanSheetAnim ? Animated.View : View
  const tabBarRootStyle = aiPlanSheetAnim
    ? [styles.wrapper, themeStyles.wrapper, { transform: [{ translateY: aiPlanSheetAnim }] }]
    : [styles.wrapper, themeStyles.wrapper]

  return (
    <TabBarRoot style={tabBarRootStyle}>
      <View
        pointerEvents={hideTabBar ? 'none' : 'auto'}
        style={[
          styles.systemTabBarClip,
          orbitTabBarShift ? { transform: [{ translateY: orbitTabBarShift }] } : null,
          hideTabBar ? styles.systemTabBarHidden : null,
        ]}
      >
        <BottomTabBar {...barPropsForView} />
      </View>
    </TabBarRoot>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    ...Platform.select({
      ios: {},
      android: { elevation: 48 },
    }),
  },
  systemTabBarClip: {
    width: '100%',
    overflow: 'visible',
  },
  systemTabBarHidden: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
})
