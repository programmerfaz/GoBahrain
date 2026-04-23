import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
import { View, ScrollView, StyleSheet, Animated, Easing, Platform } from 'react-native'
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
  const scrollRef = useRef(null)
  const indexRef = useRef(0)
  const [pageIdx, setPageIdx] = useState(0)
  const list = useMemo(
    () => (Array.isArray(images) && images.length > 0 ? images.filter(Boolean) : []),
    [images]
  )

  useEffect(() => {
    indexRef.current = 0
    setPageIdx(0)
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: 0, animated: false })
    })
    if (list.length < 2) return undefined
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % list.length
      const next = indexRef.current
      setPageIdx(next)
      scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true })
    }, 5000)
    return () => clearInterval(id)
  }, [list, slideWidth])

  const handleMomentumEnd = (e) => {
    if (list.length < 2) return
    const x = e.nativeEvent.contentOffset.x
    const i = Math.round(x / Math.max(1, slideWidth))
    const clamped = Math.max(0, Math.min(list.length - 1, i))
    indexRef.current = clamped
    setPageIdx(clamped)
  }

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
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          decelerationRate="fast"
          style={{ width: slideWidth, height: imageHeight }}
          keyboardShouldPersistTaps="handled"
        >
          {list.map((img, i) => (
            <View key={`${String(img)}-${i}`} style={{ width: slideWidth, height: imageHeight, backgroundColor: '#E2E8F0' }}>
              <PreviewImage uri={img} style={StyleSheet.absoluteFill} />
            </View>
          ))}
        </ScrollView>
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

