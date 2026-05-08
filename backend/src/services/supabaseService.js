import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

/** Fields withheld from prompts (defense-in-depth vs RLS). */
const STRIP_FROM_CONTEXT = new Set([
  'email',
  'phone',
  'mobile',
  'whatsapp',
  'contact_email',
  'contact_phone',
  'owner_name',
  'account_a_uuid',
])

const CONTEXT_CLIENT_SELECT = [
  'client_a_uuid',
  'business_name',
  'description',
  'client_type',
  'rating',
  'price_range',
  'timings',
  'tags',
  'ai_summary',
  'lat',
  'long',
  'client_image',
].join(',')

/** Align with `public.events` columns used in-app (avoid selecting missing columns). */
const CONTEXT_EVENT_SELECT = [
  'event_uuid',
  'event_name',
  'venue',
  'lat',
  'long',
  'start_date',
  'end_date',
  'start_time',
  'end_time',
  'event_type',
  'status',
  'indoor_outdoor',
  'image',
  'client_a_uuid',
].join(',')

const sanitizeRow = (row) => {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (STRIP_FROM_CONTEXT.has(String(k).toLowerCase())) continue
    out[k] = v
  }
  return out
}

let cachedClient

const getAdminClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY for RAG hydration',
    )
  }
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cachedClient
}

/**
 * @param {string[]} clientAuuids
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchClientsByIds(clientAuuids) {
  const ids = [...new Set((clientAuuids || []).map((x) => String(x).trim()).filter(Boolean))]
  const map = new Map()
  if (ids.length === 0) return map

  const supabase = getAdminClient()
  const { data, error } = await supabase.from('client').select(CONTEXT_CLIENT_SELECT).in('client_a_uuid', ids)

  if (error) {
    throw new Error(`Supabase client fetch: ${error.message}`)
  }
  for (const row of data || []) {
    const id = row?.client_a_uuid != null ? String(row.client_a_uuid) : null
    if (id) map.set(id, sanitizeRow(row))
  }
  return map
}

/**
 * @param {string[]} eventUuids
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchEventsByIds(eventUuids) {
  const ids = [...new Set((eventUuids || []).map((x) => String(x).trim()).filter(Boolean))]
  const map = new Map()
  if (ids.length === 0) return map

  const supabase = getAdminClient()
  const { data, error } = await supabase.from('events').select(CONTEXT_EVENT_SELECT).in('event_uuid', ids)

  if (error) {
    throw new Error(`Supabase events fetch: ${error.message}`)
  }
  for (const row of data || []) {
    const id = row?.event_uuid != null ? String(row.event_uuid) : null
    if (id) map.set(id, sanitizeRow(row))
  }
  return map
}

const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Large union fetches for AI Plan hydrated catalog (chunks `.in` for PostgREST limits). */
/** `restaurant_client.a_uuid` ↔ `client.client_a_uuid` — food truck + meal / food tags for plan catalog */
export async function fetchRestaurantClientByAuuidsUnion(allIds) {
  const ids = [...new Set((allIds || []).map((x) => String(x).trim()).filter(Boolean))]
  const map = new Map()
  if (ids.length === 0) return map
  const supabase = getAdminClient()
  for (const part of chunk(ids, 80)) {
    const { data, error } = await supabase
      .from('restaurant_client')
      .select('a_uuid, isfoodtruck, meal_type, food_type, speciality')
      .in('a_uuid', part)
    if (error) throw new Error(`Supabase restaurant_client fetch: ${error.message}`)
    for (const row of data || []) {
      const id = row?.a_uuid != null ? String(row.a_uuid) : null
      if (id) map.set(id, sanitizeRow(row))
    }
  }
  return map
}

export async function fetchClientsByIdsUnion(allIds) {
  const ids = [...new Set((allIds || []).map((x) => String(x).trim()).filter(Boolean))]
  const map = new Map()
  if (ids.length === 0) return map
  const supabase = getAdminClient()
  for (const part of chunk(ids, 80)) {
    const { data, error } = await supabase.from('client').select(CONTEXT_CLIENT_SELECT).in('client_a_uuid', part)
    if (error) throw new Error(`Supabase client fetch: ${error.message}`)
    for (const row of data || []) {
      const id = row?.client_a_uuid != null ? String(row.client_a_uuid) : null
      if (id) map.set(id, sanitizeRow(row))
    }
  }
  return map
}

export async function fetchEventsByIdsUnion(allIds) {
  const ids = [...new Set((allIds || []).map((x) => String(x).trim()).filter(Boolean))]
  const map = new Map()
  if (ids.length === 0) return map
  const supabase = getAdminClient()
  for (const part of chunk(ids, 80)) {
    const { data, error } = await supabase.from('events').select(CONTEXT_EVENT_SELECT).in('event_uuid', part)
    if (error) throw new Error(`Supabase events fetch: ${error.message}`)
    for (const row of data || []) {
      const id = row?.event_uuid != null ? String(row.event_uuid) : null
      if (id) map.set(id, sanitizeRow(row))
    }
  }
  return map
}
