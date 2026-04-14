/**
 * When AI Plan is focused, the bottom sheet and tab bar share the same translateY
 * so the bar moves with the sheet while dragging.
 */
let linkedAnim = null
const subscribers = new Set()

export const aiPlanSheetLink = {
  attach(anim) {
    linkedAnim = anim
    subscribers.forEach((fn) => fn(linkedAnim))
  },
  detach(anim) {
    if (linkedAnim === anim) linkedAnim = null
    subscribers.forEach((fn) => fn(linkedAnim))
  },
  subscribe(fn) {
    subscribers.add(fn)
    fn(linkedAnim)
    return () => {
      subscribers.delete(fn)
    }
  },
}
