import React, { useRef, useEffect, useState } from 'react';
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
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Callout, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import ProfileButton from '../components/ProfileButton';
import { useRoute, useNavigation } from '@react-navigation/native';
import { requestPlanFromN8n } from '../services/n8nApi';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const APP_TAB_BAR_HEIGHT_IOS = 70;
const getAppTabBarHeight = (insets) =>
  Platform.OS === 'ios' ? APP_TAB_BAR_HEIGHT_IOS : 60 + (insets?.bottom ?? 0);

// Bottom sheet configuration
const SHEET_VISIBLE_PEEK = 0.28;
const SHEET_VISIBLE_MID = 0.75; // question flow opens with ~75% of the screen visible
const SHEET_VISIBLE_EXPANDED = 0.9;
const SHEET_VISIBLE_HALF = 0.5; // Past plans sheet covers at most half the screen

// Height of sheet when fully expanded
const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_VISIBLE_EXPANDED;
const SHEET_TOP_EXPANDED = SCREEN_HEIGHT - SHEET_HEIGHT; // distance from top when expanded
const SHEET_TOP_MID = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_MID);
const SHEET_TOP_PEEK = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_PEEK);
const SHEET_TOP_HALF = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_HALF);

// Snap points are translateY values relative to expanded position
const SNAP_POINTS = [
  0, // expanded
  SHEET_TOP_MID - SHEET_TOP_EXPANDED,  // mid
  SHEET_TOP_PEEK - SHEET_TOP_EXPANDED, // peek
];
// When showing Past plans only: max half screen (no full expanded)
const SNAP_POINT_HALF = SHEET_TOP_HALF - SHEET_TOP_EXPANDED;
const SNAP_POINTS_PAST_PLANS = [SNAP_POINT_HALF, SNAP_POINTS[2]];
const INITIAL_SNAP_INDEX = 2; // start at peek

const BAHRAIN_REGION = {
  latitude: 26.0667,
  longitude: 50.5577,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

// Rough geographic bounds for Bahrain to restrict panning/zooming
const BAHRAIN_BOUNDS = {
  minLat: 25.55,
  maxLat: 26.40,
  minLng: 50.30,
  maxLng: 50.95,
};

const MANAMA_COORDS = { latitude: 26.2285, longitude: 50.586, title: 'Manama' };

const SPOTS_COUNT = 3;
// Example generated plan points across Bahrain
const PLAN_POINTS = [
  {
    id: 'day1',
    day: 1,
    coordinate: { latitude: 26.2285, longitude: 50.586 },
    title: 'Spot 1 · Manama Souq',
    description: 'Explore the souq, museums and Corniche.',
  },
  {
    id: 'day2',
    day: 2,
    coordinate: { latitude: 26.1536, longitude: 50.6065 },
    title: 'Spot 2 · Bahrain Fort',
    description: 'History, sunset views and seaside cafes.',
  },
  {
    id: 'day3',
    day: 3,
    coordinate: { latitude: 26.0479, longitude: 50.5100 },
    title: 'Spot 3 · Zallaq Coast',
    description: 'Beach clubs, resorts and relaxed dinners.',
  },
  {
    id: 'day4',
    day: 4,
    coordinate: { latitude: 25.9940, longitude: 50.5860 },
    title: 'Spot 4 · Oil Museum & Tree of Life',
    description: 'Desert drive and iconic natural landmark.',
  },
];

// Distinct colors per spot/day for markers and glow
const SPOT_COLORS = ['#C8102E', '#F97316', '#0EA5E9', '#10B981', '#6366F1'];

function getSpotColorForDay(day) {
  if (!day) return SPOT_COLORS[0];
  const index = (day - 1 + SPOT_COLORS.length) % SPOT_COLORS.length;
  return SPOT_COLORS[index];
}

// Clamp a map region so its center stays within Bahrain bounds
function clampRegionToBahrain(region) {
  if (!region) return region;
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  const clampedLat = Math.min(
    BAHRAIN_BOUNDS.maxLat,
    Math.max(BAHRAIN_BOUNDS.minLat, latitude)
  );
  const clampedLng = Math.min(
    BAHRAIN_BOUNDS.maxLng,
    Math.max(BAHRAIN_BOUNDS.minLng, longitude)
  );

  return {
    ...region,
    latitude: clampedLat,
    longitude: clampedLng,
    latitudeDelta,
    longitudeDelta,
  };
}

// Optional: Google Directions API key to follow real road paths.
// Add your key here to have the route line snap to real driving roads.
// If left empty, the route will fall back to straight lines between points.
const GOOGLE_MAPS_API_KEY = 'AIzaSyAQYxS9bsTpJQlhiKtKV6DszBHNrkdrfBo';

// Decode an encoded polyline string from Google Directions into coordinates
function decodePolyline(encoded) {
  if (!encoded) return [];

  let index = 0;
  const len = encoded.length;
  const coordinates = [];
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      // eslint-disable-next-line no-bitwise
      b = encoded.charCodeAt(index++) - 63;
      // eslint-disable-next-line no-bitwise
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    // eslint-disable-next-line no-bitwise
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      // eslint-disable-next-line no-bitwise
      b = encoded.charCodeAt(index++) - 63;
      // eslint-disable-next-line no-bitwise
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    // eslint-disable-next-line no-bitwise
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return coordinates;
}

// Reusable animated pill button for the AI questions
function PillButton({ label, icon, color = '#C8102E', selected = false, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.pill,
          {
            borderColor: selected ? color : 'rgba(148,163,184,0.35)',
            backgroundColor: selected ? `${color}11` : '#FFFFFF',
          },
          { transform: [{ scale }] },
        ]}
      >
        {icon && (
          <View style={styles.pillIconCircle}>
            <Ionicons name={icon} size={16} color={color} />
          </View>
        )}
        <Text style={[styles.pillText, { color }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Day option card for the 3rd question - modern card layout
function DayOptionCard({ label, subtitle, icon, color, recommended, onPress, delay = 0 }) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
        delay,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity, delay]);

  const pressScale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.dayOptionCard,
          {
            borderColor: `${color}40`,
            backgroundColor: `${color}08`,
            opacity,
            transform: [{ scale: Animated.multiply(scale, pressScale) }],
          },
        ]}
      >
        {recommended && (
          <View style={[styles.dayOptionBadge, { backgroundColor: color }]}>
            <Ionicons name="star" size={10} color="#FFF" />
            <Text style={styles.dayOptionBadgeText}>Recommended</Text>
          </View>
        )}
        <View style={[styles.dayOptionIconWrap, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <Text style={[styles.dayOptionLabel, { color }]}>{label}</Text>
        <Text style={styles.dayOptionSubtitle}>{subtitle}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Generate plan button with press animation
function GeneratePlanButton({ disabled, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 6,
      tension: 150,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 150,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.primaryButton,
          disabled && styles.primaryButtonDisabled,
          { transform: [{ scale }] },
        ]}
      >
        <Text
          style={[
            styles.primaryButtonText,
            disabled && styles.primaryButtonTextDisabled,
          ]}
        >
          Generate plan
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Modern generating animation overlay - shows when Generate Plan is pressed
function GenerateTransitionView({ compact = false }) {
  const scale = useRef(new Animated.Value(compact ? 0.95 : 0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 70,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { iterations: -1 }
    );
    spinLoop.start();

    const dotBounce = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        { iterations: -1 }
      );
    dotBounce(dot1, 0).start();
    dotBounce(dot2, 120).start();
    dotBounce(dot3, 240).start();
  }, [scale, opacity, spinAnim, dot1, dot2, dot3]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const dotTranslate1 = dot1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const dotTranslate2 = dot2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const dotTranslate3 = dot3.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  return (
    <Animated.View
      style={[
        compact ? styles.generateTransitionCardCompact : styles.generateTransitionCard,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={styles.generateTransitionInner}>
        <View style={compact ? styles.generateTransitionLoaderWrapCompact : styles.generateTransitionLoaderWrap}>
          <Animated.View
            style={[
              compact ? styles.generateTransitionRingCompact : styles.generateTransitionRing,
              {
                transform: [{ rotate: spinInterpolate }],
              },
            ]}
          />
          <View style={compact ? styles.generateTransitionIconCenterCompact : styles.generateTransitionIconCenter}>
            <Ionicons name="map" size={compact ? 22 : 28} color="#C8102E" />
          </View>
        </View>
        <Text style={compact ? styles.generateTransitionTitleCompact : styles.generateTransitionTitle}>
          Crafting your route
        </Text>
        <Text style={[styles.generateTransitionSubtitle, compact && { marginBottom: 12 }]}>
          Mapping the best stops across Bahrain
        </Text>
        <View style={styles.generateTransitionDots}>
          <Animated.View style={[styles.generateDot, { transform: [{ translateY: dotTranslate1 }] }]} />
          <Animated.View style={[styles.generateDot, { transform: [{ translateY: dotTranslate2 }] }]} />
          <Animated.View style={[styles.generateDot, { transform: [{ translateY: dotTranslate3 }] }]} />
        </View>
      </View>
    </Animated.View>
  );
}

// Plan detail card with fade-in animation
function PlanDetailCard({ point, cardStyle, isFocused = false, onPress }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const accentColor = getSpotColorForDay(point.day);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <Animated.View
        key={point.id}
        style={[
          cardStyle,
          {
            opacity: fadeAnim,
            borderLeftWidth: 3,
            borderLeftColor: accentColor,
            backgroundColor: isFocused ? `${accentColor}05` : '#FFFFFF',
          },
        ]}
      >
        <Text style={styles.planDetailDay}>Spot {point.day}</Text>
        <Text style={styles.planDetailTitle}>{point.title}</Text>
        <Text style={styles.planDetailSubtitle}>{point.description}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function AIPlanScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const sheetAnim = useRef(new Animated.Value(SNAP_POINTS[INITIAL_SNAP_INDEX])).current;
  const lastSnap = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);
  const currentYRef = useRef(SNAP_POINTS[INITIAL_SNAP_INDEX]);

  // Full-page AI impulse overlay
  const aiOverlay = useRef(new Animated.Value(0)).current;
  const lastPulse = useRef(null);
  // Subtle dim overlay for the map when AI flow is active
  const mapDim = useRef(new Animated.Value(0)).current;
  // Animated glow overlay while generating a plan on the map
  const generatingOverlay = useRef(new Animated.Value(0)).current;

  // AI question flow inside bottom sheet
  const [isQuestionFlowActive, setIsQuestionFlowActive] = useState(false);
  const [questionStep, setQuestionStep] = useState(0); // 0: budget, 1: preferences, 2: days, 3: summary
  const [answers, setAnswers] = useState({
    budget: '',
    preferences: [],
    days: '',
  });
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [hasGeneratedPlan, setHasGeneratedPlan] = useState(false);
  const questionAnim = useRef(new Animated.Value(0)).current;
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isGenerateTransitioning, setIsGenerateTransitioning] = useState(false);
  const [generatedMarkers, setGeneratedMarkers] = useState([]);
  const [currentPlanPoints, setCurrentPlanPoints] = useState(PLAN_POINTS);
  const generationTimerRef = useRef(null);
  const [visiblePlanPointsCount, setVisiblePlanPointsCount] = useState(0);
  const planDetailsTimerRef = useRef(null);
  // Animated route line + moving arrow along the generated spots
  const [routeCoords, setRouteCoords] = useState([]);
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const arrowPathRef = useRef({ segments: [], totalLength: 0 });
  const [arrowState, setArrowState] = useState(null); // { coordinate, heading }
  const arrowLoopRef = useRef(null);
  const lastDrawnIndexRef = useRef(-1);
  // Portion of the route polyline that has been "drawn" behind the car
  const [drawnRouteCoords, setDrawnRouteCoords] = useState([]);
  const isAdjustingRegionRef = useRef(false);
  // Glow state for spots when the car reaches them
  const [glowingSpotId, setGlowingSpotId] = useState(null);
  const spotGlowAnim = useRef(new Animated.Value(0)).current;
  const lastGlowingSpotIdRef = useRef(null);
  // Which generated day/card is currently focused from the map or list
  const [focusedPlanPointId, setFocusedPlanPointId] = useState(null);
  // Whether the current route is using a simple straight-line fallback
  const [routeUsedFallback, setRouteUsedFallback] = useState(false);
  // Whether the user has just closed a generated plan (for subtle default-state messaging)
  const [justClosedPlan, setJustClosedPlan] = useState(false);

  // When showing Past plans only, sheet is capped at half screen
  const isPastPlansView = !isQuestionFlowActive && !hasGeneratedPlan && !isGeneratingPlan;
  const effectiveSnapPointsRef = useRef(SNAP_POINTS);
  effectiveSnapPointsRef.current = isPastPlansView ? SNAP_POINTS_PAST_PLANS : SNAP_POINTS;

  // When entering Past plans view, if sheet is above half, snap it down to half
  useEffect(() => {
    if (!isPastPlansView) return;
    const id = setTimeout(() => {
      if (currentYRef.current < SNAP_POINT_HALF) {
        lastSnap.current = SNAP_POINT_HALF;
        Animated.spring(sheetAnim, {
          toValue: SNAP_POINT_HALF,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
      }
    }, 50);
    return () => clearTimeout(id);
  }, [isPastPlansView, sheetAnim]);

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

    // If the question flow is already open, close it when AI is pressed again.
    if (isQuestionFlowActive) {
      setIsQuestionFlowActive(false);
      lastSnap.current = SNAP_POINTS[2];
      Animated.spring(sheetAnim, {
        toValue: SNAP_POINTS[2],
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      return;
    }

    // Otherwise, start the question flow and lift the sheet to mid-height
    setIsQuestionFlowActive(true);
    setQuestionStep(0);
    questionAnim.setValue(0);
    lastSnap.current = SNAP_POINTS[1];

    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[1],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

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
  }, [route.params?.aiPulse, aiOverlay, sheetAnim, questionAnim, isQuestionFlowActive]);

  const aiOverlayOpacity = aiOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });

  const aiOverlayScale = aiOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  // Dim/undim the map when the AI question flow is active
  useEffect(() => {
    Animated.timing(mapDim, {
      toValue: isQuestionFlowActive ? 1 : 0,
      duration: 350,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isQuestionFlowActive, mapDim]);

  // Animate a soft AI glow over the map while generating a plan
  useEffect(() => {
    if (!isGeneratingPlan) {
      generatingOverlay.stopAnimation();
      generatingOverlay.setValue(0);
      return;
    }

    generatingOverlay.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(generatingOverlay, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.circle),
          useNativeDriver: true,
        }),
        Animated.timing(generatingOverlay, {
          toValue: 0,
          duration: 650,
          easing: Easing.in(Easing.circle),
          useNativeDriver: true,
        }),
      ]),
      {
        iterations: 3,
      }
    ).start();
  }, [isGeneratingPlan, generatingOverlay]);

  // Sequentially drop plan markers onto the map when generating starts
  useEffect(() => {
    if (!isGeneratingPlan) {
      if (generationTimerRef.current) {
        clearTimeout(generationTimerRef.current);
        generationTimerRef.current = null;
      }
      return;
    }

    setGeneratedMarkers([]);
    setHasGeneratedPlan(false);
    const points = currentPlanPoints?.length ? currentPlanPoints : PLAN_POINTS;
    let index = 0;

    const dropNext = () => {
      const point = points[index];
      setGeneratedMarkers((prev) => [...prev, point]);

      // Zoom and center the camera on each newly added pin (slower and smoother)
      if (mapRef.current && point?.coordinate) {
        mapRef.current.animateToRegion(
          {
            ...point.coordinate,
            latitudeDelta: 0.18,
            longitudeDelta: 0.18,
          },
          1200
        );
      }

      index += 1;

      if (index < points.length) {
        generationTimerRef.current = setTimeout(dropNext, 650);
      } else {
        generationTimerRef.current = null;
        // Stop the generating state once all pins are placed.
        setTimeout(() => {
          setIsGeneratingPlan(false);
        }, 700);
      }
    };

    dropNext();

    return () => {
      if (generationTimerRef.current) {
        clearTimeout(generationTimerRef.current);
      }
    };
  }, [isGeneratingPlan, currentPlanPoints]);

  // Reveal plan detail cards one by one after the plan has been generated
  useEffect(() => {
    if (!hasGeneratedPlan) {
      if (planDetailsTimerRef.current) {
        clearTimeout(planDetailsTimerRef.current);
        planDetailsTimerRef.current = null;
      }
      setVisiblePlanPointsCount(0);
      return;
    }

    setVisiblePlanPointsCount(0);
    const points = currentPlanPoints?.length ? currentPlanPoints : PLAN_POINTS;
    let index = 0;

    const revealNext = () => {
      setVisiblePlanPointsCount((prev) => {
        const next = Math.min(points.length, prev + 1);
        return next;
      });
      index += 1;
      if (index < points.length) {
        planDetailsTimerRef.current = setTimeout(revealNext, 650);
      } else {
        planDetailsTimerRef.current = null;
      }
    };

    revealNext();

    return () => {
      if (planDetailsTimerRef.current) {
        clearTimeout(planDetailsTimerRef.current);
        planDetailsTimerRef.current = null;
      }
    };
  }, [hasGeneratedPlan, currentPlanPoints]);

  // Build simple line segments for the route so we can interpolate the arrow along it
  useEffect(() => {
    if (!routeCoords || routeCoords.length < 2) {
      arrowPathRef.current = { segments: [], totalLength: 0 };
      setArrowState(null);
      return;
    }

    const segments = [];
    let totalLength = 0;

    for (let i = 0; i < routeCoords.length - 1; i++) {
      const start = routeCoords[i];
      const end = routeCoords[i + 1];
      const dx = end.latitude - start.latitude;
      const dy = end.longitude - start.longitude;
      const length = Math.sqrt(dx * dx + dy * dy);

      segments.push({ start, end, length });
      totalLength += length;
    }

    arrowPathRef.current = { segments, totalLength };
  }, [routeCoords]);

  // Drive the arrow animation along the built route and draw the line behind the car
  useEffect(() => {
    const listenerId = arrowAnim.addListener(({ value }) => {
      const path = arrowPathRef.current;
      if (!path || !path.segments || path.totalLength === 0) return;

      const targetDistance = value * path.totalLength;
      let distanceSoFar = 0;

      for (let i = 0; i < path.segments.length; i++) {
        const seg = path.segments[i];
        if (distanceSoFar + seg.length >= targetDistance) {
          const remaining = targetDistance - distanceSoFar;
          const segT = seg.length === 0 ? 0 : remaining / seg.length;

          const lat =
            seg.start.latitude + (seg.end.latitude - seg.start.latitude) * segT;
          const lng =
            seg.start.longitude + (seg.end.longitude - seg.start.longitude) * segT;

          const headingRad = Math.atan2(
            seg.end.longitude - seg.start.longitude,
            seg.end.latitude - seg.start.latitude
          );
          const headingDeg = (headingRad * 180) / Math.PI;

          setArrowState({
            coordinate: { latitude: lat, longitude: lng },
            heading: headingDeg,
          });

          // Draw the route only up to the car's current progress (line fills along car)
          if (routeCoords && routeCoords.length > 1 && path.totalLength > 0) {
            const progress = targetDistance / path.totalLength;
            const lastIndex = routeCoords.length - 1;
            const rawIndex = Math.round(progress * lastIndex);
            const clampedIndex = Math.max(1, Math.min(lastIndex, rawIndex));
            // Throttle: update every ~4 points for smooth fill without excessive re-renders
            const step = 4;
            const prev = lastDrawnIndexRef.current;
            const shouldUpdate =
              prev < 0 ||
              clampedIndex - prev >= step ||
              clampedIndex >= lastIndex;
            if (shouldUpdate) {
              lastDrawnIndexRef.current = clampedIndex;
              setDrawnRouteCoords(routeCoords.slice(0, clampedIndex + 1));
            }
          }

          // Determine which plan spot (if any) the car is closest to,
          // and trigger a glow when it's within a small distance threshold.
          let closestId = null;
          let closestDist = Infinity;
          const pointsForGlow = currentPlanPoints?.length ? currentPlanPoints : PLAN_POINTS;
          pointsForGlow.forEach((p) => {
            const dLat = p.coordinate.latitude - lat;
            const dLng = p.coordinate.longitude - lng;
            const dist = Math.sqrt(dLat * dLat + dLng * dLng);
            if (dist < closestDist) {
              closestDist = dist;
              closestId = p.id;
            }
          });

          const THRESHOLD = 0.004; // ~a few hundred meters around each spot
          const newGlowId = closestDist < THRESHOLD ? closestId : null;

          if (lastGlowingSpotIdRef.current !== newGlowId) {
            lastGlowingSpotIdRef.current = newGlowId;
            setGlowingSpotId(newGlowId);
          }
          break;
        }
        distanceSoFar += seg.length;
      }
    });

    return () => {
      arrowAnim.removeListener(listenerId);
    };
  }, [arrowAnim, routeCoords, currentPlanPoints]);

  // Run the arrow animation once; when it finishes, show details and keep the line static
  useEffect(() => {
    if (!routeCoords || routeCoords.length < 2) {
      if (arrowLoopRef.current) {
        arrowLoopRef.current.stop();
        arrowLoopRef.current = null;
      }
      return;
    }

    arrowAnim.setValue(0);
    lastDrawnIndexRef.current = -1;
    setDrawnRouteCoords([]);
    const animation = Animated.timing(arrowAnim, {
      toValue: 1,
      duration: 7000,
      easing: Easing.linear,
      useNativeDriver: false, // we need JS values to compute coordinates
    });

    arrowLoopRef.current = animation;
    animation.start(({ finished }) => {
      arrowLoopRef.current = null;
      if (finished) {
        setArrowState(null);
        setDrawnRouteCoords(routeCoords);
        setHasGeneratedPlan(true);

        // Bring the sheet up to the mid position to reveal details
        lastSnap.current = SNAP_POINTS[1];
        Animated.spring(sheetAnim, {
          toValue: SNAP_POINTS[1],
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
      }
    });

    return () => {
      if (arrowLoopRef.current) {
        arrowLoopRef.current.stop();
        arrowLoopRef.current = null;
      }
    };
  }, [routeCoords, arrowAnim]);

  // Clear drawn route when there is no valid route
  useEffect(() => {
    if (!routeCoords || routeCoords.length < 2) {
      setDrawnRouteCoords([]);
    }
  }, [routeCoords]);

  // Pan camera to the spot when the car reaches it
  useEffect(() => {
    if (!glowingSpotId || !mapRef.current) return;
    const points = currentPlanPoints?.length ? currentPlanPoints : PLAN_POINTS;
    const point = points.find((p) => p.id === glowingSpotId);
    if (!point?.coordinate) return;
    isAdjustingRegionRef.current = true;
    mapRef.current.animateToRegion(
      {
        ...point.coordinate,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      },
      600
    );
  }, [glowingSpotId, currentPlanPoints]);

  // Pulse animation for any spot that is currently "glowing"
  useEffect(() => {
    if (!glowingSpotId) {
      spotGlowAnim.stopAnimation();
      spotGlowAnim.setValue(0);
      return;
    }

    spotGlowAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(spotGlowAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(spotGlowAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [glowingSpotId, spotGlowAnim]);

  const generatingOverlayOpacity = generatingOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });

  const generatingOverlayScale = generatingOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.03],
  });

  // Animate each question entrance
  useEffect(() => {
    if (!isQuestionFlowActive || questionStep > 3) return;
    questionAnim.setValue(0);
    Animated.timing(questionAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isQuestionFlowActive, questionStep, questionAnim]);

  const questionOpacity = questionAnim;
  const questionTranslateY = questionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const questionScale = questionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1],
  });

  const handleStartQuestionFlow = () => {
    setIsQuestionFlowActive(true);
    setQuestionStep(0);
    setJustClosedPlan(false);
    questionAnim.setValue(0);
    lastSnap.current = SNAP_POINTS[1];
    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[1],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const handleAnswerAndAdvance = (key, value) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (questionStep < 2) {
      setQuestionStep((prev) => prev + 1);
    } else {
      setQuestionStep(3);
    }
  };

  const handleSkip = () => {
    if (questionStep < 2) {
      setQuestionStep((prev) => prev + 1);
    } else {
      setQuestionStep(3);
    }
  };

  const handleQuestionBack = () => {
    setQuestionStep((prev) => (prev > 0 ? prev - 1 : 0));
  };

  const handleRestartFlow = () => {
    setIsQuestionFlowActive(true);
    setQuestionStep(0);
    setSelectedPreferences([]);
    setJustClosedPlan(false);
  };

  const togglePreference = (label) => {
    setSelectedPreferences((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const handleConfirmPreferences = () => {
    if (!selectedPreferences.length) return;
    setAnswers((prev) => ({ ...prev, preferences: selectedPreferences }));
    setQuestionStep(2);
  };

  const handleRegionChangeComplete = (region) => {
    if (!region || !mapRef.current) return;

    // Prevent infinite loops when we programmatically adjust the region
    if (isAdjustingRegionRef.current) {
      isAdjustingRegionRef.current = false;
      return;
    }

    const clamped = clampRegionToBahrain(region);
    const deltaLat = Math.abs(clamped.latitude - region.latitude);
    const deltaLng = Math.abs(clamped.longitude - region.longitude);

    if (deltaLat > 0.0005 || deltaLng > 0.0005) {
      isAdjustingRegionRef.current = true;
      mapRef.current.animateToRegion(clamped, 180);
    }
  };

  const handleStartNavigation = (point) => {
    if (!point) return;
    const { latitude, longitude } = point.coordinate || point;
    if (latitude == null || longitude == null) return;

    const latLng = `${latitude},${longitude}`;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${latLng}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&destination=${latLng}&travelmode=driving`;

    Linking.openURL(url);
  };

  const handleFocusPlanPoint = (point) => {
    if (!point || !point.coordinate || !mapRef.current) return;
    const { latitude, longitude } = point.coordinate;
    mapRef.current.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      },
      800
    );
    setFocusedPlanPointId(point.id);
    // Only bring the sheet up when a plan has been generated (so Past plans container does not pop up on spot tap)
    if (hasGeneratedPlan) {
      lastSnap.current = SNAP_POINTS[1];
      Animated.spring(sheetAnim, {
        toValue: SNAP_POINTS[1],
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    }
  };

  const handleCloseGeneratedPlan = () => {
    // Reset map overlays and generated state back to the default "My Spots" view
    setHasGeneratedPlan(false);
    setIsGeneratingPlan(false);
    setGeneratedMarkers([]);
    setRouteCoords([]);
    setDrawnRouteCoords([]);
    setArrowState(null);
    setGlowingSpotId(null);
    lastGlowingSpotIdRef.current = null;
    setFocusedPlanPointId(null);
    setRouteUsedFallback(false);
    setJustClosedPlan(true);

    // Return the sheet to the peek position
    lastSnap.current = SNAP_POINTS[2];
    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[2],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const fetchRoadRoute = async (points) => {
    if (!points || points.length < 2) return points?.map((p) => p.coordinate) || [];
    const fallback = points.map((p) => p.coordinate);

    // 1. Try OSRM first (free, no API key, uses OpenStreetMap road network)
    try {
      const coordStr = points
        .map((p) => `${p.coordinate.longitude},${p.coordinate.latitude}`)
        .join(';');
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl);
      const osrmJson = await osrmRes.json();

      if (osrmJson.code === 'Ok' && osrmJson.routes?.[0]?.geometry?.coordinates?.length > 1) {
        // OSRM returns [lng, lat]; convert to {latitude, longitude} for react-native-maps
        return osrmJson.routes[0].geometry.coordinates.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));
      }
    } catch (_) {
      /* try Google fallback */
    }

    // 2. Fallback to Google Directions API if key is set
    if (GOOGLE_MAPS_API_KEY) {
      try {
        const origin = points[0]?.coordinate;
        const destination = points[points.length - 1]?.coordinate;
        const waypointsRaw = points.slice(1, points.length - 1)
          .map((p) => `${p.coordinate.latitude},${p.coordinate.longitude}`)
          .join('|');

        if (origin && destination) {
          let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving&region=bh&key=${GOOGLE_MAPS_API_KEY}`;
          if (waypointsRaw.length > 0) {
            url += `&waypoints=${encodeURIComponent(waypointsRaw)}`;
          }

          const response = await fetch(url);
          const json = await response.json();

          if (json.status === 'OK' && json.routes?.[0]?.overview_polyline?.points) {
            const coords = decodePolyline(json.routes[0].overview_polyline.points);
            if (coords?.length > 1) return coords;
          }
        }
      } catch (_) {
        /* fall through */
      }
    }

    return fallback;
  };

  const handleShowPastTrip = async () => {
    // For now, all past trips reuse the demo plan points
    setCurrentPlanPoints(PLAN_POINTS);
    setIsQuestionFlowActive(false);
    setIsGeneratingPlan(false);
    setHasGeneratedPlan(false);
    setJustClosedPlan(false);
    setGeneratedMarkers(PLAN_POINTS);
    setDrawnRouteCoords([]);
    setArrowState(null);
    setGlowingSpotId(null);
    lastGlowingSpotIdRef.current = null;
    setFocusedPlanPointId(null);
    setVisiblePlanPointsCount(0);

    const coords = await fetchRoadRoute(PLAN_POINTS);
    // Road routes from Google have many polyline points; fallback has only plan-point count
    setRouteCoords(coords);
    setRouteUsedFallback(coords.length <= PLAN_POINTS.length + 2);

    // Focus the map on the first day of the trip
    const firstPoint = currentPlanPoints?.length ? currentPlanPoints[0] : PLAN_POINTS[0];
    if (mapRef.current && firstPoint?.coordinate) {
      mapRef.current.animateToRegion(
        {
          ...firstPoint.coordinate,
          latitudeDelta: 0.18,
          longitudeDelta: 0.18,
        },
        800
      );
    }

    // Keep the sheet at peek while the car animation replays;
    // when the arrow animation completes, it will lift the sheet
    // and show the full plan details just like a freshly generated plan.
    lastSnap.current = SNAP_POINTS[2];
    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[2],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const handleGeneratePlan = async () => {
    if (!answers.days || isGeneratingPlan || isGenerateTransitioning) return;
    setHasGeneratedPlan(false);
    setVisiblePlanPointsCount(0);
    setRouteUsedFallback(false);
    setJustClosedPlan(false);
    setIsGenerateTransitioning(true);

    // Plan is generated only by n8n – no mock fallback
    let pointsToUse = null;
    try {
      const planResult = await requestPlanFromN8n(answers);
      if (planResult.success && planResult.places?.length > 0) {
        pointsToUse = planResult.places;
      } else {
        const msg = planResult?.error || planResult?.output || 'No itinerary returned. Check that your n8n workflow returns a list of places with latitude, longitude, title, and description.';
        setIsGenerateTransitioning(false);
        Alert.alert('Couldn’t generate plan', msg);
        return;
      }
    } catch (e) {
      setIsGenerateTransitioning(false);
      Alert.alert('Plan failed', e?.message || 'Network or server error. Try again.');
      return;
    }

    setCurrentPlanPoints(pointsToUse);

    const coords = await fetchRoadRoute(pointsToUse);
    setRouteCoords(coords);
    setRouteUsedFallback(coords.length <= pointsToUse.length + 2);

    setIsGenerateTransitioning(false);
    setIsGeneratingPlan(true);
    setIsQuestionFlowActive(false);

    lastSnap.current = SNAP_POINTS[2];
    Animated.spring(sheetAnim, {
      toValue: SNAP_POINTS[2],
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        lastSnap.current = currentYRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const newY = lastSnap.current + gestureState.dy;
        const snaps = effectiveSnapPointsRef.current;
        const clamped = Math.max(snaps[0], Math.min(snaps[snaps.length - 1], newY));
        sheetAnim.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentY = lastSnap.current + gestureState.dy;
        const velocity = gestureState.vy;
        const snaps = effectiveSnapPointsRef.current;
        // Find nearest snap point, or use velocity to pick next
        let targetIndex = 0;
        let minDist = Math.abs(currentY - snaps[0]);
        for (let i = 1; i < snaps.length; i++) {
          const d = Math.abs(currentY - snaps[i]);
          if (d < minDist) {
            minDist = d;
            targetIndex = i;
          }
        }
        if (velocity > 0.4) targetIndex = Math.min(snaps.length - 1, targetIndex + 1);
        else if (velocity < -0.4) targetIndex = Math.max(0, targetIndex - 1);
        const target = snaps[targetIndex];
        lastSnap.current = target;
        Animated.spring(sheetAnim, {
          toValue: target,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();

        // If the user drags the bottom container down to the lowest position
        // while the AI flow is active, discard/close the question flow.
        if (isQuestionFlowActive && targetIndex === snaps.length - 1) {
          setIsQuestionFlowActive(false);
        }
      },
    })
  ).current;

  const pointsForDisplay = currentPlanPoints?.length ? currentPlanPoints : PLAN_POINTS;
  const visiblePlanPoints = pointsForDisplay.slice(0, visiblePlanPointsCount);

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

        {(generatedMarkers.length > 0 ? generatedMarkers : pointsForDisplay).map((spot, index) => {
          const color = getSpotColorForDay(spot.day);
          return (
            <Marker
              key={`${spot.id}-${index}`}
              coordinate={spot.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => handleFocusPlanPoint(spot)}
            >
              <View style={[styles.planMarkerWrap, { backgroundColor: color }]}>
                {glowingSpotId === spot.id && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.planMarkerGlowRing,
                      {
                        borderColor: color,
                        backgroundColor: `${color}22`,
                        transform: [
                          {
                            scale: spotGlowAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.45],
                            }),
                          },
                        ],
                        opacity: spotGlowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 0],
                        }),
                      },
                    ]}
                  />
                )}
                <Text style={styles.planMarkerDay}>{spot.day}</Text>
              </View>
              <Callout
                tooltip
                onPress={() => navigation.getParent()?.navigate('PlaceDetail', { place: spot })}
              >
                <View style={styles.placeCalloutContainer}>
                  <Text style={styles.placeCalloutTitle} numberOfLines={1}>
                    {spot.title.replace(/^Day\s+/, 'Spot ')}
                  </Text>
                  <Text style={styles.placeCalloutSubtitle} numberOfLines={2}>
                    {spot.description}
                  </Text>
                  <View style={styles.placeCalloutCta}>
                    <Text style={[styles.placeCalloutCtaText, { color }]}>View profile</Text>
                    <Ionicons name="chevron-forward" size={14} color={color} />
                  </View>
                </View>
              </Callout>
            </Marker>
          );
        })}

        {/* Route line: fills progressively along the car as it travels */}
        {(drawnRouteCoords.length >= 2 || routeCoords.length >= 2) && (
          <Polyline
            coordinates={drawnRouteCoords.length >= 2 ? drawnRouteCoords : routeCoords.slice(0, 2)}
            strokeColor="#C8102E"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            geodesic
          />
        )}

        {/* Moving car travelling along the route */}
        {arrowState && (
          <Marker
            coordinate={arrowState.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.arrowMarkerWrap}>
              <Animated.View
                style={{
                  transform: [{ rotate: `${arrowState.heading}deg` }],
                }}
              >
                <Ionicons
                  name="car"
                  size={24}
                  color="#C8102E"
                />
              </Animated.View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Subtle dark fade over the map when the AI flow is active */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: 'rgba(0,0,0,0.35)',
            opacity: mapDim,
          },
        ]}
      />

      {/* Soft AI glow overlay when generating the plan */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.generatingOverlay,
          {
            opacity: generatingOverlayOpacity,
            transform: [{ scale: generatingOverlayScale }],
          },
        ]}
      >
        <View style={styles.generatingOverlayInner}>
          <Text style={styles.generatingTextPrimary}>Designing your Bahrain route</Text>
          <Text style={styles.generatingTextSecondary}>Dropping stops on the map one by one</Text>
        </View>
      </Animated.View>

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
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => navigation.getParent()?.navigate('Search')}
          activeOpacity={0.8}
        >
          <Ionicons name="search" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <ProfileButton />
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
          {!isQuestionFlowActive && !hasGeneratedPlan && !isGeneratingPlan && (
            <Text style={styles.grabberHint}>Drag up for more details</Text>
          )}
        </View>

        <View style={styles.sheetHeader}>
          {isQuestionFlowActive ? (
            <>
              <View style={styles.sheetHeaderLeft}>
                {questionStep > 0 && (
                  <TouchableOpacity
                    style={styles.backButton}
                    activeOpacity={0.8}
                    onPress={handleQuestionBack}
                  >
                    <Ionicons name="chevron-back" size={18} color="#6B7280" />
                  </TouchableOpacity>
                )}
                <View style={styles.sheetTitleWrap}>
                  {questionStep === 0 && (
                    <>
                      <Text style={styles.questionTitle}>What kind of budget are you thinking?</Text>
                      <Text style={styles.questionSubtitle}>
                        We will match hotels, food and activities to this level.
                      </Text>
                    </>
                  )}
                  {questionStep === 1 && (
                    <>
                      <Text style={styles.questionTitle}>What kind of experiences do you prefer?</Text>
                      <Text style={styles.questionSubtitle}>
                        Tap a few words that best describe this Bahrain trip.
                      </Text>
                    </>
                  )}
                  {questionStep === 2 && (
                    <>
                      <Text style={styles.questionTitle}>How many days are you staying?</Text>
                      <Text style={styles.questionSubtitle}>
                        We will pace your itinerary so it never feels rushed.
                      </Text>
                    </>
                  )}
                  {questionStep === 3 && (
                    <>
                      <Text style={styles.questionTitle}>Ready to generate your plan</Text>
                      <Text style={styles.questionSubtitle}>
                        Review your answers below and generate a Bahrain route.
                      </Text>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.sheetHeaderRight}>
                <TouchableOpacity
                  style={styles.closeButton}
                  activeOpacity={0.8}
                  onPress={() => setIsQuestionFlowActive(false)}
                >
                  <Ionicons name="close" size={18} color="#6B7280" style={styles.closeIcon} />
                </TouchableOpacity>
              </View>
            </>
          ) : isGeneratingPlan || isGenerateTransitioning ? (
            <View style={styles.sheetHeaderLeft}>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>Creating your plan</Text>
                <Text style={styles.sheetSubtitle}>Mapping the best route across Bahrain</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.sheetTitleWrap}>
                  <Text style={styles.sheetTitle}>Past Plans</Text>
                  <Text style={styles.sheetSubtitle}>{`${SPOTS_COUNT} Spots Saved`}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.importButton}
                activeOpacity={0.8}
                onPress={handleStartQuestionFlow}
              >
                <Ionicons name="sparkles-outline" size={18} color="#C8102E" />
                <Text style={styles.importLabel}>Start AI trip setup</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {isQuestionFlowActive ? (
          <Animated.View
            style={[
              styles.questionContainer,
              {
                opacity: questionOpacity,
                transform: [
                  { translateY: questionTranslateY },
                  { scale: questionScale },
                ],
              },
            ]}
          >
            <ScrollView
              style={styles.questionScroll}
              contentContainerStyle={styles.questionScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {questionStep === 0 && (
                <View style={styles.questionCard}>
                  <View style={styles.pillRow}>
                    <PillButton
                      label="Budget-friendly"
                      icon="cash-outline"
                      color="#16A34A"
                      onPress={() => handleAnswerAndAdvance('budget', 'Budget-friendly')}
                    />
                    <PillButton
                      label="Comfort"
                      icon="cash-outline"
                      color="#0EA5E9"
                      onPress={() => handleAnswerAndAdvance('budget', 'Comfort')}
                    />
                    <PillButton
                      label="Luxury"
                      icon="cash-outline"
                      color="#F97316"
                      onPress={() => handleAnswerAndAdvance('budget', 'Luxury')}
                    />
                  </View>
                </View>
              )}

              {questionStep === 1 && (
                <View style={styles.questionCard}>
                  <View style={styles.preferenceGrid}>
                    {[
                      {
                        key: 'Culture',
                        label: 'Culture',
                        color: '#6366F1',
                        icon: 'color-palette-outline',
                      },
                      {
                        key: 'History',
                        label: 'History',
                        color: '#818CF8',
                        icon: 'time-outline',
                      },
                      {
                        key: 'Beach',
                        label: 'Beach',
                        color: '#F59E0B',
                        icon: 'sunny-outline',
                      },
                      {
                        key: 'Relax',
                        label: 'Relax',
                        color: '#10B981',
                        icon: 'leaf-outline',
                      },
                      {
                        key: 'Food',
                        label: 'Food',
                        color: '#EC4899',
                        icon: 'restaurant-outline',
                      },
                      {
                        key: 'Nightlife',
                        label: 'Nightlife',
                        color: '#A855F7',
                        icon: 'moon-outline',
                      },
                      {
                        key: 'Shopping',
                        label: 'Shopping',
                        color: '#0EA5E9',
                        icon: 'bag-handle-outline',
                      },
                      {
                        key: 'Nature',
                        label: 'Nature',
                        color: '#22C55E',
                        icon: 'earth-outline',
                      },
                      {
                        key: 'Adventure',
                        label: 'Adventure',
                        color: '#F97316',
                        icon: 'walk-outline',
                      },
                    ].map((opt) => {
                      const isSelected = selectedPreferences.includes(opt.label);
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.preferenceGridItem,
                            isSelected && {
                              borderColor: opt.color,
                              backgroundColor: `${opt.color}11`,
                            },
                          ]}
                          activeOpacity={0.9}
                          onPress={() => togglePreference(opt.label)}
                        >
                          <View style={styles.preferenceGridItemInner}>
                            <View
                              style={[
                                styles.preferenceIconCircle,
                                { backgroundColor: `${opt.color}1A` },
                              ]}
                            >
                              <Ionicons name={opt.icon} size={20} color={opt.color} />
                            </View>
                            <Text
                              style={[
                                styles.preferenceLabel,
                                { color: isSelected ? opt.color : '#111827' },
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      !selectedPreferences.length && styles.primaryButtonDisabled,
                    ]}
                    activeOpacity={selectedPreferences.length ? 0.9 : 1}
                    onPress={selectedPreferences.length ? handleConfirmPreferences : undefined}
                    disabled={!selectedPreferences.length}
                  >
                    <Text
                      style={[
                        styles.primaryButtonText,
                        !selectedPreferences.length && styles.primaryButtonTextDisabled,
                      ]}
                    >
                      Continue
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {questionStep === 2 && (
                <View style={styles.dayOptionsContainer}>
                  <DayOptionCard
                    label="1–2 days"
                    subtitle="Quick getaway"
                    icon="flash-outline"
                    color="#22C55E"
                    onPress={() => handleAnswerAndAdvance('days', '1-2 days')}
                    delay={0}
                  />
                  <DayOptionCard
                    label="3–4 days"
                    subtitle="Sweet spot"
                    icon="compass-outline"
                    color="#0EA5E9"
                    recommended
                    onPress={() => handleAnswerAndAdvance('days', '3-4 days')}
                    delay={80}
                  />
                  <DayOptionCard
                    label="5+ days"
                    subtitle="Deep dive"
                    icon="earth-outline"
                    color="#EC4899"
                    onPress={() => handleAnswerAndAdvance('days', '5+ days')}
                    delay={160}
                  />
                </View>
              )}

              {questionStep === 3 && (
                isGenerateTransitioning ? (
                  <GenerateTransitionView />
                ) : (
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Perfect, we have what we need.</Text>
                    <Text style={styles.summarySubtitle}>
                      We will shape a Bahrain plan around
                      {answers.budget ? ` a ${answers.budget.toLowerCase()} budget` : ' your budget'}
                      {answers.preferences && answers.preferences.length
                        ? `, focused on ${answers.preferences
                            .map((p) => p.toLowerCase())
                            .join(', ')}`
                        : ''}
                      {answers.days ? `, over ${answers.days}` : ''}.
                    </Text>
                    <Text style={styles.summaryPreview}>
                      Expect a balanced mix of key sights and relaxed time, tuned to your answers.
                    </Text>
                    {!answers.days && (
                      <Text style={styles.summaryHelperText}>
                        Pick how many days you are staying so we can pace your route.
                      </Text>
                    )}
                    <GeneratePlanButton
                      disabled={!answers.days}
                      onPress={handleGeneratePlan}
                    />
                    <TouchableOpacity
                      style={styles.secondaryButtonInline}
                      activeOpacity={0.8}
                      onPress={handleRestartFlow}
                    >
                      <Text style={styles.secondaryButtonInlineText}>Adjust answers</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </ScrollView>
          </Animated.View>
        ) : hasGeneratedPlan ? (
          <View style={styles.planDetailsWrapper}>
            <View style={styles.planHeaderRow}>
              <Text style={styles.planHeaderTitle}>Your Bahrain route</Text>
              <TouchableOpacity
                style={styles.closePlanChip}
                activeOpacity={0.8}
                onPress={handleCloseGeneratedPlan}
              >
                <Ionicons
                  name="close"
                  size={14}
                  color="#4B5563"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.closePlanChipText}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.navButtonRow}>
              <TouchableOpacity
                style={styles.navButton}
                activeOpacity={0.9}
                onPress={() => handleStartNavigation(pointsForDisplay[0])}
              >
                <Ionicons
                  name="navigate-outline"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.navButtonLabel}>Start navigation to Spot 1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navSecondaryButton}
                activeOpacity={0.9}
                onPress={handleRestartFlow}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={18}
                  color="#C8102E"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.navSecondaryButtonLabel}>Enhance</Text>
              </TouchableOpacity>
              {routeUsedFallback && (
                <Text style={styles.routeFallbackText}>
                  Route line is approximate and may not follow every road exactly.
                </Text>
              )}
            </View>

            <ScrollView
              style={styles.planDetailsScroll}
              contentContainerStyle={styles.planDetailsContent}
              showsVerticalScrollIndicator={false}
            >
              {visiblePlanPoints.map((point) => (
                <PlanDetailCard
                  key={point.id}
                  point={point}
                  cardStyle={styles.planDetailCard}
                  isFocused={focusedPlanPointId === point.id}
                  onPress={() => handleFocusPlanPoint(point)}
                />
              ))}
            </ScrollView>
          </View>
        ) : isGeneratingPlan || isGenerateTransitioning ? (
          <View style={styles.generatingSheetPlaceholder}>
            <GenerateTransitionView compact={isGeneratingPlan} />
          </View>
        ) : (
          <View style={styles.spotList}>
            {[1, 2, 3].map((i) => (
              <TouchableOpacity
                key={i}
                style={styles.spotCard}
                activeOpacity={0.9}
                onPress={handleShowPastTrip}
              >
                <View style={styles.spotIconWrap}>
                  <Ionicons name="map-outline" size={20} color="#C8102E" />
                </View>
                <View style={styles.spotInfo}>
                  <View style={styles.spotTitleRow}>
                    <Text style={styles.spotName}>{`Bahrain trip #${i}`}</Text>
                    <View style={styles.spotStatusChip}>
                      <Text style={styles.spotStatusChipText}>Saved</Text>
                    </View>
                  </View>
                  <View style={styles.spotMetaRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color="#9CA3AF"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.spotMeta}>3-day itinerary · 5 stops</Text>
                  </View>
                  <Text style={styles.spotMetaSecondary}>Last edited recently</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
          </View>
        )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
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
    // Bahrain flag red for cluster marker – Google Maps–style size
    backgroundColor: '#C8102E',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  markerText: {
    color: '#FFF',
    fontSize: 10,
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
    backgroundColor: '#F9FAFB',
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
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D1D5DB',
  },
  grabberHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#9CA3AF',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sheetTitleWrap: {
    flex: 1,
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
  sheetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRightQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  sheetHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  stepBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(200,16,46,0.08)',
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C8102E',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,250,251,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.7)',
  },
  closeIcon: {
    marginTop: 1,
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
  defaultCtaCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.7)',
    marginBottom: 10,
  },
  defaultCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  defaultCtaSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
  },
  defaultCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#C8102E',
    marginBottom: 6,
  },
  defaultCtaButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  defaultInfoText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  spotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
  spotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
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
  spotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  spotMetaSecondary: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  spotStatusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  spotStatusChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  planMarkerWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  planMarkerGlowRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
  },
  planMarkerDay: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  placeCalloutContainer: {
    width: 200,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  placeCalloutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  placeCalloutSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
    marginBottom: 8,
  },
  placeCalloutCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  placeCalloutCtaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  arrowMarkerWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 4,
  },
  questionContainer: {
    paddingHorizontal: 16,
    paddingBottom: 0,
    paddingTop: 0,
    backgroundColor: 'rgba(248,250,252,0.9)',
  },
  questionScroll: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  questionScrollContent: {
    paddingBottom: 16,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.8)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  questionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  questionIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  questionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  questionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 8,
  },
  dayOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  dayOptionCard: {
    flex: 1,
    minWidth: '30%',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  dayOptionBadge: {
    position: 'absolute',
    top: -8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dayOptionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayOptionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dayOptionLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  dayOptionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  preferenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: -70,
  },
  preferenceGridItem: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  preferenceGridItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  preferenceLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    width: '100%',
    justifyContent: 'flex-start',
  },
  pillIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  secondaryButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  summaryPreview: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 10,
  },
  summaryHelperText: {
    fontSize: 12,
    color: '#DC2626',
    marginBottom: 10,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C8102E',
    marginBottom: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  primaryButtonTextDisabled: {
    color: '#9CA3AF',
  },
  secondaryButtonInline: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  secondaryButtonInlineText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  generateTransitionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.15)',
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  generateTransitionInner: {
    alignItems: 'center',
  },
  generateTransitionLoaderWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  generateTransitionRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderTopColor: '#C8102E',
    borderRightColor: 'rgba(200,16,46,0.2)',
    borderBottomColor: 'rgba(200,16,46,0.1)',
    borderLeftColor: 'rgba(200,16,46,0.2)',
  },
  generateTransitionIconCenter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateTransitionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  generateTransitionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 20,
  },
  generateTransitionDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8102E',
  },
  generatingSheetPlaceholder: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  generateTransitionCardCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(200,16,46,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  generateTransitionLoaderWrapCompact: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  generateTransitionRingCompact: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderTopColor: '#C8102E',
    borderRightColor: 'rgba(200,16,46,0.2)',
    borderBottomColor: 'rgba(200,16,46,0.1)',
    borderLeftColor: 'rgba(200,16,46,0.2)',
  },
  generateTransitionIconCenterCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateTransitionTitleCompact: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  stepDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  stepDotActive: {
    width: 16,
    backgroundColor: '#C8102E',
  },
  stepDotCompleted: {
    backgroundColor: '#F97373',
  },
  planDetailsWrapper: {
    flex: 1,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  planHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  closePlanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  closePlanChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  navButtonRow: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRadius: 999,
    paddingVertical: 11,
    backgroundColor: '#10B981',
  },
  navButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  navSecondaryButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.8)',
  },
  navSecondaryButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C8102E',
  },
  routeFallbackText: {
    marginTop: 6,
    fontSize: 11,
    color: '#6B7280',
  },
  planDetailsScroll: {
    flex: 1,
  },
  planDetailsContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
    gap: 12,
  },
  planDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.8)',
  },
  planDetailDay: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#9CA3AF',
    marginBottom: 4,
  },
  planDetailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  planDetailSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  generatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  generatingOverlayInner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.65)',
  },
  generatingTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
    textAlign: 'center',
  },
  generatingTextSecondary: {
    marginTop: 2,
    fontSize: 12,
    color: '#E5E7EB',
    textAlign: 'center',
  },
});
