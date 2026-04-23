let latestPayload = null
const subscribers = new Set()

const getSafeSubscribers = () => {
  if (!subscribers || typeof subscribers.forEach !== 'function') return []
  const out = []
  subscribers.forEach((fn) => out.push(fn))
  return out
}

const notifySubscribers = () => {
  const safe = getSafeSubscribers()
  safe.forEach((fn) => {
    if (typeof fn === 'function') fn(latestPayload)
  })
}

export const openKhalidChat = (payload = {}) => {
  latestPayload = {
    ts: Date.now(),
    source: payload.source || 'unknown',
    place: payload.place || '',
    summary: payload.summary || '',
  }
  notifySubscribers()
}

export const khalidChatLink = {
  subscribe(fn) {
    if (subscribers && typeof subscribers.add === 'function') subscribers.add(fn)
    return () => {
      if (subscribers && typeof subscribers.delete === 'function') subscribers.delete(fn)
    }
  },
}
