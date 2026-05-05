import { OPENAI_KEY } from '../config/keys'
import { supabase } from '../config/supabase'
import { GENERAL_PREFERENCES, PREFERENCES, FOOD_CATEGORIES } from '../constants/preferences'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

const pickLabels = (ids, list) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => list.find((item) => item.id === id)?.label)
    .filter(Boolean)

const findGeneralPreference = (id) => GENERAL_PREFERENCES.find((p) => p.id === id)

const groupGeneralIdsByCategory = (ids) => {
  const out = { companion: [], pace: [], budget: [], interests: [], planning: [], timing: [] }
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const def = findGeneralPreference(id)
    if (!def) continue
    if (!out[def.group]) out[def.group] = []
    out[def.group].push(def.label)
  }
  return out
}

/**
 * Maps onboarding profile signals from GENERAL_PREFERENCES to plan-generation
 * activity ids (from PREFERENCES). This keeps personalization useful even when
 * onboarding questions are profile-focused and independent from plan modal picks.
 */
const INTEREST_TO_ACTIVITY_MAP = {
  'culture-history': ['cultural', 'historical'],
  'nature-outdoors': ['nature'],
  foodie: [],
  nightlife: ['leisure'],
  shopping: ['sightseeing'],
  'relaxation-wellness': ['leisure'],
  adventure: ['adventure'],
  'instagram-spots': ['instagram'],
  'local-authentic': ['cultural', 'historical'],
  'family-friendly': ['leisure'],
  'art-museums': ['cultural'],
  'beaches-sun': ['nature'],
  'quiet-peaceful': ['leisure'],
  'social-lively': [],
  'hidden-gems': ['sightseeing'],
  'pace-relaxed': ['leisure', 'scenic', 'nature'],
  'pace-balanced': ['sightseeing', 'cultural', 'nature'],
  'pace-packed': ['adventure', 'instagram', 'sightseeing'],
  'plan-structured': ['historical', 'cultural'],
  'plan-flexible': ['leisure', 'nature'],
  'plan-mix': ['sightseeing', 'leisure'],
  'time-early': ['nature', 'scenic'],
  'time-afternoon': ['sightseeing', 'cultural'],
  'time-late': ['leisure', 'instagram'],
}

export const deriveActivityIdsFromInterestIds = (ids) => {
  const out = new Set()
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const mapped = INTEREST_TO_ACTIVITY_MAP[id]
    if (Array.isArray(mapped)) mapped.forEach((x) => out.add(x))
  }
  return [...out]
}

const buildFallbackSummary = ({ grouped, activityLabels, foodLabels, profileAnswers, viewerUType = 'local' }) => {
  const parts = []
  if (grouped.companion.length) parts.push(`Usually travels as: ${grouped.companion.join(' / ')}`)
  if (grouped.pace.length) parts.push(`Ideal day pace: ${grouped.pace.join(' / ')}`)
  if (grouped.budget.length) parts.push(`Budget comfort: ${grouped.budget.join(' / ')}`)
  if (grouped.interests.length) parts.push(`Experiences they love: ${grouped.interests.slice(0, 6).join(', ')}`)
  if (activityLabels.length) parts.push(`Activity leanings: ${activityLabels.slice(0, 4).join(', ')}`)
  if (foodLabels.length) parts.push(`Food personality: ${foodLabels.slice(0, 4).join(', ')}`)
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
  const activityLabels = pickLabels(activityIds, PREFERENCES)
  const foodLabels = pickLabels(foodIds, FOOD_CATEGORIES)

  const fallback = buildFallbackSummary({
    grouped,
    activityLabels,
    foodLabels,
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
    'Cover: who they travel with, the pace/energy they like, spending comfort, the 2–3 experience themes that matter most, food personality, and what they probably want to feel by the end of a great day.',
    'Write in present tense. Use warm, specific language ("This traveler loves…"). No bullet lists. No headings. No hedging.',
    'End with one short sentence that states the vibe their perfect Bahrain day should deliver — this sentence will guide later itinerary generation.',
  ].join(' ')

  const userPrompt = [
    `Local or visitor: ${vt === 'tourist' ? 'Visitor / tourist' : 'Local resident'}`,
    `Companion: ${grouped.companion.join(', ') || 'unspecified'}`,
    `Pace preference: ${grouped.pace.join(', ') || 'unspecified'}`,
    `Budget comfort: ${grouped.budget.join(', ') || 'unspecified'}`,
    `Core interests / experiences: ${grouped.interests.join(', ') || 'unspecified'}`,
    `Planning style: ${grouped.planning.join(', ') || 'unspecified'}`,
    `Timing preference: ${grouped.timing.join(', ') || 'unspecified'}`,
    `Activity leanings: ${activityLabels.join(', ') || 'unspecified'}`,
    `Food personality: ${foodLabels.join(', ') || 'unspecified'}`,
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
