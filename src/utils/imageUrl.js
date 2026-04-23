/**
 * Convert Supabase storage path to full public URL.
 * Handles relative paths like "gobahrain-post-images/xyz/file.jpg" or "xyz/file.jpg".
 * Uses EXPO_PUBLIC_SUPABASE_URL so public object URLs match your project (hardcoded fallback for legacy).
 */
const DEFAULT_SUPABASE_ORIGIN = 'https://zonhaprelkjyjugpqfdn.supabase.co'
const DEFAULT_IMAGE_QUALITY = 60

export const getSupabaseOrigin = () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  if (url && typeof url === 'string' && url.trim()) return url.replace(/\/$/, '')
  return DEFAULT_SUPABASE_ORIGIN
}

const getSupabasePublicStorageBase = () => `${getSupabaseOrigin()}/storage/v1/object/public`

const optimizeSupabaseImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  const [withoutHash, hash = ''] = trimmed.split('#')
  const [pathPart, queryPart = ''] = withoutHash.split('?')
  const isSupabaseStorageUrl =
    pathPart.includes('/storage/v1/object/public/') || pathPart.includes('/storage/v1/render/image/public/')

  if (!isSupabaseStorageUrl) return trimmed

  const publicPath = pathPart.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/')
  const params = new URLSearchParams(queryPart)
  params.set('quality', String(DEFAULT_IMAGE_QUALITY))

  const query = params.toString()
  const hashSuffix = hash ? `#${hash}` : ''
  return `${publicPath}${query ? `?${query}` : ''}${hashSuffix}`
}

export function ensureImageUrl(url, bucket = 'gobahrain-post-images') {
  if (!url || typeof url !== 'string') return null
  const trimmed = String(url).trim()
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return optimizeSupabaseImageUrl(trimmed)
  const cleanPath = trimmed.startsWith(`${bucket}/`) ? trimmed.replace(`${bucket}/`, '') : trimmed
  return optimizeSupabaseImageUrl(`${getSupabasePublicStorageBase()}/${bucket}/${cleanPath}`)
}

/** post_image / client_image: string path, JSON array/object, or full URL */
export function parseStorageImageUrl(raw) {
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
  if (str.startsWith('http://') || str.startsWith('https://')) return optimizeSupabaseImageUrl(str)
  const cleanPath = str.startsWith('gobahrain-post-images/') ? str.replace('gobahrain-post-images/', '') : str
  return optimizeSupabaseImageUrl(`${getSupabasePublicStorageBase()}/gobahrain-post-images/${cleanPath}`)
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
export function resolvePublicImageUrl(raw) {
  const coerced = coerceImageValueToString(raw)
  if (coerced == null) return null
  const t = coerced
  if (t.startsWith('http://') || t.startsWith('https://')) return optimizeSupabaseImageUrl(t)
  // Path-only storage URL from API or dashboard (no host)
  if (t.includes('/storage/v1/object/public/')) {
    const origin = getSupabaseOrigin()
    const path = t.startsWith('/') ? t.slice(1) : t
    if (!path.startsWith('http')) return optimizeSupabaseImageUrl(`${origin}/${path}`)
  }
  if (t.startsWith('storage/v1/object/public/')) {
    return optimizeSupabaseImageUrl(`${getSupabaseOrigin()}/${t}`)
  }
  const fromStorage = parseStorageImageUrl(t)
  if (fromStorage) return fromStorage
  return ensureImageUrl(t) || null
}
