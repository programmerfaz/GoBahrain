import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
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
  TextInput,
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
import ScreenContainer from '../components/ScreenContainer'
import PageHeadingBar from '../components/PageHeadingBar'
import { supabase } from '../config/supabase'
import { coerceImageValueToString, parseStorageImageUrl, resolvePublicImageUrl } from '../utils/imageUrl'
import { FadeInView, ShimmerPlaceholder, AnimatedPressable, PulseView } from '../components/AnimatedUI'
import {
  FlatList as GHFlatList,
  ScrollView as GHScrollView,
  TouchableOpacity as GHTouchableOpacity,
} from 'react-native-gesture-handler'
import { LUXURY, luxuryCardShadow } from '../theme/luxuryPremium'
import { layoutContentWidth } from '../constants/webLayout'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useAuth } from '../context/AuthContext'
import { fetchCommunityFeedPlans } from '../services/savedPlans'
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_MEDIUM,
  FONT_POPPINS_REGULAR,
  FONT_POPPINS_SEMIBOLD,
} from '../constants/brandFont'
const DEFAULT_PROFILE_IMAGE = require('../../assets/pfp.png')

/** Match CommunitiesScreen feed header scroll-hide */
const EXPLORE_HEADER_SCROLL_THRESHOLD = 80
const EXPLORE_HEADER_SCROLL_DIR_THRESHOLD = 5
const EXPLORE_HEADER_HIDE_DURATION = 300

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

// ─── Community plan normalization helpers ─────────────────────────────────────

const COMMUNITY_NARRATOR_NAMES = [
  'Ahmed', 'Fatima', 'Khalid', 'Sara', 'Yousef',
  'Mariam', 'Ali', 'Noor', 'Hassan', 'Layla',
]
const NARRATOR_COLORS = [
  '#7C3AED', '#0891B2', '#C8860A', '#CE1126', '#059669',
  '#D946EF', '#F97316', '#0EA5E9', '#10B981', '#6366F1',
]

const hashStr = (s) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const pseudonymFor = (ownerId) => {
  const h = hashStr(String(ownerId || 'anon'))
  return {
    name: COMMUNITY_NARRATOR_NAMES[h % COMMUNITY_NARRATOR_NAMES.length],
    initial: COMMUNITY_NARRATOR_NAMES[h % COMMUNITY_NARRATOR_NAMES.length][0],
    color: NARRATOR_COLORS[h % NARRATOR_COLORS.length],
  }
}

const inferVibes = (stops) => {
  const vibes = new Set()
  stops.forEach((s) => {
    if (s.type === 'restaurant') vibes.add('Dining')
    if (s.type === 'event') vibes.add('Events')
    const n = (s.spot || s.reason || '').toLowerCase()
    if (/beach|sea|coast|island|gulf/.test(n)) vibes.add('Beach')
    if (/heritage|museum|fort|mosque|manama|souq|souk/.test(n)) vibes.add('Heritage')
    if (/coffee|café|cafe/.test(n)) vibes.add('Coffee')
    if (/art|gallery|creative/.test(n)) vibes.add('Art')
    if (/desert|camel|tree of life|sakhir/.test(n)) vibes.add('Desert')
    if (/hotel|rooftop|skyline|tower/.test(n)) vibes.add('Views')
    if (/f1|circuit|sport|race/.test(n)) vibes.add('Sports')
  })
  if (vibes.size === 0) vibes.add('Explore')
  return [...vibes].slice(0, 4)
}

const inferOverline = (stops) => {
  const times = stops.map((s) => s.time).filter(Boolean)
  if (times.includes('Morning') && times.includes('Evening')) return 'Full Day Route'
  if (times.includes('Morning') && times.includes('Afternoon')) return 'Morning to Afternoon'
  if (times.every((t) => t === 'Evening' || t === 'Night')) return 'Evening Route'
  if (times.every((t) => t === 'Morning')) return 'Morning Route'
  if (times.every((t) => t === 'Afternoon')) return 'Afternoon Route'
  return `${stops.length}-Stop Route`
}

const estimatePlanDuration = (stops) => {
  if (stops.length <= 2) return '2–3 hrs'
  if (stops.length <= 3) return '3–5 hrs'
  if (stops.length <= 5) return 'Half day'
  return '1 full day'
}

const buildPlanStory = (stops) => {
  if (!stops.length) return 'A curated day plan in Bahrain.'
  const names = stops.map((s) => s.spot).filter(Boolean)
  if (names.length === 0) return 'A curated day plan in Bahrain.'
  if (names.length === 1) return `Explore ${names[0]} — a must-visit in Bahrain.`
  const mid = stops.length > 3 ? `, with ${stops.length - 2} more stops along the way,` : ''
  return `Start at ${names[0]}${mid} and wrap up at ${names[names.length - 1]}. A community-crafted route through Bahrain's best spots.`
}

/**
 * Convert a raw saved_plan DB row + clientImageMap into the card/modal format.
 * @param {object} savedPlan  — row from saved_plans table
 * @param {Record<string,string>} clientImageMap  — { clientId: imageUrl }
 */
const normalizeSavedPlanForCard = (savedPlan, clientImageMap = {}) => {
  const stops = Array.isArray(savedPlan.plan_data) ? savedPlan.plan_data : []
  const stopImages = stops
    .map((s) => s.image || (s.clientId ? clientImageMap[s.clientId] : null))
    .filter(Boolean)
  const narrator = pseudonymFor(savedPlan.owner_id)
  return {
    id: savedPlan.id,
    title: savedPlan.title || 'A Day in Bahrain',
    overline: inferOverline(stops),
    narrator: narrator.name,
    narratorInitial: narrator.initial,
    narratorColor: narrator.color,
    duration: estimatePlanDuration(stops),
    stopCount: stops.length,
    vibes: inferVibes(stops),
    story: buildPlanStory(stops),
    heroImage: stopImages[0] || null,
    stopImages,
    stops: stops.map((s) => ({
      spot: s.spot || 'Stop',
      time: s.time || 'Daytime',
      type: s.type || 'place',
      reason: s.reason || 'A curated stop in Bahrain.',
    })),
    _raw: savedPlan,
  }
}

/** Curated editorial day plans shown as fallback when DB has no shared plans. */
const EDITORIAL_COMMUNITY_PLANS = [
  {
    id: 'plan-a',
    title: 'Old Manama\nin a Morning',
    overline: '4-Stop Morning Route',
    narrator: 'Ahmed Al-Khalid',
    narratorInitial: 'A',
    narratorColor: '#7C3AED',
    duration: '4–5 hrs',
    stopCount: 4,
    vibes: ['Heritage', 'Coffee', 'Souq'],
    story: 'Begin at Bab Al Bahrain as souq vendors open. Wind through the gold souk, stop for karak tea, then reach the National Museum before the midday heat sets in.',
    heroImage: 'https://images.unsplash.com/photo-1580834341580-8c17a3a630ca?w=900&q=80',
    stopImages: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80',
      'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=300&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&q=80',
    ],
    stops: [
      { spot: 'Bab Al Bahrain', time: 'Morning', type: 'place', reason: 'Iconic gateway to the old city — beautiful at sunrise.' },
      { spot: 'Manama Gold Souk', time: 'Morning', type: 'place', reason: 'Centuries-old jewelers in a maze of narrow lanes.' },
      { spot: 'Karak Tea Corner', time: 'Morning', type: 'restaurant', reason: 'Local spiced tea — the essential pit stop.' },
      { spot: 'Bahrain National Museum', time: 'Afternoon', type: 'place', reason: '4,000 years of civilization in one stunning building.' },
    ],
  },
  {
    id: 'plan-b',
    title: 'Coastal\nGolden Hour',
    overline: 'Afternoon to Sunset',
    narrator: 'Lara M.',
    narratorInitial: 'L',
    narratorColor: '#0891B2',
    duration: '1 full day',
    stopCount: 5,
    vibes: ['Beach', 'Seafood', 'Sunset'],
    story: 'Chase the light from Amwaj waterfront to Al Jazayer beach. Grab fresh grilled fish at the pier and end watching the sun sink into the Gulf from a rooftop terrace.',
    heroImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=80',
    stopImages: [
      'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?w=300&q=80',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300&q=80',
      'https://images.unsplash.com/photo-1540541338537-706dba7c3d69?w=300&q=80',
    ],
    stops: [
      { spot: 'Amwaj Islands Waterfront', time: 'Afternoon', type: 'place', reason: 'Upscale marina walk with open skyline views.' },
      { spot: 'Fish Market Pier', time: 'Afternoon', type: 'restaurant', reason: 'Freshest catch, grilled to order on the spot.' },
      { spot: 'Al Jazayer Beach', time: 'Afternoon', type: 'place', reason: 'Long public beach — ideal for a sunset stroll.' },
      { spot: 'Ritz Carlton Bahrain', time: 'Evening', type: 'restaurant', reason: 'Sundowners overlooking the Arabian Gulf.' },
      { spot: 'Al Dar Islands Ferry', time: 'Evening', type: 'place', reason: 'Catch the last ferry for island silhouettes at dusk.' },
    ],
  },
  {
    id: 'plan-c',
    title: 'Desert & Heritage\nFull Day',
    overline: 'South Bahrain Loop',
    narrator: 'Tariq F.',
    narratorInitial: 'T',
    narratorColor: '#C8860A',
    duration: '1 full day',
    stopCount: 4,
    vibes: ['Desert', 'UNESCO', 'Local food'],
    story: 'Head south at dawn. The Tree of Life glows copper in early light. Bahrain Fort by 9am before the tour buses arrive. Camel ride at Sakhir, then machboos for lunch.',
    heroImage: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=900&q=80',
    stopImages: [
      'https://images.unsplash.com/photo-1548014688-c64c0f59a9a4?w=300&q=80',
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=300&q=80',
      'https://images.unsplash.com/photo-1415397196883-b6f78e7aca24?w=300&q=80',
    ],
    stops: [
      { spot: 'Tree of Life', time: 'Morning', type: 'place', reason: 'Mysterious 400-year-old tree standing alone in open desert.' },
      { spot: 'Bahrain Fort (Qalat al-Bahrain)', time: 'Morning', type: 'place', reason: 'UNESCO site — 4,000 years of layered history.' },
      { spot: 'Sakhir Camel Ride', time: 'Afternoon', type: 'place', reason: 'Ride through southern desert at golden hour.' },
      { spot: 'Local Machboos Kitchen', time: 'Afternoon', type: 'restaurant', reason: 'Bahraini national dish — slow-spiced rice and lamb.' },
    ],
  },
  {
    id: 'plan-d',
    title: 'Art & Coffee\nSaturday',
    overline: '3-Stop Urban Loop',
    narrator: 'Noor A.',
    narratorInitial: 'N',
    narratorColor: '#CE1126',
    duration: '3–4 hours',
    stopCount: 3,
    vibes: ['Art', 'Coffee', 'Modern'],
    story: 'Manama is quietly building a creative scene. Start at the Bahrain Arts Society gallery, browse the Adliya boutiques, and end with specialty coffee at the city\'s best third-wave café.',
    heroImage: 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=900&q=80',
    stopImages: [
      'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=300&q=80',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&q=80',
      'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=300&q=80',
    ],
    stops: [
      { spot: 'Bahrain Arts Society', time: 'Morning', type: 'place', reason: 'Local art exhibitions in a serene garden setting.' },
      { spot: 'Adliya Creative District', time: 'Morning', type: 'place', reason: 'Boutiques, murals, and concept stores.' },
      { spot: 'Specialty Coffee Bar', time: 'Afternoon', type: 'restaurant', reason: 'Best pour-over in Bahrain — bring a book.' },
    ],
  },
  {
    id: 'plan-e',
    title: 'F1 Circuit to\nManama Rooftops',
    overline: '4-Stop Thrill Route',
    narrator: 'Jassim H.',
    narratorInitial: 'J',
    narratorColor: '#059669',
    duration: 'Half day',
    stopCount: 4,
    vibes: ['Sports', 'Views', 'Dining'],
    story: 'Walk the BIC paddock area, then drive north for skyline views from the Bahrain WTC towers, and finish with rooftop dining watching the capital light up at dusk.',
    heroImage: 'https://images.unsplash.com/photo-1541019148690-4f98bcc6c1e7?w=900&q=80',
    stopImages: [
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=300&q=80',
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=300&q=80',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300&q=80',
    ],
    stops: [
      { spot: 'Bahrain International Circuit', time: 'Morning', type: 'place', reason: 'Walk the paddock and feel the race day energy.' },
      { spot: 'Bahrain World Trade Center', time: 'Afternoon', type: 'place', reason: 'Iconic twin towers with real wind turbines.' },
      { spot: 'Manama Skyline Viewpoint', time: 'Afternoon', type: 'place', reason: 'Best panoramic city view — perfect for photos.' },
      { spot: 'Rooftop Dining Manama', time: 'Evening', type: 'restaurant', reason: 'Watch the city lights come on over cocktails.' },
    ],
  },
]

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

const EVENT_DATE_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const getEventDateParts = (value) => {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw || /^\d{1,2}:\d{2}/.test(raw)) return null

  const build = (year, month, day) => {
    const y = Number(year)
    const m = Number(month)
    const d = Number(day)
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null

    return {
      month: EVENT_DATE_MONTHS[m - 1],
      day: String(d).padStart(2, '0'),
      year: String(y).padStart(4, '20'),
      label: `${String(d).padStart(2, '0')} ${EVENT_DATE_MONTHS[m - 1]} ${String(y).padStart(4, '20')}`,
      monthIndex: m - 1,
    }
  }

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return build(iso[1], iso[2], iso[3])

  const regional = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (regional) {
    const first = Number(regional[1])
    const second = Number(regional[2])
    const year = regional[3].length === 2 ? `20${regional[3]}` : regional[3]
    const day = first > 12 ? first : second > 12 ? second : first
    const month = first > 12 ? second : second > 12 ? first : second
    return build(year, month, day)
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return build(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

const parseEventTimeParts = (value) => {
  if (!value) return null
  const raw = String(value).trim().toLowerCase()
  if (!raw) return null

  const meridiemMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1])
    const minutes = Number(meridiemMatch[2] || 0)
    const period = meridiemMatch[3].toLowerCase()
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null
    if (period === 'pm' && hours < 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    if (hours < 0 || hours > 23) return null
    return { hours, minutes }
  }

  const twentyFourMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!twentyFourMatch) return null
  const hours = Number(twentyFourMatch[1])
  const minutes = Number(twentyFourMatch[2] || 0)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

const buildEventDateTime = (dateValue, timeValue, fallbackToEndOfDay = false) => {
  const dateParts = getEventDateParts(dateValue)
  if (!dateParts) return null

  const dt = new Date(Number(dateParts.year), Number(dateParts.monthIndex), Number(dateParts.day), 0, 0, 0, 0)
  const timeParts = parseEventTimeParts(timeValue)
  if (timeParts) {
    dt.setHours(timeParts.hours, timeParts.minutes, 0, 0)
    return dt
  }

  if (fallbackToEndOfDay) {
    dt.setHours(23, 59, 59, 999)
    return dt
  }

  return dt
}

const deriveEventStatusMeta = (metadata) => {
  const m = metadata || {}
  const now = new Date()
  const start = buildEventDateTime(m.start_date || m.end_date, m.start_time, false)
  let end = buildEventDateTime(m.end_date || m.start_date, m.end_time, true)

  if (!start) return null
  if (!end || end < start) {
    end = new Date(start.getTime())
    end.setHours(23, 59, 59, 999)
  }

  const isSameDayAsNow =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()

  if (now >= start && now <= end) {
    return { label: 'LIVE', colors: ['#EF4444', '#DC2626'] }
  }
  if (now < start) {
    if (isSameDayAsNow) return { label: 'TODAY', colors: ['#F59E0B', '#D97706'] }
    return { label: 'UPCOMING', colors: ['#3B82F6', '#1D4ED8'] }
  }
  return { label: 'ENDED', colors: ['#6B7280', '#4B5563'] }
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

function CinematicEventCard({ item, cardWidth, cardHeight, onPress }) {
  const { width: screenW = 375 } = useWindowDimensions()
  const compact = screenW < 430
  const { isDark, colors } = useTheme()
  const m = item?.metadata || {}
  const name = m.event_name || 'Event'
  const venue = m.venue || ''
  const time = [m.start_time, m.end_time].filter(Boolean).join(' - ')
  const rawDate = m.start_date || m.end_date || m.start_time || m.end_time || ''
  const dateParts = useMemo(() => getEventDateParts(rawDate), [rawDate])
  const date = dateParts?.label || (m.start_date || m.end_date || '')
  const eventType = m.event_type || ''
  const eventStatus = useMemo(() => deriveEventStatusMeta(m), [m])
  const liveBlinkOpacity = useRef(new Animated.Value(1)).current
  const imageUri = useMemo(() => {
    const resolved = resolvePublicImageUrl(m.image)
    if (resolved) return resolved
    const s = coerceImageValueToString(m.image)
    if (s && (s.startsWith('http://') || s.startsWith('https://'))) return s
    return null
  }, [m.image])
  const whenLine = [date, time].filter(Boolean).join(' • ')
  const month = dateParts?.month || ''
  const day = dateParts?.day || ''
  const year = dateParts?.year || ''
  const subtitle = [venue, time].filter(Boolean).join(' • ')

  useEffect(() => {
    if (eventStatus?.label !== 'LIVE') {
      liveBlinkOpacity.stopAnimation()
      liveBlinkOpacity.setValue(1)
      return undefined
    }

    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveBlinkOpacity, {
          toValue: 0.35,
          duration: 440,
          useNativeDriver: true,
        }),
        Animated.timing(liveBlinkOpacity, {
          toValue: 1,
          duration: 440,
          useNativeDriver: true,
        }),
      ]),
    )
    blinkLoop.start()

    return () => {
      blinkLoop.stop()
      liveBlinkOpacity.setValue(1)
    }
  }, [eventStatus?.label, liveBlinkOpacity])

  return (
    <GHTouchableOpacity
      onPress={() => {
        if (typeof onPress === 'function') onPress(item)
      }}
      activeOpacity={0.92}
      style={{ width: cardWidth, paddingTop: 16, paddingBottom: 4 }}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}${whenLine ? `, ${whenLine}` : ''}${venue ? `, ${venue}` : ''}`}
      accessibilityHint="Open event details"
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

        {!!eventStatus && (
          <Animated.View
            style={[
              cs.cardTopStatusWrap,
              eventStatus.label === 'LIVE' ? { opacity: liveBlinkOpacity } : null,
            ]}
          >
            <LinearGradient
              colors={eventStatus.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={cs.cardTopStatusTag}
            >
              <Text style={cs.cardTopStatusText} numberOfLines={1}>
                {eventStatus.label}
              </Text>
            </LinearGradient>
          </Animated.View>
        )}

        {!!dateParts && (
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
    </GHTouchableOpacity>
  )
}

const cs = StyleSheet.create({
  card: {
    borderRadius: 32,
    overflow: 'visible',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#020617', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.34, shadowRadius: 26 },
      android: { elevation: 12 },
    }),
  },
  cardImageWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 32,
  },
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
  cardTopTagText: { color: '#FFF', fontSize: 9, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.8 },
  cardTopStatusWrap: {
    position: 'absolute',
    top: -4,
    left: '50%',
    zIndex: 6,
    transform: [{ translateX: -48 }, { rotate: '-4deg' }],
  },
  cardTopStatusTag: {
    borderRadius: 8,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.88)',
    ...Platform.select({
      ios: {
        shadowColor: '#020617',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 7 },
    }),
  },
  cardTopStatusText: {
    color: '#FFF',
    fontSize: 9,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 1,
  },
  cardBottomContent: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 28,
    fontFamily: FONT_POPPINS_BOLD,
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
    fontFamily: FONT_POPPINS_SEMIBOLD,
    marginTop: 6,
    letterSpacing: 0.1,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardTopRightBadgeWrap: {
    position: 'absolute',
    right: 14,
    top: 18,
    width: 82,
  },
  cardBottomLeftBadge: {
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 9,
    width: '100%',
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
    fontSize: 10,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 1.2,
    marginBottom: 2,
    textAlign: 'center',
  },
  cardBadgeDay: {
    color: '#12151A',
    fontSize: 38,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 1,
    textAlign: 'center',
  },
  cardBadgeYear: {
    color: '#2C3138',
    fontSize: 10,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 1,
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

/**
 * Structured Bahrain guide categories shown in the "Your Bahrain Guide" section.
 * Ordered intentionally: arrival essentials → culture → exploration → lifestyle → safety.
 * Each card opens a detail page that reads like a mini-blog with imagery and cultural facts.
 *
 * Per-category fields:
 *   id, section, title, label, subtitle, accent, gradientColors, bgImage
 *   activities[]   — 5 items with { id, title, subtitle, icon, tag, image? }
 *   tips[]         — 3 local tips
 *   quickFacts[]   — 3 stat tiles { icon, value, label }
 *   didYouKnow     — short cultural fact paragraph
 *   arabicTitle    — optional Arabic title for visual flair
 */
const BAHRAIN_FOR_YOU_CATEGORIES = [
  // ── ESSENTIALS (first things every visitor needs) ───────────────────────────
  {
    id: 'visa',
    section: 'ESSENTIALS',
    title: 'Visa &\nEntry',
    arabicTitle: 'تأشيرة الدخول',
    label: 'BEFORE YOU LAND',
    subtitle: 'Know your options for entering Bahrain — fast and stress-free',
    accent: '#10B981',
    gradientColors: ['#02110a', '#063b29', '#0F9760'],
    bgImage: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80',
    activities: [
      { id: 'v1', title: 'eVisa Online', subtitle: 'Apply via evisa.gov.bh — 14-day & 30-day tourist options', icon: 'laptop-outline', tag: 'ONLINE', image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80' },
      { id: 'v2', title: 'Visa on Arrival', subtitle: '100+ nationalities eligible — fees from BHD 5 to 25', icon: 'airplane-outline', tag: 'ARRIVAL', image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80' },
      { id: 'v3', title: 'GCC Residents & Nationals', subtitle: 'Visa-free entry for GCC citizens and select residents', icon: 'people-outline', tag: 'GCC', image: 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80' },
      { id: 'v4', title: 'Required Documents', subtitle: 'Passport valid 6+ months, hotel booking & return ticket', icon: 'document-text-outline', tag: 'CHECKLIST', image: 'https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=800&q=80' },
      { id: 'v5', title: 'Multi-Entry Visas', subtitle: '3-month and 1-year options for frequent visitors', icon: 'repeat-outline', tag: 'LONG STAY', image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80' },
    ],
    tips: [
      'Apply for the eVisa at least 3 days before flying — approvals are usually fast but rarely instant.',
      'Print and save a digital copy of your visa before arrival.',
      'Israeli passport holders cannot enter Bahrain — check restrictions carefully.',
    ],
    quickFacts: [
      { icon: 'globe-outline', value: '100+', label: 'eligible nationalities' },
      { icon: 'time-outline', value: '24 h', label: 'typical approval time' },
      { icon: 'calendar-outline', value: '30 days', label: 'standard tourist visa' },
    ],
    didYouKnow: "Bahrain pioneered the GCC's first fully online eVisa system in 2014 — most applications are approved in under 24 hours.",
  },
  {
    id: 'apps',
    section: 'ESSENTIALS',
    title: 'Essential\nApps',
    arabicTitle: 'التطبيقات الأساسية',
    label: 'DOWNLOAD FIRST',
    subtitle: 'The apps locals use daily — install them before you arrive',
    accent: '#6366F1',
    gradientColors: ['#0a0a1a', '#1e1b4b', '#4F46E5'],
    bgImage: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1200&q=80',
    activities: [
      { id: 'ap1', title: 'BenefitPay', subtitle: 'Pay anywhere via QR — Bahrain’s most-used payment app', icon: 'card-outline', tag: 'PAYMENTS', image: 'https://images.unsplash.com/photo-1556742400-b5b7c5121f8c?w=800&q=80' },
      { id: 'ap2', title: 'Talabat & Jahez', subtitle: 'Food, groceries & pharmacy delivery in 30 minutes', icon: 'restaurant-outline', tag: 'DELIVERY', image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80' },
      { id: 'ap3', title: 'Careem & Uber', subtitle: 'Reliable ride-hailing across the entire island', icon: 'car-outline', tag: 'TRANSPORT', image: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80' },
      { id: 'ap4', title: 'eGovernment (Bahrain.bh)', subtitle: 'Official portal for permits, fines and public services', icon: 'shield-checkmark-outline', tag: 'OFFICIAL', image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&q=80' },
      { id: 'ap5', title: 'Google Maps & Waze', subtitle: 'Best routes, live traffic, and parking around the kingdom', icon: 'map-outline', tag: 'NAVIGATION', image: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&q=80' },
    ],
    tips: [
      'BenefitPay works at almost every shop — link an international card via Apple/Google Pay.',
      'Tipping in apps is appreciated but never mandatory; 10% is generous.',
      'Most apps offer both Arabic and English interfaces.',
    ],
    quickFacts: [
      { icon: 'phone-portrait-outline', value: '5', label: 'apps to install first' },
      { icon: 'wallet-outline', value: '85%', label: 'use BenefitPay daily' },
      { icon: 'language-outline', value: 'AR/EN', label: 'bilingual interfaces' },
    ],
    didYouKnow: 'BenefitPay launched in 2017 and is now used by more than 85% of Bahraini adults — you can pay at street stalls, taxis, and even barbers via QR.',
  },
  {
    id: 'money',
    section: 'ESSENTIALS',
    title: 'Money &\nConnectivity',
    arabicTitle: 'العملة والاتصال',
    label: 'STAY CONNECTED',
    subtitle: 'Cash, cards, SIMs — sorted within your first hour',
    accent: '#F59E0B',
    gradientColors: ['#1a0f00', '#3d2300', '#B45309'],
    bgImage: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&q=80',
    activities: [
      { id: 'm1', title: 'Bahraini Dinar (BHD)', subtitle: '1 BHD ≈ 2.65 USD — one of the world’s strongest currencies', icon: 'cash-outline', tag: 'CURRENCY', image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80' },
      { id: 'm2', title: 'ATMs Everywhere', subtitle: 'Most accept Visa & Mastercard with low or no fees', icon: 'card-outline', tag: 'ATMS', image: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=800&q=80' },
      { id: 'm3', title: 'Local SIM Cards', subtitle: 'Batelco, STC & Zain — tourist SIMs from BHD 5 at the airport', icon: 'cellular-outline', tag: 'SIM', image: 'https://images.unsplash.com/photo-1567793942-8e8a8b3a6c70?w=800&q=80' },
      { id: 'm4', title: 'eSIM Options', subtitle: 'Airalo, Holafly & Saily — activate before you land', icon: 'phone-portrait-outline', tag: 'eSIM', image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&q=80' },
      { id: 'm5', title: 'Free Wi-Fi Hotspots', subtitle: 'Malls, cafés and hotels — fast and reliable across the island', icon: 'wifi-outline', tag: 'WI-FI', image: 'https://images.unsplash.com/photo-1531497865144-0464ef8fb9a9?w=800&q=80' },
    ],
    tips: [
      'Withdraw BHD at airport ATMs — better rates than exchange counters.',
      'Cards are accepted almost everywhere; carry small notes for taxis and souqs.',
      '4G and 5G coverage is excellent across the entire kingdom.',
    ],
    quickFacts: [
      { icon: 'cash-outline', value: '1 BHD', label: '≈ 2.65 USD' },
      { icon: 'wifi-outline', value: '5G', label: 'island-wide coverage' },
      { icon: 'card-outline', value: '24/7', label: 'ATMs everywhere' },
    ],
    didYouKnow: 'The Bahraini Dinar is the world’s second-strongest currency, behind only the Kuwaiti Dinar — first issued in 1965 after independence from the rupee.',
  },
  {
    id: 'transport',
    section: 'ESSENTIALS',
    title: 'Getting\nAround',
    arabicTitle: 'التنقل في البحرين',
    label: 'TRANSPORT GUIDE',
    subtitle: 'From taxis to rentals — the smartest way to move',
    accent: '#0EA5E9',
    gradientColors: ['#001a2e', '#003a5c', '#0284C7'],
    bgImage: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&q=80',
    activities: [
      { id: 't1', title: 'Careem & Uber', subtitle: 'Cleanest option — most rides cost between BHD 2 and 6', icon: 'car-outline', tag: 'RIDE-HAILING', image: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80' },
      { id: 't2', title: 'Public Buses', subtitle: 'Just 300 fils per trip via Bahrain Public Transport Co.', icon: 'bus-outline', tag: 'BUDGET', image: 'https://images.unsplash.com/photo-1556122071-e404cb6f31c0?w=800&q=80' },
      { id: 't3', title: 'Car Rentals', subtitle: 'Driving is on the right — international license accepted', icon: 'car-sport-outline', tag: 'SELF-DRIVE', image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80' },
      { id: 't4', title: 'Taxi Etiquette', subtitle: 'Insist on the meter or pre-agree the fare before moving', icon: 'cash-outline', tag: 'TAXIS', image: 'https://images.unsplash.com/photo-1490375336733-0caea1f8f24c?w=800&q=80' },
      { id: 't5', title: 'Walkable Districts', subtitle: 'Adliya, Block 338 & Manama Souq are best explored on foot', icon: 'walk-outline', tag: 'WALKABLE', image: 'https://images.unsplash.com/photo-1605127001321-1f4e1c2d8c33?w=800&q=80' },
    ],
    tips: [
      'Skip unmetered airport taxis — use the official Careem kiosk at arrivals.',
      'Friday mornings have nearly empty roads — perfect for sightseeing drives.',
      'Bahrain is small — most cross-island journeys take only 20-30 minutes.',
    ],
    quickFacts: [
      { icon: 'speedometer-outline', value: '20 min', label: 'coast to coast' },
      { icon: 'car-outline', value: 'BHD 2-6', label: 'most ride-hail trips' },
      { icon: 'bus-outline', value: '300 fils', label: 'bus fare per trip' },
    ],
    didYouKnow: 'Despite being just 50 km long, Bahrain has over 4,000 km of paved roads — one of the densest road networks per capita in the world.',
  },

  // ── CULTURE (essential local context) ───────────────────────────────────────
  {
    id: 'etiquette',
    section: 'CULTURE',
    title: 'Culture &\nEtiquette',
    arabicTitle: 'الثقافة والآداب',
    label: 'LOCAL CUSTOMS',
    subtitle: 'Travel respectfully — Bahrain rewards thoughtful visitors',
    accent: '#CE1126',
    gradientColors: ['#1a0005', '#5a000e', '#991021'],
    bgImage: 'https://images.unsplash.com/photo-1585036156171-384164a8c675?w=1200&q=80',
    activities: [
      { id: 'e1', title: 'Dress Code', subtitle: 'Modest in public — shoulders and knees covered in most places', icon: 'shirt-outline', tag: 'ATTIRE', image: 'https://images.unsplash.com/photo-1545569310-c376bc4a98a0?w=800&q=80' },
      { id: 'e2', title: 'Ramadan Etiquette', subtitle: 'No eating or drinking in public from dawn to sunset', icon: 'moon-outline', tag: 'RAMADAN', image: 'https://images.unsplash.com/photo-1585036156171-384164a8c675?w=800&q=80' },
      { id: 'e3', title: 'Greetings & Hospitality', subtitle: 'Greet with the right hand — always accept the Arabic coffee', icon: 'cafe-outline', tag: 'GREETINGS', image: 'https://images.unsplash.com/photo-1559494007-9f5847c49d94?w=800&q=80' },
      { id: 'e4', title: 'Prayer Times', subtitle: 'Five daily prayers — shops briefly pause; plan around them', icon: 'time-outline', tag: 'PRAYER', image: 'https://images.unsplash.com/photo-1568652552047-a01dbf6233ca?w=800&q=80' },
      { id: 'e5', title: 'Photography Rules', subtitle: 'Always ask before photographing locals, women or mosques', icon: 'camera-outline', tag: 'RESPECT', image: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800&q=80' },
    ],
    tips: [
      'Bahrain is among the most liberal Gulf countries — but respect goes a long way.',
      'Beachwear belongs at the beach or pool — not in streets or malls.',
      'Friday is the holy day — some venues open later and souqs run shorter hours.',
    ],
    quickFacts: [
      { icon: 'time-outline', value: '5', label: 'daily prayers' },
      { icon: 'moon-outline', value: '1 mo.', label: 'Ramadan annually' },
      { icon: 'language-outline', value: 'العربية', label: 'official language' },
    ],
    didYouKnow: 'Bahrain was the first Gulf country to legalise women’s suffrage in 2002 — and remains one of the most diverse societies in the GCC, blending Sunni, Shia, Christian, Hindu and Bahá’í communities.',
  },

  // ── EXPLORATION (sights, sites & flavors) ───────────────────────────────────
  {
    id: 'highlights',
    section: 'EXPLORE',
    title: 'Must-See\nHighlights',
    arabicTitle: 'أبرز المعالم',
    label: 'ICONIC LANDMARKS',
    subtitle: 'Unforgettable sights every visitor should experience',
    accent: '#C8860A',
    gradientColors: ['#1a0f00', '#3d2200', '#A06A00'],
    bgImage: 'https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=1200&q=80',
    activities: [
      { id: 'h1', title: 'Al Fateh Grand Mosque', subtitle: "One of the world's largest mosques, open to all visitors", icon: 'business-outline', tag: 'HERITAGE', image: 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?w=800&q=80' },
      { id: 'h2', title: "Bahrain Fort (Qal'at al-Bahrain)", subtitle: 'UNESCO World Heritage Site with 4,000 years of history', icon: 'shield-outline', tag: 'UNESCO', image: 'https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=800&q=80' },
      { id: 'h3', title: 'Bahrain World Trade Center', subtitle: 'Iconic twin towers with wind turbines built between them', icon: 'business', tag: 'ARCHITECTURE', image: 'https://images.unsplash.com/photo-1605552055839-13ec88de2a55?w=800&q=80' },
      { id: 'h4', title: 'Bahrain National Museum', subtitle: "Journey through Bahrain's rich history and antiquities", icon: 'library-outline', tag: 'MUSEUM', image: 'https://images.unsplash.com/photo-1564769625392-651b2c1c4e9d?w=800&q=80' },
      { id: 'h5', title: 'Tree of Life', subtitle: 'A mysterious 400-year-old tree standing alone in the desert', icon: 'leaf-outline', tag: 'NATURE', image: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80' },
    ],
    tips: [
      'Visit mosques and heritage sites in the cooler morning hours.',
      'Carry a light scarf — required for modesty at Al Fateh.',
      'Combine the Fort with the nearby Barbar Temple for a full day.',
    ],
    quickFacts: [
      { icon: 'business-outline', value: '240 m', label: 'Bahrain WTC height' },
      { icon: 'shield-outline', value: '4,000', label: 'years of Bahrain Fort' },
      { icon: 'leaf-outline', value: '400 yrs', label: 'age of Tree of Life' },
    ],
    didYouKnow: 'The Bahrain World Trade Center, completed in 2008, was the world’s first skyscraper to integrate wind turbines into its design — generating 11-15% of its own electricity.',
  },
  {
    id: 'culture',
    section: 'EXPLORE',
    title: 'Cultural\nJourneys',
    arabicTitle: 'الرحلات الثقافية',
    label: 'HERITAGE & SOUQS',
    subtitle: "Immerse yourself in Bahrain's storied traditions",
    accent: '#7C3AED',
    gradientColors: ['#0e0118', '#2d0a52', '#6D28D9'],
    bgImage: 'https://images.unsplash.com/photo-1568652552047-a01dbf6233ca?w=1200&q=80',
    activities: [
      { id: 'cu1', title: 'Manama Souq Walking Tour', subtitle: 'Navigate the traditional labyrinthine marketplace on foot', icon: 'walk-outline', tag: 'WALKING TOUR', image: 'https://images.unsplash.com/photo-1568652552047-a01dbf6233ca?w=800&q=80' },
      { id: 'cu2', title: 'Al Khamis Mosque', subtitle: "Bahrain's oldest mosque, dating back to the 7th century", icon: 'home-outline', tag: 'HISTORIC', image: 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?w=800&q=80' },
      { id: 'cu3', title: 'Muharraq Old Town', subtitle: 'Pearling-era heritage buildings and merchant houses', icon: 'map-outline', tag: 'UNESCO', image: 'https://images.unsplash.com/photo-1601295859015-ff8c5d11b430?w=800&q=80' },
      { id: 'cu4', title: 'Bahrain Gold Souk', subtitle: "Gleaming traditional jewelry in one of the Gulf's finest souqs", icon: 'diamond-outline', tag: 'SHOPPING', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80' },
      { id: 'cu5', title: 'Beit Al Quran Museum', subtitle: 'A breathtaking collection of Qurans and Islamic manuscripts', icon: 'book-outline', tag: 'CULTURE', image: 'https://images.unsplash.com/photo-1564769625392-651b2c1c4e9d?w=800&q=80' },
    ],
    tips: [
      'Friday mornings are quieter — great for photography.',
      'Haggling is expected and part of the souq experience.',
      'Wear comfortable shoes for the cobblestone Muharraq lanes.',
    ],
    quickFacts: [
      { icon: 'sparkles-outline', value: '5,000 yr', label: 'Dilmun civilization' },
      { icon: 'home-outline', value: '7th c.', label: 'oldest mosque' },
      { icon: 'diamond-outline', value: '100+', label: 'gold souk shops' },
    ],
    didYouKnow: 'Bahrain was once known as "Dilmun" — a paradise trading hub mentioned in Sumerian texts more than 5,000 years ago, making it one of the world’s oldest continuously inhabited civilizations.',
  },
  {
    id: 'dining',
    section: 'EXPLORE',
    title: 'Taste of\nBahrain',
    arabicTitle: 'مذاق البحرين',
    label: 'CULINARY ODYSSEY',
    subtitle: 'A journey through flavors old, bold, and local',
    accent: '#F97316',
    gradientColors: ['#1a0700', '#4d1f00', '#C2590C'],
    bgImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
    activities: [
      { id: 'd1', title: 'Machboos Experience', subtitle: 'The national dish — spiced rice with lamb or shrimp', icon: 'restaurant-outline', tag: 'CUISINE', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80' },
      { id: 'd2', title: 'Manama Waterfront Dining', subtitle: 'Sunset views paired with fresh seafood and mezze', icon: 'water-outline', tag: 'DINING', image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80' },
      { id: 'd3', title: 'Karak Tea at Bab Al Bahrain', subtitle: 'Sip traditional spiced tea near the iconic gateway', icon: 'cafe-outline', tag: 'CAFÉ', image: 'https://images.unsplash.com/photo-1559494007-9f5847c49d94?w=800&q=80' },
      { id: 'd4', title: 'Muharraq Bakeries at Dawn', subtitle: 'Freshly baked khubz bread and Bahraini sweets at sunrise', icon: 'pizza-outline', tag: 'BAKERY', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80' },
      { id: 'd5', title: 'Khaleeji Breakfast Spread', subtitle: 'Balaleet, shakshuka, and fresh dates to start your day', icon: 'sunny-outline', tag: 'BREAKFAST', image: 'https://images.unsplash.com/photo-1601493700518-7d33a4dac6e3?w=800&q=80' },
    ],
    tips: [
      'Ramadan evenings transform the food scene — try iftar outdoors.',
      'Ask for "Bahraini-style" at local restaurants for authentic prep.',
      'Dates from local markets make perfect and affordable souvenirs.',
    ],
    quickFacts: [
      { icon: 'restaurant-outline', value: '1 dish', label: 'machboos = national' },
      { icon: 'leaf-outline', value: '20+', label: 'date varieties' },
      { icon: 'cafe-outline', value: '100 fils', label: 'a cup of karak tea' },
    ],
    didYouKnow: 'Machboos, the spiced-rice national dish, is traditionally cooked in a single pot with caramelised onions, dried lime (loomi) and saffron — every Bahraini household claims its own recipe.',
  },
  {
    id: 'coastal',
    section: 'EXPLORE',
    title: 'Coastal\nEscapes',
    arabicTitle: 'الواحات الساحلية',
    label: 'ISLAND ADVENTURES',
    subtitle: 'Crystal waters, island retreats, and ocean thrills',
    accent: '#0891B2',
    gradientColors: ['#001832', '#003a6b', '#0369A1'],
    bgImage: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=1200&q=80',
    activities: [
      { id: 'c1', title: 'Al Dar Islands', subtitle: 'Private island retreat with pristine beaches and water sports', icon: 'boat-outline', tag: 'ISLAND', image: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=800&q=80' },
      { id: 'c2', title: 'Scuba Diving Sites', subtitle: 'Explore vibrant coral reefs and historic Gulf shipwrecks', icon: 'water-outline', tag: 'DIVING', image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80' },
      { id: 'c3', title: 'Amwaj Islands Waterfront', subtitle: 'Upscale waterfront dining, yacht clubs, and leisure', icon: 'restaurant-outline', tag: 'WATERFRONT', image: 'https://images.unsplash.com/photo-1551269901-5c5e14c25df7?w=800&q=80' },
      { id: 'c4', title: 'Al Jazayer Beach', subtitle: 'Serene public beach with family-friendly BBQ areas', icon: 'sunny-outline', tag: 'BEACH', image: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80' },
      { id: 'c5', title: 'Hawar Islands Day Trip', subtitle: 'Remote islands near Qatar with flamingos and rare wildlife', icon: 'airplane-outline', tag: 'WILDLIFE', image: 'https://images.unsplash.com/photo-1535941339077-2dd1c7963098?w=800&q=80' },
    ],
    tips: [
      'Book Al Dar Islands boat trips early — they fill up fast.',
      'Snorkelling gear can be rented at most coastal venues.',
      'Best diving visibility is between October and April.',
    ],
    quickFacts: [
      { icon: 'boat-outline', value: '33', label: 'islands in Bahrain' },
      { icon: 'thermometer-outline', value: '24°C', label: 'avg sea temperature' },
      { icon: 'water-outline', value: '50+', label: 'recognised dive sites' },
    ],
    didYouKnow: "Bahrain's name means 'Two Seas' — referring to the sweet freshwater springs that historically emerged through the salty Gulf, nurturing the island's famous pearl beds.",
  },
  {
    id: 'adventure',
    section: 'EXPLORE',
    title: 'Desert\nAdventures',
    arabicTitle: 'مغامرات الصحراء',
    label: 'WILD & TIMELESS',
    subtitle: 'Golden dunes, ancient skies, and wild landscapes',
    accent: '#92400E',
    gradientColors: ['#1c1000', '#4a2d00', '#7A3A0C'],
    bgImage: 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=1200&q=80',
    activities: [
      { id: 'a1', title: 'Camel Riding at Sakhir', subtitle: 'Experience a timeless desert ride at golden hour', icon: 'paw-outline', tag: 'EXPERIENCE', image: 'https://images.unsplash.com/photo-1551634979-2b11f8c218da?w=800&q=80' },
      { id: 'a2', title: 'Quad Biking in Riffa', subtitle: 'Adrenaline-fueled rides across the southern desert', icon: 'car-sport-outline', tag: 'SPORTS', image: 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800&q=80' },
      { id: 'a3', title: 'Royal Camel Farm Visit', subtitle: "Meet and feed Bahrain's famous royal camels up close", icon: 'paw-outline', tag: 'WILDLIFE', image: 'https://images.unsplash.com/photo-1471973055544-86b97fd9c5e6?w=800&q=80' },
      { id: 'a4', title: 'Desert Stargazing Night', subtitle: 'Far from city lights, Bahrain offers a stunning night sky', icon: 'star-outline', tag: 'NIGHT SKY', image: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=80' },
      { id: 'a5', title: 'Sakhir Sunrise Drive', subtitle: 'Chase the sunrise across golden plains at the edge of the island', icon: 'car-outline', tag: 'SCENIC', image: 'https://images.unsplash.com/photo-1547036346-4ad8f9f47edc?w=800&q=80' },
    ],
    tips: [
      'Bring a lightweight jacket — desert nights drop quickly after sunset.',
      'Book camel and quad tours through certified local operators.',
      'A full-moon night at the Tree of Life is magical and rarely crowded.',
    ],
    quickFacts: [
      { icon: 'leaf-outline', value: '50 m', label: 'Tree of Life root depth' },
      { icon: 'partly-sunny-outline', value: '15°C', label: 'desert night avg' },
      { icon: 'star-outline', value: '360°', label: 'open sky stargazing' },
    ],
    didYouKnow: 'The 400-year-old Tree of Life thrives with no visible water source — botanists believe its roots reach almost 50 metres into a hidden aquifer.',
  },

  // ── LIFESTYLE (family) ─────────────────────────────────────────────────────
  {
    id: 'family',
    section: 'LIFESTYLE',
    title: 'Family &\nKids',
    arabicTitle: 'العائلة والأطفال',
    label: 'FOR EVERY AGE',
    subtitle: 'Bahrain shines as a family destination — here is where to start',
    accent: '#EC4899',
    gradientColors: ['#1a0014', '#4a0e3c', '#BE185D'],
    bgImage: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1200&q=80',
    activities: [
      { id: 'f1', title: 'Lost Paradise of Dilmun', subtitle: "The island's biggest waterpark, themed on ancient Dilmun", icon: 'water-outline', tag: 'WATERPARK', image: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&q=80' },
      { id: 'f2', title: 'Bahrain Bay Family Park', subtitle: 'Open green spaces with stunning skyline views', icon: 'leaf-outline', tag: 'PARK', image: 'https://images.unsplash.com/photo-1503249023995-51b0f3778ccf?w=800&q=80' },
      { id: 'f3', title: 'Wahooo! Waterpark', subtitle: 'Indoor adventure inside City Centre Mall — open year-round', icon: 'rainy-outline', tag: 'INDOOR', image: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&q=80' },
      { id: 'f4', title: 'Al Areen Wildlife Park', subtitle: 'Safari-style animal encounters across native landscapes', icon: 'paw-outline', tag: 'WILDLIFE', image: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=800&q=80' },
      { id: 'f5', title: 'Saar Discovery Centers', subtitle: 'Hands-on museums and play-based learning for kids', icon: 'school-outline', tag: 'LEARNING', image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80' },
    ],
    tips: [
      'Most malls have free soft-play areas — perfect for hot afternoons.',
      'Seef Mall and The Avenues are fully stroller-friendly.',
      'Bahrain is consistently ranked among the safest GCC countries for family travel.',
    ],
    quickFacts: [
      { icon: 'water-outline', value: '4', label: 'major waterparks' },
      { icon: 'paw-outline', value: '100+', label: 'species at Al Areen' },
      { icon: 'shield-checkmark-outline', value: 'Top 3', label: 'safest in MENA' },
    ],
    didYouKnow: 'Lost Paradise of Dilmun was designed around the ancient Dilmun civilisation — its waterslides and pools weave through replicas of Bronze Age temples and bathhouses.',
  },

  // ── SAFETY (good to know before any trip) ───────────────────────────────────
  {
    id: 'safety',
    section: 'PRACTICAL',
    title: 'Safety &\nHealth',
    arabicTitle: 'السلامة والصحة',
    label: 'EMERGENCY READY',
    subtitle: 'Hospitals, hotlines and good-to-know health facts',
    accent: '#EF4444',
    gradientColors: ['#1a0000', '#4d0606', '#B91C1C'],
    bgImage: 'https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=1200&q=80',
    activities: [
      { id: 's1', title: 'Emergency Number 999', subtitle: 'Police, ambulance and fire — English-language support', icon: 'call-outline', tag: 'HOTLINE', image: 'https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=800&q=80' },
      { id: 's2', title: 'Top Hospitals', subtitle: 'Salmaniya, BDF & KIMS — international medical standards', icon: 'medical-outline', tag: 'CARE', image: 'https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=800&q=80' },
      { id: 's3', title: '24/7 Pharmacies', subtitle: 'Nahdi, Al Hayat & more — found across every district', icon: 'medkit-outline', tag: 'PHARMACY', image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80' },
      { id: 's4', title: 'Travel Insurance', subtitle: 'Strongly recommended — required for some long-stay visas', icon: 'shield-checkmark-outline', tag: 'INSURANCE', image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80' },
      { id: 's5', title: 'Sun & Heat Safety', subtitle: 'Summer peaks at 40°C+ — hydrate and seek shade midday', icon: 'sunny-outline', tag: 'CLIMATE', image: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80' },
    ],
    tips: [
      'Tap water is treated but locals prefer bottled — readily available everywhere.',
      'Pack high-SPF sunscreen — UV is intense from April through October.',
      'Many medications are available over the counter without a prescription.',
    ],
    quickFacts: [
      { icon: 'call-outline', value: '999', label: 'emergency hotline' },
      { icon: 'thermometer-outline', value: '40°C+', label: 'summer peak heat' },
      { icon: 'medkit-outline', value: '24/7', label: 'pharmacy access' },
    ],
    didYouKnow: 'Bahrain consistently ranks among the safest Middle Eastern countries — the entire kingdom is patrolled by a single, highly responsive Ministry of Interior force using English & Arabic dispatch.',
  },
]

/** Artistic card for the "Your Bahrain Guide" section */
const ForYouCard = ({ category, onPress, winW }) => {
  const isMobile = winW < 430
  const cardW = isMobile ? 220 : 260
  const cardH = isMobile ? 300 : 340
  const titleLabel = String(category.title || '').replace(/\n/g, ' ')

  return (
    <GHTouchableOpacity
      activeOpacity={0.88}
      delayPressIn={0}
      onPress={() => {
        if (typeof onPress === 'function') onPress(category)
      }}
      style={[forYouStyles.card, { width: cardW, height: cardH }]}
      accessibilityRole="button"
      accessibilityLabel={`Explore ${titleLabel}`}
    >
      {/* Background image */}
      {category.bgImage ? (
        <Image source={{ uri: category.bgImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={category.gradientColors} style={StyleSheet.absoluteFill} />
      )}

      {/* Geometric overlay pattern — pointerEvents none so touches reach the TouchableOpacity */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[forYouStyles.geoCircle, {
          width: cardW * 1.1, height: cardW * 1.1, borderRadius: cardW * 0.55,
          borderColor: `${category.accent}30`,
          top: -cardW * 0.35, right: -cardW * 0.3,
        }]} />
        <View style={[forYouStyles.geoCircle, {
          width: cardW * 0.6, height: cardW * 0.6, borderRadius: cardW * 0.3,
          borderColor: `${category.accent}20`,
          bottom: -cardW * 0.15, left: -cardW * 0.15,
        }]} />
        <View style={[forYouStyles.geoBand, {
          backgroundColor: `${category.accent}0E`,
          transform: [{ rotate: '-28deg' }],
        }]} />
      </View>

      {/* Scrim — pointerEvents none so touches reach the TouchableOpacity */}
      <LinearGradient
        colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.88)']}
        locations={[0, 0.28, 0.65, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top label */}
      <View style={forYouStyles.topLabel} pointerEvents="none">
        <View style={[forYouStyles.labelPill, { backgroundColor: `${category.accent}CC` }]}>
          <Text style={forYouStyles.labelPillText}>{category.label}</Text>
        </View>
      </View>

      {/* Bottom content */}
      <View style={forYouStyles.cardContent} pointerEvents="none">
        <Text style={[forYouStyles.cardTitle, { fontSize: isMobile ? 20 : 23 }]}>{category.title}</Text>
        <Text style={forYouStyles.cardSubtitle} numberOfLines={2}>{category.subtitle}</Text>
        <View style={forYouStyles.cta}>
          <Text style={[forYouStyles.ctaText, { color: category.accent }]}>Explore</Text>
          <Ionicons name="arrow-forward" size={12} color={category.accent} />
        </View>
      </View>

      {/* Shimmer top line */}
      <View style={[forYouStyles.shimmerTop, { backgroundColor: `${category.accent}45` }]} pointerEvents="none" />
    </GHTouchableOpacity>
  )
}

const forYouStyles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.32,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  geoCircle: { position: 'absolute', borderWidth: 1.5 },
  geoBand: {
    position: 'absolute',
    top: '35%',
    left: '-12%',
    width: '130%',
    height: 44,
  },
  topLabel: { position: 'absolute', top: 16, left: 14, right: 14 },
  labelPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  labelPillText: {
    fontSize: 9,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFFFFF',
    letterSpacing: 0.7,
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  cardTitle: {
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFFFFF',
    letterSpacing: -0.6,
    lineHeight: 24,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_REGULAR,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 15,
    marginBottom: 10,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  ctaText: { fontSize: 11, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.2 },
  shimmerTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
})

// ─── Search Bar ───────────────────────────────────────────────────────────────

function ExploreSearchBar({ value, onChange, colors, isDark, autoFocus = false, compact = false, mergedInRow = false }) {
  const focusAnim = useRef(new Animated.Value(0)).current
  const handleFocus = () =>
    Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start()
  const handleBlur = () =>
    Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start()

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? 'rgba(255,255,255,0.1)' : colors.border, colors.primary],
  })

  return (
    <View style={[sbStyles.wrap, compact ? sbStyles.wrapCompact : null]}>
      <Animated.View
        style={[
          sbStyles.container,
          compact ? sbStyles.containerCompact : null,
          mergedInRow ? sbStyles.containerMerged : null,
          {
            backgroundColor: mergedInRow ? 'transparent' : isDark ? 'rgba(255,255,255,0.06)' : colors.surface,
            borderColor,
          },
          !mergedInRow && Platform.OS === 'ios'
            ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 }
            : !mergedInRow
              ? { elevation: 2 }
              : null,
        ]}
      >
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={sbStyles.icon} />
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoFocus={autoFocus}
          placeholder="Search places, events, cuisines…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={[sbStyles.input, { color: colors.textPrimary }]}
          accessibilityLabel="Search Explore"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')} style={sbStyles.clearBtn} accessibilityLabel="Clear search">
            <View style={[sbStyles.clearBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : colors.borderLight }]}>
              <Ionicons name="close" size={13} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  )
}

const sbStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 },
  wrapCompact: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, flex: 1 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    gap: 10,
  },
  containerCompact: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 9 : 8,
    gap: 8,
  },
  containerMerged: {
    borderWidth: 0,
    borderRadius: 0,
    paddingLeft: 0,
    paddingRight: 8,
  },
  icon: { flexShrink: 0 },
  input: { flex: 1, fontSize: 15, fontFamily: FONT_POPPINS_MEDIUM, letterSpacing: -0.1, padding: 0 },
  clearBtn: { padding: 2 },
  clearBg: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
})

// ─── Vlog Plan Card (Pinterest × Editorial style) ──────────────────────────────

// ─── Compact horizontal plan card (image + title only) ────────────────────────

const VIBE_COLORS = {
  Heritage: '#7C3AED', Culture: '#7C3AED', UNESCO: '#7C3AED',
  Beach: '#0891B2', Seafood: '#0891B2', Sunset: '#F97316',
  Desert: '#C8860A', Coffee: '#92400E', Souq: '#B45309',
  Art: '#CE1126', Modern: '#475569', Sports: '#059669',
  Views: '#0EA5E9', Dining: '#CE1126', 'Local food': '#C8860A',
}

function PlanHeroCard({ plan, onPress, index }) {
  const enterAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 480,
      delay: 60 + index * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [enterAnim, index])
  const opacity = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
  const scale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })

  const titleLabel = String(plan.title ?? 'Plan').replace(/\n/g, ' ')
  /* GHTouchableOpacity: required with GHScrollView — RN TouchableOpacity often never receives onPress */
  return (
    <GHTouchableOpacity
      activeOpacity={0.88}
      delayPressIn={0}
      onPress={() => {
        if (typeof onPress === 'function') onPress(plan)
      }}
      accessibilityRole="button"
      accessibilityLabel={`View plan: ${titleLabel}`}
      style={phc.touchWrap}
    >
      <Animated.View
        style={[
          phc.card,
          !plan.heroImage && { backgroundColor: plan.narratorColor || '#CE1126' },
          { opacity, transform: [{ scale }] },
        ]}
      >
        {plan.heroImage ? (
          <Image source={{ uri: plan.heroImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.82)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={phc.durationBadge} pointerEvents="none">
          <Ionicons name="time-outline" size={9} color="rgba(255,255,255,0.9)" />
          <Text style={phc.durationText}>{plan.duration}</Text>
        </View>
        <View style={phc.titleWrap} pointerEvents="none">
          <Text style={phc.title} numberOfLines={2}>{titleLabel}</Text>
          <Text style={phc.overline} numberOfLines={1}>{plan.overline}</Text>
        </View>
      </Animated.View>
    </GHTouchableOpacity>
  )
}

const phc = StyleSheet.create({
  touchWrap: {
    marginRight: 10,
    width: 148,
    height: 210,
    borderRadius: 18,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14 },
      android: { elevation: 5 },
    }),
  },
  card: {
    width: 148,
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  durationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: 100,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  durationText: { color: '#FFF', fontSize: 9, fontFamily: FONT_POPPINS_BOLD },
  titleWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  title: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: -0.3,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  overline: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    marginTop: 2,
    letterSpacing: 0.2,
  },
})

// ─── Plan Blog + Pinterest Detail Modal ───────────────────────────────────────

function PlanBlogModal({ plan, visible, onClose, onPlanThisDay, colors, isDark }) {
  const insets = useSafeAreaInsets()
  const { width: winW = 375, height: winH = 667 } = useWindowDimensions()
  const heroH = Math.round(winH * 0.52)
  const closeFadeDistance = Math.max(1, heroH - 100)
  const scrollY = useRef(new Animated.Value(0)).current
  const heroParallax = scrollY.interpolate({
    inputRange: [0, heroH],
    outputRange: [0, -heroH * 0.35],
    extrapolate: 'clamp',
  })
  const heroScale = scrollY.interpolate({
    inputRange: [-80, 0],
    outputRange: [1.12, 1],
    extrapolate: 'clamp',
  })
  const headerOpacity = scrollY.interpolate({
    inputRange: [heroH - 80, heroH - 10],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  const closeOpacity = scrollY.interpolate({
    inputRange: [0, closeFadeDistance],
    outputRange: [1, 0.4],
    extrapolate: 'clamp',
  })

  // Pinterest-style: alternating heights for stop images
  const pinterestHeights = [170, 130, 150, 140, 165]
  const colGap = 8
  const colW = Math.round((winW - 40 - colGap) / 2)

  const modalVisible = Boolean(visible && plan)
  const stops = Array.isArray(plan?.stops) ? plan.stops : []
  const stopImages = Array.isArray(plan?.stopImages) ? plan.stopImages : []
  const planTitleSafe = plan ? String(plan.title ?? 'Plan').replace(/\n/g, ' ') : ''

  const bg = isDark ? '#0A0A0C' : '#FFFFFF'
  const textPrimary = isDark ? '#F1F1F2' : '#111318'
  const textSub = isDark ? '#9CA3AF' : '#6B7280'
  const borderC = isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F4'

  const leftCol = stops.filter((_, i) => i % 2 === 0)
  const rightCol = stops.filter((_, i) => i % 2 === 1)

  return (
    <Modal visible={modalVisible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {plan ? (
      <View style={{ flex: 1, backgroundColor: bg }}>
        {/* Floating compact header (appears on scroll) */}
        <Animated.View
          pointerEvents="none"
          style={[
            pbm.floatingHeader,
            {
              opacity: headerOpacity,
              backgroundColor: bg,
              borderBottomColor: borderC,
              paddingTop: insets.top + 10,
            },
          ]}
        >
          <Text style={[pbm.floatingTitle, { color: textPrimary }]} numberOfLines={1}>
            {planTitleSafe}
          </Text>
        </Animated.View>

        <AnimatedScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          bounces
        >
          {/* Hero image with parallax */}
          <View style={{ height: heroH, overflow: 'hidden', backgroundColor: plan.narratorColor || '#CE1126' }}>
            {plan.heroImage ? (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { transform: [{ translateY: heroParallax }, { scale: heroScale }] },
                ]}
              >
                <Image source={{ uri: plan.heroImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              </Animated.View>
            ) : null}
            <LinearGradient
              colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0.78)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Overline pill + duration on hero */}
            <View style={[pbm.heroBadgeRow, { top: insets.top + 14 }]}>
              <View style={pbm.heroBadgePill}>
                <Ionicons name="map-outline" size={10} color="rgba(255,255,255,0.9)" />
                <Text style={pbm.heroBadgeText}>{plan.overline}</Text>
              </View>
              <View style={pbm.heroBadgePill}>
                <Ionicons name="time-outline" size={10} color="rgba(255,255,255,0.9)" />
                <Text style={pbm.heroBadgeText}>{plan.duration}</Text>
              </View>
            </View>
            {/* Hero title */}
            <View style={pbm.heroTitleWrap}>
              <Text style={pbm.heroTitle}>{planTitleSafe}</Text>
              <View style={pbm.heroCuratorRow}>
                <View style={[pbm.curatorAvatar, { backgroundColor: plan.narratorColor }]}>
                  <Text style={pbm.curatorInitial}>{plan.narratorInitial}</Text>
                </View>
                <Text style={pbm.curatorName}>{plan.narrator}</Text>
                <Text style={pbm.curatorMeta}>· {stops.length} stops</Text>
              </View>
            </View>
          </View>

          {/* Content sheet */}
          <View
            style={[
              pbm.sheet,
              {
                backgroundColor: bg,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: borderC,
              },
            ]}
          >

            {/* Vibe tags row */}
            <View style={pbm.vibeRow}>
              {(Array.isArray(plan.vibes) ? plan.vibes : []).map((v) => {
                const fg = VIBE_COLORS[v] || colors.textSecondary
                return (
                  <View key={v} style={[pbm.vibeTag, { backgroundColor: `${fg}14`, borderColor: `${fg}30` }]}>
                    <Text style={[pbm.vibeTagText, { color: fg }]}>{v}</Text>
                  </View>
                )
              })}
            </View>

            {/* Story / narrative */}
            <Text
              style={[
                pbm.storySectionLabel,
                {
                  color: textSub,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
                },
              ]}
            >
              THE STORY
            </Text>
            <Text style={[pbm.storyText, { color: textPrimary }]}>{plan.story || ''}</Text>

            {/* Pinterest grid — stop images in 2 columns */}
            <Text
              style={[
                pbm.storySectionLabel,
                {
                  color: textSub,
                  marginTop: 24,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
                },
              ]}
            >
              HIGHLIGHTS
            </Text>
            <View style={pbm.pinterestGrid}>
              {/* Left column */}
              <View style={[pbm.pinterestCol, { width: colW }]}>
                {leftCol.map((stop, i) => {
                  const imgUri = stopImages[i * 2] || plan.heroImage || null
                  const h = pinterestHeights[i % pinterestHeights.length]
                  return (
                    <View
                      key={`left-${i}`}
                      style={[pbm.pinterestCell, { height: h, backgroundColor: isDark ? '#1A1A1E' : '#F4F4F8' }]}
                    >
                      {imgUri ? <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.72)']}
                        locations={[0.4, 1]}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />
                      <View style={pbm.pinterestLabel}>
                        <Ionicons
                          name={stop.type === 'restaurant' ? 'restaurant' : 'location-sharp'}
                          size={9}
                          color="rgba(255,255,255,0.85)"
                        />
                        <Text style={pbm.pinterestLabelText} numberOfLines={2}>{stop.spot}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
              {/* Right column */}
              <View style={[pbm.pinterestCol, { width: colW }]}>
                {rightCol.map((stop, i) => {
                  const imgUri = stopImages[i * 2 + 1] || stopImages[i] || plan.heroImage || null
                  const h = pinterestHeights[(i + 2) % pinterestHeights.length]
                  return (
                    <View
                      key={`right-${i}`}
                      style={[pbm.pinterestCell, { height: h, backgroundColor: isDark ? '#1A1A1E' : '#F4F4F8' }]}
                    >
                      {imgUri ? <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.72)']}
                        locations={[0.4, 1]}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />
                      <View style={pbm.pinterestLabel}>
                        <Ionicons
                          name={stop.type === 'restaurant' ? 'restaurant' : 'location-sharp'}
                          size={9}
                          color="rgba(255,255,255,0.85)"
                        />
                        <Text style={pbm.pinterestLabelText} numberOfLines={2}>{stop.spot}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>

            {/* Stop timeline */}
            <Text
              style={[
                pbm.storySectionLabel,
                {
                  color: textSub,
                  marginTop: 28,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
                },
              ]}
            >
              THE STOPS
            </Text>
            <View style={pbm.stopList}>
              {stops.map((stop, i) => (
                <View key={`stop-${i}`} style={pbm.stopRow}>
                  <View style={pbm.stopLeft}>
                    <View style={[pbm.stopDot, { backgroundColor: stop.type === 'restaurant' ? '#F97316' : colors.primary }]}>
                      <Ionicons
                        name={stop.type === 'restaurant' ? 'restaurant' : 'location-sharp'}
                        size={10}
                        color="#FFF"
                      />
                    </View>
                    {i < stops.length - 1 && (
                      <View style={[pbm.stopLine, { backgroundColor: borderC }]} />
                    )}
                  </View>
                  <View style={pbm.stopContent}>
                    {(() => {
                      const imgUri = stopImages[i] || stopImages[0] || plan.heroImage || null
                      return (
                        <View
                          style={[
                            pbm.stopCardRow,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
                              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                            },
                          ]}
                        >
                          <View style={pbm.stopThumbWrap}>
                            {imgUri ? (
                              <Image source={{ uri: imgUri }} style={pbm.stopThumbImg} resizeMode="cover" />
                            ) : (
                              <View style={pbm.stopThumbPlaceholder}>
                                <Ionicons name="image-outline" size={18} color={textSub} />
                              </View>
                            )}
                          </View>

                          <View style={pbm.stopTextCol}>
                            <View style={pbm.stopTopRow}>
                              <Text style={[pbm.stopName, { color: textPrimary }]} numberOfLines={1}>{stop.spot}</Text>
                              <View style={[pbm.stopTimePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F4F4F8' }]}>
                                <Text style={[pbm.stopTimeText, { color: textSub }]}>{stop.time}</Text>
                              </View>
                            </View>
                            <Text style={[pbm.stopReason, { color: textSub }]}>{stop.reason}</Text>
                          </View>
                        </View>
                      )
                    })()}
                  </View>
                </View>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onPlanThisDay}
              accessibilityRole="button"
              accessibilityLabel="Plan this day"
              style={pbm.ctaBtn}
            >
              <LinearGradient
                colors={['#CE1126', '#9B0C23']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={pbm.ctaGrad}
              >
                <Ionicons name="calendar-outline" size={18} color="#FFF" />
                <Text style={pbm.ctaText}>Plan This Day</Text>
                <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.85)" />
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ height: insets.bottom + 32 }} />
          </View>
        </AnimatedScrollView>

        {/* Floating close button */}
        <Animated.View
          style={[pbm.closeBtn, { top: insets.top + 12, opacity: closeOpacity }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            style={pbm.closeBtnInner}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
      ) : null}
    </Modal>
  )
}

const pbm = StyleSheet.create({
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  floatingTitle: {
    fontSize: 15,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  heroBadgeRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 100,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroBadgeText: { color: 'rgba(255,255,255,0.95)', fontSize: 10, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.3 },
  heroTitleWrap: { position: 'absolute', bottom: 20, left: 18, right: 18 },
  heroTitle: {
    color: '#FFF',
    fontSize: 30,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: -0.8,
    lineHeight: 33,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
    marginBottom: 10,
  },
  heroCuratorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  curatorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  curatorInitial: { color: '#FFF', fontSize: 11, fontFamily: FONT_POPPINS_BOLD },
  curatorName: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontFamily: FONT_POPPINS_BOLD },
  curatorMeta: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontFamily: FONT_POPPINS_MEDIUM },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -26,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  vibeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 20,
  },
  vibeTag: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
  },
  vibeTagText: { fontSize: 12, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.2 },
  storySectionLabel: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  storyText: {
    fontSize: 16,
    lineHeight: 26,
    fontFamily: FONT_POPPINS_REGULAR,
    letterSpacing: -0.1,
  },
  pinterestGrid: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  pinterestCol: {
    gap: 8,
  },
  pinterestCell: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  pinterestLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 9,
    paddingBottom: 8,
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  pinterestLabelText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
    flex: 1,
    lineHeight: 14,
  },
  stopList: { gap: 0 },
  stopRow: {
    flexDirection: 'row',
    gap: 14,
    minHeight: 60,
    alignItems: 'flex-start',
  },
  stopLeft: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  stopDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopLine: {
    flex: 1,
    width: 2,
    marginVertical: 4,
    borderRadius: 1,
  },
  stopContent: {
    flex: 1,
    paddingBottom: 16,
  },
  stopCardRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stopThumbWrap: {
    width: 92,
    height: 66,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148,163,184,0.25)',
    flexShrink: 0,
  },
  stopThumbImg: {
    width: '100%',
    height: '100%',
  },
  stopThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  stopTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  stopTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  stopName: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: -0.1,
  },
  stopTimePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  stopTimeText: { fontSize: 10, fontFamily: FONT_POPPINS_SEMIBOLD },
  stopReason: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONT_POPPINS_REGULAR,
  },
  ctaBtn: {
    marginTop: 28,
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#CE1126', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  ctaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
  },
  ctaText: { color: '#FFF', fontSize: 16, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.2 },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 30,
  },
  closeBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
})

// ─── Community Plans Section ───────────────────────────────────────────────────

function CommunityPlanShimmer({ isDark }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [shimmer])
  const opacity = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.28, 0.6, 0.28] })
  const bg = isDark ? '#2A2A2E' : '#E8E8EC'
  return (
    <View style={cpStyles.strip}>
      {[0, 1, 2, 3].map((i) => (
        <Animated.View
          key={i}
          style={[phc.card, { backgroundColor: bg, opacity, marginRight: 10 }]}
        />
      ))}
    </View>
  )
}

function CommunityPlansSection({ plans, loading, colors, isDark, onPlanPress }) {
  return (
    <View style={cpStyles.wrap}>
      {/* Section header */}
      <View style={cpStyles.header}>
        <View>
          <Text style={[cpStyles.eyebrow, { color: colors.textMuted }]}>CURATED BY TRAVELERS</Text>
          <Text style={[cpStyles.title, { color: colors.textPrimary }]}>Loved by People</Text>
          <Text style={[cpStyles.subtitle, { color: colors.textSecondary }]}>
            Real day plans — tap to read the full story
          </Text>
        </View>
        <View style={[cpStyles.heartBadge, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}28` }]}>
          <Ionicons name="heart" size={14} color={colors.primary} />
          <Text style={[cpStyles.heartCount, { color: colors.primary }]}>{loading ? '…' : `${plans.length} plans`}</Text>
        </View>
      </View>

      {/* Cards or shimmer */}
      {loading ? (
        <CommunityPlanShimmer isDark={isDark} />
      ) : (
        <GHScrollView
          horizontal
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={cpStyles.strip}
          decelerationRate="fast"
          snapToInterval={158}
          snapToAlignment="start"
          directionalLockEnabled
          collapsable={false}
        >
          {plans.map((plan, idx) => (
            <PlanHeroCard
              key={plan.id}
              plan={plan}
              colors={colors}
              isDark={isDark}
              onPress={onPlanPress}
              index={idx}
            />
          ))}
          <View style={{ width: 8 }} />
        </GHScrollView>
      )}
    </View>
  )
}

const cpStyles = StyleSheet.create({
  wrap: { paddingTop: 8, paddingBottom: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: { fontSize: 28, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.8, marginBottom: 4 },
  subtitle: { fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18, maxWidth: 240 },
  heartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  heartCount: { fontSize: 12, fontFamily: FONT_POPPINS_BOLD },
  strip: {
    paddingLeft: 20,
    paddingRight: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
})

// ─── Search results flat list ──────────────────────────────────────────────────

function SearchResultCard({ item, colors, isDark, onPress }) {
  const img = item.imageUri
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(item)}
      style={[
        srStyles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isDark ? 'rgba(255,255,255,0.09)' : colors.border,
        },
        Platform.OS === 'ios'
          ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.14 : 0.06, shadowRadius: 8 }
          : { elevation: 2 },
      ]}
    >
      <View style={[srStyles.thumb, { backgroundColor: colors.border }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons
            name={item.category === 'event' ? 'calendar-outline' : item.category === 'restaurant' ? 'restaurant-outline' : item.category === 'plan' ? 'map-outline' : 'location-outline'}
            size={22}
            color={colors.textMuted}
          />
        )}
      </View>
      <View style={srStyles.textCol}>
        <View style={[srStyles.catPill, { backgroundColor: `${item.accentColor}18`, borderColor: `${item.accentColor}28` }]}>
          <Text style={[srStyles.catText, { color: item.accentColor }]}>{item.categoryLabel}</Text>
        </View>
        <Text style={[srStyles.name, { color: colors.textPrimary }]} numberOfLines={2}>{item.name}</Text>
        {item.sub ? <Text style={[srStyles.sub, { color: colors.textMuted }]} numberOfLines={1}>{item.sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  )
}

const srStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: { flex: 1, minWidth: 0, gap: 4 },
  catPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
  },
  catText: { fontSize: 9, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.8, textTransform: 'uppercase' },
  name: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.1, lineHeight: 18 },
  sub: { fontSize: 12, fontFamily: FONT_POPPINS_MEDIUM },
})

export default function ExploreScreen({ navigation }) {
  const { colors, isDark } = useTheme()
  const { preferences } = useUserPreferences()
  const { session } = useAuth()
  const insets = useSafeAreaInsets()
  const { width: winW = 375, height = 667 } = useWindowDimensions()
  const isMobile = winW < 430
  const personalizedColumnCount = winW >= 1200 ? 4 : winW >= 800 ? 3 : 2
  const editorialTitleSize = isMobile ? 18 : winW < 800 ? 22 : 27
  const layoutW = layoutContentWidth(winW)
  const [headerBarHeight, setHeaderBarHeight] = useState(() => insets.top + 130)

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
  const [coreExploreLoading, setCoreExploreLoading] = useState(true)
  const [personalizedLoading, setPersonalizedLoading] = useState(true)
  const [communityPlans, setCommunityPlans] = useState(EDITORIAL_COMMUNITY_PLANS)
  const [communityPlansLoading, setCommunityPlansLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
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
  const personalizedLastOpenRef = useRef({ key: null, ts: 0 })
  const personalizedSliderOffsetRef = useRef(0)
  const personalizedIsDraggingRef = useRef(false)
  const personalizedTouchActiveRef = useRef(false)
  const headerTranslateY = useRef(new Animated.Value(0)).current
  const exploreHeaderLastScrollY = useRef(0)
  const exploreHeaderVisibleRef = useRef(true)
  const fillW = useRef(new Animated.Value(0)).current

  const handleOpenProfile = useCallback(() => {
    navigation.navigate('Profile', { screen: 'ProfileMain' })
  }, [navigation])

  const handleExploreHeaderBarLayout = useCallback((event) => {
    const h = event.nativeEvent.layout.height
    if (h <= 0) return
    setHeaderBarHeight((prev) => (Math.abs(prev - h) < 2 ? prev : h))
  }, [])

  const exploreHeadingRightSlot = useMemo(() => {
    if (!session?.user) return undefined
    return (
      <TouchableOpacity
        style={[
          s.exploreHeaderIconBtn,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
        activeOpacity={0.7}
        onPress={handleOpenProfile}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Image source={DEFAULT_PROFILE_IMAGE} style={s.exploreHeaderProfileImage} resizeMode="cover" />
      </TouchableOpacity>
    )
  }, [session?.user, colors.background, colors.border, handleOpenProfile])

  const handleExploreScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (e) => {
          const y = e.nativeEvent.contentOffset.y
          const diff = y - exploreHeaderLastScrollY.current
          exploreHeaderLastScrollY.current = y

          if (diff > EXPLORE_HEADER_SCROLL_DIR_THRESHOLD && y > EXPLORE_HEADER_SCROLL_THRESHOLD && exploreHeaderVisibleRef.current) {
            exploreHeaderVisibleRef.current = false
            Animated.timing(headerTranslateY, {
              toValue: -headerBarHeight,
              duration: EXPLORE_HEADER_HIDE_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start()
          } else if (diff < -EXPLORE_HEADER_SCROLL_DIR_THRESHOLD && !exploreHeaderVisibleRef.current) {
            exploreHeaderVisibleRef.current = true
            Animated.timing(headerTranslateY, {
              toValue: 0,
              duration: EXPLORE_HEADER_HIDE_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start()
          }
        },
      }),
    [scrollY, headerTranslateY, headerBarHeight],
  )

  const filteredEvents = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) return []
    if (eventTab === 'all') return events
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    return events.filter((e) => {
      const m = e?.metadata || {}
      const baseDate = getEventDateParts(m.start_date || m.end_date || m.start_time || m.end_time)
      if (!baseDate) return false
      const month = baseDate.monthIndex
      const year = Number(baseDate.year)
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
        fetchPlaces([], { profileNarrative }),
        fetchRestaurants([], { profileNarrative }),
        fetchEvents([], { profileNarrative }),
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

    // Load community feed plans (shared saved_plans from all users)
    try {
      const rawPlans = await fetchCommunityFeedPlans(12)
      if (!rawPlans.length) {
        // No shared plans yet — keep editorial fallback
        setCommunityPlansLoading(false)
        return
      }
      // Gather all clientIds to bulk-fetch images from the client table
      const allClientIds = [
        ...new Set(
          rawPlans.flatMap((p) =>
            Array.isArray(p.plan_data)
              ? p.plan_data.map((s) => s.clientId).filter(Boolean)
              : [],
          ),
        ),
      ]
      let clientImageMap = {}
      if (allClientIds.length > 0) {
        const { data: clientRows } = await supabase
          .from('client')
          .select('client_a_uuid, client_image')
          .in('client_a_uuid', allClientIds)
        ;(clientRows || []).forEach((c) => {
          if (c.client_a_uuid && c.client_image) {
            const u = resolvePublicImageUrl(String(c.client_image).trim())
            if (u) clientImageMap[c.client_a_uuid] = u
          }
        })
      }
      // Normalize and filter plans that have at least one image
      const normalized = rawPlans
        .map((p) => normalizeSavedPlanForCard(p, clientImageMap))
        .filter((p) => p.heroImage)
      setCommunityPlans(normalized.length > 0 ? normalized : EDITORIAL_COMMUNITY_PLANS)
    } catch (e) {
      console.warn('[Explore] community plans load failed:', e?.message)
      // Keep editorial fallback on error
    } finally {
      setCommunityPlansLoading(false)
    }
  }, [preferences?.profileSummary])

  useEffect(() => {
    loadExplore({ pullRefresh: false })
  }, [loadExplore])

  const [selectedPlan, setSelectedPlan] = useState(null)

  const handlePlanPress = useCallback(
    (plan) => {
      if (Platform.OS !== 'web') Vibration.vibrate(18)
      setSelectedPlan(plan)
    },
    [],
  )

  const handleClosePlanBlog = useCallback(() => setSelectedPlan(null), [])

  const handlePlanThisDay = useCallback(() => {
    setSelectedPlan(null)
    navigation.navigate('AI Plan')
  }, [navigation])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const results = []

    const evtColor = colors.event || '#9D174D'
    const restColor = colors.dining || '#B91C1C'
    const placeColor = colors.accent3 || '#0891B2'
    const planColor = colors.primary || '#C8102E'

    events.forEach((e) => {
      const m = e?.metadata || {}
      const name = m.event_name || ''
      const venue = m.venue || ''
      if ((name + venue).toLowerCase().includes(q)) {
        results.push({
          id: `ev-${e.id}`,
          category: 'event',
          categoryLabel: 'Event',
          accentColor: evtColor,
          name,
          sub: [m.start_date, venue].filter(Boolean).join(' · '),
          imageUri: resolvePublicImageUrl(m.image) || null,
          raw: e,
        })
      }
    })

    browseClients.restaurants.forEach((c) => {
      const name = c.name || c.business_name || ''
      if (name.toLowerCase().includes(q)) {
        results.push({
          id: `rest-${c.client_a_uuid}`,
          category: 'restaurant',
          categoryLabel: 'Restaurant',
          accentColor: restColor,
          name,
          sub: c.location || c.area || 'Dining in Bahrain',
          imageUri: resolvePublicImageUrl(c.client_image) || null,
          raw: c,
        })
      }
    })

    browseClients.places.forEach((c) => {
      const name = c.name || c.business_name || ''
      if (name.toLowerCase().includes(q)) {
        results.push({
          id: `pl-${c.client_a_uuid}`,
          category: 'place',
          categoryLabel: 'Place',
          accentColor: placeColor,
          name,
          sub: c.location || c.area || 'Bahrain',
          imageUri: resolvePublicImageUrl(c.client_image) || null,
          raw: c,
        })
      }
    })

    communityPlans.forEach((plan) => {
      const searchText = `${plan.title} ${(plan.vibes || []).join(' ')} ${(plan.stops || []).map((s) => s.spot).join(' ')}`.toLowerCase()
      if (searchText.includes(q)) {
        results.push({
          id: `plan-${plan.id}`,
          category: 'plan',
          categoryLabel: 'Day Plan',
          accentColor: planColor,
          name: plan.title.replace('\n', ' '),
          sub: `${plan.stopCount} stops · ${plan.duration}`,
          imageUri: plan.heroImage,
          raw: plan,
        })
      }
    })

    return results.slice(0, 24)
  }, [searchQuery, events, browseClients.restaurants, browseClients.places, colors, communityPlans])

  const openEventDetails = useCallback((eventItem) => {
    if (!eventItem) return
    navigation.navigate('EventDetail', { event: eventItem })
  }, [navigation])

  const handleSearchResultPress = useCallback(
    (item) => {
      if (item.category === 'event') {
        openEventDetails(item.raw || item)
        return
      }
      if (item.category === 'restaurant' || item.category === 'place') {
        const cid = item.raw?.client_a_uuid || item.raw?.clientId
        if (cid) setProfileClientId(cid)
      } else if (item.category === 'plan') {
        handlePlanPress(item.raw)
      }
    },
    [handlePlanPress, openEventDetails],
  )

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
      const filledChunk = [...chunk]
      let fillerIndex = 0
      while (filledChunk.length < tilesPerPage) {
        const fallback = seeds[fillerIndex % seeds.length]
        if (!fallback) break
        filledChunk.push({
          ...fallback,
          key: `${fallback.key}-fill-${i}-${filledChunk.length}`,
        })
        fillerIndex += 1
      }
      const pageItems = filledChunk.map((it, idx) => ({
        ...it,
        renderKey: `${it.key}-${i + idx}`,
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
      if (!item) return
      openEventDetails(item)
    },
    [openEventDetails],
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
        openEventDetails(matched)
        return
      }
    }
    const lat = parseFloat(item.lat ?? item.raw?.lat)
    const lng = parseFloat(item.long ?? item.lng ?? item.raw?.long ?? item.raw?.lng)
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setActiveBookletGuide(null)
      navigation.navigate('AR', { navigateTo: { lat, lng, name: item.name || 'Destination' } })
    }
  }, [events, navigation, openEventDetails])

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
    virtualIndexRef.current = 0
    setActiveIndex(0)
  }, [filteredEvents])

  const handleCarouselContentSizeChange = useCallback(() => {
    if (didInitialScrollRef.current) return
    didInitialScrollRef.current = true
    virtualIndexRef.current = 0
    setActiveIndex(0)
    flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false })
  }, [])

  const scheduleAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current)
    autoAdvanceTimerRef.current = null

    if (filteredEvents.length <= 1) return

    autoAdvanceTimerRef.current = setInterval(() => {
      if (isUserInteractingRef.current) return

      const nextIndex = (virtualIndexRef.current + 1) % filteredEvents.length
      virtualIndexRef.current = nextIndex
      setActiveIndex(nextIndex)
      flatListRef.current?.scrollToOffset?.({
        offset: nextIndex * itemStride,
        animated: true,
      })
    }, AUTO_ADVANCE_MS)
  }, [filteredEvents.length, itemStride])

  useEffect(() => {
    scheduleAutoAdvance()
    return () => {
      if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
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
      if (personalizedIsDraggingRef.current || personalizedTouchActiveRef.current) return
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

  const handleOpenPersonalizedItem = useCallback((item) => {
    if (!item) return
    if (item.type === 'event' && item.sourceEvent) {
      openEventDetails(item.sourceEvent)
      return
    }
    if (item.type === 'event') {
      openEventDetails(item)
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
  }, [navigation, openEventDetails])

  const openPersonalizedItemFromTouch = useCallback((item) => {
    if (!item) return
    const now = Date.now()
    const itemKey = String(item.key || item.id || item.title || 'unknown')
    const isDuplicateTap = personalizedLastOpenRef.current.key === itemKey && now - personalizedLastOpenRef.current.ts < 400
    if (isDuplicateTap) return
    personalizedLastOpenRef.current = { key: itemKey, ts: now }
    handleOpenPersonalizedItem(item)
  }, [handleOpenPersonalizedItem])

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
    if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current)
    autoAdvanceTimerRef.current = null
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
        onPress={openEventDetails}
      />
    ),
    [cardWidth, cardHeight, scrollX, openEventDetails]
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

  const navigateToAR = useCallback(() => {
    let nav = navigation
    while (nav) {
      const routeNames = nav.getState?.()?.routeNames
      if (Array.isArray(routeNames) && routeNames.includes('AR')) {
        nav.navigate('AR', { fromExplore: true })
        return
      }
      nav = nav.getParent?.() ?? null
    }
  }, [navigation])

  const openAR = useCallback(() => {
    if (Platform.OS !== 'web') Vibration.vibrate(40)

    let didNavigate = false
    const finishOpenAR = () => {
      if (didNavigate) return
      didNavigate = true
      navigateToAR()
      setTimeout(() => setDoorVisible(false), 500)
    }

    doorLeft.setValue(-winW / 2)
    doorRight.setValue(winW / 2)
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
    ]).start(({ finished }) => {
      if (finished !== false) finishOpenAR()
    })

    if (Platform.OS === 'android') {
      setTimeout(finishOpenAR, 900)
    }
  }, [doorLeft, doorRight, doorIconScale, doorIconOpacity, doorFade, navigateToAR, winW])

  const eventAccent = colors.event
  const handleSearchToggle = useCallback(() => {
    setIsSearchExpanded((prev) => {
      const next = !prev
      if (!next) setSearchQuery('')
      return next
    })
  }, [])

  const eventsCarouselSectionHeader = (
    <View style={s.eventsHeadingRow}>
      <View
        style={[
          s.calendarTabRow,
        ]}
      >
        <View
          style={[
            s.calendarTabsGroupWrap,
          ]}
        >
          <View style={s.calendarTabsGroup}>
            {[
              { key: 'all', label: 'ALL EVENTS' },
              { key: 'thisMonth', label: 'THIS MONTH' },
              { key: 'nextMonth', label: 'NEXT MONTH' },
            ].map((tab) => {
              const active = eventTab === tab.key
              return (
                <GHTouchableOpacity key={tab.key} activeOpacity={0.82} onPress={() => setEventTab(tab.key)} style={[s.calendarTabBtn, active ? s.calendarTabBtnActive : null]}>
                  <Text style={[s.calendarTabText, { color: active ? colors.textPrimary : colors.textMuted }]}>{tab.label}</Text>
                  {active ? <View style={[s.calendarTabUnderline, { backgroundColor: eventAccent }]} /> : null}
                </GHTouchableOpacity>
              )
            })}
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={handleSearchToggle}
          style={[
            s.searchToggleBtn,
            {
              backgroundColor: isSearchExpanded ? `${colors.primary}20` : (isDark ? 'rgba(255,255,255,0.06)' : colors.background),
              borderColor: isSearchExpanded ? colors.primary : colors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isSearchExpanded ? 'Hide search' : 'Show search'}
        >
          <Ionicons name={isSearchExpanded ? 'close' : 'search-outline'} size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      {isSearchExpanded ? (
        <ExploreSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          colors={colors}
          isDark={isDark}
          autoFocus
        />
      ) : null}
      {isSearchExpanded ? (
        <View style={s.searchExpandedSpacer} />
      ) : null}
    </View>
  )

  return (
    <ScreenContainer style={{ backgroundColor: colors.background }}>
      <View style={s.exploreFeedRoot}>
        <Animated.View
          pointerEvents="box-none"
          style={[
            s.exploreHeaderBar,
            { backgroundColor: colors.background, transform: [{ translateY: headerTranslateY }] },
          ]}
          onLayout={handleExploreHeaderBarLayout}
        >
          <PageHeadingBar
            title="Explore"
            backgroundColor={colors.background}
            rightSlot={exploreHeadingRightSlot}
          />
        </Animated.View>

        <AnimatedScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingTop: headerBarHeight }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            {...(Platform.OS === 'android' ? { progressViewOffset: headerBarHeight } : {})}
          />
        }
        onScroll={handleExploreScroll}
        scrollEventThrottle={16}
      >

        {eventsCarouselSectionHeader}

        {/* ── Search Results overlay (replaces content when query is active) ── */}
        {searchQuery.trim().length > 0 ? (
          <FadeInView delay={0} from={12} duration={260}>
            <View style={s.searchResultsWrap}>
              {searchResults.length === 0 ? (
                <View style={s.searchEmpty}>
                  <Ionicons name="search-outline" size={38} color={colors.textMuted} />
                  <Text style={[s.searchEmptyTitle, { color: colors.textPrimary }]}>No results for "{searchQuery}"</Text>
                  <Text style={[s.searchEmptySub, { color: colors.textMuted }]}>Try events, places, cuisines or vibe keywords</Text>
                </View>
              ) : (
                <>
                  <Text style={[s.searchResultsLabel, { color: colors.textMuted }]}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
                  </Text>
                  {searchResults.map((item) => (
                    <SearchResultCard
                      key={item.id}
                      item={item}
                      colors={colors}
                      isDark={isDark}
                      onPress={handleSearchResultPress}
                    />
                  ))}
                </>
              )}
            </View>
          </FadeInView>
        ) : coreExploreLoading ? (
          <View style={s.eventsSectionTopSpacer}>
            <LoadingSkeleton width={cardWidth} height={cardHeight} />
          </View>
        ) : filteredEvents.length === 0 ? (
          <FadeInView delay={300} from={24} style={s.eventsSectionTopSpacer}>
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
                {loadError ? 'Events unavailable' : 'No events'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {loadError ? 'Please try again.' : 'Try another tab.'}
              </Text>
              {!loadError && __DEV__ ? (
                <Text style={[s.emptySub, { color: colors.textMuted, fontSize: 12, marginTop: 10, paddingHorizontal: 8 }]}>

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
            <GHFlatList
              ref={flatListRef}
              data={loopedEvents}
              renderItem={renderCard}
              keyExtractor={keyExtractor}
              horizontal
              nestedScrollEnabled
              directionalLockEnabled
              keyboardShouldPersistTaps="handled"
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
              contentContainerStyle={{
                paddingHorizontal: peekPadding,
                paddingRight: peekPadding + 8,
                paddingTop: 4,
                paddingBottom: 6,
              }}
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

        {/* ── Loved by People — Community Plans section ── */}
        {!coreExploreLoading && searchQuery.trim().length === 0 && (
          <FadeInView delay={200} from={20} duration={480}>
            <CommunityPlansSection
              plans={communityPlans}
              loading={communityPlansLoading}
              colors={colors}
              isDark={isDark}
              onPlanPress={handlePlanPress}
            />
          </FadeInView>
        )}

        {!coreExploreLoading && searchQuery.trim().length === 0 && (
          <FadeInView delay={120} from={14} duration={420}>
            <View style={[s.browseWrap, { paddingTop: 0 }]}>
              {browseLoadError ? (
                <Text style={[s.browseInlineError, { color: colors.error }]}>{browseLoadError}</Text>
              ) : null}

              {/* ── Your Bahrain Guide section ── */}
              <View style={s.forYouWrap}>
                <View style={s.forYouHeaderRow}>
                  <View style={s.forYouHeaderTextCol}>
                    <Text style={[s.forYouHeading, { color: colors.textPrimary, fontSize: isMobile ? 26 : 34 }]}>
                      Your Bahrain Guide
                    </Text>
                    <Text style={[s.forYouSub, { color: colors.textSecondary }]}>
                      Everything you need — from visas and essential apps to culture, food and hidden gems
                    </Text>
                  </View>
                </View>
                <GHScrollView
                  horizontal
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  directionalLockEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.forYouScrollContent}
                  decelerationRate="fast"
                  snapToInterval={isMobile ? 234 : 274}
                  snapToAlignment="start"
                  style={{ height: isMobile ? 312 : 352 }}
                >
                  {BAHRAIN_FOR_YOU_CATEGORIES.map((cat) => (
                    <ForYouCard
                      key={cat.id}
                      category={cat}
                      winW={winW}
                      onPress={(category) => navigation.navigate('BahrainGuideDetail', { category })}
                    />
                  ))}
                </GHScrollView>
              </View>

              <View style={s.personalizedWrap}>
                <View style={s.personalizedHeaderRow}>
                  <View style={s.personalizedHeaderTextCol}>
                    <Text style={[s.personalizedHeading, { color: colors.textPrimary, fontSize: isMobile ? 24 : 32 }]}>Personalized by AI</Text>
                    <Text style={[s.personalizedSub, { color: colors.textSecondary }]}>
                      Ranked from your profile + Pinecone similarity + live database freshness
                    </Text>
                  </View>
                  <GHTouchableOpacity
                    activeOpacity={0.85}
                    onPressIn={() => {
                      personalizedTouchActiveRef.current = true
                    }}
                    onPressOut={() => {
                      personalizedTouchActiveRef.current = false
                    }}
                    onPress={() => {
                      if (personalizedIsDraggingRef.current) return
                      const first = personalizedEditorialPages?.[0]?.[0]?.[0]
                      if (!first) return
                      openPersonalizedItemFromTouch(first)
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
                  </GHTouchableOpacity>
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
                    <GHScrollView
                      ref={personalizedSliderRef}
                      horizontal
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      directionalLockEnabled
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
                        personalizedTouchActiveRef.current = true
                      }}
                      onScrollEndDrag={() => {
                        personalizedIsDraggingRef.current = false
                        personalizedTouchActiveRef.current = false
                      }}
                      onMomentumScrollEnd={() => {
                        personalizedIsDraggingRef.current = false
                        personalizedTouchActiveRef.current = false
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
                                const onPress = () => openPersonalizedItemFromTouch(item)
                                return (
                                  <GHTouchableOpacity
                                    key={item.renderKey || item.key}
                                    onPressIn={() => {
                                      personalizedTouchActiveRef.current = true
                                    }}
                                    onPressOut={() => {
                                      personalizedTouchActiveRef.current = false
                                    }}
                                    onPress={() => {
                                      if (personalizedIsDraggingRef.current) return
                                      onPress()
                                    }}
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
                                  </GHTouchableOpacity>
                                )
                              })}
                            </View>
                          ))}
                        </View>
                      ))}
                    </GHScrollView>
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

      </View>
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

      <PlanBlogModal
        plan={selectedPlan}
        visible={!!selectedPlan}
        onClose={handleClosePlanBlog}
        onPlanThisDay={handlePlanThisDay}
        colors={colors}
        isDark={isDark}
      />

      <View
        style={[s.arFloatingBtnWrap, { bottom: Math.max(insets.bottom + 74, 88) }]}
        pointerEvents="box-none"
        collapsable={false}
      >
        <AnimatedPressable
          onPress={openAR}
          scaleDown={0.9}
          accessibilityRole="button"
          accessibilityLabel="Open AR view"
        >
          <LinearGradient
            colors={[colors.primary, isDark ? '#C8102E' : '#9B0C23']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.arFloatingBtn}
          >
            <ArScanIcon name="scan" size={22} color="#FFF" />
            <Text style={s.arFloatingBtnText}>AR View</Text>
          </LinearGradient>
        </AnimatedPressable>
      </View>

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
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  exploreFeedRoot: {
    flex: 1,
    minHeight: 0,
  },
  exploreHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    ...Platform.select({
      android: { elevation: 8 },
      default: {},
    }),
  },
  exploreHeaderToolbarOuter: {
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  exploreHeaderToolbarWrap: {
    paddingBottom: 4,
    overflow: 'hidden',
  },
  exploreHeaderToolbarRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  /** Matches HomeScreen `headerIconBtn` + `profileHeaderInitial` */
  exploreHeaderIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  exploreHeaderProfileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  arPillPulseWrap: { alignSelf: 'center' },
  arPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 26,
    paddingVertical: 10,
    borderRadius: 24,
    minHeight: 48,
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
  arPillText: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, color: '#FFF', letterSpacing: 0.3 },
  arFloatingBtnWrap: {
    position: 'absolute',
    right: 18,
    zIndex: 40,
    ...Platform.select({
      android: { elevation: 40 },
      default: {},
    }),
  },
  arFloatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    ...Platform.select({
      ios: {
        shadowColor: '#020617',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 10 },
    }),
  },
  arFloatingBtnText: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFF',
    letterSpacing: 0.3,
  },
  searchToggleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  eventsSectionTopSpacer: { marginTop: -10 },
  eventsHeadingRow: { paddingHorizontal: 24 },
  calendarHeaderTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  calendarHeading: { fontSize: 40, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.8, marginBottom: 4 },
  calendarSubheading: { fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18, maxWidth: 420 },
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
  calendarDiscoverText: { fontSize: 11, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.4 },
  calendarTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  calendarTabsGroupWrap: {
    flex: 1,
    minWidth: 0,
  },
  calendarTabsGroup: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 2 },
  calendarTabBtn: { paddingBottom: 6, paddingHorizontal: 2 },
  calendarTabBtnActive: { transform: [{ scale: 1.01 }] },
  calendarTabText: { fontSize: 12, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.2 },
  calendarTabUnderline: { height: 2, borderRadius: 1, marginTop: 6 },
  searchExpandedSpacer: { height: 4 },

  browseWrap: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 },
  browseHeading: { fontSize: 18, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.3, marginBottom: 14 },
  guideSubheading: { fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18, marginTop: -6, marginBottom: 14 },
  sectionEyebrow: { fontSize: 11, fontFamily: FONT_POPPINS_BOLD, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  bookletWrap: { marginBottom: 20 },
  bookletHorizontalContent: { flexDirection: 'row', gap: 12, paddingRight: 18 },
  experienceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  experienceHeading: { fontSize: 38, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.9, marginBottom: 3 },
  experienceSubheading: { fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18, maxWidth: 430 },
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
  experienceDiscoverText: { fontSize: 11, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.3 },
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
  experienceCardTag: { fontSize: 10, fontFamily: FONT_POPPINS_BOLD, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5, marginBottom: 5 },
  experienceCardTitle: { fontSize: 31, fontFamily: FONT_POPPINS_BOLD, color: '#FFF', lineHeight: 33, letterSpacing: -0.8 },
  experienceCardSub: { fontSize: 12, fontFamily: FONT_POPPINS_REGULAR, color: 'rgba(255,255,255,0.9)', lineHeight: 16, marginTop: 5 },
  bookletCard: {
    width: 214,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bookletIconBg: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  bookletTitle: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, marginBottom: 4 },
  bookletSubtitle: { fontSize: 12, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 17, marginBottom: 8 },
  bookletCount: { fontSize: 12, fontFamily: FONT_POPPINS_BOLD },
  /* Personalized For You */
  forYouWrap: { marginBottom: 28 },
  forYouHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 14 },
  forYouHeaderTextCol: { flex: 1, minWidth: 0 },
  forYouHeading: { fontSize: 34, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.9, marginBottom: 4 },
  forYouSub: { fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18, maxWidth: 480 },
  forYouScrollContent: { flexDirection: 'row', paddingRight: 24, paddingBottom: 6 },

  personalizedWrap: { marginBottom: 24 },
  personalizedHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 12 },
  personalizedHeaderTextCol: { flex: 1, minWidth: 0 },
  personalizedHeading: { fontSize: 32, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.8, marginBottom: 4 },
  personalizedSub: { fontSize: 12, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 17, maxWidth: 520 },
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
  personalizedDiscoverText: { fontSize: 11, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.35 },
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
  personalizedEditorialTag: { fontSize: 10, fontFamily: FONT_POPPINS_BOLD, color: 'rgba(255,255,255,0.82)', letterSpacing: 0.5, marginBottom: 5 },
  personalizedEditorialTitle: { color: '#FFF', fontSize: 27, fontFamily: FONT_POPPINS_BOLD, lineHeight: 29, letterSpacing: -0.6 },
  personalizedPagerDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 10 },
  personalizedPagerDot: { width: 7, height: 7, borderRadius: 4 },
  browseInlineError: { fontSize: 13, fontFamily: FONT_POPPINS_SEMIBOLD, marginBottom: 8 },
  browseSection: { marginBottom: 22 },
  browseSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  browseSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseSectionTitle: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, letterSpacing: 0.2 },
  browseEmpty: { fontSize: 14, fontFamily: FONT_POPPINS_MEDIUM, fontStyle: 'italic' },
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
    fontFamily: FONT_POPPINS_BOLD,
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
  emptyTitle: { fontSize: 20, fontFamily: FONT_POPPINS_BOLD, marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: FONT_POPPINS_REGULAR, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
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
  emptyCtaText: { fontSize: 17, fontFamily: FONT_POPPINS_BOLD, color: '#FFF', letterSpacing: 0.2 },

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
  bookletGuideTopBarTitle: { fontSize: 16, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.2 },
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
  bookletGuideHeroEyebrow: { fontSize: 11, fontFamily: FONT_POPPINS_BOLD, color: 'rgba(255,255,255,0.82)', letterSpacing: 0.5, marginBottom: 4 },
  bookletGuideHeroTitle: { fontSize: 28, fontFamily: FONT_POPPINS_BOLD, color: '#FFF', lineHeight: 30, letterSpacing: -0.7 },
  bookletGuideSection: { marginBottom: 14 },
  bookletGuideSectionTitle: { fontSize: 18, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.3, marginBottom: 8 },
  bookletGuideBody: { fontSize: 14, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 21 },
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
  bookletGuideTipText: { flex: 1, fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18 },
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
  bookletGuideRouteIndexText: { fontSize: 12, fontFamily: FONT_POPPINS_BOLD },
  bookletGuideRouteTitle: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, lineHeight: 18, marginBottom: 1 },
  bookletGuideRouteSub: { fontSize: 12, fontFamily: FONT_POPPINS_SEMIBOLD },
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
    fontFamily: FONT_POPPINS_BOLD,
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
  doorLabel: { marginTop: 14, fontSize: 18, fontFamily: FONT_POPPINS_BOLD, color: '#FFF', letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  doorSubLabel: { marginTop: 4, fontSize: 13, fontFamily: FONT_POPPINS_BOLD, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' },

  /* Search */
  searchResultsWrap: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 },
  searchResultsLabel: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  searchEmpty: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 24,
    gap: 10,
  },
  searchEmptyTitle: { fontSize: 17, fontFamily: FONT_POPPINS_BOLD, letterSpacing: -0.2, textAlign: 'center' },
  searchEmptySub: { fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 18, textAlign: 'center' },
})
