import fs from 'fs'
import path from 'path'

const root = path.join(import.meta.dirname, '..')
const srcPath = path.join(root, 'src/screens/AIPlanScreen.js')
const lines = fs.readFileSync(srcPath, 'utf8').split('\n')
const slice = (a, b) => lines.slice(a - 1, b).join('\n') + '\n'
const outDir = path.join(root, 'src/screens/aiPlan')

const write = (name, header, body) => {
  const p = path.join(outDir, name)
  fs.writeFileSync(p, `${header}\n\n${body}`)
  const n = fs.readFileSync(p, 'utf8').split('\n').length
  console.log(name, n, 'lines')
}

fs.mkdirSync(outDir, { recursive: true })

const commonReact = `import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'`

write(
  'constants.js',
  `import { Dimensions } from 'react-native'
import { PREFERENCES, FOOD_CATEGORIES, TRAVEL_EXPLORE_OPTIONS } from '../../constants/preferences'
import { colors as themeColors } from '../../theme/designTokens'

export const PLAN_MAP_CLIENT_TYPE_FILTERS = [
  { id: 'all', label: 'All', icon: 'apps-outline' },
  { id: 'restaurant', label: 'Restaurants', icon: 'restaurant-outline' },
  { id: 'place', label: 'Places', icon: 'location-outline' },
  { id: 'event', label: 'Events', icon: 'calendar-outline' },
]

export const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

export const PLAN_TIME_SLOTS = ['Morning', 'Afternoon', 'Evening']

/** Bottom inset for plan sheet / marker sheet — matches floating BottomControlBar (lifted FAB + dock) + safe area */
export const PLAN_TAB_BAR_ROW_HEIGHT = 100
export const getPlanSheetBottomPadding = (insets) => {
  const bottomInset = Math.max(insets?.bottom ?? 0, 12)
  return PLAN_TAB_BAR_ROW_HEIGHT + bottomInset + 16
}

export const SHEET_VISIBLE_PEEK = 0.28
export const SHEET_VISIBLE_MID = 0.75
/** Fraction of screen height for the sheet (list + masthead). Higher = taller plan container */
export const SHEET_VISIBLE_EXPANDED = 0.94

export const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_VISIBLE_EXPANDED
export const SHEET_TOP_EXPANDED = SCREEN_HEIGHT - SHEET_HEIGHT
export const SHEET_TOP_MID = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_MID)
export const SHEET_TOP_PEEK = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_PEEK)

export const SNAP_POINTS = [
  0,
  SHEET_TOP_MID - SHEET_TOP_EXPANDED,
  SHEET_TOP_PEEK - SHEET_TOP_EXPANDED,
]
export const INITIAL_SNAP_INDEX = 2

export const BAHRAIN_REGION = {
  latitude: 26.0667,
  longitude: 50.5577,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
}

export const BAHRAIN_BOUNDS = {
  minLat: 25.55,
  maxLat: 26.40,
  minLng: 50.30,
  maxLng: 50.95,
}

export { PREFERENCES, FOOD_CATEGORIES, TRAVEL_EXPLORE_OPTIONS }

export const SURPRISE_THEMES = [
  { label: 'Scenic Day', icon: 'heart', color: themeColors.evening, prefs: ['Landmarks', 'Leisure'], food: ['Italian', 'Seafood'] },
  { label: 'Adventure', icon: 'rocket', color: themeColors.error, prefs: ['Adventure', 'Nature'], food: ['Quick'] },
  { label: 'Chill Vibes', icon: 'leaf', color: themeColors.success, prefs: ['Leisure', 'Nature'], food: ['Café'] },
  { label: 'Foodie Tour', icon: 'restaurant', color: themeColors.dining, prefs: ['Landmarks'], food: ['Subcontinent', 'Seafood', 'Asian'] },
  { label: 'Culture Buff', icon: 'color-palette', color: themeColors.primary, prefs: ['Culture', 'History'], food: ['Local'] },
  { label: 'Nightlife', icon: 'moon', color: themeColors.evening, prefs: ['Photos', 'Leisure'], food: ['Global'] },
  { label: 'Family Fun', icon: 'people', color: themeColors.afternoon, prefs: ['Landmarks', 'Leisure'], food: ['American', 'Quick'] },
  { label: 'Hidden Gems', icon: 'diamond', color: themeColors.morning, prefs: ['Culture', 'Nature'], food: ['Subcontinent', 'Local'] },
]

// Plan modal overlay (modern primary)
export const PLAN_COLORS = {
  primary: themeColors.primary,
  overlayQuestionTitle: '#FFFFFF',
  overlayQuestionSub: 'rgba(255,255,255,0.88)',
  overlayBlockBg: 'rgba(255,255,255,0.2)',
  overlayBlockBorder: 'rgba(255,255,255,0.35)',
  overlayBlockText: '#FFFFFF',
}

// Bahrain trivia while the plan modal is generating
export const BAHRAIN_FACTS = [
  'Bahrain was once the heart of the ancient Dilmun civilization, a key trading hub for thousands of years.',
  'Locals love evening walks along the corniche – the skyline and sea breeze are perfect after sunset.',
  'Traditional Bahraini breakfast often includes balaleet (sweet vermicelli) and khubz (Arabic bread).',
  'Manama Souq is one of the best places to feel the old-meets-new soul of Bahrain in a single walk.',
  'Pearling was once Bahrain’s main industry – the Pearling Trail in Muharraq is now a UNESCO site.',
  'Bahrain has a vibrant cafe culture – from hidden specialty coffee spots to seaside shisha lounges.',
  'The Bahrain International Circuit hosts Formula 1 night races – the desert lights make it unforgettable.',
  "Bahrain Fort (Qal'at al-Bahrain) is a UNESCO site where you can walk through 4,000 years of history.",
  'The Tree of Life stands alone in the desert – nobody is quite sure how its deep roots still find water.',
  'Block 338 in Adliya is famous for street art, galleries, and some of the island’s best casual dining.',
  'Bahrain’s islands are linked by the King Fahd Causeway – a scenic drive to Saudi Arabia on a clear day.',
  'Muharraq’s lanes hide restored pearling merchant houses that tell the story of the Gulf’s golden age.',
  'Winter months bring perfect outdoor weather – rooftop sunsets and open-air markets feel made for it.',
  'The National Museum is a calm, air-conditioned deep dive into archaeology, dhows, and modern Bahrain.',
]

export const STOP_DIALOG_EDGE = 4
export const STOP_DIALOG_ARROW_BTN = 32
export const STOP_DIALOG_ARROW_GAP = 3
export const STOP_DIALOG_SLIDE_WIDTH = Math.min(
  580,
  SCREEN_WIDTH - STOP_DIALOG_EDGE * 2 - STOP_DIALOG_ARROW_BTN * 2 - STOP_DIALOG_ARROW_GAP * 2
)
export const STOP_DIALOG_IMAGE_H = Math.min(312, Math.round(SCREEN_HEIGHT * 0.36))
export const STOP_DIALOG_IMAGE_W = STOP_DIALOG_SLIDE_WIDTH

/** Stop-detail swipe: peek + exit distances */
export const STOP_DETAIL_SWIPE_PEEK_RANGE = SCREEN_WIDTH * 0.34
export const STOP_DETAIL_EXIT_X = SCREEN_WIDTH * 1.12
export const STOP_DETAIL_SWIPE_SNAP_BACK = { damping: 19, stiffness: 260, mass: 0.72 }
export const STOP_DETAIL_SWIPE_COMMIT = { damping: 17, stiffness: 300, mass: 0.58 }
`,
  ''
)

const planGeoHeader = `import { Alert, Linking } from 'react-native'
import * as Location from 'expo-location'
import * as ExpoLinking from 'expo-linking'
import { BAHRAIN_BOUNDS } from './constants'
`
const planGeoBody =
  slice(419, 468).replace(/^function /gm, 'export function ') +
  slice(204, 252).replace(/^function /gm, 'export function ') +
  slice(175, 202).replace(/^const openAllStopsInGoogleMaps/, 'export const openAllStopsInGoogleMaps')
write('planGeoAndShare.js', planGeoHeader, planGeoBody)

write(
  'planRowModel.js',
  `import { PLAN_TIME_SLOTS } from './constants'

/** Stable keys for draggable list rows (persist across reorder; replace on enhance). */
export function attachPlanRowKeys(plan) {
  if (!Array.isArray(plan)) return plan
  return plan.map((item, idx) => ({
    ...item,
    _planRowKey: item._planRowKey || \`rk-\${idx}-\${Math.random().toString(36).slice(2, 11)}\`,
  }))
}

export function inferTimeSlotForNewStop(plan) {
  if (!Array.isArray(plan) || plan.length === 0) return 'Afternoon'
  const last = plan[plan.length - 1]
  const t = last?.time
  if (t && PLAN_TIME_SLOTS.includes(t)) return t
  return 'Afternoon'
}

/** Draft plan row from a Supabase client row (coords filled in by enrichPlanWithClientData). */
export function buildDraftStopFromClient(client, existingPlan) {
  const ct = String(client?.client_type || '').toLowerCase()
  const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place'
  const spot = String(client?.name || client?.business_name || client?.business_name_ar || 'Spot').trim()
  const rid = client?.client_a_uuid || client?.clientId
  const r = client?.rating
  const rating = r != null && r !== '' && Number.isFinite(Number(r)) ? Number(r) : null
  return {
    spot,
    time: inferTimeSlotForNewStop(existingPlan),
    type,
    lat: null,
    lng: null,
    reason: 'You added this to your day — drag to reorder or tap for details.',
    clientId: rid || null,
    rating,
    userAdded: true,
  }
}

export const getLuxuryCategoryStyle = (item) => {
  if (item.type === 'restaurant') {
    return { label: 'Dining', bg: '#FFE8EE', fg: '#FF4B78', icon: 'restaurant-outline' }
  }
  if (item.type === 'event') {
    return { label: 'Events', bg: '#EDE9FE', fg: '#7C3AED', icon: 'calendar-outline' }
  }
  return { label: 'Attractions', bg: '#FFE4F0', fg: '#DB2777', icon: 'location-outline' }
}
`,
  ''
)

const exportify = (code) =>
  code
    .replace(/^async function /gm, 'export async function ')
    .replace(/^function /gm, 'export function ')

write(
  'planMatching.js',
  `import { resolvePublicImageUrl } from '../../utils/imageUrl'
import { parseCoordsFromPineconeMetadata, unswapLatLng, parsePlanItemCoords } from './planGeoAndShare'
`,
  exportify(slice(773, 998))
)

const spotHeader = `import { supabase } from '../../config/supabase'
import { CachedImage, prefetchImageUrls } from '../../components/CachedImage'
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../../utils/imageUrl'
import { parseCoordsFromClientRow, unswapLatLng, parsePlanItemCoords } from './planGeoAndShare'
import { matchPlanToPinecone, matchPlanToClient, resolveCoordsFromLoadedCache } from './planMatching'
`
write(
  'spotPreviewPipeline.js',
  spotHeader,
  exportify(slice(494, 770)) + exportify(slice(1000, 1203))
)

const uiAnimHeader = `${commonReact}
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import styles from '../AIPlanScreen.styles'
import { colors as themeColors } from '../../theme/designTokens'
import { PLAN_COLORS } from './constants'
`
const uiAnimBody =
  exportify(slice(98, 122)) +
  exportify(slice(255, 378))
write('uiAnimChips.js', uiAnimHeader, uiAnimBody)

const scoutHeader = `${commonReact}
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
`
write('uiScoutMosaic.js', scoutHeader, exportify(slice(1225, 1575)))

const galleryHeader = `${commonReact}
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
`
write('stopDetailGallery.js', galleryHeader, exportify(slice(1594, 1735)))

const loadingHeader = `${commonReact}
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import Reanimated, { FadeIn, FadeOut, FadeInDown, FadeOutUp, ZoomInEasyDown, ZoomOutEasyDown } from 'react-native-reanimated'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { CachedImage, prefetchImageUrls } from '../../components/CachedImage'
import { resolvePublicImageUrl } from '../../utils/imageUrl'
import { colors as themeColors } from '../../theme/designTokens'
import styles from '../AIPlanScreen.styles'
import { BAHRAIN_FACTS, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants'
import { KhalidScoutPlanVisual } from './uiScoutMosaic'

gsap.registerPlugin(useGSAP)
`
write('planLoadingViews.js', loadingHeader, exportify(slice(1737, 2408)))

const mapCompHeader = `${commonReact}
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Animated,
  ActivityIndicator,
  Easing,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { Gesture, GestureDetector, ScrollView as GHScrollView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Reanimated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withSpring, interpolate, Extrapolation } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../config/supabase'
import { resolvePublicImageUrl, parseStorageImageUrl } from '../../utils/imageUrl'
import { colors as themeColors } from '../../theme/designTokens'
import { luxurySoftShadow } from '../../theme/luxuryPremium'
import styles from '../AIPlanScreen.styles'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './constants'
import { PreviewImage } from './uiScoutMosaic'
`
write('mapMarkerViews.js', mapCompHeader, exportify(slice(2409, 3071)))

const mapOverlayHeader = `${commonReact}
import { View, StyleSheet, Animated, Easing } from 'react-native'
import { resolvePublicImageUrl } from '../../utils/imageUrl'
import styles from '../AIPlanScreen.styles'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './constants'
`
write('mapOverlayAndMarkersModel.js', mapOverlayHeader, exportify(slice(3074, 3323)))

console.log('done')
