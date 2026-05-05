import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  useWindowDimensions,
  RefreshControl,
  Image,
  Animated,
  Easing,
  TouchableOpacity,
  Modal,
  Platform,
  Vibration,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'
import {
  fetchBrowseClientsGrouped,
  fetchExploreEventsFromSupabase,
  fetchPlaces,
  fetchRestaurants,
  fetchEvents,
} from '../services/aiPipeline'
import ClientProfileModal from '../components/ClientProfileModal'
import EventDetailModal from '../components/EventDetailModal'
import { supabase } from '../config/supabase'
import { coerceImageValueToString, parseStorageImageUrl, resolvePublicImageUrl } from '../utils/imageUrl'
import { FadeInView, ShimmerPlaceholder, AnimatedPressable, PulseView } from '../components/AnimatedUI'
import { LUXURY, luxuryCardShadow } from '../theme/luxuryPremium'
import { layoutContentWidth } from '../constants/webLayout'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useAuth } from '../context/AuthContext'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView)

const CARD_GAP = 12
const AUTO_ADVANCE_MS = 4000
/** Tiles per vertical column in “Personalized by AI” masonry (caps visual height). */
const PERSONALIZED_MAX_ROWS_PER_COLUMN = 4
const PERSONALIZED_MAX_HORIZONTAL_PAGES = 3
const PERSONALIZED_ROLL_STEP_PX = 0.8
const PERSONALIZED_ROLL_TICK_MS = 16

const MASONRY_HEIGHT_RATIOS = [0.88, 1.02, 1.18, 1.34, 1.5, 1.12, 1.26, 0.96, 1.42]

const masonryRatioFor = (seed, index = 0) => {
  const s = String(seed || `seed-${index}`)
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i) + index) % 2147483647
  }
  return MASONRY_HEIGHT_RATIOS[Math.abs(hash) % MASONRY_HEIGHT_RATIOS.length]
}

/** Vertical scan line over the icon only — same pattern as CommunitiesScreen `FabOptionIconScanning`. */
const ArScanIcon = ({ name, size = 24, color = '#FFF' }) => {
  const scanLine = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [scanLine])

  const translateY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 28] })

  return (
    <View style={[arScanIconStyles.wrap, { width: size, height: size }]}>
      <Ionicons name={name} size={size} color={color} />
      <Animated.View style={[arScanIconStyles.scanLine, { transform: [{ translateY }] }]} pointerEvents="none">
        <View style={arScanIconStyles.scanLineInner} />
      </Animated.View>
    </View>
  )
}

const arScanIconStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    top: -2,
    left: -4,
    right: -4,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLineInner: {
    width: 32,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
  },
})

const buildMergedEventBrowseItems = (eventsCarousel, clientEvents) => {
  const fromDb = (eventsCarousel || []).map((e) => ({
    kind: 'dbEvent',
    key: `db-${e.id}`,
    name: e.metadata?.event_name || 'Event',
    image: e.metadata?.image,
    lat: e.metadata?.lat,
    long: e.metadata?.long,
  }))
  const fromClient = (clientEvents || []).map((c) => ({
    kind: 'client',
    key: `c-${c.client_a_uuid}`,
    name: c.name,
    image: resolvePublicImageUrl(c.client_image),
    clientId: c.client_a_uuid,
    raw: c,
  }))
  return [...fromDb, ...fromClient]
}

const deriveImageUri = (item) => {
  if (!item) return null
  if (item.kind === 'dbEvent') return resolvePublicImageUrl(item.image) || coerceImageValueToString(item.image)
  if (item.kind === 'client') return resolvePublicImageUrl(item.image) || coerceImageValueToString(item.image)
  return resolvePublicImageUrl(item.client_image) || resolvePublicImageUrl(item.image) || coerceImageValueToString(item.image)
}

const buildCultureBooklets = ({ restaurants, places, events, mergedEventBrowseItems }) => {
  const safeRestaurants = restaurants || []
  const safePlaces = places || []
  const safeEvents = events || []
  const safeMerged = mergedEventBrowseItems || []

  return [
    {
      key: 'culture-heritage',
      title: 'Culture & Heritage',
      subtitle: 'Museums, forts, old souqs, and stories of Bahrain',
      icon: 'library-outline',
      color: '#7C3AED',
      items: safePlaces.slice(0, 6),
    },
    {
      key: 'culture-food',
      title: 'Taste of Bahrain',
      subtitle: 'Traditional flavors, modern dining, and local gems',
      icon: 'restaurant-outline',
      color: '#F97316',
      items: safeRestaurants.slice(0, 6),
    },
    {
      key: 'culture-experience',
      title: 'Events & Experiences',
      subtitle: 'Curated from AI + Pinecone + your live database',
      icon: 'sparkles-outline',
      color: '#0EA5E9',
      items: safeMerged.slice(0, 6).length ? safeMerged.slice(0, 6) : safeEvents.slice(0, 6),
    },
  ]
}

const normalizePersonalizedCard = (match, fallbackType = 'place') => {
  const meta = match?.metadata || {}
  const isEventMeta = fallbackType === 'event' || String(meta.record_type || '').toLowerCase() === 'event'
  const rawImageCandidates = isEventMeta
    ? [
        meta.image,
        meta.image_url,
        meta.thumbnail_url,
        meta.cover_image,
        meta.client_image,
        meta.post_image,
        meta.thumbnail,
        meta.photo,
        match?.image,
      ]
    : [
        meta.image_url,
        meta.thumbnail_url,
        meta.cover_image,
        meta.image,
        meta.client_image,
        meta.post_image,
        meta.hero_image,
        meta.profile_image,
        meta.banner_image,
        meta.media_url,
        meta.thumbnail,
        meta.photo,
        match?.image,
      ]

  const resolvedImage =
    rawImageCandidates
      .map((v) => resolvePublicImageUrl(v) || parseStorageImageUrl(v))
      .find((u) => u && String(u).trim()) || null

  const resolvedClientId =
    meta.client_a_uuid ||
    meta.client_uuid ||
    meta.client_id ||
    (fallbackType !== 'event' ? String(match?.id || '').trim() || null : null)

  const resolvedLat = meta.lat ?? meta.latitude ?? null
  const resolvedLng = meta.long ?? meta.lng ?? meta.longitude ?? null

  const type =
    fallbackType === 'event' || meta.record_type === 'event'
      ? 'event'
      : String(meta.client_type || '').toLowerCase() === 'restaurant'
        ? 'restaurant'
        : 'place'
  return {
    key: `pc-${match?.id || meta.event_uuid || meta.client_a_uuid || Math.random().toString(36).slice(2)}`,
    title: meta.event_name || meta.business_name || meta.name || meta.place_name || 'Bahrain pick',
    subtitle:
      type === 'event'
        ? [meta.venue, meta.start_date || meta.start_time].filter(Boolean).join(' • ') || 'Live event in Bahrain'
        : meta.location || meta.area || meta.category || (type === 'restaurant' ? 'Dining in Bahrain' : 'Top attraction in Bahrain'),
    image: resolvedImage,
    lat: resolvedLat,
    lng: resolvedLng,
    clientId: resolvedClientId,
    type,
    sourceEvent:
      type === 'event'
        ? {
            id: String(match?.id || meta.event_uuid || `event-${Math.random().toString(36).slice(2)}`),
            metadata: meta,
          }
        : null,
  }
}

const CLIENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const hydrateExplorePersonalizedRailsImages = async (rails, exploreEvents) => {
  const base = {
    places: [...(rails.places || [])],
    restaurants: [...(rails.restaurants || [])],
    events: [...(rails.events || [])],
  }

  const eventById = new Map(
    (exploreEvents || []).filter((e) => e?.id != null).map((e) => [String(e.id), e]),
  )
  base.events = base.events.map((c) => {
    if (c?.image) return c
    const id = c?.sourceEvent?.id != null ? String(c.sourceEvent.id) : ''
    if (!id) return c
    const ev = eventById.get(id)
    const m = ev?.metadata || {}
    const raw = m.image || m.image_url || m.thumbnail_url || m.cover_image || m.client_image || m.post_image
    const url = raw ? resolvePublicImageUrl(raw) || parseStorageImageUrl(raw) : null
    return url ? { ...c, image: url } : c
  })

  const idsNeeding = new Set()
  for (const row of [...base.places, ...base.restaurants]) {
    if (row?.image) continue
    const cid = row?.clientId != null ? String(row.clientId).trim() : ''
    if (cid && CLIENT_UUID_RE.test(cid)) idsNeeding.add(cid)
  }
  if (idsNeeding.size === 0) return base

  const idList = [...idsNeeding].slice(0, 48)
  const { data, error } = await supabase.from('client').select('client_a_uuid, client_image').in('client_a_uuid', idList)
  if (error || !Array.isArray(data) || data.length === 0) return base

  const byUuid = {}
  for (const row of data) {
    if (!row?.client_a_uuid) continue
    const url = resolvePublicImageUrl(row.client_image) || parseStorageImageUrl(row.client_image)
    if (url) byUuid[row.client_a_uuid] = url
  }

  const attach = (rows) =>
    (rows || []).map((row) => {
      if (row?.image || !row?.clientId) return row
      const u = byUuid[String(row.clientId).trim()]
      return u ? { ...row, image: u } : row
    })

  base.places = attach(base.places)
  base.restaurants = attach(base.restaurants)

  return base
}

function HeroAmbientLayer({ accent, isDark }) {
  const drift = useRef(new Animated.Value(0)).current
  const driftB = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(driftB, { toValue: 1, duration: 6400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftB, { toValue: 0, duration: 6400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    a.start()
    b.start()
    return () => {
      a.stop()
      b.stop()
    }
  }, [drift, driftB])

  const orb1Y = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] })
  const orb1X = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 10] })
  const orb1Scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })
  const orb2Y = driftB.interpolate({ inputRange: [0, 1], outputRange: [0, 18] })
  const orb2X = driftB.interpolate({ inputRange: [0, 1], outputRange: [0, -16] })
  const orb2Opacity = driftB.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] })

  return (
    <View style={ambientStyles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          ambientStyles.orb,
          {
            backgroundColor: `${accent}${isDark ? '35' : '22'}`,
            top: -40,
            right: -30,
            width: 160,
            height: 160,
            borderRadius: 80,
            opacity: isDark ? 0.45 : 0.7,
            transform: [{ translateX: orb1X }, { translateY: orb1Y }, { scale: orb1Scale }],
          },
        ]}
      />
      <Animated.View
        style={[
          ambientStyles.orb,
          {
            backgroundColor: isDark ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.14)',
            bottom: -50,
            left: -40,
            width: 200,
            height: 200,
            borderRadius: 100,
            transform: [{ translateX: orb2X }, { translateY: orb2Y }],
            opacity: orb2Opacity,
          },
        ]}
      />
    </View>
  )
}

const ambientStyles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, overflow: 'visible' },
  orb: { position: 'absolute' },
})

function CinematicEventCard({ item, cardWidth, cardHeight, onPress }) {
  const cardRef = useRef(null)
  const { width: screenW = 375 } = useWindowDimensions()
  const compact = screenW < 430
  const handleCardPress = useCallback(() => {
    const node = cardRef.current
    if (!node || typeof node.measureInWindow !== 'function') {
      onPress?.(item, null)
      return
    }
    node.measureInWindow((x, y, width, height) => {
      onPress?.(item, { x, y, width, height })
    })
  }, [item, onPress])
  const { isDark, colors } = useTheme()
  const m = item?.metadata || {}
  const name = m.event_name || 'Event'
  const venue = m.venue || ''
  const time = [m.start_time, m.end_time].filter(Boolean).join(' - ')
  const date = m.start_date || m.end_date || ''
  const eventType = m.event_type || ''
  const imageUri = useMemo(() => {
    const resolved = resolvePublicImageUrl(m.image)
    if (resolved) return resolved
    const s = coerceImageValueToString(m.image)
    if (s && (s.startsWith('http://') || s.startsWith('https://'))) return s
    return null
  }, [m.image])
  const whenLine = [date, time].filter(Boolean).join(' • ')
  const parsedDate = useMemo(() => {
    if (!date) return null
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return null
    return d
  }, [date])
  const month = parsedDate
    ? parsedDate.toLocaleString('en-US', { month: 'short' }).toUpperCase()
    : ''
  const day = parsedDate ? String(parsedDate.getDate()).padStart(2, '0') : ''
  const year = parsedDate ? String(parsedDate.getFullYear()) : ''
  const subtitle = [venue, time].filter(Boolean).join(' • ')

  return (
    <View ref={cardRef} collapsable={false} style={{ width: cardWidth }}>
      <AnimatedPressable
        scaleDown={0.985}
        activeOpacity={0.95}
        onPress={handleCardPress}
        style={{ width: cardWidth }}
        accessibilityRole="button"
        accessibilityLabel={`${name}${whenLine ? `, ${whenLine}` : ''}${venue ? `, ${venue}` : ''}`}
      >
      <View style={[cs.card, { width: cardWidth, height: cardHeight }]}>
        <View style={cs.cardImageWrap}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={isDark ? ['#140e1e', '#2c1c3f', '#542648'] : ['#eef2f8', '#c8d2e6', '#8aa2c6']}
              start={{ x: 0.02, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>

        <LinearGradient
          colors={['rgba(5,8,20,0.04)', 'rgba(5,8,20,0.22)', 'rgba(5,8,20,0.58)']}
          start={{ x: 0.5, y: 0.02 }}
          end={{ x: 0.5, y: 1 }}
          style={cs.cardPosterOverlay}
        />

        {!!eventType && (
          <View style={cs.cardTopTagWrap}>
            <View style={cs.cardTopTag}>
              <Text style={cs.cardTopTagText} numberOfLines={1}>{String(eventType).toUpperCase()}</Text>
            </View>
          </View>
        )}

        {!!parsedDate && (
          <View style={cs.cardTopRightBadgeWrap}>
            <View style={cs.cardBottomLeftBadge}>
              {!!month && <Text style={cs.cardBadgeMonth}>{month}</Text>}
              {!!day && <Text style={cs.cardBadgeDay}>{day}</Text>}
              {!!year && <Text style={cs.cardBadgeYear}>{year}</Text>}
            </View>
          </View>
        )}

        <View style={cs.cardBottomContent}>
          <Text style={[cs.cardTitle, compact ? cs.cardTitleCompact : null]} numberOfLines={2}>
            {name}
          </Text>
          {!!subtitle && (
            <Text style={cs.cardSubTitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      </AnimatedPressable>
    </View>
  )
}

const cs = StyleSheet.create({
  card: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#020617', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.34, shadowRadius: 26 },
      android: { elevation: 12 },
    }),
  },
  cardImageWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  cardPosterOverlay: { ...StyleSheet.absoluteFillObject },
  cardTopTagWrap: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  cardTopTag: {
    borderRadius: 999,
    maxWidth: 180,
    backgroundColor: 'rgba(6,11,25,0.26)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cardTopTagText: { color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  cardBottomContent: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  cardTitleCompact: { fontSize: 22, lineHeight: 24 },
  cardSubTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.1,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardTopRightBadgeWrap: {
    position: 'absolute',
    right: 18,
    top: 22,
    maxWidth: 96,
  },
  cardBottomLeftBadge: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 11,
    minWidth: 84,
    alignItems: 'center',
    backgroundColor: 'rgba(244,246,251,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  cardBadgeMonth: {
    color: '#30343C',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 6,
    marginBottom: 5,
    textAlign: 'center',
  },
  cardBadgeDay: {
    color: '#12151A',
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: -2.4,
    lineHeight: 56,
    marginBottom: 6,
  },
  cardBadgeYear: {
    color: '#2C3138',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 4.5,
    textAlign: 'center',
  },
})

function LoadingSkeleton({ width: w, height: h }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
      <FadeInView delay={0} from={20}>
        <View style={{ width: w, height: h, borderRadius: LUXURY.radiusHero, overflow: 'hidden' }}>
          <ShimmerPlaceholder width={w} height={h} borderRadius={LUXURY.radiusHero} />
          <View style={{ position: 'absolute', bottom: 24, left: 22, right: 22 }}>
            <ShimmerPlaceholder width={w * 0.65} height={20} borderRadius={10} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <ShimmerPlaceholder width={w * 0.35} height={28} borderRadius={14} />
              <ShimmerPlaceholder width={w * 0.35} height={28} borderRadius={14} />
            </View>
          </View>
        </View>
      </FadeInView>
    </View>
  )
}

export default function ExploreScreen({ navigation }) {
  const { colors, isDark } = useTheme()
  const { activityLabels, foodLabels, preferences } = useUserPreferences()
  const { profile } = useAuth()
  const insets = useSafeAreaInsets()
  const { width: winW = 375, height = 667 } = useWindowDimensions()
  const isMobile = winW < 430
  const personalizedColumnCount = winW >= 1200 ? 4 : winW >= 800 ? 3 : 2
  const editorialTitleSize = isMobile ? 18 : winW < 800 ? 22 : 27
  const layoutW = layoutContentWidth(winW)
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0)

  const cardWidth = Math.round(layoutW * (isMobile ? 0.74 : 0.66))
  const cardHeight = Math.round(Math.min(height * 0.64, cardWidth * 1.48))
  const peekPadding = 24
  const itemStride = cardWidth + CARD_GAP

  const [events, setEvents] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [browseClients, setBrowseClients] = useState({ restaurants: [], places: [], events: [] })
  const [browseLoadError, setBrowseLoadError] = useState(null)
  const [personalizedRails, setPersonalizedRails] = useState({
    places: [],
    restaurants: [],
    events: [],
  })
  const [personalizedError, setPersonalizedError] = useState(null)
  const [activeBookletGuide, setActiveBookletGuide] = useState(null)
  const [profileClientId, setProfileClientId] = useState(null)
  const [detailEvent, setDetailEvent] = useState(null)
  const [detailSourceRect, setDetailSourceRect] = useState(null)
  const [coreExploreLoading, setCoreExploreLoading] = useState(true)
  const [personalizedLoading, setPersonalizedLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [eventTab, setEventTab] = useState('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const [progressTrackW, setProgressTrackW] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const scrollY = useRef(new Animated.Value(0)).current
  const flatListRef = useRef(null)
  const virtualIndexRef = useRef(0)
  const isUserInteractingRef = useRef(false)
  const didInitialScrollRef = useRef(false)
  const autoAdvanceTimerRef = useRef(null)
  const personalizedSliderRef = useRef(null)
  const personalizedSliderTimerRef = useRef(null)
  const personalizedSliderOffsetRef = useRef(0)
  const personalizedIsDraggingRef = useRef(false)
  const headerOpacity = useRef(new Animated.Value(0)).current
  const headerTranslateY = useRef(new Animated.Value(20)).current
  const titlePop = useRef(new Animated.Value(0.88)).current
  const fillW = useRef(new Animated.Value(0)).current

  const exploreHeroSubtitle = useMemo(() => {
    if (String(profile?.user?.u_type || '').toLowerCase() === 'tourist') {
      return 'Signature sights, flavors, and routing-friendly picks for your visit'
    }
    return 'Weekend energy, personalized rails, and ideas for how you actually go out'
  }, [profile?.user?.u_type])

  const heroParallaxY = scrollY.interpolate({
    inputRange: [0, 180],
    outputRange: [0, -42],
    extrapolate: 'clamp',
  })
  const heroParallaxScale = scrollY.interpolate({
    inputRange: [0, 220],
    outputRange: [1, 0.965],
    extrapolate: 'clamp',
  })
  const heroScrollOpacity = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  })
  const headerTranslateCombined = Animated.add(headerTranslateY, heroParallaxY)
  const heroOpacityCombined = Animated.multiply(headerOpacity, heroScrollOpacity)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 680, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerTranslateY, { toValue: 0, duration: 680, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [headerOpacity, headerTranslateY])

  useEffect(() => {
    Animated.spring(titlePop, {
      toValue: 1,
      friction: 7,
      tension: 78,
      delay: 200,
      useNativeDriver: true,
    }).start()
  }, [titlePop])

  const filteredEvents = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) return []
    if (eventTab === 'all') return events
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    return events.filter((e) => {
      const m = e?.metadata || {}
      const baseDate = m.start_date || m.end_date
      if (!baseDate) return false
      const parsed = new Date(baseDate)
      if (Number.isNaN(parsed.getTime())) return false
      const month = parsed.getMonth()
      const year = parsed.getFullYear()
      if (eventTab === 'thisMonth') {
        return month === currentMonth && year === currentYear
      }
      if (eventTab === 'nextMonth') {
        const nextMonthDate = new Date(currentYear, currentMonth + 1, 1)
        return month === nextMonthDate.getMonth() && year === nextMonthDate.getFullYear()
      }
      return true
    })
  }, [events, eventTab])

  useEffect(() => {
    if (coreExploreLoading || filteredEvents.length === 0 || progressTrackW <= 0) {
      if (filteredEvents.length === 0) fillW.setValue(0)
      return
    }
    const target = Math.max(((activeIndex + 1) / filteredEvents.length) * progressTrackW, 8)
    Animated.spring(fillW, {
      toValue: target,
      friction: 8,
      tension: 72,
      useNativeDriver: false,
    }).start()
  }, [activeIndex, filteredEvents.length, progressTrackW, coreExploreLoading, fillW])

  const loadExplore = useCallback(async (opts = {}) => {
    const isPullRefresh = opts.pullRefresh === true
    if (!isPullRefresh) {
      setPersonalizedLoading(true)
    }

    let exploreEventsSnapshot = []
    try {
      setLoadError(null)
      setBrowseLoadError(null)
      const [evRes, browseRes] = await Promise.all([
        fetchExploreEventsFromSupabase(),
        fetchBrowseClientsGrouped(),
      ])
      exploreEventsSnapshot = Array.isArray(evRes.events) ? evRes.events : []
      setEvents(exploreEventsSnapshot)
      setLoadError(evRes.error || null)
      setBrowseClients({
        restaurants: browseRes.restaurants || [],
        places: browseRes.places || [],
        events: browseRes.events || [],
      })
      setBrowseLoadError(browseRes.error || null)
    } catch (e) {
      console.warn('[Explore] core load failed:', e?.message)
      setEvents([])
      setBrowseClients({ restaurants: [], places: [], events: [] })
      setLoadError(e?.message || 'Could not load')
      setBrowseLoadError(e?.message || null)
    } finally {
      setCoreExploreLoading(false)
    }

    try {
      const profileNarrative = preferences?.profileSummary || ''
      const [pPlaces, pRestaurants, pEvents] = await Promise.all([
        fetchPlaces(activityLabels || [], { profileNarrative }),
        fetchRestaurants(foodLabels || [], { profileNarrative }),
        fetchEvents(activityLabels || [], { profileNarrative }),
      ])
      let rails = {
        places: (pPlaces || []).slice(0, 10).map((m) => normalizePersonalizedCard(m, 'place')),
        restaurants: (pRestaurants || []).slice(0, 10).map((m) => normalizePersonalizedCard(m, 'restaurant')),
        events: (pEvents || []).slice(0, 10).map((m) => normalizePersonalizedCard(m, 'event')),
      }
      rails = await hydrateExplorePersonalizedRailsImages(rails, exploreEventsSnapshot)
      setPersonalizedRails(rails)
      setPersonalizedError(null)
    } catch (e) {
      console.warn('[Explore] personalized load failed:', e?.message)
      setPersonalizedRails({ places: [], restaurants: [], events: [] })
      setPersonalizedError(e?.message || 'Could not load personalized picks')
    } finally {
      setPersonalizedLoading(false)
      setRefreshing(false)
    }
  }, [activityLabels, foodLabels, preferences?.profileSummary])

  useEffect(() => {
    loadExplore({ pullRefresh: false })
  }, [loadExplore])

  const mergedEventBrowseItems = useMemo(
    () => buildMergedEventBrowseItems(events, browseClients.events),
    [events, browseClients.events],
  )
  const cultureBooklets = useMemo(
    () =>
      buildCultureBooklets({
        restaurants: browseClients.restaurants,
        places: browseClients.places,
        events,
        mergedEventBrowseItems,
      }),
    [browseClients.restaurants, browseClients.places, events, mergedEventBrowseItems],
  )
  const personalizedEditorialPages = useMemo(() => {
    const tilesPerPage = personalizedColumnCount * PERSONALIZED_MAX_ROWS_PER_COLUMN
    const seedCap = tilesPerPage * PERSONALIZED_MAX_HORIZONTAL_PAGES

    const seeds = [
      ...(personalizedRails.events || []).map((item) => ({ ...item, editorialTag: 'EVENTS' })),
      ...(personalizedRails.places || []).map((item) => ({ ...item, editorialTag: 'PLACES' })),
      ...(personalizedRails.restaurants || []).map((item) => ({ ...item, editorialTag: 'DINING' })),
    ]
      .slice(0, seedCap)
      .map((item, index) => ({
        ...item,
        heightRatio: masonryRatioFor(item.key, index),
      }))
    if (seeds.length === 0) return []
    const pages = []
    for (let i = 0; i < seeds.length; i += tilesPerPage) {
      const chunk = seeds.slice(i, i + tilesPerPage)
      const pageItems = chunk.map((it, idx) => ({
        ...it,
        col: idx % personalizedColumnCount,
      }))
      pages.push(
        Array.from({ length: personalizedColumnCount }, (_, colIndex) =>
          pageItems.filter((x) => x.col === colIndex),
        ),
      )
    }
    return pages
  }, [personalizedRails.events, personalizedRails.places, personalizedRails.restaurants, personalizedColumnCount])
  const personalizedRollingPages = useMemo(() => {
    if (personalizedEditorialPages.length === 0) return []
    return [...personalizedEditorialPages, ...personalizedEditorialPages]
  }, [personalizedEditorialPages])
  const handleBrowseDbEventPress = useCallback(
    (item) => {
      const lat = parseFloat(item.lat)
      const lng = parseFloat(item.long)
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        navigation.navigate('AR', { navigateTo: { lat, lng, name: item.name || 'Event' } })
      }
    },
    [navigation],
  )

  const openBookletGuide = useCallback((booklet) => {
    if (!booklet) return
    setActiveBookletGuide(booklet)
  }, [])

  const handleOpenBookletItem = useCallback((item) => {
    if (!item) return
    const maybeClientId = item.client_a_uuid || item.clientId || item.raw?.client_a_uuid
    if (maybeClientId) {
      setActiveBookletGuide(null)
      setProfileClientId(maybeClientId)
      return
    }
    const sourceEventId = item.id || item.raw?.id
    if (sourceEventId) {
      const matched = (events || []).find((ev) => String(ev?.id) === String(sourceEventId))
      if (matched) {
        setActiveBookletGuide(null)
        setDetailSourceRect(null)
        setDetailEvent(matched)
        return
      }
    }
    const lat = parseFloat(item.lat ?? item.raw?.lat)
    const lng = parseFloat(item.long ?? item.lng ?? item.raw?.long ?? item.raw?.lng)
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setActiveBookletGuide(null)
      navigation.navigate('AR', { navigateTo: { lat, lng, name: item.name || 'Destination' } })
    }
  }, [events, navigation])

  const bookletGuideDetails = useMemo(() => {
    const guide = activeBookletGuide
    const items = guide?.items || []
    const heroImage = deriveImageUri(items[0]) || null
    const overview =
      guide?.subtitle ||
      'A curated Bahrain mini-guide with culture, dining, and local experiences selected for this travel theme.'
    const tipsByGuide = {
      'culture-heritage': [
        'Start early to enjoy heritage sites before peak heat.',
        'Keep modest attire for mosques and old districts.',
        'Combine one museum stop with a nearby souq walk.',
      ],
      'culture-food': [
        'Pair one local breakfast with one modern dining spot.',
        'Reserve popular restaurants for evening hours.',
        'Try one Bahraini dish and one regional specialty.',
      ],
      'culture-experience': [
        'Check event start times and venue distance beforehand.',
        'Mix one headline event with one low-key local stop.',
        'Leave buffer time for traffic around event venues.',
      ],
    }
    return {
      heroImage,
      overview,
      tips: tipsByGuide[guide?.key] || [
        'Start with one anchor stop, then explore nearby gems.',
        'Use this guide as a flexible route, not a strict schedule.',
        'Capture sunrise or sunset moments for the best photos.',
      ],
      route: items.slice(0, 5),
      highlights: items,
    }
  }, [activeBookletGuide])

  useEffect(() => {
    if (filteredEvents.length === 0) return
    setActiveIndex((idx) => (idx >= filteredEvents.length ? filteredEvents.length - 1 : idx))
  }, [filteredEvents.length])

  const loopedEvents = useMemo(() => {
    return filteredEvents
  }, [filteredEvents])

  useEffect(() => {
    didInitialScrollRef.current = false
  }, [filteredEvents])

  const handleCarouselContentSizeChange = useCallback(() => {
    if (didInitialScrollRef.current) return
  }, [itemStride])

  const scheduleAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
  }, [])

  useEffect(() => {
    scheduleAutoAdvance()
    return () => {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
    }
  }, [scheduleAutoAdvance])

  useEffect(() => {
    personalizedSliderOffsetRef.current = 0
    if (personalizedSliderRef.current && typeof personalizedSliderRef.current.scrollTo === 'function') {
      personalizedSliderRef.current.scrollTo({ x: 0, y: 0, animated: false })
    }
  }, [personalizedEditorialPages.length])

  useEffect(() => {
    if (personalizedSliderTimerRef.current) clearInterval(personalizedSliderTimerRef.current)
    if (personalizedEditorialPages.length <= 1) return undefined
    const pageWidth = Math.max(260, layoutW - 48)
    const loopWidth = pageWidth * personalizedEditorialPages.length
    personalizedSliderTimerRef.current = setInterval(() => {
      if (personalizedIsDraggingRef.current) return
      if (!personalizedSliderRef.current || typeof personalizedSliderRef.current.scrollTo !== 'function') return
      let nextOffset = personalizedSliderOffsetRef.current + PERSONALIZED_ROLL_STEP_PX
      if (nextOffset >= loopWidth) {
        nextOffset -= loopWidth
        personalizedSliderRef.current.scrollTo({ x: nextOffset, y: 0, animated: false })
      } else {
        personalizedSliderRef.current.scrollTo({ x: nextOffset, y: 0, animated: false })
      }
      personalizedSliderOffsetRef.current = nextOffset
    }, PERSONALIZED_ROLL_TICK_MS)
    return () => {
      if (personalizedSliderTimerRef.current) clearInterval(personalizedSliderTimerRef.current)
    }
  }, [personalizedEditorialPages.length, layoutW])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadExplore({ pullRefresh: true })
  }, [loadExplore])

  const handleCardPress = useCallback((item, rect) => {
    if (Platform.OS !== 'web') Vibration.vibrate(20)
    if (!item) return
    setDetailSourceRect(rect || null)
    setDetailEvent(item)
  }, [])

  const handleOpenPersonalizedItem = useCallback((item) => {
    if (!item) return
    if (item.type === 'event' && item.sourceEvent) {
      handleCardPress(item.sourceEvent, null)
      return
    }
    if (item.clientId) {
      setProfileClientId(item.clientId)
      return
    }
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lng ?? item.long)
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      navigation.navigate('AR', { navigateTo: { lat, lng, name: item.title || 'Destination' } })
    }
  }, [handleCardPress, navigation])

  const handleCloseEventDetail = useCallback(() => {
    setDetailEvent(null)
  }, [])

  const onScroll = useCallback((e) => {
    const offset = e.nativeEvent.contentOffset.x
    const index = Math.round(offset / itemStride)
    virtualIndexRef.current = index
    if (filteredEvents.length > 0) {
      const display = ((index % filteredEvents.length) + filteredEvents.length) % filteredEvents.length
      setActiveIndex(display)
    }
  }, [itemStride, filteredEvents.length])

  const handleMomentumScrollEnd = useCallback((e) => {
    scheduleAutoAdvance()
  }, [scheduleAutoAdvance])

  const handleScrollBeginDrag = useCallback(() => {
    isUserInteractingRef.current = true
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
  }, [])

  const handleScrollEndDrag = useCallback(() => {
    isUserInteractingRef.current = false
    scheduleAutoAdvance()
  }, [scheduleAutoAdvance])

  const renderCard = useCallback(
    ({ item, index }) => (
      <CinematicEventCard
        item={item}
        index={index}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        scrollX={scrollX}
        onPress={handleCardPress}
      />
    ),
    [cardWidth, cardHeight, scrollX, handleCardPress]
  )

  const keyExtractor = useCallback((item, index) => {
    const id = item?.id
    const name = item?.metadata?.event_name || item?.metadata?.business_name || 'event'
    if (id != null && String(id) !== '') return `explore-${String(id)}-${index}`
    return `explore-${String(name)}-${index}`
  }, [])

  const [doorVisible, setDoorVisible] = useState(false)
  const doorLeft = useRef(new Animated.Value(0)).current
  const doorRight = useRef(new Animated.Value(0)).current
  const doorIconScale = useRef(new Animated.Value(0)).current
  const doorIconOpacity = useRef(new Animated.Value(0)).current
  const doorFade = useRef(new Animated.Value(1)).current

  const handleProgressTrackLayout = useCallback((e) => {
    setProgressTrackW(e.nativeEvent.layout.width)
  }, [])

  const openAR = () => {
    if (Platform.OS !== 'web') Vibration.vibrate(40)

    doorLeft.setValue(-layoutW / 2)
    doorRight.setValue(layoutW / 2)
    doorIconScale.setValue(0)
    doorIconOpacity.setValue(0)
    doorFade.setValue(1)
    setDoorVisible(true)

    Animated.sequence([
      Animated.parallel([
        Animated.spring(doorIconScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
        Animated.timing(doorIconOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(doorLeft, { toValue: 0, duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
        Animated.timing(doorRight, { toValue: 0, duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
      ]),
    ]).start(() => {
      const nav = navigation?.getParent?.() ?? navigation
      nav?.navigate?.('AR', { fromExplore: true })
      setTimeout(() => setDoorVisible(false), 500)
    })
  }

  const eventAccent = colors.event
  const eventsCarouselSectionHeader = (
    <View style={s.eventsHeadingRow}>
      <View style={s.calendarHeaderTopRow} />
      <View style={s.calendarTabRow}>
        {[
          { key: 'all', label: 'ALL EVENTS' },
          { key: 'thisMonth', label: 'THIS MONTH' },
          { key: 'nextMonth', label: 'NEXT MONTH' },
        ].map((tab) => {
          const active = eventTab === tab.key
          return (
            <TouchableOpacity key={tab.key} activeOpacity={0.82} onPress={() => setEventTab(tab.key)} style={s.calendarTabBtn}>
              <Text style={[s.calendarTabText, { color: active ? colors.textPrimary : colors.textMuted }]}>{tab.label}</Text>
              {active ? <View style={[s.calendarTabUnderline, { backgroundColor: eventAccent }]} /> : null}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingBottom: bottomPadding }]}>
      <AnimatedScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Immersive Header */}
        <Animated.View
          style={[
            s.heroSection,
            {
              opacity: heroOpacityCombined,
              transform: [
                { translateY: headerTranslateCombined },
                { scale: heroParallaxScale },
              ],
            },
          ]}
        >
          <HeroAmbientLayer accent={colors.primary} isDark={isDark} />
          <View style={s.heroTopRow}>
            <View style={s.heroTextCol}>
              <FadeInView delay={120} from={22} duration={560}>
                <Animated.Text style={[s.heroTitle, { color: colors.textPrimary, transform: [{ scale: titlePop }] }]}>
                  Explore Bahrain
                </Animated.Text>
              </FadeInView>
              <FadeInView delay={168} from={14} duration={480}>
                <Text style={[s.heroSub, { color: colors.textSecondary }]} accessibilityRole="text">
                  {exploreHeroSubtitle}
                </Text>
              </FadeInView>
            </View>
            <FadeInView delay={160} from={28} duration={520} style={s.heroArWrap}>
              <AnimatedPressable onPress={openAR} scaleDown={0.92} style={s.arPillPulseWrap}>
                <LinearGradient
                  colors={[colors.primary, isDark ? '#C8102E' : '#9B0C23']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.arPill}
                >
                  <ArScanIcon name="scan" size={24} color="#FFF" />
                  <Text style={s.arPillText}>AR View</Text>
                </LinearGradient>
              </AnimatedPressable>
            </FadeInView>
          </View>
        </Animated.View>

        {coreExploreLoading ? (
          <View style={s.eventsSectionTopSpacer}>
            {eventsCarouselSectionHeader}
            <LoadingSkeleton width={cardWidth} height={cardHeight} />
          </View>
        ) : filteredEvents.length === 0 ? (
          <FadeInView delay={300} from={24} style={s.eventsSectionTopSpacer}>
            {eventsCarouselSectionHeader}
            <View style={[s.emptyWrap, { backgroundColor: isDark ? colors.surface : colors.surface, borderColor: colors.border }]}>
              <PulseView pulseScale={1.06} duration={2800}>
                <LinearGradient
                  colors={[`${colors.primary}18`, `${colors.primary}06`]}
                  style={s.emptyIconCircle}
                >
                  <Ionicons name="telescope-outline" size={44} color={colors.primary} />
                </LinearGradient>
              </PulseView>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {loadError ? 'Could not load events' : 'No events for this tab'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {loadError ? loadError : 'Try another month tab or pull to refresh'}
              </Text>
              {!loadError && __DEV__ ? (
                <Text style={[s.emptySub, { color: colors.textMuted, fontSize: 12, marginTop: 10, paddingHorizontal: 8 }]}>
                  Table has rows but list is empty? Run database/migrations/004_events_public_read.sql in Supabase (RLS anon SELECT).
                </Text>
              ) : null}
              <AnimatedPressable onPress={openAR} scaleDown={0.94} style={s.arEmptyCtaPulseWrap}>
                <LinearGradient
                  colors={[colors.primary, '#9B0C23']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.emptyCtaGradient}
                >
                  <ArScanIcon name="scan" size={24} color="#FFF" />
                  <Text style={s.emptyCtaText}>Launch AR Explorer</Text>
                  <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.85)" />
                </LinearGradient>
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : (
          <FadeInView delay={280} from={22} duration={520} style={s.eventsSectionTopSpacer}>
            {eventsCarouselSectionHeader}
            <FlatList
              ref={flatListRef}
              data={loopedEvents}
              renderItem={renderCard}
              keyExtractor={keyExtractor}
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              decelerationRate="normal"
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: false, listener: onScroll }
              )}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              onContentSizeChange={handleCarouselContentSizeChange}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: peekPadding, paddingRight: peekPadding + 8 }}
              ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
              removeClippedSubviews={false}
            />

            {/* Progress Bar */}
            <View style={s.progressWrap}>
              <View
                style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(51,65,85,0.4)' : 'rgba(226,232,240,0.6)' }]}
                onLayout={handleProgressTrackLayout}
              >
                <Animated.View style={[s.progressFill, { width: fillW }]}>
                  <LinearGradient
                    colors={[colors.primary, '#9B0C23']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
            </View>
          </FadeInView>
        )}

        {!coreExploreLoading && (
          <FadeInView delay={120} from={14} duration={420}>
            <View style={s.browseWrap}>
              {browseLoadError ? (
                <Text style={[s.browseInlineError, { color: colors.error }]}>{browseLoadError}</Text>
              ) : null}

              <View style={s.bookletWrap}>
                <View style={s.experienceHeaderRow}>
                  <View>
                    <Text style={[s.experienceHeading, { color: colors.textPrimary, fontSize: isMobile ? 29 : 38, lineHeight: isMobile ? 33 : 42 }]}>Experience Bahrain</Text>
                    <Text style={[s.experienceSubheading, { color: colors.textSecondary }]}>
                      Curated stories, itineraries and places for your next Bahrain trip
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      const firstBooklet = cultureBooklets?.[0]
                      openBookletGuide(firstBooklet)
                    }}
                    style={[s.experienceDiscoverBtn, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFF' }]}
                  >
                    <Text style={[s.experienceDiscoverText, { color: colors.primary }]}>DISCOVER MORE</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bookletHorizontalContent}>
                  {cultureBooklets.map((booklet) => (
                    <TouchableOpacity
                      key={booklet.key}
                      activeOpacity={0.86}
                      onPress={() => openBookletGuide(booklet)}
                      style={[
                        s.experienceCard,
                        {
                          backgroundColor: isDark ? 'rgba(15,23,42,0.45)' : '#F8FAFC',
                          borderColor: isDark ? 'rgba(148,163,184,0.2)' : '#E2E8F0',
                        },
                      ]}
                    >
                      {deriveImageUri(booklet?.items?.[0]) ? (
                        <Image source={{ uri: deriveImageUri(booklet?.items?.[0]) }} style={s.experienceCardImage} resizeMode="cover" />
                      ) : (
                        <LinearGradient
                          colors={[`${booklet.color}55`, `${booklet.color}22`, '#0F172A']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={s.experienceCardImage}
                        />
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.78)']}
                        style={s.experienceCardScrim}
                      />
                      <View style={s.experienceCardContent}>
                        <Text style={s.experienceCardTag}>BOOKLET</Text>
                        <Text style={[s.experienceCardTitle, { fontSize: isMobile ? 20 : 31, lineHeight: isMobile ? 22 : 33 }]} numberOfLines={isMobile ? 3 : 2}>
                          {booklet.title}
                        </Text>
                        <Text style={s.experienceCardSub} numberOfLines={2}>
                          {booklet.subtitle}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={s.personalizedWrap}>
                <View style={s.personalizedHeaderRow}>
                  <View style={s.personalizedHeaderTextCol}>
                    <Text style={[s.personalizedHeading, { color: colors.textPrimary, fontSize: isMobile ? 24 : 32 }]}>Personalized by AI</Text>
                    <Text style={[s.personalizedSub, { color: colors.textSecondary }]}>
                      Ranked from your profile + Pinecone similarity + live database freshness
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      const first = personalizedEditorialPages?.[0]?.[0]?.[0]
                      if (!first) return
                      handleOpenPersonalizedItem(first)
                    }}
                    style={[
                      s.personalizedDiscoverBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                      },
                    ]}
                  >
                    <Text style={[s.personalizedDiscoverText, { color: colors.primary }]}>DISCOVER MORE</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                {personalizedError ? (
                  <Text style={[s.browseInlineError, { color: colors.error }]}>{personalizedError}</Text>
                ) : null}
                {personalizedLoading ? (
                  <View style={[s.personalizedSliderWrap, { paddingVertical: 4 }]}>
                    <ShimmerPlaceholder
                      width={Math.max(260, layoutW - 48)}
                      height={Math.round(Math.min(height * 0.28, 240))}
                      borderRadius={LUXURY.radiusHero}
                    />
                  </View>
                ) : personalizedEditorialPages.length === 0 ? (
                  <Text style={[s.browseEmpty, { color: colors.textMuted }]}>No curated picks yet</Text>
                ) : (
                  <View style={s.personalizedSliderWrap}>
                    <ScrollView
                      ref={personalizedSliderRef}
                      horizontal
                      pagingEnabled={false}
                      showsHorizontalScrollIndicator={false}
                      decelerationRate="fast"
                      scrollEventThrottle={16}
                      onScroll={(e) => {
                        const x = e?.nativeEvent?.contentOffset?.x
                        if (typeof x === 'number') personalizedSliderOffsetRef.current = x
                      }}
                      onScrollBeginDrag={() => {
                        personalizedIsDraggingRef.current = true
                      }}
                      onScrollEndDrag={() => {
                        personalizedIsDraggingRef.current = false
                      }}
                      onMomentumScrollEnd={() => {
                        personalizedIsDraggingRef.current = false
                      }}
                      contentContainerStyle={s.personalizedSliderContent}
                    >
                      {personalizedRollingPages.map((columns, pageIndex) => (
                        <View key={`pers-page-${pageIndex}`} style={[s.personalizedEditorialGrid, { width: Math.max(260, layoutW - 48) }]}>
                          {columns.map((column, colIndex) => (
                            <View key={`pers-col-${pageIndex}-${colIndex}`} style={s.personalizedEditorialCol}>
                              {column.map((item, index) => {
                                const imageUri = resolvePublicImageUrl(item.image) || coerceImageValueToString(item.image)
                                const colW = (Math.max(260, layoutW - 48) - 12 * (personalizedColumnCount - 1)) / personalizedColumnCount
                                const tileHeight = Math.round(Math.max(88, colW * item.heightRatio))
                                const onPress = () => handleOpenPersonalizedItem(item)
                                return (
                                  <TouchableOpacity
                                    key={item.key}
                                    onPress={onPress}
                                    activeOpacity={0.9}
                                    style={[
                                      s.personalizedEditorialCard,
                                      {
                                        height: tileHeight,
                                        marginTop: index === 0 ? 0 : 12,
                                        borderColor: isDark ? 'rgba(148,163,184,0.16)' : '#E2E8F0',
                                      },
                                    ]}
                                  >
                                    {imageUri ? (
                                      <Image source={{ uri: imageUri }} style={s.personalizedEditorialImage} resizeMode="cover" />
                                    ) : (
                                      <LinearGradient
                                        colors={isDark ? ['#1a1520', '#2d2640', '#3d3555'] : ['#e8ecf2', '#d4dae4', '#b8c2d1']}
                                        style={s.personalizedEditorialImage}
                                      />
                                    )}
                                    <LinearGradient
                                      colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.24)', 'rgba(0,0,0,0.78)']}
                                      locations={[0, 0.45, 1]}
                                      style={s.personalizedEditorialOverlay}
                                    />
                                    <View style={s.personalizedEditorialContent}>
                                      <Text style={s.personalizedEditorialTag}>{item.editorialTag}</Text>
                                      <Text style={[s.personalizedEditorialTitle, { fontSize: editorialTitleSize, lineHeight: editorialTitleSize + 2 }]} numberOfLines={isMobile ? 3 : 4}>
                                        {item.title}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                )
                              })}
                            </View>
                          ))}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={[s.sectionEyebrow, { color: colors.textMuted, marginTop: 6 }]}>Browse more</Text>
              {['restaurants', 'places', 'events'].map((key) => {
                const sectionLabel = key === 'restaurants' ? 'Restaurants' : key === 'places' ? 'Places' : 'Events'
                const items =
                  key === 'restaurants'
                    ? browseClients.restaurants || []
                    : key === 'places'
                      ? browseClients.places || []
                      : mergedEventBrowseItems
                const accent =
                  key === 'restaurants' ? colors.dining : key === 'events' ? colors.event : colors.textSecondary
                return (
                  <View key={key} style={s.browseSection}>
                    <View style={s.browseSectionHeader}>
                      <View style={[s.browseSectionIcon, { backgroundColor: `${accent}18` }]}>
                        <Ionicons
                          name={key === 'restaurants' ? 'restaurant' : key === 'events' ? 'calendar' : 'location'}
                          size={20}
                          color={accent}
                        />
                      </View>
                      <Text style={[s.browseSectionTitle, { color: accent }]}>{sectionLabel}</Text>
                    </View>
                    {items.length === 0 ? (
                      <Text style={[s.browseEmpty, { color: colors.textMuted }]}>
                        {`No ${sectionLabel.toLowerCase()} yet`}
                      </Text>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={s.browseHorizontalContent}>
                        {key === 'events'
                          ? items.map((item) => {
                              if (item.kind === 'client') {
                                const imageUrl = item.image
                                return (
                                  <TouchableOpacity
                                    key={item.key}
                                    style={[
                                      s.browseClientContainer,
                                      {
                                        backgroundColor: isDark ? 'rgba(15,23,42,0.45)' : '#FFFFFF',
                                        borderColor: isDark ? 'rgba(148,163,184,0.16)' : '#E2E8F0',
                                      },
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={() => setProfileClientId(item.clientId)}
                                  >
                                    <View style={[s.browseClientCircle, { borderColor: accent }]}>
                                      {imageUrl ? (
                                        <Image source={{ uri: imageUrl }} style={s.browseClientImage} />
                                      ) : (
                                        <Ionicons name="calendar" size={32} color={accent} />
                                      )}
                                    </View>
                                    <Text style={[s.browseClientName, { color: colors.textPrimary }]} numberOfLines={2}>
                                      {item.name}
                                    </Text>
                                  </TouchableOpacity>
                                )
                              }
                              const imageUrl = item.image
                              return (
                                <TouchableOpacity
                                  key={item.key}
                                  style={[
                                    s.browseClientContainer,
                                    {
                                      backgroundColor: isDark ? 'rgba(15,23,42,0.45)' : '#FFFFFF',
                                      borderColor: isDark ? 'rgba(148,163,184,0.16)' : '#E2E8F0',
                                    },
                                  ]}
                                  activeOpacity={0.7}
                                  onPress={() => handleBrowseDbEventPress(item)}
                                >
                                  <View style={[s.browseClientCircle, { borderColor: accent }]}>
                                    {imageUrl ? (
                                      <Image source={{ uri: imageUrl }} style={s.browseClientImage} />
                                    ) : (
                                      <Ionicons name="calendar" size={32} color={accent} />
                                    )}
                                  </View>
                                  <Text style={[s.browseClientName, { color: colors.textPrimary }]} numberOfLines={2}>
                                    {item.name}
                                  </Text>
                                </TouchableOpacity>
                              )
                            })
                          : items.map((client) => {
                              const imageUrl = resolvePublicImageUrl(client.client_image)
                              return (
                                <TouchableOpacity
                                  key={client.client_a_uuid || client.clientId}
                                  style={[
                                    s.browseClientContainer,
                                    {
                                      backgroundColor: isDark ? 'rgba(15,23,42,0.45)' : '#FFFFFF',
                                      borderColor: isDark ? 'rgba(148,163,184,0.16)' : '#E2E8F0',
                                    },
                                  ]}
                                  activeOpacity={0.7}
                                  onPress={() => setProfileClientId(client.client_a_uuid || client.clientId)}
                                >
                                  <View style={[s.browseClientCircle, { borderColor: accent }]}>
                                    {imageUrl ? (
                                      <Image source={{ uri: imageUrl }} style={s.browseClientImage} />
                                    ) : (
                                      <Ionicons
                                        name={key === 'restaurants' ? 'restaurant' : 'location'}
                                        size={32}
                                        color={accent}
                                      />
                                    )}
                                  </View>
                                  <Text style={[s.browseClientName, { color: colors.textPrimary }]} numberOfLines={2}>
                                    {client.name || client.business_name || 'Spot'}
                                  </Text>
                                </TouchableOpacity>
                              )
                            })}
                      </ScrollView>
                    )}
                  </View>
                )
              })}
            </View>
          </FadeInView>
        )}
      </AnimatedScrollView>

      <Modal
        visible={!!activeBookletGuide}
        animationType="slide"
        onRequestClose={() => setActiveBookletGuide(null)}
      >
        <View style={[s.bookletGuideRoot, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}>
          <View style={[s.bookletGuideTopBar, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => setActiveBookletGuide(null)} style={s.bookletGuideBackBtn} activeOpacity={0.84}>
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.bookletGuideTopBarTitle, { color: colors.textPrimary }]} numberOfLines={1}>Guidebook</Text>
            <View style={s.bookletGuideBackBtn} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.bookletGuideContent, { paddingBottom: Math.max(22, insets.bottom + 10) }]}>
            <View style={[s.bookletGuideHero, { borderColor: colors.border }]}>
              {bookletGuideDetails.heroImage ? (
                <Image source={{ uri: bookletGuideDetails.heroImage }} style={s.bookletGuideHeroImage} resizeMode="cover" />
              ) : (
                <LinearGradient
                  colors={isDark ? ['#1a1520', '#2d2640', '#3d3555'] : ['#e8ecf2', '#d4dae4', '#b8c2d1']}
                  style={s.bookletGuideHeroImage}
                />
              )}
              <LinearGradient
                colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.82)']}
                locations={[0, 0.42, 1]}
                style={s.bookletGuideHeroScrim}
              />
              <View style={s.bookletGuideHeroTextWrap}>
                <Text style={s.bookletGuideHeroEyebrow}>Bahrain Guide</Text>
                <Text style={s.bookletGuideHeroTitle} numberOfLines={3}>
                  {activeBookletGuide?.title || 'Booklet guide'}
                </Text>
              </View>
            </View>

            <View style={s.bookletGuideSection}>
              <Text style={[s.bookletGuideSectionTitle, { color: colors.textPrimary }]}>Overview</Text>
              <Text style={[s.bookletGuideBody, { color: colors.textSecondary }]}>
                {bookletGuideDetails.overview}
              </Text>
            </View>

            <View style={s.bookletGuideSection}>
              <Text style={[s.bookletGuideSectionTitle, { color: colors.textPrimary }]}>Local tips</Text>
              <View style={s.bookletGuideTipsList}>
                {bookletGuideDetails.tips.map((tip, idx) => (
                  <View key={`tip-${idx}`} style={[s.bookletGuideTipCard, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(15,23,42,0.44)' : '#FFFFFF' }]}>
                    <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                    <Text style={[s.bookletGuideTipText, { color: colors.textSecondary }]}>{tip}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={s.bookletGuideSection}>
              <Text style={[s.bookletGuideSectionTitle, { color: colors.textPrimary }]}>Suggested route</Text>
              <View style={s.bookletGuideRouteList}>
                {bookletGuideDetails.route.map((item, index) => {
                  const itemName = item?.name || item?.business_name || item?.metadata?.event_name || `Guide stop ${index + 1}`
                  return (
                    <TouchableOpacity
                      key={`route-${index}-${itemName}`}
                      activeOpacity={0.86}
                      onPress={() => handleOpenBookletItem(item)}
                      style={[s.bookletGuideRouteItem, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(15,23,42,0.42)' : '#FFFFFF' }]}
                    >
                      <View style={[s.bookletGuideRouteIndex, { backgroundColor: `${colors.primary}22` }]}>
                        <Text style={[s.bookletGuideRouteIndexText, { color: colors.primary }]}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.bookletGuideRouteTitle, { color: colors.textPrimary }]} numberOfLines={2}>{itemName}</Text>
                        <Text style={[s.bookletGuideRouteSub, { color: colors.textMuted }]} numberOfLines={1}>Open details</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={s.bookletGuideSection}>
              <Text style={[s.bookletGuideSectionTitle, { color: colors.textPrimary }]}>Curated highlights</Text>
              <View style={s.bookletGuideHighlightsGrid}>
                {bookletGuideDetails.highlights.map((item, index) => {
                  const itemImage = deriveImageUri(item)
                  const itemName = item?.name || item?.business_name || item?.metadata?.event_name || `Spot ${index + 1}`
                  return (
                    <TouchableOpacity
                      key={`highlight-${index}-${itemName}`}
                      activeOpacity={0.88}
                      onPress={() => handleOpenBookletItem(item)}
                      style={[s.bookletGuideHighlightCard, { borderColor: colors.border }]}
                    >
                      {itemImage ? (
                        <Image source={{ uri: itemImage }} style={s.bookletGuideHighlightImage} resizeMode="cover" />
                      ) : (
                        <LinearGradient
                          colors={isDark ? ['#1a1520', '#2d2640', '#3d3555'] : ['#e8ecf2', '#d4dae4', '#b8c2d1']}
                          style={s.bookletGuideHighlightImage}
                        />
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.72)']}
                        style={s.bookletGuideHighlightScrim}
                      />
                      <Text style={s.bookletGuideHighlightTitle} numberOfLines={2}>{itemName}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        onClose={() => setProfileClientId(null)}
        insets={insets}
        onOpenARNavigate={(dest) => {
          setProfileClientId(null)
          if (dest?.lat != null && dest?.lng != null) {
            navigation.navigate('AR', {
              navigateTo: { lat: dest.lat, lng: dest.lng, name: dest.name || 'Destination' },
            })
          }
        }}
      />

      <EventDetailModal
        visible={!!detailEvent}
        event={detailEvent}
        sourceRect={detailSourceRect}
        onClose={handleCloseEventDetail}
        onOpenOrganizer={(clientUuid) => {
          handleCloseEventDetail()
          setTimeout(() => setProfileClientId(clientUuid), 360)
        }}
      />

      {doorVisible && (() => {
        const TOOTH_COUNT = 5
        const toothH = height / TOOTH_COUNT
        const toothW = layoutW * 0.12
        return (
          <Animated.View style={[s.doorOverlay, { opacity: doorFade }]} pointerEvents="box-none">
            <Animated.View style={[s.doorHalf, s.doorL, { width: layoutW / 2, transform: [{ translateX: doorLeft }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
            </Animated.View>
            <Animated.View style={[s.doorHalf, s.doorR, { width: layoutW / 2, transform: [{ translateX: doorRight }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#CE1126' }]} />
            </Animated.View>
            <Animated.View style={[s.doorZigzag, { left: layoutW / 2, transform: [{ translateX: doorLeft }] }]}>
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
      })()}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  heroSection: {
    position: 'relative',
    overflow: 'visible',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    marginBottom: 0,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  heroSub: { fontSize: 14, lineHeight: 18, marginTop: 4 },
  heroArWrap: { alignSelf: 'flex-start', marginTop: 2 },
  arPillPulseWrap: { alignSelf: 'flex-start' },
  arPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 26,
    minHeight: 52,
    ...Platform.select({
      ios: {
        shadowColor: '#C8102E',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  arPillText: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 },

  eventsSectionTopSpacer: { marginTop: -10 },
  eventsHeadingRow: { paddingHorizontal: 24 },
  calendarHeaderTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  calendarHeading: { fontSize: 40, fontWeight: '900', letterSpacing: -0.8, marginBottom: 4 },
  calendarSubheading: { fontSize: 13, lineHeight: 18, maxWidth: 420 },
  calendarDiscoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  calendarDiscoverText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  calendarTabRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 12 },
  calendarTabBtn: { paddingBottom: 8 },
  calendarTabText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  calendarTabUnderline: { height: 2, borderRadius: 1, marginTop: 6 },

  browseWrap: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 },
  browseHeading: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 14 },
  guideSubheading: { fontSize: 13, lineHeight: 18, marginTop: -6, marginBottom: 14 },
  sectionEyebrow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  bookletWrap: { marginBottom: 20 },
  bookletHorizontalContent: { flexDirection: 'row', gap: 12, paddingRight: 18 },
  experienceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  experienceHeading: { fontSize: 38, fontWeight: '900', letterSpacing: -0.9, marginBottom: 3 },
  experienceSubheading: { fontSize: 13, lineHeight: 18, maxWidth: 430 },
  experienceDiscoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  experienceDiscoverText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  experienceCard: {
    width: 272,
    height: 204,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  experienceCardImage: { width: '100%', height: '100%' },
  experienceCardScrim: { ...StyleSheet.absoluteFillObject },
  experienceCardContent: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  experienceCardTag: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5, marginBottom: 5 },
  experienceCardTitle: { fontSize: 31, fontWeight: '900', color: '#FFF', lineHeight: 33, letterSpacing: -0.8 },
  experienceCardSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', lineHeight: 16, marginTop: 5 },
  bookletCard: {
    width: 214,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bookletIconBg: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  bookletTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  bookletSubtitle: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  bookletCount: { fontSize: 12, fontWeight: '700' },
  personalizedWrap: { marginBottom: 24 },
  personalizedHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 12 },
  personalizedHeaderTextCol: { flex: 1, minWidth: 0 },
  personalizedHeading: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8, marginBottom: 4 },
  personalizedSub: { fontSize: 12, lineHeight: 17, maxWidth: 520 },
  personalizedDiscoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  personalizedDiscoverText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.35 },
  personalizedSliderWrap: { overflow: 'hidden' },
  personalizedSliderContent: { alignItems: 'flex-start' },
  personalizedEditorialGrid: { flexDirection: 'row', gap: 12, width: '100%' },
  personalizedEditorialCol: { flex: 1, minWidth: 0 },
  personalizedEditorialCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
    ...Platform.select({
      ios: { shadowColor: '#020617', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 14 },
      android: { elevation: 7 },
    }),
  },
  personalizedEditorialImage: { width: '100%', height: '100%' },
  personalizedEditorialOverlay: { ...StyleSheet.absoluteFillObject },
  personalizedEditorialContent: { position: 'absolute', left: 12, right: 12, bottom: 11 },
  personalizedEditorialTag: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.82)', letterSpacing: 0.5, marginBottom: 5 },
  personalizedEditorialTitle: { color: '#FFF', fontSize: 27, fontWeight: '900', lineHeight: 29, letterSpacing: -0.6 },
  personalizedPagerDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 10 },
  personalizedPagerDot: { width: 7, height: 7, borderRadius: 4 },
  browseInlineError: { fontSize: 13, marginBottom: 8, fontWeight: '600' },
  browseSection: { marginBottom: 22 },
  browseSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  browseSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseSectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  browseEmpty: { fontSize: 14, fontWeight: '500', fontStyle: 'italic' },
  browseHorizontalContent: { flexDirection: 'row', gap: 10, paddingRight: 8 },
  browseClientContainer: {
    width: 110,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  browseClientCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFC',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  browseClientImage: { width: '100%', height: '100%' },
  browseClientName: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 98,
    lineHeight: 14,
  },

  progressWrap: { paddingHorizontal: 24, marginTop: 18, marginBottom: 8 },
  progressTrack: { height: 3, borderRadius: 1.5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 1.5, overflow: 'hidden' },

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    paddingVertical: 48,
    paddingHorizontal: 28,
    borderRadius: 28,
    borderWidth: 1,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  arEmptyCtaPulseWrap: { alignSelf: 'center' },
  emptyCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 24,
    minHeight: 58,
    ...Platform.select({
      ios: {
        shadowColor: '#C8102E',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  emptyCtaText: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },

  bookletGuideRoot: { flex: 1 },
  bookletGuideTopBar: {
    height: 52,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookletGuideBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookletGuideTopBarTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  bookletGuideContent: { paddingHorizontal: 16, paddingTop: 12 },
  bookletGuideHero: {
    height: 260,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 14,
  },
  bookletGuideHeroImage: { width: '100%', height: '100%' },
  bookletGuideHeroScrim: { ...StyleSheet.absoluteFillObject },
  bookletGuideHeroTextWrap: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  bookletGuideHeroEyebrow: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.82)', letterSpacing: 0.5, marginBottom: 4 },
  bookletGuideHeroTitle: { fontSize: 28, fontWeight: '900', color: '#FFF', lineHeight: 30, letterSpacing: -0.7 },
  bookletGuideSection: { marginBottom: 14 },
  bookletGuideSectionTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3, marginBottom: 8 },
  bookletGuideBody: { fontSize: 14, lineHeight: 21 },
  bookletGuideTipsList: { gap: 8 },
  bookletGuideTipCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bookletGuideTipText: { flex: 1, fontSize: 13, lineHeight: 18 },
  bookletGuideRouteList: { gap: 8 },
  bookletGuideRouteItem: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  bookletGuideRouteIndex: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bookletGuideRouteIndexText: { fontSize: 12, fontWeight: '900' },
  bookletGuideRouteTitle: { fontSize: 14, fontWeight: '800', lineHeight: 18, marginBottom: 1 },
  bookletGuideRouteSub: { fontSize: 12, fontWeight: '600' },
  bookletGuideHighlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  bookletGuideHighlightCard: {
    width: '48.5%',
    height: 142,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1,
  },
  bookletGuideHighlightImage: { width: '100%', height: '100%' },
  bookletGuideHighlightScrim: { ...StyleSheet.absoluteFillObject },
  bookletGuideHighlightTitle: {
    position: 'absolute',
    left: 9,
    right: 9,
    bottom: 8,
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
    lineHeight: 16,
  },

  doorOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
  doorHalf: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' },
  doorL: { left: 0 },
  doorR: { right: 0 },
  doorZigzag: { position: 'absolute', top: 0, bottom: 0, zIndex: 2 },
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
