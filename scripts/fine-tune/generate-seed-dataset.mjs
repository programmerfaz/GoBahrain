#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const outputPathArg = process.argv[2] || './data/fine-tune/supabase-export.generated.json'
const countArg = Number(process.argv[3] || 180)

const SYSTEM = 'You are a concise Bahrain travel assistant.'

const districts = [
  'Manama',
  'Muharraq',
  'Adliya',
  'Juffair',
  'Seef',
  'Amwaj',
  'Riffa',
  'Isa Town',
  'Saar',
  'Zallaq',
]

const travelerTypes = [
  'solo traveler',
  'family with kids',
  'couple',
  'friends group',
  'senior traveler',
  'business visitor',
]

const budgets = ['low budget', 'mid-range budget', 'premium budget']
const durations = ['half-day', '1-day', '2-day', '3-day']
const vibes = ['cultural', 'food-focused', 'relaxed', 'outdoor', 'night-time']

const buildUserPrompt = (index) => {
  const district = districts[index % districts.length]
  const traveler = travelerTypes[index % travelerTypes.length]
  const budget = budgets[index % budgets.length]
  const duration = durations[index % durations.length]
  const vibe = vibes[index % vibes.length]

  return `Create a ${duration} ${vibe} itinerary in ${district} for a ${traveler} with a ${budget}. Include transport tips and one local food stop.`
}

const buildAssistantReply = (index) => {
  const district = districts[index % districts.length]
  const budget = budgets[index % budgets.length]

  const morning = `Morning: Start in ${district} with a walk-friendly attraction and keep stops close to reduce travel time.`
  const afternoon = `Afternoon: Visit a cultural or shopping spot nearby, then pause for coffee.`
  const evening = `Evening: Add a local food stop with options that fit a ${budget}.`
  const transport = 'Transport: Use short taxi hops when needed and group nearby places to avoid backtracking.'
  const note = 'Tip: Confirm opening hours before visiting and avoid midday outdoor plans in hot weather.'

  return `${morning} ${afternoon} ${evening} ${transport} ${note}`
}

const main = async () => {
  if (!Number.isInteger(countArg) || countArg < 20) {
    throw new Error('Count must be an integer >= 20')
  }

  const rows = Array.from({ length: countArg }).map((_, index) => ({
    system: SYSTEM,
    user: buildUserPrompt(index),
    assistant: buildAssistantReply(index),
  }))

  const absoluteOutputPath = path.resolve(outputPathArg)
  await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true })
  await fs.writeFile(absoluteOutputPath, JSON.stringify(rows, null, 2), 'utf8')

  console.log(`Generated dataset: ${absoluteOutputPath}`)
  console.log(`Examples: ${rows.length}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
