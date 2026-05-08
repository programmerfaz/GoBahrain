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
  fetchPlanSearchPineconeBuckets,
  normalizeViewerUType,
} from '../../services/aiPipeline'
import {
  blobFromRestaurantClientRow,
  blobFromPlaceRow,
  blobFromEventRow,
  mergeGroupedSearchResults,
} from './planCatalogSearchHelpers'
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
  const { user, profile } = useAuth();
  const viewerUType = useMemo(() => normalizeViewerUType(profile?.user?.u_type), [profile?.user?.u_type])

  const mapRef = useRef(null);
  /** Latest GPS fix for map fitting and native user dot (`showsUserLocation`) */
  const userLocationRef = useRef(null);
  const [userLocation, setUserLocation] = useState(null)
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
  /** Search-focused client id: limits map pins to this client (plus branch markers under same clientId). */
  const [focusedMapClientId, setFocusedMapClientId] = useState(null);

  const handlePlanMapClientFilterPress = useCallback((id) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePlanMapClientFilter(id);
    if (id === 'all') setFocusedMapClientId(null)
  }, []);

  const markerMatchesFocusedClient = useCallback((mk) => {
    if (!focusedMapClientId) return true
    return !!mk && mk.clientId === focusedMapClientId
  }, [focusedMapClientId])

  const parseBranchPayload = useCallback((raw) => {
    const BOUNDS = { minLat: 25.55, maxLat: 26.4, minLng: 50.3, maxLng: 50.95 }
    const inBahrain = (lat, lng) =>
      lat >= BOUNDS.minLat &&
      lat <= BOUNDS.maxLat &&
      lng >= BOUNDS.minLng &&
      lng <= BOUNDS.maxLng
    const normalize = (latRaw, lngRaw) => {
      const la = parseFloat(latRaw)
      const ln = parseFloat(lngRaw)
      if (Number.isNaN(la) || Number.isNaN(ln) || (la === 0 && ln === 0)) return null
      if (inBahrain(la, ln)) return { lat: la, lng: ln }
      if (inBahrain(ln, la)) return { lat: ln, lng: la }
      return null
    }
    if (!raw) return []
    let parsed = raw
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        return []
      }
    }
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? Object.values(parsed)
        : []
    return rows
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const coords = normalize(
          entry.lat ?? entry.latitude ?? '',
          entry.long ?? entry.lng ?? entry.longitude ?? ''
        )
        if (!coords) return null
        return {
          lat: coords.lat,
          lng: coords.lng,
          areaName: String(entry.area_name || entry.branch_name || entry.name || '').trim(),
        }
      })
      .filter(Boolean)
  }, [])

  const handleFocusClientFromSearch = useCallback(async (client) => {
    const selectedClientId = client?.client_a_uuid || client?.clientId || null
    setFocusedMapClientId(selectedClientId)
    setActivePlanMapClientFilter('all')
    setShowSearchModal(false)
    if (!selectedClientId) return

    const isRestaurant = String(client?.client_type || '').toLowerCase().trim() === 'restaurant'
    if (!isRestaurant) return

    try {
      let restRow = null
      const { data, error } = await supabase
        .from('restaurant_client')
        .select('branch, branches')
        .eq('a_uuid', selectedClientId)
        .maybeSingle()
      if (error) {
        const { data: fallback, error: fallbackErr } = await supabase
          .from('restaurant_client')
          .select('*')
          .eq('a_uuid', selectedClientId)
          .maybeSingle()
        if (fallbackErr) {
          console.warn('[AIPlan] restaurant_client branch fetch failed:', fallbackErr?.message)
          Alert.alert(
            'Branch markers error',
            fallbackErr?.message || 'Could not read restaurant branches from restaurant_client table.'
          )
          return
        }
        restRow = fallback || null
      } else {
        restRow = data || null
      }
      const branchPayload = restRow?.branches ?? restRow?.branch ?? null
      const branchCoords = parseBranchPayload(branchPayload)
      if (!branchCoords.length) {
        Alert.alert(
          'No branch markers found',
          'This restaurant has no readable branch coordinates in restaurant_client.branch(es).'
        )
        return
      }

      setAllPlaceMarkers((prev) => {
        const next = Array.isArray(prev) ? [...prev] : []
        const seen = new Set(
          next
            .filter((mk) => mk && mk.clientId === selectedClientId)
            .map((mk) => `${Number(mk.lat).toFixed(6)},${Number(mk.lng).toFixed(6)}`)
        )
        let idxSeed = next.length
        for (const branch of branchCoords) {
          const key = `${Number(branch.lat).toFixed(6)},${Number(branch.lng).toFixed(6)}`
          if (seen.has(key)) continue
          seen.add(key)
          idxSeed += 1
          next.push({
            idx: idxSeed,
            spot: branch.areaName
              ? `${String(client?.business_name || client?.name || 'Place').trim()} - ${branch.areaName}`
              : String(client?.business_name || client?.name || 'Place').trim(),
            type: 'restaurant',
            client_type: client?.client_type ?? 'restaurant',
            lat: branch.lat,
            lng: branch.lng,
            image: resolvePublicImageUrl(client?.client_image),
            clientId: selectedClientId,
            branch_name: branch.areaName || null,
          })
        }
        return next
      })
    } catch (e) {
      console.warn('[AIPlan] focused restaurant branch fetch failed:', e?.message)
      Alert.alert(
        'Branch markers error',
        e?.message || 'Could not load branch markers for this restaurant.'
      )
    }
  }, [parseBranchPayload])

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
  /** 0 = sheet fully expanded (top snap); 2 = peek */
  const [planSheetSnapIndex, setPlanSheetSnapIndex] = useState(INITIAL_SNAP_INDEX);
  const prefetchRef = useRef({
    prefsKey: null,
    warmupKey: null,
    places: null,
    breakfastSpots: null,
    events: null,
  });
  const lastPrefLabelsRef = useRef([]);
  const lastFoodLabelsRef = useRef([]);

  // 0 = past plans, 1 = preferences, 2 = food, 3 = results
  const [drawerStep, setDrawerStep] = useState(0);
  /** Incremented when returning from plan results (step 3 → 0) so the Build CTA can pulse */
  const [buildDayCtaAttentionKey, setBuildDayCtaAttentionKey] = useState(0);
  const prevDrawerStepForCtaRef = useRef(drawerStep);
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
  /** Last successful quick find — enables “Search again” for same vibe */
  const [quickFindLastKind, setQuickFindLastKind] = useState(null);
  const [quickFindLastLabel, setQuickFindLastLabel] = useState('');
  /** Fingerprints accumulated so repeat searches skip prior pins */
  const [quickFindExcludedFingerprints, setQuickFindExcludedFingerprints] = useState([]);
  /** Last shown result’s ids — merged into excluded on “Search again” */
  const [quickFindLastChosenFingerprints, setQuickFindLastChosenFingerprints] = useState([]);

  /** Call when exiting quick find for real (back dismiss, AI plan, custom plan…). Never on map taps that only close orbit showcase. */
  const resetQuickFindRotationState = useCallback(() => {
    setQuickFindLastKind(null);
    setQuickFindLastLabel('');
    setQuickFindExcludedFingerprints([]);
    setQuickFindLastChosenFingerprints([]);
  }, []);
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

  useEffect(() => {
    if (prevDrawerStepForCtaRef.current === 3 && drawerStep === 0) {
      setBuildDayCtaAttentionKey((n) => n + 1)
    }
    prevDrawerStepForCtaRef.current = drawerStep
  }, [drawerStep])

  const handlePlaceMarkerPress = useCallback(
    (mk, orbitOptions = {}) => {
      clearMarkerShowcase();
      setShowcaseMarkerMk(mk);
      const skipLoadGuard = orbitOptions?.skipLoadGuard === true;
      const blockOrbit =
        !skipLoadGuard && (loading || planGenerationSuccess || revealingPins);
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
  const [allPlaceMarkersLoading, setAllPlaceMarkersLoading] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [addingPlanStop, setAddingPlanStop] = useState(false);
  const [searchModalClients, setSearchModalClients] = useState({ restaurants: [], places: [], events: [] });
  const [searchModalLoading, setSearchModalLoading] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const [searchModalSemanticBuckets, setSearchModalSemanticBuckets] = useState({
    places: [],
    restaurants: [],
    events: [],
  })
  const [searchModalSemanticSearching, setSearchModalSemanticSearching] = useState(false)
  const [searchModalCatalogFilter, setSearchModalCatalogFilter] = useState('all')
  const searchSemanticRequestRef = useRef(0)

  const searchModalDisplayClients = useMemo(
    () =>
      mergeGroupedSearchResults({
        groupedClients: searchModalClients,
        queryTrimmed: (searchModalQuery || '').trim(),
        semanticBuckets: searchModalSemanticBuckets,
        useSemanticMerge:
          (searchModalQuery || '').trim().length >= 2 && !searchModalSemanticSearching,
      }),
    [
      searchModalClients,
      searchModalQuery,
      searchModalSemanticBuckets,
      searchModalSemanticSearching,
    ],
  )
  const [enhancingIndex, setEnhancingIndex] = useState(null);
  const [visibleStopCount, setVisibleStopCount] = useState(0);
  const stopRevealTimers = useRef([]);

  const exitMarkerShowcase = useCallback(() => {
    clearMarkerShowcaseTimers();
    /** Prefer the pin’s coordinates over `mapRegion` center when resetting the camera */
    const pinLat = showcaseMarkerMk != null ? Number(showcaseMarkerMk.lat) : NaN;
    const pinLng = showcaseMarkerMk != null ? Number(showcaseMarkerMk.lng) : NaN;
    const hasPin = Number.isFinite(pinLat) && Number.isFinite(pinLng);
    /** Quick search pins the itinerary to one row — exiting orbit must clear it or only that pin stays rendered */
    if (quickFindMapOnly) {
      setDayPlan(null);
      setQuickFindMapOnly(false);
      setStopDetailIndex(null);
      setPineconeMatches([]);
      setVisibleStopCount(0);
      setRevealingPins(false);
      setVisiblePinCount(0);
      setDrawerStep(0);
      setError(null);
    }
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
  }, [
    quickFindMapOnly,
    mapRegion,
    showcaseMarkerMk,
    markProgrammaticMapMove,
    clearMarkerShowcaseTimers,
  ]);

  const handleMapPress = useCallback(() => {
    if (!isMarkerShowcaseActive) return;
    exitMarkerShowcase();
  }, [isMarkerShowcaseActive, exitMarkerShowcase]);

  useEffect(() => {
    if (!focusedMapClientId) return
    const map = mapRef.current
    if (!map) return
    const focusedMarkers = (allPlaceMarkers || []).filter((mk) => {
      if (!mk || mk.clientId !== focusedMapClientId) return false
      const lat = Number(mk.lat)
      const lng = Number(mk.lng)
      return Number.isFinite(lat) && Number.isFinite(lng)
    })
    if (!focusedMarkers.length) return

    const lats = focusedMarkers.map((mk) => Number(mk.lat))
    const lngs = focusedMarkers.map((mk) => Number(mk.lng))
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    const centerLat = (minLat + maxLat) / 2
    const centerLng = (minLng + maxLng) / 2
    const latSpread = Math.max(0.018, (maxLat - minLat) * 1.8)
    const lngSpread = Math.max(0.018, (maxLng - minLng) * 1.8)

    markProgrammaticMapMove(1000)
    map.animateToRegion(
      clampRegionToBahrain({
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: latSpread,
        longitudeDelta: lngSpread,
      }),
      700,
    )
  }, [focusedMapClientId, allPlaceMarkers, markProgrammaticMapMove])

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

  // Fetch all clients when search modal opens — grouped + joined restaurant_client / place / events for search blobs
  useEffect(() => {
    if (!showSearchModal) return
    let cancelled = false
    setSearchModalLoading(true)

    const chunkUuidList = (list, chunkSize = 80) => {
      const uniq = [...new Set((list || []).map((x) => String(x ?? '').trim()).filter(Boolean))]
      const chunks = []
      for (let i = 0; i < uniq.length; i += chunkSize) chunks.push(uniq.slice(i, i + chunkSize))
      return chunks
    }

    const appendSearchBlob = (map, rawKey, blob) => {
      const chunk = typeof blob === 'string' ? blob.trim() : ''
      if (!chunk) return
      const key = String(rawKey ?? '').trim()
      if (!key) return
      const cur = map[key]
      map[key] = cur ? `${cur} ${chunk}` : chunk
    }

    void (async () => {
      try {
        const { data: rows, error } = await supabase.from('client').select('*')
        if (cancelled) return
        if (error || !Array.isArray(rows) || rows.length === 0) {
          setSearchModalClients({ restaurants: [], places: [], events: [] })
          return
        }
        const restaurants = []
        const places = []
        const eventsList = []
        rows.forEach((c) => {
          const ct = String(c.client_type || '').toLowerCase()
          const item = {
            ...c,
            clientId: c.client_a_uuid,
            name: (c.business_name || c.name || c.business_name_ar || 'Spot').trim(),
          }
          if (ct === 'restaurant') restaurants.push(item)
          else if (ct === 'event') eventsList.push(item)
          else places.push(item)
        })

        const restaurantIds = restaurants.map((r) => r.client_a_uuid || r.clientId).filter(Boolean)
        const placeIds = places.map((p) => p.client_a_uuid || p.clientId).filter(Boolean)
        const eventClientIds = eventsList.map((e) => e.client_a_uuid || e.clientId).filter(Boolean)
        const eventRowUuids = eventsList.map((e) => e.event_uuid).filter(Boolean)

        const rcByUuid = {}
        try {
          for (const chunk of chunkUuidList(restaurantIds)) {
            if (cancelled) return
            const { data: rcRows, error: rcErr } = await supabase
              .from('restaurant_client')
              .select('a_uuid, cuisine, meal_type, food_type, speciality, isfoodtruck, branch')
              .in('a_uuid', chunk)
            if (rcErr) {
              console.warn('[AIPlan] restaurant_client search join:', rcErr.message)
              break
            }
            for (const row of rcRows || []) {
              const id = row?.a_uuid != null ? String(row.a_uuid) : null
              if (id) rcByUuid[id] = row
            }
          }
        } catch (e) {
          console.warn('[AIPlan] restaurant_client join failed:', e?.message)
        }

        const placeBlobByClient = {}
        try {
          for (const chunk of chunkUuidList(placeIds)) {
            if (cancelled) return
            const { data: placeRows, error: pErr } = await supabase
              .from('place')
              .select(
                'client_uuid, name, description, suitable_for, category, indoor_outdoor, entry_cost, opening_time, closing_time',
              )
              .in('client_uuid', chunk)
            if (pErr) {
              console.warn('[AIPlan] place search join:', pErr.message)
              break
            }
            for (const row of placeRows || []) {
              const cid = row?.client_uuid != null ? String(row.client_uuid) : ''
              if (!cid) continue
              appendSearchBlob(placeBlobByClient, cid, blobFromPlaceRow(row))
            }
          }
        } catch (e) {
          console.warn('[AIPlan] place join failed:', e?.message)
        }

        const eventsBlobByClient = {}
        const eventsBlobByEventUuid = {}
        try {
          for (const chunk of chunkUuidList(eventClientIds)) {
            if (cancelled) return
            const { data: evRows, error: evErr } = await supabase
              .from('events')
              .select(
                'event_uuid, client_a_uuid, event_name, venue, event_type, indoor_outdoor, status, start_date, end_date, start_time, end_time',
              )
              .in('client_a_uuid', chunk)
            if (evErr) {
              console.warn('[AIPlan] events search join (client_a_uuid):', evErr.message)
              break
            }
            for (const row of evRows || []) {
              const b = blobFromEventRow(row)
              const cid = row?.client_a_uuid != null ? String(row.client_a_uuid) : ''
              if (cid) appendSearchBlob(eventsBlobByClient, cid, b)
              const eid = row?.event_uuid != null ? String(row.event_uuid) : ''
              if (eid) appendSearchBlob(eventsBlobByEventUuid, eid, b)
            }
          }
          for (const chunk of chunkUuidList(eventRowUuids)) {
            if (cancelled) return
            const { data: evRows2, error: ev2Err } = await supabase
              .from('events')
              .select(
                'event_uuid, client_a_uuid, event_name, venue, event_type, indoor_outdoor, status, start_date, end_date, start_time, end_time',
              )
              .in('event_uuid', chunk)
            if (ev2Err) {
              console.warn('[AIPlan] events search join (event_uuid):', ev2Err.message)
              break
            }
            for (const row of evRows2 || []) {
              const b = blobFromEventRow(row)
              const cid = row?.client_a_uuid != null ? String(row.client_a_uuid) : ''
              if (cid) appendSearchBlob(eventsBlobByClient, cid, b)
              const eid = row?.event_uuid != null ? String(row.event_uuid) : ''
              if (eid) appendSearchBlob(eventsBlobByEventUuid, eid, b)
            }
          }
        } catch (e) {
          console.warn('[AIPlan] events join failed:', e?.message)
        }

        const eventSearchBlobForItem = (item) => {
          const cid = String(item.client_a_uuid || item.clientId || '').trim()
          const blobs = []
          if (cid && eventsBlobByClient[cid]) blobs.push(eventsBlobByClient[cid])
          const eu = item.event_uuid != null ? String(item.event_uuid) : ''
          if (eu && eventsBlobByEventUuid[eu]) blobs.push(eventsBlobByEventUuid[eu])
          return blobs.filter(Boolean).join(' ')
        }

        const enrichedRestaurants = restaurants.map((item) => {
          const cid = String(item.client_a_uuid || item.clientId || '')
          const rc = cid ? rcByUuid[cid] : null
          return {
            ...item,
            _planSearchRestaurantBlob: rc ? blobFromRestaurantClientRow(rc) : '',
            _planSearchPlaceBlob: '',
            _planSearchEventsBlob: '',
          }
        })

        const enrichedPlaces = places.map((item) => {
          const cid = String(item.client_a_uuid || item.clientId || '')
          return {
            ...item,
            _planSearchRestaurantBlob: '',
            _planSearchPlaceBlob: cid ? placeBlobByClient[cid] || '' : '',
            _planSearchEventsBlob: '',
          }
        })

        const enrichedEvents = eventsList.map((item) => ({
          ...item,
          _planSearchRestaurantBlob: '',
          _planSearchPlaceBlob: '',
          _planSearchEventsBlob: eventSearchBlobForItem(item),
        }))

        if (!cancelled) {
          setSearchModalClients({
            restaurants: enrichedRestaurants,
            places: enrichedPlaces,
            events: enrichedEvents,
          })
        }
      } catch (e) {
        if (!cancelled) setSearchModalClients({ restaurants: [], places: [], events: [] })
      } finally {
        if (!cancelled) setSearchModalLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showSearchModal])

  useEffect(() => {
    if (!showSearchModal) {
      setSearchModalQuery('')
      setSearchModalSemanticBuckets({ places: [], restaurants: [], events: [] })
      setSearchModalSemanticSearching(false)
      setSearchModalCatalogFilter('all')
      searchSemanticRequestRef.current += 1
    }
  }, [showSearchModal])

  useEffect(() => {
    if (!showSearchModal || searchModalLoading) return
    const q = (searchModalQuery || '').trim()
    if (q.length < 2) {
      searchSemanticRequestRef.current += 1
      setSearchModalSemanticBuckets({ places: [], restaurants: [], events: [] })
      setSearchModalSemanticSearching(false)
      return
    }
    setSearchModalSemanticSearching(true)
    const seq = ++searchSemanticRequestRef.current
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchPlanSearchPineconeBuckets(q)
          if (seq !== searchSemanticRequestRef.current) return
          setSearchModalSemanticBuckets({
            places: result.places || [],
            restaurants: result.restaurants || [],
            events: result.events || [],
          })
        } finally {
          if (seq === searchSemanticRequestRef.current) {
            setSearchModalSemanticSearching(false)
          }
        }
      })()
    }, 420)
    return () => clearTimeout(timer)
  }, [showSearchModal, searchModalLoading, searchModalQuery])

  // Fetch all clients with coordinates for pre-plan map markers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAllPlaceMarkersLoading(true)
      try {
        const clients = await fetchClientsWithLocation();
        if (cancelled) return;
        const markers = clients.map((c, idx) => {
          const lat = parseFloat(c.lat ?? c.latitude ?? '');
          const lng = parseFloat(c.lng ?? c.long ?? c.longitude ?? '');
          if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
          const image = resolvePublicImageUrl(c.client_image);
          const baseSpot = (c.business_name || c.name || 'Place').trim();
          const branchSuffix = String(c.branch_name || '').trim();
          const spot = branchSuffix ? `${baseSpot} - ${branchSuffix}` : baseSpot;
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
      } finally {
        if (!cancelled) setAllPlaceMarkersLoading(false)
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
          setUserLocation({ latitude: coords.latitude, longitude: coords.longitude })
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
              setUserLocation({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              })
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
          setUserLocation({ latitude: lat, longitude: lng })
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
      setUserLocation({ latitude: coords.latitude, longitude: coords.longitude })
      return { originLat: coords.latitude, originLng: coords.longitude }
    } catch {
      return { originLat: null, originLng: null }
    }
  }, [])

  return { colors, isDark, preferences, generalLabels, activityLabels, savedProfileFoodLabels, user, viewerUType, insets, route, navigation, mapRegion, setMapRegion, isMarkerShowcaseActive, setIsMarkerShowcaseActive, showcaseMarkerMk, setShowcaseMarkerMk, showcaseMorphAnchor, setShowcaseMorphAnchor, showcaseOrbitPostUris, activePlanMapClientFilter, setActivePlanMapClientFilter, focusedMapClientId, setFocusedMapClientId, markerMatchesFocusedClient, handleFocusClientFromSearch, drawerStep, setDrawerStep, buildDayCtaAttentionKey, selectedPreferences, setSelectedPreferences, selectedFoodCategories, setSelectedFoodCategories, customPreferenceInput, setCustomPreferenceInput, customFoodInput, setCustomFoodInput, loading, setLoading, loadingStatus, setLoadingStatus, error, setError, dayPlan, setDayPlan, pineconeMatches, setPineconeMatches, visiblePinCount, setVisiblePinCount, revealingPins, setRevealingPins, surpriseSpinning, setSurpriseSpinning, surpriseIndex, setSurpriseIndex, surprisePicked, setSurprisePicked, showPlanModal, setShowPlanModal, planModalStep, setPlanModalStep, buildDayModalPhase, setBuildDayModalPhase, quickFindKind, setQuickFindKind, customPlanDraftActive, setCustomPlanDraftActive, quickFindMapOnly, setQuickFindMapOnly, quickFindLastKind, setQuickFindLastKind, quickFindLastLabel, setQuickFindLastLabel, quickFindExcludedFingerprints, setQuickFindExcludedFingerprints, quickFindLastChosenFingerprints, setQuickFindLastChosenFingerprints, resetQuickFindRotationState, showBuildModePickerModal, setShowBuildModePickerModal, travelExploreId, setTravelExploreId, doorVisible, setDoorVisible, planGenerationSuccess, setPlanGenerationSuccess, spotPreviews, setSpotPreviews, profileClientId, setProfileClientId, stopDetailIndex, setStopDetailIndex, openingMaps, setOpeningMaps, shareCopyHint, setShareCopyHint, allPlaceMarkers, setAllPlaceMarkers, allPlaceMarkersLoading, showSearchModal, setShowSearchModal, addingPlanStop, setAddingPlanStop, searchModalClients, setSearchModalClients, searchModalLoading, setSearchModalLoading, searchModalQuery, setSearchModalQuery, searchModalDisplayClients, searchModalSemanticSearching, searchModalCatalogFilter, setSearchModalCatalogFilter, enhancingIndex, setEnhancingIndex, visibleStopCount, setVisibleStopCount, savedPlansList, setSavedPlansList, savedPlansLoading, setSavedPlansLoading, activeSavedPlanId, setActiveSavedPlanId, sharedCollaboration, setSharedCollaboration, joinCodeInput, setJoinCodeInput, joinCodeBusy, setJoinCodeBusy, showSharePlanModal, setShowSharePlanModal, sharePermissionDraft, setSharePermissionDraft, shareModalBusy, setShareModalBusy, shareModalCode, setShareModalCode, savePlanBusy, setSavePlanBusy, showEditSavedPlanTitleModal, setShowEditSavedPlanTitleModal, editSavedPlanTitleId, setEditSavedPlanTitleId, editSavedPlanTitleDraft, setEditSavedPlanTitleDraft, editSavedPlanTitleBusy, setEditSavedPlanTitleBusy, mapRef, userLocation, userLocationRef, dayPlanRef, locationWatchRef, mapProgrammaticMoveRef, mapProgrammaticMoveClearTimerRef, hasInitialUserCenterRef, markerShowcaseRef, orbitSheetExtraTranslateY, planSheetSnapIndex, setPlanSheetSnapIndex, sheetAnim, lastSnap, currentYRef, prefetchRef, lastPrefLabelsRef, lastFoodLabelsRef, doorLeft, doorRight, doorIconScale, doorIconOpacity, doorFade, skipOpenAnim, shareCopyHintTimerRef, stopRevealTimers, planModalBackdrop, planModalScale, planModalOpacity, sheetOpacity, stopDetailSwipeX, stopDetailSwipeRotate, stopDetailIndexSV, stopDetailSlidesLenSV, communityPalette, stopDetailSlides, stopDetailPayload, stopDetailStackPeekNext, stopDetailPanGesture, handlePlanMapClientFilterPress, markProgrammaticMapMove, clearMarkerShowcaseTimers, clearMarkerShowcase, exitMarkerShowcase, handleMapPress, centerMapOnPlaceMarker, runMarkerShowcaseOrbitForMarker, handlePlaceMarkerPress, clearStopRevealTimers, scheduleStaggeredStopReveal, handleOpenInGoogleMaps, closeStopDetailDialog, goToStopDetailIndex, handleStopDetailSwipeNext, handleStopDetailSwipePrev, refreshSavedPlans, resolveOriginCoordsForPlanGeneration, planReadOnly, planCollaboratorEdit, STOP_REVEAL_STAGGER_MS, stopDetailCardAnimatedStyle, stopDetailPeekAnimatedStyle }
}
