import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  Animated,
  PanResponder,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Easing,
  Image,
  Linking,
  LayoutAnimation,
  Alert,
} from 'react-native';
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

// Match plan item to Pinecone match by spot name (fuzzy), extract image + clientId
function matchPlanToPinecone(planItem, pineconeMatches) {
  if (!planItem || !pineconeMatches?.length) return null;
  const spotName = (planItem.spot || '').trim().toLowerCase();
  if (!spotName) return null;
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  for (const m of pineconeMatches) {
    const meta = m.metadata || {};
    const names = [
      meta.business_name,
      meta.event_name,
      meta.name,
      meta.place_name,
    ].filter(Boolean);
    const matched = names.some((n) => norm(n) === spotName || norm(n).includes(spotName) || spotName.includes(norm(n)));
    if (matched) {
      const image = meta.image_url || meta.thumbnail_url || meta.cover_image || meta.image || null;
      const clientId = meta.client_a_uuid || meta.id || m.id || null;
      const rating = meta.rating != null && meta.rating !== '' ? meta.rating : null;
      return { image, clientId, rating };
    }
  }
  return null;
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
  // Step 1: Match from Pinecone when available
  let enriched = plan.map((item) => {
    const match = matchPlanToPinecone(item, pineconeMatches);
    return {
      ...item,
      image: match?.image || null,
      clientId: match?.clientId || null,
      rating: match?.rating != null ? match.rating : null,
    };
  });

  // Step 2: Fetch client images from Supabase (for matched clientIds)
  const clientIds = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
  let clientImageMap = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('client').select('client_a_uuid, client_image').in('client_a_uuid', clientIds);
    (clients || []).forEach((c) => {
      if (c.client_a_uuid && c.client_image) {
        clientImageMap[c.client_a_uuid] = ensureImageUrl(String(c.client_image).trim()) || String(c.client_image).trim();
      }
    });
  }

  // Step 3: ALWAYS fetch clients from Supabase and match by business_name for items without images
  const needsImage = enriched.filter((i) => !i.image || !ensureImageUrl(i.image));
  if (needsImage.length > 0) {
    const { data: allClients } = await supabase
      .from('client')
      .select('client_a_uuid, business_name, name, business_name_ar, client_image, rating')
      .limit(300);
    const clientsList = allClients || [];
    enriched = enriched.map((item) => {
      if (item.image && ensureImageUrl(item.image)) return item;
      const client = matchPlanToClient(item, clientsList);
      if (client) {
        const img = client.client_image ? ensureImageUrl(String(client.client_image).trim()) || String(client.client_image).trim() : null;
        return {
          ...item,
          image: item.image || img,
          clientId: item.clientId || client.client_a_uuid,
          rating: item.rating != null ? item.rating : (client.rating != null ? client.rating : null),
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

// Custom fun spinner — orbiting dots with subtle pulse
function FunSpinner() {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [spin]);
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const radius = 26;
  const dotCount = 5;
  const dots = [...Array(dotCount)].map((_, i) => {
    const angle = (i / dotCount) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return (
    <Animated.View style={[styles.funSpinnerWrap, { transform: [{ rotate }, { scale: pulseScale }] }]}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.funSpinnerDot, { transform: [{ translateX: d.x }, { translateY: d.y }] }]} />
      ))}
    </Animated.View>
  );
}

// Animated loading view — fun bubbles, playful steps, infinite marquee
function PlanModalLoadingView({ loadingStatus, showSuccess, spotPreviews }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const stepEntrance = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const stepCheck = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const bubble1 = useRef(new Animated.Value(0)).current;
  const bubble2 = useRef(new Animated.Value(0)).current;
  const bubble3 = useRef(new Animated.Value(0)).current;
  const steps = [
    { icon: 'compass-outline', text: 'Matching places to your vibe', key: 'places' },
    { icon: 'restaurant-outline', text: 'Hunting perfect food spots', key: 'food' },
    { icon: 'sparkles-outline', text: 'Khalid is stitching your plan', key: 'plan' },
  ];

  const getCompletedSteps = () => {
    if (showSuccess) return [0, 1, 2];
    const s = (loadingStatus || '').toLowerCase();
    if (s.includes('crafting') || s.includes('building') || s.includes('stitch')) return [0, 1];
    if (s.includes('restaurant') || s.includes('food') || s.includes('breakfast') || s.includes('event')) return [0];
    return [];
  };
  const completedSteps = getCompletedSteps();

  const MOCK_PREVIEWS = [
    { id: 'm1', name: 'Bahrain Fort', type: 'place', typeLabel: 'UNESCO Heritage' },
    { id: 'm2', name: 'Manama Souq', type: 'place', typeLabel: 'Explore' },
    { id: 'm3', name: 'Café Lilou', type: 'restaurant', typeLabel: 'Cafe' },
    { id: 'm4', name: 'Bahrain National Museum', type: 'place', typeLabel: 'Cultural' },
    { id: 'm5', name: 'City Centre', type: 'place', typeLabel: 'Shopping' },
    { id: 'm6', name: 'Rasoi by Vineet', type: 'restaurant', typeLabel: 'Indian' },
  ];
  const rawPreviews = (spotPreviews && spotPreviews.length > 0) ? spotPreviews : MOCK_PREVIEWS;
  const [displayPreviews, setDisplayPreviews] = useState(rawPreviews);
  useEffect(() => {
    const arr = [...rawPreviews];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setDisplayPreviews(arr);
  }, [spotPreviews?.length ?? 0, spotPreviews?.map((p) => p.id).join(',') ?? '']);
  const hasPreviews = displayPreviews.length > 0;
  const fact = BAHRAIN_FACTS[Math.floor(Math.random() * BAHRAIN_FACTS.length)];
  const funPhrase = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];

  useEffect(() => {
    if (showSuccess) return;
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [pulse, showSuccess]);

  // Bump-style floating bubbles
  useEffect(() => {
    if (showSuccess) return;
    const b1 = Animated.loop(Animated.sequence([
      Animated.timing(bubble1, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bubble1, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const b2 = Animated.loop(Animated.sequence([
      Animated.timing(bubble2, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bubble2, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const b3 = Animated.loop(Animated.sequence([
      Animated.timing(bubble3, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bubble3, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    b1.start();
    b2.start();
    b3.start();
    return () => { b1.stop(); b2.stop(); b3.stop(); };
  }, [showSuccess, bubble1, bubble2, bubble3]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ...stepEntrance.map((anim, i) =>
        Animated.timing(anim, { toValue: 1, duration: 450, delay: i * 100, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true })
      ),
    ]).start();
  }, []);

  const animatedChecks = useRef(new Set()).current;
  useEffect(() => {
    completedSteps.forEach((idx) => {
      if (animatedChecks.has(idx)) return;
      animatedChecks.add(idx);
      Animated.spring(stepCheck[idx], { toValue: 1, tension: 180, friction: 7, useNativeDriver: true }).start();
    });
  }, [completedSteps.join(',')]);

  useEffect(() => {
    if (showSuccess) {
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, tension: 120, friction: 10, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [showSuccess]);


  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
  const by1 = bubble1.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const by2 = bubble2.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const by3 = bubble3.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <Animated.View style={[styles.planModalLoadingWrap, { opacity: fadeIn }]}>
      {/* Bump-style floating friend bubbles */}
      {!showSuccess && (
        <>
          <Animated.View style={[styles.planModalBubble, styles.planModalBubble1, { transform: [{ translateY: by1 }] }]}>
            <Ionicons name="location" size={20} color="rgba(255,255,255,0.9)" />
          </Animated.View>
          <Animated.View style={[styles.planModalBubble, styles.planModalBubble2, { transform: [{ translateY: by2 }] }]}>
            <Ionicons name="restaurant" size={18} color="rgba(255,255,255,0.9)" />
          </Animated.View>
          <Animated.View style={[styles.planModalBubble, styles.planModalBubble3, { transform: [{ translateY: by3 }] }]}>
            <Ionicons name="sunny" size={18} color="rgba(255,255,255,0.9)" />
          </Animated.View>
        </>
      )}

      <View style={styles.planModalLoadingCenter}>
        {!showSuccess && (
          <Animated.View style={[styles.planModalLoadingPulseOuter, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
        )}
        <View style={[styles.planModalLoadingPulse, showSuccess && styles.planModalLoadingPulseSuccess]}>
          {!showSuccess && (
            <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.08)']} style={[StyleSheet.absoluteFill, styles.planModalLoadingPulseGradient]} />
          )}
          {showSuccess ? (
            <Animated.View style={{ transform: [{ scale: successScale }], opacity: successOpacity }}>
              <Ionicons name="checkmark-circle" size={64} color={themeColors.success} />
            </Animated.View>
          ) : (
            <View style={styles.planModalLoadingSpinnerWrap}>
              <FunSpinner />
            </View>
          )}
        </View>
      </View>

      <Animated.View style={showSuccess && { opacity: successOpacity }}>
        <Text style={styles.planModalLoadingTitle}>
          {showSuccess ? "Your plan is ready!" : funPhrase}
        </Text>
        <Text style={styles.planModalLoadingSub}>
          {showSuccess ? "Yalla, let's explore Bahrain!" : (loadingStatus || 'Building your perfect day…')}
        </Text>
      </Animated.View>

      <View style={styles.planModalLoadingSteps}>
        {steps.map((s, i) => {
          const entrance = stepEntrance[i];
          const check = stepCheck[i];
          const isDone = completedSteps.includes(i);
          return (
            <Animated.View key={s.key} style={[styles.planModalLoadingStepRow, { opacity: entrance, transform: [{ translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }]}>
              <View style={[styles.planModalLoadingDot, isDone && styles.planModalLoadingDotDone]}>
                {isDone ? (
                  <Animated.View style={{ transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}>
                    <Ionicons name="checkmark" size={26} color="#FFFFFF" />
                  </Animated.View>
                ) : (
                  <Ionicons name={s.icon} size={18} color="rgba(255,255,255,0.9)" />
                )}
              </View>
              <Text style={[styles.planModalLoadingStepText, isDone && styles.planModalLoadingStepTextDone]}>{s.text}</Text>
            </Animated.View>
          );
        })}
      </View>

      {/* Infinite marquee — never stops */}
      {hasPreviews && !showSuccess && (
        <View style={styles.planModalPreviewSection}>
          <View style={styles.planModalPreviewTitleRow}>
            <Ionicons name="map" size={18} color="rgba(255,255,255,0.95)" style={{ marginRight: 8 }} />
            <Text style={styles.planModalPreviewTitle}>Places we're considering…</Text>
          </View>
          <View style={styles.planModalMarqueeMask}>
            <SpotMarqueeBanner items={displayPreviews} itemWidth={110} itemGap={12} variant="modal" />
          </View>
        </View>
      )}

      {!showSuccess && (
        <View style={styles.planModalFactWrap}>
          <Ionicons name="information-circle-outline" size={16} color="#FACC15" />
          <Text style={styles.planModalFactText}>{fact}</Text>
        </View>
      )}
    </Animated.View>
  );
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
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
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
  const [planGenerationSuccess, setPlanGenerationSuccess] = useState(false);
  const [spotPreviews, setSpotPreviews] = useState([]);
  const [profileClientId, setProfileClientId] = useState(null);
  const [expandedStops, setExpandedStops] = useState(() => new Set());
  const [openingMaps, setOpeningMaps] = useState(false);
  const [allPlaceMarkers, setAllPlaceMarkers] = useState([]);
  const [mapRegion, setMapRegion] = useState(BAHRAIN_REGION);
  const [radialMenuPosition, setRadialMenuPosition] = useState(null);

  const handleOpenInGoogleMaps = async () => {
    if (!dayPlan || openingMaps) return;
    setOpeningMaps(true);
    try {
      await openAllStopsInGoogleMaps(dayPlan);
    } finally {
      setOpeningMaps(false);
    }
  };

  const toggleExpandStop = (stopNum) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedStops((prev) => {
      const next = new Set(prev);
      if (next.has(stopNum)) next.delete(stopNum);
      else next.add(stopNum);
      return next;
    });
  };
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Plan modal animations (match Home AI overlay)
  const planModalBackdrop = useRef(new Animated.Value(0)).current;
  const planModalScale = useRef(new Animated.Value(0.92)).current;
  const planModalOpacity = useRef(new Animated.Value(0)).current;
  const planModalTitleOpacity = useRef(new Animated.Value(0)).current;
  const planModalTitleTranslateY = useRef(new Animated.Value(12)).current;
  const planModalChipsOpacity = useRef(new Animated.Value(0)).current;
  const planModalChipsTranslateY = useRef(new Animated.Value(14)).current;
  const sheetOpacity = useRef(new Animated.Value(1)).current;

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
    setPlanGenerationSuccess(false);
    setRevealingPins(false);
    setVisiblePinCount(0);
    sheetOpacity.setValue(1);
    setSelectedPreferences(Array.isArray(preferences?.activityIds) ? preferences.activityIds : []);
    setSelectedFoodCategories(Array.isArray(preferences?.foodIds) ? preferences.foodIds : []);
    setDayPlan(null);
    setPineconeMatches([]);
    setSelectedMarker(null);
    setError(null);
    setSpotPreviews([]);
    setPlanModalStep(1);
    setShowPlanModal(true);
  };

  useEffect(() => {
    const openPlanModal = route.params?.openPlanModal;
    if (openPlanModal) {
      startSetup();
    }
  }, [route.params?.openPlanModal]);

  const closePlanModal = (then) => {
    Animated.parallel([
      Animated.timing(planModalBackdrop, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(planModalScale, {
        toValue: 0.95,
        duration: 300,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(planModalOpacity, {
        toValue: 0,
        duration: 250,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowPlanModal(false);
      setPlanGenerationSuccess(false);
      then?.();
    });
  };

  const openPlanModalAnim = () => {
    planModalTitleOpacity.setValue(0);
    planModalTitleTranslateY.setValue(14);
    planModalChipsOpacity.setValue(0);
    planModalChipsTranslateY.setValue(16);
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
        }, 1400);
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
    if (showPlanModal) openPlanModalAnim();
  }, [showPlanModal]);

  // Question page animations: step transition
  useEffect(() => {
    if (!showPlanModal || loading || planGenerationSuccess) return;
    planModalTitleOpacity.setValue(0);
    planModalTitleTranslateY.setValue(14);
    planModalChipsOpacity.setValue(0);
    planModalChipsTranslateY.setValue(16);
    Animated.stagger(60, [
      Animated.parallel([
        Animated.timing(planModalTitleOpacity, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(planModalTitleTranslateY, {
          toValue: 0,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(planModalChipsOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(planModalChipsTranslateY, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [planModalStep, showPlanModal]);

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
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
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
        <View style={styles.grabberWrap} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
          <Text style={styles.grabberHint}>{dayPlan ? 'Swipe up for full itinerary' : 'Drag up for more'}</Text>
        </View>

        {/* Step 0 — Past Plans (modern hero layout) */}
        {drawerStep === 0 && (
          <>
            <View style={styles.pastPlansHero}>
              <View style={styles.pastPlansHeroContent}>
                <View style={styles.pastPlansTitleRow}>
                  <Text style={styles.pastPlansTitle}>Your Bahrain{'\n'}Adventure</Text>
                  <TouchableOpacity style={styles.startAiButtonWrap} activeOpacity={0.85} onPress={startSetup}>
                    <LinearGradient colors={[themeColors.primary, themeColors.primaryLight || '#E63950']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.startAiButton}>
                      <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                      <Text style={styles.startAiButtonText}>Build my day</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                <Text style={styles.pastPlansSubtitle}>Let Khalid craft the perfect day — tailored to you</Text>
              </View>
            </View>
            <ScrollView style={styles.pastPlansScroll} contentContainerStyle={styles.pastPlansContent} showsVerticalScrollIndicator={false}>
              {/* Surprise Me — premium card */}
              <View style={styles.surpriseCard}>
                <LinearGradient colors={['rgba(200,16,46,0.06)', 'rgba(200,16,46,0.02)']} style={styles.surpriseCardGradient}>
                  <View style={styles.surpriseHeader}>
                    <View style={styles.surpriseIconWrap}>
                      <Ionicons name="dice" size={24} color={themeColors.primary} />
                    </View>
                    <View style={styles.surpriseHeaderText}>
                      <Text style={styles.surpriseTitle}>Feeling Lucky?</Text>
                      <Text style={styles.surpriseDesc}>
                        Let Khalid pick a theme and plan your entire day — zero decisions needed!
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rouletteWrap}>
                    <View style={[styles.rouletteBox, { borderColor: (surprisePicked || SURPRISE_THEMES[surpriseIndex]).color, backgroundColor: `${(surprisePicked || SURPRISE_THEMES[surpriseIndex]).color}12` }]}>
                      <Ionicons name={(surprisePicked || SURPRISE_THEMES[surpriseIndex]).icon} size={26} color={(surprisePicked || SURPRISE_THEMES[surpriseIndex]).color} />
                      <Text style={[styles.rouletteLabel, { color: (surprisePicked || SURPRISE_THEMES[surpriseIndex]).color }]}>
                        {(surprisePicked || SURPRISE_THEMES[surpriseIndex]).label}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.surpriseBtn, surpriseSpinning && styles.surpriseBtnDisabled]} activeOpacity={0.85} onPress={handleSurpriseMe} disabled={surpriseSpinning}>
                    <Ionicons name={surpriseSpinning ? 'sync' : 'sparkles'} size={20} color="#FFF" />
                    <Text style={styles.surpriseBtnText}>
                      {surpriseSpinning ? 'Spinning…' : surprisePicked ? `Go with ${surprisePicked.label}!` : 'Surprise Me!'}
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>

              <View style={styles.surpriseDivider}>
                <View style={styles.surpriseDividerLine} />
                <Text style={styles.surpriseDividerText}>or pick from past plans</Text>
                <View style={styles.surpriseDividerLine} />
              </View>

              {DUMMY_PAST_PLANS.map((plan) => (
                <TouchableOpacity key={plan.id} style={styles.pastPlanCard} activeOpacity={0.85}>
                  <View style={styles.pastPlanIcon}>
                    <Ionicons name="map" size={24} color={themeColors.primary} />
                  </View>
                  <View style={styles.pastPlanInfo}>
                    <Text style={styles.pastPlanName}>{plan.title}</Text>
                    <View style={styles.pastPlanMetaRow}>
                      <View style={styles.pastPlanMetaDot} />
                      <Text style={styles.pastPlanMeta}>{plan.spots} stops · {plan.date}</Text>
                    </View>
                  </View>
                  <View style={styles.savedBadge}>
                    <Text style={styles.savedBadgeText}>Saved</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Step 3 — Day plan results (steps 1–2 now in modal) */}
        {drawerStep === 3 && (
          <>
            {/* Header — no plan/preparation text when loading */}
            <View style={styles.drawerPageHeader}>
              <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => { setDrawerStep(0); setDayPlan(null); setError(null); }}>
                      <Ionicons name="chevron-back" size={20} color="#374151" />
              </TouchableOpacity>
              {!loading && (
                <View style={styles.drawerPageTitleWrap}>
                  <Text style={styles.drawerPageTitle}>Your Day in Bahrain</Text>
                </View>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <LinearGradient colors={['#FFF5F6', '#FFFFFF']} style={styles.loadingBumpCard}>
                  <View style={styles.loadingBumpPulse}>
                    <ActivityIndicator size="large" color={themeColors.primary} />
                  </View>
                  <Text style={styles.loadingBumpTitle}>{loadingStatus || "Khalid's building your day…"}</Text>
                  <Text style={styles.loadingBumpSub}>Hang tight, habibi — almost there!</Text>
                  {spotPreviews.length > 0 && (
                    <SpotMarqueeBanner items={spotPreviews} itemWidth={64} itemGap={10} variant="sheet" />
                  )}
                  <View style={styles.loadingProgressBar}>
                    <View style={[styles.loadingProgressFill, (() => {
                      const s = (loadingStatus || '').toLowerCase();
                      if (s.includes('crafting') || s.includes('stitch')) return { width: '100%' };
                      if (s.includes('food') || s.includes('restaurant')) return { width: '66%' };
                      return { width: '33%' };
                    })()]} />
                  </View>
                  <View style={styles.loadingBumpSteps}>
                    {['Finding spots', 'Picking food', 'Stitching plan'].map((step, i) => {
                      const s = (loadingStatus || '').toLowerCase();
                      const isDone = (i === 0 && (s.includes('food') || s.includes('restaurant') || s.includes('crafting') || s.includes('stitch'))) || (i === 1 && (s.includes('crafting') || s.includes('stitch')));
                      return (
                        <View key={step} style={styles.loadingBumpStep}>
                          <View style={[styles.loadingBumpDot, isDone && styles.loadingBumpDotDone]}>
                            {isDone ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : <Ionicons name="ellipse" size={8} color={themeColors.primary} />}
                          </View>
                          <Text style={[styles.loadingBumpStepText, isDone && styles.loadingBumpStepTextDone]}>{step}</Text>
                        </View>
                      );
                    })}
                  </View>
                </LinearGradient>
              </View>
            ) : error ? (
              <View style={styles.errorWrap}>
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
              </View>
            ) : !dayPlan || dayPlan.length === 0 ? (
              <View style={{ paddingHorizontal: 20, flex: 1, justifyContent: 'center' }}>
                <Text style={styles.emptyResults}>No plan generated.</Text>
              </View>
            ) : (
              <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>

                {/* ═══ Summary — simple overview + Google Maps button ═══ */}
                <View style={styles.bumpSummaryCard}>
                  <View style={styles.bumpSummarySimple}>
                    <Text style={styles.bumpSummaryTitle}>{dayPlan.length} stops · Full day in Bahrain</Text>
                    <Text style={styles.bumpSummarySub}>{dayPlan.filter(i => i.type === 'restaurant').length} meals · Yalla!</Text>
                    <TouchableOpacity
                      style={styles.bumpSummaryMapBtn}
                      onPress={handleOpenInGoogleMaps}
                      disabled={openingMaps}
                      activeOpacity={0.85}
                    >
                      {openingMaps ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="navigate" size={18} color="#FFFFFF" />
                          <Text style={styles.bumpSummaryMapBtnText}>Open in Google Maps</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ═══ Bump-style itinerary list — modern cards ═══ */}
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

                  return order.filter(t => grouped[t]).map((time) => {
                    const sec = sections[time];
                    const items = grouped[time];
                    return (
                      <View key={time} style={styles.bumpItinSection}>
                        <View style={[styles.bumpItinSectionHeader, { backgroundColor: `${sec.color}12` }]}>
                          <View style={[styles.bumpItinSectionIconWrap, { backgroundColor: sec.color }]}>
                            <Ionicons name={sec.icon} size={14} color="#FFFFFF" />
                          </View>
                          <Text style={[styles.bumpItinSectionTitle, { color: sec.color }]}>{sec.label}</Text>
                          <View style={[styles.bumpItinSectionCountBadge, { backgroundColor: sec.color }]}>
                            <Text style={styles.bumpItinSectionCountText}>{items.length}</Text>
                          </View>
                        </View>
                        {items.map((item, idx) => {
                          stopNum += 1;
                          const thisStopNum = stopNum;
                          const isExpanded = expandedStops.has(thisStopNum);
                          const isEat = item.type === 'restaurant';
                          const isEvent = item.type === 'event';
                          const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : sec.color;
                          const hasImage = !!(item.image);
                          const hasImages = (item.images && item.images.length > 0) || hasImage;
                          const images = (item.images && item.images.length > 0) ? item.images : (item.image ? [item.image] : []);
                          const hasProfile = !!(item.clientId);
                          return (
                            <View key={`stop-${thisStopNum}`} style={[styles.bumpItinCard, isExpanded && styles.bumpItinCardExpanded]}>
                              <TouchableOpacity
                                style={styles.bumpItinRow}
                                activeOpacity={0.85}
                                onPress={() => {
                                  toggleExpandStop(thisStopNum);
                                  if (!isExpanded) {
                                    const markers = buildMapMarkers(dayPlan);
                                    const mk = markers[thisStopNum - 1];
                                    if (mk) setSelectedMarker(mk);
                                  }
                                }}
                              >
                                <View style={[styles.bumpItinNumCircle, { backgroundColor: accent }]}>
                                  <Text style={styles.bumpItinNumText}>{thisStopNum}</Text>
                                </View>
                                <View style={styles.bumpItinThumbWrap}>
                                  {hasImages ? (
                                    <PreviewImage uri={images[0] || item.image} style={styles.bumpItinThumb} />
                                  ) : (
                                    <View style={[styles.bumpItinThumbPlaceholder, { backgroundColor: `${accent}20` }]}>
                                    <Ionicons name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'} size={18} color={accent} />
                                    </View>
                                  )}
                                  {item.rating != null && (
                                    <View style={styles.bumpItinRatingPill}>
                                      <Ionicons name="star" size={10} color="#F59E0B" />
                                      <Text style={styles.bumpItinRatingPillText}>{Number(item.rating).toFixed(1)}</Text>
                                    </View>
                                  )}
                                </View>
                                <View style={styles.bumpItinSummary}>
                                  <Text style={styles.bumpItinName} numberOfLines={1}>{item.spot}</Text>
                                  {!isExpanded && <Text style={styles.bumpItinReason} numberOfLines={2}>{item.reason}</Text>}
                                  {!isExpanded && (
                                    <View style={styles.bumpItinActionRow}>
                                      {item.lat != null && item.lng != null && (
                                        <TouchableOpacity style={styles.bumpItinActionIcon} onPress={(e) => { e.stopPropagation(); openInMaps(item.lat, item.lng, item.spot); }} activeOpacity={0.7}>
                                          <Ionicons name="navigate" size={18} color={themeColors.primary} />
                                        </TouchableOpacity>
                                      )}
                                      {hasProfile && (
                                        <TouchableOpacity style={styles.bumpItinActionIcon} onPress={(e) => { e.stopPropagation(); setProfileClientId(item.clientId); }} activeOpacity={0.7}>
                                          <Ionicons name="person-circle-outline" size={18} color={themeColors.primary} />
                                        </TouchableOpacity>
                                      )}
                                      {item.lat != null && item.lng != null && (
                                        <TouchableOpacity style={styles.bumpItinActionIcon} onPress={(e) => { e.stopPropagation(); navigation.navigate('AR', { navigateTo: { lat: item.lat, lng: item.lng, name: item.spot } }); }} activeOpacity={0.7}>
                                          <Ionicons name="camera" size={18} color={themeColors.primary} />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  )}
                                </View>
                                <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#94A3B8" style={styles.bumpItinChevron} />
                              </TouchableOpacity>
                              {isExpanded && (
                                <View style={styles.bumpItinExpanded}>
                                  <View style={styles.bumpItinExpandedImageWrap}>
                                    {hasImages ? (
                                      images.length > 1 ? (
                                        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.bumpItinExpandedScroll} contentContainerStyle={styles.bumpItinExpandedScrollContent}>
                                          {images.map((img, i) => (
                                            <View key={i} style={styles.bumpItinExpandedSlide}>
                                              <PreviewImage uri={img} style={StyleSheet.absoluteFill} />
                                            </View>
                                          ))}
                                        </ScrollView>
                                      ) : (
                                        <PreviewImage uri={images[0] || item.image} style={StyleSheet.absoluteFill} />
                                      )
                                    ) : (
                                      <View style={[styles.bumpItinExpandedPlaceholder, { backgroundColor: `${accent}15` }]}>
                                        <Ionicons name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'} size={28} color={accent} />
                                      </View>
                                    )}
                                  </View>
                                  <Text style={styles.bumpItinExpandedReason}>{item.reason}</Text>
                                  <View style={styles.bumpItinExpandedActions}>
                                    {item.lat != null && item.lng != null && (
                                      <>
                                        <TouchableOpacity style={[styles.bumpItinExpandedBtn, styles.bumpItinExpandedBtnPrimary]} onPress={() => openInMaps(item.lat, item.lng, item.spot)} activeOpacity={0.85}>
                                          <Ionicons name="navigate" size={16} color="#FFFFFF" />
                                          <Text style={styles.bumpItinExpandedBtnPrimaryText}>Get directions</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.bumpItinExpandedBtn, styles.bumpItinExpandedBtnSecondary]} onPress={() => navigation.navigate('AR', { navigateTo: { lat: item.lat, lng: item.lng, name: item.spot } })} activeOpacity={0.85}>
                                          <Ionicons name="camera" size={16} color={themeColors.primary} />
                                          <Text style={styles.bumpItinExpandedBtnSecondaryText}>Open in AR</Text>
                                        </TouchableOpacity>
                                      </>
                                    )}
                                    {hasProfile && (
                                      <TouchableOpacity style={[styles.bumpItinExpandedBtn, styles.bumpItinExpandedBtnSecondary]} onPress={() => setProfileClientId(item.clientId)} activeOpacity={0.85}>
                                        <Ionicons name="person-circle-outline" size={16} color={themeColors.primary} />
                                        <Text style={styles.bumpItinExpandedBtnSecondaryText}>Profile</Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  });
                })()}

                {/* ═══ Footer — friendly close ═══ */}
                <View style={styles.bumpFooter}>
                  <Text style={styles.bumpFooterText}>Tap to expand for details. Tap again to collapse. Yalla!</Text>
                </View>
              </ScrollView>
            )}
          </>
        )}
      </Animated.View>

      {/* Plan modal — Home AI design (blur overlay, question block, glass options) */}
      <Modal visible={showPlanModal} transparent animationType="none">
        <KeyboardAvoidingView
          style={styles.planModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.planModalBackdropWrap, { opacity: planModalBackdrop }]}>
            <LinearGradient
              colors={['#1a0a0d', '#2d1519', '#1a0a0d']}
              style={StyleSheet.absoluteFill}
            />
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.planModalBackdropDim} />
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
            {/* Loading state — animated, smooth */}
            {loading || planGenerationSuccess ? (
              <PlanModalLoadingView
                loadingStatus={loadingStatus}
                showSuccess={planGenerationSuccess}
                spotPreviews={spotPreviews}
              />
            ) : (
              <>
                {/* Question block — modern step indicator */}
                <Animated.View
                  style={[
                    styles.planModalQuestionBlock,
                    {
                      opacity: planModalTitleOpacity,
                      transform: [{ translateY: planModalTitleTranslateY }],
                    },
                  ]}
                >
                  <View style={styles.planModalStepIndicator}>
                    <View style={[styles.planModalStepDot, planModalStep >= 1 && styles.planModalStepDotActive]} />
                    <View style={[styles.planModalStepLine, planModalStep >= 2 && styles.planModalStepLineActive]} />
                    <View style={[styles.planModalStepDot, planModalStep >= 2 && styles.planModalStepDotActive]} />
                  </View>
                  <View style={styles.planModalQuestionInner}>
                    <Text style={styles.planModalQuestionTitle}>
                      {planModalStep === 1 ? 'What kind of experiences do you prefer?' : 'What do you prefer to eat?'}
                    </Text>
                    <View style={styles.planModalQuestionAccent} />
                    <Text style={styles.planModalQuestionSub}>
                      {planModalStep === 1 ? 'Tap a few that describe your Bahrain trip' : 'Pick your food vibes for this trip'}
                    </Text>
                  </View>
                </Animated.View>

                {/* Glass-style options */}
                <Animated.View
                  style={[
                    styles.planModalOptionsWrap,
                    {
                      opacity: planModalChipsOpacity,
                      transform: [{ translateY: planModalChipsTranslateY }],
                    },
                  ]}
                >
                  <ScrollView
                style={styles.planModalScroll}
                contentContainerStyle={styles.planModalScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.planModalOptionsGrid}>
                  {(() => {
                    const items = planModalStep === 1 ? PREFERENCES : FOOD_CATEGORIES;
                    const isSelected = (item) =>
                      planModalStep === 1
                        ? selectedPreferences.includes(item.id)
                        : selectedFoodCategories.includes(item.id);
                    const onPress = (item) =>
                      planModalStep === 1 ? togglePreference(item.id) : toggleFoodCategory(item.id);
                    const rows = [];
                    for (let i = 0; i < items.length; i += 2) {
                      rows.push(items.slice(i, i + 2));
                    }
                    return rows.map((row, rowIdx) => (
                      <View key={rowIdx} style={styles.planModalOptionsRow}>
                        {row.map((item) => {
                          const sel = isSelected(item);
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.planModalOptionBlock,
                                sel && styles.planModalOptionBlockSelected,
                                sel && { borderColor: item.color, backgroundColor: item.color, borderWidth: 2 },
                              ]}
                              activeOpacity={0.85}
                              onPress={() => onPress(item)}
                            >
                              <View style={[styles.planModalOptionIconWrap, sel && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                                <Ionicons name={item.icon} size={18} color={sel ? '#FFFFFF' : 'rgba(255,255,255,0.95)'} />
                              </View>
                              <Text style={[styles.planModalOptionText, sel && styles.planModalOptionTextSelected]}>
                                {item.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {row.length === 1 && <View style={styles.planModalOptionSpacer} />}
                      </View>
                    ));
                  })()}
                </View>
              </ScrollView>

              {/* Action row */}
              <View style={styles.planModalActionRow}>
                {planModalStep === 1 ? (
                  <>
                    <TouchableOpacity
                      style={styles.planModalBackBtn}
                      activeOpacity={0.8}
                      onPress={() => closePlanModal()}
                    >
                      <Ionicons name="close" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.planModalContinueBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        const prefLabels = selectedPreferences
                          .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
                          .filter(Boolean);
                        startBackgroundPrefetch(prefLabels);
                        setPlanModalStep(2);
                      }}
                    >
                      <Text style={styles.planModalContinueBtnText}>Continue</Text>
                      <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.planModalBackBtn}
                      activeOpacity={0.8}
                      onPress={() => setPlanModalStep(1)}
                    >
                      <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.planModalGenerateBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        handleGenerate(() => closePlanModal());
                      }}
                    >
                      <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                      <Text style={styles.planModalGenerateBtnText}>Generate</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Animated.View>
              </>
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
    </View>
  );
}

const TILE_WIDTH = (SCREEN_WIDTH - 48 - 24) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: SHEET_HEIGHT,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 16,
    overflow: 'hidden',
  },
  grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 24 },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  grabberHint: { marginTop: 4, fontSize: 11, color: '#94A3B8', fontWeight: '500' },

  // Past plans (step 0) — compact, Bump-style
  pastPlansHero: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pastPlansHeroContent: {},
  pastPlansTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pastPlansTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, lineHeight: 30, flexShrink: 1 },
  pastPlansSubtitle: { fontSize: 14, color: '#64748B', marginTop: 6, fontWeight: '500', lineHeight: 20 },
  startAiButtonWrap: {
    flexShrink: 0,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  startAiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    gap: 8,
    borderRadius: 14,
  },
  startAiButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },
  pastPlansScroll: { flex: 1 },
  pastPlansContent: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 14, gap: 10 },
  pastPlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  pastPlanIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: themeColors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pastPlanInfo: { flex: 1 },
  pastPlanName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  pastPlanMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pastPlanMetaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#94A3B8' },
  pastPlanMeta: { fontSize: 14, color: '#64748B', fontWeight: '500' },
  savedBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: themeColors.successMuted, marginRight: 12 },
  savedBadgeText: { fontSize: 11, fontWeight: '700', color: themeColors.success },

  // Surprise Me — compact, fun
  surpriseCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 6,
    ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 12 }, android: { elevation: 4 } }),
  },
  surpriseCardGradient: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.08)',
  },
  surpriseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  surpriseIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(200,16,46,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surpriseHeaderText: { flex: 1 },
  surpriseTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  surpriseDesc: { fontSize: 13, color: '#64748B', lineHeight: 19, fontWeight: '500' },
  rouletteWrap: { alignItems: 'center', marginBottom: 14 },
  rouletteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 2,
    minWidth: 180,
    justifyContent: 'center',
  },
  rouletteLabel: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  surpriseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: themeColors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    ...Platform.select({ ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  surpriseBtnDisabled: { opacity: 0.7 },
  surpriseBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  surpriseDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    paddingHorizontal: 4,
  },
  surpriseDividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  surpriseDividerText: { fontSize: 13, color: '#94A3B8', marginHorizontal: 14, fontWeight: '600' },

  // Drawer page header
  drawerPageHeader: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 24, marginBottom: 16, gap: 8,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4, borderRadius: 12, backgroundColor: '#F1F5F9' },
  drawerPageTitleWrap: { flex: 1 },
  drawerPageTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 },
  drawerPageTitleSingle: { fontSize: 20, fontWeight: '800', color: '#0F172A', flex: 1 },
  drawerPageSubtitle: { fontSize: 15, color: '#64748B', lineHeight: 21, fontWeight: '500' },

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

  // ── Results (step 3) ────────────────────────────────────────────
  resultsScroll: { flex: 1 },
  resultsContent: { paddingBottom: 32, paddingHorizontal: 16 },

  // Loading (sheet fallback) — Bump-style fun
  loadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40,
  },
  loadingBumpCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.08)',
    ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }, android: { elevation: 6 } }),
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
  loadingBumpPulse: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: themeColors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  loadingBumpTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  loadingBumpSub: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 16,
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

  // ── Summary card — simple ──
  bumpSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bumpSummarySimple: { gap: 6 },
  bumpSummaryTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  bumpSummarySub: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  bumpSummaryMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: themeColors.primary,
    borderRadius: 12,
  },
  bumpSummaryMapBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

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

  // ── Itinerary — simple, clean ──
  bumpItinSection: { marginBottom: 16 },
  bumpItinSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  bumpItinSectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumpItinSectionTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  bumpItinSectionCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  bumpItinSectionCountText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  bumpItinSectionCount: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
    marginLeft: 4,
  },
  bumpItinCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bumpItinCardExpanded: { borderColor: 'rgba(200,16,46,0.2)' },
  bumpItinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 10,
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
  bumpItinName: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
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
    width: SCREEN_WIDTH - 56,
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

  // ── Bump footer — helpful hint ──
  bumpFooter: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(248,250,252,0.8)',
    borderRadius: 14,
    marginBottom: 8,
  },
  bumpFooterText: { fontSize: 13, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 20 },

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
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  planModalQuestionBlock: {
    marginBottom: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  planModalStepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  planModalStepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  planModalStepDotActive: {
    backgroundColor: themeColors.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  planModalStepLine: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  planModalStepLineActive: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  planModalQuestionInner: { alignItems: 'center', maxWidth: 320 },
  planModalQuestionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: PLAN_COLORS.overlayQuestionTitle,
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: 0.3,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.25)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  planModalQuestionAccent: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: themeColors.primary,
    opacity: 0.95,
    marginBottom: 16,
  },
  planModalQuestionSub: {
    fontSize: 14,
    fontWeight: '500',
    color: PLAN_COLORS.overlayQuestionSub,
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  planModalLoadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
    position: 'relative',
  },
  planModalBubble: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planModalBubble1: { top: 60, left: 40 },
  planModalBubble2: { top: 100, right: 50 },
  planModalBubble3: { bottom: 180, left: 50 },
  planModalLoadingSpinnerWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  funSpinnerWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  funSpinnerDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#FFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  planModalLoadingCenter: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  planModalLoadingPulseOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
  },
  planModalLoadingPulse: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  planModalLoadingPulseGradient: {
    borderRadius: 44,
  },
  planModalLoadingTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.4,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
      },
    }),
  },
  planModalLoadingSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    marginBottom: 36,
    fontWeight: '600',
    lineHeight: 22,
  },
  planModalLoadingSteps: { gap: 18, width: '100%', paddingHorizontal: 12 },
  planModalLoadingStepRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  planModalLoadingDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  planModalLoadingDotActive: {
    backgroundColor: 'rgba(200,16,46,0.5)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
  },
  planModalLoadingDotDone: {
    backgroundColor: themeColors.success,
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 2,
  },
  planModalLoadingStepText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  planModalLoadingStepTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  planModalLoadingStepTextDone: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  planModalFactWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  planModalFactText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    fontWeight: '500',
  },
  planModalPreviewSection: {
    marginTop: 24,
    width: '100%',
  },
  planModalPreviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
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
  planModalPreviewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 14,
    paddingHorizontal: 4,
    letterSpacing: 0.3,
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
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 4 },
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
  planModalLoadingPulseSuccess: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderColor: 'rgba(16,185,129,0.5)',
  },
  planModalOptionsWrap: { flex: 1, width: '100%', maxWidth: 400, alignSelf: 'center' },
  planModalScroll: { flex: 1 },
  planModalScrollContent: { paddingBottom: 20 },
  planModalOptionsGrid: {
    width: '100%',
  },
  planModalOptionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  planModalOptionSpacer: {
    flex: 1,
  },
  planModalOptionBlock: {
    flex: 1,
    minHeight: 52,
    backgroundColor: PLAN_COLORS.overlayBlockBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: PLAN_COLORS.overlayBlockBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  planModalOptionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planModalOptionBlockSelected: {
    borderWidth: 2,
  },
  planModalOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: PLAN_COLORS.overlayBlockText,
  },
  planModalOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  planModalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  planModalBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planModalContinueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: themeColors.primary,
  },
  planModalContinueBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  planModalGenerateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: themeColors.primary,
    ...Platform.select({
      ios: { shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  planModalGenerateBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
