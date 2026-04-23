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
  ORBIT_SHEET_EXTRA_TRANSLATE_Y,
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
import { setPlanMapOrbitActive } from './planMapOrbitStore'


export function useAIPlanScreenInner() {
  const { colors, isDark } = useTheme();
  const communityPalette = useMemo(() => getCommunityPalette(!!isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const { preferences, generalLabels, activityLabels, foodLabels: savedProfileFoodLabels } = useUserPreferences();
  const { user } = useAuth();

  const mapRef = useRef(null);
  /** Latest GPS fix for map fitting and native user dot (`showsUserLocation`) */
  const userLocationRef = useRef(null);
  const dayPlanRef = useRef(null);
  const locationWatchRef = useRef(null);
  /** True while the map is moving programmatically — avoids clamp / region logic fighting the camera */
  const mapProgrammaticMoveRef = useRef(false);
  const mapProgrammaticMoveClearTimerRef = useRef(null);
  /** Only auto-center on user once (tab refocus was re-animating every time) */
  const hasInitialUserCenterRef = useRef(false);
  /** Cancel staged camera orbit legs when another pin is pressed or showcase exits */
  const markerShowcaseRef = useRef({ generation: 0, timeoutIds: [] });
  const [mapRegion, setMapRegion] = useState(BAHRAIN_REGION);
  /** Pin selected on map — tap map or Done to exit; drives orbit profile CTA */
  const [isMarkerShowcaseActive, setIsMarkerShowcaseActive] = useState(false);
  const [showcaseMarkerMk, setShowcaseMarkerMk] = useState(null);
  const [showcaseMorphAnchor, setShowcaseMorphAnchor] = useState(null);
  /** Post image URIs for the client selected in map orbit mode — drives the auto-scrolling filmstrip */
  const [showcaseOrbitPostUris, setShowcaseOrbitPostUris] = useState([]);
  /** Map pins: one active chip like Community (`all` | `restaurant` | `place` | `event`), keyed off `client.client_type`. */
  const [activePlanMapClientFilter, setActivePlanMapClientFilter] = useState('all');

  const handlePlanMapClientFilterPress = useCallback((id) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePlanMapClientFilter(id);
  }, []);

  useEffect(() => {
    if (!isMarkerShowcaseActive || !showcaseMarkerMk?.clientId) {
      setShowcaseOrbitPostUris([]);
      return undefined;
    }
    let cancelled = false;
    const clientId = showcaseMarkerMk.clientId;
    (async () => {
      try {
        const { data } = await supabase
          .from('posts')
          .select('post_image')
          .eq('client_a_uuid', clientId)
          .order('created_at', { ascending: false })
          .limit(16);
        if (cancelled) return;
        const uris = (data || [])
          .map((row) => resolvePublicImageUrl(row.post_image))
          .filter(Boolean);
        setShowcaseOrbitPostUris(uris);
      } catch {
        if (!cancelled) setShowcaseOrbitPostUris([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMarkerShowcaseActive, showcaseMarkerMk]);

  useEffect(() => {
    setPlanMapOrbitActive(isMarkerShowcaseActive)
    return () => setPlanMapOrbitActive(false)
  }, [isMarkerShowcaseActive])

  const orbitSheetExtraTranslateY = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(orbitSheetExtraTranslateY, {
      toValue: isMarkerShowcaseActive ? ORBIT_SHEET_EXTRA_TRANSLATE_Y : 0,
      useNativeDriver: true,
      tension: 260,
      friction: 30,
    }).start()
  }, [isMarkerShowcaseActive, orbitSheetExtraTranslateY])

  const markProgrammaticMapMove = useCallback((durationMs = 1200) => {
    mapProgrammaticMoveRef.current = true;
    if (mapProgrammaticMoveClearTimerRef.current) {
      clearTimeout(mapProgrammaticMoveClearTimerRef.current);
    }
    mapProgrammaticMoveClearTimerRef.current = setTimeout(() => {
      mapProgrammaticMoveRef.current = false;
      mapProgrammaticMoveClearTimerRef.current = null;
    }, durationMs);
  }, []);

  const clearMarkerShowcaseTimers = useCallback(() => {
    const box = markerShowcaseRef.current
    if (!box) return
    box.generation += 1
    const ids = Array.isArray(box.timeoutIds) ? box.timeoutIds : []
    ids.forEach(clearTimeout)
    box.timeoutIds = []
  }, []);

  const clearMarkerShowcase = useCallback(() => {
    clearMarkerShowcaseTimers();
    setIsMarkerShowcaseActive(false);
    setShowcaseMarkerMk(null);
    setShowcaseMorphAnchor(null);
  }, [clearMarkerShowcaseTimers]);

  const exitMarkerShowcase = useCallback(() => {
    clearMarkerShowcaseTimers();
    /** Prefer the pin’s coordinates over `mapRegion` center when resetting the camera */
    const pinLat = showcaseMarkerMk != null ? Number(showcaseMarkerMk.lat) : NaN;
    const pinLng = showcaseMarkerMk != null ? Number(showcaseMarkerMk.lng) : NaN;
    const hasPin = Number.isFinite(pinLat) && Number.isFinite(pinLng);
    setIsMarkerShowcaseActive(false);
    setShowcaseMarkerMk(null);
    setShowcaseMorphAnchor(null);
    const map = mapRef.current;
    if (!map) return;
    const r = mapRegion;
    const centerLat = hasPin ? pinLat : r.latitude;
    const centerLng = hasPin ? pinLng : r.longitude;
    markProgrammaticMapMove(900);
    if (typeof map.animateCamera === 'function') {
      map.animateCamera(
        Platform.OS === 'ios'
          ? {
              center: { latitude: centerLat, longitude: centerLng },
              pitch: 0,
              heading: 0,
              altitude: 2200,
            }
          : {
              center: { latitude: centerLat, longitude: centerLng },
              pitch: 0,
              heading: 0,
              zoom: 12.5,
            },
        { duration: 650 },
      );
    } else {
      map.animateToRegion(
        clampRegionToBahrain({
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: r.latitudeDelta ?? 0.06,
          longitudeDelta: r.longitudeDelta ?? 0.06,
        }),
        650,
      );
    }
  }, [mapRegion, showcaseMarkerMk, markProgrammaticMapMove, clearMarkerShowcaseTimers]);

  const handleMapPress = useCallback(() => {
    if (!isMarkerShowcaseActive) return;
    exitMarkerShowcase();
  }, [isMarkerShowcaseActive, exitMarkerShowcase]);

  /** Single top-down pan to the pin — no pitch/heading orbit */
  const centerMapOnPlaceMarker = useCallback(
    (mk) => {
      const lat = Number(mk?.lat);
      const lng = Number(mk?.lng);
      const map = mapRef.current;
      if (!map || Number.isNaN(lat) || Number.isNaN(lng)) {
        setIsMarkerShowcaseActive(true);
        return;
      }
      setIsMarkerShowcaseActive(true);
      markProgrammaticMapMove(900);
      map.animateToRegion(
        clampRegionToBahrain({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.022,
          longitudeDelta: 0.022,
        }),
        550,
      );
    },
    [markProgrammaticMapMove],
  );

  /** 3D orbit around a pin (heading sweep) — only used from `handlePlaceMarkerPress` when not generating a plan */
  const runMarkerShowcaseOrbitForMarker = useCallback(
    (mk, gen) => {
      const lat = Number(mk?.lat);
      const lng = Number(mk?.lng);
      const map = mapRef.current;
      if (!map || Number.isNaN(lat) || Number.isNaN(lng)) return;

      const center = { latitude: lat, longitude: lng };
      const schedule = (fn, delay) => {
        const id = setTimeout(() => {
          const box = markerShowcaseRef.current
          if (!box || !Array.isArray(box.timeoutIds)) return
          box.timeoutIds = box.timeoutIds.filter((x) => x !== id)
          if (box.generation !== gen) return
          fn();
        }, delay);
        const boxPush = markerShowcaseRef.current
        if (boxPush) {
          if (!Array.isArray(boxPush.timeoutIds)) boxPush.timeoutIds = []
          boxPush.timeoutIds.push(id)
        }
      };

      const runFallbackRegion = (latitudeDelta, duration) => {
        markProgrammaticMapMove(800);
        map.animateToRegion(
          clampRegionToBahrain({
            latitude: lat,
            longitude: lng,
            latitudeDelta,
            longitudeDelta: latitudeDelta,
          }),
          duration,
        );
      };

      if (typeof map.animateCamera !== 'function') {
        setIsMarkerShowcaseActive(true);
        runFallbackRegion(0.012, 520);
        return;
      }

      setIsMarkerShowcaseActive(true);

      markProgrammaticMapMove(520);
      map.animateCamera(
        Platform.OS === 'ios'
          ? { center, pitch: 0, heading: 0, altitude: 2600 }
          : { center, pitch: 0, heading: 0, zoom: 15.5 },
        { duration: 520 },
      );

      schedule(() => {
        const LEG_MS = 13500;
        const HEADINGS = [90, 180, 270, 360];
        markProgrammaticMapMove(HEADINGS.length * LEG_MS + 2200);
        map.animateCamera(
          Platform.OS === 'ios'
            ? { center, pitch: 52, heading: 0, altitude: 880 }
            : { center, pitch: 48, heading: 0, zoom: 18.5 },
          { duration: 780 },
        );

        schedule(() => {
          let leg = 0;
          const runLeg = () => {
            if (markerShowcaseRef.current.generation !== gen) return;
            if (leg >= HEADINGS.length) return;
            map.animateCamera(
              Platform.OS === 'ios'
                ? { center, pitch: 52, heading: HEADINGS[leg], altitude: 880 }
                : { center, pitch: 48, heading: HEADINGS[leg], zoom: 18.5 },
              { duration: LEG_MS },
            );
            leg += 1;
            if (leg < HEADINGS.length) {
              schedule(runLeg, LEG_MS);
            }
          };
          runLeg();
        }, 820);
      }, 560);
    },
    [markProgrammaticMapMove],
  );

  const sheetAnim = useRef(new Animated.Value(SNAP_POINTS[INITIAL_SNAP_INDEX])).current;
  const lastSnap = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const currentYRef = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const prefetchRef = useRef({
    prefsKey: null,
    personaKey: null,
    places: null,
    breakfastSpots: null,
    events: null,
  });
  const lastPrefLabelsRef = useRef([]);
  const lastFoodLabelsRef = useRef([]);

  // 0 = past plans, 1 = preferences, 2 = food, 3 = results
  const [drawerStep, setDrawerStep] = useState(0);
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [selectedFoodCategories, setSelectedFoodCategories] = useState([]);
  const [customPreferenceInput, setCustomPreferenceInput] = useState('');
  const [customFoodInput, setCustomFoodInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [dayPlan, setDayPlan] = useState(null);
  dayPlanRef.current = dayPlan;
  const [pineconeMatches, setPineconeMatches] = useState([]);
  const [visiblePinCount, setVisiblePinCount] = useState(0);
  const [revealingPins, setRevealingPins] = useState(false);
  const [surpriseSpinning, setSurpriseSpinning] = useState(false);
  const [surpriseIndex, setSurpriseIndex] = useState(0);
  const [surprisePicked, setSurprisePicked] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planModalStep, setPlanModalStep] = useState(1);
  /** 'menu' | 'quickKind' | 'quickSub' — build flow on plan sheet (step 0), not a modal */
  const [buildDayModalPhase, setBuildDayModalPhase] = useState('menu');
  /** 'place' | 'restaurant' | 'event' — quick find only */
  const [quickFindKind, setQuickFindKind] = useState(null);
  /** User chose “Custom plan”: empty itinerary + search to add stops manually */
  const [customPlanDraftActive, setCustomPlanDraftActive] = useState(false);
  /** Quick find: map-first single spot — no itinerary list, different loading copy */
  const [quickFindMapOnly, setQuickFindMapOnly] = useState(false);
  /** Opened from bottom bar Plan FAB — three build modes (+ quick find drill-down) */
  const [showBuildModePickerModal, setShowBuildModePickerModal] = useState(false);
  /** 'nearby' | 'balanced' | 'wide' — first plan modal step */
  const [travelExploreId, setTravelExploreId] = useState('balanced');
  const [doorVisible, setDoorVisible] = useState(false);
  const doorLeft = useRef(new Animated.Value(-SCREEN_WIDTH / 2)).current
  const doorRight = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current
  const doorIconScale = useRef(new Animated.Value(0)).current
  const doorIconOpacity = useRef(new Animated.Value(0)).current
  const doorFade = useRef(new Animated.Value(1)).current
  const skipOpenAnim = useRef(false)
  const [planGenerationSuccess, setPlanGenerationSuccess] = useState(false);

  useEffect(() => {
    if (drawerStep !== 0) return
    setBuildDayModalPhase('menu')
    setQuickFindKind(null)
  }, [drawerStep])

  const handlePlaceMarkerPress = useCallback(
    (mk) => {
      clearMarkerShowcase();
      setShowcaseMarkerMk(mk);
      const blockOrbit = loading || planGenerationSuccess || revealingPins;
      if (blockOrbit) {
        centerMapOnPlaceMarker(mk);
        return;
      }
      const gen = markerShowcaseRef.current.generation;
      runMarkerShowcaseOrbitForMarker(mk, gen);
    },
    [
      clearMarkerShowcase,
      centerMapOnPlaceMarker,
      runMarkerShowcaseOrbitForMarker,
      loading,
      planGenerationSuccess,
      revealingPins,
    ],
  );

  // Initialize with placeholder images immediately, then load real ones
  const [spotPreviews, setSpotPreviews] = useState(() => {
    // Create immediate placeholder data from common Bahrain imagery
    const placeholders = [
      { id: 'ph-1', name: 'Bahrain', type: 'place', image: ensureImageUrl('default-place-1.jpg') },
      { id: 'ph-2', name: 'Bahrain', type: 'restaurant', image: ensureImageUrl('default-food-1.jpg') },
      { id: 'ph-3', name: 'Bahrain', type: 'place', image: ensureImageUrl('default-place-2.jpg') },
    ];
    return placeholders;
  });
  const [profileClientId, setProfileClientId] = useState(null);
  const [stopDetailIndex, setStopDetailIndex] = useState(null);
  const stopDetailSwipeX = useSharedValue(0);
  const stopDetailSwipeRotate = useSharedValue(0);
  const stopDetailIndexSV = useSharedValue(0);
  const stopDetailSlidesLenSV = useSharedValue(0);
  const [openingMaps, setOpeningMaps] = useState(false);
  const [shareCopyHint, setShareCopyHint] = useState(false);
  const shareCopyHintTimerRef = useRef(null);
  const [allPlaceMarkers, setAllPlaceMarkers] = useState([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [addingPlanStop, setAddingPlanStop] = useState(false);
  const [searchModalClients, setSearchModalClients] = useState({ restaurants: [], places: [], events: [] });
  const [searchModalLoading, setSearchModalLoading] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const [enhancingIndex, setEnhancingIndex] = useState(null);
  const [visibleStopCount, setVisibleStopCount] = useState(0);
  const stopRevealTimers = useRef([]);

  const [savedPlansList, setSavedPlansList] = useState([]);
  const [savedPlansLoading, setSavedPlansLoading] = useState(false);
  const [activeSavedPlanId, setActiveSavedPlanId] = useState(null);
  /** null | { code: string, role: 'owner'|'viewer'|'editor', planId: string, ownerId: string } */
  const [sharedCollaboration, setSharedCollaboration] = useState(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeBusy, setJoinCodeBusy] = useState(false);
  const [showSharePlanModal, setShowSharePlanModal] = useState(false);
  const [sharePermissionDraft, setSharePermissionDraft] = useState('view');
  const [shareModalBusy, setShareModalBusy] = useState(false);
  const [shareModalCode, setShareModalCode] = useState(null);
  const [savePlanBusy, setSavePlanBusy] = useState(false);
  const [showEditSavedPlanTitleModal, setShowEditSavedPlanTitleModal] = useState(false);
  const [editSavedPlanTitleId, setEditSavedPlanTitleId] = useState(null);
  const [editSavedPlanTitleDraft, setEditSavedPlanTitleDraft] = useState('');
  const [editSavedPlanTitleBusy, setEditSavedPlanTitleBusy] = useState(false);

  const planReadOnly = sharedCollaboration != null && sharedCollaboration.role === 'viewer';
  const planCollaboratorEdit = sharedCollaboration != null && sharedCollaboration.role === 'editor';

  const STOP_REVEAL_STAGGER_MS = 120

  const clearStopRevealTimers = useCallback(() => {
    const timers = stopRevealTimers.current
    if (Array.isArray(timers)) timers.forEach(clearTimeout)
    stopRevealTimers.current = []
  }, [])

  /** Run after the plan sheet slides up / fades in — not on dayPlan or reorder. */
  const scheduleStaggeredStopReveal = useCallback((itemCount) => {
    clearStopRevealTimers()
    const n = Math.max(0, Math.floor(Number(itemCount)) || 0)
    if (n <= 0) {
      setVisibleStopCount(0)
      return
    }
    setVisibleStopCount(0)
    for (let idx = 0; idx < n; idx += 1) {
      const timer = setTimeout(() => {
        setVisibleStopCount((prev) => Math.max(prev, idx + 1))
      }, idx * STOP_REVEAL_STAGGER_MS)
      stopRevealTimers.current.push(timer)
    }
  }, [clearStopRevealTimers])

  useEffect(() => {
    if (!dayPlan?.length) {
      clearStopRevealTimers()
      setVisibleStopCount(0)
    }
  }, [dayPlan?.length, clearStopRevealTimers])

  useEffect(() => () => {
    const timers = stopRevealTimers.current
    if (Array.isArray(timers)) timers.forEach(clearTimeout)
    stopRevealTimers.current = []
  }, [])

  const handleOpenInGoogleMaps = useCallback(async () => {
    if (!dayPlan || openingMaps) return
    setOpeningMaps(true)
    try {
      await openAllStopsInGoogleMaps(dayPlan)
    } finally {
      setOpeningMaps(false)
    }
  }, [dayPlan, openingMaps])

  const closeStopDetailDialog = useCallback(() => {
    setStopDetailIndex(null);
  }, []);

  useEffect(() => {
    if (!dayPlan?.length) {
      setStopDetailIndex(null)
      return
    }
    setStopDetailIndex((prev) => {
      if (prev == null) return prev
      return Math.min(prev, dayPlan.length - 1)
    })
  }, [dayPlan]);

  const stopDetailSlides = useMemo(() => {
    if (!Array.isArray(dayPlan) || dayPlan.length === 0) return []
    return dayPlan.map((item, planIndex) => {
      const isEat = item.type === 'restaurant'
      const isEvent = item.type === 'event'
      const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : colors.morning
      const images = pickPlanStopGalleryUris(item, allPlaceMarkers)
      return {
        item,
        planIndex,
        accent,
        isEat,
        isEvent,
        hasImages: !!images[0],
        images,
        hasProfile: !!item.clientId,
        category: getLuxuryCategoryStyle(item),
      }
    })
  }, [allPlaceMarkers, dayPlan])

  const stopDetailPayload = useMemo(() => {
    if (stopDetailIndex == null) return null
    return stopDetailSlides[stopDetailIndex] || null
  }, [stopDetailSlides, stopDetailIndex])

  const stopDetailStackPeekNext = useMemo(() => {
    if (stopDetailIndex == null) return null
    return stopDetailSlides[stopDetailIndex + 1] || null
  }, [stopDetailIndex, stopDetailSlides])

  const goToStopDetailIndex = useCallback((nextIndex) => {
    if (!stopDetailSlides.length) return
    const clamped = Math.max(0, Math.min(nextIndex, stopDetailSlides.length - 1))
    setStopDetailIndex(clamped)
  }, [stopDetailSlides.length])

  useEffect(() => {
    stopDetailIndexSV.value = stopDetailIndex ?? 0
  }, [stopDetailIndex, stopDetailIndexSV])

  useEffect(() => {
    stopDetailSlidesLenSV.value = stopDetailSlides.length
  }, [stopDetailSlides.length, stopDetailSlidesLenSV])

  useEffect(() => {
    stopDetailSwipeX.value = 0
    stopDetailSwipeRotate.value = 0
  }, [stopDetailIndex, stopDetailSwipeRotate, stopDetailSwipeX])

  const stopDetailCardAnimatedStyle = useAnimatedStyle(() => {
    'worklet'
    const tx = stopDetailSwipeX.value
    const abs = Math.abs(tx)
    const lift = abs * 0.022
    const scale = 1 - Math.min(abs / 980, 0.038)
    const opacity = 1 - Math.min(abs / 1400, 0.07)
    return {
      opacity,
      transform: [
        { translateX: tx },
        { translateY: -lift },
        { rotate: `${stopDetailSwipeRotate.value}deg` },
        { scale },
      ],
    }
  })

  const stopDetailPeekAnimatedStyle = useAnimatedStyle(() => {
    'worklet'
    const tx = stopDetailSwipeX.value
    const idx = stopDetailIndexSV.value
    const len = stopDetailSlidesLenSV.value
    let progress = 0
    if (tx < 0 && len > 0 && idx < len - 1) {
      progress = Math.min(Math.abs(tx) / STOP_DETAIL_SWIPE_PEEK_RANGE, 1)
    } else if (tx > 0 && idx > 0) {
      progress = Math.min(tx / (STOP_DETAIL_SWIPE_PEEK_RANGE * 1.1), 1) * 0.35
    }
    const scale = 0.93 + progress * 0.075
    const translateY = 4 - progress * 3
    const opacity = 0.9 + progress * 0.1
    return {
      opacity,
      transform: [{ scale }, { translateY }],
    }
  })

  const handleStopDetailSwipeNext = useCallback(() => {
    setStopDetailIndex((prev) => {
      const n = stopDetailSlides.length
      if (n <= 0 || prev == null) return prev
      return Math.min(prev + 1, n - 1)
    })
    stopDetailSwipeX.value = 0
    stopDetailSwipeRotate.value = 0
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  }, [stopDetailSlides.length, stopDetailSwipeRotate, stopDetailSwipeX])

  const handleStopDetailSwipePrev = useCallback(() => {
    setStopDetailIndex((prev) => {
      if (prev == null) return prev
      return Math.max(prev - 1, 0)
    })
    stopDetailSwipeX.value = 0
    stopDetailSwipeRotate.value = 0
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  }, [stopDetailSwipeRotate, stopDetailSwipeX])

  const stopDetailPanGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      'worklet'
      const tx = e.translationX
      const idx = stopDetailIndexSV.value
      const len = stopDetailSlidesLenSV.value
      let damp = tx
      if (idx <= 0 && tx > 0) damp = tx * 0.28
      if (len > 0 && idx >= len - 1 && tx < 0) damp = tx * 0.28
      stopDetailSwipeX.value = damp
      stopDetailSwipeRotate.value = (damp / 235) * 8.2
    })
    .onEnd((e) => {
      'worklet'
      const tx = stopDetailSwipeX.value
      const vx = e.velocityX
      const idx = stopDetailIndexSV.value
      const len = stopDetailSlidesLenSV.value
      const threshold = 64
      const shouldNext = (tx < -threshold || vx < -460) && len > 0 && idx < len - 1
      const shouldPrev = (tx > threshold || vx > 460) && idx > 0
      const rotVel = (vx / 235) * 8.2
      if (shouldNext) {
        stopDetailSwipeX.value = withSpring(
          -STOP_DETAIL_EXIT_X,
          { ...STOP_DETAIL_SWIPE_COMMIT, velocity: vx },
          (finished) => {
            if (finished) runOnJS(handleStopDetailSwipeNext)()
          }
        )
      } else if (shouldPrev) {
        stopDetailSwipeX.value = withSpring(
          STOP_DETAIL_EXIT_X,
          { ...STOP_DETAIL_SWIPE_COMMIT, velocity: vx },
          (finished) => {
            if (finished) runOnJS(handleStopDetailSwipePrev)()
          }
        )
      } else {
        stopDetailSwipeX.value = withSpring(0, { ...STOP_DETAIL_SWIPE_SNAP_BACK, velocity: vx })
        stopDetailSwipeRotate.value = withSpring(0, { ...STOP_DETAIL_SWIPE_SNAP_BACK, velocity: rotVel })
      }
    }), [handleStopDetailSwipeNext, handleStopDetailSwipePrev, stopDetailSwipeRotate, stopDetailSwipeX, stopDetailIndexSV, stopDetailSlidesLenSV])

  // Plan modal animations (match Home AI overlay)
  const planModalBackdrop = useRef(new Animated.Value(0)).current;
  const planModalScale = useRef(new Animated.Value(0.92)).current;
  const planModalOpacity = useRef(new Animated.Value(0)).current;
  const sheetOpacity = useRef(new Animated.Value(1)).current;

  // Fetch all clients when search modal opens — grouped by restaurants, places, events
  useEffect(() => {
    if (!showSearchModal) return;
    let cancelled = false;
    setSearchModalLoading(true);
    (async () => {
      try {
        const { data: rows, error } = await supabase.from('client').select('*');
        if (cancelled) return;
        if (error || !Array.isArray(rows) || rows.length === 0) {
          setSearchModalClients({ restaurants: [], places: [], events: [] });
          return;
        }
        const restaurants = [];
        const places = [];
        const events = [];
        rows.forEach((c) => {
          const ct = ((c.client_type || '').toLowerCase());
          const item = {
            ...c,
            clientId: c.client_a_uuid,
            name: (c.business_name || c.name || c.business_name_ar || 'Spot').trim(),
          };
          if (ct === 'restaurant') restaurants.push(item);
          else if (ct === 'event') events.push(item);
          else places.push(item);
        });
        if (!cancelled) setSearchModalClients({ restaurants, places, events });
      } catch (e) {
        if (!cancelled) setSearchModalClients({ restaurants: [], places: [], events: [] });
      } finally {
        if (!cancelled) setSearchModalLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showSearchModal]);

  useEffect(() => {
    if (!showSearchModal) setSearchModalQuery('');
  }, [showSearchModal]);

  // Fetch all clients with coordinates for pre-plan map markers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clients = await fetchClientsWithLocation();
        if (cancelled) return;
        const markers = clients.map((c, idx) => {
          const lat = parseFloat(c.lat ?? c.latitude ?? '');
          const lng = parseFloat(c.lng ?? c.long ?? c.longitude ?? '');
          if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
          const image = resolvePublicImageUrl(c.client_image);
          const spot = (c.business_name || c.name || 'Place').trim();
          const ct = ((c.client_type || '').toLowerCase());
          const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place';
          const reasonRaw = (c.description || c.bio || c.about || '').trim();
          const aiSummary = String(c.ai_summary || c.summary || '').trim();
          return {
            idx,
            spot,
            type,
            client_type: c.client_type ?? null,
            reason: reasonRaw || undefined,
            ai_summary: aiSummary || undefined,
            lat,
            lng,
            image,
            clientId: c.client_a_uuid,
          };
        }).filter(Boolean);
        setAllPlaceMarkers(markers);
      } catch (e) {
        if (!cancelled) console.warn('[AIPlan] fetch clients for map:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshSavedPlans = useCallback(async () => {
    setSavedPlansLoading(true);
    try {
      const rows = await listSavedPlans();
      setSavedPlansList(rows);
    } catch (e) {
      console.warn('[AI Plan] listSavedPlans', e?.message);
    } finally {
      setSavedPlansLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSavedPlans();

      let cancelled = false;

      const centerOnUserIfNoPlan = (lat, lng) => {
        if (dayPlanRef.current?.length) return;
        if (!mapRef.current) return;
        markProgrammaticMapMove(500);
        mapRef.current.animateToRegion(
          clampRegionToBahrain({
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }),
          450,
        );
      };

      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled || status !== 'granted') return;

          const { coords } = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (cancelled) return;
          userLocationRef.current = { latitude: coords.latitude, longitude: coords.longitude };
          if (!hasInitialUserCenterRef.current && !dayPlanRef.current?.length) {
            hasInitialUserCenterRef.current = true;
            centerOnUserIfNoPlan(coords.latitude, coords.longitude);
          }

          const watchSub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 25,
            },
            (loc) => {
              userLocationRef.current = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              };
            },
          );
          if (cancelled) {
            watchSub.remove();
            return;
          }
          locationWatchRef.current = watchSub;
        } catch (e) {
          console.warn('[AIPlan] location watch:', e?.message);
        }
      })();

      return () => {
        cancelled = true;
        locationWatchRef.current?.remove();
        locationWatchRef.current = null;
      };
    }, [refreshSavedPlans]),
  );

  /** Fresh GPS for plan catalog ordering; travel tiers only work fully when this succeeds. */
  const resolveOriginCoordsForPlanGeneration = useCallback(async (opts = {}) => {
    const { preferFreshFix = true } = opts
    if (preferFreshFix) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const { coords } = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          })
          const lat = coords.latitude
          const lng = coords.longitude
          userLocationRef.current = { latitude: lat, longitude: lng }
          return { originLat: lat, originLng: lng }
        }
      } catch {
        /* fall back */
      }
    }
    let originLat = userLocationRef.current?.latitude
    let originLng = userLocationRef.current?.longitude
    if (
      originLat != null &&
      originLng != null &&
      !Number.isNaN(originLat) &&
      !Number.isNaN(originLng)
    ) {
      return { originLat, originLng }
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return { originLat: null, originLng: null }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      userLocationRef.current = { latitude: coords.latitude, longitude: coords.longitude }
      return { originLat: coords.latitude, originLng: coords.longitude }
    } catch {
      return { originLat: null, originLng: null }
    }
  }, [])

  return { colors, isDark, preferences, generalLabels, activityLabels, savedProfileFoodLabels, user, insets, route, navigation, mapRegion, setMapRegion, isMarkerShowcaseActive, setIsMarkerShowcaseActive, showcaseMarkerMk, setShowcaseMarkerMk, showcaseMorphAnchor, setShowcaseMorphAnchor, showcaseOrbitPostUris, activePlanMapClientFilter, setActivePlanMapClientFilter, drawerStep, setDrawerStep, selectedPreferences, setSelectedPreferences, selectedFoodCategories, setSelectedFoodCategories, customPreferenceInput, setCustomPreferenceInput, customFoodInput, setCustomFoodInput, loading, setLoading, loadingStatus, setLoadingStatus, error, setError, dayPlan, setDayPlan, pineconeMatches, setPineconeMatches, visiblePinCount, setVisiblePinCount, revealingPins, setRevealingPins, surpriseSpinning, setSurpriseSpinning, surpriseIndex, setSurpriseIndex, surprisePicked, setSurprisePicked, showPlanModal, setShowPlanModal, planModalStep, setPlanModalStep, buildDayModalPhase, setBuildDayModalPhase, quickFindKind, setQuickFindKind, customPlanDraftActive, setCustomPlanDraftActive, quickFindMapOnly, setQuickFindMapOnly, showBuildModePickerModal, setShowBuildModePickerModal, travelExploreId, setTravelExploreId, doorVisible, setDoorVisible, planGenerationSuccess, setPlanGenerationSuccess, spotPreviews, setSpotPreviews, profileClientId, setProfileClientId, stopDetailIndex, setStopDetailIndex, openingMaps, setOpeningMaps, shareCopyHint, setShareCopyHint, allPlaceMarkers, setAllPlaceMarkers, showSearchModal, setShowSearchModal, addingPlanStop, setAddingPlanStop, searchModalClients, setSearchModalClients, searchModalLoading, setSearchModalLoading, searchModalQuery, setSearchModalQuery, enhancingIndex, setEnhancingIndex, visibleStopCount, setVisibleStopCount, savedPlansList, setSavedPlansList, savedPlansLoading, setSavedPlansLoading, activeSavedPlanId, setActiveSavedPlanId, sharedCollaboration, setSharedCollaboration, joinCodeInput, setJoinCodeInput, joinCodeBusy, setJoinCodeBusy, showSharePlanModal, setShowSharePlanModal, sharePermissionDraft, setSharePermissionDraft, shareModalBusy, setShareModalBusy, shareModalCode, setShareModalCode, savePlanBusy, setSavePlanBusy, showEditSavedPlanTitleModal, setShowEditSavedPlanTitleModal, editSavedPlanTitleId, setEditSavedPlanTitleId, editSavedPlanTitleDraft, setEditSavedPlanTitleDraft, editSavedPlanTitleBusy, setEditSavedPlanTitleBusy, mapRef, userLocationRef, dayPlanRef, locationWatchRef, mapProgrammaticMoveRef, mapProgrammaticMoveClearTimerRef, hasInitialUserCenterRef, markerShowcaseRef, orbitSheetExtraTranslateY, sheetAnim, lastSnap, currentYRef, prefetchRef, lastPrefLabelsRef, lastFoodLabelsRef, doorLeft, doorRight, doorIconScale, doorIconOpacity, doorFade, skipOpenAnim, shareCopyHintTimerRef, stopRevealTimers, planModalBackdrop, planModalScale, planModalOpacity, sheetOpacity, stopDetailSwipeX, stopDetailSwipeRotate, stopDetailIndexSV, stopDetailSlidesLenSV, communityPalette, stopDetailSlides, stopDetailPayload, stopDetailStackPeekNext, stopDetailPanGesture, handlePlanMapClientFilterPress, markProgrammaticMapMove, clearMarkerShowcaseTimers, clearMarkerShowcase, exitMarkerShowcase, handleMapPress, centerMapOnPlaceMarker, runMarkerShowcaseOrbitForMarker, handlePlaceMarkerPress, clearStopRevealTimers, scheduleStaggeredStopReveal, handleOpenInGoogleMaps, closeStopDetailDialog, goToStopDetailIndex, handleStopDetailSwipeNext, handleStopDetailSwipePrev, refreshSavedPlans, resolveOriginCoordsForPlanGeneration, planReadOnly, planCollaboratorEdit, STOP_REVEAL_STAGGER_MS, stopDetailCardAnimatedStyle, stopDetailPeekAnimatedStyle }
}
