import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
import { View, StyleSheet, Animated, Easing, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { CachedImage } from '../../components/CachedImage'
import { resolvePublicImageUrl } from '../../utils/imageUrl'
import styles from '../AIPlanScreen.styles'
import { SCREEN_WIDTH } from './constants'
import { STOP_DETAIL_SWIPE_COMMIT, STOP_DETAIL_SWIPE_SNAP_BACK, STOP_DETAIL_EXIT_X, STOP_DETAIL_SWIPE_PEEK_RANGE } from './constants'
import { PreviewImage } from './uiScoutMosaic'


export function StopDetailGallery({
  images,
  singleUri,
  accent,
  isEat,
  isEvent,
  slideWidth,
  imageHeight,
  bottomRadius = 24,
  hideBottomDotsRow = false,
}) {
  const marqueeTranslateX = useRef(new Animated.Value(0)).current
  const [pageIdx, setPageIdx] = useState(0)
  const list = useMemo(
    () => (Array.isArray(images) && images.length > 0 ? images.filter(Boolean) : []),
    [images]
  )

  useEffect(() => {
    setPageIdx(0)
    if (list.length < 2) return undefined
    const cycleDistance = Math.max(1, slideWidth * list.length)
    const pxPerSecond = 24
    const durationMs = Math.max(12000, Math.round((cycleDistance / pxPerSecond) * 1000))
    marqueeTranslateX.setValue(0)

    const listenerId = marqueeTranslateX.addListener(({ value }) => {
      const distance = Math.abs(value)
      const nextIdx = Math.floor(distance / Math.max(1, slideWidth)) % list.length
      setPageIdx((prev) => (prev === nextIdx ? prev : nextIdx))
    })

    const loop = Animated.loop(
      Animated.timing(marqueeTranslateX, {
        toValue: -cycleDistance,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
    loop.start()

    return () => {
      loop.stop()
      marqueeTranslateX.removeListener(listenerId)
      marqueeTranslateX.stopAnimation()
      marqueeTranslateX.setValue(0)
    }
  }, [list, slideWidth, marqueeTranslateX])

  const primaryUri = list[0] || singleUri
  if (!primaryUri) {
    return (
      <View
        style={{
          width: slideWidth,
          height: imageHeight,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
          overflow: 'hidden',
          backgroundColor: `${accent}24`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'}
          size={40}
          color={accent}
        />
      </View>
    )
  }

  if (list.length < 2) {
    return (
      <View
        style={{
          width: slideWidth,
          height: imageHeight,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
          overflow: 'hidden',
          backgroundColor: '#E2E8F0',
        }}
      >
        <PreviewImage uri={primaryUri} style={StyleSheet.absoluteFill} />
      </View>
    )
  }

  return (
    <View style={{ width: slideWidth }}>
      <View
        style={{
          width: slideWidth,
          height: imageHeight,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
          overflow: 'hidden',
          backgroundColor: '#E2E8F0',
        }}
      >
        <Animated.View
          style={{
            width: slideWidth * list.length * 2,
            height: imageHeight,
            flexDirection: 'row',
            transform: [{ translateX: marqueeTranslateX }],
          }}
        >
          {[...list, ...list].map((img, i) => (
            <View key={`${String(img)}-${i}`} style={{ width: slideWidth, height: imageHeight, backgroundColor: '#E2E8F0' }}>
              <PreviewImage uri={img} style={StyleSheet.absoluteFill} />
            </View>
          ))}
        </Animated.View>
      </View>
      {!hideBottomDotsRow ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 7,
            paddingVertical: 12,
            backgroundColor: '#FAFAFA',
          }}
        >
          {list.map((_, i) => (
            <View
              key={i}
              style={{
                width: pageIdx === i ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: pageIdx === i ? accent : 'rgba(15,23,42,0.18)',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

