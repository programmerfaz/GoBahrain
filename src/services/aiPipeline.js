import { OPENAI_KEY, PINECONE_KEY, PINECONE_HOST } from '../config/keys';
import { supabase } from '../config/supabase';

const OPENAI_API_KEY = OPENAI_KEY;
const PINECONE_API_KEY = PINECONE_KEY;

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const PINECONE_QUERY_URL = `${PINECONE_HOST}/query`;

// ─── helpers ────────────────────────────────────────────────────────

async function getEmbedding(text) {
  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI embed error (${res.status})`);
  const embedding = json?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) throw new Error('No embedding returned');
  return embedding;
}

async function queryPinecone(vector, topK, filter) {
  const res = await fetch(PINECONE_QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': PINECONE_API_KEY,
    },
    body: JSON.stringify({
      vector,
      topK,
      filter,
      includeMetadata: true,
      namespace: '',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || `Pinecone error (${res.status})`);
  return json.matches || [];
}

// ─── Step 1: Places (from preferences) ─────────────────────────────

export async function fetchPlaces(preferenceLabels) {
  const text =
    preferenceLabels.length > 0
      ? `Places in Bahrain for ${preferenceLabels.join(', ')}`
      : 'Popular places and things to do in Bahrain';

  const embedding = await getEmbedding(text);

  // First try with client_type = place
  let places = await queryPinecone(embedding, 6, {
    record_type: { $eq: 'client' },
    client_type: { $eq: 'place' },
  });

  // If no results, fallback: fetch without client_type filter (rely on embedding similarity)
  if (places.length === 0) {
    const all = await queryPinecone(embedding, 12, {
      record_type: { $eq: 'client' },
    });
    places = all.filter(
      (m) => (m.metadata?.client_type || '').toLowerCase() !== 'restaurant'
    ).slice(0, 6);
  }

  // If still nothing, just get any 6 non-restaurant clients
  if (places.length === 0) {
    const all = await queryPinecone(embedding, 12, {
      record_type: { $eq: 'client' },
    });
    places = all.slice(0, 6);
  }

  return places;
}

// ─── Step 2: Restaurants (from food preferences) ────────────────────

export async function fetchRestaurants(foodLabels) {
  const text =
    foodLabels.length > 0
      ? `Restaurants in Bahrain serving ${foodLabels.join(', ')}`
      : 'Best restaurants and food spots in Bahrain';

  const embedding = await getEmbedding(text);

  // Map UI labels to exact Pinecone cuisine_type values
  const cuisineMap = {
    'Cuisine': 'Cuisine',
    'Seafood': 'Seafood',
    'American': 'American',
    'International': 'International',
    'Cafe': 'Cafe',
    'Asian': 'Asian',
    'Italian': 'Italian',
    'South Asian': 'SouthAsian',
    'Fast Food': 'Fastfood',
  };

  if (foodLabels.length > 0) {
    const seen = new Set();
    let exactMatches = [];
    let similarMatches = [];

    // 1) Fetch ALL restaurants matching the exact cuisine_type
    for (const label of foodLabels) {
      const pineconeValue = cuisineMap[label] || label;
      console.log(`[Restaurant] Querying cuisine_type = "${pineconeValue}"`);
      const filtered = await queryPinecone(embedding, 10, {
        client_type: { $eq: 'restaurant' },
        cuisine: { $eq: pineconeValue },
      });
      console.log(`[Restaurant] Exact matches for "${pineconeValue}": ${filtered.length}`);
      filtered.forEach(m => console.log(`  → ${m.metadata?.business_name || m.metadata?.name} (cuisine: ${m.metadata?.cuisine || m.metadata?.cuisine_type})`));
      for (const m of filtered) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          exactMatches.push(m);
        }
      }
    }

    // 2) Also fetch 6 nearest vector-similar restaurants (any cuisine)
    const nearest = await queryPinecone(embedding, 6, {
      client_type: { $eq: 'restaurant' },
    });
    console.log(`[Restaurant] Similar matches (no cuisine filter): ${nearest.length}`);
    nearest.forEach(m => console.log(`  → ${m.metadata?.business_name || m.metadata?.name} (cuisine: ${m.metadata?.cuisine || m.metadata?.cuisine_type})`));
    for (const m of nearest) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        similarMatches.push(m);
      }
    }

    console.log(`[Restaurant] TOTAL sending to GPT: ${exactMatches.length} exact + ${similarMatches.length} similar = ${exactMatches.length + similarMatches.length}`);
    return [...exactMatches, ...similarMatches];
  }

  return queryPinecone(embedding, 6, {
    client_type: { $eq: 'restaurant' },
  });
}

// ─── Step 3: Breakfast spots ────────────────────────────────────────

export async function fetchBreakfastSpots() {
  const text = 'Breakfast cafes and bakeries in Bahrain';
  const embedding = await getEmbedding(text);

  const spots = await queryPinecone(embedding, 2, {
    client_type: { $eq: 'restaurant' },
    meal_type: { $eq: 'Breakfast' },
  });

  // Fallback: if exact meal_type filter returns nothing, try vector similarity
  if (spots.length === 0) {
    const fallback = await queryPinecone(embedding, 2, {
      client_type: { $eq: 'restaurant' },
    });
    console.log(`[Breakfast] Fallback: ${fallback.length} spots`);
    return fallback;
  }

  console.log(`[Breakfast] Found ${spots.length} breakfast spots`);
  spots.forEach(m => console.log(`  → ${m.metadata?.business_name} (meal_type: ${m.metadata?.meal_type})`));
  return spots;
}

// ─── Step 4: Events ─────────────────────────────────────────────────

export async function fetchEvents(preferenceLabels) {
  const text =
    preferenceLabels.length > 0
      ? `Events in Bahrain related to ${preferenceLabels.join(', ')}`
      : 'Popular events and activities happening in Bahrain';

  const embedding = await getEmbedding(text);

  const events = await queryPinecone(embedding, 4, {
    record_type: { $eq: 'event' },
  });

  console.log(`[Events] Found ${events.length} events`);
  events.forEach(m => console.log(`  → ${m.metadata?.event_name || m.metadata?.business_name} (${m.metadata?.start_time} - ${m.metadata?.end_time})`));

  return events;
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
      queryPinecone(embedding, 10, { record_type: { $eq: 'client' }, client_type: { $eq: 'place' } }),
      queryPinecone(embedding, 10, { record_type: { $eq: 'client' }, client_type: { $eq: 'restaurant' } }),
      queryPinecone(embedding, 6, { record_type: { $eq: 'event' } }),
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
  { name: 'Bahrain International Circuit', lat: 26.0322, lng: 50.5099, category: 'Sports', description: 'First F1 Grand Prix in the Middle East. Sakhir Tower offers 360° track views.' },
  { name: 'Beit Al Quran', lat: 26.2233, lng: 50.5833, category: 'Museum', description: 'Houses one of the finest collections of ancient Qurans in the region.' },
  { name: 'Manama Souq', lat: 26.2283, lng: 50.5783, category: 'Heritage', description: 'Traditional marketplace with narrow streets, local crafts, and authentic Bahraini atmosphere.' },
  { name: 'Bahrain Pearling Trail', lat: 26.2333, lng: 50.5500, category: 'UNESCO Heritage', description: 'UNESCO World Heritage Site. Historic pearling tradition of the Gulf.' },
];

export async function fetchLandmarks() {
  const text = 'Famous landmarks, heritage sites, museums, iconic buildings, and tourist attractions in Bahrain';
  const embedding = await getEmbedding(text);
  const places = await queryPinecone(embedding, 10, {
    record_type: { $eq: 'client' },
    client_type: { $eq: 'place' },
  });
  return places;
}

// ─── Nearby POIs for AR (from clients table) ────────────────────

function getLatLng(m) {
  const lat = parseFloat(m.lat ?? m.latitude ?? m.Lat ?? '');
  const lng = parseFloat(m.long ?? m.longitude ?? m.lng ?? m.Long ?? '');
  return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
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

export async function fetchNearbyPOIs(userLat, userLng, mode = 'all') {
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
      _isLandmark: _type === 'landmark' || (row.category && ['UNESCO Heritage', 'Landmark', 'Museum', 'Heritage', 'Natural Wonder'].includes(row.category)),
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
        _isLandmark: item._isLandmark || (type === 'landmark') || (item.category && ['UNESCO Heritage', 'Landmark', 'Museum', 'Heritage', 'Natural Wonder'].includes(item.category)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, mode === 'all' ? 16 : 12);
  return withCoords;
}

// ─── Step 4: GPT smart day plan from combined records ───────────

function formatMatchForPrompt(match, idx) {
  const m = match.metadata || {};
  const name = m.event_name || m.business_name || m.name || `Place ${idx + 1}`;
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
  return parts.join(' | ');
}

export async function generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels) {
  const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
  const MAX_MATCHES_FOR_PLAN = 18;
  const limitedMatches = allMatches.slice(0, MAX_MATCHES_FOR_PLAN);

  const placesText = limitedMatches.map((m, i) => formatMatchForPrompt(m, i)).join('\n');

  const hasPref = prefLabels.length > 0;
  const hasFood = foodLabels.length > 0;
  const hasEvents = events.length > 0;

  const systemPrompt = `You are Khalid, a warm and friendly Bahraini local who absolutely loves showing visitors his beautiful island. You speak like a real friend — not a tour guide reading a brochure. Sprinkle in local Bahraini flavor ("habibi", "yalla", "inshallah", "wallah") naturally.

YOU ARE GIVEN ${limitedMatches.length} real places, restaurants, and events in Bahrain. Your job is to build a FULL-DAY plan.

═══ MANDATORY MINIMUM (always include) ═══
1. BREAKFAST spot (Morning) — a cafe, bakery, or breakfast restaurant
2. LUNCH spot (Afternoon) — a restaurant for a proper meal
3. DINNER spot (Evening) — a restaurant for dinner
4. 3 PLACES to visit — sightseeing, cultural, nature, shopping, etc. spread across Morning, Afternoon, and Evening

That is 6 stops minimum (3 meals + 3 places). But you are NOT limited to 6 — if the list has great options, feel free to add 7, 8, or even 9 stops. Khalid loves showing off his island, so more is welcome if it fits naturally into the day!

═══ WHAT THE USER CHOSE ═══
${hasPref ? `🎯 Activity preferences: ${prefLabels.join(', ')}
The user specifically selected these interests. You MUST pick places that match these preferences. If the user chose "Instagram" pick photogenic/trendy spots. If they chose "Sightseeing" pick iconic landmarks. If they chose "Cultural" pick heritage sites. Match their vibe!` : 'The user did not pick specific preferences — choose a fun diverse mix of places (culture, shopping, sightseeing, nature).'}

${hasFood ? `🍽️ Food preferences: ${foodLabels.join(', ')}
The user specifically wants to eat ${foodLabels.join(' and ')} food.
IMPORTANT: In the list below, some restaurants are EXACT cuisine matches (their cuisine_type matches what the user asked for). You MUST include AT LEAST 1 of these exact-match restaurants in the plan. You can also pick other restaurants from the list for variety, but the user's cuisine choice MUST be represented. Do NOT skip all the exact-match restaurants.` : 'The user has no specific food preference — surprise them with a nice variety across breakfast, lunch, and dinner.'}

═══ BREAKFAST SELECTION RULE ═══
Some restaurants in the list have a "meal_type" field that includes "Breakfast". Follow this logic:
1. FIRST check: does any restaurant matching the user's preferred cuisine (exact cuisine match) have "Breakfast" in its meal_type? If YES → use that as the breakfast spot.
2. If NO cuisine-match restaurant serves breakfast → pick one of the dedicated breakfast spots marked with meal_type "Breakfast" from the list.
3. NEVER skip breakfast. There is always at least one breakfast option in the data.

═══ EVENTS ═══
${hasEvents ? `Some items marked [EVENT] are real events happening in Bahrain. Try to fit 1-2 events into the day plan if they match the user's vibe.
CRITICAL EVENT TIMING RULES:
- Each event has a StartTime and EndTime. You MUST respect these times.
- If an event starts at 2:00 PM (14:00), it belongs in the Afternoon — NEVER put it in the Morning.
- If an event starts at 7:00 PM (19:00), it belongs in the Evening — NEVER put it in the Afternoon.
- If an event runs 5PM-12AM, schedule it in the Evening.
- NEVER suggest an event at a time outside its StartTime–EndTime window.
- Use the event's venue and coordinates for the location.` : 'No events available right now.'}

═══ SCHEDULING RULES ═══
Morning (roughly 8 AM – 12 PM):
  → Breakfast cafe/restaurant FIRST, then a place to visit (outdoor, cultural — cooler weather)
Afternoon (roughly 12 PM – 5 PM):
  → Lunch restaurant, then 1-2 indoor or chill activities (malls, museums, galleries — escape the heat)
Evening (roughly 5 PM – 10 PM):
  → A place to visit (seaside walk, souq, rooftop), then dinner restaurant

═══ SMART RULES ═══
- NEVER recommend a place marked "closed".
- Do NOT always pick the highest-rated. Mix hidden gems, budget spots, and premium ones.
- If two places serve the same purpose (e.g. two malls), pick ONE.
- The day should flow geographically — don't zigzag across the island.
- Consider price range — mix affordable and upscale.
- Restaurants: classify them as breakfast, lunch, or dinner based on their type/cuisine. A cafe = breakfast. A fine dining = dinner. Use common sense.

═══ OUTPUT FORMAT ═══
For each stop return:
- "spot": exact place/event name from the list (do NOT invent names)
- "time": "Morning" | "Afternoon" | "Evening"
- "type": "place" | "restaurant" | "event"
- "lat": the latitude number from the data (copy it exactly as given)
- "lng": the longitude number from the data (copy it exactly as given)
- "reason": a warm 1-2 sentence description of WHY you chose this spot for this time. For events, mention the event vibe and timing.

IMPORTANT: You MUST include "lat" and "lng" for every spot. Copy the Lat/Lng values exactly from the place data provided.

Reply ONLY with a valid JSON array, NO markdown, NO extra text:
[
  { "spot": "Name", "time": "Morning", "type": "restaurant", "lat": 26.xxx, "lng": 50.xxx, "reason": "..." },
  { "spot": "Name", "time": "Afternoon", "type": "event", "lat": 26.xxx, "lng": 50.xxx, "reason": "..." },
  ...
]`;

  const userMsg = `${hasPref ? `🎯 The user selected these activity preferences: ${prefLabels.join(', ')} — MUST include places matching these.` : 'No activity preferences selected — surprise me with a diverse mix!'}
${hasFood ? `🍽️ The user selected these food types: ${foodLabels.join(', ')} — MUST include restaurants serving these cuisines.` : 'No food preference selected — open to anything.'}

Here are ${limitedMatches.length} available places, restaurants & events in Bahrain:
${placesText}

Build Khalid's perfect day. Remember: the user's selected preferences and food types are NON-NEGOTIABLE — include them. Minimum 3 meals (breakfast, lunch, dinner) + 3 places. Also try to include 1-2 events if they fit the timing!`;

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.8,
      max_tokens: 900,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `GPT error (${res.status})`);

  const raw = json?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty GPT response');

  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (_) {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    plan = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  }
  if (!Array.isArray(plan)) throw new Error('Could not parse day plan');

  return plan;
}
