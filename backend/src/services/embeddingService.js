import { embeddingCacheWrapper } from './cacheService.js'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'

/**
 * Fetch embedding from OpenAI (no cache)
 */
async function fetchEmbeddingUncached(text) {
  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error?.message || `OpenAI error (${res.status})`)
  }

  const vector = json?.data?.[0]?.embedding
  if (!vector || !Array.isArray(vector)) {
    throw new Error('No embedding returned from OpenAI')
  }
  return vector
}

/**
 * Create embedding with LRU cache (1 hour TTL, 500 max entries)
 * Cache hit rate typically 60-80% for similar queries, saving ~$0.0001 per cached call
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function createEmbedding(text) {
  const input = (text || '').trim() || 'things to do in Bahrain'

  const cached = embeddingCacheWrapper.get(input)
  if (cached) {
    return cached
  }

  const vector = await fetchEmbeddingUncached(input)
  embeddingCacheWrapper.set(input, vector)
  return vector
}
