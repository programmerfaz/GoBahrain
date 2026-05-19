import { Router } from 'express'
import { createEmbedding } from '../services/embeddingService.js'
import { queryPlaces, queryClients } from '../services/pineconeService.js'
import { buildPlacesContext, generateDayPlan } from '../services/aiPlannerService.js'
import { buildHydratedPlanCatalog } from '../services/planHydratedCatalogService.js'
import { hydratedCatalogCacheWrapper } from '../services/cacheService.js'
import {
  validateRequest,
  aiPlanRequestSchema,
  hydratedCatalogRequestSchema,
  matchClientsRequestSchema,
} from '../middleware/validation.js'

const router = Router()

const FALLBACK_PLACES = [
  { place_name: 'Bahrain National Museum', description: 'Culture and history', category: 'Culture' },
  { place_name: 'Bahrain Fort', description: 'UNESCO site, sunset views', category: 'History' },
  { place_name: 'Al Fateh Grand Mosque', description: 'Stunning architecture', category: 'Culture' },
  { place_name: 'Manama Souq', description: 'Markets and local life', category: 'Shopping' },
  { place_name: 'Bahrain International Circuit', description: 'Racing and events', category: 'Adventure' },
  { place_name: 'Tree of Life', description: 'Iconic desert landmark', category: 'Nature' },
  { place_name: 'Bahrain Pearling Path', description: 'Heritage walk', category: 'History' },
  { place_name: 'Al Areen Wildlife Park', description: 'Nature and family', category: 'Nature' },
]

function countUsedPlaces(places, dayPlan) {
  if (!places?.length || !dayPlan) return 0
  const planLower = dayPlan.toLowerCase()
  return places.filter((p) => {
    const name = (p.place_name || '').trim()
    return name && planLower.includes(name.toLowerCase())
  }).length
}

/**
 * POST /api/ai-plan
 * Full plan flow: embed → Pinecone places → GPT day plan
 */
router.post('/', validateRequest(aiPlanRequestSchema), async (req, res) => {
  const start = Date.now()
  try {
    const { message: userMessage, preferences } = req.body

    let t0 = Date.now()
    const embedding = await createEmbedding(userMessage)
    req.log?.info({ embedMs: Date.now() - t0 }, 'Embedding created')

    let places = []
    try {
      t0 = Date.now()
      places = await queryPlaces(embedding, { topK: 8, preferences: preferences || undefined })
      req.log?.info({ pineconeMs: Date.now() - t0, placeCount: places?.length ?? 0 }, 'Pinecone query completed')
    } catch (e) {
      req.log?.warn({ err: e }, 'Pinecone failed, using fallback')
      places = FALLBACK_PLACES
    }
    if (!places || places.length === 0) places = FALLBACK_PLACES

    const placesContext = buildPlacesContext(places)

    t0 = Date.now()
    const dayPlan = await generateDayPlan(userMessage, placesContext)
    req.log?.info({ gptMs: Date.now() - t0 }, 'Day plan generated')

    res.set('Cache-Control', 'public, max-age=300').json({
      day_plan: dayPlan,
      used_places_count: countUsedPlaces(places, dayPlan),
      latency_ms: Date.now() - start,
    })
  } catch (err) {
    req.log?.error({ err }, 'AI plan error')
    res.status(500).json({ error: err.message, latency_ms: Date.now() - start })
  }
})

/**
 * POST /api/ai-plan/hydrated-catalog
 * Pinecone (4 buckets) → Supabase merge → JSON for in-app generateDayPlan().
 * Cached for 20 min based on request body (preferences + food labels)
 */
router.post('/hydrated-catalog', validateRequest(hydratedCatalogRequestSchema), async (req, res) => {
  const start = Date.now()
  try {
    const body = req.body

    const cachedCatalog = hydratedCatalogCacheWrapper.get(body)
    if (cachedCatalog) {
      req.log?.info({ cached: true }, 'Hydrated catalog served from cache')
      return res
        .set('X-Cache', 'HIT')
        .set('Cache-Control', 'public, max-age=1200')
        .json({
          ...cachedCatalog,
          latency_ms: Date.now() - start,
          cached: true,
        })
    }

    const catalog = await buildHydratedPlanCatalog(body)

    hydratedCatalogCacheWrapper.set(body, catalog)

    res
      .set('X-Cache', 'MISS')
      .set('Cache-Control', 'public, max-age=1200')
      .json({
        ...catalog,
        latency_ms: Date.now() - start,
      })
  } catch (err) {
    req.log?.error({ err }, 'Hydrated catalog error')
    res.status(500).json({ error: err.message, latency_ms: Date.now() - start })
  }
})

/**
 * POST /api/ai-plan/match-clients
 * Embed preferences+food → Pinecone client query
 */
router.post('/match-clients', validateRequest(matchClientsRequestSchema), async (req, res) => {
  const start = Date.now()
  try {
    const { preferences, foodCategories } = req.body

    const parts = []
    if (preferences.length) parts.push(preferences.join(', '))
    if (foodCategories.length) parts.push(foodCategories.join(', '))
    const queryText = parts.length ? parts.join('. ') : 'Things to do and food in Bahrain'

    let t0 = Date.now()
    const embedding = await createEmbedding(queryText)
    req.log?.info({ embedMs: Date.now() - t0 }, 'Embedding created')

    t0 = Date.now()
    const clients = await queryClients(embedding, { topK: 12 })
    req.log?.info({ pineconeMs: Date.now() - t0, clientCount: clients.length }, 'Client matching completed')

    res.set('Cache-Control', 'public, max-age=600').json({ clients, latency_ms: Date.now() - start })
  } catch (err) {
    req.log?.error({ err }, 'Match clients error')
    res.status(500).json({ error: err.message, latency_ms: Date.now() - start })
  }
})

export default router
