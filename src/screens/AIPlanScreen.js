import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  Platform,
  ScrollView,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const APP_TAB_BAR_HEIGHT_IOS = 70;
const getAppTabBarHeight = (insets) =>
  Platform.OS === 'ios' ? APP_TAB_BAR_HEIGHT_IOS : 60 + (insets?.bottom ?? 0);

// Bottom sheet configuration
const SHEET_VISIBLE_PEEK = 0.28;
const SHEET_VISIBLE_MID = 0.55;
const SHEET_VISIBLE_EXPANDED = 0.9;

// Height of sheet when fully expanded
const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_VISIBLE_EXPANDED;
const SHEET_TOP_EXPANDED = SCREEN_HEIGHT - SHEET_HEIGHT; // distance from top when expanded
const SHEET_TOP_MID = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_MID);
const SHEET_TOP_PEEK = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_PEEK);

// Snap points are translateY values relative to expanded position
const SNAP_POINTS = [
  0, // expanded
  SHEET_TOP_MID - SHEET_TOP_EXPANDED,  // mid
  SHEET_TOP_PEEK - SHEET_TOP_EXPANDED, // peek
];
const INITIAL_SNAP_INDEX = 2; // start at peek

const BAHRAIN_REGION = {
  latitude: 26.0667,
  longitude: 50.5577,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const MANAMA_COORDS = { latitude: 26.2285, longitude: 50.586, title: 'Manama' };

const SPOTS_COUNT = 3;
const TRIPS_COUNT = 6;

export default function AIPlanScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const sheetAnim = useRef(new Animated.Value(SNAP_POINTS[INITIAL_SNAP_INDEX])).current;
  const lastSnap = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const currentYRef = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);

  // Full-page AI impulse overlay
  const aiOverlay = useRef(new Animated.Value(0)).current;
  const lastPulse = useRef(null);

  // Keep ref in sync with animated value so gesture start uses actual position
  useEffect(() => {
    const listenerId = sheetAnim.addListener(({ value }) => {
      currentYRef.current = value;
    });
    return () => sheetAnim.removeListener(listenerId);
  }, [sheetAnim]);

  // React to AI button presses (from bottom nav)
  useEffect(() => {
    const pulseId = route.params?.aiPulse;
    if (!pulseId || pulseId === lastPulse.current) return;
    lastPulse.current = pulseId;

    aiOverlay.setValue(0);
    Animated.sequence([
      Animated.timing(aiOverlay, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.circle),
        useNativeDriver: true,
      }),
      Animated.timing(aiOverlay, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.circle),
        useNativeDriver: true,
      }),
    ]).start();
  }, [route.params?.aiPulse, aiOverlay]);

  const aiOverlayOpacity = aiOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });

  const aiOverlayScale = aiOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        lastSnap.current = currentYRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const newY = lastSnap.current + gestureState.dy;
        const clamped = Math.max(SNAP_POINTS[0], Math.min(SNAP_POINTS[2], newY));
        sheetAnim.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentY = lastSnap.current + gestureState.dy;
        const velocity = gestureState.vy;
        // Find nearest snap point, or use velocity to pick next
        let targetIndex = 0;
        let minDist = Math.abs(currentY - SNAP_POINTS[0]);
        for (let i = 1; i < SNAP_POINTS.length; i++) {
          const d = Math.abs(currentY - SNAP_POINTS[i]);
          if (d < minDist) {
            minDist = d;
            targetIndex = i;
          }
        }
        if (velocity > 0.4) targetIndex = Math.min(2, targetIndex + 1);
        else if (velocity < -0.4) targetIndex = Math.max(0, targetIndex - 1);
        const target = SNAP_POINTS[targetIndex];
        lastSnap.current = target;
        Animated.spring(sheetAnim, {
          toValue: target,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={BAHRAIN_REGION}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        <Marker
          coordinate={MANAMA_COORDS}
          title="Manama"
          description="1 spot"
        >
          <View style={styles.markerWrap}>
            <Text style={styles.markerText}>1</Text>
          </View>
        </Marker>
      </MapView>

      {/* AI page-wide impulse overlay + status text */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.aiOverlay,
          {
            opacity: aiOverlayOpacity,
            transform: [{ scale: aiOverlayScale }],
          },
        ]}
      >
        <View style={styles.aiOverlayContent}>
          <Text style={styles.aiOverlayTitle}>Enhancing using AI</Text>
          <Text style={styles.aiOverlaySubtitle}>Designing your perfect Bahrain plan</Text>
        </View>
      </Animated.View>

      {/* Top bar overlay */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.pillButton} activeOpacity={0.8}>
            <Ionicons name="arrow-up" size={14} color="#374151" />
            <Ionicons name="home-outline" size={16} color="#374151" style={{ marginLeft: 4 }} />
            <Text style={styles.pillLabel}>{TRIPS_COUNT}</Text>
          </TouchableOpacity>
          <View style={styles.notifBadge}>
            <Text style={styles.notifText}>!</Text>
          </View>
          <TouchableOpacity style={styles.avatarButton} activeOpacity={0.8}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color="#6B7280" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Draggable bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: 80 + getAppTabBarHeight(insets),
            transform: [{ translateY: sheetAnim }],
          },
        ]}
      >
        <View style={styles.grabberWrap} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
        </View>

        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>My Spots</Text>
            <Text style={styles.sheetSubtitle}>{SPOTS_COUNT} Spots Saved</Text>
          </View>
          <TouchableOpacity style={styles.importButton} activeOpacity={0.8}>
            <Ionicons name="navigate-outline" size={18} color="#C8102E" />
            <Text style={styles.importLabel}>Import Guide</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.spotList}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.spotCard}>
              <View style={styles.spotIconWrap}>
                <Ionicons name="location" size={20} color="#C8102E" />
              </View>
              <View style={styles.spotInfo}>
                <Text style={styles.spotName}>Spot {i}</Text>
                <Text style={styles.spotMeta}>Saved for your plan</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Soft sand tone for Bahraini desert feel
    backgroundColor: '#FEF8E7',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  pillLabel: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  notifBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  avatarButton: {
    padding: 0,
  },
  markerWrap: {
    // Bahrain flag red for cluster marker
    backgroundColor: '#C8102E',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  markerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  aiOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  aiOverlayContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  aiOverlayTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: '#F9FAFB',
    marginBottom: 6,
  },
  aiOverlaySubtitle: {
    fontSize: 14,
    color: '#E5E7EB',
    textAlign: 'center',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  grabberWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D1D5DB',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#C8102E',
    gap: 6,
  },
  importLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C8102E',
  },
  spotListScroll: {
    flex: 1,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  spotList: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  spotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  spotIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    // Subtle red accent behind spot icon
    backgroundColor: 'rgba(200,16,46,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  spotInfo: { flex: 1 },
  spotName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  spotMeta: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
});
