import React, { useRef, useEffect, useState, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Animated,
  Easing,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { CachedImage } from '../../components/CachedImage'
import { resolvePublicImageUrl } from '../../utils/imageUrl'
import { BAHRAIN_FACTS } from './constants'

/* ────────────────────────────────────────────────────────────────────────────
 * Cinematic Reel — plan generation loader.
 * Full‑bleed hero photo with a Ken Burns pan/zoom, cross‑fading between real
 * community photos (spotPreviews). Letterboxed with camera viewfinder corners,
 * a LIVE badge, morphing title, live thumbnail strip of what's being shortlisted,
 * progress bar, step labels, and a prominent READY state when generation is done.
 * ──────────────────────────────────────────────────────────────────────────── */

const GOLD = '#E9C877'
const GOLD_SOFT = '#F7DFA0'
const GOLD_DEEP = '#B9892F'
const GREEN = '#34D399'
const GREEN_SOFT = '#A7F3D0'
const GREEN_DEEP = '#059669'
const INK = '#07060A'
const INK_GLASS = 'rgba(7,6,10,0.68)'

const STATUS_LINES = [
  { title: 'Scouting hidden gems', sub: 'Listening to the locals around you' },
  { title: 'Curating the table', sub: 'Pairing flavours to your mood' },
  { title: 'Stitching your journey', sub: 'Drawing the perfect route' },
]

const STEP_LABELS = [
  { key: 'places', label: 'Places', icon: 'compass-outline' },
  { key: 'dining', label: 'Dining', icon: 'restaurant-outline' },
  { key: 'route', label: 'Route', icon: 'git-branch-outline' },
]

/* ────────────────────────────────────────────────────────────────────────────
 * Ken Burns photo background — two layered images cross‑fade every few seconds
 * with a slow zoom & pan for a cinematic reel feel. Falls back to a deep
 * gradient when no photos are available.
 * ──────────────────────────────────────────────────────────────────────────── */
function CinematicPhotoStage({ photos, compact }) {
  const [slotA, setSlotA] = useState(0)
  const [slotB, setSlotB] = useState(1)
  const [active, setActive] = useState('A')
  const opA = useRef(new Animated.Value(1)).current
  const opB = useRef(new Animated.Value(0)).current
  const kenA = useRef(new Animated.Value(0)).current
  const kenB = useRef(new Animated.Value(0)).current
  const cursor = useRef(2)

  const valid = useMemo(() => (photos || []).filter((p) => p?.image), [photos])

  useEffect(() => {
    if (valid.length === 0) return undefined
    const run = (anim) => Animated.timing(anim, {
      toValue: 1,
      duration: compact ? 5400 : 6200,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    })
    run(kenA).start()

    const id = setInterval(() => {
      if (valid.length === 0) return
      if (active === 'A') {
        setSlotB(cursor.current % valid.length)
        cursor.current += 1
        kenB.setValue(0)
        Animated.parallel([
          Animated.timing(opB, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opA, { toValue: 0, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          run(kenB),
        ]).start(() => setActive('B'))
      } else {
        setSlotA(cursor.current % valid.length)
        cursor.current += 1
        kenA.setValue(0)
        Animated.parallel([
          Animated.timing(opA, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opB, { toValue: 0, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          run(kenA),
        ]).start(() => setActive('A'))
      }
    }, compact ? 3200 : 3800)

    return () => clearInterval(id)
  }, [valid.length, active, opA, opB, kenA, kenB, compact])

  const kenScaleA = kenA.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1.22] })
  const kenXA = kenA.interpolate({ inputRange: [0, 1], outputRange: [0, compact ? -12 : -20] })
  const kenYA = kenA.interpolate({ inputRange: [0, 1], outputRange: [0, compact ? 8 : 12] })
  const kenScaleB = kenB.interpolate({ inputRange: [0, 1], outputRange: [1.22, 1.08] })
  const kenXB = kenB.interpolate({ inputRange: [0, 1], outputRange: [compact ? 12 : 20, 0] })
  const kenYB = kenB.interpolate({ inputRange: [0, 1], outputRange: [compact ? -8 : -12, 0] })

  const picA = valid[slotA % Math.max(1, valid.length)]
  const picB = valid[slotB % Math.max(1, valid.length)]

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: INK }]} />
      {picA?.image ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: opA, transform: [{ scale: kenScaleA }, { translateX: kenXA }, { translateY: kenYA }] },
          ]}
        >
          <CachedImage
            source={{ uri: resolvePublicImageUrl(picA.image) || picA.image }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            transition={0}
          />
        </Animated.View>
      ) : null}
      {picB?.image ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: opB, transform: [{ scale: kenScaleB }, { translateX: kenXB }, { translateY: kenYB }] },
          ]}
        >
          <CachedImage
            source={{ uri: resolvePublicImageUrl(picB.image) || picB.image }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            transition={0}
          />
        </Animated.View>
      ) : null}

      {/* Top vignette for LIVE badge legibility */}
      <LinearGradient
        colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.15)', 'transparent']}
        locations={[0, 0.4, 1]}
        style={[StyleSheet.absoluteFill, { height: '40%' }]}
      />
      {/* Bottom vignette for text */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Side subtle dim */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.35)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

/* Film‑frame viewfinder corners — 4 L‑shaped brackets giving the cinematic feel. */
function ViewfinderCorners({ compact }) {
  const breathe = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [breathe])
  const op = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })
  const size = compact ? 14 : 22
  const pad = compact ? 10 : 14
  const stroke = compact ? 1.2 : 1.6
  const positions = [
    { top: pad, left: pad, borderTopWidth: stroke, borderLeftWidth: stroke },
    { top: pad, right: pad, borderTopWidth: stroke, borderRightWidth: stroke },
    { bottom: pad, left: pad, borderBottomWidth: stroke, borderLeftWidth: stroke },
    { bottom: pad, right: pad, borderBottomWidth: stroke, borderRightWidth: stroke },
  ]
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {positions.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            { position: 'absolute', width: size, height: size, borderColor: GOLD_SOFT, opacity: op },
            p,
          ]}
        />
      ))}
    </View>
  )
}

/* Live‑indicator badge — pulsing red dot with "LIVE CURATION" label. */
function LiveBadge({ compact, ready }) {
  const pulse = useRef(new Animated.Value(0)).current
  const readyPop = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (ready) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse, ready])

  useEffect(() => {
    if (!ready) {
      readyPop.setValue(0)
      return
    }
    readyPop.setValue(0)
    Animated.spring(readyPop, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }).start()
  }, [ready, readyPop])

  const op = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] })
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] })
  const readyScale = readyPop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.7, 1.15, 1] })

  return (
    <Animated.View
      style={[
        cn.liveBadge,
        compact && cn.liveBadgeCompact,
        ready && cn.liveBadgeReady,
        ready && { transform: [{ scale: readyScale }] },
      ]}
    >
      {ready ? (
        <>
          <View style={[cn.liveDot, { backgroundColor: '#FFFFFF' }]} />
          <Text style={[cn.liveText, { color: '#FFFFFF' }]}>READY</Text>
        </>
      ) : (
        <>
          <Animated.View style={[cn.liveDot, { transform: [{ scale }], opacity: op }]} />
          <Text style={cn.liveText}>LIVE CURATION</Text>
        </>
      )}
    </Animated.View>
  )
}

/* Morphing cinematic title — cross‑fade + Y slide on step change. */
function MorphingTitle({ step, showSuccess, compact }) {
  const fade = useRef(new Animated.Value(1)).current
  const ty = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = useState({ step, showSuccess })

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(ty, { toValue: -10, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return
      setMounted({ step, showSuccess })
      ty.setValue(12)
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start()
    })
  }, [step, showSuccess, fade, ty])

  const active = mounted.showSuccess
    ? { title: 'Your plan is ready', sub: 'Swipe up to begin your journey' }
    : STATUS_LINES[Math.min(mounted.step, STATUS_LINES.length - 1)]

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: ty }], alignItems: 'center', gap: 4 }}>
      <Text style={[cn.title, compact && cn.titleCompact, { textAlign: 'center' }]} numberOfLines={compact ? 1 : 2}>
        {active.title}
      </Text>
      {!compact && (
        <Text style={[cn.subtitle, { textAlign: 'center' }]} numberOfLines={1}>
          {active.sub}
        </Text>
      )}
    </Animated.View>
  )
}

/* Live thumbnail strip — 4 small photos animate in from the right with a
 * staggered slide, giving the feeling that spots are being continuously
 * shortlisted in real time. */
function LiveThumbStrip({ photos, compact, ready }) {
  const valid = useMemo(() => (photos || []).filter((p) => p?.image).slice(0, 8), [photos])
  const [cursor, setCursor] = useState(0)
  const slotCount = compact ? 3 : 4

  useEffect(() => {
    if (valid.length <= slotCount) return undefined
    const id = setInterval(() => setCursor((c) => (c + 1) % valid.length), 1700)
    return () => clearInterval(id)
  }, [valid.length, slotCount])

  if (valid.length === 0) return null
  const picks = Array.from({ length: slotCount }, (_, i) => valid[(cursor + i) % valid.length])

  return (
    <View style={[cn.thumbStrip, compact && cn.thumbStripCompact]}>
      {picks.map((p, i) => (
        <LiveThumb key={`${p?.id || ''}-${cursor}-${i}`} item={p} index={i} compact={compact} ready={ready} />
      ))}
    </View>
  )
}

function LiveThumb({ item, index, compact, ready }) {
  const enter = useRef(new Animated.Value(0)).current
  useEffect(() => {
    enter.setValue(0)
    Animated.timing(enter, {
      toValue: 1,
      duration: 480,
      delay: index * 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [enter, item?.id, index])
  const tx = enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] })
  const op = enter
  const size = compact ? 36 : 48
  return (
    <Animated.View
      style={[
        cn.thumb,
        { width: size, height: size, transform: [{ translateX: tx }], opacity: op },
        ready && { borderColor: GOLD },
      ]}
    >
      <CachedImage
        source={{ uri: resolvePublicImageUrl(item?.image) || item?.image }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        transition={0}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'transparent', 'rgba(0,0,0,0.28)']}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

/* Cinematic progress bar — thicker, with a flowing shimmer, a pulse each time
 * progress advances, and a gold→green gradient hand-off on completion. */
function ProgressBar({ progress, compact, ready }) {
  const val = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(1)).current
  const flash = useRef(new Animated.Value(0)).current
  const shimmer = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0)).current
  const prevProgress = useRef(0)

  useEffect(() => {
    Animated.timing(val, {
      toValue: progress,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
    if (progress > prevProgress.current + 0.01) {
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 180, easing: Easing.out(Easing.back(2)), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start()
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start()
    }
    prevProgress.current = progress
  }, [progress, val, pulse, flash])

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [shimmer])

  useEffect(() => {
    if (!ready) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [ready, glow])

  const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-60, 280] })
  const h = compact ? 5 : 8
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] })
  const flashOp = flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] })

  const fillColors = ready
    ? [GREEN_SOFT, GREEN, GREEN_DEEP]
    : [GOLD_SOFT, GOLD, '#E63950']

  return (
    <Animated.View
      style={[
        cn.progressWrap,
        { transform: [{ scaleY: pulse }] },
      ]}
    >
      {ready && (
        <Animated.View
          pointerEvents="none"
          style={[
            cn.progressGlow,
            { height: h + 10, borderRadius: (h + 10) / 2, opacity: glowOp },
          ]}
        />
      )}
      <View style={[cn.progressTrack, { height: h, borderRadius: h / 2 }]}>
        <View style={[cn.progressTick, { left: '33.3%' }]} />
        <View style={[cn.progressTick, { left: '66.6%' }]} />
        <Animated.View
          style={[
            cn.progressFill,
            {
              width: val.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              borderRadius: h / 2,
            },
          ]}
        >
          <LinearGradient
            colors={fillColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            pointerEvents="none"
            style={[cn.progressShimmer, { transform: [{ translateX: shimmerX }] }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: flashOp }]}
          />
        </Animated.View>
      </View>
    </Animated.View>
  )
}

/* Step chips — glass when pending, gold-lit with a shimmer when active, and
 * snap to a vibrant green with a spring + check icon the moment they are done. */
function StepChip({ step, index, isDone, isActive, compact }) {
  const lit = useRef(new Animated.Value(0)).current
  const popped = useRef(new Animated.Value(0)).current
  const shimmer = useRef(new Animated.Value(0)).current
  const prevDone = useRef(false)

  useEffect(() => {
    Animated.timing(lit, {
      toValue: isDone ? 1 : isActive ? 0.6 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
    if (isDone && !prevDone.current) {
      prevDone.current = true
      popped.setValue(0)
      Animated.sequence([
        Animated.spring(popped, { toValue: 1, tension: 220, friction: 7, useNativeDriver: true }),
      ]).start()
    }
    if (!isDone) prevDone.current = false
  }, [isDone, isActive, lit, popped])

  useEffect(() => {
    if (!isActive) return undefined
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [isActive, shimmer])

  const popScale = popped.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] })
  const iconScale = popped.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1.35, 1] })
  const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, 160] })

  return (
    <Animated.View
      style={[
        cn.stepChip,
        compact && cn.stepChipCompact,
        isActive && cn.stepChipActive,
        isDone && cn.stepChipDone,
        { transform: [{ scale: popScale }] },
      ]}
    >
      {isActive && !isDone && (
        <Animated.View
          pointerEvents="none"
          style={[cn.stepChipShimmer, { transform: [{ translateX: shimmerX }] }]}
        />
      )}
      <Animated.View style={{ transform: [{ scale: isDone ? iconScale : 1 }] }}>
        <Ionicons
          name={isDone ? 'checkmark-sharp' : step.icon}
          size={compact ? 12 : 15}
          color={isDone ? '#FFFFFF' : isActive ? GOLD_SOFT : 'rgba(255,255,255,0.55)'}
        />
      </Animated.View>
      <Text
        style={[
          cn.stepLabel,
          compact && cn.stepLabelCompact,
          isActive && { color: GOLD_SOFT },
          isDone && { color: '#FFFFFF' },
        ]}
        numberOfLines={1}
      >
        {step.label}
      </Text>
    </Animated.View>
  )
}

function StepRow({ completed, activeIndex, compact, ready }) {
  return (
    <View style={[cn.stepRow, compact && { gap: 6 }]}>
      {STEP_LABELS.map((s, i) => {
        const isDone = ready || i < completed
        const isActive = !ready && i === activeIndex
        return (
          <StepChip
            key={s.key}
            step={s}
            index={i}
            isDone={isDone}
            isActive={isActive}
            compact={compact}
          />
        )
      })}
    </View>
  )
}

/* Radial spark burst — eight gold slivers flung outward from the center on reveal. */
function SparkBurst({ visible, compact }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!visible) return
    anim.setValue(0)
    Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [visible, anim])

  if (!visible) return null
  const count = 10
  const reach = compact ? 58 : 78
  const sparks = []
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2
    const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * reach] })
    const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * reach] })
    const op = anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] })
    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] })
    sparks.push(
      <Animated.View
        key={i}
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 3,
          height: compact ? 10 : 14,
          borderRadius: 2,
          backgroundColor: GOLD_SOFT,
          opacity: op,
          transform: [
            { translateX: tx },
            { translateY: ty },
            { rotate: `${(angle * 180) / Math.PI + 90}deg` },
            { scale },
          ],
          shadowColor: GOLD,
          shadowOpacity: 0.9,
          shadowRadius: 4,
        }}
      />,
    )
  }
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{sparks}</View>
}

/* Ready medallion — dramatic celebration:
 * 1) three expanding green halo rings ripple outward in a continuous loop
 * 2) a radial spark burst flings gold slivers outward once on arrival
 * 3) the green gradient medallion springs in and the check icon pops with a
 *    secondary over-shoot so the "done" moment feels tactile and earned
 * 4) a soft pulsing glow breathes underneath while it holds. */
function ReadyMedallion({ visible, compact }) {
  const scale = useRef(new Animated.Value(0.3)).current
  const op = useRef(new Animated.Value(0)).current
  const check = useRef(new Animated.Value(0)).current
  const breathe = useRef(new Animated.Value(0)).current
  const ring1 = useRef(new Animated.Value(0)).current
  const ring2 = useRef(new Animated.Value(0)).current
  const ring3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) return undefined
    scale.setValue(0.3)
    op.setValue(0)
    check.setValue(0)
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 120, friction: 7, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(220),
        Animated.spring(check, { toValue: 1, tension: 260, friction: 7, useNativeDriver: true }),
      ]),
    ]).start()

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    breatheLoop.start()

    const makeRingLoop = (v, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    )
    const r1 = makeRingLoop(ring1, 0)
    const r2 = makeRingLoop(ring2, 600)
    const r3 = makeRingLoop(ring3, 1200)
    r1.start(); r2.start(); r3.start()

    return () => {
      breatheLoop.stop()
      r1.stop(); r2.stop(); r3.stop()
    }
  }, [visible, scale, op, check, breathe, ring1, ring2, ring3])

  if (!visible) return null
  const size = compact ? 62 : 84
  const checkScale = check.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1.3, 1] })
  const checkOp = check.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] })
  const glowOp = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] })
  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })

  const makeRing = (v, key) => {
    const rScale = v.interpolate({ inputRange: [0, 1], outputRange: [0.95, 2.1] })
    const rOp = v.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.55, 0] })
    return (
      <Animated.View
        key={key}
        pointerEvents="none"
        style={[
          cn.medallionRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: rScale }],
            opacity: rOp,
          },
        ]}
      />
    )
  }

  return (
    <Animated.View style={[cn.medallionWrap, { opacity: op, transform: [{ scale }] }]}>
      {makeRing(ring1, 'r1')}
      {makeRing(ring2, 'r2')}
      {makeRing(ring3, 'r3')}
      <Animated.View
        pointerEvents="none"
        style={[
          cn.medallionGlow,
          {
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: size,
            opacity: glowOp,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <SparkBurst visible={visible} compact={compact} />
      <View style={[cn.medallion, { width: size, height: size, borderRadius: size / 2 }]}>
        <LinearGradient
          colors={[GREEN_SOFT, GREEN, GREEN_DEEP]}
          start={{ x: 0.25, y: 0.1 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
        <Animated.View style={{ opacity: checkOp, transform: [{ scale: checkScale }] }}>
          <Ionicons name="checkmark-sharp" size={size * 0.56} color="#FFF" />
        </Animated.View>
      </View>
    </Animated.View>
  )
}

/* Did-you-know chip — retained on request, dark glass variant. */
export function PlanLoadingFactStrip({ compact }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * BAHRAIN_FACTS.length))
  const fade = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 240, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return
        setIndex((i) => (i + 1) % BAHRAIN_FACTS.length)
        requestAnimationFrame(() => {
          Animated.timing(fade, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
        })
      })
    }, 7500)
    return () => clearInterval(id)
  }, [fade])

  const fact = BAHRAIN_FACTS[index]
  return (
    <View style={[cn.fact, compact && cn.factCompact]}>
      <Ionicons name="sparkles" size={compact ? 12 : 14} color={GOLD} />
      <Animated.Text
        numberOfLines={compact ? 2 : 3}
        style={[cn.factText, compact && cn.factTextCompact, { opacity: fade }]}
      >
        {fact}
      </Animated.Text>
    </View>
  )
}

/* Backwards-compatible stub. */
export function LoadingStepCard() {
  return null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step progress derivation — same contract as before.
 * 0: initial · 1: places done · 2: places+dining done · 3: all done
 * ──────────────────────────────────────────────────────────────────────────── */
const MIN_STEP_MS = 2000

function useDerivedStepProgress({ loadingStatus, showSuccess }) {
  const rawCompleted = useMemo(() => {
    if (showSuccess) return 3
    const s = (loadingStatus || '').toLowerCase()
    if (s.includes('crafting') || s.includes('building') || s.includes('stitch')) return 2
    if (s.includes('shortlisting') || s.includes('restaurant') || s.includes('food') || s.includes('breakfast') || s.includes('event') || s.includes('café')) return 1
    return 0
  }, [loadingStatus, showSuccess])

  const [completed, setCompleted] = useState(0)
  const stepDoneAt = useRef([0, 0, 0, 0])

  useEffect(() => {
    if (rawCompleted <= completed) return
    const now = Date.now()
    const nextIdx = completed
    if (stepDoneAt.current[nextIdx] === 0) stepDoneAt.current[nextIdx] = now
    const elapsed = now - stepDoneAt.current[nextIdx]
    const wait = Math.max(0, MIN_STEP_MS - elapsed)
    const t = setTimeout(() => {
      setCompleted((c) => Math.min(rawCompleted, c + 1))
    }, wait)
    return () => clearTimeout(t)
  }, [rawCompleted, completed])

  return completed
}

/* ────────────────────────────────────────────────────────────────────────────
 * Modal (full‑screen glass card) variant — cinematic hero with overlay content.
 * ──────────────────────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────────────────────
 * PlanCinematicShell — reusable backdrop for any plan-flow surface:
 *   • drifting Ken‑Burns photo stage from `photos` (spotPreviews)
 *   • film‑frame viewfinder corners
 *   • top LIVE badge pill (customizable label; becomes green when `ready`)
 * Children render in the foreground with a dark, cinema-legible canvas below.
 * ──────────────────────────────────────────────────────────────────────────── */
export function PlanCinematicShell({ photos, label = 'LIVE CURATION', ready = false, compact = false, children, style }) {
  return (
    <View style={[cn.stageOuter, style]}>
      <View style={cn.stage}>
        <CinematicPhotoStage photos={photos} compact={compact} />
        <ViewfinderCorners compact={compact} />
        <View style={cn.topRow} pointerEvents="box-none">
          <CinematicBadge ready={ready} label={label} compact={compact} />
        </View>
        {children}
      </View>
    </View>
  )
}

/* LiveBadge with a custom label (reuses the existing pulse + green-ready state). */
function CinematicBadge({ ready, label, compact }) {
  const pulse = useRef(new Animated.Value(0)).current
  const readyPop = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (ready) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 820, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 820, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse, ready])

  useEffect(() => {
    if (!ready) { readyPop.setValue(0); return }
    Animated.spring(readyPop, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }).start()
  }, [ready, readyPop])

  const op = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] })
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] })
  const readyScale = readyPop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.7, 1.15, 1] })

  return (
    <Animated.View
      style={[
        cn.liveBadge,
        compact && cn.liveBadgeCompact,
        ready && cn.liveBadgeReady,
        ready && { transform: [{ scale: readyScale }] },
      ]}
    >
      {ready ? (
        <>
          <View style={[cn.liveDot, { backgroundColor: '#FFFFFF' }]} />
          <Text style={[cn.liveText, { color: '#FFFFFF' }]}>READY</Text>
        </>
      ) : (
        <>
          <Animated.View style={[cn.liveDot, { transform: [{ scale }], opacity: op }]} />
          <Text style={cn.liveText}>{label}</Text>
        </>
      )}
    </Animated.View>
  )
}

export function PlanModalLoadingView({ loadingStatus, showSuccess, spotPreviews }) {
  const completed = useDerivedStepProgress({ loadingStatus, showSuccess })
  const enter = useRef(new Animated.Value(0)).current
  const cardPulse = useRef(new Animated.Value(0)).current
  const ready = showSuccess && completed >= 3
  const activeIdx = Math.min(completed, 2)

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [enter])

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cardPulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(cardPulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [cardPulse])

  const progress = ready ? 1 : Math.max(0.06, completed / 3)
  const cardScale = cardPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] })
  const cardFloat = cardPulse.interpolate({ inputRange: [0, 1], outputRange: [0, -6] })

  return (
    <View style={cn.stageOuter}>
      <View style={cn.stage}>
        <CinematicPhotoStage photos={spotPreviews} />
        <ViewfinderCorners />

        <View style={cn.topRow} pointerEvents="none">
          <LiveBadge ready={ready} />
        </View>

        <View style={cn.centerLayer} pointerEvents="none">
          <Animated.View
            style={[
              cn.bottomBlock,
              {
                opacity: enter,
                transform: [
                  {
                    translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }),
                  },
                  { translateY: cardFloat },
                  { scale: cardScale },
                ],
              },
            ]}
          >
            {!ready && (
              <LiveThumbStrip photos={spotPreviews} ready={ready} />
            )}

            <View style={cn.bottomCopy}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <MorphingTitle step={activeIdx} showSuccess={ready} />
              </View>
              {ready && <ReadyMedallion visible={ready} />}
            </View>

            <ProgressBar progress={progress} ready={ready} />
            <StepRow completed={completed} activeIndex={activeIdx} ready={ready} />

            <PlanLoadingFactStrip compact />
          </Animated.View>
        </View>
      </View>
    </View>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Drawer sheet (compact) variant — same cinematic language, tight.
 * ──────────────────────────────────────────────────────────────────────────── */
export function PlanDrawerLoadingPanel({ loading, loadingStatus, spotPreviews }) {
  const completed = useDerivedStepProgress({ loadingStatus, showSuccess: !loading })
  const ready = !loading && completed >= 3
  const activeIdx = Math.min(completed, 2)
  const progress = ready ? 1 : Math.max(0.06, completed / 3)

  return (
    <View style={cn.sheetOuter}>
      <CinematicPhotoStage photos={spotPreviews} compact />
      <ViewfinderCorners compact />

      <View style={cn.sheetTop} pointerEvents="none">
        <LiveBadge ready={ready} compact />
      </View>

      <View style={cn.sheetBottom}>
        {!ready && <LiveThumbStrip photos={spotPreviews} compact ready={ready} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <MorphingTitle step={activeIdx} showSuccess={ready} compact />
          </View>
          {ready && <ReadyMedallion visible={ready} compact />}
        </View>
        <ProgressBar progress={progress} ready={ready} compact />
        <StepRow completed={completed} activeIndex={activeIdx} ready={ready} compact />
      </View>
    </View>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles.
 * ──────────────────────────────────────────────────────────────────────────── */
const cn = StyleSheet.create({
  stageOuter: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    borderRadius: 22,
    overflow: 'hidden',
  },
  stage: {
    flex: 1,
    width: '100%',
    backgroundColor: INK,
    overflow: 'hidden',
    borderRadius: 22,
    position: 'relative',
  },
  topRow: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBlock: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 16,
    backgroundColor: 'rgba(7,6,10,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 10 },
    }),
  },
  centerLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 16,
  },
  bottomCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    lineHeight: 34,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  titleCompact: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.2,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: INK_GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  liveBadgeCompact: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  liveBadgeReady: {
    backgroundColor: GREEN,
    borderColor: GREEN_SOFT,
    ...Platform.select({
      ios: { shadowColor: GREEN, shadowOpacity: 0.85, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 8 },
    }),
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF4D5C',
    shadowColor: '#FF4D5C',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  liveText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.6,
    color: '#FFFFFF',
  },
  thumbStrip: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  thumbStripCompact: {
    gap: 6,
  },
  thumb: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
    }),
  },
  progressWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  progressGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
    backgroundColor: GREEN,
    ...Platform.select({
      ios: { shadowColor: GREEN, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 6 },
    }),
  },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  progressTick: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    zIndex: 1,
  },
  progressFill: {
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: GOLD, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 3 },
    }),
  },
  progressShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 48,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    position: 'relative',
  },
  stepChipCompact: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    gap: 4,
  },
  stepChipActive: {
    backgroundColor: 'rgba(233,200,119,0.18)',
    borderColor: 'rgba(233,200,119,0.65)',
    ...Platform.select({
      ios: { shadowColor: GOLD, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 3 },
    }),
  },
  stepChipDone: {
    backgroundColor: GREEN,
    borderColor: GREEN_SOFT,
    ...Platform.select({
      ios: { shadowColor: GREEN, shadowOpacity: 0.75, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 5 },
    }),
  },
  stepChipShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.7)',
  },
  stepLabelCompact: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  medallionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  medallion: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: GREEN, shadowOpacity: 0.9, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 10 },
    }),
  },
  medallionGlow: {
    position: 'absolute',
    backgroundColor: GREEN,
    ...Platform.select({
      ios: { shadowColor: GREEN, shadowOpacity: 0.9, shadowRadius: 28, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 12 },
    }),
    opacity: 0.45,
  },
  medallionRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: GREEN,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  factCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  factText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  factTextCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  sheetOuter: {
    width: '100%',
    minHeight: 200,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: INK,
    position: 'relative',
  },
  sheetTop: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  sheetBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 8,
    zIndex: 2,
  },
})
