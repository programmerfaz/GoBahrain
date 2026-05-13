import { supabase } from '../config/supabase'

/** Plan stop `planListTag` when the venue was boosted from a home-feed saved post */
export const PLAN_TAG_FROM_SAVES = 'From your saves'

/** Legacy `planListTag` stored in older saved plans */
const LEGACY_PLAN_TAG_FROM_SAVES = 'Chosen by you'

export const isPlanStopFromSavesTag = (tag) => {
  const t = String(tag || '').trim()
  return t === PLAN_TAG_FROM_SAVES || t === LEGACY_PLAN_TAG_FROM_SAVES
}

export const listSavedPostIds = async () => {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return []

  const { data, error } = await supabase
    .from('saved_posts')
    .select('post_uuid')
    .eq('user_id', uid)

  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .map((r) => r.post_uuid)
    .filter(Boolean)
}

/** Distinct client UUIDs from saved posts, newest saves first (for AI plan catalog boost). */
export const listSavedPostClientIdsForPlanBoost = async ({ limit = 16 } = {}) => {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return []

  const { data, error } = await supabase
    .from('saved_posts')
    .select('client_a_uuid, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })

  if (error) throw error
  const seen = new Set()
  const ordered = []
  for (const row of Array.isArray(data) ? data : []) {
    const id = String(row?.client_a_uuid || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
    if (ordered.length >= limit) break
  }
  return ordered
}

export const fetchClientDisplayNamesForUuids = async (uuids) => {
  const clean = [...new Set((Array.isArray(uuids) ? uuids : []).map((u) => String(u || '').trim()).filter(Boolean))].slice(
    0,
    24,
  )
  if (!clean.length) return []

  const { data, error } = await supabase
    .from('client')
    .select('client_a_uuid, business_name')
    .in('client_a_uuid', clean)

  if (error) {
    console.warn('[savedPosts] fetchClientDisplayNamesForUuids', error.message)
    return []
  }

  const byId = new Map()
  for (const row of Array.isArray(data) ? data : []) {
    const id = String(row?.client_a_uuid || '').trim()
    if (!id) continue
    const label = String(row?.business_name || '').trim()
    if (label) byId.set(id, label)
  }
  return clean.map((id) => byId.get(id) || null)
}

export const fetchSavedPostBoostContextForPlan = async ({ clientLimit = 16, nameLimit = 12 } = {}) => {
  try {
    const clientIds = await listSavedPostClientIdsForPlanBoost({ limit: clientLimit })
    const rawNames = await fetchClientDisplayNamesForUuids(clientIds)
    const hintNames = rawNames.filter((n) => typeof n === 'string' && n.trim()).slice(0, nameLimit)
    return { clientIds, hintNames }
  } catch (e) {
    console.warn('[savedPosts] fetchSavedPostBoostContextForPlan', e?.message)
    return { clientIds: [], hintNames: [] }
  }
}

export const buildNormalizedClientIdSet = (ids) =>
  new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim().toLowerCase()).filter(Boolean))

export const applyFromSavesPlanTags = (stops, rawClientIds) => {
  if (!Array.isArray(stops) || !rawClientIds?.length) return stops
  const idSet = buildNormalizedClientIdSet(rawClientIds)
  if (idSet.size === 0) return stops
  return stops.map((stop) => {
    const cid = String(stop?.clientId || '').trim().toLowerCase()
    if (!cid || !idSet.has(cid)) return stop
    return { ...stop, planListTag: PLAN_TAG_FROM_SAVES }
  })
}

export const savePostForUser = async ({ postUuid, clientAUuid }) => {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Sign in to save posts')

  const row = {
    user_id: uid,
    post_uuid: postUuid,
    client_a_uuid: clientAUuid,
  }
  const { error } = await supabase.from('saved_posts').insert(row)
  if (error) {
    if (error.code === '23505') return
    throw error
  }
}

export const unsavePostForUser = async (postUuid) => {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Sign in to save posts')

  const { error } = await supabase
    .from('saved_posts')
    .delete()
    .eq('user_id', uid)
    .eq('post_uuid', postUuid)

  if (error) throw error
}
