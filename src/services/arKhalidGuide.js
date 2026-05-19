import { OPENAI_KEY } from '../config/keys'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const NARRATION_CACHE_MAX = 48
const narrationCache = new Map()

const HERITAGE_BY_NAME = {
  'Bahrain Fort (Qal\'at al-Bahrain)': 'Ancient Dilmun capital and UNESCO site — over 4,000 years of Gulf history.',
  'Bahrain National Museum': 'Bahrain\'s flagship museum — 6,000 years of stories under one roof.',
  'Al Fateh Grand Mosque': 'The country\'s largest mosque — visitors welcome outside prayer times.',
  'Bahrain World Trade Center': 'Twin towers with wind turbines — a Bahrain skyline icon.',
  'Tree of Life': 'A 400-year-old tree in the desert — nobody quite knows how it survives.',
  'Bab Al Bahrain': 'The historic gateway into Manama Souq — spices, gold, and old-town energy.',
  'Manama Souq': 'Narrow lanes, local crafts, and the most authentic market vibe in the capital.',
  'Bahrain Pearling Trail': 'UNESCO heritage celebrating the pearling trade that shaped the Gulf.',
  'Beit Al Quran': 'Stunning Islamic calligraphy and one of the finest Quran collections in the region.',
  'Al Areen Wildlife Park': 'Arabian wildlife and quiet desert trails — a calm escape south of the city.',
}

const poiCacheKey = (poi) => {
  const name = String(poi?.name || '').trim()
  const lat = poi?.lat != null ? Number(poi.lat).toFixed(4) : ''
  return name && lat ? `${name}|${lat}` : name || ''
}

const personaCacheSuffix = (context) => {
  const p = String(context?.personaSummary || '').trim().slice(0, 64)
  return p ? `:${p}` : ''
}

export const buildARRetrievalQuery = (context = {}) => {
  const general = (context.generalLabels || []).slice(0, 4).join(', ')
  const bits = [
    'Bahrain places restaurants events worth visiting nearby',
    general ? `travel style: ${general}` : '',
    context.personaSummary ? String(context.personaSummary).trim().slice(0, 200) : '',
  ].filter(Boolean)
  return bits.join('. ')
}

/** Catalog-style brief for the locked AR destination (chat + retrieval bias). */
export const buildLockedPlaceBriefFromPoi = (poi) => {
  if (!poi) return ''
  const name = String(poi.name || '').trim()
  const m = poi.metadata || {}
  const heritage = HERITAGE_BY_NAME[name]
  const bits = [
    name ? `Name: ${name}` : '',
    poi._type ? `Type: ${poi._type}` : '',
    m.category ? `Category: ${m.category}` : '',
    m.cuisine || m.cuisine_type ? `Cuisine: ${m.cuisine || m.cuisine_type}` : '',
    m.description || m.ai_summary || poi.description || '',
    heritage ? `Heritage: ${heritage}` : '',
    m.rating != null ? `Rating: ${m.rating}` : '',
    m.venue || m.area ? `Area: ${m.venue || m.area}` : '',
  ].filter(Boolean)
  return bits.join('\n').slice(0, 720)
}

export const buildARPreferenceContext = ({
  profileSummary = '',
  generalLabels = [],
  maxDistanceKm = 3,
} = {}) => ({
  personaSummary: typeof profileSummary === 'string' ? profileSummary.trim() : '',
  generalLabels: Array.isArray(generalLabels) ? generalLabels : [],
  maxDistanceKm: typeof maxDistanceKm === 'number' ? maxDistanceKm : 3,
})

export const getFallbackSpotNarration = (poi) => {
  if (!poi) return ''
  const name = String(poi.name || 'this spot').trim()
  const heritage = HERITAGE_BY_NAME[name]
  if (heritage) {
    return `You're looking at ${name} — ${heritage} Walk closer and you'll feel why locals still bring friends here.`
  }
  const m = poi.metadata || {}
  const desc = String(m.description || m.ai_summary || poi.description || '').trim()
  if (desc) {
    const clip = desc.length > 160 ? `${desc.slice(0, 157)}…` : desc
    return `${name} — ${clip} I'd start here if you want something memorable without overthinking it.`
  }
  const type =
    poi._type === 'restaurant' ? 'a solid food stop' : poi._type === 'event' ? 'something happening now' : 'a local favourite'
  return `This is ${name}, ${type} in Bahrain. Lock on and walk toward it — I'll keep nudging you the right way, yalla.`
}

const trimNarrationCache = () => {
  if (narrationCache.size <= NARRATION_CACHE_MAX) return
  const oldest = narrationCache.keys().next().value
  if (oldest != null) narrationCache.delete(oldest)
}

export async function fetchKhalidSpotNarration(poi, context = {}) {
  const key = `${poiCacheKey(poi)}${personaCacheSuffix(context)}`
  if (key && narrationCache.has(key)) return narrationCache.get(key)

  const fallback = getFallbackSpotNarration(poi)
  if (!OPENAI_KEY || !poi) return fallback

  const m = poi.metadata || {}
  const name = String(poi.name || 'this place').trim()
  const distKm = poi.distanceKm != null ? Number(poi.distanceKm) : null
  const distLine =
    distKm != null && !Number.isNaN(distKm)
      ? distKm < 1
        ? `${Math.round(distKm * 1000)} metres away`
        : `${distKm.toFixed(1)} km away`
      : 'nearby'
  const persona = String(context.personaSummary || '').trim().slice(0, 320)
  const prefs = context.generalLabels?.length
    ? `Travel style: ${context.generalLabels.join(', ')}`
    : ''

  const facts = [
    m.description || m.ai_summary || '',
    m.category ? `Category: ${m.category}` : '',
    m.cuisine || m.cuisine_type ? `Cuisine: ${m.cuisine || m.cuisine_type}` : '',
    m.rating != null ? `Rating: ${m.rating}` : '',
    HERITAGE_BY_NAME[name] ? `Heritage note: ${HERITAGE_BY_NAME[name]}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const system = [
    'You are Khalid, a warm Bahraini local tour guide speaking in AR mode to someone holding their phone up.',
    'The user has LOCKED navigation onto this exact place — your entire answer must be about this place only, not other nearby spots.',
    'Write 2–3 short sentences in first person ("I", "you"). Sound like a friendly guide walking beside them — not a brochure.',
    'Mention the place name once. Include one practical tip (when to go, what to notice, or who it suits).',
    'You may use "yalla" once if natural. No bullet lists. No hashtags. Max 280 characters.',
    'Only use facts from the provided catalog snippet — do not invent hours, prices, or awards.',
  ].join(' ')

  const user = [
    `Place: ${name}`,
    `Distance: ${distLine}`,
    persona ? `Traveler profile: ${persona}` : '',
    prefs,
    facts ? `Catalog facts:\n${facts.slice(0, 500)}` : 'Catalog facts: limited — keep it general but encouraging.',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.72,
        max_tokens: 120,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) return fallback
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content?.trim()
    const out = text || fallback
    if (key) {
      narrationCache.set(key, out)
      trimNarrationCache()
    }
    return out
  } catch (_) {
    return fallback
  }
}

export const buildKhalidIdleLine = () =>
  `I'm Khalid, your Bahrain guide. Lock onto a place ahead and I'll tell you what makes it special.`

export const buildKhalidLockedIntro = (placeName) => {
  const name = String(placeName || 'this spot').trim() || 'this spot'
  return `Locked on ${name} — give me a second…`
}

export const buildKhalidChatHandoff = ({ poi, narration = '', visiblePoiNames = [] }) => {
  const place = String(poi?.name || 'this place').trim()
  const lines = [
    narration ? `Guide note: ${narration}` : '',
    visiblePoiNames.length ? `Also visible in AR: ${visiblePoiNames.slice(0, 6).join(', ')}` : '',
  ].filter(Boolean)
  return {
    place,
    summary: lines.join(' ').slice(0, 500),
  }
}
