/** Shared helpers for the AI Plan catalog search modal — semantic + substring match. */

const stringifyTagValue = (value) => {
  if (!value) return ''
  if (Array.isArray(value)) return value.map((item) => stringifyTagValue(item)).filter(Boolean).join(' ')
  if (typeof value === 'object') return Object.values(value).map((item) => stringifyTagValue(item)).filter(Boolean).join(' ')
  return String(value)
}

export const getClientSearchableTags = (client) => {
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
      } catch {
        return trimmed
      }
    }
    return trimmed
  }

  return String(tagsRaw)
}

/** Hashtags, labels, keywords — flattened like `tags`. */
export const getClientSecondaryTagFieldsBlob = (client) => {
  if (!client) return ''
  return [
    stringifyTagValue(client.hashtags),
    stringifyTagValue(client.labels),
    stringifyTagValue(client.topics),
    stringifyTagValue(client.keywords),
    typeof client.keyword === 'string' ? client.keyword.trim() : stringifyTagValue(client.keyword),
  ]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(' ')
}

/** Cuisine and restaurant-type fields commonly present on Supabase `client` rows. */
export const getClientCuisineSearchBlob = (client) => {
  if (!client) return ''
  const parts = [
    client.cuisine,
    client.cuisine_type,
    client.restaurant_food_type,
    client.restaurant_meal_type,
    client.restaurantFoodType,
    client.meal_type,
    client.mealType,
    client.food_type,
    client.foodType,
    client.speciality,
    client.specialty,
    client.menu_focus,
    client.menuFocus,
    client.category,
    client.subcategory,
    client.secondary_category,
    client.secondaryCategory,
    client.verticle,
    client.vertical,
  ]
  const flat = []
  for (const p of parts) {
    const chunk = stringifyTagValue(p).trim()
    if (chunk) flat.push(chunk)
  }
  return flat.join(' ')
}

export const getClientTagsSearchBlob = (client) => {
  const primary = getClientSearchableTags(client)
  const secondary = getClientSecondaryTagFieldsBlob(client)
  return [primary, secondary].filter(Boolean).join(' ')
}

/** `public.restaurant_client` — linked by `a_uuid` = `client.client_a_uuid`. */
export const blobFromRestaurantClientRow = (row) => {
  if (!row || typeof row !== 'object') return ''
  const ft =
    row.isfoodtruck === true || row.isfoodtruck === 'true' || row.isfoodtruck === 1 ? 'food truck' : ''
  const parts = [
    row.cuisine,
    row.meal_type,
    row.food_type,
    row.speciality,
    ft,
    typeof row.branch === 'string' ? row.branch : stringifyTagValue(row.branch),
  ]
  const flat = []
  for (const p of parts) {
    const chunk = stringifyTagValue(p).trim()
    if (chunk) flat.push(chunk)
  }
  return flat.join(' ')
}

/** `public.place` — linked by `client_uuid` = `client.client_a_uuid`. */
export const blobFromPlaceRow = (row) => {
  if (!row || typeof row !== 'object') return ''
  const parts = [
    row.name,
    row.description,
    row.suitable_for,
    row.category,
    row.indoor_outdoor,
    row.entry_cost != null ? String(row.entry_cost) : '',
    row.opening_time,
    row.closing_time,
  ]
  const flat = []
  for (const p of parts) {
    const chunk = stringifyTagValue(p).trim()
    if (chunk) flat.push(chunk)
  }
  return flat.join(' ')
}

/** Single `public.events` row normalized for substring search. */
export const blobFromEventRow = (row) => {
  if (!row || typeof row !== 'object') return ''
  const parts = [
    row.event_name,
    row.venue,
    row.event_type,
    row.indoor_outdoor,
    row.status,
    row.start_date,
    row.end_date,
    row.start_time,
    row.end_time,
  ]
  const flat = []
  for (const p of parts) {
    const chunk = stringifyTagValue(p).trim()
    if (chunk) flat.push(chunk)
  }
  return flat.join(' ')
}

/**
 * Concatenates optional blobs attached during catalog load from `restaurant_client`, `place`, `events`.
 * See `_planSearchRestaurantBlob`, `_planSearchPlaceBlob`, `_planSearchEventsBlob`.
 */
export const getClientJoinedSupabaseTablesBlob = (client) => {
  if (!client) return ''
  return [
    typeof client._planSearchRestaurantBlob === 'string' ? client._planSearchRestaurantBlob.trim() : '',
    typeof client._planSearchPlaceBlob === 'string' ? client._planSearchPlaceBlob.trim() : '',
    typeof client._planSearchEventsBlob === 'string' ? client._planSearchEventsBlob.trim() : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export const matchesSearchQuery = (client, queryLower) => {
  if (!queryLower) return true
  const nameText = (client.name || client.business_name || '').toLowerCase()
  const arabicNameText = (client.business_name_ar || '').toLowerCase()
  const tagsText = getClientTagsSearchBlob(client).toLowerCase()
  const cuisineText = getClientCuisineSearchBlob(client).toLowerCase()
  const joinedTables = getClientJoinedSupabaseTablesBlob(client).toLowerCase()
  return (
    nameText.includes(queryLower) ||
    arabicNameText.includes(queryLower) ||
    tagsText.includes(queryLower) ||
    cuisineText.includes(queryLower) ||
    joinedTables.includes(queryLower)
  )
}

const normKey = (v) => (v == null || v === '' ? null : String(v).trim().toLowerCase())

export const buildCatalogLookupMap = (groupedClients) => {
  const lookup = new Map()
  const add = (client) => {
    if (!client) return
    const primary = normKey(client.client_a_uuid || client.clientId)
    if (primary) lookup.set(primary, client)
    const ev = normKey(client.event_uuid)
    if (ev) lookup.set(ev, client)
    const slug = normKey(client.slug || client.business_slug)
    if (slug) lookup.set(slug, client)
  }
  ;['restaurants', 'places', 'events'].forEach((k) => {
    ;(groupedClients[k] || []).forEach(add)
  })
  return lookup
}

const pineconeSimilarityScore = (m) => {
  const s = m?.score
  if (typeof s === 'number' && !Number.isNaN(s)) return s
  return -Number.MAX_VALUE
}

/**
 * Ordered unique clients resolved from Pinecone matches (preserve score order).
 */
const clientsFromSemanticMatches = (matches, lookup) => {
  const sorted = [...(matches || [])].sort((a, b) => pineconeSimilarityScore(b) - pineconeSimilarityScore(a))
  const out = []
  const seen = new Set()
  for (const match of sorted) {
    const meta = match?.metadata || {}
    const candidates = [
      meta.client_a_uuid,
      meta.client_uuid,
      meta.client_id,
      meta.event_uuid,
      match?.id,
      meta.id,
      meta.uuid,
      meta.event_id,
    ].map(normKey).filter(Boolean)

    let client = null
    for (const key of candidates) {
      client = lookup.get(key)
      if (client) break
    }
    const idRaw = client?.client_a_uuid || client?.clientId
    const idNorm = normKey(idRaw)
    if (!client || !idNorm || seen.has(idNorm)) continue
    seen.add(idNorm)
    out.push(client)
  }
  return { ordered: out, seenIds: seen }
}

/**
 * Semantic-first ordering, then substring matches not already included.
 */
export const mergeGroupedSearchResults = ({
  groupedClients,
  queryTrimmed,
  semanticBuckets,
  useSemanticMerge,
}) => {
  const ql = queryTrimmed.toLowerCase()
  const blank = ['restaurants', 'places', 'events'].every((k) => !(groupedClients[k] || []).length)
  const emptyGrouped = () => ({
    restaurants: [],
    places: [],
    events: [],
  })

  if (blank || !groupedClients) return emptyGrouped()

  if (!queryTrimmed) {
    return {
      restaurants: [...(groupedClients.restaurants || [])],
      places: [...(groupedClients.places || [])],
      events: [...(groupedClients.events || [])],
    }
  }

  const lookup = buildCatalogLookupMap(groupedClients)
  const bucketKeys = ['restaurants', 'places', 'events']
  const out = {}

  const pineconePlaces = semanticBuckets?.places
  const pineconeRestaurants = semanticBuckets?.restaurants
  const pineconeEvents = semanticBuckets?.events

  for (const key of bucketKeys) {
    const raw = groupedClients[key] || []
    const substringOnly = ql ? raw.filter((c) => matchesSearchQuery(c, ql)) : raw

    const matches =
      key === 'restaurants'
        ? pineconeRestaurants
        : key === 'events'
          ? pineconeEvents
          : pineconePlaces

    if (!useSemanticMerge || !(matches?.length > 0)) {
      out[key] = substringOnly
      continue
    }

    const { ordered, seenIds } = clientsFromSemanticMatches(matches, lookup)
    const extra = substringOnly.filter((c) => {
      const nid = normKey(c.client_a_uuid || c.clientId)
      const ev = normKey(c.event_uuid)
      if (nid && seenIds.has(nid)) return false
      if (ev && seenIds.has(ev)) return false
      return true
    })

    const seenDedupe = new Set(seenIds)
    const appended = [...ordered]
    for (const c of extra) {
      const nid = normKey(c.client_a_uuid || c.clientId)
      if (nid && seenDedupe.has(nid)) continue
      const ev = normKey(c.event_uuid)
      if (ev && seenDedupe.has(ev)) continue
      if (nid) seenDedupe.add(nid)
      if (ev) seenDedupe.add(ev)
      appended.push(c)
    }
    out[key] = appended
  }

  return out
}
