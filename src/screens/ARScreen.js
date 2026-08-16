import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
  Dimensions,
  Platform,
  Modal,
  ScrollView,
  Linking,
  Animated,
  Easing,
  Pressable,
  PanResponder,
  Vibration,
  Image,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Polygon } from 'react-native-svg'
import * as Location from 'expo-location'
import { Accelerometer } from 'expo-sensors'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRoute } from '@react-navigation/native'
import { fetchNearbyPOIs, fetchEvents, fetchPineconeARRecommended } from '../services/aiPipeline'
import {
  buildARPreferenceContext,
  buildARRetrievalQuery,
  buildLockedPlaceBriefFromPoi,
} from '../services/arKhalidGuide'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useAuth } from '../context/AuthContext'
import { useARKhalidGuide } from '../hooks/useARKhalidGuide'
import { useARKhalidInlineChat } from '../hooks/useARKhalidInlineChat'
import { normalizeViewerUType } from '../services/aiPipeline'
import ARKhalidGuidePanel, {
  estimateKhalidStripHeight,
  KHALID_PEEK_TAB_HEIGHT,
} from '../components/ar/ARKhalidGuidePanel'
import ClientProfileModal from '../components/ClientProfileModal'
import { colors as themeColors } from '../theme/designTokens'
import { LUXURY, luxuryElevated } from '../theme/luxuryPremium'
import { openGoogleMapsDirections } from '../utils/googleMapsDirections'
import { resolvePublicImageUrl } from '../utils/imageUrl'
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_MEDIUM,
  FONT_POPPINS_REGULAR,
  FONT_POPPINS_SEMIBOLD,
} from '../constants/brandFont'

const C = {
  accent: themeColors.primary,
  accentLight: '#E63950',
  text: '#FFFFFF',
  sub: 'rgba(255,255,255,0.85)',
  dimText: 'rgba(255,255,255,0.45)',
  card: 'rgba(12,12,18,0.88)',
  cardBorder: 'rgba(255,255,255,0.10)',
  glass: 'rgba(16,16,24,0.80)',
  glassBorder: 'rgba(255,255,255,0.07)',
  glow: 'rgba(230, 57, 80, 0.30)',
  busy: '#F59E0B',
  quiet: '#0EA5E9',
  landmark: '#A78BFA',
  event: '#F472B6',
  food: '#F59E0B',
  success: '#10B981',
}

const DOOR_W = Dimensions.get('window').width

const MODES = [
  { id: 'all', label: 'All', icon: 'globe-outline', color: C.accentLight },
  { id: 'places', label: 'Places', icon: 'business-outline', color: C.landmark },
  { id: 'restaurants', label: 'Food', icon: 'restaurant-outline', color: C.food },
  { id: 'events', label: 'Events', icon: 'calendar-outline', color: C.event },
]

const LANDMARK_HERITAGE = {
  'Bahrain Fort (Qal\'at al-Bahrain)': { fact: 'Ancient Dilmun capital and UNESCO World Heritage Site.', didYouKnow: 'Over 4,000 years of history — one of the most important archaeological sites in the Gulf.' },
  'Bahrain National Museum': { fact: 'The country\'s most popular attraction.', didYouKnow: 'Houses 6,000 years of Bahrain history with bilingual exhibits and a replica burial mound.' },
  'Al Fateh Grand Mosque': { fact: 'Bahrain\'s largest mosque.', didYouKnow: 'The dome is one of the world\'s largest fibreglass domes — open to visitors outside prayer times.' },
  'Bahrain World Trade Center': { fact: 'Iconic twin towers with integrated wind turbines.', didYouKnow: 'First skyscraper in the world to harness wind power for electricity.' },
  'Tree of Life': { fact: '400-year-old tree standing alone in the desert.', didYouKnow: 'No one knows how it survives — no visible water source for miles.' },
  'Bab Al Bahrain': { fact: 'Gateway to Manama Souq.', didYouKnow: 'Historic twin-arched entrance; the souq behind it is perfect for spices and gold.' },
  'Manama Souq': { fact: 'Traditional marketplace in the heart of Manama.', didYouKnow: 'Narrow streets, local crafts, and the best place for authentic Bahraini atmosphere.' },
  'Bahrain Pearling Trail': { fact: 'UNESCO World Heritage Site.', didYouKnow: 'Celebrates the historic pearling tradition that shaped the Gulf economy.' },
  'Beit Al Quran': { fact: 'Museum of Islamic calligraphy and Qurans.', didYouKnow: 'One of the finest collections of ancient Qurans in the region.' },
  'Al Areen Wildlife Park': { fact: 'Protected reserve with native wildlife and desert scenery.', didYouKnow: 'A quiet contrast to the city — gazelles, oryx, and walking trails in the southern governorate.' },
}

const CAMERA_FOV_DEG = 55

const PATH_CHEVRON_COUNT = 10
/** Base camera-plane tilt toward “floor”; device pitch adjusts on top via accelerometer */
const GROUND_PLANE_BASE_DEG = 66
const GROUND_PLANE_PIVOT_PX = 124
const GROUND_PERSPECTIVE = 580
/** Extra rotateX contributed by device tilt (degrees), clamped in effect */
const FLOOR_PITCH_COEFF = 0.52
const ALIGN_ANGLE_THRESHOLD_DEG = 12
const HOLO_BLEND = Platform.OS === 'ios' ? 'screen' : 'normal'
/** Hold this long, then pull down to lock a place marker (iOS only — Android uses long-press) */
const LOCK_HOLD_MS = 360
const LOCK_PULL_PX = 52
const HEADING_LPF = Platform.OS === 'android' ? 0.96 : 0.78
const HEADING_DEADZONE_DEG = Platform.OS === 'android' ? 2.2 : 0.45
const HEADING_MAX_STEP_DEG = Platform.OS === 'android' ? 1.25 : 6
const PITCH_DEADZONE_DEG = Platform.OS === 'android' ? 1.1 : 0.35
const SENSOR_EMIT_MS = Platform.OS === 'android' ? 120 : 40
const AR_DISPLAY_TICK_MS = Platform.OS === 'android' ? 33 : 16
const AR_DISPLAY_LERP = Platform.OS === 'android' ? 0.1 : 0.28
const AR_VIEW_RADIUS_SCALE = Platform.OS === 'android' ? 0.78 : 1
const AR_FOV_SHOW_PAD_DEG = Platform.OS === 'android' ? 14 : 0
const AR_FOV_HIDE_PAD_DEG = Platform.OS === 'android' ? 24 : 0
const AR_MARKER_SPRING = Platform.OS === 'android'
  ? { damping: 30, stiffness: 46, mass: 1.05, useNativeDriver: true }
  : { damping: 18, stiffness: 118, mass: 0.85, useNativeDriver: true }

const smoothHeadingStep = (prev, raw) => {
  let delta = raw - prev
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  if (Math.abs(delta) > HEADING_MAX_STEP_DEG) {
    delta = Math.sign(delta) * HEADING_MAX_STEP_DEG
  }
  const next = prev + delta * (1 - HEADING_LPF)
  return ((next % 360) + 360) % 360
}

const lerpHeading = (current, target, t) => {
  let delta = target - current
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  const next = current + delta * t
  return ((next % 360) + 360) % 360
}

const headingDeltaDeg = (a, b) => {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

const hexToRgba = (hex, alpha) => {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return `rgba(230,57,80,${alpha})`
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return `rgba(230,57,80,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const CHEVRON_BASE_SCALE = 1.22

const poiKeyOf = (p) => (p?.name != null && p?.lat != null ? `${String(p.name)}-${Number(p.lat)}` : '')

/** Bearing and heading alignment toward a geographic target */
const getNavTargeting = (target, userLat, userLng, headingDeg) => {
  if (!target || target.lat == null || target.lng == null || userLat == null || userLng == null) return null
  const dLon = ((target.lng - userLng) * Math.PI) / 180
  const y2 = Math.sin(dLon) * Math.cos((target.lat * Math.PI) / 180)
  const x2 =
    Math.cos((userLat * Math.PI) / 180) * Math.sin((target.lat * Math.PI) / 180) -
    Math.sin((userLat * Math.PI) / 180) * Math.cos((target.lat * Math.PI) / 180) * Math.cos(dLon)
  const bearing = ((Math.atan2(y2, x2) * 180) / Math.PI + 360) % 360
  const dLat = ((target.lat - userLat) * Math.PI) / 180
  const ha = Math.sin(dLat / 2) ** 2 + Math.cos((userLat * Math.PI) / 180) * Math.cos((target.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  const distKm = 6371 * 2 * Math.atan2(Math.sqrt(ha), Math.sqrt(1 - ha))
  const relBearing = (bearing - headingDeg + 360) % 360
  const angleOff = Math.min(relBearing, 360 - relBearing)
  const aligned = angleOff <= ALIGN_ANGLE_THRESHOLD_DEG
  const inView = angleOff <= CAMERA_FOV_DEG / 2
  return { bearing, distKm, relBearing, aligned, angleOff, inView }
}

/** When focus picked from UI without bearings, derive distance/bearing like navigate target */
const enrichPoiBearingsFromUser = (poi, userLat, userLng) => {
  if (!poi || poi.lat == null || poi.lng == null || userLat == null || userLng == null) return poi
  const dLat = ((poi.lat - userLat) * Math.PI) / 180
  const dLon = ((poi.lng - userLng) * Math.PI) / 180
  const a2 = Math.sin(dLat / 2) ** 2 + Math.cos((userLat * Math.PI) / 180) * Math.cos((poi.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
  const y2 = Math.sin(dLon) * Math.cos((poi.lat * Math.PI) / 180)
  const x2 =
    Math.cos((userLat * Math.PI) / 180) * Math.sin((poi.lat * Math.PI) / 180) -
    Math.sin((userLat * Math.PI) / 180) * Math.cos((poi.lat * Math.PI) / 180) * Math.cos(dLon)
  const bearing = ((Math.atan2(y2, x2) * 180) / Math.PI + 360) % 360
  return { ...poi, distanceKm: distKm, bearing }
}

const makeChevronFlowOpacity = (anim, index, count) => {
  const depth = count <= 1 ? 1 : 0.2 + 0.8 * (index / (count - 1))
  const lo = 0.26 + 0.32 * depth
  const hi = 0.48 + 0.44 * depth
  if (count <= 1) {
    return anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [lo, hi, lo], extrapolate: 'clamp' })
  }
  const peak = index / (count - 1)
  const half = 0.09
  return anim.interpolate({
    inputRange: [0, Math.max(0, peak - half), peak, Math.min(1, peak + half), 1],
    outputRange: [lo, lo, hi, lo, lo],
    extrapolate: 'clamp',
  })
}

const getPoiColor = (poi) => {
  if (poi._isLandmark || poi._type === 'landmark') return C.landmark
  if (poi._type === 'event') return C.event
  if (poi._type === 'restaurant') return C.food
  return C.accentLight
}

const getPoiIcon = (poi) => {
  if (poi._type === 'event') return 'calendar'
  if (poi._type === 'restaurant') return 'restaurant'
  if (poi._isLandmark || poi._type === 'landmark') return 'business'
  return 'location'
}

const getWalkingTime = (km) => {
  const mins = Math.round((km / 5) * 60)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const getDistText = (km) => km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`

const getIsBusy = (poi) => {
  const hour = new Date().getHours()
  if ((poi._type || '') !== 'restaurant') return null
  if ((hour >= 11 && hour <= 14) || (hour >= 19 && hour <= 22)) return true
  if (hour >= 14 && hour <= 17) return false
  return Math.random() > 0.5
}

/* ─── Scanning Loader ─── */
function ScanningLoader() {
  const ring1 = useRef(new Animated.Value(0.4)).current
  const ring2 = useRef(new Animated.Value(0.3)).current
  const ring3 = useRef(new Animated.Value(0.2)).current
  const iconSpin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const pulse = (anim, delay) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.2, duration: 1200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]))
    pulse(ring1, 0).start()
    pulse(ring2, 300).start()
    pulse(ring3, 600).start()
    Animated.loop(
      Animated.timing(iconSpin, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    ).start()
  }, [ring1, ring2, ring3, iconSpin])

  const spin = iconSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <View style={ls.wrap}>
      <Animated.View style={[ls.ring, ls.ring3, { opacity: ring3, transform: [{ scale: ring3.interpolate({ inputRange: [0.2, 1], outputRange: [0.6, 1.3] }) }] }]} />
      <Animated.View style={[ls.ring, ls.ring2, { opacity: ring2, transform: [{ scale: ring2.interpolate({ inputRange: [0.2, 1], outputRange: [0.7, 1.2] }) }] }]} />
      <Animated.View style={[ls.ring, ls.ring1, { opacity: ring1, transform: [{ scale: ring1.interpolate({ inputRange: [0.2, 1], outputRange: [0.8, 1.1] }) }] }]} />
      <Animated.View style={[ls.iconWrap, { transform: [{ rotate: spin }] }]}>
        <Ionicons name="scan-outline" size={36} color={C.accent} />
      </Animated.View>
      <Text style={ls.title}>Scanning area</Text>
      <Text style={ls.sub}>Discovering places around you</Text>
    </View>
  )
}

const ls = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.68)' },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: C.accent, backgroundColor: 'rgba(200,16,46,0.03)' },
  ring1: { width: 100, height: 100, borderRadius: 50 },
  ring2: { width: 140, height: 140, borderRadius: 70 },
  ring3: { width: 180, height: 180, borderRadius: 90 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  title: { color: '#FFF', fontSize: 18, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.4 },
  sub: { color: 'rgba(255,255,255,0.68)', fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, marginTop: 7 },
})

/* ─── POI Marker (hold, then pull ↓ to lock) ─── */
function POIMarker({
  poi,
  x,
  y,
  onPress,
  isNearest,
  index,
  locked,
  dimmed,
  onLockPoi,
  liveDistKm,
  onInteractionStart,
  onInteractionEnd,
}) {
  const anim = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(1)).current
  const posX = useRef(new Animated.Value(x)).current
  const posY = useRef(new Animated.Value(y)).current
  const didMountPosRef = useRef(false)
  const holdProgress = useRef(new Animated.Value(0)).current
  const pullY = useRef(new Animated.Value(0)).current
  const holdTimerRef = useRef(null)
  const armedRef = useRef(false)
  const didLockRef = useRef(false)
  const gesturePhaseRef = useRef('idle')
  const [gesturePhase, setGesturePhase] = useState('idle')
  const setPhase = useCallback((phase) => {
    if (gesturePhaseRef.current === phase) return
    gesturePhaseRef.current = phase
    setGesturePhase(phase)
  }, [])
  const poiColor = getPoiColor(poi)
  const icon = getPoiIcon(poi)
  const distKm = liveDistKm ?? poi.distanceKm
  /** iOS: hold + pull lock. Android: simple tap + long-press (PanResponder is unreliable on Android). */
  const useHoldPullLock = Boolean(onLockPoi) && !locked && Platform.OS === 'ios'

  useEffect(() => {
    if (!didMountPosRef.current) {
      didMountPosRef.current = true
      posX.setValue(x)
      posY.setValue(y)
      return
    }
    Animated.parallel([
      Animated.spring(posX, { toValue: x, ...AR_MARKER_SPRING }),
      Animated.spring(posY, { toValue: y, ...AR_MARKER_SPRING }),
    ]).start()
  }, [x, y, posX, posY])

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, damping: 14, stiffness: 120, delay: index * 40, useNativeDriver: true }).start()
  }, [anim, index])

  useEffect(() => {
    if (!locked) return
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]))
    p.start()
    return () => p.stop()
  }, [locked, pulse])

  const resetGesture = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    armedRef.current = false
    setPhase('idle')
    pullY.setValue(0)
    Animated.timing(holdProgress, { toValue: 0, duration: 100, useNativeDriver: false }).start()
  }, [holdProgress, pullY, setPhase])

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
  }, [])

  const commitLock = useCallback(() => {
    if (!onLockPoi || locked || didLockRef.current) return
    didLockRef.current = true
    if (Platform.OS !== 'web') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } catch { /* noop */ }
    }
    onLockPoi(poi)
    resetGesture()
  }, [onLockPoi, locked, poi, resetGesture])

  const handleCardPress = useCallback(() => {
    onPress?.(poi)
  }, [onPress, poi])

  const handlePressIn = useCallback(() => {
    onInteractionStart?.()
  }, [onInteractionStart])

  const handlePressOut = useCallback(() => {
    onInteractionEnd?.()
  }, [onInteractionEnd])

  const handleLongPressLock = useCallback(() => {
    if (!onLockPoi || locked) return
    if (Platform.OS !== 'web') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } catch { /* noop */ }
    }
    onLockPoi(poi)
  }, [onLockPoi, locked, poi])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => useHoldPullLock,
        onMoveShouldSetPanResponder: (_, g) => useHoldPullLock && (armedRef.current || Math.abs(g.dy) > 6),
        onPanResponderTerminationRequest: () => !armedRef.current,
        onPanResponderGrant: () => {
          if (!useHoldPullLock) return
          setPhase('holding')
          holdProgress.setValue(0)
          Animated.timing(holdProgress, { toValue: 1, duration: LOCK_HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start()
          holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null
            armedRef.current = true
            setPhase('armed')
            if (Platform.OS !== 'web') {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              } catch { /* noop */ }
            }
          }, LOCK_HOLD_MS)
        },
        onPanResponderMove: (_, g) => {
          if (!armedRef.current || !useHoldPullLock) return
          const dy = Math.max(0, g.dy)
          pullY.setValue(dy)
          setPhase('pulling')
          if (dy >= LOCK_PULL_PX) commitLock()
        },
        onPanResponderRelease: (_, g) => {
          const quickTap = !armedRef.current && Math.abs(g.dy) < 10 && Math.abs(g.dx) < 10
          resetGesture()
          if (quickTap && !didLockRef.current) onPress?.(poi)
          else didLockRef.current = false
        },
        onPanResponderTerminate: () => {
          resetGesture()
          didLockRef.current = false
        },
      }),
    [useHoldPullLock, commitLock, holdProgress, onPress, poi, pullY, resetGesture, setPhase],
  )

  const isGesturing = useHoldPullLock && gesturePhase !== 'idle'
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
  const scaleAnim = locked || isGesturing ? pulse : scale
  const zIndexCol = locked ? 50 : isGesturing ? 90 : dimmed ? 2 : 14 + (index % 5)
  const showPullHint = useHoldPullLock && (gesturePhase === 'armed' || gesturePhase === 'pulling')
  const holdRingOpacity = holdProgress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 1], extrapolate: 'clamp' })
  const pullFillH = pullY.interpolate({ inputRange: [0, LOCK_PULL_PX], outputRange: [4, LOCK_PULL_PX], extrapolate: 'clamp' })
  const pullIconY = pullY.interpolate({ inputRange: [0, LOCK_PULL_PX], outputRange: [0, LOCK_PULL_PX - 14], extrapolate: 'clamp' })

  return (
    <Animated.View
      style={[
        mk.wrap,
        dimmed && mk.wrapDimmed,
        dimmed && mk.wrapNoTouch,
        {
          opacity: anim,
          transform: [
            { translateX: posX },
            { translateY: posY },
            { scale: scaleAnim },
          ],
          zIndex: zIndexCol,
          ...Platform.select({
            android: { elevation: locked ? 50 : isGesturing ? 90 : dimmed ? 2 : 14 + (index % 5) },
            default: {},
          }),
        },
      ]}
      collapsable={false}
      {...(useHoldPullLock ? panResponder.panHandlers : {})}
    >
      {locked ? (
        <View pointerEvents="none" style={mk.lockedRing}>
          <View style={mk.lockedRingInner} />
        </View>
      ) : null}
      <View pointerEvents="none" style={[mk.pinHalo, { borderColor: hexToRgba(poiColor, locked ? 0.72 : 0.45) }]} />
      {(isNearest || locked || isGesturing) && (
        <View style={[mk.nearestGlow, { shadowColor: locked || showPullHint ? C.success : poiColor }]} />
      )}
      <View
        style={[
          mk.card,
          { shadowColor: poiColor },
          locked && mk.cardLocked,
          showPullHint && mk.cardArmed,
          isNearest && !locked && !showPullHint && { borderColor: `${poiColor}95` },
          poi._pineconeRecommended && !isNearest && !locked && !showPullHint && { borderColor: 'rgba(167,139,250,0.55)' },
        ]}
      >
        <Pressable
          style={mk.cardPressable}
          onPress={handleCardPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onLongPress={onLockPoi && !locked && !useHoldPullLock ? handleLongPressLock : undefined}
          delayLongPress={480}
          disabled={useHoldPullLock}
          hitSlop={Platform.OS === 'android' ? 10 : 4}
          android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: false }}
          accessibilityRole="button"
          accessibilityLabel={poi.name}
          accessibilityHint={
            useHoldPullLock
              ? 'Hold, then pull down to lock navigation to this place'
              : onLockPoi && !locked
                ? 'Tap for details. Long press to lock navigation.'
                : undefined
          }
        >
          {useHoldPullLock ? (
            <Animated.View
              pointerEvents="none"
              style={[mk.holdRing, { borderColor: hexToRgba(C.success, 0.9), opacity: holdRingOpacity }]}
            />
          ) : null}
          <View style={[mk.iconBg, { backgroundColor: `${poiColor}38` }]}>
            <Ionicons name={locked ? 'lock-closed' : showPullHint ? 'lock-closed-outline' : icon} size={15} color={locked || showPullHint ? C.success : poiColor} />
          </View>
          <View style={mk.textCol}>
            <Text style={mk.name} numberOfLines={1}>{poi.name}</Text>
            <Text style={[mk.dist, (locked || showPullHint) && { color: C.success }]}>{getDistText(distKm)}</Text>
          </View>
          {locked ? (
            <View style={mk.lockBadge}>
              <Ionicons name="lock-closed" size={8} color={C.success} />
              <Text style={mk.lockBadgeText}>LOCKED</Text>
            </View>
          ) : poi._pineconeRecommended ? (
            <View style={mk.aiBadge}>
              <Ionicons name="sparkles" size={9} color="#A78BFA" />
            </View>
          ) : null}
        </Pressable>
      </View>
      {showPullHint ? (
        <View style={mk.pullHintCol} pointerEvents="none">
          <View style={mk.pullTrack}>
            <Animated.View style={[mk.pullFill, { height: pullFillH }]} />
          </View>
          <Animated.View style={[mk.pullIconWrap, { transform: [{ translateY: pullIconY }] }]}>
            <Ionicons name="chevron-down" size={14} color={C.success} />
          </Animated.View>
          <Text style={mk.pullHintText}>Pull down to lock</Text>
        </View>
      ) : null}
      <View style={[mk.stem, { backgroundColor: locked || showPullHint ? `${C.success}90` : `${poiColor}90` }]} />
      <View style={[mk.pinDot, { backgroundColor: locked || showPullHint ? C.success : poiColor, borderColor: 'rgba(255,255,255,0.85)' }]} />
    </Animated.View>
  )
}

/* ─── Locked navigation screen indication ─── */
function LockedNavBeacon({ name, distText }) {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <View style={lkb.beaconWrap} pointerEvents="none">
      <Animated.View style={[lkb.beaconGlow, { opacity: pulse }]} />
      <View style={lkb.beaconPill}>
        <Ionicons name="navigate" size={14} color={C.success} />
        <Text style={lkb.beaconText} numberOfLines={1}>Navigating to {name}</Text>
        <Text style={lkb.beaconDist}>{distText}</Text>
      </View>
    </View>
  )
}

const lkb = StyleSheet.create({
  beaconWrap: { alignItems: 'center', paddingHorizontal: 16 },
  beaconGlow: {
    position: 'absolute',
    top: 4,
    left: 24,
    right: 24,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16,185,129,0.22)',
  },
  beaconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(8,14,24,0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(16,185,129,0.45)',
  },
  beaconText: { color: '#FFF', fontSize: 12, fontFamily: FONT_POPPINS_BOLD, flexShrink: 1 },
  beaconDist: { color: C.success, fontSize: 11, fontFamily: FONT_POPPINS_BOLD },
})

const mk = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  wrapDimmed: { opacity: 0.32 },
  wrapNoTouch: { pointerEvents: 'none' },
  pinHalo: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: 34,
    borderRadius: LUXURY.radiusMarkerPill + 10,
    borderWidth: 2,
    opacity: 0.64,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  nearestGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 8,
    borderRadius: LUXURY.radiusMarkerPill + 2,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.72, shadowRadius: 18 },
      android: { elevation: 0 },
    }),
  },
  card: {
    backgroundColor: 'rgba(9,12,22,0.88)',
    borderRadius: LUXURY.radiusMarkerPill + 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    ...luxuryElevated,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.42, shadowRadius: 18 },
      android: { elevation: 12 },
    }),
  },
  cardPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardLocked: { borderColor: `${C.success}cc`, borderWidth: 2.5 },
  cardArmed: { borderColor: `${C.success}88`, borderWidth: 2 },
  lockedRing: {
    position: 'absolute',
    top: -14,
    left: -14,
    right: -14,
    bottom: 20,
    borderRadius: LUXURY.radiusMarkerPill + 14,
    borderWidth: 2,
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  lockedRingInner: {
    ...StyleSheet.absoluteFillObject,
    margin: 4,
    borderRadius: LUXURY.radiusMarkerPill + 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  pullHintCol: { alignItems: 'center', marginTop: 4, minHeight: 58 },
  pullTrack: {
    width: 4,
    height: LOCK_PULL_PX,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginBottom: 2,
  },
  pullFill: { width: 4, borderRadius: 2, backgroundColor: C.success },
  pullIconWrap: { marginTop: -LOCK_PULL_PX + 8, marginBottom: 2 },
  pullHintText: { color: C.success, fontSize: 9, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.3 },
  iconBg: { width: 30, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  textCol: { flexDirection: 'column', gap: 2 },
  name: { color: '#FFF', fontSize: 12, fontFamily: FONT_POPPINS_BOLD, maxWidth: 118, letterSpacing: 0.15 },
  dist: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: FONT_POPPINS_BOLD },
  holdRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: LUXURY.radiusMarkerPill + 2,
    borderWidth: 2.5,
    margin: -2,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.45)',
  },
  lockBadgeText: { color: C.success, fontSize: 7, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.6 },
  aiBadge: {
    width: 18, height: 18, borderRadius: 6,
    backgroundColor: 'rgba(167,139,250,0.28)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.45)',
  },
  stem: { width: 3, height: 14, opacity: 0.9, borderRadius: 2, marginTop: -1 },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -2,
    borderWidth: 2,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
})

/* ─── Holographic ground-path chevrons (minimal nav HUD) ─── */
function HolographicVChevron({ baseColor, depthScale, animOpacity }) {
  const sz = CHEVRON_BASE_SCALE * depthScale
  const w = 40 * sz
  const h = 25 * sz
  const peakY = 1.2 * sz
  const leftX = w * 0.06
  const rightX = w * 0.94
  const baseY = h - 0.5
  const points = `${w / 2},${peakY} ${leftX},${baseY} ${rightX},${baseY}`
  const strokeGlow = hexToRgba(baseColor, 0.62)
  const strokeCore = hexToRgba(baseColor, 0.96)

  return (
    <Animated.View style={[pa.chevUnit, { opacity: animOpacity }]} pointerEvents="none" accessibilityElementsHidden>
      <View
        style={[
          pa.chevSvgGlow,
          {
            width: w,
            height: h,
            shadowColor: baseColor,
            ...Platform.select({
              ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.88, shadowRadius: 11 },
              android: { elevation: 0 },
            }),
          },
        ]}
      >
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Polygon points={points} fill="none" stroke={strokeGlow} strokeWidth={3.9 * sz} strokeLinejoin="miter" strokeLinecap="butt" opacity={0.68} />
          <Polygon points={points} fill="none" stroke={strokeCore} strokeWidth={1.45 * sz} strokeLinejoin="miter" strokeLinecap="butt" opacity={0.93} />
        </Svg>
      </View>
    </Animated.View>
  )
}

function PathArrowIndicator({ target, heading, userLat, userLng, isNavigation, isLocked, compactHud, style, floorPitchDeg = 0, onDismissNavigation, onDismissLock }) {
  const chevAnim = useRef(new Animated.Value(0)).current
  const mountAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!target) {
      Animated.timing(mountAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start()
      return
    }
    Animated.spring(mountAnim, { toValue: 1, damping: 14, stiffness: 110, useNativeDriver: true }).start()
    const chev = Animated.loop(
      Animated.timing(chevAnim, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true })
    )
    chev.start()
    return () => { chev.stop() }
  }, [target, chevAnim, mountAnim])

  const chevronCount = compactHud ? 7 : PATH_CHEVRON_COUNT
  const chevronOpacities = useMemo(
    () => Array.from({ length: chevronCount }, (_, i) => makeChevronFlowOpacity(chevAnim, i, chevronCount)),
    [chevAnim, chevronCount],
  )

  if (!target || userLat == null || userLng == null) return null

  const nav = getNavTargeting(target, userLat, userLng, heading)
  if (!nav) return null

  const relBearing = nav.relBearing
  const distKm = nav.distKm
  const turnDeg = Math.round(relBearing > 180 ? 360 - relBearing : relBearing)
  const turnDir = relBearing > 180 ? 'left' : 'right'
  const statusLine = isLocked && nav.aligned
    ? 'On course — keep walking'
    : isLocked
    ? nav.inView
      ? 'Walk toward the chevrons'
      : turnDeg < 20
      ? `Slightly ${turnDir}`
      : `Turn ${turnDeg}° ${turnDir}`
    : nav.aligned
    ? 'Locked on bearing'
    : nav.inView
    ? 'Straight ahead'
    : turnDeg < 20
    ? `Slightly ${turnDir}`
    : `Turn ${turnDeg}° ${turnDir}`

  const poiBase = isNavigation ? C.accent : isLocked ? C.success : getPoiColor(target)
  const poiColor = nav.aligned ? C.success : poiBase

  const floorTilt = GROUND_PLANE_BASE_DEG + Math.max(-16, Math.min(26, floorPitchDeg))

  return (
    <Animated.View pointerEvents="box-none" style={[pa.wrap, style, { transform: [{ scale: mountAnim }] }]}>
      <View style={[pa.groundAnchor, compactHud && pa.groundAnchorCompact]} pointerEvents="none">
        <View style={[pa.groundTint, compactHud && pa.groundTintCompact, { borderColor: hexToRgba(poiColor, 0.06) }]} pointerEvents="none" accessibilityElementsHidden />
        <View
          style={[
            pa.groundPlane,
            compactHud && pa.groundPlaneCompact,
            HOLO_BLEND !== 'normal' && Platform.OS === 'ios' ? { mixBlendMode: HOLO_BLEND } : null,
            {
              transform: [
                { perspective: GROUND_PERSPECTIVE },
                { translateY: GROUND_PLANE_PIVOT_PX },
                { rotateX: `${floorTilt}deg` },
                { translateY: -GROUND_PLANE_PIVOT_PX },
              ],
            },
          ]}
        >
          <View style={[pa.pathBearing, compactHud && pa.pathBearingCompact, { transform: [{ rotateZ: `${relBearing}deg` }] }]}>
            <View style={[pa.chevronStack, compactHud && pa.chevronStackCompact]}>
              {Array.from({ length: chevronCount }, (_, j) => {
                const i = chevronCount - 1 - j
                const op = chevronOpacities[i]
                const t = chevronCount <= 1 ? 1 : i / (chevronCount - 1)
                const depthScale = 0.38 + 0.62 * t
                return (
                  <HolographicVChevron
                    key={`chev-${i}`}
                    baseColor={poiColor}
                    depthScale={depthScale}
                    animOpacity={op}
                  />
                )
              })}
            </View>
          </View>
        </View>
      </View>

      {!compactHud ? (
        <View style={pa.hud}>
          <View style={[pa.navGlyph, { borderColor: hexToRgba(poiColor, 0.55), shadowColor: poiColor }]}>
            <Ionicons name="navigate" size={26} color={poiColor} style={{ opacity: 0.96, transform: [{ rotate: `${relBearing}deg` }] }} />
          </View>
          <View style={pa.info}>
            {target._pineconeRecommended && (
              <View style={pa.aiBadge}>
                <Ionicons name="sparkles" size={8} color="#A78BFA" />
                <Text style={pa.aiText}>AI Pick</Text>
              </View>
            )}
            <Text style={[pa.destName, { color: poiColor }]} numberOfLines={1}>{target.name}</Text>
            <Text style={[pa.statusLine, nav.aligned && pa.statusAligned]}>{statusLine}</Text>
            <View style={pa.distRow}>
              <Text style={pa.distTxt}>{getDistText(distKm)}</Text>
              <View style={pa.distDot} />
              <Text style={pa.distTxt}>{getWalkingTime(distKm)}</Text>
            </View>
          </View>
          {(isNavigation && onDismissNavigation) || (isLocked && onDismissLock) ? (
            <TouchableOpacity
              style={pa.navDismiss}
              onPress={isNavigation ? onDismissNavigation : onDismissLock}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={isNavigation ? 'Stop navigation' : 'Unlock destination'}
            >
              <Ionicons name={isLocked ? 'lock-open-outline' : 'close'} size={22} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  )
}

const pa = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 8,
  },
  groundAnchor: {
    width: '100%',
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  groundAnchorCompact: { minHeight: 118, marginBottom: 0 },
  groundTint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%',
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.02)',
    opacity: 0.5,
  },
  groundTintCompact: { height: '58%' },
  groundPlane: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    minHeight: 168,
  },
  groundPlaneCompact: { minHeight: 100, paddingBottom: 2 },
  pathBearing: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 312,
    minHeight: 156,
  },
  pathBearingCompact: { width: 260, minHeight: 96 },
  chevronStack: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 9,
    paddingBottom: 4,
  },
  chevronStackCompact: { gap: 6, paddingBottom: 0 },
  chevUnit: {
    alignItems: 'center',
  },
  chevSvgGlow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hud: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    maxWidth: 320,
  },
  navGlyph: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,10,20,0.72)',
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 14,
      },
      android: { elevation: 10 },
    }),
  },
  info: { flex: 1, alignItems: 'flex-start', paddingTop: 2 },
  navDismiss: { justifyContent: 'flex-start', paddingTop: 4, paddingLeft: 2, alignSelf: 'flex-start' },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(167,139,250,0.12)',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.20)',
    marginBottom: 3,
  },
  aiText: { color: '#A78BFA', fontSize: 8, fontFamily: FONT_POPPINS_BOLD },
  destName: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, maxWidth: 240, letterSpacing: 0.2 },
  statusLine: { color: C.sub, fontSize: 11, fontFamily: FONT_POPPINS_REGULAR, marginTop: 2 },
  statusAligned: { color: C.success, fontFamily: FONT_POPPINS_BOLD },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  distTxt: { color: C.dimText, fontSize: 10, fontFamily: FONT_POPPINS_SEMIBOLD },
  distDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: C.dimText, opacity: 0.5 },
})

/* ─── Radar Navigator ─── */
function RadarNavigator({ heading, basePois, maxDistanceKm, onSelectPoi, lockedPoiKey, topOffset, subdued }) {
  const sweepAnim = useRef(new Animated.Value(0)).current
  const centerPulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(sweepAnim, { toValue: 1, duration: 3500, easing: Easing.linear, useNativeDriver: true })
    ).start()
    Animated.loop(Animated.sequence([
      Animated.timing(centerPulse, { toValue: 1.5, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(centerPulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start()
  }, [sweepAnim, centerPulse])

  const SIZE = 100
  const R = SIZE / 2
  const PAD = 8
  const LINE_H = R - PAD
  const FOV_HALF = CAMERA_FOV_DEG / 2

  const northAngle = ((-heading + 360) % 360) * (Math.PI / 180)
  const northX = R + Math.sin(northAngle) * (R - 5)
  const northY = R - Math.cos(northAngle) * (R - 5)

  const dots = basePois
    .filter(p => p.distanceKm <= maxDistanceKm)
    .slice(0, 20)
    .map((poi, i) => {
      const rel = ((poi.bearing - heading + 360) % 360) * (Math.PI / 180)
      const norm = Math.min(poi.distanceKm / maxDistanceKm, 1)
      const d = norm * (R - PAD)
      return {
        poi, key: `rd-${poi.name}-${i}`,
        x: R + Math.sin(rel) * d,
        y: R - Math.cos(rel) * d,
        sz: norm < 0.3 ? 6 : 4,
        color: getPoiColor(poi),
      }
    })

  const sweepRotate = sweepAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <View style={[rd.outer, subdued && rd.outerSubdued, { top: topOffset }]}>
      <View style={[rd.radar, { width: SIZE, height: SIZE, borderRadius: R }]}>
        {[0.33, 0.66, 1].map((ratio, i) => {
          const s = (SIZE - PAD * 2) * ratio
          return <View key={i} style={[rd.ring, { width: s, height: s, borderRadius: s / 2, left: R - s / 2, top: R - s / 2 }]} />
        })}

        <View style={[rd.crossH, { top: R, left: PAD, right: PAD }]} />
        <View style={[rd.crossV, { left: R, top: PAD, bottom: PAD }]} />

        <View style={[rd.fovLine, { left: R - 0.5, top: PAD, height: LINE_H, transform: [{ translateY: LINE_H / 2 }, { rotate: `${-FOV_HALF}deg` }, { translateY: -LINE_H / 2 }] }]} />
        <View style={[rd.fovLine, { left: R - 0.5, top: PAD, height: LINE_H, transform: [{ translateY: LINE_H / 2 }, { rotate: `${FOV_HALF}deg` }, { translateY: -LINE_H / 2 }] }]} />

        <Animated.View style={[rd.sweep, { left: R - 1, top: PAD, height: LINE_H, transform: [{ translateY: LINE_H / 2 }, { rotate: sweepRotate }, { translateY: -LINE_H / 2 }] }]}>
          <LinearGradient colors={[`${C.accent}50`, 'transparent']} style={rd.sweepGrad} />
        </Animated.View>

        {dots.map(({ poi, x, y, sz, color, key }) => {
          const isLockedDot = lockedPoiKey && poiKeyOf(poi) === lockedPoiKey
          return (
            <Pressable
              key={key}
              onPress={() => onSelectPoi?.(poi)}
              hitSlop={8}
              style={[rd.dot, isLockedDot && rd.dotLocked, { left: x - sz / 2, top: y - sz / 2, width: sz, height: sz, borderRadius: sz / 2, backgroundColor: isLockedDot ? C.success : color, shadowColor: isLockedDot ? C.success : color }]}
              accessibilityLabel={poi.name}
            />
          )
        })}

        <Animated.View style={[rd.centerGlow, { left: R - 7, top: R - 7, transform: [{ scale: centerPulse }] }]} />
        <View style={[rd.centerDot, { left: R - 3.5, top: R - 3.5 }]} />

        <View style={[rd.northBadge, { left: northX - 7, top: northY - 7 }]}>
          <Text style={rd.northText}>N</Text>
        </View>
      </View>
    </View>
  )
}

const rd = StyleSheet.create({
  outer: { position: 'absolute', left: 12, alignItems: 'center', zIndex: 5 },
  outerSubdued: { opacity: 0.34 },
  radar: {
    backgroundColor: 'rgba(8,10,18,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.48, shadowRadius: 20 },
      android: { elevation: 14 },
    }),
  },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  crossH: { position: 'absolute', height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.07)' },
  crossV: { position: 'absolute', width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.07)' },
  fovLine: { position: 'absolute', width: 1, backgroundColor: `${C.accent}38` },
  sweep: { position: 'absolute', width: 2 },
  sweepGrad: { flex: 1, width: 2, borderRadius: 1 },
  dot: {
    position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  dotLocked: { borderColor: '#FFF', borderWidth: 2 },
  centerGlow: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: `${C.accent}28` },
  centerDot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.accent, borderWidth: 1.5, borderColor: '#FFF' },
  northBadge: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: `${C.accent}30`, alignItems: 'center', justifyContent: 'center' },
  northText: { color: C.accent, fontSize: 7, fontFamily: FONT_POPPINS_BOLD },
})

/* ─── Edge POI Indicators ─── */
function EdgePOIIndicators({ outOfViewPois, heading, safeTop, safeBottom, height, onPress, lockedPoiKey }) {
  if (!outOfViewPois || outOfViewPois.length === 0) return null

  const left = []
  const right = []
  outOfViewPois.slice(0, 6).forEach((poi) => {
    const rel = (poi.bearing - heading + 360) % 360
    if (rel <= 180) right.push({ poi, rel })
    else left.push({ poi, rel })
  })

  const safeH = Math.max(120, height - safeTop - safeBottom)
  const midY = safeTop + safeH * 0.42

  const renderGroup = (items, side) =>
    items.slice(0, 3).map(({ poi, rel }, i) => {
      const color = getPoiColor(poi)
      const turnDeg = Math.round(side === 'right' ? rel : 360 - rel)
      const isLockedPill = lockedPoiKey && poiKeyOf(poi) === lockedPoiKey
      return (
        <Pressable
          key={`edge-${poi.name}-${i}`}
          style={[ei.pill, side === 'left' ? ei.pillLeft : ei.pillRight, isLockedPill && ei.pillLocked, { borderColor: isLockedPill ? `${C.success}70` : `${color}40`, marginBottom: 8 }]}
          onPress={() => onPress?.(poi)}
          accessibilityLabel={`${poi.name} ${turnDeg}° to the ${side}`}
        >
          {side === 'left' && <Ionicons name="chevron-back" size={10} color={isLockedPill ? C.success : color} />}
          <View style={ei.pillContent}>
            <Text style={[ei.pillName, { color }]} numberOfLines={1}>{poi.name}</Text>
            <Text style={ei.pillDist}>{getDistText(poi.distanceKm)}</Text>
          </View>
          {side === 'right' && <Ionicons name="chevron-forward" size={10} color={isLockedPill ? C.success : color} />}
        </Pressable>
      )
    })

  return (
    <>
      {left.length > 0 && (
        <View style={[ei.group, { left: 0, top: midY }]}>
          {renderGroup(left, 'left')}
        </View>
      )}
      {right.length > 0 && (
        <View style={[ei.group, { right: 0, top: midY }]}>
          {renderGroup(right, 'right')}
        </View>
      )}
    </>
  )
}

const ei = StyleSheet.create({
  group: { position: 'absolute', zIndex: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(8,10,20,0.78)',
    paddingVertical: 7, paddingHorizontal: 9,
    borderWidth: 1,
    maxWidth: 138,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 6 },
      android: { elevation: 7 },
    }),
  },
  pillLeft: {
    borderTopRightRadius: 10, borderBottomRightRadius: 10,
    borderLeftWidth: 0,
  },
  pillRight: {
    borderTopLeftRadius: 10, borderBottomLeftRadius: 10,
    borderRightWidth: 0,
  },
  pillLocked: { backgroundColor: 'rgba(16,185,129,0.12)' },
  pillContent: { flex: 1 },
  pillName: { fontSize: 9, fontFamily: FONT_POPPINS_BOLD },
  pillDist: { color: C.dimText, fontSize: 8, fontFamily: FONT_POPPINS_SEMIBOLD, marginTop: 1 },
})

/* ─── POI Detail Modal ─── */
const DetailStatTile = ({ icon, iconColor, iconBg, value, label }) => (
  <View style={dm.statTile}>
    <View style={[dm.statIconWrap, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={14} color={iconColor} />
    </View>
    <Text style={dm.statValue}>{value}</Text>
    <Text style={dm.statLabel}>{label}</Text>
  </View>
)

const DetailInfoRow = ({ icon, iconColor, iconBg, text }) => (
  <View style={dm.infoRow}>
    <View style={[dm.infoIconWrap, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={16} color={iconColor} />
    </View>
    <Text style={dm.infoText}>{text}</Text>
  </View>
)

const DESC_PREVIEW_LINES = 3
const DESC_READ_MORE_MIN = 100

const DetailDescription = ({ text, title }) => {
  const [expanded, setExpanded] = useState(false)
  const canExpand = text.trim().length >= DESC_READ_MORE_MIN

  useEffect(() => {
    setExpanded(false)
  }, [text])

  if (!text?.trim()) return null

  return (
    <View style={dm.aboutBlock}>
      {title ? <Text style={dm.sectionTitle}>{title}</Text> : null}
      <Text style={dm.aboutBody} numberOfLines={expanded ? undefined : DESC_PREVIEW_LINES}>
        {text.trim()}
      </Text>
      {canExpand ? (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less description' : 'Read more description'}
        >
          <Text style={dm.readMore}>{expanded ? 'Show less' : 'Read more…'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function POIDetailModal({ visible, poi, onClose, onRequestClose, insets, openDirections, onViewProfile, heritage }) {
  const dismiss = onRequestClose || onClose
  const m = poi?.metadata || poi || {}
  const imageUrl = useMemo(() => {
    if (!poi) return ''
    return resolvePublicImageUrl(poi.image || m?.image || m?.client_image || m?.cover_image || '')
  }, [poi, m])

  if (!poi) return null

  const clientId = poi.client_a_uuid || poi.id
  const hasProfile = Boolean(clientId)
  const isLandmark = poi._isLandmark || poi._type === 'landmark' || poi.category
  const typeLabel = poi._type === 'event' ? 'Event' : poi._type === 'restaurant' ? 'Restaurant' : isLandmark ? (m.category || poi.category || 'Landmark') : 'Place'
  const typeIcon = getPoiIcon(poi)
  const poiColor = getPoiColor(poi)
  const heritageInfo = heritage || LANDMARK_HERITAGE[poi.name]
  const distText = poi.distanceKm < 1 ? `${Math.round(poi.distanceKm * 1000)}m` : `${poi.distanceKm.toFixed(1)} km`
  const venue = m.venue || m.location || m.area || poi.location || ''
  const desc = m.description || poi.description || ''
  const cuisine = m.cuisine || m.cuisine_type || ''
  const priceRange = m.price_range || ''
  const rating = m.rating != null && m.rating !== '' ? Number(m.rating) : null
  const eventType = m.event_type || ''
  const time = [m.start_time, m.end_time].filter(Boolean).join(' – ')
  const date = m.start_date || m.end_date || ''
  const bottomPad = (insets?.bottom ?? 0) + 10

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismiss}
      statusBarTranslucent
      hardwareAccelerated={Platform.OS === 'android'}
    >
      <View style={dm.overlay}>
        <Pressable style={dm.backdrop} onPress={onClose} accessibilityLabel="Close place details" />

        <View style={[dm.sheet, { maxHeight: '68%', paddingBottom: bottomPad }]}>
          <LinearGradient
            pointerEvents="none"
            colors={[`${poiColor}42`, `${poiColor}12`, 'transparent']}
            locations={[0, 0.45, 1]}
            style={dm.heroGlow}
          />

          <View style={dm.sheetTop}>
            <View style={dm.handle} />
            <TouchableOpacity style={dm.closeBtn} onPress={dismiss} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>

          {imageUrl ? (
            <View style={dm.heroImageWrap}>
              <Image source={{ uri: imageUrl }} style={dm.heroImage} resizeMode="cover" />
              <LinearGradient colors={['transparent', 'rgba(13,16,27,0.92)']} style={dm.heroImageScrim} />
              <View style={[dm.typeChipFloat, { borderColor: `${poiColor}66`, backgroundColor: `${poiColor}28` }]}>
                <Ionicons name={typeIcon} size={12} color={poiColor} />
                <Text style={[dm.typeText, { color: poiColor }]}>{typeLabel}</Text>
              </View>
            </View>
          ) : null}

          <ScrollView style={dm.scroll} contentContainerStyle={dm.scrollInner} showsVerticalScrollIndicator={false} bounces>
            {!imageUrl ? (
              <View style={[dm.typeChip, { borderColor: `${poiColor}55`, backgroundColor: `${poiColor}16` }]}>
                <Ionicons name={typeIcon} size={12} color={poiColor} />
                <Text style={[dm.typeText, { color: poiColor }]}>{typeLabel}</Text>
              </View>
            ) : null}

            <Text style={dm.title} numberOfLines={2}>{poi.name}</Text>

            <View style={dm.statsRow}>
              <DetailStatTile icon="navigate" iconColor={C.accent} iconBg={`${C.accent}22`} value={distText} label="Away" />
              <DetailStatTile icon="walk" iconColor={C.quiet} iconBg={`${C.quiet}22`} value={getWalkingTime(poi.distanceKm)} label="Walk" />
              {rating != null && rating > 0 ? (
                <DetailStatTile icon="star" iconColor="#FBBF24" iconBg="rgba(251,191,36,0.18)" value={rating.toFixed(1)} label="Rating" />
              ) : (
                <DetailStatTile icon="compass" iconColor={poiColor} iconBg={`${poiColor}20`} value={typeLabel.split(' ')[0]} label="Type" />
              )}
            </View>

            {desc ? (
              <DetailDescription text={desc} title={isLandmark ? 'Why visit' : 'About'} />
            ) : null}

            {(venue || cuisine || priceRange || eventType || date || time) ? (
              <View style={dm.infoCard}>
                <Text style={dm.sectionTitle}>Details</Text>
                {venue ? <DetailInfoRow icon="location" iconColor={C.accent} iconBg={`${C.accent}18`} text={venue} /> : null}
                {(cuisine || priceRange) ? (
                  <DetailInfoRow icon="restaurant" iconColor={C.food} iconBg={`${C.food}18`} text={[cuisine, priceRange].filter(Boolean).join(' · ')} />
                ) : null}
                {(eventType || date || time) ? (
                  <DetailInfoRow icon="calendar" iconColor={C.event} iconBg={`${C.event}18`} text={[eventType, date, time].filter(Boolean).join(' · ')} />
                ) : null}
              </View>
            ) : null}

            {heritageInfo?.didYouKnow ? (
              <LinearGradient colors={['rgba(251,191,36,0.14)', 'rgba(251,191,36,0.04)']} style={dm.heritageBox}>
                <View style={dm.heritageHead}>
                  <View style={dm.heritageIconWrap}>
                    <Ionicons name="sparkles" size={12} color="#FBBF24" />
                  </View>
                  <Text style={dm.heritageTitle}>Did you know?</Text>
                </View>
                <Text style={dm.heritageBody} numberOfLines={2}>{heritageInfo.didYouKnow}</Text>
              </LinearGradient>
            ) : null}
          </ScrollView>

          <View style={dm.footer}>
            <View style={dm.actionRow}>
              {hasProfile ? (
                <Pressable
                  style={({ pressed }) => [dm.profileBtn, pressed && dm.profileBtnPressed]}
                  onPress={() => onViewProfile?.(clientId)}
                  hitSlop={8}
                  android_ripple={{ color: 'rgba(255,255,255,0.14)', borderless: false }}
                  accessibilityRole="button"
                  accessibilityLabel="View profile"
                >
                  <Ionicons name="person-outline" size={18} color="#FFF" />
                  <Text style={dm.profileBtnText}>Profile</Text>
                </Pressable>
              ) : null}
              <TouchableOpacity
                style={[dm.directionsBtn, !hasProfile && dm.directionsBtnSolo]}
                onPress={() => openDirections(poi)}
                activeOpacity={0.9}
                accessibilityLabel="Get directions"
              >
                <LinearGradient
                  colors={[C.accent, '#9B0C23', '#7A0A1C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={dm.directionsGrad}
                >
                  <Ionicons name="navigate" size={18} color="#FFF" />
                  <Text style={dm.directionsText}>Directions</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const dm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.58)' },
  sheet: {
    marginHorizontal: 10,
    backgroundColor: '#0D1019',
    borderTopLeftRadius: LUXURY.radiusCardSheet,
    borderTopRightRadius: LUXURY.radiusCardSheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.11)',
    overflow: 'hidden',
    ...luxuryElevated,
  },
  heroGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  sheetTop: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 2,
    zIndex: 2,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  closeBtn: {
    position: 'absolute',
    right: 14,
    top: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroImageWrap: {
    height: 96,
    marginHorizontal: 12,
    marginBottom: 2,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroImage: { width: '100%', height: '100%' },
  heroImageScrim: { ...StyleSheet.absoluteFillObject },
  typeChipFloat: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollInner: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 6,
  },
  typeText: { fontSize: 10, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.4 },
  title: {
    color: '#FFF',
    fontSize: 19,
    fontFamily: FONT_POPPINS_BOLD,
    lineHeight: 24,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: { color: '#FFF', fontSize: 12, fontFamily: FONT_POPPINS_BOLD },
  statLabel: { color: C.dimText, fontSize: 8, fontFamily: FONT_POPPINS_SEMIBOLD, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.35 },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  sectionTitle: {
    color: C.dimText,
    fontSize: 10,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { flex: 1, color: C.sub, fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18, paddingTop: 4 },
  heritageBox: {
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.22)',
  },
  heritageHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heritageIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.2)',
  },
  heritageTitle: { color: '#FBBF24', fontSize: 11, fontFamily: FONT_POPPINS_BOLD },
  heritageBody: { color: C.sub, fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18 },
  aboutBlock: { marginBottom: 8 },
  aboutBody: { color: C.sub, fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 19 },
  readMore: {
    color: C.accent,
    fontSize: 12,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    marginTop: 4,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(8,10,16,0.65)',
    zIndex: 4,
    ...Platform.select({
      android: { elevation: 12 },
      default: {},
    }),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  profileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  profileBtnText: { color: '#FFF', fontSize: 14, fontFamily: FONT_POPPINS_SEMIBOLD },
  profileBtnPressed: { opacity: 0.86, backgroundColor: 'rgba(255,255,255,0.12)' },
  directionsBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  directionsBtnSolo: { flex: 1 },
  directionsGrad: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  directionsText: { color: '#FFF', fontSize: 14, fontFamily: FONT_POPPINS_BOLD },
})

/* ─── Main Screen ─── */
export default function ARScreen({ navigation }) {
  const route = useRoute()
  const { preferences, generalLabels } = useUserPreferences()
  const { profile } = useAuth()
  const viewerUType = normalizeViewerUType(profile?.user?.u_type)
  const [navigateToDest, setNavigateToDest] = useState(route.params?.navigateTo ?? null)
  useEffect(() => { if (route.params?.navigateTo) setNavigateToDest(route.params.navigateTo) }, [route.params?.navigateTo])
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [location, setLocation] = useState(null)
  const [heading, setHeading] = useState(0)
  const [displayHeading, setDisplayHeading] = useState(0)
  const [pois, setPois] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPoi, setSelectedPoi] = useState(null)
  const [profileClientId, setProfileClientId] = useState(null)
  const [mode, setMode] = useState('all')
  const [maxDistanceKm, setMaxDistanceKm] = useState(3)
  const [showFilters, setShowFilters] = useState(false)
  const [pineconeRecs, setPineconeRecs] = useState([])
  const headingSub = useRef(null)
  const headingTargetRef = useRef(0)
  const headingSmoothedRef = useRef(0)
  const headingDisplayedRef = useRef(0)
  const lastHeadingEmitRef = useRef(0)
  const headingFrozenRef = useRef(false)
  const headingFreezeTimerRef = useRef(null)
  const stickyVisibleRef = useRef(new Set())
  const floorPitchDisplayedRef = useRef(0)
  const lastPitchEmitRef = useRef(0)
  /** Press-and-hold a marker to lock AR navigation onto that place */
  const [lockedPoi, setLockedPoi] = useState(null)
  const pitchLpfRef = useRef(0)
  const [floorPitchDeg, setFloorPitchDeg] = useState(0)
  const [khalidHidden, setKhalidHidden] = useState(false)
  const [khalidPanelH, setKhalidPanelH] = useState(96)

  const guidePreferenceContext = useMemo(
    () =>
      buildARPreferenceContext({
        profileSummary: preferences?.profileSummary || '',
        generalLabels,
        maxDistanceKm,
      }),
    [preferences?.profileSummary, generalLabels, maxDistanceKm],
  )

  const guideRetrievalOptions = useMemo(
    () => ({
      queryText: buildARRetrievalQuery(guidePreferenceContext),
      personaSummary: guidePreferenceContext.personaSummary,
      generalLabels: guidePreferenceContext.generalLabels,
    }),
    [guidePreferenceContext],
  )

  const modePois = useMemo(() => {
    const merged = mode === 'all' || mode === 'places'
      ? [...pois, ...pineconeRecs]
      : pois
    if (mode === 'all') return merged
    if (mode === 'places') return merged.filter((p) => p._type === 'place' || p._type === 'landmark' || p._isLandmark)
    if (mode === 'restaurants') return pois.filter((p) => p._type === 'restaurant')
    if (mode === 'events') return pois.filter((p) => p._type === 'event')
    return pois
  }, [pois, pineconeRecs, mode])

  let basePois = modePois
  if (navigateToDest && location) {
    basePois = [{ ...navigateToDest, distanceKm: 0, bearing: 0, name: navigateToDest.name || 'Destination', lat: navigateToDest.lat, lng: navigateToDest.lng }].map((p) => {
      const dLat = ((p.lat - location.latitude) * Math.PI) / 180
      const dLon = ((p.lng - location.longitude) * Math.PI) / 180
      const a2 = Math.sin(dLat / 2) ** 2 + Math.cos((location.latitude * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
      const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
      const y2 = Math.sin(dLon) * Math.cos((p.lat * Math.PI) / 180)
      const x2 = Math.cos((location.latitude * Math.PI) / 180) * Math.sin((p.lat * Math.PI) / 180) - Math.sin((location.latitude * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.cos(dLon)
      return { ...p, distanceKm: distKm, bearing: ((Math.atan2(y2, x2) * 180) / Math.PI + 360) % 360 }
    })
  }

  const filteredPois = useMemo(() => {
    const arHeading = Platform.OS === 'android' ? displayHeading : heading
    const inDistance = (p) => p.distanceKm <= maxDistanceKm

    if (Platform.OS !== 'android') {
      return basePois.filter((p) => {
        if (!inDistance(p)) return false
        const relBearing = (p.bearing - arHeading + 360) % 360
        return Math.min(relBearing, 360 - relBearing) <= CAMERA_FOV_DEG / 2
      })
    }

    const showFov = CAMERA_FOV_DEG / 2 + AR_FOV_SHOW_PAD_DEG
    const hideFov = CAMERA_FOV_DEG / 2 + AR_FOV_HIDE_PAD_DEG
    const nextSticky = new Set(stickyVisibleRef.current)

    basePois.forEach((p) => {
      const key = poiKeyOf(p)
      if (!key || !inDistance(p)) {
        if (key) nextSticky.delete(key)
        return
      }
      const relBearing = (p.bearing - arHeading + 360) % 360
      const angleOff = Math.min(relBearing, 360 - relBearing)
      if (angleOff <= showFov) nextSticky.add(key)
      else if (angleOff > hideFov) nextSticky.delete(key)
    })

    stickyVisibleRef.current = nextSticky

    return basePois.filter((p) => {
      if (!inDistance(p)) return false
      const key = poiKeyOf(p)
      return key ? nextSticky.has(key) : false
    })
  }, [basePois, maxDistanceKm, heading, displayHeading])

  const arHeading = Platform.OS === 'android' ? displayHeading : heading

  const nearestInView = filteredPois.length > 0 ? filteredPois.reduce((a, b) => a.distanceKm <= b.distanceKm ? a : b) : null
  const inViewIds = new Set(filteredPois.map((p) => p.name + p.lat))

  const clearNavigateTo = useCallback(() => setNavigateToDest(null), [])

  const isLockedMode = Boolean(lockedPoi && !navigateToDest)

  const loadNearby = useCallback(async (lat, lng) => {
    try {
      const [clientData, eventData, pineconeData] = await Promise.all([
        fetchNearbyPOIs(lat, lng, 'all', { allPlaces: true }),
        fetchEvents([]).catch(() => []),
        fetchPineconeARRecommended(lat, lng, 50, guideRetrievalOptions).catch(() => []),
      ])
      const eventPois = eventData
        .map((ev) => {
          const em = ev.metadata || {}
          const evLat = parseFloat(em.lat ?? em.latitude ?? '')
          const evLng = parseFloat(em.long ?? em.longitude ?? em.lng ?? '')
          if (isNaN(evLat) || isNaN(evLng)) return null
          const dLat2 = ((evLat - lat) * Math.PI) / 180
          const dLon2 = ((evLng - lng) * Math.PI) / 180
          const a2 = Math.sin(dLat2 / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((evLat * Math.PI) / 180) * Math.sin(dLon2 / 2) ** 2
          const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
          const y2 = Math.sin(dLon2) * Math.cos((evLat * Math.PI) / 180)
          const x2 = Math.cos((lat * Math.PI) / 180) * Math.sin((evLat * Math.PI) / 180) - Math.sin((lat * Math.PI) / 180) * Math.cos((evLat * Math.PI) / 180) * Math.cos(dLon2)
          const bear = ((Math.atan2(y2, x2) * 180) / Math.PI + 360) % 360
          const name = em.event_name || em.business_name || em.name || 'Event'
          return { ...ev, name, lat: evLat, lng: evLng, distanceKm: distKm, bearing: bear, _type: 'event', _isLandmark: false, metadata: { ...em, place_name: name } }
        })
        .filter(Boolean)
      const seen = new Set(clientData.map((p) => `${p.name}-${p.lat?.toFixed(4)}`))
      const uniqueEvents = eventPois.filter((e) => { const key = `${e.name}-${e.lat?.toFixed(4)}`; if (seen.has(key)) return false; seen.add(key); return true })
      // Merge Pinecone recs — deduplicate against Supabase data
      const uniquePinecone = pineconeData.filter((p) => {
        const key = `${p.name}-${p.lat?.toFixed(4)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setPineconeRecs(uniquePinecone)
      setPois([...clientData, ...uniqueEvents].sort((a, b) => a.distanceKm - b.distanceKm))
    } catch (e) {
      console.warn('[AR] fetchNearbyPOIs failed:', e?.message)
      setPois([])
    }
  }, [guideRetrievalOptions])

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!permission?.granted) {
        const { status } = await requestPermission()
        if (!mounted) return
        if (status !== 'granted') { setError('Camera permission required'); setLoading(false); return }
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (!mounted) return
        if (status !== 'granted') { setError('Location permission required to discover nearby spots'); setLoading(false); return }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (!mounted) return
        setLocation(loc.coords)
        await loadNearby(loc.coords.latitude, loc.coords.longitude)
      } catch (e) { if (mounted) setError(e?.message || 'Could not get location') }
      finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, [permission?.granted, requestPermission, loadNearby])

  useEffect(() => {
    if (!location?.latitude || !location?.longitude || loading) return
    loadNearby(location.latitude, location.longitude)
  }, [guideRetrievalOptions])

  useEffect(() => {
    if (!location) return
    let cleaned = false
    headingSmoothedRef.current = headingDisplayedRef.current
    headingTargetRef.current = headingDisplayedRef.current

    Location.watchHeadingAsync((h) => {
      const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading
      const smoothed = smoothHeadingStep(
        Platform.OS === 'android' ? headingTargetRef.current : headingSmoothedRef.current,
        raw,
      )

      if (Platform.OS === 'android') {
        const isFirstReading = headingDisplayedRef.current === 0 && headingTargetRef.current === 0
        headingTargetRef.current = smoothed
        if (isFirstReading) {
          headingDisplayedRef.current = smoothed
          setDisplayHeading(smoothed)
        }
        return
      }

      headingSmoothedRef.current = smoothed
      const now = Date.now()
      if (now - lastHeadingEmitRef.current < SENSOR_EMIT_MS) return
      if (headingDeltaDeg(smoothed, headingDisplayedRef.current) < HEADING_DEADZONE_DEG) return

      lastHeadingEmitRef.current = now
      headingDisplayedRef.current = smoothed
      setHeading(smoothed)
    })
      .then((s) => { if (cleaned) s.remove(); else headingSub.current = s })
    return () => { cleaned = true; headingSub.current?.remove?.(); headingSub.current = null }
  }, [location])

  useEffect(() => {
    if (Platform.OS !== 'android' || !location) return undefined

    const tick = () => {
      if (!headingFrozenRef.current) {
        const target = headingTargetRef.current
        const current = headingDisplayedRef.current
        const next = lerpHeading(current, target, AR_DISPLAY_LERP)
        if (headingDeltaDeg(next, current) >= 0.06) {
          headingDisplayedRef.current = next
          setDisplayHeading(next)
        }
      }
    }

    tick()
    const id = setInterval(tick, AR_DISPLAY_TICK_MS)
    return () => clearInterval(id)
  }, [location])

  useEffect(() => () => {
    if (headingFreezeTimerRef.current) clearTimeout(headingFreezeTimerRef.current)
  }, [])

  useEffect(() => {
    if (navigateToDest) setLockedPoi(null)
  }, [navigateToDest])

  useEffect(() => {
    headingFrozenRef.current = Boolean(selectedPoi)
  }, [selectedPoi])

  useEffect(() => {
    if (loading || Platform.OS === 'web' || !permission?.granted) return undefined
    let alive = true
    let subscription
    ;(async () => {
      try {
        const avail = await Accelerometer.isAvailableAsync()
        if (!alive || !avail) return
        Accelerometer.setUpdateInterval(Platform.OS === 'android' ? 100 : 48)
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const rad = Math.atan2(-x, Math.sqrt(y * y + z * z))
          const rawDeg = Math.max(-55, Math.min(55, (rad * 180) / Math.PI))
          pitchLpfRef.current = pitchLpfRef.current * 0.82 + rawDeg * 0.18
          const add = Math.max(-16, Math.min(26, pitchLpfRef.current * FLOOR_PITCH_COEFF))

          const now = Date.now()
          if (now - lastPitchEmitRef.current < SENSOR_EMIT_MS) return
          if (Math.abs(add - floorPitchDisplayedRef.current) < PITCH_DEADZONE_DEG) return

          lastPitchEmitRef.current = now
          floorPitchDisplayedRef.current = add
          setFloorPitchDeg(add)
        })
      } catch {
        /** sensor optional — path still uses baseline floor tilt */
      }
    })()
    return () => {
      alive = false
      subscription?.remove?.()
    }
  }, [loading, permission?.granted])

  const handleMarkerInteractionStart = useCallback(() => {
    headingFrozenRef.current = true
    if (headingFreezeTimerRef.current) clearTimeout(headingFreezeTimerRef.current)
  }, [])

  const handleMarkerInteractionEnd = useCallback(() => {
    if (headingFreezeTimerRef.current) clearTimeout(headingFreezeTimerRef.current)
    headingFreezeTimerRef.current = setTimeout(() => {
      headingFrozenRef.current = false
    }, 420)
  }, [])

  const openDirections = useCallback((poi) => {
    openGoogleMapsDirections(poi.lat, poi.lng)
  }, [])

  const modalJustOpenedRef = useRef(false)
  const closeModal = useCallback(() => { if (modalJustOpenedRef.current) return; setSelectedPoi(null) }, [])
  const handleOpenPOI = useCallback((poi) => {
    if (Platform.OS !== 'web') Vibration.vibrate(50)
    setSelectedPoi(poi)
    modalJustOpenedRef.current = true
    setTimeout(() => { modalJustOpenedRef.current = false }, 400)
  }, [])
  const poiKeysMatch = useCallback((a, b) => poiKeyOf(a) !== '' && poiKeyOf(a) === poiKeyOf(b), [])
  const handleLockPoi = useCallback((poi) => {
    if (!poi || poi.lat == null || poi.lng == null) return
    setSelectedPoi(null)
    setKhalidHidden(false)
    setLockedPoi({
      ...poi,
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
    })
    if (Platform.OS !== 'web') Vibration.vibrate([0, 40, 60, 40])
  }, [])
  const handleViewProfile = useCallback((clientId) => { setSelectedPoi(null); setProfileClientId(clientId) }, [])

  const lockedPoiKey = lockedPoi ? poiKeyOf(lockedPoi) : ''
  const lockedPoiLive = useMemo(() => {
    if (!lockedPoi) return null
    if (!location) return lockedPoi
    return enrichPoiBearingsFromUser(lockedPoi, location.latitude, location.longitude)
  }, [lockedPoi, location])

  const visiblePoiNames = useMemo(
    () => filteredPois.map((p) => p.name).filter(Boolean).slice(0, 8),
    [filteredPois],
  )

  const khalidGuide = useARKhalidGuide({
    lockedPoi,
    lockedPoiLive,
    isLockedMode,
    navigateToDest,
    maxDistanceKm,
    profileSummary: preferences?.profileSummary || '',
    generalLabels,
    visiblePoiNames,
  })

  const arChatContext = useMemo(() => {
    const lockedSpot = isLockedMode ? lockedPoiLive || lockedPoi : null
    return {
      isLocked: isLockedMode,
      lockedPlaceName: lockedSpot?.name || '',
      lockedPlaceFacts: lockedSpot ? buildLockedPlaceBriefFromPoi(lockedSpot) : '',
      lockedNarration: isLockedMode ? khalidGuide.displayLine : '',
      visiblePoiNames,
      coords:
        location?.latitude != null && location?.longitude != null
          ? {
              lat: Math.round(location.latitude * 1000) / 1000,
              lng: Math.round(location.longitude * 1000) / 1000,
            }
          : null,
    }
  }, [
    isLockedMode,
    lockedPoiLive,
    lockedPoi,
    khalidGuide.displayLine,
    visiblePoiNames,
    location?.latitude,
    location?.longitude,
  ])

  const khalidInlineChat = useARKhalidInlineChat({
    generalLabels,
    personaSummary: preferences?.profileSummary || '',
    viewerUType,
    arContext: arChatContext,
  })

  const clearLockedPoi = useCallback(() => {
    setLockedPoi(null)
    khalidInlineChat.clearChat()
  }, [khalidInlineChat.clearChat])

  const showFilterHint = filteredPois.length === 0 && !loading && !isLockedMode && !navigateToDest
  const headerBarH = insets.top + 62 + (isLockedMode ? 12 : 0)
  const filtersChromeH = showFilters
    ? 44 + 16 + 50 + (showFilterHint ? 26 : 0)
    : 0
  const topChromeH = headerBarH + filtersChromeH + (showFilters ? 6 : 0)
  const khalidReserveH =
    !loading && !error && !navigateToDest
      ? khalidHidden
        ? KHALID_PEEK_TAB_HEIGHT + 8
        : Math.max(khalidPanelH, estimateKhalidStripHeight({ isLocked: isLockedMode })) + 10
      : 0
  const bottomChromeH = insets.bottom + 8 + khalidReserveH
  const khalidAnchorBottom = insets.bottom + 8 + 6
  const hasPathGuidance = Boolean(navigateToDest || isLockedMode)
  const pathStackH = hasPathGuidance ? (isLockedMode ? 168 : 200) : 0
  const pathBottomOffset = bottomChromeH + 12
  const centerX = width / 2
  const safeAvailH = Math.max(160, height - topChromeH - bottomChromeH - pathStackH)
  const centerY = topChromeH + safeAvailH * 0.46
  const viewRadius = Math.min(width * 0.34, safeAvailH * 0.28) * AR_VIEW_RADIUS_SCALE

  const getMarkerPosition = useCallback((poi) => {
    const relBearing = ((poi.bearing - arHeading + 360) % 360) * (Math.PI / 180)
    const xPos = centerX + Math.sin(relBearing) * viewRadius - 78
    const yPos = centerY - Math.cos(relBearing) * viewRadius - 42
    const minY = topChromeH + 10
    const maxY = height - bottomChromeH - pathStackH - 72
    const x = Math.max(10, Math.min(width - 172, xPos))
    const y = Math.max(minY, Math.min(maxY, yPos))
    if (Platform.OS !== 'android') return { x, y }
    return { x: Math.round(x), y: Math.round(y) }
  }, [arHeading, centerX, centerY, viewRadius, topChromeH, height, bottomChromeH, pathStackH, width])

  const markersToRender = useMemo(() => {
    if (!lockedPoi || navigateToDest) return filteredPois
    const alreadyShown = filteredPois.some((p) => poiKeysMatch(p, lockedPoi))
    if (alreadyShown) return filteredPois
    const lockedMatch =
      basePois.find((p) => poiKeysMatch(p, lockedPoi)) ??
      pois.find((p) => poiKeysMatch(p, lockedPoi))
    if (!lockedMatch) return filteredPois
    return [...filteredPois, lockedMatch]
  }, [filteredPois, lockedPoi, navigateToDest, basePois, pois, poiKeysMatch])

  const emptyHint = mode === 'events' ? 'No events in this direction'
    : mode === 'restaurants' ? 'No restaurants in this direction'
    : mode === 'places' ? 'No places in this direction'
    : 'Point your camera around'

  const arrowTarget = useMemo(() => {
    if (navigateToDest) return { ...navigateToDest, _type: navigateToDest._type ?? 'place' }
    if (isLockedMode && lockedPoiLive) return lockedPoiLive
    return null
  }, [navigateToDest, isLockedMode, lockedPoiLive])

  /* ─── Error / Permission States ─── */
  if (error) {
    return (
      <View style={s.container}>
        <LinearGradient colors={['#0F172A', '#1E1B4B']} style={StyleSheet.absoluteFill} />
        <View style={s.errorWrap}>
          <View style={s.errorIcon}><Ionicons name="alert-circle-outline" size={44} color={C.accent} /></View>
          <Text style={s.errorTitle}>Something went wrong</Text>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => navigation?.goBack()} activeOpacity={0.85}>
            <LinearGradient colors={[C.accent, '#9B0C23']} style={s.errorBtnGrad}>
              <Ionicons name="arrow-back" size={16} color="#FFF" />
              <Text style={s.errorBtnText}>Go back</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (!permission?.granted) {
    return (
      <View style={s.container}>
        <LinearGradient colors={['#0F172A', '#1E1B4B']} style={StyleSheet.absoluteFill} />
        <View style={s.errorWrap}>
          <View style={s.errorIcon}><Ionicons name="camera-outline" size={44} color={C.accent} /></View>
          <Text style={s.errorTitle}>Camera access needed</Text>
          <Text style={s.errorText}>AR mode needs your camera to overlay nearby places on the real world.</Text>
          <TouchableOpacity onPress={() => requestPermission()} activeOpacity={0.85}>
            <LinearGradient colors={[C.accent, '#9B0C23']} style={s.errorBtnGrad}>
              <Ionicons name="shield-checkmark" size={16} color="#FFF" />
              <Text style={s.errorBtnText}>Grant permission</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.62)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.74)']}
        locations={[0, 0.24, 0.62, 1]}
        style={s.cameraVignette}
      />

      {loading ? <ScanningLoader /> : (
        <View style={s.arOverlayLayer} pointerEvents="box-none">
          {lockedPoi && !navigateToDest ? (
            <View style={fm.dim} pointerEvents="none" accessibilityElementsHidden />
          ) : null}
          {[...markersToRender].sort((a, b) => b.distanceKm - a.distanceKm).map((poi, i) => {
            const { x, y } = getMarkerPosition(poi)
            const poiKey = poiKeyOf(poi)
            const spotLocked = poiKeysMatch(lockedPoi, poi)
            const fadeOthers = Boolean(lockedPoi && !navigateToDest && !spotLocked)
            const liveDist = spotLocked && lockedPoiLive ? lockedPoiLive.distanceKm : poi.distanceKm
            return (
              <POIMarker
                key={poiKey || `${poi.name}-${i}`}
                poi={poi}
                x={x}
                y={y}
                onPress={handleOpenPOI}
                isNearest={
                  !isLockedMode &&
                  !navigateToDest &&
                  nearestInView &&
                  nearestInView.name === poi.name &&
                  nearestInView.lat === poi.lat
                }
                index={i}
                locked={spotLocked}
                dimmed={fadeOthers}
                onLockPoi={navigateToDest ? undefined : handleLockPoi}
                liveDistKm={liveDist}
                onInteractionStart={handleMarkerInteractionStart}
                onInteractionEnd={handleMarkerInteractionEnd}
              />
            )
          })}

          {!navigateToDest && (
            <EdgePOIIndicators
              outOfViewPois={basePois
                .filter((p) => p.distanceKm <= maxDistanceKm && !inViewIds.has(p.name + p.lat))
                .filter((p) => !lockedPoi || !poiKeysMatch(p, lockedPoi))
                .slice(0, 6)}
              heading={arHeading}
              safeTop={topChromeH}
              safeBottom={bottomChromeH + pathStackH}
              height={height}
              onPress={handleOpenPOI}
              lockedPoiKey={lockedPoiKey}
            />
          )}

          {location && arrowTarget && (
            <PathArrowIndicator
              target={arrowTarget}
              heading={arHeading}
              userLat={location.latitude}
              userLng={location.longitude}
              isNavigation={!!navigateToDest}
              isLocked={isLockedMode}
              compactHud={isLockedMode}
              floorPitchDeg={floorPitchDeg}
              onDismissNavigation={navigateToDest ? clearNavigateTo : undefined}
              onDismissLock={isLockedMode ? clearLockedPoi : undefined}
              style={{ bottom: pathBottomOffset }}
            />
          )}

          <RadarNavigator
            heading={arHeading}
            basePois={basePois}
            maxDistanceKm={maxDistanceKm}
            onSelectPoi={handleOpenPOI}
            lockedPoiKey={lockedPoiKey}
            topOffset={topChromeH + 10}
            subdued={isLockedMode}
          />
        </View>
      )}

      {/* ─── Header ─── */}
      <BlurView intensity={Platform.OS === 'ios' ? 55 : 0} tint="dark" style={[s.header, { paddingTop: insets.top + 4 }]}>
        <View style={s.headerBg} />
        <View style={s.headerRow}>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation?.goBack()} activeOpacity={0.8} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>AR Explorer</Text>
            {isLockedMode ? (
              <Text style={s.headerFocusHint} numberOfLines={1}>Khalid is guiding you</Text>
            ) : (
              <Text style={s.headerSubHint} numberOfLines={1}>with Khalid · local guide</Text>
            )}
          </View>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => {
              if (lockedPoi && !navigateToDest) {
                clearLockedPoi()
                return
              }
              setShowFilters((v) => !v)
            }}
            activeOpacity={0.8}
            accessibilityLabel={lockedPoi && !navigateToDest ? 'Unlock destination' : showFilters ? 'Close filters' : 'Open filters'}
            accessibilityState={{ expanded: showFilters }}
          >
            <Ionicons
              name={lockedPoi && !navigateToDest ? 'lock-open-outline' : showFilters ? 'options' : 'options-outline'}
              size={20}
              color={lockedPoi && !navigateToDest ? C.success : showFilters ? C.accent : '#FFF'}
            />
          </TouchableOpacity>
        </View>
      </BlurView>

      {showFilters ? (
        <View style={[s.topFilters, { top: headerBarH + 6 }]}>
          <BlurView intensity={Platform.OS === 'ios' ? 55 : 0} tint="dark" style={s.topFiltersBlur}>
            <View style={s.topFiltersBg} />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[s.filterRow, isLockedMode && s.filterRowTight]}
            >
              {MODES.map((m2) => {
                const active = mode === m2.id
                return (
                  <TouchableOpacity
                    key={m2.id}
                    style={[s.filterChip, active && { backgroundColor: `${m2.color}15`, borderColor: `${m2.color}50` }]}
                    onPress={() => setMode(m2.id)}
                    activeOpacity={0.8}
                    accessibilityLabel={`Filter: ${m2.label}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={active ? m2.icon.replace('-outline', '') : m2.icon} size={13} color={active ? m2.color : C.dimText} />
                    <Text style={[s.filterText, active && { color: m2.color }]}>{m2.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            <View style={s.sliderWrap}>
              <View style={s.sliderHeader}>
                <Text style={s.sliderLabel}>Discovery range</Text>
                <View style={s.sliderPill}>
                  <Text style={s.sliderValue}>
                    {maxDistanceKm < 1 ? `${Math.round(maxDistanceKm * 1000)}m` : `${maxDistanceKm}km`}
                  </Text>
                </View>
              </View>
              <Slider
                style={s.slider}
                minimumValue={0.5}
                maximumValue={10}
                step={0.5}
                value={maxDistanceKm}
                onValueChange={setMaxDistanceKm}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor={C.accent}
              />
            </View>

            {showFilterHint ? (
              <Text style={s.hint}>
                {navigateToDest ? 'Turn toward your destination' : emptyHint}
              </Text>
            ) : null}
          </BlurView>
        </View>
      ) : null}

      {!loading && !error && !navigateToDest ? (
        <ARKhalidGuidePanel
          bottomOffset={khalidAnchorBottom}
          hidden={khalidHidden}
          onHiddenChange={setKhalidHidden}
          onHeightChange={setKhalidPanelH}
          guideLine={khalidGuide.displayLine}
          isSpeaking={khalidGuide.isSpeaking}
          narrationLoading={khalidGuide.narrationLoading}
          isLockedMode={isLockedMode}
          lockedPlaceName={lockedPoiLive?.name || lockedPoi?.name || ''}
          lockedMeta={
            isLockedMode && lockedPoiLive
              ? `${getDistText(lockedPoiLive.distanceKm)} · ${getWalkingTime(lockedPoiLive.distanceKm)} walk`
              : ''
          }
          latestAnswer={khalidInlineChat.latestAnswer}
          chatLoading={khalidInlineChat.chatLoading}
          chatError={khalidInlineChat.chatError}
          onSendMessage={khalidInlineChat.sendMessage}
          onOpenDirections={
            isLockedMode && lockedPoiLive
              ? () => openDirections(lockedPoiLive)
              : undefined
          }
          onUnlock={isLockedMode ? clearLockedPoi : undefined}
        />
      ) : null}

      <POIDetailModal
        visible={!!selectedPoi}
        poi={selectedPoi}
        onClose={closeModal}
        onRequestClose={() => setSelectedPoi(null)}
        insets={insets}
        openDirections={openDirections}
        onViewProfile={handleViewProfile}
      />
      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        animationFrom="bottom"
        presentation="sheet"
        onClose={() => setProfileClientId(null)}
        insets={insets}
        onOpenARNavigate={(dest) => { setProfileClientId(null); setNavigateToDest(dest) }}
      />
    </View>
  )
}

const fm = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.52)', zIndex: 4 },
})

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  cameraVignette: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  arOverlayLayer: { ...StyleSheet.absoluteFillObject, zIndex: 3 },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: `${C.accent}12`, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: `${C.accent}18` },
  errorTitle: { color: '#FFF', fontSize: 20, fontFamily: FONT_POPPINS_BOLD, marginBottom: 6 },
  errorText: { color: C.sub, fontSize: 14, fontFamily: FONT_POPPINS_REGULAR, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  errorBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 14 },
  errorBtnText: { color: '#FFF', fontSize: 15, fontFamily: FONT_POPPINS_BOLD },

  header: { position: 'absolute', top: 0, left: 10, right: 10, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.11)', borderRadius: 24, paddingBottom: 9, zIndex: 20 },
  headerBg: { ...StyleSheet.absoluteFillObject, backgroundColor: Platform.OS === 'android' ? 'rgba(13,16,27,0.82)' : 'rgba(13,16,27,0.34)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 16, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.2 },
  headerFocusHint: { color: C.success, fontSize: 10, fontFamily: FONT_POPPINS_BOLD, marginTop: 2, maxWidth: Math.min(200, DOOR_W * 0.48), textAlign: 'center' },
  headerSubHint: { color: 'rgba(233,200,119,0.85)', fontSize: 10, fontFamily: FONT_POPPINS_MEDIUM, marginTop: 2, maxWidth: Math.min(200, DOOR_W * 0.48), textAlign: 'center' },

  topFilters: { position: 'absolute', left: 10, right: 10, zIndex: 20 },
  topFiltersBlur: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 22 },
  topFiltersBg: { ...StyleSheet.absoluteFillObject, backgroundColor: Platform.OS === 'android' ? 'rgba(13,16,27,0.88)' : 'rgba(13,16,27,0.38)' },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 2,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.28)',
  },
  lockedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.14)',
  },
  lockedTextCol: { flex: 1, minWidth: 0 },
  lockedName: { color: '#FFF', fontSize: 13, fontFamily: FONT_POPPINS_BOLD },
  lockedMeta: { color: C.dimText, fontSize: 10, fontFamily: FONT_POPPINS_SEMIBOLD, marginTop: 1 },
  lockedDirBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  lockedUnlockBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.28)',
  },
  filterRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 7 },
  filterRowTight: { paddingTop: 4 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  filterText: { color: C.dimText, fontSize: 11, fontFamily: FONT_POPPINS_SEMIBOLD },

  sliderWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sliderLabel: { color: C.dimText, fontSize: 10, fontFamily: FONT_POPPINS_SEMIBOLD },
  sliderPill: { backgroundColor: `${C.accent}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: `${C.accent}24` },
  sliderValue: { color: C.accent, fontSize: 10, fontFamily: FONT_POPPINS_BOLD },
  slider: { width: '100%', height: 24 },

  hint: { color: 'rgba(255,255,255,0.62)', fontSize: 11, fontFamily: FONT_POPPINS_MEDIUM, textAlign: 'center', paddingTop: 6, paddingBottom: 9, paddingHorizontal: 12 },
  lockCoachWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 6,
    paddingHorizontal: 24,
  },
  lockCoach: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(8,12,22,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.32)',
    maxWidth: 320,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  lockCoachText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontFamily: FONT_POPPINS_SEMIBOLD, textAlign: 'center' },
  lockBeaconSlot: { position: 'absolute', left: 0, right: 0, zIndex: 7, alignItems: 'center' },
})
