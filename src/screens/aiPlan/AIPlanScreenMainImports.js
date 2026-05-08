import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
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
  Linking,
  Alert,
  Share,
} from 'react-native'
import { CachedImage, prefetchImageUrls } from '../../components/CachedImage'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import Reanimated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutUp,
  ZoomInEasyDown,
  ZoomOutEasyDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector, ScrollView as GHScrollView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import * as Location from 'expo-location'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native'
import * as ExpoLinking from 'expo-linking'
import { openGoogleMapsDirections } from '../../utils/googleMapsDirections'
import MapView from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist'
import {
  fetchPlaces,
  fetchRestaurants,
  fetchBreakfastSpots,
  fetchEvents,
  generateDayPlan,
  fetchClientsWithLocation,
  enhancePlanStopAtIndex,
} from '../../services/aiPipeline'
import { useUserPreferences } from '../../context/UserPreferencesContext'
import { colors as themeColors } from '../../theme/designTokens'
import styles from '../AIPlanScreen.styles'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../config/supabase'
import { useAuth } from '../../context/AuthContext'
import { getCommunityPalette } from '../../components/community/CommunityReviewViews'
import {
  listSavedPlans,
  createSavedPlan,
  updateSavedPlan,
  deleteSavedPlan,
  fetchSharedPlanByCode,
  pushSharedPlanUpdate,
  serializePlanForStorage,
  enableSharingForPlan,
  disableSharingForPlan,
  normalizeShareCode,
} from '../../services/savedPlans'
import ClientProfileModal from '../../components/ClientProfileModal'
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../../utils/imageUrl'
import {
  PLAN_MAP_CLIENT_TYPE_FILTERS,
  PREFERENCES,
  FOOD_CATEGORIES,
  TRAVEL_EXPLORE_OPTIONS,
  SURPRISE_THEMES,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SNAP_POINTS,
  INITIAL_SNAP_INDEX,
  BAHRAIN_REGION,
  STOP_DIALOG_SLIDE_WIDTH,
  STOP_DIALOG_IMAGE_H,
  STOP_DIALOG_IMAGE_W,
  STOP_DETAIL_SWIPE_PEEK_RANGE,
  STOP_DETAIL_EXIT_X,
  STOP_DETAIL_SWIPE_SNAP_BACK,
  STOP_DETAIL_SWIPE_COMMIT,
  getPlanSheetBottomPadding,
} from './constants'
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
import {
  buildSpotPreviews,
  fetchSpotPreviewsFromSupabase,
  getCachedFeedImages,
  enrichSpotPreviewsWithClientImages,
  buildSpotPreviewsFromPlan,
  enrichPlanWithClientData,
} from './spotPreviewPipeline'
import { AnimatedStopRow, AiStagger, PopIn, PlanStepBubble, AnimatedOptionChip } from './uiAnimChips'
import { PreviewImage, KhalidScoutPlanVisual } from './uiScoutMosaic'
import { StopDetailGallery } from './stopDetailGallery'
import { PlanDrawerLoadingPanel, PlanModalLoadingView } from './planLoadingViews'
import { AnimatedPlaceMarker, MarkerShowcaseDetailSheet } from './mapMarkerViews'
import { MapScanningOverlay, mapMarkerFilterCategoryKey, markerMatchesPlanMapClientFilter, buildMapMarkers } from './mapOverlayAndMarkersModel'
