import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
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
} from 'react-native';
import { CachedImage, prefetchImageUrls } from '../components/CachedImage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
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
} from 'react-native-reanimated';
import { Gesture, GestureDetector, ScrollView as GHScrollView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import * as ExpoLinking from 'expo-linking';
import { openGoogleMapsDirections } from '../utils/googleMapsDirections';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import {
  fetchPlaces,
  fetchRestaurants,
  fetchBreakfastSpots,
  fetchEvents,
  generateDayPlan,
  fetchClientsWithLocation,
  enhancePlanStopAtIndex,
  retrievalPersonaCacheKey,
} from '../services/aiPipeline';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { colors as themeColors } from '../theme/designTokens';
import styles from './AIPlanScreen.styles';
import { luxurySoftShadow } from '../theme/luxuryPremium';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { getCommunityPalette } from '../components/community/CommunityReviewViews';
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
} from '../services/savedPlans';
import ClientProfileModal from '../components/ClientProfileModal';
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../utils/imageUrl';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Plan map: same chip row as Community (All + Food/Places/Events icons); ids align with `client.client_type` buckets. */
const PLAN_MAP_CLIENT_TYPE_FILTERS = [
  { id: 'all', label: 'All', icon: 'apps-outline' },
  { id: 'restaurant', label: 'Restaurants', icon: 'restaurant-outline' },
  { id: 'place', label: 'Places', icon: 'location-outline' },
  { id: 'event', label: 'Events', icon: 'calendar-outline' },
];

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

/** Animated wrapper for stop rows - pops in when isVisible becomes true */
const AnimatedStopRow = ({ isVisible, children, style }) => {
  const scale = useSharedValue(0)
  const opacity = useSharedValue(0)
  
  React.useEffect(() => {
    if (isVisible) {
      scale.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.7 })
      opacity.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.7 })
    } else {
      scale.value = 0
      opacity.value = 0
    }
  }, [isVisible])
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))
  
  return (
    <Reanimated.View style={[style, animatedStyle]}>
      {children}
    </Reanimated.View>
  )
}

/** Stable keys for draggable list rows (persist across reorder; replace on enhance). */
function attachPlanRowKeys(plan) {
  if (!Array.isArray(plan)) return plan
  return plan.map((item, idx) => ({
    ...item,
    _planRowKey: item._planRowKey || `rk-${idx}-${Math.random().toString(36).slice(2, 11)}`,
  }))
}

const PLAN_TIME_SLOTS = ['Morning', 'Afternoon', 'Evening']

function inferTimeSlotForNewStop(plan) {
  if (!Array.isArray(plan) || plan.length === 0) return 'Afternoon'
  const last = plan[plan.length - 1]
  const t = last?.time
  if (t && PLAN_TIME_SLOTS.includes(t)) return t
  return 'Afternoon'
}

/** Draft plan row from a Supabase client row (coords filled in by enrichPlanWithClientData). */
function buildDraftStopFromClient(client, existingPlan) {
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

const getLuxuryCategoryStyle = (item) => {
  if (item.type === 'restaurant') {
    return { label: 'Dining', bg: '#FFE8EE', fg: '#FF4B78', icon: 'restaurant-outline' }
  }
  if (item.type === 'event') {
    return { label: 'Events', bg: '#EDE9FE', fg: '#7C3AED', icon: 'calendar-outline' }
  }
  return { label: 'Attractions', bg: '#FFE4F0', fg: '#DB2777', icon: 'location-outline' }
}

// Open Google Maps with directions from current location through all plan stops in order
const openAllStopsInGoogleMaps = async (plan) => {
  const markers = (plan || []).map((item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
  }).filter(Boolean);
  if (markers.length === 0) return;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location needed', 'Enable location access to get directions from your current position.');
      return;
    }
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const origin = `${coords.latitude},${coords.longitude}`;
    const destination = `${markers[markers.length - 1].lat},${markers[markers.length - 1].lng}`;
    const waypoints = markers.length > 1
      ? markers.slice(0, -1).map((m) => `${m.lat},${m.lng}`).join('|')
      : null;
    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    Linking.openURL(url).catch(() => {});
  } catch (e) {
    Alert.alert('Location error', e?.message ?? 'Could not get your location. Enable location and try again.');
  }
};

/** Rich share / copy text for AI day plan (and invite when plan is empty). */
function formatPlanShareMessage(plan) {
  if (!plan || plan.length === 0) {
    return {
      message:
        '🇧🇭 Plan an amazing day in Bahrain with SiyahaBH!\n\n' +
        'AI-crafted itineraries — dining, culture, and events — tailored to you.\n\n' +
        'Download the app and tap "Build my day". Yalla!',
      title: 'SiyahaBH',
    };
  }
  const meals = plan.filter((i) => i.type === 'restaurant').length;
  const events = plan.filter((i) => i.type === 'event').length;
  const other = Math.max(0, plan.length - meals - events);
  const header =
    `🇧🇭 My Bahrain day — ${plan.length} stops\n` +
    `${meals} meal${meals !== 1 ? 's' : ''} · ${events} event${events !== 1 ? 's' : ''} · ${other} place${other !== 1 ? 's' : ''}\n`;
  const lines = plan.map((item, i) => {
    const icon = item.type === 'restaurant' ? '🍽' : item.type === 'event' ? '📅' : '📍';
    const slot = item.time ? ` · ${item.time}` : '';
    let block = `${i + 1}. ${icon} ${item.spot || 'Stop'}${slot}`;
    if (item.reason && String(item.reason).trim()) {
      const r = String(item.reason).replace(/\s+/g, ' ').trim();
      const short = r.length > 100 ? `${r.slice(0, 97)}…` : r;
      block += `\n   ${short}`;
    }
    return block;
  });
  return {
    message: `${header}\n${lines.join('\n\n')}\n\n— Shared from SiyahaBH`,
    title: 'My Bahrain itinerary',
  };
}

function parseShareCodeFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams || {};
    if (q.code) return String(q.code);
    if (q.shareCode) return String(q.shareCode);
    const path = parsed.path || '';
    const m = String(path).match(/plan\/([^/?]+)/i);
    if (m) return m[1];
  } catch (_) {
    /* ignore */
  }
  return null;
}

/** Staggered spring entrance (Reanimated layout). */
function AiStagger({ children, delay = 0, style, entering }) {
  const defaultEntering = FadeInDown.springify()
    .damping(17)
    .stiffness(210)
    .mass(0.65)
    .delay(delay)
  return (
    <Reanimated.View entering={entering ?? defaultEntering} style={style}>
      {children}
    </Reanimated.View>
  )
}

function PopIn({ delay = 0, trigger, children, style }) {
  const scale = useRef(new Animated.Value(0.7)).current
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(14)).current

  useEffect(() => {
    scale.setValue(0.7)
    opacity.setValue(0)
    ty.setValue(14)
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 170, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, tension: 170, friction: 10, useNativeDriver: true }),
      ]).start()
    }, delay)
    return () => clearTimeout(timer)
  }, [trigger])

  return (
    <Animated.View style={[style, { transform: [{ scale }, { translateY: ty }], opacity }]}>
      {children}
    </Animated.View>
  )
}

function PlanStepBubble({ step, children }) {
  return (
    <View style={styles.planModalPresenceLayer} key={step}>
      {children}
    </View>
  )
}

const hexToRgba = (hex, alpha) => {
  const raw = String(hex || '').replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length < 6) return `rgba(255,255,255,${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function AnimatedOptionChip({ item, isSelected, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (isSelected) {
      Animated.spring(scaleAnim, { toValue: 1.02, tension: 260, friction: 11, useNativeDriver: true }).start()
    } else {
      Animated.spring(scaleAnim, { toValue: 1, tension: 230, friction: 13, useNativeDriver: true }).start()
    }
  }, [isSelected, scaleAnim])

  return (
    <Animated.View style={styles.pmChipWrap}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.pmChip,
          isSelected && styles.pmChipSelected,
          isSelected && {
            backgroundColor: item.color,
            borderColor: 'rgba(255,255,255,0.88)',
            shadowColor: item.color,
          },
        ]}
        activeOpacity={0.75}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={item.label}
      >
        {isSelected && (
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 26 }]}
            pointerEvents="none"
          />
        )}
        <View
          style={[
            styles.pmChipIcon,
            isSelected && { backgroundColor: 'rgba(255,255,255,0.28)' },
            !isSelected && { backgroundColor: hexToRgba(item.color, 0.16) },
          ]}
        >
          <Ionicons name={item.icon} size={17} color={isSelected ? '#FFFFFF' : item.color} />
        </View>
        <Text style={[styles.pmChipText, isSelected && styles.pmChipTextSelected]}>
          {item.label}
        </Text>
        <View style={styles.pmChipCheckSlot}>
          {isSelected ? (
            <View style={styles.pmChipCheck}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  )
}


/** Bottom inset for plan sheet / marker sheet — matches floating BottomControlBar (lifted FAB + dock) + safe area */
const PLAN_TAB_BAR_ROW_HEIGHT = 100
const getPlanSheetBottomPadding = (insets) => {
  const bottomInset = Math.max(insets?.bottom ?? 0, 12)
  return PLAN_TAB_BAR_ROW_HEIGHT + bottomInset + 16
}

const SHEET_VISIBLE_PEEK = 0.28;
const SHEET_VISIBLE_MID = 0.75;
/** Fraction of screen height for the sheet (list + masthead). Higher = taller plan container */
const SHEET_VISIBLE_EXPANDED = 0.94;

const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_VISIBLE_EXPANDED;
const SHEET_TOP_EXPANDED = SCREEN_HEIGHT - SHEET_HEIGHT;
const SHEET_TOP_MID = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_MID);
const SHEET_TOP_PEEK = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_PEEK);

const SNAP_POINTS = [
  0,
  SHEET_TOP_MID - SHEET_TOP_EXPANDED,
  SHEET_TOP_PEEK - SHEET_TOP_EXPANDED,
];
const INITIAL_SNAP_INDEX = 2;

const BAHRAIN_REGION = {
  latitude: 26.0667,
  longitude: 50.5577,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const BAHRAIN_BOUNDS = {
  minLat: 25.55,
  maxLat: 26.40,
  minLng: 50.30,
  maxLng: 50.95,
};

function clampRegionToBahrain(region) {
  if (!region) return region;
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  return {
    ...region,
    latitude: Math.min(BAHRAIN_BOUNDS.maxLat, Math.max(BAHRAIN_BOUNDS.minLat, latitude)),
    longitude: Math.min(BAHRAIN_BOUNDS.maxLng, Math.max(BAHRAIN_BOUNDS.minLng, longitude)),
    latitudeDelta,
    longitudeDelta,
  };
}

function isWithinBahrainBounds(lat, lng) {
  return (
    lat >= BAHRAIN_BOUNDS.minLat &&
    lat <= BAHRAIN_BOUNDS.maxLat &&
    lng >= BAHRAIN_BOUNDS.minLng &&
    lng <= BAHRAIN_BOUNDS.maxLng
  );
}

/** GPT sometimes swaps lat/lng; accept only pairs that fall inside Bahrain after optional swap */
function unswapLatLng(lat, lng) {
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  if (Number.isNaN(la) || Number.isNaN(ln) || (la === 0 && ln === 0)) return null;
  if (isWithinBahrainBounds(la, ln)) return { lat: la, lng: ln };
  if (isWithinBahrainBounds(ln, la)) return { lat: ln, lng: la };
  return null;
}

function parsePlanItemCoords(item) {
  if (!item) return null;
  return unswapLatLng(item.lat, item.lng);
}

function parseCoordsFromPineconeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const la = parseFloat(meta.lat ?? meta.latitude ?? meta.Lat ?? '');
  const ln = parseFloat(meta.long ?? meta.longitude ?? meta.lng ?? meta.Lng ?? '');
  return unswapLatLng(la, ln);
}

function parseCoordsFromClientRow(row) {
  if (!row || typeof row !== 'object') return null;
  return unswapLatLng(
    row.lat ?? row.latitude,
    row.long ?? row.longitude ?? row.lng
  );
}

import { PREFERENCES, FOOD_CATEGORIES, TRAVEL_EXPLORE_OPTIONS } from '../constants/preferences';

const SURPRISE_THEMES = [
  { label: 'Scenic Day', icon: 'heart', color: themeColors.evening, prefs: ['Landmarks', 'Leisure'], food: ['Italian', 'Seafood'] },
  { label: 'Adventure', icon: 'rocket', color: themeColors.error, prefs: ['Adventure', 'Nature'], food: ['Quick'] },
  { label: 'Chill Vibes', icon: 'leaf', color: themeColors.success, prefs: ['Leisure', 'Nature'], food: ['Café'] },
  { label: 'Foodie Tour', icon: 'restaurant', color: themeColors.dining, prefs: ['Landmarks'], food: ['Subcontinent', 'Seafood', 'Asian'] },
  { label: 'Culture Buff', icon: 'color-palette', color: themeColors.primary, prefs: ['Culture', 'History'], food: ['Local'] },
  { label: 'Nightlife', icon: 'moon', color: themeColors.evening, prefs: ['Photos', 'Leisure'], food: ['Global'] },
  { label: 'Family Fun', icon: 'people', color: themeColors.afternoon, prefs: ['Landmarks', 'Leisure'], food: ['American', 'Quick'] },
  { label: 'Hidden Gems', icon: 'diamond', color: themeColors.morning, prefs: ['Culture', 'Nature'], food: ['Subcontinent', 'Local'] },
];

// Plan modal overlay (modern primary)
const PLAN_COLORS = {
  primary: themeColors.primary,
  overlayQuestionTitle: '#FFFFFF',
  overlayQuestionSub: 'rgba(255,255,255,0.88)',
  overlayBlockBg: 'rgba(255,255,255,0.2)',
  overlayBlockBorder: 'rgba(255,255,255,0.35)',
  overlayBlockText: '#FFFFFF',
};

// Build lightweight preview cards from raw Pinecone matches (with image for visuals)
function buildSpotPreviews(places, restaurants, events) {
  const previews = [];
  const pushFrom = (items, type) => {
    (items || []).forEach((m, idx) => {
      if (previews.length >= 8) return;
      const meta = m.metadata || {};
      const name =
        meta.business_name ||
        meta.event_name ||
        meta.name ||
        `Spot ${previews.length + 1}`;
      const area = meta.area || meta.location || meta.city || '';
      const description =
        meta.short_description ||
        meta.description ||
        meta.summary ||
        '';
      const cuisine = meta.cuisine || meta.cuisine_type;
      const typeLabel =
        type === 'restaurant'
          ? cuisine
            ? `${cuisine} dining`
            : 'Food & drinks'
          : type === 'event'
          ? meta.event_type || 'Event'
          : meta.category || 'Explore';
      const rawImage =
        type === 'event'
          ? meta.image ||
            meta.image_url ||
            meta.thumbnail_url ||
            meta.cover_image ||
            null
          : meta.image_url ||
            meta.thumbnail_url ||
            meta.cover_image ||
            meta.image ||
            null;
      const image = resolvePublicImageUrl(rawImage);
      const clientId = meta.client_a_uuid || meta.id || m.id || null;
      const rating = meta.rating != null && meta.rating !== '' ? meta.rating : null;

      previews.push({
        id: m.id || `${type}-${idx}`,
        name,
        type,
        typeLabel,
        area,
        snippet: description,
        image,
        clientId,
        rating,
      });
    });
  };

  pushFrom(places, 'place');
  pushFrom(restaurants, 'restaurant');
  pushFrom(events, 'event');

  return previews;
}

// Fetch "Places we're considering" from Supabase — uses POSTS table (post_image) + CLIENT table (business_name)
// Posts have images; client has names. Same source as HomeScreen feed.
async function fetchSpotPreviewsFromSupabase() {
  const { data: postRows, error: postErr } = await supabase
    .from('posts')
    .select('client_a_uuid, post_image')
    .not('post_image', 'is', null)
    .not('client_a_uuid', 'is', null)
    .order('created_at', { ascending: false })
    .limit(140);

  if (postErr || !postRows?.length) {
    if (postErr) console.warn('[AIPlan] fetchSpotPreviews posts error:', postErr?.message);
    return [];
  }

  const clientIds = [...new Set(postRows.map((r) => r.client_a_uuid).filter(Boolean))];
  const { data: clients } = await supabase
    .from('client')
    .select('client_a_uuid, business_name, name, client_type')
    .in('client_a_uuid', clientIds);

  const nameByClient = {};
  const typeByClient = {};
  (clients || []).forEach((c) => {
    if (c.client_a_uuid) {
      nameByClient[c.client_a_uuid] = (c.business_name || c.name || 'Spot').trim();
      typeByClient[c.client_a_uuid] = ((c.client_type || '').toLowerCase());
    }
  });

  const shuffleInPlace = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const buckets = { place: [], restaurant: [], event: [] };
  const seenUrl = new Set();

  for (const row of postRows) {
    const rawImg =
      parseStorageImageUrl(row.post_image) ||
      ensureImageUrl(String(row.post_image).trim()) ||
      (row.post_image ? String(row.post_image).trim() : null);
    const image = resolvePublicImageUrl(rawImg) || rawImg;
    if (!image || seenUrl.has(image)) continue;
    seenUrl.add(image);
    const ct = typeByClient[row.client_a_uuid] || '';
    const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place';
    const name = nameByClient[row.client_a_uuid] || 'Spot';
    const typeLabel = type === 'restaurant' ? 'Food & drinks' : type === 'event' ? 'Event' : 'Explore';
    buckets[type].push({
      id: `${row.client_a_uuid}-${image.slice(-24)}`,
      name,
      type,
      typeLabel,
      image,
      clientId: row.client_a_uuid,
    });
  }

  shuffleInPlace(buckets.place);
  shuffleInPlace(buckets.restaurant);
  shuffleInPlace(buckets.event);

  const order = ['place', 'restaurant', 'event'];
  const merged = [];
  let guard = 0;
  while (merged.length < 18 && guard < 400) {
    guard += 1;
    let added = false;
    for (const t of order) {
      if (buckets[t].length > 0) {
        merged.push(buckets[t].shift());
        added = true;
        if (merged.length >= 18) break;
      }
    }
    if (!added) break;
  }

  shuffleInPlace(merged);
  void prefetchImageUrls(merged.map((p) => p.image).filter(Boolean)).catch(() => {});
  return merged;
}

/** Smaller / faster post fetch for first paint (same shape as fetchSpotPreviewsFromSupabase). */
async function getCachedFeedImages() {
  try {
    const { data: postRows, error: postErr } = await supabase
      .from('posts')
      .select('client_a_uuid, post_image')
      .not('post_image', 'is', null)
      .not('client_a_uuid', 'is', null)
      .order('created_at', { ascending: false })
      .limit(48);
    if (postErr || !postRows?.length) return [];
    const clientIds = [...new Set(postRows.map((r) => r.client_a_uuid).filter(Boolean))];
    const { data: clients } = await supabase
      .from('client')
      .select('client_a_uuid, business_name, name, client_type')
      .in('client_a_uuid', clientIds);
    const nameByClient = {};
    const typeByClient = {};
    (clients || []).forEach((c) => {
      if (c.client_a_uuid) {
        nameByClient[c.client_a_uuid] = (c.business_name || c.name || 'Spot').trim();
        typeByClient[c.client_a_uuid] = (c.client_type || '').toLowerCase();
      }
    });
    const shuffleInPlace = (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const buckets = { place: [], restaurant: [], event: [] };
    const seenUrl = new Set();
    for (const row of postRows) {
      const rawImg =
        parseStorageImageUrl(row.post_image) ||
        ensureImageUrl(String(row.post_image).trim()) ||
        (row.post_image ? String(row.post_image).trim() : null);
      const image = resolvePublicImageUrl(rawImg) || rawImg;
      if (!image || seenUrl.has(image)) continue;
      seenUrl.add(image);
      const ct = typeByClient[row.client_a_uuid] || '';
      const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place';
      const name = nameByClient[row.client_a_uuid] || 'Spot';
      const typeLabel = type === 'restaurant' ? 'Food & drinks' : type === 'event' ? 'Event' : 'Explore';
      buckets[type].push({
        id: `${row.client_a_uuid}-${image.slice(-24)}`,
        name,
        type,
        typeLabel,
        image,
        clientId: row.client_a_uuid,
      });
    }
    shuffleInPlace(buckets.place);
    shuffleInPlace(buckets.restaurant);
    shuffleInPlace(buckets.event);
    const order = ['place', 'restaurant', 'event'];
    const merged = [];
    let guard = 0;
    while (merged.length < 12 && guard < 200) {
      guard += 1;
      let added = false;
      for (const t of order) {
        if (buckets[t].length > 0) {
          merged.push(buckets[t].shift());
          added = true;
          if (merged.length >= 12) break;
        }
      }
      if (!added) break;
    }
    shuffleInPlace(merged);
    void prefetchImageUrls(merged.map((p) => p.image).filter(Boolean)).catch(() => {});
    return merged;
  } catch {
    return [];
  }
}

// Enrich spot previews: client_image only (no post images) — used when we have Pinecone IDs
async function enrichSpotPreviewsWithClientImages(previews) {
  if (!previews?.length) return previews;
  const ids = [...new Set(previews.map((p) => p.clientId).filter(Boolean))];
  if (ids.length === 0) return previews;

  const { data: clients } = await supabase
    .from('client')
    .select('client_a_uuid, client_image, business_name, name')
    .in('client_a_uuid', ids);

  const imageByClientId = {};
  const nameByClientId = {};
  (clients || []).forEach((c) => {
    if (c.client_a_uuid) {
      nameByClientId[c.client_a_uuid] = c.business_name || c.name || '';
      if (c.client_image) {
        const u = resolvePublicImageUrl(String(c.client_image).trim());
        if (u) imageByClientId[c.client_a_uuid] = u;
      }
    }
  });

  const enriched = previews.map((p) => {
    const url = p.clientId ? imageByClientId[p.clientId] : null;
    return url ? { ...p, image: url } : p;
  });
  void prefetchImageUrls(enriched.map((p) => p.image).filter(Boolean)).catch(() => {});
  return enriched;
}

// Build spot previews from plan spot names (for mock/fallback when Pinecone returns empty)
function buildSpotPreviewsFromPlan(plan) {
  return (plan || []).slice(0, 8).map((item, idx) => ({
    id: `plan-${idx}`,
    name: item.spot || `Spot ${idx + 1}`,
    type: item.type || 'place',
    typeLabel: item.type === 'restaurant' ? 'Food & drinks' : item.type === 'event' ? 'Event' : 'Explore',
    area: '',
    snippet: item.reason || '',
    image: null,
    clientId: null,
    rating: null,
  }));
}

/** Event fields from Pinecone / catalog metadata for itinerary detail UI */
function buildEventMetadataFromPineconeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  const venue = String(meta.venue || meta.location || meta.area || meta.city || '').trim()
  const startDate = String(meta.start_date || meta.startDate || '').trim()
  const endDate = String(meta.end_date || meta.endDate || '').trim()
  const startTime = String(meta.start_time || meta.startTime || '').trim()
  const endTime = String(meta.end_time || meta.endTime || '').trim()
  const eventType = String(meta.event_type || meta.eventType || '').trim()
  const description = String(meta.short_description || meta.description || meta.summary || '').trim()
  const hasAny = venue || startDate || endDate || startTime || endTime || eventType || description
  if (!hasAny) return null
  return { venue, startDate, endDate, startTime, endTime, eventType, description }
}

/** Body copy for the stop-detail “Event details” section (metadata + fallbacks). */
function formatStopEventDetailsText(item) {
  if (!item || item.type !== 'event') return ''
  const m = item.eventMetadata
  const blocks = []
  if (m?.eventType) blocks.push(`Type · ${m.eventType}`)
  const dateStr = [m?.startDate, m?.endDate].filter(Boolean).join(' → ')
  if (dateStr) blocks.push(`Date · ${dateStr}`)
  const timeStr = [m?.startTime, m?.endTime].filter(Boolean).join(' – ')
  if (timeStr) blocks.push(`Time · ${timeStr}`)
  else if (item.time) blocks.push(`Time · ${item.time}`)
  if (m?.venue) blocks.push(`Venue · ${m.venue}`)
  if (m?.description) blocks.push(m.description)
  if (blocks.length > 0) return blocks.join('\n\n')
  const r = String(item.reason || '').trim()
  if (r) {
    const sentences = r.split(/(?<=[.!?])\s+/).filter(Boolean)
    const rest = sentences.slice(1).join(' ').trim()
    if (rest) return rest
    return r
  }
  return 'Event details will appear here when available.'
}

/** Primary copy for the stop-detail “About” card — user-added stops prefer catalog description. */
function getStopAboutPrimaryText(item, isEvent) {
  const pd = String(item.placeDescription || '').trim()
  if (item.userAdded && pd) return pd
  const r = String(item.reason || '').trim()
  if (!r) {
    return isEvent
      ? 'A quick take on this event will appear here.'
      : 'Details for this stop will appear here.'
  }
  const parts = r.split(/(?<=[.!?])\s+/).filter(Boolean)
  return parts[0] || r
}

// Match plan item to Pinecone match by spot name (exact preferred, then fuzzy), extract image + clientId + canonical coords
function matchPlanToPinecone(planItem, pineconeMatches) {
  if (!planItem || !pineconeMatches?.length) return null;
  const spotName = (planItem.spot || '').trim().toLowerCase();
  if (!spotName) return null;
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  let best = null;
  let bestScore = -1;
  for (const m of pineconeMatches) {
    const meta = m.metadata || {};
    const names = [meta.business_name, meta.event_name, meta.name, meta.place_name].filter(Boolean);
    let matchRank = 0;
    for (const n of names) {
      const nn = norm(n);
      if (!nn) continue;
      if (nn === spotName) {
        matchRank = 2;
        break;
      }
      if (nn.includes(spotName) || spotName.includes(nn)) matchRank = Math.max(matchRank, 1);
    }
    if (matchRank === 0) continue;
    const coords = parseCoordsFromPineconeMetadata(meta);
    const score = matchRank * 10 + (coords ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      const isEventStop = planItem.type === 'event'
      const isEventMeta = isEventStop || meta.record_type === 'event'
      const rawImg = isEventMeta
        ? meta.image ||
          meta.image_url ||
          meta.thumbnail_url ||
          meta.cover_image ||
          meta.client_image ||
          null
        : meta.image_url ||
          meta.thumbnail_url ||
          meta.cover_image ||
          meta.image ||
          meta.client_image ||
          null
      const image = resolvePublicImageUrl(rawImg)
      const clientId = meta.client_a_uuid || meta.id || m.id || null;
      const rating = meta.rating != null && meta.rating !== '' ? meta.rating : null;
      const eventMetadata = isEventStop ? buildEventMetadataFromPineconeMeta(meta) : null
      best = { image, clientId, rating, coords, eventMetadata };
    }
  }
  return best;
}

// Normalize name for matching (lowercase, collapse spaces, remove common suffixes)
function normName(s) {
  if (!s || typeof s !== 'string') return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(bahrain|city centre|mall|centre|center)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Match plan item to Supabase client by business_name (fuzzy, relaxed)
function matchPlanToClient(planItem, clients) {
  if (!planItem || !clients?.length) return null;
  const spotName = (planItem.spot || '').trim().toLowerCase();
  if (!spotName) return null;
  const spotNorm = normName(spotName);
  const spotWords = spotNorm.split(/\s+/).filter((w) => w.length > 1);
  for (const c of clients) {
    const name = (c.business_name || c.name || c.business_name_ar || '').trim();
    if (!name) continue;
    const n = normName(name);
    if (!n) continue;
    // Exact or substring match
    if (n === spotNorm || n.includes(spotNorm) || spotNorm.includes(n)) return c;
    // Word overlap: e.g. "cafe lilou" matches "Café Lilou"
    const nameWords = n.split(/\s+/).filter((w) => w.length > 1);
    const overlap = spotWords.filter((w) => nameWords.some((nw) => nw.includes(w) || w.includes(nw)));
    if (overlap.length >= Math.min(2, spotWords.length, nameWords.length)) return c;
  }
  return null;
}

/** Raw image fields from a plan row (enriched or API). */
function collectPlanStopImageRawUrls(item) {
  if (!item || typeof item !== 'object') return []
  const out = []
  const push = (v) => {
    if (v == null) return
    if (typeof v === 'string' && v.trim()) out.push(v.trim())
    else if (typeof v === 'object' && v.url) out.push(String(v.url).trim())
  }
  if (Array.isArray(item.images)) item.images.forEach(push)
  push(item.image)
  push(item.client_image)
  push(item.photo_url)
  push(item.thumbnail_url)
  push(item.thumbnail)
  push(item.image_url)
  push(item.cover_url)
  push(item.picture)
  const meta = item.metadata || {}
  if (item.type === 'event') {
    push(meta.image)
    push(meta.image_url || meta.thumbnail_url || meta.cover_image || meta.client_image)
  } else {
    push(meta.image_url || meta.thumbnail_url || meta.cover_image || meta.image || meta.client_image)
  }
  return out
}

/** First displayable https URL for list / reel thumbs; falls back to map marker pool by name. */
function pickPlanStopThumbUri(item, loadedMarkers = []) {
  for (const raw of collectPlanStopImageRawUrls(item)) {
    const u = resolvePublicImageUrl(raw)
    if (u) return u
  }
  if (!loadedMarkers?.length) return null
  const spotNorm = normName(item.spot || '')
  if (!spotNorm) return null
  for (const m of loadedMarkers) {
    const markerNorm = normName(m.spot || '')
    if (!markerNorm) continue
    if (markerNorm === spotNorm || markerNorm.includes(spotNorm) || spotNorm.includes(markerNorm)) {
      const u = resolvePublicImageUrl(m.image)
      if (u) return u
    }
  }
  return null
}

/** Ordered unique gallery URIs for detail modal. */
function pickPlanStopGalleryUris(item, loadedMarkers = []) {
  const seen = new Set()
  const urls = []
  for (const raw of collectPlanStopImageRawUrls(item)) {
    const u = resolvePublicImageUrl(raw)
    if (u && !seen.has(u)) {
      seen.add(u)
      urls.push(u)
    }
  }
  if (urls.length === 0) {
    const one = pickPlanStopThumbUri(item, loadedMarkers)
    return one ? [one] : []
  }
  return urls
}

// Enrich plan items with client images from Supabase (Pinecone or direct client lookup)
function resolveCoordsFromLoadedCache(item, loadedClientMarkers) {
  if (!item || !Array.isArray(loadedClientMarkers) || loadedClientMarkers.length === 0) return null;

  if (item.clientId) {
    const byId = loadedClientMarkers.find((m) => m.clientId === item.clientId);
    if (byId) return unswapLatLng(byId.lat, byId.lng);
  }

  const spotNorm = normName(item.spot || '');
  if (!spotNorm) return null;

  for (const marker of loadedClientMarkers) {
    const markerNorm = normName(marker.spot || '');
    if (!markerNorm) continue;
    if (markerNorm === spotNorm || markerNorm.includes(spotNorm) || spotNorm.includes(markerNorm)) {
      const coords = unswapLatLng(marker.lat, marker.lng);
      if (coords) return coords;
    }
  }

  return null;
}

async function enrichPlanWithClientData(plan, pineconeMatches, loadedClientMarkers = []) {
  // Step 1: Match from Pinecone for identity/image hints only (NOT coordinates).
  // Coordinates for map pins must come strictly from Supabase.
  let enriched = plan.map((item) => {
    const match = matchPlanToPinecone(item, pineconeMatches);
    const cachedCoords = resolveCoordsFromLoadedCache(
      { ...item, clientId: match?.clientId || item.clientId || null },
      loadedClientMarkers
    );
    return {
      ...item,
      image: match?.image || item.image || null,
      clientId: match?.clientId || item.clientId || null,
      rating: match?.rating != null ? match.rating : item.rating ?? null,
      lat: cachedCoords ? cachedCoords.lat : null,
      lng: cachedCoords ? cachedCoords.lng : null,
      eventMetadata: match?.eventMetadata ?? item.eventMetadata ?? null,
    };
  });

  // Step 2: Fetch client images from Supabase (for matched clientIds); backfill coords from DB when still missing/invalid
  const clientIds = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
  let clientImageMap = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from('client')
      .select('client_a_uuid, client_image, client_type, lat, long, latitude, longitude')
      .in('client_a_uuid', clientIds);
    const coordByClientId = {};
    const clientTypeByUuid = {};
    (clients || []).forEach((c) => {
      if (c.client_a_uuid && c.client_image) {
        const u = resolvePublicImageUrl(String(c.client_image).trim());
        if (u) clientImageMap[c.client_a_uuid] = u;
      }
      const u = unswapLatLng(c.lat ?? c.latitude, c.long ?? c.longitude ?? c.lng);
      if (u && c.client_a_uuid) coordByClientId[c.client_a_uuid] = u;
      if (c.client_a_uuid && c.client_type != null && String(c.client_type).trim() !== '') {
        clientTypeByUuid[c.client_a_uuid] = c.client_type;
      }
    });
    enriched = enriched.map((item) => {
      const u = item.clientId ? coordByClientId[item.clientId] : null;
      const ct = item.clientId ? clientTypeByUuid[item.clientId] : null;
      let next = item;
      if (ct != null && String(ct).trim() !== '') {
        next = { ...next, client_type: ct };
      }
      if (u) return { ...next, lat: u.lat, lng: u.lng };
      return next;
    });
  }

  // Step 3: Fetch clients from Supabase and force DB lat/long whenever we can match a client.
  // This avoids wrong map pins from model/Pinecone coords drift.
  const { data: allClients } = await supabase
    .from('client')
    .select('client_a_uuid, business_name, name, business_name_ar, client_image, client_type, rating, lat, long, latitude, longitude, description')
    .limit(600);
  const clientsList = allClients || [];
  const clientById = new Map(clientsList.map((c) => [c.client_a_uuid, c]));
  enriched = enriched.map((item) => {
    let client = item.clientId ? clientById.get(item.clientId) : null;
    if (!client) {
      client = matchPlanToClient(item, clientsList);
    }
    if (!client) return item;
    const img = client.client_image ? resolvePublicImageUrl(String(client.client_image).trim()) : null;
    const dbCoords = parseCoordsFromClientRow(client);
    const descRaw = client.description != null ? String(client.description).trim() : ''
    const placeDescription = descRaw || (item.placeDescription != null ? String(item.placeDescription).trim() : '') || null
    return {
      ...item,
      image: resolvePublicImageUrl(item.image) || img,
      clientId: item.clientId || client.client_a_uuid,
      client_type: client.client_type ?? item.client_type ?? null,
      rating: item.rating != null ? item.rating : (client.rating != null ? client.rating : null),
      ...(placeDescription ? { placeDescription } : {}),
      ...(dbCoords ? { lat: dbCoords.lat, lng: dbCoords.lng } : {}),
    };
  });
  const newIds = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
  for (const cid of newIds) {
    if (clientImageMap[cid]) continue;
    const c = clientById.get(cid);
    if (c?.client_image) {
      const u = resolvePublicImageUrl(String(c.client_image).trim());
      if (u) clientImageMap[cid] = u;
    }
  }

  let unresolved = enriched.filter((i) => !parsePlanItemCoords(i));
  if (unresolved.length > 0 && loadedClientMarkers.length > 0) {
    enriched = enriched.map((item) => {
      if (parsePlanItemCoords(item)) return item;
      const u = resolveCoordsFromLoadedCache(item, loadedClientMarkers);
      return u ? { ...item, lat: u.lat, lng: u.lng } : item;
    });
    unresolved = enriched.filter((i) => !parsePlanItemCoords(i));
  }

  const idsNeedingCoords = [...new Set(unresolved.filter((i) => i.clientId).map((i) => i.clientId))];
  if (idsNeedingCoords.length > 0) {
    const { data: locRows } = await supabase
      .from('client')
      .select('client_a_uuid, lat, long, latitude, longitude')
      .in('client_a_uuid', idsNeedingCoords);
    const coordById = {};
    (locRows || []).forEach((c) => {
      const u = parseCoordsFromClientRow(c);
      if (u && c.client_a_uuid) coordById[c.client_a_uuid] = u;
    });
    enriched = enriched.map((item) => {
      if (parsePlanItemCoords(item)) return item;
      const u = item.clientId ? coordById[item.clientId] : null;
      return u ? { ...item, lat: u.lat, lng: u.lng } : item;
    });
  }

  // Step 4: Strict source-of-truth guard for map coordinates.
  // If a stop has no Supabase-backed coords, keep it off the map by leaving lat/lng null.
  enriched = enriched.map((item) => {
    const fixed = parsePlanItemCoords(item);
    if (!fixed) return { ...item, lat: null, lng: null };
    return item;
  });

  // Step 5: Fallback — fetch first post image when client_image is null
  const stillNoImage = enriched.filter((i) => !resolvePublicImageUrl(i.image) && i.clientId);
  if (stillNoImage.length > 0) {
    const postIds = [...new Set(stillNoImage.map((i) => i.clientId))];
    for (const cid of postIds) {
      if (clientImageMap[cid]) continue;
      const { data: posts } = await supabase
        .from('posts')
        .select('post_image')
        .eq('client_a_uuid', cid)
        .not('post_image', 'is', null)
        .limit(3);
      const firstWithImage = (posts || []).find((p) => p.post_image);
      const raw = firstWithImage?.post_image;
      if (!raw) continue;
      let url = raw;
      if (typeof raw === 'string' && raw.startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          url = arr[0]?.url || (typeof arr[0] === 'string' ? arr[0] : raw);
        } catch { /* keep url */ }
      }
      const fullUrl = resolvePublicImageUrl(String(url));
      if (fullUrl) clientImageMap[cid] = fullUrl;
    }
  }

  // Step 5: Build images array (client_image + post images) for detail area diversity
  const postImagesByClient = {};
  const idsWithClient = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
  if (idsWithClient.length > 0) {
    const { data: posts } = await supabase
      .from('posts')
      .select('client_a_uuid, post_image')
      .in('client_a_uuid', idsWithClient)
      .not('post_image', 'is', null)
      .order('created_at', { ascending: false })
      .limit(idsWithClient.length * 3);
    (posts || []).forEach((row) => {
      if (!row.post_image) return;
      let url = row.post_image;
      if (typeof url === 'string' && url.startsWith('[')) {
        try {
          const parsed = JSON.parse(url);
          url = (Array.isArray(parsed) && parsed[0]?.url) ? parsed[0].url : (typeof parsed[0] === 'string' ? parsed[0] : url);
        } catch { /* keep */ }
      }
      url = resolvePublicImageUrl(String(url));
      if (url) {
        if (!postImagesByClient[row.client_a_uuid]) postImagesByClient[row.client_a_uuid] = [];
        if (!postImagesByClient[row.client_a_uuid].includes(url)) postImagesByClient[row.client_a_uuid].push(url);
      }
    });
  }

  return enriched.map((item) => {
    const primaryRaw =
      item.image ||
      (item.clientId ? clientImageMap[item.clientId] : null) ||
      null;
    const primary = resolvePublicImageUrl(primaryRaw);
    const postUrls = (item.clientId ? postImagesByClient[item.clientId] : null) || [];
    const allImages = [primary, ...postUrls.map((u) => resolvePublicImageUrl(u)).filter(Boolean)].filter(Boolean);
    const seen = new Set();
    const images = allImages.filter((u) => {
      if (!u || seen.has(u)) return false;
      seen.add(u);
      return true;
    });
    return {
      ...item,
      image: primary,
      images: images.length > 0 ? images : (primary ? [primary] : []),
    };
  });
}

// Bahrain trivia while the plan modal is generating
const BAHRAIN_FACTS = [
  'Bahrain was once the heart of the ancient Dilmun civilization, a key trading hub for thousands of years.',
  'Locals love evening walks along the corniche – the skyline and sea breeze are perfect after sunset.',
  'Traditional Bahraini breakfast often includes balaleet (sweet vermicelli) and khubz (Arabic bread).',
  'Manama Souq is one of the best places to feel the old-meets-new soul of Bahrain in a single walk.',
  'Pearling was once Bahrain’s main industry – the Pearling Trail in Muharraq is now a UNESCO site.',
  'Bahrain has a vibrant cafe culture – from hidden specialty coffee spots to seaside shisha lounges.',
  'The Bahrain International Circuit hosts Formula 1 night races – the desert lights make it unforgettable.',
  'Bahrain Fort (Qal\'at al-Bahrain) is a UNESCO site where you can walk through 4,000 years of history.',
  'The Tree of Life stands alone in the desert – nobody is quite sure how its deep roots still find water.',
  'Block 338 in Adliya is famous for street art, galleries, and some of the island’s best casual dining.',
  'Bahrain’s islands are linked by the King Fahd Causeway – a scenic drive to Saudi Arabia on a clear day.',
  'Muharraq’s lanes hide restored pearling merchant houses that tell the story of the Gulf’s golden age.',
  'Winter months bring perfect outdoor weather – rooftop sunsets and open-air markets feel made for it.',
  'The National Museum is a calm, air-conditioned deep dive into archaeology, dhows, and modern Bahrain.',
]

// Smooth image with shimmer placeholder — avoids empty flash while loading
// `noFade`: list tiles use explicit sizes; avoids zero-height layouts when all children are absolute, and skips opacity-0 flash
function PreviewImage({ uri, style, noFade }) {
  const resolvedUri = useMemo(() => resolvePublicImageUrl(uri), [uri])
  
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const shimmerAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    fadeAnim.setValue(0);
  }, [resolvedUri, fadeAnim]);
  useEffect(() => {
    if (loaded && !noFade) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [loaded, fadeAnim, noFade]);
  useEffect(() => {
    if (noFade) return undefined
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    if (!loaded && !failed && resolvedUri) loop.start();
    return () => loop.stop();
  }, [loaded, failed, resolvedUri, shimmerAnim, noFade]);
  if (!resolvedUri) return null;
  if (failed) {
    return <View style={[style, { backgroundColor: '#E8ECF1', overflow: 'hidden' }]} />;
  }
  if (noFade) {
    return (
      <View style={[style, { overflow: 'hidden', backgroundColor: '#F2F2F7' }]} collapsable={false}>
        {!loaded && !failed && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#ECECF0' }]} pointerEvents="none" />
        )}
        {!failed ? (
          <CachedImage
            source={{ uri: resolvedUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            recyclingKey={resolvedUri}
            transition={0}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setFailed(true)
              setLoaded(true)
            }}
          />
        ) : null}
      </View>
    );
  }
  const shimmerOpacity = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.08)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {!loaded && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: shimmerOpacity }]} pointerEvents="none">
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.4)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <CachedImage
          source={{ uri: resolvedUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          recyclingKey={resolvedUri}
          transition={0}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
        />
      </Animated.View>
    </View>
  );
}

/** Overlapping "deck" layout with radial entry trajectories */
function getScoutMosaicLayout(variant, boxW, boxH) {
  if (variant === 'sheet') {
    return [
      { l: boxW * 0.02, t: boxH * 0.48, d: boxW * 0.30, z: 1, rot: '-12deg', sc: 0.80, el: 1, from: 'left' },
      { l: boxW * 0.34, t: boxH * 0.44, d: boxW * 0.32, z: 2, rot: '5deg', sc: 0.84, el: 2, from: 'bottom' },
      { l: boxW * 0.62, t: boxH * 0.46, d: boxW * 0.28, z: 1, rot: '10deg', sc: 0.80, el: 1, from: 'right' },
      { l: boxW * 0.06, t: boxH * 0.04, d: boxW * 0.26, z: 5, rot: '-6deg', sc: 0.90, el: 5, from: 'topLeft' },
      { l: boxW * 0.18, t: boxH * 0.10, d: boxW * 0.52, z: 12, rot: '-1deg', sc: 1, el: 12, from: 'top' },
    ]
  }
  return [
    { l: boxW * 0.02, t: boxH * 0.52, d: boxW * 0.30, z: 1, rot: '-14deg', sc: 0.76, el: 1, from: 'left' },
    { l: boxW * 0.34, t: boxH * 0.48, d: boxW * 0.32, z: 2, rot: '5deg', sc: 0.80, el: 2, from: 'bottom' },
    { l: boxW * 0.64, t: boxH * 0.50, d: boxW * 0.28, z: 1, rot: '12deg', sc: 0.76, el: 1, from: 'right' },
    { l: boxW * 0.06, t: boxH * 0.06, d: boxW * 0.26, z: 5, rot: '-8deg', sc: 0.88, el: 5, from: 'topLeft' },
    { l: boxW * 0.66, t: boxH * 0.04, d: boxW * 0.26, z: 4, rot: '10deg', sc: 0.88, el: 4, from: 'topRight' },
    { l: boxW * 0.16, t: boxH * 0.12, d: boxW * 0.56, z: 12, rot: '-2deg', sc: 1, el: 16, from: 'top' },
  ]
}

function FlyingPhotoCard({ spec, item, sliceKey, idx, isSheet }) {
  const slideX = useRef(new Animated.Value(0)).current
  const slideY = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.3)).current
  const rotate = useRef(new Animated.Value(0)).current

  const r = spec.d / 2
  const finalRot = parseFloat(spec.rot) || 0

  const getEntryOffset = () => {
    const dist = SCREEN_WIDTH * 1.2
    switch (spec.from) {
      case 'top': return { x: 0, y: -dist }
      case 'bottom': return { x: 0, y: dist }
      case 'left': return { x: -dist, y: 0 }
      case 'right': return { x: dist, y: 0 }
      case 'topLeft': return { x: -dist * 0.7, y: -dist * 0.7 }
      case 'topRight': return { x: dist * 0.7, y: -dist * 0.7 }
      case 'bottomLeft': return { x: -dist * 0.7, y: dist * 0.7 }
      case 'bottomRight': return { x: dist * 0.7, y: dist * 0.7 }
      default: return { x: 0, y: -dist }
    }
  }

  useEffect(() => {
    const offset = getEntryOffset()
    slideX.setValue(offset.x)
    slideY.setValue(offset.y)
    rotate.setValue(finalRot + (Math.random() - 0.5) * 60)
    opacity.setValue(0)
    scale.setValue(0.3)

    const delay = 120 + idx * 85
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0,
        delay,
        duration: 650,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        useNativeDriver: true,
      }),
      Animated.timing(slideY, {
        toValue: 0,
        delay,
        duration: 680,
        easing: Easing.bezier(0.34, 1.2, 0.64, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        delay,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        delay: delay + 80,
        tension: 180,
        friction: 16,
        useNativeDriver: true,
      }),
      Animated.spring(rotate, {
        toValue: finalRot,
        delay: delay + 50,
        tension: 120,
        friction: 14,
        useNativeDriver: true,
      }),
    ]).start()
  }, [sliceKey, idx, item.image])

  return (
    <Animated.View
      key={`${sliceKey}-${idx}-${item.image}`}
      style={{
        position: 'absolute',
        left: spec.l,
        top: spec.t,
        width: spec.d,
        height: spec.d,
        zIndex: spec.z,
        elevation: spec.el,
        opacity,
        transform: [
          { translateX: slideX },
          { translateY: slideY },
        ],
      }}
    >
      <Animated.View
        style={[
          styles.scoutMosaicCell,
          isSheet && styles.scoutMosaicCellSheet,
          spec.z >= 10 && (isSheet ? styles.scoutMosaicCellHeroSheet : styles.scoutMosaicCellHero),
          spec.z <= 2 && (isSheet ? styles.scoutMosaicCellBackSheet : styles.scoutMosaicCellBack),
          {
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: r,
            transform: [
              { rotate: rotate.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) },
              { scale: Animated.multiply(scale, spec.sc != null ? spec.sc : 1) },
            ],
            ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
          },
        ]}
      >
        <PreviewImage
          uri={resolvePublicImageUrl(item.image) || item.image}
          style={{ width: '100%', height: '100%', borderRadius: r }}
          noFade
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'transparent', 'rgba(0,0,0,0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.scoutMosaicCellShine, { borderRadius: r }]}
        />
      </Animated.View>
    </Animated.View>
  )
}
function KhalidScoutPhotoMosaic({ spotPreviews, variant }) {
  const isSheet = variant === 'sheet'
  const boxW = isSheet ? Math.min(SCREEN_WIDTH - 40, 360) : Math.min(SCREEN_WIDTH - 24, 400)
  const boxH = isSheet ? 168 : 228
  const layout = useMemo(() => {
    const raw = getScoutMosaicLayout(variant, boxW, boxH)
    return [...raw].sort((a, b) => a.z - b.z)
  }, [variant, boxW, boxH])

  const pool = useMemo(() => {
    const arr = (spotPreviews || [])
      .map((p) => {
        if (!p) return null
        const u = resolvePublicImageUrl(p.image) || (typeof p.image === 'string' ? p.image.trim() : null)
        if (!u) return null
        return { ...p, image: u }
      })
      .filter(Boolean)
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [spotPreviews])

  const poolKey = useMemo(() => {
    const rows = (spotPreviews || [])
      .map((p) => {
        if (!p) return null
        const u = resolvePublicImageUrl(p.image) || (typeof p.image === 'string' ? p.image.trim() : '')
        if (!u) return null
        return `${p?.id || ''}:${u}`
      })
      .filter(Boolean)
    return rows.sort().join('|')
  }, [spotPreviews])

  const slotCount = layout.length
  const pickSlice = useCallback(() => {
    if (pool.length === 0) return []
    if (pool.length <= slotCount) return pool.slice(0, slotCount)
    const start = Math.floor(Math.random() * pool.length)
    return Array.from({ length: slotCount }, (_, k) => pool[(start + k) % pool.length])
  }, [pool, slotCount])

  const [slice, setSlice] = useState([])

  const applySlice = useCallback((rows) => {
    setSlice(rows || [])
    const imgs = (rows || []).map((p) => p?.image).filter(Boolean)
    void prefetchImageUrls(imgs).catch(() => {})
  }, [])

  useLayoutEffect(() => {
    applySlice(pickSlice())
  }, [poolKey, pickSlice, applySlice])

  useEffect(() => {
    const urls = (spotPreviews || []).map((p) => p?.image).filter(Boolean)
    void prefetchImageUrls(urls).catch(() => {})
  }, [spotPreviews])

  useEffect(() => {
    if (pool.length === 0) return undefined
    const id = setInterval(() => {
      applySlice(pickSlice())
    }, 9000)
    return () => clearInterval(id)
  }, [poolKey, pool.length, pickSlice, applySlice])

  const sliceKey = slice.map((s) => s?.id).join('-')
  const hasTiles = pool.length > 0 && slice.some((s) => s?.image)

  if (pool.length === 0) {
    return (
      <View style={[styles.scoutMosaicInner, { width: boxW, height: boxH }]}>
        <View style={[styles.scoutMosaicEmpty, isSheet && styles.scoutMosaicEmptySheet, { width: boxW, height: boxH }]}>
          <ActivityIndicator size={isSheet ? 'small' : 'large'} color={isSheet ? themeColors.primary : 'rgba(255,255,255,0.9)'} />
          <Text style={[styles.scoutMosaicEmptyText, isSheet && styles.scoutMosaicEmptyTextSheet]}>
            Gathering photos from the community…
          </Text>
        </View>
      </View>
    )
  }

  if (!hasTiles) {
    return (
      <View style={[styles.scoutMosaicInner, { width: boxW, height: boxH }]}>
        <View style={[styles.scoutMosaicEmpty, isSheet && styles.scoutMosaicEmptySheet, { width: boxW, height: boxH }]}>
          <ActivityIndicator size="small" color={isSheet ? themeColors.primary : 'rgba(255,255,255,0.85)'} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.scoutMosaicInner, { width: boxW, height: boxH }]}>
      {layout.map((spec, idx) => {
        const item = slice[idx % Math.max(1, slice.length)]
        if (!item?.image) return null
        return (
          <FlyingPhotoCard
            key={`${sliceKey}-${idx}-${item.image}`}
            spec={spec}
            item={item}
            sliceKey={sliceKey}
            idx={idx}
            isSheet={isSheet}
          />
        )
      })}
    </View>
  )
}

function KhalidScoutPlanVisual({ spotPreviews, variant }) {
  return (
    <View style={styles.scoutMosaicStage} accessibilityLabel="Live photo previews from the community feed">
      <KhalidScoutPhotoMosaic spotPreviews={spotPreviews} variant={variant} />
    </View>
  )
}

const STOP_DIALOG_EDGE = 4
const STOP_DIALOG_ARROW_BTN = 32
const STOP_DIALOG_ARROW_GAP = 3
const STOP_DIALOG_SLIDE_WIDTH = Math.min(
  580,
  SCREEN_WIDTH - STOP_DIALOG_EDGE * 2 - STOP_DIALOG_ARROW_BTN * 2 - STOP_DIALOG_ARROW_GAP * 2
)
const STOP_DIALOG_IMAGE_H = Math.min(312, Math.round(SCREEN_HEIGHT * 0.36))
const STOP_DIALOG_IMAGE_W = STOP_DIALOG_SLIDE_WIDTH

/** Stop-detail swipe: peek + exit distances */
const STOP_DETAIL_SWIPE_PEEK_RANGE = SCREEN_WIDTH * 0.34
const STOP_DETAIL_EXIT_X = SCREEN_WIDTH * 1.12
const STOP_DETAIL_SWIPE_SNAP_BACK = { damping: 19, stiffness: 260, mass: 0.72 }
const STOP_DETAIL_SWIPE_COMMIT = { damping: 17, stiffness: 300, mass: 0.58 }

/** Full-width hero gallery: auto-advances every 5s when there are multiple images */
function StopDetailGallery({
  images,
  singleUri,
  accent,
  isEat,
  isEvent,
  slideWidth,
  imageHeight,
  bottomRadius = 24,
  hideBottomDotsRow = false,
}) {
  const scrollRef = useRef(null)
  const indexRef = useRef(0)
  const [pageIdx, setPageIdx] = useState(0)
  const list = useMemo(
    () => (Array.isArray(images) && images.length > 0 ? images.filter(Boolean) : []),
    [images]
  )

  useEffect(() => {
    indexRef.current = 0
    setPageIdx(0)
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: 0, animated: false })
    })
    if (list.length < 2) return undefined
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % list.length
      const next = indexRef.current
      setPageIdx(next)
      scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true })
    }, 5000)
    return () => clearInterval(id)
  }, [list, slideWidth])

  const handleMomentumEnd = (e) => {
    if (list.length < 2) return
    const x = e.nativeEvent.contentOffset.x
    const i = Math.round(x / Math.max(1, slideWidth))
    const clamped = Math.max(0, Math.min(list.length - 1, i))
    indexRef.current = clamped
    setPageIdx(clamped)
  }

  const primaryUri = list[0] || singleUri
  if (!primaryUri) {
    return (
      <View
        style={{
          width: slideWidth,
          height: imageHeight,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
          overflow: 'hidden',
          backgroundColor: `${accent}24`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'}
          size={40}
          color={accent}
        />
      </View>
    )
  }

  if (list.length < 2) {
    return (
      <View
        style={{
          width: slideWidth,
          height: imageHeight,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
          overflow: 'hidden',
          backgroundColor: '#E2E8F0',
        }}
      >
        <PreviewImage uri={primaryUri} style={StyleSheet.absoluteFill} />
      </View>
    )
  }

  return (
    <View style={{ width: slideWidth }}>
      <View
        style={{
          width: slideWidth,
          height: imageHeight,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
          overflow: 'hidden',
          backgroundColor: '#E2E8F0',
        }}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          decelerationRate="fast"
          style={{ width: slideWidth, height: imageHeight }}
          keyboardShouldPersistTaps="handled"
        >
          {list.map((img, i) => (
            <View key={`${String(img)}-${i}`} style={{ width: slideWidth, height: imageHeight, backgroundColor: '#E2E8F0' }}>
              <PreviewImage uri={img} style={StyleSheet.absoluteFill} />
            </View>
          ))}
        </ScrollView>
      </View>
      {!hideBottomDotsRow ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 7,
            paddingVertical: 12,
            backgroundColor: '#FAFAFA',
          }}
        >
          {list.map((_, i) => (
            <View
              key={i}
              style={{
                width: pageIdx === i ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: pageIdx === i ? accent : 'rgba(15,23,42,0.18)',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}


function LoadingStepCard({ step, index, isDone, isActive, isPending }) {
  const barWidth = useRef(new Animated.Value(0)).current
  const barShimmer = useRef(new Animated.Value(0)).current
  const trackPulse = useRef(new Animated.Value(0)).current
  const checkScale = useRef(new Animated.Value(0)).current
  const checkRotate = useRef(new Animated.Value(0)).current
  const ringScale = useRef(new Animated.Value(0)).current
  const ringOpacity = useRef(new Animated.Value(0)).current
  const cardGlow = useRef(new Animated.Value(0)).current
  const entrance = useRef(new Animated.Value(0)).current
  const doneFlash = useRef(new Animated.Value(0)).current
  const prevDone = useRef(false)

  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, tension: 80, friction: 10, delay: index * 150, useNativeDriver: true }).start()
  }, [entrance, index])

  const stopBarMotion = useCallback(() => {
    barWidth.stopAnimation()
    barShimmer.stopAnimation()
    cardGlow.stopAnimation()
    trackPulse.stopAnimation()
  }, [barWidth, barShimmer, cardGlow, trackPulse])

  useEffect(() => {
    if (isDone) {
      stopBarMotion()
      return undefined
    }
    if (!isActive) {
      stopBarMotion()
      barShimmer.setValue(0)
      cardGlow.setValue(0)
      trackPulse.setValue(0)
      Animated.timing(barWidth, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start()
      return undefined
    }

    barWidth.setValue(0.12)
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(barWidth, {
          toValue: 0.8,
          duration: 2400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(barWidth, {
          toValue: 0.16,
          duration: 2600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ])
    )
    sweep.start()

    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(barShimmer, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(barShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    )
    shimmer.start()

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(cardGlow, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(cardGlow, { toValue: 0.32, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    glow.start()

    const track = Animated.loop(
      Animated.sequence([
        Animated.timing(trackPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(trackPulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    track.start()

    return () => {
      sweep.stop()
      shimmer.stop()
      glow.stop()
      track.stop()
      stopBarMotion()
    }
  }, [isActive, isDone, barWidth, barShimmer, cardGlow, trackPulse, stopBarMotion])

  useEffect(() => {
    if (isDone && !prevDone.current) {
      prevDone.current = true
      stopBarMotion()
      trackPulse.setValue(0)
      Animated.spring(barWidth, {
        toValue: 1,
        tension: 120,
        friction: 14,
        useNativeDriver: false,
      }).start()
      Animated.sequence([
        Animated.parallel([
          Animated.spring(checkScale, { toValue: 1.2, tension: 300, friction: 6, useNativeDriver: true }),
          Animated.timing(checkRotate, { toValue: 1, duration: 400, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        ]),
        Animated.spring(checkScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
      ]).start()
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.6, duration: 100, useNativeDriver: true }),
        ]),
        Animated.timing(ringOpacity, { toValue: 0, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start()
      Animated.sequence([
        Animated.timing(doneFlash, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(doneFlash, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start()
    }
  }, [isDone, barWidth, checkScale, checkRotate, ringScale, ringOpacity, doneFlash, stopBarMotion, trackPulse])

  const shimmerX = barShimmer.interpolate({ inputRange: [0, 1], outputRange: [-100, SCREEN_WIDTH + 40] })
  const trackBgOpacity = trackPulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.38] })
  const glowOp = cardGlow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] })
  const entryY = entrance.interpolate({ inputRange: [0, 1], outputRange: [30, 0] })
  const entryOp = entrance.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 1] })
  const entryScale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] })
  const doneFlashOp = doneFlash
  const checkR = checkRotate.interpolate({ inputRange: [0, 1], outputRange: ['-180deg', '0deg'] })
  const rScale = ringScale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] })

  const stepColors = [
    { bar: [themeColors.primary, '#FF6B6B'], glow: themeColors.primary, done: '#10B981' },
    { bar: ['#F59E0B', '#FBBF24'], glow: '#F59E0B', done: '#10B981' },
    { bar: ['#8B5CF6', '#A78BFA'], glow: '#8B5CF6', done: '#10B981' },
  ]
  const colors = stepColors[index] || stepColors[0]

  return (
    <Animated.View style={[styles.lsCard, { transform: [{ translateY: entryY }, { scale: entryScale }], opacity: entryOp }]}>
      {isActive && (
        <Animated.View style={[styles.lsCardGlow, { backgroundColor: colors.glow, opacity: glowOp }]} pointerEvents="none" />
      )}
      {isDone && (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF', borderRadius: 16, opacity: doneFlashOp }]} pointerEvents="none" />
      )}
      <View style={styles.lsCardTop}>
        <View style={[styles.lsIconWrap, isDone && { backgroundColor: colors.done }, isActive && { backgroundColor: colors.glow }]}>
          {isDone ? (
            <Animated.View style={{ transform: [{ scale: checkScale }, { rotate: checkR }] }}>
              <Ionicons name="checkmark-sharp" size={18} color="#FFF" />
            </Animated.View>
          ) : (
            <Ionicons name={step.icon} size={16} color={isActive ? '#FFF' : '#94A3B8'} />
          )}
          {isDone && (
            <Animated.View style={[styles.lsRing, { borderColor: colors.done, transform: [{ scale: rScale }], opacity: ringOpacity }]} pointerEvents="none" />
          )}
        </View>
        <View style={styles.lsTextCol}>
          <Text style={[styles.lsStepName, isDone && styles.lsStepNameDone, isActive && styles.lsStepNameActive]}>{step.text}</Text>
          <Text style={[styles.lsStepStatus, isDone && { color: colors.done }]}>
            {isDone ? 'Complete' : isActive ? 'In progress…' : 'Waiting'}
          </Text>
        </View>
        {isDone && (
          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <Ionicons name="checkmark-circle" size={22} color={colors.done} />
          </Animated.View>
        )}
      </View>
      <View style={styles.lsBarTrack}>
        {isActive && !isDone ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: 5, backgroundColor: 'rgba(15,23,42,0.06)', opacity: trackBgOpacity },
            ]}
          />
        ) : null}
        <Animated.View style={[styles.lsBarFillWrap, { width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
          <LinearGradient
            colors={isDone ? [colors.done, '#34D399'] : colors.bar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.lsBarFill}
          />
        </Animated.View>
        {isActive && !isDone && (
          <Animated.View style={[styles.lsBarShimmer, { transform: [{ translateX: shimmerX }] }]} pointerEvents="none" />
        )}
      </View>
    </Animated.View>
  )
}

/** Rotating Bahrain trivia with fade + gentle icon pulse (modal + sheet loaders). */
function PlanLoadingFactStrip({ compact }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * BAHRAIN_FACTS.length))
  const fade = useRef(new Animated.Value(1)).current
  const iconPulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, {
          toValue: 1.08,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(iconPulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [iconPulse])

  useEffect(() => {
    const advance = () => {
      Animated.timing(fade, { toValue: 0, duration: 280, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return
        setIndex((i) => (i + 1) % BAHRAIN_FACTS.length)
        requestAnimationFrame(() => {
          Animated.timing(fade, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start()
        })
      })
    }
    const id = setInterval(advance, 7500)
    return () => clearInterval(id)
  }, [fade])

  const fact = BAHRAIN_FACTS[index]

  if (compact) {
    return (
      <View style={styles.loadingSheetFactStrip} accessibilityRole="text" accessibilityLabel={`Did you know: ${fact}`}>
        <Animated.View style={[styles.loadingSheetFactIcon, { transform: [{ scale: iconPulse }] }]}>
          <Ionicons name="sparkles" size={14} color={themeColors.primary} />
        </Animated.View>
        <View style={styles.loadingSheetFactTextCol}>
          <Text style={styles.loadingSheetFactLabel}>Did you know?</Text>
          <Animated.View style={{ opacity: fade }}>
            <Text style={styles.loadingSheetFactBody} numberOfLines={3}>
              {fact}
            </Text>
          </Animated.View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.ldFactCard} accessibilityRole="text" accessibilityLabel={`Did you know: ${fact}`}>
      <Animated.View style={[styles.ldFactIcon, { transform: [{ scale: iconPulse }] }]}>
        <Ionicons name="bulb" size={17} color="#CA8A04" />
      </Animated.View>
      <View style={styles.ldFactContent}>
        <Text style={styles.ldFactLabel}>Did you know?</Text>
        <Animated.View style={{ opacity: fade }}>
          <Text style={styles.ldFactText} numberOfLines={5}>
            {fact}
          </Text>
        </Animated.View>
      </View>
    </View>
  )
}

/** Drawer step-3 sheet loading card — GSAP stagger on web only (DOM); native keeps RN layout */
function PlanDrawerLoadingPanel({ loading, loadingStatus, spotPreviews, themePrimary }) {
  const sheetLoadRefs = useRef([])
  const setSheetLoadRef = useCallback((index) => (node) => {
    sheetLoadRefs.current[index] = node
  }, [])

  useGSAP(() => {
    if (Platform.OS !== 'web' || !loading) return
    const nodes = sheetLoadRefs.current.filter(Boolean)
    if (nodes.length === 0) return
    gsap.from(nodes, {
      opacity: 0,
      y: 20,
      duration: 0.52,
      stagger: 0.09,
      ease: 'power3.out',
    })
  }, { dependencies: [loading], revertOnUpdate: true })

  return (
    <View style={styles.loadingBumpCard}>
      <View ref={setSheetLoadRef(0)} collapsable={false}>
        <Text style={styles.loadingScoutTitle} accessibilityRole="header">
          <Text style={styles.loadingScoutTitleAccent}>Khalid</Text>
          {' is scouting the perfect places for you'}
        </Text>
      </View>
      <View ref={setSheetLoadRef(1)} style={{ width: '100%', alignItems: 'center' }} collapsable={false}>
        <KhalidScoutPlanVisual spotPreviews={spotPreviews} variant="sheet" />
      </View>
      <View ref={setSheetLoadRef(2)} collapsable={false}>
        <PlanLoadingFactStrip compact />
      </View>
      <View ref={setSheetLoadRef(3)} style={styles.loadingProgressBar} collapsable={false}>
        <LinearGradient
          colors={[themePrimary, '#E63950']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.loadingProgressFill, (() => {
            const s = (loadingStatus || '').toLowerCase()
            if (s.includes('crafting') || s.includes('stitch')) return { width: '100%' }
            if (s.includes('shortlisting') || s.includes('restaurant')) return { width: '66%' }
            return { width: '33%' }
          })()]}
        />
      </View>
    </View>
  )
}

function PlanModalLoadingView({ loadingStatus, showSuccess, spotPreviews }) {
  const fadeIn = useRef(new Animated.Value(0)).current
  const contentOpacity = useRef(new Animated.Value(1)).current
  const titleOpacity = useRef(new Animated.Value(1)).current
  const titleScale = useRef(new Animated.Value(1)).current
  const readyTitleOpacity = useRef(new Animated.Value(0)).current
  const readyTitleScale = useRef(new Animated.Value(0.8)).current
  const successScale = useRef(new Animated.Value(0)).current
  const successOpacity = useRef(new Animated.Value(0)).current
  const successConfetti = useRef([...Array(14)].map(() => new Animated.Value(0))).current
  const stepsOpacity = useRef(new Animated.Value(1)).current
  const stepsScale = useRef(new Animated.Value(1)).current
  const celebrationReady = useRef(false)
  const morphComplete = useRef(false)
  const [showCelebration, setShowCelebration] = useState(false)

  const steps = [
    { icon: 'compass-outline', text: 'Places', key: 'places' },
    { icon: 'restaurant-outline', text: 'Dining', key: 'food' },
    { icon: 'sparkles-outline', text: 'Plan', key: 'plan' },
  ]

  const stepDoneAt = useRef([0, 0, 0])
  const [completedSteps, setCompletedSteps] = useState([])
  const MIN_STEP_MS = 2400

  const rawCompleted = useMemo(() => {
    if (showSuccess) return [0, 1, 2]
    const s = (loadingStatus || '').toLowerCase()
    if (s.includes('crafting') || s.includes('building') || s.includes('stitch')) return [0, 1]
    if (s.includes('shortlisting') || s.includes('restaurant') || s.includes('food') || s.includes('breakfast') || s.includes('event') || s.includes('café')) return [0]
    if (s.includes('scouting') || s.includes('venues') || s.includes('live posts')) return [0]
    return []
  }, [loadingStatus, showSuccess])

  const allStepsDone = showSuccess && completedSteps.length >= 3

  useEffect(() => {
    const now = Date.now()
    const pending = (rawCompleted || []).filter((idx) => !completedSteps.includes(idx))
    if (pending.length === 0) return

    pending.forEach((idx) => {
      if (stepDoneAt.current[idx] === 0) stepDoneAt.current[idx] = now
    })

    const nextIdx = pending[0]
    const prevIdx = nextIdx - 1
    const prevFinished = prevIdx < 0 || completedSteps.includes(prevIdx)
    if (!prevFinished) return

    const activeSince = stepDoneAt.current[nextIdx]
    const elapsed = now - activeSince
    const wait = Math.max(0, MIN_STEP_MS - elapsed)

    const timer = setTimeout(() => {
      setCompletedSteps((prev) => prev.includes(nextIdx) ? prev : [...prev, nextIdx].sort((a, b) => a - b))
    }, wait)
    return () => clearTimeout(timer)
  }, [(rawCompleted || []).join(','), completedSteps.join(','), showSuccess])

  useEffect(() => {
    if (!showSuccess || completedSteps.length < 3) return
    const finalTimer = setTimeout(() => {
      setCompletedSteps([0, 1, 2])
    }, 800)
    return () => clearTimeout(finalTimer)
  }, [showSuccess, completedSteps.length])

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [])

  useEffect(() => {
    if (!allStepsDone || celebrationReady.current) return
    celebrationReady.current = true

    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stepsOpacity, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(titleScale, {
          toValue: 0.88,
          duration: 500,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(400),
      Animated.parallel([
        Animated.spring(readyTitleScale, {
          toValue: 1,
          tension: 60,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.timing(readyTitleOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1400),
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          tension: 90,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      morphComplete.current = true
      setShowCelebration(true)
      Animated.stagger(
        40,
        successConfetti.map((a) =>
          Animated.spring(a, { toValue: 1, tension: 140, friction: 6, useNativeDriver: true })
        )
      ).start()
    })
  }, [
    allStepsDone,
    contentOpacity,
    stepsOpacity,
    titleOpacity,
    titleScale,
    readyTitleScale,
    readyTitleOpacity,
    successScale,
    successOpacity,
    successConfetti,
  ])

  const confettiColors = ['#FF6B6B', '#FACC15', '#4ADE80', '#60A5FA', '#F472B6', '#A78BFA', '#FB923C', '#34D399', '#FF6B6B', '#FACC15', '#4ADE80', '#60A5FA', '#FACC15', '#4ADE80']
  const confettiPositions = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2
    return { x: Math.cos(angle) * (55 + Math.random() * 35), y: Math.sin(angle) * (45 + Math.random() * 30) }
  }), [])

  const isFinished = showSuccess || showCelebration
  const showLoadingContent = !allStepsDone

  const loadSectionRefs = useRef([])
  const setLoadSectionRef = useCallback((index) => (node) => {
    loadSectionRefs.current[index] = node
  }, [])

  useGSAP(() => {
    if (Platform.OS !== 'web' || !showLoadingContent) return
    const nodes = loadSectionRefs.current.filter(Boolean)
    if (nodes.length === 0) return
    gsap.from(nodes, {
      opacity: 0,
      y: 20,
      duration: 0.52,
      stagger: 0.1,
      ease: 'power3.out',
    })
  }, { dependencies: [showLoadingContent], revertOnUpdate: true })

  return (
    <Animated.View style={[styles.ldWrap, { opacity: fadeIn }]}>
      <View style={styles.ldBodyColumn}>
        <ScrollView
          style={styles.ldMainScroll}
          contentContainerStyle={styles.ldMainScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.ldTopLoadingBlockInner}>
            <View ref={setLoadSectionRef(0)} style={styles.ldPlanLoadTitleBlock} collapsable={false}>
              {showLoadingContent ? (
                <Animated.View style={{ opacity: titleOpacity, transform: [{ scale: titleScale }] }}>
                  <Text style={styles.ldTitle} accessibilityRole="header">
                    Your route
                  </Text>
                  <Text style={styles.ldLoadingSub} numberOfLines={3}>
                    Khalid is scouting the perfect places for you
                  </Text>
                </Animated.View>
              ) : (
                <Animated.View
                  style={{
                    opacity: readyTitleOpacity,
                    transform: [{ scale: readyTitleScale }],
                    alignItems: 'center',
                  }}
                >
                  <Text style={[styles.ldTitle, { marginBottom: 8 }]} accessibilityRole="header">
                    Your route is ready
                  </Text>
                </Animated.View>
              )}
            </View>

            {showLoadingContent ? (
              <>
                <View ref={setLoadSectionRef(1)} style={{ width: '100%', alignItems: 'center' }} collapsable={false}>
                  <Animated.View style={{ opacity: contentOpacity, width: '100%', alignItems: 'center' }}>
                    <KhalidScoutPlanVisual spotPreviews={spotPreviews} variant="modal" />
                  </Animated.View>
                </View>
                <View ref={setLoadSectionRef(2)} style={{ width: '100%' }} collapsable={false}>
                  <Animated.View style={{ opacity: contentOpacity, width: '100%' }}>
                    <PlanLoadingFactStrip compact={false} />
                  </Animated.View>
                </View>
              </>
            ) : null}
          </View>
        </ScrollView>

        {showCelebration && morphComplete.current && (
          <View style={[styles.ldSuccessCenter, { zIndex: 110, elevation: 110 }]}>
            {confettiPositions.map((pos, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  width: i % 3 === 0 ? 10 : 6,
                  height: i % 2 === 0 ? 10 : 4,
                  borderRadius: i % 2 === 0 ? 5 : 2,
                  backgroundColor: confettiColors[i],
                  transform: [
                    {
                      translateX: successConfetti[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, pos.x],
                      }),
                    },
                    {
                      translateY: successConfetti[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, pos.y],
                      }),
                    },
                    {
                      rotate: successConfetti[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', `${i * 26}deg`],
                      }),
                    },
                  ],
                  opacity: successConfetti[i].interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0, 1, 0.3],
                  }),
                }}
              />
            ))}
            <Animated.View style={{ transform: [{ scale: successScale }], opacity: successOpacity }}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark" size={44} color="#FFFFFF" />
              </View>
            </Animated.View>
          </View>
        )}

        {showCelebration && morphComplete.current && (
          <Animated.View
            style={{
              opacity: successOpacity,
              width: '100%',
              paddingHorizontal: 8,
              zIndex: 105,
              elevation: 105,
            }}
          >
            <View style={styles.ldSheetHintCard}>
              <Ionicons name="chevron-up" size={26} color={themeColors.primary} />
              <Text style={styles.ldSheetHintTitle}>Swipe up the sheet</Text>
            </View>
          </Animated.View>
        )}

        {showLoadingContent && (
          <View ref={setLoadSectionRef(3)} collapsable={false} style={{ width: '100%', zIndex: 90, elevation: 90 }}>
            <Animated.View
              style={[
                styles.lsSteps,
                styles.ldStepsFooter,
                { opacity: stepsOpacity, transform: [{ scale: stepsScale }] },
              ]}
            >
              {steps.map((s, i) => {
                const isDone = allStepsDone ? true : completedSteps.includes(i)
                const isActive = !isDone && completedSteps.length === i
                const isPending = !isDone && !isActive
                return (
                  <LoadingStepCard
                    key={s.key}
                    step={s}
                    index={i}
                    isDone={isDone}
                    isActive={isActive}
                    isPending={isPending}
                  />
                )
              })}
            </Animated.View>
          </View>
        )}
      </View>
    </Animated.View>
  )
}

// Animated map marker with profile image and entrance animation
// zoomScale: 0.2–1, Google Maps–style; markers shrink when zoomed out
function AnimatedPlaceMarker({ mk, accent, isCurrent, onPress, showBadge = true, showCircle = true, zoomScale = 1 }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseRing = useRef(new Animated.Value(0)).current;
  const breatheScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 180,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const pulseActive = isCurrent

  useEffect(() => {
    if (!pulseActive) {
      breatheScale.setValue(1);
      pulseRing.setValue(0);
      return;
    }
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheScale, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breatheScale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRing, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseRing, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    breathe.start();
    ring.start();
    return () => { breathe.stop(); ring.stop(); };
  }, [pulseActive, breatheScale, pulseRing]);

  const ringScale = pulseRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulseRing.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0.2, 0] });
  const combinedScale = Animated.multiply(scaleAnim, breatheScale);
  const showLabel = zoomScale >= 0.55;

  const mkCat = mapMarkerFilterCategoryKey(mk);
  const pinIcon = mkCat === 'restaurant' ? 'restaurant' : mkCat === 'event' ? 'calendar' : 'location';
  const imageUrl = resolvePublicImageUrl(mk.image);

  const showRadius = showCircle

  return (
    <React.Fragment>
      {showRadius && (
        <Circle
          center={{ latitude: mk.lat, longitude: mk.lng }}
          radius={260}
          fillColor={`${accent}0D`}
          strokeColor={`${accent}2E`}
          strokeWidth={1.5}
        />
      )}
      <Marker coordinate={{ latitude: mk.lat, longitude: mk.lng }} onPress={onPress} anchor={{ x: 0.5, y: 1 }}>
        <Animated.View style={[styles.animatedMarkerWrap, { opacity: opacityAnim, transform: [{ scale: Animated.multiply(combinedScale, zoomScale) }] }]}>
          {showLabel ? (
            <View
              style={[
                styles.animatedMarkerLabel,
                typeof accent === 'string' && accent.length === 7
                  ? { borderColor: `${accent}44` }
                  : null,
              ]}
            >
              <Text style={[styles.animatedMarkerLabelText, { color: accent }]} numberOfLines={1}>{mk.spot}</Text>
            </View>
          ) : null}
          <View style={styles.animatedMarkerAnchor}>
            <View style={styles.animatedMarkerPinColumn}>
              <View style={styles.animatedMarkerPinHeadWrap}>
                {pulseActive && (
                  <Animated.View
                    style={[
                      styles.animatedMarkerPulseRing,
                      {
                        borderColor: accent,
                        transform: [{ scale: ringScale }],
                        opacity: ringOpacity,
                      },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.animatedMarkerPinHead,
                    typeof accent === 'string' && accent.length === 7 ? { borderColor: accent } : { borderColor: accent || '#94a3b8' },
                  ]}
                >
                  {imageUrl ? (
                    <CachedImage source={{ uri: imageUrl }} style={styles.animatedMarkerImage} recyclingKey={imageUrl} resizeMode="cover" />
                  ) : (
                    <>
                      <View style={[styles.animatedMarkerIconBg, { backgroundColor: accent }]}>
                        <Ionicons name={pinIcon} size={18} color="#FFF" />
                      </View>
                      {showBadge ? (
                        <View style={[styles.animatedMarkerBadge, { backgroundColor: accent }]}>
                          <Text style={styles.animatedMarkerBadgeText}>{mk.idx + 1}</Text>
                        </View>
                      ) : null}
                    </>
                  )}
                  {imageUrl && showBadge ? (
                    <View style={[styles.animatedMarkerBadge, styles.animatedMarkerBadgeOnImage, { backgroundColor: accent }]}>
                      <Text style={styles.animatedMarkerBadgeText}>{mk.idx + 1}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={[styles.animatedMarkerPinStem, { borderTopColor: accent }]} />
            </View>
          </View>
        </Animated.View>
      </Marker>
    </React.Fragment>
  );
}

/** Hero height when detail is open (full-screen feel) — must match styles.markerDetailHeroFrame height */
const MARKER_DETAIL_HERO_H = SCREEN_HEIGHT * 0.48;

function parseMarkerCommunityImage(imageColumn) {
  if (!imageColumn) return null;
  try {
    const parsed = typeof imageColumn === 'string' ? JSON.parse(imageColumn) : imageColumn;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const raw = arr[0] || null;
    return raw ? resolvePublicImageUrl(raw) : null;
  } catch {
    return typeof imageColumn === 'string' ? resolvePublicImageUrl(imageColumn) : null;
  }
}

function MarkerDetailStarRow({ rating, size = 13 }) {
  if (rating == null || rating <= 0) return null;
  return (
    <View style={styles.markerDetailStarRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={rating >= i ? 'star' : rating >= i - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={rating >= i - 0.5 ? '#C9A227' : 'rgba(15, 23, 42, 0.2)'}
        />
      ))}
    </View>
  );
}

/** Glass luxury full-screen sheet: one CachedImage expands from marker rect (not a duplicate layer). */
function MarkerShowcaseDetailSheet({ visible, mk, onDismiss, insets, accent, onViewProfile, morphAnchor }) {
  const { colors } = useTheme();
  const [feedPosts, setFeedPosts] = useState([]);
  const [feedReviews, setFeedReviews] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const openProgress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const anchorX = useSharedValue(SCREEN_WIDTH / 2);
  const anchorY = useSharedValue(SCREEN_HEIGHT * 0.42);
  const anchorSize = useSharedValue(58);
  const onDismissRef = useRef(onDismiss);
  const onViewProfileRef = useRef(onViewProfile);
  onDismissRef.current = onDismiss;
  onViewProfileRef.current = onViewProfile;

  useEffect(() => {
    if (morphAnchor && typeof morphAnchor.x === 'number' && typeof morphAnchor.y === 'number') {
      anchorX.value = morphAnchor.x;
      anchorY.value = morphAnchor.y;
      anchorSize.value = morphAnchor.sizePx ?? 58;
    }
  }, [morphAnchor]);

  useEffect(() => {
    if (!visible || !mk) {
      setFeedPosts([]);
      setFeedReviews([]);
      setFeedLoading(false);
      return;
    }
    let cancelled = false;
    setFeedLoading(true);
    const spot = (mk.spot || '').trim();
    const clientId = mk.clientId || null;
    (async () => {
      try {
        if (clientId) {
          const [postsRes, revRes] = await Promise.all([
            supabase
              .from('posts')
              .select('post_uuid, post_image, description, created_at')
              .eq('client_a_uuid', clientId)
              .order('created_at', { ascending: false })
              .limit(16),
            supabase
              .from('community')
              .select('community_uuid, review_text, rating, badge, image, created_at')
              .eq('client_a_uuid', clientId)
              .order('created_at', { ascending: false })
              .limit(12),
          ]);
          if (cancelled) return;
          const posts = (postsRes.data || [])
            .map((r) => ({
              id: r.post_uuid,
              imageUri: resolvePublicImageUrl(r.post_image),
              description: (r.description || '').trim(),
            }))
            .filter((p) => p.imageUri);
          setFeedPosts(posts);
          const reviews = (revRes.data || []).map((r) => ({
            id: r.community_uuid,
            body: (r.review_text || '').trim(),
            rating: r.rating != null ? Number(r.rating) : null,
            place: r.badge || null,
            imageUri: parseMarkerCommunityImage(r.image),
          }));
          setFeedReviews(reviews);
        } else if (spot.length >= 2) {
          const { data: communityRows } = await supabase
            .from('community')
            .select('community_uuid, review_text, rating, badge, image, created_at')
            .ilike('badge', `%${spot.slice(0, 28)}%`)
            .order('created_at', { ascending: false })
            .limit(12);
          if (cancelled) return;
          setFeedPosts([]);
          setFeedReviews(
            (communityRows || []).map((r) => ({
              id: r.community_uuid,
              body: (r.review_text || '').trim(),
              rating: r.rating != null ? Number(r.rating) : null,
              place: r.badge || null,
              imageUri: parseMarkerCommunityImage(r.image),
            })),
          );
        } else {
          if (!cancelled) {
            setFeedPosts([]);
            setFeedReviews([]);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setFeedPosts([]);
          setFeedReviews([]);
        }
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, mk]);

  const runDismissFromUI = useCallback(() => {
    onDismissRef.current();
  }, []);

  const finishDismissAndProfile = useCallback((clientId) => {
    onDismissRef.current();
    if (clientId != null) onViewProfileRef.current?.(clientId);
  }, []);

  const closeWithMorph = useCallback(() => {
    dragY.value = withTiming(0, { duration: 50 });
    backdropOpacity.value = withTiming(0, { duration: 340 });
    openProgress.value = withTiming(0, { duration: 400 }, (finished) => {
      if (finished) runOnJS(runDismissFromUI)();
    });
  }, [backdropOpacity, dragY, openProgress, runDismissFromUI]);

  useEffect(() => {
    if (visible && mk) {
      dragY.value = 0;
      openProgress.value = 0;
      backdropOpacity.value = 0;
      openProgress.value = withSpring(1, { damping: 17, stiffness: 188, mass: 0.78 });
      backdropOpacity.value = withTiming(1, { duration: 360 });
    }
  }, [visible, mk, backdropOpacity, dragY, openProgress]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
          'worklet';
          if (e.translationY > 0) dragY.value = e.translationY;
        })
        .onEnd((e) => {
          'worklet';
          if (dragY.value > 88 || e.velocityY > 620) {
            dragY.value = withTiming(0, { duration: 40 });
            backdropOpacity.value = withTiming(0, { duration: 340 });
            openProgress.value = withTiming(0, { duration: 400 }, (finished) => {
              if (finished) runOnJS(runDismissFromUI)();
            });
          } else {
            dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
          }
        }),
    [backdropOpacity, dragY, openProgress, runDismissFromUI],
  );

  /** One shared hero: same CachedImage expands from marker pixel rect to full hero (layout, not a second copy). */
  const heroImageExpandStyle = useAnimatedStyle(() => {
    const dragFactor = Math.min(dragY.value / 520, 0.3);
    const p = openProgress.value * (1 - dragFactor);
    const ax = anchorX.value;
    const ay = anchorY.value;
    const sz = anchorSize.value;
    const dragLift = dragY.value * 0.42;
    const left = interpolate(p, [0, 1], [ax - sz / 2, 0], Extrapolation.CLAMP);
    const top = interpolate(p, [0, 1], [ay - sz / 2, 0], Extrapolation.CLAMP) + dragLift;
    const width = interpolate(p, [0, 1], [sz, SCREEN_WIDTH], Extrapolation.CLAMP);
    const height = interpolate(p, [0, 1], [sz, MARKER_DETAIL_HERO_H], Extrapolation.CLAMP);
    const borderRadius = interpolate(p, [0, 1], [sz * 0.5, 0], Extrapolation.CLAMP);
    const shadowOp = interpolate(p, [0, 0.45, 1], [0.38, 0.14, 0.08], Extrapolation.CLAMP);
    const shadowR = interpolate(p, [0, 1], [18, 4], Extrapolation.CLAMP);
    const elev = Math.round(interpolate(p, [0, 1], [12, 3], Extrapolation.CLAMP));
    return {
      position: 'absolute',
      left,
      top,
      width,
      height,
      borderRadius,
      overflow: 'hidden',
      zIndex: 8,
      shadowColor: '#0f0a08',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: shadowOp,
      shadowRadius: shadowR,
      elevation: elev,
    };
  });

  /** Glass + scroll sits directly under the expanding image (same frame math). */
  const glassPanelStyle = useAnimatedStyle(() => {
    const dragFactor = Math.min(dragY.value / 520, 0.3);
    const p = openProgress.value * (1 - dragFactor);
    const ax = anchorX.value;
    const ay = anchorY.value;
    const sz = anchorSize.value;
    const dragLift = dragY.value * 0.42;
    const top = interpolate(p, [0, 1], [ay - sz / 2, 0], Extrapolation.CLAMP) + dragLift;
    const h = interpolate(p, [0, 1], [sz, MARKER_DETAIL_HERO_H], Extrapolation.CLAMP);
    const fade = interpolate(p, [0, 0.22, 0.5, 1], [0, 0.35, 0.92, 1], Extrapolation.CLAMP);
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: top + h,
      bottom: 0,
      opacity: fade,
      zIndex: 10,
    };
  });

  const grabberStyle = useAnimatedStyle(() => {
    const dragFactor = Math.min(dragY.value / 520, 0.3);
    const p = openProgress.value * (1 - dragFactor);
    const o = interpolate(p, [0, 0.55, 1], [0, 0.85, 1], Extrapolation.CLAMP);
    return { opacity: o };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * (1 - Math.min(dragY.value / 700, 0.35)),
  }));

  if (!visible || !mk) return null;

  const imageUrl = resolvePublicImageUrl(mk.image);
  const mkCat = mapMarkerFilterCategoryKey(mk);
  const pinIcon = mkCat === 'restaurant' ? 'restaurant' : mkCat === 'event' ? 'calendar' : 'location';
  const typeLabel = mkCat === 'restaurant' ? 'Dining' : mkCat === 'event' ? 'Event' : 'Place';
  const hasCoords = Number.isFinite(Number(mk.lat)) && Number.isFinite(Number(mk.lng));
  const lat = Number(mk.lat);
  const lng = Number(mk.lng);

  const handleOpenMaps = () => {
    if (!hasCoords) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openGoogleMapsDirections(lat, lng);
  };

  const handleViewProfilePress = () => {
    if (!mk.clientId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const cid = mk.clientId;
    backdropOpacity.value = withTiming(0, { duration: 300 });
    openProgress.value = withTiming(0, { duration: 380 }, (finished) => {
      if (finished) {
        runOnJS(finishDismissAndProfile)(cid);
      }
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={closeWithMorph}>
      <View style={styles.markerDetailModalRoot} pointerEvents="box-none">
        <Reanimated.View style={[styles.markerDetailBackdropDim, backdropStyle]} pointerEvents="none" />
        <Pressable
          style={styles.markerDetailBackdropPress}
          onPress={closeWithMorph}
          accessibilityRole="button"
          accessibilityLabel="Close place details"
        />

        <View style={styles.markerDetailModalContent} pointerEvents="box-none">
          <GestureDetector gesture={panGesture}>
            <View
              style={[
                styles.markerDetailHeroGestureLayer,
                { height: MARKER_DETAIL_HERO_H + insets.top + 52 },
              ]}
              pointerEvents="box-none"
            >
              {/* Single image: expands from marker on map to full hero — same URI as the pin */}
              <Reanimated.View style={heroImageExpandStyle}>
                {imageUrl ? (
                  <CachedImage
                    source={{ uri: imageUrl }}
                    style={styles.markerDetailHeroImageFill}
                    resizeMode="cover"
                    recyclingKey={imageUrl}
                  />
                ) : (
                  <View style={[styles.markerDetailHeroPlaceholder, { backgroundColor: `${accent}33` }]}>
                    <Ionicons name={pinIcon} size={48} color={accent} />
                  </View>
                )}
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.12)', 'transparent', 'rgba(15,23,42,0.12)', 'rgba(15,23,42,0.58)']}
                  locations={[0, 0.2, 0.55, 1]}
                  style={styles.markerDetailHeroScrim}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.35)', 'transparent']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.85, y: 0.65 }}
                  style={styles.markerDetailHeroLuxSheen}
                />
              </Reanimated.View>

              <Reanimated.View style={[styles.markerDetailGrabberFloat, { paddingTop: insets.top + 6 }, grabberStyle]} pointerEvents="box-none">
                <View style={styles.markerDetailGrabberHit} accessibilityRole="adjustable" accessibilityLabel="Drag down to close">
                  <View style={styles.markerDetailGrabber} />
                </View>
              </Reanimated.View>
            </View>
          </GestureDetector>

          <Reanimated.View style={glassPanelStyle} pointerEvents="box-none">
            <BlurView intensity={Platform.OS === 'ios' ? 86 : 56} tint="light" style={styles.markerDetailGlassBlur}>
              <View style={styles.markerDetailGlassBody}>
                <View style={styles.markerDetailGlassFrost} pointerEvents="none" />
                <GHScrollView
                  style={styles.markerDetailScroll}
                  contentContainerStyle={[styles.markerDetailScrollContent, { paddingBottom: insets.bottom + 28 }]}
                  showsVerticalScrollIndicator={false}
                  bounces
                >
                  <LinearGradient
                    colors={[`${accent}55`, `${accent}18`, 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.markerDetailPremiumAccentBar}
                  />
                  <Text style={[styles.markerDetailTitle, styles.markerDetailTitlePremium]} numberOfLines={3}>{mk.spot}</Text>
                  <View style={styles.markerDetailMetaRow}>
                    <View style={[styles.markerDetailTypeChip, styles.markerDetailTypeChipLux, { borderColor: `${accent}55`, backgroundColor: `${accent}12` }]}>
                      <Ionicons name={pinIcon} size={14} color={accent} />
                      <Text style={[styles.markerDetailTypeChipText, { color: accent }]}>{typeLabel}</Text>
                    </View>
                    {mk.time ? (
                      <Text style={styles.markerDetailTimeText}>{mk.time}</Text>
                    ) : null}
                  </View>
                  {mk.reason ? (
                    <Text style={styles.markerDetailReason}>{mk.reason}</Text>
                  ) : (
                    <Text style={styles.markerDetailHint}>Explore this stop on your map — open directions or the full profile when linked.</Text>
                  )}

                  {feedLoading ? (
                    <View style={styles.markerDetailFeedLoading} accessibilityLabel="Loading feed">
                      <ActivityIndicator size="small" color={accent} />
                      <Text style={styles.markerDetailFeedLoadingText}>Loading moments & reviews…</Text>
                    </View>
                  ) : null}

                  {feedPosts.length > 0 ? (
                    <View style={styles.markerDetailSection}>
                      <View style={styles.markerDetailSectionHeader}>
                        <Ionicons name="images-outline" size={18} color={accent} />
                        <Text style={styles.markerDetailSectionTitle}>From the feed</Text>
                      </View>
                      <Text style={styles.markerDetailSectionSub}>Recent posts featuring this place</Text>
                      <ScrollView
                        horizontal
                        nestedScrollEnabled
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.markerDetailPostStripContent}
                      >
                        {feedPosts.map((post) => (
                          <View key={post.id} style={[styles.markerDetailPostTile, { borderColor: `${accent}30` }]}>
                            <CachedImage
                              source={{ uri: post.imageUri }}
                              style={styles.markerDetailPostTileImg}
                              resizeMode="cover"
                              recyclingKey={post.imageUri}
                            />
                            <LinearGradient
                              pointerEvents="none"
                              colors={['transparent', 'rgba(15,23,42,0.65)']}
                              style={styles.markerDetailPostTileScrim}
                            />
                            {post.description ? (
                              <Text style={styles.markerDetailPostCaption} numberOfLines={2}>{post.description}</Text>
                            ) : null}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  {feedReviews.length > 0 ? (
                    <View style={styles.markerDetailSection}>
                      <View style={styles.markerDetailSectionHeader}>
                        <Ionicons name="chatbubbles-outline" size={18} color={accent} />
                        <Text style={styles.markerDetailSectionTitle}>Community</Text>
                      </View>
                      <Text style={styles.markerDetailSectionSub}>What locals are saying</Text>
                      {feedReviews.map((rev) => (
                        <View key={rev.id} style={[styles.markerDetailReviewCard, luxurySoftShadow]}>
                          <View style={styles.markerDetailReviewCardInner}>
                            <View style={styles.markerDetailReviewTop}>
                              <MarkerDetailStarRow rating={rev.rating} size={14} />
                              {rev.rating != null && Number.isFinite(rev.rating) ? (
                                <Text style={styles.markerDetailReviewScore}>{Number(rev.rating).toFixed(1)}</Text>
                              ) : null}
                            </View>
                            <View style={styles.markerDetailReviewBodyRow}>
                              {rev.imageUri ? (
                                <CachedImage
                                  source={{ uri: rev.imageUri }}
                                  style={styles.markerDetailReviewThumb}
                                  resizeMode="cover"
                                  recyclingKey={rev.imageUri}
                                />
                              ) : null}
                              <Text style={styles.markerDetailReviewBody} numberOfLines={rev.imageUri ? 5 : 8}>
                                {rev.body || '—'}
                              </Text>
                            </View>
                            {rev.place ? (
                              <View style={styles.markerDetailReviewPlaceRow}>
                                <Ionicons name="location-outline" size={13} color={accent} />
                                <Text style={styles.markerDetailReviewPlace} numberOfLines={1}>{rev.place}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {!feedLoading && feedPosts.length === 0 && feedReviews.length === 0 && (
                    <Text style={styles.markerDetailEmptyFeed}>No feed posts or reviews linked yet — open the full profile when available.</Text>
                  )}

                  <View style={styles.markerDetailActions}>
                    <GHTouchableOpacity
                      style={[styles.markerDetailBtn, styles.markerDetailBtnPrimary, { borderColor: `${accent}55` }]}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        handleOpenMaps();
                      }}
                      disabled={!hasCoords}
                      activeOpacity={0.88}
                      accessibilityRole="button"
                      accessibilityLabel="Open in maps"
                    >
                      <Ionicons name="navigate" size={18} color={accent} />
                      <Text style={[styles.markerDetailBtnText, { color: accent }]}>Directions</Text>
                    </GHTouchableOpacity>
                    {mk.clientId ? (
                      <GHTouchableOpacity
                        style={[styles.markerDetailBtn, styles.markerDetailBtnGhost]}
                        onPress={handleViewProfilePress}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel="View full profile"
                      >
                        <Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} />
                        <Text style={[styles.markerDetailBtnText, { color: colors.textSecondary }]}>Profile</Text>
                      </GHTouchableOpacity>
                    ) : null}
                  </View>
                </GHScrollView>
              </View>
            </BlurView>
          </Reanimated.View>
        </View>
      </View>
    </Modal>
  );
}

// Map scanning overlay — improved route tracing + radar sweep during Hang tight
function MapScanningOverlay({ visible }) {
  const seg1 = useRef(new Animated.Value(0)).current;
  const seg2 = useRef(new Animated.Value(0)).current;
  const seg3 = useRef(new Animated.Value(0)).current;
  const seg4 = useRef(new Animated.Value(0)).current;
  const seg5 = useRef(new Animated.Value(0)).current;
  const dotPos = useRef(new Animated.Value(0)).current;
  const scanLineY = useRef(new Animated.Value(0)).current;
  const radarPulse = useRef(new Animated.Value(0)).current;
  const dotGlow = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    [seg1, seg2, seg3, seg4, seg5, dotPos, scanLineY, radarPulse, dotGlow].forEach((a) => a.setValue(0));
    dotGlow.setValue(1);

    const scanLineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanLineY, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    const radarLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(radarPulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(radarPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );

    const dotGlowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotGlow, { toValue: 1.4, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotGlow, { toValue: 1, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );

    const routeLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(seg1, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.2, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg2, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.4, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg3, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.6, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg4, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.8, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg5, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.delay(350),
        Animated.parallel([
          Animated.timing(seg1, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg2, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg3, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg4, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg5, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(250),
      ])
    );

    scanLineLoop.start();
    radarLoop.start();
    dotGlowLoop.start();
    routeLoop.start();
    return () => {
      scanLineLoop.stop();
      radarLoop.stop();
      dotGlowLoop.stop();
      routeLoop.stop();
    };
  }, [visible, seg1, seg2, seg3, seg4, seg5, dotPos, scanLineY, radarPulse, dotGlow]);

  if (!visible) return null;

  const W1 = SCREEN_WIDTH - 90;
  const W3 = SCREEN_WIDTH - 90;
  const W5 = SCREEN_WIDTH - 80;
  const H2 = 130;
  const H4 = 130;

  const seg1Transform = [
    { translateX: seg1.interpolate({ inputRange: [0, 1], outputRange: [W1 / 2, 0] }) },
    { scaleX: seg1.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg2Transform = [
    { translateY: seg2.interpolate({ inputRange: [0, 1], outputRange: [H2 / 2, 0] }) },
    { scaleY: seg2.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg3Transform = [
    { translateX: seg3.interpolate({ inputRange: [0, 1], outputRange: [W3 / 2, 0] }) },
    { scaleX: seg3.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg4Transform = [
    { translateY: seg4.interpolate({ inputRange: [0, 1], outputRange: [H4 / 2, 0] }) },
    { scaleY: seg4.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg5Transform = [
    { translateX: seg5.interpolate({ inputRange: [0, 1], outputRange: [W5 / 2, 0] }) },
    { scaleX: seg5.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];

  const dotX = dotPos.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [37, SCREEN_WIDTH - 53, SCREEN_WIDTH - 68, 52, 35, SCREEN_WIDTH - 43] });
  const dotY = dotPos.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [77, 77, 205, 205, 327, 327] });

  const scanLineTranslateY = scanLineY.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_HEIGHT] });
  const radarScale = radarPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.3] });
  const radarOpacity = radarPulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.2, 0] });

  return (
    <View style={styles.mapScanningOverlay} pointerEvents="none">
      {/* Radar pulse from center */}
      <View style={styles.mapScanningRadarCenter}>
        <Animated.View
          style={[
            styles.mapScanningRadarRing,
            { transform: [{ scale: radarScale }], opacity: radarOpacity },
          ]}
        />
      </View>

      {/* Sweeping scan line */}
      <Animated.View
        style={[
          styles.mapScanningLine,
          { transform: [{ translateY: scanLineTranslateY }] },
        ]}
      />

      {/* Route path segments */}
      <View style={styles.mapRoutePath}>
        <View style={styles.mapRouteSegWrap}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg1, { transform: seg1Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap2}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg2, { transform: seg2Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap3}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg3, { transform: seg3Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap4}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg4, { transform: seg4Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap5}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg5, { transform: seg5Transform }]} />
        </View>
      </View>

      {/* Moving dot with glow */}
      <Animated.View
        style={[
          styles.mapRouteDotGlow,
          {
            transform: [
              { translateX: dotX },
              { translateY: dotY },
              { scale: dotGlow },
            ],
          },
        ]}
      />
      <Animated.View style={[styles.mapRouteDot, { transform: [{ translateX: dotX }, { translateY: dotY }] }]} />
    </View>
  );
}

function mapCategoryKeyFromClientTableType(clientTypeRaw) {
  const ct = String(clientTypeRaw ?? '').toLowerCase().trim();
  if (ct === 'restaurant') return 'restaurant';
  if (ct === 'event') return 'event';
  return 'place';
}

/** Prefer `client.client_type` from Supabase; used for map pins and filters. */
function resolveClientTypeForPlanMapItem(item, loadedClientMarkers) {
  if (item?.client_type != null && String(item.client_type).trim() !== '') {
    return item.client_type;
  }
  const id = item?.clientId || null;
  if (id && Array.isArray(loadedClientMarkers)) {
    const hit = loadedClientMarkers.find((r) => r.clientId === id);
    if (hit?.client_type != null && String(hit.client_type).trim() !== '') {
      return hit.client_type;
    }
  }
  if (item?.spot && Array.isArray(loadedClientMarkers)) {
    const spotNorm = normName(item.spot || '');
    if (spotNorm) {
      for (const row of loadedClientMarkers) {
        const markerNorm = normName(row.spot || '');
        if (!markerNorm) continue;
        if (markerNorm === spotNorm || markerNorm.includes(spotNorm) || spotNorm.includes(markerNorm)) {
          if (row.client_type != null && String(row.client_type).trim() !== '') {
            return row.client_type;
          }
          break;
        }
      }
    }
  }
  return null;
}

/** Map filter chip keys — uses `client_type` from the client table when present. */
function mapMarkerFilterCategoryKey(mk) {
  if (mk?.client_type != null && String(mk.client_type).trim() !== '') {
    return mapCategoryKeyFromClientTableType(mk.client_type);
  }
  return mapCategoryKeyFromClientTableType(mk?.type);
}

/** Single-select like Community feed: `all` shows every pin; otherwise match `client_type` via `mapMarkerFilterCategoryKey`. */
function markerMatchesPlanMapClientFilter(mk, activeFilter) {
  if (!mk || activeFilter === 'all' || activeFilter == null) return true;
  return mapMarkerFilterCategoryKey(mk) === activeFilter;
}

function buildMapMarkers(plan, loadedClientMarkers = []) {
  if (!plan) return [];
  return plan.map((item, idx) => {
    const fixed = parsePlanItemCoords(item) || resolveCoordsFromLoadedCache(item, loadedClientMarkers);
    if (!fixed) return null;
    const { lat, lng } = fixed;
    const image = resolvePublicImageUrl(item.image || item.client_image);
    const client_type = resolveClientTypeForPlanMapItem(item, loadedClientMarkers);
    return {
      idx,
      spot: item.spot,
      time: item.time,
      type: item.type,
      client_type,
      reason: item.reason,
      lat,
      lng,
      image,
      clientId: item.clientId || null,
    };
  }).filter(Boolean);
}

export default function AIPlanScreen() {
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
  /** Pin selected on map — tap map or Done to exit; drives “View details” + detail sheet */
  const [isMarkerShowcaseActive, setIsMarkerShowcaseActive] = useState(false);
  const [showcaseMarkerMk, setShowcaseMarkerMk] = useState(null);
  const [showcaseMorphAnchor, setShowcaseMorphAnchor] = useState(null);
  const [markerDetailSheetVisible, setMarkerDetailSheetVisible] = useState(false);
  /** Map pins: one active chip like Community (`all` | `restaurant` | `place` | `event`), keyed off `client.client_type`. */
  const [activePlanMapClientFilter, setActivePlanMapClientFilter] = useState('all');

  const handlePlanMapClientFilterPress = useCallback((id) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePlanMapClientFilter(id);
  }, []);

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
    const box = markerShowcaseRef.current;
    if (!box) return;
    box.generation += 1;
    const ids = Array.isArray(box.timeoutIds) ? box.timeoutIds : [];
    ids.forEach(clearTimeout);
    box.timeoutIds = [];
  }, []);

  const clearMarkerShowcase = useCallback(() => {
    clearMarkerShowcaseTimers();
    setIsMarkerShowcaseActive(false);
    setShowcaseMarkerMk(null);
    setShowcaseMorphAnchor(null);
    setMarkerDetailSheetVisible(false);
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
    setMarkerDetailSheetVisible(false);
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
          const box = markerShowcaseRef.current;
          if (!box || !Array.isArray(box.timeoutIds)) return;
          box.timeoutIds = box.timeoutIds.filter((x) => x !== id);
          if (box.generation !== gen) return;
          fn();
        }, delay);
        const boxPush = markerShowcaseRef.current;
        if (!boxPush) return;
        if (!Array.isArray(boxPush.timeoutIds)) boxPush.timeoutIds = [];
        boxPush.timeoutIds.push(id);
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
    foodKey: null,
    personaKey: null,
    places: null,
    breakfastSpots: null,
    events: null,
    restaurants: null,
    inflight: null,
  });
  const prefetchDebounceRef = useRef(null);
  const lastPrefLabelsRef = useRef([]);
  const lastFoodLabelsRef = useRef([]);

  // 0 = past plans, 1 = preferences, 2 = food, 3 = results
  const [drawerStep, setDrawerStep] = useState(0);
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [selectedFoodCategories, setSelectedFoodCategories] = useState([]);
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
    stopRevealTimers.current.forEach(clearTimeout)
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
    stopRevealTimers.current.forEach(clearTimeout)
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
        if (error || !rows?.length) {
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
          return {
            idx,
            spot,
            type,
            client_type: c.client_type ?? null,
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

  useEffect(
    () => () => {
      const box = markerShowcaseRef.current;
      if (box) {
        box.generation += 1;
        const ids = Array.isArray(box.timeoutIds) ? box.timeoutIds : [];
        ids.forEach(clearTimeout);
        box.timeoutIds = [];
      }
      if (mapProgrammaticMoveClearTimerRef.current) {
        clearTimeout(mapProgrammaticMoveClearTimerRef.current);
        mapProgrammaticMoveClearTimerRef.current = null;
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
      const row = savedPlansList.find((p) => p.id === planId);
      const initial = typeof row?.title === 'string' && row.title.trim() ? row.title.trim() : 'My plan';
      setEditSavedPlanTitleId(planId);
      setEditSavedPlanTitleDraft(initial);
      setShowEditSavedPlanTitleModal(true);
    },
    [savedPlansList],
  );

  const handleCloseEditSavedPlanTitleModal = useCallback(() => {
    if (editSavedPlanTitleBusy) return;
    setShowEditSavedPlanTitleModal(false);
    setEditSavedPlanTitleId(null);
    setEditSavedPlanTitleDraft('');
  }, [editSavedPlanTitleBusy]);

  const handleSubmitEditSavedPlanTitle = useCallback(async () => {
    if (!editSavedPlanTitleId) return;
    const trimmed = editSavedPlanTitleDraft.trim() || 'My plan';
    setEditSavedPlanTitleBusy(true);
    try {
      await updateSavedPlan(editSavedPlanTitleId, { title: trimmed });
      await refreshSavedPlans();
      setShowEditSavedPlanTitleModal(false);
      setEditSavedPlanTitleId(null);
      setEditSavedPlanTitleDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Could not update title', e?.message ?? 'Try again.');
    } finally {
      setEditSavedPlanTitleBusy(false);
    }
  }, [editSavedPlanTitleId, editSavedPlanTitleDraft, refreshSavedPlans]);

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
                if (activeSavedPlanId === plan.id) {
                  setDrawerStep(0);
                  setDayPlan(null);
                  setError(null);
                  setActiveSavedPlanId(null);
                  setSharedCollaboration(null);
                }
                await refreshSavedPlans();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              } catch (e) {
                Alert.alert('Delete failed', e?.message ?? 'Try again.');
              }
            },
          },
        ],
      );
    },
    [activeSavedPlanId, refreshSavedPlans],
  );

  const fitMapToPlan = useCallback((plan) => {
    if (!plan?.length) return;
    const markers = buildMapMarkers(plan, allPlaceMarkers).filter((m) => m.lat && m.lng);
    const coords = markers.map((m) => ({ latitude: m.lat, longitude: m.lng }));
    const u = userLocationRef.current;
    if (u?.latitude != null && u?.longitude != null) {
      coords.push({ latitude: u.latitude, longitude: u.longitude });
    }
    if (coords.length > 0 && mapRef.current) {
      markProgrammaticMapMove(2200);
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
        animated: true,
      });
    }
  }, [allPlaceMarkers]);

  const applyShareCodeFromString = useCallback(async (rawCode) => {
    const code = normalizeShareCode(rawCode);
    if (code.length < 6) {
      Alert.alert('Invalid code', 'Enter the full share code.');
      return;
    }
    setJoinCodeBusy(true);
    try {
      const payload = await fetchSharedPlanByCode(code);
      if (!payload?.plan_data) {
        Alert.alert('Not found', 'Check the code and try again.');
        return;
      }
      const planArr = Array.isArray(payload.plan_data) ? payload.plan_data : [];
      const enriched = await enrichPlanWithClientData(planArr, [], allPlaceMarkers);
      setDayPlan(attachPlanRowKeys(enriched));
      setPineconeMatches([]);
      setError(null);
      setDrawerStep(3);
      setActiveSavedPlanId(payload.id);
      const ownerId = payload.owner_id;
      const perm = payload.share_permission === 'edit' ? 'edit' : 'view';
      const uid = user?.id;
      if (uid && ownerId && uid === ownerId) {
        setSharedCollaboration({ code, role: 'owner', planId: payload.id, ownerId });
      } else if (perm === 'edit') {
        setSharedCollaboration({ code, role: 'editor', planId: payload.id, ownerId });
      } else {
        setSharedCollaboration({ code, role: 'viewer', planId: payload.id, ownerId });
      }
      setJoinCodeInput('');
      setRevealingPins(true);
      setVisiblePinCount(0);
      sheetOpacity.setValue(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      requestAnimationFrame(() => {
        fitMapToPlan(enriched);
      });
    } catch (e) {
      Alert.alert('Could not open plan', e?.message ?? 'Try again.');
    } finally {
      setJoinCodeBusy(false);
    }
  }, [allPlaceMarkers, user?.id, fitMapToPlan, sheetOpacity]);

  const handleOpenSavedPlanRow = useCallback(async (row) => {
    if (!row?.plan_data) return;
    const planArr = Array.isArray(row.plan_data) ? row.plan_data : [];
    setJoinCodeBusy(true);
    try {
      const enriched = await enrichPlanWithClientData(planArr, [], allPlaceMarkers);
      setDayPlan(attachPlanRowKeys(enriched));
      setPineconeMatches([]);
      setError(null);
      setDrawerStep(3);
      setActiveSavedPlanId(row.id);
      setSharedCollaboration(null);
      setRevealingPins(true);
      setVisiblePinCount(0);
      sheetOpacity.setValue(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      requestAnimationFrame(() => {
        fitMapToPlan(enriched);
      });
    } catch (e) {
      Alert.alert('Could not load plan', e?.message ?? 'Try again.');
    } finally {
      setJoinCodeBusy(false);
    }
  }, [allPlaceMarkers, fitMapToPlan, sheetOpacity]);

  const handleSavePlanToCloud = useCallback(async () => {
    if (!dayPlan?.length) {
      Alert.alert('Nothing to save', 'Generate or open a plan first.');
      return;
    }
    if (planReadOnly) {
      Alert.alert('View only', 'This plan is shared for viewing only.');
      return;
    }
    setSavePlanBusy(true);
    try {
      const payload = serializePlanForStorage(dayPlan);
      if (sharedCollaboration?.role === 'editor' && sharedCollaboration.code) {
        await pushSharedPlanUpdate(sharedCollaboration.code, payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Saved', 'Your edits are synced to the shared plan.');
        return;
      }
      if (activeSavedPlanId) {
        await updateSavedPlan(activeSavedPlanId, { planData: payload });
        await refreshSavedPlans();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Saved', 'Your plan is updated.');
      } else {
        const defaultTitle = `My plan · ${new Date().toLocaleDateString()}`;
        const id = await createSavedPlan({ title: defaultTitle, planData: payload });
        if (id) setActiveSavedPlanId(id);
        await refreshSavedPlans();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Saved', 'Your plan is stored in Saved plans.');
      }
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    } finally {
      setSavePlanBusy(false);
    }
  }, [dayPlan, activeSavedPlanId, refreshSavedPlans, planReadOnly, sharedCollaboration]);

  const handleOpenShareModal = useCallback(async () => {
    if (!dayPlan?.length) {
      Alert.alert('Nothing to share', 'Create a plan first.');
      return;
    }
    if (planReadOnly) {
      Alert.alert('View only', 'You cannot change sharing on a view-only plan.');
      return;
    }
    setShareModalBusy(true);
    try {
      let planId = activeSavedPlanId;
      if (!planId) {
        const payload = serializePlanForStorage(dayPlan);
        planId = await createSavedPlan({
          title: `Plan · ${new Date().toLocaleDateString()}`,
          planData: payload,
        });
        if (planId) setActiveSavedPlanId(planId);
        await refreshSavedPlans();
      }
      if (!planId) {
        Alert.alert('Save first', 'Could not save plan for sharing.');
        return;
      }
      const rows = await listSavedPlans();
      const row = rows.find((r) => r.id === planId);
      setSharePermissionDraft(row?.share_permission === 'edit' ? 'edit' : 'view');
      setShareModalCode(row?.share_code || null);
      setShowSharePlanModal(true);
    } catch (e) {
      Alert.alert('Could not open sharing', e?.message ?? 'Try again.');
    } finally {
      setShareModalBusy(false);
    }
  }, [dayPlan, activeSavedPlanId, refreshSavedPlans, planReadOnly]);

  const handleConfirmShareSettings = useCallback(async () => {
    if (!activeSavedPlanId) return;
    setShareModalBusy(true);
    try {
      const code = await enableSharingForPlan(activeSavedPlanId, sharePermissionDraft);
      setShareModalCode(code);
      await refreshSavedPlans();
      const link = ExpoLinking.createURL(`plan/${code}`);
      await Clipboard.setStringAsync(`${link}\nCode: ${code}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Copied', 'Link and code are on your clipboard.');
    } catch (e) {
      Alert.alert('Sharing failed', e?.message ?? 'Try again.');
    } finally {
      setShareModalBusy(false);
    }
  }, [activeSavedPlanId, sharePermissionDraft, refreshSavedPlans]);

  const handleCopyShareLinkOnly = useCallback(async () => {
    if (!shareModalCode) return;
    try {
      const link = ExpoLinking.createURL(`plan/${shareModalCode}`);
      await Clipboard.setStringAsync(`${link}\nCode: ${shareModalCode}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Alert.alert('Copied', 'Link and code copied.');
    } catch (_) {
      /* ignore */
    }
  }, [shareModalCode]);

  const handleDisableSharing = useCallback(async () => {
    if (!activeSavedPlanId) return;
    setShareModalBusy(true);
    try {
      await disableSharingForPlan(activeSavedPlanId);
      setShareModalCode(null);
      await refreshSavedPlans();
    } catch (e) {
      Alert.alert('Could not turn off sharing', e?.message ?? 'Try again.');
    } finally {
      setShareModalBusy(false);
    }
  }, [activeSavedPlanId, refreshSavedPlans]);

  const appliedLinkCodeRef = useRef(null)
  useEffect(() => {
    const raw = route.params?.shareCode || route.params?.code
    if (!raw) return
    const n = normalizeShareCode(String(raw))
    if (n.length < 6) return
    if (appliedLinkCodeRef.current === n) return
    appliedLinkCodeRef.current = n
    applyShareCodeFromString(n)
  }, [route.params?.shareCode, route.params?.code, applyShareCodeFromString])

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
    if (!planCollaboratorEdit || !sharedCollaboration?.code) return
    if (!dayPlan?.length) return
    const t = setTimeout(() => {
      pushSharedPlanUpdate(sharedCollaboration.code, serializePlanForStorage(dayPlan)).catch((e) =>
        console.warn('[AI Plan] shared save', e?.message),
      )
    }, 2500)
    return () => clearTimeout(t)
  }, [dayPlan, planCollaboratorEdit, sharedCollaboration])

  const togglePreference = (id) => {
    setSelectedPreferences((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      schedulePrefetchFromSelections(next, selectedFoodCategories);
      return next;
    });
  };

  const toggleFoodCategory = (id) => {
    setSelectedFoodCategories((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      schedulePrefetchFromSelections(selectedPreferences, next);
      return next;
    });
  };

  const resolvePrefLabels = (prefIds) => (prefIds || [])
    .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
    .filter(Boolean);

  const resolveFoodLabels = (foodIdsArr) => (foodIdsArr || [])
    .map((id) => FOOD_CATEGORIES.find((f) => f.id === id)?.label)
    .filter(Boolean);

  /**
   * Debounces a full parallel prefetch across all four catalog fetches so that
   * selecting / deselecting chips during the modal flow leaves the cache warm
   * by the time the user reaches Generate. Safe to call on every change.
   */
  const schedulePrefetchFromSelections = (prefIds, foodIdsArr) => {
    const prefLabels = resolvePrefLabels(prefIds);
    const foodLabels = resolveFoodLabels(foodIdsArr);
    if (prefetchDebounceRef.current) clearTimeout(prefetchDebounceRef.current);
    prefetchDebounceRef.current = setTimeout(() => {
      startBackgroundPrefetch(prefLabels, foodLabels);
    }, 220);
  };

  const startBackgroundPrefetch = (prefLabels, foodLabels = []) => {
    const prefsKey = (prefLabels || []).join('|');
    const foodKey = (foodLabels || []).join('|');
    const personaKey = retrievalPersonaCacheKey(preferences?.profileSummary)
    const retrievalOpts = { profileNarrative: preferences?.profileSummary || '' }
    const cached = prefetchRef.current;
    const sameKeys =
      cached.prefsKey === prefsKey && cached.foodKey === foodKey && cached.personaKey === personaKey;
    const hasAllFresh =
      sameKeys &&
      Array.isArray(cached.places) &&
      Array.isArray(cached.events) &&
      Array.isArray(cached.restaurants) &&
      Array.isArray(cached.breakfastSpots);
    if (hasAllFresh) return;
    if (sameKeys && cached.inflight) return;

    const placesP = fetchPlaces(prefLabels, retrievalOpts).catch(() => []);
    const eventsP = fetchEvents(prefLabels, retrievalOpts).catch(() => []);
    const restaurantsP = fetchRestaurants(foodLabels, retrievalOpts).catch(() => []);
    const breakfastP = fetchBreakfastSpots(retrievalOpts).catch(() => []);

    const inflight = Promise.all([placesP, restaurantsP, breakfastP, eventsP])
      .then(([places, restaurants, breakfastSpots, events]) => {
        if (
          prefetchRef.current.prefsKey !== prefsKey ||
          prefetchRef.current.foodKey !== foodKey ||
          prefetchRef.current.personaKey !== personaKey
        ) {
          return;
        }
        prefetchRef.current = {
          prefsKey,
          foodKey,
          personaKey,
          places,
          restaurants,
          breakfastSpots,
          events,
          inflight: null,
        };
      })
      .catch(() => {
        if (prefetchRef.current.inflight === inflight) {
          prefetchRef.current = { ...prefetchRef.current, inflight: null };
        }
      });

    prefetchRef.current = {
      prefsKey,
      foodKey,
      personaKey,
      places: null,
      restaurants: null,
      breakfastSpots: null,
      events: null,
      inflight,
    };
  };

  const handleSurpriseMe = () => {
    if (surpriseSpinning) return;
    setSurpriseSpinning(true);
    setSurprisePicked(null);

    let tick = 0;
    const totalTicks = 20;
    const finalIdx = Math.floor(Math.random() * SURPRISE_THEMES.length);

    const interval = setInterval(() => {
      tick += 1;
      setSurpriseIndex(tick % SURPRISE_THEMES.length);
      if (tick >= totalTicks) {
        clearInterval(interval);
        setSurpriseIndex(finalIdx);
        setSurprisePicked(SURPRISE_THEMES[finalIdx]);
        setSurpriseSpinning(false);

        // Auto-generate after a short reveal pause
        setTimeout(() => {
          const theme = SURPRISE_THEMES[finalIdx];
          const prefLabels = theme.prefs;
          const foodLabels = theme.food;

          setActiveSavedPlanId(null);
          setSharedCollaboration(null);
          setDayPlan(null);
          setPineconeMatches([]);
          setError(null);
          setLoading(true);
          setLoadingStatus('Getting your location…');
          setDrawerStep(3);
          lastPrefLabelsRef.current = prefLabels;
          lastFoodLabelsRef.current = foodLabels;

          getCachedFeedImages()
            .then((cached) => {
              const c = Array.isArray(cached) ? cached : [];
              if (c.length > 0) setSpotPreviews(c);
              return c;
            })
            .then((c) =>
              fetchSpotPreviewsFromSupabase().then((fresh) => {
                const f = Array.isArray(fresh) ? fresh : [];
                if (f.length > c.length) setSpotPreviews(f);
              }),
            )
            .catch(() => {});

          (async () => {
            let generatedPlan = null;
            try {
              const { originLat, originLng } = await resolveOriginCoordsForPlanGeneration({ preferFreshFix: true })
              setLoadingStatus(`Scouting venues & live posts for your ${theme.label.toLowerCase()} day…`)

              const surpriseRetrievalOpts = { profileNarrative: preferences?.profileSummary || '' }
              const [
                places,
                restaurants,
                breakfastSpots,
                events,
              ] = await Promise.all([
                fetchPlaces(prefLabels, surpriseRetrievalOpts),
                fetchRestaurants(foodLabels, surpriseRetrievalOpts),
                fetchBreakfastSpots(surpriseRetrievalOpts),
                fetchEvents(prefLabels, surpriseRetrievalOpts),
              ]);

              console.log(`[Surprise ${theme.label}] ${places.length}P ${restaurants.length}R ${breakfastSpots.length}B ${events.length}E`);

              const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
              setPineconeMatches(allMatches);

              setLoadingStatus('Shortlisting restaurants & cafés that fit your vibe…');
              await new Promise((res) => setTimeout(res, 380));
              setLoadingStatus(`Khalid is crafting your ${theme.label.toLowerCase()} day…`);
              const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels, {
                profileGeneral: generalLabels,
                profileActivity: activityLabels,
                profileFood: savedProfileFoodLabels,
                profileNarrative: preferences?.profileSummary || '',
                profileAnswers: preferences?.profileAnswers || {},
                travelExplore: 'balanced',
                originLat,
                originLng,
              });
              generatedPlan = plan;
              const enriched = await enrichPlanWithClientData(plan, allMatches, allPlaceMarkers);
              setDayPlan(attachPlanRowKeys(enriched));
              setError(null);

              const validMarkers = buildMapMarkers(plan, allPlaceMarkers).filter(m => m.lat && m.lng);
              const coords = validMarkers.map(m => ({ latitude: m.lat, longitude: m.lng }));
              const u = userLocationRef.current;
              if (u?.latitude != null && u?.longitude != null) {
                coords.push({ latitude: u.latitude, longitude: u.longitude });
              }
              if (coords.length > 0 && mapRef.current) {
                markProgrammaticMapMove(2200);
                mapRef.current.fitToCoordinates(coords, {
                  edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
                  animated: true,
                });
              }
    } catch (err) {
      console.warn('[AI Plan] API error:', err?.message);
      generatedPlan = null;
      setDayPlan(null);
      setError(err?.message || 'Could not generate your plan. Try again.');
    } finally {
      setLoading(false);
      setLoadingStatus('');
      if (generatedPlan && generatedPlan.length > 0) {
                setRevealingPins(true);
                setVisiblePinCount(0);
                sheetOpacity.setValue(0);
              } else {
                sheetOpacity.setValue(1);
                lastSnap.current = SNAP_POINTS[0];
                Animated.spring(sheetAnim, {
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
    setPlanGenerationSuccess(false)
    setRevealingPins(false)
    setVisiblePinCount(0)
    sheetOpacity.setValue(1)
    setActiveSavedPlanId(null)
    setSharedCollaboration(null)
    const seededPrefs = Array.isArray(preferences?.activityIds) ? preferences.activityIds : []
    const seededFoods = Array.isArray(preferences?.foodIds) ? preferences.foodIds : []
    setSelectedPreferences(seededPrefs)
    setSelectedFoodCategories(seededFoods)
    setDayPlan(null)
    setPineconeMatches([])
    setError(null)
    setSpotPreviews([])
    setPlanModalStep(1)
    setTravelExploreId('balanced')
    // Kick off a speculative prefetch the moment the modal opens so the
    // catalog for the user's saved profile is warm by the time Generate fires.
    schedulePrefetchFromSelections(seededPrefs, seededFoods)

    doorLeft.setValue(-SCREEN_WIDTH / 2)
    doorRight.setValue(SCREEN_WIDTH / 2)
    doorIconScale.setValue(0)
    doorIconOpacity.setValue(0)
    doorFade.setValue(1)
    setDoorVisible(true)

    planModalBackdrop.setValue(1)
    planModalScale.setValue(1)
    planModalOpacity.setValue(1)

    Animated.sequence([
      Animated.parallel([
        Animated.spring(doorIconScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
        Animated.timing(doorIconOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(doorLeft, { toValue: 0, duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
        Animated.timing(doorRight, { toValue: 0, duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
      ]),
    ]).start(() => {
      skipOpenAnim.current = true
      setShowPlanModal(true)

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(doorIconOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(doorIconScale, { toValue: 0.6, duration: 150, useNativeDriver: true }),
        ]).start(() => {
          Animated.parallel([
            Animated.timing(doorLeft, { toValue: -SCREEN_WIDTH / 2, duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
            Animated.timing(doorRight, { toValue: SCREEN_WIDTH / 2, duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
          ]).start(() => {
            setDoorVisible(false)
          })
        })
      })
    })
  };

  const handleSharePlanWithFriends = useCallback(async () => {
    const { message, title } = formatPlanShareMessage(dayPlan);
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
  }, [dayPlan]);

  const renderPlanTimelineOverviewHeader = useCallback(() => {
    if (!dayPlan?.length) return null
    const mealCount = dayPlan.filter((i) => i.type === 'restaurant').length
    const sharedBanner =
      sharedCollaboration?.role === 'viewer'
        ? 'View-only shared plan'
        : sharedCollaboration?.role === 'editor'
          ? 'Shared plan — your edits sync to the owner'
          : sharedCollaboration?.role === 'owner'
            ? 'Your saved plan (you can edit and re-share)'
            : null
    const titleLabel =
      sharedCollaboration?.role === 'viewer' || sharedCollaboration?.role === 'editor'
        ? 'Shared Bahrain day'
        : 'Your Bahrain day'
    const canEditSavedPlanTitle =
      !!activeSavedPlanId &&
      !planReadOnly &&
      (sharedCollaboration == null || sharedCollaboration.role === 'owner')
    const rowForTitle = savedPlansList.find((p) => p.id === activeSavedPlanId)
    const savedTitleRaw = typeof rowForTitle?.title === 'string' ? rowForTitle.title.trim() : ''
    const primaryTitle = canEditSavedPlanTitle && savedTitleRaw ? savedTitleRaw : titleLabel

    return (
      <View style={styles.planLuxuryOverviewCard} accessibilityRole="summary">
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
              setDrawerStep(0)
              setDayPlan(null)
              setError(null)
              setActiveSavedPlanId(null)
              setSharedCollaboration(null)
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to plans"
          >
            <Ionicons name="chevron-back" size={18} color="#1A120A" />
          </TouchableOpacity>

          <View style={styles.planLuxuryOverviewTitleBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.planLuxuryOverviewTitle} numberOfLines={1}>
                {primaryTitle}
              </Text>
            </View>
            <Text style={styles.planLuxuryOverviewSubtitle} numberOfLines={1}>
              {mealCount === 0
                ? `${dayPlan.length} STOPS`
                : `${dayPlan.length} STOPS · ${mealCount} MEALS`}
            </Text>
          </View>

          <View style={styles.planLuxuryOverviewHeaderActions}>
            {canEditSavedPlanTitle && (
              <TouchableOpacity
                style={styles.planLuxuryOverviewIconBtn}
                activeOpacity={0.7}
                onPress={() => handleOpenEditSavedPlanTitle(activeSavedPlanId)}
                accessibilityRole="button"
                accessibilityLabel="Edit title"
              >
                <Ionicons name="create-outline" size={18} color="#64748B" />
              </TouchableOpacity>
            )}
            {!planReadOnly && (
              <TouchableOpacity
                style={styles.planLuxuryOverviewIconBtn}
                activeOpacity={0.75}
                onPress={handleSavePlanToCloud}
                disabled={savePlanBusy}
                accessibilityRole="button"
                accessibilityLabel="Save plan"
              >
                {savePlanBusy ? (
                  <ActivityIndicator size="small" color="#1A120A" />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={18} color="#1A120A" />
                )}
              </TouchableOpacity>
            )}
            {!planReadOnly && (
              <TouchableOpacity
                style={styles.planLuxuryOverviewIconBtn}
                activeOpacity={0.75}
                onPress={handleOpenShareModal}
                disabled={shareModalBusy}
                accessibilityRole="button"
                accessibilityLabel="Link and share options"
              >
                <Ionicons name="link-outline" size={18} color="#1A120A" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.planLuxuryOverviewIconBtn}
              activeOpacity={0.75}
              onPress={handleSharePlanWithFriends}
              accessibilityRole="button"
              accessibilityLabel="Share plan as text"
            >
              <Ionicons name="share-outline" size={18} color="#1A120A" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.planLuxuryOverviewControlTray}>
          <View style={styles.planLuxuryOverviewActionsRow}>
            <TouchableOpacity
              style={[styles.planLuxuryOverviewMapBtn, styles.planLuxuryOverviewMapBtnFlex]}
              onPress={handleOpenInGoogleMaps}
              disabled={openingMaps}
              activeOpacity={0.85}
              accessibilityLabel="Maps"
            >
              {openingMaps ? (
                <ActivityIndicator size="small" color="#1A120A" />
              ) : (
                <>
                  <Ionicons name="map-outline" size={16} color="#1A120A" />
                  <Text style={styles.planLuxuryOverviewMapBtnText}>MAPS</Text>
                </>
              )}
            </TouchableOpacity>
            {!planReadOnly && (
              <TouchableOpacity
                style={[styles.planLuxuryOverviewMapBtn, styles.planLuxuryOverviewMapBtnFlex, styles.planLuxuryOverviewAddBtn]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  setShowSearchModal(true)
                }}
                activeOpacity={0.85}
                accessibilityLabel="Add stop"
              >
                <Ionicons name="add" size={18} color={themeColors.primary} />
                <Text style={styles.planLuxuryOverviewAddBtnText}>ADD</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    )
  }, [
    dayPlan,
    allPlaceMarkers,
    openingMaps,
    handleOpenInGoogleMaps,
    handleSharePlanWithFriends,
    setShowSearchModal,
    sharedCollaboration,
    planReadOnly,
    handleSavePlanToCloud,
    savePlanBusy,
    handleOpenShareModal,
    shareModalBusy,
    activeSavedPlanId,
    savedPlansList,
    handleOpenEditSavedPlanTitle,
  ])

  const handleCopyShareText = useCallback(async () => {
    const { message } = formatPlanShareMessage(dayPlan);
    try {
      await Clipboard.setStringAsync(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (shareCopyHintTimerRef.current) clearTimeout(shareCopyHintTimerRef.current);
      setShareCopyHint(true);
      shareCopyHintTimerRef.current = setTimeout(() => {
        setShareCopyHint(false);
        shareCopyHintTimerRef.current = null;
      }, 2200);
    } catch (_) {
      Alert.alert('Could not copy', 'Please try again.');
    }
  }, [dayPlan]);

  const handleEnhanceStop = useCallback(async (planIndex) => {
    if (planIndex == null || planIndex < 0) return
    if (enhancingIndex !== null || loading) return
    if (planReadOnly) {
      Alert.alert('View only', 'This plan is shared for viewing only.')
      return
    }
    if (!dayPlan?.length) {
      Alert.alert('Unavailable', 'Build a plan first so we can swap this stop.')
      return
    }
    setEnhancingIndex(planIndex)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    const prevKeys = dayPlan.map((x) => x._planRowKey)
    const draft = [...dayPlan]
    try {
      const { replacement: rawStop, enrichCatalog } = await enhancePlanStopAtIndex(
        dayPlan,
        planIndex,
        pineconeMatches,
        lastPrefLabelsRef.current || [],
        lastFoodLabelsRef.current || [],
        {
          profileGeneral: generalLabels,
          profileActivity: activityLabels,
          profileFood: savedProfileFoodLabels,
          profileNarrative: preferences?.profileSummary || '',
          profileAnswers: preferences?.profileAnswers || {},
        },
      )
      const newKey = `rk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      draft[planIndex] = { ...rawStop, _planRowKey: newKey }
      const mergedKeys = prevKeys.map((k, i) => (i === planIndex ? newKey : k))
      const enrichPool = enrichCatalog?.length ? enrichCatalog : pineconeMatches
      const enriched = await enrichPlanWithClientData(draft, enrichPool, allPlaceMarkers)
      const keyed = attachPlanRowKeys(
        enriched.map((item, i) => ({ ...item, _planRowKey: mergedKeys[i] || item._planRowKey })),
      )
      setDayPlan(keyed)
      setStopDetailIndex((prev) => {
        if (prev == null || prev !== planIndex) return prev
        return Math.min(planIndex, keyed.length - 1)
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (e) {
      Alert.alert('Enhance failed', e?.message || 'Please try again.')
    } finally {
      setEnhancingIndex(null)
    }
  }, [
    dayPlan,
    pineconeMatches,
    enhancingIndex,
    loading,
    planReadOnly,
    generalLabels,
    activityLabels,
    savedProfileFoodLabels,
    colors.morning,
    colors.afternoon,
    colors.evening,
  ])

  const addToPlanMode = Boolean(dayPlan?.length)

  const handleAddClientToPlan = useCallback(async (client) => {
    if (planReadOnly) return
    if (!dayPlan?.length || !client) return
    const cid = client.client_a_uuid || client.clientId
    if (cid && dayPlan.some((s) => s.clientId && s.clientId === cid)) {
      Alert.alert(
        'Already on your itinerary',
        'This place is already in your plan. Drag the list to change the order.',
      )
      return
    }
    if (addingPlanStop || enhancingIndex !== null) return
    setAddingPlanStop(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    try {
      const draftStop = buildDraftStopFromClient(client, dayPlan)
      const draftPlan = [...dayPlan, draftStop]
      const enriched = await enrichPlanWithClientData(draftPlan, pineconeMatches, allPlaceMarkers)
      const keyed = attachPlanRowKeys(enriched)
      setDayPlan(keyed)
      setVisibleStopCount(keyed.length)
      setShowSearchModal(false)
      setSearchModalQuery('')
      const validMarkers = buildMapMarkers(keyed, allPlaceMarkers).filter((m) => m?.lat && m?.lng)
      const coords = validMarkers.map((m) => ({ latitude: m.lat, longitude: m.lng }))
      if (coords.length > 0 && mapRef.current) {
        markProgrammaticMapMove(2200);
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
          animated: true,
        })
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (e) {
      Alert.alert('Could not add stop', e?.message || 'Please try again.')
    } finally {
      setAddingPlanStop(false)
    }
  }, [
    dayPlan,
    pineconeMatches,
    allPlaceMarkers,
    addingPlanStop,
    enhancingIndex,
    planReadOnly,
  ])

  useEffect(() => () => {
    if (shareCopyHintTimerRef.current) clearTimeout(shareCopyHintTimerRef.current);
  }, []);

  useEffect(() => {
    const openPlanModal = route.params?.openPlanModal;
    if (openPlanModal) {
      startSetup();
    }
  }, [route.params?.openPlanModal]);

  const closePlanModal = (then) => {
    doorLeft.setValue(0)
    doorRight.setValue(0)
    doorIconScale.setValue(0)
    doorIconOpacity.setValue(0)
    doorFade.setValue(1)
    setDoorVisible(true)

    requestAnimationFrame(() => {
      setShowPlanModal(false)
      setPlanGenerationSuccess(false)
      planModalBackdrop.setValue(0)
      planModalScale.setValue(0.95)
      planModalOpacity.setValue(0)

      Animated.sequence([
        Animated.parallel([
          Animated.spring(doorIconScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
          Animated.timing(doorIconOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(doorLeft, { toValue: -SCREEN_WIDTH / 2, duration: 420, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
          Animated.timing(doorRight, { toValue: SCREEN_WIDTH / 2, duration: 420, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(doorIconScale, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(doorIconOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]).start(() => {
        setDoorVisible(false)
        then?.()
      })
    })
  };

  const openPlanModalAnim = () => {
    Animated.parallel([
      Animated.timing(planModalBackdrop, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(planModalScale, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(planModalOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

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

  const handleGenerate = async (onComplete) => {
    const prefLabels = selectedPreferences
      .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
      .filter(Boolean);
    const foodLabels = selectedFoodCategories
      .map((id) => FOOD_CATEGORIES.find((f) => f.id === id)?.label)
      .filter(Boolean);

    setLoading(true);
    setPlanGenerationSuccess(false);
    setLoadingStatus('Getting your location for this plan…');
    setError(null);
    setActiveSavedPlanId(null);
    setSharedCollaboration(null);
    setDayPlan(null);
    setPineconeMatches([]);
    setDrawerStep(3);
    lastPrefLabelsRef.current = prefLabels;
    lastFoodLabelsRef.current = foodLabels;

    // Get cached feed images immediately, fetch more in background
    getCachedFeedImages()
      .then((cached) => {
        const c = Array.isArray(cached) ? cached : [];
        if (c.length > 0) setSpotPreviews(c);
        return c;
      })
      .then((c) =>
        fetchSpotPreviewsFromSupabase().then((fresh) => {
          const f = Array.isArray(fresh) ? fresh : [];
          if (f.length > c.length) setSpotPreviews(f);
        }),
      )
      .catch(() => {});

    let generatedPlan = null;
    try {
      const { originLat, originLng } = await resolveOriginCoordsForPlanGeneration({ preferFreshFix: true })
      setLoadingStatus('Khalid is scouting live posts for standout venues…')

      const prefsKey = prefLabels.join('|');
      const foodKey = foodLabels.join('|');
      const personaKey = retrievalPersonaCacheKey(preferences?.profileSummary)
      const retrievalOpts = { profileNarrative: preferences?.profileSummary || '' }

      // Kick off matching prefetch (idempotent) so if nothing cached yet,
      // we still begin the work immediately while we await it below.
      startBackgroundPrefetch(prefLabels, foodLabels);
      if (prefetchRef.current.inflight) {
        try { await prefetchRef.current.inflight; } catch (_) {}
      }

      const cached = prefetchRef.current;
      const cacheHit =
        cached.prefsKey === prefsKey &&
        cached.foodKey === foodKey &&
        cached.personaKey === personaKey &&
        Array.isArray(cached.places) &&
        Array.isArray(cached.restaurants) &&
        Array.isArray(cached.breakfastSpots) &&
        Array.isArray(cached.events);

      let places;
      let breakfastSpots;
      let events;
      let restaurants;

      if (cacheHit) {
        places = cached.places;
        restaurants = cached.restaurants;
        breakfastSpots = cached.breakfastSpots;
        events = cached.events;
      } else {
        const [
          placesResult,
          restaurantsResult,
          breakfastResult,
          eventsResult,
        ] = await Promise.all([
          fetchPlaces(prefLabels, retrievalOpts),
          fetchRestaurants(foodLabels, retrievalOpts),
          fetchBreakfastSpots(retrievalOpts),
          fetchEvents(prefLabels, retrievalOpts),
        ]);
        places = placesResult;
        restaurants = restaurantsResult;
        breakfastSpots = breakfastResult;
        events = eventsResult;
      }

      const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
      setPineconeMatches(allMatches);

      console.log(`Pinecone: ${places.length} places, ${restaurants.length} restaurants, ${breakfastSpots.length} breakfast, ${events.length} events`);

      // Pipeline Step 5 — GPT builds a smart day plan from all results
      setLoadingStatus('Shortlisting restaurants & experiences for you…');
      await new Promise((res) => setTimeout(res, 380));
      setLoadingStatus('Khalid is crafting your perfect day…');
      const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels, {
        profileGeneral: generalLabels,
        profileActivity: activityLabels,
        profileFood: savedProfileFoodLabels,
        profileNarrative: preferences?.profileSummary || '',
        profileAnswers: preferences?.profileAnswers || {},
        travelExplore: travelExploreId,
        originLat,
        originLng,
      });
      generatedPlan = plan;
      const enriched = await enrichPlanWithClientData(plan, allMatches, allPlaceMarkers);
      setDayPlan(attachPlanRowKeys(enriched));
      setError(null);

      // Debug markers
      const markers = buildMapMarkers(plan || [], allPlaceMarkers);
      console.log(`Map markers: ${markers.length}/${plan.length} spots have coordinates`);

      // Fit map to show all markers
      const validMarkers = buildMapMarkers(plan, allPlaceMarkers).filter(m => m.lat && m.lng);
      const coords = validMarkers.map(m => ({ latitude: m.lat, longitude: m.lng }));
      const u = userLocationRef.current;
      if (u?.latitude != null && u?.longitude != null) {
        coords.push({ latitude: u.latitude, longitude: u.longitude });
      }
      if (coords.length > 0 && mapRef.current) {
        markProgrammaticMapMove(2200);
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
          animated: true,
        });
      }

    } catch (err) {
      console.warn('[AI Plan] API error:', err?.message);
      generatedPlan = null;
      setDayPlan(null);
      setError(err?.message || 'Could not generate your plan. Try again.');
    } finally {
      setLoading(false);
      setLoadingStatus('');
      const succeeded = generatedPlan != null && generatedPlan.length > 0;
      if (succeeded) {
        setPlanGenerationSuccess(true);
        setTimeout(() => {
          onComplete?.();
          setRevealingPins(true);
          setVisiblePinCount(0);
          sheetOpacity.setValue(0);
        }, 3200);
      } else {
        sheetOpacity.setValue(1);
        lastSnap.current = SNAP_POINTS[0];
        Animated.spring(sheetAnim, {
          toValue: SNAP_POINTS[0],
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
        onComplete?.();
      }
    }
  };

  useEffect(() => {
    const id = sheetAnim.addListener(({ value }) => { currentYRef.current = value; });
    return () => sheetAnim.removeListener(id);
  }, [sheetAnim]);

  useEffect(() => {
    if (!showPlanModal) return
    if (skipOpenAnim.current) {
      skipOpenAnim.current = false
      return
    }
    openPlanModalAnim()
  }, [showPlanModal]);

  // Pin reveal: show pins one by one, pan camera to each, then open sheet with fade
  useEffect(() => {
    if (!revealingPins || !dayPlan) return;
    const markers = buildMapMarkers(dayPlan, allPlaceMarkers);
    if (markers.length === 0) {
      setRevealingPins(false);
      sheetOpacity.setValue(1);
      lastSnap.current = SNAP_POINTS[0];
      scheduleStaggeredStopReveal(dayPlan.length);
      Animated.spring(sheetAnim, {
        toValue: SNAP_POINTS[0],
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      return;
    }
    // Initial pan to first place
    const first = markers[0];
    if (first && mapRef.current) {
      markProgrammaticMapMove(900);
      mapRef.current.animateToRegion(
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
      setVisiblePinCount((prev) => {
        if (prev >= markers.length) {
          clearInterval(interval);
          setTimeout(() => {
            setRevealingPins(false);
            lastSnap.current = SNAP_POINTS[0];
            scheduleStaggeredStopReveal(dayPlan.length);
            Animated.parallel([
              Animated.timing(sheetOpacity, {
                toValue: 1,
                duration: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.spring(sheetAnim, {
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
        if (mk && mapRef.current) {
          markProgrammaticMapMove(850);
          mapRef.current.animateToRegion(
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
  }, [revealingPins, dayPlan, scheduleStaggeredStopReveal]);

  const regionThrottleRef = useRef({ last: 0, lastDelta: null });
  const handleRegionChange = (region) => {
    if (region?.latitudeDelta == null) return;
    const now = Date.now();
    const prev = regionThrottleRef.current;
    const deltaChanged = prev.lastDelta == null || Math.abs(region.latitudeDelta - prev.lastDelta) / prev.lastDelta > 0.08;
    if (deltaChanged || now - prev.last > 120) {
      prev.last = now;
      prev.lastDelta = region.latitudeDelta;
      setMapRegion(region);
    }
  };

  const handleRegionChangeComplete = (region) => {
    if (!region || !mapRef.current) return;
    if (mapProgrammaticMoveRef.current) {
      if (region?.latitudeDelta != null) setMapRegion(region);
      return;
    }
    const clamped = clampRegionToBahrain(region);
    if (Math.abs(clamped.latitude - region.latitude) > 0.0005 || Math.abs(clamped.longitude - region.longitude) > 0.0005) {
      markProgrammaticMapMove(400);
      mapRef.current.animateToRegion(clamped, 180);
    }
    if (region?.latitudeDelta != null) setMapRegion(region);
  };

  const showcaseMarkerAccent = useMemo(() => {
    if (!showcaseMarkerMk) return colors.textSecondary;
    const cat = mapMarkerFilterCategoryKey(showcaseMarkerMk);
    const isEat = cat === 'restaurant';
    const isEvent = cat === 'event';
    if (dayPlan?.length) {
      const timeCols = { Morning: colors.morning, Afternoon: colors.afternoon, Evening: colors.evening };
      return isEat ? colors.dining : isEvent ? colors.event : (timeCols[showcaseMarkerMk.time] || colors.textSecondary);
    }
    return isEat ? colors.dining : isEvent ? colors.event : colors.textSecondary;
  }, [showcaseMarkerMk, dayPlan, colors]);

  const zoomScale = useMemo(() => {
    const delta = mapRegion?.latitudeDelta ?? BAHRAIN_REGION.latitudeDelta;
    return Math.max(0.2, Math.min(1, 0.06 / delta));
  }, [mapRegion]);

  const refreshShowcaseMorphAnchor = useCallback(() => {
    const map = mapRef.current;
    const mk = showcaseMarkerMk;
    if (!map || !mk || mk.lat == null || mk.lng == null) return;
    const delta = mapRegion?.latitudeDelta ?? BAHRAIN_REGION.latitudeDelta;
    const zs = Math.max(0.2, Math.min(1, 0.06 / delta));
    const sizePx = Math.max(46, Math.min(96, 56 * zs));
    if (typeof map.pointForCoordinate !== 'function') {
      setShowcaseMorphAnchor({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.42, sizePx });
      return;
    }
    map
      .pointForCoordinate({ latitude: Number(mk.lat), longitude: Number(mk.lng) })
      .then((pt) => {
        if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
          setShowcaseMorphAnchor({ x: pt.x, y: pt.y, sizePx });
        }
      })
      .catch(() => {
        setShowcaseMorphAnchor({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.42, sizePx });
      });
  }, [showcaseMarkerMk, mapRegion]);

  useEffect(() => {
    if (!isMarkerShowcaseActive || !showcaseMarkerMk) {
      setShowcaseMorphAnchor(null);
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
  }, [isMarkerShowcaseActive, showcaseMarkerMk, refreshShowcaseMorphAnchor]);

  useEffect(() => {
    if (!isMarkerShowcaseActive || !showcaseMarkerMk) return;
    const t = setTimeout(() => refreshShowcaseMorphAnchor(), 120);
    return () => clearTimeout(t);
  }, [mapRegion, isMarkerShowcaseActive, showcaseMarkerMk, refreshShowcaseMorphAnchor]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 0.72,
      onPanResponderGrant: () => { lastSnap.current = currentYRef.current; },
      onPanResponderMove: (_, g) => {
        const newY = lastSnap.current + g.dy;
        sheetAnim.setValue(Math.max(SNAP_POINTS[0], Math.min(SNAP_POINTS[2], newY)));
      },
      onPanResponderRelease: (_, g) => {
        const currentY = lastSnap.current + g.dy;
        let targetIndex = 0;
        let minDist = Math.abs(currentY - SNAP_POINTS[0]);
        for (let i = 1; i < SNAP_POINTS.length; i++) {
          const d = Math.abs(currentY - SNAP_POINTS[i]);
          if (d < minDist) { minDist = d; targetIndex = i; }
        }
        if (g.vy > 0.4) targetIndex = Math.min(2, targetIndex + 1);
        else if (g.vy < -0.4) targetIndex = Math.max(0, targetIndex - 1);
        const target = SNAP_POINTS[targetIndex];
        lastSnap.current = target;
        Animated.spring(sheetAnim, { toValue: target, useNativeDriver: true, tension: 80, friction: 12 }).start();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={BAHRAIN_REGION}
        mapType="standard"
        showsUserLocation
        showsMyLocationButton={false}
        onPress={handleMapPress}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {/* Pre-plan: all clients with profile images as markers */}
        {!dayPlan &&
          allPlaceMarkers
            .filter((mk) => markerMatchesPlanMapClientFilter(mk, activePlanMapClientFilter))
            .map((mk) => {
          const isEat = mapMarkerFilterCategoryKey(mk) === 'restaurant';
          const isEvent = mapMarkerFilterCategoryKey(mk) === 'event';
          const accent = isEat ? colors.dining : isEvent ? colors.event : colors.textSecondary;
          return (
            <AnimatedPlaceMarker
              key={mk.clientId || `pre-${mk.idx}-${mk.lat}-${mk.lng}`}
              mk={mk}
              accent={accent}
              isCurrent={false}
              showBadge={false}
              showCircle={false}
              zoomScale={zoomScale}
              onPress={() => handlePlaceMarkerPress(mk)}
            />
          );
        })}
        {/* Plan markers — reveal one by one with profile images and entrance animation */}
        {dayPlan && (() => {
          const markers = buildMapMarkers(dayPlan, allPlaceMarkers);
          const maxVisible = revealingPins ? visiblePinCount : markers.length;
          return markers
            .filter((mk) => mk.idx < maxVisible)
            .filter((mk) => markerMatchesPlanMapClientFilter(mk, activePlanMapClientFilter))
            .map((mk) => {
            const isEat = mapMarkerFilterCategoryKey(mk) === 'restaurant';
            const isEvent = mapMarkerFilterCategoryKey(mk) === 'event';
            const timeCols = { Morning: colors.morning, Afternoon: colors.afternoon, Evening: colors.evening };
            const accent = isEat ? colors.dining : isEvent ? colors.event : (timeCols[mk.time] || colors.textSecondary);
            const isCurrent = revealingPins && mk.idx === visiblePinCount - 1;
            return (
              <AnimatedPlaceMarker
                key={mk.idx}
                mk={mk}
                accent={accent}
                isCurrent={isCurrent}
                zoomScale={zoomScale}
                onPress={() => handlePlaceMarkerPress(mk)}
              />
            );
          });
        })()}
      </MapView>

      {isMarkerShowcaseActive ? (
        <View
          style={[styles.markerShowcaseExitWrap, { top: insets.top + 56 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.markerShowcaseExitBtn}
            onPress={exitMarkerShowcase}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Done viewing place"
          >
            <Text style={styles.markerShowcaseExitBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isMarkerShowcaseActive && showcaseMarkerMk && !markerDetailSheetVisible ? (
        <View
          style={[
            styles.markerViewDetailsWrapBase,
            showcaseMorphAnchor
              ? {
                  position: 'absolute',
                  left: Math.max(
                    8,
                    Math.min(SCREEN_WIDTH - 8 - 216, showcaseMorphAnchor.x - 108),
                  ),
                  top: Math.max(
                    insets.top + 48,
                    Math.min(
                      SCREEN_HEIGHT - insets.bottom - 100,
                      showcaseMorphAnchor.y + showcaseMorphAnchor.sizePx * 0.52 + 6,
                    ),
                  ),
                  width: 216,
                }
              : [styles.markerViewDetailsWrapFallback, { bottom: insets.bottom + 112 }],
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            style={({ pressed }) => [
              styles.markerViewDetailsPill,
              pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMarkerDetailSheetVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="View more details about this place"
          >
            <Ionicons name="sparkles-outline" size={17} color={showcaseMarkerAccent} />
            <Text style={[styles.markerViewDetailsPillText, { color: colors.textPrimary }]}>View details</Text>
            <Ionicons name="chevron-up" size={18} color={showcaseMarkerAccent} />
          </Pressable>
        </View>
      ) : null}

      <MarkerShowcaseDetailSheet
        visible={markerDetailSheetVisible}
        mk={showcaseMarkerMk}
        morphAnchor={showcaseMorphAnchor}
        onDismiss={() => setMarkerDetailSheetVisible(false)}
        insets={insets}
        accent={showcaseMarkerAccent}
        onViewProfile={(clientId) => {
          if (clientId) setProfileClientId(clientId);
        }}
      />

      <View style={[styles.topBarWrap, { paddingTop: insets.top + 2 }]} pointerEvents="box-none">
        <View style={styles.topBarBalanceSpacer} pointerEvents="none" accessibilityElementsHidden />
        <View style={styles.planMapFilterCenterWrap} pointerEvents="box-none">
          <View style={styles.planMapFilterOuter}>
            <View style={styles.planMapFilterTabsWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.planMapFilterScroll}
                accessibilityRole="toolbar"
                accessibilityLabel="Filter map pins by client type from the client table"
              >
                {PLAN_MAP_CLIENT_TYPE_FILTERS.map((t) => {
                  const on = activePlanMapClientFilter === t.id;
                  const P = communityPalette;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.planMapFilterChipCommunity,
                        {
                          backgroundColor: on ? P.red : P.bg,
                          borderColor: on ? P.red : P.border,
                          ...(on
                            ? Platform.select({
                                ios: { shadowColor: P.red, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.35, shadowRadius: 4 },
                                android: { elevation: 4 },
                              })
                            : {}),
                        },
                      ]}
                      onPress={() => handlePlanMapClientFilterPress(t.id)}
                      activeOpacity={0.82}
                      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                      accessibilityRole="button"
                      accessibilityLabel={t.label}
                      accessibilityState={{ selected: on }}
                    >
                      <Ionicons name={t.icon} size={22} color={on ? '#FFF' : P.sub} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.searchButton, planReadOnly && { opacity: 0.4 }]}
          activeOpacity={0.8}
          onPress={() => {
            if (planReadOnly) return
            setShowSearchModal(true)
          }}
          disabled={planReadOnly}
          accessibilityRole="button"
          accessibilityLabel={dayPlan?.length ? 'Add a stop or browse places' : 'Search places'}
        >
          <Ionicons name={dayPlan?.length ? 'add' : 'search'} size={22} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      {/* Scanning overlay during Hang tight removed (no radar effect) */}
      <MapScanningOverlay visible={false} />

      <Animated.View
        style={[
          styles.sheet,
          drawerStep === 0 && styles.sheetStep0Tint,
          drawerStep === 3 && styles.sheetPlanResultsTint,
          drawerStep === 3 && styles.sheetPlanOverflowVisible,
          {
            paddingBottom: getPlanSheetBottomPadding(insets),
            opacity: sheetOpacity,
            transform: [{ translateY: sheetAnim }],
          },
        ]}
      >
        <View
          style={styles.sheetDragArea}
          {...panResponder.panHandlers}
          hitSlop={{ top: 16, bottom: 6, left: 0, right: 0 }}
          accessibilityRole="button"
          accessibilityLabel="Swipe up to expand the plan, or drag down to see more map"
        >
          <View style={styles.grabber} />
          <Text style={styles.sheetDragHint}>Swipe up</Text>
        </View>

        {/* Step 0 — Past Plans (modern hero layout) */}
        {drawerStep === 0 && (
          <View style={styles.pastPlansStepWrap}>
            <View style={styles.sheetStep0GlassOuter}>
              <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint="light" style={styles.planMastheadBlur} />
              <View style={styles.planMastheadFrost} pointerEvents="none" />
              <ScrollView style={styles.sheetStep0GlassScroll} contentContainerStyle={styles.d0ScrollContent} showsVerticalScrollIndicator={false}>
              {/* Build CTA */}
              <AiStagger
                delay={0}
                entering={FadeIn.duration(340).delay(0)}
              >
                <Pressable
                  style={({ pressed }) => [styles.d0CtaRow, pressed && { opacity: 0.93, transform: [{ scale: 0.98 }] }]}
                  onPress={startSetup}
                >
                  <LinearGradient
                    colors={[themeColors.primary, '#E63950']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.d0CtaGradient}
                  >
                    <View style={styles.d0CtaLogoWrap}>
                      <CachedImage
                        source={require('../../assets/ai-button-logo.png')}
                        style={styles.d0CtaLogo}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={styles.d0CtaLeft}>
                      <Text style={styles.d0CtaTitle}>Build my day</Text>
                      <Text style={styles.d0CtaSub}>AI plans your perfect Bahrain day</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                  </LinearGradient>
                </Pressable>
              </AiStagger>

              {/* Past plans section */}
              <AiStagger delay={120}>
                <View style={styles.d0JoinRow}>
                  <Text style={styles.d0JoinLabel}>Open a shared plan</Text>
                  <View style={styles.d0JoinInputRow}>
                    <TextInput
                      style={styles.d0JoinInput}
                      value={joinCodeInput}
                      onChangeText={(t) => setJoinCodeInput(t.toUpperCase())}
                      placeholder="ENTER CODE"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={12}
                      editable={!joinCodeBusy}
                      accessibilityLabel="Share code"
                    />
                    <TouchableOpacity
                      style={styles.d0JoinBtn}
                      activeOpacity={0.85}
                      disabled={joinCodeBusy}
                      onPress={() => applyShareCodeFromString(joinCodeInput)}
                      accessibilityRole="button"
                      accessibilityLabel="Open shared plan"
                    >
                      {joinCodeBusy ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.d0JoinBtnText}>Open</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </AiStagger>
              {savedPlansList.length > 0 && (
                <>
                  <AiStagger delay={140}>
                    <View style={styles.d0SectionHeader}>
                      <Text style={styles.d0SectionTitle}>Saved plans</Text>
                      <View style={styles.d0SectionCount}>
                        <Text style={styles.d0SectionCountText}>{savedPlansList.length}</Text>
                      </View>
                    </View>
                  </AiStagger>
                  {savedPlansList.map((plan, idx) => {
                    const n = Array.isArray(plan.plan_data) ? plan.plan_data.length : 0
                    return (
                      <AiStagger key={plan.id} delay={180 + idx * 50}>
                        <View style={styles.d0PlanCard}>
                          <TouchableOpacity
                            style={styles.d0PlanCardMainHit}
                            activeOpacity={0.8}
                            disabled={joinCodeBusy}
                            onPress={() => handleOpenSavedPlanRow(plan)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open saved plan ${plan.title}`}
                          >
                            <View style={styles.d0PlanIconWrap}>
                              <Ionicons name="map" size={20} color={themeColors.primary} />
                            </View>
                            <View style={styles.d0PlanInfo}>
                              <Text style={styles.d0PlanName}>{plan.title}</Text>
                              <Text style={styles.d0PlanMeta}>
                                {n} stops · {formatSavedPlanDate(plan.updated_at)}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                          </TouchableOpacity>
                          <View style={styles.d0PlanRowActions}>
                            <TouchableOpacity
                              style={styles.d0PlanRowActionBtn}
                              activeOpacity={0.75}
                              disabled={joinCodeBusy}
                              onPress={() => handleOpenEditSavedPlanTitle(plan.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`Rename ${plan.title}`}
                            >
                              <Ionicons name="create-outline" size={20} color="#64748B" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.d0PlanRowActionBtn}
                              activeOpacity={0.75}
                              disabled={joinCodeBusy}
                              onPress={() => handleRequestDeleteSavedPlan(plan)}
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${plan.title}`}
                            >
                              <Ionicons name="trash-outline" size={20} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </AiStagger>
                    )
                  })}
                </>
              )}
              {savedPlansLoading ? (
                <Text style={[styles.d0CopyHint, { marginTop: 8 }]}>Loading saved plans…</Text>
              ) : null}

              {/* Share row */}
              <AiStagger delay={280}>
                <View style={styles.d0ShareRow}>
                  <TouchableOpacity style={styles.d0ShareBtn} activeOpacity={0.75} onPress={handleSharePlanWithFriends}>
                    <Ionicons name="share-social-outline" size={18} color="#64748B" />
                    <Text style={styles.d0ShareBtnText}>Share with friends</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.d0ShareBtn} activeOpacity={0.75} onPress={handleCopyShareText}>
                    <Ionicons name="copy-outline" size={18} color="#64748B" />
                    <Text style={styles.d0ShareBtnText}>Copy link</Text>
                  </TouchableOpacity>
                </View>
                {shareCopyHint ? <Text style={styles.d0CopyHint}>Copied to clipboard</Text> : null}
              </AiStagger>
            </ScrollView>
            </View>
          </View>
        )}

        {/* Step 3 — Day plan results (steps 1–2 now in modal) */}
        {drawerStep === 3 && (
          <View style={styles.planStep3Body}>
            {loading || error || !dayPlan?.length ? (
              <View style={styles.drawerPageHeader}>
                <TouchableOpacity
                  style={styles.backButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    setDrawerStep(0)
                    setDayPlan(null)
                    setError(null)
                    setActiveSavedPlanId(null)
                    setSharedCollaboration(null)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Back to plans"
                >
                  <Ionicons name="chevron-back" size={20} color="#374151" />
                </TouchableOpacity>
                <View style={styles.drawerPageHeaderCenter} pointerEvents="none">
                  {loading ? (
                    <Text style={styles.drawerPageHeaderTitle} numberOfLines={1}>
                      Building your day
                    </Text>
                  ) : error ? (
                    <Text style={styles.drawerPageHeaderTitle} numberOfLines={1}>
                      Something went wrong
                    </Text>
                  ) : (
                    <Text style={styles.drawerPageHeaderTitle} numberOfLines={1}>
                      Your plan
                    </Text>
                  )}
                </View>
                <View style={styles.drawerPageHeaderSpacer} />
              </View>
            ) : null}

            {loading ? (
              <Reanimated.View
                style={[styles.planContentFill, styles.loadingWrap]}
                entering={FadeInDown.duration(400).springify().damping(17).stiffness(200).mass(0.85)}
              >
                <View style={styles.planSheetLoadingGlassOuter}>
                  <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint="light" style={styles.planMastheadBlur} />
                  <View style={styles.planMastheadFrost} pointerEvents="none" />
                  <View style={styles.planSheetLoadingGlassInner}>
                    <PlanDrawerLoadingPanel
                      loading={loading}
                      loadingStatus={loadingStatus}
                      spotPreviews={spotPreviews}
                      themePrimary={themeColors.primary}
                    />
                  </View>
                </View>
              </Reanimated.View>
            ) : error ? (
              <Reanimated.View
                style={[styles.planContentFill, styles.errorWrap]}
                entering={ZoomInEasyDown.duration(360).springify().damping(16).stiffness(220)}
              >
                <View style={styles.errorCard}>
                  <View style={styles.errorIconWrap}>
                    <Ionicons name="alert-circle" size={28} color="#DC2626" />
                  </View>
                  <Text style={styles.errorTitle}>Something went wrong</Text>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
                <TouchableOpacity style={styles.retryButton} activeOpacity={0.85} onPress={handleGenerate}>
                  <Ionicons name="refresh" size={20} color={themeColors.primary} />
                  <Text style={styles.retryButtonText}>Try again</Text>
                </TouchableOpacity>
              </Reanimated.View>
            ) : !dayPlan || dayPlan.length === 0 ? (
              <Reanimated.View
                style={[styles.planContentFill, { paddingHorizontal: 20, justifyContent: 'center' }]}
                entering={FadeIn.duration(320)}
              >
                <Text style={styles.emptyResults}>No plan generated.</Text>
              </Reanimated.View>
            ) : (
              <View style={styles.planContentFill}>
              <DraggableFlatList
                style={styles.resultsScroll}
                data={dayPlan}
                keyExtractor={(item) => item._planRowKey || `fallback-${item.spot}`}
                onDragEnd={({ data }) => {
                  if (planReadOnly) return
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  setDayPlan(data)
                }}
                activationDistance={planReadOnly ? 1000 : 12}
                containerStyle={styles.planDraggableListContainer}
                contentContainerStyle={styles.resultsContent}
                contentInsetAdjustmentBehavior="never"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={renderPlanTimelineOverviewHeader}
                renderItem={({ item, drag, isActive, getIndex }) => {
                  const planIndex = getIndex() ?? 0
                  const isEat = item.type === 'restaurant'
                  const isEvent = item.type === 'event'
                  const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : colors.morning
                  const galleryUris = pickPlanStopGalleryUris(item, allPlaceMarkers)
                  const thumbUri = galleryUris[0] || null
                  const hasImages = !!thumbUri
                  const hasProfile = !!(item.clientId)
                  const isExpanded = stopDetailIndex === planIndex
                  const isVisible = planIndex < visibleStopCount
                  const category = getLuxuryCategoryStyle(item)
                  const canOpenMaps = item.lat != null && item.lng != null

                  return (
                    <ScaleDecorator>
                      <AnimatedStopRow isVisible={isVisible} style={styles.planRowEnterWrap}>
                        <View style={styles.planLuxuryStopBlock}>
                          <View style={[styles.planLuxuryRowLayout, isActive && styles.planLuxuryRowLayoutActive]}>
                            <View style={[styles.planLuxuryStopSurface, isActive && styles.planLuxuryStopSurfaceActive]}>
                              <TouchableOpacity
                                onLongPress={planReadOnly ? undefined : drag}
                                delayLongPress={planReadOnly ? 60000 : 180}
                                style={[styles.planLuxuryDragAffordance, planReadOnly && { opacity: 0.35 }]}
                                activeOpacity={0.75}
                                disabled={planReadOnly}
                                accessibilityRole="button"
                                accessibilityLabel="Drag to reorder stop"
                              >
                                <Ionicons name="reorder-three" size={22} color="#AEAEB2" />
                              </TouchableOpacity>
                              <Pressable
                                style={styles.planLuxuryStopMainPress}
                                onPress={() => {
                                  if (stopDetailIndex === planIndex) {
                                    setStopDetailIndex(null)
                                    return
                                  }
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                                  clearMarkerShowcase()
                                  goToStopDetailIndex(planIndex)
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ expanded: isExpanded }}
                                accessibilityLabel={item.spot}
                              >
                                <View style={styles.planLuxuryStopThumb}>
                                  {hasImages ? (
                                    <PreviewImage uri={thumbUri} style={styles.planLuxuryStopThumbImg} noFade />
                                  ) : (
                                    <View style={[styles.planLuxuryStopThumbImg, styles.planLuxuryStopThumbPlaceholder, { backgroundColor: `${accent}22` }]}>
                                      <Ionicons name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'} size={22} color={accent} />
                                    </View>
                                  )}
                                </View>
                                <View style={styles.planLuxuryStopTextCol}>
                                  <Text style={styles.planLuxuryStopTitle} numberOfLines={2}>
                                    {item.spot}
                                  </Text>
                                  <View style={styles.planLuxuryCategoryRow}>
                                    <View style={[styles.planLuxuryCategoryPill, { backgroundColor: category.bg }]}>
                                      <Ionicons name={category.icon} size={12} color={category.fg} />
                                      <Text style={[styles.planLuxuryCategoryPillText, { color: category.fg }]}>{category.label}</Text>
                                    </View>
                                    {item.userAdded ? (
                                      <View style={styles.planLuxuryUserPickPill} accessibilityRole="text" accessibilityLabel="You added this stop">
                                        <Ionicons name="person" size={11} color="#059669" />
                                        <Text style={styles.planLuxuryUserPickPillText}>Your pick</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  {item.rating != null && (
                                    <View style={styles.planLuxuryRatingRow}>
                                      <Ionicons name="star" size={12} color="#FF9F00" />
                                      <Text style={styles.planLuxuryRatingText}>{Number(item.rating).toFixed(1)}</Text>
                                    </View>
                                  )}
                                </View>
                              </Pressable>
                              <TouchableOpacity
                                style={styles.planLuxuryConnectorNavBtn}
                                activeOpacity={0.85}
                                onPress={() => {
                                  if (canOpenMaps) openGoogleMapsDirections(item.lat, item.lng)
                                }}
                                disabled={!canOpenMaps}
                                accessibilityRole="button"
                                accessibilityLabel="Open directions for this stop"
                              >
                                <Ionicons name="navigate" size={17} color="#FFFFFF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.planLuxuryEnhanceBtn}
                                activeOpacity={0.85}
                                onPress={() => handleEnhanceStop(planIndex)}
                                disabled={enhancingIndex !== null || planReadOnly}
                                accessibilityRole="button"
                                accessibilityLabel="Enhance with AI, replace this stop"
                              >
                                {enhancingIndex === planIndex ? (
                                  <ActivityIndicator size="small" color={themeColors.primary} />
                                ) : (
                                  <>
                                    <Ionicons name="sparkles" size={15} color={themeColors.primary} />
                                    <Text style={styles.planLuxuryEnhanceBtnText}>AI</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </AnimatedStopRow>
                    </ScaleDecorator>
                  )
                }}
              />
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {/* Stop detail — centered dialog over map / sheet */}
      <Modal
        visible={!!stopDetailPayload}
        transparent
        animationType="fade"
        onRequestClose={closeStopDetailDialog}
      >
        {stopDetailPayload ? (
          <KeyboardAvoidingView
            style={styles.stopDialogKb}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.stopDialogRoot}>
              <TouchableOpacity
                style={styles.stopDialogDim}
                activeOpacity={1}
                onPress={closeStopDetailDialog}
                accessibilityLabel="Dismiss"
                accessibilityRole="button"
              />
              <View style={styles.stopDialogTinderWrap} accessibilityViewIsModal pointerEvents="box-none">
                <View style={styles.stopDialogTinderRow}>
                  <TouchableOpacity
                    style={[
                      styles.stopDialogArrowFab,
                      styles.stopDialogArrowFabLeft,
                      (stopDetailIndex || 0) <= 0 && styles.stopDialogArrowFabDisabled,
                    ]}
                    activeOpacity={0.88}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                      goToStopDetailIndex((stopDetailIndex || 0) - 1)
                    }}
                    disabled={(stopDetailIndex || 0) <= 0}
                    accessibilityRole="button"
                    accessibilityLabel="View previous itinerary stop"
                  >
                    <Ionicons name="chevron-back" size={20} color="#0F172A" />
                  </TouchableOpacity>
                  <View style={[styles.stopDialogCardShell, { width: STOP_DIALOG_SLIDE_WIDTH }]}>
                    {stopDetailStackPeekNext ? (
                      <Reanimated.View
                        style={[styles.stopDialogStackBack, stopDetailPeekAnimatedStyle]}
                        pointerEvents="none"
                      >
                        <LinearGradient
                          colors={[`${stopDetailStackPeekNext.accent}66`, '#0f172a']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.stopDialogStackBackInner}>
                          <Ionicons
                            name={stopDetailStackPeekNext.isEat ? 'restaurant' : stopDetailStackPeekNext.isEvent ? 'calendar' : 'location'}
                            size={15}
                            color="#FFFFFF"
                          />
                          <Text style={styles.stopDialogStackBackTitle} numberOfLines={2}>
                            {stopDetailStackPeekNext.item.spot}
                          </Text>
                        </View>
                      </Reanimated.View>
                    ) : null}
                    <GestureDetector gesture={stopDetailPanGesture}>
                      <Reanimated.View
                        style={[
                          styles.stopDialogCard,
                          { width: STOP_DIALOG_SLIDE_WIDTH, maxWidth: '100%' },
                          stopDetailCardAnimatedStyle,
                        ]}
                      >
                        <View style={styles.stopDialogExploreHero}>
                          <View style={[styles.stopDialogExploreImageFrame, { height: STOP_DIALOG_IMAGE_H }]}>
                            <StopDetailGallery
                              images={Array.isArray(stopDetailPayload.images) ? stopDetailPayload.images : []}
                              singleUri={
                                stopDetailPayload.hasImages
                                  ? (stopDetailPayload.images[0] || stopDetailPayload.item.image)
                                  : (stopDetailPayload.item.image || null)
                              }
                              accent={stopDetailPayload.accent}
                              isEat={stopDetailPayload.isEat}
                              isEvent={stopDetailPayload.isEvent}
                              slideWidth={STOP_DIALOG_IMAGE_W}
                              imageHeight={STOP_DIALOG_IMAGE_H}
                              bottomRadius={0}
                              hideBottomDotsRow
                            />
                            <LinearGradient
                              colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
                              locations={[0, 0.3, 0.6, 1]}
                              style={styles.stopDialogExploreGrad}
                              pointerEvents="none"
                            />
                            <TouchableOpacity
                              style={styles.stopDialogExploreClose}
                              onPress={closeStopDetailDialog}
                              accessibilityRole="button"
                              accessibilityLabel="Close"
                              activeOpacity={0.88}
                            >
                              <Ionicons name="close" size={20} color="#FFFFFF" />
                            </TouchableOpacity>
                            {stopDetailPayload.category ? (
                              <View style={styles.stopDialogExploreBadgeWrap}>
                                <BlurView intensity={Platform.OS === 'ios' ? 60 : 0} tint="dark" style={styles.stopDialogExploreBadge}>
                                  <View style={styles.stopDialogExploreBadgeDot} />
                                  <Text style={styles.stopDialogExploreBadgeText} numberOfLines={1}>
                                    {stopDetailPayload.category.label}
                                  </Text>
                                </BlurView>
                              </View>
                            ) : null}
                            <View style={styles.stopDialogExploreNumberWrap} pointerEvents="none">
                              <Text style={styles.stopDialogExploreNumber}>
                                {String((stopDetailIndex ?? 0) + 1).padStart(2, '0')}
                              </Text>
                            </View>
                            <View style={styles.stopDialogExploreBottom}>
                              <Text style={styles.stopDialogExploreTitle} numberOfLines={2}>
                                {stopDetailPayload.item.spot}
                              </Text>
                              {stopDetailPayload.item.rating != null ? (
                                <View style={styles.stopDialogExploreInfoRow}>
                                  <View style={styles.stopDialogExploreInfoPill}>
                                    <Ionicons name="star" size={12} color="#FF9F00" />
                                    <Text style={styles.stopDialogExploreInfoText} numberOfLines={1}>
                                      {Number(stopDetailPayload.item.rating).toFixed(1)}
                                    </Text>
                                  </View>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                        <View style={styles.stopDialogBodyStatic}>
                          <View style={styles.stopDialogScrollContent}>
                          <View style={styles.stopDialogLuxurySectionCard}>
                            <View style={styles.stopDialogLuxurySectionTitleRow}>
                              <View style={styles.stopDialogLuxurySectionAccentBar} accessibilityElementsHidden />
                              <Text style={styles.stopDialogLuxurySectionTitle}>
                                {stopDetailPayload.isEvent ? 'About this event' : 'About this place'}
                              </Text>
                            </View>
                            <Text style={styles.stopDialogLuxuryBody}>
                              {getStopAboutPrimaryText(stopDetailPayload.item, stopDetailPayload.isEvent)}
                            </Text>
                          </View>

                          {stopDetailPayload.isEvent ? (
                            <View style={[styles.stopDialogLuxurySectionCard, styles.stopDialogLuxurySectionCardEvent]}>
                              <View style={styles.stopDialogLuxurySectionTitleRow}>
                                <View style={styles.stopDialogLuxurySectionAccentBar} accessibilityElementsHidden />
                                <Text style={styles.stopDialogLuxurySectionTitle}>Event details</Text>
                              </View>
                              <Text style={styles.stopDialogLuxuryBody}>
                                {formatStopEventDetailsText(stopDetailPayload.item)}
                              </Text>
                            </View>
                          ) : (
                            <View style={[styles.stopDialogLuxurySectionCard, styles.stopDialogLuxurySectionCardNotes]}>
                              <View style={styles.stopDialogLuxuryNotesHeading}>
                                <View style={styles.stopDialogLuxuryNotesTag}>
                                  <Text style={styles.stopDialogLuxuryNotesTagText}>Notes</Text>
                                </View>
                                <Text style={styles.stopDialogLuxuryNotesAccent}>from the Community</Text>
                              </View>
                              <Text style={styles.stopDialogLuxuryBody}>
                                {(() => {
                                  const r = String(stopDetailPayload.item.reason || '').trim()
                                  if (!r) return 'Community tips will appear here when available.'
                                  const parts = r.split(/(?<=[.!?])\s+/).filter(Boolean)
                                  const rest = parts.slice(1).join(' ').trim()
                                  if (rest) return rest
                                  return 'Share your take after you visit — short notes help the next traveler plan with confidence.'
                                })()}
                              </Text>
                            </View>
                          )}

                          <View style={styles.stopDialogUnifiedActionsStrip}>
                            <TouchableOpacity
                              style={styles.stopDialogUnifiedActionBtn}
                              activeOpacity={0.88}
                              onPress={() => {
                                if (stopDetailPayload.item.lat != null && stopDetailPayload.item.lng != null) {
                                  openGoogleMapsDirections(stopDetailPayload.item.lat, stopDetailPayload.item.lng)
                                  closeStopDetailDialog()
                                }
                              }}
                              disabled={stopDetailPayload.item.lat == null || stopDetailPayload.item.lng == null}
                              accessibilityRole="button"
                              accessibilityLabel="Get directions"
                            >
                              <Ionicons name="navigate-outline" size={16} color={themeColors.primary} />
                              <Text style={styles.stopDialogUnifiedActionBtnText} numberOfLines={2}>
                                Directions
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.stopDialogUnifiedActionBtn}
                              activeOpacity={0.88}
                              onPress={() => {
                                if (stopDetailPayload.item.lat != null && stopDetailPayload.item.lng != null) {
                                  navigation.navigate('AR', {
                                    navigateTo: {
                                      lat: stopDetailPayload.item.lat,
                                      lng: stopDetailPayload.item.lng,
                                      name: stopDetailPayload.item.spot,
                                    },
                                  })
                                  closeStopDetailDialog()
                                }
                              }}
                              disabled={stopDetailPayload.item.lat == null || stopDetailPayload.item.lng == null}
                              accessibilityRole="button"
                              accessibilityLabel="Open in AR"
                            >
                              <Ionicons name="cube-outline" size={16} color={themeColors.primary} />
                              <Text style={styles.stopDialogUnifiedActionBtnText} numberOfLines={2}>
                                AR
                              </Text>
                            </TouchableOpacity>
                            {stopDetailPayload.hasProfile ? (
                              <TouchableOpacity
                                style={styles.stopDialogUnifiedActionBtn}
                                activeOpacity={0.88}
                                onPress={() => {
                                  setProfileClientId(stopDetailPayload.item.clientId)
                                  closeStopDetailDialog()
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Open host profile"
                              >
                                <Ionicons name="person-circle-outline" size={16} color={themeColors.primary} />
                                <Text style={styles.stopDialogUnifiedActionBtnText} numberOfLines={2}>
                                  Profile
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.stopDialogUnifiedActionPlaceholder} pointerEvents="none" />
                            )}
                          </View>
                          </View>
                        </View>
                      </Reanimated.View>
                    </GestureDetector>
                    <View style={styles.stopDialogTinderDots} pointerEvents="none">
                      {stopDetailSlides.map((_, dotIdx) => (
                        <View
                          key={`stop-dot-${dotIdx}`}
                          style={[
                            styles.stopDialogTinderDot,
                            dotIdx === stopDetailIndex && styles.stopDialogTinderDotActive,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.stopDialogArrowFab,
                      styles.stopDialogArrowFabRight,
                      (stopDetailIndex || 0) >= stopDetailSlides.length - 1 && styles.stopDialogArrowFabDisabled,
                    ]}
                    activeOpacity={0.88}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                      goToStopDetailIndex((stopDetailIndex || 0) + 1)
                    }}
                    disabled={(stopDetailIndex || 0) >= stopDetailSlides.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel="View next itinerary stop"
                  >
                    <Ionicons name="chevron-forward" size={20} color="#0F172A" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>

      {/* Plan modal — Home AI design (blur overlay, question block, glass options) */}
      <Modal visible={showPlanModal} transparent animationType="none">
        <KeyboardAvoidingView
          style={styles.planModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.planModalBackdropWrap, { opacity: planModalBackdrop }]}>
            <LinearGradient
              colors={['#B80E21', '#CE1126', '#9E0B1C', '#CE1126', '#B80E21']}
              locations={[0, 0.25, 0.5, 0.75, 1]}
              style={StyleSheet.absoluteFill}
            />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => closePlanModal()}
              disabled={loading || planGenerationSuccess}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.planModalContentWrap,
              {
                opacity: planModalOpacity,
                transform: [{ scale: planModalScale }],
              },
            ]}
          >
            <View style={styles.planModalGlassShell}>
              <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint="light" style={styles.planMastheadBlur} />
              <View style={styles.planMastheadFrost} pointerEvents="none" />
              <View style={styles.planModalGlassBody}>
            {loading || planGenerationSuccess ? (
              <View style={styles.planModalPresenceLayer}>
                <PlanModalLoadingView
                  loadingStatus={loadingStatus}
                  showSuccess={planGenerationSuccess}
                  spotPreviews={spotPreviews}
                />
              </View>
            ) : (
              <View style={styles.planModalPresenceLayer}>
                <PlanStepBubble step={planModalStep}>
                      {/* Hero question area — step 1 travel, 2 activities, 3 food */}
                      <View style={styles.pmHero}>
                        <PopIn delay={60} trigger={planModalStep}>
                          <View style={styles.pmStepBadge}>
                            <Text style={styles.pmStepBadgeText}>
                              {`STEP ${planModalStep} OF 3`}
                            </Text>
                            <View style={styles.pmStepDots}>
                              <View style={[styles.pmStepDotSmall, planModalStep >= 1 && styles.pmStepDotSmallActive]} />
                              <View style={[styles.pmStepDotSmall, planModalStep >= 2 && styles.pmStepDotSmallActive]} />
                              <View style={[styles.pmStepDotSmall, planModalStep >= 3 && styles.pmStepDotSmallActive]} />
                            </View>
                          </View>
                        </PopIn>

                        <PopIn delay={140} trigger={planModalStep}>
                          <Text style={styles.pmTitle}>
                            {planModalStep === 1
                              ? 'How far are you willing to travel to explore?'
                              : planModalStep === 2
                                ? 'What excites you?'
                                : 'What are you craving?'}
                          </Text>
                        </PopIn>
                        <PopIn delay={200} trigger={planModalStep}>
                          {(!((planModalStep === 1 && travelExploreId) ||
                              (planModalStep === 2 && selectedPreferences.length > 0) ||
                              (planModalStep === 3 && selectedFoodCategories.length > 0))) ? (
                            <Text style={[styles.pmSub, planModalStep === 1 && { maxWidth: 320 }]}>
                              {planModalStep === 1
                                ? 'This helps us decide how many places and how wide an area to include in your plan.'
                                : planModalStep === 2
                                  ? 'Pick the vibes that match your Bahrain trip'
                                  : 'Choose your food mood for the day'}
                            </Text>
                          ) : (
                            <View style={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
                              <View style={styles.pmSelectedPill}>
                                <Ionicons name="checkmark-circle" size={14} color="#E9C877" />
                                <Text style={styles.pmSelectedText}>
                                  {planModalStep === 1
                                    ? (TRAVEL_EXPLORE_OPTIONS.find((o) => o.id === travelExploreId)?.label || 'Travel')
                                    : planModalStep === 2
                                      ? `${selectedPreferences.length} picked`
                                      : `${selectedFoodCategories.length} picked`}
                                </Text>
                              </View>
                            </View>
                          )}
                        </PopIn>
                      </View>

                      <View style={styles.pmChipsWrap}>
                        <ScrollView
                          style={styles.pmChipsScroll}
                          contentContainerStyle={styles.pmChipsScrollContent}
                          showsVerticalScrollIndicator={false}
                          scrollEnabled={true}
                        >
                          {planModalStep === 1 ? (
                            <View style={styles.pmChipsPanel}>
                              <View style={styles.pmTravelList}>
                                {TRAVEL_EXPLORE_OPTIONS.map((opt, idx) => {
                                  const selected = travelExploreId === opt.id
                                  return (
                                    <PopIn key={opt.id} delay={280 + idx * 40} trigger={planModalStep}>
                                      <TouchableOpacity
                                        style={[styles.pmTravelCard, selected && styles.pmTravelCardSelected]}
                                        activeOpacity={0.88}
                                        onPress={() => {
                                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                                          setTravelExploreId(opt.id)
                                        }}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected }}
                                        accessibilityLabel={`${opt.label}. ${opt.description}`}
                                      >
                                        <View style={[
                                          styles.pmTravelIconBox,
                                          selected && { backgroundColor: 'rgba(233,200,119,0.1)' }
                                        ]}>
                                          <Ionicons 
                                            name={opt.icon || 'map-outline'} 
                                            size={22} 
                                            color={selected ? '#1A120A' : '#64748B'} 
                                          />
                                        </View>
                                        <View style={styles.pmTravelInfo}>
                                          <Text style={[
                                            styles.pmTravelTitle,
                                            selected && { color: '#1A120A' }
                                          ]}>
                                            {opt.label}
                                          </Text>
                                          <Text style={styles.pmTravelDesc}>{opt.description}</Text>
                                        </View>
                                        {selected && (
                                          <View style={styles.pmChipCheck}>
                                            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                                          </View>
                                        )}
                                      </TouchableOpacity>
                                    </PopIn>
                                  )
                                })}
                              </View>
                            </View>
                          ) : (
                            <View style={styles.pmChipsPanel}>
                              <View style={styles.pmChipsGrid}>
                                {(() => {
                                  const items = planModalStep === 2 ? PREFERENCES : FOOD_CATEGORIES
                                  const isSelectedFn = (item) =>
                                    planModalStep === 2
                                      ? selectedPreferences.includes(item.id)
                                      : selectedFoodCategories.includes(item.id)
                                  const handlePressItem = (item) => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                                    return planModalStep === 2 ? togglePreference(item.id) : toggleFoodCategory(item.id)
                                  }
                                  return items.map((item, idx) => (
                                    <PopIn key={`${planModalStep}-${item.id}`} delay={280 + idx * 30} trigger={planModalStep}>
                                      <AnimatedOptionChip
                                        item={item}
                                        isSelected={isSelectedFn(item)}
                                        onPress={() => handlePressItem(item)}
                                      />
                                    </PopIn>
                                  ))
                                })()}
                              </View>
                            </View>
                          )}
                        </ScrollView>

                        <PopIn delay={500} trigger={planModalStep}>
                        <View style={styles.planModalActionRow}>
                          {planModalStep === 1 ? (
                            <>
                              <TouchableOpacity
                                style={styles.planModalBackBtn}
                                activeOpacity={0.7}
                                onPress={() => closePlanModal()}
                                accessibilityLabel="Close"
                                accessibilityRole="button"
                              >
                                <Ionicons name="close" size={20} color="#FFFFFF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.planModalContinueBtn}
                                activeOpacity={0.85}
                                onPress={() => setPlanModalStep(2)}
                                accessibilityLabel="Continue to activity preferences"
                                accessibilityRole="button"
                              >
                                <LinearGradient
                                  colors={['#F7DFA0', '#E9C877']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={styles.planModalBtnGradient}
                                >
                                  <Text style={styles.planModalContinueBtnText}>Continue</Text>
                                  <Ionicons name="arrow-forward" size={20} color="#1A120A" />
                                </LinearGradient>
                              </TouchableOpacity>
                            </>
                          ) : planModalStep === 2 ? (
                            <>
                              <TouchableOpacity
                                style={styles.planModalBackBtn}
                                activeOpacity={0.7}
                                onPress={() => setPlanModalStep(1)}
                                accessibilityLabel="Go back"
                                accessibilityRole="button"
                              >
                                <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.planModalContinueBtn}
                                activeOpacity={0.85}
                                onPress={() => {
                                  const prefLabels = selectedPreferences
                                    .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
                                    .filter(Boolean)
                                  startBackgroundPrefetch(prefLabels)
                                  setPlanModalStep(3)
                                }}
                                accessibilityLabel="Continue to food preferences"
                                accessibilityRole="button"
                              >
                                <LinearGradient
                                  colors={['#F7DFA0', '#E9C877']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={styles.planModalBtnGradient}
                                >
                                  <Text style={styles.planModalContinueBtnText}>Continue</Text>
                                  <Ionicons name="arrow-forward" size={20} color="#1A120A" />
                                </LinearGradient>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.planModalBackBtn}
                                activeOpacity={0.7}
                                onPress={() => setPlanModalStep(2)}
                                accessibilityLabel="Go back"
                                accessibilityRole="button"
                              >
                                <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.planModalGenerateBtn}
                                activeOpacity={0.85}
                                onPress={() => {
                                  handleGenerate(() => closePlanModal())
                                }}
                                accessibilityLabel="Generate your plan"
                                accessibilityRole="button"
                              >
                                <LinearGradient
                                  colors={['#F7DFA0', '#E9C877']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={styles.planModalBtnGradient}
                                >
                                  <Ionicons name="sparkles" size={20} color="#1A120A" />
                                  <Text style={styles.planModalGenerateBtnText}>Generate My Plan</Text>
                                </LinearGradient>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                        </PopIn>
                      </View>
                    </PlanStepBubble>
              </View>
            )}
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Clients search modal — all clients by Restaurants, Places, Events */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (addingPlanStop) return
          setShowSearchModal(false)
        }}
      >
        <View style={[styles.searchModalRoot, { paddingTop: insets.top + 4 }]}>
          {searchModalLoading ? (
            <View style={styles.searchModalLoading}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={styles.searchModalLoadingText}>Loading clients…</Text>
            </View>
          ) : (
            <>
              <View style={styles.searchModalHeadingWrap}>
                <Text style={styles.searchModalHeading}>
                  {addToPlanMode ? 'Add to your day' : 'Browse clients'}
                </Text>
                {addToPlanMode ? (
                  <Text style={styles.searchModalSubheading}>
                    Tap a restaurant, place, or event — it is added to the end of your list. Long-press a card to reorder anytime.
                  </Text>
                ) : null}
              </View>
              <View style={styles.searchModalHeaderRow}>
                <View style={styles.searchModalSearchWrap}>
                  <Ionicons name="search" size={20} color={themeColors.primary} style={styles.searchModalSearchIcon} />
                  <TextInput
                    style={styles.searchModalSearchInput}
                    placeholder="Search restaurants, places, events…"
                    placeholderTextColor="#94A3B8"
                    value={searchModalQuery}
                    onChangeText={setSearchModalQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {searchModalQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchModalQuery('')}
                      style={styles.searchModalSearchClear}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.searchModalCloseBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (addingPlanStop) return
                    setShowSearchModal(false)
                  }}
                  accessibilityState={{ disabled: addingPlanStop }}
                >
                  <Ionicons name="close" size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.searchModalScroll}
                contentContainerStyle={styles.searchModalContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {['restaurants', 'places', 'events'].map((key) => {
                  const sectionLabel = key === 'restaurants' ? 'Restaurants' : key === 'places' ? 'Places' : 'Events';
                  const rawItems = searchModalClients[key] || [];
                  const q = (searchModalQuery || '').trim().toLowerCase();
                  const items = q
                    ? rawItems.filter(
                        (c) =>
                          (c.name || c.business_name || '').toLowerCase().includes(q) ||
                          (c.business_name_ar || '').toLowerCase().includes(q)
                      )
                    : rawItems;
                const accent = key === 'restaurants' ? colors.dining : key === 'events' ? colors.event : colors.textSecondary;
                if (q && items.length === 0) return null;
                return (
                  <View key={key} style={styles.searchModalSection}>
                    <View style={styles.searchModalSectionHeader}>
                      <View style={[styles.searchModalSectionIcon, { backgroundColor: `${accent}18` }]}>
                        <Ionicons
                          name={key === 'restaurants' ? 'restaurant' : key === 'events' ? 'calendar' : 'location'}
                          size={20}
                          color={accent}
                        />
                      </View>
                      <Text style={[styles.searchModalSectionTitle, { color: accent }]}>{sectionLabel}</Text>
                    </View>
                    {items.length === 0 ? (
                      <Text style={styles.searchModalEmpty}>
                        {q ? `No ${sectionLabel.toLowerCase()} match "${searchModalQuery.trim()}"` : `No ${sectionLabel.toLowerCase()} yet`}
                      </Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.searchModalHorizontalContent}
                      >
                        {items.map((client) => {
                          const imageUrl = resolvePublicImageUrl(client.client_image);
                          return (
                            <TouchableOpacity
                              key={client.client_a_uuid || client.clientId}
                              style={styles.searchModalClientCard}
                              activeOpacity={0.7}
                              disabled={addingPlanStop}
                              onPress={() => {
                                if (addToPlanMode) {
                                  handleAddClientToPlan(client)
                                  return
                                }
                                setShowSearchModal(false);
                                setProfileClientId(client.client_a_uuid || client.clientId);
                              }}
                            >
                              <View style={[styles.searchModalClientCircle, { borderColor: accent }]}>
                                {imageUrl ? (
                                  <CachedImage source={{ uri: imageUrl }} style={styles.searchModalClientImage} recyclingKey={imageUrl} resizeMode="cover" />
                                ) : (
                                  <Ionicons
                                    name={key === 'restaurants' ? 'restaurant' : key === 'events' ? 'calendar' : 'location'}
                                    size={32}
                                    color={accent}
                                  />
                                )}
                              </View>
                              <Text style={styles.searchModalClientName} numberOfLines={2}>
                                {client.name || client.business_name || 'Spot'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
              </ScrollView>
            </>
          )}
          {addingPlanStop && !searchModalLoading ? (
            <View style={styles.searchModalAddingOverlay} pointerEvents="box-none">
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={styles.searchModalAddingOverlayText}>Adding to your plan…</Text>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={showSharePlanModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSharePlanModal(false)}
      >
        <View style={styles.sharePlanModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSharePlanModal(false)}
            accessibilityLabel="Dismiss share dialog"
            accessibilityRole="button"
          />
          <View style={styles.sharePlanModalCard} pointerEvents="box-none">
            <Text style={styles.sharePlanModalTitle}>Share plan</Text>
            <Text style={styles.sharePlanModalSub}>
              Friends open this in SiyahaBH using your link or code. Choose view-only, or let them edit the same plan.
            </Text>
            {shareModalCode ? (
              <View style={styles.sharePlanModalCodeBox}>
                <Text style={styles.sharePlanModalCode}>{shareModalCode}</Text>
              </View>
            ) : (
              <Text style={[styles.sharePlanModalSub, { marginBottom: 12 }]}>Enable sharing to create a code.</Text>
            )}
            <View style={styles.sharePlanModalPermRow}>
              <TouchableOpacity
                style={[
                  styles.sharePlanModalPermChip,
                  sharePermissionDraft === 'view' && styles.sharePlanModalPermChipActive,
                ]}
                onPress={() => setSharePermissionDraft('view')}
                accessibilityRole="button"
                accessibilityLabel="View only"
              >
                <Text style={styles.sharePlanModalPermChipText}>View only</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sharePlanModalPermChip,
                  sharePermissionDraft === 'edit' && styles.sharePlanModalPermChipActive,
                ]}
                onPress={() => setSharePermissionDraft('edit')}
                accessibilityRole="button"
                accessibilityLabel="Can edit"
              >
                <Text style={styles.sharePlanModalPermChipText}>Can edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sharePlanModalActions}>
              <TouchableOpacity
                style={[styles.sharePlanModalBtn, styles.sharePlanModalBtnSecondary]}
                onPress={handleCopyShareLinkOnly}
                disabled={!shareModalCode || shareModalBusy}
              >
                <Text style={[styles.sharePlanModalBtnText, styles.sharePlanModalBtnTextDark]}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sharePlanModalBtn}
                onPress={handleConfirmShareSettings}
                disabled={shareModalBusy}
              >
                <Text style={styles.sharePlanModalBtnText}>
                  {shareModalBusy ? '…' : shareModalCode ? 'Apply' : 'Enable'}
                </Text>
              </TouchableOpacity>
            </View>
            {shareModalCode ? (
              <TouchableOpacity
                onPress={handleDisableSharing}
                style={{ marginTop: 14, alignItems: 'center' }}
                accessibilityRole="button"
                accessibilityLabel="Turn off sharing"
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>Turn off sharing</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => setShowSharePlanModal(false)}
              style={{ marginTop: 16, alignItems: 'center' }}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748B' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditSavedPlanTitleModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseEditSavedPlanTitleModal}
      >
        <View style={styles.sharePlanModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleCloseEditSavedPlanTitleModal}
            accessibilityLabel="Dismiss rename dialog"
            accessibilityRole="button"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ zIndex: 2, maxWidth: 400, width: '100%', alignSelf: 'center' }}
          >
            <View style={styles.sharePlanModalCard} pointerEvents="box-none">
              <Text style={styles.sharePlanModalTitle}>Plan name</Text>
              <Text style={styles.sharePlanModalSub}>Choose a short name so you can find this plan later.</Text>
              <TextInput
                style={styles.editSavedPlanTitleModalInput}
                value={editSavedPlanTitleDraft}
                onChangeText={setEditSavedPlanTitleDraft}
                placeholder="My plan"
                placeholderTextColor="#94A3B8"
                maxLength={120}
                editable={!editSavedPlanTitleBusy}
                autoFocus
                accessibilityLabel="Plan title"
                returnKeyType="done"
                onSubmitEditing={handleSubmitEditSavedPlanTitle}
              />
              <View style={styles.sharePlanModalActions}>
                <TouchableOpacity
                  style={[styles.sharePlanModalBtn, styles.sharePlanModalBtnSecondary]}
                  onPress={handleCloseEditSavedPlanTitleModal}
                  disabled={editSavedPlanTitleBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text style={[styles.sharePlanModalBtnText, styles.sharePlanModalBtnTextDark]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sharePlanModalBtn}
                  onPress={handleSubmitEditSavedPlanTitle}
                  disabled={editSavedPlanTitleBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Save plan name"
                >
                  <Text style={styles.sharePlanModalBtnText}>{editSavedPlanTitleBusy ? '…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        onClose={() => setProfileClientId(null)}
        insets={insets}
        onOpenARNavigate={(dest) => {
          setProfileClientId(null);
          if (dest?.lat != null && dest?.lng != null) {
            navigation.navigate('AR', { navigateTo: { lat: dest.lat, lng: dest.lng, name: dest.name || 'Destination' } });
          }
        }}
      />

      {doorVisible && (() => {
        const TOOTH_COUNT = 5
        const toothH = SCREEN_HEIGHT / TOOTH_COUNT
        const toothW = SCREEN_WIDTH * 0.12
        return (
          <Animated.View style={[styles.doorOverlay, { opacity: doorFade }]} pointerEvents="box-none">
            <Animated.View style={[styles.doorHalf, styles.doorLeft, { transform: [{ translateX: doorLeft }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
            </Animated.View>
            <Animated.View style={[styles.doorHalf, styles.doorRight, { transform: [{ translateX: doorRight }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#CE1126' }]} />
            </Animated.View>
            <Animated.View style={[styles.doorZigzag, { transform: [{ translateX: doorLeft }] }]}>
              {Array.from({ length: TOOTH_COUNT }, (_, i) => (
                <View key={i} style={{
                  width: 0,
                  height: 0,
                  borderTopWidth: toothH / 2,
                  borderBottomWidth: toothH / 2,
                  borderLeftWidth: toothW,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderLeftColor: '#FFFFFF',
                }} />
              ))}
            </Animated.View>
            <Animated.View style={[styles.doorIconWrap, { transform: [{ scale: doorIconScale }], opacity: doorIconOpacity }]}>
              <View style={styles.doorLogoShadow}>
                <CachedImage
                  source={require('../../assets/ai-button-logo.png')}
                  style={styles.doorLogoImage}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.doorFlagLabel}>SiyahaBH</Text>
            </Animated.View>
          </Animated.View>
        )
      })()}
    </View>
  );
}
