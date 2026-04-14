import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
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
  Image,
  Linking,
  Alert,
  Share,
} from 'react-native';
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
} from 'react-native-reanimated';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useNavigationState } from '@react-navigation/native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import {
  fetchPlaces,
  fetchRestaurants,
  fetchBreakfastSpots,
  fetchEvents,
  generateDayPlan,
  getMockDayPlan,
  fetchClientsWithLocation,
  enhancePlanStopAtIndex,
} from '../services/aiPipeline';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { colors as themeColors } from '../theme/designTokens';
import styles from './AIPlanScreen.styles';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../config/supabase';
import ClientProfileModal from '../components/ClientProfileModal';
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../utils/imageUrl';

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

const openInMaps = (lat, lng, name) => {
  const label = encodeURIComponent(name || 'Destination');
  const url = Platform.select({
    ios: `maps:0,0?q=${label}@${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}(${label})`,
  });
  Linking.openURL(url).catch(() => {});
};

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
        '🇧🇭 Plan an amazing day in Bahrain with Go Bahrain!\n\n' +
        'AI-crafted itineraries — dining, culture, and events — tailored to you.\n\n' +
        'Download the app and tap "Build my day". Yalla!',
      title: 'Go Bahrain',
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
    message: `${header}\n${lines.join('\n\n')}\n\n— Shared from Go Bahrain`,
    title: 'My Bahrain itinerary',
  };
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
  const bounceAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (isSelected) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1.06, tension: 280, friction: 8, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -4, duration: 80, useNativeDriver: true }),
          Animated.spring(bounceAnim, { toValue: 0, tension: 350, friction: 5, useNativeDriver: true }),
        ]),
      ]).start()
    } else {
      Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 12, useNativeDriver: true }).start()
    }
  }, [isSelected, scaleAnim, bounceAnim])

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }, { translateY: bounceAnim }] }}>
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
        {isSelected && (
          <View style={styles.pmChipCheck}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}


/**
 * Bottom inset for plan sheet / marker sheet. AI Plan hides the tab bar, so only safe area + comfort margin.
 */
const getPlanSheetBottomPadding = (insets) => {
  const bottomInset = Math.max(insets?.bottom ?? 0, 12)
  return bottomInset + 24
}

const PLAN_MINI_NAV = [
  { key: 'Home', screen: 'Home', icon: 'home-outline', iconActive: 'home', label: 'Home' },
  { key: 'Explore', screen: 'Explore', icon: 'compass-outline', iconActive: 'compass', label: 'Explore' },
  { key: 'AI Plan', screen: 'AI Plan', isLogo: true, label: 'AI Plan' },
  { key: 'Community', screen: 'Community', icon: 'people-outline', iconActive: 'people', label: 'Community' },
  { key: 'Profile', screen: 'Profile', icon: 'person-circle-outline', iconActive: 'person-circle', label: 'Profile' },
]

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

import { PREFERENCES, FOOD_CATEGORIES } from '../constants/preferences';

const SURPRISE_THEMES = [
  { label: 'Scenic Day', icon: 'heart', color: themeColors.evening, prefs: ['Sightseeing', 'Leisure'], food: ['Italian', 'Seafood'] },
  { label: 'Adventure', icon: 'rocket', color: themeColors.error, prefs: ['Adventure', 'Nature'], food: ['Fast Food'] },
  { label: 'Chill Vibes', icon: 'leaf', color: themeColors.success, prefs: ['Leisure', 'Nature'], food: ['Cafe'] },
  { label: 'Foodie Tour', icon: 'restaurant', color: themeColors.dining, prefs: ['Sightseeing'], food: ['South Asian', 'Seafood', 'Asian'] },
  { label: 'Culture Buff', icon: 'color-palette', color: themeColors.primary, prefs: ['Cultural', 'Historical'], food: ['Cuisine'] },
  { label: 'Nightlife', icon: 'moon', color: themeColors.evening, prefs: ['Instagram', 'Leisure'], food: ['International'] },
  { label: 'Family Fun', icon: 'people', color: themeColors.afternoon, prefs: ['Sightseeing', 'Leisure'], food: ['American', 'Fast Food'] },
  { label: 'Hidden Gems', icon: 'diamond', color: themeColors.morning, prefs: ['Cultural', 'Nature'], food: ['South Asian', 'Cuisine'] },
];

const DUMMY_PAST_PLANS = [
  { id: 'plan1', title: 'Weekend in Manama', spots: 4, date: '2 days ago' },
  { id: 'plan2', title: 'Beach & Food Day', spots: 5, date: '1 week ago' },
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
        meta.image_url ||
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
    const image =
      parseStorageImageUrl(row.post_image) ||
      ensureImageUrl(String(row.post_image).trim()) ||
      (row.post_image ? String(row.post_image).trim() : null);
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
  merged.forEach((p) => p.image && Image.prefetch(p.image).catch(() => {}));
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
      const image =
        parseStorageImageUrl(row.post_image) ||
        ensureImageUrl(String(row.post_image).trim()) ||
        (row.post_image ? String(row.post_image).trim() : null);
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
    merged.forEach((p) => p.image && Image.prefetch(p.image).catch(() => {}));
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
  // Prefetch images immediately so they appear faster in the banner
  enriched.filter((p) => p.image).forEach((p) => Image.prefetch(p.image).catch(() => {}));
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
      const rawImg = meta.image_url || meta.thumbnail_url || meta.cover_image || meta.image || null;
      const image = resolvePublicImageUrl(rawImg);
      const clientId = meta.client_a_uuid || meta.id || m.id || null;
      const rating = meta.rating != null && meta.rating !== '' ? meta.rating : null;
      best = { image, clientId, rating, coords };
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
      image: match?.image || null,
      clientId: match?.clientId || null,
      rating: match?.rating != null ? match.rating : null,
      lat: cachedCoords ? cachedCoords.lat : null,
      lng: cachedCoords ? cachedCoords.lng : null,
    };
  });

  // Step 2: Fetch client images from Supabase (for matched clientIds); backfill coords from DB when still missing/invalid
  const clientIds = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
  let clientImageMap = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from('client')
      .select('client_a_uuid, client_image, lat, long, latitude, longitude')
      .in('client_a_uuid', clientIds);
    const coordByClientId = {};
    (clients || []).forEach((c) => {
      if (c.client_a_uuid && c.client_image) {
        const u = resolvePublicImageUrl(String(c.client_image).trim());
        if (u) clientImageMap[c.client_a_uuid] = u;
      }
      const u = unswapLatLng(c.lat ?? c.latitude, c.long ?? c.longitude ?? c.lng);
      if (u && c.client_a_uuid) coordByClientId[c.client_a_uuid] = u;
    });
    enriched = enriched.map((item) => {
      const u = item.clientId ? coordByClientId[item.clientId] : null;
      if (u) return { ...item, lat: u.lat, lng: u.lng };
      return item;
    });
  }

  // Step 3: Fetch clients from Supabase and force DB lat/long whenever we can match a client.
  // This avoids wrong map pins from model/Pinecone coords drift.
  const { data: allClients } = await supabase
    .from('client')
    .select('client_a_uuid, business_name, name, business_name_ar, client_image, rating, lat, long, latitude, longitude')
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
    return {
      ...item,
      image: resolvePublicImageUrl(item.image) || img,
      clientId: item.clientId || client.client_a_uuid,
      rating: item.rating != null ? item.rating : (client.rating != null ? client.rating : null),
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
]

// Smooth image with shimmer placeholder — avoids empty flash while loading
function PreviewImage({ uri, style }) {
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
    if (loaded) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [loaded, fadeAnim]);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    if (!loaded && !failed && resolvedUri) loop.start();
    return () => loop.stop();
  }, [loaded, failed, resolvedUri, shimmerAnim]);
  if (!resolvedUri) return null;
  if (failed) {
    return <View style={[style, { backgroundColor: '#E8ECF1', overflow: 'hidden' }]} />;
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
        <Image
          source={{ uri: resolvedUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          onLoadEnd={() => setLoaded(true)}
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
        <PreviewImage uri={item.image} style={{ width: '100%', height: '100%', borderRadius: r }} />
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
  const boxH = isSheet ? 176 : 300
  const layout = useMemo(() => {
    const raw = getScoutMosaicLayout(variant, boxW, boxH)
    return [...raw].sort((a, b) => a.z - b.z)
  }, [variant, boxW, boxH])

  const pool = useMemo(() => {
    const arr = [...(spotPreviews || [])].filter((p) => p?.image)
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [spotPreviews])

  const poolKey = useMemo(
    () =>
      (spotPreviews || [])
        .filter((p) => p?.image)
        .map((p) => `${p?.id || ''}:${p?.image || ''}`)
        .sort()
        .join('|'),
    [spotPreviews],
  )

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
    imgs.forEach((u) => {
      void Image.prefetch(u).catch(() => {})
    })
  }, [])

  useEffect(() => {
    applySlice(pickSlice())
  }, [poolKey, pickSlice, applySlice])

  useEffect(() => {
    const urls = (spotPreviews || []).map((p) => p?.image).filter(Boolean)
    urls.forEach((u) => {
      void Image.prefetch(u).catch(() => {})
    })
  }, [spotPreviews])

  useEffect(() => {
    if (pool.length === 0) return undefined
    const id = setInterval(() => {
      applySlice(pickSlice())
    }, 9000)
    return () => clearInterval(id)
  }, [poolKey, pool.length, pickSlice, applySlice])

  const sliceKey = slice.map((s) => s?.id).join('-')

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

const STOP_DIALOG_CARD_MAX = Math.min(560, SCREEN_WIDTH - 16)
const STOP_DIALOG_SLIDE_WIDTH = STOP_DIALOG_CARD_MAX
const STOP_DIALOG_IMAGE_H = Math.min(440, Math.round(SCREEN_HEIGHT * 0.46))

/** Full-width hero gallery: auto-advances every 5s when there are multiple images */
function StopDetailGallery({ images, singleUri, accent, isEat, isEvent, slideWidth, imageHeight }) {
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
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          overflow: 'hidden',
          backgroundColor: `${accent}24`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'}
          size={56}
          color={accent}
        />
      </View>
    )
  }

  if (list.length < 2) {
    return (
      <View style={{ width: slideWidth, height: imageHeight, overflow: 'hidden', backgroundColor: '#E2E8F0' }}>
        <PreviewImage uri={primaryUri} style={StyleSheet.absoluteFill} />
      </View>
    )
  }

  return (
    <View style={{ width: slideWidth }}>
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
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 7,
          paddingVertical: 12,
          backgroundColor: 'rgba(15,23,42,0.04)',
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
            <Ionicons name={step.icon} size={16} color={isActive ? '#FFF' : 'rgba(255,255,255,0.4)'} />
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
              { borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.12)', opacity: trackBgOpacity },
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
  const [factIdx] = useState(() => Math.floor(Math.random() * BAHRAIN_FACTS.length))
  const fact = BAHRAIN_FACTS[factIdx]

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

  return (
    <Animated.View style={[styles.ldWrap, { opacity: fadeIn }]}>
      <View style={styles.ldBodyNoScroll}>
        <View style={[styles.ldTopLoadingBlock, { zIndex: 100, elevation: 100 }]}>
          <View style={styles.ldPlanLoadTitleBlock}>
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
              <Animated.View
                style={{
                  opacity: contentOpacity,
                  zIndex: 50,
                  elevation: 50,
                  width: '100%',
                  alignItems: 'center',
                }}
              >
                <KhalidScoutPlanVisual spotPreviews={spotPreviews} variant="modal" />
              </Animated.View>

              <Animated.View
                style={{ opacity: contentOpacity, width: '100%', zIndex: 80, elevation: 80 }}
              >
                <View style={styles.ldFactCard}>
                  <View style={styles.ldFactIcon}>
                    <Ionicons name="bulb" size={16} color="#FACC15" />
                  </View>
                  <View style={styles.ldFactContent}>
                    <Text style={styles.ldFactLabel}>Did you know?</Text>
                    <Text style={styles.ldFactText} numberOfLines={4}>
                      {fact}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            </>
          ) : null}
        </View>

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
          <Animated.View
            style={[
              styles.lsSteps,
              styles.ldStepsFooter,
              { opacity: stepsOpacity, transform: [{ scale: stepsScale }], zIndex: 90, elevation: 90 },
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

  const pinIcon = mk.type === 'restaurant' ? 'restaurant' : mk.type === 'event' ? 'calendar' : 'location';
  const imageUrl = resolvePublicImageUrl(mk.image);

  const showRadius = showCircle

  return (
    <React.Fragment>
      {showRadius && (
        <Circle
          center={{ latitude: mk.lat, longitude: mk.lng }}
          radius={220}
          fillColor={`${accent}12`}
          strokeColor={`${accent}35`}
          strokeWidth={1}
        />
      )}
      <Marker coordinate={{ latitude: mk.lat, longitude: mk.lng }} onPress={onPress} anchor={{ x: 0.5, y: 0.5 }}>
        <Animated.View style={[styles.animatedMarkerWrap, { opacity: opacityAnim, transform: [{ scale: Animated.multiply(combinedScale, zoomScale) }] }]}>
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
          <View style={[styles.animatedMarkerAvatar, { borderColor: accent }]}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.animatedMarkerImage} />
            ) : (
              <>
                <View style={[styles.animatedMarkerIconBg, { backgroundColor: accent }]}>
                  <Ionicons name={pinIcon} size={18} color="#FFF" />
                </View>
                {showBadge && (
                  <View style={[styles.animatedMarkerBadge, { backgroundColor: accent }]}>
                    <Text style={styles.animatedMarkerBadgeText}>{mk.idx + 1}</Text>
                  </View>
                )}
              </>
            )}
          </View>
          {showLabel && (
            <>
              <View style={[styles.animatedMarkerLabel, { borderColor: accent }]}>
                <Text style={[styles.animatedMarkerLabelText, { color: accent }]} numberOfLines={1}>{mk.spot}</Text>
              </View>
              <View style={[styles.animatedMarkerArrow, { borderTopColor: accent }]} />
            </>
          )}
        </Animated.View>
      </Marker>
    </React.Fragment>
  );
}

const MAP_MARKER_QUICK_OPTIONS = [
  { key: 'profile', icon: 'person', label: 'Profile' },
  { key: 'directions', icon: 'navigate', label: 'Directions' },
  { key: 'ar', icon: 'camera', label: 'AR' },
];

const filterMarkerQuickOptions = (marker) =>
  MAP_MARKER_QUICK_OPTIONS.filter((opt) => {
    if (opt.key === 'profile') return !!marker?.clientId;
    if (opt.key === 'directions' || opt.key === 'ar') return marker?.lat != null && marker?.lng != null;
    return true;
  });

const MARKER_BOTTOM_SHEET_SLIDE = Math.round(SCREEN_HEIGHT * 0.5);

const markerKindLabel = (type) => {
  if (type === 'restaurant') return 'Restaurant';
  if (type === 'event') return 'Event';
  return 'Place';
};

const markerHeroIconName = (type) => {
  if (type === 'restaurant') return 'restaurant';
  if (type === 'event') return 'calendar';
  return 'location';
};

/** Place details + actions; slides up from bottom over the map. */
function MarkerDetailsBottomSheet({ visible, marker, insets, accentColor, onAction, onClose }) {
  const translateY = useRef(new Animated.Value(MARKER_BOTTOM_SHEET_SLIDE)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  const runClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: MARKER_BOTTOM_SHEET_SLIDE,
        duration: 280,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOp, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [translateY, backdropOp, onClose]);

  useEffect(() => {
    if (!visible || !marker) return undefined;
    translateY.setValue(MARKER_BOTTOM_SHEET_SLIDE);
    backdropOp.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 68,
        friction: 14,
      }),
      Animated.timing(backdropOp, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    return undefined;
  }, [visible, marker?.lat, marker?.lng, marker?.clientId, translateY, backdropOp]);

  const backdropOpacity = backdropOp.interpolate({ inputRange: [0, 1], outputRange: [0, 0.42] });

  if (!visible || !marker) return null;

  const handleAction = (key) => {
    onAction(key);
    onClose();
  };

  const actions = filterMarkerQuickOptions(marker);
  const bottomPad = 20 + getPlanSheetBottomPadding(insets)

  const heroUri = resolvePublicImageUrl(marker.image);
  const heroIcon = markerHeroIconName(marker.type);
  const gradEnd = `${accentColor}E6`;
  const gradMid = `${accentColor}99`;

  return (
    <View style={styles.markerBottomSheetRoot} pointerEvents="box-none">
      <Animated.View style={[styles.markerBottomSheetBackdrop, { opacity: backdropOpacity }]} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={runClose} accessibilityLabel="Dismiss" accessibilityRole="button" />
      </Animated.View>
      <Animated.View
        style={[
          styles.markerBottomSheetPanel,
          {
            paddingBottom: bottomPad,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.markerBottomSheetGrab} accessible={false} />
        <View style={styles.markerBottomSheetHeroWrap}>
          {heroUri ? (
            <Image source={{ uri: heroUri }} style={styles.markerBottomSheetHeroImg} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[gradEnd, gradMid, `${accentColor}33`]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.markerBottomSheetHeroPlaceholder}
            >
              <View style={styles.markerBottomSheetHeroPlaceholderIcon}>
                <Ionicons name={heroIcon} size={52} color="rgba(255,255,255,0.42)" />
              </View>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(15,23,42,0.5)', 'rgba(15,23,42,0.88)']}
            locations={[0, 0.45, 1]}
            style={styles.markerBottomSheetHeroScrim}
            pointerEvents="none"
          />
          <Pressable
            onPress={runClose}
            style={({ pressed }) => [styles.markerBottomSheetHeroClose, pressed && { opacity: 0.88 }]}
            hitSlop={8}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <View style={styles.markerBottomSheetHeroCloseInner}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </View>
          </Pressable>
          <View style={styles.markerBottomSheetHeroFoot} pointerEvents="none">
            <View style={styles.markerBottomSheetHeroTypePill}>
              <Ionicons name={heroIcon} size={13} color="#FFFFFF" style={styles.markerBottomSheetHeroTypeIcon} />
              <Text style={styles.markerBottomSheetHeroTypeText}>{markerKindLabel(marker.type)}</Text>
            </View>
            <Text style={styles.markerBottomSheetHeroTitle} numberOfLines={2}>
              {marker.spot || 'Place'}
            </Text>
            {marker.time ? (
              <View style={styles.markerBottomSheetHeroTimeRow}>
                <Ionicons name="time-outline" size={15} color="rgba(255,255,255,0.9)" />
                <Text style={styles.markerBottomSheetHeroTimeText}>{marker.time}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {marker.reason ? (
          <View style={styles.markerBottomSheetReasonCard}>
            <View style={styles.markerBottomSheetReasonHeader}>
              <Ionicons name="sparkles" size={18} color={accentColor} />
              <Text style={styles.markerBottomSheetReasonTitle}>Why visit</Text>
            </View>
            <ScrollView style={styles.markerBottomSheetReasonScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <Text style={styles.markerBottomSheetReason}>{marker.reason}</Text>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.markerBottomSheetActions}>
          <Text style={styles.markerBottomSheetActionsHeading}>Quick actions</Text>
          <View style={styles.markerBottomSheetActionGrid}>
            {actions.map((opt) => (
              <Pressable
                key={opt.key}
                style={({ pressed }) => [styles.markerBottomSheetActionCell, pressed && { opacity: 0.92, transform: [{ scale: 0.97 }] }]}
                onPress={() => handleAction(opt.key)}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <LinearGradient
                  colors={[accentColor, themeColors.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.markerBottomSheetActionGradient}
                >
                  <Ionicons name={opt.icon} size={26} color="#FFFFFF" />
                  <Text style={styles.markerBottomSheetActionGradientLabel}>{opt.label}</Text>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
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

function buildMapMarkers(plan, loadedClientMarkers = []) {
  if (!plan) return [];
  return plan.map((item, idx) => {
    const fixed = parsePlanItemCoords(item) || resolveCoordsFromLoadedCache(item, loadedClientMarkers);
    if (!fixed) return null;
    const { lat, lng } = fixed;
    const image = resolvePublicImageUrl(item.image || item.client_image);
    return {
      idx,
      spot: item.spot,
      time: item.time,
      type: item.type,
      reason: item.reason,
      lat,
      lng,
      image,
      clientId: item.clientId || null,
    };
  }).filter(Boolean);
}

export default function AIPlanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const activeTabRouteName = useNavigationState((state) => {
    if (!state?.routes?.length || state.index == null) return 'AI Plan'
    return state.routes[state.index]?.name ?? 'AI Plan'
  })
  const { preferences, generalLabels, activityLabels, foodLabels: savedProfileFoodLabels } = useUserPreferences();

  const handlePlanMiniNavPress = useCallback(
    (screen) => {
      if (activeTabRouteName === screen) {
        if (screen === 'Home') {
          navigation.navigate('Home', { scrollToTop: true, timestamp: Date.now() })
        }
        return
      }
      navigation.navigate(screen)
    },
    [navigation, activeTabRouteName],
  )
  const mapRef = useRef(null);
  const sheetAnim = useRef(new Animated.Value(SNAP_POINTS[INITIAL_SNAP_INDEX])).current;
  const lastSnap = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const currentYRef = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const prefetchRef = useRef({
    prefsKey: null,
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
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [dayPlan, setDayPlan] = useState(null);
  const [pineconeMatches, setPineconeMatches] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [visiblePinCount, setVisiblePinCount] = useState(0);
  const [revealingPins, setRevealingPins] = useState(false);
  const [surpriseSpinning, setSurpriseSpinning] = useState(false);
  const [surpriseIndex, setSurpriseIndex] = useState(0);
  const [surprisePicked, setSurprisePicked] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planModalStep, setPlanModalStep] = useState(1);
  const [doorVisible, setDoorVisible] = useState(false);
  const doorLeft = useRef(new Animated.Value(-SCREEN_WIDTH / 2)).current
  const doorRight = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current
  const doorIconScale = useRef(new Animated.Value(0)).current
  const doorIconOpacity = useRef(new Animated.Value(0)).current
  const doorFade = useRef(new Animated.Value(1)).current
  const skipOpenAnim = useRef(false)
  const [planGenerationSuccess, setPlanGenerationSuccess] = useState(false);
  
  // Initialize with placeholder images immediately, then load real ones
  const [spotPreviews, setSpotPreviews] = useState(() => {
    // Create immediate placeholder data from common Bahrain imagery
    const placeholders = [
      { id: 'ph-1', name: 'Bahrain', type: 'place', image: 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/default-place-1.jpg' },
      { id: 'ph-2', name: 'Bahrain', type: 'restaurant', image: 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/default-food-1.jpg' },
      { id: 'ph-3', name: 'Bahrain', type: 'place', image: 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/default-place-2.jpg' },
    ];
    return placeholders;
  });
  const [profileClientId, setProfileClientId] = useState(null);
  const [stopDetailPayload, setStopDetailPayload] = useState(null);
  const [openingMaps, setOpeningMaps] = useState(false);
  const [shareCopyHint, setShareCopyHint] = useState(false);
  const shareCopyHintTimerRef = useRef(null);
  const [allPlaceMarkers, setAllPlaceMarkers] = useState([]);
  const [mapRegion, setMapRegion] = useState(BAHRAIN_REGION);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchModalClients, setSearchModalClients] = useState({ restaurants: [], places: [], events: [] });
  const [searchModalLoading, setSearchModalLoading] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const [enhancingIndex, setEnhancingIndex] = useState(null);
  const [visibleStopCount, setVisibleStopCount] = useState(0);
  const stopRevealTimers = useRef([]);

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

  const handleOpenInGoogleMaps = async () => {
    if (!dayPlan || openingMaps) return;
    setOpeningMaps(true);
    try {
      await openAllStopsInGoogleMaps(dayPlan);
    } finally {
      setOpeningMaps(false);
    }
  };

  const closeStopDetailDialog = useCallback(() => {
    setStopDetailPayload(null);
  }, []);

  useEffect(() => {
    if (!dayPlan?.length) setStopDetailPayload(null);
  }, [dayPlan]);

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
          return { idx, spot, type, lat, lng, image, clientId: c.client_a_uuid };
        }).filter(Boolean);
        setAllPlaceMarkers(markers);
      } catch (e) {
        if (!cancelled) console.warn('[AIPlan] fetch clients for map:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const togglePreference = (id) => {
    setSelectedPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleFoodCategory = (id) => {
    setSelectedFoodCategories((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const startBackgroundPrefetch = (prefLabels) => {
    const key = (prefLabels || []).join('|');
    if (!key) return;
    const cached = prefetchRef.current;
    const hasValidPrefetch =
      cached.prefsKey === key &&
      Array.isArray(cached.places) &&
      cached.places.length > 0 &&
      Array.isArray(cached.events) &&
      cached.events.length > 0;
    if (hasValidPrefetch) {
      return;
    }
    prefetchRef.current = {
      prefsKey: key,
      places: null,
      breakfastSpots: null,
      events: null,
    };
    (async () => {
      try {
        const [places, events] = await Promise.all([
          fetchPlaces(prefLabels),
          fetchEvents(prefLabels),
        ]);
        prefetchRef.current = {
          prefsKey: key,
          places,
          breakfastSpots: null,
          events,
        };
      } catch {
        // best-effort prefetch; ignore errors
      }
    })();
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

          setDayPlan(null);
          setPineconeMatches([]);
          setSelectedMarker(null);
          setError(null);
          setLoading(true);
          setLoadingStatus(`Scouting venues & live posts for your ${theme.label.toLowerCase()} day…`);
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
              const [
                places,
                restaurants,
                breakfastSpots,
                events,
              ] = await Promise.all([
                fetchPlaces(prefLabels),
                fetchRestaurants(foodLabels),
                fetchBreakfastSpots(),
                fetchEvents(prefLabels),
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
              });
              generatedPlan = plan;
              const enriched = await enrichPlanWithClientData(plan, allMatches, allPlaceMarkers);
              setDayPlan(attachPlanRowKeys(enriched));
              setError(null);

              const validMarkers = buildMapMarkers(plan, allPlaceMarkers).filter(m => m.lat && m.lng);
              const coords = validMarkers.map(m => ({ latitude: m.lat, longitude: m.lng }));
              if (coords.length > 0 && mapRef.current) {
                mapRef.current.fitToCoordinates(coords, {
                  edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
                  animated: true,
                });
              }
    } catch (err) {
      console.warn('[AI Plan] API error, using mock plan:', err?.message);
      generatedPlan = getMockDayPlan();
      const allM = [...(places || []), ...(restaurants || []), ...(breakfastSpots || []), ...(events || [])];
      setPineconeMatches(allM);
      enrichPlanWithClientData(generatedPlan, allM, allPlaceMarkers).then((e) => setDayPlan(attachPlanRowKeys(e)));
      setError(null);
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
    setSelectedPreferences(Array.isArray(preferences?.activityIds) ? preferences.activityIds : [])
    setSelectedFoodCategories(Array.isArray(preferences?.foodIds) ? preferences.foodIds : [])
    setDayPlan(null)
    setPineconeMatches([])
    setSelectedMarker(null)
    setError(null)
    setSpotPreviews([])
    setPlanModalStep(1)

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
          : { message, title: title || 'Go Bahrain' },
      );
    } catch (_) {
      /* dismissed */
    }
  }, [dayPlan]);

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
      const row = keyed[planIndex]
      const timeColors = { Morning: colors.morning, Afternoon: colors.afternoon, Evening: colors.evening }
      setStopDetailPayload((prev) => {
        if (!prev || prev.planIndex !== planIndex || !row) return prev
        const isEat = row.type === 'restaurant'
        const isEvent = row.type === 'event'
        const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : (timeColors[row.time] || colors.morning)
        const rawGallery = (row.images && row.images.length > 0) ? row.images : (row.image ? [row.image] : [])
        const galleryUris = [...new Set(rawGallery.map((u) => resolvePublicImageUrl(u)).filter(Boolean))]
        const hasImages = galleryUris.length > 0
        const hasProfile = !!(row.clientId)
        return {
          item: row,
          planIndex,
          thisStopNum: planIndex + 1,
          accent,
          isEat,
          isEvent,
          hasImages,
          images: galleryUris,
          hasProfile,
        }
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
    generalLabels,
    activityLabels,
    savedProfileFoodLabels,
    colors.morning,
    colors.afternoon,
    colors.evening,
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

  const handleGenerate = async (onComplete) => {
    const prefLabels = selectedPreferences
      .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
      .filter(Boolean);
    const foodLabels = selectedFoodCategories
      .map((id) => FOOD_CATEGORIES.find((f) => f.id === id)?.label)
      .filter(Boolean);

    setLoading(true);
    setPlanGenerationSuccess(false);
    setLoadingStatus('Khalid is scouting live posts for standout venues…');
    setError(null);
    setDayPlan(null);
    setPineconeMatches([]);
    setSelectedMarker(null);
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
      const prefsKey = prefLabels.join('|');
      const cached = prefetchRef.current;

      let places;
      let breakfastSpots;
      let events;
      let restaurants;

      const hasCached =
        cached.prefsKey === prefsKey &&
        Array.isArray(cached.places) &&
        cached.places.length > 0 &&
        Array.isArray(cached.events) &&
        cached.events.length > 0;

      if (hasCached) {
        places = cached.places;
        events = cached.events;
        [restaurants, breakfastSpots] = await Promise.all([
          fetchRestaurants(foodLabels),
          fetchBreakfastSpots(),
        ]);
      } else {
        const [
          placesResult,
          restaurantsResult,
          breakfastResult,
          eventsResult,
        ] = await Promise.all([
          fetchPlaces(prefLabels),
          fetchRestaurants(foodLabels),
          fetchBreakfastSpots(),
          fetchEvents(prefLabels),
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
      if (coords.length > 0 && mapRef.current) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
          animated: true,
        });
      }

    } catch (err) {
      console.warn('[AI Plan] API error, using mock plan:', err?.message);
      generatedPlan = getMockDayPlan();
      const allM = [...(places || []), ...(restaurants || []), ...(breakfastSpots || []), ...(events || [])];
      setPineconeMatches(allM);
      enrichPlanWithClientData(generatedPlan, allM, allPlaceMarkers).then((e) => setDayPlan(attachPlanRowKeys(e)));
      setError(null);
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
    const clamped = clampRegionToBahrain(region);
    if (Math.abs(clamped.latitude - region.latitude) > 0.0005 || Math.abs(clamped.longitude - region.longitude) > 0.0005) {
      mapRef.current.animateToRegion(clamped, 180);
    }
    if (region?.latitudeDelta != null) setMapRegion(region);
  };

  const closeRadialMenu = () => {
    setSelectedMarker(null);
  };

  const handleRadialAction = (key) => {
    if (!selectedMarker) return;
    if (key === 'profile' && selectedMarker.clientId) setProfileClientId(selectedMarker.clientId);
    if (key === 'directions') openInMaps(selectedMarker.lat, selectedMarker.lng, selectedMarker.spot);
    if (key === 'ar') navigation.navigate('AR', { navigateTo: { lat: selectedMarker.lat, lng: selectedMarker.lng, name: selectedMarker.spot } });
  };

  // Google Maps–style zoom scaling: markers shrink when zoomed out to avoid overcrowding
  const zoomScale = (() => {
    const delta = mapRegion?.latitudeDelta ?? BAHRAIN_REGION.latitudeDelta;
    const s = Math.max(0.2, Math.min(1, 0.06 / delta));
    return s;
  })();

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
        showsUserLocation={false}
        showsMyLocationButton={false}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {/* Pre-plan: all clients with profile images as markers */}
        {!dayPlan && allPlaceMarkers.map((mk) => {
          const isEat = mk.type === 'restaurant';
          const isEvent = mk.type === 'event';
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
              onPress={() => setSelectedMarker(mk)}
            />
          );
        })}
        {/* Plan markers — reveal one by one with profile images and entrance animation */}
        {dayPlan && (() => {
          const markers = buildMapMarkers(dayPlan, allPlaceMarkers);
          const maxVisible = revealingPins ? visiblePinCount : markers.length;
          return markers.filter((mk) => mk.idx < maxVisible).map((mk) => {
            const isEat = mk.type === 'restaurant';
            const isEvent = mk.type === 'event';
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
                onPress={() => setSelectedMarker(mk)}
              />
            );
          });
        })()}
      </MapView>

      {/* Mini tab icons — centered; AI Plan hides bottom bar */}
      <View style={[styles.topBarWrap, { paddingTop: insets.top + 2 }]} pointerEvents="box-none">
        <View style={styles.topBarBalanceSpacer} pointerEvents="none" accessibilityElementsHidden />
        <View style={styles.planMiniNavRow} accessibilityRole="tablist" accessibilityLabel="Main navigation">
          {PLAN_MINI_NAV.map((item) => {
            const selected = activeTabRouteName === item.screen
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.planMiniNavBtn}
                onPress={() => handlePlanMiniNavPress(item.screen)}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={item.label}
              >
                {item.isLogo ? (
                  <Image
                    source={require('../../assets/ai-button-logo.png')}
                    style={styles.planMiniNavLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons
                    name={selected ? item.iconActive : item.icon}
                    size={18}
                    color={selected ? themeColors.primary : '#64748B'}
                  />
                )}
              </TouchableOpacity>
            )
          })}
        </View>
        <TouchableOpacity
          style={styles.searchButton}
          activeOpacity={0.8}
          onPress={() => setShowSearchModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Search places"
        >
          <Ionicons name="search" size={22} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      {/* Scanning overlay during Hang tight removed (no radar effect) */}
      <MapScanningOverlay visible={false} />

      <Animated.View
        style={[
          styles.sheet,
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
            <ScrollView style={styles.pastPlansScroll} contentContainerStyle={styles.d0ScrollContent} showsVerticalScrollIndicator={false}>
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
                      <Image
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
              {DUMMY_PAST_PLANS.length > 0 && (
                <>
                  <AiStagger delay={140}>
                    <View style={styles.d0SectionHeader}>
                      <Text style={styles.d0SectionTitle}>Recent plans</Text>
                      <View style={styles.d0SectionCount}>
                        <Text style={styles.d0SectionCountText}>{DUMMY_PAST_PLANS.length}</Text>
                      </View>
                    </View>
                  </AiStagger>
                  {DUMMY_PAST_PLANS.map((plan, idx) => (
                    <AiStagger key={plan.id} delay={180 + idx * 50}>
                      <TouchableOpacity style={styles.d0PlanCard} activeOpacity={0.8}>
                        <View style={styles.d0PlanIconWrap}>
                          <Ionicons name="map" size={20} color={themeColors.primary} />
                        </View>
                        <View style={styles.d0PlanInfo}>
                          <Text style={styles.d0PlanName}>{plan.title}</Text>
                          <Text style={styles.d0PlanMeta}>{plan.spots} stops · {plan.date}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                      </TouchableOpacity>
                    </AiStagger>
                  ))}
                </>
              )}

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
        )}

        {/* Step 3 — Day plan results (steps 1–2 now in modal) */}
        {drawerStep === 3 && (
          <View style={styles.planStep3Body}>
            {loading || error || !dayPlan?.length ? (
              <View style={styles.drawerPageHeader}>
                <TouchableOpacity
                  style={styles.backButton}
                  activeOpacity={0.8}
                  onPress={() => { setDrawerStep(0); setDayPlan(null); setError(null); }}
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
            ) : (
              <LinearGradient
                colors={['#FFFFFF', '#FFFBFC', '#FFF0F3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.planMastheadRoot}
              >
                <View style={styles.planMastheadTopRow}>
                  <TouchableOpacity
                    style={styles.planMastheadBackBtn}
                    activeOpacity={0.8}
                    onPress={() => { setDrawerStep(0); setDayPlan(null); setError(null); }}
                    accessibilityRole="button"
                    accessibilityLabel="Back to plans"
                  >
                    <Ionicons name="chevron-back" size={20} color="#0F172A" />
                  </TouchableOpacity>
                  <View style={styles.planMastheadTitleBlock}>
                    <Text style={styles.planMastheadTitleLine} accessibilityRole="header">
                      <Text style={styles.planMastheadTitleStrong}>Your day </Text>
                      <Text style={styles.planMastheadTitleSoft}>in Bahrain</Text>
                    </Text>
                    <Text style={styles.planMastheadMetaLine} accessibilityLabel={`${dayPlan.length} stops, ${dayPlan.filter((i) => i.type === 'restaurant').length} meals, one day`}>
                      <Text style={styles.planMastheadMetaEm}>{dayPlan.length}</Text>
                      <Text style={styles.planMastheadMetaSep}> stops · </Text>
                      <Text style={styles.planMastheadMetaEm}>{dayPlan.filter((i) => i.type === 'restaurant').length}</Text>
                      <Text style={styles.planMastheadMetaSep}> meals · </Text>
                      <Text style={styles.planMastheadMetaEm}>1</Text>
                      <Text style={styles.planMastheadMetaSep}> day</Text>
                    </Text>
                  </View>
                </View>
                <View style={styles.planMastheadActions}>
                  <TouchableOpacity
                    style={styles.iv2MapOutline}
                    onPress={handleOpenInGoogleMaps}
                    disabled={openingMaps}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Open route in Google Maps"
                  >
                    {openingMaps ? (
                      <ActivityIndicator size="small" color={themeColors.primary} />
                    ) : (
                      <>
                        <Ionicons name="navigate-outline" size={18} color={themeColors.primary} />
                        <Text style={styles.iv2MapOutlineText}>Maps</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={styles.iv2Seg}>
                    <TouchableOpacity
                      style={styles.iv2SegBtn}
                      activeOpacity={0.75}
                      onPress={handleSharePlanWithFriends}
                      accessibilityRole="button"
                      accessibilityLabel="Share plan"
                    >
                      <Ionicons name="share-outline" size={18} color="#0f172a" />
                    </TouchableOpacity>
                    <View style={styles.iv2SegDivider} />
                    <TouchableOpacity
                      style={styles.iv2SegBtn}
                      activeOpacity={0.75}
                      onPress={handleCopyShareText}
                      accessibilityRole="button"
                      accessibilityLabel="Copy plan text"
                    >
                      <Ionicons name="copy-outline" size={18} color="#0f172a" />
                    </TouchableOpacity>
                  </View>
                </View>
                {shareCopyHint ? <Text style={styles.iv2CopyToast}>Copied</Text> : null}
              </LinearGradient>
            )}

            {loading ? (
              <Reanimated.View
                style={[styles.planContentFill, styles.loadingWrap]}
                entering={FadeInDown.duration(400).springify().damping(17).stiffness(200).mass(0.85)}
              >
                <View style={styles.loadingBumpCard}>
                  <LinearGradient colors={['#FFF0F2', '#FFF8F9', '#FFFFFF']} style={StyleSheet.absoluteFill} />
                  <Text style={styles.loadingScoutTitle} accessibilityRole="header">
                    <Text style={styles.loadingScoutTitleAccent}>Khalid</Text>
                    {' is scouting the perfect places for you'}
                  </Text>
                  <KhalidScoutPlanVisual spotPreviews={spotPreviews} variant="sheet" />
                  <View style={styles.loadingProgressBar}>
                    <LinearGradient
                      colors={[themeColors.primary, '#E63950']}
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  setDayPlan(data)
                }}
                activationDistance={12}
                containerStyle={styles.planDraggableListContainer}
                contentContainerStyle={styles.resultsContent}
                contentInsetAdjustmentBehavior="never"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListFooterComponent={(
                  <View style={styles.planListEndFooter}>
                    <Text style={styles.planListEndFooterText}>
                      Long-press the grip icon to reorder stops · Enhance with AI replaces one stop · Tap a row for details and maps
                    </Text>
                  </View>
                )}
                renderItem={({ item, drag, isActive, getIndex }) => {
                  const planIndex = getIndex() ?? 0
                  const thisStopNum = planIndex + 1
                  const isEat = item.type === 'restaurant'
                  const isEvent = item.type === 'event'
                  const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : colors.morning
                  const rawGallery = (item.images && item.images.length > 0) ? item.images : (item.image ? [item.image] : [])
                  const galleryUris = [...new Set(rawGallery.map((u) => resolvePublicImageUrl(u)).filter(Boolean))]
                  const thumbUri = galleryUris[0] || resolvePublicImageUrl(item.image)
                  const hasImages = galleryUris.length > 0
                  const hasProfile = !!(item.clientId)
                  const isExpanded = stopDetailPayload?.planIndex === planIndex
                  const isVisible = planIndex < visibleStopCount
                  
                  return (
                    <ScaleDecorator>
                      <AnimatedStopRow isVisible={isVisible} style={styles.planRowEnterWrap}>
                      <View style={[styles.planDraggableRow, isActive && styles.planDraggableRowActive]}>
                        <TouchableOpacity
                          onLongPress={drag}
                          delayLongPress={180}
                          style={styles.planRowDragHit}
                          activeOpacity={0.75}
                          accessibilityRole="button"
                          accessibilityLabel="Drag to reorder stop"
                        >
                          <Ionicons name="reorder-three" size={28} color="#64748B" />
                        </TouchableOpacity>
                        <Pressable
                          style={styles.planRowMain}
                          onPress={() => {
                            if (stopDetailPayload?.planIndex === planIndex) {
                              setStopDetailPayload(null)
                              return
                            }
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                            closeRadialMenu()
                            setStopDetailPayload({
                              item,
                              planIndex,
                              thisStopNum,
                              accent,
                              isEat,
                              isEvent,
                              hasImages,
                              images: galleryUris,
                              hasProfile,
                            })
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: isExpanded }}
                          accessibilityLabel={`${item.spot}, stop ${thisStopNum}`}
                        >
                          <View style={styles.planRowThumb}>
                            {hasImages ? (
                              <PreviewImage uri={thumbUri} style={styles.planRowThumbImg} />
                            ) : (
                              <View style={[styles.planRowThumbImg, styles.planRowThumbPlaceholder, { backgroundColor: `${accent}22` }]}>
                                <Ionicons name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'} size={22} color={accent} />
                              </View>
                            )}
                          </View>
                          <View style={styles.planRowTextCol}>
                            <Text style={styles.planRowSpotTitle} numberOfLines={2}>{item.spot}</Text>
                            {item.rating != null && (
                              <View style={styles.planRowRatingInline}>
                                <Ionicons name="star" size={12} color="#F59E0B" />
                                <Text style={styles.planRowRatingInlineText}>{Number(item.rating).toFixed(1)}</Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                        <TouchableOpacity
                          style={styles.planRowEnhanceBtn}
                          activeOpacity={0.85}
                          onPress={() => handleEnhanceStop(planIndex)}
                          disabled={enhancingIndex !== null}
                          accessibilityRole="button"
                          accessibilityLabel="Enhance with AI, replace this stop"
                        >
                          {enhancingIndex === planIndex ? (
                            <ActivityIndicator size="small" color={themeColors.primary} />
                          ) : (
                            <>
                              <Ionicons name="sparkles" size={14} color={themeColors.primary} />
                              <Text style={styles.planRowEnhanceBtnText}>Enhance{'\n'}with AI</Text>
                            </>
                          )}
                        </TouchableOpacity>
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
              <View
                style={[styles.stopDialogCard, { width: STOP_DIALOG_SLIDE_WIDTH, maxWidth: '100%' }]}
                accessibilityViewIsModal
              >
                <View style={styles.stopDialogHero}>
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
                    slideWidth={STOP_DIALOG_SLIDE_WIDTH}
                    imageHeight={STOP_DIALOG_IMAGE_H}
                  />
                </View>
                <ScrollView
                  style={styles.stopDialogBodyScroll}
                  contentContainerStyle={styles.stopDialogScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <View style={styles.stopDialogHeader}>
                    <View style={styles.stopDialogHeaderMain}>
                      <View style={[styles.stopDialogNumBadge, { backgroundColor: stopDetailPayload.accent }]}>
                        <Text style={styles.stopDialogNumText}>{stopDetailPayload.thisStopNum}</Text>
                      </View>
                      <View style={styles.stopDialogTitleCol}>
                        <Text style={styles.stopDialogSpotTitle} numberOfLines={3}>
                          {stopDetailPayload.item.spot}
                        </Text>
                        {stopDetailPayload.item.rating != null && (
                          <View style={styles.stopDialogRatingRow}>
                            <Ionicons name="star" size={14} color="#F59E0B" />
                            <Text style={styles.stopDialogRatingText}>
                              {Number(stopDetailPayload.item.rating).toFixed(1)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.stopDialogClose}
                      onPress={closeStopDetailDialog}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close-circle" size={34} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.stopDialogSectionLabel}>About this stop</Text>
                  <View style={styles.stopDialogDescBox}>
                    <Text style={styles.stopDialogDescText}>{stopDetailPayload.item.reason}</Text>
                  </View>

                  <View style={styles.stopDialogActions}>
                    {stopDetailPayload.item.lat != null && stopDetailPayload.item.lng != null && (
                      <>
                        <TouchableOpacity
                          style={[styles.stopDialogBtn, styles.stopDialogBtnPrimary]}
                          activeOpacity={0.88}
                          onPress={() => {
                            openInMaps(stopDetailPayload.item.lat, stopDetailPayload.item.lng, stopDetailPayload.item.spot);
                            closeStopDetailDialog();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Get directions"
                        >
                          <Ionicons name="navigate" size={18} color="#FFFFFF" />
                          <Text style={styles.stopDialogBtnPrimaryText}>Directions</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.stopDialogBtn, styles.stopDialogBtnGhost]}
                          activeOpacity={0.88}
                          onPress={() => {
                            navigation.navigate('AR', {
                              navigateTo: {
                                lat: stopDetailPayload.item.lat,
                                lng: stopDetailPayload.item.lng,
                                name: stopDetailPayload.item.spot,
                              },
                            });
                            closeStopDetailDialog();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Open in AR"
                        >
                          <Ionicons name="camera" size={18} color={themeColors.primary} />
                          <Text style={styles.stopDialogBtnGhostText}>AR</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {stopDetailPayload.hasProfile && (
                      <TouchableOpacity
                        style={[styles.stopDialogBtn, styles.stopDialogBtnGhost]}
                        activeOpacity={0.88}
                        onPress={() => {
                          setProfileClientId(stopDetailPayload.item.clientId);
                          closeStopDetailDialog();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Open profile"
                      >
                        <Ionicons name="person-circle-outline" size={18} color={themeColors.primary} />
                        <Text style={styles.stopDialogBtnGhostText}>Profile</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {stopDetailPayload.planIndex != null && (
                    <View style={styles.stopDialogEnhanceWrap}>
                      <TouchableOpacity
                        style={styles.stopDialogEnhanceWide}
                        activeOpacity={0.88}
                        onPress={() => handleEnhanceStop(stopDetailPayload.planIndex)}
                        disabled={enhancingIndex !== null}
                        accessibilityRole="button"
                        accessibilityLabel="Enhance with AI"
                      >
                        {enhancingIndex === stopDetailPayload.planIndex ? (
                          <ActivityIndicator size="small" color={themeColors.primary} />
                        ) : (
                          <>
                            <Ionicons name="sparkles" size={20} color={themeColors.primary} />
                            <Text style={styles.stopDialogEnhanceWideText}>Enhance with AI</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
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
                      {/* Hero question area */}
                      <View style={styles.pmHero}>
                        <PopIn delay={60} trigger={planModalStep}>
                          <View style={styles.pmStepBadge}>
                            <Text style={styles.pmStepBadgeText}>
                              {planModalStep === 1 ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}
                            </Text>
                            <View style={styles.pmStepDots}>
                              <View style={[styles.pmStepDotSmall, styles.pmStepDotSmallActive]} />
                              <View style={[styles.pmStepDotSmall, planModalStep === 2 && styles.pmStepDotSmallActive]} />
                            </View>
                          </View>
                        </PopIn>

                        <PopIn delay={140} trigger={planModalStep}>
                          <Text style={styles.pmTitle}>
                            {planModalStep === 1
                              ? 'What excites you?'
                              : 'What are you craving?'}
                          </Text>
                        </PopIn>
                        <PopIn delay={200} trigger={planModalStep}>
                          <Text style={styles.pmSub}>
                            {planModalStep === 1
                              ? 'Pick the vibes that match your Bahrain trip'
                              : 'Choose your food mood for the day'}
                          </Text>
                        </PopIn>

                        {(planModalStep === 1 ? selectedPreferences.length : selectedFoodCategories.length) > 0 && (
                          <PopIn delay={240} trigger={planModalStep}>
                            <View style={styles.pmSelectedPill}>
                              <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                              <Text style={styles.pmSelectedText}>
                                {planModalStep === 1
                                  ? `${selectedPreferences.length} picked`
                                  : `${selectedFoodCategories.length} picked`}
                              </Text>
                            </View>
                          </PopIn>
                        )}
                      </View>

                      {/* Chip options (flex-wrap tag cloud) */}
                      <View style={styles.pmChipsWrap}>
                        <ScrollView
                          style={styles.pmChipsScroll}
                          contentContainerStyle={styles.pmChipsScrollContent}
                          showsVerticalScrollIndicator={false}
                        >
                          <View style={styles.pmChipsPanel}>
                            <View style={styles.pmChipsGrid}>
                            {(() => {
                              const items = planModalStep === 1 ? PREFERENCES : FOOD_CATEGORIES
                              const isSelectedFn = (item) =>
                                planModalStep === 1
                                  ? selectedPreferences.includes(item.id)
                                  : selectedFoodCategories.includes(item.id)
                              const handlePressItem = (item) => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                                return planModalStep === 1 ? togglePreference(item.id) : toggleFoodCategory(item.id)
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
                                <Ionicons name="close" size={20} color="rgba(255,255,255,0.9)" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.planModalContinueBtn}
                                activeOpacity={0.85}
                                onPress={() => {
                                  const prefLabels = selectedPreferences
                                    .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
                                    .filter(Boolean)
                                  startBackgroundPrefetch(prefLabels)
                                  setPlanModalStep(2)
                                }}
                                accessibilityLabel="Continue to food preferences"
                                accessibilityRole="button"
                              >
                                <LinearGradient
                                  colors={['#FFFFFF', '#F0F0F0']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={styles.planModalBtnGradient}
                                >
                                  <Text style={[styles.planModalContinueBtnText, { color: '#B80E21' }]}>Continue</Text>
                                  <Ionicons name="arrow-forward" size={20} color="#B80E21" />
                                </LinearGradient>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.planModalBackBtn}
                                activeOpacity={0.7}
                                onPress={() => setPlanModalStep(1)}
                                accessibilityLabel="Go back"
                                accessibilityRole="button"
                              >
                                <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.9)" />
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
                                  colors={['#FFFFFF', '#F0F0F0']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={styles.planModalBtnGradient}
                                >
                                  <Ionicons name="sparkles" size={20} color="#B80E21" />
                                  <Text style={[styles.planModalGenerateBtnText, { color: '#B80E21' }]}>Generate My Plan</Text>
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
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <MarkerDetailsBottomSheet
        visible={!!selectedMarker}
        marker={selectedMarker}
        insets={insets}
        accentColor={
          selectedMarker?.type === 'restaurant'
            ? colors.dining
            : selectedMarker?.type === 'event'
              ? colors.event
              : colors.textSecondary
        }
        onAction={handleRadialAction}
        onClose={closeRadialMenu}
      />

      {/* Clients search modal — all clients by Restaurants, Places, Events */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearchModal(false)}
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
                <Text style={styles.searchModalHeading}>Browse Clients</Text>
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
                  onPress={() => setShowSearchModal(false)}
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
                              onPress={() => {
                                setShowSearchModal(false);
                                setProfileClientId(client.client_a_uuid || client.clientId);
                              }}
                            >
                              <View style={[styles.searchModalClientCircle, { borderColor: accent }]}>
                                {imageUrl ? (
                                  <Image source={{ uri: imageUrl }} style={styles.searchModalClientImage} />
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
                <Image
                  source={require('../../assets/ai-button-logo.png')}
                  style={styles.doorLogoImage}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.doorFlagLabel}>GoBahrain</Text>
            </Animated.View>
          </Animated.View>
        )
      })()}
    </View>
  );
}
