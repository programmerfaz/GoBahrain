import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  Linking,
  Animated,
  Pressable,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchNearbyPOIs } from '../services/aiPipeline';
import ClientProfileModal from '../components/ClientProfileModal';

const C = {
  accent: '#C8102E',
  text: '#FFFFFF',
  sub: 'rgba(255,255,255,0.85)',
  card: 'rgba(0,0,0,0.75)',
  cardBorder: 'rgba(255,255,255,0.3)',
  glow: 'rgba(200, 16, 46, 0.4)',
};

const MODES = [
  { id: 'landmarks', label: 'Landmarks', icon: 'business' },
  { id: 'all', label: 'All', icon: 'compass' },
  { id: 'food', label: 'Food & Events', icon: 'restaurant' },
];

const CAMERA_FOV_DEG = 55;

function POIMarker({ poi, x, y, onPress, isNearest, index }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        delay: index * 40,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 80,
        delay: index * 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, index]);

  useEffect(() => {
    if (!isNearest) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isNearest, pulseAnim]);

  const distText = poi.distanceKm < 1
    ? `${Math.round(poi.distanceKm * 1000)}m`
    : `${poi.distanceKm.toFixed(1)}km`;
  const isLandmark = poi._isLandmark || poi._type === 'landmark';
  const icon = poi._type === 'event' ? 'calendar' : poi._type === 'restaurant' ? 'restaurant' : isLandmark ? 'business' : 'location';

  return (
    <Animated.View
      style={[
        styles.markerWrap,
        { left: x, top: y, opacity: fadeAnim, transform: [{ scale: isNearest ? pulseAnim : scaleAnim }] },
      ]}
    >
      {isNearest && <View style={styles.markerGlow} />}
      <TouchableOpacity
        style={[
          styles.marker,
          isLandmark && styles.markerLandmark,
          isNearest && styles.markerNearest,
        ]}
        onPress={() => onPress?.(poi)}
        activeOpacity={0.9}
      >
        {isNearest && (
          <View style={styles.nearestBadge}>
            <Ionicons name="navigate" size={10} color="#FFF" />
            <Text style={styles.nearestBadgeText}>Nearest</Text>
          </View>
        )}
        <View style={styles.markerRow}>
          <View style={[styles.markerIcon, isLandmark && styles.markerIconLandmark]}>
            <Ionicons name={icon} size={isLandmark ? 14 : 12} color={C.accent} />
          </View>
          <Text style={[styles.markerName, isLandmark && styles.markerNameLandmark]} numberOfLines={1}>{poi.name}</Text>
        </View>
        <Text style={styles.markerDist}>{distText}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function CompassRing({ heading, nearestOutOfView, centerY }) {
  const size = 72;
  const radius = size / 2;
  const needleRotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(needleRotate, {
      toValue: heading,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [heading, needleRotate]);

  const needleRotateInterpolate = needleRotate.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.compassWrap, { left: 16, top: centerY - radius - 80 }]}>
      <BlurView intensity={60} tint="dark" style={styles.compassBlur}>
        <View style={[styles.compassCircle, { width: size, height: size, borderRadius: radius }]}>
          <View style={[styles.compassN, { top: 4 }]}>
            <Text style={styles.compassNText}>N</Text>
          </View>
          <Animated.View style={[styles.compassNeedle, { transform: [{ rotate: needleRotateInterpolate }] }]}>
            <Ionicons name="navigate" size={22} color={C.accent} />
          </Animated.View>
        </View>
      </BlurView>
      {nearestOutOfView && (
        <View style={styles.compassHint}>
          <Ionicons name="arrow-redo" size={12} color={C.sub} />
          <Text style={styles.compassHintText} numberOfLines={1}>Turn to see {nearestOutOfView.name}</Text>
        </View>
      )}
    </View>
  );
}

function POIDetailModal({ visible, poi, onClose, onRequestClose, insets, openDirections, getWalkingTime, onViewProfile }) {
  if (!poi) return null;
  const dismiss = onRequestClose || onClose;
  const clientId = poi.client_a_uuid || poi.id;
  const hasProfile = Boolean(clientId);
  const m = poi.metadata || poi;
  const isLandmark = poi._isLandmark || poi._type === 'landmark' || poi.category;
  const typeLabel = poi._type === 'event' ? 'Event' : poi._type === 'restaurant' ? 'Restaurant' : isLandmark ? (m.category || poi.category || 'Landmark') : 'Place';
  const typeIcon = poi._type === 'event' ? 'calendar' : poi._type === 'restaurant' ? 'restaurant' : isLandmark ? 'business' : 'compass';
  const distText = poi.distanceKm < 1
    ? `${Math.round(poi.distanceKm * 1000)}m away`
    : `${poi.distanceKm.toFixed(1)} km away`;
  const venue = m.venue || m.location || m.area || poi.location || '';
  const desc = m.description || poi.description || '';
  const cuisine = m.cuisine || m.cuisine_type || '';
  const priceRange = m.price_range || '';
  const rating = m.rating != null && m.rating !== '' ? Number(m.rating) : null;
  const eventType = m.event_type || '';
  const time = [m.start_time, m.end_time].filter(Boolean).join(' – ');
  const date = m.start_date || m.end_date || '';

  const RatingStars = () => {
    if (rating == null || rating <= 0) return null;
    const r = Math.min(5, Math.max(0, rating));
    return (
      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Ionicons
            key={i}
            name={r >= i ? 'star' : r >= i - 0.5 ? 'star-half' : 'star-outline'}
            size={14}
            color="#FBBF24"
          />
        ))}
        <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={styles.detailOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.detailCard, { paddingBottom: (insets?.bottom ?? 0) + 24 }]}>
          <View style={styles.detailHandle} />
          <TouchableOpacity
            style={styles.detailClose}
            onPress={dismiss}
            hitSlop={12}
          >
            <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <View style={styles.detailHeader}>
            <View style={styles.detailTypeBadge}>
              <Ionicons name={typeIcon} size={12} color="#FFF" />
              <Text style={styles.detailTypeText}>{typeLabel}</Text>
            </View>
            <Text style={styles.detailTitle}>{poi.name}</Text>
            <View style={styles.detailMetaRow}>
              <View style={styles.detailMetaItem}>
                <Ionicons name="navigate" size={14} color={C.accent} />
                <Text style={styles.detailMetaText}>{distText}</Text>
              </View>
              {rating != null && rating > 0 && (
                <View style={styles.detailMetaItem}>
                  <RatingStars />
                </View>
              )}
            </View>
          </View>
          {(venue || cuisine || priceRange || eventType || date || time) ? (
            <View style={styles.detailSection}>
              {venue ? (
                <View style={styles.detailRow}>
                  <Ionicons name="location" size={16} color={C.accent} />
                  <Text style={styles.detailText}>{venue}</Text>
                </View>
              ) : null}
              {(cuisine || priceRange) ? (
                <View style={styles.detailRow}>
                  <Ionicons name="restaurant" size={16} color={C.accent} />
                  <Text style={styles.detailText}>{[cuisine, priceRange].filter(Boolean).join(' · ')}</Text>
                </View>
              ) : null}
              {(eventType || date || time) ? (
                <View style={styles.detailRow}>
                  <Ionicons name="calendar" size={16} color={C.accent} />
                  <Text style={styles.detailText}>{[eventType, date, time].filter(Boolean).join(' · ')}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {desc ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>{isLandmark ? 'Why visit' : 'About'}</Text>
              <ScrollView style={styles.detailDescScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.detailDesc}>{desc}</Text>
              </ScrollView>
            </View>
          ) : null}
          <View style={styles.detailActions}>
            <TouchableOpacity
              style={styles.directionsBtn}
              onPress={() => openDirections(poi)}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate" size={18} color="#FFF" />
              <Text style={styles.directionsBtnText}>Get directions</Text>
              <Text style={styles.directionsBtnSub}>{getWalkingTime(poi.distanceKm)}</Text>
            </TouchableOpacity>
            {hasProfile ? (
              <TouchableOpacity
                style={styles.viewProfileBtn}
                onPress={() => onViewProfile?.(clientId)}
                activeOpacity={0.8}
              >
                <Ionicons name="person" size={18} color="#FFF" />
                <Text style={styles.viewProfileBtnText}>View profile</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ARScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [location, setLocation] = useState(null);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [profileClientId, setProfileClientId] = useState(null);
  const [mode, setMode] = useState('landmarks');
  const [maxDistanceKm, setMaxDistanceKm] = useState(10);
  const headingSub = useRef(null);

  const filteredPois = pois.filter((p) => {
    if (p.distanceKm > maxDistanceKm) return false;
    const relBearing = (p.bearing - heading + 360) % 360;
    const angleFromCenter = Math.min(relBearing, 360 - relBearing);
    return angleFromCenter <= CAMERA_FOV_DEG / 2;
  });

  const nearestInView = filteredPois.length > 0 ? filteredPois.reduce((a, b) => a.distanceKm <= b.distanceKm ? a : b) : null;
  const inViewIds = new Set((filteredPois || []).map((p) => p.name + p.lat));
  const nearestOutOfView = pois
    .filter((p) => p.distanceKm <= maxDistanceKm && !inViewIds.has(p.name + p.lat))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;

  const centerX = width / 2;
  const centerY = height / 2 - 40;
  const radius = Math.min(width, height) * 0.35;

  const loadNearby = useCallback(async (lat, lng, filterMode = mode) => {
    try {
      const data = await fetchNearbyPOIs(lat, lng, filterMode);
      setPois(data);
    } catch (e) {
      console.warn('[AR] fetchNearbyPOIs failed:', e?.message);
      setPois([]);
    }
  }, [mode]);

  useEffect(() => {
    if (location && !loading) {
      loadNearby(location.latitude, location.longitude, mode);
    }
  }, [mode]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!permission?.granted) {
        const { status } = await requestPermission();
        if (!mounted) return;
        if (status !== 'granted') {
          setError('Camera permission required');
          setLoading(false);
          return;
        }
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status !== 'granted') {
          setError('Location permission required to discover nearby spots');
          setLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!mounted) return;
        setLocation(loc.coords);
        await loadNearby(loc.coords.latitude, loc.coords.longitude, 'landmarks');
      } catch (e) {
        if (mounted) setError(e?.message || 'Could not get location');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [permission?.granted, requestPermission, loadNearby]);

  useEffect(() => {
    if (!location) return;
    let cleaned = false;
    Location.watchHeadingAsync((h) => {
      setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
    }).then((s) => {
      if (cleaned) s.remove();
      else headingSub.current = s;
    });
    return () => {
      cleaned = true;
      headingSub.current?.remove?.();
      headingSub.current = null;
    };
  }, [location]);


  const openDirections = useCallback((poi) => {
    const url = Platform.select({
      ios: `maps://app?daddr=${poi.lat},${poi.lng}`,
      android: `geo:0,0?q=${poi.lat},${poi.lng}(${encodeURIComponent(poi.name)})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`,
    });
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`));
  }, []);

  const getWalkingTime = (km) => {
    const mins = Math.round((km / 5) * 60);
    if (mins < 1) return '~1 min walk';
    if (mins < 60) return `~${mins} min walk`;
    return `~${Math.floor(mins / 60)} hr walk`;
  };

  const modalJustOpenedRef = useRef(false);
  const closeModal = useCallback(() => {
    if (modalJustOpenedRef.current) return;
    setSelectedPoi(null);
  }, []);
  const handleOpenPOI = useCallback((poi) => {
    setSelectedPoi(poi);
    modalJustOpenedRef.current = true;
    setTimeout(() => { modalJustOpenedRef.current = false; }, 400);
  }, []);

  const handleViewProfile = useCallback((clientId) => {
    setSelectedPoi(null);
    setProfileClientId(clientId);
  }, []);

  const getMarkerPosition = (poi) => {
    const relBearing = ((poi.bearing - heading + 360) % 360) * (Math.PI / 180);
    const x = centerX + Math.sin(relBearing) * radius - 50;
    const y = centerY - Math.cos(relBearing) * radius - 40;
    return { x: Math.max(10, Math.min(width - 110, x)), y: Math.max(10, Math.min(height - 90, y)) };
  };

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={48} color={C.accent} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Camera access is needed for AR mode</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => requestPermission()}>
            <Text style={styles.backBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loaderText}>Finding nearby spots…</Text>
        </View>
      ) : (
        <>
          {filteredPois.map((poi, i) => {
            const { x, y } = getMarkerPosition(poi);
            return (
              <POIMarker
                key={`${poi.name}-${poi.lat}-${i}`}
                poi={poi}
                x={x}
                y={y}
                onPress={handleOpenPOI}
                isNearest={nearestInView && nearestInView.name === poi.name && nearestInView.lat === poi.lat}
                index={i}
              />
            );
          })}
          <CompassRing heading={heading} nearestOutOfView={filteredPois.length === 0 ? nearestOutOfView : null} centerY={centerY} />
        </>
      )}
      <BlurView intensity={70} tint="dark" style={[styles.headerBlur, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={() => navigation?.goBack()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={22} color="#FFF" />
            <Text style={styles.headerBackBtnText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Ionicons name="globe-outline" size={20} color={C.accent} />
            <Text style={styles.title}>AR Explore</Text>
          </View>
          <View style={styles.placeholder} />
        </View>
      </BlurView>
      <BlurView intensity={55} tint="dark" style={styles.controlsBlur}>
        <View style={[styles.modeTabs, { paddingHorizontal: 16, paddingBottom: 8 }]}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.modeTab, mode === m.id && styles.modeTabActive]}
              onPress={() => setMode(m.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={m.icon} size={16} color={mode === m.id ? '#FFF' : 'rgba(255,255,255,0.6)'} />
              <Text style={[styles.modeTabText, mode === m.id && styles.modeTabTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.sliderWrap, { paddingHorizontal: 20 }]}>
          <View style={styles.sliderRow}>
            <Ionicons name="resize" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.sliderLabel}>View distance</Text>
            <Text style={styles.sliderValue}>
              {maxDistanceKm < 1 ? `${Math.round(maxDistanceKm * 1000)}m` : `${maxDistanceKm}km`}
            </Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0.5}
            maximumValue={25}
            step={0.5}
            value={maxDistanceKm}
            onValueChange={setMaxDistanceKm}
            minimumTrackTintColor={C.accent}
            maximumTrackTintColor="rgba(255,255,255,0.3)"
            thumbTintColor={C.accent}
          />
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.hint}>
            {filteredPois.length === 0 && nearestOutOfView
              ? `Turn to see ${nearestOutOfView.name} (${nearestOutOfView.distanceKm < 1 ? Math.round(nearestOutOfView.distanceKm * 1000) + 'm' : nearestOutOfView.distanceKm.toFixed(1) + 'km'})`
              : filteredPois.length === 0 && pois.length > 0
                ? 'Point your camera toward places to see them'
                : filteredPois.length > 0 && nearestInView
                  ? `${filteredPois.length} in view · Nearest: ${nearestInView.name}`
                  : mode === 'landmarks'
                    ? 'Discover famous buildings & heritage sites'
                    : mode === 'food'
                      ? 'Find restaurants & events nearby'
                      : 'Explore landmarks, food & events'}
          </Text>
        </View>
      </BlurView>
      <POIDetailModal
        visible={!!selectedPoi}
        poi={selectedPoi}
        onClose={closeModal}
        onRequestClose={() => setSelectedPoi(null)}
        insets={insets}
        openDirections={openDirections}
        getWalkingTime={getWalkingTime}
        onViewProfile={handleViewProfile}
      />
      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        onClose={() => setProfileClientId(null)}
        insets={insets}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loaderWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    color: C.text,
    fontSize: 16,
    marginTop: 12,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: C.text,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: C.accent,
    borderRadius: 12,
  },
  backBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginLeft: -4,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerBackBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  placeholder: { width: 80 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hint: {
    color: C.sub,
    fontSize: 13,
  },
  headerBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  controlsBlur: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  markerWrap: {
    position: 'absolute',
    width: 120,
  },
  markerGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.glow,
    borderRadius: 16,
    margin: -6,
    opacity: 0.8,
  },
  marker: {
    width: 110,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  markerNearest: {
    borderColor: C.accent,
    borderWidth: 2,
    minWidth: 120,
  },
  nearestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: C.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  nearestBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  markerIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerName: {
    flex: 1,
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
  },
  markerDist: {
    color: C.sub,
    fontSize: 11,
  },
  markerLandmark: {
    borderColor: C.accent,
    borderWidth: 1.5,
    minWidth: 120,
  },
  markerIconLandmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  markerNameLandmark: {
    fontSize: 13,
  },
  sliderWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 100,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sliderLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  sliderValue: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  slider: {
    width: '100%',
    height: 28,
  },
  modeTabs: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modeTabActive: {
    backgroundColor: C.accent,
  },
  modeTabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: '#FFF',
  },
  compassWrap: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
  compassBlur: {
    borderRadius: 36,
    overflow: 'hidden',
  },
  compassCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  compassN: {
    position: 'absolute',
  },
  compassNText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '800',
  },
  compassNeedle: {
    position: 'absolute',
    left: 25,
    top: 25,
  },
  compassHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    maxWidth: 140,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
  },
  compassHintText: {
    color: C.sub,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  detailActions: {
    gap: 12,
    marginTop: 16,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: C.accent,
    borderRadius: 14,
  },
  directionsBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  directionsBtnSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
  },
  viewProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  viewProfileBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  detailCard: {
    backgroundColor: 'rgba(28,25,23,0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.12)',
    borderLeftWidth: 4,
    borderLeftColor: C.accent,
  },
  detailHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  detailClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  detailHeader: {
    marginBottom: 16,
  },
  detailTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 10,
  },
  detailTypeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  detailTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 10,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  detailMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailMetaText: {
    color: C.sub,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingNum: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  detailSection: {
    marginBottom: 16,
  },
  detailSectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  detailText: {
    color: C.sub,
    fontSize: 15,
    flex: 1,
    lineHeight: 22,
  },
  detailDescScroll: {
    maxHeight: 120,
  },
  detailDesc: {
    color: C.sub,
    fontSize: 15,
    lineHeight: 22,
  },
});
