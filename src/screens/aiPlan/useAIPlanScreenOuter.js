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
  resolvePlanRetrievalBuckets,
  generateDayPlan,
  fetchClientsWithLocation,
  enhancePlanStopAtIndex,
  planRetrievalContextKey,
} from '../../services/aiPipeline'
import { useUserPreferences } from '../../context/UserPreferencesContext'
import { colors as themeColors } from '../../theme/designTokens'
import styles from '../AIPlanScreen.styles'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../config/supabase'
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
import { buildQuickFindSingleStopPlan } from './quickFindFromMatches'
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

import { useAIPlanScreenMiddle } from './useAIPlanScreenMiddle'

export function useAIPlanScreenOuter() {
  const mid = useAIPlanScreenMiddle()
  const [enhancingIndices, setEnhancingIndices] = useState(() => new Set())
  /** Top snap — surfaces Quick find buttons that sit inside the plan sheet body */
  const snapPlanSheetFullyExpanded = useCallback(() => {
    mid.lastSnap.current = SNAP_POINTS[0]
    mid.setPlanSheetSnapIndex(0)
    Animated.spring(mid.sheetAnim, {
      toValue: SNAP_POINTS[0],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start()
  }, [mid])
  /** Peek / minimized strip — orbit mode should stay map-forward (never full expanded sheet under orbit). */
  const snapPlanSheetToPeek = useCallback(() => {
    mid.lastSnap.current = SNAP_POINTS[INITIAL_SNAP_INDEX]
    mid.setPlanSheetSnapIndex(INITIAL_SNAP_INDEX)
    Animated.spring(mid.sheetAnim, {
      toValue: SNAP_POINTS[INITIAL_SNAP_INDEX],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start()
  }, [mid])
  const getSelectedPreferenceLabels = useCallback(() => {
    return mid.selectedPreferences
      .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
      .filter(Boolean)
  }, [mid.selectedPreferences])

  const getSelectedFoodLabels = useCallback(() => {
    return mid.selectedFoodCategories
      .map((id) => FOOD_CATEGORIES.find((f) => f.id === id)?.label)
      .filter(Boolean)
  }, [mid.selectedFoodCategories])
  const handleCopyShareText = useCallback(async () => {
    const { message } = formatPlanShareMessage(mid.dayPlan);
    try {
      await Clipboard.setStringAsync(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (mid.shareCopyHintTimerRef.current) clearTimeout(mid.shareCopyHintTimerRef.current);
      mid.setShareCopyHint(true);
      mid.shareCopyHintTimerRef.current = setTimeout(() => {
        mid.setShareCopyHint(false);
        mid.shareCopyHintTimerRef.current = null;
      }, 2200);
    } catch (_) {
      Alert.alert('Could not copy', 'Please try again.');
    }
  }, [mid.dayPlan]);

  const handleEnhanceStop = useCallback(async (planIndex) => {
    if (planIndex == null || planIndex < 0) return
    if (mid.loading) return
    if (enhancingIndices.has(planIndex)) return
    if (mid.planReadOnly) {
      Alert.alert('View only', 'This plan is shared for viewing only.')
      return
    }
    if (!mid.dayPlan?.length) {
      Alert.alert('Unavailable', 'Build a plan first so we can swap this stop.')
      return
    }
    setEnhancingIndices((prev) => {
      const next = new Set(prev)
      next.add(planIndex)
      return next
    })
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    const prevKeys = mid.dayPlan.map((x) => x._planRowKey)
    const draft = [...mid.dayPlan]
    try {
      const { replacement: rawStop, enrichCatalog } = await enhancePlanStopAtIndex(
        mid.dayPlan,
        planIndex,
        mid.pineconeMatches,
        mid.lastPrefLabelsRef.current || [],
        mid.lastFoodLabelsRef.current || [],
        {
          profileGeneral: mid.generalLabels,
          profileActivity: mid.activityLabels,
          profileFood: mid.savedProfileFoodLabels,
          profileNarrative: mid.preferences?.profileSummary || '',
          profileAnswers: mid.preferences?.profileAnswers || {},
          viewerUType: mid.viewerUType,
        },
      )
      const newKey = `rk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      draft[planIndex] = { ...rawStop, _planRowKey: newKey }
      const mergedKeys = prevKeys.map((k, i) => (i === planIndex ? newKey : k))
      const enrichPool = enrichCatalog?.length ? enrichCatalog : mid.pineconeMatches
      const enriched = await enrichPlanWithClientData(draft, enrichPool, mid.allPlaceMarkers)
      const keyed = attachPlanRowKeys(
        enriched.map((item, i) => ({ ...item, _planRowKey: mergedKeys[i] || item._planRowKey })),
      )
      mid.setDayPlan(keyed)
      mid.setStopDetailIndex((prev) => {
        if (prev == null || prev !== planIndex) return prev
        return Math.min(planIndex, keyed.length - 1)
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (e) {
      Alert.alert('Enhance failed', e?.message || 'Please try again.')
    } finally {
      setEnhancingIndices((prev) => {
        const next = new Set(prev)
        next.delete(planIndex)
        return next
      })
    }
  }, [
    enhancingIndices,
    mid.dayPlan,
    mid.pineconeMatches,
    mid.loading,
    mid.planReadOnly,
    mid.generalLabels,
    mid.activityLabels,
    mid.savedProfileFoodLabels,
    mid.viewerUType,
    mid.colors.morning,
    mid.colors.afternoon,
    mid.colors.evening,
  ])

  const addToPlanMode = Boolean(mid.dayPlan?.length) || mid.customPlanDraftActive

  const handleAddClientToPlan = useCallback(async (client) => {
    if (mid.planReadOnly) return
    if (!client) return
    const basePlan = Array.isArray(mid.dayPlan) ? mid.dayPlan : []
    const cid = client.client_a_uuid || client.clientId
    if (cid && basePlan.some((s) => s.clientId && s.clientId === cid)) {
      Alert.alert(
        'Already on your itinerary',
        'This place is already in your plan. Drag the list to change the order.',
      )
      return
    }
    if (mid.addingPlanStop || mid.enhancingIndex !== null) return
    mid.setAddingPlanStop(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    try {
      const draftStop = buildDraftStopFromClient(client, basePlan)
      const draftPlan = [...basePlan, draftStop]
      const enriched = await enrichPlanWithClientData(draftPlan, mid.pineconeMatches, mid.allPlaceMarkers)
      const keyed = attachPlanRowKeys(enriched)
      mid.setDayPlan(keyed)
      mid.setVisibleStopCount(keyed.length)
      if (keyed.length > 1) {
        mid.setQuickFindMapOnly(false)
        mid.resetQuickFindRotationState()
      }
      mid.setCustomPlanDraftActive(false)
      mid.setShowSearchModal(false)
      mid.setSearchModalQuery('')
      const validMarkers = buildMapMarkers(keyed, mid.allPlaceMarkers).filter((m) => m?.lat && m?.lng)
      const coords = validMarkers.map((m) => ({ latitude: m.lat, longitude: m.lng }))
      if (coords.length > 0 && mid.mapRef.current) {
        mid.markProgrammaticMapMove(2200);
        mid.mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
          animated: true,
        })
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (e) {
      Alert.alert('Could not add stop', e?.message || 'Please try again.')
    } finally {
      mid.setAddingPlanStop(false)
    }
  }, [
    mid.dayPlan,
    mid.pineconeMatches,
    mid.allPlaceMarkers,
    mid.addingPlanStop,
    mid.enhancingIndex,
    mid.planReadOnly,
    mid.customPlanDraftActive,
  ])

  useEffect(() => () => {
    if (mid.shareCopyHintTimerRef.current) clearTimeout(mid.shareCopyHintTimerRef.current);
  }, []);

  const closeBuildModePickerModal = useCallback(() => {
    mid.setShowBuildModePickerModal(false);
    mid.setBuildDayModalPhase('menu');
    mid.setQuickFindKind(null);
  }, [mid]);

  useEffect(() => {
    const ts = mid.route.params?.showBuildModePicker;
    if (ts) {
      mid.setShowBuildModePickerModal(true);
      mid.setBuildDayModalPhase('menu');
      mid.setQuickFindKind(null);
      try {
        mid.navigation.setParams({ showBuildModePicker: undefined });
      } catch (_) {
        /* older navigators */
      }
    }
  }, [mid.route.params?.showBuildModePicker, mid]);

  useEffect(() => {
    const openPlanModal = mid.route.params?.openPlanModal;
    if (openPlanModal) {
      mid.startSetup();
      try {
        mid.navigation.setParams({ openPlanModal: undefined });
      } catch (_) {
        /* older navigators */
      }
    }
  }, [mid.route.params?.openPlanModal, mid]);

  const closePlanModal = (then) => {
    mid.setDoorVisible(false)
    Animated.parallel([
      Animated.timing(mid.planModalBackdrop, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(mid.planModalOpacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(mid.planModalScale, {
        toValue: 0.96,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      mid.setShowPlanModal(false)
      mid.setPlanGenerationSuccess(false)
      mid.planModalBackdrop.setValue(0)
      mid.planModalScale.setValue(0.95)
      mid.planModalOpacity.setValue(0)
      then?.()
    })
  };

  const openPlanModalAnim = () => {
    Animated.parallel([
      Animated.timing(mid.planModalBackdrop, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(mid.planModalScale, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(mid.planModalOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleGenerate = async (onComplete) => {
    const prefLabels = getSelectedPreferenceLabels()
    const foodLabels = getSelectedFoodLabels()

    mid.setCustomPlanDraftActive(false);
    mid.setQuickFindMapOnly(false);
    mid.resetQuickFindRotationState();
    mid.setShowBuildModePickerModal(false);
    mid.setLoading(true);
    mid.setPlanGenerationSuccess(false);
    mid.setLoadingStatus('Getting your location for this plan…');
    mid.setError(null);
    mid.setActiveSavedPlanId(null);
    mid.setSharedCollaboration(null);
    mid.setDayPlan(null);
    mid.setPineconeMatches([]);
    mid.setDrawerStep(3);
    mid.lastPrefLabelsRef.current = prefLabels;
    mid.lastFoodLabelsRef.current = foodLabels;

    // Get cached feed images immediately, fetch more in background
    getCachedFeedImages()
      .then((cached) => {
        const c = Array.isArray(cached) ? cached : [];
        if (c.length > 0) mid.setSpotPreviews(c);
        return c;
      })
      .then((c) =>
        fetchSpotPreviewsFromSupabase().then((fresh) => {
          const f = Array.isArray(fresh) ? fresh : [];
          if (f.length > c.length) mid.setSpotPreviews(f);
        }),
      )
      .catch(() => {});

    let generatedPlan = null;
    try {
      const { originLat, originLng } = await mid.resolveOriginCoordsForPlanGeneration({ preferFreshFix: true })
      mid.setLoadingStatus('Khalid is scouting live posts for standout venues…')

      const prefsKey = prefLabels.join('|')
      const warmupKey = planRetrievalContextKey(mid.preferences?.profileSummary, mid.preferences?.profileAnswers)
      const retrievalOpts = {
        profileNarrative: mid.preferences?.profileSummary || '',
        profileActivity: mid.activityLabels,
        profileAnswers: mid.preferences?.profileAnswers || {},
      }
      const cached = mid.prefetchRef.current

      let places;
      let breakfastSpots;
      let events;
      let restaurants;

      const hasCached =
        cached.prefsKey === prefsKey &&
        cached.warmupKey === warmupKey &&
        Array.isArray(cached.places) &&
        cached.places.length > 0 &&
        Array.isArray(cached.events) &&
        cached.events.length > 0 &&
        Array.isArray(cached.breakfastSpots) &&
        cached.breakfastSpots.length > 0

      if (hasCached) {
        places = cached.places;
        events = cached.events;
        breakfastSpots = cached.breakfastSpots;
        restaurants = await fetchRestaurants(foodLabels, retrievalOpts);
      } else {
        const [
          placesResult,
          restaurantsResult,
          breakfastResult,
          eventsResult,
        ] = await resolvePlanRetrievalBuckets(prefLabels, foodLabels, retrievalOpts);
        places = placesResult;
        restaurants = restaurantsResult;
        breakfastSpots = breakfastResult;
        events = eventsResult;
      }

      const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
      mid.setPineconeMatches(allMatches);

      console.log(`Pinecone: ${places.length} places, ${restaurants.length} restaurants, ${breakfastSpots.length} breakfast, ${events.length} events`);

      // Pipeline Step 5 — GPT builds a smart day plan from all results
      mid.setLoadingStatus('Shortlisting restaurants & experiences for you…');
      await new Promise((res) => setTimeout(res, 380));
      mid.setLoadingStatus('Khalid is crafting your perfect day…');
      const lastSavedPlanSpots = []
      const recentVisitedSpots = []
      const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels, {
        profileGeneral: mid.generalLabels,
        profileActivity: mid.activityLabels,
        profileFood: mid.savedProfileFoodLabels,
        profileNarrative: mid.preferences?.profileSummary || '',
        profileAnswers: mid.preferences?.profileAnswers || {},
        travelExplore: mid.travelExploreId,
        originLat,
        originLng,
        viewerUType: mid.viewerUType,
      });
      generatedPlan = plan;
      const initialKeyedPlan = attachPlanRowKeys(plan);
      mid.setDayPlan(initialKeyedPlan);
      const enriched = await enrichPlanWithClientData(plan, allMatches, mid.allPlaceMarkers);
      const enrichedWithStableKeys = attachPlanRowKeys(
        enriched.map((item, idx) => ({
          ...item,
          _planRowKey: initialKeyedPlan[idx]?._planRowKey || item?._planRowKey,
        })),
      );
      mid.setDayPlan(enrichedWithStableKeys);
      await mid.autoSavePlanSilently(enrichedWithStableKeys).catch((e) =>
        console.warn('[AI Plan] auto save failed:', e?.message),
      )
      mid.setError(null);

      // Debug markers
      const markers = buildMapMarkers(plan || [], mid.allPlaceMarkers);
      console.log(`Map markers: ${markers.length}/${plan.length} spots have coordinates`);

      // Fit map to show all markers
      const validMarkers = buildMapMarkers(plan, mid.allPlaceMarkers).filter(m => m.lat && m.lng);
      const coords = validMarkers.map(m => ({ latitude: m.lat, longitude: m.lng }));
      const u = mid.userLocationRef.current;
      if (u?.latitude != null && u?.longitude != null) {
        coords.push({ latitude: u.latitude, longitude: u.longitude });
      }
      if (coords.length > 0 && mid.mapRef.current) {
        mid.markProgrammaticMapMove(2200);
        mid.mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
          animated: true,
        });
      }

    } catch (err) {
      console.warn('[AI Plan] API mid.error:', err?.message);
      generatedPlan = null;
      mid.setDayPlan(null);
      mid.setError(err?.message || 'Could not generate your plan. Try again.');
    } finally {
      mid.setLoading(false);
      mid.setLoadingStatus('');
      const succeeded = generatedPlan != null && generatedPlan.length > 0;
      if (succeeded) {
        mid.setPlanGenerationSuccess(true);
        setTimeout(() => {
          onComplete?.();
          mid.setRevealingPins(true);
          mid.setVisiblePinCount(0);
          mid.sheetOpacity.setValue(0);
        }, 4400);
      } else {
        mid.sheetOpacity.setValue(1);
        mid.lastSnap.current = SNAP_POINTS[0];
        mid.setPlanSheetSnapIndex(0);
        Animated.spring(mid.sheetAnim, {
          toValue: SNAP_POINTS[0],
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
        onComplete?.();
      }
    }
  };

  const handleBuildDayPickAiPlan = useCallback(() => {
    mid.setShowBuildModePickerModal(false);
    mid.setBuildDayModalPhase('menu');
    mid.startSetup();
  }, [mid]);

  const handleBuildDayPickQuickFind = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    mid.setBuildDayModalPhase('quickKind');
  }, [mid]);

  /** Opens build modal straight into Quick AI search (kind → sub-label). Used by map sheet two-column CTA. */
  const openQuickAiSearchModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    mid.setQuickFindKind(null)
    mid.setBuildDayModalPhase('quickKind')
    mid.setShowBuildModePickerModal(true)
  }, [mid])

  const handleBuildDayQuickFindSelectKind = useCallback(
    (kind) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      mid.setQuickFindKind(kind);
      mid.setBuildDayModalPhase('quickSub');
    },
    [mid],
  );

  const handleBuildDayQuickFindGoBack = useCallback(() => {
    if (mid.buildDayModalPhase === 'joinCode') {
      mid.setBuildDayModalPhase('menu');
      return;
    }
    if (mid.buildDayModalPhase === 'quickSub') {
      mid.setBuildDayModalPhase('quickKind');
      mid.setQuickFindKind(null);
      return;
    }
    /** `quickKind`, `menu`, etc. — always dismiss modal (quick search must not peel back to “Build my day” when closed from root) */
    closeBuildModePickerModal();
  }, [mid, closeBuildModePickerModal]);

  const handleBuildDayPickCustomPlan = useCallback(() => {
    mid.setShowBuildModePickerModal(false);
    mid.setBuildDayModalPhase('menu');
    mid.setQuickFindKind(null);
    mid.setQuickFindMapOnly(false);
    mid.resetQuickFindRotationState();
    mid.setCustomPlanDraftActive(true);
    mid.setActiveSavedPlanId(null);
    mid.setSharedCollaboration(null);
    mid.setDayPlan([]);
    mid.setPineconeMatches([]);
    mid.setError(null);
    mid.setDrawerStep(3);
    mid.setRevealingPins(false);
    mid.setVisiblePinCount(0);
    mid.sheetOpacity.setValue(1);
    mid.lastSnap.current = SNAP_POINTS[0];
    mid.setPlanSheetSnapIndex(0);
    Animated.spring(mid.sheetAnim, {
      toValue: SNAP_POINTS[0],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    setTimeout(() => {
      mid.setShowSearchModal(true);
    }, 220);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [mid]);

  const handleBuildDayPickEnterCode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    mid.setBuildDayModalPhase('joinCode');
  }, [mid]);

  const handleBuildDaySubmitJoinCode = useCallback(() => {
    const code = String(mid.joinCodeInput || '').trim().toUpperCase();
    if (!code) return;
    mid.setShowBuildModePickerModal(false);
    mid.setBuildDayModalPhase('menu');
    mid.applyShareCodeFromString(code);
  }, [mid]);

  const dismissQuickFindResult = useCallback(() => {
    mid.setDayPlan(null);
    mid.setQuickFindMapOnly(false);
    mid.resetQuickFindRotationState();
    mid.setDrawerStep(0);
    mid.setStopDetailIndex(null);
    mid.clearMarkerShowcase();
    mid.setError(null);
  }, [mid]);

  const runQuickFindForLabel = useCallback(
    async (kind, label, isRepeatSearch) => {
      if (!kind || !label) return;

      const labelNormKey = (s) =>
        String(s || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
      const sameQueryAsLastSuccess =
        kind === mid.quickFindLastKind && labelNormKey(label) === labelNormKey(mid.quickFindLastLabel)
      /** Picker “same chip again” must skip the last pin — same as “Search again”, not only that CTA */
      const shouldMergePriorExclusions = isRepeatSearch || sameQueryAsLastSuccess

      const excludedFingerprintsForQuery = (() => {
        if (!shouldMergePriorExclusions) return [];
        const base = [...(mid.quickFindExcludedFingerprints || [])];
        const bump = [...(mid.quickFindLastChosenFingerprints || [])];
        return [...new Set([...base, ...bump])];
      })();

      if (shouldMergePriorExclusions) {
        mid.setQuickFindExcludedFingerprints(excludedFingerprintsForQuery);
      } else {
        mid.setQuickFindExcludedFingerprints([]);
        mid.setQuickFindLastChosenFingerprints([]);
      }

      mid.setError(null);
      /** Buttons + copy live under `drawerStep === 3`; step 0 would hide Quick find CTAs entirely */
      mid.setDrawerStep(3);
      mid.setQuickFindMapOnly(true);
      mid.setLoading(true);
      mid.setLoadingStatus(
        shouldMergePriorExclusions ? 'Finding another match for you…' : 'Sweeping Bahrain for your match…',
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      let quickFindOrbitMk = null;
      try {
        let matches = [];
        const retrievalOpts = {
          profileNarrative: mid.preferences?.profileSummary || '',
          profileActivity: mid.activityLabels,
          quickFind: kind === 'place' || kind === 'restaurant',
          quickFindEvents: kind === 'event',
        };
        if (kind === 'place') {
          matches = await fetchPlaces([label], retrievalOpts);
        } else if (kind === 'restaurant') {
          matches = await fetchRestaurants([label], retrievalOpts);
        } else {
          matches = await fetchEvents([label], retrievalOpts);
        }
        mid.setPineconeMatches(matches);
        const referenceCoords = (() => {
          // Priority 1: real GPS location
          const u = mid.userLocationRef?.current;
          const uLat = Number(u?.latitude);
          const uLng = Number(u?.longitude);
          if (Number.isFinite(uLat) && Number.isFinite(uLng)) {
            return { latitude: uLat, longitude: uLng };
          }
          // Priority 2: current map region center
          const r = mid.mapRegion;
          const rLat = Number(r?.latitude);
          const rLng = Number(r?.longitude);
          if (Number.isFinite(rLat) && Number.isFinite(rLng)) {
            return { latitude: rLat, longitude: rLng };
          }
          // Priority 3: default Bahrain center — ensures distance sorting always works
          return { latitude: 26.0667, longitude: 50.5577 };
        })();
        const { plan, fingerprints, stats } = await buildQuickFindSingleStopPlan(
          matches,
          kind,
          mid.allPlaceMarkers,
          label,
          {
            excludedFingerprints: excludedFingerprintsForQuery,
            ...(referenceCoords ? { referenceCoords } : {}),
          },
        );
        if (!plan?.length) {
          let msg =
            'We could not find a mappable spot for that subcategory. Try another one.';
          if (stats.themeCount === 0 && stats.pineconeCount > 0) {
            msg = `We could not find results that clearly match “${label}”. Try a nearby tag or search the catalog.`;
          }
          if (!shouldMergePriorExclusions) {
            mid.setDayPlan(null);
            mid.setQuickFindMapOnly(false);
            mid.setDrawerStep(0);
          }
          mid.setError(null);
          Alert.alert('Quick find', msg);
          return;
        }
        /** Pool recycled after running out of new pins — restart rotation silently */
        if (stats.cycledExclusions) mid.resetQuickFindRotationState()
        mid.setLoadingStatus('Sharpening the best pin on your map…');
        mid.setDayPlan(plan);
        mid.setQuickFindLastKind(kind);
        mid.setQuickFindLastLabel(label);
        mid.setQuickFindLastChosenFingerprints(fingerprints || []);
        mid.setError(null);
        mid.setVisibleStopCount(plan.length);
        mid.setStopDetailIndex(null);
        snapPlanSheetToPeek()
        const mk = buildMapMarkers(plan, mid.allPlaceMarkers).find((m) => {
          const la = Number(m?.lat);
          const ln = Number(m?.lng);
          return Number.isFinite(la) && Number.isFinite(ln);
        });
        if (mk) {
          quickFindOrbitMk = mk;
          const map = mid.mapRef.current;
          if (map) {
            mid.setLoadingStatus('Gliding to your spot…');
            mid.markProgrammaticMapMove(1200);
            map.animateToRegion(
              clampRegionToBahrain({
                latitude: Number(mk.lat),
                longitude: Number(mk.lng),
                latitudeDelta: 0.032,
                longitudeDelta: 0.032,
              }),
              720,
            );
            await new Promise((r) => setTimeout(r, 380));
          }
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (e) {
        if (!shouldMergePriorExclusions) {
          mid.setDayPlan(null);
          mid.setQuickFindMapOnly(false);
          mid.setDrawerStep(0);
        }
        const msg = e?.message || 'Quick find failed.';
        mid.setError(null);
        Alert.alert('Quick find', msg);
      } finally {
        mid.setLoading(false);
        mid.setLoadingStatus('');
      }
      if (quickFindOrbitMk) {
        /** `loading` can still appear true this frame — bypass guard so orbit always opens after Quick find completes */
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            mid.handlePlaceMarkerPress(quickFindOrbitMk, { skipLoadGuard: true });
          });
        });
      }
    },
    [mid, snapPlanSheetToPeek],
  );

  const handleQuickFindPickSubCategory = useCallback(
    async (label) => {
      const kind = mid.quickFindKind;
      if (!kind || !label) return;
      mid.setShowBuildModePickerModal(false);
      mid.setBuildDayModalPhase('menu');
      mid.setQuickFindKind(null);
      mid.setCustomPlanDraftActive(false);
      mid.setPlanGenerationSuccess(false);
      mid.setRevealingPins(false);
      mid.setVisiblePinCount(0);
      mid.setActiveSavedPlanId(null);
      mid.setSharedCollaboration(null);
      mid.setDayPlan(null);
      await runQuickFindForLabel(kind, label, false);
    },
    [mid, runQuickFindForLabel],
  );

  const handleQuickFindSearchAgain = useCallback(async () => {
    const kind = mid.quickFindLastKind;
    const label = mid.quickFindLastLabel;
    if (!kind || !label || !mid.quickFindMapOnly) return;
    if (!mid.dayPlan?.length) return;
    if (mid.loading) return;
    await runQuickFindForLabel(kind, label, true);
  }, [mid, runQuickFindForLabel]);

  useEffect(() => {
    const id = mid.sheetAnim.addListener(({ value }) => { mid.currentYRef.current = value; });
    return () => mid.sheetAnim.removeListener(id);
  }, [mid.sheetAnim]);

  useEffect(() => {
    if (!mid.showPlanModal) return
    if (mid.skipOpenAnim.current) {
      mid.skipOpenAnim.current = false
      return
    }
    openPlanModalAnim()
  }, [mid.showPlanModal]);

  // Pin reveal: show pins one by one, pan camera to each, then open sheet with fade
  useEffect(() => {
    if (!mid.revealingPins || !mid.dayPlan) return;
    const markers = buildMapMarkers(mid.dayPlan, mid.allPlaceMarkers);
    if (markers.length === 0) {
      mid.setRevealingPins(false);
      mid.sheetOpacity.setValue(1);
      mid.lastSnap.current = SNAP_POINTS[0];
      mid.setPlanSheetSnapIndex(0);
      mid.scheduleStaggeredStopReveal(mid.dayPlan.length);
      Animated.spring(mid.sheetAnim, {
        toValue: SNAP_POINTS[0],
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      return;
    }
    // Initial pan to first place
    const first = markers[0];
    if (first && mid.mapRef.current) {
      mid.markProgrammaticMapMove(900);
      mid.mapRef.current.animateToRegion(
        clampRegionToBahrain({
          latitude: first.lat,
          longitude: first.lng,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        }),
        800
      );
    }
    const interval = setInterval(() => {
      mid.setVisiblePinCount((prev) => {
        if (prev >= markers.length) {
          clearInterval(interval);
          setTimeout(() => {
            mid.setRevealingPins(false);
            mid.lastSnap.current = SNAP_POINTS[0];
            mid.setPlanSheetSnapIndex(0);
            mid.scheduleStaggeredStopReveal(mid.dayPlan.length);
            Animated.parallel([
              Animated.timing(mid.sheetOpacity, {
                toValue: 1,
                duration: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.spring(mid.sheetAnim, {
                toValue: SNAP_POINTS[0],
                useNativeDriver: true,
                tension: 80,
                friction: 12,
              }),
            ]).start();
          }, 0);
          return prev;
        }
        // Pan camera to the pin we're about to reveal
        const mk = markers[prev];
        if (mk && mid.mapRef.current) {
          mid.markProgrammaticMapMove(850);
          mid.mapRef.current.animateToRegion(
            clampRegionToBahrain({
              latitude: mk.lat,
              longitude: mk.lng,
              latitudeDelta: 0.025,
              longitudeDelta: 0.025,
            }),
            700
          );
        }
        return prev + 1;
      });
    }, 750);
    return () => clearInterval(interval);
  }, [mid.revealingPins, mid.dayPlan, mid.scheduleStaggeredStopReveal]);

  const regionThrottleRef = useRef({ last: 0, lastDelta: null });
  const handleRegionChange = (region) => {
    if (region?.latitudeDelta == null) return;
    const now = Date.now();
    const prev = regionThrottleRef.current;
    const deltaChanged = prev.lastDelta == null || Math.abs(region.latitudeDelta - prev.lastDelta) / prev.lastDelta > 0.08;
    if (deltaChanged || now - prev.last > 120) {
      prev.last = now;
      prev.lastDelta = region.latitudeDelta;
      mid.setMapRegion(region);
    }
  };

  const handleRegionChangeComplete = (region) => {
    if (!region || !mid.mapRef.current) return;
    if (mid.mapProgrammaticMoveRef.current) {
      if (region?.latitudeDelta != null) mid.setMapRegion(region);
      return;
    }
    const clamped = clampRegionToBahrain(region);
    if (Math.abs(clamped.latitude - region.latitude) > 0.0005 || Math.abs(clamped.longitude - region.longitude) > 0.0005) {
      mid.markProgrammaticMapMove(400);
      mid.mapRef.current.animateToRegion(clamped, 180);
    }
    if (region?.latitudeDelta != null) mid.setMapRegion(region);
  };

  const showcaseMarkerAccent = useMemo(() => {
    if (!mid.showcaseMarkerMk) return mid.colors.textSecondary;
    const cat = mapMarkerFilterCategoryKey(mid.showcaseMarkerMk);
    const isEat = cat === 'restaurant';
    const isEvent = cat === 'event';
    if (mid.dayPlan?.length) {
      const timeCols = { Morning: mid.colors.morning, Afternoon: mid.colors.afternoon, Evening: mid.colors.evening };
      return isEat ? mid.colors.dining : isEvent ? mid.colors.event : (timeCols[mid.showcaseMarkerMk.time] || mid.colors.textSecondary);
    }
    return isEat ? mid.colors.dining : isEvent ? mid.colors.event : mid.colors.textSecondary;
  }, [mid.showcaseMarkerMk, mid.dayPlan, mid.colors]);

  const zoomScale = useMemo(() => {
    const delta = mid.mapRegion?.latitudeDelta ?? BAHRAIN_REGION.latitudeDelta;
    return Math.max(0.2, Math.min(1, 0.06 / delta));
  }, [mid.mapRegion]);

  const refreshShowcaseMorphAnchor = useCallback(() => {
    const map = mid.mapRef.current;
    const mk = mid.showcaseMarkerMk;
    if (!map || !mk || mk.lat == null || mk.lng == null) return;
    const delta = mid.mapRegion?.latitudeDelta ?? BAHRAIN_REGION.latitudeDelta;
    const zs = Math.max(0.2, Math.min(1, 0.06 / delta));
    const sizePx = Math.max(46, Math.min(96, 56 * zs));
    if (typeof map.pointForCoordinate !== 'function') {
      mid.setShowcaseMorphAnchor({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.42, sizePx });
      return;
    }
    map
      .pointForCoordinate({ latitude: Number(mk.lat), longitude: Number(mk.lng) })
      .then((pt) => {
        if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
          mid.setShowcaseMorphAnchor({ x: pt.x, y: pt.y, sizePx });
        }
      })
      .catch(() => {
        mid.setShowcaseMorphAnchor({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.42, sizePx });
      });
  }, [mid.showcaseMarkerMk, mid.mapRegion]);

  useEffect(() => {
    if (!mid.isMarkerShowcaseActive || !mid.showcaseMarkerMk) {
      mid.setShowcaseMorphAnchor(null);
      return;
    }
    refreshShowcaseMorphAnchor();
    const t1 = setTimeout(refreshShowcaseMorphAnchor, 350);
    const t2 = setTimeout(refreshShowcaseMorphAnchor, 1100);
    const t3 = setTimeout(refreshShowcaseMorphAnchor, 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [mid.isMarkerShowcaseActive, mid.showcaseMarkerMk, refreshShowcaseMorphAnchor]);

  useEffect(() => {
    if (!mid.isMarkerShowcaseActive || !mid.showcaseMarkerMk) return;
    const t = setTimeout(() => refreshShowcaseMorphAnchor(), 120);
    return () => clearTimeout(t);
  }, [mid.mapRegion, mid.isMarkerShowcaseActive, mid.showcaseMarkerMk, refreshShowcaseMorphAnchor]);

  /** PanResponder captures first render’s `mid` — use refs for orbit state + snap helper */
  const markerShowcaseActiveRef = useRef(mid.isMarkerShowcaseActive)
  const snapPlanSheetToPeekRef = useRef(snapPlanSheetToPeek)
  useEffect(() => {
    markerShowcaseActiveRef.current = mid.isMarkerShowcaseActive
  }, [mid.isMarkerShowcaseActive])
  useEffect(() => {
    snapPlanSheetToPeekRef.current = snapPlanSheetToPeek
  }, [snapPlanSheetToPeek])

  useEffect(() => {
    if (!mid.isMarkerShowcaseActive) return
    snapPlanSheetToPeek()
  }, [mid.isMarkerShowcaseActive, snapPlanSheetToPeek])

  const peekY = SNAP_POINTS[INITIAL_SNAP_INDEX]
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 0.72,
      onPanResponderGrant: () => {
        if (markerShowcaseActiveRef.current) {
          mid.lastSnap.current = peekY
          return
        }
        mid.lastSnap.current = mid.currentYRef.current
      },
      onPanResponderMove: (_, g) => {
        if (markerShowcaseActiveRef.current) {
          mid.sheetAnim.setValue(peekY)
          return
        }
        const newY = mid.lastSnap.current + g.dy
        mid.sheetAnim.setValue(Math.max(SNAP_POINTS[0], Math.min(SNAP_POINTS[2], newY)))
      },
      onPanResponderRelease: (_, g) => {
        if (markerShowcaseActiveRef.current) {
          mid.lastSnap.current = peekY
          mid.setPlanSheetSnapIndex(INITIAL_SNAP_INDEX)
          snapPlanSheetToPeekRef.current()
          return
        }
        const currentY = mid.lastSnap.current + g.dy
        let targetIndex = 0
        let minDist = Math.abs(currentY - SNAP_POINTS[0])
        for (let i = 1; i < SNAP_POINTS.length; i++) {
          const d = Math.abs(currentY - SNAP_POINTS[i])
          if (d < minDist) {
            minDist = d
            targetIndex = i
          }
        }
        if (g.vy > 0.4) targetIndex = Math.min(2, targetIndex + 1)
        else if (g.vy < -0.4) targetIndex = Math.max(0, targetIndex - 1)
        const target = SNAP_POINTS[targetIndex]
        mid.lastSnap.current = target
        mid.setPlanSheetSnapIndex(targetIndex)
        Animated.spring(mid.sheetAnim, {
          toValue: target,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start()
      },
    })
  ).current;


  return {
    ...mid,
    enhancingIndices,
    regionThrottleRef,
    panResponder,
    showcaseMarkerAccent,
    zoomScale,
    handleCopyShareText,
    handleEnhanceStop,
    handleAddClientToPlan,
    refreshShowcaseMorphAnchor,
    addToPlanMode,
    closePlanModal,
    openPlanModalAnim,
    handleGenerate,
    handleRegionChange,
    handleRegionChangeComplete,
    handleBuildDayPickAiPlan,
    handleBuildDayPickQuickFind,
    openQuickAiSearchModal,
    handleBuildDayQuickFindSelectKind,
    handleBuildDayQuickFindGoBack,
    handleBuildDayPickCustomPlan,
    handleBuildDayPickEnterCode,
    handleBuildDaySubmitJoinCode,
    handleQuickFindPickSubCategory,
    handleQuickFindSearchAgain,
    dismissQuickFindResult,
    closeBuildModePickerModal,
    getSelectedPreferenceLabels,
    getSelectedFoodLabels,
  }
}
