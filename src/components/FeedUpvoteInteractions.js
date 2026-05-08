import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Image,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { Video, ResizeMode, Audio } from 'expo-av'
import { prepareFeedVideoPlaybackUri, cacheRemoteVideoForPlayback } from '../utils/storagePlaybackUri'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'

/** Public URLs that point at video files (feed post_image can be MP4, etc.). */
export const isFeedVideoUri = (uri) => {
  if (uri == null || typeof uri !== 'string') return false
  const path = uri.split(/[?#]/)[0] || ''
  return /\.(mp4|m4v|mov|webm|mkv)$/i.test(path)
}

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window')

const FEED_IMAGE_ZOOM_MAX = 4
const ReanimatedImage = Reanimated.createAnimatedComponent(Image)

function FeedPostVideo({
  uri,
  style,
  onImageDoubleTap,
  onLoad,
  onError,
  resizeMode = 'cover',
}) {
  const videoResize = resizeMode === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER
  const [playbackUri, setPlaybackUri] = useState(uri)
  const [resolving, setResolving] = useState(true)
  const playbackUriRef = useRef(uri)
  const fallbackStepRef = useRef(0)
  const uriGenRef = useRef(0)
  const recoveryInFlightRef = useRef(false)

  playbackUriRef.current = playbackUri

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      allowsRecordingIOS: false,
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const gen = ++uriGenRef.current
    fallbackStepRef.current = 0
    recoveryInFlightRef.current = false
    setPlaybackUri(uri)
    setResolving(true)
    let cancelled = false
    ;(async () => {
      try {
        const next = await prepareFeedVideoPlaybackUri(uri)
        if (cancelled || uriGenRef.current !== gen) return
        setPlaybackUri(next)
      } catch {
        if (cancelled || uriGenRef.current !== gen) return
        setPlaybackUri(uri)
      } finally {
        if (!cancelled && uriGenRef.current === gen) setResolving(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uri])

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((event) => {
      runOnJS(onImageDoubleTap)(event.absoluteX, event.absoluteY)
    })

  const handleReady = () => {
    onLoad?.({ nativeEvent: {} })
  }

  const handlePlaybackFailure = (message) => {
    if (recoveryInFlightRef.current) return
    recoveryInFlightRef.current = true
    const genAtError = uriGenRef.current
    const messageText =
      typeof message === 'string'
        ? message
        : message && typeof message === 'object' && 'message' in message
          ? String(message.message)
          : String(message ?? '')
    void (async () => {
      try {
        if (uriGenRef.current !== genAtError) return

        const tryCache = async (remote) => {
          if (!remote || typeof remote !== 'string' || remote.startsWith('file://')) return null
          return cacheRemoteVideoForPlayback(remote)
        }

        if (fallbackStepRef.current === 0) {
          fallbackStepRef.current = 1
          const local = await tryCache(playbackUriRef.current)
          if (local && uriGenRef.current === genAtError) {
            setPlaybackUri(local)
            return
          }
        }

        if (uriGenRef.current !== genAtError) return
        if (fallbackStepRef.current === 1 && uri !== playbackUriRef.current) {
          fallbackStepRef.current = 2
          const local2 = await tryCache(uri)
          if (local2 && uriGenRef.current === genAtError) {
            setPlaybackUri(local2)
            return
          }
        }

        if (uriGenRef.current === genAtError) {
          onError?.({ nativeEvent: { error: messageText || 'video' } })
        }
      } finally {
        recoveryInFlightRef.current = false
      }
    })()
  }

  const handlePlaybackStatusUpdate = (status) => {
    if (status?.isLoaded || !status?.error) return
    handlePlaybackFailure(status.error)
  }

  return (
    <View style={{ flex: 1, overflow: 'hidden', width: '100%' }} collapsable={false}>
      <GestureDetector gesture={doubleTapGesture}>
        <View style={{ flex: 1, overflow: 'hidden', backgroundColor: '#0f172a' }} collapsable={false}>
          {resolving ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
            </View>
          ) : (
            <>
              <Video
                key={playbackUri}
                source={{ uri: playbackUri }}
                style={[{ flex: 1, width: '100%', height: '100%' }, StyleSheet.flatten(style)]}
                resizeMode={videoResize}
                isLooping
                shouldPlay
                isMuted
                useNativeControls={false}
                onReadyForDisplay={handleReady}
                onLoad={handleReady}
                onError={handlePlaybackFailure}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  backgroundColor: 'rgba(0,0,0,0.45)',
                }}
              >
                <Ionicons name="videocam" size={14} color="rgba(255,255,255,0.95)" />
                <Ionicons name="volume-mute" size={14} color="rgba(255,255,255,0.95)" />
              </View>
            </>
          )}
        </View>
      </GestureDetector>
    </View>
  )
}

const PARTICLE_SIZE = 28
const PARTICLE_COUNT = 14
const BURST_EASING = Easing.out(Easing.cubic)

/**
 * Pinch-to-zoom on feed photos; double-tap triggers callback (e.g. upvote).
 * Video URLs (mp4, mov, …) render with expo-av (muted loop, same double-tap).
 * When pinchEnabled is false, only double-tap runs (for carousels that scroll horizontally).
 */
export function PinchZoomPostImage(props) {
  if (props.uri && isFeedVideoUri(props.uri)) {
    return <FeedPostVideo {...props} />
  }
  return <PinchZoomPostImageInner {...props} />
}

function PinchZoomPostImageInner({
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
