#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_SYSTEM_PROMPT = 'You are a concise Bahrain tourism assistant for places and clients.'
const DEFAULT_TABLE = 'client'
const DEFAULT_LIMIT = 2000
const DEFAULT_SELECT =
  'client_a_uuid,account_a_uuid,business_name,description,rating,price_range,client_type,client_image,lat,long,timings,tags,qrcode,ai_summary'

const REDACT_FIELDS = new Set([
  'email',
  'phone',
  'mobile',
  'whatsapp',
  'contact_email',
  'contact_phone',
  'owner_name',
  'first_name',
  'last_name',
  'full_name',
  'national_id',
  'passport',
])

const loadEnvFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex <= 0) continue

      const key = trimmed.slice(0, eqIndex).trim()
      const rawValue = trimmed.slice(eqIndex + 1).trim()
      if (!key || process.env[key] != null) continue

      const unquoted =
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
          ? rawValue.slice(1, -1)
          : rawValue

      process.env[key] = unquoted
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const normalizeText = (value) => {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map((x) => String(x)).join(', ')
  return String(value).trim()
}

const safeRecord = (row) => {
  const clean = {}
  for (const [key, value] of Object.entries(row || {})) {
    if (REDACT_FIELDS.has(String(key).toLowerCase())) continue
    clean[key] = value
  }
  return clean
}

const buildUserPromptFromRecord = (record) => {
  const name = normalizeText(record.business_name || 'Unknown place')
  const type = normalizeText(record.client_type || 'place')
  const lat = normalizeText(record.lat || '')
  const lng = normalizeText(record.long || '')
  const rating = normalizeText(record.rating || '')
  const priceRange = normalizeText(record.price_range || '')
  const timings = normalizeText(record.timings || '')
  const description = normalizeText(record.description || '')
  const tags = normalizeText(record.tags || '')
  const aiSummary = normalizeText(record.ai_summary || '')

  const parts = [
    `Create a short recommendation for this Bahrain client profile.`,
    `Name: ${name}`,
    `Type: ${type}`,
    lat && lng ? `Coordinates: ${lat}, ${lng}` : '',
    rating ? `Rating: ${rating}` : '',
    priceRange ? `Price Range: ${priceRange}` : '',
    timings ? `Timings: ${timings}` : '',
    tags ? `Tags: ${tags}` : '',
    description ? `Description: ${description}` : '',
    aiSummary ? `AI Summary: ${aiSummary}` : '',
    'Keep it practical and tourist-friendly.',
  ].filter(Boolean)

  return parts.join('\n')
}

const buildAssistantReplyFromRecord = (record) => {
  const name = normalizeText(record.business_name || 'This place')
  const type = normalizeText(record.client_type || 'place').toLowerCase()
  const lat = normalizeText(record.lat || '')
  const lng = normalizeText(record.long || '')
  const rating = normalizeText(record.rating || '')
  const priceRange = normalizeText(record.price_range || '')
  const timings = normalizeText(record.timings || '')
  const tags = normalizeText(record.tags || '')
  const aiSummary = normalizeText(record.ai_summary || '')

  const categoryHint =
    type === 'restaurant'
      ? 'Great for food-focused plans'
      : type === 'event'
        ? 'Suitable for time-based itinerary stops'
        : 'Good as a flexible sightseeing stop'

  const ratingLine = rating ? `It has a listed rating of ${rating}.` : ''
  const priceLine = priceRange ? `Its price range is ${priceRange}.` : ''
  const timingLine = timings ? `Typical timings: ${timings}.` : ''
  const tagsLine = tags ? `Highlights include: ${tags}.` : ''
  const coordsLine = lat && lng ? `Map coordinates are ${lat}, ${lng}.` : ''
  const summaryLine = aiSummary ? `Quick overview: ${aiSummary}.` : ''

  return `${name} is a ${type} option in Bahrain. ${categoryHint}. ${ratingLine} ${priceLine} ${timingLine} ${tagsLine} ${coordsLine} ${summaryLine} Consider visiting during less crowded hours and grouping it with nearby stops.`
    .replace(/\s+/g, ' ')
    .trim()
}

const fetchAllRows = async ({ supabaseUrl, serviceRoleKey, table, select, limit }) => {
  let from = 0
  const pageSize = 1000
  const all = []

  while (true) {
    const to = Math.min(from + pageSize - 1, from + limit - 1)
    if (to < from) break

    const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}`)
    url.searchParams.set('select', select)
    url.searchParams.set('order', 'client_a_uuid.asc')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Range: `${from}-${to}`,
        Prefer: 'count=exact',
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Supabase query failed (${response.status}): ${body}`)
    }

    const rows = await response.json()
    if (!Array.isArray(rows) || rows.length === 0) break

    all.push(...rows)
    from += rows.length

    if (rows.length < pageSize || all.length >= limit) break
  }

  return all.slice(0, limit)
}

const writeJsonl = async ({ trainRows, validRows, trainPath, validPath }) => {
  const trainAbs = path.resolve(trainPath)
  const validAbs = path.resolve(validPath)
  await fs.mkdir(path.dirname(trainAbs), { recursive: true })
  await fs.mkdir(path.dirname(validAbs), { recursive: true })

  await fs.writeFile(trainAbs, trainRows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8')
  await fs.writeFile(validAbs, validRows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8')

  return { trainAbs, validAbs }
}

const main = async () => {
  await loadEnvFile(path.resolve('.env'))
  await loadEnvFile(path.resolve('.env.local'))

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL)')
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (required for server-side export)')

  const table = process.argv[2] || DEFAULT_TABLE
  const trainPath = process.argv[3] || './data/fine-tune/train.jsonl'
  const validPath = process.argv[4] || './data/fine-tune/valid.jsonl'
  const limit = Number(process.argv[5] || DEFAULT_LIMIT)
  const select = process.argv[6] || DEFAULT_SELECT

  if (!Number.isInteger(limit) || limit < 20) {
    throw new Error('Limit must be an integer >= 20')
  }

  let rows = []
  let effectiveSelect = select

  try {
    rows = await fetchAllRows({ supabaseUrl, serviceRoleKey, table, select: effectiveSelect, limit })
  } catch (error) {
    const message = String(error?.message || '')
    const hasMissingColumnError = message.includes('42703') || /column .* does not exist/i.test(message)
    if (!hasMissingColumnError || effectiveSelect === '*') throw error

    effectiveSelect = '*'
    rows = await fetchAllRows({ supabaseUrl, serviceRoleKey, table, select: effectiveSelect, limit })
  }

  if (!rows.length) throw new Error(`No rows found in table "${table}"`)

  const examples = rows.map((row) => {
    const safe = safeRecord(row)
    return {
      messages: [
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPromptFromRecord(safe) },
        { role: 'assistant', content: buildAssistantReplyFromRecord(safe) },
      ],
    }
  })

  const trainCount = Math.max(1, Math.floor(examples.length * 0.9))
  const trainRows = examples.slice(0, trainCount)
  const validRows = examples.slice(trainCount)

  const { trainAbs, validAbs } = await writeJsonl({ trainRows, validRows, trainPath, validPath })

  console.log(`Table: ${table}`)
  console.log(`Select used: ${effectiveSelect}`)
  console.log(`Selected rows: ${rows.length}`)
  console.log(`Train examples: ${trainRows.length}`)
  console.log(`Validation examples: ${validRows.length}`)
  console.log(`Train file: ${trainAbs}`)
  console.log(`Validation file: ${validAbs}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
