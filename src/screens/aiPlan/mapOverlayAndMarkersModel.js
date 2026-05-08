import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
import { View, StyleSheet, Animated, Easing } from 'react-native'
import { resolvePublicImageUrl } from '../../utils/imageUrl'
import styles from '../AIPlanScreen.styles'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './constants'
import { parsePlanItemCoords } from './planGeoAndShare'
import { normName, resolveCoordsFromLoadedCache } from './planMatching'


export function MapScanningOverlay({ visible }) {
  const seg1 = useRef(new Animated.Value(0)).current;
  const seg2 = useRef(new Animated.Value(0)).current;
  const seg3 = useRef(new Animated.Value(0)).current;
  const seg4 = useRef(new Animated.Value(0)).current;
  const seg5 = useRef(new Animated.Value(0)).current;
  const dotPos = useRef(new Animated.Value(0)).current;
  const scanLineY = useRef(new Animated.Value(0)).current;
  const radarPulse = useRef(new Animated.Value(0)).current;
  const dotGlow = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    [seg1, seg2, seg3, seg4, seg5, dotPos, scanLineY, radarPulse, dotGlow].forEach((a) => a.setValue(0));
    dotGlow.setValue(1);

    const scanLineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanLineY, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    const radarLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(radarPulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(radarPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );

    const dotGlowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotGlow, { toValue: 1.4, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotGlow, { toValue: 1, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );

    const routeLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(seg1, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.2, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg2, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.4, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg3, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.6, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg4, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0.8, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(seg5, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.delay(350),
        Animated.parallel([
          Animated.timing(seg1, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg2, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg3, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg4, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(seg5, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(dotPos, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(250),
      ])
    );

    scanLineLoop.start();
    radarLoop.start();
    dotGlowLoop.start();
    routeLoop.start();
    return () => {
      scanLineLoop.stop();
      radarLoop.stop();
      dotGlowLoop.stop();
      routeLoop.stop();
    };
  }, [visible, seg1, seg2, seg3, seg4, seg5, dotPos, scanLineY, radarPulse, dotGlow]);

  if (!visible) return null;

  const W1 = SCREEN_WIDTH - 90;
  const W3 = SCREEN_WIDTH - 90;
  const W5 = SCREEN_WIDTH - 80;
  const H2 = 130;
  const H4 = 130;

  const seg1Transform = [
    { translateX: seg1.interpolate({ inputRange: [0, 1], outputRange: [W1 / 2, 0] }) },
    { scaleX: seg1.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg2Transform = [
    { translateY: seg2.interpolate({ inputRange: [0, 1], outputRange: [H2 / 2, 0] }) },
    { scaleY: seg2.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg3Transform = [
    { translateX: seg3.interpolate({ inputRange: [0, 1], outputRange: [W3 / 2, 0] }) },
    { scaleX: seg3.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg4Transform = [
    { translateY: seg4.interpolate({ inputRange: [0, 1], outputRange: [H4 / 2, 0] }) },
    { scaleY: seg4.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];
  const seg5Transform = [
    { translateX: seg5.interpolate({ inputRange: [0, 1], outputRange: [W5 / 2, 0] }) },
    { scaleX: seg5.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
  ];

  const dotX = dotPos.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [37, SCREEN_WIDTH - 53, SCREEN_WIDTH - 68, 52, 35, SCREEN_WIDTH - 43] });
  const dotY = dotPos.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [77, 77, 205, 205, 327, 327] });

  const scanLineTranslateY = scanLineY.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_HEIGHT] });
  const radarScale = radarPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.3] });
  const radarOpacity = radarPulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.2, 0] });

  return (
    <View style={styles.mapScanningOverlay} pointerEvents="none">
      {/* Radar pulse from center */}
      <View style={styles.mapScanningRadarCenter}>
        <Animated.View
          style={[
            styles.mapScanningRadarRing,
            { transform: [{ scale: radarScale }], opacity: radarOpacity },
          ]}
        />
      </View>

      {/* Sweeping scan line */}
      <Animated.View
        style={[
          styles.mapScanningLine,
          { transform: [{ translateY: scanLineTranslateY }] },
        ]}
      />

      {/* Route path segments */}
      <View style={styles.mapRoutePath}>
        <View style={styles.mapRouteSegWrap}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg1, { transform: seg1Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap2}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg2, { transform: seg2Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap3}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg3, { transform: seg3Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap4}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg4, { transform: seg4Transform }]} />
        </View>
        <View style={styles.mapRouteSegWrap5}>
          <Animated.View style={[styles.mapRouteSeg, styles.mapRouteSeg5, { transform: seg5Transform }]} />
        </View>
      </View>

      {/* Moving dot with glow */}
      <Animated.View
        style={[
          styles.mapRouteDotGlow,
          {
            transform: [
              { translateX: dotX },
              { translateY: dotY },
              { scale: dotGlow },
            ],
          },
        ]}
      />
      <Animated.View style={[styles.mapRouteDot, { transform: [{ translateX: dotX }, { translateY: dotY }] }]} />
    </View>
  );
}

export function mapCategoryKeyFromClientTableType(clientTypeRaw) {
  const ct = String(clientTypeRaw ?? '').toLowerCase().trim();
  if (ct === 'restaurant') return 'restaurant';
  if (ct === 'event') return 'event';
  return 'place';
}

/** Prefer `client.client_type` from Supabase; used for map pins and filters. */
export function resolveClientTypeForPlanMapItem(item, loadedClientMarkers) {
  if (item?.client_type != null && String(item.client_type).trim() !== '') {
    return item.client_type;
  }
  const id = item?.clientId || null;
  if (id && Array.isArray(loadedClientMarkers)) {
    const hit = loadedClientMarkers.find((r) => r.clientId === id);
    if (hit?.client_type != null && String(hit.client_type).trim() !== '') {
      return hit.client_type;
    }
  }
  if (item?.spot && Array.isArray(loadedClientMarkers)) {
    const spotNorm = normName(item.spot || '');
    if (spotNorm) {
      for (const row of loadedClientMarkers) {
        const markerNorm = normName(row.spot || '');
        if (!markerNorm) continue;
        if (markerNorm === spotNorm || markerNorm.includes(spotNorm) || spotNorm.includes(markerNorm)) {
          if (row.client_type != null && String(row.client_type).trim() !== '') {
            return row.client_type;
          }
          break;
        }
      }
    }
  }
  return null;
}

/** Map filter chip keys — uses `client_type` from the client table when present. */
export function mapMarkerFilterCategoryKey(mk) {
  if (mk?.client_type != null && String(mk.client_type).trim() !== '') {
    return mapCategoryKeyFromClientTableType(mk.client_type);
  }
  return mapCategoryKeyFromClientTableType(mk?.type);
}

/** Single-select like Community feed: `all` shows every pin; otherwise match `client_type` via `mapMarkerFilterCategoryKey`. */
export function markerMatchesPlanMapClientFilter(mk, activeFilter) {
  if (!mk || activeFilter === 'all' || activeFilter == null) return true;
  return mapMarkerFilterCategoryKey(mk) === activeFilter;
}

export function buildMapMarkers(plan, loadedClientMarkers = []) {
  if (!plan) return [];
  return plan.map((item, idx) => {
    const fixed = parsePlanItemCoords(item) || resolveCoordsFromLoadedCache(item, loadedClientMarkers);
    if (!fixed) return null;
    const { lat, lng } = fixed;
    const image = resolvePublicImageUrl(item.image || item.client_image);
    const client_type = resolveClientTypeForPlanMapItem(item, loadedClientMarkers);
    const reasonText = (item.reason || item.placeDescription || '').trim();
    const itemSummary = String(item.ai_summary || item.summary || '').trim();
    let resolvedAiSummary = itemSummary;
    if (!resolvedAiSummary && item?.clientId && Array.isArray(loadedClientMarkers)) {
      const hitByClientId = loadedClientMarkers.find((r) => r.clientId === item.clientId);
      resolvedAiSummary = String(hitByClientId?.ai_summary || hitByClientId?.summary || '').trim();
    }
    if (!resolvedAiSummary && item?.spot && Array.isArray(loadedClientMarkers)) {
      const spotNorm = normName(item.spot || '');
      if (spotNorm) {
        for (const row of loadedClientMarkers) {
          const markerNorm = normName(row.spot || '');
          if (!markerNorm) continue;
          if (markerNorm === spotNorm || markerNorm.includes(spotNorm) || spotNorm.includes(markerNorm)) {
            resolvedAiSummary = String(row.ai_summary || row.summary || '').trim();
            if (resolvedAiSummary) break;
          }
        }
      }
    }
    return {
      idx,
      spot: item.spot,
      time: item.time,
      type: item.type,
      client_type,
      reason: reasonText || undefined,
      ai_summary: resolvedAiSummary || undefined,
      lat,
      lng,
      image,
      clientId: item.clientId || null,
    };
  }).filter(Boolean);
}
