/**
 * Convert Supabase storage path to full public URL.
 * Handles relative paths like "gobahrain-post-images/xyz/file.jpg" or "xyz/file.jpg".
 */
const SUPABASE_STORAGE_BASE = 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public'

export function ensureImageUrl(url, bucket = 'gobahrain-post-images') {
  if (!url || typeof url !== 'string') return null
  const trimmed = String(url).trim()
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  const cleanPath = trimmed.startsWith(`${bucket}/`) ? trimmed.replace(`${bucket}/`, '') : trimmed
  return `${SUPABASE_STORAGE_BASE}/${bucket}/${cleanPath}`
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
  if (str.startsWith('http://') || str.startsWith('https://')) return str
  const cleanPath = str.startsWith('gobahrain-post-images/') ? str.replace('gobahrain-post-images/', '') : str
  return `${SUPABASE_STORAGE_BASE}/gobahrain-post-images/${cleanPath}`
}

/**
 * Single displayable https URL for client_image, post_image, Pinecone paths, etc.
 * Use for map markers, list thumbs, profile avatars, and <Image source={{ uri }}>.
 */
export function resolvePublicImageUrl(raw) {
  if (raw == null) return null
  if (typeof raw === 'object' && raw !== null) {
    if (typeof raw.url === 'string') return resolvePublicImageUrl(raw.url)
    return null
  }
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  const fromStorage = parseStorageImageUrl(t)
  if (fromStorage) return fromStorage
  return ensureImageUrl(t) || null
}
