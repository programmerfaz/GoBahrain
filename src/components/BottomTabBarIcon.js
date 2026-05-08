import React from 'react'
import { View, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const DEFAULT_SIZE = 26

/** Outline when idle, solid when focused — reads cleaner on tab bars (Apple / premium travel apps). */
const ROUTE_ICONS = {
  Home: { on: 'home', off: 'home-outline' },
  Explore: { on: 'compass', off: 'compass-outline' },
  'AI Plan': { on: 'map', off: 'map-outline' },
  Khalid: { on: 'chatbubbles', off: 'chatbubbles-outline' },
  Community: { on: 'people', off: 'people-outline' },
}

/**
 * @param {{ routeName: string, color: string, size?: number, focused: boolean }} props
 */
export default function BottomTabBarIcon({ routeName, color, size, focused }) {
  const pair = ROUTE_ICONS[routeName]
  if (!pair) return null

  const name = focused ? pair.on : pair.off
  const iconSize = typeof size === 'number' ? size : DEFAULT_SIZE

  return (
    <View style={styles.holder}>
      <Ionicons
        name={name}
        size={iconSize}
        color={color}
        style={focused ? styles.iconFocused : styles.iconIdle}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  holder: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 32,
  },
  iconIdle: {
    ...Platform.select({
      ios: { opacity: 1 },
      default: {},
    }),
  },
  iconFocused: {
    ...Platform.select({
      ios: {
        transform: [{ scale: 1.06 }],
        opacity: 1,
      },
      android: { transform: [{ scale: 1.05 }] },
      default: {},
    }),
  },
})
