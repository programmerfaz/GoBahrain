import { PLAN_TIME_SLOTS } from './constants'
import { isTruthyFoodTruck } from '../../utils/restaurantClientMeta'

/**
 * Extra chips on plan rows — food trucks show a single Food truck tag only (no Dining + snack duplicates).
 * @returns {{ key: string, label: string, variant: 'food_truck' }[]}
 */
export const getPlanStopVenueExtraTags = (item) => {
  if (!item || (item.type !== 'restaurant' && String(item.client_type || '').toLowerCase() !== 'restaurant')) {
    return []
  }
  if (!isTruthyFoodTruck(item?.isfoodtruck)) {
    return []
  }
  return [{ key: 'food_truck', label: 'Food truck', variant: 'food_truck' }]
}

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
    /** Warm rose / red — food */
    return { label: 'Dining', bg: '#FEF2F2', fg: '#B91C1C', icon: 'restaurant-outline' }
  }
  if (item.type === 'event') {
    return { label: 'Events', bg: '#EDE9FE', fg: '#7C3AED', icon: 'calendar-outline' }
  }
  /** Cool sky blue — places / explore (visually distinct from pink Dining) */
  return { label: 'Attractions', bg: '#EFF6FF', fg: '#2563EB', icon: 'location-outline' }
}


