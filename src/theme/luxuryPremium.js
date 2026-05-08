import { Platform } from 'react-native'

/** Shared radii for premium / “soft luxury” surfaces across the app */
export const LUXURY = {
  radiusCard: 24,
  radiusCardLg: 28,
  radiusCardSheet: 26,
  radiusInput: 18,
  radiusChip: 16,
  radiusPill: 20,
  radiusHero: 32,
  radiusMarkerPill: 18,
}

/** Primary elevated card — feed posts, large panels */
export const luxuryCardShadow = Platform.select({
  ios: {
    shadowColor: '#0f0a08',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
  },
  android: { elevation: 8 },
})

/** Medium elevation — tiles, chips, compact cards */
export const luxuryElevated = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  android: { elevation: 6 },
})

/** Light lift — filter pills, small controls */
export const luxurySoftShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  android: { elevation: 4 },
})

export const luxuryHairline = (isDark) =>
  isDark ? 'rgba(160, 160, 170, 0.28)' : 'rgba(142, 142, 147, 0.22)'
