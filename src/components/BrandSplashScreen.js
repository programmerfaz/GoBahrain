import React, { useCallback, useEffect, useRef } from 'react'
import { View, Image, StyleSheet } from 'react-native'
import { useTheme } from '../context/ThemeContext'

/** Replaces former splash video end — overlay can dismiss without waiting for 12s failsafe */
const SPLASH_HOLD_MS = 2000

const LOGO = require('../../assets/siyahalogo nobg.png')

export default function BrandSplashScreen({ onComplete }) {
  const { colors } = useTheme()
  const didCompleteRef = useRef(false)

  const completeSplash = useCallback(() => {
    if (didCompleteRef.current) return
    didCompleteRef.current = true
    onComplete?.()
  }, [onComplete])

  useEffect(() => {
    if (!onComplete) return undefined
    const t = setTimeout(completeSplash, SPLASH_HOLD_MS)
    return () => clearTimeout(t)
  }, [onComplete, completeSplash])

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} accessibilityLabel="SiyahaBH loading">
      <View style={styles.center}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="SiyahaBH"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  logo: {
    width: '88%',
    maxWidth: 360,
    aspectRatio: 1080 / 476,
  },
})
