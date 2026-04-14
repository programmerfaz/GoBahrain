import { OPENAI_KEY, PINECONE_KEY, PINECONE_HOST, OPENAI_PLAN_MODEL } from '../config/keys';
import { supabase } from '../config/supabase';

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

async function getEmbedding(text) {
  const res = await fetchWithTimeout(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const json = await parseJsonResponse(res, 'OpenAI');
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI embed error (${res.status})`);
  const embedding = json?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) throw new Error('No embedding returned');
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

// ─── Step 1: Places (from preferences) ─────────────────────────────

export async function fetchPlaces(preferenceLabels) {
  try {
    const text =
      preferenceLabels.length > 0
        ? `Places in Bahrain for ${preferenceLabels.join(', ')}`
        : 'Popular places and things to do in Bahrain';

    const embedding = await getEmbedding(text);

    // First try with client_type = place
    let places = await queryPineconeSafe(embedding, 8, {
      record_type: { $eq: 'client' },
      client_type: { $eq: 'place' },
    });

    // If no results, fallback: fetch without client_type filter (rely on embedding similarity)
    if (places.length === 0) {
      const all = await queryPineconeSafe(embedding, 16, {
        record_type: { $eq: 'client' },
      });
      places = all
        .filter((m) => (m.metadata?.client_type || '').toLowerCase() !== 'restaurant')
        .slice(0, 8);
    }

    // If still nothing, just get any 8 clients from the broader pool
    if (places.length === 0) {
      const all = await queryPineconeSafe(embedding, 16, {
        record_type: { $eq: 'client' },
      });
      places = all.slice(0, 8);
    }

    return places;
  } catch (e) {
    console.warn('[fetchPlaces] failed:', e?.message);
    return [];
  }
}

// ─── Step 2: Restaurants (from food preferences) ────────────────────

export async function fetchRestaurants(foodLabels) {
  try {
    const text =
      foodLabels.length > 0
        ? `Restaurants in Bahrain serving ${foodLabels.join(', ')}`
        : 'Best restaurants and food spots in Bahrain';

    const embedding = await getEmbedding(text);

    // Map UI labels to exact Pinecone cuisine_type values
    const cuisineMap = {
      Cuisine: 'Cuisine',
      Seafood: 'Seafood',
      American: 'American',
      International: 'International',
      Cafe: 'Cafe',
      Asian: 'Asian',
      Italian: 'Italian',
      'South Asian': 'SouthAsian',
      'Fast Food': 'Fastfood',
    };

    const fetchByCuisineField = async (pineconeValue) => {
      let filtered = await queryPineconeSafe(embedding, 12, {
        client_type: { $eq: 'restaurant' },
        cuisine: { $eq: pineconeValue },
      });
      if (filtered.length === 0) {
        filtered = await queryPineconeSafe(embedding, 12, {
          client_type: { $eq: 'restaurant' },
          cuisine_type: { $eq: pineconeValue },
        });
      }
      return filtered;
    };

    if (foodLabels.length > 0) {
      const seen = new Set();
      const exactMatches = [];
      const similarMatches = [];

      for (const label of foodLabels) {
        const pineconeValue = cuisineMap[label] || label;
        const filtered = await fetchByCuisineField(pineconeValue);
        for (const m of filtered) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            exactMatches.push(m);
          }
        }
      }

      const nearest = await queryPineconeSafe(embedding, 12, {
        client_type: { $eq: 'restaurant' },
      });
      for (const m of nearest) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          similarMatches.push(m);
        }
      }

      return [...exactMatches, ...similarMatches];
    }

    return queryPineconeSafe(embedding, 12, {
      client_type: { $eq: 'restaurant' },
    });
  } catch (e) {
    console.warn('[fetchRestaurants] failed:', e?.message);
    return [];
  }
}

// ─── Step 3: Breakfast spots ────────────────────────────────────────

export async function fetchBreakfastSpots() {
  try {
    const text = 'Breakfast cafes and bakeries in Bahrain';
    const embedding = await getEmbedding(text);

    const spots = await queryPineconeSafe(embedding, 3, {
      client_type: { $eq: 'restaurant' },
      meal_type: { $eq: 'Breakfast' },
    });

    if (spots.length === 0) {
      return queryPineconeSafe(embedding, 3, {
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

export async function fetchEvents(preferenceLabels) {
  try {
    const text =
      preferenceLabels.length > 0
        ? `Events in Bahrain related to ${preferenceLabels.join(', ')}`
        : 'Popular events and activities happening in Bahrain';

    const embedding = await getEmbedding(text);

    const events = await queryPineconeSafe(embedding, 6, {
      record_type: { $eq: 'event' },
    });

    console.log(`[Events] Found ${events.length} events`);
    events.forEach(m => console.log(`  → ${m.metadata?.event_name || m.metadata?.business_name} (${m.metadata?.start_time} - ${m.metadata?.end_time})`));

    return events;
  } catch (e) {
    console.warn('[Events] fetchEvents failed:', e?.message);
    return [];
  }
}

// ─── Pinecone places for Khalid chat (only recommend these) ─────

/**
 * Fetches places, restaurants, and events from Pinecone relevant to the user message.
 * Optional user preferences bias the query (prioritize) but do not filter — we still return a mix.
 * Returns a string to inject into the chatbot system prompt so Khalid only talks about these.
 */
export async function fetchPineconePlacesForChat(userMessage, options = {}) {
  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
    return '';
  }
  const text = userMessage.trim();
  const generalLabels = options.generalLabels || [];
  const activityLabels = options.activityLabels || [];
  const foodLabels = options.foodLabels || [];
  const preferenceParts = [];
  if (generalLabels.length) preferenceParts.push(`About them: ${generalLabels.join(', ')}`);
  if (activityLabels.length) preferenceParts.push(`Activities they like: ${activityLabels.join(', ')}`);
  if (foodLabels.length) preferenceParts.push(`Food they like: ${foodLabels.join(', ')}`);
  const queryText = preferenceParts.length
    ? `${text}. ${preferenceParts.join('. ')}`
    : text;
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
      queryPineconeSafe(embedding, 12, { record_type: { $eq: 'client' }, client_type: { $eq: 'place' } }),
      queryPineconeSafe(embedding, 12, { record_type: { $eq: 'client' }, client_type: { $eq: 'restaurant' } }),
      queryPineconeSafe(embedding, 8, { record_type: { $eq: 'event' } }),
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
    const desc = m.description ? ` — ${String(m.description).slice(0, 80)}` : '';
    const extra = m.cuisine || m.cuisine_type ? ` (${m.cuisine || m.cuisine_type})` : m.venue ? ` at ${m.venue}` : '';
    lines.push(`- ${name}${extra}${desc}`);
  };
  places.forEach((m) => add(m, 'place'));
  restaurants.forEach((m) => add(m, 'restaurant'));
  events.forEach((m) => add(m, 'event'));
  if (lines.length === 0) return '';
  return `ALLOWED PLACES (you may ONLY recommend, mention, or talk about these — do not suggest any other place, restaurant, or event):\n${lines.join('\n')}\n\nIf the user asks about somewhere not in this list, say you only have info on the places above and suggest one of them if relevant.`;
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
  const withCoords = rows
    .map((row) => {
      const lat = parseFloat(row.lat ?? row.latitude ?? '');
      const long = parseFloat(row.long ?? row.longitude ?? row.lng ?? '');
      if (isNaN(lat) || isNaN(long)) return null;
      return { ...row, lat, lng: long, long };
    })
    .filter(Boolean);
  return withCoords;
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

// ─── Step 4: GPT smart day plan from combined records ───────────

function formatMatchForPrompt(match, idx) {
  const m = match.metadata || {};
  const name = m.event_name || m.business_name || m.name || m.place_name || `Place ${idx + 1}`;
  const lat = m.lat || m.latitude || m.Lat || '';
  const lng = m.long || m.longitude || m.lng || m.Long || '';
  const isEvent = m.record_type === 'event';
  const parts = [`${idx + 1}. ${name}`];
  if (isEvent) parts.push(`[EVENT]`);
  if (lat && lng) parts.push(`Lat: ${lat} | Lng: ${lng}`);
  if (m.client_type) parts.push(`Type: ${m.client_type}`);
  if (m.description) parts.push(`Desc: ${m.description}`);
  if (m.cuisine || m.cuisine_type) parts.push(`Cuisine: ${m.cuisine || m.cuisine_type}`);
  if (m.price_range) parts.push(`Price: ${m.price_range}`);
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
  const mealType = m.meal_type || m.mealType;
  if (mealType) parts.push(`MealType: ${mealType}`);
  return parts.join(' | ');
}

const MAX_MATCHES_FOR_PLAN = 28
const CAP_EVENTS = 8
const CAP_BREAKFAST = 4
const CAP_PLACES = 10
const CAP_RESTAURANTS = 14

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

/**
 * Prefer high-similarity Pinecone hits across buckets so events/breakfast are not drowned out by restaurants.
 */
function selectMatchesForPlan(places, restaurants, breakfastSpots, events) {
  const eventsU = dedupeSortedByScore(events).slice(0, CAP_EVENTS)
  const breakfastU = dedupeSortedByScore(breakfastSpots).slice(0, CAP_BREAKFAST)
  const placesU = dedupeSortedByScore(places).slice(0, CAP_PLACES)
  const restaurantsU = dedupeSortedByScore(restaurants).slice(0, CAP_RESTAURANTS)
  const merged = [...eventsU, ...breakfastU, ...placesU, ...restaurantsU]
  const seen = new Set()
  const final = []
  for (const m of merged) {
    const k = stableMatchKey(m)
    if (seen.has(k)) continue
    seen.add(k)
    final.push(m)
  }
  return final.slice(0, MAX_MATCHES_FOR_PLAN)
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
  if (!Array.isArray(plan) || plan.length < 4) return { ok: false, reason: 'Plan missing or too short' }
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

const buildProfileSection = (personalization) => {
  const g = personalization?.profileGeneral
  const a = personalization?.profileActivity
  const f = personalization?.profileFood
  const hasG = Array.isArray(g) && g.length > 0
  const hasA = Array.isArray(a) && a.length > 0
  const hasF = Array.isArray(f) && f.length > 0
  if (!hasG && !hasA && !hasF) {
    return 'No saved onboarding profile is available — rely only on the choices below and the catalog.'
  }
  const lines = []
  lines.push('═══ USER PROFILE (saved — personalize tone and picks) ═══')
  if (hasG) lines.push(`General vibe / lifestyle: ${g.join(', ')} — reflect this in reasons and pacing (relaxed vs packed, family-friendly vs nightlife, etc.).`)
  if (hasA) lines.push(`They usually enjoy: ${a.join(', ')} — align extra stops and descriptions with these when compatible with today’s activity picks.`)
  if (hasF) lines.push(`They often like to eat: ${f.join(', ')} — use as a soft bias for meal personality even when today’s food picker differs.`)
  lines.push('If today’s explicit picks conflict, today’s picks win — but still keep the day feeling like it was built for this person.')
  return lines.join('\n')
}

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

/**
 * @param {object} [personalization]
 * @param {string[]} [personalization.profileGeneral] — onboarding general labels
 * @param {string[]} [personalization.profileActivity] — onboarding activity labels
 * @param {string[]} [personalization.profileFood] — onboarding food labels
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
  const limitedMatches = selectMatchesForPlan(places, restaurants, breakfastSpots, events)
  const placesText = limitedMatches.map((m, i) => formatMatchForPrompt(m, i)).join('\n')
  const catalogLower = catalogNameList(limitedMatches).map((n) => normalizeSpot(n))

  const hasPref = prefLabels.length > 0
  const hasFood = foodLabels.length > 0
  const hasEvents = events.length > 0
  const profileSection = buildProfileSection(personalization)

  const systemPrompt = `You are Khalid, a warm and friendly Bahraini local who absolutely loves showing visitors his beautiful island. You speak like a real friend — not a tour guide reading a brochure. Sprinkle in local Bahraini flavor ("habibi", "yalla", "inshallah", "wallah") naturally.

YOU ARE GIVEN ${limitedMatches.length} real places, restaurants, and events in Bahrain. Your job is to build a FULL-DAY plan tailored to this user.

${profileSection}

═══ MANDATORY MINIMUM (always include) ═══
1. BREAKFAST spot (Morning) — a cafe, bakery, or breakfast restaurant
2. LUNCH spot (Afternoon) — a restaurant for a proper meal
3. DINNER spot (Evening) — a restaurant for dinner
4. 3 PLACES to visit — sightseeing, cultural, nature, shopping, etc. spread across Morning, Afternoon, and Evening

That is 6 stops minimum (3 meals + 3 places). You may add 7–9 stops if the catalog supports a richer day.

═══ TODAY’S PICKS (this session — highest priority) ═══
${hasPref ? `🎯 Activity preferences: ${prefLabels.join(', ')}
The user selected these for THIS plan. You MUST pick places that match them. "Instagram" → photogenic/trendy; "Sightseeing" → landmarks; "Cultural" → heritage; match their vibe.` : 'No specific activity preferences for this plan — choose a fun diverse mix (culture, shopping, sightseeing, nature).'}

${hasFood ? `🍽️ Food preferences: ${foodLabels.join(', ')}
They want ${foodLabels.join(' and ')} food for this plan.
IMPORTANT: Some restaurants are exact cuisine matches. Include AT LEAST ONE exact-match restaurant. Do not skip every exact-match option.` : 'No specific food preference for this plan — offer a nice variety across breakfast, lunch, and dinner.'}

═══ BREAKFAST SELECTION RULE ═══
Some rows include MealType with "Breakfast". Logic:
1. If an exact cuisine-match restaurant has Breakfast in MealType → prefer it for breakfast.
2. Else pick a row with MealType Breakfast from the catalog.
3. NEVER skip breakfast.

═══ EVENTS ═══
${hasEvents ? `Items marked [EVENT] are real events.
CRITICAL EVENT TIMING:
- Respect StartTime / EndTime. Afternoon starts ~after noon; evening ~from 5 PM onward unless the event times say otherwise.
- Never schedule an event outside its time window.
- Use the event’s coordinates from the catalog.` : 'No events in the current catalog slice.'}

═══ SCHEDULING (Bahrain is compact — no route optimization) ═══
Morning: breakfast first, then a place.
Afternoon: lunch, then place(s) — favour indoor/chill mid-day when it fits the user.
Evening: a place then dinner (or dinner then a stroll-type place if it fits events).

═══ SMART RULES ═══
- NEVER recommend a place marked "closed".
- Mix ratings — not only the top-rated; include variety in price (see Price field).
- If two stops are redundant (e.g. two similar malls), pick ONE.
- Every "spot" string MUST be copied verbatim from the numbered catalog lines (the text before the first " | " on each line). Do not invent or shorten names.
- Copy lat and lng EXACTLY from the same catalog line as that spot.

═══ OUTPUT FORMAT ═══
Each stop: "spot", "time" (Morning|Afternoon|Evening), "type" (place|restaurant|event), "lat", "lng", "reason" (1–2 warm sentences, personalized where possible).

Bahrain lat ~26, lng ~50 — never swap.

Reply ONLY with a valid JSON array — no markdown, no prose outside the array:
[
  { "spot": "Name", "time": "Morning", "type": "restaurant", "lat": 26.xxx, "lng": 50.xxx, "reason": "..." }
]`;

  const userMsg = `${hasPref ? `🎯 Today’s activity preferences: ${prefLabels.join(', ')}` : '🎯 Today: no activity prefs — diverse mix'}
${hasFood ? `🍽️ Today’s food types: ${foodLabels.join(', ')}` : '🍽️ Today: open on food'}

Catalog (${limitedMatches.length} rows):
${placesText}

Build Khalid’s perfect personalized day. Minimum 3 meals + 3 places. Include 1–2 events when the catalog has [EVENT] rows and timing fits.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ]

  let raw = await openAiPlanCompletion(messages, {})
  let plan = parsePlanFromRaw(raw)
  let validation = plan ? validatePlan(plan, catalogLower) : { ok: false, reason: 'Parse failed' }

  if (!validation.ok) {
    const repairUser = `Your previous reply was invalid: ${validation.reason}

Return ONLY a valid JSON array. Each "spot" must match a name from the catalog (exact string from the start of a catalog line before " | ").

Catalog names for reference:
${catalogNameList(limitedMatches).slice(0, 40).join('\n')}`
    messages.push({ role: 'assistant', content: raw })
    messages.push({ role: 'user', content: repairUser })
    raw = await openAiPlanCompletion(messages, {})
    plan = parsePlanFromRaw(raw)
    validation = plan ? validatePlan(plan, catalogLower) : { ok: false, reason: 'Parse failed on retry' }
    if (!validation.ok) throw new Error(validation.reason || 'Could not parse day plan')
  }

  return plan
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
      return await queryPineconeSafe(embedding, 80, { record_type: { $eq: 'event' } })
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

  let fetched = []
  try {
    if (slot.type === 'place') {
      const labels = [...new Set([...sessionActivity, ...profileActivity])]
      fetched = await fetchPlaces(labels)
    } else if (slot.type === 'restaurant') {
      const labels = [...new Set([...sessionFood, ...profileFood])]
      fetched = await fetchRestaurants(labels)
    } else if (slot.type === 'event') {
      const labels = [...new Set([...sessionActivity, ...profileActivity])]
      fetched = await fetchEvents(labels)
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
      const broad = await fetchPlaces([])
      fetched = mergeCatalogForEnrich(broad, fetched)
      candidates = buildCandidatesFromPool(broad)
    } catch (_) {
      /* ignore */
    }
  }

  if (candidates.length === 0 && slot.type === 'restaurant') {
    try {
      const broad = await fetchRestaurants([])
      fetched = mergeCatalogForEnrich(broad, fetched)
      candidates = buildCandidatesFromPool(broad)
    } catch (_) {
      /* ignore */
    }
  }

  if (candidates.length === 0 && slot.type === 'event') {
    try {
      const broad = await fetchEvents([])
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

  const prefLine =
    slot.type === 'place'
      ? `User activity preferences (places must fit this vibe): ${[...sessionActivity, ...profileActivity].join(', ') || 'diverse Bahrain places'}.`
      : slot.type === 'restaurant'
        ? `User food preferences: ${[...sessionFood, ...profileFood].join(', ') || 'varied dining'}.`
        : `User interests for events: ${[...sessionActivity, ...profileActivity].join(', ') || 'things to do in Bahrain'}.`

  const systemPrompt = `You are Khalid, a friendly Bahraini local. Pick ONE replacement stop for an existing day plan.

${profileSection}

${prefLine}

RULES:
- Reply ONLY with a single JSON object (not an array, no markdown): spot, time, type, lat, lng, reason
- "spot" must be copied EXACTLY from the start of one catalog line (before the first " | ")
- "time" MUST be exactly: "${slot.time}"
- "type" MUST be exactly: "${slot.type}"
- lat and lng MUST be copied EXACTLY from the same catalog line as the chosen spot
- "reason": 1–2 warm sentences (habibi / yalla ok).
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

Return ONLY one JSON object with keys spot, time, type, lat, lng, reason.
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

  return {
    replacement: {
      spot: row.spot,
      time: row.time,
      type: row.type,
      lat: Number(row.lat),
      lng: Number(row.lng),
      reason: row.reason || 'A fresh pick for your day — yalla!',
    },
    enrichCatalog,
  }
}
