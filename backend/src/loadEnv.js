import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.join(__dirname, '..')
const repoRoot = path.join(backendDir, '..')

/** Later files override when override: true — matches typical .env layering. */
const load = (filePath, override = false) => {
  dotenv.config({ path: filePath, override })
}

load(path.join(repoRoot, '.env'), false)
load(path.join(repoRoot, '.env.local'), true)
load(path.join(backendDir, '.env'), true)

/** Expo uses EXPO_PUBLIC_*; backend services expect unprefixed names. */
const alias = (target, fallback) => {
  if (!process.env[target] && process.env[fallback]) {
    process.env[target] = process.env[fallback]
  }
}

alias('OPENAI_API_KEY', 'EXPO_PUBLIC_OPENAI_API_KEY')
alias('PINECONE_API_KEY', 'EXPO_PUBLIC_PINECONE_API_KEY')
alias('PINECONE_HOST', 'EXPO_PUBLIC_PINECONE_HOST')
