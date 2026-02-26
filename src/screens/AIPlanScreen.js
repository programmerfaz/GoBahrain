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
  Modal,
  KeyboardAvoidingView,
  Easing,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import MapView, { Marker, Circle } from 'react-native-maps';
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

const SURPRISE_THEMES = [
  { label: 'Scenic Day', icon: 'heart', color: '#EC4899', prefs: ['Sightseeing', 'Leisure'], food: ['Italian', 'Seafood'] },
  { label: 'Adventure', icon: 'rocket', color: '#EF4444', prefs: ['Adventure', 'Nature'], food: ['Fast Food'] },
  { label: 'Chill Vibes', icon: 'leaf', color: '#10B981', prefs: ['Leisure', 'Nature'], food: ['Cafe'] },
  { label: 'Foodie Tour', icon: 'restaurant', color: '#F97316', prefs: ['Sightseeing'], food: ['South Asian', 'Seafood', 'Asian'] },
  { label: 'Culture Buff', icon: 'color-palette', color: '#6366F1', prefs: ['Cultural', 'Historical'], food: ['Cuisine'] },
  { label: 'Nightlife', icon: 'moon', color: '#7C3AED', prefs: ['Instagram', 'Leisure'], food: ['International'] },
  { label: 'Family Fun', icon: 'people', color: '#0EA5E9', prefs: ['Sightseeing', 'Leisure'], food: ['American', 'Fast Food'] },
  { label: 'Hidden Gems', icon: 'diamond', color: '#D97706', prefs: ['Cultural', 'Nature'], food: ['South Asian', 'Cuisine'] },
];

const DUMMY_PAST_PLANS = [
  { id: 'plan1', title: 'Weekend in Manama', spots: 4, date: '2 days ago' },
  { id: 'plan2', title: 'Beach & Food Day', spots: 5, date: '1 week ago' },
];

// Match Home page AI overlay design
const PLAN_COLORS = {
  primary: '#C8102E',
  overlayQuestionTitle: '#FFFFFF',
  overlayQuestionSub: 'rgba(255,255,255,0.88)',
  overlayBlockBg: 'rgba(255,255,255,0.2)',
  overlayBlockBorder: 'rgba(255,255,255,0.35)',
  overlayBlockText: '#FFFFFF',
};

// Build lightweight preview cards from raw Pinecone matches
function buildSpotPreviews(places, restaurants, events) {
  const previews = [];
  const pushFrom = (items, type) => {
    (items || []).forEach((m, idx) => {
      if (previews.length >= 8) return;
      const meta = m.metadata || {};
      const name =
        meta.business_name ||
        meta.event_name ||
        meta.name ||
        `Spot ${previews.length + 1}`;
      const area = meta.area || meta.location || meta.city || '';
      const description =
        meta.short_description ||
        meta.description ||
        meta.summary ||
        '';
      const cuisine = meta.cuisine || meta.cuisine_type;
      const typeLabel =
        type === 'restaurant'
          ? cuisine
            ? `${cuisine} dining`
            : 'Food & drinks'
          : type === 'event'
          ? meta.event_type || 'Event'
          : meta.category || 'Explore';
      const image =
        meta.image_url ||
        meta.thumbnail_url ||
        meta.cover_image ||
        meta.image ||
        null;

      previews.push({
        id: m.id || `${type}-${idx}`,
        name,
        type,
        typeLabel,
        area,
        snippet: description,
        image,
      });
    });
  };

  pushFrom(places, 'place');
  pushFrom(restaurants, 'restaurant');
  pushFrom(events, 'event');

  return previews;
}

// Fun facts about Bahrain, used while loading
const BAHRAIN_FACTS = [
  'Bahrain was once the heart of the ancient Dilmun civilization, a key trading hub for thousands of years.',
  'Locals love evening walks along the corniche – the skyline and sea breeze are perfect after sunset.',
  'Traditional Bahraini breakfast often includes balaleet (sweet vermicelli) and khubz (Arabic bread).',
  'Manama Souq is one of the best places to feel the old-meets-new soul of Bahrain in a single walk.',
  'Pearling was once Bahrain’s main industry – the Pearling Trail in Muharraq is now a UNESCO site.',
  'Bahrain has a vibrant cafe culture – from hidden specialty coffee spots to seaside shisha lounges.',
];

// Animated loading view with tick-done checks + spot previews
function PlanModalLoadingView({ loadingStatus, showSuccess, spotPreviews }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const stepEntrance = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const stepCheck = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [activePreviewIdx, setActivePreviewIdx] = useState(0);
  const activePreviewOpacity = useRef(new Animated.Value(1)).current;

  const steps = [
    { icon: 'compass-outline', text: 'Matching places to your vibe', key: 'places' },
    { icon: 'restaurant-outline', text: 'Hunting perfect food spots', key: 'food' },
    { icon: 'sparkles-outline', text: 'Khalid is stitching your plan', key: 'plan' },
  ];

  const getCompletedSteps = () => {
    if (showSuccess) return [0, 1, 2];
    const s = (loadingStatus || '').toLowerCase();
    if (s.includes('crafting') || s.includes('building') || s.includes('stitch')) return [0, 1];
    if (s.includes('restaurant') || s.includes('food') || s.includes('breakfast') || s.includes('event')) return [0];
    return [];
  };
  const completedSteps = getCompletedSteps();

  const hasPreviews = !!spotPreviews && spotPreviews.length > 0;
  const fact =
    BAHRAIN_FACTS[Math.floor(Math.random() * BAHRAIN_FACTS.length)];

  useEffect(() => {
    if (showSuccess) return;
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [pulse, showSuccess]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      ...stepEntrance.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 450,
          delay: i * 100,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        })
      ),
    ]).start();
  }, []);

  const animatedChecks = useRef(new Set()).current;
  useEffect(() => {
    completedSteps.forEach((idx) => {
      if (animatedChecks.has(idx)) return;
      animatedChecks.add(idx);
      Animated.spring(stepCheck[idx], {
        toValue: 1,
        tension: 180,
        friction: 7,
        useNativeDriver: true,
      }).start();
    });
  }, [completedSteps.join(',')]);

  useEffect(() => {
    if (showSuccess) {
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          tension: 120,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showSuccess]);

  // Auto-loop through preview spots while loading
  useEffect(() => {
    if (!hasPreviews || showSuccess) return;

    setActivePreviewIdx(0);
    activePreviewOpacity.setValue(1);

    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(activePreviewOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(activePreviewOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();

      setActivePreviewIdx((prev) =>
        spotPreviews.length === 0 ? 0 : (prev + 1) % spotPreviews.length
      );
    }, 2600);

    return () => {
      clearInterval(interval);
      activePreviewOpacity.setValue(1);
    };
  }, [hasPreviews, showSuccess, spotPreviews?.length]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.12],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.8],
  });

  return (
    <Animated.View style={[styles.planModalLoadingWrap, { opacity: fadeIn }]}>
      <View style={styles.planModalLoadingCenter}>
        {!showSuccess && (
          <Animated.View
            style={[
              styles.planModalLoadingPulseOuter,
              {
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
              },
            ]}
          />
        )}
        <View style={[styles.planModalLoadingPulse, showSuccess && styles.planModalLoadingPulseSuccess]}>
          {showSuccess ? (
            <Animated.View style={{ transform: [{ scale: successScale }], opacity: successOpacity }}>
              <Ionicons name="checkmark-circle" size={56} color="#10B981" />
            </Animated.View>
          ) : (
            <ActivityIndicator size="large" color="#FFFFFF" />
          )}
        </View>
      </View>
      <Animated.View style={showSuccess && { opacity: successOpacity }}>
        <Text style={styles.planModalLoadingTitle}>
          {showSuccess ? 'Your plan is ready!' : 'Hang tight, habibi!'}
        </Text>
        <Text style={styles.planModalLoadingSub}>
          {showSuccess ? 'Yalla, let\'s explore Bahrain!' : loadingStatus}
        </Text>
      </Animated.View>
      <View style={styles.planModalLoadingSteps}>
        {steps.map((s, i) => {
          const entrance = stepEntrance[i];
          const check = stepCheck[i];
          const isDone = completedSteps.includes(i);
          return (
            <Animated.View
              key={s.key}
              style={[
                styles.planModalLoadingStepRow,
                {
                  opacity: entrance,
                  transform: [
                    {
                      translateX: entrance.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-24, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={[styles.planModalLoadingDot, isDone && styles.planModalLoadingDotDone]}>
                {isDone ? (
                  <Animated.View
                    style={{
                      transform: [
                        {
                          scale: check.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.5, 1],
                          }),
                        },
                      ],
                    }}
                  >
                    <Ionicons name="checkmark" size={26} color="#FFFFFF" />
                  </Animated.View>
                ) : (
                  <Ionicons name={s.icon} size={18} color="rgba(255,255,255,0.9)" />
                )}
              </View>
              <Text
                style={[
                  styles.planModalLoadingStepText,
                  isDone && styles.planModalLoadingStepTextDone,
                ]}
              >
                {s.text}
              </Text>
            </Animated.View>
          );
        })}
      </View>

      {/* Bahrain teaser while generating */}
      {!showSuccess && (
        <View style={styles.planModalFactWrap}>
          <Ionicons name="information-circle-outline" size={16} color="#FACC15" />
          <Text style={styles.planModalFactText}>{fact}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// Map scanning overlay — improved route tracing + radar sweep during Hang tight
function MapScanningOverlay({ visible }) {
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

export default function AIPlanScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const mapRef = useRef(null);
  const sheetAnim = useRef(new Animated.Value(SNAP_POINTS[INITIAL_SNAP_INDEX])).current;
  const lastSnap = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const currentYRef = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const prefetchRef = useRef({
    prefsKey: null,
    places: null,
    breakfastSpots: null,
    events: null,
  });

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
  const [visiblePinCount, setVisiblePinCount] = useState(0);
  const [revealingPins, setRevealingPins] = useState(false);
  const [surpriseSpinning, setSurpriseSpinning] = useState(false);
  const [surpriseIndex, setSurpriseIndex] = useState(0);
  const [surprisePicked, setSurprisePicked] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planModalStep, setPlanModalStep] = useState(1);
  const [planGenerationSuccess, setPlanGenerationSuccess] = useState(false);
  const [spotPreviews, setSpotPreviews] = useState([]);
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Plan modal animations (match Home AI overlay)
  const planModalBackdrop = useRef(new Animated.Value(0)).current;
  const planModalScale = useRef(new Animated.Value(0.92)).current;
  const planModalOpacity = useRef(new Animated.Value(0)).current;
  const planModalTitleOpacity = useRef(new Animated.Value(0)).current;
  const planModalTitleTranslateY = useRef(new Animated.Value(12)).current;
  const planModalChipsOpacity = useRef(new Animated.Value(0)).current;
  const planModalChipsTranslateY = useRef(new Animated.Value(14)).current;
  const sheetOpacity = useRef(new Animated.Value(1)).current;

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

  const startBackgroundPrefetch = (prefLabels) => {
    const key = (prefLabels || []).join('|');
    if (!key) return;
    const cached = prefetchRef.current;
    if (cached.prefsKey === key && cached.places && cached.breakfastSpots && cached.events) {
      return;
    }
    prefetchRef.current = {
      prefsKey: key,
      places: null,
      breakfastSpots: null,
      events: null,
    };
    (async () => {
      try {
        const [places, breakfastSpots, events] = await Promise.all([
          fetchPlaces(prefLabels),
          fetchBreakfastSpots(),
          fetchEvents(prefLabels),
        ]);
        prefetchRef.current = {
          prefsKey: key,
          places,
          breakfastSpots,
          events,
        };
      } catch {
        // best-effort prefetch; ignore errors
      }
    })();
  };

  const handleSurpriseMe = () => {
    if (surpriseSpinning) return;
    setSurpriseSpinning(true);
    setSurprisePicked(null);

    let tick = 0;
    const totalTicks = 20;
    const finalIdx = Math.floor(Math.random() * SURPRISE_THEMES.length);

    const interval = setInterval(() => {
      tick += 1;
      setSurpriseIndex(tick % SURPRISE_THEMES.length);
      if (tick >= totalTicks) {
        clearInterval(interval);
        setSurpriseIndex(finalIdx);
        setSurprisePicked(SURPRISE_THEMES[finalIdx]);
        setSurpriseSpinning(false);

        // Auto-generate after a short reveal pause
        setTimeout(() => {
          const theme = SURPRISE_THEMES[finalIdx];
          const prefLabels = theme.prefs;
          const foodLabels = theme.food;

          setDayPlan(null);
          setPineconeMatches([]);
          setSelectedMarker(null);
          setError(null);
          setLoading(true);
          setLoadingStatus(`Finding places and restaurants for your ${theme.label.toLowerCase()} day…`);
          setDrawerStep(3);

          (async () => {
            let generatedPlan = null;
            try {
              const [
                places,
                restaurants,
                breakfastSpots,
                events,
              ] = await Promise.all([
                fetchPlaces(prefLabels),
                fetchRestaurants(foodLabels),
                fetchBreakfastSpots(),
                fetchEvents(prefLabels),
              ]);

              console.log(`[Surprise ${theme.label}] ${places.length}P ${restaurants.length}R ${breakfastSpots.length}B ${events.length}E`);

              // Build previews so the user sees some of the spots being considered
              const preview = buildSpotPreviews(places, restaurants, events);
              setSpotPreviews(preview);

              setLoadingStatus(`Khalid is building your ${theme.label} day…`);
              const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels);
              generatedPlan = plan;
              setDayPlan(plan);
              setError(null);

              const validMarkers = buildMapMarkers(plan).filter(m => m.lat && m.lng);
              const coords = validMarkers.map(m => ({ latitude: m.lat, longitude: m.lng }));
              if (coords.length > 0 && mapRef.current) {
                mapRef.current.fitToCoordinates(coords, {
                  edgePadding: { top: 80, right: 60, bottom: SCREEN_HEIGHT * 0.35, left: 60 },
                  animated: true,
                });
              }
            } catch (err) {
              setError(err.message || 'Something went wrong');
              setDayPlan(null);
            } finally {
              setLoading(false);
              setLoadingStatus('');
              if (generatedPlan && generatedPlan.length > 0) {
                setRevealingPins(true);
                setVisiblePinCount(0);
                sheetOpacity.setValue(0);
              } else {
                sheetOpacity.setValue(1);
                lastSnap.current = SNAP_POINTS[0];
                Animated.spring(sheetAnim, {
                  toValue: SNAP_POINTS[0],
                  useNativeDriver: true,
                  tension: 80,
                  friction: 12,
                }).start();
              }
            }
          })();
        }, 1200);
      }
    }, 80 + tick * 8);
  };

  const startSetup = () => {
    setPlanGenerationSuccess(false);
    setRevealingPins(false);
    setVisiblePinCount(0);
    sheetOpacity.setValue(1);
    setSelectedPreferences([]);
    setSelectedFoodCategories([]);
    setDayPlan(null);
    setPineconeMatches([]);
    setSelectedMarker(null);
    setError(null);
    setSpotPreviews([]);
    setPlanModalStep(1);
    setShowPlanModal(true);
  };

  useEffect(() => {
    const openPlanModal = route.params?.openPlanModal;
    if (openPlanModal) {
      startSetup();
    }
  }, [route.params?.openPlanModal]);

  const closePlanModal = (then) => {
    Animated.parallel([
      Animated.timing(planModalBackdrop, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(planModalScale, {
        toValue: 0.95,
        duration: 300,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(planModalOpacity, {
        toValue: 0,
        duration: 250,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowPlanModal(false);
      setPlanGenerationSuccess(false);
      then?.();
    });
  };

  const openPlanModalAnim = () => {
    planModalTitleOpacity.setValue(0);
    planModalTitleTranslateY.setValue(14);
    planModalChipsOpacity.setValue(0);
    planModalChipsTranslateY.setValue(16);
    Animated.parallel([
      Animated.timing(planModalBackdrop, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(planModalScale, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(planModalOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleGenerate = async (onComplete) => {
    const prefLabels = selectedPreferences
      .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
      .filter(Boolean);
    const foodLabels = selectedFoodCategories
      .map((id) => FOOD_CATEGORIES.find((f) => f.id === id)?.label)
      .filter(Boolean);

    setLoading(true);
    setPlanGenerationSuccess(false);
    setLoadingStatus('Finding places and restaurants based on your preferences…');
    setError(null);
    setDayPlan(null);
    setPineconeMatches([]);
    setSelectedMarker(null);
    setDrawerStep(3);

    let generatedPlan = null;
    try {
      const prefsKey = prefLabels.join('|');
      const cached = prefetchRef.current;

      let places;
      let breakfastSpots;
      let events;
      let restaurants;

      const hasCached =
        cached.prefsKey === prefsKey &&
        cached.places &&
        cached.breakfastSpots &&
        cached.events;

      if (hasCached) {
        places = cached.places;
        breakfastSpots = cached.breakfastSpots;
        events = cached.events;
        [restaurants] = await Promise.all([
          fetchRestaurants(foodLabels),
        ]);
      } else {
        const [
          placesResult,
          restaurantsResult,
          breakfastResult,
          eventsResult,
        ] = await Promise.all([
          fetchPlaces(prefLabels),
          fetchRestaurants(foodLabels),
          fetchBreakfastSpots(),
          fetchEvents(prefLabels),
        ]);
        places = placesResult;
        restaurants = restaurantsResult;
        breakfastSpots = breakfastResult;
        events = eventsResult;
      }

      const allMatches = [...places, ...restaurants, ...breakfastSpots, ...events];
      setPineconeMatches(allMatches);

      // Build previews so the user sees some of the spots being considered
      const preview = buildSpotPreviews(places, restaurants, events);
      setSpotPreviews(preview);

      console.log(`Pinecone: ${places.length} places, ${restaurants.length} restaurants, ${breakfastSpots.length} breakfast, ${events.length} events`);

      // Pipeline Step 5 — GPT builds a smart day plan from all results
      setLoadingStatus('Khalid is crafting your perfect day…');
      const plan = await generateDayPlan(places, restaurants, breakfastSpots, events, prefLabels, foodLabels);
      generatedPlan = plan;
      setDayPlan(plan);
      setError(null);

      // Debug markers
      const markers = buildMapMarkers(plan || []);
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

    } catch (err) {
      setError(err.message || 'Something went wrong');
      setDayPlan(null);
    } finally {
      setLoading(false);
      setLoadingStatus('');
      const succeeded = generatedPlan != null && generatedPlan.length > 0;
      if (succeeded) {
        setPlanGenerationSuccess(true);
        setTimeout(() => {
          onComplete?.();
          setRevealingPins(true);
          setVisiblePinCount(0);
          sheetOpacity.setValue(0);
        }, 1400);
      } else {
        sheetOpacity.setValue(1);
        lastSnap.current = SNAP_POINTS[0];
        Animated.spring(sheetAnim, {
          toValue: SNAP_POINTS[0],
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
        onComplete?.();
      }
    }
  };

  useEffect(() => {
    const id = sheetAnim.addListener(({ value }) => { currentYRef.current = value; });
    return () => sheetAnim.removeListener(id);
  }, [sheetAnim]);

  useEffect(() => {
    if (showPlanModal) openPlanModalAnim();
  }, [showPlanModal]);

  // Question page animations: step transition
  useEffect(() => {
    if (!showPlanModal || loading || planGenerationSuccess) return;
    planModalTitleOpacity.setValue(0);
    planModalTitleTranslateY.setValue(14);
    planModalChipsOpacity.setValue(0);
    planModalChipsTranslateY.setValue(16);
    Animated.stagger(60, [
      Animated.parallel([
        Animated.timing(planModalTitleOpacity, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(planModalTitleTranslateY, {
          toValue: 0,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(planModalChipsOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(planModalChipsTranslateY, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [planModalStep, showPlanModal]);

  // Pin reveal: show pins one by one, pan camera to each, then open sheet with fade
  useEffect(() => {
    if (!revealingPins || !dayPlan) return;
    const markers = buildMapMarkers(dayPlan);
    if (markers.length === 0) {
      setRevealingPins(false);
      sheetOpacity.setValue(1);
      lastSnap.current = SNAP_POINTS[0];
      Animated.spring(sheetAnim, {
        toValue: SNAP_POINTS[0],
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      return;
    }
    // Initial pan to first place
    const first = markers[0];
    if (first && mapRef.current) {
      mapRef.current.animateToRegion(
        clampRegionToBahrain({
          latitude: first.lat,
          longitude: first.lng,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        }),
        800
      );
    }
    const interval = setInterval(() => {
      setVisiblePinCount((prev) => {
        if (prev >= markers.length) {
          clearInterval(interval);
          setTimeout(() => {
            setRevealingPins(false);
            lastSnap.current = SNAP_POINTS[0];
            Animated.parallel([
              Animated.timing(sheetOpacity, {
                toValue: 1,
                duration: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.spring(sheetAnim, {
                toValue: SNAP_POINTS[0],
                useNativeDriver: true,
                tension: 80,
                friction: 12,
              }),
            ]).start();
          }, 0);
          return prev;
        }
        // Pan camera to the pin we're about to reveal
        const mk = markers[prev];
        if (mk && mapRef.current) {
          mapRef.current.animateToRegion(
            clampRegionToBahrain({
              latitude: mk.lat,
              longitude: mk.lng,
              latitudeDelta: 0.025,
              longitudeDelta: 0.025,
            }),
            700
          );
        }
        return prev + 1;
      });
    }, 750);
    return () => clearInterval(interval);
  }, [revealingPins, dayPlan]);

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
        {/* Markers — reveal one by one when plan is generated */}
        {dayPlan && (() => {
          const markers = buildMapMarkers(dayPlan);
          const maxVisible = revealingPins ? visiblePinCount : markers.length;
          return markers.filter((mk) => mk.idx < maxVisible).map((mk) => {
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
                <View style={styles.mapPinWrap}>
                  <View style={styles.mapPinRow}>
                    <View style={[styles.mapPin, { backgroundColor: accent }]}>
                      <Ionicons name={pinIcon} size={14} color="#FFF" />
                      <Text style={styles.mapPinNum}>{mk.idx + 1}</Text>
                    </View>
                    <View style={[styles.mapPinLabel, { borderColor: accent }]}>
                      <Text style={[styles.mapPinLabelText, { color: accent }]} numberOfLines={1}>
                        {mk.spot}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.mapPinArrow, { borderTopColor: accent }]} />
                </View>
              </Marker>
              </React.Fragment>
            );
          });
        })()}
      </MapView>

      {/* Scanning overlay during Hang tight */}
      <MapScanningOverlay visible={showPlanModal && loading && !planGenerationSuccess} />

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
          <View style={[styles.spotDetailWrap, { top: insets.top + 70 }]}>
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
          {
            paddingBottom: 80 + getAppTabBarHeight(insets),
            opacity: sheetOpacity,
            transform: [{ translateY: sheetAnim }],
          },
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
                <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                <Text style={styles.startAiButtonText}>Start AI trip setup</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pastPlansScroll} contentContainerStyle={styles.pastPlansContent} showsVerticalScrollIndicator={false}>
              {/* Surprise Me Section */}
              <View style={styles.surpriseCard}>
                <View style={styles.surpriseHeader}>
                  <Ionicons name="dice-outline" size={20} color="#C8102E" />
                  <Text style={styles.surpriseTitle}>Feeling Lucky?</Text>
                </View>
                <Text style={styles.surpriseDesc}>
                  Let Khalid pick a random theme and plan your entire day — no choices needed!
                </Text>

                {/* Roulette display */}
                <View style={styles.rouletteWrap}>
                  <View style={[styles.rouletteBox, { borderColor: (surprisePicked || SURPRISE_THEMES[surpriseIndex]).color }]}>
                    <Ionicons
                      name={(surprisePicked || SURPRISE_THEMES[surpriseIndex]).icon}
                      size={28}
                      color={(surprisePicked || SURPRISE_THEMES[surpriseIndex]).color}
                    />
                    <Text style={[styles.rouletteLabel, { color: (surprisePicked || SURPRISE_THEMES[surpriseIndex]).color }]}>
                      {(surprisePicked || SURPRISE_THEMES[surpriseIndex]).label}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.surpriseBtn, surpriseSpinning && { opacity: 0.6 }]}
                  activeOpacity={0.8}
                  onPress={handleSurpriseMe}
                  disabled={surpriseSpinning}
                >
                  <Ionicons name={surpriseSpinning ? 'sync' : 'sparkles'} size={18} color="#FFF" />
                  <Text style={styles.surpriseBtnText}>
                    {surpriseSpinning ? 'Spinning…' : surprisePicked ? `Go with ${surprisePicked.label}!` : 'Surprise Me!'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={styles.surpriseDivider}>
                <View style={styles.surpriseDividerLine} />
                <Text style={styles.surpriseDividerText}>or check your past plans</Text>
                <View style={styles.surpriseDividerLine} />
              </View>

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

        {/* Step 3 — Day plan results (steps 1–2 now in modal) */}
        {drawerStep === 3 && (
          <>
            {/* Header — no plan/preparation text when loading */}
            <View style={styles.drawerPageHeader}>
              <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => { setDrawerStep(0); setDayPlan(null); setError(null); }}>
                <Ionicons name="chevron-back" size={22} color="#374151" />
              </TouchableOpacity>
              {!loading && (
                <View style={styles.drawerPageTitleWrap}>
                  <Text style={styles.drawerPageTitle}>Your Day in Bahrain</Text>
                </View>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingWrap} />
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
                      <Ionicons name="airplane" size={22} color="#C8102E" />
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.bpLabel}>ITINERARY</Text>
                      <Text style={styles.bpValue}>Full Day</Text>
                    </View>
                  </View>
                  <View style={styles.bpDashedLine} />
                  <View style={styles.bpBottom}>
                    <View style={styles.bpBudgetWrap}>
                      <View style={styles.bpBudgetRow}>
                        <Ionicons name="wallet-outline" size={16} color="#C8102E" />
                        <Text style={styles.bpBudgetTitle}>Estimated Budget</Text>
                      </View>
                      <Text style={styles.bpBudgetAmount}>
                        {(() => {
                          const meals = dayPlan.filter(i => i.type === 'restaurant').length;
                          const places = dayPlan.filter(i => i.type !== 'restaurant').length;
                          const low = meals * 3 + places * 2;
                          const high = meals * 15 + places * 8;
                          return `${low} – ${high} BHD`;
                        })()}
                      </Text>
                      <Text style={styles.bpBudgetSub}>for {dayPlan.length} stops · {dayPlan.filter(i => i.type === 'restaurant').length} meals</Text>
                    </View>
                  </View>
                  <View style={styles.bpAdviceWrap}>
                    <Ionicons name="bulb-outline" size={15} color="#D97706" />
                    <Text style={styles.bpAdviceText}>
                      {(() => {
                        const tips = [
                          'Carry cash for local souqs — many small vendors don\'t accept cards!',
                          'Stay hydrated! Bahrain heat is no joke, keep a water bottle handy.',
                          'Wear comfortable shoes — you\'ll be walking through history today!',
                          'Try bargaining at the souq, it\'s part of the experience!',
                          'Sunset by the coast is magical here — don\'t miss the evening walk.',
                          'Download offline maps just in case — some areas have patchy signal.',
                          'Tipping 10% is appreciated at restaurants in Bahrain.',
                        ];
                        return tips[Math.floor(Math.random() * tips.length)];
                      })()}
                    </Text>
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

      {/* Plan modal — Home AI design (blur overlay, question block, glass options) */}
      <Modal visible={showPlanModal} transparent animationType="none">
        <KeyboardAvoidingView
          style={styles.planModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.planModalBackdropWrap, { opacity: planModalBackdrop }]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.planModalBackdropDim} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => closePlanModal()}
              disabled={loading || planGenerationSuccess}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.planModalContentWrap,
              {
                opacity: planModalOpacity,
                transform: [{ scale: planModalScale }],
              },
            ]}
          >
            {/* Loading state — animated, smooth */}
            {loading || planGenerationSuccess ? (
              <PlanModalLoadingView
                loadingStatus={loadingStatus}
                showSuccess={planGenerationSuccess}
                spotPreviews={spotPreviews}
              />
            ) : (
              <>
                {/* Question block */}
                <Animated.View
                  style={[
                    styles.planModalQuestionBlock,
                    {
                      opacity: planModalTitleOpacity,
                      transform: [{ translateY: planModalTitleTranslateY }],
                    },
                  ]}
                >
                  <View style={styles.planModalQuestionInner}>
                    <Text style={styles.planModalQuestionTitle}>
                      {planModalStep === 1 ? 'What kind of experiences do you prefer?' : 'What do you prefer to eat?'}
                    </Text>
                    <View style={styles.planModalQuestionAccent} />
                    <Text style={styles.planModalQuestionSub}>
                      {planModalStep === 1 ? 'Tap a few that describe your Bahrain trip' : 'Pick your food vibes for this trip'}
                    </Text>
                  </View>
                </Animated.View>

                {/* Glass-style options */}
                <Animated.View
                  style={[
                    styles.planModalOptionsWrap,
                    {
                      opacity: planModalChipsOpacity,
                      transform: [{ translateY: planModalChipsTranslateY }],
                    },
                  ]}
                >
                  <ScrollView
                style={styles.planModalScroll}
                contentContainerStyle={styles.planModalScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.planModalOptionsGrid}>
                  {(() => {
                    const items = planModalStep === 1 ? PREFERENCES : FOOD_CATEGORIES;
                    const isSelected = (item) =>
                      planModalStep === 1
                        ? selectedPreferences.includes(item.id)
                        : selectedFoodCategories.includes(item.id);
                    const onPress = (item) =>
                      planModalStep === 1 ? togglePreference(item.id) : toggleFoodCategory(item.id);
                    const rows = [];
                    for (let i = 0; i < items.length; i += 2) {
                      rows.push(items.slice(i, i + 2));
                    }
                    return rows.map((row, rowIdx) => (
                      <View key={rowIdx} style={styles.planModalOptionsRow}>
                        {row.map((item) => {
                          const sel = isSelected(item);
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.planModalOptionBlock,
                                sel && styles.planModalOptionBlockSelected,
                                sel && { borderColor: item.color, backgroundColor: item.color, borderWidth: 2 },
                              ]}
                              activeOpacity={0.8}
                              onPress={() => onPress(item)}
                            >
                              <Ionicons name={item.icon} size={22} color="#FFFFFF" />
                              <Text style={[styles.planModalOptionText, sel && styles.planModalOptionTextSelected]}>
                                {item.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {row.length === 1 && <View style={styles.planModalOptionSpacer} />}
                      </View>
                    ));
                  })()}
                </View>
              </ScrollView>

              {/* Action row */}
              <View style={styles.planModalActionRow}>
                {planModalStep === 1 ? (
                  <>
                    <TouchableOpacity
                      style={styles.planModalBackBtn}
                      activeOpacity={0.8}
                      onPress={() => closePlanModal()}
                    >
                      <Ionicons name="close" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.planModalContinueBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        const prefLabels = selectedPreferences
                          .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
                          .filter(Boolean);
                        startBackgroundPrefetch(prefLabels);
                        setPlanModalStep(2);
                      }}
                    >
                      <Text style={styles.planModalContinueBtnText}>Continue</Text>
                      <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.planModalBackBtn}
                      activeOpacity={0.8}
                      onPress={() => setPlanModalStep(1)}
                    >
                      <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.planModalGenerateBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        handleGenerate(() => closePlanModal());
                      }}
                    >
                      <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                      <Text style={styles.planModalGenerateBtnText}>Generate</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Animated.View>
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const TILE_WIDTH = (SCREEN_WIDTH - 48 - 24) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: SHEET_HEIGHT,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 16,
    overflow: 'hidden',
  },
  grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24 },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  grabberHint: { marginTop: 8, fontSize: 12, color: '#94A3B8', fontWeight: '500' },

  // Past plans (step 0)
  pastPlansHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 20,
  },
  pastPlansTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6 },
  pastPlansSubtitle: { fontSize: 15, color: '#64748B', marginTop: 4, fontWeight: '500' },
  startAiButton: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 14, backgroundColor: '#C8102E', gap: 8,
    ...Platform.select({ ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  startAiButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  pastPlansScroll: { flex: 1 },
  pastPlansContent: { paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
  pastPlanCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, borderWidth: 0,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  pastPlanIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  pastPlanInfo: { flex: 1 },
  pastPlanTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pastPlanName: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  savedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(16,185,129,0.12)' },
  savedBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  pastPlanMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pastPlanMeta: { fontSize: 14, color: '#64748B', fontWeight: '500' },

  // Surprise Me
  surpriseCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, marginBottom: 16,
    borderWidth: 0,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  surpriseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  surpriseTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  surpriseDesc: { fontSize: 15, color: '#64748B', lineHeight: 22, marginBottom: 20 },
  rouletteWrap: { alignItems: 'center', marginBottom: 20 },
  rouletteBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 18, paddingHorizontal: 32,
    borderRadius: 18, borderWidth: 2, backgroundColor: '#F8FAFC',
    minWidth: 200, justifyContent: 'center',
  },
  rouletteLabel: { fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  surpriseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#C8102E', borderRadius: 16, paddingVertical: 16,
    ...Platform.select({ ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 }, android: { elevation: 6 } }),
  },
  surpriseBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  surpriseDivider: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 4,
  },
  surpriseDividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  surpriseDividerText: { fontSize: 13, color: '#94A3B8', marginHorizontal: 14, fontWeight: '500' },

  // Drawer page header
  drawerPageHeader: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 24, marginBottom: 16, gap: 8,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4, borderRadius: 12, backgroundColor: '#F1F5F9' },
  drawerPageTitleWrap: { flex: 1 },
  drawerPageTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 },
  drawerPageTitleSingle: { fontSize: 20, fontWeight: '800', color: '#0F172A', flex: 1 },
  drawerPageSubtitle: { fontSize: 15, color: '#64748B', lineHeight: 21, fontWeight: '500' },

  // Grid tiles for preferences + food
  gridScroll: { flex: 1 },
  gridContent: { paddingHorizontal: 24, paddingBottom: 48 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  gridTile: {
    width: TILE_WIDTH, aspectRatio: 1, borderRadius: 18, borderWidth: 2,
    borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  gridTileIcon: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  gridTileLabel: { fontSize: 13, fontWeight: '600', color: '#334155', textAlign: 'center' },

  fixedButtonWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
  },

  continueButton: {
    backgroundColor: '#C8102E', paddingVertical: 18, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 20,
    ...Platform.select({ ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 }, android: { elevation: 4 } }),
  },
  continueButtonDisabled: { backgroundColor: '#E2E8F0' },
  continueButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Generate button (food)
  generateButton: {
    flexDirection: 'row', backgroundColor: '#C8102E', paddingVertical: 18, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 20, gap: 10,
    ...Platform.select({ ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 }, android: { elevation: 4 } }),
  },
  generateButtonDisabled: { opacity: 0.8 },
  generateButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // ── Results (step 3) ────────────────────────────────────────────
  resultsScroll: { flex: 1 },
  resultsContent: { paddingBottom: 48, paddingHorizontal: 24 },

  // Loading (sheet fallback)
  loadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 56,
  },
  loadingPulse: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(200,16,46,0.06)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
    borderWidth: 2, borderColor: 'rgba(200,16,46,0.15)',
  },
  loadingTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 8, letterSpacing: -0.4 },
  loadingSubtext: { fontSize: 16, color: '#475569', textAlign: 'center', marginBottom: 36, fontWeight: '600' },
  loadingSteps: { gap: 18, width: '100%', paddingHorizontal: 12 },
  loadingStepRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  loadingDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  loadingStepText: { fontSize: 16, color: '#334155', fontWeight: '600' },

  // Error
  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20,
    backgroundColor: 'rgba(220,38,38,0.06)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)',
  },
  errorText: { flex: 1, fontSize: 15, color: '#DC2626', fontWeight: '600', lineHeight: 22 },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, paddingVertical: 16, borderRadius: 16, borderWidth: 2, borderColor: '#C8102E', backgroundColor: 'rgba(200,16,46,0.04)',
  },
  retryButtonText: { fontSize: 16, fontWeight: '700', color: '#C8102E' },
  emptyResults: { fontSize: 15, color: '#64748B', textAlign: 'center', paddingVertical: 32, fontWeight: '500' },

  // ── Boarding pass hero ──
  boardingPass: {
    backgroundColor: '#FFFFFF', borderRadius: 24, marginBottom: 28, overflow: 'hidden',
    borderWidth: 0,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8,
  },
  bpTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 28, paddingTop: 26, paddingBottom: 22,
  },
  bpLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1.6 },
  bpValue: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginTop: 6, letterSpacing: -0.5 },
  bpDivider: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(200,16,46,0.15)',
    backgroundColor: 'rgba(200,16,46,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  bpDashedLine: {
    height: 1, marginHorizontal: 24,
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 1,
  },
  bpBottom: {
    paddingHorizontal: 28, paddingVertical: 22,
  },
  bpBudgetWrap: { alignItems: 'center' },
  bpBudgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  bpBudgetTitle: { fontSize: 12, fontWeight: '800', color: '#475569', letterSpacing: 1.2, textTransform: 'uppercase' },
  bpBudgetAmount: { fontSize: 30, fontWeight: '900', color: '#C8102E', letterSpacing: 0.5 },
  bpBudgetSub: { fontSize: 14, color: '#64748B', marginTop: 6, fontWeight: '600' },
  bpAdviceWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FDE68A',
    paddingHorizontal: 26, paddingVertical: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  bpAdviceText: { fontSize: 15, color: '#92400E', lineHeight: 22, flex: 1, fontStyle: 'italic', fontWeight: '600' },

  // ── Itinerary section ──
  itinSection: { marginBottom: 16 },

  secBanner: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingVertical: 16,
    paddingHorizontal: 20, marginBottom: 16,
  },
  secIconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  secBannerText: { flex: 1, marginLeft: 16 },
  secBannerTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  secBannerSub: { fontSize: 14, fontWeight: '600', opacity: 0.85, marginTop: 2 },
  secBannerCount: { fontSize: 14, fontWeight: '700' },

  // ── Destination row (number + card) ──
  destRow: { flexDirection: 'row', paddingLeft: 6 },

  destLeft: { width: 40, alignItems: 'center', paddingTop: 18 },
  destNumCircle: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  destNum: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  destConnector: { flex: 1, width: 2, borderRadius: 1, marginTop: 8 },

  // Card
  destCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 22, marginLeft: 16, marginBottom: 16,
    overflow: 'hidden', borderWidth: 0,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6,
  },
  destStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  destStripText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  destBody: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  destIconBox: {
    width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  destName: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0F172A', lineHeight: 24 },
  destReasonWrap: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 18, marginTop: 8,
    backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, gap: 12,
  },
  destReasonQuote: { marginTop: 2 },
  destReasonText: { flex: 1, fontSize: 15, color: '#78350F', lineHeight: 22, fontStyle: 'italic', fontWeight: '600' },

  // ── Passport stamp footer ──
  stampFooter: { alignItems: 'center', marginTop: 28, paddingBottom: 12 },
  stampCircle: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: '#C8102E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderStyle: 'dashed',
  },
  stampTop: { fontSize: 10, fontWeight: '800', color: '#C8102E', letterSpacing: 2 },
  stampBottom: { fontSize: 9, fontWeight: '700', color: '#C8102E', letterSpacing: 1.5, marginTop: 2 },
  stampTagline: { fontSize: 16, fontWeight: '600', color: '#475569', fontStyle: 'italic' },

  // ── Map pins ──
  mapPinWrap: {
    alignItems: 'center',
  },
  mapPinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapPin: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
  },
  mapPinNum: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  mapPinLabel: {
    maxWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  mapPinLabelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mapPinArrow: {
    alignSelf: 'center', width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // ── Map scanning overlay (Hang tight) — route tracing + radar ──
  mapScanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  mapScanningRadarCenter: {
    position: 'absolute',
    left: SCREEN_WIDTH / 2 - 100,
    top: SCREEN_HEIGHT / 2 - 100,
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapScanningRadarRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(200,16,46,0.6)',
    backgroundColor: 'rgba(200,16,46,0.06)',
  },
  mapScanningLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(200,16,46,0.55)',
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 6,
  },
  mapRoutePath: {
    ...StyleSheet.absoluteFillObject,
  },
  mapRouteSegWrap: {
    position: 'absolute',
    left: 30,
    top: 70,
    width: SCREEN_WIDTH - 90,
    height: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap2: {
    position: 'absolute',
    right: 50,
    top: 70,
    width: 4,
    height: 130,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap3: {
    position: 'absolute',
    left: 40,
    top: 195,
    width: SCREEN_WIDTH - 90,
    height: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap4: {
    position: 'absolute',
    left: 40,
    top: 195,
    width: 4,
    height: 130,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSegWrap5: {
    position: 'absolute',
    left: 30,
    top: 320,
    width: SCREEN_WIDTH - 80,
    height: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(200,16,46,0.15)',
    borderRadius: 2,
  },
  mapRouteSeg: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(200,16,46,0.7)',
  },
  mapRouteSeg1: { width: SCREEN_WIDTH - 90, height: 4, borderRadius: 2 },
  mapRouteSeg2: { width: 4, height: 130, borderRadius: 2 },
  mapRouteSeg3: { width: SCREEN_WIDTH - 90, height: 4, borderRadius: 2 },
  mapRouteSeg4: { width: 4, height: 130, borderRadius: 2 },
  mapRouteSeg5: { width: SCREEN_WIDTH - 80, height: 4, borderRadius: 2 },
  mapRouteDotGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(200,16,46,0.35)',
  },
  mapRouteDot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#C8102E',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 10,
  },

  // ── Spot detail card ──
  spotDetailWrap: {
    position: 'absolute', left: 20, right: 20, zIndex: 100,
  },
  spotDetailCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 16,
  },
  spotDetailAccent: { height: 5 },
  spotDetailBody: { padding: 20 },
  spotDetailRow1: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  spotDetailStep: {
    width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14, marginTop: 2,
  },
  spotDetailStepText: { fontSize: 15, fontWeight: '900', color: '#FFF' },
  spotDetailNameWrap: { flex: 1, marginRight: 10 },
  spotDetailName: { fontSize: 18, fontWeight: '800', color: '#0F172A', lineHeight: 24, marginBottom: 8 },
  spotDetailTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spotDetailTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  spotDetailTagText: { fontSize: 12, fontWeight: '700' },
  spotDetailDot: { fontSize: 14, color: '#E2E8F0' },
  spotDetailTime: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  spotDetailReason: { fontSize: 15, color: '#475569', lineHeight: 22, marginBottom: 16 },
  spotDetailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 16,
  },
  spotDetailBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // ── Plan modal (Home AI design) ──
  planModalRoot: { flex: 1, backgroundColor: 'transparent' },
  planModalBackdropWrap: { ...StyleSheet.absoluteFillObject },
  planModalBackdropDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
  planModalContentWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
    alignItems: 'stretch',
  },
  planModalQuestionBlock: {
    marginBottom: 28,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  planModalQuestionInner: { alignItems: 'center', maxWidth: 320 },
  planModalQuestionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PLAN_COLORS.overlayQuestionTitle,
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: 0.5,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.25)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  planModalQuestionAccent: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: PLAN_COLORS.primary,
    opacity: 0.95,
    marginBottom: 16,
  },
  planModalQuestionSub: {
    fontSize: 15,
    fontWeight: '500',
    color: PLAN_COLORS.overlayQuestionSub,
    textAlign: 'center',
    letterSpacing: 0.4,
    lineHeight: 22,
  },
  planModalLoadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  planModalLoadingCenter: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  planModalLoadingPulseOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
  },
  planModalLoadingPulse: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  planModalLoadingTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.4,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
      },
    }),
  },
  planModalLoadingSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    marginBottom: 36,
    fontWeight: '600',
    lineHeight: 22,
  },
  planModalLoadingSteps: { gap: 18, width: '100%', paddingHorizontal: 12 },
  planModalLoadingStepRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  planModalLoadingDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  planModalLoadingDotActive: {
    backgroundColor: 'rgba(200,16,46,0.5)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
  },
  planModalLoadingDotDone: {
    backgroundColor: '#10B981',
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 2,
  },
  planModalLoadingStepText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  planModalLoadingStepTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  planModalLoadingStepTextDone: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  planModalFactWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  planModalFactText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    fontWeight: '500',
  },
  planModalPreviewSection: {
    marginTop: 16,
  },
  planModalPreviewCarousel: {
    paddingHorizontal: 16,
  },
  planModalPreviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.96)',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  planModalPreviewScroll: {
    paddingLeft: 16,
    paddingRight: 4,
  },
  planModalPreviewCard: {
    width: 220,
    borderRadius: 18,
    marginRight: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  planModalPreviewImage: {
    width: '100%',
    height: 96,
  },
  planModalPreviewBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  planModalPreviewTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  planModalPreviewTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  planModalPreviewTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  planModalPreviewArea: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.9)',
    fontWeight: '500',
  },
  planModalPreviewName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  planModalPreviewSnippet: {
    fontSize: 13,
    color: '#1F2937',
    lineHeight: 18,
  },
  planModalPreviewPager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  planModalPreviewDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  planModalPreviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
  planModalPreviewDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F172A',
  },
  planModalPreviewCounter: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.65)',
    fontWeight: '600',
  },
  planModalLoadingPulseSuccess: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderColor: 'rgba(16,185,129,0.5)',
  },
  planModalOptionsWrap: { flex: 1, width: '100%', maxWidth: 400, alignSelf: 'center' },
  planModalScroll: { flex: 1 },
  planModalScrollContent: { paddingBottom: 20 },
  planModalOptionsGrid: {
    width: '100%',
  },
  planModalOptionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  planModalOptionSpacer: {
    flex: 1,
  },
  planModalOptionBlock: {
    flex: 1,
    minHeight: 56,
    backgroundColor: PLAN_COLORS.overlayBlockBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PLAN_COLORS.overlayBlockBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  planModalOptionBlockSelected: {
    borderWidth: 2,
  },
  planModalOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: PLAN_COLORS.overlayBlockText,
  },
  planModalOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
  },
  planModalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  planModalBackBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planModalContinueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: PLAN_COLORS.primary,
  },
  planModalContinueBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  planModalGenerateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: PLAN_COLORS.primary,
    ...Platform.select({
      ios: { shadowColor: PLAN_COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  planModalGenerateBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
