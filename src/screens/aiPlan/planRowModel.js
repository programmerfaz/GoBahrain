import { PLAN_TIME_SLOTS } from './constants'

/** Stable keys for draggable list rows (persist across reorder; replace on enhance). */
export function attachPlanRowKeys(plan) {
  if (!Array.isArray(plan)) return plan
  return plan.map((item, idx) => ({
    ...item,
    _planRowKey: item._planRowKey || `rk-${idx}-${Math.random().toString(36).slice(2, 11)}`,
  }))
}

export function inferTimeSlotForNewStop(plan) {
  if (!Array.isArray(plan) || plan.length === 0) return 'Afternoon'
  const last = plan[plan.length - 1]
  const t = last?.time
  if (t && PLAN_TIME_SLOTS.includes(t)) return t
  return 'Afternoon'
}

/** Draft plan row from a Supabase client row (coords filled in by enrichPlanWithClientData). */
export function buildDraftStopFromClient(client, existingPlan) {
  const ct = String(client?.client_type || '').toLowerCase()
  const type = ct === 'restaurant' ? 'restaurant' : ct === 'event' ? 'event' : 'place'
  const spot = String(client?.name || client?.business_name || client?.business_name_ar || 'Spot').trim()
  const rid = client?.client_a_uuid || client?.clientId
  const r = client?.rating
  const rating = r != null && r !== '' && Number.isFinite(Number(r)) ? Number(r) : null
  return {
    spot,
    time: inferTimeSlotForNewStop(existingPlan),
    type,
    lat: null,
    lng: null,
    reason: 'You added this to your day — drag to reorder or tap for details.',
    clientId: rid || null,
    rating,
    userAdded: true,
  }
}

export const getLuxuryCategoryStyle = (item) => {
  if (item.type === 'restaurant') {
    return { label: 'Dining', bg: '#FFE8EE', fg: '#FF4B78', icon: 'restaurant-outline' }
  }
  if (item.type === 'event') {
    return { label: 'Events', bg: '#EDE9FE', fg: '#7C3AED', icon: 'calendar-outline' }
  }
  return { label: 'Attractions', bg: '#FFE4F0', fg: '#DB2777', icon: 'location-outline' }
}


