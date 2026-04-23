import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Animated,
  ActivityIndicator,
  Easing,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { CachedImage, prefetchImageUrls } from '../../components/CachedImage'
import { resolvePublicImageUrl } from '../../utils/imageUrl'
import { colors as themeColors } from '../../theme/designTokens'
import styles from '../AIPlanScreen.styles'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './constants'


export function PreviewImage({ uri, style, noFade }) {
  const resolvedUri = useMemo(() => resolvePublicImageUrl(uri), [uri])
  
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const shimmerAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    fadeAnim.setValue(0);
  }, [resolvedUri, fadeAnim]);
  useEffect(() => {
    if (loaded && !noFade) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [loaded, fadeAnim, noFade]);
  useEffect(() => {
    if (noFade) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    if (!loaded && !failed && resolvedUri) loop.start();
    return () => loop.stop();
  }, [loaded, failed, resolvedUri, shimmerAnim, noFade]);
  if (!resolvedUri) return null;
  if (failed) {
    return <View style={[style, { backgroundColor: '#E8ECF1', overflow: 'hidden' }]} />;
  }
  if (noFade) {
    return (
      <View style={[style, { overflow: 'hidden', backgroundColor: '#F2F2F7' }]} collapsable={false}>
        {!loaded && !failed && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#ECECF0' }]} pointerEvents="none" />
        )}
        {!failed ? (
          <CachedImage
            source={{ uri: resolvedUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            recyclingKey={resolvedUri}
            transition={0}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setFailed(true)
              setLoaded(true)
            }}
          />
        ) : null}
      </View>
    );
  }
  const shimmerOpacity = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.08)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {!loaded && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: shimmerOpacity }]} pointerEvents="none">
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.4)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <CachedImage
          source={{ uri: resolvedUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          recyclingKey={resolvedUri}
          transition={0}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
        />
      </Animated.View>
    </View>
  );
}

/** Overlapping "deck" layout with radial entry trajectories */
export function getScoutMosaicLayout(variant, boxW, boxH) {
  if (variant === 'sheet') {
    return [
      { l: boxW * 0.02, t: boxH * 0.48, d: boxW * 0.30, z: 1, rot: '-12deg', sc: 0.80, el: 1, from: 'left' },
      { l: boxW * 0.34, t: boxH * 0.44, d: boxW * 0.32, z: 2, rot: '5deg', sc: 0.84, el: 2, from: 'bottom' },
      { l: boxW * 0.62, t: boxH * 0.46, d: boxW * 0.28, z: 1, rot: '10deg', sc: 0.80, el: 1, from: 'right' },
      { l: boxW * 0.06, t: boxH * 0.04, d: boxW * 0.26, z: 5, rot: '-6deg', sc: 0.90, el: 5, from: 'topLeft' },
      { l: boxW * 0.18, t: boxH * 0.10, d: boxW * 0.52, z: 12, rot: '-1deg', sc: 1, el: 12, from: 'top' },
    ]
  }
  return [
    { l: boxW * 0.02, t: boxH * 0.52, d: boxW * 0.30, z: 1, rot: '-14deg', sc: 0.76, el: 1, from: 'left' },
    { l: boxW * 0.34, t: boxH * 0.48, d: boxW * 0.32, z: 2, rot: '5deg', sc: 0.80, el: 2, from: 'bottom' },
    { l: boxW * 0.64, t: boxH * 0.50, d: boxW * 0.28, z: 1, rot: '12deg', sc: 0.76, el: 1, from: 'right' },
    { l: boxW * 0.06, t: boxH * 0.06, d: boxW * 0.26, z: 5, rot: '-8deg', sc: 0.88, el: 5, from: 'topLeft' },
    { l: boxW * 0.66, t: boxH * 0.04, d: boxW * 0.26, z: 4, rot: '10deg', sc: 0.88, el: 4, from: 'topRight' },
    { l: boxW * 0.16, t: boxH * 0.12, d: boxW * 0.56, z: 12, rot: '-2deg', sc: 1, el: 16, from: 'top' },
  ]
}

export function FlyingPhotoCard({ spec, item, sliceKey, idx, isSheet }) {
  const slideX = useRef(new Animated.Value(0)).current
  const slideY = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.3)).current
  const rotate = useRef(new Animated.Value(0)).current

  const r = spec.d / 2
  const finalRot = parseFloat(spec.rot) || 0

  const getEntryOffset = () => {
    const dist = SCREEN_WIDTH * 1.2
    switch (spec.from) {
      case 'top': return { x: 0, y: -dist }
      case 'bottom': return { x: 0, y: dist }
      case 'left': return { x: -dist, y: 0 }
      case 'right': return { x: dist, y: 0 }
      case 'topLeft': return { x: -dist * 0.7, y: -dist * 0.7 }
      case 'topRight': return { x: dist * 0.7, y: -dist * 0.7 }
      case 'bottomLeft': return { x: -dist * 0.7, y: dist * 0.7 }
      case 'bottomRight': return { x: dist * 0.7, y: dist * 0.7 }
      default: return { x: 0, y: -dist }
    }
  }

  useEffect(() => {
    const offset = getEntryOffset()
    slideX.setValue(offset.x)
    slideY.setValue(offset.y)
    rotate.setValue(finalRot + (Math.random() - 0.5) * 60)
    opacity.setValue(0)
    scale.setValue(0.3)

    const delay = 120 + idx * 85
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0,
        delay,
        duration: 650,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        useNativeDriver: true,
      }),
      Animated.timing(slideY, {
        toValue: 0,
        delay,
        duration: 680,
        easing: Easing.bezier(0.34, 1.2, 0.64, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        delay,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        delay: delay + 80,
        tension: 180,
        friction: 16,
        useNativeDriver: true,
      }),
      Animated.spring(rotate, {
        toValue: finalRot,
        delay: delay + 50,
        tension: 120,
        friction: 14,
        useNativeDriver: true,
      }),
    ]).start()
  }, [sliceKey, idx, item.image])

  return (
    <Animated.View
      key={`${sliceKey}-${idx}-${item.image}`}
      style={{
        position: 'absolute',
        left: spec.l,
        top: spec.t,
        width: spec.d,
        height: spec.d,
        zIndex: spec.z,
        elevation: spec.el,
        opacity,
        transform: [
          { translateX: slideX },
          { translateY: slideY },
        ],
      }}
    >
      <Animated.View
        style={[
          styles.scoutMosaicCell,
          isSheet && styles.scoutMosaicCellSheet,
          spec.z >= 10 && (isSheet ? styles.scoutMosaicCellHeroSheet : styles.scoutMosaicCellHero),
          spec.z <= 2 && (isSheet ? styles.scoutMosaicCellBackSheet : styles.scoutMosaicCellBack),
          {
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: r,
            transform: [
              { rotate: rotate.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) },
              { scale: Animated.multiply(scale, spec.sc != null ? spec.sc : 1) },
            ],
            ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
          },
        ]}
      >
        <PreviewImage
          uri={resolvePublicImageUrl(item.image) || item.image}
          style={{ width: '100%', height: '100%', borderRadius: r }}
          noFade
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'transparent', 'rgba(0,0,0,0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.scoutMosaicCellShine, { borderRadius: r }]}
        />
      </Animated.View>
    </Animated.View>
  )
}
export function KhalidScoutPhotoMosaic({ spotPreviews, variant }) {
  const isSheet = variant === 'sheet'
  const boxW = isSheet ? Math.min(SCREEN_WIDTH - 40, 360) : Math.min(SCREEN_WIDTH - 24, 400)
  const boxH = isSheet ? 168 : 228
  const layout = useMemo(() => {
    const raw = getScoutMosaicLayout(variant, boxW, boxH)
    return [...raw].sort((a, b) => a.z - b.z)
  }, [variant, boxW, boxH])

  const pool = useMemo(() => {
    const arr = (spotPreviews || [])
      .map((p) => {
        if (!p) return null
        const u = resolvePublicImageUrl(p.image) || (typeof p.image === 'string' ? p.image.trim() : null)
        if (!u) return null
        return { ...p, image: u }
      })
      .filter(Boolean)
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [spotPreviews])

  const poolKey = useMemo(() => {
    const rows = (spotPreviews || [])
      .map((p) => {
        if (!p) return null
        const u = resolvePublicImageUrl(p.image) || (typeof p.image === 'string' ? p.image.trim() : '')
        if (!u) return null
        return `${p?.id || ''}:${u}`
      })
      .filter(Boolean)
    return rows.sort().join('|')
  }, [spotPreviews])

  const slotCount = layout.length
  const pickSlice = useCallback(() => {
    if (pool.length === 0) return []
    if (pool.length <= slotCount) return pool.slice(0, slotCount)
    const start = Math.floor(Math.random() * pool.length)
    return Array.from({ length: slotCount }, (_, k) => pool[(start + k) % pool.length])
  }, [pool, slotCount])

  const [slice, setSlice] = useState([])

  const applySlice = useCallback((rows) => {
    setSlice(rows || [])
    const imgs = (rows || []).map((p) => p?.image).filter(Boolean)
    void prefetchImageUrls(imgs).catch(() => {})
  }, [])

  useLayoutEffect(() => {
    applySlice(pickSlice())
  }, [poolKey, pickSlice, applySlice])

  useEffect(() => {
    const urls = (spotPreviews || []).map((p) => p?.image).filter(Boolean)
    void prefetchImageUrls(urls).catch(() => {})
  }, [spotPreviews])

  useEffect(() => {
    if (pool.length === 0) return undefined
    const id = setInterval(() => {
      applySlice(pickSlice())
    }, 9000)
    return () => clearInterval(id)
  }, [poolKey, pool.length, pickSlice, applySlice])

  const sliceKey = slice.map((s) => s?.id).join('-')
  const hasTiles = pool.length > 0 && slice.some((s) => s?.image)

  if (pool.length === 0) {
    return (
      <View style={[styles.scoutMosaicInner, { width: boxW, height: boxH }]}>
        <View style={[styles.scoutMosaicEmpty, isSheet && styles.scoutMosaicEmptySheet, { width: boxW, height: boxH }]}>
          <ActivityIndicator size={isSheet ? 'small' : 'large'} color={isSheet ? themeColors.primary : 'rgba(255,255,255,0.9)'} />
          <Text style={[styles.scoutMosaicEmptyText, isSheet && styles.scoutMosaicEmptyTextSheet]}>
            Gathering photos from the community…
          </Text>
        </View>
      </View>
    )
  }

  if (!hasTiles) {
    return (
      <View style={[styles.scoutMosaicInner, { width: boxW, height: boxH }]}>
        <View style={[styles.scoutMosaicEmpty, isSheet && styles.scoutMosaicEmptySheet, { width: boxW, height: boxH }]}>
          <ActivityIndicator size="small" color={isSheet ? themeColors.primary : 'rgba(255,255,255,0.85)'} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.scoutMosaicInner, { width: boxW, height: boxH }]}>
      {layout.map((spec, idx) => {
        const item = slice[idx % Math.max(1, slice.length)]
        if (!item?.image) return null
        return (
          <FlyingPhotoCard
            key={`${sliceKey}-${idx}-${item.image}`}
            spec={spec}
            item={item}
            sliceKey={sliceKey}
            idx={idx}
            isSheet={isSheet}
          />
        )
      })}
    </View>
  )
}

export function KhalidScoutPlanVisual({ spotPreviews, variant }) {
  return (
    <View style={styles.scoutMosaicStage} accessibilityLabel="Live photo previews from the community feed">
      <KhalidScoutPhotoMosaic spotPreviews={spotPreviews} variant={variant} />
    </View>
  )
}
