import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
  Image,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  FlatList,
  TouchableWithoutFeedback,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { OPENAI_KEY } from '../config/keys';
import { supabase } from '../config/supabase';
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_LIGHT,
  FONT_POPPINS_MEDIUM,
  FONT_POPPINS_REGULAR,
  FONT_POPPINS_SEMIBOLD,
} from '../constants/brandFont';
import {
  fetchPineconePlacesForChat,
  buildKhalidPineconeQueryText,
  extractKhalidTopicHintFromPriorTurns,
  isUserLocationInBahrain,
  normalizeViewerUType,
  resolvePlanRetrievalBuckets,
  generateDayPlan,
} from '../services/aiPipeline';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ClientProfileModal from '../components/ClientProfileModal';
import {
  buildKhalidIntroParts,
  buildKhalidSystemPrompt,
  sanitizeKhalidAssistantReplyPlain,
  splitKhalidReplyAndFollowUp,
} from '../services/khalidPrompt';
import { coerceImageValueToString, resolvePublicImageUrl } from '../utils/imageUrl';
import { resolveFeedPostImageUri } from '../services/feedService';
import { openGoogleMapsDirections } from '../utils/googleMapsDirections';
import { openGoogleMapsRouteForMarkers } from './aiPlan/planGeoAndShare';
import { PinchZoomPostImage } from '../components/FeedUpvoteInteractions';
import { CachedImage } from '../components/CachedImage';
const DEFAULT_PROFILE_IMAGE = require('../../assets/pfp.png')

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

/** Actions that change app settings or navigation (no listing cards). */
const KHALID_APP_CONTROL_ACTION_TYPES = new Set([
  'set_app_theme',
  'open_plan_builder',
  'navigate_tab',
  'open_saved_plans',
  'generate_inline_plan',
]);

const PICS_LIKE_QUERIES = ['pic', 'pics', 'photo', 'photos', 'image', 'images', 'picture', 'pictures', 'show me', 'posts', 'feed'];

/** Match Home feed: `resolveFeedPostImageUri` (+ full `resolvePublicImageUrl` fallback for odd shapes). */
function getFeedStylePostUri(raw) {
  if (raw == null || raw === '') return null;
  const asText = typeof raw === 'string' ? raw : coerceImageValueToString(raw);
  const preset = asText ? resolveFeedPostImageUri(asText) : null;
  if (preset) return preset;
  return resolvePublicImageUrl(raw);
}

function getPostImageUrl(row) {
  const raw = row.post_image ?? row.image ?? null;
  return getFeedStylePostUri(raw);
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
    const { data: clients } = await supabase.from('client').select('client_a_uuid, business_name').in('client_a_uuid', clientIds);
    const safeClients = Array.isArray(clients) ? clients : []
    safeClients.forEach((c) => {
      const id = c.client_a_uuid;
      clientMap[id] = c?.business_name || null;
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
  const cap = 8;
  if (Array.isArray(imageColumn)) return imageColumn.slice(0, cap);
  try {
    const parsed = JSON.parse(imageColumn);
    return Array.isArray(parsed) ? parsed.slice(0, cap) : [parsed].filter(Boolean);
  } catch {
    return [imageColumn].filter(Boolean);
  }
}

const mergeKhalidClientImageUrl = (imagesMap, clientId, url) => {
  if (!clientId || !url || typeof url !== 'string' || !url.trim()) return;
  if (!imagesMap[clientId]) imagesMap[clientId] = [];
  if (imagesMap[clientId].includes(url)) return;
  if (imagesMap[clientId].length >= 16) return;
  imagesMap[clientId].push(url);
};

const mergeKhalidClientImageColumns = (imagesMap, row, columns) => {
  const cid = row?.client_a_uuid;
  if (!cid) return;
  for (const col of columns) {
    const raw = row[col];
    if (raw == null || raw === '') continue;
    const rawImages = parseReviewImages(raw);
    const safe = Array.isArray(rawImages) ? rawImages : [];
    safe.forEach((img) => {
      const clean = getFeedStylePostUri(img);
      if (clean) mergeKhalidClientImageUrl(imagesMap, cid, clean);
    });
  }
};

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

const KHALID_GEO_CACHE_TTL_MS = 60 * 1000

function khalidHaversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return r * c
}

function formatKhalidDistanceKm(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return ''
  if (distanceKm < 1) return `${Math.max(1, Math.round(distanceKm * 1000))} m`
  return `${distanceKm.toFixed(1)} km`
}

function wantsKhalidProximityIntent(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return false
  if (
    /\b(near\s*me|nearby|close(?:st|t)?\s+to\s+me|around\s+(?:me|here)|my\s+location|where\s+am\s+i)\b/.test(s)
  ) {
    return true
  }
  if (
    /\b(what'?s\s+near|whats\s+near|anything\s+near|somewhere\s+near|spots?\s+near|places?\s+near|food\s+near|cafe\s+near|coffee\s+near|restaurants?\s+near)\b/.test(
      s,
    )
  ) {
    return true
  }
  if (/\b(closest|closet|nearest|shortest\s+distance|walking\s+distance)\b/.test(s)) return true
  return /\b(distance\s+from\s+here|around\s+this\s+area)\b/.test(s)
}

/**
 * Deterministic intent classifier used as a guardrail.
 * Helps avoid "restaurants vs places" swaps by overriding any model-suggested `client_type`.
 */
function inferKhalidClientType(text, priorClientType = '') {
  const s = String(text || '').trim().toLowerCase()
  const prior = String(priorClientType || '').trim().toLowerCase()
  const priorSafe =
    prior === 'restaurant' || prior === 'place' || prior === 'event' ? prior : ''

  if (!s) return priorSafe || ''

  const hasRestaurant = /\b(restaurant|restaurants|food|dish|eat|eats|eating|eatery|eateries|dining|breakfast|lunch|dinner|brunch|cafe|cafes|coffee|tea|cuisine|karak|bakery|dessert|ice\s?cream|italian|chinese|indian|arabic|lebanese|mexican|japanese|korean|thai|french|american|asian|european|middle\seastern|burger|pizza|pasta|sushi|steak|seafood|vegetarian|vegan|halal|fast\s?food|fine\sdining|casual\sdining)\b/.test(s)

  const hasEvent = /\b(event|events|festival|concert|gig|show|performance|happening)\b/.test(s)

  const hasGenericPlaceWords = /\b(place|places|spot|spots)\b/.test(s)
  const hasPlaceSpecificWords = /\b(attraction|attractions|beach|beaches|park|parks|museum|museums|mall|malls|shopping|market|markets|souk|souqs|historical|history|culture|cultural|temple|mosque|church|garden|zoo|aquarium|theme\s?park|nature|outdoor|indoor|walk|walks|sightseeing|view|views)\b/.test(s)

  // Precedence: explicit food/restaurants beats generic "places"
  if (hasRestaurant) return 'restaurant'
  if (hasEvent) return 'event'
  if (hasPlaceSpecificWords) return 'place'
  if (hasGenericPlaceWords) return priorSafe || 'place'

  // Generic "near/closest" should inherit the previous category (if known),
  // otherwise default to "place" because it's the more general discovery UI.
  const hasProx = /\b(near\s*me|nearby|close(?:st)?\s+to\s+me|around\s+(?:me|here)|closest|nearest)\b/.test(s)
  if (hasProx) return priorSafe || 'place'

  // Generic browsing (pics/more) inherits previous category.
  const isVagueBrowse =
    /\b(pics?|photos?|images?|pictures?|show\s*me|recommend|suggest|find|discover|explore|what'?s\s+good|more)\b/.test(
      s,
    )
  if (isVagueBrowse) return priorSafe || ''

  return priorSafe || ''
}

function inferKhalidExplicitClientTypeFromUser(text) {
  const s = String(text || '').trim().toLowerCase()
  if (!s) return ''

  const asksEvent = /\b(event|events|festival|concert|gig|show|performance|happening)\b/.test(s)
  if (asksEvent) return 'event'

  const asksPlace =
    /\b(fun\s+places?|places?\s+to\s+go|places?\s+to\s+visit|things?\s+to\s+do|attractions?|sightseeing|beaches?|parks?|museums?|malls?|shopping|views?|walks?)\b/.test(
      s,
    ) ||
    (/\bplaces?\b/.test(s) && !/\b(restaurants?|food|eating|dining|cafe|coffee|breakfast|lunch|dinner)\b/.test(s))
  if (asksPlace) return 'place'

  const asksRestaurant = /\b(restaurants?|food|eating|eatery|eateries|dining|cafe|coffee|breakfast|lunch|dinner|cuisine)\b/.test(s)
  if (asksRestaurant) return 'restaurant'

  return ''
}

function extractKhalidExplicitConstraint(text) {
  const s = String(text || '').trim().toLowerCase()
  if (!s) return { isSpecific: false, query: '', clientType: '' }

  const nearestLike = /\b(nearest|closest|closet)\b/.test(s)
  const hasRestaurantWord = /\b(restaurants?|food|eating|dining|eatery|eateries)\b/.test(s)
  const hasPlaceWord = /\b(places?|attractions?|things to do|fun)\b/.test(s)

  if (/\b(fast\s?food|fastfood)\b/.test(s)) {
    return { isSpecific: true, query: 'fast food', clientType: 'restaurant', wantsNearest: nearestLike }
  }
  if (/\b(sea\s?food|seafood)\b/.test(s)) {
    return { isSpecific: true, query: 'seafood', clientType: 'restaurant', wantsNearest: nearestLike }
  }
  if (/\b(cafe|cafes|coffee|coffee shop|coffeehouse)\b/.test(s)) {
    return { isSpecific: true, query: 'cafe', clientType: 'restaurant', wantsNearest: nearestLike }
  }

  // Nearest/closest with explicit category should stay exact to that category.
  if (nearestLike && hasRestaurantWord) {
    return { isSpecific: true, query: 'restaurant', clientType: 'restaurant', wantsNearest: true }
  }
  if (nearestLike && hasPlaceWord && !hasRestaurantWord) {
    return { isSpecific: true, query: 'place', clientType: 'place', wantsNearest: true }
  }

  return { isSpecific: false, query: '', clientType: '', wantsNearest: nearestLike }
}

function isKhalidSmallTalkOrCapabilitiesAsk(text) {
  const s = String(text || '').trim().toLowerCase()
  if (!s) return false
  if (
    /\b(how are you|who are you|what can you do|what do you do|help me|how does this work|what is this app|thanks|thank you|hello|hi|hey)\b/.test(
      s,
    )
  ) {
    return true
  }
  return /^(hi|hey|hello|yo|sup|how are you\??|what can you do\??|what do you do\??)$/i.test(s)
}

/** Remove chatty fillers so leftover words become a usable Supabase ilike query. */
function scrubKhalidUserTokensForSearch(userLower) {
  return String(userLower || '')
    .trim()
    .replace(
      /\b(best|better|nice|great|tell me about|tell me more|anything|things to do|where|what'?s a|somewhere|some|near me|nearby|nearest|closest|please|pls|give me|i want to|want|looking for|show me|recommend|suggest|find|discover|can you)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * When go_show_clients has an empty `query`, Khalid falls back to global top‑rated rows
 * every time → identical cards across different questions.
 * Builds keywords from the user's line (and vague photo follow-ups via topic hint).
 */
function buildKhalidBrowseAssist(trimmedUser, replyText, topicHintFromPrior) {
  const userMsgLower = String(trimmedUser || '').trim().toLowerCase()
  const replyLower = String(replyText || '').trim().toLowerCase()
  const combinedLower = `${userMsgLower} ${replyLower}`
  let clientTypeHint = ''
  let query = ''

  if (
    /(restaurant|food|dish|eat|eating|eatery|eateries|dining|breakfast|lunch|dinner|brunch|cafe|coffee|tea|cuisine|italian|chinese|indian|arabic|lebanese|mexican|japanese|korean|thai|french|american|asian|european|middle eastern|karak|burger|pizza|pasta|sushi|steak|seafood|vegetarian|vegan|halal|fast food|fine dining|casual dining|bakery|dessert|ice cream)/i.test(
      combinedLower,
    )
  ) {
    clientTypeHint = 'restaurant'
    const cuisineMatch = userMsgLower.match(
      /(italian|chinese|indian|arabic|lebanese|mexican|japanese|korean|thai|french|american|asian|european|middle eastern)/i,
    )
    const mealMatch = userMsgLower.match(/(breakfast|lunch|dinner|brunch)/i)
    const foodMatch = userMsgLower.match(/(karak|burger|pizza|pasta|sushi|steak|seafood|vegetarian|vegan)/i)
    const styleMatch = userMsgLower.match(/(fine dining|casual|upscale|expensive|cheap|budget|luxury|family|romantic)/i)
    if (cuisineMatch) query = cuisineMatch[1]
    else if (mealMatch) query = mealMatch[1]
    else if (foodMatch) query = foodMatch[1]
    else if (styleMatch) query = styleMatch[1]
    if (!query) {
      const scrubbed = scrubKhalidUserTokensForSearch(userMsgLower)
      if (scrubbed.length >= 2) query = scrubbed.slice(0, 120)
    }
  } else if (
    /(\bplaces?\b|\bspots?\b|beach|park|museum|attraction|landmark|fort|mall|shopping|market|souk|historical|cultural|temple|mosque|church|garden|zoo|aquarium|theme park|nature|outdoor|indoor)/i.test(
      combinedLower,
    )
  ) {
    clientTypeHint = 'place'
    const placeMatch = userMsgLower.match(
      /(beach|park|museum|mall|shopping|market|souk|historical|cultural|fort|temple|mosque|garden|zoo|aquarium|theme park)/i,
    )
    const styleMatch = userMsgLower.match(/(family friendly|romantic|adventure|nature|outdoor|indoor)/i)
    if (placeMatch) query = placeMatch[1]
    else if (styleMatch) query = styleMatch[1]
    if (!query) {
      const scrubbed = scrubKhalidUserTokensForSearch(userMsgLower)
      query = scrubbed.length >= 2 ? scrubbed.slice(0, 120) : ''
    }
  } else if (/(event|festival|concert|show|performance|happening)\b/i.test(combinedLower)) {
    clientTypeHint = 'event'
    const eventMatch = userMsgLower.match(/(festival|concert|show|performance)/i)
    if (eventMatch) query = eventMatch[1]
    else query = scrubKhalidUserTokensForSearch(userMsgLower).slice(0, 120)
  } else if (/(pic|photo|image|what'?s good|popular|trending)\b/i.test(combinedLower)) {
    const vagueVisualOnly =
      /^[\s,!?.]*(?:show\s+(?:me\s+)?(?:some\s+)?(?:pics?|photos?|images?)\s*)[\s,!?.]*$/i.test(trimmedUser) ||
      /^[\s,!?.]*(pics?|photos?)[\s!?.,]*$/i.test(trimmedUser)
    if ((vagueVisualOnly || /\b(pic|photo|image)\b/i.test(userMsgLower)) && topicHintFromPrior) {
      query = topicHintFromPrior
    }
  } else if (userMsgLower.length >= 4) {
    const scrubbed = scrubKhalidUserTokensForSearch(userMsgLower)
    if (scrubbed.length >= 3) query = scrubbed.slice(0, 120)
  }

  query = query.replace(/\s+/g, ' ').trim()

  const area = resolveBahrainAreaFromQuery(userMsgLower)
  if (area?.key) {
    if (!query) {
      query = area.key
    } else if (!query.toLowerCase().includes(area.key)) {
      query = `${area.key} ${query}`.trim().slice(0, 160)
    }
  }

  return { query: query.slice(0, 160), clientTypeHint }
}

function isKhalidBroadDiscoveryAsk(text) {
  const s = String(text || '').trim().toLowerCase()
  if (!s) return false
  if (
    /\b(random|anything|whatever|surprise me|variety|mix)\b/.test(s) &&
    /\b(places?|restaurants?|food|things to do|fun|activities|spots?)\b/.test(s)
  ) {
    return true
  }
  if (
    /^(show|find|give|recommend|suggest)\s+(me\s+)?(some\s+)?(random\s+)?(places?|restaurants?|things to do|fun things|spots?)\b/.test(
      s,
    )
  ) {
    return true
  }
  return /\b(show|recommend|suggest|find)\b.*\b(restaurants?|places?|fun things|things to do|activities)\b/.test(s)
}

function isKhalidGenericBrowseQuery(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  if (q.length <= 3) return true
  return /^(random|anything|whatever|all|any|best|top|popular|trending|places?|restaurants?|things to do|fun|activities)$/i.test(q)
}

function extractKhalidPersonaSoftHints(personaSummary = '', limit = 2) {
  const raw = String(personaSummary || '').toLowerCase()
  if (!raw) return []
  const dictionary = [
    'family friendly',
    'romantic',
    'quiet',
    'budget',
    'luxury',
    'adventure',
    'nightlife',
    'beach',
    'culture',
    'history',
    'shopping',
    'coffee',
    'brunch',
    'local',
    'scenic',
  ]
  const hits = []
  for (const token of dictionary) {
    if (raw.includes(token) && !hits.includes(token)) hits.push(token)
    if (hits.length >= limit) break
  }
  return hits
}

function buildKhalidVarietyQuery({
  userText,
  replyText,
  topicHintFromPrior,
  currentQuery,
  currentClientType,
  generalLabels = [],
  personaSummary = '',
}) {
  const baseAssist = buildKhalidBrowseAssist(userText, replyText, topicHintFromPrior)
  const broadAsk = isKhalidBroadDiscoveryAsk(userText)
  const existing = String(currentQuery || '').trim()
  const existingIsGeneric = isKhalidGenericBrowseQuery(existing)
  const shouldBuildNew = !existing || (broadAsk && existingIsGeneric)
  let query = shouldBuildNew ? String(baseAssist.query || '').trim() : existing

  const lowerUser = String(userText || '').toLowerCase()
  const inferredType =
    String(currentClientType || '').trim() || String(baseAssist.clientTypeHint || '').trim()
  const labelHints = []
  if (Array.isArray(generalLabels) && generalLabels.length > 0) {
    labelHints.push(String(generalLabels[0]).toLowerCase())
  }
  const personaHints = extractKhalidPersonaSoftHints(personaSummary, 2)
  const allHints = [...labelHints, ...personaHints]
    .map((h) => String(h || '').trim())
    .filter(Boolean)

  if (!query && broadAsk) {
    query = allHints[0] || ''
  } else if (broadAsk && allHints.length > 0 && query && query.split(/\s+/).length <= 3) {
    const hint = allHints.find((h) => !query.toLowerCase().includes(h))
    if (hint) query = `${query} ${hint}`.replace(/\s+/g, ' ').trim()
  }

  return {
    query: String(query || '').slice(0, 160).trim(),
    clientTypeHint: inferredType,
    broadAsk,
  }
}

function extractKhalidSpecificPlaceName(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, ' ').trim()
  const patterns = [
    /^tell me (?:more )?about\s+(.+)$/i,
    /^what do you know about\s+(.+)$/i,
    /^information about\s+(.+)$/i,
    /^details about\s+(.+)$/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match || !match[1]) continue
    const candidate = String(match[1] || '')
      .replace(/[?.!,]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (candidate.length >= 2) return candidate.slice(0, 160)
  }
  return ''
}

const KHALID_LISTING_CARD_ACTION_TYPES = new Set([
  'go_show_clients',
  'go_home_highlight_post',
  'go_community_filter_reviews',
])

/** User explicitly asked to browse listings / photos (not general Q&A). */
function isKhalidExplicitListingAsk(userText) {
  if (isKhalidVenueInfoAsk(userText) || isKhalidSmallTalkOrCapabilitiesAsk(userText)) return false
  const s = String(userText || '').trim().toLowerCase()
  if (!s) return false
  if (/\b(show\s+(me\s+)?(some\s+)?(pics?|photos?|images?)|^(pics?|photos?)\s*[!.?]*$)/i.test(s)) return true
  if (/\b(show|browse|open)\s+(me\s+)?(the\s+)?(cards?|listings?)\b/i.test(s)) return true
  if (isKhalidBroadDiscoveryAsk(userText)) return true
  if (
    /\b(show|find|list|pull up)\s+(me\s+)?/.test(s) &&
    /\b(restaurants?|cafes?|coffee shops?|places?|beaches|events?|spots?|options|listings?)\b/i.test(s)
  ) {
    return true
  }
  return false
}

const stripKhalidListingCardActions = (actions) =>
  (Array.isArray(actions) ? actions : []).filter((a) => a && !KHALID_LISTING_CARD_ACTION_TYPES.has(a.type))

/** User wants a text answer about one venue — no listing cards / photos. */
function isKhalidVenueInfoAsk(userText) {
  const userMsgLower = String(userText || '').trim().toLowerCase()
  const isBroadTellMeAsk =
    /tell me (about|more)\s+(restaurants?|food|cuisine|cuisines|cafes?|coffee|tea|places|spots|options|things|attractions?|beaches|museums?|malls?|shopping|events?|breakfast|lunch|dinner|nightlife)/i.test(
      userMsgLower,
    ) || /tell me about good\b/i.test(userMsgLower)
  if (isBroadTellMeAsk) return false
  return /(tell me (about|more)\s+\S+|is\s+.+\s+good\b|what do you know about|information about|details about)/i.test(
    userMsgLower,
  )
}

function doesKhalidClientNameMatchTarget(clientName, targetName) {
  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const name = normalize(clientName)
  const target = normalize(targetName)
  if (!name || !target) return false
  if (name === target) return true
  if (name.includes(target) || target.includes(name)) return true
  const nameTokens = name.split(' ').filter(Boolean)
  const targetTokens = target.split(' ').filter(Boolean)
  if (!nameTokens.length || !targetTokens.length) return false
  const overlap = targetTokens.filter((token) => nameTokens.includes(token)).length
  const minNeeded = Math.max(1, Math.min(targetTokens.length, 2))
  return overlap >= minNeeded
}

function isKhalidLikelyFollowUpTurn(text) {
  const t = String(text || '').trim().toLowerCase()
  if (!t || t.length > 120) return false
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|bye)\b/.test(t)) return false
  if (/^(yes|yeah|yep|sure|cool|nice|please|pls)\b/.test(t)) return true
  if (
    /\b(that|those|same\s+(one|place|spot)|there|them|these|it|one)\b/.test(t) ||
    /^(show\s*(me\s*)?(some\s*)?(pics?|photos?|images?|more)|pics?\b|photos?\b|more\b)/.test(t) ||
    /^(what|how)\s+about\s+/.test(t)
  ) {
    return true
  }
  return false
}

function extractKhalidAreaHint(text) {
  const area = resolveBahrainAreaFromQuery(text)
  return area?.key || ''
}

function deriveKhalidSessionContextUpdate({
  userText,
  replyText,
  actions,
  inferredClientType,
  priorContext,
}) {
  const prev = priorContext || {}
  const user = String(userText || '').trim()
  const topicFromUser = extractKhalidTopicHintFromPriorTurns([{ role: 'user', content: user }]) || ''
  const topicFromReply = (() => {
    const m = String(replyText || '')
      .replace(/\s+/g, ' ')
      .match(/\b(?:for|about|around)\s+([A-Za-z0-9'&\-\s]{3,90})/i)
    return m && m[1] ? m[1].trim() : ''
  })()
  const goShow = [...(Array.isArray(actions) ? actions : [])]
    .reverse()
    .find((a) => a && a.type === 'go_show_clients')
  const actionQuery = String(goShow?.query || '').trim()
  const actionType = String(goShow?.client_type || '').trim()
  const inferred = String(inferredClientType || '').trim()
  const topic = actionQuery || topicFromUser || topicFromReply || prev.topic || ''
  const area = extractKhalidAreaHint(user) || prev.area || ''
  const clientType = inferred || actionType || prev.clientType || ''
  const lastUserTurns = [...(Array.isArray(prev.lastUserTurns) ? prev.lastUserTurns : []), user]
    .filter(Boolean)
    .slice(-4)
  return {
    topic,
    area,
    clientType,
    lastQuery: actionQuery || prev.lastQuery || '',
    lastUserTurns,
    updatedAt: Date.now(),
  }
}

function buildKhalidSessionContextLine(ctx) {
  if (!ctx || typeof ctx !== 'object') return ''
  const topic = String(ctx.topic || '').trim()
  const area = String(ctx.area || '').trim()
  const clientType = String(ctx.clientType || '').trim()
  const lastQuery = String(ctx.lastQuery || '').trim()
  const parts = []
  if (topic) parts.push(`topic: ${topic}`)
  if (area) parts.push(`area: ${area}`)
  if (clientType) parts.push(`client_type: ${clientType}`)
  if (lastQuery) parts.push(`last_query: ${lastQuery}`)
  if (!parts.length) return ''
  return `\nACTIVE THREAD CONTEXT (session memory; use for vague follow-ups only): ${parts.join(' | ')}\n`
}

function parseClientTagsSafe(tagsRaw) {
  try {
    if (!tagsRaw) return {}
    if (typeof tagsRaw === 'string') return JSON.parse(tagsRaw)
    if (typeof tagsRaw === 'object') return tagsRaw
    return {}
  } catch (_) {
    return {}
  }
}

const BAHRAIN_AREA_ALIASES = [
  { key: 'muharraq', tokens: ['muharraq', 'amwaj', 'diyar', 'diyar al muharraq', 'hidd', 'busaiteen'] },
  { key: 'manama', tokens: ['manama', 'diplomatic area', 'hoora', 'gudaibiya', 'bab al bahrain'] },
  { key: 'seef', tokens: ['seef', 'city centre', 'city center', 'the avenues'] },
  { key: 'adliya', tokens: ['adliya', 'block 338', '338'] },
  { key: 'riffa', tokens: ['riffa', 'east riffa', 'west riffa'] },
  { key: 'saar', tokens: ['saar', 'janabiyah', 'janabiya', 'budaiya'] },
  { key: 'zallaq', tokens: ['zallaq', 'al areen'] },
]

function resolveBahrainAreaFromQuery(queryText) {
  const q = String(queryText || '').toLowerCase()
  if (!q) return null
  const hit = BAHRAIN_AREA_ALIASES.find((a) => a.tokens.some((t) => q.includes(t)))
  if (!hit) return null
  const strictAreaRequest =
    /\b(in|at|around|near|from)\b/.test(q) || /\bgovernorate\b/.test(q) || /\bregion\b/.test(q)
  return { ...hit, strictAreaRequest }
}

function getClientAreaBlob(clientRow, tagsObj = {}) {
  const parts = [
    clientRow?.business_name,
    clientRow?.description,
    clientRow?.ai_summary,
    clientRow?.location,
    clientRow?.address,
    tagsObj?.location,
    tagsObj?.address,
    tagsObj?.area,
    tagsObj?.district,
    tagsObj?.city,
    tagsObj?.governorate,
  ]
  return parts
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).toLowerCase())
    .join(' ')
}

function isKhalidGenericFoodDiscoveryQuery(queryText) {
  const q = String(queryText || '').trim().toLowerCase()
  if (!q) return true
  if (q.length <= 3) return true
  const specificFoodSignals =
    /\b(italian|chinese|indian|arabic|lebanese|mexican|japanese|korean|thai|french|american|asian|middle eastern|karak|burger|pizza|pasta|sushi|steak|seafood|vegetarian|vegan|breakfast|lunch|dinner|brunch|dessert|bakery|coffee|cafe)\b/.test(
      q,
    )
  if (specificFoodSignals) return false
  return /\b(restaurant|restaurants|food|eating|eatery|eateries|dining|places)\b/.test(q)
}

function shuffleKhalidRows(list) {
  const arr = Array.isArray(list) ? [...list] : []
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/** Parse lat/long from row + tags (Supabase varies: lat/long vs latitude/longitude/lng). */
function extractClientLatLng(row, tagsObj = {}) {
  const pairs = [
    [row?.lat, row?.long ?? row?.lng],
    [row?.latitude, row?.longitude ?? row?.lng],
    [tagsObj?.lat, tagsObj?.long ?? tagsObj?.lng],
    [tagsObj?.latitude, tagsObj?.longitude],
  ]
  for (const [a, b] of pairs) {
    const lat = a != null ? Number(a) : NaN
    const lng = b != null ? Number(b) : NaN
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { latCoord: lat, lngCoord: lng }
    }
  }
  return { latCoord: null, lngCoord: null }
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

async function fetchClientsByQuery(query, clientType = '', fetchOpts = {}) {
  try {
    const q = (query && String(query).trim()) ? query.trim().toLowerCase() : '';
    const strictClientName = String(fetchOpts.strictClientName || '').trim()
    const strictQueryMatch = Boolean(fetchOpts.strictQueryMatch)
    const userLat = fetchOpts.userLat != null ? Number(fetchOpts.userLat) : null
    const userLng = fetchOpts.userLng != null ? Number(fetchOpts.userLng) : null
    const sortByProximity = Boolean(fetchOpts.sortByProximity)
    const canSortByDistance =
      sortByProximity && Number.isFinite(userLat) && Number.isFinite(userLng) && userLat >= -90 && userLat <= 90 && userLng >= -180 && userLng <= 180
    const fetchLimit =
      canSortByDistance && String(clientType || '').trim() === 'restaurant'
        ? 80
        : canSortByDistance
          ? 48
          : 12
    console.log('[Khalid] fetchClientsByQuery called with query:', q, 'clientType:', clientType, 'proximity:', canSortByDistance, 'limit:', fetchLimit);
    
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
      
      const { data, error } = await clientQuery.order('rating', { ascending: false, nullsLast: true }).limit(fetchLimit);
      
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
      
      const { data, error } = await broadQuery.order('rating', { ascending: false, nullsLast: true }).limit(fetchLimit);
      
      if (error) {
        console.error('[Khalid] Query error in Strategy 2:', error);
      }
      
      if (data && data.length > 0) {
        rows = data.filter((r) => doesClientMatchSearchQuery(r, q))
        console.log('[Khalid] Found', rows.length, 'clients with broader search (tag-aware only)');
      }
    }

    if (rows.length === 0 && q.length >= 2) {
      console.log('[Khalid] No matches for query — skipping generic top-rated fallback:', q);
      return [];
    }
    
    // Strategy 3: top-rated by type only when there is no search query (open browse)
    if (rows.length === 0 && !q) {
      console.log('[Khalid] No specific results, fetching top-rated clients');
      let topQuery = supabase
        .from('client')
        .select('*');
      
      if (clientType) {
        topQuery = topQuery.eq('client_type', clientType);
      }
      
      const { data, error } = await topQuery.order('rating', { ascending: false, nullsLast: true }).limit(fetchLimit);
      
      if (error) {
        console.error('[Khalid] Query error in Strategy 3:', error);
      }
      
      if (data && data.length > 0) {
        rows = data;
        console.log('[Khalid] Found', rows.length, 'top-rated clients');
      }
    }
    
    if (rows.length === 0) {
      return [];
    }
    
    // Fetch images and review counts from community posts
    const clientIds = rows.map((r) => r.client_a_uuid).filter(Boolean);
    let imagesMap = {};
    let reviewCounts = {};
    
    if (clientIds.length > 0) {
      console.log('[Khalid] Fetching images and reviews for', clientIds.length, 'clients');

      const [commRes, feedRes] = await Promise.all([
        supabase
          .from('community')
          .select('client_a_uuid, image, rating')
          .in('client_a_uuid', clientIds)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('posts')
          .select('client_a_uuid, post_image')
          .in('client_a_uuid', clientIds)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (commRes?.error) console.warn('[Khalid] community images query:', commRes.error.message)
      if (feedRes?.error) console.warn('[Khalid] posts images query:', feedRes.error.message)

      const commRows = Array.isArray(commRes?.data) ? commRes.data : [];

      console.log('[Khalid] Found', commRows.length, 'community rows,', (feedRes?.data || []).length, 'feed posts');

      commRows.forEach((post) => {
        const cid = post.client_a_uuid;
        reviewCounts[cid] = (reviewCounts[cid] || 0) + 1;
        mergeKhalidClientImageColumns(imagesMap, post, ['image']);
      });

      const feedRows = Array.isArray(feedRes?.data) ? feedRes.data : [];
      feedRows.forEach((row) => {
        const uri = getPostImageUrl(row);
        if (uri) mergeKhalidClientImageUrl(imagesMap, row.client_a_uuid, uri);
      });
    }
    
    // Governorate/area-aware filtering:
    // if user asks for an area (e.g. Muharraq), keep only rows with evidence
    // that they belong to that area; if strict area request has zero matches,
    // return empty to avoid random out-of-area images.
    const resolvedArea = resolveBahrainAreaFromQuery(q)
    let filteredRows = rows
    if (resolvedArea && rows.length > 0) {
      const narrowed = rows.filter((r) => {
        const tagsObj = parseClientTagsSafe(r.tags)
        const blob = getClientAreaBlob(r, tagsObj)
        if (!blob) return false
        return resolvedArea.tokens.some((token) => blob.includes(token))
      })
      if (narrowed.length > 0) {
        filteredRows = narrowed
      } else if (resolvedArea.strictAreaRequest) {
        console.log('[Khalid] Area request strict with zero in-area matches, returning empty:', resolvedArea.key)
        return []
      }
    }

    // Build enhanced results with all available information
    const results = filteredRows.map((r) => {
      const uid = r.client_a_uuid;
      const profileImage = resolvePublicImageUrl(r.client_image);
      let postImages = imagesMap[uid] ? [...imagesMap[uid]] : [];
      if (postImages.length === 0 && profileImage) {
        postImages = [profileImage];
      }
      
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
      
      const tagsObj = parseClientTagsSafe(r.tags)
      const { latCoord, lngCoord } = extractClientLatLng(r, tagsObj)
      const locationText = String(tagsObj.location || tagsObj.address || '').trim()
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
        location: locationText,
        cuisine: tagsObj.cuisine || tagsObj.cuisine_type || '',
        phone: tagsObj.phone || null,
        email: tagsObj.email || null,
        website: tagsObj.website || null,
        openingHours: r.timings || tagsObj.opening_hours || null,
        reviewCount: reviewCounts[r.client_a_uuid] || 0,
        latCoord,
        lngCoord,
      };
    });
    
    // Smart sorting: prioritize results with images and reviews; optional distance-first
    const scored = results.map((r) => {
      let score = 0;
      if (r.postImages.length > 0) score += 100;
      score += r.postImages.length * 10;
      if (r.rating) score += r.rating * 5;
      if (r.reviewCount > 0) score += r.reviewCount * 2;
      if (r.description) score += 10;

      // Area awareness: boost rows that match detected Bahrain area tokens.
      const loc = (r.location || '').toLowerCase()
      if (resolvedArea) {
        const areaHit = resolvedArea.tokens.some((token) => loc.includes(token))
        if (areaHit) score += 85
        else if (clientType === 'restaurant') score -= 30
      }

      let distanceKm = null
      let distanceLabel = ''
      if (
        canSortByDistance &&
        r.latCoord != null &&
        r.lngCoord != null &&
        Number.isFinite(r.latCoord) &&
        Number.isFinite(r.lngCoord)
      ) {
        distanceKm = khalidHaversineKm(userLat, userLng, r.latCoord, r.lngCoord)
        distanceLabel = formatKhalidDistanceKm(distanceKm)
      }
      return { ...r, score, distanceKm, distanceLabel };
    });

    if (canSortByDistance) {
      scored.sort((a, b) => {
        const aHas = Number.isFinite(a.distanceKm)
        const bHas = Number.isFinite(b.distanceKm)
        if (aHas && !bHas) return -1
        if (!aHas && bHas) return 1
        if (aHas && bHas && a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
        return b.score - a.score
      })
    } else {
      scored.sort((a, b) => b.score - a.score);
    }

    const stripInternal = (row) => {
      const { score, latCoord, lngCoord, ...pub } = row
      return pub
    }
    let filteredScored = scored
    if (strictClientName) {
      const strictMatches = scored.filter((row) =>
        doesKhalidClientNameMatchTarget(row.name, strictClientName),
      )
      filteredScored = strictMatches
      console.log('[Khalid] Strict client-name filter:', strictClientName, 'matches:', strictMatches.length)
    }
    let picked = filteredScored
    const canDiversifyGenericFood =
      !strictClientName &&
      String(clientType || '').trim() === 'restaurant' &&
      !canSortByDistance &&
      isKhalidGenericFoodDiscoveryQuery(q)
    if (canDiversifyGenericFood) {
      const pool = filteredScored.slice(0, Math.min(24, filteredScored.length))
      picked = shuffleKhalidRows(pool)
      console.log('[Khalid] Diversifying generic restaurant discovery results. pool:', pool.length)
    }
    const finalResults = picked.slice(0, 6).map(stripInternal);
    
    console.log('[Khalid] Returning', finalResults.length, 'clients with enhanced data');
    console.log('[Khalid] Results have:', finalResults.filter(r => r.postImages.length > 0).length, 'with post images,', 
                finalResults.filter(r => r.rating).length, 'with ratings');
    return finalResults;
    
  } catch (error) {
    console.error('[Khalid] fetchClientsByQuery exception:', error);
    return [];
  }
}

const KHALID_SUGGESTIONS_TOURIST = [
  'What are the best restaurants?',
  'Show me photos of places',
  'Where should I go for breakfast?',
  'Tell me about tourist attractions',
  'Find me something with great views',
];

const KHALID_SUGGESTIONS_LOCAL = [
  'What should I try this weekend that locals love?',
  'Quiet spots for dinner outside mall crowds',
  'New openings worth a look right now',
  'Best karak paired with a late stroll?',
  'Tell me more about Adliya Block 338',
];

function getSmartSuggestions(generalLabels = [], viewerUType = 'local') {
  const out = [];
  out.push("What's closest to me?");

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
  
  const fallbackPool =
    String(viewerUType || '').toLowerCase() === 'tourist' ? KHALID_SUGGESTIONS_TOURIST : KHALID_SUGGESTIONS_LOCAL

  // Add defaults to fill up to 5 suggestions
  while (out.length < 5) {
    const next = fallbackPool.find((d) => !out.includes(d));
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

function TypingCaretBlink({ color }) {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.15, duration: 420, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return (
    <Animated.Text style={{ color, fontWeight: '700', opacity: op }}>|</Animated.Text>
  );
}

function AnimatedMessageText({ text, isUser, style, messageId, skipTypewriter = false, onTypewriterComplete }) {
  const fullText = String(text ?? '');
  const fullLen = fullText.length;
  const revealAll = isUser || skipTypewriter;
  const [visibleLen, setVisibleLen] = useState(() => (revealAll ? fullLen : 0));
  const progressRef = useRef(new Animated.Value(revealAll && !isUser ? 1 : 0)).current;
  const animRef = useRef(null);
  const listenerRef = useRef(null);
  const onCompleteRef = useRef(onTypewriterComplete);
  useEffect(() => {
    onCompleteRef.current = onTypewriterComplete;
  }, [onTypewriterComplete]);

  useEffect(() => {
    if (isUser) {
      setVisibleLen(fullLen);
      return;
    }

    if (revealAll) {
      setVisibleLen(fullLen);
      progressRef.setValue(1);
      return;
    }

    const stopAnim = () => {
      if (listenerRef.current != null) {
        progressRef.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
      if (animRef.current) {
        animRef.current.stop();
        animRef.current = null;
      }
    };

    stopAnim();
    progressRef.setValue(0);
    setVisibleLen(0);

    if (fullLen === 0) {
      return undefined;
    }

    const duration = Math.min(TYPEWRITER_MAX_MS, Math.max(TYPEWRITER_MIN_MS, fullLen * TYPEWRITER_MS_PER_CHAR));
    listenerRef.current = progressRef.addListener(({ value }) => {
      setVisibleLen(Math.min(fullLen, Math.floor(value * (fullLen + 1))));
    });

    const anim = Animated.timing(progressRef, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      stopAnim();
      if (!finished) return;
      setVisibleLen(fullLen);
      if (messageId) onCompleteRef.current?.(messageId);
    });

    return () => {
      stopAnim();
    };
  }, [fullText, fullLen, isUser, messageId, progressRef, revealAll]);

  const displayText = fullText.slice(0, visibleLen);
  const showCaret = !isUser && visibleLen < fullLen;

  return (
    <Text style={style}>
      {displayText}
      {showCaret ? <TypingCaretBlink color="rgba(233,200,119,0.95)" /> : null}
    </Text>
  );
}

/* Khalid place chips — pearl / champagne / burgundy palette (aligned with app brand gold) */
const KHALID_LUX_GOLD = '#E9C877'
const KHALID_LUX_INK = '#080A11'
const KHALID_LUX_PEARL = '#F4F1EA'
/** Fixed width so horizontal list items never stretch to full row (which looks like a vertical stack). */
const KHALID_PLACE_CARD_HOST_WIDTH = 164

/** Compact horizontally scrollable chip: bright photo, solid panel — minimal fade. */
function KhalidClientCompactCard({ client, onViewProfile, onAskAbout, enterIndex = 0 }) {
  const { isDark, colors } = useTheme()
  const opacity = useRef(new Animated.Value(0)).current
  const translateX = useRef(new Animated.Value(26)).current
  const scale = useRef(new Animated.Value(0.92)).current
  const clientKey = String(client.id ?? client.client_a_uuid ?? client.name ?? '');

  useEffect(() => {
    opacity.setValue(0)
    translateX.setValue(26)
    scale.setValue(0.92)
    const delay = Math.min(enterIndex * 52, 450)
    const sequence = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 112,
          useNativeDriver: true,
        }),
      ]),
    ])
    sequence.start()
    return () => {
      sequence.stop()
    }
  }, [clientKey, enterIndex, opacity, translateX, scale])

  const postImagesRaw = (client.postImages || []).filter((x) => typeof x === 'string' && x.trim() !== '');
  const profileHero =
    typeof client.profileImage === 'string' && client.profileImage.trim() !== ''
      ? client.profileImage.trim()
      : null;
  const postImages =
    postImagesRaw.length > 0
      ? postImagesRaw
      : profileHero
        ? [profileHero]
        : [];
  const heroUri = postImages[0] || null;
  const typeIcon = client.clientType === 'restaurant' ? 'restaurant-outline'
    : client.clientType === 'event' ? 'calendar-outline'
    : 'location-outline';
  const typeLabel = client.clientType === 'restaurant'
    ? 'Restaurant'
    : client.clientType === 'event'
      ? 'Event'
      : 'Place'
  const typeColor = client.clientType === 'restaurant' ? '#E8B86D'
    : client.clientType === 'event' ? '#C9A8E8'
    : '#8BAACC';

  const handleViewProfile = () => {
    const id = client.id ?? client.client_a_uuid ?? null;
    if (!id || !onViewProfile) return;
    onViewProfile(id);
  };

  const handleAskPress = () => {
    if (onAskAbout) onAskAbout(client);
  };

  const hasProfileId = Boolean(client.id ?? client.client_a_uuid);

  const phGradColors = isDark
    ? [`${typeColor}35`, 'rgba(22,26,36,1)']
    : [`${typeColor}28`, colors.surface]
  const shellBg = isDark ? 'rgba(16,19,28,1)' : colors.surface
  const shellBorder = isDark ? 'rgba(255,255,255,0.14)' : colors.border
  const titleColorDyn = isDark ? KHALID_LUX_PEARL : colors.textPrimary
  const distanceColorDyn = isDark ? 'rgba(233,200,119,0.92)' : colors.primary
  const bodyBg = isDark ? 'rgba(12,14,22,0.98)' : '#F8FAFC'
  const btnRowBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'
  const btnRowBorder = isDark ? 'rgba(255,255,255,0.08)' : colors.borderLight
  const metaTextColor = isDark ? 'rgba(226,232,240,0.72)' : colors.textSecondary
  const locationTextColor = isDark ? 'rgba(203,213,225,0.66)' : colors.textSecondary
  const priceColor = isDark ? 'rgba(233,200,119,0.95)' : colors.primary
  const locationValueRaw = String(client.location || '').trim()
  const locationLooksLikeCoords = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(locationValueRaw)
  const locationValue = locationLooksLikeCoords ? '' : locationValueRaw
  const cuisineOrCategory = String(client.cuisine || client.category || '').trim()
  const priceValue = String(client.priceRange || '').trim()

  return (
    <Animated.View
      style={[
        styles.khalidClientCardShadowHost,
        {
          width: KHALID_PLACE_CARD_HOST_WIDTH,
          opacity,
          transform: [{ translateX }, { scale }],
        },
      ]}
    >
      <View style={[styles.khalidPlaceCardShell, { backgroundColor: shellBg, borderColor: shellBorder }]}>
        <View style={styles.khalidClientCompactImageWrap}>
          {heroUri ? (
            <CachedImage source={{ uri: heroUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={phGradColors}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.khalidClientCompactPhInner]}
            >
              <Ionicons name={typeIcon} size={26} color={KHALID_LUX_GOLD} style={{ opacity: 0.75 }} />
            </LinearGradient>
          )}
        </View>
        <View style={[styles.khalidPlaceCardBody, { backgroundColor: bodyBg }]}>
          <Text style={[styles.khalidClientCompactTitle, { color: titleColorDyn }]} numberOfLines={2}>
            {client.name || 'Place'}
          </Text>
          <View style={styles.khalidClientCompactMetaRow}>
            <View style={styles.khalidClientCompactMetaTypeWrap}>
              <Ionicons name={typeIcon} size={10} color={typeColor} />
              <Text style={[styles.khalidClientCompactMetaText, { color: metaTextColor }]} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
            {cuisineOrCategory ? (
              <Text style={[styles.khalidClientCompactMetaDotText, { color: metaTextColor }]} numberOfLines={1}>
                {cuisineOrCategory}
              </Text>
            ) : null}
            {priceValue ? (
              <Text style={[styles.khalidClientCompactMetaPrice, { color: priceColor }]} numberOfLines={1}>
                {priceValue}
              </Text>
            ) : null}
          </View>
          {locationValue ? (
            <View style={styles.khalidClientCompactLocationRow}>
              <Ionicons name="location-outline" size={11} color={locationTextColor} />
              <Text style={[styles.khalidClientCompactLocationText, { color: locationTextColor }]} numberOfLines={1}>
                {locationValue}
              </Text>
            </View>
          ) : null}
          {client.distanceLabel ? (
            <Text style={[styles.khalidClientCompactDistance, { color: distanceColorDyn }]} numberOfLines={1}>
              {client.distanceLabel}
            </Text>
          ) : null}
          <View style={[styles.khalidClientCompactBtnRow, { backgroundColor: btnRowBg, borderTopColor: btnRowBorder }]}>
            <TouchableOpacity
              style={[styles.khalidClientLuxAskOuter, !hasProfileId && styles.khalidClientCompactBtnSingle]}
              onPress={handleAskPress}
              activeOpacity={0.82}
              accessibilityLabel={`Ask about ${client.name || 'this place'}`}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={13} color={KHALID_LUX_GOLD} />
              <Text style={styles.khalidClientCompactAskText}>Ask</Text>
            </TouchableOpacity>
            {hasProfileId ? (
              <TouchableOpacity
                onPress={handleViewProfile}
                activeOpacity={0.82}
                style={styles.khalidClientLuxViewTouch}
                accessibilityLabel={`View profile for ${client.name || 'this place'}`}
              >
                <LinearGradient
                  colors={isDark ? ['#A91F35', '#C8102E'] : ['#B61933', '#C8102E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.khalidClientLuxViewGrad}
                >
                  <Text style={styles.khalidClientCompactViewText}>View</Text>
                  <Ionicons name="arrow-forward-circle" size={14} color="#F8FAFC" />
                </LinearGradient>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function KhalidCardRow({ item, onViewProfile, onAskAbout }) {
  const { action, loading, data, error } = item;
  const { colors, isDark } = useTheme();
  
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

  const proximitySorted = Boolean(item.proximitySorted);
  const badgeLabel =
    proximitySorted && isClients
      ? 'Closest to you'
      : isClients
        ? 'Places from Khalid'
        : isReviews
          ? 'Community Reviews'
          : 'From Khalid';
  const badgeIcon =
    proximitySorted && isClients ? 'navigate-outline' : isClients ? 'compass-outline' : isReviews ? 'chatbubbles-outline' : 'sparkles';

  const isPlacesStrip = !loading && !error && isClients && clients.length > 0;
  const lightCardShell = !isDark
    ? isPlacesStrip
      ? { backgroundColor: colors.background, borderColor: colors.border }
      : { backgroundColor: colors.surface, borderColor: colors.border }
    : null;

  return (
    <View style={[styles.khalidMessageRow, styles.khalidMessageRowAssistantGpt, styles.khalidCardTurnWrap]}>
      <Animated.View style={[styles.khalidCardAnimatedWrap, styles.khalidCardAnimatedWrapFull, { opacity, transform: [{ scale }] }]}>
        <View
          style={[
            styles.khalidCard,
            isPlacesStrip ? styles.khalidCardPlacesStrip : null,
            lightCardShell,
          ]}
        >
          {!isClients ? (
            <View
              style={[
                styles.khalidCardBadge,
                isPlacesStrip ? styles.khalidCardBadgePlacesStrip : null,
                !isDark && {
                  backgroundColor: isPlacesStrip ? 'rgba(233,200,119,0.14)' : colors.primaryMuted,
                  borderColor: isPlacesStrip ? 'rgba(200,16,46,0.22)' : `${colors.primary}35`,
                },
              ]}
            >
              <Ionicons
                name={badgeIcon}
                size={isPlacesStrip ? 12 : 10}
                color={
                  isPlacesStrip
                    ? isDark
                      ? 'rgba(233,200,119,0.95)'
                      : colors.primary
                    : isDark
                      ? 'rgba(200,16,46,0.95)'
                      : colors.primary
                }
              />
              <Text
                style={[
                  styles.khalidCardBadgeText,
                  isPlacesStrip ? styles.khalidCardBadgeTextPlacesLux : null,
                  !isDark && { color: colors.primary },
                ]}
              >
                {badgeLabel}
              </Text>
            </View>
          ) : null}

          {loading ? (
            <View style={[styles.khalidCardContent, styles.khalidCardContentRow]}>
              <View style={styles.khalidCardLoaderDots}>
                <View style={styles.khalidCardLoaderDot} />
                <View style={styles.khalidCardLoaderDot} />
                <View style={styles.khalidCardLoaderDot} />
              </View>
              <Text style={[styles.khalidCardLoadingText, !isDark && { color: colors.textSecondary }]}>
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
            <View style={[styles.khalidCardContent, styles.khalidCardContentClientsCarousel]}>
              <FlatList
                horizontal
                data={clients}
                keyExtractor={(c, idx) => String(c.id || c.client_a_uuid || `khalid-place-${idx}`)}
                renderItem={({ item: client, index }) => (
                  <KhalidClientCompactCard
                    client={client}
                    onViewProfile={onViewProfile}
                    onAskAbout={onAskAbout}
                    enterIndex={index}
                  />
                )}
                style={styles.khalidClientsHorizontalList}
                contentContainerStyle={styles.khalidClientsHorizontalScroll}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              />
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
                      <PinchZoomPostImage
                        uri={post.imageUri}
                        style={[styles.khalidCardPostImage, { width: '100%', height: '100%' }]}
                        onImageDoubleTap={() => {}}
                      />
                      <LinearGradient
                        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(10,12,18,0.45)']}
                        locations={[0, 0.62, 1]}
                        start={{ x: 0.5, y: 0 }}
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
const KHALID_AVATAR = require('../../assets/khalid.png')

/* ── Inline plan card (rendered inside chat when Khalid generates a plan) ── */

const PLAN_TIME_ICON = { Morning: 'sunny-outline', Afternoon: 'partly-sunny-outline', Evening: 'moon-outline' }
const PLAN_TIME_COLOR = { Morning: '#F59E0B', Afternoon: '#F97316', Evening: '#7C3AED' }
const PLAN_TYPE_ICON = { restaurant: 'restaurant-outline', place: 'location-outline', event: 'calendar-outline' }

const InlinePlanStop = ({ stop, index, isDark, colors, onPress, onNavigate }) => {
  const timeColor = PLAN_TIME_COLOR[stop.time] || '#94A3B8'
  const typeIcon = PLAN_TYPE_ICON[stop.type] || 'location-outline'
  const timeIcon = PLAN_TIME_ICON[stop.time] || 'time-outline'
  const guide = stop.guide || {}
  const hasCoords = Number.isFinite(stop.lat) && Number.isFinite(stop.lng)

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress?.(stop)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${stop.spot}`}
      style={[
        inlinePlanStyles.stop,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surface,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        },
      ]}
    >
      {/* Timeline dot + connector */}
      <View style={inlinePlanStyles.timeline}>
        <View style={[inlinePlanStyles.timelineDot, { backgroundColor: timeColor }]}>
          <Text style={inlinePlanStyles.timelineDotText}>{index + 1}</Text>
        </View>
        <View style={[inlinePlanStyles.timelineLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.borderLight }]} />
      </View>

      {/* Content */}
      <View style={inlinePlanStyles.stopContent}>
        <View style={inlinePlanStyles.stopHeader}>
          <Ionicons name={timeIcon} size={12} color={timeColor} />
          <Text style={[inlinePlanStyles.stopTime, { color: timeColor }]}>{stop.time}</Text>
          <Ionicons name={typeIcon} size={12} color={colors.textMuted} style={{ marginLeft: 6 }} />
          <Text style={[inlinePlanStyles.stopType, { color: colors.textMuted }]}>
            {stop.type === 'restaurant' ? 'Dining' : stop.type === 'event' ? 'Event' : 'Visit'}
          </Text>
        </View>
        <Text style={[inlinePlanStyles.stopName, { color: colors.textPrimary }]} numberOfLines={2}>
          {stop.spot}
        </Text>
        {guide.highlight ? (
          <Text style={[inlinePlanStyles.stopHighlight, { color: timeColor }]} numberOfLines={1}>
            {guide.highlight}
          </Text>
        ) : null}
        {(guide.why || stop.reason) ? (
          <Text style={[inlinePlanStyles.stopReason, { color: colors.textSecondary }]} numberOfLines={2}>
            {guide.why || stop.reason}
          </Text>
        ) : null}
        <View style={inlinePlanStyles.stopFooter}>
          {guide.tip ? (
            <View style={inlinePlanStyles.stopTipRow}>
              <Ionicons name="bulb-outline" size={11} color={colors.textMuted} />
              <Text style={[inlinePlanStyles.stopTip, { color: colors.textMuted }]} numberOfLines={1}>
                {guide.tip}
              </Text>
            </View>
          ) : null}
          {hasCoords ? (
            <TouchableOpacity
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => {
                e.stopPropagation?.()
                onNavigate?.(stop)
              }}
              style={[inlinePlanStyles.navBtn, { backgroundColor: `${timeColor}18` }]}
              accessibilityRole="button"
              accessibilityLabel={`Navigate to ${stop.spot}`}
            >
              <Ionicons name="navigate-outline" size={12} color={timeColor} />
              <Text style={[inlinePlanStyles.navBtnText, { color: timeColor }]}>Navigate</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const InlinePlanCard = ({ plan, loading, error, isDark, colors, onStopPress, onNavigateStop, onOpenFullRoute }) => {
  if (loading) {
    return (
      <View style={[
        inlinePlanStyles.card,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        },
      ]}>
        <View style={inlinePlanStyles.loadingWrap}>
          <ActivityIndicator size="small" color={BAHRAIN_RED} />
          <Text style={[inlinePlanStyles.loadingText, { color: colors.textSecondary }]}>
            Building your perfect day...
          </Text>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[
        inlinePlanStyles.card,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
          borderColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(185,28,28,0.15)',
        },
      ]}>
        <Text style={[inlinePlanStyles.errorText, { color: colors.error }]}>
          Could not build a plan right now — try again in a moment.
        </Text>
      </View>
    )
  }

  if (!Array.isArray(plan) || plan.length === 0) return null

  const morningStops = plan.filter((s) => s.time === 'Morning')
  const afternoonStops = plan.filter((s) => s.time === 'Afternoon')
  const eveningStops = plan.filter((s) => s.time === 'Evening')
  const hasAnyCoords = plan.some((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))

  return (
    <View style={[
      inlinePlanStyles.card,
      {
        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
      },
    ]}>
      {/* Header */}
      <View style={inlinePlanStyles.cardHeader}>
        <View style={[inlinePlanStyles.cardHeaderIcon, { backgroundColor: isDark ? 'rgba(200,16,46,0.2)' : 'rgba(200,16,46,0.1)' }]}>
          <Ionicons name="map-outline" size={16} color={BAHRAIN_RED} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[inlinePlanStyles.cardTitle, { color: colors.textPrimary }]}>Your Day Plan</Text>
          <Text style={[inlinePlanStyles.cardSub, { color: colors.textMuted }]}>
            {plan.length} stops · {morningStops.length} morning · {afternoonStops.length} afternoon · {eveningStops.length} evening
          </Text>
        </View>
      </View>

      <Text style={[inlinePlanStyles.tapHint, { color: colors.textMuted }]}>Tap a stop to view details</Text>

      {/* Stops */}
      {plan.map((stop, idx) => (
        <InlinePlanStop
          key={`plan-${idx}`}
          stop={stop}
          index={idx}
          isDark={isDark}
          colors={colors}
          onPress={onStopPress}
          onNavigate={onNavigateStop}
        />
      ))}

      {/* Open full route in Google Maps */}
      {hasAnyCoords && onOpenFullRoute ? (
        <TouchableOpacity
          style={[inlinePlanStyles.openFullBtn, { borderColor: isDark ? 'rgba(200,16,46,0.3)' : 'rgba(200,16,46,0.2)' }]}
          activeOpacity={0.8}
          onPress={() => onOpenFullRoute(plan)}
          accessibilityRole="button"
          accessibilityLabel="Open full route in Google Maps"
        >
          <Ionicons name="map" size={14} color={BAHRAIN_RED} />
          <Text style={[inlinePlanStyles.openFullBtnText, { color: BAHRAIN_RED }]}>Open Full Route in Google Maps</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const inlinePlanStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 4,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_REGULAR,
    marginTop: 1,
  },
  stop: {
    flexDirection: 'row',
    marginHorizontal: 10,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  timeline: {
    width: 28,
    alignItems: 'center',
    marginRight: 8,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: FONT_POPPINS_BOLD,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    borderRadius: 1,
  },
  stopContent: {
    flex: 1,
    minWidth: 0,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  stopTime: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: 0.3,
  },
  stopType: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_REGULAR,
  },
  stopName: {
    fontSize: 14,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: -0.2,
    lineHeight: 18,
    marginBottom: 2,
  },
  stopHighlight: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_MEDIUM,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  stopReason: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 15,
    marginBottom: 2,
  },
  stopFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  stopTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 6,
  },
  stopTip: {
    flex: 1,
    fontSize: 10,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 14,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  navBtnText: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: 0.2,
  },
  tapHint: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_REGULAR,
    textAlign: 'center',
    marginBottom: 6,
    marginTop: -2,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 20,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_MEDIUM,
  },
  errorText: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_REGULAR,
    padding: 16,
    textAlign: 'center',
  },
  openFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 10,
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  openFullBtnText: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: 0.2,
  },
})

/* Aurora backdrop — two drifting gradient blobs tinted gold/red that breathe
 * behind the blurred panel for a premium cinematic look. */
function ChatAuroraBackdrop({ isDark = true }) {
  const a = useRef(new Animated.Value(0)).current
  const b = useRef(new Animated.Value(0)).current
  const c = useRef(new Animated.Value(0)).current
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
    const loopC = Animated.loop(
      Animated.sequence([
        Animated.timing(c, { toValue: 1, duration: 7500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(c, { toValue: 0, duration: 7500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loopA.start(); loopB.start(); loopC.start()
    return () => { loopA.stop(); loopB.stop(); loopC.stop() }
  }, [a, b, c])

  const tx1 = a.interpolate({ inputRange: [0, 1], outputRange: [-40, 60] })
  const ty1 = a.interpolate({ inputRange: [0, 1], outputRange: [-20, 40] })
  const tx2 = b.interpolate({ inputRange: [0, 1], outputRange: [50, -70] })
  const ty2 = b.interpolate({ inputRange: [0, 1], outputRange: [100, 40] })
  const tx3 = c.interpolate({ inputRange: [0, 1], outputRange: [30, -50] })
  const ty3 = c.interpolate({ inputRange: [0, 1], outputRange: [180, 260] })
  const op1 = a.interpolate({ inputRange: [0, 0.5, 1], outputRange: isDark ? [0.62, 0.92, 0.62] : [0.24, 0.46, 0.24] })
  const op2 = b.interpolate({ inputRange: [0, 0.5, 1], outputRange: isDark ? [0.48, 0.78, 0.48] : [0.2, 0.4, 0.2] })
  const op3 = c.interpolate({ inputRange: [0, 0.5, 1], outputRange: isDark ? [0.34, 0.62, 0.34] : [0.14, 0.3, 0.14] })
  const redOrb = isDark ? ['rgba(200,16,46,0.62)', 'rgba(200,16,46,0)'] : ['rgba(200,16,46,0.22)', 'rgba(200,16,46,0)']
  const goldOrb = isDark ? ['rgba(233,200,119,0.52)', 'rgba(233,200,119,0)'] : ['rgba(233,200,119,0.32)', 'rgba(233,200,119,0)']
  const seaOrb = isDark ? ['rgba(14,165,233,0.48)', 'rgba(14,165,233,0)'] : ['rgba(14,165,233,0.2)', 'rgba(14,165,233,0)']

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.khalidAuroraBlob, { opacity: op1, transform: [{ translateX: tx1 }, { translateY: ty1 }] }]}>
        <LinearGradient
          colors={redOrb}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      <Animated.View style={[styles.khalidAuroraBlob, styles.khalidAuroraBlobGold, { opacity: op2, transform: [{ translateX: tx2 }, { translateY: ty2 }] }]}>
        <LinearGradient
          colors={goldOrb}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      <Animated.View style={[styles.khalidAuroraBlob, styles.khalidAuroraBlobSea, { opacity: op3, transform: [{ translateX: tx3 }, { translateY: ty3 }] }]}>
        <LinearGradient
          colors={seaOrb}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
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
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const translateX = useRef(new Animated.Value(isUser ? 14 : -10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 320, friction: 24, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 320, friction: 24, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, tension: 320, friction: 24, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity, translateY, translateX]);

  return (
    <Animated.View style={{ width: '100%', transform: [{ scale }, { translateY }, { translateX }], opacity }}>
      {children}
    </Animated.View>
  );
}

/** Slim indeterminate bar — ChatGPT/Claude-style “working” strip under the header */
function KhalidIndeterminateBar({ active, windowWidth, tintA, tintB }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      t.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, t]);

  if (!active) return null;
  const barW = Math.max(80, windowWidth * 0.42);
  const travel = windowWidth + barW;
  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-barW, travel],
  });

  return (
    <View style={styles.khalidProgressTrack} pointerEvents="none">
      <Animated.View style={[styles.khalidProgressPulseHost, { width: barW, transform: [{ translateX }] }]}>
        <LinearGradient
          colors={[tintA, tintB, tintA]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function KhalidStaggerSuggestionRow({
  suggestions,
  onPick,
  chipInnerBg,
  chipTextColor,
  labelColor,
  labelText = 'Try asking',
}) {
  const animKey = suggestions.join('\u0001');
  const anims = useMemo(() => suggestions.map(() => new Animated.Value(0)), [animKey]);

  useEffect(() => {
    anims.forEach((v) => v.setValue(0));
    Animated.stagger(
      48,
      anims.map((v) =>
        Animated.spring(v, {
          toValue: 1,
          friction: 8,
          tension: 120,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [animKey, anims]);

  return (
    <View style={styles.khalidSuggestionsBlock}>
      <View style={styles.khalidSuggestionsLabelRow}>
        <Ionicons name="map-outline" size={13} color={labelColor} />
        <Text style={[styles.khalidSuggestionsLabel, { color: labelColor }]}>{labelText}</Text>
      </View>
      <View style={styles.khalidSuggestionsRow}>
        {suggestions.map((s, i) => {
          const v = anims[i];
          if (!v) return null;
          const o = v.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
          const ty = v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
          return (
            <Animated.View key={s} style={{ opacity: o, transform: [{ translateY: ty }] }}>
              <TouchableOpacity onPress={() => onPick(s)} activeOpacity={0.78} style={styles.khalidSuggestionChipWrap}>
                <LinearGradient
                  colors={['rgba(233,200,119,0.85)', 'rgba(200,16,46,0.72)', 'rgba(14,165,233,0.55)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.khalidSuggestionChipBorder}
                >
                  <View style={[styles.khalidSuggestionChipInner, { backgroundColor: chipInnerBg }]}>
                    <Ionicons name="sparkles-outline" size={12} color={labelColor} style={{ marginRight: 6 }} />
                    <Text style={[styles.khalidSuggestionChipText, { color: chipTextColor }]} numberOfLines={1}>
                      {s}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

export default function KhalidChatScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight()
  const { colors, isDark, shadows, setColorScheme } = useTheme()

  const khalidSurface = useMemo(() => {
    if (isDark) {
      return {
        backdropDim: 'rgba(2,4,12,0.55)',
        contentOverlay: 'rgba(6,10,22,0.74)',
        blurTintBg: 'dark',
        blurTintPanel: 'dark',
        blurIntensityBg: 62,
        blurIntensityPanel: 54,
        headerTitle: '#F8FAFC',
        headerSubtitle: 'rgba(203,213,225,0.9)',
        headerBorder: 'rgba(233,200,119,0.12)',
        cinemaRail: ['rgba(233,200,119,0.75)', 'rgba(200,16,46,0.55)', 'rgba(14,165,233,0.5)', 'rgba(233,200,119,0.75)'],
        dividerGradient: [
          'rgba(233,200,119,0)',
          'rgba(233,200,119,0.55)',
          'rgba(200,16,46,0.42)',
          'rgba(14,165,233,0.38)',
          'rgba(233,200,119,0)',
        ],
        assistantBubbleBg: 'rgba(16,22,40,0.82)',
        assistantBubbleBorder: 'rgba(233,200,119,0.14)',
        assistantText: '#ECEFF4',
        assistantBubbleShine: ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0)', 'rgba(14,165,233,0.06)'],
        accentLine: BAHRAIN_GOLD,
        inputBorder: 'rgba(233,200,119,0.18)',
        inputBg: 'rgba(255,255,255,0.055)',
        inputFocusedBg: 'rgba(255,255,255,0.09)',
        inputText: '#F8FAFC',
        inputPlaceholder: 'rgba(203,213,225,0.72)',
        inputRowBorder: 'rgba(233,200,119,0.1)',
        headerEyebrow: 'rgba(233,200,119,0.88)',
        suggestionsBorder: 'rgba(233,200,119,0.12)',
        chipInnerBg: 'rgba(10,14,28,0.94)',
        chipText: 'rgba(248,250,252,0.96)',
        suggestionsLabel: BAHRAIN_GOLD,
        disabledSend: ['rgba(71,85,105,0.78)', 'rgba(51,65,85,0.78)'],
        inputFocusGlow: ['rgba(233,200,119,0.55)', 'rgba(200,16,46,0.45)'],
        inputWrapBg: 'transparent',
        errorBarBorder: 'rgba(248,113,113,0.28)',
      }
    }
    return {
      backdropDim: 'rgba(248,250,252,0.92)',
      contentOverlay: 'rgba(255,255,255,0.86)',
      blurTintBg: 'light',
      blurTintPanel: 'light',
      blurIntensityBg: 32,
      blurIntensityPanel: 38,
      headerTitle: colors.textPrimary,
      headerSubtitle: colors.textSecondary,
      headerBorder: 'rgba(200,16,46,0.12)',
      cinemaRail: ['rgba(233,200,119,0.85)', 'rgba(200,16,46,0.35)', 'rgba(14,165,233,0.4)', 'rgba(233,200,119,0.85)'],
      dividerGradient: [
        'rgba(200,16,46,0)',
        'rgba(233,200,119,0.5)',
        'rgba(200,16,46,0.25)',
        'rgba(14,165,233,0.22)',
        'rgba(233,200,119,0)',
      ],
      assistantBubbleBg: 'rgba(255,255,255,0.94)',
      assistantBubbleBorder: 'rgba(200,16,46,0.14)',
      assistantText: colors.textPrimary,
      assistantBubbleShine: ['rgba(233,200,119,0.1)', 'rgba(255,255,255,0)', 'rgba(14,165,233,0.07)'],
      accentLine: colors.primary,
      inputBorder: 'rgba(200,16,46,0.2)',
      inputBg: 'rgba(255,255,255,0.96)',
      inputFocusedBg: '#FFFFFF',
      inputText: colors.textPrimary,
      inputPlaceholder: colors.textMuted,
      inputRowBorder: 'rgba(233,200,119,0.18)',
      headerEyebrow: colors.primary,
      suggestionsBorder: 'rgba(200,16,46,0.1)',
      chipInnerBg: colors.surface,
      chipText: colors.textPrimary,
      suggestionsLabel: colors.primary,
      disabledSend: ['rgba(226,232,240,0.95)', 'rgba(203,213,225,0.85)'],
      inputFocusGlow: ['rgba(200,16,46,0.32)', 'rgba(233,200,119,0.4)'],
      inputWrapBg: colors.surface,
      errorBarBorder: 'rgba(248,113,113,0.35)',
    }
  }, [isDark, colors])

  const { generalLabels, preferences } = useUserPreferences();
  const { profile } = useAuth();
  const personaSummary = preferences?.profileSummary || '';
  const khalidViewerUType = useMemo(() => normalizeViewerUType(profile?.user?.u_type), [profile?.user?.u_type])
  const buildKhalidIntroText = React.useCallback(
    (withLocation = false) => buildKhalidIntroParts(withLocation, khalidViewerUType).greeting,
    [khalidViewerUType],
  );

  const buildKhalidIntroFollowUpText = React.useCallback(
    (withLocation = false) => buildKhalidIntroParts(withLocation, khalidViewerUType).followUp,
    [khalidViewerUType],
  );

  const khalidIntroText = useMemo(() => buildKhalidIntroText(false), [buildKhalidIntroText]);


  const [profileClientId, setProfileClientId] = useState(null);
  const [khalidMessages, setKhalidMessages] = useState(() => {
    const parts = buildKhalidIntroParts(false, 'local');
    return [{ id: 'intro', role: 'assistant', text: parts.greeting }];
  });
  const [khalidFollowUpTyping, setKhalidFollowUpTyping] = useState(false);
  const khalidPendingFollowUpRef = useRef(null);
  const khalidFollowUpTimerRef = useRef(null);
  const khalidFollowUpFallbackTimerRef = useRef(null);
  const khalidIntroFollowUpQueuedRef = useRef(false);

  useEffect(() => {
    setKhalidMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.id !== 'intro') return prev;
      const t = khalidIntroText;
      if (prev[0]?.text === t) return prev;
      return [{ id: 'intro', role: 'assistant', text: t }];
    });
  }, [khalidIntroText]);
  const khalidMessagesRef = useRef(khalidMessages);
  /** Assistant bubble ids that already played typewriter — skip replay when Khalid modal remounts after close */
  const khalidTypewriterDoneIdsRef = useRef(new Set());
  /** Bumped when a bubble finishes typing so FlatList rows re-render with skipTypewriter from ref */
  const [khalidTypewriterEpoch, setKhalidTypewriterEpoch] = useState(0);
  useEffect(() => {
    khalidMessagesRef.current = khalidMessages;
  }, [khalidMessages]);

  const clearKhalidFollowUpTimers = React.useCallback(() => {
    if (khalidFollowUpTimerRef.current) {
      clearTimeout(khalidFollowUpTimerRef.current);
      khalidFollowUpTimerRef.current = null;
    }
    if (khalidFollowUpFallbackTimerRef.current) {
      clearTimeout(khalidFollowUpFallbackTimerRef.current);
      khalidFollowUpFallbackTimerRef.current = null;
    }
  }, []);

  const deliverKhalidFollowUpBubble = React.useCallback(() => {
    const pending = khalidPendingFollowUpRef.current;
    if (!pending?.text) return;
    khalidPendingFollowUpRef.current = null;
    clearKhalidFollowUpTimers();
    setKhalidFollowUpTyping(true);
    scrollKhalidToEnd();
    const pauseMs = Math.max(700, Number(pending.pauseMs) || 1100);
    khalidFollowUpTimerRef.current = setTimeout(() => {
      khalidFollowUpTimerRef.current = null;
      setKhalidFollowUpTyping(false);
      LayoutAnimation.configureNext({
        duration: 260,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setKhalidMessages((prev) => [
        ...prev,
        {
          id: `assistant-followup-${Date.now()}`,
          role: 'assistant',
          text: pending.text,
        },
      ]);
      scrollKhalidToEnd();
    }, pauseMs);
  }, [clearKhalidFollowUpTimers]);

  const scheduleKhalidFollowUpBubble = React.useCallback(
    ({ afterMessageId, text, pauseMs = 1100, maxWaitMs = 14000 }) => {
      const trimmed = String(text || '').trim();
      if (!trimmed || !afterMessageId) return;
      clearKhalidFollowUpTimers();
      khalidPendingFollowUpRef.current = {
        afterMessageId,
        text: trimmed,
        pauseMs,
      };
      if (khalidTypewriterDoneIdsRef.current.has(afterMessageId)) {
        khalidFollowUpFallbackTimerRef.current = setTimeout(() => {
          khalidFollowUpFallbackTimerRef.current = null;
          if (khalidPendingFollowUpRef.current?.afterMessageId === afterMessageId) {
            deliverKhalidFollowUpBubble();
          }
        }, 380);
        return;
      }
      khalidFollowUpFallbackTimerRef.current = setTimeout(() => {
        khalidFollowUpFallbackTimerRef.current = null;
        if (khalidPendingFollowUpRef.current?.afterMessageId === afterMessageId) {
          deliverKhalidFollowUpBubble();
        }
      }, maxWaitMs);
    },
    [clearKhalidFollowUpTimers, deliverKhalidFollowUpBubble],
  );

  const handleKhalidTypewriterComplete = React.useCallback(
    (id) => {
      if (id) khalidTypewriterDoneIdsRef.current.add(id);
      setKhalidTypewriterEpoch((n) => n + 1);
      const pending = khalidPendingFollowUpRef.current;
      if (pending && pending.afterMessageId === id) {
        deliverKhalidFollowUpBubble();
      }
    },
    [deliverKhalidFollowUpBubble],
  );

  const queueKhalidIntroFollowUp = React.useCallback(
    (withLocation = false) => {
      const hasFollowUpAlready = (khalidMessagesRef.current || []).some(
        (m) => m.role === 'assistant' && m.id !== 'intro',
      );
      if (hasFollowUpAlready) return;
      if (khalidPendingFollowUpRef.current?.afterMessageId === 'intro') {
        khalidPendingFollowUpRef.current = {
          ...khalidPendingFollowUpRef.current,
          text: buildKhalidIntroFollowUpText(withLocation),
        };
        return;
      }
      if (khalidIntroFollowUpQueuedRef.current) return;
      khalidIntroFollowUpQueuedRef.current = true;
      scheduleKhalidFollowUpBubble({
        afterMessageId: 'intro',
        text: buildKhalidIntroFollowUpText(withLocation),
        pauseMs: 950,
      });
    },
    [buildKhalidIntroFollowUpText, scheduleKhalidFollowUpBubble],
  );

  const markKhalidAssistantTypewriterDoneForClose = React.useCallback(() => {
    const list = khalidMessagesRef.current || [];
    for (let i = 0; i < list.length; i += 1) {
      const m = list[i];
      if (m?.role === 'assistant' && m?.id && m?.type !== 'card') {
        khalidTypewriterDoneIdsRef.current.add(m.id);
      }
    }
  }, []);

  const [khalidInput, setKhalidInput] = useState('');
  const [khalidLoading, setKhalidLoading] = useState(false);
  const [khalidInputFocused, setKhalidInputFocused] = useState(false);
  const [khalidError, setKhalidError] = useState(null);
  const lastOrbitChatTsRef = useRef(0);
  /** While Khalid overlay is open from orbit "Ask Khalid", model + retrieval bias toward pinned venue until user closes overlay. */
  const orbitVenueAskContextRef = useRef(null);
  /** Stable ref so orbit link subscription can invoke the latest send handler (avoid stale []). */
  const sendMessageWithTextRef = useRef(async () => {});
  const khalidListRef = useRef(null);
  const khalidPrefetchRef = useRef({ key: '', context: '', inflight: null });
  const khalidPrefetchTimerRef = useRef(null);
  const khalidGeoCacheRef = useRef({ at: 0, coords: null });
  const khalidLastFetchCoordsRef = useRef(null);
  const khalidLastProximityIntentRef = useRef(false);
  const khalidLastClientTypeRef = useRef('');
  const khalidLocationPrimedRef = useRef(false);
  const khalidSessionContextRef = useRef({
    topic: '',
    area: '',
    clientType: '',
    lastQuery: '',
    lastUserTurns: [],
    updatedAt: 0,
  })

  const dismissKhalidForClientProfile = React.useCallback(
    (clientId) => {
      if (!clientId) return;
      markKhalidAssistantTypewriterDoneForClose();
      orbitVenueAskContextRef.current = null;
      khalidSessionContextRef.current = {
        topic: '',
        area: '',
        clientType: '',
        lastQuery: '',
        lastUserTurns: [],
        updatedAt: Date.now(),
      }
      setProfileClientId(clientId);
    },
    [markKhalidAssistantTypewriterDoneForClose],
  );

  const resolveKhalidUserCoords = React.useCallback(async (options = {}) => {
    const forceFresh = Boolean(options?.forceFresh)
    const now = Date.now()
    const slot = khalidGeoCacheRef.current
    if (!forceFresh && slot.coords != null && now - slot.at < KHALID_GEO_CACHE_TTL_MS) {
      return slot.coords
    }
    try {
      let { status } = await Location.getForegroundPermissionsAsync()
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync()
        status = req.status
      }
      if (status !== 'granted') {
        khalidGeoCacheRef.current = { at: now, coords: null }
        return null
      }

      let latitude = null
      let longitude = null

      if (!forceFresh) {
        try {
          const last = await Location.getLastKnownPositionAsync({
            maxAge: 45 * 1000,
            requiredAccuracy: 120,
          })
          if (last?.coords) {
            latitude = last.coords.latitude
            longitude = last.coords.longitude
          }
        } catch {
          /* continue to fresh fix */
        }
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: forceFresh ? Location.Accuracy.BestForNavigation : Location.Accuracy.High,
      })
      if (pos?.coords) {
        latitude = pos.coords.latitude
        longitude = pos.coords.longitude
      }

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        khalidGeoCacheRef.current = { at: now, coords: null }
        return null
      }

      const coords = { latitude, longitude }
      khalidGeoCacheRef.current = { at: now, coords }
      return coords
    } catch {
      khalidGeoCacheRef.current = { at: now, coords: null }
      return null
    }
  }, []);

  const coordsForKhalidPrompt = (coordsResolved) => {
    if (
      coordsResolved &&
      Number.isFinite(coordsResolved.latitude) &&
      Number.isFinite(coordsResolved.longitude)
    ) {
      return {
        lat: coordsResolved.latitude,
        lng: coordsResolved.longitude,
      }
    }
    return null
  }

  const coordsBucketForCache = (coordsPrompt) => {
    if (!coordsPrompt) return 'noloc'
    return `${Math.round(coordsPrompt.lat * 10000) / 10000},${Math.round(coordsPrompt.lng * 10000) / 10000}`
  }

  const primeKhalidSessionLocation = React.useCallback(async () => {
    const coords = await resolveKhalidUserCoords({ forceFresh: true })
    if (coords) {
      khalidLastFetchCoordsRef.current = coords
    }
    const coordsPrompt = coordsForKhalidPrompt(coords)
    const coordsPlausible =
      coordsPrompt && isUserLocationInBahrain(coordsPrompt.lat, coordsPrompt.lng)
    if (coordsPlausible) {
      const seedQuery = `nearby places restaurants attractions ${(generalLabels || []).slice(0, 2).join(' ')}`.trim()
      const retrievalQueryText = seedQuery.slice(0, 950)
      const locBucket = coordsBucketForCache(coordsPrompt)
      const cacheKey = `${buildPrefetchKey(seedQuery, retrievalQueryText)}|${locBucket}|prox|any`
      if (khalidPrefetchRef.current.key !== cacheKey || !khalidPrefetchRef.current.context) {
        const inflight = fetchPineconePlacesForChat(seedQuery, {
          generalLabels,
          personaSummary,
          retrievalQueryText,
          sortByProximity: true,
          userLocation: coordsPlausible,
        })
          .then((ctx) => {
            if (khalidPrefetchRef.current.key === cacheKey) {
              khalidPrefetchRef.current = { key: cacheKey, context: ctx || '', inflight: null }
            }
            return ctx || ''
          })
          .catch(() => '')
        khalidPrefetchRef.current = { key: cacheKey, context: '', inflight }
      }
    }
    setKhalidMessages((prev) => {
      const introOnly =
        prev.length === 1 && prev[0]?.role === 'assistant' && prev[0]?.id === 'intro'
      if (!introOnly) return prev
      const nextText = buildKhalidIntroText(Boolean(coordsPlausible))
      if (prev[0].text === nextText) return prev
      return [{ ...prev[0], text: nextText }]
    })
    queueKhalidIntroFollowUp(Boolean(coordsPlausible))
    return coords
  }, [
    buildKhalidIntroText,
    generalLabels,
    personaSummary,
    queueKhalidIntroFollowUp,
    resolveKhalidUserCoords,
  ])

  const typingDot1 = useRef(new Animated.Value(0)).current;
  const typingDot2 = useRef(new Animated.Value(0)).current;
  const typingDot3 = useRef(new Animated.Value(0)).current;
  const siriOrbScale = useRef(new Animated.Value(1)).current;
  const siriOrbOpacity = useRef(new Animated.Value(0.7)).current;

  const scrollKhalidToEnd = () => {
    requestAnimationFrame(() => {
      khalidListRef.current?.scrollToEnd({ animated: true });
    });
  };

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

  const handleKhalidAppControlAction = useCallback(
    (action) => {
      if (!action || !action.type) return;
      const { type } = action;
      if (type === 'set_app_theme') {
        const raw = String(action.scheme || '').toLowerCase().trim();
        const scheme =
          raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
        if (!scheme) return;
        setColorScheme(scheme);
        try {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
          /* optional */
        }
        return;
      }
      if (type === 'open_plan_builder') {
        try {
          navigation.navigate('AI Plan', { openPlanModal: Date.now() })
        } catch { /* ignore */ }
        return
      }
      if (type === 'generate_inline_plan') {
        const planCardId = `plan-${Date.now()}`
        const prefHints = String(action.prefHints || '').split(',').map((s) => s.trim()).filter(Boolean)
        const foodHints = String(action.foodHints || '').split(',').map((s) => s.trim()).filter(Boolean)

        const planMsg = {
          id: planCardId,
          role: 'assistant',
          type: 'inline_plan',
          loading: true,
          plan: null,
          error: null,
        }
        LayoutAnimation.configureNext({
          duration: 280,
          create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          update: { type: LayoutAnimation.Types.easeInEaseOut },
        })
        setKhalidMessages((prev) => [...prev, planMsg])
        setTimeout(scrollKhalidToEnd, 100)

        const updatePlanCard = (update) => {
          setKhalidMessages((prev) =>
            prev.map((m) => (m.id === planCardId ? { ...m, ...update } : m)),
          )
          setTimeout(scrollKhalidToEnd, 80)
        }

        const runPlanGeneration = async () => {
          try {
            const retrievalOpts = {
              profileNarrative: personaSummary || '',
              profileAnswers: preferences?.profileAnswers || {},
            }
            const [places, restaurants, breakfastSpots, events] =
              await resolvePlanRetrievalBuckets(prefHints, foodHints, retrievalOpts)

            let coordsResolved = null
            try {
              coordsResolved = await resolveKhalidUserCoords({ forceFresh: false })
            } catch { coordsResolved = null }
            const originLat = coordsResolved?.latitude ?? null
            const originLng = coordsResolved?.longitude ?? null

            const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefHints, foodHints, {
              profileGeneral: generalLabels,
              generalIds: preferences?.generalIds || [],
              profileNarrative: personaSummary || '',
              profileAnswers: preferences?.profileAnswers || {},
              originLat,
              originLng,
              viewerUType: khalidViewerUType,
            })

            const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events]
            const nameToClientId = new Map()
            for (const m of allMatches) {
              const meta = m?.metadata || {}
              const cid = meta.client_a_uuid || meta.id || m.id || null
              const name = String(
                meta.event_name || meta.business_name || meta.name || meta.place_name ||
                meta.title || meta.display_name || meta.venue || meta.venue_name || ''
              ).trim().toLowerCase()
              if (cid && name) nameToClientId.set(name, cid)
            }
            const enrichedPlan = (plan || []).map((stop) => {
              if (stop.clientId) return stop
              const norm = String(stop.spot || '').trim().toLowerCase()
              const cid = nameToClientId.get(norm) || null
              return cid ? { ...stop, clientId: cid } : stop
            })

            updatePlanCard({ loading: false, plan: enrichedPlan, error: null })
          } catch (e) {
            console.warn('[Khalid] inline plan generation failed:', e?.message)
            updatePlanCard({ loading: false, plan: null, error: e?.message || 'Plan generation failed' })
          }
        }
        runPlanGeneration()
        return
      }
      if (type === 'navigate_tab') {
        const tab = String(action.tab || '').trim();
        const allowed = new Set(['Home', 'Explore', 'AI Plan', 'Khalid', 'Community', 'Profile']);
        if (!allowed.has(tab)) return;
        try {
          navigation.navigate(tab);
        } catch {
          /* ignore */
        }
        return;
      }
      if (type === 'open_saved_plans') {
        try {
          navigation.navigate('Profile', { screen: 'SavedPlans' });
        } catch {
          /* ignore */
        }
      }
    },
    [navigation, setColorScheme, personaSummary, preferences, generalLabels, khalidViewerUType, resolveKhalidUserCoords, scrollKhalidToEnd],
  );

  const handleKhalidAction = (action) => {
    console.log('[Khalid] handleKhalidAction called with:', action);
    
    if (!action || !action.type) {
      console.warn('[Khalid] No action or action.type, aborting');
      return;
    }
    
    const query = String(action.query || '').trim();
    const place = String(action.place || '').trim();
    const strictClientName = String(action.strict_client_name || '').trim();
    const strictQueryMatch = Boolean(action.strict_query_match)
    const cardId = `card-${Date.now()}`;
    
    console.log('[Khalid] Creating card with ID:', cardId, 'type:', action.type, 'query:', query, 'place:', place);
    
    const cardMsg = {
      id: cardId,
      role: 'assistant',
      type: 'card',
      action: {
        type: action.type,
        query,
        place,
        strict_client_name: strictClientName,
        strict_query_match: strictQueryMatch,
      },
      loading: true,
      data: null,
      error: null,
      proximitySorted: false,
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
      const sortByProx = Boolean(
        khalidLastProximityIntentRef.current && khalidLastFetchCoordsRef.current,
      );
      const crd = khalidLastFetchCoordsRef.current;
      const userLat = crd && Number.isFinite(crd.latitude) ? crd.latitude : null;
      const userLng = crd && Number.isFinite(crd.longitude) ? crd.longitude : null;
      console.log('[Khalid] ======= FETCHING CLIENTS =======');
      console.log('[Khalid] Query:', query);
      console.log('[Khalid] Client Type:', clientType);
      console.log('[Khalid] Proximity sort:', sortByProx);
      console.log('[Khalid] ================================');

      const strictForFetch =
        strictQueryMatch ||
        Boolean(strictClientName) ||
        (query.length >= 2 && !isKhalidGenericBrowseQuery(query))

      fetchClientsByQuery(query, clientType, {
        userLat,
        userLng,
        sortByProximity: sortByProx,
        strictClientName,
        strictQueryMatch: strictForFetch,
      })
        .then((clients) => {
          console.log('[Khalid] ======= FETCH COMPLETE =======');
          console.log('[Khalid] Clients fetched:', clients?.length || 0, 'clients');
          if (clients && clients.length > 0) {
            console.log('[Khalid] Sample client:', clients[0]);
          }
          console.log('[Khalid] ================================');
          const proximitySorted =
            sortByProx &&
            Array.isArray(clients) &&
            clients.some((c) => c && String(c.distanceLabel || '').trim().length > 0);
          updateCard({
            loading: false,
            data: clients?.length ? { clients } : null,
            error: null,
            proximitySorted,
          });
        })
        .catch((e) => {
          console.error('[Khalid] Clients fetch error:', e);
          updateCard({ loading: false, data: null, error: e?.message || 'Could not load places' });
        });
    } else {
      console.warn('[Khalid] Unknown action type:', action.type);
    }
  };

  const khalidUiToApiHistory = (messages) =>
    (Array.isArray(messages) ? messages : [])
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.text && m.type !== 'card'))
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.text,
      }));

  const buildPrefetchKey = (displayText, retrievalQueryText) => {
    const base = retrievalQueryText && String(retrievalQueryText).trim()
      ? String(retrievalQueryText).trim().toLowerCase().slice(0, 320)
      : String(displayText || '').trim().toLowerCase();
    const g = (generalLabels || []).join(',');
    const p = personaSummary ? personaSummary.slice(0, 80) : '';
    return `${base}|${g}|${p}`;
  };

  const startKhalidPrefetch = (text) => {
    const trimmed = String(text || '').trim();
    if (trimmed.length < 4) return;
    const priorApi = khalidUiToApiHistory(khalidMessagesRef.current);
    const draftHistory = [...priorApi, { role: 'user', content: trimmed }];
    const retrievalQueryText = buildKhalidPineconeQueryText(trimmed, draftHistory);
    const key = buildPrefetchKey(trimmed, retrievalQueryText);
    const cache = khalidPrefetchRef.current;
    if (cache.key === key && (cache.context !== '' || cache.inflight)) return;
    const crd = khalidLastFetchCoordsRef.current
    const prefetchCoords = coordsForKhalidPrompt(crd)
    const prefetchProx =
      prefetchCoords &&
      isUserLocationInBahrain(prefetchCoords.lat, prefetchCoords.lng) &&
      wantsKhalidProximityIntent(trimmed)
    const inflight = fetchPineconePlacesForChat(trimmed, {
      generalLabels,
      personaSummary,
      retrievalQueryText,
      sortByProximity: Boolean(prefetchProx),
      userLocation: prefetchProx ? prefetchCoords : null,
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
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      /* optional */
    }
    khalidPendingFollowUpRef.current = null;
    clearKhalidFollowUpTimers();
    setKhalidFollowUpTyping(false);

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
      const proximityIntent = wantsKhalidProximityIntent(trimmed);
      khalidLastProximityIntentRef.current = proximityIntent;
      let coordsResolved = null;
      try {
        coordsResolved = await resolveKhalidUserCoords({ forceFresh: true });
      } catch {
        coordsResolved = null;
      }
      khalidLastFetchCoordsRef.current = coordsResolved;
      const coordsForPrompt = coordsForKhalidPrompt(coordsResolved);
      const coordsPlausibleForProximity =
        coordsForPrompt &&
        isUserLocationInBahrain(coordsForPrompt.lat, coordsForPrompt.lng);

      const historyForApi = khalidUiToApiHistory(nextMessages);
      let retrievalQueryText = buildKhalidPineconeQueryText(trimmed, historyForApi);
      const sessionCtx = khalidSessionContextRef.current || {}
      if (isKhalidLikelyFollowUpTurn(trimmed)) {
        const followupAnchor = [sessionCtx.topic, sessionCtx.lastQuery, sessionCtx.area]
          .filter((v) => String(v || '').trim().length > 0)
          .join(' ')
          .trim()
        if (followupAnchor && !String(retrievalQueryText || '').toLowerCase().includes(followupAnchor.toLowerCase())) {
          retrievalQueryText = `${followupAnchor} ${String(retrievalQueryText || trimmed).trim()}`
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 950)
        }
      }
      const orbitPin = orbitVenueAskContextRef.current
      const pinnedPlaceRaw = orbitPin && typeof orbitPin.placeName === 'string' ? orbitPin.placeName.trim() : ''
      if (
        pinnedPlaceRaw.length >= 2 &&
        !String(retrievalQueryText || '').includes(pinnedPlaceRaw.slice(0, Math.min(24, pinnedPlaceRaw.length)))
      ) {
        const merged = `${pinnedPlaceRaw} ${String(retrievalQueryText || trimmed).trim()}`.replace(/\s+/g, ' ').trim()
        retrievalQueryText = merged.slice(0, 950)
      }

      const explicitConstraintEarly = extractKhalidExplicitConstraint(trimmed)
      const explicitClientTypeEarly = inferKhalidExplicitClientTypeFromUser(trimmed)
      const proximityCategory =
        proximityIntent && explicitClientTypeEarly
          ? explicitClientTypeEarly
          : proximityIntent
            ? inferKhalidClientType(trimmed, khalidLastClientTypeRef.current)
            : ''
      const locBucket = coordsBucketForCache(coordsForPrompt)
      const cacheKey = `${buildPrefetchKey(trimmed, retrievalQueryText)}|${locBucket}|${proximityIntent ? 'prox' : 'sem'}|${proximityCategory || 'any'}`;
      const cache = khalidPrefetchRef.current;
      let pineconePlacesContext = '';
      const pineconeOpts = {
        generalLabels,
        personaSummary,
        retrievalQueryText,
        sortByProximity: Boolean(proximityIntent && coordsPlausibleForProximity),
        userLocation: coordsPlausibleForProximity ? coordsForPrompt : null,
        preferredClientType: proximityCategory || '',
      }
      if (cache.key === cacheKey && cache.context) {
        pineconePlacesContext = cache.context;
      } else if (cache.key === cacheKey && cache.inflight) {
        pineconePlacesContext = (await cache.inflight) || '';
      } else {
        pineconePlacesContext = await fetchPineconePlacesForChat(trimmed, pineconeOpts);
        khalidPrefetchRef.current = { key: cacheKey, context: pineconePlacesContext || '', inflight: null };
      }
      const orbitPinForPrompt = orbitVenueAskContextRef.current
      const systemPromptBase = buildKhalidSystemPrompt(
        pineconePlacesContext,
        {
          generalLabels,
          personaSummary,
          viewerUType: khalidViewerUType,
        },
        orbitPinForPrompt && orbitPinForPrompt.placeName ? orbitPinForPrompt : null,
        coordsForPrompt,
      );
      const proximityNoGpsNote =
        proximityIntent && !coordsPlausibleForProximity
          ? coordsForPrompt
            ? '\n\nLOCATION NOTE: The user asked for nearby/nearest but GPS does not look like a Bahrain fix (simulator or stale location). Ask them to enable location on a real device in Bahrain; do not invent distances.\n'
            : '\n\nLOCATION NOTE: The user asked for nearby/nearest but GPS is not available this session—tell them to enable location for the true closest pick; still name the best matches from ALLOWED PLACES without inventing distances.\n'
          : ''
      const systemPrompt = `${systemPromptBase}${proximityNoGpsNote}${buildKhalidSessionContextLine(sessionCtx)}`

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
          temperature: 0.62,
          max_tokens: 820,
          response_format: { type: 'json_object' },
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
      let followUpText = '';
      let actions = [];
      try {
        const parsed = JSON.parse(raw);
        console.log('[Khalid] Parsed JSON:', parsed);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.reply === 'string') replyText = parsed.reply;
          if (typeof parsed.followUp === 'string') followUpText = parsed.followUp;
          else if (typeof parsed.followUpQuestion === 'string') followUpText = parsed.followUpQuestion;
          if (Array.isArray(parsed.actions)) actions = parsed.actions;
        }
      } catch (parseError) {
        console.warn('[Khalid] Failed to parse JSON, using raw text:', parseError.message);
        // fall back to raw text
      }

      const split = splitKhalidReplyAndFollowUp(replyText, followUpText);
      const answerText = split.answer;
      followUpText = split.followUp;
      replyText = answerText;

      console.log('[Khalid] Extracted actions:', actions);

      const topicHintFromPrior =
        extractKhalidTopicHintFromPriorTurns(historyForApi) ||
        String(khalidSessionContextRef.current?.topic || '').trim();
      const explicitConstraint = extractKhalidExplicitConstraint(trimmed)
      const explicitClientTypeThisTurn = inferKhalidExplicitClientTypeFromUser(trimmed)
      const inferredClientTypeThisTurn =
        explicitConstraint.clientType ||
        explicitClientTypeThisTurn ||
        inferKhalidClientType(`${trimmed} ${replyText}`, khalidLastClientTypeRef.current)
      actions = stripKhalidListingCardActions(actions)

      const assistantMsgId = `assistant-${Date.now()}`;
      const assistantMsg = {
        id: assistantMsgId,
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

      const appControlActions = (actions || []).filter(
        (a) => a && KHALID_APP_CONTROL_ACTION_TYPES.has(a.type),
      )
      const fullReplyForContext = followUpText
        ? `${replyText}\n\n${followUpText}`.trim()
        : replyText;

      if (appControlActions.length > 0) {
        khalidSessionContextRef.current = deriveKhalidSessionContextUpdate({
          userText: trimmed,
          replyText: fullReplyForContext,
          actions: appControlActions,
          inferredClientType: inferredClientTypeThisTurn,
          priorContext: khalidSessionContextRef.current,
        })

        appControlActions.forEach((a) => handleKhalidAppControlAction(a))
      } else {
        if (followUpText) {
          scheduleKhalidFollowUpBubble({
            afterMessageId: assistantMsgId,
            text: followUpText,
            pauseMs: 1050,
          });
        }
        khalidSessionContextRef.current = deriveKhalidSessionContextUpdate({
          userText: trimmed,
          replyText: fullReplyForContext,
          actions: [],
          inferredClientType: inferredClientTypeThisTurn,
          priorContext: khalidSessionContextRef.current,
        })
        console.log('[Khalid] No actions to process');
      }
    } catch (e) {
      console.error('[KhalidOverlay] chat error', e);
      setKhalidError(e.message || 'Something went wrong talking to Khalid');
    } finally {
      setKhalidLoading(false);
    }
  };
  sendMessageWithTextRef.current = sendMessageWithText;

  useEffect(() => {
    const orb = route.params?.orbitChat;
    if (!orb || orb.ts == null) return;
    const ts = Number(orb.ts);
    if (!ts || ts === lastOrbitChatTsRef.current) return;
    lastOrbitChatTsRef.current = ts;
    const placeRaw = String(orb.place || '').trim();
    const placeLabel = placeRaw || 'this place';
    const curatedSummary = String(orb.summary || '').trim();
    orbitVenueAskContextRef.current = {
      placeName: placeLabel,
      curatedSummary,
      clientId: String(orb.clientId || orb.client_id || '').trim() || undefined,
    };
    setKhalidError(null);
    setKhalidInput('');
    navigation.setParams({ orbitChat: undefined });
    const query = `Tell me more about ${placeLabel}`;
    requestAnimationFrame(() => {
      setTimeout(() => void sendMessageWithTextRef.current?.(query), 120);
    });
  }, [route.params?.orbitChat, navigation]);

  const sendKhalidMessage = () => sendMessageWithText(khalidInput);

  const handleAskAboutPlace = (client) => {
    const placeName = String(client?.name || '').trim()
    if (!placeName) return
    const curatedSummary = String(client?.ai_summary || client?.description || '').trim()
    const clientId = String(client?.id || client?.client_a_uuid || '').trim()
    orbitVenueAskContextRef.current = {
      placeName,
      curatedSummary,
      ...(clientId ? { clientId } : {}),
    }
    const query = `Tell me more about ${placeName}`
    setKhalidInput(query)
    sendMessageWithText(query)
  }

  const handleInlinePlanStopPress = useCallback((stop) => {
    if (!stop) return
    const cid = stop.clientId || stop.client_id
    if (cid) {
      dismissKhalidForClientProfile(cid)
      return
    }
  }, [dismissKhalidForClientProfile])

  const handleInlinePlanNavigateStop = useCallback((stop) => {
    if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return
    openGoogleMapsDirections(stop.lat, stop.lng)
  }, [])

  const handleInlinePlanOpenFullRoute = useCallback((planData) => {
    if (!Array.isArray(planData) || planData.length === 0) return
    const markers = planData
      .filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map((s) => ({ lat: s.lat, lng: s.lng }))
    if (markers.length === 0) return
    openGoogleMapsRouteForMarkers(markers)
  }, [])

  const renderKhalidItem = ({ item, index }) => {
    const prevItem = index > 0 ? khalidMessages[index - 1] : null
    const isConsecutiveAssistant = prevItem && prevItem.role === 'assistant' && item.role === 'assistant'

    if (item.type === 'inline_plan') {
      return (
        <BubbleIn isUser={false}>
          <View style={styles.khalidTurnAssistantOuter}>
            {!isConsecutiveAssistant ? (
              <View style={styles.khalidAssistantTurnHead}>
                <View style={styles.khalidAssistantTurnAvatar}>
                  <Image source={KHALID_AVATAR} style={styles.khalidAssistantTurnAvatarImg} resizeMode="cover" />
                </View>
                <Text style={[styles.khalidAssistantTurnName, { color: khalidSurface.headerTitle }]}>Khalid</Text>
                <View style={[styles.khalidAssistantTurnPill, { borderColor: khalidSurface.assistantBubbleBorder }]}>
                  <Text style={[styles.khalidAssistantTurnPillText, { color: khalidSurface.headerEyebrow }]}>Travel guide</Text>
                </View>
              </View>
            ) : null}
            <InlinePlanCard
              plan={item.plan}
              loading={item.loading}
              error={item.error}
              isDark={isDark}
              colors={colors}
              onStopPress={handleInlinePlanStopPress}
              onNavigateStop={handleInlinePlanNavigateStop}
              onOpenFullRoute={handleInlinePlanOpenFullRoute}
            />
          </View>
        </BubbleIn>
      )
    }
    
    if (item.type === 'card') {
      return null
    }
    const isUser = item.role === 'user'
    if (isUser) {
      return (
        <BubbleIn isUser>
          <View style={styles.khalidTurnUserOuter}>
            <View style={styles.khalidUserTurnRow}>
              <View
                style={[
                  styles.khalidBubble,
                  styles.khalidBubbleUser,
                  styles.khalidBubbleUserGpt,
                ]}
              >
                <LinearGradient
                  colors={[BAHRAIN_RED, BAHRAIN_RED_DEEP]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, styles.khalidBubbleGradient]}
                />
                <AnimatedMessageText
                  messageId={item.id}
                  skipTypewriter
                  onTypewriterComplete={handleKhalidTypewriterComplete}
                  text={item.text}
                  isUser={isUser}
                  style={[
                    styles.khalidBubbleText,
                    styles.khalidBubbleTextUser,
                  ]}
                />
              </View>
              <View style={styles.khalidUserTurnAvatar}>
                <Image source={DEFAULT_PROFILE_IMAGE} style={styles.khalidUserTurnAvatarImg} resizeMode="cover" />
              </View>
            </View>
          </View>
        </BubbleIn>
      )
    }

    return (
      <BubbleIn isUser={false}>
        <View style={styles.khalidTurnAssistantOuter}>
          {!isConsecutiveAssistant ? (
            <View style={styles.khalidAssistantTurnHead}>
              <View style={styles.khalidAssistantTurnAvatar}>
                <Image
                  source={KHALID_AVATAR}
                  style={styles.khalidAssistantTurnAvatarImg}
                  resizeMode="cover"
                />
              </View>
              <Text style={[styles.khalidAssistantTurnName, { color: khalidSurface.headerTitle }]}>Khalid</Text>
              <View style={[styles.khalidAssistantTurnPill, { borderColor: khalidSurface.assistantBubbleBorder }]}>
                <Text style={[styles.khalidAssistantTurnPillText, { color: khalidSurface.headerEyebrow }]}>Travel guide</Text>
              </View>
            </View>
          ) : null}
          <View
            style={[
              styles.khalidBubble,
              styles.khalidBubbleAssistant,
              styles.khalidBubbleAssistantGpt,
              {
                backgroundColor: khalidSurface.assistantBubbleBg,
                borderColor: khalidSurface.assistantBubbleBorder,
              },
            ]}
          >
            <LinearGradient
              colors={khalidSurface.assistantBubbleShine}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.khalidBubbleGradient]}
              pointerEvents="none"
            />
            <View style={[styles.khalidBubbleAccent, { backgroundColor: khalidSurface.accentLine }]} pointerEvents="none" />
            <AnimatedMessageText
              messageId={item.id}
              isUser={false}
              skipTypewriter={khalidTypewriterDoneIdsRef.current.has(item.id)}
              onTypewriterComplete={handleKhalidTypewriterComplete}
              text={item.text}
              style={[
                styles.khalidBubbleText,
                styles.khalidBubbleTextAssistant,
                { color: khalidSurface.assistantText },
              ]}
            />
          </View>
        </View>
      </BubbleIn>
    )
  }

  const renderTypingIndicator = () => {
    if (!khalidLoading && !khalidFollowUpTyping) return null
    const lastMsg = khalidMessages[khalidMessages.length - 1]
    const lastWasAssistant = lastMsg && lastMsg.role === 'assistant'
    return (
      <BubbleIn isUser={false}>
        <View style={styles.khalidTurnAssistantOuter}>
          {!lastWasAssistant ? (
            <View style={styles.khalidAssistantTurnHead}>
              <View style={styles.khalidAssistantTurnAvatar}>
                <Image
                  source={KHALID_AVATAR}
                  style={styles.khalidAssistantTurnAvatarImg}
                  resizeMode="cover"
                />
              </View>
              <Text style={[styles.khalidAssistantTurnName, { color: khalidSurface.headerTitle }]}>Khalid</Text>
              <View style={[styles.khalidAssistantTurnPill, { borderColor: khalidSurface.assistantBubbleBorder }]}>
                <Text style={[styles.khalidAssistantTurnPillText, { color: khalidSurface.headerEyebrow }]}>
                  {khalidFollowUpTyping ? 'Checking in…' : 'Crafting reply…'}
                </Text>
              </View>
            </View>
          ) : null}
          <View
            style={[
              styles.khalidBubble,
              styles.khalidBubbleAssistant,
              styles.khalidBubbleAssistantGpt,
              styles.khalidTypingBubble,
              {
                backgroundColor: khalidSurface.assistantBubbleBg,
                borderColor: khalidSurface.assistantBubbleBorder,
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(233,200,119,0.18)', 'rgba(14,165,233,0.1)', 'rgba(200,16,46,0.09)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.khalidBubbleGradient]}
              pointerEvents="none"
            />
            <WaveformTyping />
          </View>
        </View>
      </BubbleIn>
    );
  };

  useEffect(() => {
    const introOnly =
      khalidMessages.length === 1 && khalidMessages[0]?.id === 'intro';
    if (introOnly) {
      queueKhalidIntroFollowUp(false);
    }
  }, [khalidMessages, queueKhalidIntroFollowUp]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void resolveKhalidUserCoords({ forceFresh: true }).then((coords) => {
        if (!cancelled && coords) khalidLastFetchCoordsRef.current = coords
      })
      if (!khalidLocationPrimedRef.current) {
        khalidLocationPrimedRef.current = true
        void primeKhalidSessionLocation().catch(() => {
          khalidLocationPrimedRef.current = false
        })
      }

      const seedParts = [
        'best things to do in Bahrain today',
        ...(generalLabels || []).slice(0, 2),
      ].filter(Boolean)
      const seedQuery = seedParts.join(', ')
      if (seedQuery) startKhalidPrefetch(seedQuery)

      return () => {
        cancelled = true
        clearKhalidFollowUpTimers()
        khalidPendingFollowUpRef.current = null
        setKhalidFollowUpTyping(false)
      }
    }, [clearKhalidFollowUpTimers, generalLabels, primeKhalidSessionLocation, resolveKhalidUserCoords]),
  )

  const starterSuggestions = useMemo(
    () => getSmartSuggestions(generalLabels, khalidViewerUType),
    [generalLabels, khalidViewerUType],
  );

  const showStarterPanel =
    !khalidLoading &&
    !khalidFollowUpTyping &&
    !khalidMessages.some((m) => m.role === 'user')

  const renderKhalidListFooter = () => (
    <>
      {showStarterPanel ? (
        <View style={[styles.khalidSuggestionsWrap, { borderTopColor: khalidSurface.suggestionsBorder }]}>
          <KhalidStaggerSuggestionRow
            suggestions={starterSuggestions}
            onPick={(s) => sendMessageWithText(s)}
            chipInnerBg={khalidSurface.chipInnerBg}
            chipTextColor={khalidSurface.chipText}
            labelColor={khalidSurface.suggestionsLabel}
          />
        </View>
      ) : null}
      {renderTypingIndicator()}
    </>
  )

  return (
    <KeyboardAvoidingView
      style={[styles.screenRoot, styles.khalidRoot]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlurView intensity={khalidSurface.blurIntensityBg} tint={khalidSurface.blurTintBg} style={StyleSheet.absoluteFill} />
        <View style={[styles.khalidBackdropDim, { backgroundColor: khalidSurface.backdropDim }]} />
      </View>
      <View
        style={[
          styles.khalidContentWrap,
          styles.khalidContentWrapScreen,
          {
            paddingTop: insets.top,
            paddingBottom: tabBarHeight + 12,
          },
        ]}
      >
        <View style={styles.khalidContentBlur}>
          <BlurView intensity={khalidSurface.blurIntensityPanel} tint={khalidSurface.blurTintPanel} style={StyleSheet.absoluteFill} />
          <View style={[styles.khalidContentOverlay, { backgroundColor: khalidSurface.contentOverlay }]} />
          <ChatAuroraBackdrop isDark={isDark} />
        </View>
        <LinearGradient
          colors={khalidSurface.cinemaRail}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.khalidTopCinemaRail}
        />
        <View
          style={[styles.khalidHeader, { borderBottomColor: khalidSurface.headerBorder }]}
          accessibilityRole="header"
          accessibilityLabel="Khalid, travel guide"
        >
          <View style={styles.khalidHeaderInner}>
            <View style={styles.khalidHeaderCompactRow}>
              <View
                style={[
                  styles.khalidHeaderAvatarWrap,
                  {
                    borderColor: isDark ? 'rgba(233,200,119,0.28)' : 'rgba(200,16,46,0.22)',
                    backgroundColor: isDark ? 'rgba(10,14,24,0.6)' : 'rgba(255,255,255,0.9)',
                  },
                ]}
              >
                <Image source={KHALID_AVATAR} style={styles.khalidHeaderAvatarImage} resizeMode="cover" />
              </View>
              <View style={styles.khalidHeaderTextStack}>
                <Text style={[styles.khalidHeaderEyebrowCompact, { color: khalidSurface.headerEyebrow }]}>
                  Travel guide
                </Text>
                <View style={styles.khalidHeaderTitleRow}>
                  <Text style={[styles.khalidHeaderTitle, { color: khalidSurface.headerTitle }]}>Khalid</Text>
                  {!khalidLoading ? (
                    <View
                      style={[
                        styles.khalidHeaderLiveDot,
                        { borderColor: isDark ? 'rgba(10,18,34,0.95)' : colors.background },
                      ]}
                      accessible
                      accessibilityLabel="Online"
                    />
                  ) : null}
                </View>
                {khalidLoading ? (
                  <View style={styles.khalidHeaderSubtitleRow}>
                    <View style={styles.khalidHeaderStatusDotThinking} />
                    <Text style={styles.khalidHeaderSubtitleThinking}>Shaping reply…</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>
        <KhalidIndeterminateBar
          active={khalidLoading}
          windowWidth={windowWidth}
          tintA={BAHRAIN_GOLD}
          tintB="rgba(14,165,233,0.95)"
        />
        <LinearGradient
          colors={khalidSurface.dividerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.khalidHeaderDivider}
          pointerEvents="none"
        />
        <FlatList
          ref={khalidListRef}
          data={khalidMessages}
          extraData={{
            e: khalidTypewriterEpoch,
            s: showStarterPanel,
            l: khalidLoading,
            f: khalidFollowUpTyping,
          }}
          keyExtractor={(item) => item.id}
          renderItem={renderKhalidItem}
          ItemSeparatorComponent={() => <View style={styles.khalidChatItemSeparator} />}
          ListFooterComponent={renderKhalidListFooter}
          contentContainerStyle={styles.khalidMessagesContent}
          onContentSizeChange={scrollKhalidToEnd}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={{ flex: 1 }}
        />
        {khalidError ? (
          <BlurView
            intensity={isDark ? 38 : 48}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.khalidErrorBarBlur, { borderColor: khalidSurface.errorBarBorder }]}
          >
            <View style={styles.khalidErrorBarRow}>
              <Ionicons name="warning-outline" size={18} color="#FCA5A5" />
              <Text style={styles.khalidErrorText} numberOfLines={3}>
                {khalidError}
              </Text>
            </View>
          </BlurView>
        ) : null}
        <View
          style={[
            styles.khalidInputWrap,
            {
              borderTopColor: khalidSurface.inputRowBorder,
              backgroundColor: khalidSurface.inputWrapBg,
            },
          ]}
        >
          <View
            style={[
              styles.khalidInputPill,
              { backgroundColor: khalidSurface.inputBg, borderColor: khalidSurface.inputBorder },
              !isDark && shadows.sm,
              khalidInputFocused && [
                styles.khalidInputPillFocused,
                {
                  backgroundColor: khalidSurface.inputFocusedBg,
                  borderColor: isDark ? 'rgba(233,200,119,0.5)' : `${colors.primary}55`,
                },
                !isDark && shadows.md,
              ],
            ]}
          >
            {khalidInputFocused && (
              <LinearGradient
                colors={khalidSurface.inputFocusGlow}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.khalidInputGlow}
                pointerEvents="none"
              />
            )}
            <View style={styles.khalidInputFieldWrap}>
              <TextInput
                style={[styles.khalidInput, { color: khalidSurface.inputText }]}
                placeholder="Plan a trip, find food, sights, or “near me”…"
                placeholderTextColor={khalidSurface.inputPlaceholder}
                value={khalidInput}
                selectionColor={isDark ? 'rgba(233,200,119,0.35)' : 'rgba(200,16,46,0.22)'}
                cursorColor={khalidSurface.accentLine}
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="sentences"
                {...(Platform.OS === 'android'
                  ? { textAlignVertical: 'top', includeFontPadding: false }
                  : {})}
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
          </View>
          <TouchableOpacity
            style={[styles.khalidSendBtn, (!khalidInput.trim() || khalidLoading) && styles.khalidSendBtnDisabled]}
            onPress={sendKhalidMessage}
            disabled={!khalidInput.trim() || khalidLoading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={
                !khalidInput.trim() || khalidLoading
                  ? khalidSurface.disabledSend
                  : [BAHRAIN_GOLD, BAHRAIN_RED, BAHRAIN_RED_DEEP]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.khalidSendBtnGradient}
            />
            {khalidLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={20} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      </View>
      <ClientProfileModal visible={!!profileClientId} clientId={profileClientId} onClose={() => setProfileClientId(null)} insets={insets} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  khalidContentWrapScreen: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 14,
    marginHorizontal: 0,
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
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.32, shadowRadius: 28 },
      android: { elevation: 16 },
    }),
  },
  khalidContentBlur: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  khalidContentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,18,34,0.62)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
  khalidAuroraBlobSea: {
    top: 140,
    right: -36,
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  khalidProgressTrack: {
    height: 3,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  khalidProgressPulseHost: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  khalidTopCinemaRail: {
    height: 1,
    width: '100%',
    marginTop: 0,
    marginBottom: 0,
    opacity: 0.92,
    borderRadius: 2,
  },
  khalidHeader: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0,
  },
  khalidHeaderInner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
  },
  khalidHeaderCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    maxWidth: '100%',
    paddingHorizontal: 4,
  },
  khalidHeaderTextStack: {
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  khalidHeaderEyebrowCompact: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 9,
    letterSpacing: 0.85,
    textTransform: 'uppercase',
    opacity: 0.9,
    marginBottom: 1,
  },
  khalidHeaderAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    flexShrink: 0,
  },
  khalidHeaderAvatarImage: {
    width: '100%',
    height: '100%',
  },
  khalidHeaderTitle: {
    fontFamily: FONT_POPPINS_BOLD,
    fontSize: 18,
    letterSpacing: 0.28,
    textAlign: 'left',
  },
  khalidHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 7,
    flexWrap: 'nowrap',
  },
  khalidHeaderLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.9)',
  },
  khalidHeaderSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    flexWrap: 'nowrap',
  },
  khalidHeaderSubtitleThinking: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 10,
    color: BAHRAIN_GOLD,
    letterSpacing: 0.2,
    textAlign: 'left',
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
    width: '100%',
    opacity: 1,
    marginBottom: 0,
  },
  khalidSuggestionsBlock: {
    gap: 2,
  },
  khalidTurnUserOuter: {
    width: '100%',
    alignItems: 'flex-end',
    paddingLeft: 36,
    paddingBottom: 2,
  },
  khalidUserTurnRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  khalidUserTurnAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.35)',
    backgroundColor: '#FFFFFF',
  },
  khalidUserTurnAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  khalidTurnAssistantOuter: {
    width: '100%',
    alignSelf: 'stretch',
    paddingBottom: 2,
  },
  khalidAssistantTurnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  khalidAssistantTurnAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148,163,184,0.45)',
  },
  khalidAssistantTurnAvatarImg: {
    width: '100%',
    height: '100%',
  },
  khalidAssistantTurnName: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 14,
    letterSpacing: 0.25,
  },
  khalidAssistantTurnPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  khalidAssistantTurnPillText: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    opacity: 0.95,
  },
  khalidChatItemSeparator: {
    height: 18,
  },
  khalidMessagesContent: {
    flexGrow: 1,
    paddingVertical: 18,
    paddingBottom: 22,
    paddingHorizontal: 2,
  },
  khalidMessageRow: {
    flexDirection: 'row',
    marginBottom: 0,
    alignItems: 'flex-end',
  },
  khalidMessageRowUser: {
    justifyContent: 'flex-end',
  },
  khalidMessageRowAssistantGpt: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  khalidCardTurnWrap: {
    width: '100%',
    marginBottom: 0,
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
    maxWidth: '100%',
    paddingHorizontal: 17,
    paddingVertical: 13,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 18 },
      android: { elevation: 5 },
    }),
  },
  khalidBubbleGradient: {
    borderRadius: 22,
  },
  khalidBubbleUser: {
    backgroundColor: 'transparent',
    borderRadius: 22,
    borderWidth: 0,
    maxWidth: '90%',
    ...Platform.select({
      ios: { shadowColor: BAHRAIN_RED, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.42, shadowRadius: 16 },
      android: { elevation: 7 },
    }),
  },
  khalidBubbleUserGpt: {
    borderBottomRightRadius: 8,
  },
  khalidBubbleAssistant: {
    backgroundColor: 'rgba(20,28,46,0.82)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  khalidBubbleAssistantGpt: {
    borderBottomLeftRadius: 8,
    maxWidth: '100%',
    alignSelf: 'stretch',
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
    paddingVertical: 16,
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
    maxWidth: '96%',
  },
  khalidCardAnimatedWrapFull: {
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'stretch',
  },
  khalidCard: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,18,30,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(233,200,119,0.14)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: { elevation: 9 },
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
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 11,
    color: 'rgba(200,16,46,0.95)',
    letterSpacing: 0.45,
  },
  khalidCardBadgeTextPlacesLux: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 9,
    color: 'rgba(244,236,216,0.92)',
    letterSpacing: 1.35,
    textTransform: 'uppercase',
  },
  khalidCardPlacesStrip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(14,17,26,0.96)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      },
      android: { elevation: 12 },
    }),
  },
  khalidCardBadgePlacesStrip: {
    marginTop: 11,
    marginBottom: 2,
    marginLeft: 12,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(233,200,119,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(233,200,119,0.35)',
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
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 14,
    color: 'rgba(203,213,225,0.9)',
    marginLeft: 10,
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
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 14,
    color: '#FCA5A5',
    textAlign: 'center',
  },
  khalidCardSectionLabel: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 10,
    color: 'rgba(148,163,184,0.92)',
    letterSpacing: 1.2,
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
  khalidCardContentClientsCarousel: {
    paddingTop: 4,
    paddingHorizontal: 10,
    paddingBottom: 16,
    gap: 4,
    alignSelf: 'stretch',
  },
  khalidClientsHorizontalList: {
    flexGrow: 0,
    width: '100%',
    overflow: 'visible',
  },
  khalidClientsHorizontalScroll: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingVertical: 6,
    paddingRight: 12,
    paddingLeft: 2,
    flexGrow: 0,
  },
  khalidClientCardShadowHost: {
    flexShrink: 0,
    flexGrow: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  khalidPlaceCardShell: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    width: '100%',
  },
  khalidPlaceCardBody: {
    paddingBottom: 2,
    paddingTop: 0,
  },
  khalidClientCompactImageWrap: {
    width: '100%',
    height: 92,
    backgroundColor: 'rgba(22,26,38,1)',
    overflow: 'hidden',
    position: 'relative',
  },
  khalidClientCompactPhInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidClientCompactTitle: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 12,
    color: KHALID_LUX_PEARL,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    lineHeight: 16,
    minHeight: 36,
    letterSpacing: 0.2,
  },
  khalidClientCompactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 18,
  },
  khalidClientCompactMetaTypeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  khalidClientCompactMetaText: {
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  khalidClientCompactMetaDotText: {
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 10,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  khalidClientCompactMetaPrice: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  khalidClientCompactLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 2,
    minHeight: 17,
  },
  khalidClientCompactLocationText: {
    fontFamily: FONT_POPPINS_REGULAR,
    fontSize: 10,
    flexShrink: 1,
    letterSpacing: 0.1,
  },
  khalidClientCompactDistance: {
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 10,
    color: 'rgba(233,200,119,0.92)',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 8,
    letterSpacing: 0.15,
  },
  khalidClientCompactBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  khalidClientLuxAskOuter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(233,200,119,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,200,119,0.3)',
    borderRadius: 10,
    minHeight: 34,
  },
  khalidClientCompactBtnSingle: {
    flexGrow: 1,
    borderRadius: 10,
  },
  khalidClientCompactAskText: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 10,
    color: KHALID_LUX_GOLD,
    letterSpacing: 0.2,
  },
  khalidClientLuxViewTouch: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 10,
  },
  khalidClientLuxViewGrad: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 34,
    borderRadius: 10,
  },
  khalidClientCompactViewText: {
    fontFamily: FONT_POPPINS_BOLD,
    fontSize: 10,
    color: '#FFFBF5',
    letterSpacing: 0.3,
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
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,24,34,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  khalidCardPostBlockLast: {
    marginBottom: 0,
  },
  khalidCardPostImageWrap: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(30,41,59,0.6)',
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
    height: '48%',
  },
  khalidCardPostTitleOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(8,10,16,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  khalidCardPostTitleOverlayText: {
    fontFamily: FONT_POPPINS_BOLD,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  khalidCardPostDescOverlay: {
    fontFamily: FONT_POPPINS_REGULAR,
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 16,
    letterSpacing: 0.15,
  },
  khalidCardPostBody: {
    width: '100%',
    padding: 12,
    gap: 4,
  },
  khalidCardPostTitle: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 15,
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  khalidCardPostDesc: {
    fontFamily: FONT_POPPINS_REGULAR,
    fontSize: 13,
    color: 'rgba(203,213,225,0.88)',
    lineHeight: 19,
  },
  khalidCardReviewsTitle: {
    fontFamily: FONT_POPPINS_BOLD,
    fontSize: 16,
    color: '#F8FAFC',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  khalidCardNoReviews: {
    fontFamily: FONT_POPPINS_REGULAR,
    fontSize: 14,
    color: 'rgba(203,213,225,0.75)',
    fontStyle: 'italic',
  },
  khalidCardReviewBlock: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,24,34,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 3 },
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
    fontFamily: FONT_POPPINS_BOLD,
    fontSize: 11,
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
    fontFamily: FONT_POPPINS_BOLD,
    fontSize: 13,
    color: '#FBBF24',
  },
  khalidCardReviewBody: {
    fontFamily: FONT_POPPINS_REGULAR,
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
    fontFamily: FONT_POPPINS_MEDIUM,
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
    aspectRatio: 1,
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
    fontFamily: FONT_POPPINS_REGULAR,
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.12,
  },
  khalidBubbleTextUser: {
    fontFamily: FONT_POPPINS_MEDIUM,
    color: '#FFFFFF',
  },
  khalidBubbleTextAssistant: {
    fontFamily: FONT_POPPINS_REGULAR,
    color: '#E8EDF4',
  },
  khalidInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  khalidInputPill: {
    flex: 1,
    minHeight: 50,
    maxHeight: 112,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    justifyContent: 'flex-start',
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
  khalidInputFieldWrap: {
    flex: 1,
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    minHeight: 48,
    zIndex: 2,
  },
  khalidInput: {
    flex: 1,
    width: '100%',
    minHeight: 48,
    maxHeight: 108,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 12 : 12,
    paddingBottom: Platform.OS === 'ios' ? 12 : 12,
    fontFamily: FONT_POPPINS_REGULAR,
    fontSize: 15.5,
    ...Platform.select({
      ios: { lineHeight: 22 },
      android: {},
    }),
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
  khalidErrorBarBlur: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  khalidErrorBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  khalidErrorText: {
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 13,
    color: '#FCA5A5',
    flex: 1,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  khalidSuggestionsWrap: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  khalidSuggestionsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  khalidSuggestionsLabel: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  khalidSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 2,
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
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 13,
    color: '#F1F5F9',
    letterSpacing: 0.15,
  },
});
