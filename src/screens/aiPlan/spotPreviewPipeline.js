import { supabase } from '../../config/supabase'
import { CachedImage, prefetchImageUrls } from '../../components/CachedImage'
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../../utils/imageUrl'
import { parseCoordsFromClientRow, unswapLatLng, parsePlanItemCoords } from './planGeoAndShare'
import { matchPlanToPinecone, matchPlanToClient, resolveCoordsFromLoadedCache, normName } from './planMatching'


export function buildSpotPreviews(places, restaurants, events) {
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
        type === 'event'
          ? meta.image ||
            meta.image_url ||
            meta.thumbnail_url ||
            meta.cover_image ||
            null
          : meta.image_url ||
            meta.thumbnail_url ||
            meta.cover_image ||
            meta.image ||
            null;
      const image = resolvePublicImageUrl(rawImage);
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

// Fetch "Places we're considering" from Supabase — uses POSTS table (post_image) + CLIENT table (business_name)
// Posts have images; client has names. Same source as HomeScreen feed.
export async function fetchSpotPreviewsFromSupabase() {
  const { data: postRows, error: postErr } = await supabase
    .from('posts')
    .select('client_a_uuid, post_image')
    .not('post_image', 'is', null)
    .not('client_a_uuid', 'is', null)
    .order('created_at', { ascending: false })
    .limit(140);

  if (postErr || !postRows?.length) {
    if (postErr) console.warn('[AIPlan] fetchSpotPreviews posts error:', postErr?.message);
    return [];
  }

  const clientIds = [...new Set(postRows.map((r) => r.client_a_uuid).filter(Boolean))];
  const { data: clients } = await supabase
    .from('client')
    .select('client_a_uuid, business_name, name, client_type')
    .in('client_a_uuid', clientIds);

  const nameByClient = {};
  const typeByClient = {};
  (clients || []).forEach((c) => {
    if (c.client_a_uuid) {
      nameByClient[c.client_a_uuid] = (c.business_name || c.name || 'Spot').trim();
      typeByClient[c.client_a_uuid] = ((c.client_type || '').toLowerCase());
    }
  });

  const shuffleInPlace = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const buckets = { place: [], restaurant: [], event: [] };
  const seenUrl = new Set();

  for (const row of postRows) {
    const rawImg =
      parseStorageImageUrl(row.post_image) ||
      ensureImageUrl(String(row.post_image).trim()) ||
      (row.post_image ? String(row.post_image).trim() : null);
    const image = resolvePublicImageUrl(rawImg) || rawImg;
    if (!image || seenUrl.has(image)) continue;
    seenUrl.add(image);
    const ct = typeByClient[row.client_a_uuid] || '';
    const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place';
    const name = nameByClient[row.client_a_uuid] || 'Spot';
    const typeLabel = type === 'restaurant' ? 'Food & drinks' : type === 'event' ? 'Event' : 'Explore';
    buckets[type].push({
      id: `${row.client_a_uuid}-${image.slice(-24)}`,
      name,
      type,
      typeLabel,
      image,
      clientId: row.client_a_uuid,
    });
  }

  shuffleInPlace(buckets.place);
  shuffleInPlace(buckets.restaurant);
  shuffleInPlace(buckets.event);

  const order = ['place', 'restaurant', 'event'];
  const merged = [];
  let guard = 0;
  while (merged.length < 18 && guard < 400) {
    guard += 1;
    let added = false;
    for (const t of order) {
      if (buckets[t].length > 0) {
        merged.push(buckets[t].shift());
        added = true;
        if (merged.length >= 18) break;
      }
    }
    if (!added) break;
  }

  shuffleInPlace(merged);
  void prefetchImageUrls(merged.map((p) => p.image).filter(Boolean)).catch(() => {});
  return merged;
}

/** Smaller / faster post fetch for first paint (same shape as fetchSpotPreviewsFromSupabase). */
export async function getCachedFeedImages() {
  try {
    const { data: postRows, error: postErr } = await supabase
      .from('posts')
      .select('client_a_uuid, post_image')
      .not('post_image', 'is', null)
      .not('client_a_uuid', 'is', null)
      .order('created_at', { ascending: false })
      .limit(48);
    if (postErr || !postRows?.length) return [];
    const clientIds = [...new Set(postRows.map((r) => r.client_a_uuid).filter(Boolean))];
    const { data: clients } = await supabase
      .from('client')
      .select('client_a_uuid, business_name, name, client_type')
      .in('client_a_uuid', clientIds);
    const nameByClient = {};
    const typeByClient = {};
    (clients || []).forEach((c) => {
      if (c.client_a_uuid) {
        nameByClient[c.client_a_uuid] = (c.business_name || c.name || 'Spot').trim();
        typeByClient[c.client_a_uuid] = (c.client_type || '').toLowerCase();
      }
    });
    const shuffleInPlace = (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const buckets = { place: [], restaurant: [], event: [] };
    const seenUrl = new Set();
    for (const row of postRows) {
      const rawImg =
        parseStorageImageUrl(row.post_image) ||
        ensureImageUrl(String(row.post_image).trim()) ||
        (row.post_image ? String(row.post_image).trim() : null);
      const image = resolvePublicImageUrl(rawImg) || rawImg;
      if (!image || seenUrl.has(image)) continue;
      seenUrl.add(image);
      const ct = typeByClient[row.client_a_uuid] || '';
      const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place';
      const name = nameByClient[row.client_a_uuid] || 'Spot';
      const typeLabel = type === 'restaurant' ? 'Food & drinks' : type === 'event' ? 'Event' : 'Explore';
      buckets[type].push({
        id: `${row.client_a_uuid}-${image.slice(-24)}`,
        name,
        type,
        typeLabel,
        image,
        clientId: row.client_a_uuid,
      });
    }
    shuffleInPlace(buckets.place);
    shuffleInPlace(buckets.restaurant);
    shuffleInPlace(buckets.event);
    const order = ['place', 'restaurant', 'event'];
    const merged = [];
    let guard = 0;
    while (merged.length < 12 && guard < 200) {
      guard += 1;
      let added = false;
      for (const t of order) {
        if (buckets[t].length > 0) {
          merged.push(buckets[t].shift());
          added = true;
          if (merged.length >= 12) break;
        }
      }
      if (!added) break;
    }
    shuffleInPlace(merged);
    void prefetchImageUrls(merged.map((p) => p.image).filter(Boolean)).catch(() => {});
    return merged;
  } catch {
    return [];
  }
}

// Enrich spot previews: client_image only (no post images) — used when we have Pinecone IDs
export async function enrichSpotPreviewsWithClientImages(previews) {
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
        const u = resolvePublicImageUrl(String(c.client_image).trim());
        if (u) imageByClientId[c.client_a_uuid] = u;
      }
    }
  });

  const enriched = previews.map((p) => {
    const url = p.clientId ? imageByClientId[p.clientId] : null;
    return url ? { ...p, image: url } : p;
  });
  void prefetchImageUrls(enriched.map((p) => p.image).filter(Boolean)).catch(() => {});
  return enriched;
}

// Build spot previews from plan spot names (for mock/fallback when Pinecone returns empty)
export function buildSpotPreviewsFromPlan(plan) {
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
export async function enrichPlanWithClientData(plan, pineconeMatches, loadedClientMarkers = [], enrichOptions = {}) {
  const quickFindLight =
    enrichOptions?.quickFindLight === true && Array.isArray(plan) && plan.length > 0 && plan.length <= 2
  const haversineKm = (a, b) => {
    if (!a || !b) return 0
    const R = 6371
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const aa =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2)
    return R * (2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa)))
  }

  const dedupePlanStops = (items) => {
    const picked = new Map()
    for (const item of items || []) {
      const typeKey = String(item?.type || '').toLowerCase().trim() || 'place'
      const timeKey = String(item?.time || '').toLowerCase().trim() || 'any'
      const clientIdKey = String(item?.clientId || '').trim()
      const spotKey = normName(item?.spot || '')
      const key = clientIdKey
        ? `${timeKey}::${typeKey}::cid::${clientIdKey}`
        : `${timeKey}::${typeKey}::spot::${spotKey}`
      if (!key || key.endsWith('::spot::')) {
        const fallbackKey = `${timeKey}::${typeKey}::raw::${String(item?.spot || '').trim().toLowerCase()}`
        if (!String(item?.spot || '').trim()) continue
        if (!picked.has(fallbackKey)) picked.set(fallbackKey, { item, score: 0 })
        continue
      }
      const coords = parsePlanItemCoords(item)
      const hasImage = !!resolvePublicImageUrl(item?.image)
      const score = (coords ? 3 : 0) + (hasImage ? 2 : 0) + (item?.clientId ? 1 : 0)
      const prev = picked.get(key)
      if (!prev || score > prev.score) {
        picked.set(key, { item, score })
      }
    }
    return Array.from(picked.values()).map((x) => x.item)
  }

  const parseBranchCoords = (raw) => {
    if (!raw) return []
    let parsed = raw
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        return []
      }
    }
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? Object.values(parsed)
        : []
    const out = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const fixed = unswapLatLng(
        entry.lat ?? entry.latitude ?? '',
        entry.long ?? entry.lng ?? entry.longitude ?? ''
      )
      if (!fixed) continue
      out.push({ lat: fixed.lat, lng: fixed.lng })
    }
    return out
  }

  const pickBestBranchForIndex = (items, idx, options) => {
    if (!Array.isArray(options) || options.length === 0) return null
    const prev = (() => {
      for (let i = idx - 1; i >= 0; i -= 1) {
        const c = parsePlanItemCoords(items[i])
        if (c) return c
      }
      return null
    })()
    const next = (() => {
      for (let i = idx + 1; i < items.length; i += 1) {
        const c = parsePlanItemCoords(items[i])
        if (c) return c
      }
      return null
    })()
    if (!prev && !next) return options[0]
    let best = options[0]
    let bestCost = Number.POSITIVE_INFINITY
    for (const opt of options) {
      const cost = (prev ? haversineKm(prev, opt) : 0) + (next ? haversineKm(opt, next) : 0)
      if (cost < bestCost) {
        bestCost = cost
        best = opt
      }
    }
    return best
  }

  // Step 1: Match from Pinecone for identity/image hints only (NOT coordinates).
  // Coordinates for map pins must come strictly from Supabase.
  let enriched = plan.map((item) => {
    const match = matchPlanToPinecone(item, pineconeMatches);
    const cachedCoords = resolveCoordsFromLoadedCache(
      { ...item, clientId: match?.clientId || item.clientId || null },
      loadedClientMarkers
    );
    return {
      ...item,
      image: match?.image || item.image || null,
      clientId: match?.clientId || item.clientId || null,
      rating: match?.rating != null ? match.rating : item.rating ?? null,
      lat: cachedCoords ? cachedCoords.lat : null,
      lng: cachedCoords ? cachedCoords.lng : null,
      eventMetadata: match?.eventMetadata ?? item.eventMetadata ?? null,
      ...(match?.isfoodtruck === true ? { isfoodtruck: true } : {}),
      ...(match?.restaurantMealType ? { restaurantMealType: match.restaurantMealType } : {}),
      ...(match?.restaurantFoodType ? { restaurantFoodType: match.restaurantFoodType } : {}),
    };
  });

  // Step 2: Fetch client images from Supabase (for matched clientIds); backfill coords from DB when still missing/invalid
  const clientIds = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
  let clientImageMap = {};
  /** Rows from the targeted `.in(clientIds)` fetch — reused in quick-find light mode instead of scanning 600 clients */
  let hydratedClientRows = []
  if (clientIds.length > 0) {
    const step2Select = quickFindLight
      ? 'client_a_uuid, client_image, client_type, lat, long, latitude, longitude, description, rating, business_name, name, business_name_ar'
      : 'client_a_uuid, client_image, client_type, lat, long, latitude, longitude'
    const { data: clients } = await supabase
      .from('client')
      .select(step2Select)
      .in('client_a_uuid', clientIds)
    hydratedClientRows = Array.isArray(clients) ? clients : []
    const coordByClientId = {};
    const clientTypeByUuid = {};
    hydratedClientRows.forEach((c) => {
      if (c.client_a_uuid && c.client_image) {
        const u = resolvePublicImageUrl(String(c.client_image).trim());
        if (u) clientImageMap[c.client_a_uuid] = u;
      }
      const u = unswapLatLng(c.lat ?? c.latitude, c.long ?? c.longitude ?? c.lng);
      if (u && c.client_a_uuid) coordByClientId[c.client_a_uuid] = u;
      if (c.client_a_uuid && c.client_type != null && String(c.client_type).trim() !== '') {
        clientTypeByUuid[c.client_a_uuid] = c.client_type;
      }
    });
    enriched = enriched.map((item) => {
      const u = item.clientId ? coordByClientId[item.clientId] : null;
      const ct = item.clientId ? clientTypeByUuid[item.clientId] : null;
      let next = item;
      if (ct != null && String(ct).trim() !== '') {
        next = { ...next, client_type: ct };
      }
      if (u) return { ...next, lat: u.lat, lng: u.lng };
      return next;
    });
  }

  // Step 3: Fetch clients from Supabase and force DB lat/long whenever we can match a client.
  // Quick-find light skips the heavy 600-row hydrate (still uses Step 2 rows + loaded markers + coords patch below).
  let clientsList = []
  if (quickFindLight) {
    clientsList = hydratedClientRows
  } else {
    const { data: allClients } = await supabase
      .from('client')
      .select('client_a_uuid, business_name, name, business_name_ar, client_image, client_type, rating, lat, long, latitude, longitude, description')
      .limit(600)
    clientsList = allClients || []
  }
  const clientById = new Map(clientsList.map((c) => [c.client_a_uuid, c]));
  enriched = enriched.map((item) => {
    let client = item.clientId ? clientById.get(item.clientId) : null;
    if (!client) {
      client = matchPlanToClient(item, clientsList);
    }
    if (!client) return item;
    const img = client.client_image ? resolvePublicImageUrl(String(client.client_image).trim()) : null;
    const dbCoords = parseCoordsFromClientRow(client);
    const descRaw = client.description != null ? String(client.description).trim() : ''
    const placeDescription = descRaw || (item.placeDescription != null ? String(item.placeDescription).trim() : '') || null
    return {
      ...item,
      image: resolvePublicImageUrl(item.image) || img,
      clientId: item.clientId || client.client_a_uuid,
      client_type: client.client_type ?? item.client_type ?? null,
      rating: item.rating != null ? item.rating : (client.rating != null ? client.rating : null),
      ...(placeDescription ? { placeDescription } : {}),
      ...(dbCoords ? { lat: dbCoords.lat, lng: dbCoords.lng } : {}),
    };
  });
  enriched = dedupePlanStops(enriched)
  const newIds = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))];
  for (const cid of newIds) {
    if (clientImageMap[cid]) continue;
    const c = clientById.get(cid);
    if (c?.client_image) {
      const u = resolvePublicImageUrl(String(c.client_image).trim());
      if (u) clientImageMap[cid] = u;
    }
  }

  let unresolved = enriched.filter((i) => !parsePlanItemCoords(i));
  if (unresolved.length > 0 && loadedClientMarkers.length > 0) {
    enriched = enriched.map((item) => {
      if (parsePlanItemCoords(item)) return item;
      const u = resolveCoordsFromLoadedCache(item, loadedClientMarkers);
      return u ? { ...item, lat: u.lat, lng: u.lng } : item;
    });
    unresolved = enriched.filter((i) => !parsePlanItemCoords(i));
  }

  const idsNeedingCoords = [...new Set(unresolved.filter((i) => i.clientId).map((i) => i.clientId))];
  if (idsNeedingCoords.length > 0) {
    const { data: locRows } = await supabase
      .from('client')
      .select('client_a_uuid, lat, long, latitude, longitude')
      .in('client_a_uuid', idsNeedingCoords);
    const coordById = {};
    (locRows || []).forEach((c) => {
      const u = parseCoordsFromClientRow(c);
      if (u && c.client_a_uuid) coordById[c.client_a_uuid] = u;
    });
    enriched = enriched.map((item) => {
      if (parsePlanItemCoords(item)) return item;
      const u = item.clientId ? coordById[item.clientId] : null;
      return u ? { ...item, lat: u.lat, lng: u.lng } : item;
    });
  }

  // Step 4: For restaurant stops, prefer branch coordinates that minimize route distance.
  const restaurantIds = [...new Set(
    enriched
      .filter((item) => String(item?.client_type || item?.type || '').toLowerCase().trim() === 'restaurant')
      .map((item) => item.clientId)
      .filter(Boolean)
  )]
  if (restaurantIds.length > 0) {
    let restRows = []
    const { data: directRows, error: directErr } = await supabase
      .from('restaurant_client')
      .select('a_uuid, branch, isfoodtruck, meal_type, food_type, speciality')
      .in('a_uuid', restaurantIds)
    if (!directErr && Array.isArray(directRows)) {
      restRows = directRows
    } else {
      const { data: fallbackRows } = await supabase
        .from('restaurant_client')
        .select('*')
        .in('a_uuid', restaurantIds)
      restRows = Array.isArray(fallbackRows) ? fallbackRows : []
    }
    const branchesById = {}
    const restaurantExtrasById = {}
    for (const row of restRows) {
      const id = row?.a_uuid || row?.client_a_uuid
      if (!id) continue
      const parsed = parseBranchCoords(row?.branch ?? row?.branches ?? null)
      if (parsed.length > 0) branchesById[id] = parsed
      restaurantExtrasById[id] = {
        isfoodtruck: row?.isfoodtruck === true || row?.isfoodtruck === 'true',
        meal_type: row?.meal_type,
        food_type: row?.food_type,
        speciality: row?.speciality,
      }
    }
    enriched = enriched.map((item, idx, arr) => {
      const isRestaurant = String(item?.client_type || item?.type || '').toLowerCase().trim() === 'restaurant'
      if (!isRestaurant || !item?.clientId) return item
      const ex = restaurantExtrasById[item.clientId]
      let next = { ...item }
      if (ex) {
        const ft = ex.isfoodtruck === true || ex.isfoodtruck === 'true'
        next = { ...next, isfoodtruck: ft }
        if (ex.meal_type != null && String(ex.meal_type).trim() !== '')
          next = { ...next, restaurantMealType: String(ex.meal_type).trim() }
        if (ex.food_type != null && String(ex.food_type).trim() !== '')
          next = { ...next, restaurantFoodType: String(ex.food_type).trim() }
      }
      const options = branchesById[item.clientId]
      if (!options || options.length === 0) return next
      const best = pickBestBranchForIndex(arr, idx, options)
      if (!best) return next
      return { ...next, lat: best.lat, lng: best.lng }
    })
  }

  // Step 5: Strict source-of-truth guard for map coordinates.
  // If a stop has no Supabase-backed coords, keep it off the map by leaving lat/lng null.
  enriched = enriched.map((item) => {
    const fixed = parsePlanItemCoords(item);
    if (!fixed) return { ...item, lat: null, lng: null };
    return item;
  });

  /** Step 6–7 post galleries skipped for quick-find light (saves sequential + batched posts queries). */
  const postImagesByClient = {}
  if (!quickFindLight) {
    const stillNoImage = enriched.filter((i) => !resolvePublicImageUrl(i.image) && i.clientId)
    if (stillNoImage.length > 0) {
      const postIds = [...new Set(stillNoImage.map((i) => i.clientId))]
      for (const cid of postIds) {
        if (clientImageMap[cid]) continue
        const { data: posts } = await supabase
          .from('posts')
          .select('post_image')
          .eq('client_a_uuid', cid)
          .not('post_image', 'is', null)
          .limit(3)
        const firstWithImage = (posts || []).find((p) => p.post_image)
        const raw = firstWithImage?.post_image
        if (!raw) continue
        let url = raw
        if (typeof raw === 'string' && raw.startsWith('[')) {
          try {
            const parsed = JSON.parse(raw)
            const arr = Array.isArray(parsed) ? parsed : [parsed]
            url = arr[0]?.url || (typeof arr[0] === 'string' ? arr[0] : raw)
          } catch {
            /* keep url */
          }
        }
        const fullUrl = resolvePublicImageUrl(String(url))
        if (fullUrl) clientImageMap[cid] = fullUrl
      }
    }

    const idsWithClient = [...new Set(enriched.map((i) => i.clientId).filter(Boolean))]
    if (idsWithClient.length > 0) {
      const { data: posts } = await supabase
        .from('posts')
        .select('client_a_uuid, post_image')
        .in('client_a_uuid', idsWithClient)
        .not('post_image', 'is', null)
        .order('created_at', { ascending: false })
        .limit(idsWithClient.length * 3)
      ;(posts || []).forEach((row) => {
        if (!row.post_image) return
        let url = row.post_image
        if (typeof url === 'string' && url.startsWith('[')) {
          try {
            const parsed = JSON.parse(url)
            url = Array.isArray(parsed) && parsed[0]?.url ? parsed[0].url : typeof parsed[0] === 'string' ? parsed[0] : url
          } catch {
            /* keep */
          }
        }
        url = resolvePublicImageUrl(String(url))
        if (url) {
          if (!postImagesByClient[row.client_a_uuid]) postImagesByClient[row.client_a_uuid] = []
          if (!postImagesByClient[row.client_a_uuid].includes(url)) postImagesByClient[row.client_a_uuid].push(url)
        }
      })
    }
  }

  return enriched.map((item) => {
    const primaryRaw =
      item.image ||
      (item.clientId ? clientImageMap[item.clientId] : null) ||
      null;
    const primary = resolvePublicImageUrl(primaryRaw);
    const postUrls = (item.clientId ? postImagesByClient[item.clientId] : null) || [];
    const allImages = [primary, ...postUrls.map((u) => resolvePublicImageUrl(u)).filter(Boolean)].filter(Boolean);
    const seen = new Set();
    const images = allImages.filter((u) => {
      if (!u || seen.has(u)) return false;
      seen.add(u);
      return true;
    });
    return {
      ...item,
      image: primary,
      images: images.length > 0 ? images : (primary ? [primary] : []),
    };
  });
}
