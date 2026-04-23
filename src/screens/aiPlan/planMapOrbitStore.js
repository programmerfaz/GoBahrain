import { useSyncExternalStore } from 'react'

let orbitActive = false
const listeners = new Set()

const getSafeListeners = () => {
  if (!listeners || typeof listeners.forEach !== 'function') return []
  const out = []
  listeners.forEach((listener) => out.push(listener))
  return out
}

const emit = () => {
  const safeListeners = getSafeListeners()
  safeListeners.forEach((l) => {
    if (typeof l === 'function') l()
  })
}

export const setPlanMapOrbitActive = (active) => {
  const next = Boolean(active)
  if (next === orbitActive) return
  orbitActive = next
  emit()
}

const subscribe = (listener) => {
  if (listeners && typeof listeners.add === 'function') listeners.add(listener)
  return () => {
    if (listeners && typeof listeners.delete === 'function') listeners.delete(listener)
  }
}

const getSnapshot = () => orbitActive

const getServerSnapshot = () => false

export const usePlanMapOrbitActive = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
