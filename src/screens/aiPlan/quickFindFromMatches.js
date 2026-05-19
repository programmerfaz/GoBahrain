import { buildEventMetadataFromPineconeMeta, normName } from './planMatching'
import { enrichPlanWithClientData } from './spotPreviewPipeline'
import { attachPlanRowKeys } from './planRowModel'
import { parseCoordsFromPineconeMetadata, unswapLatLng } from './planGeoAndShare'
import {
  buildMetadataHaystackLower,
  mapUiFoodLabelToPineconeCuisine,
  preferenceAlignmentScore,
  PLACE_THEME_GATES,
} from '../../services/aiPipeline'
import { supabase } from '../../config/supabase'

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenSet = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return new Set()
  return new Set(normalized.split(' ').filter((t) => t.length >= 2))
}

const pineconeStrength = (m) => {
  const s = m?.score
  if (typeof s !== 'number' || Number.isNaN(s)) return 0
  if (s >= 0 && s <= 1.5) return s * 100
  return Math.min(Math.log1p(Math.max(0, s)) * 18, 120)
}

const matchMetadataIsFoodTruck = (meta) => {
  const v = meta?.isfoodtruck ?? meta?.is_food_truck ?? meta?.isFoodTruck
  return v === true || v === 'true' || v === 1
}

const tokenRecallInHaystack = (labelTokens, metaNorm) => {
  if (!labelTokens.size || !metaNorm) return 0
  let hit = 0
  labelTokens.forEach((t) => {
    if (metaNorm.includes(t)) {
      hit += 1
      return
    }
    if (t.length < 3) return
    const words = metaNorm.split(/\s+/).filter(Boolean)
    const fuzzy = words.some((w) => w === t || (w.length >= 4 && (w.startsWith(t) || t.startsWith(w))) || w.includes(t))
    if (fuzzy) hit += 0.82
  })
  return hit / labelTokens.size
}

const hasValidCoords = (item) => {
  const la = Number(item?.lat)
  const ln = Number(item?.lng)
  return Number.isFinite(la) && Number.isFinite(ln)
}

const markerClientIdSet = (allPlaceMarkers) => {
  const out = new Set()
  const list = Array.isArray(allPlaceMarkers) ? allPlaceMarkers : []
  list.forEach((mk) => {
    const id = mk?.clientId || mk?.client_a_uuid
    if (id) out.add(String(id))
  })
  return out
}

/** Best-known lat/lng per client UUID from markers already loaded on the map */
const markerCoordByClientId = (allPlaceMarkers) => {
  const map = new Map()
  const list = Array.isArray(allPlaceMarkers) ? allPlaceMarkers : []
  for (const mk of list) {
    const idRaw = mk?.clientId ?? mk?.client_a_uuid
    if (!idRaw) continue
    const la = Number(mk.lat ?? mk.latitude)
    const ln = Number(mk.lng ?? mk.longitude ?? mk.long)
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue
    const id = String(idRaw)
    if (!map.has(id)) map.set(id, { lat: la, lng: ln })
  }
  return map
}

const haversineKmApprox = (aLat, aLng, bLat, bLng) => {
  if (
    ![aLat, aLng, bLat, bLng].every((n) =>
      typeof n === 'number' && Number.isFinite(n),
    )
  ) {
    return null
  }
  const R = 6371
  const r1 = (aLat * Math.PI) / 180
  const r2 = (bLat * Math.PI) / 180
  const d1 = ((bLat - aLat) * Math.PI) / 180
  const d2 = ((bLng - aLng) * Math.PI) / 180
  const s1 = Math.sin(d1 / 2) ** 2
  const s2 = Math.cos(r1) * Math.cos(r2) * Math.sin(d2 / 2) ** 2
  return R * (2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2)))
}

const approximateCoordsForRanking = (pineconeMatch, markerCoordsMap) => {
  const meta = pineconeMatch?.metadata || {}
  const fromMeta = parseCoordsFromPineconeMetadata(meta)
  if (
    fromMeta &&
    typeof fromMeta.lat === 'number' &&
    typeof fromMeta.lng === 'number' &&
    Number.isFinite(fromMeta.lat) &&
    Number.isFinite(fromMeta.lng)
  ) {
    return { lat: fromMeta.lat, lng: fromMeta.lng }
  }
  const cid = meta.client_a_uuid ?? meta.client_uuid
  if (cid != null) {
    const hit = markerCoordsMap.get(String(cid).trim())
    if (hit) return hit
  }
  return null
}

const approximateKmToReference = (pineconeMatch, proximityCtx) => {
  if (!proximityCtx?.reference) return Number.POSITIVE_INFINITY
  const approx = approximateCoordsForRanking(pineconeMatch, proximityCtx.markerCoordsMap || new Map())
  if (!approx) return Number.POSITIVE_INFINITY
  const km = haversineKmApprox(
    proximityCtx.reference.lat,
    proximityCtx.reference.lng,
    approx.lat,
    approx.lng,
  )
  if (km == null || !Number.isFinite(km) || km < 0) return Number.POSITIVE_INFINITY
  return km
}

const stableMatchId = (m) => {
  const meta = m?.metadata || {}
  return String(m?.id ?? meta.client_a_uuid ?? meta.event_uuid ?? meta.id ?? '')
}

/** Dedupe identifiers for skipping “search again” repeat picks — matches Pinecone + Supabase keys. */
export const buildQuickFindMatchFingerprints = (m) => {
  const meta = m?.metadata || {}
  const xs = []
  for (const v of [
    meta.client_a_uuid,
    meta.client_uuid,
    meta.event_uuid,
    meta.uuid,
    meta.id,
    m?.id,
  ]) {
    if (v == null) continue
    const s = String(v).trim()
    if (s) xs.push(s)
  }
  return [...new Set(xs)]
}

const matchTouchesExcludedFingerprints = (m, excludedSet) => {
  if (!(excludedSet instanceof Set) || excludedSet.size === 0) return false
  return buildQuickFindMatchFingerprints(m).some((id) => excludedSet.has(id))
}

/** Stable “map pin” key so different Pinecone rows that land on the same coords are skipped on repeat picks */
const quickFindPinFingerprintFromCoords = (lat, lng) => {
  const a = Number(lat)
  const b = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const r4 = (x) => Math.round(x * 1e4) / 1e4
  return `qf-pin:${r4(a)},${r4(b)}`
}

const fingerprintListTouchesExcludedSet = (ids, excludedSet) => {
  if (!(excludedSet instanceof Set) || excludedSet.size === 0 || !Array.isArray(ids)) return false
  return ids.some((id) => id && excludedSet.has(String(id).trim()))
}

/**
 * Canonical ids after enrich — Pinecone-only fingerprints miss duplicate vectors that hydrate the same venue.
 * Exported for callers that replay exclusions across runs.
 */
export const buildQuickFindResultFingerprints = (pineconeMatch, enrichedPlanRow) => {
  const xs = [...buildQuickFindMatchFingerprints(pineconeMatch)]
  const cid = enrichedPlanRow?.clientId != null ? String(enrichedPlanRow.clientId).trim() : ''
  if (cid) xs.push(cid)
  const meta = pineconeMatch?.metadata || {}
  const gpid =
    meta.google_place_id != null
      ? String(meta.google_place_id).trim()
      : meta.place_id != null
        ? String(meta.place_id).trim()
        : ''
  if (gpid) xs.push(`gpid:${gpid}`)
  const pinFp = quickFindPinFingerprintFromCoords(enrichedPlanRow?.lat, enrichedPlanRow?.lng)
  if (pinFp) xs.push(pinFp)
  const spotN = normName(String(enrichedPlanRow?.spot || ''))
  if (spotN) xs.push(`qf-spot:${spotN}`)
  return [...new Set(xs.filter(Boolean))]
}

// PLACE_THEME_GATES is imported from aiPipeline.js (single source of truth)

/** @param {'place'|'restaurant'|'event'} kind */
const quickFindPassThemeGate = (kind, rawLabelTrimmed, hayLower, meta) => {
  const label = rawLabelTrimmed.trim()
  if (kind === 'place') {
    const gate = PLACE_THEME_GATES[label]
    if (!gate) return true
    return gate(hayLower)
  }
  if (kind === 'restaurant') return restaurantPassesThemeGate(label, hayLower, meta)
  if (kind === 'event') return eventPassesThemeGate(label, hayLower)
  return true
}

const cuisinesBlob = (meta) =>
  [
    meta?.cuisine,
    meta?.cuisine_type,
    meta?.restaurant_food_type,
    meta?.restaurant_meal_type,
  ]
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')

const restaurantPassesThemeGate = (label, hayLower, meta) => {
  const chip = label.trim().toLowerCase().replace(/\s+/g, ' ')
  const cBlob = cuisinesBlob(meta)
  const pineconeWanted = String(mapUiFoodLabelToPineconeCuisine(label) || '')
    .trim()
    .toLowerCase()

  if (chip === 'food truck') {
    return matchMetadataIsFoodTruck(meta)
  }

  const cuisineMatchesWanted =
    pineconeWanted !== '' &&
    pineconeWanted !== String(label || '')
      .trim()
      .toLowerCase() &&
    cBlob.split(/\s+/).some((t) => t === pineconeWanted || cBlob.includes(pineconeWanted))

  switch (chip) {
    case 'seafood':
      return (
        /\bseafoods?\b/.test(cBlob) ||
        /\b(seafoods?|fresh fish|\bfish\b(?! chips)| sushi| oyster| lobster| calamari)\b/i.test(hayLower)
      )
    case 'italian':
      return cuisineMatchesWanted || /\bital(y|ian)|\bpasta\b|trattoria|ristorante|pizza(ria)?\b/i.test(hayLower)
    case 'asian':
      return (
        cuisineMatchesWanted ||
        /\basian\b|south\s*asian|noodle| ramen|pho\b|viet| sushi| teppanyaki| chinese| japane(se)?| kor(ean)?|tha(i|iland)| dim sum| hawker|\bpho\b|\bpad thai\b/i.test(hayLower)
      )
    case 'grill':
      return /\b(grill|grille|skewer|kebab|charcoal| bbq|\bb\.b\.q|barbecue)\b|\bsteak(house)?\b/i.test(hayLower)
    case 'café':
    case 'cafe':
      return (
        cuisineMatchesWanted ||
        /\bcaf(e|é)\b|coffee\b|barista\b|bakery\b|patisserie|brunch spot|coffeehouse/i.test(hayLower)
      )
    case 'fast food':
      return cuisineMatchesWanted || /\bfast\s*food\b| burgers?\b|\bfried chicken\b|quick bite|sandwich shack/i.test(hayLower)
    case 'street food':
      return cuisineMatchesWanted || matchMetadataIsFoodTruck(meta) || /\bstreet food\b|\bshawarma\b|\bstall\b|\bhole in the wall\b/i.test(hayLower)
    case 'local & arabic':
      return (
        /\b(arab(ic)?|khaleej|gulf|bahrain(i)?|traditional|mezze|majboos|machboos|mandi\b| grills?\s+arab| grills?\s+traditional)/i.test(
          hayLower,
        ) ||
        (cuisineMatchesWanted && /\b(traditional|authentic|mezze|mandi|khaleej|gulf)\b/i.test(hayLower))
      )
    default:
      return true
  }
}

const EVENT_THEME_GATES = {
  Family: (hay) => /\bfamily\b|\bkids\b|\bchildren\b|all\s*ages|parents?\b|parent-child/i.test(hay),
  Festival: (hay) => /\bfestival(s)?\b|\bfaire?\b|\bcelebrations?\b|fiesta|carnival|seasonal market/i.test(hay),
  Outdoor: (hay) => /\boutdoors?\b|outside\b|open-?air|al fresco|garden\b.*event|campground|camp site/i.test(hay),
  'Live music': (hay) => /\bmusic\b|concert\b|\bbands?\b|\bdj\b|live show|performance(s)?|gig\b|karaoke\b|acoustic/i.test(hay),
  Sports: (hay) =>
    /\bsports?\b|football|soccer|basketball|cricket|marathon|tournament|race\b|karting|cycling\b|running event|triathlon|\b(matches?)\b.*\bticket\b/i.test(hay),
}

const eventPassesThemeGate = (label, hayLower) => {
  const gate = EVENT_THEME_GATES[label.trim()]
  if (!gate) return true
  return gate(hayLower)
}

/**
 * Deterministic composite: vector score + metadata match to the picked chip (no random shuffle).
 */
const getQuickFindMatchScore = (m, kind, rawLabel, normalizedSubLabel, markerIds, profileLabels = []) => {
  const meta = m?.metadata || {}
  const metaText = [
    meta.business_name,
    meta.name,
    meta.place_name,
    meta.event_name,
    meta.category,
    meta.subcategory,
    meta.sub_category,
    meta.event_type,
    meta.cuisine,
    meta.cuisine_type,
    meta.restaurant_food_type,
    meta.restaurant_meal_type,
    meta.indoor_outdoor,
    meta.tags,
    meta.description,
    meta.short_description,
    meta.summary,
    meta.venue,
    meta.area,
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ')

  const metaNorm = normalizeText(metaText)
  const labelTokens = tokenSet(normalizedSubLabel)

  const prefSources = (() => {
    const fromProfile = (Array.isArray(profileLabels) ? profileLabels : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
    if (fromProfile.length) return fromProfile
    return rawLabel ? [rawLabel] : []
  })()

  let score = pineconeStrength(m) * 1.12
  score += preferenceAlignmentScore(m, prefSources) * 3.25
  score += tokenRecallInHaystack(labelTokens, metaNorm) * 52

  if (normalizedSubLabel && metaNorm.includes(normalizedSubLabel)) score += 46

  const id = meta.client_a_uuid ? String(meta.client_a_uuid) : null
  if (id && markerIds.has(id)) score += 18
  if (meta.lat != null && meta.lng != null) score += 8
  if (meta.google_maps_link) score += 5
  if (meta.business_name || meta.event_name || meta.place_name) score += 3

  if (kind === 'restaurant' && rawLabel) {
    const want = String(mapUiFoodLabelToPineconeCuisine(rawLabel) || '')
      .trim()
      .toLowerCase()
    const metaC = String(meta.cuisine_type || meta.cuisine || '')
      .trim()
      .toLowerCase()
    if (want && metaC && metaC === want) score += 38
    const chip = String(rawLabel || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
    if (chip === 'food truck' && matchMetadataIsFoodTruck(meta)) score += 44
    if (
      chip === 'street food' &&
      (/street|casual|quick|snack|shawarma|grill/i.test(metaText) || matchMetadataIsFoodTruck(meta))
    )
      score += 14
  }

  if (kind === 'event' && rawLabel) {
    const chip = String(rawLabel || '').trim().toLowerCase()
    if (chip === 'outdoor' && /outdoor|outside|open air|al fresco/i.test(metaText)) score += 22
    if (chip === 'live music' && /music|concert|band|dj|performance|gig/i.test(metaText)) score += 22
    if (chip === 'sports' && /sport|football|race|run|marathon|fitness|gym|match|tournament/i.test(metaText)) score += 22
    if (chip === 'festival' && /festival|fair|celebration|fiesta/i.test(metaText)) score += 18
    if (chip === 'family' && /family|kids|children|all ages/i.test(metaText)) score += 16
  }

  return score
}

const SCORE_TIE_EPS = 0.06
/** Float-only: treat as same distance if within this (km) so we break ties by relevance score */
const KM_ORDER_EPS = 1e-4

const rankMatchesDeterministic = (list, scoreFn, proximityCtx) => {
  const ref = proximityCtx?.reference
  const arr = [...(list || [])].map((m, listIndex) => ({
    m,
    listIndex,
    s: scoreFn(m),
    km: ref ? approximateKmToReference(m, proximityCtx) : Number.POSITIVE_INFINITY,
  }))
  arr.sort((a, b) => {
    if (ref) {
      const ia = a.km === Number.POSITIVE_INFINITY
      const ib = b.km === Number.POSITIVE_INFINITY
      if (ia !== ib) return ia ? 1 : -1
      if (!ia && !ib) {
        const dKm = a.km - b.km
        if (Math.abs(dKm) > KM_ORDER_EPS) return dKm
      }
    }
    if (Math.abs(b.s - a.s) > SCORE_TIE_EPS) return b.s - a.s
    if (ref && a.km !== Number.POSITIVE_INFINITY && b.km !== Number.POSITIVE_INFINITY) {
      const dKm = a.km - b.km
      if (dKm !== 0) return dKm
    }
    const ida = stableMatchId(a.m)
    const idb = stableMatchId(b.m)
    if (ida !== idb) return ida < idb ? -1 : 1
    return a.listIndex - b.listIndex
  })
  return arr.map((x) => x.m)
}

const planDraftFromMatch = (m, kind) => {
  const meta = m?.metadata || {}
  if (kind === 'event') {
    const spot = String(meta.event_name || meta.business_name || 'Event').trim() || 'Event'
    return {
      spot,
      time: 'Afternoon',
      type: 'event',
      lat: null,
      lng: null,
      reason: 'Quick find picked this event for you.',
      clientId: meta.client_a_uuid ? String(meta.client_a_uuid) : null,
      eventMetadata: buildEventMetadataFromPineconeMeta(meta),
    }
  }
  if (kind === 'restaurant') {
    const spot = String(meta.business_name || meta.name || 'Restaurant').trim() || 'Restaurant'
    return {
      spot,
      time: 'Afternoon',
      type: 'restaurant',
      lat: null,
      lng: null,
      reason: 'Quick find picked this spot for you.',
      clientId: meta.client_a_uuid ? String(meta.client_a_uuid) : null,
    }
  }
  const spot = String(meta.business_name || meta.name || meta.place_name || 'Place').trim() || 'Place'
  return {
    spot,
    time: 'Afternoon',
    type: 'place',
    lat: null,
    lng: null,
    reason: 'Quick find picked this place for you.',
    clientId: meta.client_a_uuid ? String(meta.client_a_uuid) : null,
  }
}

const MAX_ENRICH_ATTEMPTS = 24

/**
 * Picks one Pinecone match (theme + exclusions enforced), enriches with Supabase coords.
 * When exclusions remove every gated hit, repeats using the full gated pool (prior pins allowed again).
 * @returns {{ plan: import('./planRowModel').PlanRow[]|null, fingerprints: string[], stats: { pineconeCount: number, themeCount: number, afterExcludeCount: number, cycledExclusions: boolean } }}
 */
export const buildQuickFindSingleStopPlan = async (
  matches,
  kind,
  allPlaceMarkers,
  subCategoryLabel,
  options = {},
) => {
  const excludedList = Array.isArray(options.excludedFingerprints) ? options.excludedFingerprints : []
  const excludedSet = new Set(excludedList.map(String).filter(Boolean))

  const rawPool = Array.isArray(matches) ? matches.filter(Boolean) : []
  const emptyStats = { pineconeCount: 0, themeCount: 0, afterExcludeCount: 0, cycledExclusions: false }
  if (rawPool.length === 0) return { plan: null, fingerprints: [], stats: emptyStats }

  const rawLabel = String(subCategoryLabel || '').trim()
  const normalizedSubLabel = normalizeText(subCategoryLabel)
  const profileLabels = (Array.isArray(options.profileLabels) ? options.profileLabels : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
  const categoryLabel = String(options.categoryLabel || '').trim()
  const useProfileOnly = !rawLabel && profileLabels.length > 0
  const markerIds = markerClientIdSet(allPlaceMarkers)

  const gated = rawPool.filter((m) => {
    if (useProfileOnly) return true
    const hay = buildMetadataHaystackLower(m)
    const meta = m?.metadata || {}
    return quickFindPassThemeGate(kind, rawLabel, hay, meta)
  })
  const hadExclusions = excludedSet.size > 0
  let poolUse = gated.filter((m) => !matchTouchesExcludedFingerprints(m, excludedSet))
  let excludedEffective = excludedSet
  let cycledExclusions = false
  if (poolUse.length === 0 && gated.length > 0 && hadExclusions) {
    poolUse = gated
    excludedEffective = new Set()
    cycledExclusions = true
  }

  const stats = {
    pineconeCount: rawPool.length,
    themeCount: gated.length,
    afterExcludeCount: poolUse.length,
    cycledExclusions,
  }

  if (poolUse.length === 0) {
    return { plan: null, fingerprints: [], stats }
  }

  const refLat = Number(options.referenceCoords?.lat ?? options.referenceCoords?.latitude)
  const refLng = Number(options.referenceCoords?.lng ?? options.referenceCoords?.longitude)
  const reference =
    Number.isFinite(refLat) && Number.isFinite(refLng)
      ? { lat: refLat, lng: refLng }
      : null

  // Build coord map from already-loaded map markers as the base.
  const coordsMapForProximity = markerCoordByClientId(allPlaceMarkers)

  // Batch-fetch coords from Supabase for ALL gated candidates so that distance
  // sorting is accurate even for venues not yet on the map.
  // This is the key step that enables true "closest first, second closest next" ordering.
  if (reference && gated.length > 0) {
    const gatedClientIds = [...new Set(
      gated
        .map((m) => {
          const meta = m?.metadata || {}
          return String(meta.client_a_uuid ?? meta.client_uuid ?? '').trim()
        })
        .filter(Boolean),
    )]
    if (gatedClientIds.length > 0) {
      try {
        const { data: coordRows } = await supabase
          .from('client')
          .select('client_a_uuid, lat, long, latitude, longitude')
          .in('client_a_uuid', gatedClientIds)
        for (const row of coordRows || []) {
          if (!row.client_a_uuid) continue
          const id = String(row.client_a_uuid).trim()
          if (coordsMapForProximity.has(id)) continue // already have it from markers
          const u = unswapLatLng(
            row.lat ?? row.latitude,
            row.long ?? row.longitude,
          )
          if (u) coordsMapForProximity.set(id, { lat: u.lat, lng: u.lng })
        }
      } catch {
        /* non-critical — distance sort falls back to Pinecone metadata coords */
      }
    }
  }

  const proximityCtx = reference ? { reference, markerCoordsMap: coordsMapForProximity } : null

  const scoreFn = (m) =>
    getQuickFindMatchScore(m, kind, rawLabel, normalizedSubLabel, markerIds, profileLabels)

  const tryPickFromPool = async (poolIn, exclEff) => {
    // Rank by distance first (closest to user), then by relevance score as tiebreaker.
    const ordered = rankMatchesDeterministic(poolIn, scoreFn, proximityCtx)
    for (let i = 0; i < ordered.length && i < MAX_ENRICH_ATTEMPTS; i += 1) {
      const m = ordered[i]
      if (matchTouchesExcludedFingerprints(m, exclEff)) continue

      const draft = planDraftFromMatch(m, kind)
      if (rawLabel) {
        draft.reason = `Quick find picked this for ${rawLabel}.`
      } else if (categoryLabel) {
        draft.reason = `Nearest ${categoryLabel.toLowerCase()} match for your profile.`
      } else if (profileLabels.length) {
        draft.reason = 'Nearest match for your profile.'
      }
      try {
        const enriched = await enrichPlanWithClientData([draft], rawPool, allPlaceMarkers || [], {
          quickFindLight: true,
        })
        const first = enriched?.[0]
        if (first && hasValidCoords(first)) {
          const fps = buildQuickFindResultFingerprints(m, first)
          if (fingerprintListTouchesExcludedSet(fps, exclEff)) {
            continue
          }
          return { plan: attachPlanRowKeys([first]), fingerprints: fps }
        }
      } catch {
        /* try next */
      }
    }
    return null
  }

  let picked = await tryPickFromPool(poolUse, excludedEffective)
  if (!picked && !cycledExclusions && hadExclusions && gated.length > 0) {
    // All options exhausted — cycle back to the full gated pool (nearest first again).
    picked = await tryPickFromPool(gated, new Set())
    if (picked) {
      stats.cycledExclusions = true
      stats.afterExcludeCount = gated.length
    }
  }

  if (!picked) return { plan: null, fingerprints: [], stats }
  return { plan: picked.plan, fingerprints: picked.fingerprints, stats }
}
