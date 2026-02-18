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

  const places = await queryPinecone(embedding, 6, {
    record_type: { $eq: 'client' },
    client_type: { $eq: 'place' },
  });

  return places;
}

// ─── Step 2: Restaurants (from food preferences) ────────────────────

export async function fetchRestaurants(foodLabels) {
  const text =
    foodLabels.length > 0
      ? `Restaurants in Bahrain serving ${foodLabels.join(', ')}`
      : 'Best restaurants and food spots in Bahrain';

  const embedding = await getEmbedding(text);

  const filter = {
    record_type: { $eq: 'client' },
    client_type: { $eq: 'restaurant' },
  };

  const restaurants = await queryPinecone(embedding, 6, filter);

  return restaurants;
}

// ─── Step 3: GPT smart day plan from 12 combined records ───────────

function formatMatchForPrompt(match, idx) {
  const m = match.metadata || {};
  const name = m.business_name || m.name || `Place ${idx + 1}`;
  const parts = [`${idx + 1}. ${name}`];
  if (m.client_type) parts.push(`Type: ${m.client_type}`);
  if (m.description) parts.push(`Desc: ${m.description}`);
  if (m.cuisine_type) parts.push(`Cuisine: ${m.cuisine_type}`);
  if (m.price_range) parts.push(`Price: ${m.price_range}`);
  if (m.rating != null && m.rating !== '') parts.push(`Rating: ${m.rating}`);
  if (m.openclosed_state) parts.push(`Status: ${m.openclosed_state}`);
  if (m.location || m.area) parts.push(`Area: ${m.location || m.area}`);
  const shown = [
    'business_name', 'name', 'description', 'client_type', 'cuisine_type',
    'price_range', 'rating', 'openclosed_state', 'lat', 'long',
    'record_type', 'location', 'area',
  ];
  Object.keys(m).forEach((k) => {
    if (!shown.includes(k) && m[k] != null && m[k] !== '') parts.push(`${k}: ${m[k]}`);
  });
  return parts.join(' | ');
}

export async function generateDayPlan(places, restaurants, prefLabels, foodLabels) {
  const allMatches = [...places, ...restaurants];

  const placesText = allMatches.map((m, i) => formatMatchForPrompt(m, i)).join('\n');

  const hasPref = prefLabels.length > 0;
  const hasFood = foodLabels.length > 0;

  const systemPrompt = `You are Khalid, a warm and friendly Bahraini local who absolutely loves showing visitors his beautiful island. You speak like a real friend — not a tour guide reading a brochure. Sprinkle in local Bahraini flavor ("habibi", "yalla", "inshallah", "wallah") naturally.

YOU ARE GIVEN ${allMatches.length} real places and restaurants in Bahrain. Your job is to build a FULL-DAY plan.

═══ MANDATORY MINIMUM (always include) ═══
1. BREAKFAST spot (Morning) — a cafe, bakery, or breakfast restaurant
2. LUNCH spot (Afternoon) — a restaurant for a proper meal
3. DINNER spot (Evening) — a restaurant for dinner
4. 3 PLACES to visit — sightseeing, cultural, nature, shopping, etc. spread across Morning, Afternoon, and Evening

That is 6 stops minimum (3 meals + 3 places). But you are NOT limited to 6 — if the list has great options, feel free to add 7, 8, or even 9 stops. Khalid loves showing off his island, so more is welcome if it fits naturally into the day!

═══ HOW TO SELECT ═══
${hasPref ? `The tourist specifically asked for: ${prefLabels.join(', ')}. Prioritize places that match these interests when choosing the 3+ activity/sightseeing spots.` : 'The tourist did not pick specific preferences, so choose a fun diverse mix of places — a bit of everything (culture, shopping, sightseeing, nature).'}

${hasFood ? `The tourist prefers these food types: ${foodLabels.join(', ')}. Pick breakfast, lunch, and dinner spots that match these cuisines from the restaurant list.` : 'The tourist has no specific food preference — surprise them! Pick a nice variety across breakfast, lunch, and dinner.'}

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
- "spot": exact place name from the list (do NOT invent names)
- "time": "Morning" | "Afternoon" | "Evening"
- "type": "place" | "restaurant"
- "reason": a warm 1-2 sentence description of WHY you chose this spot for this time. Be personal, use Khalid's voice, reference the place's vibe or details from the data.

Reply ONLY with a valid JSON array, NO markdown, NO extra text:
[
  { "spot": "Name", "time": "Morning", "type": "restaurant", "reason": "..." },
  { "spot": "Name", "time": "Morning", "type": "place", "reason": "..." },
  ...
]`;

  const userMsg = `${hasPref ? `Tourist preferences: ${prefLabels.join(', ')}` : 'Tourist preferences: none selected (surprise me!)'}
${hasFood ? `Food preferences: ${foodLabels.join(', ')}` : 'Food preferences: none selected (open to anything)'}

Here are ${allMatches.length} available places & restaurants in Bahrain:
${placesText}

Build Khalid's perfect day — minimum 3 meals (breakfast, lunch, dinner) + 3 places. Add more if you find great options!`;

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
      max_tokens: 1400,
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
