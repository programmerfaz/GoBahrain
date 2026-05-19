import { LRUCache } from 'lru-cache'
import crypto from 'crypto'

/**
 * Multi-tier cache service for expensive operations (OpenAI, Pinecone, Supabase)
 * 
 * Cache strategy:
 * - Embeddings: 1 hour TTL, max 500 entries (~5MB)
 * - Pinecone results: 30 min TTL, max 200 entries (~2MB)
 * - OpenAI chat: 15 min TTL, max 100 entries (~1MB)
 * - RAG responses: 10 min TTL, max 50 entries (~500KB)
 * - Hydrated catalogs: 20 min TTL, max 100 entries (~5MB)
 */

const embeddingCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 60,
  updateAgeOnGet: true,
  updateAgeOnHas: false,
})

const pineconeCache = new LRUCache({
  max: 200,
  ttl: 1000 * 60 * 30,
  updateAgeOnGet: true,
  updateAgeOnHas: false,
})

const openaiChatCache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 15,
  updateAgeOnGet: true,
  updateAgeOnHas: false,
})

const ragResponseCache = new LRUCache({
  max: 50,
  ttl: 1000 * 60 * 10,
  updateAgeOnGet: true,
  updateAgeOnHas: false,
})

const hydratedCatalogCache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 20,
  updateAgeOnGet: true,
  updateAgeOnHas: false,
})

/**
 * Generate a stable cache key from any input
 */
function generateCacheKey(prefix, input) {
  const normalized = typeof input === 'string' ? input : JSON.stringify(input)
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)
  return `${prefix}:${hash}`
}

/**
 * Embedding cache wrapper
 */
export const embeddingCacheWrapper = {
  get: (text) => {
    const key = generateCacheKey('embed', text.trim().toLowerCase())
    return embeddingCache.get(key)
  },
  set: (text, embedding) => {
    const key = generateCacheKey('embed', text.trim().toLowerCase())
    embeddingCache.set(key, embedding)
  },
  getStats: () => ({
    size: embeddingCache.size,
    max: embeddingCache.max,
    hitRate: embeddingCache.calculatedSize / (embeddingCache.calculatedSize + 1),
  }),
}

/**
 * Pinecone query cache wrapper
 */
export const pineconeCacheWrapper = {
  get: (embedding, options = {}) => {
    const key = generateCacheKey('pinecone', { embedding: embedding.slice(0, 10), ...options })
    return pineconeCache.get(key)
  },
  set: (embedding, options = {}, results) => {
    const key = generateCacheKey('pinecone', { embedding: embedding.slice(0, 10), ...options })
    pineconeCache.set(key, results)
  },
  getStats: () => ({
    size: pineconeCache.size,
    max: pineconeCache.max,
  }),
}

/**
 * OpenAI chat cache wrapper (for day plans and deterministic responses)
 */
export const openaiChatCacheWrapper = {
  get: (messages, options = {}) => {
    const key = generateCacheKey('openai', { messages, ...options })
    return openaiChatCache.get(key)
  },
  set: (messages, options = {}, response) => {
    const key = generateCacheKey('openai', { messages, ...options })
    openaiChatCache.set(key, response)
  },
  getStats: () => ({
    size: openaiChatCache.size,
    max: openaiChatCache.max,
  }),
}

/**
 * RAG full response cache (user message → final reply)
 */
export const ragResponseCacheWrapper = {
  get: (userMessage) => {
    const key = generateCacheKey('rag', userMessage.trim().toLowerCase())
    return ragResponseCache.get(key)
  },
  set: (userMessage, response) => {
    const key = generateCacheKey('rag', userMessage.trim().toLowerCase())
    ragResponseCache.set(key, response)
  },
  getStats: () => ({
    size: ragResponseCache.size,
    max: ragResponseCache.max,
  }),
}

/**
 * Hydrated catalog cache (preferences → full catalog)
 */
export const hydratedCatalogCacheWrapper = {
  get: (reqBody) => {
    const key = generateCacheKey('catalog', reqBody)
    return hydratedCatalogCache.get(key)
  },
  set: (reqBody, catalog) => {
    const key = generateCacheKey('catalog', reqBody)
    hydratedCatalogCache.set(key, catalog)
  },
  getStats: () => ({
    size: hydratedCatalogCache.size,
    max: hydratedCatalogCache.max,
  }),
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  return {
    embeddings: embeddingCacheWrapper.getStats(),
    pinecone: pineconeCacheWrapper.getStats(),
    openai: openaiChatCacheWrapper.getStats(),
    rag: ragResponseCacheWrapper.getStats(),
    hydratedCatalog: hydratedCatalogCacheWrapper.getStats(),
    totalMemoryMB: Math.round(
      (embeddingCache.calculatedSize +
        pineconeCache.calculatedSize +
        openaiChatCache.calculatedSize +
        ragResponseCache.calculatedSize +
        hydratedCatalogCache.calculatedSize) /
        (1024 * 1024)
    ),
  }
}

/**
 * Clear all caches (for testing or emergency)
 */
export function clearAllCaches() {
  embeddingCache.clear()
  pineconeCache.clear()
  openaiChatCache.clear()
  ragResponseCache.clear()
  hydratedCatalogCache.clear()
}
