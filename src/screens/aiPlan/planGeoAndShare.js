import { Alert, Linking } from 'react-native'
import * as Location from 'expo-location'
import * as ExpoLinking from 'expo-linking'
import { BAHRAIN_BOUNDS } from './constants'


export function clampRegionToBahrain(region) {
  if (!region) return region;
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  return {
    ...region,
    latitude: Math.min(BAHRAIN_BOUNDS.maxLat, Math.max(BAHRAIN_BOUNDS.minLat, latitude)),
    longitude: Math.min(BAHRAIN_BOUNDS.maxLng, Math.max(BAHRAIN_BOUNDS.minLng, longitude)),
    latitudeDelta,
    longitudeDelta,
  };
}

export function isWithinBahrainBounds(lat, lng) {
  return (
    lat >= BAHRAIN_BOUNDS.minLat &&
    lat <= BAHRAIN_BOUNDS.maxLat &&
    lng >= BAHRAIN_BOUNDS.minLng &&
    lng <= BAHRAIN_BOUNDS.maxLng
  );
}

/** GPT sometimes swaps lat/lng; accept only pairs that fall inside Bahrain after optional swap */
export function unswapLatLng(lat, lng) {
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  if (Number.isNaN(la) || Number.isNaN(ln) || (la === 0 && ln === 0)) return null;
  if (isWithinBahrainBounds(la, ln)) return { lat: la, lng: ln };
  if (isWithinBahrainBounds(ln, la)) return { lat: ln, lng: la };
  return null;
}

export function parsePlanItemCoords(item) {
  if (!item) return null;
  return unswapLatLng(item.lat, item.lng);
}

export function parseCoordsFromPineconeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const la = parseFloat(meta.lat ?? meta.latitude ?? meta.Lat ?? '');
  const ln = parseFloat(meta.long ?? meta.longitude ?? meta.lng ?? meta.Lng ?? '');
  return unswapLatLng(la, ln);
}

export function parseCoordsFromClientRow(row) {
  if (!row || typeof row !== 'object') return null;
  return unswapLatLng(
    row.lat ?? row.latitude,
    row.long ?? row.longitude ?? row.lng
  );
}
/** Rich share / copy text for AI day plan (and invite when plan is empty). */
export function formatPlanShareMessage(plan) {
  if (!plan || plan.length === 0) {
    return {
      message:
        '🇧🇭 Plan an amazing day in Bahrain with SiyahaBH!\n\n' +
        'AI-crafted itineraries — dining, culture, and events — tailored to you.\n\n' +
        'Download the app and tap "Build my day". Yalla!',
      title: 'SiyahaBH',
    };
  }
  const meals = plan.filter((i) => i.type === 'restaurant').length;
  const events = plan.filter((i) => i.type === 'event').length;
  const other = Math.max(0, plan.length - meals - events);
  const header =
    `🇧🇭 My Bahrain day — ${plan.length} stops\n` +
    `${meals} meal${meals !== 1 ? 's' : ''} · ${events} event${events !== 1 ? 's' : ''} · ${other} place${other !== 1 ? 's' : ''}\n`;
  const lines = plan.map((item, i) => {
    const icon = item.type === 'restaurant' ? '🍽' : item.type === 'event' ? '📅' : '📍';
    const slot = item.time ? ` · ${item.time}` : '';
    let block = `${i + 1}. ${icon} ${item.spot || 'Stop'}${slot}`;
    if (item.reason && String(item.reason).trim()) {
      const r = String(item.reason).replace(/\s+/g, ' ').trim();
      const short = r.length > 100 ? `${r.slice(0, 97)}…` : r;
      block += `\n   ${short}`;
    }
    return block;
  });
  return {
    message: `${header}\n${lines.join('\n\n')}\n\n— Shared from SiyahaBH`,
    title: 'My Bahrain itinerary',
  };
}

export function parseShareCodeFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams || {};
    if (q.code) return String(q.code);
    if (q.shareCode) return String(q.shareCode);
    const path = parsed.path || '';
    const m = String(path).match(/plan\/([^/?]+)/i);
    if (m) return m[1];
  } catch (_) {
    /* ignore */
  }
  return null;
}
export const openAllStopsInGoogleMaps = async (plan) => {
  const markers = (plan || []).map((item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
  }).filter(Boolean);
  if (markers.length === 0) return;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location needed', 'Enable location access to get directions from your current position.');
      return;
    }
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const origin = `${coords.latitude},${coords.longitude}`;
    const destination = `${markers[markers.length - 1].lat},${markers[markers.length - 1].lng}`;
    const waypoints = markers.length > 1
      ? markers.slice(0, -1).map((m) => `${m.lat},${m.lng}`).join('|')
      : null;
    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    Linking.openURL(url).catch(() => {});
  } catch (e) {
    Alert.alert('Location error', e?.message ?? 'Could not get your location. Enable location and try again.');
  }
};
