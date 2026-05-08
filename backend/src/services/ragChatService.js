import { createChatCompletion } from './openaiChatService.js'

const SYSTEM_PROMPT = `You are a helpful assistant for Bahrain travel and venues.

You MUST follow these rules:
- Answer ONLY using facts present in the "Retrieved records" section below.
- Do not invent places, events, prices, hours, or details that are not in those records.
- If the retrieved records do not contain the answer, say clearly that you have no matching information in the database and do not guess.
- Keep answers concise and practical.
- Do not cite internal IDs unless the user explicitly asks for technical details.`

const formatClientRecord = (row, index) => {
  const lines = [`[${index}] Type: client (${row.client_type || 'unknown'})`]
  if (row.business_name) lines.push(`Name: ${row.business_name}`)
  if (row.description) lines.push(`Description: ${row.description}`)
  if (row.ai_summary) lines.push(`Summary: ${row.ai_summary}`)
  if (row.rating != null && row.rating !== '') lines.push(`Rating: ${row.rating}`)
  if (row.price_range) lines.push(`Price range: ${row.price_range}`)
  if (row.timings) lines.push(`Timings: ${row.timings}`)
  if (row.tags) lines.push(`Tags: ${row.tags}`)
  if (row.lat != null && row.long != null) lines.push(`Coordinates: ${row.lat}, ${row.long}`)
  return lines.join('\n')
}

const formatEventRecord = (row, index) => {
  const lines = [`[${index}] Type: event`]
  if (row.event_name) lines.push(`Name: ${row.event_name}`)
  const desc = row.description ?? row.summary ?? ''
  if (String(desc || '').trim()) lines.push(`Description: ${desc}`)
  if (row.venue) lines.push(`Venue: ${row.venue}`)
  if (row.start_date || row.end_date) {
    lines.push(`Dates: ${[row.start_date, row.end_date].filter(Boolean).join(' → ')}`)
  }
  if (row.start_time || row.end_time) {
    lines.push(`Times: ${[row.start_time, row.end_time].filter(Boolean).join(' – ')}`)
  }
  if (row.event_type) lines.push(`Event type: ${row.event_type}`)
  if (row.status) lines.push(`Status: ${row.status}`)
  if (row.indoor_outdoor) lines.push(`Setting: ${row.indoor_outdoor}`)
  if (row.lat != null && row.long != null) lines.push(`Coordinates: ${row.lat}, ${row.long}`)
  return lines.join('\n')
}

/**
 * @param {Array<{ kind: 'client' | 'event', row: object }>} orderedHydrated
 * @returns {string}
 */
export function buildRetrievedContextBlock(orderedHydrated) {
  if (!orderedHydrated?.length) return ''
  const chunks = orderedHydrated.map((item, i) => {
    const n = i + 1
    return item.kind === 'event'
      ? formatEventRecord(item.row, n)
      : formatClientRecord(item.row, n)
  })
  return `Retrieved records (only source of truth you may use):\n\n${chunks.join('\n\n---\n\n')}`
}

/**
 * @param {string} userMessage
 * @param {string} contextBlock — empty → model must refuse to invent facts
 */
export async function generateRagChatReply(userMessage, contextBlock) {
  const userContent = contextBlock
    ? `${contextBlock}\n\nUser question:\n${userMessage}`
    : `No relevant records were retrieved from the database for this question.\n\nUser question:\n${userMessage}\n\nRespond that you have no matching information in the database and do not speculate.`

  return createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 768,
  })
}
