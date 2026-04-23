import { supabase } from '../config/supabase'

const SHARE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SHARE_CODE_LEN = 8

export const generateShareCode = () => {
  let out = ''
  for (let i = 0; i < SHARE_CODE_LEN; i += 1) {
    out += SHARE_CODE_CHARS[Math.floor(Math.random() * SHARE_CODE_CHARS.length)]
  }
  return out
}

export const normalizeShareCode = (code) => String(code || '').trim().toUpperCase()

export const serializePlanForStorage = (dayPlan) => {
  if (!Array.isArray(dayPlan)) return []
  return dayPlan.map((stop) => {
    const { _planRowKey, ...rest } = stop
    return rest
  })
}

export const listSavedPlans = async () => {
  const { data, error } = await supabase
    .from('saved_plans')
    .select('id, title, plan_data, share_code, share_permission, updated_at, created_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export const getSavedPlanById = async (id) => {
  const { data, error } = await supabase
    .from('saved_plans')
    .select('id, title, plan_data, share_code, share_permission, updated_at, owner_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export const createSavedPlan = async ({ title, planData }) => {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Sign in to save plans')

  const row = {
    owner_id: uid,
    title: typeof title === 'string' && title.trim() ? title.trim() : 'My plan',
    plan_data: planData,
  }
  const { data, error } = await supabase.from('saved_plans').insert(row).select('id').single()
  if (error) throw error
  return data?.id
}

export const updateSavedPlan = async (id, { title, planData, shareCode, sharePermission }) => {
  const patch = {}
  if (title != null) {
    const t = typeof title === 'string' ? title.trim() : ''
    patch.title = t || 'My plan'
  }
  if (planData != null) patch.plan_data = planData
  if (shareCode !== undefined) patch.share_code = shareCode
  if (sharePermission != null) patch.share_permission = sharePermission
  if (Object.keys(patch).length === 0) return
  patch.updated_at = new Date().toISOString()

  const { error } = await supabase.from('saved_plans').update(patch).eq('id', id)
  if (error) throw error
}

export const deleteSavedPlan = async (id) => {
  const { error } = await supabase.from('saved_plans').delete().eq('id', id)
  if (error) throw error
}

/** Enable sharing: assigns a unique share_code (retries on conflict). Keeps existing code when already set. */
export const enableSharingForPlan = async (planId, sharePermission) => {
  const perm = sharePermission === 'edit' ? 'edit' : 'view'
  const { data: existing, error: fetchErr } = await supabase
    .from('saved_plans')
    .select('share_code')
    .eq('id', planId)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (existing?.share_code) {
    const { error } = await supabase
      .from('saved_plans')
      .update({
        share_permission: perm,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
    if (error) throw error
    return existing.share_code
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateShareCode()
    const { error } = await supabase
      .from('saved_plans')
      .update({
        share_code: code,
        share_permission: perm,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
    if (!error) return code
    if (!String(error.message || '').toLowerCase().includes('unique')) throw error
  }
  throw new Error('Could not generate share code')
}

export const disableSharingForPlan = async (planId) => {
  await updateSavedPlan(planId, { shareCode: null })
}

export const fetchSharedPlanByCode = async (rawCode) => {
  const code = normalizeShareCode(rawCode)
  if (code.length < 6) return null
  const { data, error } = await supabase.rpc('fetch_shared_plan', { p_share_code: code })
  if (error) {
    console.warn('[savedPlans] fetch_shared_plan', error.message)
    return null
  }
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data
}

export const pushSharedPlanUpdate = async (rawCode, planData) => {
  const code = normalizeShareCode(rawCode)
  const { data, error } = await supabase.rpc('update_shared_plan', {
    p_share_code: code,
    p_plan_data: planData,
  })
  if (error) throw error
  if (data != null && typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
  return data
}
