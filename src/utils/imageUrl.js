import { Platform } from 'react-native'

/**
 * Convert Supabase storage path to full public URL.
 * Handles relative paths like "gobahrain-post-images/xyz/file.jpg" or "xyz/file.jpg".
 * Uses EXPO_PUBLIC_SUPABASE_URL so public object URLs match your project (hardcoded fallback for legacy).
 */
const DEFAULT_SUPABASE_ORIGIN = 'https://zonhaprelkjyjugpqfdn.supabase.co'
const DEFAULT_IMAGE_QUALITY = 60
const DEFAULT_POST_IMAGE_WIDTH = 1080
const DEFAULT_AVATAR_WIDTH = 240

export const getSupabaseOrigin = () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  if (url && typeof url === 'string' && url.trim()) return url.replace(/\/$/, '')
  return DEFAULT_SUPABASE_ORIGIN
}

const getSupabasePublicStorageBase = () => `${getSupabaseOrigin()}/storage/v1/object/public`

const optimizeSupabaseImageUrl = (url, options = {}) => {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  const [withoutHash, hash = ''] = trimmed.split('#')
  const [pathPart, queryPart = ''] = withoutHash.split('?')
  const isSupabaseStorageUrl =
    pathPart.includes('/storage/v1/object/public/') || pathPart.includes('/storage/v1/render/image/public/')

  if (!isSupabaseStorageUrl) return trimmed

  const objectPath = pathPart.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/')
  /**
   * Reliability-first: default to object/public URL on native.
   * Supabase render/image can occasionally stall on first cold loads.
   * Opt in with { useRenderEndpoint: true } where transform is required.
   */
  const shouldUseRenderEndpoint = options?.useRenderEndpoint === true && Platform.OS !== 'web'
  const finalPath = shouldUseRenderEndpoint
    ? objectPath.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    : objectPath
  const params = new URLSearchParams(queryPart)
  if (shouldUseRenderEndpoint) {
    const quality =
      Number.isFinite(options?.quality) && options.quality > 0
        ? Math.max(25, Math.min(90, Math.round(options.quality)))
        : DEFAULT_IMAGE_QUALITY
    params.set('quality', String(quality))
    if (Number.isFinite(options?.width) && options.width > 0) {
      params.set('width', String(Math.round(options.width)))
    }
    if (options?.format) {
      params.set('format', String(options.format))
    }
  } else {
    params.delete('quality')
    params.delete('width')
    params.delete('format')
  }

  const query = params.toString()
  const hashSuffix = hash ? `#${hash}` : ''
  return `${finalPath}${query ? `?${query}` : ''}${hashSuffix}`
}

export function ensureImageUrl(url, bucket = 'gobahrain-post-images', options = {}) {
  if (!url || typeof url !== 'string') return null
  const trimmed = String(url).trim()
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return optimizeSupabaseImageUrl(trimmed, options)
  const cleanPath = trimmed.startsWith(`${bucket}/`) ? trimmed.replace(`${bucket}/`, '') : trimmed
  return optimizeSupabaseImageUrl(`${getSupabasePublicStorageBase()}/${bucket}/${cleanPath}`, options)
}

/** post_image / client_image: string path, JSON array/object, or full URL */
export function parseStorageImageUrl(raw, options = {}) {
  if (raw == null) return null
  let str = null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        const first = arr[0]
        str = first?.url || (typeof first === 'string' ? first : null)
      } catch {
        return null
      }
    } else {
      str = trimmed
    }
  } else if (typeof raw === 'object' && raw?.url) {
    str = raw.url
  } else if (Array.isArray(raw) && raw[0]) {
    str = raw[0]?.url || (typeof raw[0] === 'string' ? raw[0] : null)
  }
  if (!str || typeof str !== 'string') return null
  str = str.trim()
  if (!str) return null
  if (str.startsWith('http://') || str.startsWith('https://')) return optimizeSupabaseImageUrl(str, options)
  const cleanPath = str.startsWith('gobahrain-post-images/') ? str.replace('gobahrain-post-images/', '') : str
  return optimizeSupabaseImageUrl(`${getSupabasePublicStorageBase()}/gobahrain-post-images/${cleanPath}`, options)
}

/**
 * Coerce DB / JSON values (text, jsonb { url }, etc.) to a string for URL resolution.
 */
export function coerceImageValueToString(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const t = raw.trim()
    return t || null
  }
  if (typeof raw === 'number' && !Number.isNaN(raw)) return String(raw).trim()
  if (typeof raw === 'object' && raw !== null) {
    if (typeof raw.url === 'string' && raw.url.trim()) return raw.url.trim()
    if (typeof raw.path === 'string' && raw.path.trim()) return raw.path.trim()
  }
  return null
}

/**
 * Single displayable https URL for client_image, post_image, Pinecone paths, etc.
 * Use for map markers, list thumbs, profile avatars, and <Image source={{ uri }}>.
 */
export function resolvePublicImageUrl(raw, options = {}) {
  const coerced = coerceImageValueToString(raw)
  if (coerced == null) return null
  const t = coerced
  if (t.startsWith('http://') || t.startsWith('https://')) return optimizeSupabaseImageUrl(t, options)
  // Path-only storage URL from API or dashboard (no host)
  if (t.includes('/storage/v1/object/public/')) {
    const origin = getSupabaseOrigin()
    const path = t.startsWith('/') ? t.slice(1) : t
    if (!path.startsWith('http')) return optimizeSupabaseImageUrl(`${origin}/${path}`, options)
  }
  if (t.startsWith('storage/v1/object/public/')) {
    return optimizeSupabaseImageUrl(`${getSupabaseOrigin()}/${t}`, options)
  }
  const fromStorage = parseStorageImageUrl(t, options)
  if (fromStorage) return fromStorage
  return ensureImageUrl(t, 'gobahrain-post-images', options) || null
}

export const IMAGE_QUALITY_PRESETS = {
  homePost: { width: 720, quality: 32, format: 'webp' },
  homeAvatar: { width: DEFAULT_AVATAR_WIDTH, quality: 55 },
}
