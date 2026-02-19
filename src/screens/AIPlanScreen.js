import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  Animated,
  PanResponder,
  Platform,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Circle, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { fetchPlaces, fetchRestaurants, fetchBreakfastSpots, fetchEvents, generateDayPlan } from '../services/aiPipeline';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const APP_TAB_BAR_HEIGHT_IOS = 70;
const getAppTabBarHeight = (insets) =>
  Platform.OS === 'ios' ? APP_TAB_BAR_HEIGHT_IOS : 60 + (insets?.bottom ?? 0);

const SHEET_VISIBLE_PEEK = 0.28;
const SHEET_VISIBLE_MID = 0.75;
const SHEET_VISIBLE_EXPANDED = 0.9;

const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_VISIBLE_EXPANDED;
const SHEET_TOP_EXPANDED = SCREEN_HEIGHT - SHEET_HEIGHT;
const SHEET_TOP_MID = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_MID);
const SHEET_TOP_PEEK = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_PEEK);

const SNAP_POINTS = [
  0,
  SHEET_TOP_MID - SHEET_TOP_EXPANDED,
  SHEET_TOP_PEEK - SHEET_TOP_EXPANDED,
];
const INITIAL_SNAP_INDEX = 2;

const BAHRAIN_REGION = {
  latitude: 26.0667,
  longitude: 50.5577,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const BAHRAIN_BOUNDS = {
  minLat: 25.55,
  maxLat: 26.40,
  minLng: 50.30,
  maxLng: 50.95,
};

function clampRegionToBahrain(region) {
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

const PREFERENCES = [
  { id: 'sightseeing', label: 'Sightseeing', icon: 'eye-outline', color: '#0EA5E9' },
  { id: 'instagram', label: 'Instagram', icon: 'camera-outline', color: '#EC4899' },
  { id: 'leisure', label: 'Leisure', icon: 'leaf-outline', color: '#10B981' },
  { id: 'nature', label: 'Nature', icon: 'earth-outline', color: '#22C55E' },
  { id: 'historical', label: 'Historical', icon: 'time-outline', color: '#818CF8' },
  { id: 'cultural', label: 'Cultural', icon: 'color-palette-outline', color: '#6366F1' },
  { id: 'adventure', label: 'Adventure', icon: 'rocket-outline', color: '#EF4444' },
];

const FOOD_CATEGORIES = [
  { id: 'cuisine', label: 'Cuisine', icon: 'restaurant-outline', color: '#C8102E' },
  { id: 'seafood', label: 'Seafood', icon: 'fish-outline', color: '#0EA5E9' },
  { id: 'american', label: 'American', icon: 'fast-food-outline', color: '#F97316' },
  { id: 'international', label: 'International', icon: 'globe-outline', color: '#6366F1' },
  { id: 'cafe', label: 'Cafe', icon: 'cafe-outline', color: '#A16207' },
  { id: 'asian', label: 'Asian', icon: 'nutrition-outline', color: '#DC2626' },
  { id: 'italian', label: 'Italian', icon: 'pizza-outline', color: '#16A34A' },
  { id: 'south-asian', label: 'South Asian', icon: 'flame-outline', color: '#F59E0B' },
  { id: 'fast-food', label: 'Fast Food', icon: 'fast-food-outline', color: '#EF4444' },
];

const DUMMY_PAST_PLANS = [
  { id: 'plan1', title: 'Weekend in Manama', spots: 4, date: '2 days ago' },
  { id: 'plan2', title: 'Beach & Food Day', spots: 5, date: '1 week ago' },
];

function buildMapMarkers(plan) {
  if (!plan) return [];
  return plan.map((item, idx) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
    return {
      idx,
      spot: item.spot,
      time: item.time,
      type: item.type,
      reason: item.reason,
      lat,
      lng,
    };
  }).filter(Boolean);
}

async function fetchDrivingRoute(markers) {
  if (!markers || markers.length < 2) return [];
  const coords = markers.map(m => `${m.lng},${m.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.code === 'Ok' && json.routes?.[0]?.geometry?.coordinates) {
      return json.routes[0].geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
    }
  } catch (_) {}
  return [];
}

export default function AIPlanScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const sheetAnim = useRef(new Animated.Value(SNAP_POINTS[INITIAL_SNAP_INDEX])).current;
  const lastSnap = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const currentYRef = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);

  // 0 = past plans, 1 = preferences, 2 = food, 3 = results
  const [drawerStep, setDrawerStep] = useState(0);
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [selectedFoodCategories, setSelectedFoodCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [dayPlan, setDayPlan] = useState(null);
  const [pineconeMatches, setPineconeMatches] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);

  const togglePreference = (id) => {
    setSelectedPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleFoodCategory = (id) => {
    setSelectedFoodCategories((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const startSetup = () => {
    setSelectedPreferences([]);
    setSelectedFoodCategories([]);
    setDayPlan(null);
    setPineconeMatches([]);
    setSelectedMarker(null);
    setRouteCoords([]);
    setError(null);
    setDrawerStep(1);
    lastSnap.current = SNAP_POINTS[1];
    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[1],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const handleGenerate = async () => {
    const prefLabels = selectedPreferences
      .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
      .filter(Boolean);
    const foodLabels = selectedFoodCategories
      .map((id) => FOOD_CATEGORIES.find((f) => f.id === id)?.label)
      .filter(Boolean);

    setLoading(true);
    setLoadingStatus('Finding places based on your preferences…');
    setError(null);
    setDayPlan(null);
    setPineconeMatches([]);
    setSelectedMarker(null);
    setRouteCoords([]);
    setDrawerStep(3);

    lastSnap.current = SNAP_POINTS[0];
    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[0],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    try {
      // Pipeline Step 1 — fetch places based on preferences
      const places = await fetchPlaces(prefLabels);

      // Pipeline Step 2 — fetch restaurants based on food choices
      setLoadingStatus('Finding restaurants for your food cravings…');
      const restaurants = await fetchRestaurants(foodLabels);

      // Pipeline Step 3 — fetch breakfast spots
      setLoadingStatus('Finding the best breakfast spots…');
      const breakfastSpots = await fetchBreakfastSpots();

      // Pipeline Step 4 — fetch events
      setLoadingStatus('Checking out events happening in Bahrain…');
      const events = await fetchEvents(prefLabels);

      const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
      setPineconeMatches(allMatches);

      console.log(`Pinecone: ${places.length} places, ${restaurants.length} restaurants, ${breakfastSpots.length} breakfast, ${events.length} events`);

      // Pipeline Step 5 — GPT builds a smart day plan from all results
      setLoadingStatus('Khalid is crafting your perfect day…');
      const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels);

      setDayPlan(plan);
      setError(null);

      // Debug markers
      const markers = buildMapMarkers(plan);
      console.log(`Map markers: ${markers.length}/${plan.length} spots have coordinates`);

      // Fit map to show all markers
      const validMarkers = buildMapMarkers(plan).filter(m => m.lat && m.lng);
      const coords = validMarkers.map(m => ({ latitude: m.lat, longitude: m.lng }));
      if (coords.length > 0 && mapRef.current) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
          animated: true,
        });
      }

      // Fetch actual driving route
      if (validMarkers.length >= 2) {
        fetchDrivingRoute(validMarkers).then(rc => {
          if (rc.length > 0) setRouteCoords(rc);
        });
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setDayPlan(null);
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  useEffect(() => {
    const id = sheetAnim.addListener(({ value }) => { currentYRef.current = value; });
    return () => sheetAnim.removeListener(id);
  }, [sheetAnim]);

  const handleRegionChangeComplete = (region) => {
    if (!region || !mapRef.current) return;
    const clamped = clampRegionToBahrain(region);
    if (Math.abs(clamped.latitude - region.latitude) > 0.0005 || Math.abs(clamped.longitude - region.longitude) > 0.0005) {
      mapRef.current.animateToRegion(clamped, 180);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => { lastSnap.current = currentYRef.current; },
      onPanResponderMove: (_, g) => {
        const newY = lastSnap.current + g.dy;
        sheetAnim.setValue(Math.max(SNAP_POINTS[0], Math.min(SNAP_POINTS[2], newY)));
      },
      onPanResponderRelease: (_, g) => {
        const currentY = lastSnap.current + g.dy;
        let targetIndex = 0;
        let minDist = Math.abs(currentY - SNAP_POINTS[0]);
        for (let i = 1; i < SNAP_POINTS.length; i++) {
          const d = Math.abs(currentY - SNAP_POINTS[i]);
          if (d < minDist) { minDist = d; targetIndex = i; }
        }
        if (g.vy > 0.4) targetIndex = Math.min(2, targetIndex + 1);
        else if (g.vy < -0.4) targetIndex = Math.max(0, targetIndex - 1);
        const target = SNAP_POINTS[targetIndex];
        lastSnap.current = target;
        Animated.spring(sheetAnim, { toValue: target, useNativeDriver: true, tension: 80, friction: 12 }).start();
      },
    })
  ).current;

  // Grid tile for preferences and food
  const renderGridTile = (item, isSelected, onPress) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.gridTile, isSelected && { borderColor: item.color, backgroundColor: `${item.color}10` }]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={[styles.gridTileIcon, { backgroundColor: `${item.color}18` }]}>
        <Ionicons name={item.icon} size={22} color={item.color} />
      </View>
      <Text style={[styles.gridTileLabel, isSelected && { color: item.color, fontWeight: '700' }]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={BAHRAIN_REGION}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={() => setSelectedMarker(null)}
      >
        {/* Actual driving route */}
        {routeCoords.length >= 2 && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeColor="rgba(0,0,0,0.10)"
              strokeWidth={6}
              lineDashPattern={[0]}
            />
            <Polyline
              coordinates={routeCoords}
              strokeColor="#C8102E"
              strokeWidth={3.5}
              lineDashPattern={[12, 8]}
              lineJoin="round"
              lineCap="round"
            />
          </>
        )}

        {/* Markers */}
        {dayPlan && buildMapMarkers(dayPlan).map((mk) => {
          const isEat = mk.type === 'restaurant';
          const isEvent = mk.type === 'event';
          const timeCols = { Morning: '#D97706', Afternoon: '#0284C7', Evening: '#7C3AED' };
          const accent = isEat ? '#C8102E' : isEvent ? '#EC4899' : (timeCols[mk.time] || '#6B7280');
          const pinIcon = isEat ? 'restaurant' : isEvent ? 'calendar' : 'location';
          return (
            <React.Fragment key={mk.idx}>
              <Circle
                center={{ latitude: mk.lat, longitude: mk.lng }}
                radius={200}
                fillColor={`${accent}18`}
                strokeColor={`${accent}40`}
                strokeWidth={1.5}
              />
              <Marker
                coordinate={{ latitude: mk.lat, longitude: mk.lng }}
                onPress={() => setSelectedMarker(mk)}
              >
                <View style={[styles.mapPin, { backgroundColor: accent }]}>
                  <Ionicons name={pinIcon} size={14} color="#FFF" />
                  <Text style={styles.mapPinNum}>{mk.idx + 1}</Text>
                </View>
                <View style={[styles.mapPinArrow, { borderTopColor: accent }]} />
              </Marker>
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Spot detail card */}
      {selectedMarker && (() => {
        const isEat = selectedMarker.type === 'restaurant';
        const isEvent = selectedMarker.type === 'event';
        const timeCols = { Morning: '#D97706', Afternoon: '#0284C7', Evening: '#7C3AED' };
        const accent = isEat ? '#C8102E' : isEvent ? '#EC4899' : (timeCols[selectedMarker.time] || '#6B7280');
        const stepNum = selectedMarker.idx + 1;
        const tagIcon = isEat ? 'restaurant-outline' : isEvent ? 'calendar-outline' : 'compass-outline';
        const tagLabel = isEat ? 'Dining' : isEvent ? 'Event' : 'Visit';
        return (
          <View style={styles.spotDetailWrap}>
            <View style={styles.spotDetailCard}>
              <View style={[styles.spotDetailAccent, { backgroundColor: accent }]} />

              <View style={styles.spotDetailBody}>
                <View style={styles.spotDetailRow1}>
                  <View style={[styles.spotDetailStep, { backgroundColor: accent }]}>
                    <Text style={styles.spotDetailStepText}>{stepNum}</Text>
                  </View>
                  <View style={styles.spotDetailNameWrap}>
                    <Text style={styles.spotDetailName} numberOfLines={2}>{selectedMarker.spot}</Text>
                    <View style={styles.spotDetailTags}>
                      <View style={[styles.spotDetailTag, { backgroundColor: `${accent}12` }]}>
                        <Ionicons name={tagIcon} size={11} color={accent} />
                        <Text style={[styles.spotDetailTagText, { color: accent }]}>{tagLabel}</Text>
                      </View>
                      <Text style={styles.spotDetailDot}>·</Text>
                      <Ionicons name={{ Morning: 'sunny-outline', Afternoon: 'partly-sunny-outline', Evening: 'moon-outline' }[selectedMarker.time] || 'time-outline'} size={12} color="#9CA3AF" />
                      <Text style={styles.spotDetailTime}>{selectedMarker.time}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedMarker(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close-circle" size={24} color="#D1D5DB" />
                  </TouchableOpacity>
                </View>

                {/* Reason */}
                <Text style={styles.spotDetailReason} numberOfLines={3}>{selectedMarker.reason}</Text>

                {/* Button */}
                <TouchableOpacity style={[styles.spotDetailBtn, { backgroundColor: accent }]} activeOpacity={0.8}>
                  <Text style={styles.spotDetailBtnText}>Explore</Text>
                  <Ionicons name="arrow-forward" size={15} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })()}

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: 80 + getAppTabBarHeight(insets), transform: [{ translateY: sheetAnim }] },
        ]}
      >
        <View style={styles.grabberWrap} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
          <Text style={styles.grabberHint}>Drag up for more details</Text>
        </View>

        {/* Step 0 — Past Plans */}
        {drawerStep === 0 && (
          <>
            <View style={styles.pastPlansHeader}>
              <View>
                <Text style={styles.pastPlansTitle}>Past Plans</Text>
                <Text style={styles.pastPlansSubtitle}>{DUMMY_PAST_PLANS.length} plans saved</Text>
              </View>
              <TouchableOpacity style={styles.startAiButton} activeOpacity={0.8} onPress={startSetup}>
                <Ionicons name="sparkles-outline" size={16} color="#C8102E" />
                <Text style={styles.startAiButtonText}>Start AI trip setup</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pastPlansScroll} contentContainerStyle={styles.pastPlansContent} showsVerticalScrollIndicator={false}>
              {DUMMY_PAST_PLANS.map((plan) => (
                <TouchableOpacity key={plan.id} style={styles.pastPlanCard} activeOpacity={0.8}>
                  <View style={styles.pastPlanIcon}>
                    <Ionicons name="map-outline" size={22} color="#C8102E" />
                  </View>
                  <View style={styles.pastPlanInfo}>
                    <View style={styles.pastPlanTitleRow}>
                      <Text style={styles.pastPlanName}>{plan.title}</Text>
                      <View style={styles.savedBadge}><Text style={styles.savedBadgeText}>Saved</Text></View>
                    </View>
                    <View style={styles.pastPlanMetaRow}>
                      <Ionicons name="calendar-outline" size={13} color="#9CA3AF" style={{ marginRight: 4 }} />
                      <Text style={styles.pastPlanMeta}>{plan.spots} spots · {plan.date}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Step 1 — Preferences (grid tiles) */}
        {drawerStep === 1 && (
          <>
            <View style={styles.drawerPageHeader}>
              <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => setDrawerStep(0)}>
                <Ionicons name="chevron-back" size={22} color="#374151" />
              </TouchableOpacity>
              <View style={styles.drawerPageTitleWrap}>
                <Text style={styles.drawerPageTitle}>What kind of experiences do you prefer?</Text>
                <Text style={styles.drawerPageSubtitle}>Tap a few that describe your Bahrain trip.</Text>
              </View>
            </View>
            <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false}>
              <View style={styles.gridRow}>
                {PREFERENCES.map((item) =>
                  renderGridTile(item, selectedPreferences.includes(item.id), () => togglePreference(item.id))
                )}
              </View>
            </ScrollView>
            <View style={styles.fixedButtonWrap}>
              <TouchableOpacity
                style={styles.continueButton}
                activeOpacity={0.8}
                onPress={() => setDrawerStep(2)}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Step 2 — Food (grid tiles) */}
        {drawerStep === 2 && (
          <>
            <View style={styles.drawerPageHeader}>
              <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => setDrawerStep(1)}>
                <Ionicons name="chevron-back" size={22} color="#374151" />
              </TouchableOpacity>
              <View style={styles.drawerPageTitleWrap}>
                <Text style={styles.drawerPageTitle}>What do you prefer to eat?</Text>
                <Text style={styles.drawerPageSubtitle}>Pick your food vibes for this trip.</Text>
              </View>
            </View>
            <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false}>
              <View style={styles.gridRow}>
                {FOOD_CATEGORIES.map((item) =>
                  renderGridTile(item, selectedFoodCategories.includes(item.id), () => toggleFoodCategory(item.id))
                )}
              </View>
            </ScrollView>
            <View style={styles.fixedButtonWrap}>
              <TouchableOpacity
                style={[styles.generateButton, loading && styles.generateButtonDisabled]}
                activeOpacity={0.8}
                onPress={handleGenerate}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={styles.generateButtonText}>Generating plan…</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.generateButtonText}>Generate</Text>
                    <Ionicons name="sparkles" size={18} color="#FFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Step 3 — Day plan results */}
        {drawerStep === 3 && (
          <>
            {/* Header */}
            <View style={styles.drawerPageHeader}>
              <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => { setDrawerStep(2); setDayPlan(null); setError(null); }}>
                <Ionicons name="chevron-back" size={22} color="#374151" />
              </TouchableOpacity>
              <View style={styles.drawerPageTitleWrap}>
                <Text style={styles.drawerPageTitle}>{loading ? 'Preparing your day…' : 'Your Day in Bahrain'}</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <View style={styles.loadingPulse}>
                  <ActivityIndicator size="large" color="#C8102E" />
                </View>
                <Text style={styles.loadingTitle}>Hang tight, habibi!</Text>
                <Text style={styles.loadingSubtext}>{loadingStatus}</Text>
                <View style={styles.loadingSteps}>
                  {[
                    { icon: 'compass-outline', color: '#10B981', text: 'Matching 6 places to your vibe' },
                    { icon: 'restaurant-outline', color: '#F59E0B', text: 'Hunting 6 perfect food spots' },
                    { icon: 'sparkles-outline', color: '#8B5CF6', text: 'Khalid is stitching your plan' },
                  ].map((s, i) => (
                    <View key={i} style={styles.loadingStepRow}>
                      <View style={[styles.loadingDot, { backgroundColor: s.color }]}>
                        <Ionicons name={s.icon} size={14} color="#FFF" />
                      </View>
                      <Text style={styles.loadingStepText}>{s.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : error ? (
              <View style={{ paddingHorizontal: 20, flex: 1, justifyContent: 'center' }}>
                <View style={styles.errorCard}>
                  <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
                <TouchableOpacity style={styles.retryButton} activeOpacity={0.8} onPress={handleGenerate}>
                  <Ionicons name="refresh-outline" size={18} color="#C8102E" />
                  <Text style={styles.retryButtonText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : !dayPlan || dayPlan.length === 0 ? (
              <View style={{ paddingHorizontal: 20, flex: 1, justifyContent: 'center' }}>
                <Text style={styles.emptyResults}>No plan generated.</Text>
              </View>
            ) : (
              <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>

                {/* ═══ Boarding-pass hero ═══ */}
                <View style={styles.boardingPass}>
                  <View style={styles.bpTop}>
                    <View>
                      <Text style={styles.bpLabel}>DESTINATION</Text>
                      <Text style={styles.bpValue}>Bahrain</Text>
                    </View>
                    <View style={styles.bpDivider}>
                      <Ionicons name="airplane" size={18} color="#C8102E" />
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.bpLabel}>ITINERARY</Text>
                      <Text style={styles.bpValue}>Full Day</Text>
                    </View>
                  </View>
                  <View style={styles.bpDashedLine} />
                  <View style={styles.bpBottom}>
                    <View style={styles.bpStat}>
                      <Ionicons name="location" size={14} color="#C8102E" />
                      <Text style={styles.bpStatNum}>{dayPlan.filter(i => i.type !== 'restaurant').length}</Text>
                      <Text style={styles.bpStatLabel}>Places</Text>
                    </View>
                    <View style={styles.bpStat}>
                      <Ionicons name="restaurant" size={14} color="#C8102E" />
                      <Text style={styles.bpStatNum}>{dayPlan.filter(i => i.type === 'restaurant').length}</Text>
                      <Text style={styles.bpStatLabel}>Meals</Text>
                    </View>
                    <View style={styles.bpStat}>
                      <Ionicons name="flag" size={14} color="#C8102E" />
                      <Text style={styles.bpStatNum}>{dayPlan.length}</Text>
                      <Text style={styles.bpStatLabel}>Stops</Text>
                    </View>
                    <View style={styles.bpGuide}>
                      <Text style={styles.bpGuideLabel}>YOUR GUIDE</Text>
                      <Text style={styles.bpGuideName}>Khalid</Text>
                    </View>
                  </View>
                </View>

                {/* ═══ Itinerary sections ═══ */}
                {(() => {
                  const sections = {
                    Morning:   { color: '#D97706', bg: '#FEF3C7', icon: 'sunny',         tagline: 'Rise & explore' },
                    Afternoon: { color: '#0284C7', bg: '#E0F2FE', icon: 'partly-sunny',  tagline: 'Discover & dine' },
                    Evening:   { color: '#7C3AED', bg: '#EDE9FE', icon: 'moon',           tagline: 'Unwind & savour' },
                  };
                  const order = ['Morning', 'Afternoon', 'Evening'];
                  const grouped = {};
                  dayPlan.forEach((item) => { if (!grouped[item.time]) grouped[item.time] = []; grouped[item.time].push(item); });
                  let stopNum = 0;

                  return order.filter(t => grouped[t]).map((time) => {
                    const sec = sections[time];
                    const items = grouped[time];
                    return (
                      <View key={time} style={styles.itinSection}>
                        {/* Section banner */}
                        <View style={[styles.secBanner, { backgroundColor: sec.bg }]}>
                          <View style={[styles.secIconCircle, { backgroundColor: sec.color }]}>
                            <Ionicons name={sec.icon} size={18} color="#FFF" />
                          </View>
                          <View style={styles.secBannerText}>
                            <Text style={[styles.secBannerTitle, { color: sec.color }]}>{time}</Text>
                            <Text style={[styles.secBannerSub, { color: sec.color }]}>{sec.tagline}</Text>
                          </View>
                          <Text style={[styles.secBannerCount, { color: sec.color }]}>{items.length} stop{items.length > 1 ? 's' : ''}</Text>
                        </View>

                        {/* Cards */}
                        {items.map((item, idx) => {
                          stopNum += 1;
                          const isEat = item.type === 'restaurant';
                          const isEvent = item.type === 'event';
                          const accent = isEat ? '#C8102E' : isEvent ? '#EC4899' : sec.color;
                          const stripIcon = isEat ? 'restaurant-outline' : isEvent ? 'calendar-outline' : 'compass-outline';
                          const stripLabel = isEat ? 'DINING' : isEvent ? 'EVENT' : 'SIGHTSEEING';
                          return (
                            <View key={idx} style={styles.destRow}>
                              <View style={styles.destLeft}>
                                <View style={[styles.destNumCircle, { backgroundColor: accent }]}>
                                  <Text style={styles.destNum}>{stopNum}</Text>
                                </View>
                                {idx < items.length - 1 && <View style={[styles.destConnector, { backgroundColor: `${sec.color}25` }]} />}
                              </View>

                              <View style={styles.destCard}>
                                <View style={[styles.destStrip, { backgroundColor: `${accent}0D` }]}>
                                  <Ionicons name={stripIcon} size={13} color={accent} />
                                  <Text style={[styles.destStripText, { color: accent }]}>{stripLabel}</Text>
                                </View>

                                {/* Name + icon */}
                                <View style={styles.destBody}>
                                  <View style={[styles.destIconBox, { backgroundColor: `${accent}10` }]}>
                                    <Ionicons name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'} size={20} color={accent} />
                                  </View>
                                  <Text style={styles.destName}>{item.spot}</Text>
                                </View>

                                {/* Khalid's recommendation */}
                                <View style={styles.destReasonWrap}>
                                  <View style={styles.destReasonQuote}>
                                    <Ionicons name="chatbubble-ellipses" size={12} color="#D97706" />
                                  </View>
                                  <Text style={styles.destReasonText}>{item.reason}</Text>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  });
                })()}

                {/* ═══ Passport stamp footer ═══ */}
                <View style={styles.stampFooter}>
                  <View style={styles.stampCircle}>
                    <Text style={styles.stampTop}>BAHRAIN</Text>
                    <Ionicons name="heart" size={16} color="#C8102E" />
                    <Text style={styles.stampBottom}>APPROVED</Text>
                  </View>
                  <Text style={styles.stampTagline}>Yalla habibi, have the best day!</Text>
                </View>
              </ScrollView>
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
}

const TILE_WIDTH = (SCREEN_WIDTH - 40 - 24) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FEF8E7' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: SHEET_HEIGHT,
    backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 12,
  },
  grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 24, marginBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 2.5, backgroundColor: '#D1D5DB' },
  grabberHint: { marginTop: 6, fontSize: 11, color: '#9CA3AF' },

  // Past plans (step 0)
  pastPlansHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 16,
  },
  pastPlansTitle: { fontSize: 26, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  pastPlansSubtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  startAiButton: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 2, borderColor: '#C8102E', gap: 6,
  },
  startAiButtonText: { fontSize: 14, fontWeight: '600', color: '#C8102E' },
  pastPlansScroll: { flex: 1 },
  pastPlansContent: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  pastPlanCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.8)', shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  pastPlanIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(200,16,46,0.12)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  pastPlanInfo: { flex: 1 },
  pastPlanTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  pastPlanName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  savedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(16,185,129,0.08)' },
  savedBadgeText: { fontSize: 11, fontWeight: '600', color: '#059669' },
  pastPlanMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pastPlanMeta: { fontSize: 13, color: '#9CA3AF' },

  // Drawer page header
  drawerPageHeader: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 12, gap: 4,
  },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  drawerPageTitleWrap: { flex: 1 },
  drawerPageTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  drawerPageTitleSingle: { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1 },
  drawerPageSubtitle: { fontSize: 13, color: '#6B7280' },

  // Grid tiles for preferences + food
  gridScroll: { flex: 1 },
  gridContent: { paddingHorizontal: 20, paddingBottom: 40 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  gridTile: {
    width: TILE_WIDTH, aspectRatio: 1, borderRadius: 14, borderWidth: 1.5,
    borderColor: 'rgba(209,213,219,0.7)', backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
  },
  gridTileIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  gridTileLabel: { fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'center' },

  fixedButtonWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },

  continueButton: {
    backgroundColor: '#C8102E', paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  continueButtonDisabled: { backgroundColor: '#E5E7EB' },
  continueButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  // Generate button (food)
  generateButton: {
    flexDirection: 'row', backgroundColor: '#C8102E', paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 8,
  },
  generateButtonDisabled: { opacity: 0.8 },
  generateButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  // ── Results (step 3) ────────────────────────────────────────────
  resultsScroll: { flex: 1 },
  resultsContent: { paddingBottom: 36, paddingHorizontal: 16 },

  // Loading
  loadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 40,
  },
  loadingPulse: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(200,16,46,0.06)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
    borderWidth: 2, borderColor: 'rgba(200,16,46,0.15)',
  },
  loadingTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4, letterSpacing: -0.3 },
  loadingSubtext: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 28 },
  loadingSteps: { gap: 14, width: '100%', paddingHorizontal: 4 },
  loadingStepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loadingStepText: { fontSize: 14, color: '#374151', fontWeight: '500' },

  // Error
  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16,
    backgroundColor: 'rgba(220,38,38,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)',
  },
  errorText: { flex: 1, fontSize: 14, color: '#DC2626', fontWeight: '500', lineHeight: 20 },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: '#C8102E',
  },
  retryButtonText: { fontSize: 15, fontWeight: '600', color: '#C8102E' },
  emptyResults: { fontSize: 14, color: '#6B7280', textAlign: 'center', paddingVertical: 24 },

  // ── Boarding pass hero ──
  boardingPass: {
    backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(200,16,46,0.12)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  bpTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  },
  bpLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1.2 },
  bpValue: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 2, letterSpacing: -0.5 },
  bpDivider: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: 'rgba(200,16,46,0.15)',
    backgroundColor: 'rgba(200,16,46,0.04)', alignItems: 'center', justifyContent: 'center',
  },
  bpDashedLine: {
    height: 1, marginHorizontal: 16,
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 1,
  },
  bpBottom: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 16,
  },
  bpStat: { alignItems: 'center', gap: 2 },
  bpStatNum: { fontSize: 18, fontWeight: '800', color: '#111827' },
  bpStatLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.5 },
  bpGuide: {
    flex: 1, alignItems: 'flex-end',
  },
  bpGuideLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1 },
  bpGuideName: { fontSize: 16, fontWeight: '800', color: '#C8102E', marginTop: 1 },

  // ── Itinerary section ──
  itinSection: { marginBottom: 8 },

  secBanner: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 12,
    paddingHorizontal: 14, marginBottom: 10,
  },
  secIconCircle: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
  },
  secBannerText: { flex: 1, marginLeft: 12 },
  secBannerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  secBannerSub: { fontSize: 12, fontWeight: '500', opacity: 0.7, marginTop: 1 },
  secBannerCount: { fontSize: 12, fontWeight: '700' },

  // ── Destination row (number + card) ──
  destRow: { flexDirection: 'row', paddingLeft: 2 },

  destLeft: { width: 30, alignItems: 'center', paddingTop: 14 },
  destNumCircle: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  destNum: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  destConnector: { flex: 1, width: 2, borderRadius: 1, marginTop: 4 },

  // Card
  destCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, marginLeft: 12, marginBottom: 10,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(209,213,219,0.45)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  destStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  destStripText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  destBody: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6,
  },
  destIconBox: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  destName: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827', lineHeight: 21 },
  destReasonWrap: {
    flexDirection: 'row', marginHorizontal: 14, marginBottom: 14, marginTop: 4,
    backgroundColor: '#FEF9EE', borderRadius: 10, padding: 10, gap: 8,
  },
  destReasonQuote: { marginTop: 1 },
  destReasonText: { flex: 1, fontSize: 13, color: '#78350F', lineHeight: 19, fontStyle: 'italic' },

  // ── Passport stamp footer ──
  stampFooter: { alignItems: 'center', marginTop: 16, paddingBottom: 4 },
  stampCircle: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 2.5, borderColor: '#C8102E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    borderStyle: 'dashed',
  },
  stampTop: { fontSize: 8, fontWeight: '800', color: '#C8102E', letterSpacing: 2 },
  stampBottom: { fontSize: 7, fontWeight: '700', color: '#C8102E', letterSpacing: 1.5, marginTop: 1 },
  stampTagline: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', fontStyle: 'italic' },

  // ── Map pins ──
  mapPin: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  mapPinNum: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  mapPinArrow: {
    alignSelf: 'center', width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // ── Spot detail card ──
  spotDetailWrap: {
    position: 'absolute', top: 50, left: 14, right: 14, zIndex: 100,
  },
  spotDetailCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 25, elevation: 14,
  },
  spotDetailAccent: { height: 4 },
  spotDetailBody: { padding: 16 },
  spotDetailRow1: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  spotDetailStep: {
    width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2,
  },
  spotDetailStepText: { fontSize: 14, fontWeight: '900', color: '#FFF' },
  spotDetailNameWrap: { flex: 1, marginRight: 8 },
  spotDetailName: { fontSize: 17, fontWeight: '800', color: '#111827', lineHeight: 22, marginBottom: 6 },
  spotDetailTags: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  spotDetailTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  spotDetailTagText: { fontSize: 11, fontWeight: '700' },
  spotDetailDot: { fontSize: 14, color: '#D1D5DB' },
  spotDetailTime: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  spotDetailReason: { fontSize: 14, color: '#4B5563', lineHeight: 21, marginBottom: 14 },
  spotDetailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 14,
  },
  spotDetailBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
