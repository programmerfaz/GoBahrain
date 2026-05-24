import { OPENAI_KEY } from '../config/keys'
import {
  fetchPineconePlacesForChat,
  buildKhalidPineconeQueryText,
} from './aiPipeline'
import { buildKhalidSystemPrompt, sanitizeKhalidAssistantReplyPlain } from './khalidPrompt'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

const buildARModeAppendix = (arContext = {}) => {
  const locked = String(arContext.lockedPlaceName || '').trim()
  const isLocked = Boolean(arContext.isLocked && locked)
  const visible = Array.isArray(arContext.visiblePoiNames)
    ? arContext.visiblePoiNames.filter(Boolean).slice(0, 8)
    : []

  const lines = [
    '\n\n═══ AR CAMERA MODE (inline guide panel — not full chat screen) ═══',
    '- User is in AR Explorer with live camera; they only see your latest reply in a small panel (no chat history UI).',
    '- Always use "actions": [] — no cards, no tab navigation, no theme changes from AR.',
    '- Keep "reply" to 2–4 short plain sentences; direct and local.',
  ]

  if (isLocked) {
    lines.push(
      '',
      `═══ LOCKED DESTINATION — PRIMARY TOPIC (mandatory) ═══`,
      `Navigation is LOCKED onto: "${locked}".`,
      `Every "reply" MUST be mainly about "${locked}" — what it is, why it matters, what to do when they arrive, and one practical tip.`,
      `Treat short or vague questions ("tell me more", "worth it?", "what is this?", "anything good?") as questions ABOUT "${locked}" unless they clearly name a different place.`,
      `Do NOT pivot to other venues unless they explicitly ask for alternatives nearby (e.g. "what else is close?").`,
      arContext.lockedPlaceFacts
        ? `\nLocked place notes (ground truth when aligned with ALLOWED PLACES):\n${String(arContext.lockedPlaceFacts).trim()}`
        : '',
      arContext.lockedNarration
        ? `\nYour earlier AR guide line for this lock:\n${String(arContext.lockedNarration).trim().slice(0, 400)}`
        : '',
    )
    if (visible.length) {
      lines.push(
        `\nOther POIs in camera view (mention only if user asks for alternatives): ${visible.filter((n) => n !== locked).join(', ') || 'none'}.`,
      )
    }
  } else {
    lines.push(
      '- No place locked yet — they may lock a marker to navigate.',
      visible.length ? `- POIs in camera view: ${visible.join(', ')}.` : '',
    )
  }

  return lines.join('\n')
}

const buildApiUserText = (trimmed, arContext) => {
  const locked = String(arContext.lockedPlaceName || '').trim()
  if (!arContext.isLocked || !locked) return trimmed
  return `[AR: user is locked onto "${locked}" — answer mainly about this place.] ${trimmed}`
}

const buildRetrievalQueryForAR = (trimmed, draftHistory, arContext) => {
  const locked = String(arContext.lockedPlaceName || '').trim()
  const base = buildKhalidPineconeQueryText(trimmed, draftHistory)
  if (!arContext.isLocked || !locked) return base
  const facts = String(arContext.lockedPlaceFacts || '').trim().slice(0, 200)
  const merged = `${locked}. ${facts} ${base}`.replace(/\s+/g, ' ').trim()
  return merged.slice(0, 950)
}

/**
 * Sends one AR inline chat turn. Returns assistant reply text only.
 */
export const sendARKhalidMessage = async ({
  userText,
  generalLabels = [],
  personaSummary = '',
  viewerUType = 'local',
  arContext = {},
  apiHistory = [],
  signal,
}) => {
  const trimmed = String(userText || '').trim()
  if (!trimmed) throw new Error('Empty message')

  const apiUserText = buildApiUserText(trimmed, arContext)
  const draftHistory = [
    ...(Array.isArray(apiHistory) ? apiHistory : []),
    { role: 'user', content: apiUserText },
  ]
  const retrievalQueryText = buildRetrievalQueryForAR(trimmed, draftHistory, arContext)

  const lockedForSkip = String(arContext.lockedPlaceName || '').trim()
  const hasLockedFacts =
    Boolean(arContext.isLocked && lockedForSkip) &&
    String(arContext.lockedPlaceFacts || '').trim().length >= 24

  /** Locked AR: we already ship curated place facts + pin — skip embedding + 3× Pinecone (major latency win). */
  const coords = arContext.coords
  const userLocationApprox =
    coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      ? { lat: coords.lat, lng: coords.lng }
      : null
  const proximityAsk = /\b(near\s*me|nearby|nearest|closest)\b/i.test(trimmed)

  const pineconePlacesContext = hasLockedFacts
    ? ''
    : await fetchPineconePlacesForChat(trimmed, {
        generalLabels,
        personaSummary,
        retrievalQueryText,
        sortByProximity: Boolean(proximityAsk && userLocationApprox),
        userLocation: userLocationApprox,
      })

  const locked = String(arContext.lockedPlaceName || '').trim()
  const curatedParts = [
    String(arContext.lockedPlaceFacts || '').trim(),
    String(arContext.lockedNarration || '').trim(),
  ].filter(Boolean)

  const venuePin =
    arContext.isLocked && locked
      ? {
          placeName: locked,
          curatedSummary: curatedParts.join('\n\n').slice(0, 1200),
        }
      : null

  const systemPrompt =
    buildKhalidSystemPrompt(
      pineconePlacesContext,
      {
        generalLabels,
        personaSummary,
        viewerUType,
      },
      venuePin,
      userLocationApprox,
    ) + buildARModeAppendix(arContext)

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    signal,
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...draftHistory],
      temperature: 0.58,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error?.message || `GPT error (${res.status})`)
  }

  const raw = json?.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('Empty reply from Khalid')

  let replyText = raw
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.reply === 'string') replyText = parsed.reply
  } catch {
    /* use raw */
  }

  return { reply: sanitizeKhalidAssistantReplyPlain(replyText) }
}
