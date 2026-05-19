import { OPENAI_KEY } from '../config/keys'
import { supabase } from '../config/supabase'
import { GENERAL_PREFERENCES } from '../constants/preferences'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

const findGeneralPreference = (id) => GENERAL_PREFERENCES.find((p) => p.id === id)

const groupGeneralIdsByCategory = (ids) => {
  const out = {}
  for (const id of Array.isArray(ids) ? ids : []) {
    const def = findGeneralPreference(id)
    if (!def) continue
    const g = def.group
    if (!out[g]) out[g] = []
    out[g].push(def.label)
  }
  return out
}

/**
 * Maps onboarding profile signals from GENERAL_PREFERENCES to plan-generation
 * activity ids (from PREFERENCES). This keeps personalization useful even when
 * onboarding questions are profile-focused and independent from plan modal picks.
 */
/** Maps GENERAL_PREFERENCES ids → PREFERENCES ids (plan activity chips). Must use real ids from `constants/preferences` PREFERENCES. */
const INTEREST_TO_ACTIVITY_MAP = {
  'culture-history': ['culture', 'historical'],
  'nature-outdoors': ['nature', 'parks'],
  foodie: [],
  nightlife: ['fun'],
  shopping: ['shopping'],
  adventure: ['fun', 'nature'],
  'instagram-spots': ['art', 'waterfronts', 'beaches'],
  'local-authentic': ['culture', 'historical'],
  'family-friendly': ['fun', 'parks'],
  'art-museums': ['art', 'culture'],
  'beaches-sun': ['beaches', 'waterfronts'],
  'quiet-peaceful': ['parks', 'nature'],
  'social-lively': ['fun', 'shopping'],
  'hidden-gems': ['culture', 'nature'],
  'pace-relaxed': ['parks', 'nature'],
  'pace-balanced': ['culture', 'nature', 'shopping'],
  'pace-packed': ['fun', 'beaches', 'shopping'],
  'plan-structured': ['historical', 'culture'],
  'plan-flexible': ['nature', 'parks'],
  'plan-mix': ['culture', 'fun'],
  'time-early': ['nature', 'parks'],
  'time-afternoon': ['culture', 'historical'],
  'time-late': ['fun', 'shopping'],
}

export const deriveActivityIdsFromInterestIds = (ids) => {
  const out = new Set()
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const mapped = INTEREST_TO_ACTIVITY_MAP[id]
    if (Array.isArray(mapped)) mapped.forEach((x) => out.add(x))
  }
  return [...out]
}

const buildFallbackSummary = ({ grouped, profileAnswers, viewerUType = 'local' }) => {
  const parts = []
  const c = (k) => (grouped[k] && grouped[k].length ? grouped[k] : [])
  if (c('companion').length) parts.push(`Usually travels as: ${c('companion').join(' / ')}`)
  if (c('coach_focus').length)
    parts.push(`Primary goal for AI / personalized help: ${c('coach_focus').join(' / ')}`)
  if (c('pace').length) parts.push(`Ideal day pace: ${c('pace').join(' / ')}`)
  if (c('budget').length) parts.push(`Budget comfort: ${c('budget').join(' / ')}`)
  if (c('route_efficiency').length) parts.push(`Day-plan routing: ${c('route_efficiency').join(' / ')}`)
  if (c('life_lens').length) parts.push(`Bahrain day-to-day context: ${c('life_lens').join(' / ')}`)
  if (c('choose_style').length) parts.push(`How they choose spots: ${c('choose_style').join(' / ')}`)
  if (c('interests').length) parts.push(`Experiences they love: ${c('interests').slice(0, 6).join(', ')}`)
  if (profileAnswers?.idealDay) parts.push(`Ideal day notes: ${String(profileAnswers.idealDay).trim()}`)
  if (profileAnswers?.avoidList) parts.push(`Avoid: ${String(profileAnswers.avoidList).trim()}`)
  const p = profileAnswers && typeof profileAnswers === 'object' ? profileAnswers : {}
  if (p.homeCountry && String(p.homeCountry).trim())
    parts.push(`Home country: ${String(p.homeCountry).trim()}`)
  if (p.tripLengthDays != null && String(p.tripLengthDays).trim())
    parts.push(`Trip length: ~${String(p.tripLengthDays).trim()} days`)
  if (p.travelParty && String(p.travelParty).trim())
    parts.push(`Usually travels: ${String(p.travelParty).trim()}`)
  if (p.budgetBand && String(p.budgetBand).trim())
    parts.push(`Budget comfort: ${String(p.budgetBand).trim()}`)
  if (p.dietaryHardNos && String(p.dietaryHardNos).trim())
    parts.push(`Food constraints: ${String(p.dietaryHardNos).trim()}`)
  if (p.mobilityNotes && String(p.mobilityNotes).trim())
    parts.push(`Mobility: ${String(p.mobilityNotes).trim()}`)
  if (p.heatSensitivity && String(p.heatSensitivity).trim())
    parts.push(`Heat sensitivity: ${String(p.heatSensitivity).trim()}`)
  if (p.sessionIntentDay && String(p.sessionIntentDay).trim())
    parts.push(`Trip intent: ${String(p.sessionIntentDay).trim()}`)
  const vt = String(viewerUType || '').toLowerCase() === 'tourist' ? 'tourist' : 'local'
  const audienceTail =
    vt === 'tourist'
      ? ' They are visiting Bahrain — guidance should feel welcoming, geographically clear, and trip-friendly.'
      : ' They live in Bahrain — favor practical outings, rotation, and local nuance over repeating basic sightseeing introductions.'

  if (!parts.length) {
    const open =
      vt === 'tourist'
        ? 'Open to a balanced Bahrain visit — culture, food, and a relaxed travel pace.'
        : 'Open to a balanced Bahrain day out — mixing culture, food, and relaxed energy without repeating tired staples.'
    return `${open}${audienceTail}`
  }
  return `This user — ${parts.join('. ')}.${audienceTail}`
}

export async function generateUserPersonaSummary({
  generalIds = [],
  activityIds = [],
  foodIds = [],
  profileAnswers = {},
  viewerUType = 'local',
}) {
  const vt = String(viewerUType || '').toLowerCase() === 'tourist' ? 'tourist' : 'local'
  const grouped = groupGeneralIdsByCategory(generalIds)

  const fallback = buildFallbackSummary({
    grouped,
    profileAnswers,
    viewerUType: vt,
  })

  if (!OPENAI_KEY) return fallback

  const audienceInstruction =
    vt === 'tourist'
      ? ' The account is labeled as a visitor to Bahrain — phrasing should suit someone on a trip (orientation-light, approachable).'
      : ' The account is labeled as a Bahrain resident — phrasing should suit repeat outings (practical tone, insider-friendly, not generic sightseeing copy).'

  const systemPrompt = [
    'You are a senior personalization strategist for a travel app in Bahrain.',
    'Given a user\'s onboarding answers, write ONE rich, third-person profile paragraph (50-70 words) that feels like a real friend describing them.',
    audienceInstruction,
    'Emphasize personality: companionship habits; what they want the AI assistant to prioritize; how settled they are in Bahrain and when they typically go out (when stated); pace and spending comfort.',
    'Use general interest chips when provided; do NOT invent specific venue types or cuisines — those are chosen later in the AI Plan builder only.',
    'Write in present tense. Use warm, specific language ("This traveler loves…"). No bullet lists. No headings. No hedging.',
    'End with one short sentence that states the vibe their perfect Bahrain day should deliver — this sentence will guide later itinerary generation.',
  ].join(' ')

  const ug = (k) => ((grouped[k] && grouped[k].length) ? grouped[k].join(', ') : 'unspecified')
  const userPrompt = [
    `Local or visitor: ${vt === 'tourist' ? 'Visitor / tourist' : 'Local resident'}`,
    `Companion: ${ug('companion')}`,
    `Primary goal for AI assistance (coach focus): ${ug('coach_focus')}`,
    `Pace preference: ${ug('pace')}`,
    `Budget comfort: ${ug('budget')}`,
    `Day-plan routing (minimize driving vs best picks): ${ug('route_efficiency')}`,
    `Bahrain day-to-day context (legacy, if any): ${ug('life_lens')}`,
    `How they choose where to go (optional): ${ug('choose_style')}`,
    `Core interests / experiences (optional): ${ug('interests')}`,
    `Planning style: ${ug('planning')}`,
    `Timing preference: ${ug('timing')}`,
    `Free-text ideal day: ${profileAnswers?.idealDay ? String(profileAnswers.idealDay) : 'none'}`,
    `Free-text avoid list: ${profileAnswers?.avoidList ? String(profileAnswers.avoidList) : 'none'}`,
    `Home country: ${profileAnswers?.homeCountry ? String(profileAnswers.homeCountry) : 'unspecified'}`,
    `Trip length (days): ${profileAnswers?.tripLengthDays != null ? String(profileAnswers.tripLengthDays) : 'unspecified'}`,
    `Travel party type: ${profileAnswers?.travelParty ? String(profileAnswers.travelParty) : 'unspecified'}`,
    `Budget band: ${profileAnswers?.budgetBand ? String(profileAnswers.budgetBand) : 'unspecified'}`,
    `Dietary / hard nos: ${profileAnswers?.dietaryHardNos ? String(profileAnswers.dietaryHardNos) : 'none'}`,
    `Mobility notes: ${profileAnswers?.mobilityNotes ? String(profileAnswers.mobilityNotes) : 'none'}`,
    `Heat sensitivity: ${profileAnswers?.heatSensitivity ? String(profileAnswers.heatSensitivity) : 'unspecified'}`,
    `Session intent / today focus text: ${profileAnswers?.sessionIntentDay ? String(profileAnswers.sessionIntentDay) : 'none'}`,
  ].join('\n')

  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.55,
        max_tokens: 320,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!res.ok) return fallback
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content
    const summary = typeof text === 'string' ? text.trim() : ''
    return summary || fallback
  } catch (_) {
    return fallback
  }
}

export async function upsertUserPersonaSummary({
  summary,
  generalIds = [],
  activityIds = [],
  foodIds = [],
  profileAnswers = {},
}) {
  try {
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) return

    await supabase.from('user_personalization').upsert(
      {
        user_id: userId,
        persona_summary: summary,
        general_ids: generalIds,
        activity_ids: activityIds,
        food_ids: foodIds,
        profile_answers: profileAnswers,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  } catch (_) {
    // Optional path; keep app functional if table is absent.
  }
}

/**
 * Load the persisted personalization row for the signed-in user. Returns null
 * when unauthenticated or the table is unreachable. Callers are expected to
 * treat nulls as "no DB record yet" and fall back to local AsyncStorage data.
 */
export async function fetchUserPersonalization() {
  try {
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) return null
    const { data, error } = await supabase
      .from('user_personalization')
      .select('persona_summary, general_ids, activity_ids, food_ids, profile_answers, updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return null
    return {
      personaSummary: typeof data.persona_summary === 'string' ? data.persona_summary : '',
      generalIds: Array.isArray(data.general_ids) ? data.general_ids : [],
      activityIds: Array.isArray(data.activity_ids) ? data.activity_ids : [],
      foodIds: Array.isArray(data.food_ids) ? data.food_ids : [],
      profileAnswers: data.profile_answers && typeof data.profile_answers === 'object' ? data.profile_answers : {},
      updatedAt: data.updated_at || null,
    }
  } catch (_) {
    return null
  }
}

export async function buildAndPersistUserPersona(prefs) {
  const summary = await generateUserPersonaSummary(prefs)
  await upsertUserPersonaSummary({ summary, ...prefs })
  return summary
}
