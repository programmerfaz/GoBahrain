import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from './ThemeContext'
import { FONT_POPPINS_SEMIBOLD } from '../constants/brandFont'

const AddedToPlanToastContext = createContext(null)

const DISPLAY_MS = 2200

function ToastLayer({ opacity, translateY }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const topPad = Math.max(insets.top, 12) + 8

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingTop: topPad,
          paddingHorizontal: 24,
          zIndex: 9999,
          elevation: 9999,
        },
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
          Platform.OS === 'ios'
            ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 20,
              }
            : { elevation: 14 },
        ]}
        accessibilityRole="text"
        accessibilityLabel="Added to your next plan"
        accessibilityLiveRegion="polite"
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} importantForAccessibility="no" />
        </View>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Added to your next plan</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 340,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: -0.2,
  },
})

export function AddedToPlanToastProvider({ children }) {
  const opacityRef = useRef(null)
  const translateYRef = useRef(null)
  if (opacityRef.current == null) opacityRef.current = new Animated.Value(0)
  if (translateYRef.current == null) translateYRef.current = new Animated.Value(-24)

  const hideTimerRef = useRef(null)

  const showAddedToPlanToast = useCallback(() => {
    const opacity = opacityRef.current
    const translateY = translateYRef.current
    if (!opacity || !translateY) return
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    opacity.stopAnimation()
    translateY.stopAnimation()
    opacity.setValue(0)
    translateY.setValue(-24)
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      hideTimerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 260,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -14,
            duration: 260,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start()
        hideTimerRef.current = null
      }, DISPLAY_MS)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const value = useMemo(() => ({ showAddedToPlanToast }), [showAddedToPlanToast])

  return (
    <AddedToPlanToastContext.Provider value={value}>
      <>
        {children}
        <ToastLayer opacity={opacityRef.current} translateY={translateYRef.current} />
      </>
    </AddedToPlanToastContext.Provider>
  )
}

export function useAddedToPlanToast() {
  const ctx = useContext(AddedToPlanToastContext)
  if (!ctx) {
    return { showAddedToPlanToast: () => {} }
  }
  return ctx
}
