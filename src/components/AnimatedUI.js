import React, { useRef, useEffect, useCallback } from 'react'
import {
  Animated,
  TouchableOpacity,
  Easing,
  StyleSheet,
  View,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'

export const AnimatedPressable = ({
  children,
  style,
  onPress,
  scaleDown = 0.96,
  activeOpacity = 1,
  ...rest
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: scaleDown,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
    }).start()
  }, [scaleAnim, scaleDown])

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 12,
      stiffness: 180,
    }).start()
  }, [scaleAnim])

  return (
    <TouchableOpacity
      activeOpacity={activeOpacity}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  )
}

export const FadeInView = ({ children, style, delay = 0, duration = 400, from = 20 }) => {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(from)).current

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start()
    }, delay)
    return () => clearTimeout(timer)
  }, [delay, duration, opacity, translateY])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  )
}

export const StaggerChildren = ({ children, staggerMs = 80, from = 16 }) => {
  return React.Children.map(children, (child, index) => {
    if (!child) return null
    return (
      <FadeInView delay={index * staggerMs} from={from} duration={350}>
        {child}
      </FadeInView>
    )
  })
}

export const ShimmerPlaceholder = ({ width, height, borderRadius = 12, style }) => {
  const { colors } = useTheme()
  const shimmerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
    loop.start()
    return () => loop.stop()
  }, [shimmerAnim])

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  })

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.shimmerBase,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={['transparent', colors.shimmerHighlight, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  )
}

export const GradientButton = ({
  children,
  onPress,
  gradientColors,
  style,
  innerStyle,
  disabled,
}) => {
  const { colors } = useTheme()
  const finalColors = gradientColors || [colors.primary, colors.primaryDark || colors.primary]

  return (
    <AnimatedPressable onPress={onPress} disabled={disabled} scaleDown={0.97}>
      <View
        style={[
          shimmerButtonStyles.wrap,
          disabled && { opacity: 0.55 },
          style,
        ]}
      >
        <LinearGradient
          colors={finalColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[shimmerButtonStyles.gradient, innerStyle]}
        >
          {children}
        </LinearGradient>
      </View>
    </AnimatedPressable>
  )
}

export const GradientBorderView = ({ children, style, borderWidth = 2, borderRadius = 20, gradientColors }) => {
  const { colors } = useTheme()
  const finalColors = gradientColors || ['#E63950', '#C8102E', '#7C3AED']

  return (
    <LinearGradient
      colors={finalColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius, padding: borderWidth }, style]}
    >
      <View style={{ borderRadius: borderRadius - borderWidth, overflow: 'hidden', backgroundColor: colors.surface }}>
        {children}
      </View>
    </LinearGradient>
  )
}

export const PulseView = ({ children, style, pulseScale = 1.05, duration = 2000 }) => {
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: pulseScale,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse, pulseScale, duration])

  return (
    <Animated.View style={[style, { transform: [{ scale: pulse }] }]}>
      {children}
    </Animated.View>
  )
}

const shimmerButtonStyles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#C8102E',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
    borderRadius: 16,
  },
})
