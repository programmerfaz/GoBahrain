import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractBindingNames } from './ai-plan-bindings.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ai = path.join(__dirname, '../src/screens/aiPlan')

const hookText =
  fs.readFileSync(path.join(ai, 'hookInner.txt'), 'utf8') +
  fs.readFileSync(path.join(ai, 'hookMiddle.txt'), 'utf8') +
  fs.readFileSync(path.join(ai, 'hookOuter.txt'), 'utf8')

const names = extractBindingNames(hookText)
const reserved = new Set(
  `React MapView Modal ScrollView View Text TextInput TouchableOpacity Pressable ActivityIndicator KeyboardAvoidingView StyleSheet Platform Animated PanResponder Easing Linking Alert Share LinearGradient BlurView Ionicons DraggableFlatList ScaleDecorator Reanimated Gesture GestureDetector GHScrollView GHTouchableOpacity CachedImage ClientProfileModal MapScanningOverlay PlanStepBubble PopIn AiStagger AnimatedOptionChip AnimatedStopRow PreviewImage KhalidScoutPlanVisual StopDetailGallery PlanDrawerLoadingPanel PlanModalLoadingView AnimatedPlaceMarker MarkerShowcaseDetailSheet inner mid midA screen`
    .split(/\s+/)
)

const prefixScreen = (src) => {
  const sorted = [...names].filter((n) => n && !reserved.has(n)).sort((a, b) => b.length - a.length)
  let out = src
  for (const n of sorted) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    out = out.replace(re, `screen.${n}`)
  }
  // Undo mistaken prefix on JSX prop *names* (`zoomScale={screen.zoomScale}` must stay `zoomScale=…`)
  out = out.replace(/screen\.([a-zA-Z_$][\w$]*)\s*=\s*\{/g, '$1={')
  // `styles.doorLeft` must not become `styles.screen.doorLeft` when `doorLeft` is a screen field
  out = out.replace(/styles\.screen\./g, 'styles.')
  return out
}

const viewImports = `import React from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
  PanResponder,
  Platform,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Easing,
  Share,
} from 'react-native'
import { CachedImage } from '../../components/CachedImage'
import * as Haptics from 'expo-haptics'
import Reanimated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutUp,
  ZoomInEasyDown,
  ZoomOutEasyDown,
} from 'react-native-reanimated'
import { GestureDetector } from 'react-native-gesture-handler'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import MapView from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist'
import { openGoogleMapsDirections } from '../../utils/googleMapsDirections'
import { colors as themeColors } from '../../theme/designTokens'
import styles from '../AIPlanScreen.styles'
import ClientProfileModal from '../../components/ClientProfileModal'
import {
  PLAN_MAP_CLIENT_TYPE_FILTERS,
  BAHRAIN_REGION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SNAP_POINTS,
  getPlanSheetBottomPadding,
  TRAVEL_EXPLORE_OPTIONS,
  PREFERENCES,
  FOOD_CATEGORIES,
  STOP_DIALOG_SLIDE_WIDTH,
  STOP_DIALOG_IMAGE_H,
  STOP_DIALOG_IMAGE_W,
} from './constants'
import { AnimatedStopRow, AiStagger, PopIn, PlanStepBubble, AnimatedOptionChip } from './uiAnimChips'
import { PreviewImage, KhalidScoutPlanVisual } from './uiScoutMosaic'
import { StopDetailGallery } from './stopDetailGallery'
import { PlanDrawerLoadingPanel, PlanModalLoadingView } from './planLoadingViews'
import { AnimatedPlaceMarker, MarkerShowcaseDetailSheet } from './mapMarkerViews'
import { MapScanningOverlay, mapMarkerFilterCategoryKey, markerMatchesPlanMapClientFilter, buildMapMarkers } from './mapOverlayAndMarkersModel'
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../../utils/imageUrl'
import {
  clampRegionToBahrain,
  formatPlanShareMessage,
  parseShareCodeFromUrl,
  openAllStopsInGoogleMaps,
  parsePlanItemCoords,
} from './planGeoAndShare'
import { attachPlanRowKeys, buildDraftStopFromClient, getLuxuryCategoryStyle } from './planRowModel'
import {
  formatStopEventDetailsText,
  getStopAboutPrimaryText,
  pickPlanStopGalleryUris,
  pickPlanStopThumbUri,
} from './planMatching'
`

const mk = (name, file) => {
  const body = prefixScreen(fs.readFileSync(path.join(ai, file), 'utf8'))
  fs.writeFileSync(
    path.join(ai, `${name}.js`),
    `${viewImports}

export function ${name}({ screen }) {
  return (
<>
${body}
</>
  )
}
`
  )
}

mk('AIPlanScreenViewMap', 'vMap.txt')
mk('AIPlanScreenViewDialogsA', 'vDlgA.txt')
mk('AIPlanScreenViewDialogsB', 'vDlgB.txt')

console.log('prefixed names', names.length)
