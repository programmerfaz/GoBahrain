const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_HOST = 'https://gobahrain-1pj8txc.svc.aped-4627-b74a.pinecone.io';
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

/**
 * Direct fetch to Pinecone query — same approach as the frontend.
 */
async function pineconeQuery(vector, topK, filter, namespace = '') {
  const body = {
    vector,
    topK,
    includeMetadata: true,
    includeValues: false,
  };
  if (filter != null && typeof filter === 'object' && Object.keys(filter).length > 0) {
    body.filter = filter;
  }
  if (namespace) body.namespace = namespace;
  const res = await fetchWithTimeout(PINECONE_QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': PINECONE_API_KEY,
      'X-Pinecone-Api-Version': PINECONE_API_VERSION,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Pinecone error (${res.status})`);
  }
  return json.matches || [];
}

/**
 * Query places from Pinecone (no record_type filter).
 */
export async function queryPlaces(embedding, options = {}) {
  const { topK = 15, preferences } = options;

  let filter;
  if (preferences && typeof preferences === 'object') {
    const clauses = [];
    if (preferences.vibe) clauses.push({ vibe: { $eq: String(preferences.vibe) } });
    if (preferences.category) clauses.push({ category: { $eq: String(preferences.category) } });
    if (preferences.price_range) clauses.push({ price_range: { $eq: String(preferences.price_range) } });
    if (clauses.length === 1) filter = clauses[0];
    else if (clauses.length > 1) filter = { $and: clauses };
  }

  const matches = await pineconeQuery(embedding, topK, filter);
  return matches
    .filter((m) => m.metadata?.place_name)
    .map((m) => ({
      place_name: m.metadata.place_name,
      category: m.metadata.category,
      description: m.metadata.description,
      vibe: m.metadata.vibe,
      price_range: m.metadata.price_range,
      rating: m.metadata.rating,
      location: m.metadata.location,
    }));
}

/**
 * Query client profiles from Pinecone (filter record_type = "client").
 */
export async function queryClients(embedding, options = {}) {
  const topK = options.topK ?? 10;
  const matches = await pineconeQuery(
    embedding,
    topK,
    { record_type: { $eq: 'client' } }
  );
  return matches.map((m) => ({
    score: m.score,
    id: m.id,
    metadata: m.metadata || {},
  }));
}
