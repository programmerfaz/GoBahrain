import { Platform } from 'react-native'

/** Centered app column on web — keep in sync with App.js shell `maxWidth`. */
export const WEB_APP_MAX_CONTENT_WIDTH = 480

/** Use when deriving card sizes from `useWindowDimensions()` so web matches the shell. */
export const layoutContentWidth = (windowWidth) => {
  const w = windowWidth ?? 375
  if (Platform.OS !== 'web') return w
  return Math.min(w, WEB_APP_MAX_CONTENT_WIDTH)
}
