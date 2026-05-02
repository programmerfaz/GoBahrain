#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const [, , trainJsonlArg, modelArg, validationJsonlArg] = process.argv

if (!trainJsonlArg || !modelArg) {
  console.error(
    [
      'Usage:',
      '  OPENAI_API_KEY=... node scripts/fine-tune/create-job.mjs <train-jsonl> <base-model> [validation-jsonl]',
      '',
      'Example:',
      '  OPENAI_API_KEY=... node scripts/fine-tune/create-job.mjs ./data/fine-tune/train.jsonl gpt-4.1-mini-2025-04-14 ./data/fine-tune/valid.jsonl',
    ].join('\n')
  )
  process.exit(1)
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY environment variable')
  process.exit(1)
}

const apiKey = process.env.OPENAI_API_KEY

const uploadFile = async (filePath) => {
  const absolutePath = path.resolve(filePath)
  const fileContent = await fs.readFile(absolutePath)
  const fileName = path.basename(absolutePath)

  const form = new FormData()
  form.append('purpose', 'fine-tune')
  form.append('file', new Blob([fileContent]), fileName)

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`File upload failed (${response.status}): ${body}`)
  }

  return response.json()
}

const createFineTuneJob = async ({ trainingFileId, validationFileId, model }) => {
  const response = await fetch('https://api.openai.com/v1/fine_tuning/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      training_file: trainingFileId,
      ...(validationFileId ? { validation_file: validationFileId } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Fine-tune job creation failed (${response.status}): ${body}`)
  }

  return response.json()
}

const main = async () => {
  const trainUpload = await uploadFile(trainJsonlArg)
  console.log(`Training file uploaded: ${trainUpload.id}`)

  let validationUpload = null
  if (validationJsonlArg) {
    validationUpload = await uploadFile(validationJsonlArg)
    console.log(`Validation file uploaded: ${validationUpload.id}`)
  }

  const job = await createFineTuneJob({
    trainingFileId: trainUpload.id,
    validationFileId: validationUpload?.id,
    model: modelArg,
  })

  console.log(`Fine-tune job created: ${job.id}`)
  console.log(`Status: ${job.status}`)
  console.log('Use your OpenAI dashboard or API to monitor events and final model name')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
