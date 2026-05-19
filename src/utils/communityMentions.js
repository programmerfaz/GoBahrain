/** Stored mention token: @[Display Name](client_uuid) */
const MENTION_TOKEN_RE = /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi

export const formatClientMention = (name, clientId) => {
  const display = String(name || 'Venue').trim()
  const id = String(clientId || '').trim()
  if (!id) return `@${display}`
  return `@[${display}](${id})`
}

export const parseTextWithMentions = (text) => {
  if (!text) return [{ type: 'text', value: '' }]
  const segments = []
  let lastIndex = 0
  const re = new RegExp(MENTION_TOKEN_RE.source, 'gi')
  let match = re.exec(text)
  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    segments.push({
      type: 'mention',
      value: match[0],
      name: match[1],
      clientId: match[2],
    })
    lastIndex = match.index + match[0].length
    match = re.exec(text)
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments.length ? segments : [{ type: 'text', value: text }]
}

export const getActiveMentionTrigger = (text, cursor) => {
  if (text == null || cursor == null) return null
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, safeCursor)
  const atIndex = before.lastIndexOf('@')
  if (atIndex < 0) return null
  const afterAt = before.slice(atIndex + 1)
  if (afterAt.includes('[') || afterAt.includes('](')) return null
  if (/\s/.test(afterAt)) return null
  return {
    start: atIndex,
    query: afterAt,
  }
}

export const applyMentionSelection = (text, trigger, client) => {
  const token = formatClientMention(client.business_name, client.client_a_uuid)
  const before = text.slice(0, trigger.start)
  const after = text.slice(trigger.start + 1 + trigger.query.length)
  const next = `${before}${token} `
  const cursor = next.length + after.length
  return { text: `${next}${after}`, cursor: before.length + token.length + 1 }
}

export const filterClientsForMention = (clients, query, limit = 8) => {
  const list = Array.isArray(clients) ? clients : []
  const q = String(query || '').trim().toLowerCase()
  if (!q) return list.slice(0, limit)
  return list
    .filter((c) => String(c.business_name || '').toLowerCase().includes(q))
    .slice(0, limit)
}
