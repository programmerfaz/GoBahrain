import 'react-native-url-polyfill/auto'
import { AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim()
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn('[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Restart Metro (npm start) after adding them to .env')
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const toHeaderObject = (headers) => {
  if (!headers) return {}
  if (typeof headers.forEach === 'function') {
    const next = {}
    headers.forEach((value, key) => {
      next[key] = value
    })
    return next
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...headers }
}

/** Android RN `fetch` often throws TypeError: Network request failed; XHR is more reliable in Expo Go. */
const xhrFetch = (input, init = {}) =>
  new Promise((resolve, reject) => {
    const url = typeof input === 'string' ? input : input?.url || String(input)
    const method = String(init.method || 'GET').toUpperCase()
    const xhr = new XMLHttpRequest()
    xhr.open(method, url, true)
    xhr.timeout = 25000
    xhr.responseType = 'text'

    const headers = toHeaderObject(init.headers)
    Object.entries(headers).forEach(([key, value]) => {
      if (value != null) xhr.setRequestHeader(key, String(value))
    })

    const abort = () => {
      xhr.abort()
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
    }
    if (init.signal) {
      if (init.signal.aborted) {
        abort()
        return
      }
      init.signal.addEventListener('abort', abort, { once: true })
    }

    xhr.onload = () => {
      const raw = xhr.getAllResponseHeaders() || ''
      const parsed = {}
      raw
        .trim()
        .split(/[\r\n]+/)
        .forEach((line) => {
          const idx = line.indexOf(':')
          if (idx === -1) return
          parsed[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        })
      resolve(
        new Response(xhr.responseText ?? '', {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parsed,
        }),
      )
    }
    xhr.onerror = () => reject(new TypeError('Network request failed'))
    xhr.ontimeout = () => reject(new TypeError('Network request failed'))
    xhr.onabort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))

    xhr.send(init.body ?? null)
  })

const nativeFetch = Platform.OS === 'android' ? xhrFetch : fetch

const fetchWithRetry = async (input, init) => {
  const maxAttempts = Platform.OS === 'android' ? 3 : 1
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await nativeFetch(input, init)
    } catch (error) {
      lastError = error
      if (error?.name === 'AbortError') throw error
      const message = String(error?.message || error || '')
      const retryable = /network request failed|failed to fetch|network error/i.test(message)
      if (!retryable || attempt === maxAttempts) {
        const url = typeof input === 'string' ? input : input?.url || ''
        let host = url
        try {
          host = new URL(url).host
        } catch {
          /* keep raw */
        }
        console.warn('[Supabase] request failed', { host, attempt, message })
        throw error
      }
      await wait(400 * attempt)
    }
  }
  throw lastError
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithRetry,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
