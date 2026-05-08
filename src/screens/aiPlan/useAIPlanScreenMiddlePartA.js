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
  fetchBreakfastSpots,
  fetchEvents,
  generateDayPlan,
  generatePlanTitleFromAI,
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
  PLAN_MODAL_MAX_FOOD_CATEGORIES,
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


export function useAIPlanScreenMiddlePartA(inner) {

  useEffect(
    () => () => {
      const box = inner.markerShowcaseRef?.current
      if (box) {
        box.generation += 1
        const ids = Array.isArray(box.timeoutIds) ? box.timeoutIds : []
        ids.forEach(clearTimeout)
        box.timeoutIds = []
      }
      if (inner.mapProgrammaticMoveClearTimerRef.current) {
        clearTimeout(inner.mapProgrammaticMoveClearTimerRef.current);
        inner.mapProgrammaticMoveClearTimerRef.current = null;
      }
    },
    [],
  );

  const formatSavedPlanDate = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays <= 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const handleRequestDeleteSavedPlan = useCallback(
    (plan) => {
      if (!plan?.id) return;
      const label = typeof plan.title === 'string' && plan.title.trim() ? plan.title.trim() : 'this plan';
      Alert.alert(
        'Delete saved plan?',
        `“${label}” will be removed from your saved plans. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteSavedPlan(plan.id);
                if (inner.activeSavedPlanId === plan.id) {
                  inner.setDrawerStep(0);
                  inner.setDayPlan(null);
                  inner.setError(null);
                  inner.setActiveSavedPlanId(null);
                  inner.setSharedCollaboration(null);
                  inner.setQuickFindMapOnly(false);
                  inner.resetQuickFindRotationState();
                }
                await inner.refreshSavedPlans();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              } catch (e) {
                Alert.alert('Delete failed', e?.message ?? 'Try again.');
              }
            },
          },
        ],
      );
    },
    [inner.activeSavedPlanId, inner.refreshSavedPlans],
  );

  const fitMapToPlan = useCallback((plan) => {
    if (!plan?.length) return;
    const markers = buildMapMarkers(plan, inner.allPlaceMarkers).filter((m) => m.lat && m.lng);
    const coords = markers.map((m) => ({ latitude: m.lat, longitude: m.lng }));
    const u = inner.userLocationRef.current;
    if (u?.latitude != null && u?.longitude != null) {
      coords.push({ latitude: u.latitude, longitude: u.longitude });
    }
    if (coords.length > 0 && inner.mapRef.current) {
      inner.markProgrammaticMapMove(2200);
      inner.mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
        animated: true,
      });
    }
  }, [inner.allPlaceMarkers]);

  const applyShareCodeFromString = useCallback(async (rawCode) => {
    const code = normalizeShareCode(rawCode);
    if (code.length < 6) {
      Alert.alert('Invalid code', 'Enter the full share code.');
      return;
    }
    inner.setJoinCodeBusy(true);
    try {
      const payload = await fetchSharedPlanByCode(code);
      if (!payload?.plan_data) {
        Alert.alert('Not found', 'Check the code and try again.');
        return;
      }
      const planArr = Array.isArray(payload.plan_data) ? payload.plan_data : [];
      const enriched = await enrichPlanWithClientData(planArr, [], inner.allPlaceMarkers);
      inner.setDayPlan(attachPlanRowKeys(enriched));
      inner.setPineconeMatches([]);
      inner.setError(null);
      inner.setQuickFindMapOnly(false);
      inner.resetQuickFindRotationState();
      inner.setDrawerStep(3);
      inner.setActiveSavedPlanId(payload.id);
      const ownerId = payload.owner_id;
      const perm = payload.share_permission === 'edit' ? 'edit' : 'view';
      const uid = inner.user?.id;
      if (uid && ownerId && uid === ownerId) {
        inner.setSharedCollaboration({ code, role: 'owner', planId: payload.id, ownerId });
      } else if (perm === 'edit') {
        inner.setSharedCollaboration({ code, role: 'editor', planId: payload.id, ownerId });
      } else {
        inner.setSharedCollaboration({ code, role: 'viewer', planId: payload.id, ownerId });
      }
      inner.setJoinCodeInput('');
      inner.setRevealingPins(true);
      inner.setVisiblePinCount(0);
      inner.sheetOpacity.setValue(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      requestAnimationFrame(() => {
        fitMapToPlan(enriched);
      });
    } catch (e) {
      Alert.alert('Could not open plan', e?.message ?? 'Try again.');
    } finally {
      inner.setJoinCodeBusy(false);
    }
  }, [inner.allPlaceMarkers, inner.user?.id, fitMapToPlan, inner.sheetOpacity]);

  const handleOpenSavedPlanRow = useCallback(async (row) => {
    if (!row?.plan_data) return;
    const planArr = Array.isArray(row.plan_data) ? row.plan_data : [];
    inner.setJoinCodeBusy(true);
    try {
      const enriched = await enrichPlanWithClientData(planArr, [], inner.allPlaceMarkers);
      inner.setDayPlan(attachPlanRowKeys(enriched));
      inner.setPineconeMatches([]);
      inner.setError(null);
      inner.setQuickFindMapOnly(false);
      inner.resetQuickFindRotationState();
      inner.setDrawerStep(3);
      inner.setActiveSavedPlanId(row.id);
      inner.setSharedCollaboration(null);
      inner.setRevealingPins(true);
      inner.setVisiblePinCount(0);
      inner.sheetOpacity.setValue(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      requestAnimationFrame(() => {
        fitMapToPlan(enriched);
      });
    } catch (e) {
      Alert.alert('Could not load plan', e?.message ?? 'Try again.');
    } finally {
      inner.setJoinCodeBusy(false);
    }
  }, [inner.allPlaceMarkers, fitMapToPlan, inner.sheetOpacity]);

  const handleSavePlanToCloud = useCallback(async () => {
    if (!inner.dayPlan?.length) {
      Alert.alert('Nothing to save', 'Generate or open a plan first.');
      return;
    }
    if (inner.planReadOnly) {
      Alert.alert('View only', 'This plan is shared for viewing only.');
      return;
    }
    inner.setSavePlanBusy(true);
    try {
      const payload = serializePlanForStorage(inner.dayPlan);
      if (inner.sharedCollaboration?.role === 'editor' && inner.sharedCollaboration.code) {
        await pushSharedPlanUpdate(inner.sharedCollaboration.code, payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Saved', 'Your edits are synced to the shared plan.');
        return;
      }
      if (inner.activeSavedPlanId) {
        await updateSavedPlan(inner.activeSavedPlanId, { planData: payload });
        await inner.refreshSavedPlans();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Saved', 'Your plan is updated.');
      } else {
        const aiTitle = await generatePlanTitleFromAI(inner.dayPlan, {
          profileNarrative: inner.preferences?.profileSummary || '',
          viewerUType: inner.viewerUType,
        });
        const id = await createSavedPlan({ title: aiTitle, planData: payload });
        if (id) inner.setActiveSavedPlanId(id);
        await inner.refreshSavedPlans();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Saved', 'Your plan is stored in Saved plans.');
      }
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    } finally {
      inner.setSavePlanBusy(false);
    }
  }, [inner.dayPlan, inner.activeSavedPlanId, inner.refreshSavedPlans, inner.planReadOnly, inner.sharedCollaboration, inner.preferences?.profileSummary, inner.viewerUType]);

  const autoSavePlanSilently = useCallback(
    async (planOverride) => {
      const sourcePlan = Array.isArray(planOverride) ? planOverride : inner.dayPlan
      if (!Array.isArray(sourcePlan) || sourcePlan.length === 0) return
      if (inner.planReadOnly) return

      const payload = serializePlanForStorage(sourcePlan)
      if (!Array.isArray(payload) || payload.length === 0) return

      if (inner.sharedCollaboration?.role === 'editor' && inner.sharedCollaboration.code) {
        await pushSharedPlanUpdate(inner.sharedCollaboration.code, payload)
        return
      }

      if (inner.activeSavedPlanId) {
        await updateSavedPlan(inner.activeSavedPlanId, { planData: payload })
        return
      }

      const aiTitle = await generatePlanTitleFromAI(sourcePlan, {
        profileNarrative: inner.preferences?.profileSummary || '',
        viewerUType: inner.viewerUType,
      })
      const id = await createSavedPlan({ title: aiTitle, planData: payload })
      if (id) inner.setActiveSavedPlanId(id)
      await inner.refreshSavedPlans()
    },
    [
      inner.dayPlan,
      inner.planReadOnly,
      inner.sharedCollaboration,
      inner.activeSavedPlanId,
      inner.refreshSavedPlans,
      inner.preferences?.profileSummary,
      inner.viewerUType,
    ],
  )

  const handleOpenShareModal = useCallback(async (options = {}) => {
    const openModal = options?.openModal !== false
    if (!inner.dayPlan?.length) {
      Alert.alert('Nothing to share', 'Create a plan first.');
      return;
    }
    if (inner.planReadOnly) {
      Alert.alert('View only', 'You cannot change sharing on a view-only plan.');
      return;
    }
    inner.setShareModalBusy(true);
    try {
      let planId = inner.activeSavedPlanId;
      if (!planId) {
        const payload = serializePlanForStorage(inner.dayPlan);
        const aiTitle = await generatePlanTitleFromAI(inner.dayPlan, {
          profileNarrative: inner.preferences?.profileSummary || '',
          viewerUType: inner.viewerUType,
        });
        planId = await createSavedPlan({
          title: aiTitle,
          planData: payload,
        });
        if (planId) inner.setActiveSavedPlanId(planId);
        await inner.refreshSavedPlans();
      }
      if (!planId) {
        Alert.alert('Save first', 'Could not save plan for sharing.');
        return;
      }
      const rows = await listSavedPlans();
      const row = rows.find((r) => r.id === planId);
      inner.setSharePermissionDraft(row?.share_permission === 'edit' ? 'edit' : 'view');
      inner.setShareModalCode(row?.share_code || null);
      if (openModal) inner.setShowSharePlanModal(true);
    } catch (e) {
      Alert.alert('Could not open sharing', e?.message ?? 'Try again.');
    } finally {
      inner.setShareModalBusy(false);
    }
  }, [inner.dayPlan, inner.activeSavedPlanId, inner.refreshSavedPlans, inner.planReadOnly, inner.preferences?.profileSummary, inner.viewerUType]);

  const handleConfirmShareSettings = useCallback(async (options = {}) => {
    const skipClipboard = options?.skipClipboard === true
    const skipSuccessAlert = options?.skipSuccessAlert === true
    if (!inner.activeSavedPlanId) return;
    inner.setShareModalBusy(true);
    try {
      const code = await enableSharingForPlan(inner.activeSavedPlanId, inner.sharePermissionDraft);
      inner.setShareModalCode(code);
      await inner.refreshSavedPlans();
      if (!skipClipboard) {
        const link = ExpoLinking.createURL(`plan/${code}`);
        await Clipboard.setStringAsync(`${link}\nCode: ${code}`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!skipSuccessAlert) {
        Alert.alert('Copied', 'Link and code are on your clipboard.');
      }
      return code;
    } catch (e) {
      Alert.alert('Sharing failed', e?.message ?? 'Try again.');
      return null;
    } finally {
      inner.setShareModalBusy(false);
    }
  }, [inner.activeSavedPlanId, inner.sharePermissionDraft, inner.refreshSavedPlans]);

  const handleCopyShareLinkOnly = useCallback(async () => {
    if (!inner.shareModalCode) return;
    try {
      const link = ExpoLinking.createURL(`plan/${inner.shareModalCode}`);
      await Clipboard.setStringAsync(`${link}\nCode: ${inner.shareModalCode}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Alert.alert('Copied', 'Link and code copied.');
    } catch (_) {
      /* ignore */
    }
  }, [inner.shareModalCode]);

  const handleDisableSharing = useCallback(async () => {
    if (!inner.activeSavedPlanId) return;
    inner.setShareModalBusy(true);
    try {
      await disableSharingForPlan(inner.activeSavedPlanId);
      inner.setShareModalCode(null);
      await inner.refreshSavedPlans();
    } catch (e) {
      Alert.alert('Could not turn off sharing', e?.message ?? 'Try again.');
    } finally {
      inner.setShareModalBusy(false);
    }
  }, [inner.activeSavedPlanId, inner.refreshSavedPlans]);

  const appliedLinkCodeRef = useRef(null)
  useEffect(() => {
    const raw = inner.route.params?.shareCode || inner.route.params?.code
    if (!raw) return
    const n = normalizeShareCode(String(raw))
    if (n.length < 6) return
    if (appliedLinkCodeRef.current === n) return
    appliedLinkCodeRef.current = n
    applyShareCodeFromString(n)
  }, [inner.route.params?.shareCode, inner.route.params?.code, applyShareCodeFromString])

  useEffect(() => {
    const savedPlan = inner.route.params?.openSavedPlan
    if (!savedPlan?.id || !Array.isArray(savedPlan?.plan_data)) return
    handleOpenSavedPlanRow(savedPlan)
    try {
      inner.navigation.setParams({ openSavedPlan: undefined })
    } catch (_) {
      /* older navigators */
    }
  }, [inner.route.params?.openSavedPlan, handleOpenSavedPlanRow])

  useEffect(() => {
    const onUrl = ({ url }) => {
      const c = parseShareCodeFromUrl(url)
      if (c) applyShareCodeFromString(c)
    }
    const sub = ExpoLinking.addEventListener('url', onUrl)
    ExpoLinking.getInitialURL().then((url) => {
      const c = parseShareCodeFromUrl(url || '')
      if (c) applyShareCodeFromString(c)
    })
    return () => sub.remove()
  }, [applyShareCodeFromString])

  useEffect(() => {
    if (!inner.planCollaboratorEdit || !inner.sharedCollaboration?.code) return
    if (!inner.dayPlan?.length) return
    const t = setTimeout(() => {
      pushSharedPlanUpdate(inner.sharedCollaboration.code, serializePlanForStorage(inner.dayPlan)).catch((e) =>
        console.warn('[AI Plan] shared save', e?.message),
      )
    }, 2500)
    return () => clearTimeout(t)
  }, [inner.dayPlan, inner.planCollaboratorEdit, inner.sharedCollaboration])

  const togglePreference = (id) => {
    inner.setSelectedPreferences((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id)
      return [...prev, id]
    });
  };

  const toggleFoodCategory = (id) => {
    inner.setSelectedFoodCategories((prev) => {
      if (prev.includes(id)) return prev.filter((f) => f !== id)
      if (prev.length >= PLAN_MODAL_MAX_FOOD_CATEGORIES) return prev
      return [...prev, id]
    });
  };

  const startBackgroundPrefetch = (prefLabels) => {
    const key = (prefLabels || []).join('|');
    if (!key) return;
    const warmupKey = planRetrievalContextKey(inner.preferences?.profileSummary, inner.preferences?.profileAnswers)
    const retrievalOpts = {
      profileNarrative: inner.preferences?.profileSummary || '',
      profileAnswers: inner.preferences?.profileAnswers || {},
      profileActivity: inner.activityLabels,
    }
    const cached = inner.prefetchRef.current;
    const hasValidPrefetch =
      cached.prefsKey === key &&
      cached.warmupKey === warmupKey &&
      Array.isArray(cached.places) &&
      cached.places.length > 0 &&
      Array.isArray(cached.events) &&
      cached.events.length > 0 &&
      Array.isArray(cached.breakfastSpots) &&
      cached.breakfastSpots.length > 0;
    if (hasValidPrefetch) {
      return;
    }
    inner.prefetchRef.current = {
      prefsKey: key,
      warmupKey,
      places: null,
      breakfastSpots: null,
      events: null,
    };
    (async () => {
      try {
        const [places, events, breakfastSpots] = await Promise.all([
          fetchPlaces(prefLabels, retrievalOpts),
          fetchEvents(prefLabels, retrievalOpts),
          fetchBreakfastSpots(retrievalOpts),
        ]);
        inner.prefetchRef.current = {
          prefsKey: key,
          warmupKey,
          places,
          breakfastSpots,
          events,
        };
      } catch {
        // best-effort prefetch; ignore errors
      }
    })();
  };
  return { ...inner, appliedLinkCodeRef, handleRequestDeleteSavedPlan, fitMapToPlan, applyShareCodeFromString, handleOpenSavedPlanRow, handleSavePlanToCloud, autoSavePlanSilently, handleOpenShareModal, handleConfirmShareSettings, handleCopyShareLinkOnly, handleDisableSharing, formatSavedPlanDate, togglePreference, toggleFoodCategory, startBackgroundPrefetch }
}
