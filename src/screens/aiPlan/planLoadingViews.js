import React, { useRef, useEffect, useState, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Image,
  Animated,
  Easing,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { CachedImage } from '../../components/CachedImage'
import { resolvePublicImageUrl } from '../../utils/imageUrl'
import { BAHRAIN_FACTS } from './constants'
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_MEDIUM,
} from '../../constants/brandFont'

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

const KHALID_AVATAR = require('../../../assets/khalid.png')
const KHALID_BADGE_ACTIVE = 'KHALID · PREPARING YOUR DAY'
const KHALID_BADGE_READY = 'KHALID · READY'

const STEP_LABELS = [
  { key: 'places', label: 'Places', icon: 'compass-outline' },
  { key: 'dining', label: 'Dining', icon: 'restaurant-outline' },
  { key: 'route', label: 'Route', icon: 'git-branch-outline' },
]

const pickSpotLabel = (item) => {
  const raw = item?.name || item?.title || item?.spot || item?.client_name || ''
  return String(raw || '').trim()
}

/** Rotating “Khalid is…” lines per phase — one visible at a time. */
const KHALID_WORKING_LINES = [
  [
    'Khalid is finding where you are…',
    'Khalid is mapping your starting point…',
  ],
  [
    'Khalid is finding the best spots…',
    'Khalid is reading what locals love…',
    'Khalid is shortlisting gems for you…',
  ],
  [
    'Khalid is matching food to your taste…',
    'Khalid is building your perfect route…',
    'Khalid is putting your day together…',
  ],
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

/* Khalid agent row — avatar, name, and a soft “thinking” pulse while the plan loads. */
function KhalidTypingDots({ compact }) {
  const d0 = useRef(new Animated.Value(0.35)).current
  const d1 = useRef(new Animated.Value(0.35)).current
  const d2 = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    const dot = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.35, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
      )
    const loops = [dot(d0, 0), dot(d1, 140), dot(d2, 280)]
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [d0, d1, d2])

  const size = compact ? 4 : 5
  const gap = compact ? 3 : 4
  return (
    <View style={[cn.khalidDots, { gap }]}>
      {[d0, d1, d2].map((op, i) => (
        <Animated.View
          key={i}
          style={[
            cn.khalidDot,
            { width: size, height: size, borderRadius: size / 2, opacity: op },
          ]}
        />
      ))}
    </View>
  )
}

function KhalidOrbitRing({ compact, ready, avatarSize }) {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (ready) return undefined
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: compact ? 4200 : 5200, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [spin, ready, compact])

  if (ready) return null
  const size = avatarSize || (compact ? 52 : 64)
  const wrapSize = size + (compact ? 24 : 30)
  const orbitSize = size + (compact ? 16 : 20)
  const orbitInset = (wrapSize - orbitSize) / 2
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        cn.khalidOrbit,
        {
          top: orbitInset,
          left: orbitInset,
          width: orbitSize,
          height: orbitSize,
          borderRadius: orbitSize / 2,
          transform: [{ rotate }],
        },
      ]}
    />
  )
}

function ProgressHeader({ progress, ready, compact }) {
  const pct = Math.min(100, Math.max(ready ? 100 : 5, Math.floor(progress * 100)))
  return (
    <View style={cn.progressHeader}>
      <Text style={[cn.progressHeaderLabel, compact && cn.progressHeaderLabelCompact]}>
        {ready ? 'Complete' : 'Your plan'}
      </Text>
      <View style={[cn.progressPctPill, ready && cn.progressPctPillReady]}>
        <Text style={[cn.progressPctText, compact && cn.progressPctTextCompact]}>{pct}%</Text>
      </View>
    </View>
  )
}

/** Centered Khalid avatar — single identity block, no status copy here. */
function PlanLoadingHero({ compact, ready }) {
  const breathe = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (ready) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [breathe, ready])

  const ringScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
  const ringOp = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] })
  const avatarSize = compact ? 52 : 64
  const wrapSize = avatarSize + (compact ? 24 : 30)

  return (
    <View style={[cn.heroCenter, compact && cn.heroCenterCompact]}>
      <View style={[cn.khalidAvatarOuter, { width: wrapSize, height: wrapSize }]}>
        <KhalidOrbitRing compact={compact} ready={ready} avatarSize={avatarSize} />
        {!ready ? (
          <Animated.View
            pointerEvents="none"
            style={[
              cn.khalidAvatarRing,
              {
                position: 'absolute',
                top: (wrapSize - avatarSize - 10) / 2,
                left: (wrapSize - avatarSize - 10) / 2,
                width: avatarSize + 10,
                height: avatarSize + 10,
                borderRadius: (avatarSize + 10) / 2,
                opacity: ringOp,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
        ) : null}
        <Image
          source={KHALID_AVATAR}
          style={[cn.khalidAvatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
          resizeMode="cover"
          accessibilityLabel="Khalid, your AI tourist guide"
        />
      </View>
      <Text style={[cn.heroName, compact && cn.heroNameCompact]}>Khalid</Text>
      {!ready ? <KhalidTypingDots compact={compact} /> : null}
      <Text style={[cn.heroRole, compact && cn.heroRoleCompact]}>Your AI guide · Bahrain</Text>
    </View>
  )
}

/** Single rotating status — “Khalid is finding the best…” with a working pulse bar. */
function KhalidWorkingStatus({ step, ready, compact, spotPreviews }) {
  const fade = useRef(new Animated.Value(1)).current
  const ty = useRef(new Animated.Value(0)).current
  const scan = useRef(new Animated.Value(0)).current
  const dotPulse = useRef(new Animated.Value(0)).current
  const [mountedStep, setMountedStep] = useState(step)
  const [lineIdx, setLineIdx] = useState(0)

  const spotNames = useMemo(
    () => [...new Set((spotPreviews || []).map(pickSpotLabel).filter((n) => n.length > 1))].slice(0, 10),
    [spotPreviews],
  )

  const lines = useMemo(() => {
    const base = KHALID_WORKING_LINES[Math.min(mountedStep, KHALID_WORKING_LINES.length - 1)] || KHALID_WORKING_LINES[0]
    if (mountedStep === 1 && spotNames.length > 0) {
      const pick = spotNames[lineIdx % spotNames.length]
      return [...base, `Khalid is weighing ${pick}…`]
    }
    return base
  }, [mountedStep, spotNames, lineIdx])

  const currentLine = lines[lineIdx % lines.length] || lines[0]

  useEffect(() => {
    setLineIdx(0)
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 6, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return
      setMountedStep(step)
      ty.setValue(-6)
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start()
    })
  }, [step, fade, ty])

  useEffect(() => {
    if (ready) return undefined
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return
        setLineIdx((i) => (i + 1) % lines.length)
        requestAnimationFrame(() => {
          Animated.timing(fade, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
        })
      })
    }, compact ? 2600 : 3000)
    return () => clearInterval(id)
  }, [ready, fade, lines.length, compact])

  useEffect(() => {
    if (ready) return undefined
    const scanLoop = Animated.loop(
      Animated.timing(scan, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
    )
    const dotLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    scanLoop.start()
    dotLoop.start()
    return () => {
      scanLoop.stop()
      dotLoop.stop()
    }
  }, [ready, scan, dotPulse])

  const scanX = scan.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] })
  const dotOp = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
  const dotScale = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] })

  if (ready) {
    return (
      <View style={cn.phaseCenter}>
        <Text style={[cn.khalidWorkingDone, compact && cn.khalidWorkingDoneCompact]}>Khalid lined up your day</Text>
        <Text style={[cn.title, compact && cn.titleCompact]}>Your day is ready</Text>
        <Text style={[cn.subtitle, compact && cn.subtitleCompact]}>Swipe up to begin</Text>
      </View>
    )
  }

  return (
    <View style={[cn.khalidWorkingWrap, compact && cn.khalidWorkingWrapCompact]}>
      <View style={[cn.khalidWorkingPill, compact && cn.khalidWorkingPillCompact]}>
        <Animated.View
          style={[
            cn.khalidWorkingDot,
            { opacity: dotOp, transform: [{ scale: dotScale }] },
          ]}
        />
        <Text style={[cn.khalidWorkingPillText, compact && cn.khalidWorkingPillTextCompact]}>Khalid is working</Text>
      </View>

      <Animated.Text
        style={[
          cn.khalidWorkingLine,
          compact && cn.khalidWorkingLineCompact,
          { opacity: fade, transform: [{ translateY: ty }] },
        ]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.88}
      >
        {currentLine}
      </Animated.Text>

      <View style={[cn.khalidWorkingBar, compact && cn.khalidWorkingBarCompact]}>
        <Animated.View style={[cn.khalidWorkingBarScan, { transform: [{ translateX: scanX }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(233,200,119,0.15)', GOLD_SOFT, 'rgba(233,200,119,0.15)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  )
}

function PlanLoadingReady({ compact }) {
  return (
    <View style={cn.readyCenter}>
      <ReadyMedallion visible compact={compact} />
    </View>
  )
}

function PlanLoadingProgressBlock({ progress, ready, completed, activeIdx, compact }) {
  return (
    <View style={[cn.progressBlock, compact && cn.progressBlockCompact]}>
      <ProgressHeader progress={progress} ready={ready} compact={compact} />
      <ProgressBar progress={progress} ready={ready} compact={compact} />
      <StepRow
        completed={completed}
        activeIndex={activeIdx}
        ready={ready}
        compact={compact}
        visualProgress={progress}
      />
    </View>
  )
}

/* Live‑indicator badge — pulsing dot with Khalid-at-work label. */
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
          <Text style={[cn.liveText, { color: '#FFFFFF' }]}>{KHALID_BADGE_READY}</Text>
        </>
      ) : (
        <>
          <Animated.View style={[cn.liveDot, { transform: [{ scale }], opacity: op }]} />
          <Text style={cn.liveText}>{KHALID_BADGE_ACTIVE}</Text>
        </>
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

/** Compact step node — icon circle + label, fits equal thirds inside the card. */
function StepNode({ step, isDone, isActive, compact }) {
  const pop = useRef(new Animated.Value(1)).current
  const pulse = useRef(new Animated.Value(0)).current
  const prevDone = useRef(false)
  const circleSize = compact ? 34 : 40

  useEffect(() => {
    if (isDone && !prevDone.current) {
      prevDone.current = true
      pop.setValue(0.82)
      Animated.spring(pop, { toValue: 1, tension: 200, friction: 7, useNativeDriver: true }).start()
    }
    if (!isDone) prevDone.current = false
  }, [isDone, pop])

  useEffect(() => {
    if (!isActive || isDone) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [isActive, isDone, pulse])

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
  const ringOp = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] })

  return (
    <View style={cn.stepNodeWrap}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <View style={[cn.stepNodeCircleWrap, { width: circleSize + 12, height: circleSize + 12 }]}>
          {isActive && !isDone ? (
            <Animated.View
              pointerEvents="none"
              style={[
                cn.stepNodeRing,
                {
                  width: circleSize + 10,
                  height: circleSize + 10,
                  borderRadius: (circleSize + 10) / 2,
                  top: 1,
                  left: 1,
                  opacity: ringOp,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
          ) : null}
          <View
            style={[
              cn.stepNodeCircle,
              { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
              isActive && !isDone && cn.stepNodeCircleActive,
              isDone && cn.stepNodeCircleDone,
            ]}
          >
          <Ionicons
            name={isDone ? 'checkmark-sharp' : step.icon}
            size={compact ? 15 : 17}
            color={isDone ? '#FFFFFF' : isActive ? GOLD_SOFT : 'rgba(255,255,255,0.5)'}
          />
          </View>
        </View>
      </Animated.View>
      <Text
        style={[
          cn.stepNodeLabel,
          compact && cn.stepNodeLabelCompact,
          isActive && !isDone && cn.stepNodeLabelActive,
          isDone && cn.stepNodeLabelDone,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {step.label}
      </Text>
    </View>
  )
}

function StepRow({ completed, activeIndex, compact, ready, visualProgress = 0 }) {
  const lineProgress = ready ? 1 : Math.min(1, Math.max(0.06, visualProgress))

  return (
    <View style={[cn.stepTrack, compact && cn.stepTrackCompact]}>
      <View style={[cn.stepTrackLineBg, compact && cn.stepTrackLineBgCompact]} pointerEvents="none">
        <View style={[cn.stepTrackLineFill, { width: `${lineProgress * 100}%` }]} />
      </View>
      {STEP_LABELS.map((s, i) => {
        const isDone = ready || i < completed
        const isActive = !ready && i === activeIndex
        return (
          <View key={s.key} style={cn.stepTrackSlot}>
            <StepNode step={s} isDone={isDone} isActive={isActive} compact={compact} />
          </View>
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
  const size = compact ? 56 : 76
  const halo = size * 2.15
  const checkScale = check.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1.3, 1] })
  const checkOp = check.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] })
  const glowOp = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] })
  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })
  const ringOrigin = (halo - size) / 2

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
            top: ringOrigin,
            left: ringOrigin,
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
    <Animated.View
      style={[
        cn.medallionSlot,
        { width: halo, height: halo, opacity: op, transform: [{ scale }] },
      ]}
    >
      {makeRing(ring1, 'r1')}
      {makeRing(ring2, 'r2')}
      {makeRing(ring3, 'r3')}
      <Animated.View
        pointerEvents="none"
        style={[
          cn.medallionGlow,
          {
            top: (halo - size * 1.6) / 2,
            left: (halo - size * 1.6) / 2,
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: size,
            opacity: glowOp,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SparkBurst visible={visible} compact={compact} />
      </View>
      <View
        style={[
          cn.medallion,
          {
            position: 'absolute',
            top: ringOrigin,
            left: ringOrigin,
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <LinearGradient
          colors={[GREEN_SOFT, GREEN, GREEN_DEEP]}
          start={{ x: 0.25, y: 0.1 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
        <Animated.View style={[cn.medallionCheck, { opacity: checkOp, transform: [{ scale: checkScale }] }]}>
          <Ionicons name="checkmark-sharp" size={size * 0.5} color="#FFF" />
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
    <View style={[cn.factSection, compact && cn.factSectionCompact]}>
      <Text
        style={[cn.factSectionTitle, compact && cn.factSectionTitleCompact]}
        accessibilityRole="header"
      >
        While Khalid works
      </Text>
      <View style={[cn.fact, compact && cn.factCompact]}>
        <Image
          source={KHALID_AVATAR}
          style={[cn.factAvatar, compact && cn.factAvatarCompact]}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Animated.Text
          numberOfLines={compact ? 3 : 4}
          style={[cn.factText, compact && cn.factTextCompact, { opacity: fade }]}
        >
          {fact}
        </Animated.Text>
      </View>
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

/** Smooth 0–1 progress — creeps between phase floors/ceilings so % never stalls (e.g. at 67%). */
function useSmoothPlanProgress({ completed, ready }) {
  const [progress, setProgress] = useState(0.06)

  useEffect(() => {
    if (!ready) return
    setProgress(1)
  }, [ready])

  useEffect(() => {
    if (ready) return
    const floors = [0.06, 0.34, 0.56]
    const floor = floors[Math.min(completed, 2)] ?? 0.06
    setProgress((p) => (p < floor ? floor : p))
  }, [completed, ready])

  useEffect(() => {
    if (ready) return undefined
    const tickMs = 160
    const id = setInterval(() => {
      setProgress((p) => {
        const phase = Math.min(completed, 2)
        const ceiling = phase === 0 ? 0.34 : phase === 1 ? 0.56 : 0.94
        const creep = phase === 2 ? 0.0038 : phase === 1 ? 0.0085 : 0.012
        const bumped = p + creep
        if (bumped >= ceiling) return ceiling
        return bumped
      })
    }, tickMs)
    return () => clearInterval(id)
  }, [completed, ready])

  return ready ? 1 : progress
}

function useDerivedStepProgress({ loadingStatus, showSuccess }) {
  const rawCompleted = useMemo(() => {
    if (showSuccess) return 3
    const s = (loadingStatus || '').toLowerCase()
    if (
      s.includes('crafting') ||
      s.includes('building') ||
      s.includes('stitch') ||
      s.includes('sequencing') ||
      s.includes('perfect day') ||
      s.includes('putting your day') ||
      s.includes('route')
    ) return 2
    if (
      s.includes('shortlisting') ||
      s.includes('scouting') ||
      s.includes('restaurant') ||
      s.includes('food') ||
      s.includes('breakfast') ||
      s.includes('event') ||
      s.includes('café') ||
      s.includes('venues') ||
      s.includes('live posts')
    ) return 1
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
export function PlanCinematicShell({ photos, label = KHALID_BADGE_ACTIVE, ready = false, compact = false, children, style }) {
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
          <Text style={[cn.liveText, { color: '#FFFFFF' }]}>{KHALID_BADGE_READY}</Text>
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

function PlanLoadingBody({
  compact,
  ready,
  spotPreviews,
  completed,
  activeIdx,
  enterAnim,
}) {
  const enterY = enterAnim?.interpolate?.({ inputRange: [0, 1], outputRange: [20, 0] }) ?? 0
  const visualProgress = useSmoothPlanProgress({ completed, ready })

  const inner = (
    <View style={[cn.loadingCard, compact && cn.loadingCardCompact]}>
      {ready ? (
        <PlanLoadingReady compact={compact} />
      ) : (
        <>
          <PlanLoadingHero compact={compact} ready={false} />
          <LiveThumbStrip photos={spotPreviews} ready={false} compact={compact} />
        </>
      )}

      <KhalidWorkingStatus step={activeIdx} ready={ready} compact={compact} spotPreviews={spotPreviews} />

      <PlanLoadingProgressBlock
        progress={visualProgress}
        ready={ready}
        completed={completed}
        activeIdx={activeIdx}
        compact={compact}
      />

      {!ready ? <PlanLoadingFactStrip compact={compact} /> : null}
    </View>
  )

  if (enterAnim) {
    return (
      <Animated.View style={{ opacity: enterAnim, transform: [{ translateY: enterY }], width: '100%', alignItems: 'center' }}>
        {inner}
      </Animated.View>
    )
  }

  return inner
}

export function PlanModalLoadingView({ loadingStatus, showSuccess, spotPreviews }) {
  const completed = useDerivedStepProgress({ loadingStatus, showSuccess })
  const enter = useRef(new Animated.Value(0)).current
  const ready = showSuccess && completed >= 3
  const activeIdx = Math.min(completed, 2)

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [enter])

  return (
    <View style={cn.stageOuter}>
      <View style={cn.stage}>
        <CinematicPhotoStage photos={spotPreviews} />
        <ViewfinderCorners />

        <View style={cn.topRow} pointerEvents="none">
          <LiveBadge ready={ready} />
        </View>

        <View style={cn.centerLayer} pointerEvents="box-none">
          <PlanLoadingBody
            ready={ready}
            spotPreviews={spotPreviews}
            completed={completed}
            activeIdx={activeIdx}
            enterAnim={enter}
          />
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
  return (
    <View style={cn.sheetOuter}>
      <CinematicPhotoStage photos={spotPreviews} compact />
      <ViewfinderCorners compact />

      <View style={cn.sheetTop} pointerEvents="none">
        <LiveBadge ready={ready} compact />
      </View>

      <View style={cn.sheetCenter}>
        <PlanLoadingBody
          compact
          ready={ready}
          spotPreviews={spotPreviews}
          completed={completed}
          activeIdx={activeIdx}
        />
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
  centerLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 16,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(7,6,10,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 10 },
    }),
  },
  loadingCardCompact: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
    borderRadius: 18,
  },
  heroCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  heroCenterCompact: {
    gap: 6,
  },
  heroName: {
    fontSize: 20,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  heroNameCompact: {
    fontSize: 17,
  },
  heroRole: {
    fontSize: 12,
    fontFamily: FONT_POPPINS_MEDIUM,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  heroRoleCompact: {
    fontSize: 11,
  },
  phaseCenter: {
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  khalidWorkingWrap: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  khalidWorkingWrapCompact: {
    gap: 8,
  },
  khalidWorkingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(233,200,119,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(233,200,119,0.4)',
  },
  khalidWorkingPillCompact: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 5,
  },
  khalidWorkingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF5C6A',
  },
  khalidWorkingPillText: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 1.4,
    color: GOLD_SOFT,
    textTransform: 'uppercase',
  },
  khalidWorkingPillTextCompact: {
    fontSize: 10,
    letterSpacing: 1.1,
  },
  khalidWorkingLine: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: FONT_POPPINS_MEDIUM,
    color: '#FFFFFF',
    textAlign: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 6,
  },
  khalidWorkingLineCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  khalidWorkingBar: {
    alignSelf: 'stretch',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  khalidWorkingBarCompact: {
    height: 2,
  },
  khalidWorkingBarScan: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 100,
    left: '50%',
    marginLeft: -50,
  },
  khalidWorkingDone: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_BOLD,
    color: GREEN_SOFT,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  khalidWorkingDoneCompact: {
    fontSize: 12,
  },
  readyCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 4,
  },
  progressBlock: {
    alignSelf: 'stretch',
    width: '100%',
    gap: 10,
  },
  progressBlockCompact: {
    gap: 8,
  },
  sheetCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 36,
    paddingBottom: 12,
    zIndex: 2,
  },
  medallionSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  medallionCheck: {
    alignItems: 'center',
    justifyContent: 'center',
    ...StyleSheet.absoluteFillObject,
  },
  title: {
    fontSize: 22,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFFFFF',
    letterSpacing: -0.4,
    lineHeight: 28,
    textAlign: 'center',
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
    fontFamily: FONT_POPPINS_MEDIUM,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.2,
    marginTop: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitleCompact: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  khalidAvatarOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  khalidOrbit: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(233,200,119,0.42)',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  progressHeaderLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 0.4,
    color: 'rgba(255,255,255,0.72)',
  },
  progressHeaderLabelCompact: {
    fontSize: 10,
  },
  progressPctPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(233,200,119,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(233,200,119,0.45)',
  },
  progressPctPillReady: {
    backgroundColor: 'rgba(52,211,153,0.2)',
    borderColor: 'rgba(167,243,208,0.55)',
  },
  progressPctText: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_BOLD,
    color: GOLD_SOFT,
    fontVariant: ['tabular-nums'],
  },
  progressPctTextCompact: {
    fontSize: 11,
  },
  khalidAvatarRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: GOLD_SOFT,
  },
  khalidAvatar: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: INK,
  },
  khalidDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  khalidDot: {
    backgroundColor: GOLD_SOFT,
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
    fontFamily: FONT_POPPINS_BOLD,
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
  stepTrack: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    position: 'relative',
    paddingTop: 6,
    paddingBottom: 2,
  },
  stepTrackCompact: {
    paddingTop: 4,
  },
  stepTrackLineBg: {
    position: 'absolute',
    left: '16.66%',
    right: '16.66%',
    top: 26,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  stepTrackLineBgCompact: {
    top: 23,
    height: 2,
  },
  stepTrackLineFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: GREEN,
  },
  stepTrackSlot: {
    flex: 1,
    minWidth: 0,
    maxWidth: '33.33%',
    alignItems: 'center',
    zIndex: 1,
  },
  stepNodeWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 6,
  },
  stepNodeCircleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stepNodeRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: GOLD_SOFT,
  },
  stepNodeCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  stepNodeCircleActive: {
    backgroundColor: 'rgba(233,200,119,0.2)',
    borderColor: GOLD,
    ...Platform.select({
      ios: { shadowColor: GOLD, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 4 },
    }),
  },
  stepNodeCircleDone: {
    backgroundColor: GREEN,
    borderColor: GREEN_SOFT,
    ...Platform.select({
      ios: { shadowColor: GREEN, shadowOpacity: 0.65, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 4 },
    }),
  },
  stepNodeLabel: {
    width: '100%',
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  stepNodeLabelCompact: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  stepNodeLabelActive: {
    color: GOLD_SOFT,
  },
  stepNodeLabelDone: {
    color: GREEN_SOFT,
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
    alignSelf: 'center',
  },
  factSection: {
    alignSelf: 'stretch',
    width: '100%',
    gap: 8,
    alignItems: 'center',
  },
  factSectionCompact: {
    gap: 6,
  },
  factSectionTitle: {
    alignSelf: 'stretch',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  factSectionTitleCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(7,6,10,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(233,200,119,0.28)',
  },
  factAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  factAvatarCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  factCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  factText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.92)',
    fontFamily: FONT_POPPINS_MEDIUM,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
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
})
