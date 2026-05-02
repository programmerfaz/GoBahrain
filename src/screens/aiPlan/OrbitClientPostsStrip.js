import React, { useRef, useEffect, useMemo } from 'react'
import { View, ScrollView, StyleSheet, Platform, Animated, Easing, Text } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CachedImage } from '../../components/CachedImage'

const ITEM_W = 98
const ITEM_H = 116
const GAP = 10
const GOLD = '#E9C877'
const GOLD_SOFT = '#F7DFA0'

/**
 * Cinematic orbit filmstrip — full-bleed horizontal reel of place posts.
 * Each tile breathes with a subtle Ken-Burns idle zoom, has a gold+accent
 * hairline, and sits on a dark glass tray.
 */
export function OrbitClientPostsStrip({ imageUris, accent }) {
  const scrollRef = useRef(null)
  const offsetRef = useRef(0)
  const loopUnitW = useMemo(() => {
    const n = imageUris?.length ?? 0
    if (n <= 0) return 0
    return n * (ITEM_W + GAP)
  }, [imageUris])

  const tripleUris = useMemo(() => {
    if (!imageUris?.length) return []
    return [...imageUris, ...imageUris, ...imageUris]
  }, [imageUris])

  useEffect(() => {
    if (loopUnitW <= 0 || imageUris.length < 2) return undefined
    offsetRef.current = 0
    const tickMs = 28
    const stepPx = 0.85
    const id = setInterval(() => {
      offsetRef.current += stepPx
      if (offsetRef.current >= loopUnitW) {
        offsetRef.current -= loopUnitW
      }
      scrollRef.current?.scrollTo({ x: offsetRef.current, animated: false })
    }, tickMs)
    return () => clearInterval(id)
  }, [loopUnitW, imageUris.length])

  if (!imageUris?.length) return null

  const safeAccent =
    typeof accent === 'string' && accent.length === 7 ? accent : '#C8102E'
  const accentRing = `${safeAccent}66`

  return (
    <View style={styles.wrap} accessibilityLabel="Place post gallery">
      <View style={styles.overlineRow} pointerEvents="none">
        <View style={styles.overlineDot} />
        <Text style={styles.overlineText}>STOP HIGHLIGHTS</Text>
        <View style={styles.overlineBar} />
      </View>

      <View style={styles.reelFrame} pointerEvents="box-none">
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(7,6,10,0.9)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.edgeFadeLeft}
        />
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="fast"
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {tripleUris.map((uri, i) => (
            <OrbitTile key={`${uri}-${i}`} uri={uri} accent={safeAccent} accentRing={accentRing} delay={(i % imageUris.length) * 140} />
          ))}
        </ScrollView>
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(7,6,10,0.9)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.edgeFadeRight}
        />
      </View>
    </View>
  )
}

function OrbitTile({ uri, accent, accentRing, delay = 0 }) {
  const ken = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const kenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ken, { toValue: 1, duration: 5200, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(ken, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    kenLoop.start()
    glowLoop.start()
    return () => {
      kenLoop.stop()
      glowLoop.stop()
    }
  }, [ken, glow, delay])

  const scale = ken.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.14] })
  const tx = ken.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] })
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] })

  return (
    <View style={styles.tileWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tileGlow,
          { shadowColor: accent, opacity: glowOp },
        ]}
      />
      <View style={[styles.tile, { borderColor: accentRing }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }, { translateX: tx }] }]}>
          <CachedImage source={{ uri }} style={styles.img} resizeMode="cover" recyclingKey={uri} />
        </Animated.View>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.18)', 'transparent', 'rgba(7,6,10,0.55)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'transparent', `${accent}38`]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.tileCornerTL, { borderColor: GOLD_SOFT }]} pointerEvents="none" />
        <View style={[styles.tileCornerBR, { borderColor: GOLD_SOFT }]} pointerEvents="none" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingTop: 3,
    paddingBottom: 1,
  },
  overlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  overlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
    ...Platform.select({
      ios: { shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 3 },
    }),
  },
  overlineText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: GOLD_SOFT,
    letterSpacing: 1.2,
  },
  overlineBar: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(233,200,119,0.35)',
  },
  reelFrame: {
    height: ITEM_H + 12,
    justifyContent: 'center',
    position: 'relative',
  },
  scrollContent: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tileWrap: {
    width: ITEM_W,
    height: ITEM_H,
    marginRight: GAP,
    position: 'relative',
  },
  tileGlow: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: -6,
    bottom: -6,
    borderRadius: 22,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 18 },
      android: { elevation: 6 },
    }),
  },
  tile: {
    width: ITEM_W,
    height: ITEM_H,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#111827',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.6,
        shadowRadius: 18,
      },
      android: { elevation: 8 },
    }),
  },
  img: {
    width: '100%',
    height: '100%',
  },
  tileCornerTL: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 12,
    height: 12,
    borderTopWidth: 1.2,
    borderLeftWidth: 1.2,
    opacity: 0.8,
  },
  tileCornerBR: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 12,
    height: 12,
    borderBottomWidth: 1.2,
    borderRightWidth: 1.2,
    opacity: 0.8,
  },
  edgeFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 42,
    zIndex: 2,
  },
  edgeFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 42,
    zIndex: 2,
  },
})
