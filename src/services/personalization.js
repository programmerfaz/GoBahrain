import { OPENAI_KEY } from '../config/keys'
import { supabase } from '../config/supabase'
import { GENERAL_PREFERENCES, PREFERENCES, FOOD_CATEGORIES } from '../constants/preferences'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

const pickLabels = (ids, list) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => list.find((item) => item.id === id)?.label)
    .filter(Boolean)

const buildFallbackSummary = ({ generalLabels, activityLabels, foodLabels, profileAnswers }) => {
  const parts = []
  if (generalLabels.length) parts.push(`Travel style: ${generalLabels.slice(0, 5).join(', ')}`)
  if (activityLabels.length) parts.push(`Preferred activities: ${activityLabels.slice(0, 4).join(', ')}`)
  if (foodLabels.length) parts.push(`Food preferences: ${foodLabels.slice(0, 4).join(', ')}`)
  if (profileAnswers?.idealDay) parts.push(`Ideal day: ${String(profileAnswers.idealDay).trim()}`)
  if (profileAnswers?.avoidList) parts.push(`Avoid: ${String(profileAnswers.avoidList).trim()}`)
  if (!parts.length) return 'Explorer profile: open to a balanced Bahrain experience with a mix of food, culture, and local highlights.'
  return parts.join('. ')
}

export async function generateUserPersonaSummary({
  generalIds = [],
  activityIds = [],
  foodIds = [],
  profileAnswers = {},
}) {
  const generalLabels = pickLabels(generalIds, GENERAL_PREFERENCES)
  const activityLabels = pickLabels(activityIds, PREFERENCES)
  const foodLabels = pickLabels(foodIds, FOOD_CATEGORIES)

  const fallback = buildFallbackSummary({
    generalLabels,
    activityLabels,
    foodLabels,
    profileAnswers,
  })

  if (!OPENAI_KEY) return fallback

  const systemPrompt =
    'You are a senior personalization strategist for a travel app. ' +
    'Given onboarding answers, write one concise but rich profile paragraph (55-95 words) that captures: travel vibe, pace, budget tendency, social preference, top activity tastes, food direction, and constraints. ' +
    'Use warm third-person wording like "This user...". Do not include bullet points.'

  const userPrompt = [
    `General profile labels: ${generalLabels.join(', ') || 'none'}`,
    `Activity labels: ${activityLabels.join(', ') || 'none'}`,
    `Food labels: ${foodLabels.join(', ') || 'none'}`,
    `Ideal day text: ${profileAnswers?.idealDay ? String(profileAnswers.idealDay) : 'none'}`,
    `Avoid list text: ${profileAnswers?.avoidList ? String(profileAnswers.avoidList) : 'none'}`,
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
        temperature: 0.45,
        max_tokens: 220,
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

export async function buildAndPersistUserPersona(prefs) {
  const summary = await generateUserPersonaSummary(prefs)
  await upsertUserPersonaSummary({ summary, ...prefs })
  return summary
}
