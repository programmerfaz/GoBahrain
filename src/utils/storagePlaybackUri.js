import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../config/supabase'

const IOS_FEED_VIDEO_MAX_PREFETCH_BYTES = 40 * 1024 * 1024

/**
 * Large files: avoid blocking the feed on a full download; streaming may still fail if moov is not faststart.
 */
const shouldIosPrefetchFullVideoFile = async (url, timeoutMs = 8000) => {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return true
    const cl = res.headers.get('content-length')
    if (cl == null || cl === '') return true
    const n = parseInt(cl, 10)
    if (!Number.isFinite(n) || n <= 0) return true
    return n <= IOS_FEED_VIDEO_MAX_PREFETCH_BYTES
  } catch {
    clearTimeout(timer)
    return true
  }
}

/**
 * Follow redirects to the final URL (AVPlayer / iOS often fails with -1008 on the pre-redirect URL).
 */
export const resolveMediaUriAfterRedirect = async (uri, timeoutMs = 12000) => {
  if (!uri || typeof uri !== 'string') return uri

  const tryFetch = async (init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(uri, { ...init, redirect: 'follow', signal: controller.signal })
      clearTimeout(timer)
      if (res.url && typeof res.url === 'string' && res.url.length > 0) return res.url
    } catch {
      clearTimeout(timer)
    }
    return null
  }

  const fromHead = await tryFetch({ method: 'HEAD' })
  if (fromHead) return fromHead
  const fromRange = await tryFetch({ method: 'GET', headers: { Range: 'bytes=0-0' } })
  if (fromRange) return fromRange
  return uri
}

/**
 * Supabase public object URL → signed URL (often streams reliably in AVPlayer vs raw public URL).
 */
export const trySupabaseSignedUrlFromPublicObjectUrl = async (publicUri) => {
  if (!publicUri || typeof publicUri !== 'string') return null
  const clean = publicUri.split('#')[0]
  const m = clean.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!m) return null
  const bucket = m[1]
  let objectPath = m[2].split('?')[0]
  try {
    objectPath = decodeURIComponent(objectPath)
  } catch {
    /* keep raw */
  }
  if (!objectPath) return null
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

/**
 * Prefer signed Supabase URL, then follow redirects — best default for feed video.
 */
export const prepareFeedVideoPlaybackUri = async (originalUri) => {
  if (!originalUri || typeof originalUri !== 'string') return originalUri
  const signed = await trySupabaseSignedUrlFromPublicObjectUrl(originalUri)
  const candidate = signed || originalUri
  const resolved = await resolveMediaUriAfterRedirect(candidate)

  if (Platform.OS === 'ios' && resolved.startsWith('http')) {
    const prefetchOk = await shouldIosPrefetchFullVideoFile(resolved)
    if (prefetchOk) {
      const local = await cacheRemoteVideoForPlayback(resolved)
      if (local) return local
    }
  }

  return resolved
}

/**
 * Download to app cache and return a file:// URI — last resort when streaming fails (-1008, etc.).
 */
export const cacheRemoteVideoForPlayback = async (remoteUri) => {
  if (!remoteUri || typeof remoteUri !== 'string') return null
  const base = FileSystem.cacheDirectory
  if (!base) return null
  const tail = remoteUri.split('/').pop()?.split('?')[0] || 'clip.mp4'
  const safe = tail.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96)
  const dest = `${base}feed-vid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safe}`
  try {
    const result = await FileSystem.downloadAsync(remoteUri, dest)
    if (result.status < 200 || result.status >= 400) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})
      return null
    }
    const info = await FileSystem.getInfoAsync(result.uri)
    if (!info.exists || info.isDirectory || !info.size || info.size < 64) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})
      return null
    }
    return result.uri || null
  } catch {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})
    return null
  }
}
