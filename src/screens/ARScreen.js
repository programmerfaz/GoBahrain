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
  Share,
  Vibration,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRoute } from '@react-navigation/native'
import { fetchNearbyPOIs, fetchEvents, fetchPineconeARRecommended } from '../services/aiPipeline'
import ClientProfileModal from '../components/ClientProfileModal'
import { useSavedPlaces } from '../context/SavedPlacesContext'
import { colors as themeColors } from '../theme/designTokens'
import { LUXURY, luxuryElevated } from '../theme/luxuryPremium'
import { useTheme } from '../context/ThemeContext'
import { openGoogleMapsDirections } from '../utils/googleMapsDirections'

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
const DOOR_H = Dimensions.get('window').height

const MODES = [
  { id: 'all', label: 'All', icon: 'globe-outline', color: C.accentLight },
  { id: 'places', label: 'Places', icon: 'business-outline', color: C.landmark },
  { id: 'restaurants', label: 'Food', icon: 'restaurant-outline', color: C.food },
  { id: 'events', label: 'Events', icon: 'calendar-outline', color: C.event },
  { id: 'saved', label: 'Saved', icon: 'heart-outline', color: C.success },
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
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: C.accent },
  ring1: { width: 100, height: 100, borderRadius: 50 },
  ring2: { width: 140, height: 140, borderRadius: 70 },
  ring3: { width: 180, height: 180, borderRadius: 90 },
  iconWrap: { marginBottom: 20 },
  title: { color: '#FFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  sub: { color: C.dimText, fontSize: 13, marginTop: 6 },
})

/* ─── POI Marker ─── */
function POIMarker({ poi, x, y, onPress, isNearest, index, isBusy }) {
  const anim = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(1)).current
  const poiColor = getPoiColor(poi)
  const icon = getPoiIcon(poi)

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, damping: 14, stiffness: 120, delay: index * 40, useNativeDriver: true }).start()
  }, [anim, index])

  useEffect(() => {
    if (!isNearest) return
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]))
    p.start()
    return () => p.stop()
  }, [isNearest, pulse])

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })

  return (
    <Animated.View style={[mk.wrap, { left: x, top: y, opacity: anim, transform: [{ scale: isNearest ? pulse : scale }] }]}>
      {isNearest && <View style={[mk.nearestGlow, { shadowColor: poiColor }]} />}
      <TouchableOpacity
        style={[
          mk.card,
          isNearest && { borderColor: `${poiColor}70` },
          poi._pineconeRecommended && { borderColor: 'rgba(167,139,250,0.40)' },
        ]}
        onPress={() => onPress?.(poi)}
        activeOpacity={0.85}
      >
        <View style={[mk.iconBg, { backgroundColor: `${poiColor}22` }]}>
          <Ionicons name={icon} size={11} color={poiColor} />
        </View>
        <View style={mk.textCol}>
          <Text style={mk.name} numberOfLines={1}>{poi.name}</Text>
          <Text style={mk.dist}>{getDistText(poi.distanceKm)}</Text>
        </View>
        {poi._pineconeRecommended && (
          <View style={mk.aiBadge}>
            <Ionicons name="sparkles" size={7} color="#A78BFA" />
          </View>
        )}
      </TouchableOpacity>
      <View style={[mk.stem, { backgroundColor: `${poiColor}35` }]} />
    </Animated.View>
  )
}

const mk = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  nearestGlow: {
    position: 'absolute',
    top: 4, left: 4, right: 4, bottom: 4,
    borderRadius: LUXURY.radiusMarkerPill,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10 },
      android: { elevation: 0 },
    }),
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: C.card,
    borderRadius: LUXURY.radiusMarkerPill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.glassBorder,
    ...luxuryElevated,
  },
  iconBg: { width: 20, height: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  textCol: { flexDirection: 'column', gap: 1 },
  name: { color: '#FFF', fontSize: 10, fontWeight: '700', maxWidth: 80 },
  dist: { color: C.dimText, fontSize: 9, fontWeight: '600' },
  aiBadge: {
    width: 14, height: 14, borderRadius: 5,
    backgroundColor: 'rgba(167,139,250,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
  },
  stem: { width: 1, height: 8, opacity: 0.5 },
})

/* ─── Navigate Banner ─── */
function NavigateToBanner({ destination, userLat, userLng, heading, onDismiss }) {
  if (!destination || userLat == null || userLng == null) return null
  const dLon = ((destination.lng - userLng) * Math.PI) / 180
  const y2 = Math.sin(dLon) * Math.cos((destination.lat * Math.PI) / 180)
  const x2 = Math.cos((userLat * Math.PI) / 180) * Math.sin((destination.lat * Math.PI) / 180) -
    Math.sin((userLat * Math.PI) / 180) * Math.cos((destination.lat * Math.PI) / 180) * Math.cos(dLon)
  const bearing = ((Math.atan2(y2, x2) * 180) / Math.PI + 360) % 360
  const dLat = ((destination.lat - userLat) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((userLat * Math.PI) / 180) * Math.cos((destination.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const relBearing = (bearing - heading + 360) % 360
  const inView = Math.min(relBearing, 360 - relBearing) <= CAMERA_FOV_DEG / 2

  return (
    <View style={nb.wrap}>
      <BlurView intensity={Platform.OS === 'ios' ? 50 : 0} tint="dark" style={nb.blur}>
        <View style={nb.inner}>
          <View style={nb.arrowWrap}>
            <LinearGradient colors={[`${C.accent}25`, 'transparent']} style={StyleSheet.absoluteFill} />
            <Ionicons name="navigate" size={28} color={C.accent} style={{ transform: [{ rotate: `${relBearing}deg` }] }} />
          </View>
          <View style={nb.textCol}>
            <Text style={nb.title} numberOfLines={1}>{destination.name}</Text>
            <Text style={nb.sub}>
              {inView ? 'Walk toward the arrow' : `Turn ${Math.round(relBearing > 180 ? 360 - relBearing : relBearing)}° ${relBearing > 180 ? 'left' : 'right'}`}
            </Text>
            <View style={nb.pills}>
              <View style={nb.pill}><Ionicons name="walk" size={11} color={C.accent} /><Text style={nb.pillText}>{getWalkingTime(distKm)}</Text></View>
              <View style={nb.pill}><Ionicons name="navigate-outline" size={11} color={C.dimText} /><Text style={nb.pillText}>{getDistText(distKm)}</Text></View>
            </View>
          </View>
          {onDismiss && (
            <TouchableOpacity style={nb.closeBtn} onPress={onDismiss} hitSlop={12}>
              <Ionicons name="close" size={18} color={C.dimText} />
            </TouchableOpacity>
          )}
        </View>
      </BlurView>
    </View>
  )
}

const nb = StyleSheet.create({
  wrap: { position: 'absolute', top: 100, left: 12, right: 12, zIndex: 10 },
  blur: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: `${C.accent}25` },
  inner: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: Platform.OS === 'android' ? C.glass : 'transparent' },
  arrowWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  textCol: { flex: 1, marginLeft: 10 },
  title: { color: '#FFF', fontSize: 15, fontWeight: '800', marginBottom: 2 },
  sub: { color: C.sub, fontSize: 12 },
  pills: { flexDirection: 'row', gap: 6, marginTop: 5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 7 },
  pillText: { color: C.sub, fontSize: 10, fontWeight: '600' },
  closeBtn: { padding: 6, marginLeft: 2 },
})

/* ─── Path Arrow Indicator (Pokémon GO style) ─── */
function PathArrowIndicator({ target, heading, userLat, userLng, isNavigation, style }) {
  const pulseAnim = useRef(new Animated.Value(1)).current
  const chevAnim = useRef(new Animated.Value(0)).current
  const mountAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!target) {
      Animated.timing(mountAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start()
      return
    }
    Animated.spring(mountAnim, { toValue: 1, damping: 14, stiffness: 110, useNativeDriver: true }).start()
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.22, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]))
    pulse.start()
    const chev = Animated.loop(
      Animated.timing(chevAnim, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
    )
    chev.start()
    return () => { pulse.stop(); chev.stop() }
  }, [target, pulseAnim, chevAnim, mountAnim])

  if (!target || userLat == null || userLng == null) return null

  const dLon = ((target.lng - userLng) * Math.PI) / 180
  const y2 = Math.sin(dLon) * Math.cos((target.lat * Math.PI) / 180)
  const x2 =
    Math.cos((userLat * Math.PI) / 180) * Math.sin((target.lat * Math.PI) / 180) -
    Math.sin((userLat * Math.PI) / 180) * Math.cos((target.lat * Math.PI) / 180) * Math.cos(dLon)
  const bearing = ((Math.atan2(y2, x2) * 180) / Math.PI + 360) % 360
  const dLat = ((target.lat - userLat) * Math.PI) / 180
  const haA = Math.sin(dLat / 2) ** 2 + Math.cos((userLat * Math.PI) / 180) * Math.cos((target.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  const distKm = 6371 * 2 * Math.atan2(Math.sqrt(haA), Math.sqrt(1 - haA))
  const relBearing = (bearing - heading + 360) % 360
  const inView = Math.min(relBearing, 360 - relBearing) <= CAMERA_FOV_DEG / 2
  const turnDeg = Math.round(relBearing > 180 ? 360 - relBearing : relBearing)
  const turnDir = relBearing > 180 ? 'left' : 'right'
  const statusLine = inView
    ? 'Straight ahead'
    : turnDeg < 20
    ? `Slightly ${turnDir}`
    : `Turn ${turnDeg}° ${turnDir}`
  const poiColor = isNavigation ? C.accent : getPoiColor(target)

  const chev0 = chevAnim.interpolate({ inputRange: [0, 0.25, 0.5], outputRange: [0.1, 1, 0.1], extrapolate: 'clamp' })
  const chev1 = chevAnim.interpolate({ inputRange: [0.25, 0.5, 0.75], outputRange: [0.1, 1, 0.1], extrapolate: 'clamp' })
  const chev2 = chevAnim.interpolate({ inputRange: [0.5, 0.75, 1.0], outputRange: [0.1, 1, 0.1], extrapolate: 'clamp' })

  return (
    <Animated.View style={[pa.wrap, style, { transform: [{ scale: mountAnim }] }]}>
      {/* Chevron trail pointing toward destination */}
      <View style={[pa.chevTrail, { transform: [{ rotate: `${relBearing}deg` }] }]}>
        {[chev2, chev1, chev0].map((op, i) => (
          <Animated.View key={i} style={{ opacity: op, marginBottom: -3 }}>
            <Ionicons name="chevron-up" size={13} color={poiColor} />
          </Animated.View>
        ))}
      </View>

      {/* Pulsing ring + arrow disc */}
      <View style={pa.discSection}>
        <Animated.View style={[pa.ring, { borderColor: `${poiColor}28`, transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={[pa.ringOuter, { borderColor: `${poiColor}12`, transform: [{ scale: pulseAnim.interpolate({ inputRange: [1, 1.22], outputRange: [1.3, 1.65] }) }] }]} />
        <LinearGradient colors={[`${poiColor}28`, `${poiColor}08`]} style={pa.disc}>
          <View style={[pa.innerDisc, { borderColor: `${poiColor}45` }]}>
            <Ionicons
              name="navigate"
              size={30}
              color={poiColor}
              style={{ transform: [{ rotate: `${relBearing}deg` }] }}
            />
          </View>
        </LinearGradient>
      </View>

      {/* Name + status + distance */}
      <View style={pa.info}>
        {target._pineconeRecommended && (
          <View style={pa.aiBadge}>
            <Ionicons name="sparkles" size={8} color="#A78BFA" />
            <Text style={pa.aiText}>AI Pick</Text>
          </View>
        )}
        <Text style={[pa.destName, { color: poiColor }]} numberOfLines={1}>{target.name}</Text>
        <Text style={pa.statusLine}>{statusLine}</Text>
        <View style={pa.distRow}>
          <Text style={pa.distTxt}>{getDistText(distKm)}</Text>
          <View style={pa.distDot} />
          <Text style={pa.distTxt}>{getWalkingTime(distKm)}</Text>
        </View>
      </View>
    </Animated.View>
  )
}

const pa = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 8,
  },
  chevTrail: { flexDirection: 'column', alignItems: 'center', marginBottom: 2 },
  discSection: { alignItems: 'center', justifyContent: 'center', width: 80, height: 80 },
  ring: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 1.5,
  },
  ringOuter: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 1,
  },
  disc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  innerDisc: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: 'rgba(8,10,20,0.90)',
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.6, shadowRadius: 14 },
      android: { elevation: 16 },
    }),
  },
  info: { alignItems: 'center', marginTop: 8 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(167,139,250,0.12)',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.20)',
    marginBottom: 3,
  },
  aiText: { color: '#A78BFA', fontSize: 8, fontWeight: '700' },
  destName: { fontSize: 13, fontWeight: '800', maxWidth: 180, textAlign: 'center' },
  statusLine: { color: C.sub, fontSize: 11, marginTop: 2 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  distTxt: { color: C.dimText, fontSize: 10, fontWeight: '600' },
  distDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: C.dimText, opacity: 0.5 },
})

/* ─── Radar Navigator ─── */
function RadarNavigator({ heading, basePois, maxDistanceKm, onSelectPoi, topOffset }) {
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
    <View style={[rd.outer, { top: topOffset }]}>
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

        {dots.map(({ poi, x, y, sz, color, key }) => (
          <TouchableOpacity key={key} onPress={() => onSelectPoi?.(poi)} hitSlop={8}
            style={[rd.dot, { left: x - sz / 2, top: y - sz / 2, width: sz, height: sz, borderRadius: sz / 2, backgroundColor: color, shadowColor: color }]}
            accessibilityLabel={`Navigate to ${poi.name}`}
          />
        ))}

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
  radar: {
    backgroundColor: 'rgba(8,10,18,0.88)', borderWidth: 1, borderColor: C.glassBorder, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 16 },
      android: { elevation: 14 },
    }),
  },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  crossH: { position: 'absolute', height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.04)' },
  crossV: { position: 'absolute', width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.04)' },
  fovLine: { position: 'absolute', width: 1, backgroundColor: `${C.accent}25` },
  sweep: { position: 'absolute', width: 2 },
  sweepGrad: { flex: 1, width: 2, borderRadius: 1 },
  dot: {
    position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  centerGlow: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: `${C.accent}20` },
  centerDot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.accent, borderWidth: 1.5, borderColor: '#FFF' },
  northBadge: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: `${C.accent}30`, alignItems: 'center', justifyContent: 'center' },
  northText: { color: C.accent, fontSize: 7, fontWeight: '900' },
})

/* ─── Edge POI Indicators ─── */
function EdgePOIIndicators({ outOfViewPois, heading, width, height, onPress }) {
  if (!outOfViewPois || outOfViewPois.length === 0) return null

  const left = []
  const right = []
  outOfViewPois.slice(0, 6).forEach((poi) => {
    const rel = (poi.bearing - heading + 360) % 360
    if (rel <= 180) right.push({ poi, rel })
    else left.push({ poi, rel })
  })

  const midY = height * 0.36

  const renderGroup = (items, side) =>
    items.slice(0, 3).map(({ poi, rel }, i) => {
      const color = getPoiColor(poi)
      const turnDeg = Math.round(side === 'right' ? rel : 360 - rel)
      return (
        <TouchableOpacity
          key={`edge-${poi.name}-${i}`}
          style={[ei.pill, side === 'left' ? ei.pillLeft : ei.pillRight, { borderColor: `${color}40`, marginBottom: 8 }]}
          onPress={() => onPress?.(poi)}
          activeOpacity={0.85}
          accessibilityLabel={`${poi.name} ${turnDeg}° to the ${side}`}
        >
          {side === 'left' && <Ionicons name="chevron-back" size={10} color={color} />}
          <View style={ei.pillContent}>
            <Text style={[ei.pillName, { color }]} numberOfLines={1}>{poi.name}</Text>
            <Text style={ei.pillDist}>{getDistText(poi.distanceKm)}</Text>
          </View>
          {side === 'right' && <Ionicons name="chevron-forward" size={10} color={color} />}
        </TouchableOpacity>
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
    backgroundColor: 'rgba(8,10,20,0.86)',
    paddingVertical: 5, paddingHorizontal: 8,
    borderWidth: 1,
    maxWidth: 130,
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
  pillContent: { flex: 1 },
  pillName: { fontSize: 9, fontWeight: '700' },
  pillDist: { color: C.dimText, fontSize: 8, fontWeight: '600', marginTop: 1 },
})

/* ─── POI Detail Modal ─── */
function POIDetailModal({ visible, poi, onClose, onRequestClose, insets, openDirections, onViewProfile, onToggleSave, isSaved, heritage }) {
  if (!poi) return null
  const dismiss = onRequestClose || onClose
  const clientId = poi.client_a_uuid || poi.id
  const hasProfile = Boolean(clientId)
  const m = poi.metadata || poi
  const isLandmark = poi._isLandmark || poi._type === 'landmark' || poi.category
  const typeLabel = poi._type === 'event' ? 'Event' : poi._type === 'restaurant' ? 'Restaurant' : isLandmark ? (m.category || poi.category || 'Landmark') : 'Place'
  const typeIcon = getPoiIcon(poi)
  const poiColor = getPoiColor(poi)
  const phone = m?.phone || poi?.phone || ''
  const menuUrl = m?.menu_url || poi?.menu_url || m?.website || poi?.website || ''
  const heritageInfo = heritage || LANDMARK_HERITAGE[poi.name]
  const distText = poi.distanceKm < 1 ? `${Math.round(poi.distanceKm * 1000)}m away` : `${poi.distanceKm.toFixed(1)} km away`
  const venue = m.venue || m.location || m.area || poi.location || ''
  const desc = m.description || poi.description || ''
  const cuisine = m.cuisine || m.cuisine_type || ''
  const priceRange = m.price_range || ''
  const rating = m.rating != null && m.rating !== '' ? Number(m.rating) : null
  const eventType = m.event_type || ''
  const time = [m.start_time, m.end_time].filter(Boolean).join(' – ')
  const date = m.start_date || m.end_date || ''

  const handleShare = () => {
    Share.share({ title: poi.name, message: `${poi.name} — ${distText}. Explore with SiyahaBH!`, url: `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}` }).catch(() => {})
  }
  const handleCall = () => {
    const tel = phone.replace(/\D/g, '')
    if (tel.length >= 8) Linking.openURL(`tel:${tel}`).catch(() => {})
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={dm.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[dm.card, { paddingBottom: (insets?.bottom ?? 0) + 20 }]}>
          <View style={dm.handle} />
          <TouchableOpacity style={dm.closeBtn} onPress={dismiss} hitSlop={12} accessibilityLabel="Close">
            <BlurView intensity={40} tint="dark" style={dm.closeBtnBlur}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
            </BlurView>
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} style={dm.scroll} bounces={false}>
            <View style={dm.header}>
              <LinearGradient colors={[`${poiColor}20`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dm.typeBadge}>
                <Ionicons name={typeIcon} size={11} color={poiColor} />
                <Text style={[dm.typeText, { color: poiColor }]}>{typeLabel}</Text>
              </LinearGradient>
              <Text style={dm.title}>{poi.name}</Text>
              <View style={dm.metaRow}>
                <View style={dm.metaPill}><Ionicons name="navigate" size={12} color={C.accent} /><Text style={dm.metaText}>{distText}</Text></View>
                <View style={dm.metaPill}><Ionicons name="walk" size={12} color={C.dimText} /><Text style={dm.metaText}>{getWalkingTime(poi.distanceKm)}</Text></View>
                {rating != null && rating > 0 && (
                  <View style={dm.metaPill}>
                    <Ionicons name="star" size={12} color="#FBBF24" />
                    <Text style={[dm.metaText, { color: '#FBBF24' }]}>{rating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
            </View>

            {(venue || cuisine || priceRange || eventType || date || time) && (
              <View style={dm.infoSection}>
                {venue ? <View style={dm.infoRow}><Ionicons name="location" size={14} color={C.accent} /><Text style={dm.infoText}>{venue}</Text></View> : null}
                {(cuisine || priceRange) ? <View style={dm.infoRow}><Ionicons name="restaurant" size={14} color={C.food} /><Text style={dm.infoText}>{[cuisine, priceRange].filter(Boolean).join(' · ')}</Text></View> : null}
                {(eventType || date || time) ? <View style={dm.infoRow}><Ionicons name="calendar" size={14} color={C.event} /><Text style={dm.infoText}>{[eventType, date, time].filter(Boolean).join(' · ')}</Text></View> : null}
              </View>
            )}

            {heritageInfo?.didYouKnow && (
              <View style={dm.heritageBox}>
                <View style={dm.heritageHeader}><Ionicons name="sparkles" size={13} color="#FBBF24" /><Text style={dm.heritageTitle}>Did you know?</Text></View>
                <Text style={dm.heritageText}>{heritageInfo.didYouKnow}</Text>
              </View>
            )}

            {desc ? (
              <View style={dm.descSection}>
                <Text style={dm.descLabel}>{isLandmark ? 'Why visit' : 'About'}</Text>
                <Text style={dm.descText}>{desc}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={dm.actions}>
            <TouchableOpacity style={dm.primaryBtn} onPress={() => openDirections(poi)} activeOpacity={0.85} accessibilityLabel="Get directions">
              <LinearGradient colors={[C.accent, '#9B0C23']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dm.primaryBtnGrad}>
                <Ionicons name="navigate" size={17} color="#FFF" />
                <Text style={dm.primaryBtnText}>Get directions</Text>
                <Text style={dm.primaryBtnSub}>{getWalkingTime(poi.distanceKm)}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={dm.quickRow}>
              {hasProfile && (
                <TouchableOpacity style={dm.quickBtn} onPress={() => onViewProfile?.(clientId)} activeOpacity={0.8}>
                  <Ionicons name="person-outline" size={18} color="#FFF" />
                  <Text style={dm.quickLabel}>Profile</Text>
                </TouchableOpacity>
              )}
              {onToggleSave && (
                <TouchableOpacity style={dm.quickBtn} onPress={() => onToggleSave(poi)} activeOpacity={0.8}>
                  <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={18} color={isSaved ? C.accent : '#FFF'} />
                  <Text style={[dm.quickLabel, isSaved && { color: C.accent }]}>{isSaved ? 'Saved' : 'Save'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={dm.quickBtn} onPress={handleShare} activeOpacity={0.8}>
                <Ionicons name="share-outline" size={18} color="#FFF" />
                <Text style={dm.quickLabel}>Share</Text>
              </TouchableOpacity>
              {phone ? (
                <TouchableOpacity style={dm.quickBtn} onPress={handleCall} activeOpacity={0.8}>
                  <Ionicons name="call-outline" size={18} color="#FFF" />
                  <Text style={dm.quickLabel}>Call</Text>
                </TouchableOpacity>
              ) : null}
              {menuUrl ? (
                <TouchableOpacity style={dm.quickBtn} onPress={() => Linking.openURL(menuUrl).catch(() => {})} activeOpacity={0.8}>
                  <Ionicons name="reader-outline" size={18} color="#FFF" />
                  <Text style={dm.quickLabel}>Menu</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: 'rgba(16,16,22,0.97)', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10, maxHeight: '80%', borderWidth: 1, borderBottomWidth: 0, borderColor: C.glassBorder },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 14 },
  closeBtn: { position: 'absolute', top: 12, right: 16, zIndex: 1 },
  closeBtnBlur: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: C.glassBorder },
  scroll: { marginBottom: 10 },
  header: { marginBottom: 14 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  typeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', lineHeight: 28, marginBottom: 10, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  metaText: { color: C.sub, fontSize: 12, fontWeight: '600' },
  infoSection: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 12, marginBottom: 12, gap: 9, borderWidth: 1, borderColor: C.glassBorder },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  infoText: { color: C.sub, fontSize: 13, flex: 1, lineHeight: 19 },
  heritageBox: { backgroundColor: 'rgba(251,191,36,0.06)', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.12)' },
  heritageHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  heritageTitle: { color: '#FBBF24', fontSize: 11, fontWeight: '800' },
  heritageText: { color: C.sub, fontSize: 13, lineHeight: 20 },
  descSection: { marginBottom: 12 },
  descLabel: { color: C.dimText, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginBottom: 5, textTransform: 'uppercase' },
  descText: { color: C.sub, fontSize: 13, lineHeight: 20 },
  actions: { gap: 10, borderTopWidth: 1, borderTopColor: C.glassBorder, paddingTop: 12 },
  primaryBtn: { borderRadius: 14, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 5 } }) },
  primaryBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', flex: 1 },
  primaryBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, minWidth: 58, borderWidth: 1, borderColor: C.glassBorder },
  quickLabel: { color: C.dimText, fontSize: 10, fontWeight: '600', marginTop: 3 },
})

/* ─── Main Screen ─── */
export default function ARScreen({ navigation }) {
  const { colors } = useTheme()
  const route = useRoute()
  const fromExplore = route.params?.fromExplore === true
  const [navigateToDest, setNavigateToDest] = useState(route.params?.navigateTo ?? null)
  useEffect(() => { if (route.params?.navigateTo) setNavigateToDest(route.params.navigateTo) }, [route.params?.navigateTo])
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { savedIds, toggle: toggleSave, isSaved } = useSavedPlaces()
  const [permission, requestPermission] = useCameraPermissions()
  const [location, setLocation] = useState(null)
  const [heading, setHeading] = useState(0)
  const [pois, setPois] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPoi, setSelectedPoi] = useState(null)
  const [profileClientId, setProfileClientId] = useState(null)
  const [mode, setMode] = useState('all')
  const [maxDistanceKm, setMaxDistanceKm] = useState(fromExplore ? 50 : 10)
  const [showSlider, setShowSlider] = useState(false)
  const [pineconeRecs, setPineconeRecs] = useState([])
  const headingSub = useRef(null)

  const [doorVisible, setDoorVisible] = useState(fromExplore)
  const doorLeft = useRef(new Animated.Value(0)).current
  const doorRight = useRef(new Animated.Value(0)).current
  const doorIconScale = useRef(new Animated.Value(1)).current
  const doorIconOpacity = useRef(new Animated.Value(1)).current
  const doorFade = useRef(new Animated.Value(1)).current
  const doorOpenedRef = useRef(false)

  const modePois = useMemo(() => {
    const merged = mode === 'all' || mode === 'places'
      ? [...pois, ...pineconeRecs]
      : pois
    if (mode === 'all') return merged
    if (mode === 'places') return merged.filter((p) => p._type === 'place' || p._type === 'landmark' || p._isLandmark)
    if (mode === 'restaurants') return pois.filter((p) => p._type === 'restaurant')
    if (mode === 'events') return pois.filter((p) => p._type === 'event')
    if (mode === 'saved') return pois.filter((p) => { const id = p.client_a_uuid || p.id || `${p.name}-${p.lat}-${p.lng}`; return savedIds.has(id) })
    return pois
  }, [pois, pineconeRecs, mode, savedIds])

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

  const filteredPois = basePois.filter((p) => {
    if (p.distanceKm > maxDistanceKm) return false
    const relBearing = (p.bearing - heading + 360) % 360
    return Math.min(relBearing, 360 - relBearing) <= CAMERA_FOV_DEG / 2
  })

  const nearestInView = filteredPois.length > 0 ? filteredPois.reduce((a, b) => a.distanceKm <= b.distanceKm ? a : b) : null
  const inViewIds = new Set(filteredPois.map((p) => p.name + p.lat))
  const nearestOutOfView = basePois.filter((p) => p.distanceKm <= maxDistanceKm && !inViewIds.has(p.name + p.lat)).sort((a, b) => a.distanceKm - b.distanceKm)[0] || null

  const clearNavigateTo = useCallback(() => setNavigateToDest(null), [])
  const centerX = width / 2
  const centerY = height / 2 - 40
  const viewRadius = Math.min(width, height) * 0.35

  const loadNearby = useCallback(async (lat, lng) => {
    try {
      const [clientData, eventData, pineconeData] = await Promise.all([
        fetchNearbyPOIs(lat, lng, 'all', { allPlaces: true }),
        fetchEvents([]).catch(() => []),
        fetchPineconeARRecommended(lat, lng, 50).catch(() => []),
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
  }, [])

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
    if (!location) return
    let cleaned = false
    Location.watchHeadingAsync((h) => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading))
      .then((s) => { if (cleaned) s.remove(); else headingSub.current = s })
    return () => { cleaned = true; headingSub.current?.remove?.(); headingSub.current = null }
  }, [location])

  useEffect(() => {
    if (!fromExplore || doorOpenedRef.current) return
    if (loading) return
    doorOpenedRef.current = true
    const delay = setTimeout(() => {
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(doorIconOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(doorIconScale, { toValue: 0.5, duration: 250, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(doorLeft, { toValue: -DOOR_W / 2, duration: 480, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
          Animated.timing(doorRight, { toValue: DOOR_W / 2, duration: 480, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
        ]),
        Animated.timing(doorFade, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start(() => setDoorVisible(false))
    }, 100)
    return () => clearTimeout(delay)
  }, [fromExplore, loading])

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
  const handleViewProfile = useCallback((clientId) => { setSelectedPoi(null); setProfileClientId(clientId) }, [])

  const getMarkerPosition = (poi) => {
    const relBearing = ((poi.bearing - heading + 360) % 360) * (Math.PI / 180)
    const xPos = centerX + Math.sin(relBearing) * viewRadius - 65
    const yPos = centerY - Math.cos(relBearing) * viewRadius - 35
    return { x: Math.max(10, Math.min(width - 140, xPos)), y: Math.max(10, Math.min(height - 120, yPos)) }
  }

  const renderDoorOverlay = () => {
    if (!doorVisible) return null
    const TOOTH_COUNT = 5
    const toothH = DOOR_H / TOOTH_COUNT
    const toothW = DOOR_W * 0.12
    return (
      <Animated.View style={[s.doorOverlay, { opacity: doorFade }]} pointerEvents="box-none">
        <Animated.View style={[s.doorHalf, s.doorL, { transform: [{ translateX: doorLeft }] }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
        </Animated.View>
        <Animated.View style={[s.doorHalf, s.doorR, { transform: [{ translateX: doorRight }] }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#CE1126' }]} />
        </Animated.View>
        <Animated.View style={[s.doorZigzag, { transform: [{ translateX: doorLeft }] }]}>
          {Array.from({ length: TOOTH_COUNT }, (_, i) => (
            <View key={i} style={{
              width: 0, height: 0,
              borderTopWidth: toothH / 2, borderBottomWidth: toothH / 2, borderLeftWidth: toothW,
              borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#FFFFFF',
            }} />
          ))}
        </Animated.View>
        <Animated.View style={[s.doorCenter, { transform: [{ scale: doorIconScale }], opacity: doorIconOpacity }]}>
          <View style={s.doorIconRing}>
            <LinearGradient colors={['#CE1126', '#9B0C23']} style={s.doorIconGrad}>
              <Ionicons name="scan" size={44} color="#FFF" />
            </LinearGradient>
          </View>
          <Text style={s.doorLabel}>AR EXPLORER</Text>
          <Text style={s.doorSubLabel}>Bahrain</Text>
        </Animated.View>
      </Animated.View>
    )
  }

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
        {renderDoorOverlay()}
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
        {renderDoorOverlay()}
      </View>
    )
  }

  const emptyHint = mode === 'saved' ? 'Save places to see them here'
    : mode === 'events' ? 'No events in this direction'
    : mode === 'restaurants' ? 'No restaurants in this direction'
    : mode === 'places' ? 'No places in this direction'
    : 'Point your camera around'

  // Pokemon Go arrow target: navigateTo destination takes priority, else nearest out-of-view POI
  const arrowTarget = navigateToDest
    ? { ...navigateToDest, _type: 'place' }
    : nearestOutOfView || null

  return (
    <View style={s.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {loading ? <ScanningLoader /> : (
        <>
          {navigateToDest && location && (
            <NavigateToBanner destination={navigateToDest} userLat={location.latitude} userLng={location.longitude} heading={heading} onDismiss={clearNavigateTo} />
          )}
          {filteredPois.map((poi, i) => {
            const { x, y } = getMarkerPosition(poi)
            return (
              <POIMarker key={`${poi.name}-${poi.lat}-${i}`} poi={poi} x={x} y={y} onPress={handleOpenPOI}
                isNearest={nearestInView && nearestInView.name === poi.name && nearestInView.lat === poi.lat}
                index={i} isBusy={getIsBusy(poi)}
              />
            )
          })}

          {!navigateToDest && (
            <EdgePOIIndicators
              outOfViewPois={basePois.filter((p) => p.distanceKm <= maxDistanceKm && !inViewIds.has(p.name + p.lat)).slice(0, 6)}
              heading={heading}
              width={width}
              height={height}
              onPress={handleOpenPOI}
            />
          )}

          {location && arrowTarget && (
            <PathArrowIndicator
              target={arrowTarget}
              heading={heading}
              userLat={location.latitude}
              userLng={location.longitude}
              isNavigation={!!navigateToDest}
              style={{ bottom: insets.bottom + 108 }}
            />
          )}

          <RadarNavigator
            heading={heading}
            basePois={basePois}
            maxDistanceKm={maxDistanceKm}
            onSelectPoi={handleOpenPOI}
            topOffset={insets.top + 56}
          />
        </>
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
          </View>
          <TouchableOpacity style={s.headerBtn} onPress={() => setShowSlider((v) => !v)} activeOpacity={0.8} accessibilityLabel="Toggle range slider">
            <Ionicons name={showSlider ? 'radio' : 'radio-outline'} size={20} color={showSlider ? C.accent : '#FFF'} />
          </TouchableOpacity>
        </View>
      </BlurView>

      {/* ─── Bottom Panel ─── */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 8 }]}>
        <BlurView intensity={Platform.OS === 'ios' ? 55 : 0} tint="dark" style={s.bottomBlur}>
          <View style={s.bottomBg} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
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

          {showSlider && (
            <View style={s.sliderWrap}>
              <View style={s.sliderHeader}>
                <Text style={s.sliderLabel}>Discovery range</Text>
                <View style={s.sliderPill}><Text style={s.sliderValue}>{maxDistanceKm < 1 ? `${Math.round(maxDistanceKm * 1000)}m` : `${maxDistanceKm}km`}</Text></View>
              </View>
              <Slider
                style={s.slider}
                minimumValue={0.5}
                maximumValue={25}
                step={0.5}
                value={maxDistanceKm}
                onValueChange={setMaxDistanceKm}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor={C.accent}
              />
            </View>
          )}

          {filteredPois.length === 0 && !loading && (
            <Text style={s.hint}>
              {navigateToDest ? 'Turn toward your destination'
                : nearestOutOfView ? `Turn to find ${nearestOutOfView.name}`
                : pois.length > 0 ? emptyHint
                : 'Scan your surroundings'}
            </Text>
          )}
        </BlurView>
      </View>

      <POIDetailModal
        visible={!!selectedPoi} poi={selectedPoi} onClose={closeModal} onRequestClose={() => setSelectedPoi(null)}
        insets={insets} openDirections={openDirections}
        onViewProfile={handleViewProfile} onToggleSave={toggleSave} isSaved={selectedPoi ? isSaved(selectedPoi) : false}
      />
      <ClientProfileModal
        visible={!!profileClientId} clientId={profileClientId} onClose={() => setProfileClientId(null)}
        insets={insets} onOpenARNavigate={(dest) => { setProfileClientId(null); setNavigateToDest(dest) }}
      />

      {renderDoorOverlay()}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: `${C.accent}12`, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: `${C.accent}18` },
  errorTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  errorText: { color: C.sub, fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  errorBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 14 },
  errorBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  header: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.glassBorder, paddingBottom: 8 },
  headerBg: { ...StyleSheet.absoluteFillObject, backgroundColor: Platform.OS === 'android' ? C.glass : 'transparent' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.glassBorder },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomBlur: { overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.glassBorder },
  bottomBg: { ...StyleSheet.absoluteFillObject, backgroundColor: Platform.OS === 'android' ? C.glass : 'transparent' },

  filterRow: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  filterText: { color: C.dimText, fontSize: 11, fontWeight: '600' },

  sliderWrap: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 0 },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sliderLabel: { color: C.dimText, fontSize: 10, fontWeight: '600' },
  sliderPill: { backgroundColor: `${C.accent}15`, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 5 },
  sliderValue: { color: C.accent, fontSize: 10, fontWeight: '700' },
  slider: { width: '100%', height: 24 },

  hint: { color: C.dimText, fontSize: 11, fontWeight: '500', textAlign: 'center', paddingTop: 4, paddingBottom: 6 },

  doorOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
  doorHalf: { position: 'absolute', top: 0, bottom: 0, width: DOOR_W / 2, overflow: 'hidden' },
  doorL: { left: 0 },
  doorR: { right: 0 },
  doorZigzag: { position: 'absolute', top: 0, left: DOOR_W / 2, bottom: 0, zIndex: 2 },
  doorCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  doorIconRing: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: '#FFF', overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16 },
      android: { elevation: 14 },
    }),
  },
  doorIconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doorLabel: { marginTop: 14, fontSize: 18, fontWeight: '900', color: '#FFF', letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  doorSubLabel: { marginTop: 4, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' },
})
