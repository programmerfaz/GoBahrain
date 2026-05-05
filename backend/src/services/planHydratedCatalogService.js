import { createEmbedding } from './embeddingService.js'
import { pineconeQuery } from './pineconeService.js'
import {
  fetchClientsByIdsUnion,
  fetchEventsByIdsUnion,
  fetchRestaurantClientByAuuidsUnion,
} from './supabaseService.js'
import { pickClientIdFromMatch, pickEventIdFromMatch } from './ragRetrievalService.js'

const BAHRAIN_TZ = 'Asia/Bahrain'

const getTodayIsoInBahrain = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BAHRAIN_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
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

const eventIsForTodayInBahrain = (match, todayIso = getTodayIsoInBahrain()) => {
  const meta = match?.metadata || {}
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

const normMatches = (rows) =>
  (rows || []).map((m) => ({
    id: m.id,
    score: typeof m.score === 'number' ? m.score : Number(m.score) || 0,
    metadata: { ...(m.metadata || {}) },
  }))

function mergeClientHydration(match, rowMap, restaurantClientMap = null) {
  const pid = pickClientIdFromMatch(match)
  const row = pid ? rowMap.get(pid) : null
  const meta = { ...(match.metadata || {}) }
  meta.record_type = 'client'
  const rcRow = pid && restaurantClientMap ? restaurantClientMap.get(pid) : null
  if (rcRow) {
    const ft = rcRow.isfoodtruck === true || rcRow.isfoodtruck === 'true'
    meta.isfoodtruck = ft
    if (rcRow.meal_type != null && String(rcRow.meal_type).trim() !== '')
      meta.restaurant_meal_type = String(rcRow.meal_type).trim()
    if (rcRow.food_type != null && String(rcRow.food_type).trim() !== '')
      meta.restaurant_food_type = String(rcRow.food_type).trim()
  }
  if (!row) return { ...match, metadata: meta }
  meta.client_a_uuid = row.client_a_uuid ?? meta.client_a_uuid
  meta.business_name = row.business_name ?? meta.business_name
  meta.place_name = meta.place_name || meta.business_name
  const parts = []
  if (row.ai_summary != null && String(row.ai_summary).trim()) parts.push(String(row.ai_summary).trim())
  if (row.description != null && String(row.description).trim()) parts.push(String(row.description).trim())
  const mergedDesc = parts.join(' — ')
  if (mergedDesc) meta.description = mergedDesc.slice(0, 900)
  meta.client_type = row.client_type ?? meta.client_type
  meta.rating = row.rating ?? meta.rating
  meta.price_range = row.price_range ?? meta.price_range
  if (row.timings != null && String(row.timings).trim()) meta.timings = String(row.timings).trim()
  if (row.tags != null) meta.tags = row.tags
  if (row.lat != null && String(row.lat).trim() !== '') meta.lat = row.lat
  if (row.long != null && String(row.long).trim() !== '') meta.long = row.long
  return { ...match, metadata: meta }
}

function mergeEventHydration(match, rowMap) {
  const eid = pickEventIdFromMatch(match)
  const row = eid ? rowMap.get(eid) : null
  const meta = { ...(match.metadata || {}) }
  meta.record_type = 'event'
  if (!row) return { ...match, metadata: meta }
  meta.event_uuid = row.event_uuid ?? meta.event_uuid
  meta.event_name = row.event_name ?? meta.event_name
  meta.venue = row.venue ?? meta.venue
  meta.event_type = row.event_type ?? meta.event_type
  meta.status = row.status ?? meta.status
  meta.indoor_outdoor = row.indoor_outdoor ?? meta.indoor_outdoor
  meta.start_date = row.start_date ?? meta.start_date
  meta.end_date = row.end_date ?? meta.end_date
  meta.start_time = row.start_time ?? meta.start_time
  meta.end_time = row.end_time ?? meta.end_time
  if (row.lat != null && String(row.lat).trim() !== '') meta.lat = row.lat
  if (row.long != null && String(row.long).trim() !== '') meta.long = row.long
  return { ...match, metadata: meta }
}

const LIMITS = { places: 28, restaurants: 24, breakfast: 8, events: 14 }

const COASTAL_LABEL_HINTS = ['beach', 'beaches', 'seaside', 'waterfront', 'waterfronts', 'sea', 'coast', 'corniche']
const COASTAL_TEXT_HINTS = ['beach', 'seaside', 'waterfront', 'sea', 'coast', 'bay', 'corniche', 'marina', 'shore', 'island']

const haystackLowerForEventAlignment = (m) => {
  const meta = m?.metadata || {}
  const parts = [
    meta.event_name,
    meta.business_name,
    meta.name,
    meta.place_name,
    meta.event_type,
    meta.description,
    meta.venue,
    meta.area,
    meta.indoor_outdoor,
  ]
  return parts
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => String(v || '').toLowerCase())
    .join(' | ')
}

const hasCoastalIntent = (labels) => {
  const joined = (labels || []).map((x) => String(x || '').toLowerCase()).join(' | ')
  if (!joined) return false
  return COASTAL_LABEL_HINTS.some((hint) => joined.includes(hint))
}

/** Same idea as app `preferenceAlignmentScore` — drop off-theme today's events when user gave concrete chips/profileActivity. */
const eventAlignmentScore = (match, labelSources) => {
  const labels = (labelSources || [])
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
  if (!match || !labels.length) return 0
  const hay = haystackLowerForEventAlignment(match)
  let score = 0
  for (const label of labels) {
    if (hay.includes(label)) score += 3
    const labelParts = label.split(/[\s/&,-]+/).filter((p) => p.length >= 4)
    for (const p of labelParts) {
      if (hay.includes(p)) score += 1
    }
  }
  if (hasCoastalIntent(labels)) {
    for (const hint of COASTAL_TEXT_HINTS) {
      if (hay.includes(hint)) score += 4
    }
  }
  return score
}

const pineconeScore = (m) => {
  const s = m?.score
  return typeof s === 'number' && !Number.isNaN(s) ? s : -Number.MAX_VALUE
}

/** Mirror app `RESTAURANT_UI_TO_PINECONE_CUISINE` for post-filtering hydrated restaurant rows */
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
}

const mapUiFoodLabelToPinecone = (label) => {
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

const expandAllowedRestaurantTokens = (base) => {
  const o = new Set(base)
  if (o.has('cafe')) {
    ['coffee', 'bakery', 'patisserie', 'desserts', 'brunch', 'tea'].forEach((x) => o.add(x))
  }
  if (o.has('japanese')) {
    o.add('korean')
  }
  return o
}

const buildAllowedHydratedRestaurantCuisineSet = (foodLabels) =>
  expandAllowedRestaurantTokens(
    new Set(
      (Array.isArray(foodLabels) ? foodLabels : [])
        .map((l) => mapUiFoodLabelToPinecone(l).toLowerCase())
        .filter(Boolean),
    ),
  )

const filterHydratedRestaurantsByFoodWhitelist = (rows, foodLabels) => {
  const list = Array.isArray(rows) ? rows : []
  const chips = (Array.isArray(foodLabels) ? foodLabels : []).map((x) => String(x || '').trim()).filter(Boolean)
  if (!list.length || !chips.length) return list

  const allowed = buildAllowedHydratedRestaurantCuisineSet(chips)
  const filtered = list.filter((m) => {
    const c = String(m.metadata?.cuisine_type || m.metadata?.cuisine || '')
      .trim()
      .toLowerCase()
    return Boolean(c && allowed.has(c))
  })

  if (filtered.length === 0 && list.length > 0) {
    console.warn(
      '[hydrated-catalog] food-label cuisine filter removed all restaurants; returning unfiltered slice (audit venue cuisine_metadata)',
    )
    return list
  }

  return filtered.sort((a, b) => pineconeScore(b) - pineconeScore(a))
}

const filterHydratedEventsForPrefs = (events, preferenceLabels, profileActivityLines) => {
  const list = Array.isArray(events) ? events : []
  if (!list.length) return []

  const chips = (preferenceLabels || [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
  const act = (profileActivityLines || [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 10)

  let sources = chips.length ? chips : act
  if (!sources.length) return [...list].sort((a, b) => pineconeScore(b) - pineconeScore(a))

  const aligned = list.filter((m) => eventAlignmentScore(m, sources) > 0)
  return aligned.sort((a, b) => pineconeScore(b) - pineconeScore(a))
}

const clipPersona = (s) => {
  const t = typeof s === 'string' ? s.trim() : ''
  if (!t) return ''
  return t.length > 720 ? `${t.slice(0, 720).trim()}…` : t
}

const structuredAnswersSnippetHydrated = (profileAnswers) => {
  const a = profileAnswers && typeof profileAnswers === 'object' ? profileAnswers : {}
  const push = (label, raw, parts) => {
    const v = raw == null ? '' : String(raw).trim()
    if (!v) return
    parts.push(`${label}: ${v}`)
  }
  const parts = []
  push('Home country', a.homeCountry, parts)
  push('Trip days', a.tripLengthDays, parts)
  push('Travels as', a.travelParty, parts)
  push('Budget', a.budgetBand, parts)
  push('Dietary & hard nos', a.dietaryHardNos, parts)
  push('Mobility', a.mobilityNotes, parts)
  push('Heat sensitivity', a.heatSensitivity, parts)
  push('Trip intent notes', a.sessionIntentDay, parts)
  if (!parts.length) return ''
  const joined = parts.join(' · ')
  if (joined.length <= 280) return joined
  return `${joined.slice(0, 279).trim()}…`
}

const buildTravellerEmbedTail = (personaClip, profileAnswers) => {
  const structured = structuredAnswersSnippetHydrated(profileAnswers)
  const bits = []
  if (personaClip) bits.push(personaClip)
  if (structured) bits.push(`Profile facts — ${structured}`)
  if (!bits.length) return ''
  return bits.join(' · ')
}

const embedWithTravellerContext = (core, tail) => (tail ? `${core} Traveller context: ${tail}` : core)

/**
 * Pinecone retrieval (4 buckets) + Supabase hydration for AI Plan catalog.
 * Returns match objects shaped like the app’s Pinecone rows (id, score, metadata).
 */
export async function buildHydratedPlanCatalog(body = {}) {
  const preferenceLabels = Array.isArray(body.preferenceLabels) ? body.preferenceLabels : []
  const profileActivityLines = Array.isArray(body.profileActivity) ? body.profileActivity : []
  const foodLabels = Array.isArray(body.foodLabels) ? body.foodLabels : []
  const profileNarrative = typeof body.profileNarrative === 'string' ? body.profileNarrative.trim() : ''
  const profileAnswers =
    body.profileAnswers && typeof body.profileAnswers === 'object' ? body.profileAnswers : {}

  const personaClip = clipPersona(profileNarrative)
  const travellerTail = buildTravellerEmbedTail(personaClip, profileAnswers)
  const ex = (core) => embedWithTravellerContext(core, travellerTail)

  const placesCore =
    preferenceLabels.length > 0
      ? `Places in Bahrain for ${preferenceLabels.map((x) => String(x).trim()).filter(Boolean).join(', ')}`
      : 'Popular places and things to do in Bahrain'
  const foodsCore =
    foodLabels.length > 0
      ? `Restaurants in Bahrain serving ${foodLabels.map((x) => String(x).trim()).filter(Boolean).join(', ')}`
      : 'Best restaurants and food spots in Bahrain'
  const eventsCore =
    preferenceLabels.length > 0
      ? `Events in Bahrain related to ${preferenceLabels.map((x) => String(x).trim()).filter(Boolean).join(', ')}`
      : 'Popular events and activities happening in Bahrain'

  const [embPlaces, embRest, embBk, embEv] = await Promise.all([
    createEmbedding(ex(placesCore)),
    createEmbedding(ex(foodsCore)),
    createEmbedding(ex('Breakfast cafes and bakeries in Bahrain')),
    createEmbedding(ex(eventsCore)),
  ])

  let breakfastRaw = normMatches(
    await pineconeQuery(embBk, LIMITS.breakfast, {
      record_type: { $eq: 'client' },
      client_type: { $eq: 'restaurant' },
      meal_type: { $eq: 'Breakfast' },
    }),
  )
  if (breakfastRaw.length === 0) {
    breakfastRaw = normMatches(
      await pineconeQuery(embBk, LIMITS.breakfast, {
        record_type: { $eq: 'client' },
        client_type: { $eq: 'restaurant' },
      }),
    )
  }

  const [placesRaw, restaurantsRaw, eventsRawAll] = await Promise.all([
    pineconeQuery(embPlaces, LIMITS.places, {
      record_type: { $eq: 'client' },
      client_type: { $eq: 'place' },
    }),
    pineconeQuery(embRest, LIMITS.restaurants, {
      record_type: { $eq: 'client' },
      client_type: { $eq: 'restaurant' },
    }),
    pineconeQuery(embEv, LIMITS.events, { record_type: { $eq: 'event' } }),
  ])

  let placesNorm = normMatches(placesRaw)
  let restaurantsNorm = normMatches(restaurantsRaw)
  const todayIso = getTodayIsoInBahrain()
  let eventsNorm = normMatches(eventsRawAll).filter((m) => eventIsForTodayInBahrain(m, todayIso))

  if (placesNorm.length === 0) {
    const broad = normMatches(
      await pineconeQuery(embPlaces, LIMITS.places, { record_type: { $eq: 'client' } }),
    )
    placesNorm = broad
      .filter((m) => String(m.metadata?.client_type || '').toLowerCase() !== 'restaurant')
      .slice(0, 20)
  }

  const clientIdSet = new Set()
  for (const m of [...placesNorm, ...restaurantsNorm, ...breakfastRaw]) {
    const id = pickClientIdFromMatch(m)
    if (id) clientIdSet.add(id)
  }
  const eventIdSet = new Set()
  for (const m of eventsNorm) {
    const id = pickEventIdFromMatch(m)
    if (id) eventIdSet.add(id)
  }

  const [clientMap, eventMap, restaurantClientMap] = await Promise.all([
    fetchClientsByIdsUnion([...clientIdSet]),
    fetchEventsByIdsUnion([...eventIdSet]),
    fetchRestaurantClientByAuuidsUnion([...clientIdSet]),
  ])

  placesNorm = placesNorm.map((m) => mergeClientHydration(m, clientMap, restaurantClientMap))
  restaurantsNorm = restaurantsNorm.map((m) => mergeClientHydration(m, clientMap, restaurantClientMap))
  breakfastRaw = breakfastRaw.map((m) => mergeClientHydration(m, clientMap, restaurantClientMap))
  eventsNorm = eventsNorm.map((m) => mergeEventHydration(m, eventMap))

  restaurantsNorm = filterHydratedRestaurantsByFoodWhitelist(restaurantsNorm, foodLabels)
  eventsNorm = filterHydratedEventsForPrefs(eventsNorm, preferenceLabels, profileActivityLines)

  return {
    places: placesNorm,
    restaurants: restaurantsNorm,
    breakfastSpots: breakfastRaw,
    events: eventsNorm,
    meta: {
      todayIso,
      hydratedClients: clientMap.size,
      hydratedEvents: eventMap.size,
    },
  }
}
