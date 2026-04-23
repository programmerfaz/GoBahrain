import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from 'react-native'
import Reanimated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import styles from '../AIPlanScreen.styles'
import { colors as themeColors } from '../../theme/designTokens'
import { PLAN_COLORS } from './constants'


export const AnimatedStopRow = ({ isVisible, children, style }) => {
  const scale = useSharedValue(0)
  const opacity = useSharedValue(0)
  
  React.useEffect(() => {
    if (isVisible) {
      scale.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.7 })
      opacity.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.7 })
    } else {
      scale.value = 0
      opacity.value = 0
    }
  }, [isVisible])
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))
  
  return (
    <Reanimated.View style={[style, animatedStyle]}>
      {children}
    </Reanimated.View>
  )
}
export function AiStagger({ children, delay = 0, style, entering }) {
  const defaultEntering = FadeInDown.springify()
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

export function PopIn({ delay = 0, trigger, children, style }) {
  const scale = useRef(new Animated.Value(0.7)).current
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(14)).current

  useEffect(() => {
    scale.setValue(0.7)
    opacity.setValue(0)
    ty.setValue(14)
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 170, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, tension: 170, friction: 10, useNativeDriver: true }),
      ]).start()
    }, delay)
    return () => clearTimeout(timer)
  }, [trigger])

  return (
    <Animated.View style={[style, { transform: [{ scale }, { translateY: ty }], opacity }]}>
      {children}
    </Animated.View>
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

export function AnimatedOptionChip({ item, isSelected, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const bounceAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (isSelected) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1.03, tension: 200, friction: 10, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -3, duration: 100, useNativeDriver: true }),
          Animated.spring(bounceAnim, { toValue: 0, tension: 300, friction: 6, useNativeDriver: true }),
        ]),
      ]).start()
    } else {
      Animated.spring(scaleAnim, { toValue: 1, tension: 150, friction: 14, useNativeDriver: true }).start()
    }
  }, [isSelected, scaleAnim, bounceAnim])

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }, { translateY: bounceAnim }] }}>
      <TouchableOpacity
        style={[
          styles.pmChip,
          isSelected && styles.pmChipSelected,
        ]}
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={item.label}
      >
        {isSelected && (
          <LinearGradient
            colors={['#FFF9F0', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
            pointerEvents="none"
          />
        )}
        <View
          style={[
            styles.pmChipIcon,
            isSelected && { backgroundColor: 'rgba(233,200,119,0.15)' },
            !isSelected && { backgroundColor: hexToRgba(item.color, 0.08) },
          ]}
        >
          <Ionicons 
            name={item.icon} 
            size={16} 
            color={isSelected ? '#1A120A' : item.color} 
          />
        </View>
        <Text style={[styles.pmChipText, isSelected && styles.pmChipTextSelected]}>
          {item.label}
        </Text>
        {isSelected && (
          <View style={styles.pmChipCheck}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}
