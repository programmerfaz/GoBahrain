import { Router } from 'express';
import { createEmbedding } from '../services/embeddingService.js';
import { queryPlaces, queryClients } from '../services/pineconeService.js';
import {
  buildPlacesContext,
  generateDayPlan,
} from '../services/aiPlannerService.js';

const router = Router();

const FALLBACK_PLACES = [
  { place_name: 'Bahrain National Museum', description: 'Culture and history', category: 'Culture' },
  { place_name: 'Bahrain Fort', description: 'UNESCO site, sunset views', category: 'History' },
  { place_name: 'Al Fateh Grand Mosque', description: 'Stunning architecture', category: 'Culture' },
  { place_name: 'Manama Souq', description: 'Markets and local life', category: 'Shopping' },
  { place_name: 'Bahrain International Circuit', description: 'Racing and events', category: 'Adventure' },
  { place_name: 'Tree of Life', description: 'Iconic desert landmark', category: 'Nature' },
  { place_name: 'Bahrain Pearling Path', description: 'Heritage walk', category: 'History' },
  { place_name: 'Al Areen Wildlife Park', description: 'Nature and family', category: 'Nature' },
];

function countUsedPlaces(places, dayPlan) {
  if (!places?.length || !dayPlan) return 0;
  const planLower = dayPlan.toLowerCase();
  return places.filter((p) => {
    const name = (p.place_name || '').trim();
    return name && planLower.includes(name.toLowerCase());
  }).length;
}

/**
 * POST /api/ai-plan
 * Full plan flow: embed → Pinecone places → GPT day plan
 */
router.post('/', async (req, res) => {
  const start = Date.now();
  try {
    const { message, preferences } = req.body || {};
    const userMessage = typeof message === 'string' ? message.trim() : '';
    if (!userMessage) return res.status(400).json({ error: 'message is required' });

    let t0 = Date.now();
    const embedding = await createEmbedding(userMessage);
    console.log(`[ai-plan] embedding: ${Date.now() - t0}ms`);

    let places = [];
    try {
      t0 = Date.now();
      places = await queryPlaces(embedding, { topK: 5, preferences: preferences || undefined });
      console.log(`[ai-plan] pinecone: ${Date.now() - t0}ms (${places?.length ?? 0} places)`);
    } catch (e) {
      console.warn('[ai-plan] Pinecone failed, using fallback:', e.message);
      places = FALLBACK_PLACES;
    }
    if (!places || places.length === 0) places = FALLBACK_PLACES;

    const placesContext = buildPlacesContext(places);

    t0 = Date.now();
    const dayPlan = await generateDayPlan(userMessage, placesContext);
    console.log(`[ai-plan] gpt: ${Date.now() - t0}ms`);

    res.json({
      day_plan: dayPlan,
      used_places_count: countUsedPlaces(places, dayPlan),
      latency_ms: Date.now() - start,
    });
  } catch (err) {
    console.error('AI plan error:', err.message);
    res.status(500).json({ error: err.message, latency_ms: Date.now() - start });
  }
});

/**
 * POST /api/ai-plan/match-clients
 * Embed preferences+food → Pinecone client query (top 4)
 */
router.post('/match-clients', async (req, res) => {
  const start = Date.now();
  try {
    const { preferences = [], foodCategories = [] } = req.body || {};
    const prefs = Array.isArray(preferences) ? preferences : [];
    const food = Array.isArray(foodCategories) ? foodCategories : [];

    const parts = [];
    if (prefs.length) parts.push(prefs.join(', '));
    if (food.length) parts.push(food.join(', '));
    const queryText = parts.length ? parts.join('. ') : 'Things to do and food in Bahrain';

    let t0 = Date.now();
    const embedding = await createEmbedding(queryText);
    console.log(`[match-clients] embedding: ${Date.now() - t0}ms`);

    t0 = Date.now();
    const clients = await queryClients(embedding, { topK: 10 });
    console.log(`[match-clients] pinecone: ${Date.now() - t0}ms (${clients.length} clients)`);

    res.json({ clients, latency_ms: Date.now() - start });
  } catch (err) {
    console.error('Match clients error:', err.message);
    res.status(500).json({ error: err.message, latency_ms: Date.now() - start });
  }
});

export default router;
