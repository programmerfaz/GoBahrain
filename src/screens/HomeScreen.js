import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  useWindowDimensions,
  Platform,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  InteractionManager,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Alert,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenContainer from '../components/ScreenContainer';
import ClientProfileModal from '../components/ClientProfileModal';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { ensureImageUrl } from '../utils/imageUrl';

const VOTER_ID_KEY = '@gobahrain_voter_id';

async function getVoterId() {
  try {
    let id = await AsyncStorage.getItem(VOTER_ID_KEY);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      await AsyncStorage.setItem(VOTER_ID_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Date.now()}`;
  }
}

const DOUBLE_TAP_DELAY = 350;
const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');

const PARTICLE_SIZE = 28;
const PARTICLE_COUNT = 14;
const BURST_EASING = Easing.out(Easing.cubic);

function getHomeStyles(colors) {
  const C = {
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    screenBg: colors.background,
    cardBg: colors.surface,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    border: colors.border,
    borderLight: colors.borderLight,
    openNow: colors.success,
    badge: colors.primary,
    pillBg: colors.borderLight,
    success: colors.success,
  };
  return {
    screen: { backgroundColor: C.screenBg },
    screenGradientWrap: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
    scrollToTopBtn: {
      position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center', zIndex: 8,
      ...Platform.select({ ios: { shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 }, android: { elevation: 8 } }),
    },
    scrollToTopGradient: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    headerFloatingWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      backgroundColor: C.screenBg,
    },
    headerBlur: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: Platform.OS === 'android' ? C.screenBg : 'transparent',
    },
    headerContent: {
      paddingBottom: 0,
    },
    instagramHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 44,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    instagramLogo: {
      fontSize: 20,
      fontWeight: '800',
      color: C.primary,
      letterSpacing: -0.5,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.cardBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: C.borderLight,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
        android: { elevation: 3 },
      }),
    },
    headerIconBtnActive: {
      backgroundColor: C.primaryLight || C.borderLight,
    },
    locationBtnInner: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationBtnRing: {
      position: 'absolute',
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      backgroundColor: 'transparent',
    },
    locationSuccessIconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBarContainer: {
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.cardBg,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 44,
      borderWidth: 1,
      borderColor: C.borderLight,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8 },
        android: { elevation: 3 },
      }),
    },
    searchText: {
      flex: 1,
      marginLeft: 8,
      fontSize: 14,
      color: C.textSecondary,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 14,
      color: C.textPrimary,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    },
    searchClearBtn: {
      marginLeft: 4,
      padding: 4,
    },
    aiSparkle: {
      marginLeft: 8,
      padding: 4,
    },
    filtersSection: {
      paddingTop: 0,
      paddingBottom: 0,
      minHeight: 0,
    },
    filtersScrollView: {
      flexGrow: 0,
      flex: 1,
    },
    filtersScroll: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      paddingRight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 60,
    },
    filterChipTouchable: {
      marginRight: 0,
    },
    filterChip: {
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    filterChipSelected: {
      opacity: 1,
    },
    filterCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: C.cardBg,
      borderWidth: 1.5,
      borderColor: C.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4 },
        android: { elevation: 2 },
      }),
    },
    filterCircleGradient: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
        android: { elevation: 4 },
      }),
    },
    filterLabel: {
      fontSize: 11,
      color: C.textSecondary,
      fontWeight: '600',
      textAlign: 'center',
    },
    filterLabelSelected: {
      fontWeight: '800',
      color: C.primary,
    },
    feedList: {
      flex: 1,
    },
    feedContent: {
      paddingVertical: 8,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: C.cardBg,
      marginHorizontal: 12,
      marginBottom: 18,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.borderLight,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 12 },
        android: { elevation: 5 },
      }),
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
    },
    cardAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    cardAvatarImage: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    cardHeaderInfo: {
      flex: 1,
    },
    cardHeaderUsername: {
      fontSize: 14,
      fontWeight: '700',
      color: C.textPrimary,
    },
    cardHeaderLocation: {
      fontSize: 11,
      color: C.textSecondary,
      marginTop: 0,
    },
    cardImageContainer: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: '#E2E8F0',
      overflow: 'hidden',
    },
    cardImage: {
      width: '100%',
      height: '100%',
      backgroundColor: C.pillBg,
    },
    cardFloatingBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    cardFloatingBadgeText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight: '600',
    },
    cardBody: {
      padding: 12,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    actionRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    igActionBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: C.border + '30',
    },
    upvoteCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: C.success,
    },
    upvoteCircleActive: {
      backgroundColor: C.success,
      borderColor: C.success,
    },
    igLikesLine: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textPrimary,
      marginBottom: 4,
    },
    igCaption: {
      fontSize: 13,
      color: C.textPrimary,
      lineHeight: 18,
    },
    igCaptionBold: {
      fontWeight: '700',
    },
    usernameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    username: { fontSize: 15, fontWeight: '600', color: C.textPrimary, marginRight: 4 },
    verifiedIcon: { marginLeft: 2 },
    locationRow: { flexDirection: 'row', alignItems: 'center' },
    location: { fontSize: 12, color: C.textSecondary, marginLeft: 4 },
    openNowPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.openNow, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
    openNowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', marginRight: 6 },
    openNowText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
    imageWrap: { position: 'relative', backgroundColor: C.pillBg },
    upvoteParticlesContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'none' },
    upvoteParticle: { position: 'absolute', left: 0, top: 0, justifyContent: 'center', alignItems: 'center' },
    upvoteParticleIconWrap: {
      width: PARTICLE_SIZE, height: PARTICLE_SIZE, borderRadius: PARTICLE_SIZE / 2, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
      ...Platform.select({ ios: { shadowColor: C.success, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4 }, android: { elevation: 6 } }),
    },
    description: { fontSize: 14, color: C.textSecondary, lineHeight: 20 },
    moreLessLink: { fontSize: 14, color: C.primary, fontWeight: '600' },
    khalidContextBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, backgroundColor: C.primary + '12', borderLeftWidth: 4, borderLeftColor: C.primary, borderRadius: 12, marginHorizontal: 0 },
    khalidContextBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.textPrimary },
    overlayRoot: { flex: 1, backgroundColor: 'transparent' },
    overlayBackdropWrap: { ...StyleSheet.absoluteFillObject },
    overlayBackdropDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
    overlayContentWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 72, paddingBottom: 32, alignItems: 'stretch' },
    overlayQuestionBlock: { marginBottom: 28, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' },
    overlayQuestionInner: { alignItems: 'center', maxWidth: 320 },
    overlayQuestionTitle: { fontSize: 36, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', lineHeight: 44, letterSpacing: 1.2, marginBottom: 14, ...Platform.select({ ios: { textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }, android: { elevation: 2 } }) },
    overlayQuestionAccent: { width: 56, height: 4, borderRadius: 2, backgroundColor: C.primary, opacity: 0.95, marginBottom: 16 },
    overlayQuestionSub: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.88)', textAlign: 'center', letterSpacing: 0.4, lineHeight: 22 },
    overlayOptionsWrap: { width: '100%', maxWidth: 400, alignSelf: 'center' },
    overlayOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    overlayOptionBlock: { width: '47%', minHeight: 56, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 },
    overlayOptionBlockText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
    overlayInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    overlayInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, fontSize: 16, color: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
    overlaySubmitBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
    pageContentWrap: { flex: 1 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyText: { marginTop: 12, fontSize: 16, color: C.textMuted, fontWeight: '500' },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: C.primary, borderRadius: 10 },
    retryBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  };
}

function UpvoteParticles({ visible, position, UPVOTE_COLOR, colors }) {
  const styles = StyleSheet.create(getHomeStyles(colors));
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: new Animated.Value(position?.x ?? WINDOW_WIDTH / 2),
      y: new Animated.Value(position?.y ?? WINDOW_HEIGHT / 2),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0.5),
    }))
  ).current;

  useEffect(() => {
    if (!visible || position?.x == null || position?.y == null) return;
    const startX = position.x ?? WINDOW_WIDTH / 2;
    const startY = position.y ?? WINDOW_HEIGHT / 2;
    const half = PARTICLE_SIZE / 2;
    const centerX = startX - half;
    const centerY = startY - half;

    particles.forEach((particle, index) => {
      if (!particle.x || !particle.y || !particle.opacity || !particle.scale) return;
      const angle = (index * 360) / particles.length + (index % 2) * 12;
      const distance = 80 + (index % 4) * 28;
      const radians = (angle * Math.PI) / 180;
      const endX = centerX + Math.cos(radians) * distance;
      const endY = centerY + Math.sin(radians) * distance - 50;

      particle.x.setValue(centerX);
      particle.y.setValue(centerY);
      particle.opacity.setValue(1);
      particle.scale.setValue(0.3);

      Animated.parallel([
        Animated.timing(particle.x, {
          toValue: endX,
          duration: 650,
          easing: BURST_EASING,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: endY,
          duration: 650,
          easing: BURST_EASING,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(particle.scale, {
            toValue: 1.15,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.5,
            duration: 530,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(particle.opacity, {
            toValue: 0,
            duration: 400,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    });
  }, [visible, position?.x, position?.y]);

  if (!visible) return null;

  return (
    <View style={styles.upvoteParticlesContainer} pointerEvents="none">
      {particles.map((particle) => (
        <Animated.View
          key={particle.id}
          style={[
            styles.upvoteParticle,
            {
              width: PARTICLE_SIZE,
              height: PARTICLE_SIZE,
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        >
          <View style={styles.upvoteParticleIconWrap}>
            <Ionicons name="arrow-up-circle" size={PARTICLE_SIZE} color={UPVOTE_COLOR || '#059669'} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}


/** Map overlay quick-option ids to search keywords for matching posts. */
const AI_OPTION_KEYWORDS = {
  nearby: ['nearby', 'location', 'area'],
  opennow: ['open', 'now', 'hours'],
  toprated: ['rating', 'best', 'top'],
  cafes: ['cafe', 'coffee', 'café', 'latte'],
  withaview: ['view', 'terrace', 'rooftop', 'sea'],
  food: ['food', 'eat', 'restaurant', 'burger', 'pizza', 'dish', 'meal', 'cuisine'],
};

function matchPostToQuery(post, q) {
  const lower = q.toLowerCase().trim();
  const desc = (post.description || '').toLowerCase();
  const business = (post.businessName || '').toLowerCase();
  const location = (post.location || '').toLowerCase();
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const tagStr = tags.join(' ').toLowerCase();
  if (desc.includes(lower) || business.includes(lower) || location.includes(lower)) return true;
  if (tags.some((t) => String(t).toLowerCase().includes(lower))) return true;
  if (tagStr.includes(lower)) return true;
  if (lower.length <= 2) return false;
  const words = lower.split(/\s+/).filter(Boolean);
  const allText = [desc, business, tagStr].join(' ');
  return words.every((w) => allText.includes(w));
}

function filterPostsBySearch(posts, searchQuery) {
  const q = (searchQuery || '').trim();
  if (!q) return posts;
  const keywords = AI_OPTION_KEYWORDS[q.toLowerCase()] || [q];
  return posts.filter((p) => {
    const text = [(p.description || ''), (p.businessName || ''), (p.location || ''), ...(p.tags || [])].join(' ').toLowerCase();
    if (keywords.length > 1) return keywords.some((kw) => text.includes(kw.toLowerCase()));
    return matchPostToQuery(p, q);
  });
}

/** Distance in km between two points (haversine). */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Sort posts by distance from user (closest first). Posts without coords go last. */
function sortPostsByDistance(posts, userLat, userLng) {
  if (!posts.length || userLat == null || userLng == null) return posts;
  return [...posts].sort((a, b) => {
    const latA = a.lat != null ? parseFloat(a.lat) : NaN;
    const lngA = a.lng != null ? parseFloat(a.lng) : (a.long != null ? parseFloat(a.long) : NaN);
    const latB = b.lat != null ? parseFloat(b.lat) : NaN;
    const lngB = b.lng != null ? parseFloat(b.lng) : (b.long != null ? parseFloat(b.long) : NaN);
    const hasA = !Number.isNaN(latA) && !Number.isNaN(lngA);
    const hasB = !Number.isNaN(latB) && !Number.isNaN(lngB);
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    const distA = haversineKm(userLat, userLng, latA, lngA);
    const distB = haversineKm(userLat, userLng, latB, lngB);
    return distA - distB;
  });
}

function choiceToPostId(choice, posts) {
  const q = (choice || '').trim().toLowerCase();
  if (!posts.length) return null;
  const keywords = AI_OPTION_KEYWORDS[q] || [q];
  const match = posts.find((p) => {
    const desc = (p.description || '').toLowerCase();
    const business = (p.businessName || '').toLowerCase();
    const tags = (p.tags || []).join(' ').toLowerCase();
    const combined = `${desc} ${business} ${tags}`;
    if (keywords.length > 1) return keywords.some((kw) => combined.includes(kw));
    return desc.includes(q) || business.includes(q) || tags.includes(q) || q.includes(desc.split(' ')[0]);
  });
  return match ? match.id : posts[0]?.id ?? null;
}

/** Fisher–Yates shuffle. Returns a new array in random order so the feed feels fresh each load. */
function shufflePosts(posts) {
  const arr = [...posts];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Instagram-style: Upvote (replaces Like), Share; no comment. Bookmark on right. Built in HomeScreen from theme. */

const NOTIFICATION_COUNT = 3;
const CARD_MARGIN_H = 16;
const CARD_PADDING = 14;

const DESC_COLLAPSED_LENGTH = 100; // ~2 lines

function PostCard({ item, isHighlighted = false, onHighlightDone, onUpvoteToggle, onClientPress, upvoteScaleAnim, styles, COLORS, ACTION_BUTTONS_LEFT, UPVOTE_COLOR }) {
  const { width } = useWindowDimensions();
  const imageWidth = width;
  const imageHeight = imageWidth; // Instagram: square 1:1

  const lastTapRef = useRef(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const hasUpvoted = item.hasUpvoted ?? false;
  const displayUpvotes = item.upvotes ?? 0;
  const highlightScale = useRef(new Animated.Value(1)).current;
  const highlightGlow = useRef(new Animated.Value(0)).current;

  // Double tap upvote animation
  const upvoteAnimScale = useRef(new Animated.Value(0)).current;
  const upvoteAnimOpacity = useRef(new Animated.Value(0)).current;
  const upvoteAnimTranslateY = useRef(new Animated.Value(0)).current;

  const animateUpvote = () => {
    upvoteAnimScale.setValue(0);
    upvoteAnimOpacity.setValue(0);
    upvoteAnimTranslateY.setValue(0);
    
    // Create a sequence of animations for a "cool" burst effect
    Animated.parallel([
      // Scale up with a spring "pop"
      Animated.spring(upvoteAnimScale, {
        toValue: 1.5,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      // Fade in quickly then out slowly
      Animated.sequence([
        Animated.timing(upvoteAnimOpacity, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(400),
        Animated.timing(upvoteAnimOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      // Float upwards
      Animated.timing(upvoteAnimTranslateY, {
        toValue: -50,
        duration: 850,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    ]).start();
  };

  useEffect(() => {
    if (!isHighlighted || !onHighlightDone) return;
    highlightScale.setValue(1);
    highlightGlow.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(highlightScale, {
          toValue: 1.02,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(highlightGlow, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(highlightScale, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(highlightGlow, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onHighlightDone?.();
    });
  }, [isHighlighted, onHighlightDone, highlightScale, highlightGlow]);

  const handleUpvotePress = (e) => {
    if (!hasUpvoted) {
      animateUpvote();
    }
    onUpvoteToggle?.(item, e);
  };

  const handleImagePress = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (!hasUpvoted) {
        animateUpvote();
      }
      onUpvoteToggle?.(item, e);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const glowOpacity = highlightGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.85],
  });

  return (
    <Animated.View
      style={[styles.card, { transform: [{ scale: highlightScale }] }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cardHighlightGlow,
          { opacity: glowOpacity, borderRadius: 24 },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cardHighlightBorder,
          { opacity: glowOpacity, borderRadius: 24 },
        ]}
      />
      <TouchableOpacity
        style={styles.cardHeader}
        activeOpacity={0.8}
        onPress={() => onClientPress?.(item)}
      >
        <View style={styles.cardAvatar}>
          {item.clientImage ? (
            <Image source={{ uri: item.clientImage }} style={styles.cardAvatarImage} resizeMode="cover" />
          ) : (
            <Ionicons name="storefront" size={20} color={COLORS.primary} />
          )}
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.cardHeaderUsername} numberOfLines={1}>
            {item.businessName || 'Business'}
          </Text>
          {item.location ? (
            <Text style={styles.cardHeaderLocation} numberOfLines={1}>
              {item.location}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity 
          style={styles.cardHeaderMore} 
          hitSlop={8}
          onPress={() => onClientPress?.(item)}
        >
          <Ionicons name="chevron-forward-circle-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
      <TouchableWithoutFeedback onPress={handleImagePress}>
        <View style={styles.cardImageContainer}>
          {item.imageUri ? (
            <Image
              source={{ uri: item.imageUri }}
              style={[styles.cardImage, { width: '100%', height: '100%' }]}
              resizeMode="cover"
              onLoad={() => console.log(`[PostCard] LOADED: ${item.imageUri}`)}
              onError={(e) => console.error(`[PostCard] ERROR: ${item.imageUri}`, e.nativeEvent.error)}
            />
          ) : (
            <View style={[styles.cardImage, { width: WINDOW_WIDTH, height: WINDOW_WIDTH, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="image-outline" size={48} color={COLORS.textMuted} />
            </View>
          )}
          
          <Animated.View 
            style={[
              StyleSheet.absoluteFill, 
              { 
                alignItems: 'center', 
                justifyContent: 'center', 
                opacity: upvoteAnimOpacity, 
                transform: [
                  { scale: upvoteAnimScale },
                  { translateY: upvoteAnimTranslateY }
                ] 
              }
            ]}
            pointerEvents="none"
          >
            <Ionicons name="arrow-up-circle" size={100} color="#FFFFFF" />
          </Animated.View>

          {item.priceRange ? (
            <View style={styles.cardFloatingBadge}>
              <Text style={styles.cardFloatingBadgeText}>{item.priceRange}</Text>
            </View>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
      <View style={styles.cardBody}>
        <View style={styles.actionRow}>
          <View style={styles.actionRowLeft}>
            {ACTION_BUTTONS_LEFT.map((btn) => {
              const isUpvote = btn.id === 'upvote';
              const isUpvoteActive = isUpvote && hasUpvoted;
              const iconName = isUpvote && hasUpvoted ? btn.iconFilled : btn.icon;
              const iconColor = isUpvote && hasUpvoted ? '#FFFFFF' : (isUpvote ? UPVOTE_COLOR : COLORS.textPrimary);
              
              const btnContent = (
                <TouchableOpacity
                  style={[
                    styles.igActionBtn,
                    isUpvote && isUpvoteActive && styles.upvoteCircleActive,
                    isUpvote && !isUpvoteActive && { borderColor: UPVOTE_COLOR, borderWidth: 1.5, backgroundColor: 'transparent' }
                  ]}
                  activeOpacity={0.7}
                  onPress={isUpvote ? handleUpvotePress : undefined}
                >
                  <Ionicons name={iconName} size={isUpvote ? 22 : 24} color={iconColor} />
                </TouchableOpacity>
              );
              
              return isUpvote && upvoteScaleAnim != null ? (
                <Animated.View key={btn.id} style={{ transform: [{ scale: upvoteScaleAnim }] }}>
                  {btnContent}
                </Animated.View>
              ) : (
                <View key={btn.id}>{btnContent}</View>
              );
            })}
          </View>
          <TouchableOpacity 
            style={[styles.igActionBtn, { backgroundColor: 'transparent' }]} 
            activeOpacity={0.7}
          >
            <Ionicons name="bookmark-outline" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
        {displayUpvotes > 0 ? (
          <Text style={styles.igLikesLine}>
            {displayUpvotes} {displayUpvotes === 1 ? 'upvote' : 'upvotes'}
          </Text>
        ) : null}
        {item.description ? (() => {
          const desc = item.description;
          const isLong = desc.length > DESC_COLLAPSED_LENGTH;
          const showTruncated = isLong && !descExpanded;
          const text = showTruncated ? desc.slice(0, DESC_COLLAPSED_LENGTH).trim() + '...' : desc;
          return (
            <Text style={styles.igCaption} numberOfLines={!isLong ? 2 : undefined}>
              <Text style={styles.igCaptionBold}>{item.businessName || 'Business'}</Text>
              {' '}{text}
              {isLong ? (
                <Text style={styles.moreLessLink} onPress={() => setDescExpanded(!descExpanded)}>
                  {descExpanded ? ' less' : ' more...'}
                </Text>
              ) : null}
            </Text>
          );
        })() : null}
      </View>
    </Animated.View>
  );
}

/** Animated category chip with scale-on-press and selected gradient (21st/AuraUI-style). */
function CategoryChip({ cat, selected, onPress, colors }) {
  const styles = StyleSheet.create(getHomeStyles(colors));
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 8,
    }).start();
  };
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.filterChipTouchable}
    >
      <Animated.View style={[styles.filterChip, selected && styles.filterChipSelected, { transform: [{ scale: scaleAnim }] }]}>
        {selected ? (
          <LinearGradient
            colors={[`${cat.color}E6`, cat.color]}
            style={styles.filterCircleGradient}
          >
            <Ionicons name={cat.icon} size={18} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={[styles.filterCircle, { borderColor: cat.color }]}>
            <Ionicons name={cat.icon} size={16} color={cat.color} />
          </View>
        )}
        <Text style={[styles.filterLabel, selected && styles.filterLabelSelected]} numberOfLines={1}>
          {cat.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const AI_QUICK_OPTIONS = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'opennow', label: 'Open now' },
  { id: 'toprated', label: 'Top rated' },
  { id: 'cafes', label: 'Cafes & coffee' },
  { id: 'withaview', label: 'With a view' },
  { id: 'food', label: 'Food & eats' },
];

const ESTIMATED_CARD_HEIGHT = 440;
const SMOOTH_SCROLL_DURATION_MS = 900;
const SCROLL_THRESHOLD = 80;
const SCROLL_DIRECTION_THRESHOLD = 5;
const HEADER_ANIM_DURATION = 300;
const SCROLL_TO_TOP_SHOW_AT = 400;
const SCROLL_TO_TOP_HIDE_AT = 80;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Wraps a feed item and runs a staggered fade-in + slide-up on mount. */
function StaggeredFeedItem({ index, children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    const delay = Math.min(index * 58, 420);
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [index]);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

function CoolRefreshControl({ scrollY, refreshing, topInset, colors }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (refreshing) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.setValue(0);
      rotateAnim.stopAnimation();
    }
  }, [refreshing]);

  const scale = scrollY.interpolate({
    inputRange: [-120, -60, 0],
    outputRange: [1.2, 1, 0],
    extrapolate: 'clamp',
  });

  const rotate = scrollY.interpolate({
    inputRange: [-150, 0],
    outputRange: ['360deg', '0deg'],
    extrapolate: 'clamp',
  });
  
  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const translateY = scrollY.interpolate({
    inputRange: [-150, 0],
    outputRange: [0, -50], // Move down slightly as you pull
    extrapolate: 'clamp',
  });

  return (
    <View style={{
      position: 'absolute',
      top: topInset + 10,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1, // Visible above background but below list content if possible, or just rely on list moving down
      pointerEvents: 'none'
    }}>
      <Animated.View style={{
        transform: [
          { translateY },
          { scale },
          { rotate: refreshing ? spin : rotate }
        ],
        opacity: scale
      }}>
        <View style={{
          width: 48, height: 48, borderRadius: 24,
          backgroundColor: colors.surface,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: colors.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
          borderWidth: 1, borderColor: colors.borderLight
        }}>
           <Ionicons name="airplane" size={26} color={colors.primary} />
        </View>
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { profile } = useAuth();

  const COLORS = useMemo(() => ({
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    screenBg: colors.background,
    cardBg: colors.surface,
    cardBgAlt: colors.borderLight,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    textMutedAlt: colors.textMuted,
    border: colors.border,
    borderAlt: colors.borderLight,
    openNow: colors.success,
    badge: colors.primary,
    pillBg: colors.borderLight,
  }), [colors]);

  const CATEGORIES = useMemo(() => [
    { id: 'nearby', label: 'Nearby', icon: 'location', color: colors.primary },
    { id: 'food', label: 'Food', icon: 'restaurant', color: colors.success },
    { id: 'hangout', label: 'Hangout', icon: 'pin', color: colors.afternoon },
    { id: 'trending', label: 'Trending', icon: 'trending-up', color: colors.morning },
    { id: 'opennow', label: 'Open Now', icon: 'time', color: colors.primary },
  ], [colors]);

  const ACTION_BUTTONS_LEFT = useMemo(() => [
    { id: 'upvote', icon: 'arrow-up', iconFilled: 'arrow-up-circle', color: colors.success },
    { id: 'share', icon: 'paper-plane-outline', iconFilled: 'paper-plane', color: colors.textPrimary },
  ], [colors]);

  const UPVOTE_COLOR = colors.success;
  const styles = useMemo(() => StyleSheet.create(getHomeStyles(colors)), [colors]);

  const [locationUpdating, setLocationUpdating] = useState(false);
  const [userPosition, setUserPosition] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('nearby');
  const locationBtnScale = useRef(new Animated.Value(1)).current;
  const locationBtnRingScale = useRef(new Animated.Value(1)).current;
  const locationBtnRingOpacity = useRef(new Animated.Value(0)).current;
  const locationSuccessOpacity = useRef(new Animated.Value(0)).current;
  const locationBtnBlinkOpacity = useRef(new Animated.Value(1)).current;
  const pageEntranceOpacity = useRef(new Animated.Value(0)).current;
  const pageEntranceScale = useRef(new Animated.Value(0.97)).current;
  const [showAIOverlay, setShowAIOverlay] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const searchInputRef = useRef(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const filtersSectionAnim = useRef(new Animated.Value(0)).current;
  const [upvoteParticlesVisible, setUpvoteParticlesVisible] = useState(false);
  const [upvoteParticlePosition, setUpvoteParticlePosition] = useState({ x: 0, y: 0 });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const lastPulseRef = useRef(0);
  const flatListRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollAnimationRef = useRef(null);
  const upvoteAnimations = useRef({}).current;
  const upvoteInFlightRef = useRef(new Set());
  const refreshingRef = useRef(false);
  const lastScrollY = useRef(0);
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const headerVisibleRef = useRef(true);
  // Reserve space so first post is not covered. Must match header: paddingTop (2) + title row (44) + search (52) + filters (84) + buffer
  const FILTERS_SECTION_EXPANDED_HEIGHT = 84;
  const HEADER_TITLE_ROW_HEIGHT = 44;
  const SEARCH_BAR_HEIGHT = 52; // searchHeight outputRange max
  const HEADER_TOP_PADDING = 2;
  const HEADER_BOTTOM_BUFFER = 20; // extra space below header before first post
  const headerBarHeight =
    insets.top +
    HEADER_TOP_PADDING +
    HEADER_TITLE_ROW_HEIGHT +
    (searchExpanded ? SEARCH_BAR_HEIGHT : 0) +
    (filtersExpanded ? FILTERS_SECTION_EXPANDED_HEIGHT : 0) +
    HEADER_BOTTOM_BUFFER;
  const khalidCommandRef = useRef(null);
  const [khalidContextBanner, setKhalidContextBanner] = useState(null);

  useEffect(() => {
    Animated.spring(searchAnim, {
      toValue: searchExpanded ? 1 : 0,
      useNativeDriver: false, // height/opacity don't support native driver
      tension: 50,
      friction: 8,
    }).start();
  }, [searchExpanded]);

  useEffect(() => {
    if (searchExpanded) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [searchExpanded]);

  useEffect(() => {
    Animated.spring(filtersSectionAnim, {
      toValue: filtersExpanded ? 1 : 0,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
  }, [filtersExpanded, filtersSectionAnim]);

  const toggleFilters = useCallback(() => {
    setFiltersExpanded((prev) => !prev);
  }, []);

  // Continuous blink for location icon so it stays noticeable
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(locationBtnBlinkOpacity, {
          toValue: 0.42,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(locationBtnBlinkOpacity, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [locationBtnBlinkOpacity]);

  // Page entrance: fade + scale when content is ready
  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(pageEntranceOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(pageEntranceScale, {
          toValue: 1,
          friction: 11,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading, pageEntranceOpacity, pageEntranceScale]);

  const toggleSearch = () => {
    setSearchExpanded(!searchExpanded);
  };

  const searchHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });

  const searchOpacity = searchAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  const filtersSectionHeight = filtersSectionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, FILTERS_SECTION_EXPANDED_HEIGHT],
  });
  const filtersSectionOpacity = filtersSectionAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  const filteredPosts = useMemo(() => {
    const bySearch = filterPostsBySearch(posts, searchQuery);
    if (userPosition?.latitude != null && userPosition?.longitude != null) {
      return sortPostsByDistance(bySearch, userPosition.latitude, userPosition.longitude);
    }
    return bySearch;
  }, [posts, searchQuery, userPosition?.latitude, userPosition?.longitude]);

  const fetchPosts = useCallback(async (opts = {}) => {
    const { skipGlobalLoading = false, onDone } = opts;
    try {
      setFetchError(null);
      if (!skipGlobalLoading) setLoading(true);
      console.log('[Home] Fetching posts from Supabase...');
      const { data: postRows, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('[Home] Supabase response:', { rowCount: postRows?.length ?? 0, error: error?.message ?? null });

      if (error) {
        console.error('[Home] Error fetching posts:', error.message, error);
        const errMsg = String(error?.message ?? error ?? '');
        const isNetworkError = /network request failed|failed to fetch|network error/i.test(errMsg);
        setFetchError(isNetworkError ? 'network' : errMsg || 'unknown');
        setPosts([]);
        if (!skipGlobalLoading) setLoading(false);
        onDone?.();
        return;
      }

      const rows = postRows || [];
      const clientIds = [...new Set(rows.map((r) => r.client_a_uuid).filter(Boolean))];
      let clientMap = {};

      if (clientIds.length > 0) {
        let clientRows = [];
        let clientError = null;
        const byId = await supabase.from('client').select('*').in('id', clientIds);
        if (byId.error || !byId.data?.length) {
          const byClientUuid = await supabase.from('client').select('*').in('client_a_uuid', clientIds);
          clientRows = byClientUuid.data || [];
          clientError = byClientUuid.error;
        } else {
          clientRows = byId.data;
          clientError = byId.error;
        }
        if (!clientError && clientRows.length) {
          clientRows.forEach((c) => {
            const id = c.id ?? c.client_a_uuid;
            if (id) clientMap[id] = c;
            if (c.client_a_uuid && c.client_a_uuid !== id) clientMap[c.client_a_uuid] = c;
          });
          console.log('[Home] Loaded clients:', clientRows.length, clientRows.map((c) => c.business_name || c.name || c.client_a_uuid));
        } else if (clientError) {
          console.warn('[Home] Client fetch failed (check RLS or table name "client"):', clientError.message);
        }
      }

      const mapped = rows.map((row) => {
        const client = clientMap[row.client_a_uuid] || null;
        const tags = client?.tags != null
          ? (Array.isArray(client.tags) ? client.tags : String(client.tags).split(',').map((t) => t.trim()).filter(Boolean))
          : [];
        const rating = client?.rating != null && client?.rating !== '' ? client.rating : null;
        const clientPrice = client?.price_range != null && client?.price_range !== '' ? client.price_range : null;
        const postPrice = row.price_range != null && row.price_range !== '' ? row.price_range : null;
        const priceRange = postPrice ?? clientPrice;
        const businessName = client?.business_name ?? client?.name ?? client?.business_name_ar ?? null;
        const rawClientImage = client?.client_image != null && String(client.client_image).trim() !== '' ? String(client.client_image).trim() : null;
        const clientImage = rawClientImage ? (ensureImageUrl(rawClientImage) || rawClientImage) : null;
        
        // Ensure post_image is a valid string/URI
        let imageUri = row.post_image;
        
        if (imageUri && typeof imageUri === 'string' && imageUri.startsWith('[{')) {
          try {
            const parsed = JSON.parse(imageUri);
            if (Array.isArray(parsed) && parsed[0]?.url) {
              imageUri = parsed[0].url;
            } else if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
              imageUri = parsed[0];
            }
          } catch (e) {
            console.warn('[Home] Failed to parse post_image JSON:', e);
          }
        }
        
        // If it's a relative path from Supabase storage, prepend the base URL
        if (imageUri && typeof imageUri === 'string' && !imageUri.startsWith('http')) {
          const cleanPath = imageUri.startsWith('gobahrain-post-images/') 
            ? imageUri.replace('gobahrain-post-images/', '') 
            : imageUri;
          imageUri = `https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/${cleanPath}`;
        }

        // Final check: if still no imageUri, use a placeholder or check if it's a direct Supabase path
        if (!imageUri && row.post_image) {
          imageUri = row.post_image;
        }

        const lat = client?.lat != null && client?.lat !== '' ? parseFloat(client.lat) : null;
        const lng = client?.long != null && client?.long !== '' ? parseFloat(client.long) : (client?.lng != null && client?.lng !== '' ? parseFloat(client.lng) : null);
        const hasCoords = lat != null && !Number.isNaN(lat) && lng != null && !Number.isNaN(lng);

        return {
          id: row.post_uuid,
          clientId: row.client_a_uuid,
          username: row.client_a_uuid?.slice(0, 8) ?? 'client',
          businessName: businessName ? String(businessName).trim() : null,
          clientImage,
          tags,
          rating,
          priceRange: priceRange != null ? `${priceRange} BHD` : '',
          verified: false,
          location: client?.location || client?.address || '',
          distance: '',
          lat: hasCoords ? lat : null,
          lng: hasCoords ? lng : null,
          imageUri: imageUri,
          openNow: false,
          upvotes: 0,
          hasUpvoted: false,
          description: row.description || '',
        };
      });

      const postIds = mapped.map((p) => p.id);
      const voterId = await getVoterId();
      let upvoteCounts = {};
      let myUpvotedIds = new Set();

      if (postIds.length > 0) {
        const { data: upvoteRows } = await supabase
          .from('post_upvote')
          .select('post_uuid, voter_id')
          .in('post_uuid', postIds);
        if (upvoteRows?.length) {
          upvoteRows.forEach((r) => {
            upvoteCounts[r.post_uuid] = (upvoteCounts[r.post_uuid] || 0) + 1;
            if (r.voter_id === voterId) myUpvotedIds.add(r.post_uuid);
          });
        }
      }

      mapped.forEach((p) => {
        p.upvotes = upvoteCounts[p.id] ?? 0;
        p.hasUpvoted = myUpvotedIds.has(p.id);
      });

      console.log('[Home] Mapped posts:', mapped.length, mapped.map((p) => p.id));
      const fallbackPosts = [
        { id: '28e92d6c-b228-47d0-ac58-7481af618f45', clientId: 'e2885f06-b664-4d00-81b9-650828c2ed6f', username: 'e2885f06', businessName: null, tags: [], rating: null, priceRange: '0.100 BHD', verified: false, location: '', distance: '', imageUri: 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/e2885f06-b664-4d00-81b9-650828c2ed6f/a2c53cb8-a5cd-4299-bf01-e2760faf47c2.jpeg', openNow: false, upvotes: 0, hasUpvoted: false, description: 'karak' },
        { id: 'a11f9c80-a5dc-490d-807d-5ae4bb84ded6', clientId: '40e1cc11-034f-41c8-bc3b-267e705d72d9', username: '40e1cc11', businessName: null, tags: [], rating: null, priceRange: '3.5 BHD', verified: false, location: '', distance: '', imageUri: 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/40e1cc11-034f-41c8-bc3b-267e705d72d9/9550a0f4-aa62-43bd-b765-7c1cb1ca0489.webp', openNow: false, upvotes: 0, hasUpvoted: false, description: 'chessy cheesy burger' },
        { id: 'c86ef509-9f55-4134-8e1e-e20b6821b97e', clientId: '40e1cc11-034f-41c8-bc3b-267e705d72d9', username: '40e1cc11', businessName: null, tags: [], rating: null, priceRange: '2 BHD', verified: false, location: '', distance: '', imageUri: 'https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/40e1cc11-034f-41c8-bc3b-267e705d72d9/a5f2d5dd-2260-4c7e-b3ea-bda3d7755501.jpeg', openNow: false, upvotes: 0, hasUpvoted: false, description: 'try new sizzling burger' },
      ];
      const list = mapped.length > 0 ? mapped : fallbackPosts;
      setPosts(shufflePosts(list));
    } catch (err) {
      console.error('[Home] Failed to fetch posts:', err);
      const errMsg = String(err?.message ?? err ?? '');
      const isNetworkError = /network request failed|failed to fetch|network error/i.test(errMsg);
      setFetchError(isNetworkError ? 'network' : errMsg || 'unknown');
      setPosts([]);
    } finally {
      if (!skipGlobalLoading) setLoading(false);
      onDone?.();
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    fetchPosts({
      skipGlobalLoading: true,
      onDone: () => {
        setRefreshing(false);
        refreshingRef.current = false;
      },
    });
  }, [fetchPosts]);

  const handleUpvoteToggle = useCallback(async (post, event) => {
    const adding = !post.hasUpvoted;
    if (upvoteInFlightRef.current.has(post.id)) return;
    upvoteInFlightRef.current.add(post.id);

    if (!upvoteAnimations[post.id]) upvoteAnimations[post.id] = { scale: new Animated.Value(1) };
    const scaleAnim = upvoteAnimations[post.id].scale;

    // Update count and state immediately so the UI feels instant
    const newCount = Math.max(0, post.upvotes + (adding ? 1 : -1));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, hasUpvoted: adding, upvotes: newCount } : p
      )
    );

    if (event?.nativeEvent) {
      const { pageX, pageY } = event.nativeEvent;
      setUpvoteParticlePosition({ x: pageX, y: pageY });
    }
    if (adding) {
      setUpvoteParticlesVisible(true);
      setTimeout(() => setUpvoteParticlesVisible(false), 1000);
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.18,
          tension: 280,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 260,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.92,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 260,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    }

    try {
      const voterId = await getVoterId();
      if (adding) {
        const { error } = await supabase.from('post_upvote').insert({ post_uuid: post.id, voter_id: voterId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_upvote').delete().eq('post_uuid', post.id).eq('voter_id', voterId);
        if (error) throw error;
      }
    } catch (err) {
      console.warn('[Home] Upvote failed:', err?.message ?? err);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, hasUpvoted: !adding, upvotes: post.upvotes } : p
        )
      );
    } finally {
      upvoteInFlightRef.current.delete(post.id);
    }
  }, [upvoteAnimations]);

  const overlayBackdropOpacity = useRef(new Animated.Value(0)).current;
  const overlayContentScale = useRef(new Animated.Value(0.92)).current;
  const overlayContentOpacity = useRef(new Animated.Value(0)).current;
  const overlayTitleOpacity = useRef(new Animated.Value(0)).current;
  const overlayTitleTranslateY = useRef(new Animated.Value(12)).current;
  const overlayChipsOpacity = useRef(new Animated.Value(0)).current;
  const overlayChipsTranslateY = useRef(new Animated.Value(14)).current;
  const overlayInputOpacity = useRef(new Animated.Value(0)).current;
  const overlayInputTranslateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const pulse = route.params?.aiPulse;
    if (pulse && pulse !== lastPulseRef.current) {
      lastPulseRef.current = pulse;
      setShowAIOverlay(true);
      setCustomQuery('');
    }
  }, [route.params?.aiPulse]);

  // When Khalid assistant asks to highlight a post, store the command and act once posts are available
  useEffect(() => {
    const fromKhalid = route.params?.fromKhalid;
    if (!fromKhalid || fromKhalid.type !== 'highlight_post') return;
    khalidCommandRef.current = fromKhalid;
  }, [route.params?.fromKhalid]);

  // Open client profile when navigating from AR "View profile"
  useEffect(() => {
    const openClientId = route.params?.openClientId;
    if (!openClientId) return;
    setSelectedClientId(openClientId);
    navigation.setParams({ openClientId: undefined });
  }, [route.params?.openClientId, navigation]);

  useEffect(() => {
    if (!khalidCommandRef.current || posts.length === 0) return;
    const cmd = khalidCommandRef.current;
    khalidCommandRef.current = null;
    const resolved = (cmd.query || '').trim();
    if (!resolved) return;
    const postId = choiceToPostId(resolved, posts);
    if (!postId) return;

    setKhalidContextBanner(resolved);
    const bannerTimeout = setTimeout(() => setKhalidContextBanner(null), 5000);

    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        const idx = posts.findIndex((p) => p.id === postId);
        if (flatListRef.current && idx >= 0) {
          smoothScrollToIndex(idx, () => setHighlightedPostId(postId));
        } else {
          setHighlightedPostId(postId);
        }
      }, 120);
    });

    navigation.setParams({ fromKhalid: undefined });
    return () => clearTimeout(bannerTimeout);
  }, [posts, navigation, flatListRef, smoothScrollToIndex, setHighlightedPostId]);

  useEffect(() => {
    if (!showAIOverlay) {
      overlayBackdropOpacity.setValue(0);
      overlayContentScale.setValue(0.92);
      overlayContentOpacity.setValue(0);
      overlayTitleOpacity.setValue(0);
      overlayTitleTranslateY.setValue(12);
      overlayChipsOpacity.setValue(0);
      overlayChipsTranslateY.setValue(14);
      overlayInputOpacity.setValue(0);
      overlayInputTranslateY.setValue(14);
      return;
    }
    overlayTitleOpacity.setValue(0);
    overlayTitleTranslateY.setValue(12);
    overlayChipsOpacity.setValue(0);
    overlayChipsTranslateY.setValue(14);
    overlayInputOpacity.setValue(0);
    overlayInputTranslateY.setValue(14);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(overlayBackdropOpacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(overlayContentScale, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayContentOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.stagger(80, [
        Animated.parallel([
          Animated.timing(overlayTitleOpacity, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(overlayTitleTranslateY, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(overlayChipsOpacity, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(overlayChipsTranslateY, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(overlayInputOpacity, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(overlayInputTranslateY, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [
    showAIOverlay,
    overlayBackdropOpacity,
    overlayContentScale,
    overlayContentOpacity,
    overlayTitleOpacity,
    overlayTitleTranslateY,
    overlayChipsOpacity,
    overlayChipsTranslateY,
    overlayInputOpacity,
    overlayInputTranslateY,
  ]);

  const closeOverlayWithAnimation = (then) => {
    Animated.parallel([
      Animated.timing(overlayBackdropOpacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(overlayContentScale, {
        toValue: 0.95,
        duration: 300,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(overlayContentOpacity, {
        toValue: 0,
        duration: 250,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowAIOverlay(false);
      then?.();
    });
  };

  const smoothScrollToIndex = (index, onDone) => {
    if (scrollAnimationRef.current != null) return;
    const list = flatListRef.current;
    if (!list) {
      onDone?.();
      return;
    }
    const startOffset = scrollOffsetRef.current;
    const targetOffset = Math.max(0, index * ESTIMATED_CARD_HEIGHT - 60);
    const startTime = { current: null };
    const animate = () => {
      if (startTime.current == null) startTime.current = Date.now();
      const elapsed = Date.now() - startTime.current;
      const t = Math.min(elapsed / SMOOTH_SCROLL_DURATION_MS, 1);
      const eased = easeInOutCubic(t);
      const offset = startOffset + (targetOffset - startOffset) * eased;
      list.scrollToOffset({ offset, animated: false });
      if (t < 1) {
        scrollAnimationRef.current = requestAnimationFrame(animate);
      } else {
        scrollAnimationRef.current = null;
        onDone?.();
      }
    };
    scrollAnimationRef.current = requestAnimationFrame(animate);
  };

  const handleAISubmit = (choice) => {
    const isQuickOption = typeof choice === 'string' && AI_QUICK_OPTIONS.some((o) => o.id === choice);
    const nextQuery = isQuickOption ? choice : (customQuery.trim() || (typeof choice === 'string' ? choice : ''));
    setSearchQuery(nextQuery);
    setCustomQuery('');
    const nextFiltered = filterPostsBySearch(posts, nextQuery);
    closeOverlayWithAnimation(() => {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          if (nextFiltered.length > 0 && flatListRef.current) {
            smoothScrollToIndex(0, () => setHighlightedPostId(nextFiltered[0].id));
          } else {
            setHighlightedPostId(null);
          }
        }, 150);
      });
    });
  };

  const scrollY = useRef(new Animated.Value(0)).current;
  const handleScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: true, // Use native driver for performance
          listener: (e) => {
            const y = e.nativeEvent.contentOffset.y;
            const diff = y - lastScrollY.current;
            lastScrollY.current = y;
            scrollOffsetRef.current = y;

            if (y > SCROLL_TO_TOP_SHOW_AT) setShowScrollToTop(true);
            else if (y < SCROLL_TO_TOP_HIDE_AT) setShowScrollToTop(false);

            if (diff > SCROLL_DIRECTION_THRESHOLD && y > SCROLL_THRESHOLD && headerVisibleRef.current) {
              headerVisibleRef.current = false;
              Animated.timing(headerTranslateY, {
                toValue: -headerBarHeight,
                duration: HEADER_ANIM_DURATION,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            } else if (diff < -SCROLL_DIRECTION_THRESHOLD && !headerVisibleRef.current) {
              headerVisibleRef.current = true;
              Animated.timing(headerTranslateY, {
                toValue: 0,
                duration: HEADER_ANIM_DURATION,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }
          },
        }
      ),
    [scrollY, headerTranslateY, headerBarHeight]
  );

  const scrollToTop = useCallback(() => {
    headerVisibleRef.current = true;
    Animated.timing(headerTranslateY, {
      toValue: 0,
      duration: HEADER_ANIM_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowScrollToTop(false);
  }, [headerTranslateY]);

  const handleUpdateLocation = useCallback(async () => {
    const userRow = profile?.user;
    const userUuid = userRow?.user_a_uuid;
    if (!userUuid) {
      Alert.alert('Location', 'Sign in as a user to save your location.');
      return;
    }
    setLocationUpdating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location', 'Permission denied. Enable location in Settings to save your position.');
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = coords;
      let areaLabel = '';
      try {
        const [rev] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (rev?.city || rev?.district || rev?.street) {
          areaLabel = [rev.district, rev.city, rev.street].filter(Boolean).join(', ') || '';
        }
      } catch (_) {}
      const { error } = await supabase
        .from('user')
        .update({ lat: latitude, long: longitude })
        .eq('user_a_uuid', userUuid);
      if (error) throw error;

      // Animate list reorder (closest first)
      LayoutAnimation.configureNext(
        LayoutAnimation.create(320, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
      );
      setUserPosition({ latitude, longitude });
      // Scroll to top after reorder so the closest place is visible
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);
      });

      // Cool button animation: pulse + radar ring
      locationBtnRingOpacity.setValue(0.7);
      locationBtnRingScale.setValue(1);
      locationSuccessOpacity.setValue(0);
      Animated.sequence([
        Animated.parallel([
          Animated.spring(locationBtnScale, {
            toValue: 1.35,
            useNativeDriver: true,
            friction: 6,
            tension: 200,
          }),
          Animated.timing(locationBtnRingOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(locationBtnRingScale, {
            toValue: 2.2,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
        ]),
        Animated.spring(locationBtnScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 7,
          tension: 120,
        }),
        Animated.sequence([
          Animated.timing(locationSuccessOpacity, {
            toValue: 1,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.delay(600),
          Animated.timing(locationSuccessOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      if (areaLabel) {
        Alert.alert('Location saved', `You're in ${areaLabel}. Coordinates saved.`);
      } else {
        Alert.alert('Location saved', `Lat ${latitude.toFixed(4)}, Long ${longitude.toFixed(4)} saved.`);
      }
    } catch (e) {
      Alert.alert('Location', e?.message ?? 'Could not get or save location.');
    } finally {
      setLocationUpdating(false);
    }
  }, [profile?.user?.user_a_uuid, locationBtnScale, locationBtnRingScale, locationBtnRingOpacity, locationSuccessOpacity]);

  return (
    <ScreenContainer style={styles.screen}>
      <View style={styles.screenGradientWrap} pointerEvents="none">
        <LinearGradient
          colors={[COLORS.screenBg, '#F1F5F9', COLORS.screenBg]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Animated.View
        style={[
          styles.headerFloatingWrap,
          { paddingTop: insets.top + 2, transform: [{ translateY: headerTranslateY }] },
        ]}
        pointerEvents="box-none"
      >
        <BlurView intensity={Platform.OS === 'ios' ? 80 : 0} tint={colors.mode === 'dark' ? 'dark' : 'light'} style={styles.headerBlur} />
        <View style={styles.headerContent}>
          <View style={styles.instagramHeader}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={handleUpdateLocation}
              disabled={locationUpdating}
              activeOpacity={0.7}
            >
              <View style={styles.locationBtnInner}>
                <Animated.View
                  style={[
                    styles.locationBtnRing,
                    {
                      transform: [{ scale: locationBtnRingScale }],
                      opacity: locationBtnRingOpacity,
                      borderColor: COLORS.primary,
                    },
                  ]}
                />
                <Animated.View style={{ transform: [{ scale: locationBtnScale }] }}>
                  {locationUpdating ? (
                    <ActivityIndicator size="small" color={COLORS.textPrimary} />
                  ) : (
                    <>
                      <Animated.View
                        style={{
                          opacity: Animated.multiply(
                            Animated.subtract(1, locationSuccessOpacity),
                            locationBtnBlinkOpacity
                          ),
                        }}
                      >
                        <Ionicons name="location-outline" size={24} color={COLORS.textPrimary} />
                      </Animated.View>
                      <Animated.View
                        style={[
                          StyleSheet.absoluteFill,
                          styles.locationSuccessIconWrap,
                          { opacity: locationSuccessOpacity },
                        ]}
                        pointerEvents="none"
                      >
                        <Ionicons name="location" size={24} color={COLORS.primary} />
                      </Animated.View>
                    </>
                  )}
                </Animated.View>
              </View>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.instagramLogo}>Go Bahrain</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.headerIconBtn, filtersExpanded && styles.headerIconBtnActive]}
                activeOpacity={0.7}
                onPress={toggleFilters}
              >
                <Ionicons
                  name={filtersExpanded ? "options" : "options-outline"}
                  size={24}
                  color={filtersExpanded ? COLORS.primary : COLORS.textPrimary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerIconBtn}
                activeOpacity={0.7}
                onPress={toggleSearch}
              >
                <Ionicons name={searchExpanded ? "close-outline" : "search-outline"} size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <Animated.View 
            style={[
              styles.searchBarContainer, 
              { 
                height: searchHeight,
                opacity: searchOpacity,
                overflow: 'hidden'
              }
            ]}
          >
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={20} color={COLORS.textSecondary} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Search places, food, tags…"
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (filteredPosts.length > 0 && flatListRef.current) {
                    smoothScrollToIndex(0, () => setHighlightedPostId(filteredPosts[0].id));
                  }
                }}
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => { setSearchQuery(''); setHighlightedPostId(null); }}
                  hitSlop={8}
                  style={styles.searchClearBtn}
                >
                  <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowAIOverlay(true)}
                  hitSlop={8}
                  style={styles.aiSparkle}
                >
                  <Ionicons name="sparkles" size={18} color={COLORS.primary} />
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.filtersSection,
              {
                height: filtersSectionHeight,
                opacity: filtersSectionOpacity,
                overflow: 'hidden',
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersScroll}
              style={styles.filtersScrollView}
            >
              {CATEGORIES.map((cat) => {
                const selected = selectedCategory === cat.id;
                return (
                <CategoryChip
                  key={cat.id}
                  cat={cat}
                  selected={selected}
                  onPress={() => setSelectedCategory(cat.id)}
                  colors={colors}
                />
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Animated.View>

      <CoolRefreshControl 
        scrollY={scrollY} 
        refreshing={refreshing} 
        topInset={headerBarHeight} 
        colors={colors} 
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
      <Animated.View
        style={[
          styles.pageContentWrap,
          {
            opacity: pageEntranceOpacity,
            transform: [{ scale: pageEntranceScale }],
          },
        ]}
      >
      {posts.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Ionicons
            name={fetchError ? 'cloud-offline-outline' : 'images-outline'}
            size={48}
            color={COLORS.textMuted}
          />
          <Text style={styles.emptyText}>
            {fetchError === 'network'
              ? 'Check your connection and try again'
              : fetchError
                ? 'Something went wrong'
                : 'No posts yet'}
          </Text>
          {fetchError ? (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchPosts()}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : searchQuery.trim() && filteredPosts.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No results for "{searchQuery.trim()}"</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setSearchQuery(''); setHighlightedPostId(null); }}
            activeOpacity={0.8}
          >
            <Text style={styles.retryBtnText}>Clear search</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.FlatList
          ref={flatListRef}
          data={filteredPosts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            if (!upvoteAnimations[item.id]) upvoteAnimations[item.id] = { scale: new Animated.Value(1) };
            return (
              <StaggeredFeedItem index={index}>
                <PostCard
                  item={item}
                  isHighlighted={item.id === highlightedPostId}
                  onHighlightDone={() => setHighlightedPostId(null)}
                  onUpvoteToggle={handleUpvoteToggle}
                  onClientPress={(post) => post?.clientId && setSelectedClientId(post.clientId)}
                  upvoteScaleAnim={upvoteAnimations[item.id].scale}
                  styles={styles}
                  COLORS={COLORS}
                  ACTION_BUTTONS_LEFT={ACTION_BUTTONS_LEFT}
                  UPVOTE_COLOR={UPVOTE_COLOR}
                />
              </StaggeredFeedItem>
            );
          }}
          ListHeaderComponent={
            <>
              {khalidContextBanner ? (
                <View style={styles.khalidContextBanner}>
                  <Ionicons name="sparkles" size={16} color={COLORS.primary} />
                  <Text style={styles.khalidContextBannerText} numberOfLines={1}>
                    Khalid showed you: {khalidContextBanner}
                  </Text>
                  <TouchableOpacity onPress={() => setKhalidContextBanner(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {refreshing ? null : null}
            </>
          }
          contentContainerStyle={[styles.feedContent, { paddingTop: headerBarHeight }]}
          style={styles.feedList}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={() => {}}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['transparent']} 
              tintColor="transparent"
              progressBackgroundColor="transparent"
              style={{ backgroundColor: 'transparent' }}
            />
          }
        />
      )}
      </Animated.View>
      )}

      <ClientProfileModal
        visible={!!selectedClientId}
        clientId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
        insets={insets}
        onOpenARNavigate={(dest) => {
          setSelectedClientId(null);
          navigation.navigate('AR', { navigateTo: dest });
        }}
      />

      {/* AI overlay: glass, question + block options */}
      <Modal visible={showAIOverlay} transparent animationType="none">
        <KeyboardAvoidingView
          style={styles.overlayRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.overlayBackdropWrap, { opacity: overlayBackdropOpacity }]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.overlayBackdropDim} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => closeOverlayWithAnimation()}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.overlayContentWrap,
              {
                opacity: overlayContentOpacity,
                transform: [{ scale: overlayContentScale }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.overlayQuestionBlock,
                {
                  opacity: overlayTitleOpacity,
                  transform: [{ translateY: overlayTitleTranslateY }],
                },
              ]}
            >
              <View style={styles.overlayQuestionInner}>
                <Text style={styles.overlayQuestionTitle}>What are you looking for?</Text>
                <View style={styles.overlayQuestionAccent} />
                <Text style={styles.overlayQuestionSub}>Choose an option or type your own</Text>
              </View>
            </Animated.View>

            <Animated.View
              style={[
                styles.overlayOptionsWrap,
                {
                  opacity: overlayChipsOpacity,
                  transform: [{ translateY: overlayChipsTranslateY }],
                },
              ]}
            >
              <View style={styles.overlayOptionsGrid}>
                {AI_QUICK_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={styles.overlayOptionBlock}
                    activeOpacity={0.8}
                    onPress={() => handleAISubmit(opt.id)}
                  >
                    <Text style={styles.overlayOptionBlockText}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Animated.View
                style={[
                  styles.overlayInputRow,
                  {
                    opacity: overlayInputOpacity,
                    transform: [{ translateY: overlayInputTranslateY }],
                  },
                ]}
              >
                <TextInput
                  style={styles.overlayInput}
                  placeholder="Or type something…"
                  placeholderTextColor="rgba(255,255,255,0.65)"
                  value={customQuery}
                  onChangeText={setCustomQuery}
                  onSubmitEditing={() => handleAISubmit(null)}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.overlaySubmitBtn}
                  activeOpacity={0.8}
                  onPress={() => handleAISubmit(null)}
                >
                  <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
      <UpvoteParticles visible={upvoteParticlesVisible} position={upvoteParticlePosition} UPVOTE_COLOR={UPVOTE_COLOR} colors={colors} />
      {!loading && posts.length > 0 && showScrollToTop ? (
        <TouchableOpacity
          style={[styles.scrollToTopBtn, { bottom: 24 + insets.bottom }]}
          onPress={scrollToTop}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[colors.primaryLight, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.scrollToTopGradient}
          >
            <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      ) : null}
    </ScreenContainer>
  );
}

