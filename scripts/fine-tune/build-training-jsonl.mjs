#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_SYSTEM_PROMPT = 'You are a concise Bahrain travel assistant.'

const [, , inputPathArg, outputPathArg, validationPathArg] = process.argv

if (!inputPathArg || !outputPathArg) {
  console.error(
    [
      'Usage:',
      '  node scripts/fine-tune/build-training-jsonl.mjs <input-json> <train-output-jsonl> [validation-output-jsonl]',
      '',
      'Input JSON format (array):',
      '  [{ "user": "...", "assistant": "...", "system": "optional..." }, ...]',
    ].join('\n')
  )
  process.exit(1)
}

const normalizeText = (value) => {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').trim()
}

const toExample = (row, index) => {
  const user = normalizeText(row.user)
  const assistant = normalizeText(row.assistant)
  const system = normalizeText(row.system) || DEFAULT_SYSTEM_PROMPT

  if (!user || !assistant) {
    throw new Error(`Row ${index} is missing required "user" or "assistant" content`)
  }

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
      { role: 'assistant', content: assistant },
    ],
  }
}

const writeJsonl = async (targetPath, rows) => {
  const absolutePath = path.resolve(targetPath)
  const lines = rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, lines, 'utf8')
  return absolutePath
}

const main = async () => {
  const inputAbsolutePath = path.resolve(inputPathArg)
  const inputRaw = await fs.readFile(inputAbsolutePath, 'utf8')
  const input = JSON.parse(inputRaw)

  if (!Array.isArray(input)) {
    throw new Error('Input JSON must be an array')
  }

  if (input.length < 20) {
    console.warn('Warning: very small dataset. Aim for 100+ examples for reliable fine-tuning.')
  }

  const allExamples = input.map((row, index) => toExample(row, index))
  const trainRatio = 0.9
  const trainCount = Math.max(1, Math.floor(allExamples.length * trainRatio))

  const trainExamples = allExamples.slice(0, trainCount)
  const validationExamples = allExamples.slice(trainCount)

  const trainPath = await writeJsonl(outputPathArg, trainExamples)

  let validationPath = null
  if (validationPathArg) {
    validationPath = await writeJsonl(validationPathArg, validationExamples)
  }

  console.log(`Input examples: ${allExamples.length}`)
  console.log(`Train examples: ${trainExamples.length}`)
  console.log(`Validation examples: ${validationExamples.length}`)
  console.log(`Train jsonl: ${trainPath}`)
  if (validationPath) console.log(`Validation jsonl: ${validationPath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
