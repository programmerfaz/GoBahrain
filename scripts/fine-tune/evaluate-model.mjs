#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const [, , testSetArg, modelArg] = process.argv

if (!testSetArg || !modelArg) {
  console.error(
    [
      'Usage:',
      '  OPENAI_API_KEY=... node scripts/fine-tune/evaluate-model.mjs <test-json> <model-id>',
      '',
      'Test JSON format (array):',
      '  [{ "user": "...", "expected": "..." }, ...]',
    ].join('\n')
  )
  process.exit(1)
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY environment variable')
  process.exit(1)
}

const apiKey = process.env.OPENAI_API_KEY
const SYSTEM_PROMPT = 'You are a concise Bahrain travel assistant.'

const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

const wordOverlapScore = (expected, actual) => {
  const expectedWords = new Set(normalizeText(expected).split(/\s+/).filter(Boolean))
  const actualWords = new Set(normalizeText(actual).split(/\s+/).filter(Boolean))

  if (!expectedWords.size) return 0

  let overlap = 0
  for (const word of expectedWords) {
    if (actualWords.has(word)) overlap += 1
  }

  return overlap / expectedWords.size
}

const generate = async (userPrompt) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelArg,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Generation failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

const main = async () => {
  const testSetPath = path.resolve(testSetArg)
  const raw = await fs.readFile(testSetPath, 'utf8')
  const testSet = JSON.parse(raw)

  if (!Array.isArray(testSet) || testSet.length === 0) {
    throw new Error('Test set must be a non-empty array')
  }

  let scoreTotal = 0
  for (let index = 0; index < testSet.length; index += 1) {
    const row = testSet[index]
    const user = row?.user
    const expected = row?.expected

    if (!user || !expected) {
      throw new Error(`Row ${index} is missing "user" or "expected"`)
    }

    const actual = await generate(user)
    const overlap = wordOverlapScore(expected, actual)
    scoreTotal += overlap

    console.log(`\n# Case ${index + 1}`)
    console.log(`User: ${user}`)
    console.log(`Expected: ${expected}`)
    console.log(`Actual: ${actual}`)
    console.log(`Overlap score: ${overlap.toFixed(3)}`)
  }

  const averageScore = scoreTotal / testSet.length
  console.log('\n============================')
  console.log(`Model: ${modelArg}`)
  console.log(`Cases: ${testSet.length}`)
  console.log(`Average overlap score: ${averageScore.toFixed(3)}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
