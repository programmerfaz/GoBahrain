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
 */
router.post('/', async (req, res) => {
  const start = Date.now()
  try {
    const { message } = req.body || {}
    const userMessage = typeof message === 'string' ? message.trim() : ''
    if (!userMessage) {
      return res.status(400).json({ error: 'message is required' })
    }

    let t0 = Date.now()
    const embedding = await createEmbedding(userMessage)
    const embedMs = Date.now() - t0
    console.log(`[chat/rag] embedding: ${embedMs}ms`)

    t0 = Date.now()
    let matches = []
    try {
      matches = await queryRagTopMatches(embedding, { topK: 5 })
    } catch (e) {
      console.error('[chat/rag] Pinecone:', e.message)
      return res.status(502).json({
        error: `Vector search failed: ${e.message}`,
        latency_ms: Date.now() - start,
      })
    }
    const pineconeMs = Date.now() - t0
    console.log(`[chat/rag] pinecone: ${pineconeMs}ms (${matches.length} matches)`)

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
      console.log(`[chat/rag] supabase: ${supabaseMs}ms (clients:${clientIds.length} events:${eventIds.length})`)

      orderedHydrated = buildOrderedHydratedRecords(filtered, clientMap, eventMap)
    }

    const hasContext = orderedHydrated.length > 0
    const contextBlock = hasContext ? buildRetrievedContextBlock(orderedHydrated) : ''

    t0 = Date.now()
    const reply = await generateRagChatReply(userMessage, contextBlock)
    const chatMs = Date.now() - t0
    console.log(`[chat/rag] openai-chat: ${chatMs}ms`)

    return res.json({
      reply,
      grounded: hasContext,
      retrieved_count: orderedHydrated.length,
      latency_ms: Date.now() - start,
      timings: {
        embedding_ms: embedMs,
        pinecone_ms: pineconeMs,
        supabase_ms: supabaseMs,
        chat_ms: chatMs,
      },
    })
  } catch (err) {
    console.error('[chat/rag]', err.message)
    return res.status(500).json({
      error: err.message || 'Chat failed',
      latency_ms: Date.now() - start,
    })
  }
})

export default router
