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
  retrievalPersonaCacheKey,
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

  const handleOpenEditSavedPlanTitle = useCallback(
    (planId) => {
      if (!planId) return;
      const row = inner.savedPlansList.find((p) => p.id === planId);
      const initial = typeof row?.title === 'string' && row.title.trim() ? row.title.trim() : 'My plan';
      inner.setEditSavedPlanTitleId(planId);
      inner.setEditSavedPlanTitleDraft(initial);
      inner.setShowEditSavedPlanTitleModal(true);
    },
    [inner.savedPlansList],
  );

  const handleCloseEditSavedPlanTitleModal = useCallback(() => {
    if (inner.editSavedPlanTitleBusy) return;
    inner.setShowEditSavedPlanTitleModal(false);
    inner.setEditSavedPlanTitleId(null);
    inner.setEditSavedPlanTitleDraft('');
  }, [inner.editSavedPlanTitleBusy]);

  const handleSubmitEditSavedPlanTitle = useCallback(async () => {
    if (!inner.editSavedPlanTitleId) return;
    const trimmed = inner.editSavedPlanTitleDraft.trim() || 'My plan';
    inner.setEditSavedPlanTitleBusy(true);
    try {
      await updateSavedPlan(inner.editSavedPlanTitleId, { title: trimmed });
      await inner.refreshSavedPlans();
      inner.setShowEditSavedPlanTitleModal(false);
      inner.setEditSavedPlanTitleId(null);
      inner.setEditSavedPlanTitleDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Could not update title', e?.message ?? 'Try again.');
    } finally {
      inner.setEditSavedPlanTitleBusy(false);
    }
  }, [inner.editSavedPlanTitleId, inner.editSavedPlanTitleDraft, inner.refreshSavedPlans]);

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
        const defaultTitle = `My plan · ${new Date().toLocaleDateString()}`;
        const id = await createSavedPlan({ title: defaultTitle, planData: payload });
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
  }, [inner.dayPlan, inner.activeSavedPlanId, inner.refreshSavedPlans, inner.planReadOnly, inner.sharedCollaboration]);

  const handleOpenShareModal = useCallback(async () => {
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
        planId = await createSavedPlan({
          title: `Plan · ${new Date().toLocaleDateString()}`,
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
      inner.setShowSharePlanModal(true);
    } catch (e) {
      Alert.alert('Could not open sharing', e?.message ?? 'Try again.');
    } finally {
      inner.setShareModalBusy(false);
    }
  }, [inner.dayPlan, inner.activeSavedPlanId, inner.refreshSavedPlans, inner.planReadOnly]);

  const handleConfirmShareSettings = useCallback(async () => {
    if (!inner.activeSavedPlanId) return;
    inner.setShareModalBusy(true);
    try {
      const code = await enableSharingForPlan(inner.activeSavedPlanId, inner.sharePermissionDraft);
      inner.setShareModalCode(code);
      await inner.refreshSavedPlans();
      const link = ExpoLinking.createURL(`plan/${code}`);
      await Clipboard.setStringAsync(`${link}\nCode: ${code}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Copied', 'Link and code are on your clipboard.');
    } catch (e) {
      Alert.alert('Sharing failed', e?.message ?? 'Try again.');
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
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
      if (id === 'other' && !next.includes('other')) inner.setCustomPreferenceInput('')
      return next
    });
  };

  const toggleFoodCategory = (id) => {
    inner.setSelectedFoodCategories((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
      if (id === 'other' && !next.includes('other')) inner.setCustomFoodInput('')
      return next
    });
  };

  const startBackgroundPrefetch = (prefLabels) => {
    const key = (prefLabels || []).join('|');
    if (!key) return;
    const personaKey = retrievalPersonaCacheKey(inner.preferences?.profileSummary)
    const retrievalOpts = { profileNarrative: inner.preferences?.profileSummary || '' }
    const cached = inner.prefetchRef.current;
    const hasValidPrefetch =
      cached.prefsKey === key &&
      cached.personaKey === personaKey &&
      Array.isArray(cached.places) &&
      cached.places.length > 0 &&
      Array.isArray(cached.events) &&
      cached.events.length > 0;
    if (hasValidPrefetch) {
      return;
    }
    inner.prefetchRef.current = {
      prefsKey: key,
      personaKey,
      places: null,
      breakfastSpots: null,
      events: null,
    };
    (async () => {
      try {
        const [places, events] = await Promise.all([
          fetchPlaces(prefLabels, retrievalOpts),
          fetchEvents(prefLabels, retrievalOpts),
        ]);
        inner.prefetchRef.current = {
          prefsKey: key,
          personaKey,
          places,
          breakfastSpots: null,
          events,
        };
      } catch {
        // best-effort prefetch; ignore errors
      }
    })();
  };
  return { ...inner, appliedLinkCodeRef, handleOpenEditSavedPlanTitle, handleCloseEditSavedPlanTitleModal, handleSubmitEditSavedPlanTitle, handleRequestDeleteSavedPlan, fitMapToPlan, applyShareCodeFromString, handleOpenSavedPlanRow, handleSavePlanToCloud, handleOpenShareModal, handleConfirmShareSettings, handleCopyShareLinkOnly, handleDisableSharing, formatSavedPlanDate, togglePreference, toggleFoodCategory, startBackgroundPrefetch }
}
