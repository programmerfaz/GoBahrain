import { buildEventMetadataFromPineconeMeta } from './planMatching'
import { enrichPlanWithClientData } from './spotPreviewPipeline'
import { attachPlanRowKeys } from './planRowModel'

const shuffleArray = (input) => {
  const arr = [...(input || [])]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenSet = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return new Set()
  return new Set(normalized.split(' ').filter(Boolean))
}

const overlapRatio = (sourceSet, targetSet) => {
  if (!sourceSet.size || !targetSet.size) return 0
  let overlap = 0
  sourceSet.forEach((t) => {
    if (targetSet.has(t)) overlap += 1
  })
  return overlap / Math.max(sourceSet.size, targetSet.size)
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

const getMatchSortScore = (m, normalizedSubLabel, markerIds) => {
  const meta = m?.metadata || {}
  const metaText = [
    meta.business_name,
    meta.name,
    meta.place_name,
    meta.event_name,
    meta.category,
    meta.subcategory,
    meta.sub_category,
    meta.tags,
    meta.description,
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ')
  const baseTokens = tokenSet(metaText)
  const labelTokens = tokenSet(normalizedSubLabel)
  const overlap = overlapRatio(labelTokens, baseTokens)

  let score = overlap * 100
  if (normalizedSubLabel && normalizeText(metaText).includes(normalizedSubLabel)) score += 35

  const id = meta.client_a_uuid ? String(meta.client_a_uuid) : null
  if (id && markerIds.has(id)) score += 20
  if (meta.lat != null && meta.lng != null) score += 8
  if (meta.google_maps_link) score += 6
  if (meta.business_name || meta.event_name || meta.place_name) score += 4
  return score
}

/**
 * Picks one Pinecone match, enriches with Supabase coords, returns a single-stop plan or null.
 */
export const buildQuickFindSingleStopPlan = async (matches, kind, allPlaceMarkers, subCategoryLabel) => {
  const list = Array.isArray(matches) ? matches.filter(Boolean) : []
  if (list.length === 0) return null
  const normalizedSubLabel = normalizeText(subCategoryLabel)
  const markerIds = markerClientIdSet(allPlaceMarkers)
  const ranked = [...list].sort((a, b) => {
    const scoreB = getMatchSortScore(b, normalizedSubLabel, markerIds)
    const scoreA = getMatchSortScore(a, normalizedSubLabel, markerIds)
    return scoreB - scoreA
  })
  const topBucket = ranked.slice(0, Math.min(6, ranked.length))
  const fallbackBucket = ranked.slice(topBucket.length)
  const orderedCandidates = [...shuffleArray(topBucket), ...shuffleArray(fallbackBucket)]
  for (const m of orderedCandidates) {
    const draft = planDraftFromMatch(m, kind)
    if (normalizedSubLabel) {
      draft.reason = `Quick find picked this for ${subCategoryLabel}.`
    }
    try {
      const enriched = await enrichPlanWithClientData([draft], list, allPlaceMarkers || [])
      const first = enriched?.[0]
      if (first && hasValidCoords(first)) {
        return attachPlanRowKeys([first])
      }
    } catch {
      /* try next */
    }
  }
  return null
}
