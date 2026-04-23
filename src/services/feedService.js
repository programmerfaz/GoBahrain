import { supabase } from '../config/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ensureImageUrl } from '../utils/imageUrl'

/**
 * Feed service — fast, quality, personalized home feed.
 *
 * Design:
 *  - Parallel DB round-trips (posts + clients + upvotes + interactions + persona)
 *  - Page-sized DB fetch + rerank (correct cursor / hasMore for infinite scroll)
 *  - Normalized multi-signal scorer (0..1 per component) blended with weights
 *  - Persona-aware (persona_summary, general_ids, activity_ids, food_ids)
 *  - Time-decayed interaction affinity (recent interactions matter more)
 *  - Diversity constraint (no two consecutive posts by same author)
 *  - Module-level persona cache to keep pagination snappy
 *  - Seen-post exclusion with AsyncStorage (debounced persist)
 */

const FEED_CACHE_KEY = '@gobahrain_feed_cache'
const FEED_CACHE_TIMESTAMP_KEY = '@gobahrain_feed_cache_timestamp'
const SEEN_POST_IDS_KEY = '@gobahrain_feed_seen_post_ids'
const RECENT_TAGS_KEY = '@gobahrain_feed_recent_tags'

const CACHE_EXPIRY_MS = 5 * 60 * 1000
const PERSONA_CACHE_TTL_MS = 10 * 60 * 1000
const BATCH_SIZE = 15
const MAX_SEEN_IDS = 500
/** Client-side only: how many ids we honor when filtering refresh candidates (order matters — see buildRefreshExcludePostIds). */
const MAX_EXCLUDE_CLIENT_FILTER = 400
/** Pull a wide slice so ranking is not stuck reshuffling the same tiny survivor set. */
const REFRESH_FETCH_WINDOW = 100
const REFRESH_EXTRA_ROUNDS = 6
/** Keep paging until we have at least this many non-excluded candidates (or DB runs out). */
const REFRESH_MIN_CANDIDATE_POOL = 56
/** Cap merged rows before client/upvote fanout (cost control). */
const REFRESH_MAX_MERGED_ROWS = 220
const MAX_RECENT_TAGS = 32

/**
 * Prefer excluding `mustExcludeIds` first (e.g. current top cells + spin guard), then optional
 * `currentIds`, then seen (newest-first from `seenIds`). Home refresh usually passes empty
 * `currentIds` and empty `seenIds` so the pool is not wiped; feedService relaxes further if needed.
 */
export const buildRefreshExcludePostIds = (
  currentIds,
  seenIds,
  max = MAX_EXCLUDE_CLIENT_FILTER,
  mustExcludeIds = null
) => {
  const seen = new Set()
  const out = []
  for (const id of mustExcludeIds || []) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= max) return out
  }
  for (const id of currentIds || []) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= max) return out
  }
  for (const id of [...(seenIds || [])].reverse()) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= max) break
  }
  return out
}

/** VIEW spam control — FlatList fires onViewableItemsChanged very often while scrolling. */
const VIEW_PER_POST_COOLDOWN_MS = 6 * 60 * 60 * 1000 // one logged VIEW per post per 6h (same device / voter)
const VIEW_GLOBAL_WINDOW_MS = 60 * 1000
const VIEW_MAX_PER_GLOBAL_WINDOW = 6 // hard cap: ~6 VIEW rows / minute even across many posts
const lastViewAtByPostId = new Map()
const viewInsertTimestamps = []

const pruneViewInsertWindow = () => {
  const cutoff = Date.now() - VIEW_GLOBAL_WINDOW_MS
  while (viewInsertTimestamps.length > 0 && viewInsertTimestamps[0] < cutoff) {
    viewInsertTimestamps.shift()
  }
}

const shouldSkipViewTracking = (postId) => {
  if (!postId) return true
  const now = Date.now()
  pruneViewInsertWindow()
  if (viewInsertTimestamps.length >= VIEW_MAX_PER_GLOBAL_WINDOW) return true
  const last = lastViewAtByPostId.get(postId)
  if (last != null && now - last < VIEW_PER_POST_COOLDOWN_MS) return true
  return false
}

const rememberViewTracked = (postId) => {
  const now = Date.now()
  lastViewAtByPostId.set(postId, now)
  viewInsertTimestamps.push(now)
  if (lastViewAtByPostId.size > 500) {
    for (const [id, t] of lastViewAtByPostId) {
      if (now - t > VIEW_PER_POST_COOLDOWN_MS) lastViewAtByPostId.delete(id)
    }
  }
}

const INTERACTION_WEIGHTS = {
  LIKE: 4,
  SHARE: 3,
  PROFILE_VIEW: 2,
  VIEW: 1,
}

const INTERACTION_HALFLIFE_HOURS = 72
/** Slightly flatter than before so “newest” does not dominate every close tie. */
const RECENCY_HALFLIFE_HOURS = 64

/**
 * Interest id (from GENERAL_PREFERENCES / PREFERENCES / FOOD_CATEGORIES) →
 * keyword seeds used to boost posts whose text/tags mention the concept.
 * Keep short & high-signal; lowercased.
 */
const INTEREST_KEYWORDS = {
  foodie: ['food', 'restaurant', 'eat', 'dish', 'cuisine', 'meal', 'dining', 'chef', 'kitchen', 'brunch'],
  'culture-history': ['culture', 'heritage', 'museum', 'mosque', 'history', 'traditional', 'souq', 'fort'],
  'nature-outdoors': ['nature', 'park', 'beach', 'outdoor', 'garden', 'desert', 'island', 'trail'],
  nightlife: ['bar', 'lounge', 'club', 'night', 'rooftop', 'cocktail', 'dj'],
  shopping: ['shop', 'mall', 'boutique', 'store', 'souq', 'market'],
  'relaxation-wellness': ['spa', 'wellness', 'yoga', 'massage', 'relax', 'retreat'],
  adventure: ['adventure', 'desert', 'dune', 'dive', 'kayak', 'jetski', 'sport'],
  'instagram-spots': ['view', 'photo', 'insta', 'aesthetic', 'spot', 'scenic'],
  'local-authentic': ['local', 'authentic', 'bahraini', 'traditional', 'hidden'],
  'family-friendly': ['family', 'kids', 'children', 'playground', 'fun'],
  'art-museums': ['art', 'gallery', 'museum', 'exhibit'],
  'beaches-sun': ['beach', 'sea', 'coast', 'sun', 'swim', 'resort'],
  'quiet-peaceful': ['quiet', 'peaceful', 'calm', 'serene'],
  'social-lively': ['lively', 'social', 'buzz', 'crowd', 'vibe'],
  'hidden-gems': ['hidden', 'gem', 'secret', 'underrated'],
  sightseeing: ['landmark', 'tower', 'bridge', 'monument', 'fort'],
  instagram: ['photo', 'insta', 'aesthetic', 'view'],
  leisure: ['leisure', 'chill', 'relax'],
  nature: ['nature', 'park', 'outdoor', 'green'],
  historical: ['history', 'historic', 'heritage', 'ancient'],
  cultural: ['culture', 'traditional', 'art'],
  cafes: ['cafe', 'coffee', 'latte', 'espresso', 'bakery'],
  bakeries: ['bakery', 'pastry', 'bread', 'cake'],
  fastfood: ['burger', 'pizza', 'fries', 'fast'],
  seafood: ['seafood', 'fish', 'shrimp', 'lobster'],
  asian: ['asian', 'sushi', 'ramen', 'thai', 'chinese', 'japanese'],
  arabic: ['arabic', 'shawarma', 'kabsa', 'machboos', 'hummus', 'mezze'],
  italian: ['italian', 'pasta', 'pizza', 'risotto'],
  indian: ['indian', 'curry', 'biryani', 'tandoor'],
  dessert: ['dessert', 'sweet', 'ice cream', 'chocolate'],
  healthy: ['healthy', 'salad', 'vegan', 'organic'],
  steakhouse: ['steak', 'grill', 'meat', 'bbq'],
}

const STOPWORDS = new Set([
  'this','that','with','from','your','user','will','have','more','just','into','when','they','their','there','about','some','them','also','like','love','very','best','good','great','really','much','both','than','such','over','most','each','which','been','were','being','ours','yours','theirs','these','those','going','would','could','should','where','what','because','while','where','between','around','anyone','someone','enjoys','prefers','likes','loves','travel','traveler','experience','experiences','spots','place','places','profile','vibe','mix','style','pace','budget','relaxed','balanced','packed','premium','moderate','friend','friends','family','solo','couples','business','warm','open','local','locally','authentic','things','thing','make','makes','taking','prefer','prefers','spot','find','finds','explore','explorer','explores','day','days','time','across','while','without','within','using','based','ideal','avoid','avoidlist','tastes','interests','including','likely','perhaps','maybe','often','typically','tend','tends','trip','trips','visit','visits','discover','discovers'
])

/** ---------- Seen-id tracking (debounced) ---------- */

const pendingSeenMerge = new Set()
let seenFlushTimer = null

const loadSeenIdsFromStorage = async () => {
  try {
    const raw = await AsyncStorage.getItem(SEEN_POST_IDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const persistSeenMerge = async () => {
  if (pendingSeenMerge.size === 0) return
  const prev = await loadSeenIdsFromStorage()
  const next = [...new Set([...prev, ...pendingSeenMerge])].slice(-MAX_SEEN_IDS)
  pendingSeenMerge.clear()
  try {
    await AsyncStorage.setItem(SEEN_POST_IDS_KEY, JSON.stringify(next))
  } catch {
    /* non-fatal */
  }
}

export const markPostsSeen = (ids) => {
  if (!ids?.length) return
  for (const id of ids) {
    if (id) pendingSeenMerge.add(id)
  }
  if (seenFlushTimer) clearTimeout(seenFlushTimer)
  seenFlushTimer = setTimeout(() => {
    seenFlushTimer = null
    persistSeenMerge()
  }, 400)
}

export const flushSeenPostIds = async () => {
  if (seenFlushTimer) clearTimeout(seenFlushTimer)
  seenFlushTimer = null
  await persistSeenMerge()
}

export const getSeenPostIds = async () => {
  const stored = await loadSeenIdsFromStorage()
  return [...new Set([...stored, ...pendingSeenMerge])]
}

/** ---------- Recently-engaged tag memory (session bias) ---------- */

let recentTagsCache = null
const loadRecentTags = async () => {
  if (recentTagsCache) return recentTagsCache
  try {
    const raw = await AsyncStorage.getItem(RECENT_TAGS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    recentTagsCache = Array.isArray(parsed) ? parsed.slice(-MAX_RECENT_TAGS) : []
  } catch {
    recentTagsCache = []
  }
  return recentTagsCache
}

const pushRecentTags = async (tags) => {
  if (!Array.isArray(tags) || tags.length === 0) return
  const current = await loadRecentTags()
  const merged = [...current, ...tags.map((t) => String(t).toLowerCase())].slice(-MAX_RECENT_TAGS)
  recentTagsCache = merged
  try {
    await AsyncStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(merged))
  } catch {
    /* non-fatal */
  }
}

/** ---------- Voter id ---------- */

export const getVoterId = async () => {
  try {
    const VOTER_ID_KEY = '@gobahrain_voter_id'
    let id = await AsyncStorage.getItem(VOTER_ID_KEY)
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      await AsyncStorage.setItem(VOTER_ID_KEY, id)
    }
    return id
  } catch {
    return `anon-${Date.now()}`
  }
}

/** ---------- Interaction tracking ---------- */

export const trackInteraction = async (type, data) => {
  try {
    if (type === 'VIEW' && shouldSkipViewTracking(data.postId)) return

    const voterId = await getVoterId()
    const interaction = {
      voter_id: voterId,
      interaction_type: type,
      post_uuid: data.postId || null,
      client_uuid: data.clientId || null,
      tags: data.tags || null,
      created_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('user_interactions').insert(interaction)
    if (error) return
    if (type === 'VIEW' && data.postId) rememberViewTracked(data.postId)
    if (Array.isArray(data.tags) && (type === 'LIKE' || type === 'PROFILE_VIEW' || type === 'SHARE')) {
      pushRecentTags(data.tags)
    }
  } catch {
    /* tracking is optional */
  }
}

const getUserInteractions = async (voterId, limit = 150) => {
  try {
    const { data, error } = await supabase
      .from('user_interactions')
      .select('interaction_type, post_uuid, client_uuid, tags, created_at')
      .eq('voter_id', voterId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

/** ---------- Personalization (cached) ---------- */

const personaCache = new Map() // key: userId | 'anon' → { data, ts }

export const invalidatePersonalizationCache = () => {
  personaCache.clear()
}

const loadUserPersonalization = async (fallbackSummary = '') => {
  try {
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id || 'anon'
    const cached = personaCache.get(userId)
    if (cached && Date.now() - cached.ts < PERSONA_CACHE_TTL_MS) return cached.data

    let row = null
    if (userId !== 'anon') {
      const { data } = await supabase
        .from('user_personalization')
        .select('persona_summary, general_ids, activity_ids, food_ids, profile_answers')
        .eq('user_id', userId)
        .maybeSingle()
      row = data || null
    }

    const result = {
      personaSummary: (row?.persona_summary || fallbackSummary || '').toString(),
      generalIds: Array.isArray(row?.general_ids) ? row.general_ids : [],
      activityIds: Array.isArray(row?.activity_ids) ? row.activity_ids : [],
      foodIds: Array.isArray(row?.food_ids) ? row.food_ids : [],
      profileAnswers: row?.profile_answers || {},
    }
    personaCache.set(userId, { data: result, ts: Date.now() })
    return result
  } catch {
    return {
      personaSummary: fallbackSummary || '',
      generalIds: [],
      activityIds: [],
      foodIds: [],
      profileAnswers: {},
    }
  }
}

/** Warm the persona cache at app start for an instant-first-feed UX. */
export const prefetchPersonalization = async (fallbackSummary = '') => {
  await loadUserPersonalization(fallbackSummary)
}

/** ---------- Token helpers ---------- */

const tokenize = (text) => {
  if (!text) return []
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9\u0600-\u06FF]+/u)
    .filter((t) => t && t.length >= 3 && !STOPWORDS.has(t))
}

const buildPersonaFeatureSet = (persona) => {
  const tokens = new Set()
  const weightMap = new Map() // token -> weight

  const add = (t, w = 1) => {
    if (!t) return
    const k = String(t).toLowerCase().trim()
    if (k.length < 3 || STOPWORDS.has(k)) return
    tokens.add(k)
    weightMap.set(k, Math.max(weightMap.get(k) || 0, w))
  }

  for (const tok of tokenize(persona?.personaSummary)) add(tok, 1)
  if (persona?.profileAnswers?.idealDay) {
    for (const tok of tokenize(persona.profileAnswers.idealDay)) add(tok, 1.2)
  }

  const interestIds = [
    ...(persona?.generalIds || []),
    ...(persona?.activityIds || []),
    ...(persona?.foodIds || []),
  ]
  for (const id of interestIds) {
    const kws = INTEREST_KEYWORDS[id]
    if (!kws) continue
    for (const kw of kws) add(kw, 2) // interests are strong signals
  }

  const avoidTokens = new Set(tokenize(persona?.profileAnswers?.avoidList))

  return { tokens, weightMap, avoidTokens }
}

/** ---------- Distance ---------- */

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** ---------- Scoring ---------- */

const scoreRecency = (post) => {
  const hours = Math.max(0, (Date.now() - new Date(post.created_at || 0).getTime()) / 3600000)
  return Math.exp(-hours / RECENCY_HALFLIFE_HOURS) // 0..1
}

const scorePopularity = (post) => {
  const up = Math.max(0, post.upvotes || 0)
  return Math.min(1, Math.log10(up + 1) / Math.log10(201)) // saturates at ~200 upvotes
}

const scoreEngagement = (post) => {
  const hours = Math.max(1, (Date.now() - new Date(post.created_at || 0).getTime()) / 3600000)
  const days = hours / 24
  const per = (post.upvotes || 0) / Math.max(1, days)
  return Math.min(1, per / 10) // 10 upvotes/day → 1.0
}

const scoreProximity = (post, lat, lng) => {
  if (lat == null || lng == null || post.lat == null || post.lng == null) return 0
  const km = haversineKm(lat, lng, post.lat, post.lng)
  return Math.exp(-km / 4) // 4km half-life
}

const scorePersona = (post, personaFeatures) => {
  if (!personaFeatures || personaFeatures.tokens.size === 0) return 0
  const text = [
    post.description,
    post.businessName,
    post.location,
    ...(post.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (!text) return 0

  let hit = 0
  let total = 0
  for (const [tok, w] of personaFeatures.weightMap) {
    total += w
    if (text.includes(tok)) hit += w
  }
  if (total === 0) return 0
  const raw = hit / total
  // Non-linear: reward partial matches but cap fast
  return Math.min(1, Math.sqrt(raw) * 1.8)
}

const scoreAffinity = (post, interactions) => {
  if (!interactions || interactions.length === 0) return 0
  const now = Date.now()
  let sum = 0
  let max = 0
  const postTags = new Set((post.tags || []).map((t) => String(t).toLowerCase()))
  for (const it of interactions) {
    const w = INTERACTION_WEIGHTS[it.interaction_type] || 1
    const ageH = Math.max(0, (now - new Date(it.created_at || 0).getTime()) / 3600000)
    const decay = Math.exp(-ageH / INTERACTION_HALFLIFE_HOURS)
    const weighted = w * decay
    max += w
    let matched = false
    if (it.post_uuid && it.post_uuid === post.id) matched = true
    else if (it.client_uuid && it.client_uuid === post.clientId) matched = true
    else if (Array.isArray(it.tags) && postTags.size > 0) {
      for (const t of it.tags) {
        if (postTags.has(String(t).toLowerCase())) { matched = true; break }
      }
    }
    if (matched) sum += weighted
  }
  if (max === 0) return 0
  return Math.min(1, sum / Math.max(1, max * 0.35)) // easier to saturate
}

const scoreRecentTags = (post, recentTags) => {
  if (!recentTags || recentTags.length === 0) return 0
  const tagSet = new Set((post.tags || []).map((t) => String(t).toLowerCase()))
  if (tagSet.size === 0) return 0
  const recent = new Set(recentTags)
  let hit = 0
  for (const t of tagSet) if (recent.has(t)) hit++
  return Math.min(1, hit / 3)
}

const avoidPenalty = (post, avoidTokens) => {
  if (!avoidTokens || avoidTokens.size === 0) return 0
  const text = [post.description, post.businessName, ...(post.tags || [])]
    .filter(Boolean).join(' ').toLowerCase()
  let hit = 0
  for (const t of avoidTokens) if (text.includes(t)) hit++
  return Math.min(1, hit / 2)
}

const scorePost = (post, ctx) => {
  const {
    personaFeatures,
    interactions,
    userLat,
    userLng,
    recentTags,
    hasPersona,
    hasInteractions,
    hasLocation,
    isRefresh,
  } = ctx

  const recency = scoreRecency(post)
  const popular = scorePopularity(post)
  const engage = scoreEngagement(post)
  const proximity = hasLocation ? scoreProximity(post, userLat, userLng) : 0
  const persona = hasPersona ? scorePersona(post, personaFeatures) : 0
  const affinity = hasInteractions ? scoreAffinity(post, interactions) : 0
  const sessionBias = scoreRecentTags(post, recentTags)
  const penalty = hasPersona ? avoidPenalty(post, personaFeatures.avoidTokens) : 0

  // Dynamic weights — recency is one signal among several (not the sole driver).
  let W_RECENCY = 0.16
  let W_POPULAR = 0.15
  let W_ENGAGE = 0.09
  let W_PROXIMITY = hasLocation ? 0.13 : 0
  let W_PERSONA = hasPersona ? 0.26 : 0
  let W_AFFINITY = hasInteractions ? 0.16 : 0
  let W_SESSION = 0.07

  if (!hasLocation) {
    W_RECENCY += 0.06
  }

  if (!hasPersona && !hasInteractions) {
    W_RECENCY = hasLocation ? 0.28 : 0.34
    W_POPULAR = 0.25
    W_ENGAGE = 0.14
    W_PROXIMITY = hasLocation ? 0.17 : 0
    W_SESSION = 0.06
  }

  const base =
    W_RECENCY * recency +
    W_POPULAR * popular +
    W_ENGAGE * engage +
    W_PROXIMITY * proximity +
    W_PERSONA * persona +
    W_AFFINITY * affinity +
    W_SESSION * sessionBias

  // Tie-break jitter: keep refresh smaller so persona/recency stay meaningful.
  const epsilon = isRefresh ? Math.random() * 0.085 : Math.random() * 0.015

  return Math.max(0, base - penalty * 0.25 + epsilon)
}

/** ---------- Diversity ---------- */

const diversifyFeed = (rankedPosts) => {
  const sorted = [...rankedPosts].sort((a, b) => {
    const d = (b.score || 0) - (a.score || 0)
    if (Math.abs(d) > 0.01) return d
    // Stable tie-break — do not re-sort ties by created_at (that double-counts “newest wins”).
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
  const out = []
  const remaining = sorted
  const recentUsers = []
  const WINDOW = 3
  while (remaining.length > 0) {
    let pickIdx = -1
    for (let i = 0; i < remaining.length; i++) {
      if (!recentUsers.includes(remaining[i].clientId)) { pickIdx = i; break }
    }
    if (pickIdx === -1) pickIdx = 0
    const picked = remaining.splice(pickIdx, 1)[0]
    out.push(picked)
    recentUsers.push(picked.clientId)
    if (recentUsers.length > WINDOW) recentUsers.shift()
  }
  return out
}

/** ---------- Image normalization ---------- */

const resolveImageUri = (raw) => {
  let imageUri = raw
  if (imageUri && typeof imageUri === 'string' && imageUri.startsWith('[{')) {
    try {
      const parsed = JSON.parse(imageUri)
      if (Array.isArray(parsed) && parsed[0]?.url) imageUri = parsed[0].url
      else if (Array.isArray(parsed) && typeof parsed[0] === 'string') imageUri = parsed[0]
    } catch {
      /* fall through */
    }
  }
  if (imageUri && typeof imageUri === 'string' && !imageUri.startsWith('http')) {
    const clean = imageUri.startsWith('gobahrain-post-images/')
      ? imageUri.replace('gobahrain-post-images/', '')
      : imageUri
    imageUri = `https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/${clean}`
  }
  return imageUri || null
}

const parseTags = (tags) => {
  if (tags == null) return []
  if (Array.isArray(tags)) return tags
  return String(tags).split(',').map((t) => t.trim()).filter(Boolean)
}

/** PRNG for shuffle (mulberry32). */
const mulberry32 = (seed) => {
  let a = seed >>> 0
  return () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffleInPlace = (arr, rng) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
}

/**
 * Pull-to-refresh: Fisher–Yates shuffle on the top window so order varies each pull.
 * Tail of `ranked` stays in algorithm order. Skipped for strict distance "nearby" mode.
 */
const applyRefreshShuffle = (ranked, neverFirstPostId) => {
  if (!ranked || ranked.length < 2) return ranked
  const depth = Math.min(ranked.length, 36)
  const front = ranked.slice(0, depth)
  const tail = ranked.slice(depth)
  const seed =
    (Date.now() ^
      (depth << 12) ^
      (String(front[0]?.id || '').length << 5) ^
      (front.length << 3)) >>>
    0
  const rng = mulberry32(seed)
  shuffleInPlace(front, rng)
  if (neverFirstPostId && front[0]?.id === neverFirstPostId) {
    const swap = front.findIndex((p) => p.id !== neverFirstPostId)
    if (swap > 0) {
      const t = front[0]
      front[0] = front[swap]
      front[swap] = t
    }
  }
  return [...front, ...tail]
}

/** ---------- Main pipeline ---------- */

export const fetchFeedPage = async ({
  cursor = null,
  limit = BATCH_SIZE,
  userId = null, // eslint-disable-line no-unused-vars
  userLat = null,
  userLng = null,
  category = null,
  searchQuery = null,
  useCache = true,
  isRefresh = false,
  userPersonaSummary = '',
  excludePostIds = null,
  /** If refresh still surfaces this id first, replace it (safety vs stale exclude / fallback fetch). */
  neverFirstPostId = null,
} = {}) => {
  try {
    if (isRefresh) invalidatePersonalizationCache()

    const excludeIdsRaw =
      Array.isArray(excludePostIds) && excludePostIds.length > 0
        ? [...new Set(excludePostIds.filter(Boolean))]
        : []
    if (neverFirstPostId && typeof neverFirstPostId === 'string' && !excludeIdsRaw.includes(neverFirstPostId)) {
      excludeIdsRaw.unshift(neverFirstPostId)
    }
    const excludeIds = excludeIdsRaw.slice(0, MAX_EXCLUDE_CLIENT_FILTER)
    const excludeSet = new Set(excludeIds)

    if (useCache && !cursor && !isRefresh) {
      const cached = await getCachedFeed()
      if (cached) {
        console.log('[FeedService] Cache hit:', cached.posts.length, 'posts')
        return cached
      }
    }

    const fetchLimit =
      !cursor && isRefresh && excludeIds.length > 0 ? REFRESH_FETCH_WINDOW : limit

    const runPostsQuery = (beforeCreatedAt = null) => {
      let q = supabase
        .from('posts')
        .select('post_uuid, client_a_uuid, description, price_range, post_image, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchLimit)
      if (beforeCreatedAt) q = q.lt('created_at', beforeCreatedAt)
      else if (cursor) q = q.lt('created_at', cursor)
      return q
    }

    /** Parallelize: voter id, persona, recent tags, and posts. */
    const [voterId, persona, recentTags, firstPostsRes] = await Promise.all([
      getVoterId(),
      loadUserPersonalization(userPersonaSummary),
      loadRecentTags(),
      runPostsQuery(),
    ])

    if (firstPostsRes.error) throw firstPostsRes.error

    const rawFirstPageRows = [...(firstPostsRes.data || [])]

    const mergeFilteredRows = (rows) =>
      (rows || []).filter((r) => r?.post_uuid && !excludeSet.has(r.post_uuid))

    let postRows = mergeFilteredRows(firstPostsRes.data)
    if (isRefresh && excludeIds.length > 0 && postRows.length > REFRESH_MAX_MERGED_ROWS) {
      postRows = postRows.slice(0, REFRESH_MAX_MERGED_ROWS)
    }
    let lastRawBatch = firstPostsRes.data || []
    let lastRawLen = lastRawBatch.length

    if (isRefresh && excludeIds.length > 0) {
      let before = lastRawBatch.length ? lastRawBatch[lastRawBatch.length - 1]?.created_at : null
      for (let round = 0; round < REFRESH_EXTRA_ROUNDS; round++) {
        if (postRows.length >= REFRESH_MIN_CANDIDATE_POOL || lastRawLen < fetchLimit || !before) break
        const nextRes = await runPostsQuery(before)
        if (nextRes.error) throw nextRes.error
        lastRawBatch = nextRes.data || []
        lastRawLen = lastRawBatch.length
        if (!lastRawLen) break
        const byId = new Map(postRows.map((r) => [r.post_uuid, r]))
        for (const r of lastRawBatch) {
          if (r?.post_uuid && !excludeSet.has(r.post_uuid)) byId.set(r.post_uuid, r)
        }
        postRows = Array.from(byId.values()).sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
        )
        if (postRows.length > REFRESH_MAX_MERGED_ROWS) {
          postRows = postRows.slice(0, REFRESH_MAX_MERGED_ROWS)
        }
        before = lastRawBatch[lastRawBatch.length - 1]?.created_at
        if (lastRawLen < fetchLimit) break
      }
    }

    if (postRows.length === 0 && isRefresh && excludeIds.length > 0) {
      const second = await runPostsQuery()
      if (second.error) throw second.error
      lastRawBatch = second.data || []
      lastRawLen = lastRawBatch.length
      postRows = mergeFilteredRows(lastRawBatch)
    }

    if (postRows.length === 0 && isRefresh) {
      const acc = [...rawFirstPageRows]
      const seenUuid = new Set(acc.map((x) => x.post_uuid).filter(Boolean))
      let before = acc.length ? acc[acc.length - 1]?.created_at : null
      for (let r = 0; r < 6 && before; r++) {
        const res = await runPostsQuery(before)
        if (res.error) throw res.error
        const chunk = res.data || []
        if (!chunk.length) break
        for (const row of chunk) {
          if (row?.post_uuid && !seenUuid.has(row.post_uuid)) {
            seenUuid.add(row.post_uuid)
            acc.push(row)
          }
        }
        before = chunk[chunk.length - 1]?.created_at
        if (chunk.length < fetchLimit) break
      }
      acc.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      const priorOnly = new Set([neverFirstPostId].filter(Boolean))
      let trial = acc.filter((r) => r?.post_uuid && !excludeSet.has(r.post_uuid))
      if (!trial.length && excludeSet.size > 0) {
        trial = acc.filter((r) => r?.post_uuid && !priorOnly.has(r.post_uuid))
      }
      if (!trial.length) {
        trial = acc.filter((r) => r?.post_uuid)
      }
      postRows = trial.slice(0, REFRESH_MAX_MERGED_ROWS)
      if (postRows.length) {
        lastRawLen = acc.length >= fetchLimit ? fetchLimit : 0
        lastRawBatch = acc.slice(Math.max(0, acc.length - fetchLimit))
      }
    }

    if (postRows.length === 0) {
      return { posts: [], nextCursor: null, hasMore: false }
    }

    const clientIds = [...new Set(postRows.map((r) => r.client_a_uuid).filter(Boolean))]
    const postIds = postRows.map((r) => r.post_uuid)

    /** Parallel fanout for everything downstream. */
    const [clientsRes, upvotesRes, interactions] = await Promise.all([
      clientIds.length
        ? supabase
            .from('client')
            .select('client_a_uuid, business_name, client_image, tags, rating, price_range, lat, long')
            .in('client_a_uuid', clientIds)
        : Promise.resolve({ data: [], error: null }),
      postIds.length
        ? supabase
            .from('post_upvote')
            .select('post_uuid, voter_id')
            .in('post_uuid', postIds)
        : Promise.resolve({ data: [], error: null }),
      getUserInteractions(voterId),
    ])

    const clientMap = {}
    for (const c of clientsRes.data || []) {
      const id = c.client_a_uuid
      if (id) clientMap[id] = c
    }

    const upvoteCounts = {}
    const myUpvotedIds = new Set()
    for (const r of upvotesRes.data || []) {
      upvoteCounts[r.post_uuid] = (upvoteCounts[r.post_uuid] || 0) + 1
      if (r.voter_id === voterId) myUpvotedIds.add(r.post_uuid)
    }

    const mapped = postRows.map((row) => {
      const client = clientMap[row.client_a_uuid] || null
      const tags = parseTags(client?.tags)
      const rating = client?.rating != null && client?.rating !== '' ? client.rating : null
      const clientPrice = client?.price_range != null && client?.price_range !== '' ? client.price_range : null
      const postPrice = row.price_range != null && row.price_range !== '' ? row.price_range : null
      const priceRange = postPrice ?? clientPrice
      const businessName = client?.business_name ?? null
      const rawClientImage =
        client?.client_image != null && String(client.client_image).trim() !== ''
          ? String(client.client_image).trim()
          : null
      const clientImage = rawClientImage ? ensureImageUrl(rawClientImage) || rawClientImage : null

      const imageUri = resolveImageUri(row.post_image)
      const lat = client?.lat != null && client?.lat !== '' ? parseFloat(client.lat) : null
      const lng = client?.long != null && client?.long !== '' ? parseFloat(client.long) : null
      const hasCoords = lat != null && !Number.isNaN(lat) && lng != null && !Number.isNaN(lng)

      return {
        id: row.post_uuid,
        clientId: row.client_a_uuid,
        username: row.client_a_uuid?.slice(0, 8) ?? 'client',
        businessName: businessName ? String(businessName).trim() : null,
        clientImage,
        tags,
        rating,
        priceRange: priceRange != null ? `${priceRange} BHD` : '',
        verified: false,
        location: '',
        distance: '',
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        imageUri,
        openNow: false,
        upvotes: upvoteCounts[row.post_uuid] ?? 0,
        hasUpvoted: myUpvotedIds.has(row.post_uuid),
        description: row.description || '',
        created_at: row.created_at,
      }
    })

    const personaFeatures = buildPersonaFeatureSet(persona)
    const hasPersona =
      personaFeatures.tokens.size > 0 ||
      (persona?.generalIds?.length || 0) > 0 ||
      (persona?.activityIds?.length || 0) > 0 ||
      (persona?.foodIds?.length || 0) > 0
    const hasInteractions = interactions && interactions.length > 0
    const hasLocation = userLat != null && userLng != null

    const ctx = {
      personaFeatures,
      interactions,
      userLat,
      userLng,
      recentTags,
      hasPersona,
      hasInteractions,
      hasLocation,
      isRefresh,
    }

    const scored = mapped.map((post) => ({ ...post, score: scorePost(post, ctx) }))

    let ranked = diversifyFeed(scored)

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      ranked = ranked.filter((post) => {
        const text = [post.description, post.businessName, post.location, ...(post.tags || [])]
          .filter(Boolean).join(' ').toLowerCase()
        return text.includes(q)
      })
    }

    if (category === 'nearby' && hasLocation) {
      ranked.sort((a, b) => {
        if (a.lat == null || a.lng == null) return 1
        if (b.lat == null || b.lng == null) return -1
        return (
          haversineKm(userLat, userLng, a.lat, a.lng) -
          haversineKm(userLat, userLng, b.lat, b.lng)
        )
      })
    } else if (isRefresh && ranked.length >= 2) {
      ranked = applyRefreshShuffle(ranked, neverFirstPostId)
    }

    let visible = ranked.slice(0, limit)
    if (
      isRefresh &&
      neverFirstPostId &&
      visible.length > 0 &&
      visible[0]?.id === neverFirstPostId
    ) {
      const without = ranked.filter((p) => p.id !== neverFirstPostId)
      visible = without.slice(0, limit)
    }

    // Cursor = oldest post in the merged candidate pool (desc ⇒ last). Next page loads older than this.
    const lastRow = postRows[postRows.length - 1]
    const nextCursor = lastRow?.created_at ?? null

    const result = {
      posts: visible,
      nextCursor,
      hasMore: lastRawLen === fetchLimit,
    }

    if (!cursor && useCache && !isRefresh) await cacheFeed(result)

    if (isRefresh) {
      console.log(
        `[FeedService] refresh: ${visible.length}/${postRows.length} posts · persona=${hasPersona} · interactions=${interactions.length} · location=${hasLocation}`
      )
    }

    return result
  } catch (err) {
    console.error('[FeedService] fetchFeedPage error:', err)
    throw err
  }
}

/** ---------- Cache ---------- */

const getCachedFeed = async () => {
  try {
    const [cached, timestamp] = await Promise.all([
      AsyncStorage.getItem(FEED_CACHE_KEY),
      AsyncStorage.getItem(FEED_CACHE_TIMESTAMP_KEY),
    ])
    if (!cached || !timestamp) return null
    const age = Date.now() - parseInt(timestamp, 10)
    if (age > CACHE_EXPIRY_MS) {
      await clearFeedCache()
      return null
    }
    return JSON.parse(cached)
  } catch {
    return null
  }
}

const cacheFeed = async (data) => {
  try {
    await Promise.all([
      AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(data)),
      AsyncStorage.setItem(FEED_CACHE_TIMESTAMP_KEY, Date.now().toString()),
    ])
  } catch {
    /* non-fatal */
  }
}

export const clearFeedCache = async () => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(FEED_CACHE_KEY),
      AsyncStorage.removeItem(FEED_CACHE_TIMESTAMP_KEY),
    ])
  } catch {
    /* non-fatal */
  }
}

export const invalidateFeedCache = clearFeedCache
