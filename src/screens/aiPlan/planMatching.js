import { resolvePublicImageUrl } from '../../utils/imageUrl'
import { parseCoordsFromPineconeMetadata, parsePlanItemCoords, unswapLatLng } from './planGeoAndShare'


export function buildEventMetadataFromPineconeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  const venue = String(meta.venue || meta.location || meta.area || meta.city || '').trim()
  const startDate = String(meta.start_date || meta.startDate || '').trim()
  const endDate = String(meta.end_date || meta.endDate || '').trim()
  const startTime = String(meta.start_time || meta.startTime || '').trim()
  const endTime = String(meta.end_time || meta.endTime || '').trim()
  const eventType = String(meta.event_type || meta.eventType || '').trim()
  const description = String(meta.short_description || meta.description || meta.summary || '').trim()
  const hasAny = venue || startDate || endDate || startTime || endTime || eventType || description
  if (!hasAny) return null
  return { venue, startDate, endDate, startTime, endTime, eventType, description }
}

/** Body copy for the stop-detail “Event details” section (metadata + fallbacks). */
export function formatStopEventDetailsText(item) {
  if (!item || item.type !== 'event') return ''
  const m = item.eventMetadata
  const blocks = []
  if (m?.eventType) blocks.push(`Type · ${m.eventType}`)
  const dateStr = [m?.startDate, m?.endDate].filter(Boolean).join(' → ')
  if (dateStr) blocks.push(`Date · ${dateStr}`)
  const timeStr = [m?.startTime, m?.endTime].filter(Boolean).join(' – ')
  if (timeStr) blocks.push(`Time · ${timeStr}`)
  else if (item.time) blocks.push(`Time · ${item.time}`)
  if (m?.venue) blocks.push(`Venue · ${m.venue}`)
  if (m?.description) blocks.push(m.description)
  if (blocks.length > 0) return blocks.join('\n\n')
  const r = String(item.reason || '').trim()
  if (r) {
    const sentences = r.split(/(?<=[.!?])\s+/).filter(Boolean)
    const rest = sentences.slice(1).join(' ').trim()
    if (rest) return rest
    return r
  }
  return 'Event details will appear here when available.'
}

/** Primary copy for the stop-detail “About” card — user-added stops prefer catalog description. */
export function getStopAboutPrimaryText(item, isEvent) {
  const pd = String(item.placeDescription || '').trim()
  if (item.userAdded && pd) return pd
  const r = String(item.reason || '').trim()
  if (!r) {
    return isEvent
      ? 'A quick take on this event will appear here.'
      : 'Details for this stop will appear here.'
  }
  const parts = r.split(/(?<=[.!?])\s+/).filter(Boolean)
  return parts[0] || r
}

// Match plan item to Pinecone match by spot name (exact preferred, then fuzzy), extract image + clientId + canonical coords
export function matchPlanToPinecone(planItem, pineconeMatches) {
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
      const isEventStop = planItem.type === 'event'
      const isEventMeta = isEventStop || meta.record_type === 'event'
      const rawImg = isEventMeta
        ? meta.image ||
          meta.image_url ||
          meta.thumbnail_url ||
          meta.cover_image ||
          meta.client_image ||
          null
        : meta.image_url ||
          meta.thumbnail_url ||
          meta.cover_image ||
          meta.image ||
          meta.client_image ||
          null
      const image = resolvePublicImageUrl(rawImg)
      const clientId = meta.client_a_uuid || meta.id || m.id || null;
      const rating = meta.rating != null && meta.rating !== '' ? meta.rating : null;
      const eventMetadata = isEventStop ? buildEventMetadataFromPineconeMeta(meta) : null
      const isFt = meta.isfoodtruck === true || meta.is_food_truck === true || meta?.isFoodTruck === true
      best = {
        image,
        clientId,
        rating,
        coords,
        eventMetadata,
        isfoodtruck: isFt,
        restaurantMealType:
          meta.restaurant_meal_type != null && String(meta.restaurant_meal_type).trim()
            ? String(meta.restaurant_meal_type).trim()
            : meta.meal_type != null && String(meta.meal_type).trim()
              ? String(meta.meal_type).trim()
              : null,
        restaurantFoodType:
          meta.restaurant_food_type != null && String(meta.restaurant_food_type).trim()
            ? String(meta.restaurant_food_type).trim()
            : null,
      };
    }
  }
  return best;
}

// Normalize name for matching (lowercase, collapse spaces, remove common suffixes)
export function normName(s) {
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
export function matchPlanToClient(planItem, clients) {
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

/** Raw image fields from a plan row (enriched or API). */
export function collectPlanStopImageRawUrls(item) {
  if (!item || typeof item !== 'object') return []
  const out = []
  const push = (v) => {
    if (v == null) return
    if (typeof v === 'string' && v.trim()) out.push(v.trim())
    else if (typeof v === 'object' && v.url) out.push(String(v.url).trim())
  }
  if (Array.isArray(item.images)) item.images.forEach(push)
  push(item.image)
  push(item.client_image)
  push(item.photo_url)
  push(item.thumbnail_url)
  push(item.thumbnail)
  push(item.image_url)
  push(item.cover_url)
  push(item.picture)
  const meta = item.metadata || {}
  if (item.type === 'event') {
    push(meta.image)
    push(meta.image_url || meta.thumbnail_url || meta.cover_image || meta.client_image)
  } else {
    push(meta.image_url || meta.thumbnail_url || meta.cover_image || meta.image || meta.client_image)
  }
  return out
}

/** First displayable https URL for list / reel thumbs; falls back to map marker pool by name. */
export function pickPlanStopThumbUri(item, loadedMarkers = []) {
  for (const raw of collectPlanStopImageRawUrls(item)) {
    const u = resolvePublicImageUrl(raw)
    if (u) return u
  }
  if (!loadedMarkers?.length) return null
  const spotNorm = normName(item.spot || '')
  if (!spotNorm) return null
  for (const m of loadedMarkers) {
    const markerNorm = normName(m.spot || '')
    if (!markerNorm) continue
    if (markerNorm === spotNorm || markerNorm.includes(spotNorm) || spotNorm.includes(markerNorm)) {
      const u = resolvePublicImageUrl(m.image)
      if (u) return u
    }
  }
  return null
}

/** Ordered unique gallery URIs for detail modal. */
export function pickPlanStopGalleryUris(item, loadedMarkers = []) {
  const seen = new Set()
  const urls = []
  for (const raw of collectPlanStopImageRawUrls(item)) {
    const u = resolvePublicImageUrl(raw)
    if (u && !seen.has(u)) {
      seen.add(u)
      urls.push(u)
    }
  }
  if (urls.length === 0) {
    const one = pickPlanStopThumbUri(item, loadedMarkers)
    return one ? [one] : []
  }
  return urls
}

/** Lat/lng pairs for every plan stop that can be routed in Google Maps. */
export function collectPlanRouteMarkers(plan, loadedClientMarkers) {
  return (plan || [])
    .map((item) => {
      const fixed = parsePlanItemCoords(item) || resolveCoordsFromLoadedCache(item, loadedClientMarkers)
      return fixed ? { lat: fixed.lat, lng: fixed.lng } : null
    })
    .filter(Boolean)
}

// Enrich plan items with client images from Supabase (Pinecone or direct client lookup)
export function resolveCoordsFromLoadedCache(item, loadedClientMarkers) {
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
