const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.EXPO_PUBLIC_PINECONE_API_KEY;
const PINECONE_HOST = process.env.EXPO_PUBLIC_PINECONE_HOST || 'https://gobahrain-1pj8txc.svc.aped-4627-b74a.pinecone.io';

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
  const shown = [
    'business_name', 'name', 'event_name', 'description', 'client_type', 'cuisine_type', 'cuisine',
    'price_range', 'rating', 'openclosed_state', 'lat', 'long',
    'latitude', 'longitude', 'lng', 'Lat', 'Long', 'LNG', 'LAT',
    'record_type', 'location', 'area', 'event_type', 'start_time',
    'end_time', 'start_date', 'end_date', 'venue', 'indoor_outdoor',
  ];
  Object.keys(m).forEach((k) => {
    if (!shown.includes(k) && m[k] != null && m[k] !== '') parts.push(`${k}: ${m[k]}`);
  });
  return parts.join(' | ');
}

export async function generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels) {
  const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];

  const placesText = allMatches.map((m, i) => formatMatchForPrompt(m, i)).join('\n');

  const hasPref = prefLabels.length > 0;
  const hasFood = foodLabels.length > 0;
  const hasEvents = events.length > 0;

  const systemPrompt = `You are Khalid, a warm and friendly Bahraini local who absolutely loves showing visitors his beautiful island. You speak like a real friend — not a tour guide reading a brochure. Sprinkle in local Bahraini flavor ("habibi", "yalla", "inshallah", "wallah") naturally.

YOU ARE GIVEN ${allMatches.length} real places, restaurants, and events in Bahrain. Your job is to build a FULL-DAY plan.

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

Here are ${allMatches.length} available places, restaurants & events in Bahrain:
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
      temperature: 0.9,
      max_tokens: 1800,
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
