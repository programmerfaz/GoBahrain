import React, { useMemo, useEffect, memo } from 'react'
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native'
import Reanimated, {
  FadeInUp,
  FadeIn,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import styles from '../AIPlanScreen.styles'


export const AnimatedStopRow = ({ isVisible, children, style }) => {
  const translateY = useSharedValue(22)
  const opacity = useSharedValue(0)

  React.useEffect(() => {
    if (isVisible) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 200, mass: 0.72 })
      opacity.value = withSpring(1, { damping: 15, stiffness: 200, mass: 0.72 })
    } else {
      translateY.value = 22
      opacity.value = 0
    }
  }, [isVisible])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  return (
    <Reanimated.View style={[style, animatedStyle]}>
      {children}
    </Reanimated.View>
  )
}
export function AiStagger({ children, delay = 0, style, entering }) {
  const defaultEntering = FadeInUp.springify()
    .damping(17)
    .stiffness(210)
    .mass(0.65)
    .delay(delay)
  return (
    <Reanimated.View entering={entering ?? defaultEntering} style={style}>
      {children}
    </Reanimated.View>
  )
}

/** Quiet staggered fade + slide up — no bounce / scale pop */
export function PopIn({ delay = 0, children, style }) {
  const entering = useMemo(
    () =>
      FadeInUp.delay(delay)
        .duration(420)
        .easing(Easing.out(Easing.cubic)),
    [delay],
  )

  return (
    <Reanimated.View entering={entering} style={style}>
      {children}
    </Reanimated.View>
  )
}

export function PlanStepBubble({ step, children }) {
  return (
    <View style={styles.planModalPresenceLayer} key={step}>
      {children}
    </View>
  )
}

const hexToRgba = (hex, alpha) => {
  const raw = String(hex || '').replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length < 6) return `rgba(255,255,255,${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

const PM_TILE_RADIUS = 16

/** 3-column grid tile — stacked icon + label; `variant`: light modal vs cinematic overlay */
function AnimatedOptionChipImpl({ item, isSelected, onPress, variant = 'light' }) {
  const isDark = variant === 'dark'
  const rimLight = useSharedValue(isSelected ? 1 : 0)

  useEffect(() => {
    rimLight.value = withTiming(isSelected ? 1 : 0, {
      duration: 150,
      easing: Easing.out(Easing.cubic),
    })
  }, [isSelected, rimLight])

  const rimStyle = useAnimatedStyle(() => ({
    opacity: rimLight.value * (isDark ? 0.5 : 0.38),
  }))

  const touchBase = isDark ? styles.pmOptTileTouchableDark : {}
  const selectedShell = isDark ? styles.pmOptTileSelectedDark : styles.pmOptTileSelectedLight

  const iconTint = {}
  if (!isSelected && item?.color) {
    iconTint.backgroundColor = hexToRgba(item.color, isDark ? 0.09 : 0.1)
    iconTint.borderColor = hexToRgba(item.color, 0.24)
  }

  const labelStyle = [
    styles.pmOptTileLabel,
    isDark && styles.pmOptTileLabelDark,
    isSelected && (isDark ? styles.pmOptTileLabelSelectedDark : styles.pmOptTileLabelSelected),
  ]

  return (
    <View style={styles.pmOptTileWrap}>
      <TouchableOpacity
        style={[
          styles.pmOptTileTouchable,
          touchBase,
          isSelected && selectedShell,
        ]}
        activeOpacity={0.88}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={item.label}
      >
        {isSelected ? (
          <>
            <LinearGradient
              colors={isDark ? ['rgba(253,246,232,0.12)', 'rgba(255,251,246,0.05)', 'rgba(200,157,71,0.08)'] : ['#FFFEFA', '#F5F1E9', '#EBE6DC']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.92, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: PM_TILE_RADIUS }]}
              pointerEvents="none"
            />
            {!isDark ? (
              <LinearGradient
                colors={['rgba(255,253,247,0.75)', 'rgba(255,255,255,0)', 'rgba(201,164,76,0.05)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                locations={[0, 0.4, 1]}
                style={[StyleSheet.absoluteFillObject, { borderRadius: PM_TILE_RADIUS }]}
                pointerEvents="none"
              />
            ) : null}
          </>
        ) : null}

        <Reanimated.View pointerEvents="none" style={[styles.pmOptTileRimGlow, rimStyle]} />

        <View
          style={[
            styles.pmOptTileIconCircle,
            isDark && styles.pmOptTileIconCircleDark,
            isSelected && (isDark ? styles.pmOptTileIconCircleSelectedDark : styles.pmOptTileIconCircleSelected),
            iconTint,
          ]}
        >
          <Ionicons
            name={item.icon}
            size={21}
            color={isSelected ? (isDark ? '#fcf9f4' : '#252018') : isDark ? 'rgba(240,236,229,0.88)' : item.color}
          />
        </View>
        <Text style={labelStyle} numberOfLines={3}>
          {item.label}
        </Text>

        {isSelected ? (
          <Reanimated.View
            entering={FadeIn.duration(120).easing(Easing.out(Easing.cubic))}
            style={styles.pmOptTileCheckSlot}
          >
            <LinearGradient
              colors={['#F2E6C3', '#D4B058', '#8B6919']}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.pmOptTileCheckGradient}
            >
              <Ionicons name="checkmark" size={13} color="#14110D" />
            </LinearGradient>
          </Reanimated.View>
        ) : null}
      </TouchableOpacity>
    </View>
  )
}

export const AnimatedOptionChip = memo(AnimatedOptionChipImpl, (prev, next) => {
  return (
    prev.item?.id === next.item?.id &&
    prev.isSelected === next.isSelected &&
    prev.variant === next.variant &&
    prev.onPress === next.onPress
  )
})
