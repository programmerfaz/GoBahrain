import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'

const SIDE = 44

/**
 * Same safe-area + title row pattern as Home: solid background, no blur,
 * primary title (20 / 800), optional subtitle, balanced 44×44 side slots.
 */
export default function PageHeadingBar({
  title,
  subtitle,
  backgroundColor,
  leftSlot,
  rightSlot,
}) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const bg = backgroundColor ?? colors.background

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 4,
          paddingBottom: subtitle ? 8 : 0,
          backgroundColor: bg,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.sideStart}>{leftSlot ?? <View style={styles.sideSpacer} />}</View>
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.primary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.sideEnd}>{rightSlot ?? <View style={styles.sideSpacer} />}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 44,
  },
  sideStart: {
    minWidth: SIDE,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideEnd: {
    minWidth: SIDE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sideSpacer: {
    width: SIDE,
    height: SIDE,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    width: '100%',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.1,
    textAlign: 'center',
    width: '100%',
  },
})
