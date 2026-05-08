import { Linking } from 'react-native'

/**
 * Opens Google Maps with turn-by-turn directions to the given coordinates.
 * Uses the universal maps URL so it opens in the Google Maps app when installed, or the browser.
 */
export const openGoogleMapsDirections = (lat, lng) => {
  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return
  const dest = `${latNum},${lngNum}`
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`
  Linking.openURL(url).catch(() => {})
}
