import { OPENAI_KEY, PINECONE_KEY, PINECONE_HOST, OPENAI_PLAN_MODEL } from '../config/keys';
import { supabase } from '../config/supabase';
import { coerceImageValueToString, resolvePublicImageUrl } from '../utils/imageUrl';
import {
  restaurantMealTypeHasSnackOffering,
  restaurantMealTypeSnackOnlyServing,
} from '../utils/restaurantClientMeta';

const OPENAI_API_KEY = OPENAI_KEY;
const PINECONE_API_KEY = PINECONE_KEY;

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const PINECONE_QUERY_URL = `${PINECONE_HOST}/query`;
const PINECONE_API_VERSION = '2024-07';
const FETCH_TIMEOUT_MS = 45000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// ─── Mock plan (fallback when OpenAI/Pinecone unavailable) ──────────

/** Returns a full-day Bahrain plan for demo/fallback when APIs fail. */
export function getMockDayPlan() {
  return [
    { spot: 'Cinnabon Bahrain City Centre', time: 'Morning', type: 'restaurant', lat: 26.2195, lng: 50.5878, reason: 'Start your day with sweet pastries and coffee — a Bahrain favourite for breakfast.' },
    { spot: 'Bahrain National Museum', time: 'Morning', type: 'place', lat: 26.2285, lng: 50.5865, reason: 'Discover 5000 years of Bahraini history and the ancient Dilmun civilization.' },
    { spot: 'Bahrain Fort (Qal\'at al-Bahrain)', time: 'Morning', type: 'place', lat: 26.2326, lng: 50.5216, reason: 'UNESCO World Heritage site — stunning views and ancient ruins by the sea.' },
    { spot: 'Café Lilou', time: 'Afternoon', type: 'restaurant', lat: 26.2189, lng: 50.5834, reason: 'Chill lunch spot with great salads and sandwiches — perfect midday break.' },
    { spot: 'Bahrain City Centre', time: 'Afternoon', type: 'place', lat: 26.2195, lng: 50.5878, reason: 'Shop, catch a movie, or escape the heat in one of the Gulf\'s best malls.' },
    { spot: 'Manama Souq', time: 'Evening', type: 'place', lat: 26.2287, lng: 50.5795, reason: 'Wander the old souq — spices, gold, and that authentic Bahrain vibe.' },
    { spot: 'Rasoi by Vineet', time: 'Evening', type: 'restaurant', lat: 26.2282, lng: 50.5852, reason: 'Michelin-starred Indian cuisine to end your day in style. Yalla!' },
  ];
}

// ─── helpers ────────────────────────────────────────────────────────

/** Parse response as JSON; avoid "Unexpected character" when API returns plain text (e.g. Forbidden). */
async function parseJsonResponse(res, serviceName = 'API') {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`${serviceName} returned invalid JSON (${res.status}): ${text.slice(0, 80)}`);
    }
  }
  throw new Error(`${serviceName} returned non-JSON (${res.status}): ${text.slice(0, 80)}`);
}

const OPENAI_EMBED_MODEL = 'text-embedding-3-small';
const EMBEDDING_CACHE_MAX = 128;
const embeddingVectorCache = new Map();

async function fetchEmbeddingUncached(trimmedInput) {
  const res = await fetchWithTimeout(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: trimmedInput }),
  });
  const json = await parseJsonResponse(res, 'OpenAI');
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI embed error (${res.status})`);
  const embedding = json?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) throw new Error('No embedding returned');
  return embedding;
}

function embeddingCacheKeyForText(text) {
  const input = String(text || '').trim();
  if (!input) return '';
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${input.length}:${(h >>> 0).toString(36)}`;
}

/** Embeddings cache (LRU-ish via Map insertion order eviction) — cuts latency when persona + retrieval lines repeat */
async function getEmbedding(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Empty embedding input');
  const k = embeddingCacheKeyForText(trimmed);
  if (!k) throw new Error('Empty embedding input');
  const hit = embeddingVectorCache.get(k);
  if (hit) return hit;
  const embedding = await fetchEmbeddingUncached(trimmed);
  if (embeddingVectorCache.size >= EMBEDDING_CACHE_MAX) {
    const oldest = embeddingVectorCache.keys().next().value;
    if (oldest != null) embeddingVectorCache.delete(oldest);
  }
  embeddingVectorCache.set(k, embedding);
  return embedding;
}

async function queryPinecone(vector, topK, filter) {
  if (!PINECONE_API_KEY || !PINECONE_HOST) {
    console.warn('[Pinecone] Missing API key or host');
    return [];
  }
  const payload = {
    vector,
    topK,
    includeMetadata: true,
    includeValues: false,
  };
  if (filter != null && typeof filter === 'object' && Object.keys(filter).length > 0) {
    payload.filter = filter;
  }
  const res = await fetchWithTimeout(PINECONE_QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': PINECONE_API_KEY,
      'X-Pinecone-Api-Version': PINECONE_API_VERSION,
    },
    body: JSON.stringify(payload),
  });
  const json = await parseJsonResponse(res, 'Pinecone');
  if (!res.ok) throw new Error(json?.message || `Pinecone error (${res.status})`);
  return (json && json.matches) || [];
}

async function queryPineconeSafe(vector, topK, filter) {
  try {
    return await queryPinecone(vector, topK, filter);
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'timeout' : e?.message;
    console.warn('[Pinecone] query failed:', msg);
    return [];
  }
}

/** Max chars of profile summary appended to label-based retrieval (embedding input). */
const RETRIEVAL_PERSONA_CLIP = 720
const RETRIEVAL_LIMITS = {
  placesTopKDefault: 20,
  placesTopKCoastal: 28,
  placesReturnMax: 24,
  /** Single-label quick find (generic): moderate pool */
  quickFindPlacesTopK: 18,
  quickFindPlacesReturnMax: 18,
  /**
   * Quick find with a specific gated theme (Beach, Museum, Park…): large dual-query pool so
   * the caller has enough real matches for distance-based cycling ("nearest → second nearest → …").
   * Each of the two parallel Pinecone queries uses topK=40; after RRF merge ≈50-60 candidates,
   * typically 8-20 pass the strict theme gate — enough for many "Search again" rotations.
   */
  quickFindGatedTopK: 40,
  quickFindGatedReturnMax: 50,
  quickFindRestaurantsTopK: 16,
  quickFindEventsTopK: 18,
  restaurantsTopK: 24,
  breakfastTopK: 8,
  eventsTopK: 14,
}

/**
 * Stable fingerprint so UI prefetch invalidates when persona text changes.
 * @param {unknown} summary
 * @returns {string}
 */
export const retrievalPersonaCacheKey = (summary) => {
  const t = typeof summary === 'string' ? summary.trim() : ''
  if (!t) return ''
  return `${t.length}:${t.slice(0, 96)}`
}

const STRUCTURED_PROFILE_ANSWER_KEYS = [
  'homeCountry',
  'tripLengthDays',
  'travelParty',
  'budgetBand',
  'dietaryHardNos',
  'mobilityNotes',
  'heatSensitivity',
  'sessionIntentDay',
]

/**
 * Cache key for plan prefetch when structured answers change retrieval text.
 * @param {unknown} summary
 * @param {object} [profileAnswers]
 */
export const planRetrievalContextKey = (summary, profileAnswers) => {
  const base = retrievalPersonaCacheKey(summary)
  const a = profileAnswers && typeof profileAnswers === 'object' ? profileAnswers : {}
  const bits = STRUCTURED_PROFILE_ANSWER_KEYS.map((k) => {
    const v = a[k]
    const s = v == null ? '' : String(v).trim().slice(0, 64)
    return `${k}:${s}`
  }).join('|')
  return `${base}__${bits}`
}

const clipPersonaForRetrievalQuery = (summary) => {
  const t = typeof summary === 'string' ? summary.trim() : ''
  if (!t) return ''
  if (t.length <= RETRIEVAL_PERSONA_CLIP) return t
  return `${t.slice(0, RETRIEVAL_PERSONA_CLIP).trim()}…`
}

const collectStructuredTripPairs = (answers) => {
  const a = answers && typeof answers === 'object' ? answers : {}
  /** @type {Array<[string, string]>} */
  const pairs = []
  const push = (label, raw) => {
    const v = raw == null ? '' : String(raw).trim()
    if (!v) return
    pairs.push([label, v])
  }
  push('Home country', a.homeCountry)
  push('Trip length (days)', a.tripLengthDays)
  push('Travel party', a.travelParty)
  push('Budget comfort', a.budgetBand)
  push('Dietary & hard nos', a.dietaryHardNos)
  push('Mobility notes', a.mobilityNotes)
  push('Heat sensitivity', a.heatSensitivity)
  push('Broader trip intent', a.sessionIntentDay)
  return pairs
}

const clipStructuredAnswersForRetrieval = (answers) => {
  const pairs = collectStructuredTripPairs(answers)
  if (!pairs.length) return ''
  const joined = pairs.map(([lab, val]) => `${lab}: ${val}`).join(' · ')
  if (joined.length <= 280) return joined
  return `${joined.slice(0, 279).trim()}…`
}

/**
 * @param {string} coreLine
 * @param {string} [profileNarrative]
 * @param {object} [retrievalExtras]
 * @param {object} [retrievalExtras.profileAnswers]
 */
const buildRetrievalEmbeddingText = (coreLine, profileNarrative, retrievalExtras = null) => {
  const extras = retrievalExtras && typeof retrievalExtras === 'object' ? retrievalExtras : {}
  const p = clipPersonaForRetrievalQuery(profileNarrative)
  const structured = clipStructuredAnswersForRetrieval(extras.profileAnswers)

  const bits = []
  if (structured) bits.push(`Profile facts — ${structured}`)
  const tailPieces = []
  if (p) tailPieces.push(p)
  if (bits.length) tailPieces.push(bits.join(' · '))
  const tail = tailPieces.join(' · ')
  if (!tail) return coreLine
  return `${coreLine} Traveller context: ${tail}`
}

const COASTAL_LABEL_HINTS = ['beach', 'beaches', 'seaside', 'waterfront', 'waterfronts', 'sea', 'coast', 'corniche']
// Tighter text hints for scoring — avoid boosting venues that are merely *near* the coast (hotels, malls)
// by keeping only terms that appear in actual beach/waterfront venue descriptions.
const COASTAL_TEXT_HINTS = ['beach', 'beachfront', 'sandy beach', 'swimming beach', 'seafront', 'beach resort', 'beach club', 'seaside', 'island resort', 'water sports', 'sea access', 'sunbathing']

const hasCoastalPreference = (labels) => {
  const joined = (Array.isArray(labels) ? labels : []).map((x) => String(x || '').toLowerCase()).join(' | ')
  if (!joined) return false
  return COASTAL_LABEL_HINTS.some((hint) => joined.includes(hint))
}

/**
 * Hard theme gates for place sub-labels — applied to the metadata haystack string.
 * Used in both the main plan flow (fetchPlaces) and Quick Find to ensure strict relevance.
 * Exported so quickFindFromMatches.js can import and reuse them.
 */
export const PLACE_THEME_GATES = {
  Museum: (hay) =>
    /\bmuseums?\b|\bgaller(y|ies)\b|\bexhibitions?\b|\bexhibits?\b|cultural centr|cultural cent|archaeolog|fine arts|collections?\b|\bartifacts?\b/i.test(hay),
  /**
   * Beach gate — passes any venue that is a beach, dedicated beach-access point, sea-swimming
   * spot, island resort, or water-sports venue.  Bahrain beach venues are often labelled as
   * "Resort", "Island", or "Waterfront Park" without the word "beach" in their name, so we
   * must catch those patterns too.
   */
  Beach: (hay) =>
    // Direct "beach" keyword in any metadata field — most reliable signal
    /\bbeach(es|front|side)?\b/i.test(hay) ||
    // Compound beach-specific phrases
    /public beach|swimming beach|sandy beach|beach resort|beach club|beach park|beach access|beach gate|sea front|seafront|sea-front/i.test(hay) ||
    // Sandy shore descriptors
    /\bsand(y)?\b.*\bbeach\b|\bbeach\b.*\bsand\b/i.test(hay) ||
    // Sea-swimming venues
    /\bopen sea\b.*\bswim|\bswimming\b.*\bsea\b|\bsea\b.*\bswimming\b/i.test(hay) ||
    // Island resorts (e.g. Al Dar Islands), seaside venues — common in Bahrain
    /\bseaside\b|\bisland\s*resort\b|\bresort\b.*\bisland\b/i.test(hay) ||
    // Water-sports / sea-access / sunbathing indicators
    /\bwater\s*sports?\b|\bsea\s*access\b|\bsunbathing?\b/i.test(hay),
  Park: (hay) =>
    /\bparks?\b|\bgardens?\b|\bbotan(ic|ical)|\bhiking\b|\bwalking trail(s)?\b|\bgreen\b.*\bspace|\brecreation(al)? ground|\bnational park\b/i.test(hay),
  Shopping: (hay) =>
    /\bmalls?\b|shopping centr|shopping complex|shopping district|\b(retail)\b|\bsouk\b|\bsouq\b|department store|boutique arcade|luxury plaza|city centre|citi centr/i.test(hay),
  Landmark: (hay) =>
    /\b(landmarks?|monuments?)\b|\biconic\b.*\bsight|\bhistoric\b.*\bmilestone|\boutlook tower|\bqal'?at\b|\bfort\b|tree of life|world trade centre|financial harbour/i.test(hay),
  'Family fun': (hay) =>
    /\bfamily\b|\bkids\b|\bchildren\b|play(area|ground)|trampolin|theme park|\barcade\b|\bgo-kart\b|water park|\baquarium\b|edutainment|kids zone|bounce/i.test(hay),
  Scenic: (hay) =>
    /\bscenic\b|\bviewpoint(s)?\b|\bpanorama\b|\boverlook\b|\b(observation|birds?)\s*deck\b|\bphoto(?:graphy)? spots?\b|sunset\b.*\bview/i.test(hay),
  Historical: (hay) =>
    /\bhistor(ic|ical)\b|\bheritage\b|\bdilmun\b|\bunesco\b|\bpearling\b|\barchaeolog|ancient\s+site(s)?|traditional\s+house|traditional\s+village|\bqal'?at\b|\bfort\b|\bmuseums?\b/i.test(hay),
}

/** Minimum gated place results before falling back to unfiltered ranking */
const MIN_GATED_PLACES_FLOOR = 3

/** Shared text bag for ranking + “does this venue echo today’s prefs?” checks (plans, catalog repair, quick-find gates). */
export const buildMetadataHaystackLower = (match) => {
  const meta = match?.metadata || {}
  const parts = [
    meta.place_name,
    meta.business_name,
    meta.name,
    meta.event_name,
    meta.category,
    meta.description,
    meta.area,
    meta.address,
    meta.tags,
    meta.subcategory,
    meta.location_type,
    meta.venue,
    meta.type,
    meta.cuisine,
    meta.cuisine_type,
    meta.event_type,
    meta.indoor_outdoor,
    meta.business_name_ar,
    meta.place_name_ar,
  ]
  return parts
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => String(v || '').toLowerCase())
    .join(' | ')
}

/** Numeric alignment with session preference chips (≥1 means visibly on-theme vs those labels). Exported for quick-find pin scoring. */
export const preferenceAlignmentScore = (match, preferenceLabels) => {
  const labels = (Array.isArray(preferenceLabels) ? preferenceLabels : [])
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
  if (!match || !labels.length) return 0

  const hay = buildMetadataHaystackLower(match)
  const wantsCoastal = hasCoastalPreference(labels)

  let score = 0
  for (const label of labels) {
    if (hay.includes(label)) score += 3
    if (label.length >= 6 && label.endsWith('s') && !label.endsWith('ss')) {
      const stem = label.slice(0, -1)
      if (stem.length >= 5 && hay.includes(stem)) score += 1.25
    }
    const labelParts = label.split(/[\s/&,-]+/).filter((p) => p.length >= 4)
    for (const p of labelParts) {
      if (hay.includes(p)) score += 1
      if (p.length >= 6 && p.endsWith('s') && !p.endsWith('ss')) {
        const st = p.slice(0, -1)
        if (st.length >= 5 && hay.includes(st)) score += 0.35
      }
    }
  }

  if (wantsCoastal) {
    for (const hint of COASTAL_TEXT_HINTS) {
      if (hay.includes(hint)) score += 4
    }
  }

  return score
}

const rankPlacesByPreferenceLabels = (matches, preferenceLabels) => {
  const list = Array.isArray(matches) ? matches : []
  const labels = (Array.isArray(preferenceLabels) ? preferenceLabels : [])
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
  if (!list.length || !labels.length) return list

  const scored = list.map((m, idx) => ({
    m,
    idx,
    score: preferenceAlignmentScore(m, labels),
  }))

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.idx - b.idx
  })
  return scored.map((x) => x.m)
}

const BAHRAIN_TZ = 'Asia/Bahrain'

const getTodayIsoInBahrain = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BAHRAIN_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch (_) {
    return new Date().toISOString().slice(0, 10)
  }
}

const normalizeToIsoDate = (value) => {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoPrefix) return isoPrefix[1]
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

const eventIsForTodayInBahrain = (eventMatch, todayIso = getTodayIsoInBahrain()) => {
  const meta = eventMatch?.metadata || {}
  const startDateIso = normalizeToIsoDate(meta.start_date)
  const endDateIso = normalizeToIsoDate(meta.end_date)

  if (startDateIso && endDateIso) return todayIso >= startDateIso && todayIso <= endDateIso
  if (startDateIso) return todayIso === startDateIso
  if (endDateIso) return todayIso === endDateIso

  const startTimeIso = normalizeToIsoDate(meta.start_time)
  const endTimeIso = normalizeToIsoDate(meta.end_time)
  if (startTimeIso && endTimeIso) return todayIso >= startTimeIso && todayIso <= endTimeIso
  if (startTimeIso) return todayIso === startTimeIso
  if (endTimeIso) return todayIso === endTimeIso

  return false
}

const addDaysToIsoDate = (isoDateStr, days) => {
  const raw = String(isoDateStr || '').trim()
  const parts = raw.split('-').map((x) => Number(x))
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return raw
  const [y, mo, d] = parts
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() + Number(days) || 0)
  return dt.toISOString().slice(0, 10)
}

/** True if event has any parsable schedule range overlapping [windowStartIso, windowEndIso] (inclusive by date). */
const eventOverlapsDateWindowInclusive = (eventMatch, windowStartIso, windowEndIso) => {
  const meta = eventMatch?.metadata || {}
  let start = normalizeToIsoDate(meta.start_date) || normalizeToIsoDate(meta.start_time)
  let end = normalizeToIsoDate(meta.end_date) || normalizeToIsoDate(meta.end_time) || start
  if (!start && !end) return false
  if (!start) start = end
  if (!end) end = start
  return !(end < windowStartIso || start > windowEndIso)
}

const eventHasAnyScheduleField = (eventMatch) => {
  const meta = eventMatch?.metadata || {}
  return !!(
    normalizeToIsoDate(meta.start_date) ||
    normalizeToIsoDate(meta.end_date) ||
    normalizeToIsoDate(meta.start_time) ||
    normalizeToIsoDate(meta.end_time)
  )
}

/**
 * Primary keyword hints for single-label quick find.
 * Keys match `QUICK_FIND_SUBLABELS_BY_KIND.place` in the plan screen.
 */
const QUICK_FIND_PLACE_EMBEDDING_HINTS = {
  Beach: 'public beaches sandy beach beachfront swimming beach sea swimming sandy shore beach resort beach club beach access',
  Museum: 'museums galleries exhibitions archaeology cultural heritage indoor collections',
  Park: 'parks gardens green public spaces walking trails playgrounds',
  Shopping: 'malls shopping centers retail souqs boutiques department stores',
  Landmark: 'famous landmarks iconic buildings monuments photo spots signature sights',
  'Family fun': 'family attractions kids activities playgrounds indoor play entertainment venues',
  Scenic: 'scenic views viewpoints nature photography overlooks beautiful landscapes',
  Historical: 'historical sites heritage forts UNESCO traditional architecture old Bahrain',
}

/**
 * Secondary (diversity) hints used in the second parallel Pinecone query so the merged
 * pool covers different facets of the same theme and maximises distinct venue options.
 */
const QUICK_FIND_PLACE_EMBEDDING_HINTS_ALT = {
  Beach: 'Bahrain seaside island resort sea access water sports sunbathing open sea swimming sandy seashore beach venue coastal resort sea-facing',
  Museum: 'Bahrain heritage center art gallery archaeological site cultural institution exhibit hall display',
  Park: 'Bahrain nature reserve botanical garden public park recreation area green space leisure ground',
  Shopping: 'Bahrain retail district shopping mall souq market boutique arcade shopping experience',
  Landmark: 'Bahrain iconic attraction tourist site famous building historic monument viewpoint',
  'Family fun': 'Bahrain family entertainment center kids zone amusement park children activities fun park',
  Scenic: 'Bahrain scenic overlook photography spot sunset view natural landscape panorama beautiful view',
  Historical: 'Bahrain UNESCO heritage site ancient ruins fort dilmun traditional village archaeological museum',
}
// ─── Step 1: Places (from preferences) ─────────────────────────────

export async function fetchPlaces(preferenceLabels, retrievalOptions = {}) {
  const profileNarrative =
    typeof retrievalOptions?.profileNarrative === 'string' ? retrievalOptions.profileNarrative : ''
  const retrievalExtras = {
    profileAnswers:
      retrievalOptions.profileAnswers && typeof retrievalOptions.profileAnswers === 'object'
        ? retrievalOptions.profileAnswers
        : {},
  }
  try {
    const wantsCoastal = hasCoastalPreference(preferenceLabels)
    const isQuickFindSingle =
      retrievalOptions.quickFind === true && Array.isArray(preferenceLabels) && preferenceLabels.length === 1
    const singlePlaceVibe = isQuickFindSingle ? String(preferenceLabels[0] || '').trim() : ''
    const placeHint = isQuickFindSingle ? QUICK_FIND_PLACE_EMBEDDING_HINTS[singlePlaceVibe] || '' : ''
    const placeHintAlt = isQuickFindSingle ? QUICK_FIND_PLACE_EMBEDDING_HINTS_ALT[singlePlaceVibe] || '' : ''
    const core =
      preferenceLabels.length > 0
        ? isQuickFindSingle && singlePlaceVibe
          ? `Bahrain venues and attractions that are clearly about ${singlePlaceVibe}. Prefer direct matches; avoid unrelated venue types. ${placeHint ? `Examples of fit: ${placeHint}.` : ''}`
          : `Places in Bahrain for themes: ${preferenceLabels.join(', ')} — prefer varied venue types (culture, heritage, coastline, malls, landmarks) aligned with those themes where the index supports it`
        : 'Popular places and things to do in Bahrain'

    const runDiversityPair = preferenceLabels.length === 0 && !wantsCoastal
    const qfPlaces = retrievalOptions.quickFind === true

    // For Quick Find with a specific gated label (Beach, Museum, Park…), run TWO parallel
    // Pinecone queries — primary + alternative embeddings — with a large topK, then merge
    // via RRF. This maximises the distinct venue pool so distance-based cycling works well:
    // nearest → second nearest → third nearest → … → cycle back to nearest.
    const isQuickFindGated = qfPlaces && isQuickFindSingle && !!PLACE_THEME_GATES[singlePlaceVibe]

    let places = []
    if (isQuickFindGated) {
      const coreAlt = placeHintAlt
        ? `Bahrain ${singlePlaceVibe} venues — ${placeHintAlt}`
        : core
      const [embMain, embAlt] = await Promise.all([
        getEmbedding(buildRetrievalEmbeddingText(core, profileNarrative, retrievalExtras)),
        getEmbedding(buildRetrievalEmbeddingText(coreAlt, profileNarrative, retrievalExtras)),
      ])
      const topK = RETRIEVAL_LIMITS.quickFindGatedTopK
      const [pMain, pAlt] = await Promise.all([
        queryPineconeSafe(embMain, topK, {
          record_type: { $eq: 'client' },
          client_type: { $eq: 'place' },
        }),
        queryPineconeSafe(embAlt, topK, {
          record_type: { $eq: 'client' },
          client_type: { $eq: 'place' },
        }),
      ])
      places = mergeRankedListsByRRF([pMain || [], pAlt || []], stableMatchKey, RRF_MERGE_K)
      console.log(`[fetchPlaces][quickFind][gated] "${singlePlaceVibe}" dual-query: main=${pMain?.length ?? 0} alt=${pAlt?.length ?? 0} merged=${places.length}`)
    } else if (runDiversityPair) {
      const coreAlt =
        'Heritage museums UNESCO forts art galleries traditional souqs beaches coastline scenic parks mixed Bahrain sightseeing'
      const topK = qfPlaces ? RETRIEVAL_LIMITS.quickFindPlacesTopK : RETRIEVAL_LIMITS.placesTopKCoastal
      const [embMain, embAlt] = await Promise.all([
        getEmbedding(buildRetrievalEmbeddingText(core, profileNarrative, retrievalExtras)),
        getEmbedding(buildRetrievalEmbeddingText(coreAlt, profileNarrative, retrievalExtras)),
      ])
      const [pMain, pAlt] = await Promise.all([
        queryPineconeSafe(embMain, topK, {
          record_type: { $eq: 'client' },
          client_type: { $eq: 'place' },
        }),
        queryPineconeSafe(embAlt, topK, {
          record_type: { $eq: 'client' },
          client_type: { $eq: 'place' },
        }),
      ])
      places = mergeRankedListsByRRF([pMain || [], pAlt || []], stableMatchKey, RRF_MERGE_K)
    } else {
      const text = buildRetrievalEmbeddingText(core, profileNarrative, retrievalExtras)
      const embedding = await getEmbedding(text)

      const pfTop =
        qfPlaces
          ? RETRIEVAL_LIMITS.quickFindPlacesTopK
          : wantsCoastal
            ? RETRIEVAL_LIMITS.placesTopKCoastal
            : RETRIEVAL_LIMITS.placesTopKDefault
      places = await queryPineconeSafe(
        embedding,
        pfTop,
        {
          record_type: { $eq: 'client' },
          client_type: { $eq: 'place' },
        },
      )
    }

    // For strong coastal intent in main plan flow, run a second explicit coastal retrieval.
    if (wantsCoastal && !qfPlaces) {
      const coastalEmbedding = await getEmbedding(
        buildRetrievalEmbeddingText(
          'Bahrain public beach sandy beach beachfront swimming beach beach resort beach club sea swimming shore island resort seaside sea access water sports',
          profileNarrative,
          retrievalExtras,
        ),
      )
      const coastalPlaces = await queryPineconeSafe(coastalEmbedding, RETRIEVAL_LIMITS.placesTopKCoastal, {
        record_type: { $eq: 'client' },
        client_type: { $eq: 'place' },
      })
      places = mergeRankedListsByRRF([places, coastalPlaces || []], stableMatchKey, RRF_MERGE_K)
    }

    // If no results, fallback: fetch without client_type filter (rely on embedding similarity)
    if (places.length === 0) {
      const fallbackEmbedding = await getEmbedding(
        buildRetrievalEmbeddingText(core, profileNarrative, retrievalExtras),
      )
      const all = await queryPineconeSafe(fallbackEmbedding, RETRIEVAL_LIMITS.placesTopKCoastal, {
        record_type: { $eq: 'client' },
      });
      places = all
        .filter((m) => (m.metadata?.client_type || '').toLowerCase() !== 'restaurant')
        .slice(0, qfPlaces ? RETRIEVAL_LIMITS.quickFindPlacesTopK : RETRIEVAL_LIMITS.placesTopKDefault);
    }

    // If still nothing, just get any clients from the broader pool
    if (places.length === 0) {
      const panicEmbedding = await getEmbedding(
        buildRetrievalEmbeddingText(core, profileNarrative, retrievalExtras),
      )
      const all = await queryPineconeSafe(panicEmbedding, RETRIEVAL_LIMITS.placesTopKCoastal, {
        record_type: { $eq: 'client' },
      });
      places = all.slice(0, qfPlaces ? RETRIEVAL_LIMITS.quickFindPlacesTopK : RETRIEVAL_LIMITS.placesTopKDefault);
    }

    // Use a larger cap for gated Quick Find so the pool isn't truncated before distance-sorting.
    const pfCap = isQuickFindGated
      ? RETRIEVAL_LIMITS.quickFindGatedReturnMax
      : qfPlaces
        ? RETRIEVAL_LIMITS.quickFindPlacesReturnMax
        : RETRIEVAL_LIMITS.placesReturnMax
    const ranked = rankPlacesByPreferenceLabels(places, preferenceLabels)

    // Hard gate: when specific theme labels with known gates are selected, only keep
    // places whose metadata actually matches that theme.
    const gatedLabels = preferenceLabels.filter((l) => PLACE_THEME_GATES[l])
    if (gatedLabels.length > 0) {
      const gated = ranked.filter((m) => {
        const hay = buildMetadataHaystackLower(m)
        return gatedLabels.some((label) => PLACE_THEME_GATES[label](hay))
      })
      // Quick Find: always return gated-only, never mix in unrelated venues.
      if (qfPlaces) {
        console.log(`[fetchPlaces][quickFind] theme gate "${gatedLabels.join(',')}" — kept ${gated.length}/${ranked.length} places`)
        return gated.slice(0, pfCap)
      }
      // Main plan flow: return gated if there are enough, otherwise fall back.
      if (gated.length >= MIN_GATED_PLACES_FLOOR) {
        console.log(`[fetchPlaces] theme gate "${gatedLabels.join(',')}" — kept ${gated.length}/${ranked.length} places`)
        return gated.slice(0, pfCap)
      }
      console.log(`[fetchPlaces] theme gate "${gatedLabels.join(',')}" too strict (${gated.length}/${ranked.length}), using full ranked list`)
    }
    return ranked.slice(0, pfCap)
  } catch (e) {
    console.warn('[fetchPlaces] failed:', e?.message);
    return [];
  }
}

// ─── Step 2: Restaurants (from food preferences) ────────────────────

/** Map onboarding / picker labels → Pinecone `cuisine` / `cuisine_type` enum values */
const RESTAURANT_UI_TO_PINECONE_CUISINE = {
  Cuisine: 'Cuisine',
  Local: 'Cuisine',
  'Local & Arabic': 'Cuisine',
  'Arabic/middle eastern': 'Cuisine',
  'Arabic/Middle Eastern': 'Cuisine',
  'middle eastern': 'Cuisine',
  'Middle Eastern': 'Cuisine',
  arabic: 'Cuisine',
  Arabic: 'Cuisine',
  Seafood: 'Seafood',
  American: 'American',
  american: 'American',
  International: 'International',
  international: 'International',
  Global: 'International',
  Cafe: 'Cafe',
  Café: 'Cafe',
  cafe: 'Cafe',
  'Cafe & Desserts': 'Cafe',
  Asian: 'Asian',
  asian: 'Asian',
  Italian: 'Italian',
  italian: 'Italian',
  Japanese: 'Japanese',
  japanese: 'Japanese',
  Chinese: 'Chinese',
  chinese: 'Chinese',
  Chinenese: 'Chinese',
  chinenese: 'Chinese',
  Thai: 'Thai',
  thai: 'Thai',
  'Japanese/Korean': 'Japanese',
  Korean: 'Japanese',
  korean: 'Japanese',
  Turkish: 'Turkish',
  turkish: 'Turkish',
  Lebanese: 'Lebanese',
  lebanese: 'Lebanese',
  Indian: 'SouthAsian',
  indian: 'SouthAsian',
  Pakistani: 'SouthAsian',
  pakistani: 'SouthAsian',
  'Indian/Pakistani': 'SouthAsian',
  'South Asian': 'SouthAsian',
  Subcontinent: 'SouthAsian',
  'Turkish/Lebanese': 'Turkish',
  'Fast Food': 'Fastfood',
  'fast food': 'Fastfood',
  Quick: 'Fastfood',
  'Street food': 'Fastfood',
  'street food': 'Fastfood',
}

export const mapUiFoodLabelToPineconeCuisine = (label) => {
  const raw = String(label ?? '').trim()
  if (!raw) return ''
  const direct = RESTAURANT_UI_TO_PINECONE_CUISINE[raw]
  if (direct != null) return direct
  const low = raw.toLowerCase()
  for (const [k, v] of Object.entries(RESTAURANT_UI_TO_PINECONE_CUISINE)) {
    if (String(k).toLowerCase() === low) return v
  }
  return raw
}

/** Coffee/bakery-style rows often omit `cafe` enum — widen only when Café is selected */
const expandAllowedRestaurantCuisineSet = (base) => {
  const o = new Set(base)
  if (o.has('cafe')) {
    ['coffee', 'bakery', 'patisserie', 'desserts', 'brunch', 'tea'].forEach((x) => o.add(x))
  }
  if (o.has('japanese')) {
    o.add('korean')
  }
  return o
}

const restaurantMetadataCuisineLower = (match) =>
  String(match?.metadata?.cuisine_type || match?.metadata?.cuisine || '')
    .trim()
    .toLowerCase()

const buildAllowedRestaurantCuisineSetFromFoodLabels = (foodLabels) =>
  expandAllowedRestaurantCuisineSet(
    new Set(
      (Array.isArray(foodLabels) ? foodLabels : [])
        .map((l) => mapUiFoodLabelToPineconeCuisine(l).toLowerCase())
        .filter(Boolean),
    ),
  )

const restaurantTailMatchesChosenCuisines = (match, allowedSet) => {
  const c = restaurantMetadataCuisineLower(match)
  if (!allowedSet?.size || !c) return false
  return allowedSet.has(c)
}

const matchMetadataIsFoodTruck = (m) => {
  const v =
    m?.metadata?.isfoodtruck ?? m?.metadata?.is_food_truck ?? m?.metadata?.isFoodTruck
  return v === true || v === 'true' || v === 1
}

export async function fetchRestaurants(foodLabels, retrievalOptions = {}) {
  const profileNarrative =
    typeof retrievalOptions?.profileNarrative === 'string' ? retrievalOptions.profileNarrative : ''
  const retrievalExtras = {
    profileAnswers:
      retrievalOptions.profileAnswers && typeof retrievalOptions.profileAnswers === 'object'
        ? retrievalOptions.profileAnswers
        : {},
  }
  try {
    const singleFood =
      retrievalOptions.quickFind === true && Array.isArray(foodLabels) && foodLabels.length === 1
        ? String(foodLabels[0] || '').trim()
        : ''
    const core =
      foodLabels.length > 0
        ? singleFood
          ? `Bahrain restaurants that clearly fit “${singleFood}”. Strongly prefer exact cuisine and concept matches; avoid unrelated venues.`
          : `Restaurants in Bahrain serving ${foodLabels.join(', ')}`
        : 'Best restaurants and food spots in Bahrain'

    const text = buildRetrievalEmbeddingText(core, profileNarrative, retrievalExtras)

    const embedding = await getEmbedding(text);
    const rTop = retrievalOptions.quickFind ? RETRIEVAL_LIMITS.quickFindRestaurantsTopK : RETRIEVAL_LIMITS.restaurantsTopK

    const fetchByCuisineField = async (pineconeValue) => {
      let filtered = await queryPineconeSafe(embedding, rTop, {
        client_type: { $eq: 'restaurant' },
        cuisine: { $eq: pineconeValue },
      });
      if (filtered.length === 0) {
        filtered = await queryPineconeSafe(embedding, rTop, {
          client_type: { $eq: 'restaurant' },
          cuisine_type: { $eq: pineconeValue },
        });
      }
      return filtered;
    };

    if (foodLabels.length > 0) {
      const foodTruckOnly =
        foodLabels.length === 1 &&
        String(foodLabels[0] ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ') === 'food truck'

      if (foodTruckOnly) {
        const truckCore =
          'Food trucks, mobile kitchens, street food vans, and outdoor casual food trucks in Bahrain'
        const truckText = buildRetrievalEmbeddingText(truckCore, profileNarrative, retrievalExtras)
        const truckEmbedding = await getEmbedding(truckText)
        const pool =
          (await queryPineconeSafe(truckEmbedding, rTop, {
            client_type: { $eq: 'restaurant' },
          })) || []
        let trucks = pool.filter(matchMetadataIsFoodTruck)
        if (!trucks.length) {
          try {
            const byFlag =
              (await queryPineconeSafe(truckEmbedding, rTop, {
                client_type: { $eq: 'restaurant' },
                isfoodtruck: { $eq: true },
              })) || []
            trucks = byFlag.filter(matchMetadataIsFoodTruck)
            if (!trucks.length && byFlag.length) trucks = byFlag
          } catch {
            /* index may not support isfoodtruck metadata filter */
          }
        }
        if (trucks.length) return trucks
        return pool.length ? pool : []
      }

      const cuisineQueries = foodLabels.map((label) =>
        fetchByCuisineField(mapUiFoodLabelToPineconeCuisine(label) || label),
      )
      const nearestQuery = queryPineconeSafe(embedding, rTop, {
        client_type: { $eq: 'restaurant' },
      });
      const [cuisineResults, nearest] = await Promise.all([
        Promise.all(cuisineQueries),
        nearestQuery,
      ]);

      const seen = new Set();
      const exactMatches = [];
      for (const list of cuisineResults) {
        for (const m of list || []) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            exactMatches.push(m);
          }
        }
      }

      const allowedTailCuisines = buildAllowedRestaurantCuisineSetFromFoodLabels(foodLabels)

      const similarMatches = [];
      for (const m of nearest || []) {
        if (seen.has(m.id)) continue
        // Nearest neighbours are unconstrained cuisine — exclude Japanese/Thai/etc.
        // when chips only allow e.g. international + cafe (embedding similarity leaks easily).
        if (!restaurantTailMatchesChosenCuisines(m, allowedTailCuisines)) continue
        seen.add(m.id)
        similarMatches.push(m)
      }

      const combined = [...exactMatches, ...similarMatches]

      if (combined.length === 0 && nearest?.length) {
        const seen2 = new Set()
        const panic = []
        for (const m of nearest) {
          if (!m?.id || seen2.has(m.id)) continue
          seen2.add(m.id)
          panic.push(m)
          if (panic.length >= 12) break
        }
        if (panic.length) {
          /** Quick-find uses one chip labels; facet cuisine often mismatches embeddings — fallback is intentional, not actionable in-app. */
          if (!retrievalOptions.quickFind) {
            console.warn(
              '[fetchRestaurants] cuisine whitelist produced 0 hits; relaxing tail (fix venue cuisine metadata)',
            )
          }
          return panic
        }
      }

      return combined
    }

    return queryPineconeSafe(embedding, rTop, {
      client_type: { $eq: 'restaurant' },
    });
  } catch (e) {
    console.warn('[fetchRestaurants] failed:', e?.message);
    return [];
  }
}

// ─── Step 3: Breakfast spots ────────────────────────────────────────

export async function fetchBreakfastSpots(retrievalOptions = {}) {
  const profileNarrative =
    typeof retrievalOptions?.profileNarrative === 'string' ? retrievalOptions.profileNarrative : ''
  const retrievalExtras = {
    profileAnswers:
      retrievalOptions.profileAnswers && typeof retrievalOptions.profileAnswers === 'object'
        ? retrievalOptions.profileAnswers
        : {},
  }
  try {
    const text = buildRetrievalEmbeddingText(
      'Breakfast cafes and bakeries in Bahrain',
      profileNarrative,
      retrievalExtras,
    )
    const embedding = await getEmbedding(text);

    const spots = await queryPineconeSafe(embedding, RETRIEVAL_LIMITS.breakfastTopK, {
      client_type: { $eq: 'restaurant' },
      meal_type: { $eq: 'Breakfast' },
    });

    if (spots.length === 0) {
      return queryPineconeSafe(embedding, RETRIEVAL_LIMITS.breakfastTopK, {
        client_type: { $eq: 'restaurant' },
      });
    }

    return spots;
  } catch (e) {
    console.warn('[fetchBreakfastSpots] failed:', e?.message);
    return [];
  }
}

// ─── Step 4: Events ─────────────────────────────────────────────────

/** Candidate keys to join Pinecone vectors to `public.events` (PK: `event_uuid`). */
const eventIdentifiersFromMatch = (match) => {
  const meta = match?.metadata || {};
  const out = [];
  const push = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s) out.push(s);
  };
  push(meta.event_uuid);
  push(match?.id);
  push(meta.uuid);
  push(meta.event_id);
  push(meta.id);
  return [...new Set(out)];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Load `image` from `public.events` by `event_uuid`. */
const fetchEventsImageLookup = async (identifiers) => {
  const ids = [...new Set((identifiers || []).filter(Boolean).map((x) => String(x).trim()))].filter(Boolean);
  const eventUuids = ids.filter((id) => UUID_RE.test(id));
  if (eventUuids.length === 0) return {};

  const { data, error } = await supabase.from('events').select('event_uuid, image').in('event_uuid', eventUuids);

  if (error) {
    console.warn('[Events] image lookup (events.event_uuid):', error.message);
    return {};
  }

  const map = {};
  for (const row of data || []) {
    const key = row.event_uuid;
    const raw = row.image;
    if (key == null || raw == null) continue;
    const url = resolvePublicImageUrl(String(raw).trim()) || String(raw).trim();
    map[String(key)] = url;
  }
  return map;
};

const enrichEventMatchesWithEventsTableImages = async (events) => {
  const list = events || [];
  if (list.length === 0) return list;

  const idList = [];
  for (const m of list) idList.push(...eventIdentifiersFromMatch(m));
  const imageMap = await fetchEventsImageLookup(idList);

  return list.map((m) => {
    const candidates = eventIdentifiersFromMatch(m);
    let img = null;
    for (const c of candidates) {
      if (imageMap[c]) {
        img = imageMap[c];
        break;
      }
    }
    if (!img) return m;
    return {
      ...m,
      metadata: {
        ...(m.metadata || {}),
        image: img,
      },
    };
  });
};

export async function fetchEvents(preferenceLabels, retrievalOptions = {}) {
  const profileNarrative =
    typeof retrievalOptions?.profileNarrative === 'string' ? retrievalOptions.profileNarrative : ''
  const retrievalExtras = {
    profileAnswers:
      retrievalOptions.profileAnswers && typeof retrievalOptions.profileAnswers === 'object'
        ? retrievalOptions.profileAnswers
        : {},
  }
  try {
    const singleEvt =
      retrievalOptions.quickFindEvents === true && Array.isArray(preferenceLabels) && preferenceLabels.length === 1
        ? String(preferenceLabels[0] || '').trim()
        : ''
    const core =
      preferenceLabels.length > 0
        ? singleEvt
          ? `Bahrain events that clearly match “${singleEvt}” (genre, venue type, indoor/outdoor). Prefer strong topical fit.`
          : `Events in Bahrain related to ${preferenceLabels.join(', ')}`
        : 'Popular events and activities happening in Bahrain'

    const text = buildRetrievalEmbeddingText(core, profileNarrative, retrievalExtras)

    const embedding = await getEmbedding(text);

    const eventsTop = retrievalOptions.quickFindEvents ? RETRIEVAL_LIMITS.quickFindEventsTopK : RETRIEVAL_LIMITS.eventsTopK
    const events = await queryPineconeSafe(embedding, eventsTop, {
      record_type: { $eq: 'event' },
    });

    const withImages = await enrichEventMatchesWithEventsTableImages(events)
    const todayIso = getTodayIsoInBahrain()
    const todaysEvents = withImages.filter((m) => eventIsForTodayInBahrain(m, todayIso))

    console.log(`[Events] Found ${withImages.length} events, ${todaysEvents.length} match Bahrain date ${todayIso}`)
    todaysEvents.forEach((m) =>
      console.log(`  → ${m.metadata?.event_name || m.metadata?.business_name} (${m.metadata?.start_time} - ${m.metadata?.end_time})`),
    )

    if (!retrievalOptions.quickFindEvents) {
      return todaysEvents
    }

    /** Quick find: today-first, then upcoming ~3 weeks (vector order preserved), then undated metadata. */
    const horizonIso = addDaysToIsoDate(todayIso, 21)
    const tierToday = []
    const tierSoon = []
    const tierUndated = []
    const tierOther = []
    for (const m of withImages) {
      if (eventIsForTodayInBahrain(m, todayIso)) {
        tierToday.push(m)
        continue
      }
      if (!eventHasAnyScheduleField(m)) {
        tierUndated.push(m)
        continue
      }
      if (eventOverlapsDateWindowInclusive(m, todayIso, horizonIso)) {
        tierSoon.push(m)
        continue
      }
      tierOther.push(m)
    }
    const rankTier = (arr) =>
      preferenceLabels?.length ? rankPlacesByPreferenceLabels(arr, preferenceLabels) : arr
    return [
      ...rankTier(tierToday),
      ...rankTier(tierSoon),
      ...rankTier(tierUndated),
      ...rankTier(tierOther),
    ].slice(0, RETRIEVAL_LIMITS.quickFindEventsTopK)
  } catch (e) {
    console.warn('[Events] fetchEvents failed:', e?.message);
    return [];
  }
}

/** Base URL for GoBahrain AI backend (Pinecone + Supabase hydrate). No trailing slash. */
const getAiBackendBase = () =>
  typeof process !== 'undefined' &&
  process.env?.EXPO_PUBLIC_AI_BACKEND_URL != null &&
  String(process.env.EXPO_PUBLIC_AI_BACKEND_URL).trim() !== ''
    ? String(process.env.EXPO_PUBLIC_AI_BACKEND_URL).trim().replace(/\/$/, '')
    : ''

/** POST hydrated plan catalog — same buckets as device-side Pinecone fetches but merged via service role on server */
export async function fetchHydratedPlanCatalogFromBackend({
  preferenceLabels,
  foodLabels,
  profileNarrative,
  profileActivity,
  profileAnswers,
}) {
  const base = getAiBackendBase()
  if (!base) return null
  const url = `${base}/api/ai-plan/hydrated-catalog`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        preferenceLabels: Array.isArray(preferenceLabels) ? preferenceLabels : [],
        foodLabels: Array.isArray(foodLabels) ? foodLabels : [],
        profileNarrative: typeof profileNarrative === 'string' ? profileNarrative : '',
        profileActivity: Array.isArray(profileActivity) ? profileActivity : [],
        profileAnswers: profileAnswers && typeof profileAnswers === 'object' ? profileAnswers : {},
      }),
    })
    if (!res.ok) {
      console.warn('[HydratedCatalog] backend HTTP', res.status)
      return null
    }
    const j = await res.json()
    if (!j || typeof j !== 'object') return null
    if (
      !Array.isArray(j.places) ||
      !Array.isArray(j.restaurants) ||
      !Array.isArray(j.breakfastSpots) ||
      !Array.isArray(j.events)
    ) {
      return null
    }
    return j
  } catch (e) {
    console.warn('[HydratedCatalog]', e?.message)
    return null
  }
}

/**
 * Prefer server-hydrated catalog when EXPO_PUBLIC_AI_BACKEND_URL is set; otherwise Pinecone-on-device buckets.
 * @returns {Promise<[places, restaurants, breakfastSpots, events]>}
 */
export async function resolvePlanRetrievalBuckets(preferenceLabels, foodLabels, retrievalOptions = {}) {
  const profileNarrative =
    typeof retrievalOptions?.profileNarrative === 'string' ? retrievalOptions.profileNarrative : ''
  const profileActivity = Array.isArray(retrievalOptions?.profileActivity)
    ? retrievalOptions.profileActivity
    : []
  const profileAnswers =
    retrievalOptions.profileAnswers && typeof retrievalOptions.profileAnswers === 'object'
      ? retrievalOptions.profileAnswers
      : {}
  const prefs = Array.isArray(preferenceLabels) ? preferenceLabels : []
  const foods = Array.isArray(foodLabels) ? foodLabels : []
  const rag = await fetchHydratedPlanCatalogFromBackend({
    preferenceLabels: prefs,
    foodLabels: foods,
    profileNarrative,
    profileActivity,
    profileAnswers,
  })
  const hasAny =
    rag &&
    (rag.places.length > 0 ||
      rag.restaurants.length > 0 ||
      rag.breakfastSpots.length > 0 ||
      rag.events.length > 0)
  if (hasAny) {
    return [rag.places, rag.restaurants, rag.breakfastSpots, rag.events]
  }
  return Promise.all([
    fetchPlaces(prefs, retrievalOptions),
    fetchRestaurants(foods, retrievalOptions),
    fetchBreakfastSpots(retrievalOptions),
    fetchEvents(prefs, retrievalOptions),
  ])
}

/**
 * Explore: `public.events` only (Supabase schema).
 * Returns `{ events, error }` so the UI can distinguish query failures from an empty table.
 */
export async function fetchExploreEventsFromSupabase() {
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim?.() ?? '';
    const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim?.() ?? '';
    if (!url || !anon) {
      const msg = !url ? 'Missing EXPO_PUBLIC_SUPABASE_URL' : 'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY';
      console.warn('[Explore]', msg);
      return { events: [], error: msg };
    }

    const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(48);

    if (error) {
      console.warn('[Explore] events query:', error.message, error.code, error.details, error.hint);
      return { events: [], error: error.message || 'Could not load events' };
    }

    const out = [];
    for (let idx = 0; idx < (data || []).length; idx++) {
      const row = data[idx];
      if (row?.event_uuid == null) continue;

      let resolved = null;
      if (row.image != null && String(row.image).trim() !== '') {
        resolved = resolvePublicImageUrl(row.image);
        if (!resolved) {
          const s = coerceImageValueToString(row.image);
          if (s && (s.startsWith('http://') || s.startsWith('https://'))) resolved = s;
        }
      }

      out.push({
        id: String(row.event_uuid),
        metadata: {
          event_uuid: row.event_uuid,
          event_name: (row.event_name && String(row.event_name).trim()) || 'Event',
          venue: row.venue,
          lat: row.lat,
          long: row.long,
          start_time: row.start_time,
          end_time: row.end_time,
          start_date: row.start_date,
          end_date: row.end_date,
          event_type: row.event_type,
          status: row.status,
          indoor_outdoor: row.indoor_outdoor,
          client_a_uuid: row.client_a_uuid,
          created_at: row.created_at,
          image: resolved,
        },
      });
    }

    if (out.length === 0 && (data || []).length === 0) {
      console.warn(
        '[Explore] events returned 0 rows. If your table has data, enable RLS SELECT for anon — run database/migrations/004_events_public_read.sql in Supabase SQL editor.',
      );
    }

    return { events: out, error: null };
  } catch (e) {
    console.warn('[Explore] fetchExploreEventsFromSupabase:', e?.message);
    return { events: [], error: e?.message || 'Could not load events' };
  }
}

/**
 * Explore + Plan search: all rows from `client`, grouped by `client_type`
 * (restaurant → restaurants, event → events, else → places).
 */
export async function fetchBrowseClientsGrouped() {
  try {
    const { data: rows, error } = await supabase.from('client').select('*');
    if (error) {
      console.warn('[Explore] client query:', error.message);
      return { restaurants: [], places: [], events: [], error: error.message };
    }
    const restaurants = [];
    const places = [];
    const events = [];
    (rows || []).forEach((c) => {
      const ct = String(c.client_type || '').toLowerCase();
      const item = {
        ...c,
        clientId: c.client_a_uuid,
        name: (c.business_name || c.name || c.business_name_ar || 'Spot').trim(),
      };
      if (ct === 'restaurant') restaurants.push(item);
      else if (ct === 'event') events.push(item);
      else places.push(item);
    });
    return { restaurants, places, events, error: null };
  } catch (e) {
    console.warn('[Explore] fetchBrowseClientsGrouped:', e?.message);
    return { restaurants: [], places: [], events: [], error: e?.message || null };
  }
}

// ─── Pinecone places for Khalid chat (only recommend these) ─────

const KHALID_VAGUE_FOLLOW_UP_MAX_LEN = 96

/**
 * True when the latest line is probably a continuation (pics/it/that place) vs a fresh topic query.
 */
const isKhalidVagueConversationFollowUp = (latestTrimmed, priorTurnCount) => {
  if (priorTurnCount < 2) return false
  const t = String(latestTrimmed || '').trim()
  if (!t || t.length > KHALID_VAGUE_FOLLOW_UP_MAX_LEN) return false
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|bye)\b/i.test(t)) return false
  const continuationCue =
    /\b(that|those|same\s+(one|place|spot)|there|them|these|it|pics?|photographs?|photos?|images?|pictures?|gallery|looks?\s+nice)\b/i.test(t) ||
    /^(show\s*(me\s*)?(some\s*)?(pics?|photos?|images?|pictures?)|pics?\b|photos?\b)/i.test(t) ||
    /^tell\s+me\s+more\b/i.test(t) ||
    /^\s*(yes|yeah|sure|pls|please|cool|nice)([\s!?\.]*)$/i.test(t) ||
    /^(what|how)\s+about\s+(those|them|photos|pics)|^more\b/i.test(t)
  return continuationCue
}

/**
 * Builds the text fed to the embedding API for Pinecone when the user's last message
 * is a short continuation — combines recent user lines + last assistant snippet so retrieval
 * still matches the prior venue/thread.
 *
 * @param {string} latestUserText — current user message (trimmed externally ok)
 * @param {Array<{ role: string, content: string }>} apiHistoryIncludingLatest — GPT-shaped history ending with current user turn
 */
export function buildKhalidPineconeQueryText(latestUserText, apiHistoryIncludingLatest) {
  const latest = String(latestUserText || '').trim()
  if (!latest) return ''
  const hist = Array.isArray(apiHistoryIncludingLatest) ? apiHistoryIncludingLatest : []
  const prior = hist.length > 0 && hist[hist.length - 1]?.role === 'user' ? hist.slice(0, -1) : hist
  if (!isKhalidVagueConversationFollowUp(latest, hist.length)) {
    return latest
  }
  const userTurnsBeforeLatest = prior.filter((m) => m.role === 'user').length
  if (userTurnsBeforeLatest < 1) {
    return latest
  }
  const recentUsers = prior.filter((m) => m.role === 'user').slice(-3).map((m) => String(m.content || '').trim()).filter(Boolean)
  const lastAssist = [...prior].reverse().find((m) => m.role === 'assistant')
  const assistSnip = lastAssist ? String(lastAssist.content || '').replace(/\s+/g, ' ').trim().slice(0, 420) : ''
  const ctxParts = [...recentUsers, assistSnip].filter(Boolean)
  if (ctxParts.length === 0) return latest
  const merged = `${ctxParts.join(' \n ')} \n ${latest}`
  return merged.slice(0, 950)
}

/**
 * Best-effort topic string from prior turns (for browse actions when the user only says "pics").
 */
export function extractKhalidTopicHintFromPriorTurns(apiHistoryIncludingLatest) {
  const hist = Array.isArray(apiHistoryIncludingLatest) ? apiHistoryIncludingLatest : []
  if (hist.length < 2) return ''
  const prior = hist[hist.length - 1]?.role === 'user' ? hist.slice(0, -1) : hist
  for (let i = prior.length - 1; i >= 0; i--) {
    const row = prior[i]
    if (row.role === 'user' && row.content) {
      const u = String(row.content).trim()
      const patterns = [
        /tell\s+me\s+more\s+about\s+(.+)/i,
        /tell\s+me\s+about\s+(.+)/i,
        /what\s+(?:do\s+you\s+know|can\s+you\s+tell\s+me)\s+about\s+(.+)/i,
        /(?:info(?:rmation)?|details?)\s+about\s+(.+)/i,
        /show\s+me\s+(?:photos?|pics?)\s+(?:of|for)\s+(.+)/i,
      ]
      for (const pat of patterns) {
        const m = u.match(pat)
        if (m && m[1]) return m[1].replace(/[.?!]+$/, '').trim().slice(0, 140)
      }
    }
    if (row.role === 'assistant' && row.content) {
      const bold = String(row.content).match(/\*\*([^*]{2,140})\*\*/)
      if (bold) return bold[1].trim()
    }
  }
  return ''
}

/**
 * Bahrain-specific geo hint normalizer.
 * Expands governorate / area names into nearby districts so Pinecone retrieval
 * is more aware of how locals actually refer to places.
 */
function expandBahrainGeoHints(text) {
  const raw = String(text || '').trim()
  if (!raw) return raw
  const lower = raw.toLowerCase()
  const extras = []

  // Muharraq governorate + nearby islands
  if (/\bmuharraq\b/.test(lower)) {
    extras.push('Amwaj Islands', 'Amwaj', 'Diyar Al Muharraq', 'Diyar', 'Hidd', 'Busaiteen')
  }

  // Capital / Manama core
  if (/\bmanama\b/.test(lower) || /\bcapital\b/.test(lower)) {
    extras.push('Seef', 'Bab Al Bahrain', 'Souq Bab Al Bahrain', 'Diplomatic Area', 'Hoora', 'Gudaibiya')
  }

  // Adliya food / nightlife cluster
  if (/\badliya\b/.test(lower)) {
    extras.push('Block 338', 'Block 338 restaurants')
  }

  // Seef / west Manama malls
  if (/\bseef\b/.test(lower)) {
    extras.push('City Centre Bahrain', 'Seef Mall', 'The Avenues Bahrain')
  }

  // Northern governorate suburbs
  if (/\bsaar\b/.test(lower) || /\bjanabiyah\b/.test(lower) || /\bjanabiya\b/.test(lower)) {
    extras.push('Saar', 'Janabiyah', 'Budaiya')
  }

  // Riffa split (West / East)
  if (/\briffa\b/.test(lower)) {
    extras.push('East Riffa', 'West Riffa')
  }

  // Coastal leisure strip in the south-west
  if (/\bzallaq\b/.test(lower) || /\bal areen\b/.test(lower)) {
    extras.push('Al Areen', 'Bahrain International Circuit', 'Zallaq')
  }

  if (!extras.length) return raw
  const tail = Array.from(new Set(extras)).join(', ')
  return `${raw}. Nearby Bahrain areas: ${tail}.`
}

/**
 * Fetches places, restaurants, and events from Pinecone relevant to the user message.
 * Optional user preferences bias the query (prioritize) but do not filter — we still return a mix.
 * Optional `options.retrievalQueryText` overrides the embedding text (e.g. history-augmented) while leaving `userMessage` for display/logs.
 * Returns a string to inject into the chatbot system prompt so Khalid only talks about these.
 */
export async function fetchPineconePlacesForChat(userMessage, options = {}) {
  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
    return '';
  }
  const text = userMessage.trim();
  const retrievalOverrideRaw = options.retrievalQueryText
  const textForEmbed =
    typeof retrievalOverrideRaw === 'string' && retrievalOverrideRaw.trim()
      ? String(retrievalOverrideRaw).trim()
      : text;
  const generalLabels = options.generalLabels || [];
  const activityLabels = options.activityLabels || [];
  const foodLabels = options.foodLabels || [];
  const personaSummary = typeof options.personaSummary === 'string' ? options.personaSummary.trim() : '';
  const preferenceParts = [];
  if (personaSummary) preferenceParts.push(`Persona: ${personaSummary.slice(0, 400)}`);
  if (generalLabels.length) preferenceParts.push(`About them: ${generalLabels.join(', ')}`);
  if (activityLabels.length) preferenceParts.push(`Activities they like: ${activityLabels.join(', ')}`);
  if (foodLabels.length) preferenceParts.push(`Food they like: ${foodLabels.join(', ')}`);
  const geoAwareText = expandBahrainGeoHints(textForEmbed);
  const queryText = preferenceParts.length
    ? `${geoAwareText}. ${preferenceParts.join('. ')}`
    : geoAwareText;
  let embedding;
  try {
    embedding = await getEmbedding(queryText);
  } catch (e) {
    console.warn('[Khalid] Embedding failed:', e?.message);
    return '';
  }
  let places = [];
  let restaurants = [];
  let events = [];
  try {
    [places, restaurants, events] = await Promise.all([
      queryPineconeSafe(embedding, 16, { record_type: { $eq: 'client' }, client_type: { $eq: 'place' } }),
      queryPineconeSafe(embedding, 16, { record_type: { $eq: 'client' }, client_type: { $eq: 'restaurant' } }),
      queryPineconeSafe(embedding, 10, { record_type: { $eq: 'event' } }),
    ]);
  } catch (e) {
    console.warn('[Khalid] Pinecone query failed:', e?.message);
    return '';
  }
  const seen = new Set();
  const lines = [];
  const add = (match, typeLabel) => {
    const m = match.metadata || {};
    const name = m.place_name || m.business_name || m.event_name || m.name || '';
    if (!name || seen.has(name)) return;
    seen.add(name);
    const descSource = m.description || m.ai_summary || m.short_description || '';
    const desc = descSource ? ` — ${String(descSource).replace(/\s+/g, ' ').trim().slice(0, 220)}` : '';
    const extra = m.cuisine || m.cuisine_type ? ` (${m.cuisine || m.cuisine_type})` : m.venue ? ` at ${m.venue}` : '';
    const bits = [];
    if (m.rating != null && String(m.rating).trim() !== '') bits.push(`rating ${m.rating}`);
    if (m.price_range != null && String(m.price_range).trim() !== '') bits.push(`price ${String(m.price_range).trim().slice(0, 32)}`);
    if (m.category != null && String(m.category).trim() !== '') bits.push(`category ${String(m.category).trim().slice(0, 40)}`);
    if (m.vibe != null && String(m.vibe).trim() !== '') bits.push(`vibe ${String(m.vibe).trim().slice(0, 40)}`);
    const meta = bits.length ? ` · ${bits.join(' · ')}` : '';
    lines.push(`- [${typeLabel}] ${name}${extra}${meta}${desc}`);
  };
  places.forEach((m) => add(m, 'place'));
  restaurants.forEach((m) => add(m, 'restaurant'));
  events.forEach((m) => add(m, 'event'));
  if (lines.length === 0) return '';
  return `ALLOWED PLACES (authoritative ground truth for this turn — you may ONLY recommend, name, or describe these venues; do not mention any other business or event by name):\n${lines.join('\n')}\n\nGROUNDING RULES:\n- When describing a venue, use ONLY information implied by its line above (name, type tag, cuisine/venue, rating/price if present, description snippet). Do not invent hours, phone numbers, awards, UNESCO claims, menu items, or prices not shown.\n- If the user names a place that does not match any line above (fuzzy match ok), say it is not in your current app results and offer to show similar listings with go_show_clients (use a sensible query + client_type).\n- If the snippet is thin, say the app has only a short blurb and they should open the venue card for full details—do not fill gaps with guesses.`;
}

const PLAN_SEARCH_PINECONE_TOP_K = 36

/**
 * Vector search across plan catalog buckets (clients + events index).
 * Callers hydrate matches against Supabase `client` rows loaded in the modal.
 */
export async function fetchPlanSearchPineconeBuckets(queryText, options = {}) {
  const text = typeof queryText === 'string' ? queryText.trim() : ''
  if (text.length < 2) {
    return { places: [], restaurants: [], events: [], ok: true }
  }
  const topK = typeof options.topK === 'number' ? Math.min(Math.max(options.topK, 4), 64) : PLAN_SEARCH_PINECONE_TOP_K
  let embedding
  try {
    embedding = await getEmbedding(text)
  } catch (e) {
    console.warn('[fetchPlanSearchPineconeBuckets] Embedding failed:', e?.message)
    return { places: [], restaurants: [], events: [], ok: false }
  }
  try {
    const evK = Math.min(topK, 32)
    const [places, restaurants, events] = await Promise.all([
      queryPineconeSafe(embedding, topK, { record_type: { $eq: 'client' }, client_type: { $eq: 'place' } }),
      queryPineconeSafe(embedding, topK, { record_type: { $eq: 'client' }, client_type: { $eq: 'restaurant' } }),
      queryPineconeSafe(embedding, evK, { record_type: { $eq: 'event' } }),
    ])
    return { places, restaurants, events, ok: true }
  } catch (e) {
    console.warn('[fetchPlanSearchPineconeBuckets] Pinecone failed:', e?.message)
    return { places: [], restaurants: [], events: [], ok: false }
  }
}

// ─── Landmarks & famous buildings for AR exploration ────────────

const BAHRAIN_LANDMARKS = [
  { name: 'Bahrain Fort (Qal\'at al-Bahrain)', lat: 26.2333, lng: 50.5206, category: 'UNESCO Heritage', description: 'Ancient Dilmun capital and UNESCO World Heritage Site. Explore 4,000 years of history.' },
  { name: 'Bahrain National Museum', lat: 26.2286, lng: 50.5865, category: 'Museum', description: 'The country\'s most popular attraction. 6,000 years of Bahrain history with bilingual exhibits.' },
  { name: 'Al Fateh Grand Mosque', lat: 26.2186, lng: 50.5865, category: 'Landmark', description: 'Bahrain\'s largest mosque. The dome is one of the world\'s largest fibreglass domes.' },
  { name: 'Bahrain World Trade Center', lat: 26.2394, lng: 50.5778, category: 'Landmark', description: 'Iconic twin towers with integrated wind turbines. First skyscraper to harness wind power.' },
  { name: 'Tree of Life', lat: 26.0444, lng: 50.5598, category: 'Natural Wonder', description: '400-year-old tree standing alone in the desert. A mysterious natural landmark.' },
  { name: 'Bab Al Bahrain', lat: 26.2333, lng: 50.5756, category: 'Heritage', description: 'Gateway to Manama Souq. Historic twin-arched entrance to the traditional marketplace.' },
  { name: 'Al Areen Wildlife Park', lat: 25.9920, lng: 50.5185, category: 'Nature', description: 'Protected reserve with Arabian wildlife and desert landscapes — a calm family-friendly escape south of Manama.' },
  { name: 'Beit Al Quran', lat: 26.2233, lng: 50.5833, category: 'Museum', description: 'Houses one of the finest collections of ancient Qurans in the region.' },
  { name: 'Manama Souq', lat: 26.2283, lng: 50.5783, category: 'Heritage', description: 'Traditional marketplace with narrow streets, local crafts, and authentic Bahraini atmosphere.' },
  { name: 'Bahrain Pearling Trail', lat: 26.2333, lng: 50.5500, category: 'UNESCO Heritage', description: 'UNESCO World Heritage Site. Historic pearling tradition of the Gulf.' },
];

export async function fetchLandmarks() {
  try {
    const text = 'Famous landmarks, heritage sites, museums, iconic buildings, and tourist attractions in Bahrain';
    const embedding = await getEmbedding(text);
    return queryPineconeSafe(embedding, 10, {
      record_type: { $eq: 'client' },
      client_type: { $eq: 'place' },
    });
  } catch (e) {
    console.warn('[fetchLandmarks] failed:', e?.message);
    return [];
  }
}

// ─── Nearby POIs for AR (from clients table) ────────────────────

const BAHRAIN_BOUNDS_PIPELINE = { minLat: 25.55, maxLat: 26.4, minLng: 50.3, maxLng: 50.95 }

const isWithinBahrainPipeline = (lat, lng) =>
  lat >= BAHRAIN_BOUNDS_PIPELINE.minLat &&
  lat <= BAHRAIN_BOUNDS_PIPELINE.maxLat &&
  lng >= BAHRAIN_BOUNDS_PIPELINE.minLng &&
  lng <= BAHRAIN_BOUNDS_PIPELINE.maxLng

/** Accept only pairs that fall inside Bahrain after optional lat/lng swap (matches AI plan screen). */
function unswapLatLngPipeline(lat, lng) {
  const la = parseFloat(lat)
  const ln = parseFloat(lng)
  if (Number.isNaN(la) || Number.isNaN(ln) || (la === 0 && ln === 0)) return null
  if (isWithinBahrainPipeline(la, ln)) return { lat: la, lng: ln }
  if (isWithinBahrainPipeline(ln, la)) return { lat: ln, lng: la }
  return null
}

function getLatLng(m) {
  if (!m || typeof m !== 'object') return null
  let lat = parseFloat(
    m.lat ?? m.latitude ?? m.Lat ?? m.google_lat ?? m.place_lat ?? m.geo_lat ?? '',
  )
  let lng = parseFloat(
    m.long ?? m.longitude ?? m.lng ?? m.Long ?? m.google_lng ?? m.place_lng ?? m.geo_lng ?? '',
  )
  if ((Number.isNaN(lat) || Number.isNaN(lng)) && m.LatLng && typeof m.LatLng === 'object') {
    lat = parseFloat(m.LatLng.lat)
    lng = parseFloat(m.LatLng.lng)
  }
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  return unswapLatLngPipeline(lat, lng)
}

/** Fetch all clients from Supabase that have valid lat/long for AR. DB columns: lat, long. */
export async function fetchClientsWithLocation() {
  const { data: rows, error } = await supabase
    .from('client')
    .select('*');
  if (error) {
    console.warn('[AR] Supabase client fetch failed:', error.message);
    return [];
  }
  if (!rows || !rows.length) return [];

  const restaurantIds = rows
    .filter((row) => String(row.client_type || row.clientType || '').toLowerCase().trim() === 'restaurant')
    .map((row) => row.client_a_uuid)
    .filter(Boolean)

  let restaurantBranchByUuid = {}
  if (restaurantIds.length > 0) {
    try {
      const { data: restRows, error: restErr } = await supabase
        .from('restaurant_client')
        .select('a_uuid, branch')
        .in('a_uuid', restaurantIds)
      if (restErr) {
        const { data: restRowsFallback, error: restErrFallback } = await supabase
          .from('restaurant_client')
          .select('*')
          .in('a_uuid', restaurantIds)
        if (!restErrFallback && Array.isArray(restRowsFallback)) {
          restaurantBranchByUuid = restRowsFallback.reduce((acc, row) => {
            const uuid = row?.a_uuid || row?.client_a_uuid || null
            if (uuid) acc[uuid] = row.branch ?? row.branches ?? null
            return acc
          }, {})
        }
      } else if (Array.isArray(restRows)) {
        restaurantBranchByUuid = restRows.reduce((acc, row) => {
          if (row?.a_uuid) acc[row.a_uuid] = row.branch ?? row.branches ?? null
          return acc
        }, {})
      }
    } catch (_) {
      restaurantBranchByUuid = {}
    }
  }

  const toCoord = (latRaw, lngRaw) => {
    const fixed = unswapLatLngPipeline(latRaw, lngRaw)
    if (!fixed) return null
    return { lat: fixed.lat, lng: fixed.lng, long: fixed.lng }
  }

  const getBranchCoords = (branches) => {
    if (!branches) return []
    let normalizedBranches = branches
    if (typeof normalizedBranches === 'string') {
      try {
        normalizedBranches = JSON.parse(normalizedBranches)
      } catch (_) {
        normalizedBranches = []
      }
    }
    const entries = Array.isArray(normalizedBranches)
      ? normalizedBranches
      : typeof normalizedBranches === 'object'
        ? Object.values(normalizedBranches)
        : []
    const out = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const fromDirect = toCoord(
        entry.lat ?? entry.latitude ?? entry.branch_lat ?? entry.geo_lat,
        entry.lng ?? entry.long ?? entry.longitude ?? entry.branch_lng ?? entry.geo_lng
      )
      if (fromDirect) {
        out.push({
          coords: fromDirect,
          label: String(entry.area_name || entry.branch_name || entry.name || entry.title || '').trim(),
        })
        continue
      }
      const fromNested = entry.LatLng && typeof entry.LatLng === 'object'
        ? toCoord(entry.LatLng.lat, entry.LatLng.lng)
        : null
      if (fromNested) {
        out.push({
          coords: fromNested,
          label: String(entry.area_name || entry.branch_name || entry.name || entry.title || '').trim(),
        })
      }
    }
    return out
  }

  const expanded = []
  for (const row of rows) {
    const seen = new Set()
    const pushCandidate = (coords, branchLabel = '') => {
      if (!coords) return
      const key = `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`
      if (seen.has(key)) return
      seen.add(key)
      expanded.push({
        ...row,
        lat: coords.lat,
        lng: coords.lng,
        long: coords.long,
        branch_name: branchLabel || null,
      })
    }

    pushCandidate(toCoord(row.lat ?? row.latitude, row.long ?? row.longitude ?? row.lng))

    const clientType = String(row.client_type || row.clientType || '').toLowerCase().trim()
    if (clientType === 'restaurant') {
      const branchPayload = row.branches ?? row.branch ?? restaurantBranchByUuid[row.client_a_uuid] ?? null
      const branchCoords = getBranchCoords(branchPayload)
      for (const branch of branchCoords) {
        pushCandidate(branch.coords, branch.label)
      }
    }
  }

  return expanded;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * @param {number} userLat
 * @param {number} userLng
 * @param {string} mode - 'landmarks' | 'all' | 'food' | 'saved'
 * @param {{ allPlaces?: boolean }} options - If allPlaces is true, return every client with location (no limit). Used when opening AR from Explore.
 */
export async function fetchNearbyPOIs(userLat, userLng, mode = 'all', options = {}) {
  const { allPlaces = false } = options;
  const isLandmarks = mode === 'landmarks';
  const isFood = mode === 'food';

  let clients = await fetchClientsWithLocation().catch(() => []);

  const toItem = (row) => {
    const clientType = (row.client_type || row.clientType || '').toLowerCase();
    let _type = 'place';
    if (clientType === 'restaurant') _type = 'restaurant';
    else if (clientType === 'place' || clientType === 'landmark') _type = isLandmarks ? 'landmark' : 'place';
    return {
      ...row,
      metadata: {
        place_name: row.business_name || row.name || row.business_name_ar || 'Spot',
        business_name: row.business_name || row.name,
        name: row.business_name || row.name,
        description: row.description || '',
        category: row.category || '',
        client_type: row.client_type || row.clientType,
        lat: row.lat,
        long: row.lng,
        lng: row.lng,
        venue: row.location || row.address || '',
        location: row.location || row.address,
        rating: row.rating,
        price_range: row.price_range,
        cuisine: row.cuisine || row.cuisine_type,
        cuisine_type: row.cuisine_type || row.cuisine,
      },
      _type,
      _isLandmark: _type === 'landmark' || (row.category && ['UNESCO Heritage', 'Landmark', 'Museum', 'Heritage', 'Natural Wonder', 'Nature'].includes(row.category)),
    };
  };

  let combined = clients.map(toItem);

  if (combined.length === 0 && !isFood) {
    const fallback = BAHRAIN_LANDMARKS.map((l) => ({
      ...l,
      lat: l.lat,
      lng: l.lng,
      metadata: { place_name: l.name, description: l.description, category: l.category, lat: l.lat, long: l.lng },
      _type: 'landmark',
      _isLandmark: true,
    }));
    combined = fallback;
  }

  if (combined.length > 0 && clients.length > 0) {
    if (isLandmarks) {
      combined = combined.filter((c) => (c.metadata?.client_type || '').toLowerCase() === 'place' || c._isLandmark);
    } else if (isFood) {
      combined = combined.filter((c) => (c.metadata?.client_type || '').toLowerCase() === 'restaurant');
    }
  }

  const seen = new Set();
  const withCoords = combined
    .map((item) => {
      const ll = item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : getLatLng(item?.metadata || item);
      if (!ll) return null;
      const name =
        item.metadata?.place_name ||
        item.metadata?.business_name ||
        item.metadata?.name ||
        item?.business_name ||
        item?.name ||
        'Spot';
      const key = `${name}-${ll.lat.toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const dist = haversineKm(userLat, userLng, ll.lat, ll.lng);
      const bear = bearingDeg(userLat, userLng, ll.lat, ll.lng);
      const type = item._type || ((item.metadata?.client_type || '').toLowerCase() === 'restaurant' ? 'restaurant' : 'place');
      return {
        ...item,
        name,
        lat: ll.lat,
        lng: ll.lng,
        distanceKm: dist,
        bearing: bear,
        _type: type,
        _isLandmark: item._isLandmark || (type === 'landmark') || (item.category && ['UNESCO Heritage', 'Landmark', 'Museum', 'Heritage', 'Natural Wonder', 'Nature'].includes(item.category)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (!allPlaces) {
    withCoords = withCoords.slice(0, mode === 'all' ? 16 : 12);
  }
  return withCoords;
}

/**
 * Fetches AI-recommended AR POIs using Pinecone semantic search.
 * Surfaces culturally/touristically relevant places beyond raw proximity.
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} [maxDistKm=50]
 * @returns {Promise<Array>}
 */
export async function fetchPineconeARRecommended(userLat, userLng, maxDistKm = 50) {
  try {
    const embedding = await getEmbedding(
      'popular tourist attractions landmarks restaurants cultural heritage spots Bahrain must visit'
    );
    const matches = await queryPineconeSafe(embedding, 24, {});
    const seen = new Set();
    return matches
      .map((match) => {
        const m = match.metadata || {};
        const lat = parseFloat(m.lat || m.latitude || '');
        const lng = parseFloat(m.long || m.longitude || m.lng || '');
        if (isNaN(lat) || isNaN(lng)) return null;
        const dist = haversineKm(userLat, userLng, lat, lng);
        if (dist > maxDistKm) return null;
        const name = m.event_name || m.business_name || m.name || m.place_name || 'Spot';
        const key = `${name}-${lat.toFixed(4)}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const bear = bearingDeg(userLat, userLng, lat, lng);
        const clientType = (m.client_type || '').toLowerCase();
        const recType = m.record_type || '';
        const _type = clientType === 'restaurant' ? 'restaurant' : recType === 'event' ? 'event' : 'place';
        return {
          id: match.id,
          name,
          lat,
          lng,
          distanceKm: dist,
          bearing: bear,
          metadata: m,
          _type,
          _isLandmark: ['UNESCO Heritage', 'Landmark', 'Museum', 'Heritage', 'Natural Wonder', 'Nature'].includes(m.category || ''),
          _pineconeRecommended: true,
          score: match.score ?? 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  } catch (e) {
    console.warn('[AR Pinecone] recommended fetch failed:', e?.message);
    return [];
  }
}

// ─── Step 4: GPT smart day plan from combined records ───────────

function formatMatchForPrompt(match, idx, originLat = null, originLng = null) {
  const m = match.metadata || {};
  const name = m.event_name || m.business_name || m.name || m.place_name || `Place ${idx + 1}`;
  const lat = m.lat || m.latitude || m.Lat || '';
  const lng = m.long || m.longitude || m.lng || m.Long || '';
  const isEvent = m.record_type === 'event';
  const parts = [`${idx + 1}. ${name}`];
  if (isEvent) parts.push(`[EVENT]`);
  if (lat && lng) parts.push(`Lat: ${lat} | Lng: ${lng}`);
  if (
    lat && lng &&
    typeof originLat === 'number' && !Number.isNaN(originLat) &&
    typeof originLng === 'number' && !Number.isNaN(originLng)
  ) {
    const d = haversineKm(originLat, originLng, parseFloat(lat), parseFloat(lng));
    if (!Number.isNaN(d)) parts.push(`DistFromUserKm: ${d.toFixed(1)}`);
  }
  if (m.client_type) parts.push(`Type: ${m.client_type}`);
  if (m.description) parts.push(`Desc: ${m.description}`);
  if (m.cuisine || m.cuisine_type) parts.push(`Cuisine: ${m.cuisine || m.cuisine_type}`);
  if (m.price_range) parts.push(`Price: ${m.price_range}`);
  if (m.timings) parts.push(`Timings: ${m.timings}`);
  if (m.rating != null && m.rating !== '') parts.push(`Rating: ${m.rating}`);
  if (m.openclosed_state) parts.push(`Status: ${m.openclosed_state}`);
  if (m.location || m.area) parts.push(`Area: ${m.location || m.area}`);
  if (m.event_type) parts.push(`EventType: ${m.event_type}`);
  if (m.start_time) parts.push(`StartTime: ${m.start_time}`);
  if (m.end_time) parts.push(`EndTime: ${m.end_time}`);
  if (m.start_date) parts.push(`StartDate: ${m.start_date}`);
  if (m.end_date) parts.push(`EndDate: ${m.end_date}`);
  if (m.venue) parts.push(`Venue: ${m.venue}`);
  if (m.indoor_outdoor) parts.push(`IndoorOutdoor: ${m.indoor_outdoor}`);
  if (m.isfoodtruck === true) parts.push(`VenueKind: Food truck`);
  const rcSlots =
    m.restaurant_meal_type != null && String(m.restaurant_meal_type).trim()
      ? String(m.restaurant_meal_type).trim().slice(0, 280)
      : '';
  if (rcSlots && String(m.client_type || '').toLowerCase() === 'restaurant') {
    parts.push(`ServingSlots: ${rcSlots}`);
    if (m.isfoodtruck === true) {
      if (restaurantMealTypeSnackOnlyServing(rcSlots)) {
        parts.push(`ServingNote: Primarily snacks / light bites — not a full sit-down meal venue`);
      } else if (restaurantMealTypeHasSnackOffering(rcSlots)) {
        parts.push(`ServingNote: Also offers snacks`);
      }
    }
  }
  const rFood = m.restaurant_food_type != null ? String(m.restaurant_food_type).trim().slice(0, 280) : '';
  if (rFood && String(m.client_type || '').toLowerCase() === 'restaurant') {
    parts.push(`FoodStyles: ${rFood}`);
  }
  const mealType = m.meal_type || m.mealType;
  if (mealType) parts.push(`MealType: ${mealType}`);
  return parts.join(' | ');
}

/** Caps per travel tier — nearby uses a smaller, distance-biased catalog; wide uses a larger island-wide slice. */
const TRAVEL_TIER_CAPS = {
  nearby: { MAX_MATCHES: 20, CAP_EVENTS: 5, CAP_BREAKFAST: 3, CAP_PLACES: 7, CAP_RESTAURANTS: 10 },
  balanced: { MAX_MATCHES: 28, CAP_EVENTS: 8, CAP_BREAKFAST: 4, CAP_PLACES: 10, CAP_RESTAURANTS: 14 },
  wide: { MAX_MATCHES: 40, CAP_EVENTS: 10, CAP_BREAKFAST: 5, CAP_PLACES: 14, CAP_RESTAURANTS: 18 },
}

const TRAVEL_TIER_GEO = {
  nearby: { radiusKm: 8, minPerBucket: 2 },
  balanced: { radiusKm: 15, minPerBucket: 3 },
  wide: { radiusKm: 30, minPerBucket: 3 },
}

function coordsFromMatch(m) {
  const meta = m?.metadata || {}
  const la = parseFloat(meta.lat ?? meta.latitude ?? '')
  const ln = parseFloat(meta.long ?? meta.longitude ?? meta.lng ?? '')
  if (Number.isNaN(la) || Number.isNaN(ln) || (la === 0 && ln === 0)) return null
  return { lat: la, lng: ln }
}

function normalizeTravelTier(t) {
  if (t === 'nearby' || t === 'wide' || t === 'balanced') return t
  return 'balanced'
}

function buildTravelExploreBlock(personalization) {
  const tier = normalizeTravelTier(personalization?.travelExplore)
  const hasOrigin =
    typeof personalization?.originLat === 'number' &&
    !Number.isNaN(personalization.originLat) &&
    typeof personalization?.originLng === 'number' &&
    !Number.isNaN(personalization.originLng)

  const originHint = hasOrigin
    ? 'Catalog candidates were ranked using distance from the user’s current GPS position (fresh fix at generate time). Match the travel tier: nearby = closest picks; balanced = strong matches biased toward reasonable distance; wide = strong matches biased toward spread across the island.'
    : 'GPS was unavailable — catalog order is by relevance only; still follow the travel range below and keep geography sensible using catalog Area/location fields.'

  if (tier === 'nearby') {
    return `═══ TRAVEL RANGE (this session — nearby) ═══
They want quick, close experiences — cluster the day geographically; avoid unnecessary cross-island hops.
${originHint}
Prefer 6–7 stops total (minimum rules still apply). Choose venues that keep driving time reasonable.`
  }
  if (tier === 'wide') {
    return `═══ TRAVEL RANGE (this session — island-wide) ═══
They’re willing to travel for standout picks — you may span Manama, Muharraq, Riffa, Southern areas, coast, etc. when the catalog supports it.
${originHint}
A richer day (up to 9 stops) is encouraged when the catalog has strong matches in different areas.`
  }
  return `═══ TRAVEL RANGE (this session — balanced) ═══
Mix nearby gems with a few slightly farther highlights — a typical Bahrain day.
${originHint}`
}

const pineconeScore = (m) => {
  const s = m?.score
  if (typeof s === 'number' && !Number.isNaN(s)) return s
  return -Number.MAX_VALUE
}

const stableMatchKey = (m) => {
  if (m?.id != null && String(m.id) !== '') return `id:${m.id}`
  const meta = m?.metadata || {}
  if (meta.client_a_uuid) return `cid:${meta.client_a_uuid}`
  const name = String(meta.event_name || meta.business_name || meta.name || meta.place_name || '')
    .trim()
    .toLowerCase()
  const lat = String(meta.lat ?? meta.latitude ?? '')
  const lng = String(meta.long ?? meta.longitude ?? meta.lng ?? '')
  return `n:${name}|${lat}|${lng}`
}

const dedupeSortedByScore = (arr) => {
  const sorted = [...(arr || [])].sort((a, b) => pineconeScore(b) - pineconeScore(a))
  const seen = new Set()
  const out = []
  for (const m of sorted) {
    const k = stableMatchKey(m)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(m)
  }
  return out
}

/** Reciprocal rank fusion constant (pairs with rank r use weight 1/(k+r), r≥1 common in papers) */
const RRF_MERGE_K = 61

/**
 * Merge several Pinecone-ranked lists so venues that rank well in more than one query rise to the top.
 */
const mergeRankedListsByRRF = (rankedLists, keyFn = stableMatchKey, rrK = RRF_MERGE_K) => {
  const lists = Array.isArray(rankedLists)
    ? rankedLists.map((list) => (Array.isArray(list) ? list : [])).filter((l) => l.length > 0)
    : []
  if (lists.length === 0) return []
  if (lists.length === 1) return [...lists[0]]
  const acc = new Map()
  for (let li = 0; li < lists.length; li++) {
    const list = lists[li]
    for (let rank = 0; rank < list.length; rank++) {
      const m = list[rank]
      if (!m) continue
      const key = keyFn(m)
      if (!key) continue
      const add = 1 / (rrK + rank + 1)
      const row = acc.get(key)
      if (!row) acc.set(key, { score: add, match: m })
      else row.score += add
    }
  }
  return [...acc.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return pineconeScore(b.match) - pineconeScore(a.match)
    })
    .map((x) => x.match)
}

const retrievalFacetForDiversify = (m) => {
  const meta = m?.metadata || {}
  const fk = pineconeBucketFromMatch(m)
  const raw = String(
    meta.category || meta.cuisine_type || meta.cuisine || meta.event_type || meta.type || meta.venue_type || '',
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 48)
  const area = String(meta.area || meta.location || meta.vicinity || meta.region || meta.city || '')
    .trim()
    .toLowerCase()
    .slice(0, 28)
  return `${fk}:${raw || '_'}@${area || '_'}`
}

/**
 * Re-order top picks so the catalog slice is not five near-identical malls or café rows when better variety exists later in the ranking.
 */
const diversifyTopMatchesGreedy = (sortedMatches, cap, maxPerFacet) => {
  if (!cap || cap < 1) return []
  if (!sortedMatches?.length) return []
  const mxf = typeof maxPerFacet === 'number' && maxPerFacet > 0 ? maxPerFacet : 0
  if (!mxf || sortedMatches.length <= 2) return sortedMatches.slice(0, cap)

  const facetCounts = new Map()
  const picked = []
  const pickedStable = new Set()

  const tryPick = (m, relaxFacetCap) => {
    const stab = stableMatchKey(m)
    if (!stab || pickedStable.has(stab)) return false
    const facet = retrievalFacetForDiversify(m)
    const c = facetCounts.get(facet) || 0
    if (!relaxFacetCap && c >= mxf) return false
    picked.push(m)
    pickedStable.add(stab)
    facetCounts.set(facet, c + 1)
    return true
  }

  for (const m of sortedMatches) {
    if (picked.length >= cap) break
    tryPick(m, false)
  }
  for (const m of sortedMatches) {
    if (picked.length >= cap) break
    tryPick(m, true)
  }
  return picked.slice(0, cap)
}

/**
 * Compute a cluster anchor from the top-scoring matches when GPS origin is unavailable.
 * Uses the centroid of the top K geocoded hits across places+restaurants (ignores events to avoid
 * being dragged by a one-off concert on the other side of the island).
 */
function computeCatalogCentroid(places, restaurants) {
  const pool = []
  const pushTop = (arr, k) => {
    const list = Array.isArray(arr) ? arr : []
    const sorted = [...list].sort((a, b) => (b?.score || 0) - (a?.score || 0))
    for (const m of sorted.slice(0, k)) {
      const c = coordsFromMatch(m)
      if (c) pool.push(c)
    }
  }
  pushTop(places, 6)
  pushTop(restaurants, 6)
  if (pool.length === 0) return null
  const lat = pool.reduce((s, c) => s + c.lat, 0) / pool.length
  const lng = pool.reduce((s, c) => s + c.lng, 0) / pool.length
  return { lat, lng }
}

/**
 * Drop rows outside `radiusKm` of the anchor, but never starve a bucket below `minKeep`.
 * If the radius-filtered list is too short, expand gradually.
 */
function geoFilterToCluster(bucket, anchor, radiusKm, minKeep) {
  if (!anchor || !Array.isArray(bucket) || bucket.length === 0) return bucket
  const decorated = bucket.map((m) => {
    const c = coordsFromMatch(m)
    const d = c ? haversineKm(anchor.lat, anchor.lng, c.lat, c.lng) : null
    return { m, d: d == null ? Number.POSITIVE_INFINITY : d }
  })
  const levels = [radiusKm, radiusKm * 1.5, radiusKm * 2.25, Number.POSITIVE_INFINITY]
  for (const r of levels) {
    const kept = decorated.filter((x) => x.d <= r).map((x) => x.m)
    if (kept.length >= Math.min(minKeep, bucket.length)) return kept
  }
  return bucket
}

const normalizePlanRankingSpotKey = (name) =>
  String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Prefer high-similarity Pinecone hits across buckets so events/breakfast are not drowned out by restaurants.
 * @param {object} [options]
 * @param {string} [options.travelExplore] — 'nearby' | 'balanced' | 'wide'
 * @param {number} [options.originLat]
 * @param {number} [options.originLng]
 * @param {string[]} [options.prefLabels]
 * @param {string[]} [options.foodLabels]
 * @param {Set<string>} [options.feedbackDownrankSet] — normalized venue names user disliked (thumbs down)
 * @param {Set<string>} [options.feedbackBoostSet] — normalized venue names user liked (thumbs up)
 * @param {Set<string>} [options.savedPostClientBoostSet] — client_a_uuid (lowercase) from home-feed saved posts
 */
function selectMatchesForPlan(places, restaurants, breakfastSpots, events, options = {}) {
  const tier = normalizeTravelTier(options.travelExplore)
  const caps = TRAVEL_TIER_CAPS[tier] || TRAVEL_TIER_CAPS.balanced
  const geo = TRAVEL_TIER_GEO[tier] || TRAVEL_TIER_GEO.balanced
  const originLat = typeof options.originLat === 'number' && !Number.isNaN(options.originLat) ? options.originLat : null
  const originLng = typeof options.originLng === 'number' && !Number.isNaN(options.originLng) ? options.originLng : null
  const hasOrigin = originLat != null && originLng != null
  const anchor = hasOrigin
    ? { lat: originLat, lng: originLng }
    : computeCatalogCentroid(places, restaurants)

  const clusterPlaces = geoFilterToCluster(places, anchor, geo.radiusKm, geo.minPerBucket)
  const clusterRestaurants = geoFilterToCluster(restaurants, anchor, geo.radiusKm, geo.minPerBucket)
  const clusterBreakfast = geoFilterToCluster(breakfastSpots, anchor, geo.radiusKm, geo.minPerBucket)
  const clusterEvents = geoFilterToCluster(events, anchor, geo.radiusKm * 1.25, Math.max(1, Math.floor(geo.minPerBucket / 2)))
  places = clusterPlaces
  restaurants = clusterRestaurants
  breakfastSpots = clusterBreakfast
  events = clusterEvents

  const combinedPrefFoodLabels = [
    ...(Array.isArray(options.prefLabels) ? options.prefLabels : []),
    ...(Array.isArray(options.foodLabels) ? options.foodLabels : []),
  ]
  const feedbackDown =
    options.feedbackDownrankSet instanceof Set ? options.feedbackDownrankSet : new Set()
  const feedbackBoost = options.feedbackBoostSet instanceof Set ? options.feedbackBoostSet : new Set()
  const savedPostClientBoost =
    options.savedPostClientBoostSet instanceof Set ? options.savedPostClientBoostSet : new Set()

  // When specific gated place themes are selected (e.g. Beach, Museum), apply a much
  // heavier preference weight so theme-matched venues dominate the catalog slice sent to GPT.
  const hasGatedPrefLabels = (Array.isArray(options.prefLabels) ? options.prefLabels : []).some(
    (l) => PLACE_THEME_GATES[l],
  )

  const rankingSpotKey = (m) => {
    const meta = m?.metadata || {}
    return normalizePlanRankingSpotKey(
      String(
        meta.event_name || meta.business_name || meta.name || meta.place_name || meta.title || '',
      ).trim(),
    )
  }

  /** Higher = better candidate for GPT catalog slice */
  const compositeBucketRank = (m) => {
    const meta = m?.metadata || {}
    const pc = pineconeScore(m)
    const pref =
      combinedPrefFoodLabels.length > 0
        ? preferenceAlignmentScore(m, combinedPrefFoodLabels)
        : 0
    const nk = rankingSpotKey(m)
    const downW = nk && feedbackDown.has(nk) ? 26 : 0
    const upW = nk && feedbackBoost.has(nk) ? 16 : 0
    const cidBoost = String(meta.client_a_uuid || '').trim().toLowerCase()
    const savedPostW = cidBoost && savedPostClientBoost.has(cidBoost) ? 18 : 0
    let geo = 0
    if (hasOrigin) {
      const c = coordsFromMatch(m)
      if (c) {
        const d = haversineKm(originLat, originLng, c.lat, c.lng)
        if (!Number.isNaN(d)) {
          // Stronger distance weighting to prefer closest venues when origin is known.
          // "nearby" tier is very aggressive; "balanced" is moderate; "wide" still boosts far.
          if (tier === 'nearby') geo = -d * 2.2
          else if (tier === 'balanced') geo = -d * 1.1
          else geo = d * 0.22
        }
      }
    }
    // Use a higher preference multiplier when specific gated labels (Beach, Museum, etc.)
    // are selected so the catalog slice GPT receives is dominated by theme-matching venues.
    const prefWeight = hasGatedPrefLabels ? 9.0 : 3.4
    return pc * 52 + pref * prefWeight + geo + upW + savedPostW - downW
  }

  const takeBucket = (arr, cap, diversifyMaxPerFacet) => {
    const base = dedupeSortedByScore(arr)
    const mult = tier === 'wide' ? 4 : tier === 'balanced' ? 3 : 2
    const pool = base.slice(0, Math.min(base.length, Math.max(cap * mult, cap)))
    const scored = pool.map((m) => ({ m, r: compositeBucketRank(m) }))
    scored.sort((a, b) => b.r - a.r)
    const ordered = scored.map((x) => x.m)
    if (typeof diversifyMaxPerFacet === 'number' && diversifyMaxPerFacet > 0) {
      return diversifyTopMatchesGreedy(ordered, cap, diversifyMaxPerFacet)
    }
    return ordered.slice(0, cap)
  }

  const eventsU = takeBucket(events, caps.CAP_EVENTS, 2)
  const breakfastU = takeBucket(breakfastSpots, caps.CAP_BREAKFAST, 2)
  const placesU = takeBucket(places, caps.CAP_PLACES, 2)
  const restaurantsU = takeBucket(restaurants, caps.CAP_RESTAURANTS, 3)
  const merged = [...eventsU, ...breakfastU, ...placesU, ...restaurantsU]
  const seen = new Set()
  const final = []
  for (const m of merged) {
    const k = stableMatchKey(m)
    if (seen.has(k)) continue
    seen.add(k)
    final.push(m)
  }
  return final.slice(0, caps.MAX_MATCHES)
}

const primaryNameFromMatch = (m) => {
  const meta = m?.metadata || {}
  return String(
    meta.event_name ||
      meta.business_name ||
      meta.name ||
      meta.place_name ||
      meta.title ||
      meta.display_name ||
      meta.venue ||
      meta.venue_name ||
      '',
  ).trim()
}

const catalogNameList = (matches) =>
  matches.map(primaryNameFromMatch).filter((n) => n.length > 0)

const normalizeSpot = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

const spotMatchesCatalog = (spot, catalogLower) => {
  const s = normalizeSpot(spot)
  if (!s) return false
  if (catalogLower.some((n) => n === s)) return true
  if (catalogLower.some((n) => n.length >= 6 && s.includes(n))) return true
  if (catalogLower.some((n) => s.length >= 6 && n.includes(s))) return true
  return catalogLower.some((n) => n.length >= 4 && (s.includes(n) || n.includes(s)))
}

const parsePlanFromRaw = (raw) => {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  try {
    const p = JSON.parse(trimmed)
    return Array.isArray(p) ? p : null
  } catch (_) {
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return null
    try {
      const p = JSON.parse(jsonMatch[0])
      return Array.isArray(p) ? p : null
    } catch (_) {
      return null
    }
  }
}

const validatePlan = (plan, catalogLower) => {
  if (!Array.isArray(plan) || plan.length < 6) return { ok: false, reason: 'Plan missing or too short (minimum 6 stops)' }
  const issues = []
  for (let i = 0; i < plan.length; i++) {
    const row = plan[i]
    if (!row || typeof row !== 'object') {
      issues.push(`Row ${i} invalid`)
      continue
    }
    const { spot, time, type, lat, lng } = row
    if (!spot || !time || !type) issues.push(`Row ${i} missing spot/time/type`)
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      issues.push(`Row ${i} missing lat/lng`)
    }
    if (!spotMatchesCatalog(spot, catalogLower)) issues.push(`Row ${i} spot not in catalog: "${spot}"`)
  }
  return issues.length ? { ok: false, reason: issues.join('; ') } : { ok: true }
}

const topUpPlanToMinimumStops = (plan, matches, minimumStops = 6) => {
  const basePlan = Array.isArray(plan) ? [...plan] : []
  if (basePlan.length >= minimumStops) return basePlan

  const used = new Set(basePlan.map((row) => normalizeSpot(row?.spot)).filter(Boolean))
  const needsMealTimes = ['Morning', 'Afternoon', 'Evening'].filter(
    (time) => !basePlan.some((row) => row?.type === 'restaurant' && row?.time === time),
  )

  const timeForExtraPlace = () => {
    const order = ['Afternoon', 'Evening', 'Morning']
    for (const t of order) {
      const count = basePlan.filter((row) => row?.time === t).length
      if (count < 3) return t
    }
    return 'Afternoon'
  }

  for (const m of Array.isArray(matches) ? matches : []) {
    if (basePlan.length >= minimumStops) break
    const spot = primaryNameFromMatch(m)
    const normalized = normalizeSpot(spot)
    if (!normalized || used.has(normalized)) continue
    const ll = coordsFromPineconeMatch(m)
    if (!ll) continue

    const bucket = pineconeBucketFromMatch(m)
    const type = bucket === 'restaurant' || bucket === 'event' ? bucket : 'place'
    let time = 'Afternoon'
    if (type === 'restaurant') {
      time = needsMealTimes.length ? needsMealTimes.shift() : 'Evening'
    } else if (type === 'event') {
      time = 'Evening'
    } else {
      time = timeForExtraPlace()
    }

    basePlan.push({
      spot,
      time,
      type,
      lat: ll.lat,
      lng: ll.lng,
      reason: 'Added automatically to keep your itinerary complete and varied.',
      backupOptions: [],
      estimatedStopBudget: null,
    })
    used.add(normalized)
  }

  return basePlan
}

const buildProfileSection = (personalization) => {
  const g = personalization?.profileGeneral
  const a = personalization?.profileActivity
  const f = personalization?.profileFood
  const narrative = typeof personalization?.profileNarrative === 'string' ? personalization.profileNarrative.trim() : ''
  const answers = personalization?.profileAnswers && typeof personalization.profileAnswers === 'object'
    ? personalization.profileAnswers
    : null
  const hasG = Array.isArray(g) && g.length > 0
  const hasA = Array.isArray(a) && a.length > 0
  const hasF = Array.isArray(f) && f.length > 0
  const hasNarrative = narrative.length > 0
  const hasAnswers =
    answers &&
    (typeof answers.idealDay === 'string' || typeof answers.avoidList === 'string') &&
    ((answers.idealDay && String(answers.idealDay).trim()) || (answers.avoidList && String(answers.avoidList).trim()))
  const structuredPairs = answers ? collectStructuredTripPairs(answers) : []
  const hasStructured = structuredPairs.length > 0

  if (!hasG && !hasA && !hasF && !hasNarrative && !hasAnswers && !hasStructured) {
    return 'No saved onboarding profile is available — rely only on the choices below and the catalog.'
  }
  const lines = []
  lines.push('═══ WHO THIS USER IS (saved persona — treat as ground truth for tone, pacing, and picks) ═══')
  if (hasNarrative) {
    lines.push(`Persona summary (use this to shape every reason line and overall day vibe):\n"${narrative}"`)
    lines.push('Make every stop feel like it was hand-picked for the person described above. The tone of each "reason" should subtly reflect their personality — not generic travel copy.')
  }
  if (hasG) lines.push(`Lifestyle / vibe tags: ${g.join(', ')} — reflect this in reasons and pacing (relaxed vs packed, family-friendly vs nightlife, premium vs budget, etc.).`)
  if (hasA) lines.push(`Activity leanings: ${a.join(', ')} — prefer stops that lean into these themes when compatible with today’s picks.`)
  if (hasF) lines.push(`Food personality: ${f.join(', ')} — use as a soft bias for meal personality even when today’s food picker differs.`)
  if (hasStructured) {
    lines.push(
      `Structured trip facts (respect when compatible with catalog — never invent venues to satisfy):\n${structuredPairs
        .map(([lab, val]) => `- ${lab}: ${val}`)
        .join('\n')}`,
    )
  }
  if (answers?.idealDay) lines.push(`Ideal day notes: ${String(answers.idealDay).trim()}`)
  if (answers?.avoidList) lines.push(`Avoid these constraints: ${String(answers.avoidList).trim()}`)
  lines.push('If today’s explicit session picks conflict with the persona, today’s picks win — but keep the day feeling custom-built for this person.')
  return lines.join('\n')
}

const normalizeHistorySpot = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const uniqueRecentSpotHistory = (spots) => {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(spots) ? spots : []) {
    const original = String(raw || '').trim()
    if (!original) continue
    const n = normalizeHistorySpot(original)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(original)
  }
  return out
}

const inferPreferenceSignals = (personalization) => {
  const g = Array.isArray(personalization?.profileGeneral) ? personalization.profileGeneral : []
  const joined = g.map((x) => String(x).toLowerCase()).join(' | ')
  const pick = (checks, fallback) => (checks.some((x) => joined.includes(x)) ? fallback : null)

  const groupType =
    pick(['family', 'kids'], 'family') ||
    pick(['friends'], 'friends') ||
    pick(['solo'], 'solo') ||
    pick(['couple', 'romantic'], 'couple')

  const pacePreference =
    pick(['relaxed', 'quiet'], 'relaxed') ||
    pick(['packed'], 'packed') ||
    pick(['balanced'], 'balanced')

  const budgetLevel =
    pick(['budget'], 'budget') ||
    pick(['premium', 'splurge', 'luxury'], 'premium') ||
    pick(['moderate'], 'moderate')

  return { groupType, pacePreference, budgetLevel }
}

/** Normalizes account persona for prompts: `'tourist'` or `'local'` (default). */
export function normalizeViewerUType(raw) {
  return String(raw || '').trim().toLowerCase() === 'tourist' ? 'tourist' : 'local'
}

const buildAudienceGuideLines = (viewerUType) => {
  if (viewerUType === 'tourist') {
    return [
      '═══ AUDIENCE: VISITOR TO BAHRAIN ═══',
      'Assume limited familiarity with neighborhoods and everyday navigation.',
      'Keep routes geographically coherent and easy to follow; briefly orient when naming areas.',
      'Iconic landmarks are welcome when they fit preferences; transitions should feel comfortable for a guest.',
      'Tips may include light visitor context (timing, heat, straightforward parking hints) when it helps.',
    ].join('\n')
  }
  return [
    '═══ AUDIENCE: BAHRAIN RESIDENT (LOCAL) ═══',
    'Assume familiarity with roads and areas — skip tourist basics unless persona or chips ask.',
    'Prefer fresher rotations, neighborhood gems, and insider angles over repeating ultra-famous staples unless strongly requested.',
    'Tips can stay short and practical (best window, quieter option, realistic parking expectation).',
  ].join('\n')
}

const buildHistorySection = (personalization) => {
  const recentVisited = uniqueRecentSpotHistory(personalization?.recentVisitedSpots).slice(0, 24)
  if (!recentVisited.length) {
    return 'No recent itinerary history was provided. Avoid repeating the same venue inside today’s plan.'
  }
  return [
    '═══ USER HISTORY MEMORY (avoid repetition) ═══',
    'These places were recently used in this user’s prior plans. Prefer new discoveries and only reuse if clearly justified by today’s strict constraints:',
    ...recentVisited.map((n, idx) => `${idx + 1}. ${n}`),
    'Do not repeat these venues unless there is no suitable alternative in the provided catalog.',
  ].join('\n')
}

const applyRecentHistoryDiversity = (matches, recentVisitedSpots, minKeep = 12) => {
  const list = Array.isArray(matches) ? matches : []
  if (!list.length) return list

  const alwaysDeprioritize = new Set([
    'bab al bahrain',
    'bab el bahrain',
    'emmawash',
    'emma wash',
  ])

  const deprioritized = []
  const normalPriority = []
  for (const m of list) {
    const normalized = normalizeHistorySpot(primaryNameFromMatch(m))
    if (normalized && alwaysDeprioritize.has(normalized)) deprioritized.push(m)
    else normalPriority.push(m)
  }
  const seededList = [...normalPriority, ...deprioritized]

  const recentSet = new Set(
    uniqueRecentSpotHistory(recentVisitedSpots)
      .map(normalizeHistorySpot)
      .filter(Boolean),
  )
  if (!recentSet.size) return seededList

  const fresh = []
  const repeated = []
  for (const m of seededList) {
    const name = primaryNameFromMatch(m)
    const normalized = normalizeHistorySpot(name)
    if (normalized && recentSet.has(normalized)) repeated.push(m)
    else fresh.push(m)
  }

  if (fresh.length >= minKeep) return fresh

  // Keep repeats as a last resort only, and cap them so catalog stays varied.
  const listSize = seededList.length
  const dynamicMinKeep = Math.max(6, Math.floor(listSize * 0.6))
  if (fresh.length >= dynamicMinKeep) return fresh

  const maxRepeatedAllowed = Math.max(1, Math.floor(listSize * 0.2))
  return [...fresh, ...repeated.slice(0, maxRepeatedAllowed)].slice(0, listSize)
}

const applyStrictAvoidWithFallback = (matches, strictAvoidSpots, minKeep = 12) => {
  const list = Array.isArray(matches) ? matches : []
  if (!list.length) return list
  const strictSet = new Set(
    uniqueRecentSpotHistory(strictAvoidSpots)
      .map(normalizeHistorySpot)
      .filter(Boolean),
  )
  if (!strictSet.size) return list

  const fresh = []
  const repeated = []
  for (const m of list) {
    const normalized = normalizeHistorySpot(primaryNameFromMatch(m))
    if (normalized && strictSet.has(normalized)) repeated.push(m)
    else fresh.push(m)
  }

  // Nothing to avoid, or no alternatives available.
  if (!repeated.length || !fresh.length) return list

  // Strongly prefer new options when there are enough.
  if (fresh.length >= minKeep) return fresh

  // If options are limited (e.g. only one viable beach), allow controlled fallback.
  const listSize = list.length
  const dynamicMinKeep = Math.max(6, Math.floor(listSize * 0.6))
  if (fresh.length >= dynamicMinKeep) return fresh

  const neededFallback = Math.max(dynamicMinKeep - fresh.length, 1)
  return [...fresh, ...repeated.slice(0, neededFallback)].slice(0, listSize)
}

/**
 * After strictAvoid + recent-history filtering, we can still have plenty of catalogue rows —
 * none of them match today's chips (e.g. only beaches were repeats and got dropped).
 * Merge back strongest preference-aligned hits from `selectMatchesForPlan` so GPT can obey the session prefs.
 */
const restorePreferenceAlignedCatalogMatches = (
  curatedCatalog,
  fullPoolBeforeTextPrompt,
  preferenceLabels,
  { targetAligned = 2, maxAdd = 10 } = {},
) => {
  const prefs = Array.isArray(preferenceLabels) ? preferenceLabels : []
  if (prefs.length === 0 || !Array.isArray(curatedCatalog) || !fullPoolBeforeTextPrompt?.length) {
    return curatedCatalog || []
  }

  const donorHasAligned = fullPoolBeforeTextPrompt.some((m) => preferenceAlignmentScore(m, prefs) > 0)
  if (!donorHasAligned) return curatedCatalog

  let alignedCount = curatedCatalog.reduce(
    (n, m) => n + (preferenceAlignmentScore(m, prefs) > 0 ? 1 : 0),
    0,
  )
  if (alignedCount >= targetAligned) return curatedCatalog

  const out = [...curatedCatalog]
  const keys = new Set(out.map(stableMatchKey))
  const candidates = [...fullPoolBeforeTextPrompt]
    .filter((m) => preferenceAlignmentScore(m, prefs) > 0)
    .sort((a, b) => {
      const sd = preferenceAlignmentScore(b, prefs) - preferenceAlignmentScore(a, prefs)
      if (sd !== 0) return sd
      return pineconeScore(b) - pineconeScore(a)
    })

  let added = 0
  for (const m of candidates) {
    if (alignedCount >= targetAligned) break
    const k = stableMatchKey(m)
    if (keys.has(k)) continue
    out.push(m)
    keys.add(k)
    alignedCount += 1
    added += 1
    if (added >= maxAdd) break
  }
  return out
}

/**
 * Today's events in the catalog are often only weakly related by vector search.
 * When the user (or their saved activity profile) expresses concrete themes, drop events
 * that don't echo those themes in name/type/description — avoids "random expo" filler.
 */
const filterEventsForSessionRelevance = (events, prefLabels, personalization = {}) => {
  const list = Array.isArray(events) ? events : []
  if (!list.length) return []

  const chips = (Array.isArray(prefLabels) ? prefLabels : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
  const profileAct = Array.isArray(personalization?.profileActivity)
    ? personalization.profileActivity.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 10)
    : []

  let labelSources = chips.length > 0 ? chips : profileAct
  if (labelSources.length === 0) {
    return [...list].sort((a, b) => pineconeScore(b) - pineconeScore(a))
  }

  const aligned = list.filter((m) => preferenceAlignmentScore(m, labelSources) > 0)
  return aligned.sort((a, b) => pineconeScore(b) - pineconeScore(a))
}

const TIME_BUCKET_ORDER = { Morning: 0, Afternoon: 1, Evening: 2 }

const coordsFromPlanRow = (row) => {
  if (!row) return null
  const la = parseFloat(row.lat)
  const ln = parseFloat(row.lng)
  if (Number.isNaN(la) || Number.isNaN(ln) || (la === 0 && ln === 0)) return null
  return { lat: la, lng: ln }
}

const isBreakfastLike = (row) => {
  if (!row) return false
  if (row.type !== 'restaurant') return false
  const meal = String(row.mealType || row.meal_type || '').toLowerCase()
  if (meal.includes('breakfast')) return true
  const name = String(row.spot || '').toLowerCase()
  return name.includes('café') || name.includes('cafe') || name.includes('coffee') || name.includes('bakery')
}

/**
 * 2-opt improvement: swap pairs of edges within the free segment [start, end)
 * to reduce total travel distance. Pinned head/tail positions are never moved.
 * O(n³) worst-case but n ≤ 9 stops per bucket so this is negligible.
 */
const twoOptImprove = (stops, pinnedFirst = 0, pinnedLast = 0) => {
  if (stops.length <= pinnedFirst + pinnedLast + 2) return stops
  const result = stops.slice()
  const lo = pinnedFirst       // first free index
  const hi = result.length - pinnedLast // one past last free index

  let improved = true
  while (improved) {
    improved = false
    for (let i = lo; i < hi - 1; i++) {
      for (let j = i + 1; j < hi; j++) {
        // Edge before i: (i-1) → i  |  Edge after j: j → (j+1)
        const prevI = coordsFromPlanRow(result[i > 0 ? i - 1 : i])
        const nodeI = coordsFromPlanRow(result[i])
        const nodeJ = coordsFromPlanRow(result[j])
        const nextJ = coordsFromPlanRow(result[j + 1 < result.length ? j + 1 : j])
        if (!prevI || !nodeI || !nodeJ || !nextJ) continue

        const currentCost =
          haversineKm(prevI.lat, prevI.lng, nodeI.lat, nodeI.lng) +
          haversineKm(nodeJ.lat, nodeJ.lng, nextJ.lat, nextJ.lng)
        const newCost =
          haversineKm(prevI.lat, prevI.lng, nodeJ.lat, nodeJ.lng) +
          haversineKm(nodeI.lat, nodeI.lng, nextJ.lat, nextJ.lng)

        if (newCost < currentCost - 0.05) {
          // Reverse the segment [i..j] to eliminate the crossing
          const segment = result.slice(i, j + 1).reverse()
          result.splice(i, j - i + 1, ...segment)
          improved = true
        }
      }
    }
  }
  return result
}

/**
 * Reorder stops inside each time bucket using nearest-neighbor from the previous
 * stop (or user origin for the first stop), then apply 2-opt improvement to
 * eliminate any remaining backtracking/zig-zag patterns.
 *
 * Hard constraints preserved:
 * - Time-bucket order (Morning → Afternoon → Evening) never changes.
 * - Breakfast-style restaurant stays first in Morning.
 * - First restaurant in Afternoon stays first (lunch anchor).
 * - Last restaurant in Evening stays last (dinner).
 */
export function optimizePlanRoute(plan, originLat = null, originLng = null) {
  if (!Array.isArray(plan) || plan.length < 2) return plan

  const byBucket = { Morning: [], Afternoon: [], Evening: [] }
  for (const row of plan) {
    const bucket = TIME_BUCKET_ORDER[row?.time] != null ? row.time : 'Afternoon'
    byBucket[bucket].push(row)
  }

  const hasOrigin =
    typeof originLat === 'number' && !Number.isNaN(originLat) &&
    typeof originLng === 'number' && !Number.isNaN(originLng)

  let cursor = hasOrigin ? { lat: originLat, lng: originLng } : null

  const orderedBuckets = ['Morning', 'Afternoon', 'Evening']
  const reordered = []

  for (const bucket of orderedBuckets) {
    const rows = byBucket[bucket]
    if (!rows || rows.length === 0) continue

    // Pin breakfast-style row to first slot in Morning.
    let pinnedFirst = null
    if (bucket === 'Morning') {
      const breakfastIdx = rows.findIndex(isBreakfastLike)
      if (breakfastIdx >= 0) {
        pinnedFirst = rows.splice(breakfastIdx, 1)[0]
      }
    }

    // Pin the first restaurant in Afternoon to first slot (lunch anchor).
    if (bucket === 'Afternoon') {
      const lunchIdx = rows.findIndex((r) => r?.type === 'restaurant')
      if (lunchIdx >= 0) {
        pinnedFirst = rows.splice(lunchIdx, 1)[0]
      }
    }

    // Pin the last dinner-style restaurant to the end of Evening.
    let pinnedLast = null
    if (bucket === 'Evening') {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]?.type === 'restaurant') {
          pinnedLast = rows.splice(i, 1)[0]
          break
        }
      }
    }

    // Greedy nearest-neighbor over the remaining (free) rows.
    const remaining = rows.slice()
    const picked = []
    let localCursor = cursor
    if (pinnedFirst) {
      picked.push(pinnedFirst)
      const c = coordsFromPlanRow(pinnedFirst)
      if (c) localCursor = c
    }
    while (remaining.length > 0) {
      let bestIdx = 0
      let bestDist = Number.POSITIVE_INFINITY
      for (let i = 0; i < remaining.length; i++) {
        const c = coordsFromPlanRow(remaining[i])
        if (!c) {
          if (bestDist === Number.POSITIVE_INFINITY) bestIdx = i
          continue
        }
        const d = localCursor
          ? haversineKm(localCursor.lat, localCursor.lng, c.lat, c.lng)
          : 0
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      const next = remaining.splice(bestIdx, 1)[0]
      picked.push(next)
      const nc = coordsFromPlanRow(next)
      if (nc) localCursor = nc
    }
    if (pinnedLast) {
      picked.push(pinnedLast)
      const c = coordsFromPlanRow(pinnedLast)
      if (c) localCursor = c
    }

    // 2-opt pass to eliminate any remaining crossing/backtrack within the bucket.
    const headPinned = pinnedFirst ? 1 : 0
    const tailPinned = pinnedLast ? 1 : 0
    const improved = twoOptImprove(picked, headPinned, tailPinned)

    // Update cursor to end of this bucket for the next bucket's NN start.
    const lastCoord = coordsFromPlanRow(improved[improved.length - 1])
    if (lastCoord) cursor = lastCoord

    reordered.push(...improved)
  }

  try {
    let total = 0
    let maxHop = 0
    for (let i = 1; i < reordered.length; i++) {
      const a = coordsFromPlanRow(reordered[i - 1])
      const b = coordsFromPlanRow(reordered[i])
      if (!a || !b) continue
      const d = haversineKm(a.lat, a.lng, b.lat, b.lng)
      total += d
      if (d > maxHop) maxHop = d
    }
    if (reordered.length >= 2) {
      console.log(`[aiPipeline] Plan route: ${reordered.length} stops, total=${total.toFixed(1)}km, maxHop=${maxHop.toFixed(1)}km`)
    }
  } catch (_) {}

  return reordered
}

const estimateTravelMinutes = (from, to) => {
  const a = coordsFromPlanRow(from)
  const b = coordsFromPlanRow(to)
  if (!a || !b) return null
  const km = haversineKm(a.lat, a.lng, b.lat, b.lng)
  if (!Number.isFinite(km)) return null
  const speedKmh = 28
  const trafficBufferMin = 6
  const minutes = Math.round((km / speedKmh) * 60 + trafficBufferMin)
  return Math.max(5, minutes)
}

const annotatePlanLegDurations = (plan) =>
  (Array.isArray(plan) ? plan : []).map((row, idx, arr) => {
    if (!row || typeof row !== 'object') return row
    if (idx === 0) {
      return { ...row, travelMinutesFromPrevious: 0 }
    }
    const mins = estimateTravelMinutes(arr[idx - 1], row)
    return { ...row, travelMinutesFromPrevious: mins == null ? null : mins }
  })

const GUIDE_TEXT_MAX_CHARS = 140
const GENERIC_GUIDE_FILLER = [
  'must visit',
  'perfect for everyone',
  'something for everyone',
  'great vibes',
  'great place',
  'nice place',
  'highly recommended',
  'you will love it',
  'worth visiting',
]

const GUIDE_FALLBACK_BY_TYPE = {
  restaurant: {
    highlight: 'Flavor-led stop',
    why: 'Good fit for this part of your route, with a reliable menu and easy pacing.',
    tip: 'Ask for the house favorite and reserve at peak dinner hours.',
  },
  event: {
    highlight: 'Live local moment',
    why: 'Adds real local energy without breaking your route flow.',
    tip: 'Arrive 15 minutes early to settle in before it starts.',
  },
  place: {
    highlight: 'Local highlight',
    why: 'Strong sense of place and an easy fit with nearby stops.',
    tip: 'Start with the main viewpoint, then wander nearby side streets.',
  },
}

const collapseGuideText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^stop\s*\d+\s*[:\-]\s*/i, '')
    .replace(/^tip\s*[:\-]\s*/i, '')
    .trim()

const stripFillerPhrases = (value) => {
  const raw = collapseGuideText(value)
  if (!raw) return ''
  let next = raw
  for (const filler of GENERIC_GUIDE_FILLER) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    next = next.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), '').replace(/\s{2,}/g, ' ').trim()
  }
  return next
}

const clipGuideText = (value, max = GUIDE_TEXT_MAX_CHARS) => {
  const t = stripFillerPhrases(value)
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const ensureGuideSentence = (value) => {
  const t = clipGuideText(value)
  if (!t) return ''
  return /[.!?]$/.test(t) ? t : `${t}.`
}

const fallbackGuideForRow = (row) => {
  const bucket = String(row?.type || '').toLowerCase() === 'restaurant'
    ? 'restaurant'
    : String(row?.type || '').toLowerCase() === 'event'
      ? 'event'
      : 'place'
  const fallback = GUIDE_FALLBACK_BY_TYPE[bucket]
  const spot = String(row?.spot || 'This stop').trim() || 'This stop'
  const time = String(row?.time || 'Anytime').trim().toLowerCase()
  return {
    highlight: fallback.highlight,
    why: ensureGuideSentence(`${spot}: ${fallback.why}`),
    tip: ensureGuideSentence(time === 'anytime' ? fallback.tip : `${fallback.tip} Best for ${time}.`),
  }
}

const normalizeGuideFields = (row) => {
  const guideRaw = row?.guide && typeof row.guide === 'object' ? row.guide : {}
  const reasonRaw = collapseGuideText(row?.reason || '')
  const reasonParts = reasonRaw
    ? reasonRaw.split(/(?<=[.!?])\s+/).map((x) => collapseGuideText(x)).filter(Boolean)
    : []

  const fallback = fallbackGuideForRow(row)
  const highlight = clipGuideText(guideRaw.highlight, 52) || clipGuideText(reasonParts[0], 52) || fallback.highlight
  let why = ensureGuideSentence(guideRaw.why || reasonParts[0] || '')
  let tip = ensureGuideSentence(guideRaw.tip || reasonParts[1] || '')

  if (!why) why = fallback.why
  if (!tip) tip = fallback.tip

  const whyNorm = collapseGuideText(why).toLowerCase()
  const tipNorm = collapseGuideText(tip).toLowerCase()
  if (!tipNorm || tipNorm === whyNorm || whyNorm.includes(tipNorm) || tipNorm.includes(whyNorm)) {
    tip = fallback.tip
  }

  return {
    highlight: highlight || fallback.highlight,
    why: ensureGuideSentence(why) || fallback.why,
    tip: ensureGuideSentence(tip) || fallback.tip,
  }
}

const buildGuideReasonText = (guide) => {
  const why = ensureGuideSentence(guide?.why || '')
  const tip = ensureGuideSentence(guide?.tip || '')
  if (!why && !tip) return ''
  if (!why) return tip
  if (!tip) return why
  return `${why} ${tip}`
}

const enforceTourGuideReasonStructure = (plan) =>
  (Array.isArray(plan) ? plan : []).map((row) => {
    const guide = normalizeGuideFields(row)
    return {
      ...row,
      guide,
      reason: buildGuideReasonText(guide),
    }
  })

async function openAiPlanCompletion(messages, opts = {}) {
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.58
  const max_tokens = typeof opts.max_tokens === 'number' ? opts.max_tokens : 1600
  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_PLAN_MODEL,
      messages,
      temperature,
      max_tokens,
    }),
  })
  const json = await parseJsonResponse(res, 'OpenAI')
  if (!res.ok) throw new Error(json?.error?.message || `GPT error (${res.status})`)
  const raw = json?.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('Empty GPT response')
  return raw
}

const fallbackPlanTitleFromStops = (dayPlan = []) => {
  const stops = Array.isArray(dayPlan) ? dayPlan : []
  const firstSpot = String(stops[0]?.spot || '').trim()
  const firstWord = firstSpot.split(/\s+/).filter(Boolean)[0] || ''
  const anchor = firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1) : 'Bahrain'
  const hasFamilySignal = stops.some((row) => {
    const reason = String(row?.reason || '').toLowerCase()
    return reason.includes('family') || reason.includes('kids') || reason.includes('children')
  })
  const hasEvent = stops.some((row) => String(row?.type || '').toLowerCase() === 'event')
  const hasFoodHeavy = stops.filter((row) => String(row?.type || '').toLowerCase() === 'restaurant').length >= 3
  if (hasFamilySignal) return `${anchor} Family Adventure`
  if (hasEvent) return `${anchor} Lights Afterglow`
  if (hasFoodHeavy) return `${anchor} Flavor Trail`
  return `${anchor} Vibe Circuit`
}

export async function generatePlanTitleFromAI(dayPlan = [], personalization = {}) {
  const stops = (Array.isArray(dayPlan) ? dayPlan : [])
    .map((row, idx) => {
      const spot = String(row?.spot || '').trim()
      const time = String(row?.time || '').trim()
      const type = String(row?.type || '').trim()
      if (!spot) return null
      return `${idx + 1}. ${spot} (${time || 'Any time'} · ${type || 'stop'})`
    })
    .filter(Boolean)
    .slice(0, 8)

  if (!stops.length) return fallbackPlanTitleFromStops(dayPlan)

  const profileSummary =
    typeof personalization?.profileNarrative === 'string'
      ? personalization.profileNarrative.trim().slice(0, 260)
      : ''

  const viewerUType = normalizeViewerUType(personalization.viewerUType ?? personalization.userUType)
  const travelerTypeLine =
    viewerUType === 'tourist'
      ? 'Traveler type: visiting Bahrain — title should feel like a memorable trip day.'
      : 'Traveler type: Bahrain resident — title should feel like a crisp local outing.'

  const systemPrompt = `You create catchy travel plan names with personality.
Rules:
- Output only the title text (no quotes, no markdown)
- Max 4 words
- 2-4 words preferred
- Cool, stylish, and memorable
- Friendly and specific
- Sound like a real itinerary brand name
- No dates
- No emojis
- No punctuation except apostrophes
- Use proper spelling only
- Avoid typo-like or awkward words (example: "plna", "tripy", "funzzz")
- Avoid cringe phrases
- Avoid generic names like "My Plan" or "Day Plan"`

  const userPrompt = `Create a short title for this Bahrain itinerary.
${travelerTypeLine}
The title must feel catchy and full of personality:
${stops.join('\n')}
${profileSummary ? `Traveler vibe: ${profileSummary}` : ''}`

  try {
    const raw = await openAiPlanCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.6, max_tokens: 40 },
    )
    let cleaned = String(raw || '')
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64)
    cleaned = cleaned
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const words = cleaned.split(' ').filter(Boolean).slice(0, 4)
    const normalized = words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim()
    const low = normalized.toLowerCase()
    const banned = ['plna', 'tripy', 'funzzz', 'cringe', 'my plan', 'day plan', 'bahrain day plan']
    if (normalized.length >= 6 && words.length >= 2 && !banned.some((x) => low.includes(x))) {
      return normalized
    }
  } catch (e) {
    console.warn('[generatePlanTitleFromAI] fallback:', e?.message)
  }

  return fallbackPlanTitleFromStops(dayPlan)
}

/**
 * @param {object} [personalization]
 * @param {string[]} [personalization.profileGeneral] — onboarding general labels
 * @param {string[]} [personalization.profileActivity] — onboarding activity labels
 * @param {string[]} [personalization.profileFood] — onboarding food labels
 * @param {string} [personalization.profileNarrative] — AI-generated deep user summary
 * @param {{idealDay?: string, avoidList?: string}} [personalization.profileAnswers] — typed profile answers
 * @param {'nearby'|'balanced'|'wide'} [personalization.travelExplore] — how far the user will travel this session
 * @param {number} [personalization.originLat] — optional, for nearby-tier catalog ordering
 * @param {number} [personalization.originLng]
 * @param {string[]} [personalization.recentVisitedSpots] — prior itinerary venues to avoid repeating
 * @param {string[]} [personalization.strictAvoidSpots] — hard exclusion list (never repeat)
 * @param {string[]} [personalization.feedbackDownrankSpots] — thumbs-down venues (normalized client-side)
 * @param {string[]} [personalization.feedbackBoostSpots] — thumbs-up venues to prefer when still in-catalog
 * @param {string[]} [personalization.savedPostClientIds] — client_a_uuid from home-feed saved posts (catalog + model boost)
 * @param {string[]} [personalization.savedPostFeedHintNames] — display names for GPT hint line
 * @param {'local'|'tourist'} [personalization.viewerUType] — resident vs visitor tone and itinerary bias
 */
export async function generateDayPlan(
  places,
  restaurants,
  breakfastSpots,
  events,
  prefLabels,
  foodLabels,
  personalization = {},
) {
  const travelTier = normalizeTravelTier(personalization.travelExplore)
  const originLat = typeof personalization.originLat === 'number' && !Number.isNaN(personalization.originLat) ? personalization.originLat : null
  const originLng = typeof personalization.originLng === 'number' && !Number.isNaN(personalization.originLng) ? personalization.originLng : null
  const strictAvoidSet = new Set(
    uniqueRecentSpotHistory(personalization?.strictAvoidSpots)
      .map(normalizeHistorySpot)
      .filter(Boolean),
  )
  const recentVisitedSet = new Set(
    uniqueRecentSpotHistory(personalization?.recentVisitedSpots)
      .map(normalizeHistorySpot)
      .filter(Boolean),
  )
  const eventsForPlan = filterEventsForSessionRelevance(events, prefLabels, personalization)
  const feedbackDownrankSet = new Set(
    (Array.isArray(personalization.feedbackDownrankSpots) ? personalization.feedbackDownrankSpots : [])
      .map((x) => normalizePlanRankingSpotKey(x))
      .filter(Boolean),
  )
  const feedbackBoostSet = new Set(
    (Array.isArray(personalization.feedbackBoostSpots) ? personalization.feedbackBoostSpots : [])
      .map((x) => normalizePlanRankingSpotKey(x))
      .filter(Boolean),
  )
  const savedPostClientBoostSet = new Set(
    (Array.isArray(personalization.savedPostClientIds) ? personalization.savedPostClientIds : [])
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const baseMatches = selectMatchesForPlan(places, restaurants, breakfastSpots, eventsForPlan, {
    travelExplore: travelTier,
    originLat,
    originLng,
    prefLabels,
    foodLabels,
    feedbackDownrankSet,
    feedbackBoostSet,
    savedPostClientBoostSet,
  })
  const strictFilteredMatches = applyStrictAvoidWithFallback(baseMatches, personalization?.strictAvoidSpots, 12)
  const limitedMatches = applyRecentHistoryDiversity(strictFilteredMatches, personalization?.recentVisitedSpots, 12)
  const promptCatalogMatches = restorePreferenceAlignedCatalogMatches(
    limitedMatches,
    baseMatches,
    prefLabels,
    { targetAligned: 2, maxAdd: 10 },
  )
  const baseByType = baseMatches.reduce((acc, m) => {
    const t = pineconeBucketFromMatch(m)
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  const strictDropped = baseMatches
    .map((m) => primaryNameFromMatch(m))
    .filter((name) => strictAvoidSet.has(normalizeHistorySpot(name)))
  const limitedNamesSet = new Set(
    promptCatalogMatches
      .map((m) => normalizeHistorySpot(primaryNameFromMatch(m)))
      .filter(Boolean),
  )
  const recentDeprioritized = strictFilteredMatches
    .map((m) => primaryNameFromMatch(m))
    .filter((name) => {
      const n = normalizeHistorySpot(name)
      return recentVisitedSet.has(n) && !limitedNamesSet.has(n)
    })
  console.log('[generateDayPlan][selection] -----')
  console.log(
    `[generateDayPlan][selection] travelTier=${travelTier} base=${baseMatches.length} strictFiltered=${strictFilteredMatches.length} promptCatalog=${promptCatalogMatches.length}`,
  )
  console.log(
    `[generateDayPlan][selection] poolByType place=${baseByType.place || 0} restaurant=${baseByType.restaurant || 0} event=${baseByType.event || 0}`,
  )
  console.log(
    `[generateDayPlan][selection] strictAvoidInLastSavedPlan=${strictAvoidSet.size} recentHistory=${recentVisitedSet.size}`,
  )
  if (strictDropped.length) {
    console.log(
      `[generateDayPlan][selection] matchedLastSavedPlan (deprioritized/avoided unless needed): ${strictDropped
        .slice(0, 20)
        .join(' | ')}`,
    )
  }
  if (recentDeprioritized.length) {
    console.log(
      `[generateDayPlan][selection] matchedRecentHistory (deprioritized): ${recentDeprioritized
        .slice(0, 20)
        .join(' | ')}`,
    )
  }
  if (promptCatalogMatches.length !== limitedMatches.length) {
    const alignedLimited = limitedMatches.reduce(
      (n, m) => n + (preferenceAlignmentScore(m, prefLabels) > 0 ? 1 : 0),
      0,
    )
    const alignedPrompt = promptCatalogMatches.reduce(
      (n, m) => n + (preferenceAlignmentScore(m, prefLabels) > 0 ? 1 : 0),
      0,
    )
    console.log(
      `[generateDayPlan][selection] prefsAlignedRows: ${alignedLimited} → ${alignedPrompt} (re-introduced repeats when avoid/history left no "${prefLabels.slice(0, 4).join(', ')}" options)`,
    )
  }

  const placesText = promptCatalogMatches.map((m, i) => formatMatchForPrompt(m, i, originLat, originLng)).join('\n')
  const catalogLower = catalogNameList(promptCatalogMatches).map((n) => normalizeSpot(n))

  const hasPref = prefLabels.length > 0
  const hasFood = foodLabels.length > 0
  const hasEvents = eventsForPlan.length > 0
  const personaSummary =
    typeof personalization?.profileNarrative === 'string' ? personalization.profileNarrative.trim() : ''
  const hasPersonaSummary = personaSummary.length > 0

  if (!hasPref || !hasFood) {
    console.log(
      `[generateDayPlan] preference fallback: activitiesSelected=${hasPref} foodSelected=${hasFood} personaSummaryUsed=${hasPersonaSummary}`,
    )
  }

  const profileSection = buildProfileSection(personalization)
  const viewerUType = normalizeViewerUType(personalization.viewerUType ?? personalization.userUType)
  const audienceSection = buildAudienceGuideLines(viewerUType)
  const historySection = buildHistorySection(personalization)
  const inferred = inferPreferenceSignals(personalization)
  const travelBlock = buildTravelExploreBlock(personalization)

  const pacingAudienceLine =
    viewerUType === 'tourist'
      ? 'Keep pacing realistic for visitors (comfortable transitions, no rushed cross-island jumps)'
      : 'Keep pacing efficient for a resident who knows the island (still no pointless cross-island zig-zags)'

  const systemPrompt = `You are Khalid, a friendly Bahraini local guide creating a practical full-day Bahrain itinerary.

You are given ${promptCatalogMatches.length} real catalog rows (places, restaurants, events). Use ONLY these rows.

${profileSection}

${audienceSection}

${historySection}

${travelBlock}

Core requirements:
1) Include at least 6 stops total:
   - Breakfast (Morning, restaurant)
   - Lunch (Afternoon, restaurant)
   - Dinner (Evening, restaurant)
   - At least 3 place visits across Morning/Afternoon/Evening
2) Nearby/balanced days: usually 6-7 stops. Wide days with strong catalog: up to 9 stops.
3) Never skip breakfast.

Session preferences (HARD CONSTRAINTS — strictly enforced, not loose suggestions):
${hasPref
  ? `- Activities (STRICT — every place stop must match): ${prefLabels.join(', ')}. EVERY non-restaurant stop in this plan MUST belong to one of these selected categories. Example: if "Beach" is selected, only beach/coastal/waterfront/seaside venues qualify as place stops — never museums, malls, or unrelated attractions. If "Museum" is selected, only museums and galleries qualify. Exclude any catalog row that does not clearly match the selected activity type. This is a hard filter, not a suggestion.`
  : hasPersonaSummary
    ? '- Activities: none selected this session; infer activity style from persona summary first, then provide a balanced mix (culture, sightseeing, nature, shopping).'
    : '- Activities: none selected this session; provide a balanced mix (culture, sightseeing, nature, shopping).'}
${hasFood
  ? `- Food (STRICT): ${foodLabels.join(', ')} — use ONLY restaurants whose catalog row shows a matching Cuisine/Type (today's chips are hard constraints; do not substitute e.g. Japanese/Thai/Lebanese unless that chip was explicitly selected). Include at least one clear match per selected food type when available.`
  : hasPersonaSummary
    ? '- Food: none selected this session; infer dining style from persona summary first, while keeping meal choices varied.'
    : '- Food: none selected this session; keep meal choices varied.'}

Events:
${hasEvents
  ? `- [EVENT] rows are real happenings today — but they are OPTIONAL, not trophies to collect.
- Add an event only when its EventType/name/description clearly fits TODAY'S activity persona (session chips + persona block) AND it fits geography + pacing. If nothing fits well, omit events entirely — do NOT force an unrelated expo, expo hall, workshop, etc.
- Respect StartTime/EndTime strictly; never schedule an event outside its time window.
- In "guide.why"/"reason", say specifically why THIS event suits their day (never generic "something is on").`
  : '- No on-theme events in this catalog slice — build only from places and restaurants.'}

Routing rules (hard constraints):
${originLat != null && originLng != null
  ? `- Start near user origin (${originLat.toFixed(4)}, ${originLng.toFixed(4)}). DistFromUserKm is available; keep the route tight.`
  : '- GPS unavailable: use catalog Lat/Lng and Area to keep one coherent geographic flow.'}
- Morning: breakfast first, then nearby visit(s) — all Morning stops should cluster in the same area
- Afternoon: lunch first (anchor the afternoon location), then nearby visit(s) — all Afternoon stops cluster near lunch
- Evening: visit(s) then dinner (or dinner then short stroll if event timing requires) — all Evening stops cluster together
- CRITICAL: Never create a route that goes A → B → back near A → C. Each successive stop must be closer to the next destination, never doubling back
- Consecutive stops must be within ~${Math.round((TRAVEL_TIER_GEO[travelTier]?.radiusKm || 15) * 0.6)} km of each other
- Prefer two nearby good options over one far option — a slightly weaker venue nearby always beats a great venue far away that causes backtracking
- Group geographically: pick spots that naturally cluster, not random island-wide scatter
- If preference conflict occurs, prioritize geographic coherence and mention the trade-off briefly in "reason"

Quality rules:
- Catalogue tags VenueKind: Food truck or snack-style ServingNotes must be echoed honestly in reasons (casual, often quick bites) — do not imply white-tablecloth dining when ServingSlots imply snacks only.
- Never recommend a closed/unavailable venue
- Respect opening windows and event timing
- Avoid redundant similar stops
- Balance indoor/outdoor and budget naturally
- ${pacingAudienceLine}
- Every "spot" must match a catalog name exactly (verbatim from row name)
- Copy lat/lng exactly from that same catalog row
- Add backupOptions: 1-2 nearby alternatives when possible

Output:
- Return ONLY a valid JSON array
- Each row must include:
  "spot", "time" (Morning|Afternoon|Evening), "type" (place|restaurant|event), "lat", "lng",
  "guide" object with:
    "highlight" (2-6 words),
    "why" (one concise sentence, max ~140 chars),
    "tip" (one concise practical sentence, max ~140 chars),
  plus "backupOptions" (array), "estimatedStopBudget"
- Also include "reason" as one compact sentence pair combining why+tip (for compatibility)
- Optional: "hiddenGem": true for up to 2 suitable lesser-known stops
- Keep guide text short, useful, and specific (no generic filler and no labels like "Stop 1")

Personalization signals:
- Group type: ${inferred.groupType || 'unspecified'}
- Pace: ${inferred.pacePreference || 'unspecified'}
- Budget: ${inferred.budgetLevel || 'unspecified'}

Important geo safety: Bahrain lat ~26, lng ~50. Never swap lat/lng.

Return only JSON array, no markdown:
[
  {
    "spot": "Name",
    "time": "Morning",
    "type": "restaurant",
    "lat": 26.xxx,
    "lng": 50.xxx,
    "guide": { "highlight": "Local breakfast", "why": "...", "tip": "..." },
    "reason": "..."
  }
]`;

  const savedFeedHints = (Array.isArray(personalization.savedPostFeedHintNames)
    ? personalization.savedPostFeedHintNames
    : []
  )
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 12)
  const savedPostsPreferencesLine =
    savedFeedHints.length > 0
      ? `💾 Home feed saves — the user bookmarked posts from these venues; strongly prefer including at least one when the catalog, today’s strict activity/food rules, and routing still allow: ${savedFeedHints.join('; ')}.`
      : ''

  const userMsg = `${viewerUType === 'tourist' ? '🧭 Visitor mode: smooth routing and light orientation when helpful.' : '🏠 Local mode: insider-feel picks; skip lengthy introductions to obvious sights.'}
🚗 Travel willingness this session: ${travelTier} (nearby = stay local; balanced = mix; wide = island-wide when worth it).
${savedPostsPreferencesLine ? `${savedPostsPreferencesLine}\n` : ''}${hasPref ? `🎯 Today’s activity preferences (STRICT — place stops must ONLY match these types): ${prefLabels.join(', ')}` : '🎯 Today: no activity prefs — diverse mix'}
${hasFood ? `🍽️ Today’s food types: ${foodLabels.join(', ')} — each meal must use catalogue rows whose Cuisine line matches one of these types (no substitutes).` : hasPersonaSummary ? '🍽️ Today: open on food — personalize from persona summary' : '🍽️ Today: open on food'}

Catalog (${promptCatalogMatches.length} rows):
${placesText}

Build Khalid’s perfect personalized day. Minimum 3 meals + 3 places.
If catalog has matching [EVENT] rows and one truly fits today's theme AND timing/route, include at most 1–2 — otherwise skip events; never add filler.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ]

  const tokenBudget = travelTier === 'wide' ? 1800 : 1600
  let raw = await openAiPlanCompletion(messages, { max_tokens: tokenBudget })
  let plan = topUpPlanToMinimumStops(parsePlanFromRaw(raw), promptCatalogMatches, 6)
  let validation = plan ? validatePlan(plan, catalogLower) : { ok: false, reason: 'Parse failed' }

  if (!validation.ok) {
    const repairUser = `Your previous reply was invalid: ${validation.reason}

Return ONLY a valid JSON array. Each "spot" must match a name from the catalog (exact string from the start of a catalog line before " | ").

Catalog names for reference:
${catalogNameList(promptCatalogMatches).slice(0, 40).join('\n')}`
    messages.push({ role: 'assistant', content: raw })
    messages.push({ role: 'user', content: repairUser })
    raw = await openAiPlanCompletion(messages, { max_tokens: tokenBudget })
    plan = topUpPlanToMinimumStops(parsePlanFromRaw(raw), promptCatalogMatches, 6)
    validation = plan ? validatePlan(plan, catalogLower) : { ok: false, reason: 'Parse failed on retry' }
    if (!validation.ok) throw new Error(validation.reason || 'Could not parse day plan')
  }

  const optimized = optimizePlanRoute(plan, originLat, originLng)
  const finalPlan = annotatePlanLegDurations(optimized)
  const guidedPlan = enforceTourGuideReasonStructure(finalPlan)
  console.log(`[generateDayPlan][selected] totalStops=${guidedPlan.length}`)
  guidedPlan.forEach((row, idx) => {
    const n = normalizeHistorySpot(row?.spot)
    const fromLastSaved = n ? strictAvoidSet.has(n) : false
    const fromRecent = n ? recentVisitedSet.has(n) : false
    console.log(
      `[generateDayPlan][selected][${idx + 1}] ${row?.time || 'Unknown'} | ${row?.type || 'unknown'} | ${row?.spot || 'Unknown'} | fromLastSaved=${fromLastSaved} fromRecent=${fromRecent} | why=${row?.reason || 'no reason'}`,
    )
  })
  return guidedPlan
}

function pineconeBucketFromMatch(m) {
  const meta = m?.metadata || {}
  const rt = String(meta.record_type || '').trim().toLowerCase()
  if (rt === 'event') return 'event'
  if (meta.event_name && (meta.start_time != null || meta.start_date != null)) return 'event'

  const ct = String(meta.client_type || meta.clientType || '').trim().toLowerCase()
  const placeTags = new Set([
    'place',
    'attraction',
    'sightseeing',
    'landmark',
    'shopping',
    'mall',
    'beach',
    'park',
    'museum',
    'culture',
    'cultural',
    'hotel',
    'resort',
  ])
  const foodTags = new Set([
    'restaurant',
    'food',
    'dining',
    'cafe',
    'café',
    'coffee',
    'bakery',
    'eatery',
    'bar',
    'bistro',
  ])
  if (placeTags.has(ct)) return 'place'
  if (foodTags.has(ct)) return 'restaurant'

  const typeHint = String(meta.type || meta.venue_type || meta.kind || '').toLowerCase()
  if (
    typeHint.includes('museum') ||
    typeHint.includes('heritage') ||
    typeHint.includes('mosque') ||
    typeHint.includes('fort') ||
    typeHint.includes('gallery')
  ) {
    return 'place'
  }

  if (
    typeHint.includes('restaurant') ||
    typeHint.includes('dining') ||
    typeHint.includes('cafe') ||
    typeHint.includes('café') ||
    typeHint.includes('food court') ||
    typeHint.includes('bakery')
  ) {
    return 'restaurant'
  }

  if (meta.cuisine || meta.cuisine_type || meta.meal_type || meta.mealType) return 'restaurant'

  return 'place'
}

/** Larger Pinecone slice for “Enhance” when the normal catalog is empty or fully overlaps the plan. */
async function fetchWideCandidatesForEnhanceSlot(slotType) {
  if (slotType !== 'place' && slotType !== 'restaurant' && slotType !== 'event') return []
  const text =
    slotType === 'restaurant'
      ? 'Diverse restaurants, cafés, and dining across Bahrain'
      : slotType === 'event'
        ? 'Events, festivals, exhibitions, and activities in Bahrain'
        : 'Museums, landmarks, beaches, malls, and things to do in Bahrain'
  try {
    const embedding = await getEmbedding(text)
    if (slotType === 'event') {
      const rows = await queryPineconeSafe(embedding, 80, { record_type: { $eq: 'event' } })
      const todayIso = getTodayIsoInBahrain()
      return rows.filter((m) => eventIsForTodayInBahrain(m, todayIso))
    }
    if (slotType === 'restaurant') {
      let rows = await queryPineconeSafe(embedding, 80, {
        record_type: { $eq: 'client' },
        client_type: { $eq: 'restaurant' },
      })
      if (rows.length === 0) {
        rows = await queryPineconeSafe(embedding, 80, { client_type: { $eq: 'restaurant' } })
      }
      if (rows.length === 0) {
        const broad = await queryPineconeSafe(embedding, 96, { record_type: { $eq: 'client' } })
        rows = broad.filter((match) => pineconeBucketFromMatch(match) === 'restaurant')
      }
      return rows
    }
    let rows = await queryPineconeSafe(embedding, 80, {
      record_type: { $eq: 'client' },
      client_type: { $eq: 'place' },
    })
    if (rows.length === 0) {
      const all = await queryPineconeSafe(embedding, 96, { record_type: { $eq: 'client' } })
      rows = all.filter((match) => pineconeBucketFromMatch(match) === 'place')
    }
    return rows
  } catch (e) {
    console.warn('[enhancePlanStopAtIndex] wide Pinecone query failed:', e?.message)
    return []
  }
}

const parseSingleStopFromRaw = (raw) => {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  try {
    const p = JSON.parse(trimmed)
    if (Array.isArray(p) && p[0] && typeof p[0] === 'object') return p[0]
    if (p && typeof p === 'object' && p.spot) return p
  } catch (_) {
    /* fall through */
  }
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const p = JSON.parse(jsonMatch[0])
    if (p && p.spot) return p
  } catch (_) {
    return null
  }
  return null
}

const validateReplacementStop = (row, catalogLower, slot, excludedExactSet) => {
  if (!row || typeof row !== 'object') return { ok: false, reason: 'Invalid object' }
  const { spot, time, type, lat, lng } = row
  if (!spot || !time || !type) return { ok: false, reason: 'Missing spot/time/type' }
  if (time !== slot.time || type !== slot.type) return { ok: false, reason: 'time/type must match original slot' }
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return { ok: false, reason: 'Missing lat/lng' }
  }
  if (!spotMatchesCatalog(spot, catalogLower)) return { ok: false, reason: 'spot not in catalog' }
  const s = normalizeSpot(spot)
  if (excludedExactSet.has(s)) return { ok: false, reason: 'spot already used elsewhere in plan' }
  const oldNorm = normalizeSpot(slot.spot)
  if (s === oldNorm) return { ok: false, reason: 'must pick a different venue than the current stop' }
  return { ok: true }
}

function coordsFromPineconeMatch(m) {
  const meta = m?.metadata || {}
  const fromMeta = getLatLng(meta)
  if (fromMeta) return fromMeta
  return getLatLng(m)
}

function mergeCatalogForEnrich(fetched, pineconeMatches) {
  return dedupeSortedByScore([...(fetched || []), ...(pineconeMatches || [])])
}

function pickFallbackReplacementFromMatches(candidates, slot, excludedExactSet) {
  const slotNorm = normalizeSpot(slot.spot)
  const ordered = dedupeSortedByScore(candidates)
  for (const m of ordered) {
    const name = primaryNameFromMatch(m)
    const nn = normalizeSpot(name)
    if (!nn || nn === slotNorm) continue
    if (excludedExactSet.has(nn)) continue
    const ll = coordsFromPineconeMatch(m)
    if (!ll) continue
    return {
      spot: name,
      time: slot.time,
      type: slot.type,
      lat: ll.lat,
      lng: ll.lng,
      reason: `Swapped in from your picks — fits your ${slot.time.toLowerCase()} and keeps the day flowing, yalla!`,
    }
  }
  return null
}

/**
 * Replace one plan stop (same time + type). Fetches a fresh type-specific catalog:
 * - place → fetchPlaces(session activity prefs + saved profile activities)
 * - restaurant → fetchRestaurants(session food + profile food)
 * - event → fetchEvents(session + profile activities)
 *
 * Returns { replacement, enrichCatalog } so the client can enrich images/coords against merged Pinecone rows.
 */
export async function enhancePlanStopAtIndex(
  plan,
  stopIndex,
  pineconeMatches,
  prefLabels,
  foodLabels,
  personalization = {},
) {
  if (!Array.isArray(plan) || stopIndex < 0 || stopIndex >= plan.length) {
    throw new Error('Invalid stop index')
  }
  const slot = plan[stopIndex]
  if (!slot || !slot.type || !slot.time) throw new Error('Invalid stop data')

  const excludedExact = new Set(
    plan
      .filter((_, i) => i !== stopIndex)
      .map((p) => normalizeSpot(p.spot))
      .filter(Boolean),
  )

  const sessionActivity = Array.isArray(prefLabels) ? prefLabels.filter(Boolean) : []
  const sessionFood = Array.isArray(foodLabels) ? foodLabels.filter(Boolean) : []
  const profileActivity = Array.isArray(personalization.profileActivity)
    ? personalization.profileActivity.filter(Boolean)
    : []
  const profileFood = Array.isArray(personalization.profileFood) ? personalization.profileFood.filter(Boolean) : []
  const profileNarrative =
    typeof personalization?.profileNarrative === 'string' ? personalization.profileNarrative : ''
  const retrievalOpts = {
    profileNarrative,
    profileAnswers:
      personalization.profileAnswers && typeof personalization.profileAnswers === 'object'
        ? personalization.profileAnswers
        : {},
  }

  let fetched = []
  try {
    if (slot.type === 'place') {
      const labels = [...new Set([...sessionActivity, ...profileActivity])]
      fetched = await fetchPlaces(labels, retrievalOpts)
    } else if (slot.type === 'restaurant') {
      const labels = [...new Set([...sessionFood, ...profileFood])]
      fetched = await fetchRestaurants(labels, retrievalOpts)
    } else if (slot.type === 'event') {
      const labels = [...new Set([...sessionActivity, ...profileActivity])]
      fetched = await fetchEvents(labels, retrievalOpts)
    }
  } catch (e) {
    console.warn('[enhancePlanStopAtIndex] catalog fetch failed:', e?.message)
    fetched = []
  }

  const slotNorm = normalizeSpot(slot.spot)

  const buildCandidatesFromPool = (pool) =>
    (pool || []).filter((m) => {
      if (pineconeBucketFromMatch(m) !== slot.type) return false
      const name = normalizeSpot(primaryNameFromMatch(m))
      if (!name || name === slotNorm) return false
      if (excludedExact.has(name)) return false
      if (!coordsFromPineconeMatch(m)) return false
      return true
    })

  const typeFiltered = (fetched || []).filter((m) => pineconeBucketFromMatch(m) === slot.type)
  const fallbackPool = (pineconeMatches || []).filter((m) => pineconeBucketFromMatch(m) === slot.type)
  const catalogSource = dedupeSortedByScore([...typeFiltered, ...fallbackPool])

  let candidates = buildCandidatesFromPool(catalogSource)

  if (candidates.length === 0 && slot.type === 'place') {
    try {
      const broad = await fetchPlaces([], retrievalOpts)
      fetched = mergeCatalogForEnrich(broad, fetched)
      candidates = buildCandidatesFromPool(broad)
    } catch (_) {
      /* ignore */
    }
  }

  if (candidates.length === 0 && slot.type === 'restaurant') {
    try {
      const broad = await fetchRestaurants([], retrievalOpts)
      fetched = mergeCatalogForEnrich(broad, fetched)
      candidates = buildCandidatesFromPool(broad)
    } catch (_) {
      /* ignore */
    }
  }

  if (candidates.length === 0 && slot.type === 'event') {
    try {
      const broad = await fetchEvents([], retrievalOpts)
      fetched = mergeCatalogForEnrich(broad, fetched)
      candidates = buildCandidatesFromPool(broad)
    } catch (_) {
      /* ignore */
    }
  }

  if (candidates.length === 0) {
    const wide = await fetchWideCandidatesForEnhanceSlot(slot.type)
    fetched = mergeCatalogForEnrich(wide, fetched)
    candidates = buildCandidatesFromPool(wide)
  }

  if (candidates.length === 0) {
    let slotLL = unswapLatLngPipeline(slot.lat, slot.lng)
    if (!slotLL) slotLL = { lat: 26.22, lng: 50.58 }
    const pool = dedupeSortedByScore([...(fetched || []), ...(pineconeMatches || [])])
    const synth = []
    for (const m of pool) {
      if (pineconeBucketFromMatch(m) !== slot.type) continue
      const name = normalizeSpot(primaryNameFromMatch(m))
      if (!name || name === slotNorm || excludedExact.has(name)) continue
      if (coordsFromPineconeMatch(m)) continue
      synth.push({
        ...m,
        metadata: {
          ...(m.metadata || {}),
          lat: String(slotLL.lat),
          long: String(slotLL.lng),
        },
      })
      if (synth.length >= 32) break
    }
    if (synth.length > 0) {
      candidates = synth
      fetched = mergeCatalogForEnrich(synth, fetched)
    }
  }

  if (candidates.length === 0) {
    const mockRows = getMockDayPlan().filter((row) => {
      if (!row || row.type !== slot.type) return false
      const n = normalizeSpot(row.spot)
      if (!n || n === slotNorm || excludedExact.has(n)) return false
      return unswapLatLngPipeline(row.lat, row.lng) != null
    })
    if (mockRows.length > 0) {
      candidates = mockRows.map((row, i) => ({
        id: `mock-enhance-${slot.type}-${i}`,
        score: 0,
        metadata: {
          record_type: slot.type === 'event' ? 'event' : 'client',
          client_type: slot.type === 'restaurant' ? 'restaurant' : slot.type === 'place' ? 'place' : undefined,
          business_name: row.spot,
          name: row.spot,
          lat: String(row.lat),
          long: String(row.lng),
        },
      }))
      fetched = mergeCatalogForEnrich(candidates, fetched)
    }
  }

  if (candidates.length === 0) {
    throw new Error('No alternative venues available for this stop. Try building a new day or pick different preferences.')
  }

  const enrichCatalog = mergeCatalogForEnrich(fetched, pineconeMatches)

  const capped = dedupeSortedByScore(candidates).slice(0, 24)
  const placesText = capped.map((m, i) => formatMatchForPrompt(m, i)).join('\n')
  const catalogLower = catalogNameList(capped).map((n) => normalizeSpot(n))
  const profileSection = buildProfileSection(personalization)
  const viewerUType = normalizeViewerUType(personalization.viewerUType ?? personalization.userUType)
  const audienceSection = buildAudienceGuideLines(viewerUType)

  const prefLine =
    slot.type === 'place'
      ? `User activity preferences (places must fit this vibe): ${[...sessionActivity, ...profileActivity].join(', ') || 'diverse Bahrain places'}.`
      : slot.type === 'restaurant'
        ? `User food preferences: ${[...sessionFood, ...profileFood].join(', ') || 'varied dining'}.`
        : `User interests for events: ${[...sessionActivity, ...profileActivity].join(', ') || 'things to do in Bahrain'}.`

  const systemPrompt = `You are Khalid, a friendly Bahraini local. Pick ONE replacement stop for an existing day plan.

${profileSection}

${audienceSection}

${prefLine}

RULES:
- Reply ONLY with a single JSON object (not an array, no markdown): spot, time, type, lat, lng, guide, reason
- "spot" must be copied EXACTLY from the start of one catalog line (before the first " | ")
- "time" MUST be exactly: "${slot.time}"
- "type" MUST be exactly: "${slot.type}"
- lat and lng MUST be copied EXACTLY from the same catalog line as the chosen spot
- "guide": { "highlight": short phrase, "why": one sentence, "tip": one sentence }
- "reason": one compact compatibility string that combines why + tip.
- MUST be a different venue than "${slot.spot}" (exact catalog name different).
- Do not duplicate any "Other stops" name exactly.`

  const otherNames = plan.filter((_, i) => i !== stopIndex).map((p) => p.spot).join('; ')
  const userMsg = `Current stop to REPLACE (same time/type, new venue only):
- spot: "${slot.spot}"
- time: ${slot.time}
- type: ${slot.type}

Other stops already in the day (do not duplicate): ${otherNames || '(none)'}

Catalog:
${placesText}

Return ONE JSON object for the replacement.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ]

  let raw = await openAiPlanCompletion(messages, { temperature: 0.42, max_tokens: 700 })
  let row = parseSingleStopFromRaw(raw)
  let validation = row ? validateReplacementStop(row, catalogLower, slot, excludedExact) : { ok: false, reason: 'Parse failed' }

  if (!validation.ok) {
    const repairUser = `Invalid reply: ${validation.reason}

Return ONLY one JSON object with keys spot, time, type, lat, lng, guide, reason.
time="${slot.time}", type="${slot.type}".
spot must be an EXACT catalog name from the list below (before " | "):
${catalogNameList(capped).join('\n')}`
    messages.push({ role: 'assistant', content: raw })
    messages.push({ role: 'user', content: repairUser })
    raw = await openAiPlanCompletion(messages, { temperature: 0.35, max_tokens: 700 })
    row = parseSingleStopFromRaw(raw)
    validation = row ? validateReplacementStop(row, catalogLower, slot, excludedExact) : { ok: false, reason: 'Parse failed on retry' }
  }

  if (!validation.ok) {
    const fb = pickFallbackReplacementFromMatches(candidates, slot, excludedExact)
    if (!fb) throw new Error(validation.reason || 'Could not pick a replacement stop')
    row = fb
  }

  const replacementGuide = normalizeGuideFields(row)
  return {
    replacement: {
      spot: row.spot,
      time: row.time,
      type: row.type,
      lat: Number(row.lat),
      lng: Number(row.lng),
      guide: replacementGuide,
      reason: buildGuideReasonText(replacementGuide) || 'A fresh pick for your day — yalla!',
    },
    enrichCatalog,
  }
}
