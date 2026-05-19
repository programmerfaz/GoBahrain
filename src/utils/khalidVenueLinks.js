import { supabase } from '../config/supabase'

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeVenueName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const doesVenueNameMatchTarget = (candidateName, targetName) => {
  const name = normalizeVenueName(candidateName)
  const target = normalizeVenueName(targetName)
  if (!name || !target) return false
  if (name === target) return true
  if (name.includes(target) || target.includes(name)) return true
  const nameTokens = name.split(' ').filter(Boolean)
  const targetTokens = target.split(' ').filter(Boolean)
  if (!nameTokens.length || !targetTokens.length) return false
  const overlap = targetTokens.filter((token) => nameTokens.includes(token)).length
  const minNeeded = Math.max(1, Math.min(targetTokens.length, 2))
  return overlap >= minNeeded
}

const GENERIC_SUFFIX_RE =
  /\s*[-–|]\s*.+$|\s+(restaurant|cafe|café|coffee shop|coffeehouse|grill|lounge|bar|bistro|kitchen|eatery|bahrain|manama|branch)\s*$/i

/** Alternate strings to match how Khalid may shorten a listing name in chat. */
export const expandVenueLinkAliases = (canonicalName) => {
  const name = String(canonicalName || '').trim()
  if (name.length < 2) return []
  const variants = new Set()
  const add = (v) => {
    const t = String(v || '').trim()
    if (t.length >= 2) variants.add(t)
  }
  add(name)
  add(name.replace(GENERIC_SUFFIX_RE, '').trim())
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 3) add(words.slice(0, 2).join(' '))
  if (words.length >= 4) add(words.slice(0, 3).join(' '))
  const noGeneric = name
    .replace(/\b(restaurant|cafe|café|coffee shop|grill|lounge|bar|bistro)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (noGeneric.length >= 3 && noGeneric !== name) add(noGeneric)
  return [...variants].sort((a, b) => b.length - a.length)
}

/** Parse ALLOWED PLACES lines — supports legacy lines and (cid:uuid) from Pinecone. */
export const parseAllowedVenuesFromKhalidContext = (pineconePlacesContext) => {
  const venues = []
  const lines = String(pineconePlacesContext || '').split('\n')
  for (const line of lines) {
    const typed = line.match(/^\s*-\s*\[(place|restaurant|event)\]\s+(.+)$/i)
    if (!typed?.[2]) continue
    const clientType = String(typed[1] || '').toLowerCase()
    const body = String(typed[2]).trim()
    const cidMatch = body.match(/\(cid:([^)]+)\)/i)
    const clientId = cidMatch?.[1] ? String(cidMatch[1]).trim() : ''
    let name = cidMatch ? body.slice(0, cidMatch.index).trim() : body
    const metaSplit = name.split(' · ')[0].trim()
    name = metaSplit.split('—')[0].trim()
    name = name.replace(/\s*\([^)]*\)\s*$/g, '').trim()
    if (!name) continue
    venues.push({
      name: name.slice(0, 160),
      clientType,
      ...(clientId ? { clientId } : {}),
    })
  }
  return venues
}

export const buildKhalidVenueLinksFromPineconeContext = (pineconePlacesContext) =>
  parseAllowedVenuesFromKhalidContext(pineconePlacesContext)
    .filter((v) => v.name && v.clientId)
    .map((v) => ({
      name: v.name,
      clientId: v.clientId,
      clientType: v.clientType || '',
    }))

/** Every venue in ALLOWED PLACES that Khalid's reply references (for highlighting). */
export const buildKhalidHighlightLinksForReply = (replyText, pineconePlacesContext) => {
  const raw = String(replyText || '').trim()
  if (!raw) return []
  const allowed = parseAllowedVenuesFromKhalidContext(pineconePlacesContext)
  const seen = new Set()
  const out = []
  for (const venue of allowed) {
    const canonical = String(venue.name || '').trim()
    if (!canonical || seen.has(`c:${canonical.toLowerCase()}`)) continue
    const span = findVenueNameSpanInText(raw, canonical)
    if (!span?.text) continue
    const displayName = String(span.text).trim()
    const displayKey = displayName.toLowerCase()
    if (seen.has(displayKey)) continue
    seen.add(`c:${canonical.toLowerCase()}`)
    seen.add(displayKey)
    out.push({
      name: displayName,
      canonicalName: canonical,
      clientId: String(venue.clientId || '').trim(),
      clientType: String(venue.clientType || '').trim(),
    })
  }
  return out
}

const NON_VENUE_PHRASES = new Set([
  'bahrain',
  'manama',
  'khalid',
  'siyahabh',
  'siyaha',
  'allowed places',
  'the app',
  'your area',
  'near you',
  'from you',
])

/** Names Khalid wrote that may not appear verbatim in ALLOWED PLACES (for Supabase resolve). */
export const extractLikelyVenuePhrasesFromKhalidReply = (replyText, knownCanonicalNames = []) => {
  const raw = String(replyText || '')
  if (!raw.trim()) return []

  const knownNorm = new Set(
    (Array.isArray(knownCanonicalNames) ? knownCanonicalNames : [])
      .map((n) => normalizeVenueName(n))
      .filter(Boolean),
  )

  const candidates = new Set()
  const add = (phrase) => {
    const t = String(phrase || '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—•]+/, '')
      .trim()
    if (t.length < 3 || t.length > 72) return
    const norm = normalizeVenueName(t)
    if (!norm || norm.length < 3) return
    if (NON_VENUE_PHRASES.has(norm)) return
    if (knownNorm.has(norm)) return
    if ([...knownNorm].some((k) => k.includes(norm) || norm.includes(k))) return
    candidates.add(t)
  }

  const listRe = /(?:^|[\n.])\s*(?:\d+[\.\)]\s*|[-•]\s+)([A-Za-z][^\n,.]{2,58}?)(?=\s*[-–—:,]|\s*,|\s*\.|\s+is\s|\s+are\s|\s+offers|\s+has\s|$)/gim
  let m
  while ((m = listRe.exec(raw)) !== null) add(m[1])

  const quotedRe = /["“]([^"”\n]{2,60})["”]/g
  while ((m = quotedRe.exec(raw)) !== null) add(m[1])

  const capPhraseRe =
    /\b([A-Z][A-Za-z0-9&'’]+(?:\s+(?:&|and|of|the|Al|al|bin|Bin)\s+)?(?:[A-Z][A-Za-z0-9&'’]+)(?:\s+[A-Z][A-Za-z0-9&'’]+){0,4})\b/g
  while ((m = capPhraseRe.exec(raw)) !== null) add(m[1])

  return [...candidates].slice(0, 12)
}

export const mergeKhalidVenueLinks = (...lists) => {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const link of Array.isArray(list) ? list : []) {
      const name = String(link?.name || '').trim()
      if (!name) continue
      const key = String(link?.clientId || '').trim() || `name:${name.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        name,
        clientId: String(link?.clientId || '').trim(),
        clientType: String(link?.clientType || '').trim(),
      })
    }
  }
  return out
}

const STOP_NAME_TOKENS = new Set([
  'the',
  'and',
  'for',
  'bahrain',
  'manama',
  'block',
  'near',
  'best',
  'good',
  'great',
])

/** Find a span in reply text that refers to this venue (exact, then token-phrase fallback). */
export const findVenueNameSpanInText = (text, venueName) => {
  const raw = String(text || '')
  const name = String(venueName || '').trim()
  if (!raw || name.length < 2) return null

  const tryPattern = (pattern, flags = 'gi') => {
    const re = new RegExp(pattern, flags)
    const m = re.exec(raw)
    if (!m || m.index == null) return null
    return { start: m.index, end: m.index + m[0].length, text: m[0] }
  }

  for (const alias of expandVenueLinkAliases(name)) {
    const exact = tryPattern(escapeRegExp(alias))
    if (exact) return exact
  }

  const tokens = normalizeVenueName(name)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP_NAME_TOKENS.has(t))
  if (!tokens.length) return null

  for (let len = Math.min(tokens.length, 5); len >= 1; len -= 1) {
    for (let i = 0; i <= tokens.length - len; i += 1) {
      const phrase = tokens.slice(i, i + len).join('\\s+')
      const hit = tryPattern(`\\b${phrase}\\b`, 'i')
      if (hit) return hit
    }
  }

  return null
}

/** True when the reply plausibly discusses this venue. */
export const isVenueMentionedInKhalidReply = (replyText, venueName) => {
  const raw = String(replyText || '')
  const name = String(venueName || '').trim()
  if (!raw || name.length < 2) return false

  if (findVenueNameSpanInText(raw, name)) return true

  const replyNorm = normalizeVenueName(raw)
  const nameNorm = normalizeVenueName(name)
  if (!nameNorm) return false
  if (replyNorm.includes(nameNorm)) return true

  const tokens = nameNorm.split(' ').filter((t) => t.length >= 3 && !STOP_NAME_TOKENS.has(t))
  if (!tokens.length) return false

  const hits = tokens.filter((t) => replyNorm.includes(t)).length
  if (tokens.length === 1) return hits >= 1
  if (tokens.length === 2) return hits >= 2
  return hits >= Math.max(2, Math.ceil(tokens.length * 0.5))
}

export const buildTextSegmentsWithVenueLinks = (text, venueLinks = []) => {
  const raw = String(text ?? '')
  if (!raw) return [{ type: 'text', value: '' }]

  const links = (Array.isArray(venueLinks) ? venueLinks : [])
    .filter((l) => l?.name)
    .sort((a, b) => String(b.name).length - String(a.name).length)

  if (!links.length) return [{ type: 'text', value: raw }]

  const matches = []
  for (const link of links) {
    let span = findVenueNameSpanInText(raw, link.name)
    if (!span && link.canonicalName) {
      span = findVenueNameSpanInText(raw, link.canonicalName)
    }
    if (!span) continue
    matches.push({
      start: span.start,
      end: span.end,
      text: span.text,
      link,
    })
  }

  if (!matches.length) return [{ type: 'text', value: raw }]

  matches.sort((a, b) => a.start - b.start || b.end - a.start - (a.end - a.start))
  const chosen = []
  let cursor = -1
  for (const m of matches) {
    if (m.start < cursor) continue
    chosen.push(m)
    cursor = m.end
  }

  const segments = []
  let index = 0
  for (const m of chosen) {
    if (m.start > index) {
      segments.push({ type: 'text', value: raw.slice(index, m.start) })
    }
    const hasId = Boolean(String(m.link.clientId || '').trim())
    segments.push({
      type: hasId ? 'link' : 'highlight',
      value: m.text,
      name: m.link.name,
      clientId: m.link.clientId || '',
    })
    index = m.end
  }
  if (index < raw.length) {
    segments.push({ type: 'text', value: raw.slice(index) })
  }
  return segments.length ? segments : [{ type: 'text', value: raw }]
}

/** Venues from this turn that Khalid named in the reply (for profile chips). */
export const pickMentionedKhalidVenueLinks = (replyText, venueLinks = []) => {
  const raw = String(replyText || '')
  const links = (Array.isArray(venueLinks) ? venueLinks : []).filter((l) => l?.name && l?.clientId)
  if (!raw.trim() || !links.length) return []

  const seen = new Set()
  const out = []
  const add = (link) => {
    const clientId = String(link?.clientId || '').trim()
    const name = String(link?.name || '').trim()
    if (!clientId || !name || seen.has(clientId)) return
    seen.add(clientId)
    out.push({ name, clientId })
  }

  for (const seg of buildTextSegmentsWithVenueLinks(raw, links)) {
    if (seg.type === 'link' && seg.clientId) {
      add({ name: seg.name, clientId: seg.clientId })
    }
  }

  for (const link of links) {
    if (seen.has(link.clientId)) continue
    if (isVenueMentionedInKhalidReply(raw, link.name)) add(link)
  }

  return out.slice(0, 8)
}

export const sliceSegmentsToVisibleLength = (segments, visibleLen) => {
  const safeLen = Math.max(0, Number(visibleLen) || 0)
  if (safeLen === 0) return []

  const out = []
  let remaining = safeLen

  for (const seg of segments) {
    if (remaining <= 0) break
    const value = String(seg.value || '')
    if (!value) continue

    if (seg.type === 'link' || seg.type === 'highlight') {
      if (value.length <= remaining) {
        out.push(seg)
        remaining -= value.length
      } else {
        out.push({ type: 'text', value: value.slice(0, remaining) })
        remaining = 0
      }
      continue
    }

    const take = Math.min(value.length, remaining)
    if (take > 0) {
      out.push({ type: 'text', value: value.slice(0, take) })
      remaining -= take
    }
  }

  return out
}

export const resolveKhalidVenueLinksByNames = async (names = []) => {
  const unique = [...new Set((Array.isArray(names) ? names : []).map((n) => String(n || '').trim()).filter((n) => n.length >= 2))]
  if (!unique.length) return []

  const resolved = []
  const seenIds = new Set()
  const seenNames = new Set()

  for (const name of unique.slice(0, 20)) {
    const safe = name.replace(/[^a-z0-9\s]/gi, ' ').trim().slice(0, 80)
    if (safe.length < 2) continue

    try {
      const { data: clientRows } = await supabase
        .from('client')
        .select('client_a_uuid, business_name')
        .ilike('business_name', `%${safe}%`)
        .limit(8)

      const clientMatch = (Array.isArray(clientRows) ? clientRows : []).find((row) =>
        doesVenueNameMatchTarget(row.business_name, name),
      )

      if (clientMatch?.client_a_uuid && !seenIds.has(clientMatch.client_a_uuid)) {
        seenIds.add(clientMatch.client_a_uuid)
        const label = String(clientMatch.business_name || name).trim()
        seenNames.add(label.toLowerCase())
        resolved.push({
          name: label,
          clientId: clientMatch.client_a_uuid,
        })
        continue
      }

      const { data: eventRows } = await supabase
        .from('events')
        .select('event_uuid, event_name, client_a_uuid')
        .ilike('event_name', `%${safe}%`)
        .limit(4)

      const eventMatch = (Array.isArray(eventRows) ? eventRows : []).find((row) =>
        doesVenueNameMatchTarget(row.event_name, name),
      )

      const profileId = eventMatch?.client_a_uuid || null
      if (profileId && !seenIds.has(profileId)) {
        seenIds.add(profileId)
        const label = String(eventMatch.event_name || name).trim()
        seenNames.add(label.toLowerCase())
        resolved.push({
          name: label,
          clientId: profileId,
        })
      }
    } catch {
      /* skip single name */
    }
  }

  return resolved
}
