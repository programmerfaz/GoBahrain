const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const pineconeScore = (m) => (typeof m?.score === 'number' ? m.score : Number(m?.score) || 0)

/**
 * Classify Pinecone payload: events use events table; everything else assumes client row.
 */
export const recordKindFromMetadata = (meta) => {
  const rt = String(meta?.record_type || '').toLowerCase()
  const ct = String(meta?.client_type || '').toLowerCase()
  if (rt === 'event' || ct === 'event') return 'event'
  return 'client'
}

export const pickClientIdFromMatch = (match) => {
  const meta = match?.metadata || {}
  const fromMeta = meta.client_a_uuid ?? meta.client_uuid
  if (fromMeta != null && String(fromMeta).trim()) return String(fromMeta).trim()

  const id = match?.id != null ? String(match.id).trim() : ''
  if (id && UUID_RE.test(id)) return id
  return null
}

export const pickEventIdFromMatch = (match) => {
  const meta = match?.metadata || {}
  const candidates = [meta.event_uuid, match?.id, meta.uuid, meta.event_id].map((x) =>
    x != null ? String(x).trim() : '',
  )
  for (const c of candidates) {
    if (c && UUID_RE.test(c)) return c
  }
  return null
}

/**
 * @param {Array<{ score: number, metadata: object, id: string }>} matches Pinecone-ranked
 * @param {number} minScore
 */
export function filterMatchesByScore(matches, minScore) {
  const min = typeof minScore === 'number' && !Number.isNaN(minScore) ? minScore : 0
  return (matches || []).filter((m) => pineconeScore(m) >= min)
}

/**
 * Unique Supabase IDs to fetch in at most two round-trips (.in batches).
 */
export function gatherSupabaseIdsFromMatches(matches) {
  const clientIds = []
  const eventIds = []
  for (const m of matches || []) {
    const meta = m.metadata || {}
    if (recordKindFromMetadata(meta) === 'event') {
      const id = pickEventIdFromMatch(m)
      if (id) eventIds.push(id)
    } else {
      const id = pickClientIdFromMatch(m)
      if (id) clientIds.push(id)
    }
  }
  return {
    clientIds: [...new Set(clientIds)],
    eventIds: [...new Set(eventIds)],
  }
}

/**
 * @param {Array} filteredMatches scored & ordered matches from Pinecone
 * @param {Map<string, object>} clientRows
 * @param {Map<string, object>} eventRows
 * @returns {Array<{ kind: 'client' | 'event', row: object }>}
 */
export function buildOrderedHydratedRecords(filteredMatches, clientRows, eventRows) {
  const ordered = []
  const seen = new Set()

  for (const m of filteredMatches || []) {
    const meta = m.metadata || {}
    const kind = recordKindFromMetadata(meta)
    let row = null

    if (kind === 'event') {
      const id = pickEventIdFromMatch(m)
      row = id ? eventRows.get(id) : null
      const key = id ? `event:${id}` : null
      if (row && key && !seen.has(key)) {
        seen.add(key)
        ordered.push({ kind: 'event', row })
      }
    } else {
      const id = pickClientIdFromMatch(m)
      row = id ? clientRows.get(id) : null
      const key = id ? `client:${id}` : null
      if (row && key && !seen.has(key)) {
        seen.add(key)
        ordered.push({ kind: 'client', row })
      }
    }
  }

  return ordered
}
