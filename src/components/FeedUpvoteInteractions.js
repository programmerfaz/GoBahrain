import React, { useEffect, useRef } from 'react'
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Image,
  Dimensions,
  Platform,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window')

const FEED_IMAGE_ZOOM_MAX = 4
const ReanimatedImage = Reanimated.createAnimatedComponent(Image)

const PARTICLE_SIZE = 28
const PARTICLE_COUNT = 14
const BURST_EASING = Easing.out(Easing.cubic)

/**
 * Pinch-to-zoom on feed photos; double-tap triggers callback (e.g. upvote).
 * When pinchEnabled is false, only double-tap runs (for carousels that scroll horizontally).
 */
export function PinchZoomPostImage({
  uri,
  style,
  onImageDoubleTap,
  onLoad,
  onError,
  resizeMode = 'cover',
  pinchEnabled = true,
}) {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)

  const pinchGesture = Gesture.Pinch()
    .enabled(pinchEnabled)
    .onUpdate((event) => {
      const next = savedScale.value * event.scale
      const clamped = Math.min(FEED_IMAGE_ZOOM_MAX, Math.max(1, next))
      scale.value = clamped
    })
    .onEnd(() => {
      if (scale.value < 1.02) {
        scale.value = withSpring(1, { damping: 18, stiffness: 280 })
        savedScale.value = 1
      } else {
        savedScale.value = scale.value
      }
    })

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((event) => {
      runOnJS(onImageDoubleTap)(event.absoluteX, event.absoluteY)
    })

  const composed = pinchEnabled
    ? Gesture.Simultaneous(pinchGesture, doubleTapGesture)
    : doubleTapGesture

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={{ flex: 1, overflow: 'hidden', width: '100%' }} collapsable={false}>
      <GestureDetector gesture={composed}>
        <View style={{ flex: 1, overflow: 'hidden' }} collapsable={false}>
          <ReanimatedImage
            source={{ uri }}
            style={[style, imageAnimatedStyle]}
            resizeMode={resizeMode}
            onLoad={onLoad}
            onError={onError}
          />
        </View>
      </GestureDetector>
    </View>
  )
}

const particleStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    pointerEvents: 'none',
  },
  particle: {
    position: 'absolute',
    left: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: PARTICLE_SIZE,
    height: PARTICLE_SIZE,
    borderRadius: PARTICLE_SIZE / 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
      android: { elevation: 6 },
    }),
  },
})

export function UpvoteParticles({ visible, position, accentColor = '#059669' }) {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: new Animated.Value(position?.x ?? WINDOW_WIDTH / 2),
      y: new Animated.Value(position?.y ?? WINDOW_HEIGHT / 2),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0.5),
    })),
  ).current

  useEffect(() => {
    if (!visible || position?.x == null || position?.y == null) return
    const startX = position.x ?? WINDOW_WIDTH / 2
    const startY = position.y ?? WINDOW_HEIGHT / 2
    const half = PARTICLE_SIZE / 2
    const centerX = startX - half
    const centerY = startY - half

    particles.forEach((particle, index) => {
      if (!particle.x || !particle.y || !particle.opacity || !particle.scale) return
      const angle = (index * 360) / particles.length + (index % 2) * 12
      const distance = 80 + (index % 4) * 28
      const radians = (angle * Math.PI) / 180
      const endX = centerX + Math.cos(radians) * distance
      const endY = centerY + Math.sin(radians) * distance - 50

      particle.x.setValue(centerX)
      particle.y.setValue(centerY)
      particle.opacity.setValue(1)
      particle.scale.setValue(0.3)

      Animated.parallel([
        Animated.timing(particle.x, {
          toValue: endX,
          duration: 650,
          easing: BURST_EASING,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: endY,
          duration: 650,
          easing: BURST_EASING,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(particle.scale, {
            toValue: 1.15,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.5,
            duration: 530,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(particle.opacity, {
            toValue: 0,
            duration: 400,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start()
    })
  }, [visible, position?.x, position?.y, particles])

  if (!visible) return null

  return (
    <View style={particleStyles.container} pointerEvents="none">
      {particles.map((particle) => (
        <Animated.View
          key={particle.id}
          style={[
            particleStyles.particle,
            {
              width: PARTICLE_SIZE,
              height: PARTICLE_SIZE,
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        >
          <View style={particleStyles.iconWrap}>
            <Ionicons name="arrow-up-circle" size={PARTICLE_SIZE} color={accentColor} />
          </View>
        </Animated.View>
      ))}
    </View>
  )
}
