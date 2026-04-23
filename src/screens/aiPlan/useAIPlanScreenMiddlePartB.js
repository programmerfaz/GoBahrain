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


export function useAIPlanScreenMiddlePartB(midA) {

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

              const retrievalOpts = { profileNarrative: midA.preferences?.profileSummary || '' }
              const [
                places,
                restaurants,
                breakfastSpots,
                events,
              ] = await Promise.all([
                fetchPlaces(prefLabels, retrievalOpts),
                fetchRestaurants(foodLabels, retrievalOpts),
                fetchBreakfastSpots(retrievalOpts),
                fetchEvents(prefLabels, retrievalOpts),
              ]);

              console.log(`[Surprise ${theme.label}] ${places.length}P ${restaurants.length}R ${breakfastSpots.length}B ${events.length}E`);

              const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
              midA.setPineconeMatches(allMatches);

              midA.setLoadingStatus('Shortlisting restaurants & cafés that fit your vibe…');
              await new Promise((res) => setTimeout(res, 380));
              midA.setLoadingStatus(`Khalid is crafting your ${theme.label.toLowerCase()} day…`);
              const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels, {
                profileGeneral: midA.generalLabels,
                profileActivity: midA.activityLabels,
                profileFood: midA.savedProfileFoodLabels,
                profileNarrative: midA.preferences?.profileSummary || '',
                profileAnswers: midA.preferences?.profileAnswers || {},
                travelExplore: 'balanced',
                originLat,
                originLng,
              });
              generatedPlan = plan;
              const enriched = await enrichPlanWithClientData(plan, allMatches, midA.allPlaceMarkers);
              midA.setDayPlan(attachPlanRowKeys(enriched));
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

  const handleSharePlanWithFriends = useCallback(async () => {
    const { message, title } = formatPlanShareMessage(midA.dayPlan);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message, title }
          : { message, title: title || 'SiyahaBH' },
      );
    } catch (_) {
      /* dismissed */
    }
  }, [midA.dayPlan]);

  const renderPlanTimelineOverviewHeader = useCallback(() => {
    if (!midA.dayPlan?.length) return null
    const mealCount = midA.dayPlan.filter((i) => i.type === 'restaurant').length
    const reel = midA.dayPlan.slice(0, 6).map((stop) => {
      const thumbUri = pickPlanStopThumbUri(stop, midA.allPlaceMarkers)
      return { key: stop._planRowKey || `${stop.spot}-${stop.lat}`, uri: thumbUri }
    })
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
    const canEditSavedPlanTitle =
      !!midA.activeSavedPlanId &&
      !midA.planReadOnly &&
      (midA.sharedCollaboration == null || midA.sharedCollaboration.role === 'owner')
    const rowForTitle = midA.savedPlansList.find((p) => p.id === midA.activeSavedPlanId)
    const savedTitleRaw = typeof rowForTitle?.title === 'string' ? rowForTitle.title.trim() : ''
    const primaryTitle = canEditSavedPlanTitle && savedTitleRaw ? savedTitleRaw : titleLabel
    return (
      <View style={styles.planLuxuryOverviewCard} accessibilityRole="summary">
        <View style={styles.planLuxuryOverviewAccentTop} />
        {sharedBanner ? (
          <View style={styles.planShareBanner} accessibilityRole="text">
            <Text style={styles.planShareBannerText}>{sharedBanner}</Text>
          </View>
        ) : null}
        <View style={styles.planLuxuryOverviewHeaderRow}>
          <TouchableOpacity
            style={styles.planLuxuryOverviewBackBtn}
            activeOpacity={0.8}
            onPress={() => {
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
          <View style={styles.planLuxuryOverviewHeaderMainCol}>
            <View style={styles.planLuxuryOverviewTitleBlock}>
              <View style={styles.planLuxuryOverviewTitleRow}>
                <Text style={[styles.planLuxuryOverviewTitle, { flex: 1, minWidth: 0 }]} numberOfLines={1}>
                  {primaryTitle}
                </Text>
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

          <View style={styles.planLuxuryOverviewHeaderActions}>
            {canEditSavedPlanTitle && (
              <TouchableOpacity
                style={styles.planLuxuryOverviewIconBtn}
                activeOpacity={0.75}
                onPress={() => midA.handleOpenEditSavedPlanTitle(midA.activeSavedPlanId)}
                accessibilityRole="button"
                accessibilityLabel="Edit plan title"
              >
                <Ionicons name="create-outline" size={19} color="#64748B" />
              </TouchableOpacity>
            )}
            {!midA.planReadOnly && (
              <TouchableOpacity
                style={styles.planLuxuryOverviewIconBtn}
                activeOpacity={0.75}
                onPress={midA.handleSavePlanToCloud}
                disabled={midA.savePlanBusy}
                accessibilityRole="button"
                accessibilityLabel="Save plan"
              >
                {midA.savePlanBusy ? (
                  <ActivityIndicator size="small" color={themeColors.primary} />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={19} color={themeColors.primary} />
                )}
              </TouchableOpacity>
            )}
            {!midA.planReadOnly && (
              <TouchableOpacity
                style={styles.planLuxuryOverviewIconBtn}
                activeOpacity={0.75}
                onPress={midA.handleOpenShareModal}
                disabled={midA.shareModalBusy}
                accessibilityRole="button"
                accessibilityLabel="Link and share options"
              >
                <Ionicons name="link-outline" size={19} color={themeColors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.planLuxuryOverviewIconBtn}
              activeOpacity={0.75}
              onPress={handleSharePlanWithFriends}
              accessibilityRole="button"
              accessibilityLabel="Share plan as text"
            >
              <Ionicons name="share-outline" size={19} color={themeColors.primary} />
            </TouchableOpacity>
          </View>
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
            </View>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.planLuxuryReelContent}
          accessibilityRole="scrollbar"
          accessibilityLabel="Spot photo previews"
        >
          {reel.map(({ key, uri }) => (
            <View key={String(key)} style={styles.planLuxuryReelThumbWrap}>
              {uri ? (
                <PreviewImage uri={uri} style={styles.planLuxuryReelThumbImg} noFade />
              ) : (
                <View style={[styles.planLuxuryReelThumbImg, styles.planLuxuryReelThumbEmpty]}>
                  <Ionicons name="image-outline" size={18} color="#C7C7CC" />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    )
  }, [
    midA.dayPlan,
    midA.allPlaceMarkers,
    midA.openingMaps,
    midA.handleOpenInGoogleMaps,
    handleSharePlanWithFriends,
    midA.setShowSearchModal,
    midA.sharedCollaboration,
    midA.planReadOnly,
    midA.handleSavePlanToCloud,
    midA.savePlanBusy,
    midA.handleOpenShareModal,
    midA.shareModalBusy,
    midA.activeSavedPlanId,
    midA.savedPlansList,
    midA.handleOpenEditSavedPlanTitle,
  ])


  return { ...midA, handleSharePlanWithFriends, renderPlanTimelineOverviewHeader, handleSurpriseMe, startSetup }
}
