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
import MapView from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { fetchPlaces, fetchRestaurants, generateDayPlan } from '../services/aiPipeline';

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
];

const DUMMY_PAST_PLANS = [
  { id: 'plan1', title: 'Weekend in Manama', spots: 4, date: '2 days ago' },
  { id: 'plan2', title: 'Beach & Food Day', spots: 5, date: '1 week ago' },
];

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
    setDrawerStep(3);

    lastSnap.current = SNAP_POINTS[0];
    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[0],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    try {
      // Pipeline Step 1 — fetch 6 places based on preferences
      const places = await fetchPlaces(prefLabels);

      // Pipeline Step 2 — fetch 6 restaurants based on food choices
      setLoadingStatus('Finding restaurants for your food cravings…');
      const restaurants = await fetchRestaurants(foodLabels);

      // Pipeline Step 3 — GPT builds a smart day plan from all 12 results
      setLoadingStatus('Khalid is crafting your perfect day…');
      const plan = await generateDayPlan(places, restaurants, prefLabels, foodLabels);

      setDayPlan(plan);
      setError(null);
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
      />

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
                {/* Hero summary card */}
                <View style={styles.heroCard}>
                  <View style={styles.heroIconRow}>
                    <View style={[styles.heroDot, { backgroundColor: '#F59E0B' }]}><Ionicons name="sunny" size={14} color="#FFF" /></View>
                    <View style={styles.heroDash} />
                    <View style={[styles.heroDot, { backgroundColor: '#0EA5E9' }]}><Ionicons name="partly-sunny" size={14} color="#FFF" /></View>
                    <View style={styles.heroDash} />
                    <View style={[styles.heroDot, { backgroundColor: '#8B5CF6' }]}><Ionicons name="moon" size={14} color="#FFF" /></View>
                  </View>
                  <Text style={styles.heroTitle}>Full day · {dayPlan.length} stops</Text>
                  <Text style={styles.heroSub}>Curated by Khalid, your Bahraini friend</Text>
                </View>

                {/* Timeline */}
                {(() => {
                  const timeCfg = {
                    Morning:   { color: '#F59E0B', icon: 'sunny-outline' },
                    Afternoon: { color: '#0EA5E9', icon: 'partly-sunny-outline' },
                    Evening:   { color: '#8B5CF6', icon: 'moon-outline' },
                  };
                  let lastTime = '';
                  return dayPlan.map((item, index) => {
                    const showSection = item.time !== lastTime;
                    lastTime = item.time;
                    const cfg = timeCfg[item.time] || { color: '#6B7280', icon: 'time-outline' };
                    const isRestaurant = item.type === 'restaurant';
                    const isLast = index === dayPlan.length - 1;

                    return (
                      <View key={index}>
                        {showSection && (
                          <View style={styles.sectionRow}>
                            <View style={[styles.sectionDot, { backgroundColor: cfg.color }]}>
                              <Ionicons name={cfg.icon} size={14} color="#FFF" />
                            </View>
                            <Text style={[styles.sectionLabel, { color: cfg.color }]}>{item.time}</Text>
                            <View style={[styles.sectionLine, { backgroundColor: cfg.color }]} />
                          </View>
                        )}
                        <View style={styles.timelineRow}>
                          {/* Vertical connector */}
                          <View style={styles.timelineLeft}>
                            <View style={[styles.timelineDot, { backgroundColor: isRestaurant ? '#C8102E' : cfg.color }]} />
                            {!isLast && <View style={[styles.timelineBar, { backgroundColor: '#E5E7EB' }]} />}
                          </View>

                          {/* Card */}
                          <View style={styles.tlCard}>
                            <View style={styles.tlCardTop}>
                              <View style={[styles.tlIconWrap, { backgroundColor: isRestaurant ? 'rgba(200,16,46,0.10)' : `${cfg.color}15` }]}>
                                <Ionicons name={isRestaurant ? 'restaurant' : 'location'} size={16} color={isRestaurant ? '#C8102E' : cfg.color} />
                              </View>
                              <View style={styles.tlCardMeta}>
                                <Text style={styles.tlCardName} numberOfLines={1}>{item.spot}</Text>
                                <View style={[styles.tlBadge, { backgroundColor: isRestaurant ? 'rgba(200,16,46,0.08)' : `${cfg.color}12` }]}>
                                  <Ionicons name={isRestaurant ? 'fast-food-outline' : 'compass-outline'} size={10} color={isRestaurant ? '#C8102E' : cfg.color} />
                                  <Text style={[styles.tlBadgeText, { color: isRestaurant ? '#C8102E' : cfg.color }]}>{isRestaurant ? 'Eat' : 'Visit'}</Text>
                                </View>
                              </View>
                            </View>
                            <Text style={styles.tlCardReason}>{item.reason}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  });
                })()}

                {/* Footer */}
                <View style={styles.planFooter}>
                  <View style={styles.footerLine} />
                  <View style={styles.footerBadge}>
                    <Ionicons name="heart" size={12} color="#C8102E" />
                    <Text style={styles.footerText}>Yalla, enjoy Bahrain!</Text>
                  </View>
                  <View style={styles.footerLine} />
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
  resultsContent: { paddingBottom: 30, paddingLeft: 16, paddingRight: 20 },

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
  loadingDot: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  loadingStepText: { fontSize: 14, color: '#374151', fontWeight: '500' },

  // Error
  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16,
    backgroundColor: 'rgba(220,38,38,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)',
  },
  errorText: { flex: 1, fontSize: 14, color: '#DC2626', fontWeight: '500', lineHeight: 20 },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 16, paddingVertical: 14, borderRadius: 14,
    borderWidth: 2, borderColor: '#C8102E',
  },
  retryButtonText: { fontSize: 15, fontWeight: '600', color: '#C8102E' },
  emptyResults: { fontSize: 14, color: '#6B7280', textAlign: 'center', paddingVertical: 24 },

  // Hero summary
  heroCard: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 18,
    paddingHorizontal: 20, marginBottom: 6, marginLeft: 4, marginRight: 0,
    borderWidth: 1, borderColor: 'rgba(209,213,219,0.5)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  heroDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heroDash: { width: 28, height: 2, backgroundColor: '#E5E7EB', marginHorizontal: 4, borderRadius: 1 },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  heroSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  // Section headers (Morning / Afternoon / Evening)
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 4, paddingLeft: 4,
  },
  sectionDot: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  sectionLabel: { fontSize: 14, fontWeight: '800', marginLeft: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionLine: { flex: 1, height: 1.5, marginLeft: 10, borderRadius: 1, opacity: 0.25 },

  // Timeline rows
  timelineRow: { flexDirection: 'row', marginLeft: 4 },
  timelineLeft: { width: 26, alignItems: 'center', paddingTop: 16 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineBar: { flex: 1, width: 2, borderRadius: 1, marginTop: 4 },

  // Cards
  tlCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, marginLeft: 12, marginBottom: 10,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(209,213,219,0.5)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  tlCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tlIconWrap: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  tlCardMeta: { flex: 1 },
  tlCardName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  tlBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  tlBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tlCardReason: { fontSize: 13, color: '#4B5563', lineHeight: 20 },

  // Footer
  planFooter: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingHorizontal: 4,
  },
  footerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB', borderRadius: 1 },
  footerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(200,16,46,0.06)', marginHorizontal: 8,
  },
  footerText: { fontSize: 12, fontWeight: '600', color: '#C8102E' },
});
