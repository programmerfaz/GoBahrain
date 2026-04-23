import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { BRAND_WORDMARK_FONT } from '../constants/brandFont'

const useNativeAnimDriver = Platform.OS !== 'web'

export default function BrandSplashScreen() {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const pulse = useRef(new Animated.Value(0.35)).current
  /** Scale-only intro — avoid opacity 0 on first paint (content looked invisible) */
  const enter = useRef(new Animated.Value(0)).current
  const wordLift = useRef(new Animated.Value(10)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(enter, {
        toValue: 1,
        damping: 14,
        stiffness: 160,
        useNativeDriver: useNativeAnimDriver,
      }),
      Animated.spring(wordLift, {
        toValue: 0,
        damping: 14,
        stiffness: 120,
        useNativeDriver: useNativeAnimDriver,
      }),
    ]).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: useNativeAnimDriver,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: useNativeAnimDriver,
        }),
      ])
    ).start()
  }, [pulse, enter, wordLift])

  const bgColors = isDark
    ? ['#0B1120', '#1A1033', '#0F172A']
    : ['#F8FAFC', '#EEF2FF', '#F0F9FF']

  const markScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })

  return (
    <View style={styles.wrap} accessibilityLabel="SiyahaBH loading">
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          styles.column,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 32,
            transform: [{ scale: markScale }],
          },
        ]}
      >
        <View style={[styles.markRing, { borderColor: `${colors.primary}35`, backgroundColor: `${colors.primary}12` }]}>
          <Ionicons name="compass" size={40} color={colors.primary} />
        </View>

        <Animated.View style={{ transform: [{ translateY: wordLift }], alignItems: 'center' }}>
          <Text style={[styles.wordmark, { color: colors.primary }]}>SiyahaBH</Text>
          <Text style={[styles.tagline, { color: isDark ? 'rgba(226,232,240,0.72)' : colors.textSecondary }]}>
            Discover Bahrain
          </Text>
        </Animated.View>

        <Animated.View style={[styles.dotsRow, { opacity: pulse }]}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.65 }]} />
          <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.35 }]} />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  markRing: {
    width: 96,
    height: 96,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  wordmark: {
    fontFamily: BRAND_WORDMARK_FONT,
    fontSize: 40,
    fontWeight: '400',
    letterSpacing: 1,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 36,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
})
