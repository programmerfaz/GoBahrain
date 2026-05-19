import { Router } from 'express'
import { createEmbedding } from '../services/embeddingService.js'
import { queryRagTopMatches } from '../services/pineconeService.js'
import { fetchClientsByIds, fetchEventsByIds } from '../services/supabaseService.js'
import { buildRetrievedContextBlock, generateRagChatReply } from '../services/ragChatService.js'
import {
  filterMatchesByScore,
  gatherSupabaseIdsFromMatches,
  buildOrderedHydratedRecords,
} from '../services/ragRetrievalService.js'
import { ragResponseCacheWrapper } from '../services/cacheService.js'
import { validateRequest, chatRequestSchema } from '../middleware/validation.js'

const router = Router()

const parseMinScore = () => {
  const raw = process.env.RAG_MIN_PINECONE_SCORE
  if (raw == null || String(raw).trim() === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

const RAG_MIN_PINECONE_SCORE = parseMinScore()

/**
 * POST /chat
 * Embed → Pinecone top-5 → Supabase hydrate (≤2 queries) → OpenAI grounded reply.
 * With full response caching (10 min TTL) for identical queries.
 */
router.post('/', validateRequest(chatRequestSchema), async (req, res) => {
  const start = Date.now()
  try {
    const { message: userMessage } = req.body

    const cachedResponse = ragResponseCacheWrapper.get(userMessage)
    if (cachedResponse) {
      req.log?.info({ cached: true }, 'RAG response served from cache')
      return res
        .set('X-Cache', 'HIT')
        .set('Cache-Control', 'public, max-age=600')
        .json({
          ...cachedResponse,
          latency_ms: Date.now() - start,
          cached: true,
        })
    }

    let t0 = Date.now()
    const embedding = await createEmbedding(userMessage)
    const embedMs = Date.now() - t0
    req.log?.info({ embedMs }, 'Embedding created')

    t0 = Date.now()
    let matches = []
    try {
      matches = await queryRagTopMatches(embedding, { topK: 5 })
    } catch (e) {
      req.log?.error({ err: e }, 'Pinecone query failed')
      return res.status(502).json({
        error: `Vector search failed: ${e.message}`,
        latency_ms: Date.now() - start,
      })
    }
    const pineconeMs = Date.now() - t0
    req.log?.info({ pineconeMs, matchCount: matches.length }, 'Pinecone query completed')

    const filtered = filterMatchesByScore(matches, RAG_MIN_PINECONE_SCORE)

    let orderedHydrated = []
    let supabaseMs = 0

    if (filtered.length > 0) {
      const { clientIds, eventIds } = gatherSupabaseIdsFromMatches(filtered)

      t0 = Date.now()
      const [clientMap, eventMap] = await Promise.all([
        clientIds.length ? fetchClientsByIds(clientIds) : Promise.resolve(new Map()),
        eventIds.length ? fetchEventsByIds(eventIds) : Promise.resolve(new Map()),
      ])
      supabaseMs = Date.now() - t0
      req.log?.info({ supabaseMs, clientCount: clientIds.length, eventCount: eventIds.length }, 'Supabase hydration')

      orderedHydrated = buildOrderedHydratedRecords(filtered, clientMap, eventMap)
    }

    const hasContext = orderedHydrated.length > 0
    const contextBlock = hasContext ? buildRetrievedContextBlock(orderedHydrated) : ''

    t0 = Date.now()
    const reply = await generateRagChatReply(userMessage, contextBlock)
    const chatMs = Date.now() - t0
    req.log?.info({ chatMs }, 'OpenAI chat completed')

    const response = {
      reply,
      grounded: hasContext,
      retrieved_count: orderedHydrated.length,
      timings: {
        embedding_ms: embedMs,
        pinecone_ms: pineconeMs,
        supabase_ms: supabaseMs,
        chat_ms: chatMs,
      },
    }

    ragResponseCacheWrapper.set(userMessage, response)

    return res
      .set('X-Cache', 'MISS')
      .set('Cache-Control', 'public, max-age=600')
      .json({
        ...response,
        latency_ms: Date.now() - start,
      })
  } catch (err) {
    req.log?.error({ err }, 'RAG request failed')
    return res.status(500).json({
      error: err.message || 'Chat failed',
      latency_ms: Date.now() - start,
    })
  }
})

export default router
