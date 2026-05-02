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
  resolvePlanRetrievalBuckets,
  fetchRestaurants,
  fetchBreakfastSpots,
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


export function useAIPlanScreenMiddlePartB(midA) {
  const planHeaderReelScrollRef = useRef(null)
  const planHeaderReelOffsetRef = useRef(0)
  const REEL_ITEM_STEP = 74
  const [showShareActionPickerModal, setShowShareActionPickerModal] = useState(false)
  const [shareActionModalPhase, setShareActionModalPhase] = useState('settings')

  const handleSurpriseMe = () => {
    if (midA.surpriseSpinning) return;
    midA.setSurpriseSpinning(true);
    midA.setSurprisePicked(null);

    let tick = 0;
    const totalTicks = 20;
    const finalIdx = Math.floor(Math.random() * SURPRISE_THEMES.length);

    const interval = setInterval(() => {
      tick += 1;
      midA.setSurpriseIndex(tick % SURPRISE_THEMES.length);
      if (tick >= totalTicks) {
        clearInterval(interval);
        midA.setSurpriseIndex(finalIdx);
        midA.setSurprisePicked(SURPRISE_THEMES[finalIdx]);
        midA.setSurpriseSpinning(false);

        // Auto-generate after a short reveal pause
        setTimeout(() => {
          const theme = SURPRISE_THEMES[finalIdx];
          const prefLabels = theme.prefs;
          const foodLabels = theme.food;

          midA.setActiveSavedPlanId(null);
          midA.setSharedCollaboration(null);
          midA.setDayPlan(null);
          midA.setPineconeMatches([]);
          midA.setError(null);
          midA.setQuickFindMapOnly(false);
          midA.setShowBuildModePickerModal(false);
          midA.setLoading(true);
          midA.setLoadingStatus('Getting your location…');
          midA.setDrawerStep(3);
          midA.lastPrefLabelsRef.current = prefLabels;
          midA.lastFoodLabelsRef.current = foodLabels;

          getCachedFeedImages()
            .then((cached) => {
              const c = Array.isArray(cached) ? cached : [];
              if (c.length > 0) midA.setSpotPreviews(c);
              return c;
            })
            .then((c) =>
              fetchSpotPreviewsFromSupabase().then((fresh) => {
                const f = Array.isArray(fresh) ? fresh : [];
                if (f.length > c.length) midA.setSpotPreviews(f);
              }),
            )
            .catch(() => {});

          (async () => {
            let generatedPlan = null;
            try {
              const { originLat, originLng } = await midA.resolveOriginCoordsForPlanGeneration({ preferFreshFix: true })
              midA.setLoadingStatus(`Scouting venues & live posts for your ${theme.label.toLowerCase()} day…`)

              const retrievalOpts = {
                profileNarrative: midA.preferences?.profileSummary || '',
                profileActivity: midA.activityLabels,
              }
              const [
                places,
                restaurants,
                breakfastSpots,
                events,
              ] = await resolvePlanRetrievalBuckets(prefLabels, foodLabels, retrievalOpts)

              console.log(`[Surprise ${theme.label}] ${places.length}P ${restaurants.length}R ${breakfastSpots.length}B ${events.length}E`);

              const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
              midA.setPineconeMatches(allMatches);

              midA.setLoadingStatus('Shortlisting restaurants & cafés that fit your vibe…');
              await new Promise((res) => setTimeout(res, 380));
              midA.setLoadingStatus(`Khalid is crafting your ${theme.label.toLowerCase()} day…`);
              const lastSavedPlanSpots = (
                Array.isArray(midA.savedPlansList) && Array.isArray(midA.savedPlansList[0]?.plan_data)
                  ? midA.savedPlansList[0].plan_data
                  : []
              )
                .map((row) => row?.spot)
                .filter((name) => typeof name === 'string' && name.trim().length > 0)
                .slice(-80)
              const recentVisitedSpots = [
                ...lastSavedPlanSpots,
                ...(Array.isArray(midA.dayPlan) ? midA.dayPlan : []).map((row) => row?.spot),
              ]
                .filter((name) => typeof name === 'string' && name.trim().length > 0)
                .slice(-80);
              const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels, {
                profileGeneral: midA.generalLabels,
                profileActivity: midA.activityLabels,
                profileFood: midA.savedProfileFoodLabels,
                profileNarrative: midA.preferences?.profileSummary || '',
                profileAnswers: midA.preferences?.profileAnswers || {},
                travelExplore: 'balanced',
                originLat,
                originLng,
                strictAvoidSpots: lastSavedPlanSpots,
                recentVisitedSpots,
              });
              generatedPlan = plan;
              const initialKeyedPlan = attachPlanRowKeys(plan);
              midA.setDayPlan(initialKeyedPlan);
              const enriched = await enrichPlanWithClientData(plan, allMatches, midA.allPlaceMarkers);
              const enrichedWithStableKeys = attachPlanRowKeys(
                enriched.map((item, idx) => ({
                  ...item,
                  _planRowKey: initialKeyedPlan[idx]?._planRowKey || item?._planRowKey,
                })),
              );
              midA.setDayPlan(enrichedWithStableKeys);
              await midA.autoSavePlanSilently(enrichedWithStableKeys).catch((e) =>
                console.warn('[AI Plan] surprise auto save failed:', e?.message),
              )
              midA.setError(null);

              const validMarkers = buildMapMarkers(plan, midA.allPlaceMarkers).filter(m => m.lat && m.lng);
              const coords = validMarkers.map(m => ({ latitude: m.lat, longitude: m.lng }));
              const u = midA.userLocationRef.current;
              if (u?.latitude != null && u?.longitude != null) {
                coords.push({ latitude: u.latitude, longitude: u.longitude });
              }
              if (coords.length > 0 && midA.mapRef.current) {
                midA.markProgrammaticMapMove(2200);
                midA.mapRef.current.fitToCoordinates(coords, {
                  edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
                  animated: true,
                });
              }
    } catch (err) {
      console.warn('[AI Plan] API midA.error:', err?.message);
      generatedPlan = null;
      midA.setDayPlan(null);
      midA.setError(err?.message || 'Could not generate your plan. Try again.');
    } finally {
      midA.setLoading(false);
      midA.setLoadingStatus('');
      if (generatedPlan && generatedPlan.length > 0) {
                midA.setRevealingPins(true);
                midA.setVisiblePinCount(0);
                midA.sheetOpacity.setValue(0);
              } else {
                midA.sheetOpacity.setValue(1);
                midA.lastSnap.current = SNAP_POINTS[0];
                Animated.spring(midA.sheetAnim, {
                  toValue: SNAP_POINTS[0],
                  useNativeDriver: true,
                  tension: 80,
                  friction: 12,
                }).start();
              }
            }
          })();
        }, 1200);
      }
    }, 80 + tick * 8);
  };

  const startSetup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    midA.setCustomPlanDraftActive(false)
    midA.setQuickFindMapOnly(false)
    midA.setShowBuildModePickerModal(false)
    midA.setBuildDayModalPhase('menu')
    midA.setQuickFindKind(null)
    midA.setPlanGenerationSuccess(false)
    midA.setRevealingPins(false)
    midA.setVisiblePinCount(0)
    midA.sheetOpacity.setValue(1)
    midA.setActiveSavedPlanId(null)
    midA.setSharedCollaboration(null)
    midA.setSelectedPreferences(Array.isArray(midA.preferences?.activityIds) ? midA.preferences.activityIds : [])
    midA.setSelectedFoodCategories(Array.isArray(midA.preferences?.foodIds) ? midA.preferences.foodIds : [])
    midA.setCustomPreferenceInput('')
    midA.setCustomFoodInput('')
    midA.setDayPlan(null)
    midA.setPineconeMatches([])
    midA.setError(null)
    midA.setSpotPreviews([])
    midA.setPlanModalStep(1)
    midA.setTravelExploreId('balanced')

    midA.setDoorVisible(false)

    midA.planModalBackdrop.setValue(0)
    midA.planModalScale.setValue(0.94)
    midA.planModalOpacity.setValue(0)

    midA.skipOpenAnim.current = true
    midA.setShowPlanModal(true)

    Animated.parallel([
      Animated.timing(midA.planModalBackdrop, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(midA.planModalOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(midA.planModalScale, {
        toValue: 1,
        tension: 90,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start()
  };

  const handleOpenShareActionPickerModal = useCallback(() => {
    if (!midA.dayPlan?.length) {
      Alert.alert('Nothing to share', 'Create a plan first.')
      return
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    setShareActionModalPhase('settings')
    setShowShareActionPickerModal(true)
  }, [midA.dayPlan])

  const handleSharePlanCode = useCallback(async () => {
    let code = midA.shareModalCode || midA.sharedCollaboration?.code || null
    if (!code) {
      await midA.handleOpenShareModal({ openModal: false })
      if (!midA.activeSavedPlanId) return
      code = await midA.handleConfirmShareSettings({ skipClipboard: true, skipSuccessAlert: true })
      if (!code) return
    }
    const link = ExpoLinking.createURL(`plan/${code}`)
    const message = `${link}\nCode: ${code}`
    try {
      await Clipboard.setStringAsync(message)
      await Share.share(
        Platform.OS === 'ios'
          ? { message, title: 'Share plan' }
          : { message, title: 'SiyahaBH' },
      )
    } catch (_) {
      /* dismissed */
    } finally {
      setShowShareActionPickerModal(false)
    }
  }, [
    midA.shareModalCode,
    midA.sharedCollaboration,
    midA.handleOpenShareModal,
    midA.activeSavedPlanId,
    midA.handleConfirmShareSettings,
  ])

  const handleShareActionEnableAndBack = useCallback(async () => {
    await handleSharePlanCode()
  }, [handleSharePlanCode])

  const planHeaderReel = useMemo(() => {
    if (!midA.dayPlan?.length) return []
    return midA.dayPlan.slice(0, 6).map((stop) => {
      const thumbUri = pickPlanStopThumbUri(stop, midA.allPlaceMarkers)
      return { key: stop._planRowKey || `${stop.spot}-${stop.lat}`, uri: thumbUri }
    })
  }, [midA.dayPlan, midA.allPlaceMarkers])

  const planHeaderReelLoop = useMemo(
    () => (planHeaderReel.length > 1 ? [...planHeaderReel, ...planHeaderReel] : planHeaderReel),
    [planHeaderReel]
  )

  useEffect(() => {
    if (planHeaderReel.length <= 1) {
      planHeaderReelOffsetRef.current = 0
      return
    }
    const timer = setInterval(() => {
      const boundary = planHeaderReel.length * REEL_ITEM_STEP
      let next = planHeaderReelOffsetRef.current + REEL_ITEM_STEP
      if (next >= boundary) {
        planHeaderReelOffsetRef.current = 0
        planHeaderReelScrollRef.current?.scrollTo({ x: 0, animated: false })
        next = REEL_ITEM_STEP
      }
      planHeaderReelOffsetRef.current = next
      planHeaderReelScrollRef.current?.scrollTo({ x: next, animated: true })
    }, 2200)
    return () => clearInterval(timer)
  }, [planHeaderReel])

  const renderPlanTimelineOverviewHeader = useCallback(() => {
    if (!midA.dayPlan?.length) return null
    const mealCount = midA.dayPlan.filter((i) => i.type === 'restaurant').length
    const sharedBanner =
      midA.sharedCollaboration?.role === 'viewer'
        ? 'View-only shared plan'
        : midA.sharedCollaboration?.role === 'editor'
          ? 'Shared plan — your edits sync to the owner'
          : midA.sharedCollaboration?.role === 'owner'
            ? 'Your saved plan (you can edit and re-share)'
            : null
    const titleLabel =
      midA.sharedCollaboration?.role === 'viewer' || midA.sharedCollaboration?.role === 'editor'
        ? 'Shared Bahrain day'
        : 'Your Bahrain day'
    const rowForTitle = midA.savedPlansList.find((p) => p.id === midA.activeSavedPlanId)
    const savedTitleRaw = typeof rowForTitle?.title === 'string' ? rowForTitle.title.trim() : ''
    const primaryTitle = savedTitleRaw || titleLabel
    return (
      <View style={styles.planLuxuryOverviewCard} accessibilityRole="summary">
        <View style={styles.planLuxuryOverviewAccentTop} />
        <TouchableOpacity
          style={styles.planLuxuryOverviewBackBtnTop}
          activeOpacity={0.65}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
            midA.setQuickFindMapOnly(false)
            midA.setDrawerStep(0)
            midA.setDayPlan(null)
            midA.setError(null)
            midA.setActiveSavedPlanId(null)
            midA.setSharedCollaboration(null)
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to plans"
        >
          <Ionicons name="chevron-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        {sharedBanner ? (
          <View style={styles.planShareBanner} accessibilityRole="text">
            <Text style={styles.planShareBannerText}>{sharedBanner}</Text>
          </View>
        ) : null}
        <View style={styles.planLuxuryOverviewHeaderRow}>
          <View style={styles.planLuxuryOverviewSideSlot} />
          <View style={styles.planLuxuryOverviewHeaderMainCol}>
            <View style={styles.planLuxuryOverviewTitleBlock}>
              <View style={styles.planLuxuryOverviewTitleRow}>
                  <Text
                    style={styles.planLuxuryOverviewTitle}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {primaryTitle}
                  </Text>
              </View>
                <View style={styles.planLuxuryOverviewDividerRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={styles.planLuxuryOverviewDividerLine} />
                  <View style={styles.planLuxuryOverviewDividerDot} />
                  <View style={styles.planLuxuryOverviewDividerLine} />
                </View>
              <Text
                style={styles.planLuxuryOverviewSubtitle}
                numberOfLines={1}
                accessibilityLabel={`${midA.dayPlan.length} stops, ${mealCount} meals`}
              >
                {mealCount === 0
                  ? `${midA.dayPlan.length} stops`
                  : `${midA.dayPlan.length} stops · ${mealCount} meals`}
              </Text>
            </View>
          </View>

          <View style={styles.planLuxuryOverviewSideSlot} />
        </View>
        <View style={styles.planLuxuryOverviewControlTray}>
          <View style={styles.planLuxuryOverviewMapRow}>
            <View style={styles.planLuxuryOverviewMapRowSplit}>
              <TouchableOpacity
                style={[styles.planLuxuryOverviewMapBtn, styles.planLuxuryOverviewMapBtnFlex]}
                onPress={midA.handleOpenInGoogleMaps}
                disabled={midA.openingMaps}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Open midA.route in Google Maps"
              >
                {midA.openingMaps ? (
                  <ActivityIndicator size="small" color="#64748B" />
                ) : (
                  <>
                    <Ionicons name="navigate-outline" size={19} color="#475569" />
                    <Text style={styles.planLuxuryOverviewMapBtnText}>Maps</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.planLuxuryOverviewMapBtn,
                  styles.planLuxuryOverviewMapBtnFlex,
                  styles.planLuxuryOverviewAddBtn,
                  midA.planReadOnly && { opacity: 0.45 },
                ]}
                onPress={() => {
                  if (midA.planReadOnly) return
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  midA.setShowSearchModal(true)
                }}
                disabled={midA.planReadOnly}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add a stop from the catalog"
              >
                <Ionicons name="add-circle-outline" size={19} color={themeColors.primary} />
                <Text style={styles.planLuxuryOverviewAddBtnText}>Add stop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.planLuxuryOverviewShareBtnInline}
                activeOpacity={0.85}
                onPress={handleOpenShareActionPickerModal}
                accessibilityRole="button"
                accessibilityLabel="Share plan"
              >
                <Ionicons name="share-outline" size={18} color={themeColors.primary} />
                <Text style={styles.planLuxuryOverviewShareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    )
  }, [
    midA.dayPlan,
    midA.openingMaps,
    midA.handleOpenInGoogleMaps,
    handleOpenShareActionPickerModal,
    midA.setShowSearchModal,
    midA.sharedCollaboration,
    midA.planReadOnly,
    midA.handleOpenShareModal,
    midA.shareModalBusy,
    midA.activeSavedPlanId,
    midA.savedPlansList,
  ])


  return {
    ...midA,
    renderPlanTimelineOverviewHeader,
    handleSurpriseMe,
    startSetup,
    showShareActionPickerModal,
    setShowShareActionPickerModal,
    shareActionModalPhase,
    setShareActionModalPhase,
    handleSharePlanCode,
    handleShareActionEnableAndBack,
  }
}
