const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini'

/**
 * @param {{
 *   messages: Array<{ role: string, content: string }>
 *   model?: string
 *   temperature?: number
 *   max_tokens?: number
 * }} opts
 */
export async function createChatCompletion(opts) {
  const messages = opts?.messages || []
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('createChatCompletion: messages required')
  }

  const model = opts.model || DEFAULT_MODEL
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.3
  const max_tokens = typeof opts.max_tokens === 'number' ? opts.max_tokens : 768

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error?.message || `OpenAI chat error (${res.status})`)
  }

  const text = json?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty response from chat model')
  return text
}
