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
  TouchableWithoutFeedback,
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
} from 'react-native-reanimated';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { fetchPlaces, fetchRestaurants, fetchBreakfastSpots, fetchEvents, generateDayPlan, getMockDayPlan, fetchClientsWithLocation } from '../services/aiPipeline';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { colors as themeColors } from '../theme/designTokens';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../config/supabase';
import ClientProfileModal from '../components/ClientProfileModal';
import { ensureImageUrl } from '../utils/imageUrl';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import {
  Scene,
  PerspectiveCamera,
  AmbientLight,
  DirectionalLight,
  PointLight,
  Mesh,
  Group,
  CylinderGeometry,
  BoxGeometry,
  SphereGeometry,
  ConeGeometry,
  TorusGeometry,
  MeshStandardMaterial,
  Color,
  Fog,
  RingGeometry,
  DoubleSide,
} from 'three';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

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
function AiStagger({ children, delay = 0, style }) {
  return (
    <Reanimated.View
      entering={FadeInDown.springify()
        .damping(17)
        .stiffness(210)
        .mass(0.65)
        .delay(delay)}
      style={style}
    >
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


const APP_TAB_BAR_HEIGHT_IOS = 70;
const getAppTabBarHeight = (insets) =>
  Platform.OS === 'ios' ? APP_TAB_BAR_HEIGHT_IOS : 60 + (insets?.bottom ?? 0);

const SHEET_VISIBLE_PEEK = 0.28;
const SHEET_VISIBLE_MID = 0.75;
const SHEET_VISIBLE_EXPANDED = 0.9;

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
      const image = ensureImageUrl(rawImage) || rawImage;
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

// Parse storage image (post_image or client_image) to full URL — handles string path, JSON array, or full URL
function parseStorageImageUrl(raw) {
  if (raw == null) return null;
  let str = null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const first = arr[0];
        str = first?.url || (typeof first === 'string' ? first : null);
      } catch { return null; }
    } else {
      str = trimmed;
    }
  } else if (typeof raw === 'object' && raw?.url) {
    str = raw.url;
  } else if (Array.isArray(raw) && raw[0]) {
    str = raw[0]?.url || (typeof raw[0] === 'string' ? raw[0] : null);
  }
  if (!str || typeof str !== 'string') return null;
  str = str.trim();
  if (!str) return null;
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  const cleanPath = str.startsWith('gobahrain-post-images/') ? str.replace('gobahrain-post-images/', '') : str;
  return `https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/${cleanPath}`;
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
    .limit(60);

  if (postErr || !postRows?.length) {
    if (postErr) console.warn('[AIPlan] fetchSpotPreviews posts error:', postErr?.message);
    return [];
  }

  const clientIds = [...new Set(postRows.map((r) => r.client_a_uuid).filter(Boolean))];
  const { data: clients, error: clientErr } = await supabase
    .from('client')
    .select('client_a_uuid, business_name, name, client_type')
    .in('client_a_uuid', clientIds);

  const nameByClient = {};
  (clients || []).forEach((c) => {
    if (c.client_a_uuid) {
      nameByClient[c.client_a_uuid] = (c.business_name || c.name || 'Spot').trim();
    }
  });

  const seen = new Set();
  const arr = [];
  for (const row of postRows) {
    const key = `${row.client_a_uuid}-${row.post_image}`;
    if (seen.has(key)) continue;
    let image = parseStorageImageUrl(row.post_image) || ensureImageUrl(String(row.post_image).trim()) || (row.post_image ? String(row.post_image).trim() : null);
    if (!image) continue;
    seen.add(key);
    const name = nameByClient[row.client_a_uuid] || 'Spot';
    const ct = ((clients || []).find((c) => c.client_a_uuid === row.client_a_uuid)?.client_type || '').toLowerCase();
    const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place';
    const typeLabel = type === 'restaurant' ? 'Food & drinks' : type === 'event' ? 'Event' : 'Explore';
    arr.push({
      id: `${row.client_a_uuid}-${arr.length}`,
      name,
      type,
      typeLabel,
      image,
      clientId: row.client_a_uuid,
    });
    if (arr.length >= 12) break;
  }

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  arr.forEach((p) => p.image && Image.prefetch(p.image).catch(() => {}));
  return arr.slice(0, 12);
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
        imageByClientId[c.client_a_uuid] = ensureImageUrl(String(c.client_image).trim()) || String(c.client_image).trim();
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
      const image = meta.image_url || meta.thumbnail_url || meta.cover_image || meta.image || null;
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
async function enrichPlanWithClientData(plan, pineconeMatches) {
  // Step 1: Match from Pinecone when available — prefer Pinecone metadata lat/lng over model output
  let enriched = plan.map((item) => {
    const match = matchPlanToPinecone(item, pineconeMatches);
    const pine = match?.coords;
    const gptFixed = pine ? null : parsePlanItemCoords(item);
    return {
      ...item,
      image: match?.image || null,
      clientId: match?.clientId || null,
      rating: match?.rating != null ? match.rating : null,
      lat: pine ? pine.lat : gptFixed ? gptFixed.lat : item.lat,
      lng: pine ? pine.lng : gptFixed ? gptFixed.lng : item.lng,
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
        clientImageMap[c.client_a_uuid] = ensureImageUrl(String(c.client_image).trim()) || String(c.client_image).trim();
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

  // Step 3: ALWAYS fetch clients from Supabase and match by business_name for items without images
  const needsImage = enriched.filter((i) => !i.image || !ensureImageUrl(i.image));
  if (needsImage.length > 0) {
    const { data: allClients } = await supabase
      .from('client')
      .select('client_a_uuid, business_name, name, business_name_ar, client_image, rating, lat, long, latitude, longitude')
      .limit(300);
    const clientsList = allClients || [];
    enriched = enriched.map((item) => {
      if (item.image && ensureImageUrl(item.image)) return item;
      const client = matchPlanToClient(item, clientsList);
      if (client) {
        const img = client.client_image ? ensureImageUrl(String(client.client_image).trim()) || String(client.client_image).trim() : null;
        const dbCoords = unswapLatLng(client.lat ?? client.latitude, client.long ?? client.longitude ?? client.lng);
        return {
          ...item,
          image: item.image || img,
          clientId: item.clientId || client.client_a_uuid,
          rating: item.rating != null ? item.rating : (client.rating != null ? client.rating : null),
          ...(dbCoords ? { lat: dbCoords.lat, lng: dbCoords.lng } : {}),
        };
      }
      return item;
    });
    const newIds = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
    for (const cid of newIds) {
      if (clientImageMap[cid]) continue;
      const c = (clientsList || []).find((x) => x.client_a_uuid === cid);
      if (c?.client_image) {
        clientImageMap[cid] = ensureImageUrl(String(c.client_image).trim()) || String(c.client_image).trim();
      }
    }
  }

  const idsNeedingCoords = [...new Set(enriched.filter((i) => !parsePlanItemCoords(i) && i.clientId).map((i) => i.clientId))];
  if (idsNeedingCoords.length > 0) {
    const { data: locRows } = await supabase
      .from('client')
      .select('client_a_uuid, lat, long, latitude, longitude')
      .in('client_a_uuid', idsNeedingCoords);
    const coordById = {};
    (locRows || []).forEach((c) => {
      const u = unswapLatLng(c.lat ?? c.latitude, c.long ?? c.longitude ?? c.lng);
      if (u && c.client_a_uuid) coordById[c.client_a_uuid] = u;
    });
    enriched = enriched.map((item) => {
      if (parsePlanItemCoords(item)) return item;
      const u = item.clientId ? coordById[item.clientId] : null;
      return u ? { ...item, lat: u.lat, lng: u.lng } : item;
    });
  }

  // Step 4: Fallback — fetch first post image when client_image is null
  const stillNoImage = enriched.filter((i) => !i.image && i.clientId);
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
      const fullUrl = ensureImageUrl(String(url)) || (typeof url === 'string' && url.startsWith('http') ? url : null);
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
      url = ensureImageUrl(String(url)) || (typeof url === 'string' && url.startsWith('http') ? url : null);
      if (url) {
        if (!postImagesByClient[row.client_a_uuid]) postImagesByClient[row.client_a_uuid] = [];
        if (!postImagesByClient[row.client_a_uuid].includes(url)) postImagesByClient[row.client_a_uuid].push(url);
      }
    });
  }

  return enriched.map((item) => {
    const primary = ensureImageUrl(item.image) || (item.clientId ? clientImageMap[item.clientId] : null) || null;
    const postUrls = (item.clientId ? postImagesByClient[item.clientId] : null) || [];
    const allImages = [primary, ...postUrls].filter(Boolean);
    const seen = new Set();
    const images = allImages.filter((u) => { if (seen.has(u)) return false; seen.add(u); return true; });
    return {
      ...item,
      image: primary,
      images: images.length > 0 ? images : (primary ? [primary] : []),
    };
  });
}

// Fun facts about Bahrain, used while loading
const BAHRAIN_FACTS = [
  'Bahrain was once the heart of the ancient Dilmun civilization, a key trading hub for thousands of years.',
  'Locals love evening walks along the corniche – the skyline and sea breeze are perfect after sunset.',
  'Traditional Bahraini breakfast often includes balaleet (sweet vermicelli) and khubz (Arabic bread).',
  'Manama Souq is one of the best places to feel the old-meets-new soul of Bahrain in a single walk.',
  'Pearling was once Bahrain’s main industry – the Pearling Trail in Muharraq is now a UNESCO site.',
  'Bahrain has a vibrant cafe culture – from hidden specialty coffee spots to seaside shisha lounges.',
];

// Fun loading messages
const LOADING_PHRASES = [
  "Khalid's on it!",
  'Finding your spots…',
  'Building your map…',
  'Almost there, habibi!',
  'Stitching the perfect day…',
  'Yalla, one sec…',
  'Magic in progress ✨',
  'Curating your adventure…',
  'Scouting the best of Bahrain…',
  'One moment, greatness loading…',
];

// Reusable right-to-left marquee banner for spot previews (shuffled, as fetched)
function SpotMarqueeBanner({ items, itemWidth = 88, itemGap = 10, variant = 'modal' }) {
  const bannerScrollX = useRef(new Animated.Value(0)).current;
  const content = useMemo(() => (items || []).filter((p) => p.image || p.name), [items?.length, items?.map((p) => p.id).join(',') ?? '']);
  const bannerWidth = content.length * (itemWidth + itemGap);

  // Prefetch images so they appear faster when banner renders
  const imageUrls = useMemo(() => content.filter((p) => p.image).map((p) => p.image), [content]);
  useEffect(() => {
    imageUrls.forEach((uri) => Image.prefetch(uri).catch(() => {}));
  }, [imageUrls.join(',')]);
  // Seamless infinite scroll — never stops, instant reset when duplicate set is fully scrolled
  useEffect(() => {
    if (content.length === 0) return;
    const duration = Math.max(12000, content.length * 2200);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bannerScrollX, {
          toValue: -bannerWidth,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(bannerScrollX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [content.length, bannerWidth]);
  if (content.length === 0) return null;
  const isSheet = variant === 'sheet';
  const cardStyle = isSheet ? styles.loadingSpotPreviewItem : [styles.planModalPreviewCard, { width: itemWidth, marginRight: itemGap }];
  const imgStyle = isSheet ? styles.loadingSpotPreviewImg : styles.planModalPreviewImage;
  const nameStyle = isSheet ? styles.loadingSpotPreviewName : styles.planModalBannerName;
  const tagStyle = isSheet ? null : styles.planModalBannerTag;
  const iconStyle = isSheet ? styles.loadingSpotPreviewPlaceholder : styles.planModalPreviewIcon;
  return (
    <View style={isSheet ? styles.loadingSpotPreviews : styles.planModalBannerWrap}>
      <Animated.View style={[styles.planModalBannerRow, { transform: [{ translateX: bannerScrollX }] }]}>
        {[...content, ...content].map((p, idx) => (
          <View key={`${p.id}-${idx}`} style={[cardStyle, isSheet && { width: itemWidth, marginRight: itemGap }]}>
            {p.image ? (
              <PreviewImage uri={p.image} style={imgStyle} />
            ) : (
              <View style={iconStyle}>
                <Ionicons name={p.type === 'restaurant' ? 'restaurant' : p.type === 'event' ? 'calendar' : 'location'} size={isSheet ? 20 : 22} color={themeColors.primary} />
              </View>
            )}
            <Text style={nameStyle} numberOfLines={1}>{p.name}</Text>
            {tagStyle && <Text style={tagStyle} numberOfLines={1}>{p.typeLabel}</Text>}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// Smooth image with shimmer placeholder — avoids empty flash while loading
function PreviewImage({ uri, style }) {
  const [loaded, setLoaded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
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
    if (!loaded) loop.start();
    return () => loop.stop();
  }, [loaded, shimmerAnim]);
  if (!uri) return null;
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
        <Image source={{ uri, ...(Platform.OS === 'ios' && { cache: 'force-cache' }) }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={() => setLoaded(true)} />
      </Animated.View>
    </View>
  );
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

const buildBahrainWTC = () => {
  const group = new Group()
  const towerMat = new MeshStandardMaterial({ color: new Color('#8EC8F8'), metalness: 0.7, roughness: 0.2 })
  const glassMat = new MeshStandardMaterial({ color: new Color('#B0D8F5'), metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.85 })

  const towerGeo = new CylinderGeometry(0.22, 0.28, 2.8, 16)
  const tower1 = new Mesh(towerGeo, towerMat)
  tower1.position.set(-0.35, 1.4, 0)
  group.add(tower1)
  const tower2 = new Mesh(towerGeo, towerMat)
  tower2.position.set(0.35, 1.4, 0)
  group.add(tower2)

  const bridgeGeo = new BoxGeometry(0.9, 0.04, 0.15)
  const bridgeMat = new MeshStandardMaterial({ color: new Color('#E0E0E0'), metalness: 0.5, roughness: 0.3 })
  ;[0.8, 1.5, 2.2].forEach((y) => {
    const bridge = new Mesh(bridgeGeo, bridgeMat)
    bridge.position.set(0, y, 0)
    group.add(bridge)
  })

  const turbineGeo = new TorusGeometry(0.22, 0.015, 8, 16)
  const turbineMat = new MeshStandardMaterial({ color: new Color('#FFFFFF'), metalness: 0.4, roughness: 0.5 })
  ;[0.8, 1.5, 2.2].forEach((y) => {
    const turbine = new Mesh(turbineGeo, turbineMat)
    turbine.position.set(0, y, 0)
    turbine.rotation.y = Math.PI / 2
    group.add(turbine)
  })

  const topGeo = new ConeGeometry(0.15, 0.3, 12)
  const topMat = new MeshStandardMaterial({ color: new Color('#C0D8E8'), metalness: 0.8, roughness: 0.15 })
  const top1 = new Mesh(topGeo, topMat)
  top1.position.set(-0.35, 2.95, 0)
  group.add(top1)
  const top2 = new Mesh(topGeo, topMat)
  top2.position.set(0.35, 2.95, 0)
  group.add(top2)

  group.position.set(-2.5, 0, 0)
  return group
}

const buildAlFatehMosque = () => {
  const group = new Group()
  const wallMat = new MeshStandardMaterial({ color: new Color('#F5F0E6'), metalness: 0.1, roughness: 0.8 })
  const domeMat = new MeshStandardMaterial({ color: new Color('#F0E6D3'), metalness: 0.3, roughness: 0.5 })
  const goldMat = new MeshStandardMaterial({ color: new Color('#D4AF37'), metalness: 0.9, roughness: 0.1 })

  const base = new Mesh(new BoxGeometry(1.8, 0.7, 1.2), wallMat)
  base.position.set(0, 0.35, 0)
  group.add(base)

  const dome = new Mesh(new SphereGeometry(0.6, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2), domeMat)
  dome.position.set(0, 0.7, 0)
  group.add(dome)

  const finialGeo = new ConeGeometry(0.04, 0.2, 8)
  const finial = new Mesh(finialGeo, goldMat)
  finial.position.set(0, 1.4, 0)
  group.add(finial)

  const minaretGeo = new CylinderGeometry(0.06, 0.08, 1.8, 10)
  const minaretTopGeo = new ConeGeometry(0.08, 0.2, 10)
  ;[[-1, 0.6], [1, 0.6], [-1, -0.6], [1, -0.6]].forEach(([x, z]) => {
    const minaret = new Mesh(minaretGeo, wallMat)
    minaret.position.set(x, 0.9, z)
    group.add(minaret)
    const mTop = new Mesh(minaretTopGeo, goldMat)
    mTop.position.set(x, 1.95, z)
    group.add(mTop)
  })

  group.position.set(0, 0, -1.5)
  return group
}

const buildBahrainFort = () => {
  const group = new Group()
  const sandMat = new MeshStandardMaterial({ color: new Color('#D4A574'), metalness: 0.1, roughness: 0.9 })
  const darkSandMat = new MeshStandardMaterial({ color: new Color('#B8956A'), metalness: 0.1, roughness: 0.95 })

  const baseWall = new Mesh(new BoxGeometry(2, 0.6, 2), sandMat)
  baseWall.position.set(0, 0.3, 0)
  group.add(baseWall)

  const innerWall = new Mesh(new BoxGeometry(1.4, 0.8, 1.4), darkSandMat)
  innerWall.position.set(0, 0.7, 0)
  group.add(innerWall)

  const towerGeo = new CylinderGeometry(0.18, 0.2, 1.2, 10)
  ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => {
    const tower = new Mesh(towerGeo, sandMat)
    tower.position.set(x, 0.6, z)
    group.add(tower)
    const cap = new Mesh(new ConeGeometry(0.2, 0.15, 10), darkSandMat)
    cap.position.set(x, 1.25, z)
    group.add(cap)
  })

  const keep = new Mesh(new BoxGeometry(0.6, 0.5, 0.6), darkSandMat)
  keep.position.set(0, 1.35, 0)
  group.add(keep)

  group.position.set(2.5, 0, 0)
  return group
}

const buildPearlMonument = () => {
  const group = new Group()
  const concreteMat = new MeshStandardMaterial({ color: new Color('#E8E0D8'), metalness: 0.15, roughness: 0.7 })
  const pearlMat = new MeshStandardMaterial({ color: new Color('#F8F4F0'), metalness: 0.6, roughness: 0.2 })

  ;[0, 1, 2, 3, 4, 5].forEach((i) => {
    const angle = (i / 6) * Math.PI * 2
    const pillar = new Mesh(new CylinderGeometry(0.08, 0.1, 2, 8), concreteMat)
    pillar.position.set(Math.cos(angle) * 0.5, 1, Math.sin(angle) * 0.5)
    group.add(pillar)
  })

  const platform = new Mesh(new CylinderGeometry(0.7, 0.7, 0.1, 24), concreteMat)
  platform.position.set(0, 2.05, 0)
  group.add(platform)

  const pearl = new Mesh(new SphereGeometry(0.35, 20, 20), pearlMat)
  pearl.position.set(0, 2.5, 0)
  group.add(pearl)

  const basePlatform = new Mesh(new CylinderGeometry(0.8, 0.9, 0.2, 24), concreteMat)
  basePlatform.position.set(0, 0, 0)
  group.add(basePlatform)

  group.position.set(0, 0, 2)
  return group
}

const buildTreeOfLife = () => {
  const group = new Group()
  const trunkMat = new MeshStandardMaterial({ color: new Color('#8B6914'), metalness: 0.1, roughness: 0.95 })
  const leafMat = new MeshStandardMaterial({ color: new Color('#2D8B2D'), metalness: 0.05, roughness: 0.9 })

  const trunk = new Mesh(new CylinderGeometry(0.08, 0.15, 1.2, 8), trunkMat)
  trunk.position.set(0, 0.6, 0)
  group.add(trunk)

  const branch1 = new Mesh(new CylinderGeometry(0.03, 0.06, 0.6, 6), trunkMat)
  branch1.position.set(0.2, 1.1, 0)
  branch1.rotation.z = -0.5
  group.add(branch1)

  const branch2 = new Mesh(new CylinderGeometry(0.03, 0.06, 0.5, 6), trunkMat)
  branch2.position.set(-0.15, 1, 0.1)
  branch2.rotation.z = 0.4
  group.add(branch2)

  const canopy = new Mesh(new SphereGeometry(0.7, 12, 12), leafMat)
  canopy.position.set(0, 1.6, 0)
  canopy.scale.set(1, 0.7, 1)
  group.add(canopy)

  const canopy2 = new Mesh(new SphereGeometry(0.45, 10, 10), leafMat)
  canopy2.position.set(0.3, 1.4, 0.2)
  group.add(canopy2)

  const canopy3 = new Mesh(new SphereGeometry(0.4, 10, 10), leafMat)
  canopy3.position.set(-0.25, 1.5, -0.15)
  group.add(canopy3)

  const sandGeo = new CylinderGeometry(0.6, 0.7, 0.1, 16)
  const sandMat = new MeshStandardMaterial({ color: new Color('#D4B896'), metalness: 0, roughness: 1 })
  const sand = new Mesh(sandGeo, sandMat)
  sand.position.set(0, 0, 0)
  group.add(sand)

  group.position.set(0, 0, 0)
  return group
}

const buildGroundDisc = () => {
  const geo = new RingGeometry(0, 5, 48)
  const mat = new MeshStandardMaterial({
    color: new Color('#1A1A2E'),
    metalness: 0.3,
    roughness: 0.8,
    transparent: true,
    opacity: 0.35,
    side: DoubleSide,
  })
  const ground = new Mesh(geo, mat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  return ground
}

function BahrainScene3D({ isVisible }) {
  const glRef = useRef(null)
  const rafRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const rotGroupRef = useRef(null)
  const timeRef = useRef(0)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (isVisible) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    }
  }, [isVisible, fadeAnim])

  const handleContextCreate = useCallback((gl) => {
    const scene = new Scene()
    scene.background = null
    scene.fog = new Fog(new Color('#0F172A'), 8, 18)

    const camera = new PerspectiveCamera(45, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100)
    camera.position.set(0, 4.5, 7.5)
    camera.lookAt(0, 0.8, 0)

    const renderer = new Renderer({ gl })
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight)
    renderer.setClearColor(0x000000, 0)

    const ambient = new AmbientLight(0xffffff, 0.6)
    scene.add(ambient)

    const dirLight = new DirectionalLight(0xffe4c4, 1.2)
    dirLight.position.set(3, 8, 5)
    scene.add(dirLight)

    const accentLight = new PointLight(0xC8102E, 0.8, 15)
    accentLight.position.set(-3, 3, 3)
    scene.add(accentLight)

    const blueLight = new PointLight(0x60A5FA, 0.5, 12)
    blueLight.position.set(3, 2, -3)
    scene.add(blueLight)

    const rotGroup = new Group()
    rotGroup.add(buildBahrainWTC())
    rotGroup.add(buildAlFatehMosque())
    rotGroup.add(buildBahrainFort())
    rotGroup.add(buildPearlMonument())
    rotGroup.add(buildTreeOfLife())
    rotGroup.add(buildGroundDisc())
    scene.add(rotGroup)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    rotGroupRef.current = rotGroup
    glRef.current = gl

    const render = () => {
      rafRef.current = requestAnimationFrame(render)
      timeRef.current += 0.006

      rotGroup.rotation.y = timeRef.current
      rotGroup.children.forEach((child, i) => {
        if (i < 5) {
          child.position.y = child.position.y + Math.sin(timeRef.current * 2.5 + i * 1.3) * 0.001
        }
      })

      camera.position.y = 4.5 + Math.sin(timeRef.current * 1.5) * 0.3
      camera.lookAt(0, 0.8, 0)

      renderer.render(scene, camera)
      gl.endFrameEXP()
    }
    render()
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <Animated.View style={[styles.scene3dContainer, { opacity: fadeAnim }]}>
      <GLView
        style={styles.scene3dGl}
        onContextCreate={handleContextCreate}
        msaaSamples={4}
      />
      <LinearGradient
        colors={['transparent', 'rgba(15,23,42,0.7)', 'rgba(15,23,42,0.95)']}
        style={styles.scene3dFade}
        pointerEvents="none"
      />
    </Animated.View>
  )
}


function LoadingStepCard({ step, index, isDone, isActive, isPending }) {
  const barWidth = useRef(new Animated.Value(0)).current
  const barShimmer = useRef(new Animated.Value(0)).current
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

  useEffect(() => {
    if (isActive) {
      Animated.timing(barWidth, { toValue: 0.85, duration: 8000, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: false }).start()
      Animated.loop(Animated.sequence([
        Animated.timing(barShimmer, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(barShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])).start()
      Animated.loop(Animated.sequence([
        Animated.timing(cardGlow, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(cardGlow, { toValue: 0.3, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start()
    }
  }, [isActive, barWidth, barShimmer, cardGlow])

  useEffect(() => {
    if (isDone && !prevDone.current) {
      prevDone.current = true
      barShimmer.stopAnimation()
      cardGlow.stopAnimation()
      Animated.timing(barWidth, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
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
  }, [isDone, barWidth, checkScale, checkRotate, ringScale, ringOpacity, doneFlash])

  const shimmerX = barShimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, SCREEN_WIDTH] })
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
        <Animated.View style={[styles.lsBarFillWrap, { width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
          <LinearGradient
            colors={isDone ? [colors.done, '#34D399'] : colors.bar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.lsBarFill}
          />
        </Animated.View>
        {isActive && (
          <Animated.View style={[styles.lsBarShimmer, { transform: [{ translateX: shimmerX }] }]} pointerEvents="none" />
        )}
      </View>
    </Animated.View>
  )
}

function PlanModalLoadingView({ loadingStatus, showSuccess, spotPreviews }) {
  const fadeIn = useRef(new Animated.Value(0)).current
  const successScale = useRef(new Animated.Value(0)).current
  const successOpacity = useRef(new Animated.Value(0)).current
  const successConfetti = useRef([...Array(14)].map(() => new Animated.Value(0))).current
  const stepsOpacity = useRef(new Animated.Value(1)).current
  const stepsScale = useRef(new Animated.Value(1)).current
  const celebrationReady = useRef(false)
  const [showCelebration, setShowCelebration] = useState(false)

  const steps = [
    { icon: 'compass-outline', text: 'Discovering places', key: 'places' },
    { icon: 'restaurant-outline', text: 'Finding food spots', key: 'food' },
    { icon: 'sparkles-outline', text: 'Crafting your plan', key: 'plan' },
  ]

  const rawCompleted = (() => {
    if (showSuccess) return [0, 1, 2]
    const s = (loadingStatus || '').toLowerCase()
    if (s.includes('crafting') || s.includes('building') || s.includes('stitch')) return [0, 1]
    if (s.includes('restaurant') || s.includes('food') || s.includes('breakfast') || s.includes('event')) return [0]
    return []
  })()

  const stepDoneAt = useRef([0, 0, 0])
  const [completedSteps, setCompletedSteps] = useState([])
  const MIN_STEP_MS = 1800

  useEffect(() => {
    const now = Date.now()
    const pending = rawCompleted.filter((idx) => !completedSteps.includes(idx))
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
  }, [rawCompleted.join(','), completedSteps.join(',')])

  const [factIdx] = useState(() => Math.floor(Math.random() * BAHRAIN_FACTS.length))
  const [phraseIdx] = useState(() => Math.floor(Math.random() * LOADING_PHRASES.length))
  const fact = BAHRAIN_FACTS[factIdx]
  const funPhrase = LOADING_PHRASES[phraseIdx]

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [])

  useEffect(() => {
    if (!showSuccess || celebrationReady.current) return
    if (completedSteps.length < 3) return
    celebrationReady.current = true

    Animated.parallel([
      Animated.timing(stepsOpacity, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(stepsScale, { toValue: 0.94, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]).start(() => {
      setShowCelebration(true)
      Animated.stagger(30, [
        Animated.parallel([
          Animated.spring(successScale, { toValue: 1, tension: 100, friction: 7, useNativeDriver: true }),
          Animated.timing(successOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]),
        ...successConfetti.map((a) => Animated.spring(a, { toValue: 1, tension: 160, friction: 5, useNativeDriver: true })),
      ]).start()
    })
  }, [showSuccess, completedSteps.length, stepsOpacity, stepsScale, successScale, successOpacity, successConfetti])

  const confettiColors = ['#FF6B6B', '#FACC15', '#4ADE80', '#60A5FA', '#F472B6', '#A78BFA', '#FB923C', '#34D399', '#FF6B6B', '#FACC15', '#4ADE80', '#60A5FA', '#FACC15', '#4ADE80']
  const confettiPositions = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2
    return { x: Math.cos(angle) * (55 + Math.random() * 35), y: Math.sin(angle) * (45 + Math.random() * 30) }
  }), [])

  const isFinished = showSuccess || showCelebration
  const displayTitle = isFinished ? 'Your route is ready' : funPhrase
  const displaySub = isFinished
    ? 'Swipe up the card below for stops, maps & share'
    : (loadingStatus || 'Building your perfect day…')
  const displayBadge = isFinished ? 'READY' : 'BUILDING YOUR DAY'

  return (
    <Animated.View style={[styles.ldWrap, { opacity: fadeIn }]}>
      {!showCelebration && <BahrainScene3D isVisible />}

      <ScrollView contentContainerStyle={styles.ldScrollContent} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Title */}
        <View style={styles.ldTitleSection}>
          <View style={styles.ldBadge}>
            <View style={[styles.ldBadgeDot, isFinished && { backgroundColor: '#4ADE80' }]} />
            <Text style={styles.ldBadgeText}>{displayBadge}</Text>
          </View>
          <Text style={styles.ldTitle}>{displayTitle}</Text>
          <Text style={styles.ldSub}>{displaySub}</Text>
        </View>

        {/* Success celebration — appears after steps morph out */}
        {showCelebration && (
          <>
            <View style={styles.ldSuccessCenter}>
              {confettiPositions.map((pos, i) => (
                <Animated.View key={i} style={{
                  position: 'absolute', width: i % 3 === 0 ? 10 : 6, height: i % 2 === 0 ? 10 : 4, borderRadius: i % 2 === 0 ? 5 : 2,
                  backgroundColor: confettiColors[i],
                  transform: [
                    { translateX: successConfetti[i].interpolate({ inputRange: [0, 1], outputRange: [0, pos.x] }) },
                    { translateY: successConfetti[i].interpolate({ inputRange: [0, 1], outputRange: [0, pos.y] }) },
                    { rotate: successConfetti[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${i * 26}deg`] }) },
                  ],
                  opacity: successConfetti[i].interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0.3] }),
                }} />
              ))}
              <Animated.View style={{ transform: [{ scale: successScale }], opacity: successOpacity }}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="checkmark" size={44} color="#FFFFFF" />
                </View>
              </Animated.View>
            </View>
            <Animated.View style={{ opacity: successOpacity, width: '100%', paddingHorizontal: 8 }}>
              <View style={styles.ldSheetHintCard}>
                <Ionicons name="chevron-up" size={26} color={themeColors.primary} />
                <Text style={styles.ldSheetHintTitle}>Full itinerary is in the sheet</Text>
                <Text style={styles.ldSheetHintSub}>
                  Drag the handle up — you will see Today in Bahrain, your stops, and Maps
                </Text>
              </View>
            </Animated.View>
          </>
        )}

        {/* Step cards — morph out when done */}
        {!showCelebration && (
          <Animated.View style={[styles.lsSteps, { opacity: stepsOpacity, transform: [{ scale: stepsScale }] }]}>
            {steps.map((s, i) => {
              const isDone = completedSteps.includes(i)
              const isActive = !isDone && completedSteps.length === i
              const isPending = !isDone && !isActive
              return <LoadingStepCard key={s.key} step={s} index={i} isDone={isDone} isActive={isActive} isPending={isPending} />
            })}
          </Animated.View>
        )}

        {/* Fun fact */}
        {!showCelebration && (
          <Animated.View style={{ opacity: stepsOpacity }}>
            <View style={styles.ldFactCard}>
              <View style={styles.ldFactIcon}>
                <Ionicons name="bulb" size={16} color="#FACC15" />
              </View>
              <View style={styles.ldFactContent}>
                <Text style={styles.ldFactLabel}>Did you know?</Text>
                <Text style={styles.ldFactText}>{fact}</Text>
              </View>
            </View>
          </Animated.View>
        )}
      </ScrollView>
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

  useEffect(() => {
    if (!isCurrent) {
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
  }, [isCurrent, breatheScale, pulseRing]);

  const ringScale = pulseRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulseRing.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0.2, 0] });
  const combinedScale = Animated.multiply(scaleAnim, breatheScale);
  const showLabel = zoomScale >= 0.55;

  const pinIcon = mk.type === 'restaurant' ? 'restaurant' : mk.type === 'event' ? 'calendar' : 'location';
  const imageUrl = mk.image ? ensureImageUrl(mk.image) || mk.image : null;

  return (
    <React.Fragment>
      {showCircle && (
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
          {isCurrent && (
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

// Radial options menu surrounding a marker (Google Maps–style)
const RADIAL_ORBIT = 72;
const RADIAL_BTN = 44;
const RADIAL_OPTIONS = [
  { key: 'profile', icon: 'person-circle-outline', label: 'Profile' },
  { key: 'directions', icon: 'navigate-outline', label: 'Directions' },
  { key: 'ar', icon: 'camera-outline', label: 'AR' },
];

function RadialMarkerMenu({ visible, position, marker, onAction, onClose }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 14, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible || !position) return null;

  const { x, y } = position;
  const containerSize = (RADIAL_ORBIT + RADIAL_BTN) * 2;
  const left = x - (RADIAL_ORBIT + RADIAL_BTN);
  const top = y - (RADIAL_ORBIT + RADIAL_BTN);

  const handleAction = (key) => {
    onAction(key);
    onClose();
  };

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.radialMenuContainer,
            {
              left,
              top,
              width: containerSize,
              height: containerSize,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {RADIAL_OPTIONS.filter((opt) => {
            if (opt.key === 'profile') return !!marker?.clientId;
            if (opt.key === 'directions' || opt.key === 'ar') return marker?.lat != null && marker?.lng != null;
            return true;
          }).map((opt, i) => {
            const count = RADIAL_OPTIONS.filter((o) => {
              if (o.key === 'profile') return !!marker?.clientId;
              if (o.key === 'directions' || o.key === 'ar') return marker?.lat != null && marker?.lng != null;
              return true;
            }).length;
            const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
            const bx = RADIAL_ORBIT + RADIAL_BTN + RADIAL_ORBIT * Math.cos(angle) - RADIAL_BTN / 2;
            const by = RADIAL_ORBIT + RADIAL_BTN + RADIAL_ORBIT * Math.sin(angle) - RADIAL_BTN / 2;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.radialMenuBtn, { left: bx, top: by }]}
                onPress={() => handleAction(opt.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={opt.icon} size={22} color="#FFF" />
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
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

function buildMapMarkers(plan) {
  if (!plan) return [];
  return plan.map((item, idx) => {
    const fixed = parsePlanItemCoords(item);
    if (!fixed) return null;
    const { lat, lng } = fixed;
    const rawImg = item.image || (item.client_image ? parseStorageImageUrl(item.client_image) : null);
    const image = rawImg ? (ensureImageUrl(rawImg) || rawImg) : null;
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
  const { preferences } = useUserPreferences();
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
  const [spotPreviews, setSpotPreviews] = useState([]);
  const [profileClientId, setProfileClientId] = useState(null);
  const [stopDetailPayload, setStopDetailPayload] = useState(null);
  const [openingMaps, setOpeningMaps] = useState(false);
  const [shareCopyHint, setShareCopyHint] = useState(false);
  const shareCopyHintTimerRef = useRef(null);
  const [allPlaceMarkers, setAllPlaceMarkers] = useState([]);
  const [mapRegion, setMapRegion] = useState(BAHRAIN_REGION);
  const [radialMenuPosition, setRadialMenuPosition] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchModalClients, setSearchModalClients] = useState({ restaurants: [], places: [], events: [] });
  const [searchModalLoading, setSearchModalLoading] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');

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

  const spinAnim = useRef(new Animated.Value(0)).current;

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
          const rawImg = c.client_image ? parseStorageImageUrl(c.client_image) : null;
          const image = rawImg ? (ensureImageUrl(rawImg) || rawImg) : null;
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
    if (cached.prefsKey === key && cached.places && cached.breakfastSpots && cached.events) {
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
        const [places, breakfastSpots, events] = await Promise.all([
          fetchPlaces(prefLabels),
          fetchBreakfastSpots(),
          fetchEvents(prefLabels),
        ]);
        prefetchRef.current = {
          prefsKey: key,
          places,
          breakfastSpots,
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
          setLoadingStatus(`Finding places and restaurants for your ${theme.label.toLowerCase()} day…`);
          setDrawerStep(3);

          fetchSpotPreviewsFromSupabase().then((p) => setSpotPreviews(p));

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

              setLoadingStatus(`Khalid is building your ${theme.label} day…`);
              const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels);
              generatedPlan = plan;
              const enriched = await enrichPlanWithClientData(plan, allMatches);
              setDayPlan(enriched);
              setError(null);

              const validMarkers = buildMapMarkers(plan).filter(m => m.lat && m.lng);
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
      enrichPlanWithClientData(generatedPlan, allM).then((e) => setDayPlan(e));
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
    setLoadingStatus('Finding places and restaurants based on your preferences…');
    setError(null);
    setDayPlan(null);
    setPineconeMatches([]);
    setSelectedMarker(null);
    setDrawerStep(3);

    // Fetch "Places we're considering" directly from Supabase — no Pinecone wait, random order
    fetchSpotPreviewsFromSupabase().then((p) => setSpotPreviews(p));

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
        cached.places &&
        cached.breakfastSpots &&
        cached.events;

      if (hasCached) {
        places = cached.places;
        breakfastSpots = cached.breakfastSpots;
        events = cached.events;
        [restaurants] = await Promise.all([
          fetchRestaurants(foodLabels),
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
      setLoadingStatus('Khalid is crafting your perfect day…');
      const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels);
      generatedPlan = plan;
      const enriched = await enrichPlanWithClientData(plan, allMatches);
      setDayPlan(enriched);
      setError(null);

      // Debug markers
      const markers = buildMapMarkers(plan || []);
      console.log(`Map markers: ${markers.length}/${plan.length} spots have coordinates`);

      // Fit map to show all markers
      const validMarkers = buildMapMarkers(plan).filter(m => m.lat && m.lng);
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
      enrichPlanWithClientData(generatedPlan, allM).then((e) => setDayPlan(e));
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
    const markers = buildMapMarkers(dayPlan);
    if (markers.length === 0) {
      setRevealingPins(false);
      sheetOpacity.setValue(1);
      lastSnap.current = SNAP_POINTS[0];
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
  }, [revealingPins, dayPlan]);

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

  // When marker selected, get screen position for radial menu (re-run when region changes)
  useEffect(() => {
    if (!selectedMarker || !mapRef.current) {
      setRadialMenuPosition(null);
      return;
    }
    mapRef.current.pointForCoordinate({ latitude: selectedMarker.lat, longitude: selectedMarker.lng })
      .then((p) => setRadialMenuPosition(p))
      .catch(() => setRadialMenuPosition(null));
  }, [selectedMarker?.lat, selectedMarker?.lng, mapRegion?.latitudeDelta]);

  const closeRadialMenu = () => {
    setSelectedMarker(null);
    setRadialMenuPosition(null);
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
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 0.85,
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
          const markers = buildMapMarkers(dayPlan);
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

      {/* Search button — top right */}
      <View style={[styles.topBarWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.searchButton}
          activeOpacity={0.8}
          onPress={() => setShowSearchModal(true)}
        >
          <Ionicons name="search" size={22} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      {/* Scanning overlay during Hang tight removed (no radar effect) */}
      <MapScanningOverlay visible={false} />

      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: 80 + getAppTabBarHeight(insets),
            opacity: sheetOpacity,
            transform: [{ translateY: sheetAnim }],
          },
        ]}
      >
        <View
          style={styles.grabberWrap}
          {...panResponder.panHandlers}
          accessibilityRole="button"
          accessibilityLabel="Drag up to expand your plan"
        >
          <View style={styles.grabber} />
        </View>

        {/* Step 0 — Past Plans (modern hero layout) */}
        {drawerStep === 0 && (
          <View style={styles.pastPlansStepWrap}>
            <ScrollView style={styles.pastPlansScroll} contentContainerStyle={styles.d0ScrollContent} showsVerticalScrollIndicator={false}>
              {/* Build CTA */}
              <AiStagger delay={0}>
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

              {/* Quick feature pills */}
              <AiStagger delay={80}>
                <View style={styles.d0FeatureRow}>
                  {[
                    { icon: 'location', label: 'Top spots', color: '#EF4444' },
                    { icon: 'restaurant', label: 'Food picks', color: '#F59E0B' },
                    { icon: 'time', label: 'Timed plan', color: '#3B82F6' },
                  ].map((f, i) => (
                    <View key={f.label} style={styles.d0FeaturePill}>
                      <View style={[styles.d0FeaturePillIcon, { backgroundColor: `${f.color}15` }]}>
                        <Ionicons name={f.icon} size={16} color={f.color} />
                      </View>
                      <Text style={styles.d0FeaturePillText}>{f.label}</Text>
                    </View>
                  ))}
                </View>
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
              <View style={styles.planMastheadRoot}>
                <View style={styles.planMastheadTopRow}>
                  <TouchableOpacity
                    style={styles.backButton}
                    activeOpacity={0.8}
                    onPress={() => { setDrawerStep(0); setDayPlan(null); setError(null); }}
                    accessibilityRole="button"
                    accessibilityLabel="Back to plans"
                  >
                    <Ionicons name="chevron-back" size={20} color="#374151" />
                  </TouchableOpacity>
                  <View style={styles.planMastheadTitleCol}>
                    <Text style={styles.planMastheadKicker}>Khalid · AI</Text>
                    <Text style={styles.planMastheadHeadline} accessibilityRole="header">
                      <Text style={styles.planMastheadHeadlineLead}>Your day</Text>
                      <Text style={styles.planMastheadHeadlineTrail}> in Bahrain</Text>
                    </Text>
                  </View>
                </View>
                <View style={styles.planMastheadStatsRow}>
                  <Text style={styles.iv2StatsEm}>{dayPlan.length}</Text>
                  <Text style={styles.iv2StatsWord}>stops</Text>
                  <Text style={styles.iv2StatsSep}>·</Text>
                  <Text style={styles.iv2StatsEm}>{dayPlan.filter((i) => i.type === 'restaurant').length}</Text>
                  <Text style={styles.iv2StatsWord}>meals</Text>
                  <Text style={styles.iv2StatsSep}>·</Text>
                  <Text style={styles.iv2StatsEm}>1</Text>
                  <Text style={styles.iv2StatsWord}>day</Text>
                </View>
                <Text style={styles.planMastheadHint}>Tap a stop for details, photos & directions</Text>
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
              </View>
            )}

            {loading ? (
              <Reanimated.View
                style={[styles.planContentFill, styles.loadingWrap]}
                entering={FadeInDown.duration(400).springify().damping(17).stiffness(200).mass(0.85)}
              >
                <View style={styles.loadingBumpCard}>
                  <LinearGradient colors={['#FFF0F2', '#FFF8F9', '#FFFFFF']} style={StyleSheet.absoluteFill} />
                  <View style={styles.loadingBumpIllustration}>
                    <LinearGradient
                      colors={[`${themeColors.primary}20`, `${themeColors.primary}08`]}
                      style={styles.loadingBumpIllustrationBg}
                    >
                      <Ionicons name="airplane" size={28} color={themeColors.primary} />
                    </LinearGradient>
                    <View style={styles.loadingBumpIllustrationTrail}>
                      {[0, 1, 2].map((i) => (
                        <View key={i} style={[styles.loadingBumpTrailDot, { opacity: 0.3 + i * 0.2, width: 4 + i * 2 }]} />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.loadingBumpTitle}>{loadingStatus || "Khalid's building your day…"}</Text>
                  <Text style={styles.loadingBumpSub}>Hang tight, habibi — almost there!</Text>
                  {spotPreviews.length > 0 && (
                    <SpotMarqueeBanner items={spotPreviews} itemWidth={64} itemGap={10} variant="sheet" />
                  )}
                  <View style={styles.loadingProgressBar}>
                    <LinearGradient
                      colors={[themeColors.primary, '#E63950']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.loadingProgressFill, (() => {
                        const s = (loadingStatus || '').toLowerCase()
                        if (s.includes('crafting') || s.includes('stitch')) return { width: '100%' }
                        if (s.includes('food') || s.includes('restaurant')) return { width: '66%' }
                        return { width: '33%' }
                      })()]}
                    />
                  </View>
                  <View style={styles.loadingBumpSteps}>
                    {[
                      { text: 'Finding spots', icon: 'compass-outline' },
                      { text: 'Picking food', icon: 'restaurant-outline' },
                      { text: 'Stitching plan', icon: 'sparkles-outline' },
                    ].map((step, i) => {
                      const s = (loadingStatus || '').toLowerCase()
                      const isDone = (i === 0 && (s.includes('food') || s.includes('restaurant') || s.includes('crafting') || s.includes('stitch'))) || (i === 1 && (s.includes('crafting') || s.includes('stitch')))
                      return (
                        <AiStagger key={step.text} delay={100 + i * 90} style={styles.loadingBumpStep}>
                          <View style={[styles.loadingBumpDot, isDone && styles.loadingBumpDotDone]}>
                            {isDone ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : <Ionicons name={step.icon} size={14} color={themeColors.primary} />}
                          </View>
                          <Text style={[styles.loadingBumpStepText, isDone && styles.loadingBumpStepTextDone]}>{step.text}</Text>
                        </AiStagger>
                      )
                    })}
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
              <Reanimated.View
                style={styles.planContentFill}
                entering={FadeInDown.duration(380).springify().damping(18).stiffness(200)}
              >
              <ScrollView
                style={styles.resultsScroll}
                contentContainerStyle={styles.resultsContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                bounces
              >

                {/* ═══ Itinerary — masthead lives in fixed sheet header above ═══ */}
                {(() => {
                  const sections = {
                    Morning:   { color: colors.morning, icon: 'sunny-outline', label: 'Morning' },
                    Afternoon: { color: colors.afternoon, icon: 'partly-sunny-outline', label: 'Afternoon' },
                    Evening:   { color: colors.evening, icon: 'moon-outline', label: 'Evening' },
                  };
                  const order = ['Morning', 'Afternoon', 'Evening'];
                  const grouped = {};
                  dayPlan.forEach((item) => { if (!grouped[item.time]) grouped[item.time] = []; grouped[item.time].push(item); });
                  let stopNum = 0;

                  return order.filter(t => grouped[t]).map((time, secIdx) => {
                    const sec = sections[time];
                    const items = grouped[time];
                    let base = stopNum
                    const withStops = items.map((item) => {
                      base += 1
                      return { item, thisStopNum: base }
                    })
                    stopNum = base

                    return (
                      <AiStagger key={time} delay={100 + secIdx * 105} style={styles.bumpItinSection}>
                        <View style={styles.iv2SectionHeadGrid}>
                          <View style={[styles.iv2SectionIconSq, { backgroundColor: sec.color }]}>
                            <Ionicons name={sec.icon} size={16} color="#FFFFFF" />
                          </View>
                          <View style={styles.iv2SectionHeadGridText}>
                            <Text style={styles.iv2SectionGridTitle}>{sec.label}</Text>
                            <Text style={styles.iv2SectionGridMeta}>
                              {items.length} {items.length === 1 ? 'stop' : 'stops'}
                            </Text>
                          </View>
                        </View>
                        {(() => {
                          const useSlider = items.length > 2;
                          const tileW = useSlider ? ITIN_SLIDER_TILE : ITIN_GRID_TILE;
                          const snapInterval = tileW + ITIN_GRID_GAP;
                          const emptyIconSize = useSlider ? 26 : 28;
                          const renderTile = ({ item, thisStopNum }) => {
                            const isExpanded = stopDetailPayload?.thisStopNum === thisStopNum;
                            const isEat = item.type === 'restaurant';
                            const isEvent = item.type === 'event';
                            const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : sec.color;
                            const hasImage = !!(item.image);
                            const hasImages = (item.images && item.images.length > 0) || hasImage;
                            const images = (item.images && item.images.length > 0) ? item.images : (item.image ? [item.image] : []);
                            const hasProfile = !!(item.clientId);
                            return (
                              <TouchableOpacity
                                key={`stop-${thisStopNum}`}
                                style={[styles.iv2GridTile, { width: tileW }]}
                                activeOpacity={0.88}
                                onPress={() => {
                                  if (stopDetailPayload?.thisStopNum === thisStopNum) {
                                    setStopDetailPayload(null);
                                    return;
                                  }
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                  setStopDetailPayload({
                                    item,
                                    thisStopNum,
                                    accent,
                                    isEat,
                                    isEvent,
                                    hasImages,
                                    images,
                                    hasProfile,
                                  });
                                  const markers = buildMapMarkers(dayPlan);
                                  const mk = markers[thisStopNum - 1];
                                  if (mk) setSelectedMarker(mk);
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ expanded: isExpanded }}
                                accessibilityLabel={`${item.spot}, stop ${thisStopNum}`}
                              >
                                <View style={styles.iv2GridTileInner}>
                                  {hasImages ? (
                                    <PreviewImage uri={images[0] || item.image} style={styles.iv2GridTileImg} />
                                  ) : (
                                    <View style={[styles.iv2GridTileImg, styles.iv2GridTileImgEmpty, { backgroundColor: `${accent}28` }]}>
                                      <Ionicons name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'} size={emptyIconSize} color={accent} />
                                    </View>
                                  )}
                                  <LinearGradient
                                    colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.82)']}
                                    locations={[0, 0.45, 1]}
                                    style={StyleSheet.absoluteFill}
                                    pointerEvents="none"
                                  />
                                  <View style={styles.iv2GridTileTopRow}>
                                    <View style={[styles.iv2GridTileNumBadge, { backgroundColor: accent }]}>
                                      <Text style={styles.iv2GridTileNumBadgeText}>{thisStopNum}</Text>
                                    </View>
                                    {item.rating != null && (
                                      <View style={styles.iv2GridTileRating}>
                                        <Ionicons name="star" size={10} color="#F59E0B" />
                                        <Text style={styles.iv2GridTileRatingText}>{Number(item.rating).toFixed(1)}</Text>
                                      </View>
                                    )}
                                  </View>
                                  <View style={styles.iv2GridTileBottom}>
                                    <Text style={styles.iv2GridTileSpot} numberOfLines={2}>{item.spot}</Text>
                                  </View>
                                  <View style={styles.iv2GridTileExpandHint}>
                                    <Ionicons name={isExpanded ? 'chevron-up' : 'expand-outline'} size={16} color="rgba(255,255,255,0.85)" />
                                  </View>
                                </View>
                              </TouchableOpacity>
                            );
                          };
                          if (useSlider) {
                            return (
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                decelerationRate="fast"
                                snapToInterval={snapInterval}
                                snapToAlignment="start"
                                disableIntervalMomentum
                                nestedScrollEnabled
                                directionalLockEnabled
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={styles.iv2SliderContent}
                              >
                                {withStops.map((w) => renderTile(w))}
                              </ScrollView>
                            );
                          }
                          return (
                            <View style={styles.iv2Grid}>
                              {withStops.map((w) => renderTile(w))}
                            </View>
                          );
                        })()}
                      </AiStagger>
                    );
                  });
                })()}

                {/* ═══ Footer — friendly close ═══ */}
                <AiStagger delay={320}>
                  <View style={styles.iv2Footer}>
                    <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
                    <Text style={styles.iv2FooterText}>
                      Tap a stop for details · Swipe time rows with 3+ places · Pinch the map to explore
                    </Text>
                  </View>
                </AiStagger>
              </ScrollView>
              </Reanimated.View>
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

      {/* Radial options menu when marker tapped — above sheet so it's visible */}
      <RadialMarkerMenu
        visible={!!selectedMarker}
        position={radialMenuPosition}
        marker={selectedMarker}
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
                          const rawImg = client.client_image ? parseStorageImageUrl(client.client_image) : null;
                          const imageUrl = rawImg ? (ensureImageUrl(rawImg) || rawImg) : null;
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

const TILE_WIDTH = (SCREEN_WIDTH - 48 - 24) / 3;

const ITIN_GRID_GAP = 10
const ITIN_CONTENT_GUTTER = 32
const ITIN_GRID_TILE = Math.floor(((SCREEN_WIDTH - ITIN_CONTENT_GUTTER - ITIN_GRID_GAP) / 2) * 0.88)
const ITIN_SLIDER_TILE = Math.floor((SCREEN_WIDTH - ITIN_CONTENT_GUTTER) * 0.38)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 100,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  searchModalRoot: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchModalHeadingWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    alignItems: 'center',
  },
  searchModalHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  searchModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  searchModalSearchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  searchModalSearchIcon: {
    marginRight: 10,
  },
  searchModalSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A',
    paddingVertical: 0,
    minHeight: 22,
  },
  searchModalSearchClear: {
    padding: 2,
    marginLeft: 4,
  },
  searchModalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    flexShrink: 0,
  },
  searchModalLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  searchModalLoadingText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  searchModalScroll: { flex: 1 },
  searchModalContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8,
  },
  searchModalSection: {
    marginBottom: 24,
  },
  searchModalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchModalSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchModalSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  searchModalEmpty: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  searchModalHorizontalContent: {
    flexDirection: 'row',
    gap: 14,
    paddingRight: 16,
  },
  searchModalClientCard: {
    alignItems: 'center',
    width: 76,
  },
  searchModalClientCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFC',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  searchModalClientImage: {
    width: '100%',
    height: '100%',
  },
  searchModalClientName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 76,
    lineHeight: 14,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 20 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1' },

  // Past plans (step 0) — compact, Bump-style
  pastPlansStepWrap: { flex: 1, minHeight: 0 },
  pastPlansScroll: { flex: 1, minHeight: 0 },
  d0ScrollContent: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 },
  d0CtaRow: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 14 },
      android: { elevation: 7 },
    }),
  },
  d0CtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  d0CtaLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    marginRight: 14,
  },
  d0CtaLogo: {
    width: 40,
    height: 40,
  },
  d0CtaLeft: { flex: 1 },
  d0CtaTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  d0CtaSub: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },
  d0CtaArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  d0FeatureRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  d0FeaturePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(206,17,38,0.12)',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  d0FeaturePillIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  d0FeaturePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  d0SectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  d0SectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  d0SectionCount: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  d0SectionCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  d0PlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  d0PlanIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: `${themeColors.primary}10`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  d0PlanInfo: { flex: 1 },
  d0PlanName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  d0PlanMeta: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  d0ShareRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  d0ShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  d0ShareBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  d0CopyHint: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: themeColors.primary,
    marginTop: 8,
  },

  // Drawer page header — three-column row so center title is truly centered
  drawerPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    marginBottom: 8,
    minHeight: 48,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  drawerPageHeaderCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  drawerPageHeaderSpacer: { width: 40, height: 40 },
  drawerPageHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  drawerPageHeaderMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    letterSpacing: 0.15,
  },

  // Grid tiles for preferences + food
  gridScroll: { flex: 1 },
  gridContent: { paddingHorizontal: 24, paddingBottom: 48 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  gridTile: {
    width: TILE_WIDTH, aspectRatio: 1, borderRadius: 14, borderWidth: 2,
    borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  gridTileIcon: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  gridTileLabel: { fontSize: 12, fontWeight: '600', color: '#334155', textAlign: 'center' },

  fixedButtonWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
  },

  continueButton: {
    backgroundColor: themeColors.primary, paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
    ...Platform.select({ ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  continueButtonDisabled: { backgroundColor: '#E2E8F0' },
  continueButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Generate button (food)
  generateButton: {
    flexDirection: 'row', backgroundColor: themeColors.primary, paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 8,
    ...Platform.select({ ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  generateButtonDisabled: { opacity: 0.8 },
  generateButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // ── Results (step 3) — tinted canvas so new layout is obvious vs plain white ──
  resultsScroll: {
    flex: 1,
    backgroundColor: '#F3EBED',
  },
  resultsContent: {
    flexGrow: 1,
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 0,
    backgroundColor: '#F3EBED',
  },

  // Loading (sheet fallback) — Bump-style fun
  loadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40,
  },
  loadingBumpCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.1)',
    ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24 }, android: { elevation: 8 } }),
  },
  loadingBumpIllustration: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingBumpIllustrationBg: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBumpIllustrationTrail: {
    flexDirection: 'row',
    gap: 3,
    marginLeft: 6,
  },
  loadingBumpTrailDot: {
    height: 4,
    borderRadius: 2,
    backgroundColor: themeColors.primary,
  },
  loadingSpotPreviews: { maxHeight: 76, marginBottom: 14, overflow: 'hidden', width: '100%' },
  loadingSpotPreviewsContent: { paddingHorizontal: 4, gap: 10 },
  loadingSpotPreviewItem: { width: 64, alignItems: 'center' },
  loadingSpotPreviewImg: { width: 52, height: 52, borderRadius: 10 },
  loadingSpotPreviewPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: themeColors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingSpotPreviewName: { fontSize: 10, fontWeight: '600', color: '#64748B', marginTop: 4, textAlign: 'center' },
  loadingProgressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(200,16,46,0.12)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  loadingProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: themeColors.primary,
  },
  loadingBumpTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  loadingBumpSub: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 18,
  },
  loadingBumpSteps: { gap: 10, width: '100%', paddingHorizontal: 4 },
  loadingBumpStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingBumpDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(200,16,46,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBumpDotDone: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  loadingBumpStepText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  loadingBumpStepTextDone: { color: '#0F172A', fontWeight: '700' },
  loadingPulse: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: themeColors.primaryMuted,
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
    borderWidth: 2, borderColor: themeColors.primaryMuted,
  },
  loadingTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 8, letterSpacing: -0.4 },
  loadingSubtext: { fontSize: 16, color: '#475569', textAlign: 'center', marginBottom: 36, fontWeight: '600' },
  loadingSteps: { gap: 18, width: '100%', paddingHorizontal: 12 },
  loadingStepRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  loadingDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  loadingStepText: { fontSize: 16, color: '#334155', fontWeight: '600' },

  // Error
  errorWrap: { paddingHorizontal: 24, flex: 1, justifyContent: 'center' },
  errorCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.15)',
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(220,38,38,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: { fontSize: 18, fontWeight: '800', color: '#991B1B', marginBottom: 8 },
  errorText: { fontSize: 15, color: '#B91C1C', fontWeight: '600', lineHeight: 22, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: themeColors.primary,
    backgroundColor: themeColors.primaryMuted,
  },
  retryButtonText: { fontSize: 16, fontWeight: '700', color: themeColors.primary },
  emptyResults: { fontSize: 15, color: '#64748B', textAlign: 'center', paddingVertical: 32, fontWeight: '500' },

  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: themeColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#10B981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  planStep3Body: {
    flex: 1,
    minHeight: 0,
  },
  planContentFill: {
    flex: 1,
    minHeight: 0,
  },
  planMastheadRoot: {
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  planMastheadTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  planMastheadTitleCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    justifyContent: 'center',
  },
  planMastheadKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  planMastheadHeadline: {
    marginTop: 2,
  },
  planMastheadHeadlineLead: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  planMastheadHeadlineTrail: {
    fontSize: 17,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: -0.35,
  },
  planMastheadStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    marginTop: 8,
    gap: 5,
  },
  planMastheadHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 15,
  },
  planMastheadActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 8,
  },
  iv2Eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  iv2Headline: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.65,
    lineHeight: 28,
  },
  iv2HeadlineLead: {
    color: '#0f172a',
    fontWeight: '900',
    letterSpacing: -0.65,
    fontSize: 24,
  },
  iv2HeadlineTrail: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 22,
    letterSpacing: -0.45,
  },
  iv2StatsLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    marginTop: 10,
    gap: 5,
  },
  iv2StatsEm: {
    fontSize: 17,
    fontWeight: '900',
    color: themeColors.primary,
    letterSpacing: -0.4,
  },
  iv2StatsWord: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 2,
  },
  iv2StatsSep: {
    fontSize: 14,
    fontWeight: '500',
    color: '#cbd5e1',
    marginHorizontal: 2,
  },
  iv2Hint: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    lineHeight: 15,
  },
  iv2ActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 12,
  },
  iv2MapOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: themeColors.primary,
    backgroundColor: '#FFFFFF',
  },
  iv2MapOutlineText: {
    fontSize: 15,
    fontWeight: '800',
    color: themeColors.primary,
    letterSpacing: 0.2,
  },
  iv2Seg: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  iv2SegBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iv2SegDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#e2e8f0',
  },
  iv2CopyToast: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '800',
    color: themeColors.primary,
    letterSpacing: 0.3,
  },

  iv2SectionHeadGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    marginTop: 0,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  iv2SectionIconSq: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  iv2SectionHeadGridText: {
    flex: 1,
    minWidth: 0,
  },
  iv2SectionGridTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.25,
  },
  iv2SectionGridMeta: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 0.1,
  },

  iv2Grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ITIN_GRID_GAP,
  },
  iv2SliderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ITIN_GRID_GAP,
    paddingRight: 24,
  },
  iv2GridTile: {
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  iv2GridTileInner: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  iv2GridTileImg: {
    ...StyleSheet.absoluteFillObject,
  },
  iv2GridTileImgEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iv2GridTileTopRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  iv2GridTileNumBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iv2GridTileNumBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  iv2GridTileRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  iv2GridTileRatingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0f172a',
  },
  iv2GridTileBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 28,
    zIndex: 2,
  },
  iv2GridTileSpot: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iv2GridTileExpandHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    zIndex: 3,
  },

  stopDialogKb: {
    flex: 1,
  },
  stopDialogRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  stopDialogDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.58)',
  },
  stopDialogCard: {
    maxHeight: SCREEN_HEIGHT * 0.94,
    zIndex: 2,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.28, shadowRadius: 32 },
      android: { elevation: 18 },
    }),
  },
  stopDialogHero: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#0f172a',
  },
  stopDialogBodyScroll: {
    maxHeight: SCREEN_HEIGHT * 0.52,
  },
  stopDialogScrollContent: {
    paddingBottom: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  stopDialogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  stopDialogHeaderMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minWidth: 0,
  },
  stopDialogNumBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopDialogNumText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  stopDialogTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  stopDialogSpotTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.45,
    lineHeight: 27,
  },
  stopDialogRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  stopDialogRatingText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  stopDialogClose: {
    marginTop: -4,
    marginRight: -4,
    padding: 4,
  },
  stopDialogSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  stopDialogDescBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  stopDialogDescText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 24,
  },
  stopDialogActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  stopDialogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    minHeight: 48,
  },
  stopDialogBtnPrimary: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
    backgroundColor: themeColors.primary,
    ...Platform.select({
      ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  stopDialogBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stopDialogBtnGhost: {
    borderWidth: 1.5,
    borderColor: 'rgba(200,16,46,0.35)',
    backgroundColor: 'rgba(200,16,46,0.06)',
  },
  stopDialogBtnGhostText: {
    fontSize: 14,
    fontWeight: '800',
    color: themeColors.primary,
  },

  iv2Footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  iv2FooterText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    lineHeight: 16,
    letterSpacing: 0.15,
  },

  // ── Boarding pass hero (legacy) ──
  boardingPass: {
    backgroundColor: '#FFFFFF', borderRadius: 24, marginBottom: 28, overflow: 'hidden',
    borderWidth: 0,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8,
  },
  bpTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 28, paddingTop: 26, paddingBottom: 22,
  },
  bpLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1.6 },
  bpValue: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginTop: 6, letterSpacing: -0.5 },
  bpDivider: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(200,16,46,0.15)',
    backgroundColor: 'rgba(200,16,46,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  bpDashedLine: {
    height: 1, marginHorizontal: 24,
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 1,
  },
  bpBottom: {
    paddingHorizontal: 28, paddingVertical: 22,
  },
  bpBudgetWrap: { alignItems: 'center' },
  bpBudgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  bpBudgetTitle: { fontSize: 12, fontWeight: '800', color: '#475569', letterSpacing: 1.2, textTransform: 'uppercase' },
  bpBudgetAmount: { fontSize: 30, fontWeight: '900', color: themeColors.primary, letterSpacing: 0.5 },
  bpBudgetSub: { fontSize: 14, color: '#64748B', marginTop: 6, fontWeight: '600' },
  bpAdviceWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FDE68A',
    paddingHorizontal: 26, paddingVertical: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  bpAdviceText: { fontSize: 15, color: '#92400E', lineHeight: 22, flex: 1, fontStyle: 'italic', fontWeight: '600' },

  // ── Itinerary list (flat rows + iv2 masthead / sections) ──
  bumpItinSection: { marginBottom: 14 },
  bumpItinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  bumpItinNumCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bumpItinNumText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  bumpItinThumbWrap: {
    position: 'relative',
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginRight: 0,
  },
  bumpItinThumb: {
    width: '100%',
    height: '100%',
  },
  bumpItinThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumpItinRatingPill: {
    position: 'absolute',
    bottom: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bumpItinRatingPillText: { fontSize: 9, fontWeight: '800', color: '#0F172A' },
  bumpItinSummary: { flex: 1, minWidth: 0 },
  bumpItinName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 3, letterSpacing: -0.2 },
  bumpItinReason: { fontSize: 12, color: '#64748B', lineHeight: 16 },
  bumpItinActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  bumpItinActionIcon: { padding: 2 },
  bumpItinChevron: { marginLeft: 4 },
  bumpItinExpanded: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
  },
  bumpItinExpandedImageWrap: {
    width: '100%',
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  bumpItinExpandedScroll: { width: '100%', height: 100 },
  bumpItinExpandedScrollContent: { flexGrow: 1 },
  bumpItinExpandedSlide: {
    width: SCREEN_WIDTH - 32,
    height: 100,
    position: 'relative',
  },
  bumpItinExpandedPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumpItinExpandedReason: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 10,
  },
  bumpItinExpandedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bumpItinExpandedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  bumpItinExpandedBtnPrimary: {
    backgroundColor: themeColors.primary,
  },
  bumpItinExpandedBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  bumpItinExpandedBtnSecondary: {
    backgroundColor: 'rgba(200,16,46,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.2)',
  },
  bumpItinExpandedBtnSecondaryText: { fontSize: 13, fontWeight: '600', color: themeColors.primary },

  // ── Itinerary section (legacy) ──
  itinSection: { marginBottom: 16 },

  secBanner: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingVertical: 16,
    paddingHorizontal: 20, marginBottom: 16,
  },
  secIconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  secBannerText: { flex: 1, marginLeft: 16 },
  secBannerTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  secBannerSub: { fontSize: 14, fontWeight: '600', opacity: 0.85, marginTop: 2 },
  secBannerCount: { fontSize: 14, fontWeight: '700' },

  // ── Destination row (number + card) ──
  destRow: { flexDirection: 'row', paddingLeft: 6 },

  destLeft: { width: 40, alignItems: 'center', paddingTop: 18 },
  destNumCircle: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  destNum: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  destConnector: { flex: 1, width: 2, borderRadius: 1, marginTop: 8 },

  // Card
  destCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 22, marginLeft: 16, marginBottom: 16,
    overflow: 'hidden', borderWidth: 0,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6,
  },
  destStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  destStripText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  destBody: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  destIconBox: {
    width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  destName: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0F172A', lineHeight: 24 },
  destReasonWrap: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 18, marginTop: 8,
    backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, gap: 12,
  },
  destReasonQuote: { marginTop: 2 },
  destReasonText: { flex: 1, fontSize: 15, color: '#78350F', lineHeight: 22, fontStyle: 'italic', fontWeight: '600' },
  destARBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(200,16,46,0.08)',
    borderRadius: 12,
  },
  destARBtnText: { fontSize: 14, fontWeight: '700', color: themeColors.primary },

  // ── Passport stamp footer (legacy) ──
  stampFooter: { alignItems: 'center', marginTop: 28, paddingBottom: 12 },
  stampCircle: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: themeColors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderStyle: 'dashed',
  },
  stampTop: { fontSize: 10, fontWeight: '800', color: themeColors.primary, letterSpacing: 2 },
  stampBottom: { fontSize: 9, fontWeight: '700', color: themeColors.primary, letterSpacing: 1.5, marginTop: 2 },
  stampTagline: { fontSize: 16, fontWeight: '600', color: '#475569', fontStyle: 'italic' },

  // ── Map pins (legacy, kept for reference) ──
  mapPinWrap: { alignItems: 'center' },
  mapPinRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapPin: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
  },
  mapPinNum: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  mapPinLabel: {
    maxWidth: 120, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  mapPinLabelText: { fontSize: 12, fontWeight: '700' },
  mapPinArrow: {
    alignSelf: 'center', width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // ── Animated place markers (profile image + entrance animation) ──
  animatedMarkerWrap: {
    alignItems: 'center',
  },
  animatedMarkerPulseRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    top: 2,
  },
  animatedMarkerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  animatedMarkerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  animatedMarkerIconBg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  animatedMarkerBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  animatedMarkerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  animatedMarkerLabel: {
    marginTop: 6,
    maxWidth: 110,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  animatedMarkerLabelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  animatedMarkerArrow: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    marginTop: 2,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // ── Radial marker menu (options surrounding pin) ──
  radialMenuContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialMenuBtn: {
    position: 'absolute',
    width: RADIAL_BTN,
    height: RADIAL_BTN,
    borderRadius: RADIAL_BTN / 2,
    backgroundColor: themeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // ── Map scanning overlay (Hang tight) — route tracing + radar ──
  mapScanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  mapScanningRadarCenter: {
    position: 'absolute',
    left: SCREEN_WIDTH / 2 - 100,
    top: SCREEN_HEIGHT / 2 - 100,
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapScanningRadarRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(200,16,46,0.6)',
    backgroundColor: 'rgba(200,16,46,0.06)',
  },
  mapScanningLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(200,16,46,0.55)',
    shadowColor: themeColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  mapRoutePath: {
    ...StyleSheet.absoluteFillObject,
  },
  mapRouteSegWrap: {
    position: 'absolute',
    left: 30,
    top: 70,
    width: SCREEN_WIDTH - 90,
    height: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap2: {
    position: 'absolute',
    right: 50,
    top: 70,
    width: 4,
    height: 130,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap3: {
    position: 'absolute',
    left: 40,
    top: 195,
    width: SCREEN_WIDTH - 90,
    height: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap4: {
    position: 'absolute',
    left: 40,
    top: 195,
    width: 4,
    height: 130,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap5: {
    position: 'absolute',
    left: 30,
    top: 320,
    width: SCREEN_WIDTH - 80,
    height: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSeg: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(200,16,46,0.7)',
  },
  mapRouteSeg1: { width: SCREEN_WIDTH - 90, height: 4, borderRadius: 2 },
  mapRouteSeg2: { width: 4, height: 130, borderRadius: 2 },
  mapRouteSeg3: { width: SCREEN_WIDTH - 90, height: 4, borderRadius: 2 },
  mapRouteSeg4: { width: 4, height: 130, borderRadius: 2 },
  mapRouteSeg5: { width: SCREEN_WIDTH - 80, height: 4, borderRadius: 2 },
  mapRouteDotGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(200,16,46,0.35)',
  },
  mapRouteDot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: themeColors.primary,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: themeColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },

  // ── Bump-style UI ──
  bumpHeaderWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
  },
  bumpHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  bumpHeaderTextWrap: { flex: 1 },
  bumpHeaderTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  bumpHeaderAddress: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '500' },
  bumpBottomCardWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
  },
  bumpBottomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: themeColors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  bumpBottomCardLeft: {
    flex: 1,
  },
  bumpBottomCardEta: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  bumpBottomCardSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    fontWeight: '600',
  },
  bumpBottomCardStop: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bumpBottomCardStopText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bumpBottomCardExpand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  bumpBottomCardExpandText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },

  // ── Spot detail card (legacy, kept for fallback) ──
  spotDetailWrap: {
    position: 'absolute', left: 20, right: 20, zIndex: 100,
  },
  spotDetailCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 16,
  },
  spotDetailAccent: { height: 5 },
  spotDetailBody: { padding: 20 },
  spotDetailRow1: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  spotDetailStep: {
    width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14, marginTop: 2,
  },
  spotDetailStepText: { fontSize: 15, fontWeight: '900', color: '#FFF' },
  spotDetailNameWrap: { flex: 1, marginRight: 10 },
  spotDetailName: { fontSize: 18, fontWeight: '800', color: '#0F172A', lineHeight: 24, marginBottom: 8 },
  spotDetailTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spotDetailTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  spotDetailTagText: { fontSize: 12, fontWeight: '700' },
  spotDetailDot: { fontSize: 14, color: '#E2E8F0' },
  spotDetailTime: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  spotDetailReason: { fontSize: 15, color: '#475569', lineHeight: 22, marginBottom: 16 },
  spotDetailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 16,
  },
  spotDetailBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // ── Plan modal (Home AI design) ──
  planModalRoot: { flex: 1, backgroundColor: 'transparent' },
  planModalBackdropWrap: { ...StyleSheet.absoluteFillObject },
  planModalBackdropDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
  planModalContentWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 20,
    alignItems: 'stretch',
  },
  planModalPresenceLayer: { flex: 1, width: '100%', alignSelf: 'stretch' },
  // ── Plan modal hero & chips ──
  pmHero: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  pmStepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
  },
  pmStepBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 1.5,
  },
  pmStepDots: {
    flexDirection: 'row',
    gap: 4,
  },
  pmStepDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  pmStepDotSmallActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#FFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 4 },
      android: {},
    }),
  },
  pmTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.4)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 14,
      },
      android: { elevation: 2 },
    }),
  },
  pmSub: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 21,
    letterSpacing: 0.1,
    marginBottom: 12,
    maxWidth: 280,
  },
  pmSelectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
  },
  pmSelectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pmChipsWrap: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  pmChipsScroll: { flex: 1 },
  pmChipsScrollContent: { paddingBottom: 16, paddingHorizontal: 2 },
  pmChipsPanel: {
    width: '100%',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20 },
      android: { elevation: 4 },
    }),
  },
  pmChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  pmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    ...Platform.select({
      ios: { shadowColor: '#1e0a0c', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  pmChipSelected: {
    borderWidth: 2,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  pmChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pmChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.1,
  },
  pmChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pmChipCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ldWrap: {
    flex: 1,
    width: '100%',
  },
  ldScrollContent: {
    paddingHorizontal: 24,
    paddingTop: SCREEN_HEIGHT * 0.3,
    paddingBottom: 40,
    alignItems: 'center',
  },
  ldTitleSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
  },
  ldBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  ldBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1.5,
  },
  ldTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 38,
    marginBottom: 8,
    ...Platform.select({
      ios: { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
    }),
  },
  ldSub: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 21,
  },
  scene3dContainer: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.38,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  scene3dGl: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scene3dFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  ldSuccessCenter: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ldSheetHintCard: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    marginBottom: 20,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  ldSheetHintTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  ldSheetHintSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
  lsSteps: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  lsCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  lsCardGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 30,
    ...Platform.select({
      ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20 },
    }),
  },
  lsCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  lsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lsRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  lsTextCol: { flex: 1 },
  lsStepName: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 1,
  },
  lsStepNameDone: { color: '#FFFFFF' },
  lsStepNameActive: { color: '#FFFFFF', fontWeight: '800' },
  lsStepStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
  },
  lsBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    position: 'relative',
  },
  lsBarFillWrap: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  lsBarFill: {
    flex: 1,
    borderRadius: 3,
  },
  lsBarShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
  },
  ldFactCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ldFactIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ldFactContent: { flex: 1 },
  ldFactLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FACC15',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ldFactText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 18,
    fontWeight: '500',
  },
  planModalMarqueeMask: {
    width: '100%',
    overflow: 'hidden',
  },
  planModalBannerWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  planModalBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  planModalPreviewScroll: {
    paddingLeft: 4,
    paddingRight: 24,
    gap: 12,
  },
  planModalPreviewCard: {
    width: 110,
    borderRadius: 18,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  planModalPreviewImage: {
    width: '100%',
    height: 76,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  planModalPreviewIcon: {
    width: '100%',
    height: 76,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  planModalBannerName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  planModalBannerTag: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    fontWeight: '500',
  },
  planModalPreviewCardLegacy: {
    width: 220,
    borderRadius: 18,
    marginRight: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  planModalPreviewImage: {
    width: '100%',
    height: 96,
  },
  planModalPreviewBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  planModalPreviewTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  planModalPreviewTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  planModalPreviewTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  planModalPreviewArea: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.9)',
    fontWeight: '500',
  },
  planModalPreviewName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  planModalPreviewSnippet: {
    fontSize: 13,
    color: '#1F2937',
    lineHeight: 18,
  },
  planModalPreviewPager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  planModalPreviewDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  planModalPreviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
  planModalPreviewDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F172A',
  },
  planModalPreviewCounter: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.65)',
    fontWeight: '600',
  },
  planModalOptionsWrap: { flex: 1, width: '100%', maxWidth: 400, alignSelf: 'center' },
  planModalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  planModalBackBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planModalContinueBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  planModalBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  planModalContinueBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  planModalGenerateBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  planModalGenerateBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  optionCheckBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  doorOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  doorHalf: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH / 2,
    overflow: 'hidden',
  },
  doorLeft: {
    left: 0,
  },
  doorRight: {
    right: 0,
  },
  doorZigzag: {
    position: 'absolute',
    top: 0,
    left: SCREEN_WIDTH / 2,
    bottom: 0,
    zIndex: 2,
  },
  doorIconWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  doorLogoShadow: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 14,
  },
  doorLogoImage: {
    width: 116,
    height: 116,
    borderRadius: 58,
  },
  doorFlagLabel: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});
