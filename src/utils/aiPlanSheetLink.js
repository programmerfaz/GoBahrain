/**
 * When AI Plan is focused, the bottom sheet and tab bar share the same translateY
 * so the bar moves with the sheet while dragging.
 */
let linkedAnim = null
const subscribers = new Set()

const getSafeSubscribers = () => {
  if (!subscribers || typeof subscribers.forEach !== 'function') return []
  const out = []
  subscribers.forEach((fn) => out.push(fn))
  return out
}

const notifySubscribers = () => {
  const safeSubscribers = getSafeSubscribers()
  safeSubscribers.forEach((fn) => {
    if (typeof fn === 'function') fn(linkedAnim)
  })
}

export const aiPlanSheetLink = {
  attach(anim) {
    linkedAnim = anim
    notifySubscribers()
  },
  detach(anim) {
    if (linkedAnim === anim) linkedAnim = null
    notifySubscribers()
  },
  subscribe(fn) {
    if (subscribers && typeof subscribers.add === 'function') subscribers.add(fn)
    fn(linkedAnim)
    return () => {
      if (subscribers && typeof subscribers.delete === 'function') subscribers.delete(fn)
    }
  },
}
