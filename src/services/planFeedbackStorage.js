import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@gobahrain_plan_feedback_v2'
const MAX_EACH = 40

/** Same normalization used when matching catalog / plan spot titles */
export const normalizePlanFeedbackSpotKey = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const loadRaw = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return { disliked: [], liked: [] }
    const j = JSON.parse(raw)
    if (!j || typeof j !== 'object') return { disliked: [], liked: [] }
    return {
      disliked: Array.isArray(j.disliked) ? j.disliked : [],
      liked: Array.isArray(j.liked) ? j.liked : [],
    }
  } catch (_) {
    return { disliked: [], liked: [] }
  }
}

const saveRaw = async (payload) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (_) {}
}

const capList = (list) => list.slice(Math.max(0, list.length - MAX_EACH))

/**
 * Signals from per-stop thumbs. Used to downrank/boost venues in retrieval ordering.
 */
export const loadPlanFeedbackSignals = async () => {
  const { disliked, liked } = await loadRaw()
  const dislikedNorm = [...new Set(disliked.map((x) => normalizePlanFeedbackSpotKey(x)).filter(Boolean))]
  const likedNorm = [...new Set(liked.map((x) => normalizePlanFeedbackSpotKey(x)).filter(Boolean))]
  return {
    feedbackDownrankSpots: dislikedNorm,
    feedbackBoostSpots: likedNorm,
  }
}

const appendUniqueNormalized = (list, normalizedValue) => {
  if (!normalizedValue) return list
  const next = list.filter((x) => normalizePlanFeedbackSpotKey(x) !== normalizedValue)
  next.push(normalizedValue)
  return capList(next)
}

export const recordPlanStopFeedback = async (spotName, kind) => {
  const key = normalizePlanFeedbackSpotKey(spotName)
  if (!key) return { disliked: [], liked: [] }
  const prev = await loadRaw()
  const disliked = prev.disliked.map((x) => normalizePlanFeedbackSpotKey(x)).filter(Boolean)
  const liked = prev.liked.map((x) => normalizePlanFeedbackSpotKey(x)).filter(Boolean)
  let nextDisliked = disliked.filter((x) => x !== key)
  let nextLiked = liked.filter((x) => x !== key)
  if (kind === 'down') {
    nextDisliked = appendUniqueNormalized(nextDisliked, key)
  } else if (kind === 'up') {
    nextLiked = appendUniqueNormalized(nextLiked, key)
  }
  await saveRaw({ disliked: nextDisliked, liked: nextLiked })
  return { disliked: nextDisliked, liked: nextLiked }
}
