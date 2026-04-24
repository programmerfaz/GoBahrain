import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  Animated,
  Easing,
  Image,
  Vibration,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  FlatList,
  TouchableWithoutFeedback,
  PanResponder,
  LayoutAnimation,
  UIManager,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { OPENAI_KEY } from '../config/keys';
import { supabase } from '../config/supabase';
import { fetchPineconePlacesForChat } from '../services/aiPipeline';
import { useUserPreferences } from '../context/UserPreferencesContext';
import ClientProfileModal from './ClientProfileModal';
import { useTheme } from '../context/ThemeContext';
import { colors as themeColors } from '../theme/designTokens';
import { ensureImageUrl, resolvePublicImageUrl } from '../utils/imageUrl';
import { CachedImage } from './CachedImage';
import { aiPlanSheetLink } from '../utils/aiPlanSheetLink';
import { khalidChatLink } from '../utils/khalidChatLink';
import { usePlanMapOrbitActive } from '../screens/aiPlan/planMapOrbitStore';
import { ORBIT_TAB_BAR_PULL_DOWN } from '../screens/aiPlan/constants';
import HomeLogoIcon from './HomeLogoIcon';
import SettingsLogoIcon from './SettingsLogoIcon';
import CommunityLogoIcon from './CommunityLogoIcon';
import SearchLogoIcon from './SearchLogoIcon';
import MapLogoIcon from './MapLogoIcon';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

/** Side tabs that use selection + press scale animation */
const NAV_TAB_SCREENS = ['Home', 'Explore', 'Community', 'Profile'];

const PICS_LIKE_QUERIES = ['pic', 'pics', 'photo', 'photos', 'image', 'images', 'picture', 'pictures', 'show me', 'posts', 'feed'];

function getPostImageUrl(row) {
  const raw = row.post_image ?? row.image ?? null;
  return resolvePublicImageUrl(raw);
}

async function fetchPostsByQuery(query) {
  const q = (query && String(query).trim()) ? query.trim().toLowerCase() : '';
  const isGenericPicsRequest = PICS_LIKE_QUERIES.some((k) => q === k || q.includes(k));
  
  const { data: rows, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (error) {
    console.warn('[Khalid] fetchPostsByQuery error:', error.message);
    return [];
  }
  const list = rows || [];
  if (list.length === 0) return [];
  
  const postsWithImages = list.filter((r) => getPostImageUrl(r) != null);
  
  let matches = [];
  if (isGenericPicsRequest || !q) {
    matches = postsWithImages.slice(0, 6);
  } else {
    matches = postsWithImages.filter((r) => {
      const desc = (r.description || '').toLowerCase();
      return desc.includes(q);
    }).slice(0, 6);
    
    if (matches.length === 0) {
      matches = postsWithImages.slice(0, 6);
    }
  }
  
  const clientIds = [...new Set(matches.map((r) => r.client_a_uuid).filter(Boolean))];
  let clientMap = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('client').select('client_a_uuid, business_name, name').in('client_a_uuid', clientIds);
    const safeClients = Array.isArray(clients) ? clients : []
    safeClients.forEach((c) => {
      const id = c.client_a_uuid;
      clientMap[id] = c?.business_name || c?.name || null;
    });
  }
  return matches.map((r) => ({
    id: r.post_uuid,
    description: r.description || '',
    imageUri: getPostImageUrl(r),
    businessName: clientMap[r.client_a_uuid] ? String(clientMap[r.client_a_uuid]).trim() : null,
  }));
}

function parseReviewImages(imageColumn) {
  if (!imageColumn) return [];
  if (Array.isArray(imageColumn)) return imageColumn.slice(0, 2);
  try {
    const parsed = JSON.parse(imageColumn);
    return Array.isArray(parsed) ? parsed.slice(0, 2) : [parsed].filter(Boolean);
  } catch {
    return [imageColumn].filter(Boolean);
  }
}

function stringifyTagValue(value) {
  if (!value) return ''
  if (Array.isArray(value)) return value.map((item) => stringifyTagValue(item)).filter(Boolean).join(' ')
  if (typeof value === 'object') return Object.values(value).map((item) => stringifyTagValue(item)).filter(Boolean).join(' ')
  return String(value)
}

function getClientTagsSearchText(client) {
  const tagsRaw = client?.tags
  if (!tagsRaw) return ''

  if (Array.isArray(tagsRaw) || typeof tagsRaw === 'object') {
    return stringifyTagValue(tagsRaw)
  }

  if (typeof tagsRaw === 'string') {
    const trimmed = tagsRaw.trim()
    if (!trimmed) return ''
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return stringifyTagValue(JSON.parse(trimmed))
      } catch (_) {
        return trimmed
      }
    }
    return trimmed
  }

  return String(tagsRaw)
}

function doesClientMatchSearchQuery(client, query) {
  const lowerQuery = (query || '').trim().toLowerCase()
  if (!lowerQuery) return true
  const searchText = [
    client.business_name,
    client.description,
    client.ai_summary,
    getClientTagsSearchText(client),
    client.price_range,
    client.client_type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return searchText.includes(lowerQuery)
}

async function fetchReviewsByPlace(place) {
  if (!place || !place.trim()) return { place: place || '', reviews: [] };
  const p = place.trim();
  const { data: rows, error } = await supabase
    .from('community')
    .select('community_uuid, review_text, rating, badge, image')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !rows?.length) return { place: p, reviews: [] };
  const filtered = rows.filter((r) => {
    const text = (r.review_text || '').toLowerCase();
    const badge = (r.badge || '').toLowerCase();
    return text.includes(p.toLowerCase()) || badge.includes(p.toLowerCase());
  });
  const reviews = filtered.slice(0, 5).map((r) => {
    const rawImages = parseReviewImages(r.image);
    const images = rawImages.map((u) => resolvePublicImageUrl(u)).filter(Boolean);
    return {
      id: r.community_uuid,
      body: (r.review_text || '').trim().slice(0, 200),
      rating: r.rating != null ? Number(r.rating) : null,
      place: r.badge || null,
      imageUri: images[0] || null,
      images: images,
    };
  });
  return { place: p, reviews };
}

async function fetchClientsByQuery(query, clientType = '') {
  try {
    const q = (query && String(query).trim()) ? query.trim().toLowerCase() : '';
    console.log('[Khalid] fetchClientsByQuery called with query:', q, 'clientType:', clientType);
    
    let rows = [];
    
    // Enhanced Strategy 1: Try specific query with better matching
    if (q || clientType) {
      let clientQuery = supabase
        .from('client')
        .select('*');
      
      if (clientType) {
        clientQuery = clientQuery.eq('client_type', clientType);
      }
      
      if (q) {
        const safe = q.replace(/[,()*]/g, ' ').trim();
        clientQuery = clientQuery.or(
          `business_name.ilike.%${safe}%,description.ilike.%${safe}%,ai_summary.ilike.%${safe}%`
        );
      }
      
      const { data, error } = await clientQuery.order('rating', { ascending: false, nullsLast: true }).limit(12);
      
      if (error) {
        console.error('[Khalid] Query error in Strategy 1:', error);
      }
      
      if (data && data.length > 0) {
        const tagAwareMatches = q ? data.filter((r) => doesClientMatchSearchQuery(r, q)) : data
        rows = tagAwareMatches.length > 0 ? tagAwareMatches : data;
        console.log('[Khalid] Found', rows.length, 'clients with specific query');
      }
    }
    
    // Strategy 2: If no results and query exists, try broader search
    if (rows.length === 0 && q) {
      console.log('[Khalid] Trying broader search for query:', q);
      let broadQuery = supabase
        .from('client')
        .select('*');
      
      if (clientType) {
        broadQuery = broadQuery.eq('client_type', clientType);
      }
      
      const { data, error } = await broadQuery.order('rating', { ascending: false, nullsLast: true }).limit(12);
      
      if (error) {
        console.error('[Khalid] Query error in Strategy 2:', error);
      }
      
      if (data && data.length > 0) {
        rows = data.filter((r) => doesClientMatchSearchQuery(r, q));
        
        if (rows.length === 0) {
          rows = data;
        }
        console.log('[Khalid] Found', rows.length, 'clients with broader search');
      }
    }
    
    // Strategy 3: Get top-rated clients by type
    if (rows.length === 0) {
      console.log('[Khalid] No specific results, fetching top-rated clients');
      let topQuery = supabase
        .from('client')
        .select('*');
      
      if (clientType) {
        topQuery = topQuery.eq('client_type', clientType);
      }
      
      const { data, error } = await topQuery.order('rating', { ascending: false, nullsLast: true }).limit(12);
      
      if (error) {
        console.error('[Khalid] Query error in Strategy 3:', error);
      }
      
      if (data && data.length > 0) {
        rows = data;
        console.log('[Khalid] Found', rows.length, 'top-rated clients');
      }
    }
    
    // Strategy 4: If still no results, get ANY clients
    if (rows.length === 0) {
      console.log('[Khalid] No rated clients, fetching any clients');
      const { data, error } = await supabase
        .from('client')
        .select('*')
        .limit(12);
      
      if (error) {
        console.error('[Khalid] Query error in Strategy 4:', error);
      }
      
      if (data && data.length > 0) {
        rows = data;
        console.log('[Khalid] Found', rows.length, 'any clients');
      }
    }
    
    if (rows.length === 0) {
      console.warn('[Khalid] No clients found in database at all');
      console.log('[Khalid] This might mean: 1) Empty database, 2) Wrong table name, 3) No matching data');
      console.log('[Khalid] Attempting one final query without filters...');
      
      // Final attempt: just get SOMETHING from the table to confirm it exists
      const { data: anyData, error: anyError } = await supabase
        .from('client')
        .select('*')
        .limit(5);
      
      if (anyError) {
        console.error('[Khalid] Even basic query failed:', anyError);
        console.error('[Khalid] This suggests the "client" table might not exist or there are permission issues');
      } else {
        console.log('[Khalid] Basic query returned:', anyData?.length || 0, 'rows');
        if (anyData && anyData.length > 0) {
          console.log('[Khalid] Sample client data:', anyData[0]);
          rows = anyData;
        }
      }
      
      if (rows.length === 0) {
        return [];
      }
    }
    
    // Fetch images and review counts from community posts
    const clientIds = rows.map((r) => r.client_a_uuid).filter(Boolean);
    let imagesMap = {};
    let reviewCounts = {};
    
    if (clientIds.length > 0) {
      console.log('[Khalid] Fetching images and reviews for', clientIds.length, 'clients');
      
      // Get community posts with images
      const { data: posts } = await supabase
        .from('community')
        .select('client_a_uuid, image, rating')
        .in('client_a_uuid', clientIds)
        .order('created_at', { ascending: false })
        .limit(200);
      
      console.log('[Khalid] Found', (posts || []).length, 'community posts');
      
      const safePosts = Array.isArray(posts) ? posts : []
      safePosts.forEach((post) => {
        const cid = post.client_a_uuid;
        
        // Count reviews
        reviewCounts[cid] = (reviewCounts[cid] || 0) + 1;
        
        // Collect images
        if (post.image) {
          if (!imagesMap[cid]) imagesMap[cid] = [];
          const rawImages = parseReviewImages(post.image);
          const safeRawImages = Array.isArray(rawImages) ? rawImages : []
          safeRawImages.forEach((img) => {
            const cleanImg = resolvePublicImageUrl(img);
            if (cleanImg && typeof cleanImg === 'string' && !imagesMap[cid].includes(cleanImg)) {
              imagesMap[cid].push(cleanImg);
            }
          });
        }
      });
    }
    
    // Build enhanced results with all available information
    const results = rows.map((r) => {
      const postImages = imagesMap[r.client_a_uuid] || [];
      const profileImage = resolvePublicImageUrl(r.client_image);
      
      // Format price range display
      let priceDisplay = null;
      if (r.price_range) {
        const price = String(r.price_range).toLowerCase();
        if (price.includes('cheap') || price.includes('budget') || price === '$') priceDisplay = '$';
        else if (price.includes('moderate') || price.includes('medium') || price === '$$') priceDisplay = '$$';
        else if (price.includes('expensive') || price.includes('high') || price === '$$$') priceDisplay = '$$$';
        else if (price.includes('luxury') || price === '$$$$') priceDisplay = '$$$$';
        else priceDisplay = r.price_range;
      }
      
      const tagsObj = (() => {
        try {
          if (!r.tags) return {}
          if (typeof r.tags === 'string') return JSON.parse(r.tags)
          return r.tags
        } catch (_) { return {} }
      })()
      const locationFromCoords = (r.lat != null && r.long != null) ? `${r.lat}, ${r.long}` : ''
      return {
        id: r.client_a_uuid,
        name: r.business_name || 'Place',
        description: (r.description || r.ai_summary || '').slice(0, 200),
        postImages: postImages.slice(0, 8),
        profileImage: profileImage,
        clientType: (r.client_type || '').toLowerCase(),
        category: tagsObj.category || '',
        rating: r.rating != null ? Number(r.rating) : null,
        priceRange: priceDisplay,
        location: tagsObj.location || tagsObj.address || locationFromCoords,
        cuisine: tagsObj.cuisine || tagsObj.cuisine_type || '',
        phone: tagsObj.phone || null,
        email: tagsObj.email || null,
        website: tagsObj.website || null,
        openingHours: r.timings || tagsObj.opening_hours || null,
        reviewCount: reviewCounts[r.client_a_uuid] || 0,
      };
    });
    
    // Smart sorting: prioritize results with images and reviews
    const scored = results.map((r) => {
      let score = 0;
      if (r.postImages.length > 0) score += 100;
      score += r.postImages.length * 10;
      if (r.rating) score += r.rating * 5;
      if (r.reviewCount > 0) score += r.reviewCount * 2;
      if (r.description) score += 10;
      return { ...r, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    
    const finalResults = scored.slice(0, 6);
    
    console.log('[Khalid] Returning', finalResults.length, 'clients with enhanced data');
    console.log('[Khalid] Results have:', finalResults.filter(r => r.postImages.length > 0).length, 'with post images,', 
                finalResults.filter(r => r.rating).length, 'with ratings');
    return finalResults;
    
  } catch (error) {
    console.error('[Khalid] fetchClientsByQuery exception:', error);
    return [];
  }
}

const SWIPE_UP_THRESHOLD = 72;
const TAP_MAX_MOVE = 18;
const TAP_MAX_MS = 400;

const KHALID_SUGGESTIONS_DEFAULT = [
  'What are the best restaurants?',
  'Show me photos of places',
  'Where should I go for breakfast?',
  'Tell me about tourist attractions',
  'Find me something with great views',
];

function getSmartSuggestions(generalLabels = [], activityLabels = [], foodLabels = []) {
  const out = [];
  
  // Food preference-based suggestions
  if (foodLabels.length > 0) {
    out.push(`Best ${foodLabels[0].toLowerCase()} restaurants`);
    if (foodLabels.length > 1) out.push(`Where can I find ${foodLabels[1].toLowerCase()} food?`);
  }
  
  // Activity preference-based suggestions
  if (activityLabels.length > 0) {
    const activity = activityLabels[0].toLowerCase();
    if (activity.includes('beach') || activity.includes('water')) {
      out.push('Show me beaches and water activities');
    } else if (activity.includes('culture') || activity.includes('history')) {
      out.push('Historical and cultural sites');
    } else if (activity.includes('shop')) {
      out.push('Best shopping destinations');
    } else {
      out.push(`Places for ${activity}`);
    }
  }
  
  // General label-based suggestions
  if (generalLabels.some((l) => /family/i.test(l))) {
    out.push('Family-friendly places to visit');
  } else if (generalLabels.some((l) => /foodie/i.test(l)) && !out.some((s) => /restaurant/i.test(s))) {
    out.push('What are the best restaurants?');
  } else if (generalLabels.some((l) => /luxury|upscale/i.test(l))) {
    out.push('Upscale dining experiences');
  } else if (generalLabels.some((l) => /budget|cheap/i.test(l))) {
    out.push('Good budget-friendly options');
  }
  
  // Always include a photo suggestion if not present
  if (!out.some((s) => /photo|pic/i.test(s))) {
    out.push('Show me photos of places');
  }
  
  // Add defaults to fill up to 5 suggestions
  while (out.length < 5) {
    const next = KHALID_SUGGESTIONS_DEFAULT.find((d) => !out.includes(d));
    if (!next) break;
    out.push(next);
  }
  
  return out.slice(0, 5);
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TYPEWRITER_MS_PER_CHAR = 28;
const TYPEWRITER_MIN_MS = 500;
const TYPEWRITER_MAX_MS = 3800;

function AnimatedMessageText({ text, isUser, style }) {
  const fullLen = (text || '').length;
  const [visibleLen, setVisibleLen] = useState(isUser ? fullLen : 0);
  const progressRef = useRef(new Animated.Value(0)).current;
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    const len = fullLen;
    if (len === 0) {
      setVisibleLen(0);
      return;
    }
    if (isUser) return;
    const duration = Math.min(TYPEWRITER_MAX_MS, Math.max(TYPEWRITER_MIN_MS, len * TYPEWRITER_MS_PER_CHAR));
    const listener = progressRef.addListener(({ value }) => {
      setVisibleLen(Math.min(len, Math.floor(value * (len + 1))));
    });
    Animated.timing(progressRef, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      progressRef.removeListener(listener);
      setVisibleLen(len);
    });
    return () => progressRef.removeAllListeners();
  }, [fullLen, isUser, progressRef]);

  const displayText = (text || '').slice(0, visibleLen);
  const showCaret = !isUser && visibleLen < (text || '').length;

  return (
    <Text style={style}>
      {displayText}
      {showCaret ? (
        <Text style={{ color: 'rgba(200,16,46,0.75)', fontWeight: '600' }}>|</Text>
      ) : null}
    </Text>
  );
}

function KhalidClientBlock({ client, onViewProfile, onAskAbout, navigation }) {
  const typeIcon = client.clientType === 'restaurant' ? 'restaurant-outline'
    : client.clientType === 'event' ? 'calendar-outline'
    : 'location-outline';
  const typeColor = client.clientType === 'restaurant' ? '#F97316'
    : client.clientType === 'event' ? '#A855F7'
    : '#3B82F6';
  const ratingStars = client.rating ? Math.round(Math.min(5, Math.max(0, client.rating))) : 0;
  
  const postImages = (client.postImages || []).filter((x) => typeof x === 'string' && x.trim() !== '');
  const hasPostImages = postImages.length > 0;
  const heroImage = postImages[0] || null;
  const thumbImages = postImages.slice(1, 4);
  const extraCount = Math.max(0, postImages.length - 4);
  const typeLabel = client.clientType === 'restaurant' ? 'Restaurant' : client.clientType === 'event' ? 'Event' : 'Place';

  const handleViewProfile = () => {
    if (client.id && navigation) {
      navigation.navigate('Profile', { clientId: client.id });
    } else if (client.id && onViewProfile) {
      onViewProfile(client.id);
    }
  };

  return (
    <View style={styles.khalidClientBlockNew}>
      {hasPostImages ? (
        <View style={styles.khalidClientHeroWrap}>
          <CachedImage
            source={{ uri: heroImage }}
            style={styles.khalidClientHeroImage}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(7,6,10,0.85)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[`${typeColor}EE`, `${typeColor}AA`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.khalidClientTypeBadgeOverlay}
          >
            <Ionicons name={typeIcon} size={11} color="#FFFFFF" />
            <Text style={styles.khalidClientTypeBadgeOverlayText}>{typeLabel}</Text>
          </LinearGradient>
          {client.rating != null ? (
            <View style={styles.khalidClientHeroRatingChip}>
              <Ionicons name="star" size={11} color="#FBBF24" />
              <Text style={styles.khalidClientHeroRatingText}>{client.rating.toFixed(1)}</Text>
            </View>
          ) : null}
          <View style={styles.khalidClientHeroTitleWrap} pointerEvents="none">
            <Text style={styles.khalidClientHeroTitle} numberOfLines={1}>{client.name}</Text>
            {(client.cuisine || client.category) ? (
              <Text style={styles.khalidClientHeroSubtitle} numberOfLines={1}>
                {[client.cuisine, client.category].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          {thumbImages.length > 0 ? (
            <View style={styles.khalidClientThumbStrip}>
              {thumbImages.map((img, idx) => (
                <View key={idx} style={styles.khalidClientThumbWrap}>
                  <CachedImage source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
              ))}
              {extraCount > 0 ? (
                <View style={[styles.khalidClientThumbWrap, styles.khalidClientThumbMore]}>
                  <Text style={styles.khalidClientThumbMoreText}>+{extraCount}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.khalidClientNoImagesLarge}>
          <LinearGradient
            colors={[`${typeColor}30`, 'rgba(15,23,42,0.6)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name={typeIcon} size={36} color={`${typeColor}AA`} />
          <Text style={styles.khalidClientNoImagesText}>No photos yet</Text>
        </View>
      )}

      {/* Content Below Images */}
      <View style={styles.khalidClientContentBelow}>
        {/* Header with profile pic and name */}
        <View style={styles.khalidClientHeaderBelow}>
          {client.profileImage && typeof client.profileImage === 'string' ? (
            <CachedImage source={{ uri: client.profileImage }} style={styles.khalidClientProfilePicSmall} contentFit="cover" />
          ) : (
            <View style={[styles.khalidClientProfilePicSmall, styles.khalidClientProfilePlaceholder, { backgroundColor: typeColor + '22' }]}>
              <Ionicons name={typeIcon} size={12} color={typeColor} />
            </View>
          )}
          <View style={styles.khalidClientNameColumn}>
            <Text style={styles.khalidClientNameBelow} numberOfLines={1}>{client.name}</Text>
            {client.rating != null ? (
              <View style={styles.khalidClientRatingRowBelow}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Ionicons key={i} name={i < ratingStars ? 'star' : 'star-outline'} size={10} color={i < ratingStars ? '#FBBF24' : 'rgba(148,163,184,0.4)'} />
                ))}
                <Text style={styles.khalidClientRatingTextBelow}>{client.rating.toFixed(1)}</Text>
                {client.reviewCount > 0 ? <Text style={styles.khalidClientReviewCountBelow}>({client.reviewCount})</Text> : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Tags and cuisine */}
        {(client.cuisine || client.category || client.priceRange) ? (
          <View style={styles.khalidClientMetaRowBelow}>
            {client.cuisine ? <Text style={styles.khalidClientMetaTextBelow}>🍽️ {client.cuisine}</Text> : null}
            {client.category && client.cuisine ? <Text style={styles.khalidClientMetaDotBelow}>•</Text> : null}
            {client.category ? <Text style={styles.khalidClientMetaTextBelow}>{client.category}</Text> : null}
            {client.priceRange ? (
              <>
                <Text style={styles.khalidClientMetaDotBelow}>•</Text>
                <Text style={styles.khalidClientMetaTextBelow}>{client.priceRange}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Description */}
        {client.description ? (
          <Text style={styles.khalidClientDescBelow} numberOfLines={2}>{client.description}</Text>
        ) : null}

        {/* Location */}
        {client.location ? (
          <View style={styles.khalidClientLocationBelow}>
            <Ionicons name="location-outline" size={12} color="rgba(148,163,184,0.7)" />
            <Text style={styles.khalidClientLocationTextBelow} numberOfLines={1}>{client.location}</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.khalidClientActionsRow}>
          {/* Ask about this place button */}
          <TouchableOpacity
            style={styles.khalidClientAskBtn}
            onPress={() => onAskAbout && onAskAbout(client)}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={12} color="#60A5FA" />
            <Text style={styles.khalidClientAskBtnText}>Ask</Text>
          </TouchableOpacity>

          {/* View Profile Button */}
          {client.id ? (
            <TouchableOpacity
              style={styles.khalidClientViewBtnNew}
              onPress={handleViewProfile}
              activeOpacity={0.7}
            >
              <Text style={styles.khalidClientViewBtnTextNew}>View</Text>
              <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function KhalidCardRow({ item, onViewProfile, onAskAbout, navigation }) {
  const { action, loading, data, error } = item;
  
  console.log('[KhalidCardRow] Rendering with:', { 
    actionType: action?.type, 
    loading, 
    hasData: !!data, 
    dataKeys: data ? Object.keys(data) : [],
    error 
  });
  
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 100, friction: 10, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const isPost = action?.type === 'go_home_highlight_post';
  const isReviews = action?.type === 'go_community_filter_reviews';
  const isClients = action?.type === 'go_show_clients';
  const posts = (isPost && data?.posts) ? data.posts : [];
  const clients = (isClients && data?.clients) ? data.clients : [];
  
  console.log('[KhalidCardRow] isClients:', isClients, 'clients.length:', clients.length);

  const badgeLabel = isClients ? 'Places from Khalid' : isReviews ? 'Community Reviews' : 'From Khalid';
  const badgeIcon = isClients ? 'compass-outline' : isReviews ? 'chatbubbles-outline' : 'sparkles';

  return (
    <View style={[styles.khalidMessageRow, styles.khalidMessageRowAssistant]}>
      <View style={styles.khalidAvatar}>
        <Image
          source={require('../../assets/ai-button-logo.png')}
          style={styles.khalidAvatarImage}
          resizeMode="cover"
        />
      </View>
      <Animated.View style={[styles.khalidCardAnimatedWrap, { opacity, transform: [{ scale }] }]}>
        <View style={styles.khalidCard}>
          <View style={styles.khalidCardBadge}>
            <Ionicons name={badgeIcon} size={10} color="rgba(200,16,46,0.95)" />
            <Text style={styles.khalidCardBadgeText}>{badgeLabel}</Text>
          </View>

          {loading ? (
            <View style={[styles.khalidCardContent, styles.khalidCardContentRow]}>
              <View style={styles.khalidCardLoaderDots}>
                <View style={styles.khalidCardLoaderDot} />
                <View style={styles.khalidCardLoaderDot} />
                <View style={styles.khalidCardLoaderDot} />
              </View>
              <Text style={styles.khalidCardLoadingText}>
                {isClients ? 'Looking up places…' : 'Finding for you…'}
              </Text>
            </View>
          ) : error ? (
            <View style={[styles.khalidCardContent, styles.khalidCardErrorContent]}>
              <View style={styles.khalidCardErrorIconWrap}>
                <Ionicons name="cloud-offline-outline" size={22} color="#FCA5A5" />
              </View>
              <Text style={styles.khalidCardErrorText}>{error}</Text>
            </View>
          ) : isClients && clients.length > 0 ? (
            <View style={styles.khalidCardContent}>
              <View style={styles.khalidCardHeaderSection}>
                <Text style={styles.khalidCardSectionLabel}>
                  {clients.length} place{clients.length !== 1 ? 's' : ''} found
                </Text>
                <Text style={styles.khalidCardSectionSubtext}>
                  Tap "View Full Profile" to see complete details
                </Text>
              </View>
              {clients.map((client, idx) => (
                <KhalidClientBlock
                  key={client.id || idx}
                  client={client}
                  onViewProfile={onViewProfile}
                  onAskAbout={onAskAbout}
                  navigation={navigation}
                />
              ))}
            </View>
          ) : isPost && posts.length > 0 ? (
            <View style={styles.khalidCardContent}>
              <Text style={styles.khalidCardSectionLabel}>From your feed</Text>
              {posts.map((post, idx) => (
                <View
                  key={post.id || idx}
                  style={[styles.khalidCardPostBlock, idx === posts.length - 1 && styles.khalidCardPostBlockLast]}
                >
                  {post.imageUri && typeof post.imageUri === 'string' ? (
                    <View style={styles.khalidCardPostImageWrap}>
                      <CachedImage source={{ uri: post.imageUri }} style={styles.khalidCardPostImage} contentFit="cover" />
                      <LinearGradient
                        colors={['rgba(0,0,0,0)', 'rgba(7,6,10,0.85)']}
                        start={{ x: 0.5, y: 0.4 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.khalidCardPostImageShade}
                        pointerEvents="none"
                      />
                      <View style={styles.khalidCardPostTitleOverlay} pointerEvents="none">
                        {(post.businessName || post.description) ? (
                          <Text style={styles.khalidCardPostTitleOverlayText} numberOfLines={1}>
                            {post.businessName || post.description || 'Post'}
                          </Text>
                        ) : null}
                        {post.description ? (
                          <Text style={styles.khalidCardPostDescOverlay} numberOfLines={2}>
                            {post.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.khalidCardPostBody}>
                      {(post.businessName || post.description) ? (
                        <Text style={styles.khalidCardPostTitle} numberOfLines={1}>
                          {post.businessName || post.description || 'Post'}
                        </Text>
                      ) : null}
                      {post.description ? (
                        <Text style={styles.khalidCardPostDesc} numberOfLines={3}>
                          {post.description}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : isReviews && data ? (
            <View style={styles.khalidCardContent}>
              <Text style={styles.khalidCardSectionLabel}>Community reviews</Text>
              <Text style={styles.khalidCardReviewsTitle}>{data.place || 'This place'}</Text>
              {(data.reviews || []).length === 0 ? (
                <Text style={styles.khalidCardNoReviews}>No reviews yet. Be the first to share!</Text>
              ) : (
                (data.reviews || []).slice(0, 3).map((rev, idx) => (
                  <View key={rev.id || idx} style={styles.khalidCardReviewBlock}>
                    {rev.imageUri && typeof rev.imageUri === 'string' ? (
                      <View style={styles.khalidCardReviewImageWrap}>
                        <CachedImage source={{ uri: rev.imageUri }} style={styles.khalidCardReviewImage} contentFit="cover" />
                        {rev.rating != null ? (
                          <View style={styles.khalidCardReviewRatingChip}>
                            <Ionicons name="star" size={11} color="#FBBF24" />
                            <Text style={styles.khalidCardReviewRatingChipText}>{rev.rating}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    <View style={styles.khalidCardReviewContent}>
                      {(!rev.imageUri || typeof rev.imageUri !== 'string') && rev.rating != null ? (
                        <View style={styles.khalidCardReviewRating}>
                          <Ionicons name="star" size={14} color="#FBBF24" />
                          <Text style={styles.khalidCardReviewRatingText}>{rev.rating}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.khalidCardReviewBody} numberOfLines={3}>{rev.body || '—'}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : (
            <View style={[styles.khalidCardContent, styles.khalidCardErrorContent]}>
              <View style={styles.khalidCardEmptyIconWrap}>
                <Ionicons name="search-outline" size={24} color="rgba(148,163,184,0.7)" />
              </View>
              <Text style={styles.khalidCardEmptyText}>
                {isClients ? 'No places found. Try a different search!' : 'Nothing found here.'}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

/* ─── Khalid premium chat helpers ────────────────────────────────────────── */

const BAHRAIN_RED = '#C8102E'
const BAHRAIN_RED_DEEP = '#8B0719'
const BAHRAIN_GOLD = '#E9C877'

/* Aurora backdrop — two drifting gradient blobs tinted gold/red that breathe
 * behind the blurred panel for a premium cinematic look. */
function ChatAuroraBackdrop() {
  const a = useRef(new Animated.Value(0)).current
  const b = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loopA = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    const loopB = Animated.loop(
      Animated.sequence([
        Animated.timing(b, { toValue: 1, duration: 11000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(b, { toValue: 0, duration: 11000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loopA.start(); loopB.start()
    return () => { loopA.stop(); loopB.stop() }
  }, [a, b])

  const tx1 = a.interpolate({ inputRange: [0, 1], outputRange: [-40, 60] })
  const ty1 = a.interpolate({ inputRange: [0, 1], outputRange: [-20, 40] })
  const tx2 = b.interpolate({ inputRange: [0, 1], outputRange: [50, -70] })
  const ty2 = b.interpolate({ inputRange: [0, 1], outputRange: [100, 40] })
  const op1 = a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 0.85, 0.55] })
  const op2 = b.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 0.7, 0.4] })

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.khalidAuroraBlob, { opacity: op1, transform: [{ translateX: tx1 }, { translateY: ty1 }] }]}>
        <LinearGradient
          colors={['rgba(200,16,46,0.55)', 'rgba(200,16,46,0)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      <Animated.View style={[styles.khalidAuroraBlob, styles.khalidAuroraBlobGold, { opacity: op2, transform: [{ translateX: tx2 }, { translateY: ty2 }] }]}>
        <LinearGradient
          colors={['rgba(233,200,119,0.45)', 'rgba(233,200,119,0)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
    </View>
  )
}

/* Breathing halo ring behind the avatar — a rotating conic-like gradient
 * (faked with a LinearGradient ring) plus a subtle pulse scale. */
function AvatarHaloRing({ size = 48, children, active = true }) {
  const rotate = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!active) return undefined
    const r = Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
    )
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    r.start(); p.start()
    return () => { r.stop(); p.stop() }
  }, [active, rotate, pulse])
  const rot = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const s = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
  const op = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] })
  const ringSize = size + 6
  return (
    <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          opacity: op,
          transform: [{ rotate: rot }, { scale: s }],
        }}
      >
        <LinearGradient
          colors={[BAHRAIN_GOLD, BAHRAIN_RED, 'rgba(233,200,119,0)', BAHRAIN_GOLD]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: ringSize / 2 }}
        />
      </Animated.View>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#0F1626', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  )
}

/* Waveform typing indicator — 5 vertical bars that ripple like an audio
 * waveform with a gold→red gradient. Replaces the plain 3 dots. */
function WaveformTyping() {
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current
  useEffect(() => {
    const loops = bars.map((v, i) => Animated.loop(
      Animated.sequence([
        Animated.delay(i * 90),
        Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ))
    const safeLoops = Array.isArray(loops) ? loops : []
    safeLoops.forEach((l) => l.start())
    return () => safeLoops.forEach((l) => l.stop())
  }, [bars])
  return (
    <View style={styles.khalidWaveWrap}>
      {bars.map((v, i) => {
        const scaleY = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
        return (
          <Animated.View
            key={i}
            style={[
              styles.khalidWaveBar,
              { transform: [{ scaleY }] },
            ]}
          >
            <LinearGradient
              colors={[BAHRAIN_GOLD, BAHRAIN_RED]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1, borderRadius: 3 }}
            />
          </Animated.View>
        )
      })}
    </View>
  )
}

function BubbleIn({ isUser, children }) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const translateX = useRef(new Animated.Value(isUser ? 20 : -20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 280, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 280, friction: 10, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, tension: 280, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity, translateY, translateX]);

  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }, { translateX }], opacity }}>
      {children}
    </Animated.View>
  );
}

function buildKhalidSystemPrompt(pineconePlacesContext, userPreferences = {}) {
  const placesBlock =
    pineconePlacesContext && pineconePlacesContext.trim()
      ? `\n\n${pineconePlacesContext.trim()}\n`
      : '\n\nYou have access to Bahrain\'s best places, restaurants, and events through the app\'s database. When showing places, I will fetch the most relevant ones with photos and details.\n';
  const generalLabels = userPreferences.generalLabels || [];
  const activityLabels = userPreferences.activityLabels || [];
  const foodLabels = userPreferences.foodLabels || [];
  const personaSummary = typeof userPreferences.personaSummary === 'string' ? userPreferences.personaSummary.trim() : '';
  const hasPersona = personaSummary.length > 0;
  const hasGeneral = generalLabels.length > 0;
  const hasPlanPrefs = activityLabels.length > 0 || foodLabels.length > 0;
  const personaBlock = hasPersona
    ? `\n\n═══ WHO YOU'RE TALKING TO (use this as ground truth for tone + picks) ═══
${personaSummary}
Speak to them like you already know them. Recommend places that fit this person — not generic tourists. Your "reply" sentence should subtly reflect their vibe, not a one-size-fits-all blurb.\n`
    : '';
  const prefsBlock = (hasGeneral || hasPlanPrefs)
    ? `\n\nUSER PREFERENCES (personalize recommendations based on these):
${hasGeneral ? `Travel Style: ${generalLabels.join(', ')}. Tailor suggestions to match their interests and pace.\n` : ''}${hasPlanPrefs ? `Preferred Activities: ${activityLabels.length ? activityLabels.join(', ') : 'open to anything'}
Preferred Cuisines: ${foodLabels.length ? foodLabels.join(', ') : 'open to anything'}
Prioritize these preferences when making recommendations.\n` : ''}\n`
    : '';
  return `You are Khalid, a friendly and knowledgeable Bahraini local guide for SiyahaBH. Your goal is to help tourists discover the best of Bahrain by providing helpful, conversational responses with visual results.
${personaBlock}${prefsBlock}

YOUR PERSONALITY:
- Warm, welcoming, and enthusiastic about Bahrain
- Helpful and proactive — show don't ask
- Conversational and natural (like chatting with a local friend)
- Brief but informative (1-2 sentences max)
- Always eager to share great places with photos

UNDERSTANDING USER INTENT:
When users ask about places, restaurants, or things to do, they want:
1. Visual results (photos/images) whenever possible
2. Specific recommendations, not questions back
3. Relevant information about each place (ratings, cuisine, price range, location)
4. Quick, actionable suggestions they can explore immediately

CRITICAL DISTINCTION - When to SHOW vs ANSWER:
- SHOW (use go_show_clients): User wants to browse/discover multiple options
  Examples: "show me restaurants", "where can I eat", "find me beaches", "italian restaurants"
  
- ANSWER (NO action): User asks about a SPECIFIC named place or wants information
  Examples: "tell me about [Restaurant Name]", "what do you know about [Place]", "is [Name] good?", "tell me more about [specific place]"
  
When user mentions a SPECIFIC place name in their query, DO NOT use go_show_clients action. Just answer with information about that place.

QUERY INTERPRETATION EXAMPLES:
- "tell me about restaurants" → show restaurants with their details (use action)
- "tell me about Mado Restaurant" → answer about that specific restaurant (NO action)
- "what's good for breakfast" → show breakfast places (use action)
- "is Lantern Cafe good?" → answer about that specific cafe (NO action)
- "show me beaches" → show beach locations (use action)
- "what do you know about Al Areen Wildlife Park?" → answer about that specific place (NO action)
- "italian food" → show Italian restaurants (use action)
- "tell me more about Coco's Restaurant" → provide information about it (NO action)
- "things to do" → show popular places and attractions (use action)
- "expensive restaurants" → show upscale dining options (use action)
- "family friendly places" → show places suitable for families (use action)
- "photos of cafes" → show cafes with images (use action)
- "where can I get karak" → show places serving karak (use action)
- "romantic dinner spots" → show romantic restaurants (use action)
${placesBlock}

RESPONSE FORMAT (strict JSON):
{
  "reply": "friendly 1-2 sentence response that explains what you're showing",
  "actions": [action object or empty array]
}

ACTIONS YOU CAN USE:
1. go_show_clients - Your PRIMARY action for showing places/restaurants
   Format: {"type": "go_show_clients", "query": "search term", "client_type": "restaurant|place|event"}
   - query: specific cuisine, place type, or characteristic (e.g., "italian", "beach", "breakfast", "family")
   - client_type: "restaurant" for food/dining, "place" for attractions/locations, "event" for events, or "" for all
   - Use this action for ANY query about places, restaurants, food, attractions, or things to do

SMART QUERY EXTRACTION RULES:
Food/Restaurant Queries:
- "breakfast/lunch/dinner" → query: "breakfast/lunch/dinner", client_type: "restaurant"
- "[cuisine] food/restaurant" → query: "[cuisine]", client_type: "restaurant"
- "karak/coffee/tea" → query: "karak/coffee/tea", client_type: "restaurant"
- "expensive/cheap/budget" → query: "expensive/cheap/budget", client_type: "restaurant"
- "romantic/family" + food context → query: "romantic/family", client_type: "restaurant"

Place/Attraction Queries:
- "beach/park/museum/mall" → query: "[type]", client_type: "place"
- "things to do/attractions" → query: "", client_type: "place"
- "family friendly places" → query: "family", client_type: "place"
- "historical/cultural sites" → query: "historical/cultural", client_type: "place"

Generic Queries:
- "show me pics/photos" → query: "", client_type: ""
- "recommend something" → query: "", client_type: ""
- "what's good here" → query: "", client_type: ""

CONVERSATION EXAMPLES:

User: "tell me about good restaurants in Bahrain"
Response: {"reply": "Here are some of the best restaurants in Bahrain! I've got great options with photos, ratings, and all the details you need.", "actions": [{"type": "go_show_clients", "query": "", "client_type": "restaurant"}]}

User: "tell me more about Mado Restaurant"
Response: {"reply": "Mado is a popular Turkish restaurant in Bahrain known for their authentic Ottoman cuisine, especially their ice cream and desserts. They have great ambiance and family-friendly seating. Would you like to see their full profile or discover similar restaurants?", "actions": []}

User: "where can I get authentic italian food?"
Response: {"reply": "Check out these authentic Italian restaurants! They've got amazing dishes and great reviews.", "actions": [{"type": "go_show_clients", "query": "italian", "client_type": "restaurant"}]}

User: "is Villa Mamas good?"
Response: {"reply": "Villa Mamas is excellent! It's a highly-rated Bahraini restaurant offering modern takes on traditional dishes. They're known for their machboos, warm hospitality, and cozy atmosphere. Definitely worth a visit!", "actions": []}

User: "i want breakfast recommendations"
Response: {"reply": "Perfect! Here are the best breakfast spots in Bahrain to start your day right!", "actions": [{"type": "go_show_clients", "query": "breakfast", "client_type": "restaurant"}]}

User: "what do you know about Bahrain Fort?"
Response: {"reply": "Bahrain Fort (Qal'at al-Bahrain) is a UNESCO World Heritage Site and one of the most important archaeological sites in the region! It's an ancient harbor and capital dating back to 2300 BC, with stunning views and a museum. Great for history lovers and photographers!", "actions": []}

User: "show me some beaches"
Response: {"reply": "Bahrain has beautiful beaches! Here are the best ones you should visit.", "actions": [{"type": "go_show_clients", "query": "beach", "client_type": "place"}]}

User: "what are the top tourist attractions?"
Response: {"reply": "Here are Bahrain's must-visit attractions! I've included photos and all the info you need.", "actions": [{"type": "go_show_clients", "query": "", "client_type": "place"}]}

User: "family friendly restaurants"
Response: {"reply": "These family-friendly restaurants are perfect for dining with kids!", "actions": [{"type": "go_show_clients", "query": "family", "client_type": "restaurant"}]}

User: "expensive fancy dinner"
Response: {"reply": "Here are Bahrain's finest upscale dining experiences for a special night out!", "actions": [{"type": "go_show_clients", "query": "expensive fine dining", "client_type": "restaurant"}]}

User: "show me pics"
Response: {"reply": "Here you go! These are some of the best places in Bahrain with great photos.", "actions": [{"type": "go_show_clients", "query": "", "client_type": ""}]}

User: "hello" or "hi"
Response: {"reply": "Hey there! Welcome to Bahrain! I'm Khalid, your local guide. What would you like to explore today? I can show you restaurants, beaches, attractions, or anything else you're curious about!", "actions": []}

User: "thanks" or "thank you"
Response: {"reply": "You're very welcome! Feel free to ask if you need more recommendations. I'm here to help you discover the best of Bahrain!", "actions": []}

CRITICAL RULES:
1. If user asks about a SPECIFIC named place (e.g., "tell me about [Name]", "is [Name] good?"), DO NOT use go_show_clients — just answer with information
2. ONLY use go_show_clients action when the user wants to browse/discover MULTIPLE options (e.g., "show me restaurants", "find italian food")
3. Be conversational and helpful in your reply — explain what you're showing or answering
4. NEVER ask "what kind?" or "which one?" — decide and show results or answer immediately
5. If unsure about specifics when showing places, show broader results (empty query) rather than asking
6. Keep replies brief but warm (1-2 sentences)
7. Focus on being helpful and visual when showing options — tourists want to SEE choices
8. Always return valid JSON with "reply" and "actions" fields
9. When answering about a specific place, provide helpful details like cuisine, atmosphere, what they're known for, and recommendations`;
}

export default function BottomControlBar({ state, navigation }) {
  const { colors, isDark } = useTheme();
  const themeStyles = React.useMemo(() => ({
    wrapper: { backgroundColor: 'transparent' },
    /** Transparent host — real chrome is floatingDock */
    floatingBarHost: {
      backgroundColor: 'transparent',
    },
    floatingDock: {
      backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.5 : 0.14,
          shadowRadius: 24,
        },
        android: {
          elevation: 18,
        },
      }),
    },
    /** Tab icons: inactive gray; active = brand primary (filled icons read as red) */
    navIconInactive: isDark ? '#A8A8A8' : '#8E8E8E',
    navIconActive: colors.primary,
    /** Selected tab “liquid glass” (iOS-style frosted capsule behind glyph) */
    navTabGlassAndroidFallback: {
      backgroundColor: isDark ? 'rgba(72,72,78,0.78)' : 'rgba(255,255,255,0.78)',
    },
    navTabGlassBorder: {
      borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.92)',
    },
    navTabGlassSheenTop: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.72)',
    navTabGlassSheenMid: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.22)',
    navTabGlassSheenBot: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)',
    navTabGlassShadowIos: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.12,
      shadowRadius: 10,
    },
    fab: {
      backgroundColor: isDark ? colors.surfaceElevated : '#111827',
      borderColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(255,255,255,0.9)',
    },
    fabPlanShell: {
      backgroundColor: 'transparent',
      borderColor: isDark ? '#E9C877' : '#E3B85A',
    },
    fabPlanGradient: {
      ...Platform.select({
        ios: {
          shadowColor: colors.primaryDark,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.45 : 0.32,
          shadowRadius: 14,
        },
        android: { elevation: 10 },
      }),
    },
    /** When not on AI Plan: looks like other inactive tabs (not “always selected”) */
    fabPlanInactiveFab: {
      backgroundColor: 'transparent',
      borderColor: isDark ? 'rgba(233,200,119,0.88)' : 'rgba(227,184,90,0.92)',
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 8,
        },
        android: { elevation: 4 },
      }),
    },
    fabPlanInactiveGradient0: isDark ? '#3D4F63' : '#FFFFFF',
    fabPlanInactiveGradient1: isDark ? '#2A3648' : '#E8EEF5',
    fabPlanLabel: {
      color: colors.primary,
      fontWeight: '700',
    },
    fabLabel: { color: colors.textMuted },
    swipeUpRingTrack: { borderColor: colors.primaryMuted },
    swipeUpRingDot: { backgroundColor: colors.primary },
    khalidCardLinkText: { color: colors.primary },
    khalidHeaderAvatar: {
      backgroundColor: colors.primary,
      ...Platform.select({ ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 10 }, android: { elevation: 4 } }),
    },
    khalidSendBtn: Platform.OS === 'ios' ? { shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8 } : {},
  }), [colors, isDark])
  const insets = useSafeAreaInsets();
  const currentRouteName = state.routes[state.index]?.name;
  /** PanResponder is created once; closures must read latest route/nav via refs */
  const currentRouteNameRef = useRef(currentRouteName);
  const navigationRef = useRef(navigation);
  currentRouteNameRef.current = currentRouteName;
  navigationRef.current = navigation;
  const communityFocusedChild = React.useMemo(() => {
    const route = state.routes[state.index];
    if (route?.name !== 'Community' || route.state == null) return null;
    return getFocusedRouteNameFromRoute(route);
  }, [state]);
  const hideTabBarForCommunityDetail = communityFocusedChild === 'CommunityPostDetail';
  const hideTabBar = hideTabBarForCommunityDetail;
  const { generalLabels, activityLabels, foodLabels, preferences } = useUserPreferences();
  const personaSummary = preferences?.profileSummary || '';

  const navTabPressAnim = React.useMemo(() => {
    const o = {};
    const navScreens = Array.isArray(NAV_TAB_SCREENS) ? NAV_TAB_SCREENS : []
    navScreens.forEach((name) => {
      o[name] = new Animated.Value(1);
    });
    return o;
  }, []);
  const [aiPlanSheetAnim, setAiPlanSheetAnim] = useState(null);
  useEffect(() => aiPlanSheetLink.subscribe(setAiPlanSheetAnim), []);

  /** Plan FAB press feedback — opacity only (no scale) so the SVG map icon stays crisp */
  const planPressOpacity = useRef(new Animated.Value(1)).current;
  const longPressTriggeredRef = useRef(false);
  const [showKhalidOverlay, setShowKhalidOverlay] = useState(false);
  const [isHoldingForKhalid, setIsHoldingForKhalid] = useState(false);
  const dragProgress = useRef(new Animated.Value(0)).current;
  const swipeTriggeredRef = useRef(false);
  const touchStartTimeRef = useRef(0);
  const khalidBackdropOpacity = useRef(new Animated.Value(0)).current;
  const khalidBackdropScale = useRef(new Animated.Value(1)).current;
  const khalidContentScale = useRef(new Animated.Value(0.88)).current;
  const khalidContentOpacity = useRef(new Animated.Value(0)).current;
  const khalidContentTranslateY = useRef(new Animated.Value(64)).current;
  const [profileClientId, setProfileClientId] = useState(null);
  const [khalidMessages, setKhalidMessages] = useState([
    {
      id: 'intro',
      role: 'assistant',
      text: "Hi, I'm Khalid — your Bahrain guide. Ask me for breakfast spots, things to do, or say “show me pics” and I’ll help you discover the best of Bahrain.",
    },
  ]);
  const [khalidInput, setKhalidInput] = useState('');
  const [khalidLoading, setKhalidLoading] = useState(false);
  const [khalidInputFocused, setKhalidInputFocused] = useState(false);
  const [khalidError, setKhalidError] = useState(null);
  const lastOrbitChatTsRef = useRef(0);
  const khalidListRef = useRef(null);
  const khalidPrefetchRef = useRef({ key: '', context: '', inflight: null });
  const khalidPrefetchTimerRef = useRef(null);
  const typingDot1 = useRef(new Animated.Value(0)).current;
  const typingDot2 = useRef(new Animated.Value(0)).current;
  const typingDot3 = useRef(new Animated.Value(0)).current;
  const siriOrbScale = useRef(new Animated.Value(1)).current;
  const siriOrbOpacity = useRef(new Animated.Value(0.7)).current;

  const swipeRingRotation = dragProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const swipeRingOpacity = dragProgress.interpolate({
    inputRange: [0, 0.01],
    outputRange: [0.4, 1],
  });
  const typingScale1 = typingDot1.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] });
  const typingScale2 = typingDot2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] });
  const typingScale3 = typingDot3.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] });

  const scrollKhalidToEnd = () => {
    requestAnimationFrame(() => {
      khalidListRef.current?.scrollToEnd({ animated: true });
    });
  };

  const closeKhalidOverlay = () => {
    Animated.parallel([
      Animated.timing(khalidBackdropOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(khalidContentOpacity, {
        toValue: 0,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(khalidContentTranslateY, {
        toValue: 60,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(khalidContentScale, {
        toValue: 0.94,
        tension: 180,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowKhalidOverlay(false);
      khalidContentTranslateY.setValue(64);
    });
  };

  const runKhalidEntranceAnimation = () => {
    khalidBackdropOpacity.setValue(0);
    khalidBackdropScale.setValue(1);
    khalidContentScale.setValue(0.86);
    khalidContentOpacity.setValue(0);
    khalidContentTranslateY.setValue(64);
    Animated.parallel([
      Animated.timing(khalidBackdropOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(70),
        Animated.parallel([
          Animated.spring(khalidContentScale, {
            toValue: 1,
            tension: 150,
            friction: 9,
            useNativeDriver: true,
          }),
          Animated.timing(khalidContentOpacity, {
            toValue: 1,
            duration: 340,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(khalidContentTranslateY, {
            toValue: 0,
            tension: 150,
            friction: 9,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  };

  useEffect(() => {
    if (!showKhalidOverlay) return;
    runKhalidEntranceAnimation();
    const seedParts = [
      'best things to do in Bahrain today',
      ...(activityLabels || []).slice(0, 2),
      ...(foodLabels || []).slice(0, 2),
    ].filter(Boolean);
    const seedQuery = seedParts.join(', ');
    if (seedQuery) startKhalidPrefetch(seedQuery);
  }, [showKhalidOverlay]);

  useEffect(() => {
    const unsubscribe = khalidChatLink.subscribe((payload) => {
      if (!payload || payload.source !== 'orbit') return;
      const ts = Number(payload.ts || 0);
      if (!ts || ts === lastOrbitChatTsRef.current) return;
      lastOrbitChatTsRef.current = ts;
      const place = String(payload.place || 'this place').trim();
      const summary = String(payload.summary || '').trim();
      const text = summary || 'I do not have a summary yet for this place.';
      setShowKhalidOverlay(true);
      setKhalidError(null);
      setKhalidInput('');
      setKhalidMessages((prev) => ([
        ...prev,
        {
          id: `orbit-summary-${ts}`,
          role: 'assistant',
          text: `About ${place}:\n\n${text}`,
        },
      ]));
      setTimeout(scrollKhalidToEnd, 120);
    });
    return unsubscribe;
  }, []);

  const typingLoopRef = useRef(null);
  const siriOrbLoopRef = useRef(null);
  useEffect(() => {
    if (!khalidLoading) {
      typingLoopRef.current?.stop();
      siriOrbLoopRef.current?.stop();
      typingDot1.setValue(0);
      typingDot2.setValue(0);
      typingDot3.setValue(0);
      siriOrbScale.setValue(1);
      siriOrbOpacity.setValue(0.7);
      return;
    }
    const bounce = (anim, delay) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]);
    const oneCycle = Animated.parallel([
      bounce(typingDot1, 0),
      bounce(typingDot2, 120),
      bounce(typingDot3, 240),
    ]);
    const loop = Animated.loop(oneCycle);
    typingLoopRef.current = loop;
    loop.start();

    const siriOrbBreath = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(siriOrbScale, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(siriOrbOpacity, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(siriOrbScale, {
            toValue: 0.92,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(siriOrbOpacity, {
            toValue: 0.5,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
      { resetBeforeIteration: false }
    );
    siriOrbLoopRef.current = siriOrbBreath;
    siriOrbBreath.start();

    return () => {
      loop.stop();
      siriOrbBreath.stop();
      typingLoopRef.current = null;
      siriOrbLoopRef.current = null;
    };
  }, [khalidLoading, typingDot1, typingDot2, typingDot3, siriOrbScale, siriOrbOpacity]);

  const openKhalidFromSwipe = () => {
    if (swipeTriggeredRef.current) return;
    swipeTriggeredRef.current = true;
    longPressTriggeredRef.current = true;
    if (Platform.OS !== 'web') Vibration.vibrate(80);
    khalidBackdropOpacity.setValue(0);
    khalidBackdropScale.setValue(1);
    khalidContentScale.setValue(0.86);
    khalidContentOpacity.setValue(0);
    khalidContentTranslateY.setValue(64);
    setShowKhalidOverlay(true);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        touchStartTimeRef.current = Date.now();
        swipeTriggeredRef.current = false;
        setIsHoldingForKhalid(true);
        dragProgress.setValue(0);
        Animated.spring(planPressOpacity, {
          toValue: 0.88,
          useNativeDriver: true,
          friction: 8,
          tension: 220,
        }).start();
      },
      onPanResponderMove: (_, gestureState) => {
        if (swipeTriggeredRef.current) return;
        const { dy } = gestureState;
        const progress = Math.min(1, Math.max(0, -dy / SWIPE_UP_THRESHOLD));
        dragProgress.setValue(progress);
        if (progress >= 1) openKhalidFromSwipe();
      },
      onPanResponderRelease: (_, gestureState) => {
        const elapsed = Date.now() - touchStartTimeRef.current;
        const isTap =
          !swipeTriggeredRef.current &&
          Math.abs(gestureState.dy) <= TAP_MAX_MOVE &&
          elapsed < TAP_MAX_MS;
        Animated.spring(planPressOpacity, {
          toValue: 1,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }).start();
        setIsHoldingForKhalid(false);
        dragProgress.setValue(0);
        if (swipeTriggeredRef.current) return;
        if (isTap) {
          longPressTriggeredRef.current = false;
          if (Platform.OS !== 'web') Vibration.vibrate(40);
          const nav = navigationRef.current;
          if (currentRouteNameRef.current === 'AI Plan') {
            // No longer triggering build mode picker from nav button tap per user request
            nav.navigate('AI Plan');
          } else {
            nav.navigate('AI Plan');
          }
        }
      },
    }),
  ).current;

  const addActionCardAndMaybeNavigate = (action, openInApp) => {
    if (!action || !action.type) return;
    if (action.type === 'go_home_highlight_post') {
      const query = String(action.query || '').trim();
      if (!query) return;
      if (openInApp) {
        navigation.navigate('Home', {
          fromKhalid: { type: 'highlight_post', query, ts: Date.now() },
        });
        setTimeout(closeKhalidOverlay, 320);
      }
    } else if (action.type === 'go_community_filter_reviews') {
      const place = String(action.place || '').trim();
      if (!place) return;
      if (openInApp) {
        navigation.navigate('Community', {
          fromKhalid: { type: 'filter_reviews', place, ts: Date.now() },
        });
        setTimeout(closeKhalidOverlay, 320);
      }
    }
  };

  const handleKhalidAction = (action) => {
    console.log('[Khalid] handleKhalidAction called with:', action);
    
    if (!action || !action.type) {
      console.warn('[Khalid] No action or action.type, aborting');
      return;
    }
    
    const query = String(action.query || '').trim();
    const place = String(action.place || '').trim();
    const cardId = `card-${Date.now()}`;
    
    console.log('[Khalid] Creating card with ID:', cardId, 'type:', action.type, 'query:', query, 'place:', place);
    
    const cardMsg = {
      id: cardId,
      role: 'assistant',
      type: 'card',
      action: { type: action.type, query, place },
      loading: true,
      data: null,
      error: null,
    };
    
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    
    console.log('[Khalid] Adding card to messages');
    setKhalidMessages((prev) => {
      const updated = [...prev, cardMsg];
      console.log('[Khalid] Messages count after adding card:', updated.length);
      return updated;
    });
    setTimeout(scrollKhalidToEnd, 100);

    const updateCard = (update) => {
      console.log('[Khalid] Updating card', cardId, 'with:', update);
      setKhalidMessages((prev) =>
        prev.map((m) => {
          if (m.id === cardId) {
            console.log('[Khalid] Found and updating card:', cardId);
            return { ...m, ...update };
          }
          return m;
        })
      );
      setTimeout(scrollKhalidToEnd, 80);
    };

    if (action.type === 'go_home_highlight_post') {
      console.log('[Khalid] Fetching posts with query:', query);
      fetchPostsByQuery(query)
        .then((posts) => {
          console.log('[Khalid] Posts fetched:', posts?.length || 0);
          updateCard({ loading: false, data: posts?.length ? { posts } : null, error: null });
        })
        .catch((e) => {
          console.error('[Khalid] Posts fetch error:', e);
          updateCard({ loading: false, data: null, error: e?.message || 'Could not load posts' });
        });
    } else if (action.type === 'go_community_filter_reviews') {
      console.log('[Khalid] Fetching reviews for place:', place);
      fetchReviewsByPlace(place)
        .then((data) => {
          console.log('[Khalid] Reviews fetched:', data);
          updateCard({ loading: false, data, error: null });
        })
        .catch((e) => {
          console.error('[Khalid] Reviews fetch error:', e);
          updateCard({ loading: false, data: null, error: e?.message || 'Could not load reviews' });
        });
    } else if (action.type === 'go_show_clients') {
      const clientType = String(action.client_type || '').trim();
      console.log('[Khalid] ======= FETCHING CLIENTS =======');
      console.log('[Khalid] Query:', query);
      console.log('[Khalid] Client Type:', clientType);
      console.log('[Khalid] ================================');
      
      fetchClientsByQuery(query, clientType)
        .then((clients) => {
          console.log('[Khalid] ======= FETCH COMPLETE =======');
          console.log('[Khalid] Clients fetched:', clients?.length || 0, 'clients');
          if (clients && clients.length > 0) {
            console.log('[Khalid] Sample client:', clients[0]);
          }
          console.log('[Khalid] ================================');
          updateCard({ loading: false, data: clients?.length ? { clients } : null, error: null });
        })
        .catch((e) => {
          console.error('[Khalid] Clients fetch error:', e);
          updateCard({ loading: false, data: null, error: e?.message || 'Could not load places' });
        });
    } else {
      console.warn('[Khalid] Unknown action type:', action.type);
    }
  };

  const buildPrefetchKey = (text) => {
    const t = String(text || '').trim().toLowerCase();
    const g = (generalLabels || []).join(',');
    const a = (activityLabels || []).join(',');
    const f = (foodLabels || []).join(',');
    const p = personaSummary ? personaSummary.slice(0, 80) : '';
    return `${t}|${g}|${a}|${f}|${p}`;
  };

  const startKhalidPrefetch = (text) => {
    const trimmed = String(text || '').trim();
    if (trimmed.length < 4) return;
    const key = buildPrefetchKey(trimmed);
    const cache = khalidPrefetchRef.current;
    if (cache.key === key && (cache.context !== '' || cache.inflight)) return;
    const inflight = fetchPineconePlacesForChat(trimmed, {
      generalLabels,
      activityLabels,
      foodLabels,
      personaSummary,
    })
      .then((ctx) => {
        if (khalidPrefetchRef.current.key === key) {
          khalidPrefetchRef.current = { key, context: ctx || '', inflight: null };
        }
        return ctx || '';
      })
      .catch(() => {
        if (khalidPrefetchRef.current.key === key) {
          khalidPrefetchRef.current = { key, context: '', inflight: null };
        }
        return '';
      });
    khalidPrefetchRef.current = { key, context: '', inflight };
  };

  const scheduleKhalidPrefetch = (text) => {
    if (khalidPrefetchTimerRef.current) {
      clearTimeout(khalidPrefetchTimerRef.current);
      khalidPrefetchTimerRef.current = null;
    }
    khalidPrefetchTimerRef.current = setTimeout(() => {
      startKhalidPrefetch(text);
    }, 450);
  };

  const handleKhalidInputChange = (text) => {
    setKhalidInput(text);
    scheduleKhalidPrefetch(text);
  };

  const sendMessageWithText = async (text) => {
    const trimmed = String(text).trim();
    if (!trimmed || khalidLoading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextMessages = [...khalidMessages, userMsg];
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setKhalidMessages(nextMessages);
    setKhalidInput('');
    setKhalidError(null);
    scrollKhalidToEnd();

    try {
      setKhalidLoading(true);
      const historyForApi = nextMessages
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.text && m.type !== 'card'))
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.text,
        }));

      const cacheKey = buildPrefetchKey(trimmed);
      const cache = khalidPrefetchRef.current;
      let pineconePlacesContext = '';
      if (cache.key === cacheKey && cache.context) {
        pineconePlacesContext = cache.context;
      } else if (cache.key === cacheKey && cache.inflight) {
        pineconePlacesContext = (await cache.inflight) || '';
      } else {
        pineconePlacesContext = await fetchPineconePlacesForChat(trimmed, {
          generalLabels,
          activityLabels,
          foodLabels,
          personaSummary,
        });
        khalidPrefetchRef.current = { key: cacheKey, context: pineconePlacesContext || '', inflight: null };
      }
      const systemPrompt = buildKhalidSystemPrompt(pineconePlacesContext, {
        generalLabels,
        activityLabels,
        foodLabels,
        personaSummary,
      });

      const res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyForApi,
          ],
          temperature: 0.7,
          max_tokens: 600,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || `GPT error (${res.status})`);
      }

      const raw = json?.choices?.[0]?.message?.content?.trim();
      if (!raw) throw new Error('Empty reply from Khalid');

      console.log('[Khalid] GPT raw response:', raw);

      let replyText = raw;
      let actions = [];
      try {
        const parsed = JSON.parse(raw);
        console.log('[Khalid] Parsed JSON:', parsed);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.reply === 'string') replyText = parsed.reply;
          if (Array.isArray(parsed.actions)) actions = parsed.actions;
        }
      } catch (parseError) {
        console.warn('[Khalid] Failed to parse JSON, using raw text:', parseError.message);
        // fall back to raw text
      }

      console.log('[Khalid] Extracted actions:', actions);

      // Enhanced fallback: if reply mentions showing or recommending but no actions, auto-trigger go_show_clients
      // BUT: Do NOT trigger if user is asking about a SPECIFIC named place
      const replyLower = replyText.toLowerCase();
      const userMsgLower = trimmed.toLowerCase();
      const combinedLower = userMsgLower + ' ' + replyLower;
      
      // Check if user is asking about a specific place (mentions "tell me about/more", "is X good", etc.)
      const isAskingAboutSpecificPlace = /(tell me (about|more)|is .+ good|what do you know about|do you know|information about|details about)/i.test(userMsgLower);
      
      const mentionsShowing = /\b(show|here|check|pull|display|look at|take a look|these|some|recommend|suggest|find|discover|explore)\b/i.test(replyLower);
      const asksAboutPlaces = /(where|any|good|best|top|find|looking for)/i.test(userMsgLower);
      
      // Only auto-trigger if NOT asking about a specific place
      if (!isAskingAboutSpecificPlace && (mentionsShowing || asksAboutPlaces) && (!actions || actions.length === 0)) {
        console.log('[Khalid] Reply suggests showing results but no actions — auto-triggering go_show_clients');
        
        // Smart query extraction from user message and reply
        let autoQuery = '';
        let autoClientType = '';
        
        // Detect restaurant/food intent with comprehensive patterns
        if (/(restaurant|food|dish|eat|breakfast|lunch|dinner|brunch|cafe|coffee|tea|cuisine|italian|chinese|indian|arabic|lebanese|mexican|japanese|korean|thai|french|american|asian|european|middle eastern|karak|burger|pizza|pasta|sushi|steak|seafood|vegetarian|vegan|halal|fast food|fine dining|casual dining|bakery|dessert|ice cream)/i.test(combinedLower)) {
          autoClientType = 'restaurant';
          // Extract specific cuisine/food type from user query
          const cuisineMatch = userMsgLower.match(/(italian|chinese|indian|arabic|lebanese|mexican|japanese|korean|thai|french|american|asian|european|middle eastern)/i);
          const mealMatch = userMsgLower.match(/(breakfast|lunch|dinner|brunch)/i);
          const foodMatch = userMsgLower.match(/(karak|burger|pizza|pasta|sushi|steak|seafood|vegetarian|vegan)/i);
          const styleMatch = userMsgLower.match(/(fine dining|casual|upscale|expensive|cheap|budget|luxury|family|romantic)/i);
          
          if (cuisineMatch) autoQuery = cuisineMatch[1];
          else if (mealMatch) autoQuery = mealMatch[1];
          else if (foodMatch) autoQuery = foodMatch[1];
          else if (styleMatch) autoQuery = styleMatch[1];
        }
        // Detect place/attraction intent with comprehensive patterns
        else if (/(beach|park|museum|place|spot|attraction|landmark|fort|mall|shopping|market|souk|historical|cultural|temple|mosque|church|garden|zoo|aquarium|theme park|nature|outdoor|indoor|entertainment|activity|adventure|family friendly)/i.test(combinedLower)) {
          autoClientType = 'place';
          const placeMatch = userMsgLower.match(/(beach|park|museum|mall|shopping|market|souk|historical|cultural|fort|temple|mosque|garden|zoo|aquarium|theme park)/i);
          const styleMatch = userMsgLower.match(/(family friendly|romantic|adventure|nature|outdoor|indoor)/i);
          
          if (placeMatch) autoQuery = placeMatch[1];
          else if (styleMatch) autoQuery = styleMatch[1];
        }
        // Detect event intent
        else if (/(event|festival|concert|show|performance|entertainment|happening|activity)/i.test(combinedLower)) {
          autoClientType = 'event';
          const eventMatch = userMsgLower.match(/(festival|concert|show|performance)/i);
          if (eventMatch) autoQuery = eventMatch[1];
        }
        // Default: if user asks about anything generic or wants to see pictures/photos
        else if (/(pic|photo|image|show me|what's good|recommend|popular|trending)/i.test(combinedLower)) {
          autoClientType = '';
          autoQuery = '';
        }
        
        actions = [{ type: 'go_show_clients', query: autoQuery, client_type: autoClientType }];
        console.log('[Khalid] Auto-generated action:', actions[0]);
      } else if (isAskingAboutSpecificPlace) {
        console.log('[Khalid] User asking about specific place - NOT triggering auto-action');
      }

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: replyText,
      };
      LayoutAnimation.configureNext({
        duration: 260,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setKhalidMessages((prev) => [...prev, assistantMsg]);
      scrollKhalidToEnd();

      if (actions && actions.length > 0) {
        console.log('[Khalid] Processing actions:', actions);
        const safeActions = Array.isArray(actions) ? actions : [];
        safeActions.forEach(handleKhalidAction);
      } else {
        console.log('[Khalid] No actions to process');
      }
    } catch (e) {
      console.error('[KhalidOverlay] chat error', e);
      setKhalidError(e.message || 'Something went wrong talking to Khalid');
    } finally {
      setKhalidLoading(false);
    }
  };

  const sendKhalidMessage = () => sendMessageWithText(khalidInput);

  const handleAskAboutPlace = (client) => {
    const query = `Tell me more about ${client.name}`;
    setKhalidInput(query);
    sendMessageWithText(query);
  };

  const renderKhalidItem = ({ item }) => {
    console.log('[Khalid] renderKhalidItem called with item:', { id: item.id, type: item.type, role: item.role, hasAction: !!item.action });
    
    if (item.type === 'card' && item.action) {
      console.log('[Khalid] Rendering card with action:', item.action);
      return <KhalidCardRow item={item} onViewProfile={setProfileClientId} onAskAbout={handleAskAboutPlace} navigation={navigation} />;
    }
    const isUser = item.role === 'user';
    return (
      <BubbleIn isUser={isUser}>
        <View
          style={[
            styles.khalidMessageRow,
            isUser ? styles.khalidMessageRowUser : styles.khalidMessageRowAssistant,
          ]}
        >
          {!isUser && (
            <View style={styles.khalidAvatar}>
              <Image
                source={require('../../assets/ai-button-logo.png')}
                style={styles.khalidAvatarImage}
                resizeMode="cover"
              />
            </View>
          )}
          <View
            style={[
              styles.khalidBubble,
              isUser ? styles.khalidBubbleUser : styles.khalidBubbleAssistant,
            ]}
          >
            {isUser ? (
              <LinearGradient
                colors={[BAHRAIN_RED, BAHRAIN_RED_DEEP]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.khalidBubbleGradient]}
              />
            ) : (
              <LinearGradient
                colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.khalidBubbleGradient]}
                pointerEvents="none"
              />
            )}
            {!isUser && <View style={styles.khalidBubbleAccent} pointerEvents="none" />}
            <AnimatedMessageText
              text={item.text}
              isUser={isUser}
              style={[
                styles.khalidBubbleText,
                isUser ? styles.khalidBubbleTextUser : styles.khalidBubbleTextAssistant,
              ]}
            />
          </View>
        </View>
      </BubbleIn>
    );
  };

  const renderTypingIndicator = () => {
    if (!khalidLoading) return null;
    return (
      <BubbleIn isUser={false}>
        <View style={[styles.khalidMessageRow, styles.khalidMessageRowAssistant]}>
          <View style={styles.khalidAvatar}>
            <Image
              source={require('../../assets/ai-button-logo.png')}
              style={styles.khalidAvatarImage}
              resizeMode="cover"
            />
          </View>
          <View style={[styles.khalidBubble, styles.khalidBubbleAssistant, styles.khalidTypingBubble]}>
            <WaveformTyping />
          </View>
        </View>
      </BubbleIn>
    );
  };

  const handleNavigate = (screenName) => {
    if (currentRouteName === screenName) {
      // If already on Home screen, trigger scroll to top
      if (screenName === 'Home') {
        navigation.navigate(screenName, { scrollToTop: true, timestamp: Date.now() });
      }
      return;
    }
    navigation.navigate(screenName);
  };

  const handleNavPressIn = (screenName) => {
    if (!NAV_TAB_SCREENS.includes(screenName)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(navTabPressAnim[screenName], {
      toValue: 0.9,
      friction: 5,
      tension: 400,
      useNativeDriver: true,
    }).start();
  };

  const handleNavPressOut = (screenName) => {
    if (!NAV_TAB_SCREENS.includes(screenName)) return;
    Animated.spring(navTabPressAnim[screenName], {
      toValue: 1,
      friction: 5,
      tension: 280,
      useNativeDriver: true,
    }).start();
  };

  const navItems = [
    { screen: 'Home', label: 'Home' },
    { screen: 'Explore', label: 'Explore' },
    null, // center slot for AI Plan
    { screen: 'Community', label: 'Community' },
    { screen: 'Profile', label: 'Settings' },
  ];

  const isPlanRouteActive = currentRouteName === 'AI Plan';
  const isPlanMapOrbit = usePlanMapOrbitActive();
  const orbitTabBarShift = isPlanMapOrbit && isPlanRouteActive ? ORBIT_TAB_BAR_PULL_DOWN : 0;

  /** Slightly larger than default so filled tab SVGs read bolder in the 40×40 hit area */
  const navIconSize = 28;
  const planIconSize = 32;

  /** Bottom bar: full width; room above row for raised center FAB */
  const FLOAT_NAV_H_MARGIN = 0;
  const FAB_FLOAT_LIFT = 90;
  /** Dock sits on safe-area bottom only — no extra gap so the bar sits as low as possible */
  const bottomInset = insets.bottom;
  const tabBarBottomPad = hideTabBar ? 0 : bottomInset;

  const TabBarRoot = aiPlanSheetAnim ? Animated.View : View;
  const tabBarRootStyle = aiPlanSheetAnim
    ? [styles.wrapper, themeStyles.wrapper, { transform: [{ translateY: aiPlanSheetAnim }] }]
    : [styles.wrapper, themeStyles.wrapper];

  return (
    <TabBarRoot style={tabBarRootStyle}>
      <View
        style={[
          styles.floatingBarHost,
          themeStyles.floatingBarHost,
          {
            paddingBottom: 0,
            paddingHorizontal: FLOAT_NAV_H_MARGIN,
            paddingTop: FAB_FLOAT_LIFT,
            opacity: hideTabBar ? 0 : 1,
            overflow: 'visible',
            transform: orbitTabBarShift ? [{ translateY: orbitTabBarShift }] : undefined,
          },
        ]}
        pointerEvents={hideTabBar ? 'none' : 'auto'}
      >
        <View
          style={[
            styles.floatingDock,
            themeStyles.floatingDock,
            {
              paddingBottom: hideTabBar ? 0 : tabBarBottomPad,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}
        >
          <View style={styles.navRow}>
          {navItems.map((item, index) => {
            if (item === null) {
              return (
                <View
                  key="ai"
                  style={[styles.aiContainer, { marginTop: -FAB_FLOAT_LIFT, zIndex: 2 }]}
                >
                  {isHoldingForKhalid ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.swipeUpRing,
                        { opacity: swipeRingOpacity },
                      ]}
                    >
                      <View style={[styles.swipeUpRingTrack, themeStyles.swipeUpRingTrack]} />
                      <Animated.View
                        style={[
                          styles.swipeUpRingFillWrap,
                          { transform: [{ rotate: swipeRingRotation }] },
                        ]}
                      >
                        <View style={[styles.swipeUpRingDot, themeStyles.swipeUpRingDot]} />
                      </Animated.View>
                    </Animated.View>
                  ) : null}
                  <View style={styles.fabWrap} {...panResponder.panHandlers}>
                    <Animated.View style={{ opacity: planPressOpacity }}>
                      <View
                        style={[
                          styles.fab,
                          themeStyles.fabPlanShell,
                          isPlanRouteActive ? themeStyles.fabPlanGradient : themeStyles.fabPlanInactiveFab,
                        ]}
                      >
                        {isPlanRouteActive ? (
                          <>
                            <LinearGradient
                              colors={[colors.primaryDark, colors.primary, colors.primaryLight]}
                              locations={[0, 0.48, 1]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 0.9, y: 1 }}
                              style={styles.fabPlanFill}
                            />
                            <LinearGradient
                              colors={[
                                'rgba(255,255,255,0.34)',
                                'rgba(255,255,255,0.08)',
                                'rgba(0,0,0,0)',
                                'rgba(0,0,0,0.12)',
                              ]}
                              locations={[0, 0.22, 0.55, 1]}
                              start={{ x: 0.5, y: 0 }}
                              end={{ x: 0.5, y: 1 }}
                              style={styles.fabPlanGloss}
                            />
                          </>
                        ) : (
                          <LinearGradient
                            colors={[
                              themeStyles.fabPlanInactiveGradient0,
                              themeStyles.fabPlanInactiveGradient1,
                            ]}
                            start={{ x: 0.2, y: 0 }}
                            end={{ x: 0.85, y: 1 }}
                            style={styles.fabPlanFill}
                          />
                        )}
                        <View style={styles.fabPlanIcon}>
                          <MapLogoIcon
                            size={planIconSize}
                            color={isPlanRouteActive ? '#FFFFFF' : themeStyles.navIconInactive}
                            accessibilityLabel="Plan — Bahrain"
                            accessible
                          />
                        </View>
                      </View>
                    </Animated.View>
                  </View>
                  <Text
                    style={[
                      styles.planFabLabel,
                      isPlanRouteActive ? themeStyles.fabPlanLabel : themeStyles.fabLabel,
                      !isPlanRouteActive && styles.planFabLabelInactive,
                    ]}
                    numberOfLines={1}
                  >
                    Plan
                  </Text>
                </View>
              );
            }
            const isActive = currentRouteName === item.screen;
            const iconName = isActive ? item.iconActive : item.icon;
            const navTabIconColor = isActive ? themeStyles.navIconActive : themeStyles.navIconInactive;
            return (
              <Pressable
                key={item.screen}
                style={styles.navItem}
                onPress={() => handleNavigate(item.screen)}
                onPressIn={() => handleNavPressIn(item.screen)}
                onPressOut={() => handleNavPressOut(item.screen)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={item.label}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                android_ripple={
                  Platform.OS === 'android'
                    ? { color: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }
                    : undefined
                }
              >
                <Animated.View
                  style={[
                    { transform: [{ scale: navTabPressAnim[item.screen] }] },
                    isActive && Platform.OS === 'ios' && themeStyles.navTabGlassShadowIos,
                  ]}
                >
                  <View
                    style={[
                      styles.navTabIconWrap,
                      isActive && styles.navTabIconWrapGlassElev,
                    ]}
                  >
                    {isActive ? (
                      <>
                        {Platform.OS === 'ios' ? (
                          <BlurView
                            pointerEvents="none"
                            intensity={isDark ? 38 : 34}
                            tint={isDark ? 'dark' : 'light'}
                            style={[StyleSheet.absoluteFillObject, styles.navTabIconGlassBlurRadius]}
                          />
                        ) : (
                          <View
                            pointerEvents="none"
                            style={[
                              StyleSheet.absoluteFillObject,
                              styles.navTabIconGlassBlurRadius,
                              themeStyles.navTabGlassAndroidFallback,
                            ]}
                          />
                        )}
                        <LinearGradient
                          pointerEvents="none"
                          colors={[
                            themeStyles.navTabGlassSheenTop,
                            themeStyles.navTabGlassSheenMid,
                            themeStyles.navTabGlassSheenBot,
                          ]}
                          locations={[0, 0.38, 1]}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 1 }}
                          style={[StyleSheet.absoluteFillObject, styles.navTabIconGlassBlurRadius]}
                        />
                        <View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.navTabIconGlassBlurRadius,
                            styles.navTabGlassBorderHairline,
                            themeStyles.navTabGlassBorder,
                          ]}
                        />
                      </>
                    ) : null}
                    <View style={styles.navTabIconGlyphLayer}>
                      {item.screen === 'Home' ? (
                        <HomeLogoIcon size={navIconSize} color={navTabIconColor} accessible={false} />
                      ) : item.screen === 'Explore' ? (
                        <SearchLogoIcon size={navIconSize} color={navTabIconColor} accessible={false} />
                      ) : item.screen === 'Community' ? (
                        <CommunityLogoIcon size={navIconSize} color={navTabIconColor} accessible={false} />
                      ) : item.screen === 'Profile' ? (
                        <SettingsLogoIcon size={navIconSize} color={navTabIconColor} accessible={false} />
                      ) : (
                        <Ionicons
                          name={iconName}
                          size={navIconSize}
                          color={navTabIconColor}
                        />
                      )}
                    </View>
                  </View>
                </Animated.View>
              </Pressable>
            );
          })}
          </View>
        </View>
      </View>
      {/* Khalid overlay: Siri/Gemini-style assistant over the whole app */}
      <Modal visible={showKhalidOverlay} transparent animationType="none">
        <KeyboardAvoidingView
          style={styles.khalidRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={closeKhalidOverlay}>
            <Animated.View
              style={[
                styles.khalidBackdrop,
                {
                  opacity: khalidBackdropOpacity,
                  transform: [{ scale: khalidBackdropScale }],
                },
              ]}
            >
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.khalidBackdropDim} />
            </Animated.View>
          </TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.khalidContentWrap,
              {
                paddingTop: insets.top + 4,
                paddingBottom: insets.bottom + 6,
                opacity: khalidContentOpacity,
                transform: [{ scale: khalidContentScale }, { translateY: khalidContentTranslateY }],
              },
            ]}
          >
            <View style={styles.khalidContentBlur}>
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.khalidContentOverlay} />
              <ChatAuroraBackdrop />
            </View>

            {/* Drag handle */}
            <View style={styles.khalidDragHandleWrap} pointerEvents="none">
              <View style={styles.khalidDragHandle} />
            </View>

            <View style={styles.khalidHeader}>
              <View style={styles.khalidHeaderLeft}>
                <View style={styles.khalidHeaderAvatarWrap}>
                  <AvatarHaloRing size={48} active>
                    <Image
                      source={require('../../assets/ai-button-logo.png')}
                      style={styles.khalidHeaderAvatarImage}
                      resizeMode="cover"
                    />
                  </AvatarHaloRing>
                  <View style={styles.khalidHeaderOnlineDot} />
                </View>
                <View>
                  <Text style={styles.khalidHeaderTitle}>Khalid</Text>
                  <View style={styles.khalidHeaderSubtitleRow}>
                    {khalidLoading ? (
                      <>
                        <View style={styles.khalidHeaderStatusDotThinking} />
                        <Text style={styles.khalidHeaderSubtitleThinking}>Thinking…</Text>
                      </>
                    ) : (
                      <>
                        <View style={styles.khalidHeaderStatusDotOnline} />
                        <Text style={styles.khalidHeaderSubtitle}>AI · Your Bahrain guide</Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
              <TouchableOpacity
                onPress={closeKhalidOverlay}
                style={styles.khalidCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-down" size={24} color="rgba(148,163,184,0.9)" />
              </TouchableOpacity>
            </View>
            <LinearGradient
              colors={['rgba(233,200,119,0)', 'rgba(233,200,119,0.45)', 'rgba(200,16,46,0.35)', 'rgba(233,200,119,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.khalidHeaderDivider}
              pointerEvents="none"
            />

            <FlatList
              ref={khalidListRef}
              data={khalidMessages}
              keyExtractor={(item) => item.id}
              renderItem={renderKhalidItem}
              ListFooterComponent={renderTypingIndicator}
              contentContainerStyle={styles.khalidMessagesContent}
              onContentSizeChange={scrollKhalidToEnd}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />

            {khalidError ? (
              <View style={styles.khalidErrorBar}>
                <Ionicons name="warning-outline" size={18} color="#FCA5A5" />
                <Text style={styles.khalidErrorText} numberOfLines={2}>{khalidError}</Text>
              </View>
            ) : null}

            {!khalidLoading && !khalidMessages.some((m) => m.role === 'user') ? (
              <View style={styles.khalidSuggestionsWrap}>
                <View style={styles.khalidSuggestionsLabelRow}>
                  <Ionicons name="sparkles" size={12} color={BAHRAIN_GOLD} />
                  <Text style={styles.khalidSuggestionsLabel}>Quick suggestions</Text>
                </View>
                <View style={styles.khalidSuggestionsRow}>
                  {getSmartSuggestions(generalLabels, activityLabels, foodLabels).map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => sendMessageWithText(s)}
                      activeOpacity={0.75}
                      style={styles.khalidSuggestionChipWrap}
                    >
                      <LinearGradient
                        colors={['rgba(233,200,119,0.7)', 'rgba(200,16,46,0.7)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.khalidSuggestionChipBorder}
                      >
                        <View style={styles.khalidSuggestionChipInner}>
                          <Ionicons name="sparkles-outline" size={12} color={BAHRAIN_GOLD} style={{ marginRight: 6 }} />
                          <Text style={styles.khalidSuggestionChipText} numberOfLines={1}>{s}</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.khalidInputWrap}>
              <View
                style={[
                  styles.khalidInputPill,
                  khalidInputFocused && styles.khalidInputPillFocused,
                ]}
              >
                {khalidInputFocused && (
                  <LinearGradient
                    colors={['rgba(233,200,119,0.55)', 'rgba(200,16,46,0.55)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.khalidInputGlow}
                    pointerEvents="none"
                  />
                )}
                <TextInput
                  style={styles.khalidInput}
                  placeholder="Ask Khalid anything…"
                  placeholderTextColor="rgba(148,163,184,0.7)"
                  value={khalidInput}
                  onChangeText={handleKhalidInputChange}
                  editable={!khalidLoading}
                  onSubmitEditing={sendKhalidMessage}
                  onFocus={() => setKhalidInputFocused(true)}
                  onBlur={() => setKhalidInputFocused(false)}
                  returnKeyType="send"
                  multiline
                  maxLength={500}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.khalidSendBtn,
                  (!khalidInput.trim() || khalidLoading) && styles.khalidSendBtnDisabled,
                ]}
                onPress={sendKhalidMessage}
                disabled={!khalidInput.trim() || khalidLoading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={
                    !khalidInput.trim() || khalidLoading
                      ? ['rgba(71,85,105,0.7)', 'rgba(51,65,85,0.7)']
                      : [BAHRAIN_GOLD, BAHRAIN_RED, BAHRAIN_RED_DEEP]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.khalidSendBtnGradient}
                />
                {khalidLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Client profile modal — opened from Khalid cards */}
      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        onClose={() => setProfileClientId(null)}
      />
    </TabBarRoot>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    /** Stay above tab scenes (e.g. AI Plan sheet elevation, map filter chips) so the dock is never covered */
    zIndex: 2000,
    ...Platform.select({
      ios: {},
      android: { elevation: 48 },
    }),
  },
  floatingBarHost: {
    left: 0,
    right: 0,
    bottom: 0,
    position: 'absolute',
    overflow: 'visible',
  },
  /** Top-rounded bar flush to screen bottom; center FAB overlaps upward */
  floatingDock: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'visible',
    minHeight: 60,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingBottom: 0,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 48,
  },
  /** Tab icon tile — slightly squircle so glass reads closer to iOS frosted controls */
  navTabIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  navTabIconWrapGlassElev: {
    ...Platform.select({
      android: {
        elevation: 5,
      },
    }),
  },
  navTabIconGlassBlurRadius: {
    borderRadius: 14,
  },
  navTabGlassBorderHairline: {
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  navTabIconGlyphLayer: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  fabLabel: {
    fontSize: 10,
    color: '#262626',
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  planFabLabel: {
    fontSize: 10,
    color: '#262626',
    marginTop: 4,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  planFabLabelInactive: {
    opacity: 0.88,
  },
  fabPlanFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 31,
  },
  fabPlanGloss: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 31,
    zIndex: 1,
  },
  fabPlanIcon: {
    zIndex: 2,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: {
        elevation: 9,
      },
    }),
  },
  fabWrap: {
    position: 'relative',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
    minHeight: 68,
  },
  swipeUpRing: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeUpRingTrack: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2.5,
    borderColor: 'rgba(200,16,46,0.2)',
    backgroundColor: 'transparent',
  },
  swipeUpRingFillWrap: {
    position: 'absolute',
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  swipeUpRingDot: {
    position: 'absolute',
    top: 2,
    left: 37,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8102E',
  },
  khalidRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  khalidBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  khalidBackdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  khalidContentWrap: {
    flex: 1,
    paddingHorizontal: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.2, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  khalidContentBlur: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  khalidContentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,18,34,0.62)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  khalidAuroraBlob: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 320,
    height: 320,
    borderRadius: 160,
    overflow: 'hidden',
  },
  khalidAuroraBlobGold: {
    top: 200,
    left: 120,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  // Drag handle
  khalidDragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  khalidDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  khalidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  khalidHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  khalidHeaderAvatarWrap: {
    position: 'relative',
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidHeaderAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  khalidHeaderOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ADE80',
    borderWidth: 2,
    borderColor: 'rgba(10,18,34,0.95)',
    ...Platform.select({
      ios: { shadowColor: '#4ADE80', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  khalidHeaderTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: 0.1,
  },
  khalidHeaderSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  khalidHeaderSubtitle: {
    fontSize: 12,
    color: 'rgba(203,213,225,0.85)',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  khalidHeaderSubtitleThinking: {
    fontSize: 12,
    color: BAHRAIN_GOLD,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  khalidHeaderStatusDotOnline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    ...Platform.select({
      ios: { shadowColor: '#4ADE80', shadowOpacity: 0.8, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  khalidHeaderStatusDotThinking: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BAHRAIN_GOLD,
    ...Platform.select({
      ios: { shadowColor: BAHRAIN_GOLD, shadowOpacity: 0.9, shadowRadius: 5 },
      android: { elevation: 2 },
    }),
  },
  khalidHeaderDivider: {
    height: 1,
    marginHorizontal: 8,
    marginTop: 2,
  },
  khalidCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidMessagesContent: {
    flexGrow: 1,
    paddingVertical: 14,
    paddingBottom: 20,
  },
  khalidMessageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  khalidMessageRowUser: {
    justifyContent: 'flex-end',
  },
  khalidMessageRowAssistant: {
    justifyContent: 'flex-start',
  },
  khalidAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(200,16,46,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(200,16,46,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    marginBottom: 4,
    overflow: 'hidden',
  },
  khalidAvatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  khalidBubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 12 },
      android: { elevation: 5 },
    }),
  },
  khalidBubbleGradient: {
    borderRadius: 22,
  },
  khalidBubbleUser: {
    backgroundColor: 'transparent',
    borderBottomRightRadius: 6,
    borderWidth: 0,
    ...Platform.select({
      ios: { shadowColor: BAHRAIN_RED, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 14 },
      android: { elevation: 7 },
    }),
  },
  khalidBubbleAssistant: {
    backgroundColor: 'rgba(20,28,46,0.82)',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  khalidBubbleAccent: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 2,
    borderRadius: 1,
    backgroundColor: BAHRAIN_GOLD,
    opacity: 0.7,
  },
  khalidTypingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  khalidWaveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 20,
  },
  khalidWaveBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    overflow: 'hidden',
  },
  khalidSiriOrbWrap: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidSiriOrb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(200,16,46,0.85)',
  },
  khalidTypingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 20,
  },
  khalidTypingDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: 'rgba(200,16,46,0.85)',
  },
  khalidCardAnimatedWrap: {
    maxWidth: '88%',
  },
  khalidCard: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(18,28,46,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  khalidCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 2,
    marginLeft: 14,
    marginTop: 12,
    backgroundColor: 'rgba(200,16,46,0.14)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.25)',
  },
  khalidCardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(200,16,46,0.95)',
    letterSpacing: 0.5,
  },
  khalidCardContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    alignItems: 'flex-start',
    gap: 12,
  },
  khalidCardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  khalidCardLoaderDots: {
    flexDirection: 'row',
    gap: 6,
  },
  khalidCardLoaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(200,16,46,0.6)',
  },
  khalidCardLoadingText: {
    fontSize: 14,
    color: 'rgba(203,213,225,0.9)',
    marginLeft: 10,
    fontWeight: '500',
  },
  khalidCardErrorContent: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  khalidCardErrorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(248,113,113,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  khalidCardErrorText: {
    fontSize: 14,
    color: '#FCA5A5',
    textAlign: 'center',
  },
  khalidCardSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.9)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  khalidCardHeaderSection: {
    marginBottom: 14,
  },
  khalidCardSectionSubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(148,163,184,0.65)',
    marginTop: 2,
  },
  khalidCardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingRight: 4,
  },
  khalidCardLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C8102E',
  },
  khalidCardPostBlock: {
    width: '100%',
    marginBottom: 14,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(233,200,119,0.12)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  khalidCardPostBlockLast: {
    marginBottom: 0,
  },
  khalidCardPostImageWrap: {
    width: '100%',
    height: 200,
    position: 'relative',
    overflow: 'hidden',
  },
  khalidCardPostImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  khalidCardPostImageShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
  khalidCardPostTitleOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    gap: 3,
  },
  khalidCardPostTitleOverlayText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  khalidCardPostDescOverlay: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 17,
    letterSpacing: 0.15,
  },
  khalidCardPostBody: {
    width: '100%',
    padding: 12,
    gap: 4,
  },
  khalidCardPostTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  khalidCardPostDesc: {
    fontSize: 13,
    color: 'rgba(203,213,225,0.88)',
    lineHeight: 19,
  },
  khalidCardReviewsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  khalidCardNoReviews: {
    fontSize: 14,
    color: 'rgba(203,213,225,0.75)',
    fontStyle: 'italic',
  },
  khalidCardReviewBlock: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(233,200,119,0.12)',
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  khalidCardReviewImageWrap: {
    width: '100%',
    height: 140,
    position: 'relative',
    overflow: 'hidden',
  },
  khalidCardReviewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(30,41,59,0.5)',
  },
  khalidCardReviewRatingChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(7,6,10,0.8)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.5)',
  },
  khalidCardReviewRatingChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.2,
  },
  khalidCardReviewContent: {
    padding: 12,
    gap: 6,
  },
  khalidCardReviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  khalidCardReviewRatingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
  },
  khalidCardReviewBody: {
    fontSize: 13,
    color: 'rgba(203,213,225,0.9)',
    lineHeight: 19,
  },
  khalidCardEmptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  khalidCardEmptyText: {
    fontSize: 14,
    color: 'rgba(148,163,184,0.85)',
  },
  // ── Client blocks (go_show_clients) ──
  khalidClientBlock: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  khalidClientImageWrap: {
    width: '100%',
    height: 148,
    backgroundColor: 'rgba(30,41,59,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  khalidClientImageSlider: {
    width: '100%',
    height: '100%',
  },
  khalidClientImageSlide: {
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidClientImagePlaceholder: {
    height: 80,
  },
  khalidClientImage: {
    width: '100%',
    height: '100%',
  },
  khalidClientImageShade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: 'rgba(10,16,30,0.65)',
    pointerEvents: 'none',
  },
  khalidClientDotsWrap: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    pointerEvents: 'none',
  },
  khalidClientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  khalidClientDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  khalidClientTypeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  khalidClientTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  khalidClientBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  khalidClientName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.1,
  },
  khalidClientRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  khalidClientRatingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
    marginLeft: 2,
  },
  khalidClientReviewCount: {
    fontSize: 11,
    color: 'rgba(148,163,184,0.7)',
    marginLeft: 3,
    fontWeight: '500',
  },
  khalidClientPriceRange: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.8)',
    marginLeft: 6,
    fontWeight: '600',
  },
  khalidClientTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  khalidClientTag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  khalidClientTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(203,213,225,0.85)',
    letterSpacing: 0.2,
  },
  khalidClientDesc: {
    fontSize: 13,
    color: 'rgba(203,213,225,0.78)',
    lineHeight: 19,
  },
  khalidClientFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  khalidClientLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 8,
  },
  khalidClientLocationText: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.7)',
    flex: 1,
  },
  khalidClientViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(200,16,46,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.3)',
  },
  khalidClientViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C8102E',
  },
  // New client block design styles
  khalidClientBlockNew: {
    backgroundColor: 'rgba(18,28,46,0.95)',
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(233,200,119,0.14)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  khalidClientHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  khalidClientHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  khalidClientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  khalidClientProfilePic: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(71,85,105,0.5)',
  },
  khalidClientProfilePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidClientNameNew: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.2,
    flex: 1,
  },
  khalidClientRatingRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  khalidClientRatingTextNew: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FBBF24',
    marginLeft: 3,
  },
  khalidClientReviewCountNew: {
    fontSize: 11,
    color: 'rgba(148,163,184,0.65)',
    marginLeft: 2,
    fontWeight: '500',
  },
  khalidClientTypeBadgeNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  khalidClientTypeBadgeTextNew: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  khalidClientMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  khalidClientMetaText: {
    fontSize: 12,
    color: 'rgba(203,213,225,0.75)',
    fontWeight: '500',
  },
  khalidClientMetaDot: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.5)',
    fontWeight: '600',
  },
  khalidClientImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  khalidClientGridImageWrap: {
    width: '48.5%',
    aspectRatio: 1.2,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  khalidClientGridImage: {
    width: '100%',
    height: '100%',
  },
  khalidClientMoreImagesOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: '48.5%',
    aspectRatio: 1.2,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidClientMoreImagesText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  khalidClientNoImages: {
    height: 120,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.3)',
    gap: 6,
  },
  khalidClientNoImagesText: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.6)',
    fontWeight: '600',
  },
  khalidClientDescNew: {
    fontSize: 13,
    color: 'rgba(203,213,225,0.75)',
    lineHeight: 18,
    marginBottom: 8,
  },
  khalidClientLocationNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  khalidClientLocationTextNew: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.7)',
    fontWeight: '500',
    flex: 1,
  },
  khalidClientActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  khalidClientAskBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
  },
  khalidClientAskBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 0.2,
  },
  khalidClientViewBtnNew: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#C8102E',
    ...Platform.select({
      ios: {
        shadowColor: '#C8102E',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  khalidClientViewBtnTextNew: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  // Premium hero + thumb strip layout
  khalidClientHeroWrap: {
    width: '100%',
    height: 200,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  khalidClientHeroImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  khalidClientTypeBadgeOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  khalidClientTypeBadgeOverlayText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  khalidClientHeroRatingChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(7,6,10,0.75)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.5)',
  },
  khalidClientHeroRatingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.2,
  },
  khalidClientHeroTitleWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 56,
  },
  khalidClientHeroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  khalidClientHeroSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  khalidClientThumbStrip: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    gap: 6,
  },
  khalidClientThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidClientThumbMore: {
    backgroundColor: 'rgba(7,6,10,0.8)',
  },
  khalidClientThumbMoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  khalidClientNoImagesLarge: {
    height: 140,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  khalidClientContentBelow: {
    padding: 12,
    gap: 8,
  },
  khalidClientHeaderBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  khalidClientProfilePicSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(71,85,105,0.5)',
  },
  khalidClientNameColumn: {
    flex: 1,
    gap: 3,
  },
  khalidClientNameBelow: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  khalidClientRatingRowBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  khalidClientRatingTextBelow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
    marginLeft: 2,
  },
  khalidClientReviewCountBelow: {
    fontSize: 10,
    color: 'rgba(148,163,184,0.65)',
    marginLeft: 2,
    fontWeight: '500',
  },
  khalidClientMetaRowBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  khalidClientMetaTextBelow: {
    fontSize: 11,
    color: 'rgba(203,213,225,0.7)',
    fontWeight: '500',
  },
  khalidClientMetaDotBelow: {
    fontSize: 11,
    color: 'rgba(148,163,184,0.5)',
    fontWeight: '600',
  },
  khalidClientDescBelow: {
    fontSize: 12,
    color: 'rgba(203,213,225,0.7)',
    lineHeight: 17,
  },
  khalidClientLocationBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  khalidClientLocationTextBelow: {
    fontSize: 11,
    color: 'rgba(148,163,184,0.7)',
    fontWeight: '500',
    flex: 1,
  },
  khalidBubbleText: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.15,
  },
  khalidBubbleTextUser: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  khalidBubbleTextAssistant: {
    color: '#E8EDF4',
  },
  khalidInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  khalidInputPill: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
  },
  khalidInputPillFocused: {
    borderColor: 'rgba(233,200,119,0.55)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    ...Platform.select({
      ios: { shadowColor: BAHRAIN_GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  khalidInputGlow: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    height: 2,
    opacity: 0.9,
  },
  khalidInput: {
    minHeight: 46,
    maxHeight: 108,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 13 : 11,
    paddingBottom: Platform.OS === 'ios' ? 13 : 11,
    fontSize: 15,
    color: '#F8FAFC',
    backgroundColor: 'transparent',
  },
  khalidSendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: BAHRAIN_RED, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.55, shadowRadius: 12 },
      android: { elevation: 7 },
    }),
  },
  khalidSendBtnGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  khalidSendBtnDisabled: {
    opacity: 0.85,
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  khalidErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.22)',
  },
  khalidErrorText: {
    fontSize: 13,
    color: '#FCA5A5',
    flex: 1,
    lineHeight: 18,
  },
  khalidSuggestionsWrap: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  khalidSuggestionsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  khalidSuggestionsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: BAHRAIN_GOLD,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  khalidSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  khalidSuggestionChipWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: BAHRAIN_GOLD, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  khalidSuggestionChipBorder: {
    padding: 1,
    borderRadius: 22,
  },
  khalidSuggestionChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: 'rgba(18,28,46,0.92)',
  },
  khalidSuggestionChipText: {
    fontSize: 13,
    color: '#F1F5F9',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

