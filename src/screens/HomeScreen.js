import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Image,
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
import { useUserPreferences } from '../context/UserPreferencesContext';
import { useDoorTransition } from '../context/DoorTransitionContext';
import { supabase } from '../config/supabase';
import { ensureImageUrl } from '../utils/imageUrl';
import { fetchFeedPage, trackInteraction, getVoterId, clearFeedCache } from '../services/feedService';
import { LUXURY, luxuryCardShadow, luxurySoftShadow } from '../theme/luxuryPremium';
import { PinchZoomPostImage, UpvoteParticles } from '../components/FeedUpvoteInteractions';

const { width: WINDOW_WIDTH } = Dimensions.get('window');

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
      zIndex: 0,
      backgroundColor: Platform.OS === 'android' ? C.screenBg : 'transparent',
    },
    headerContent: {
      paddingBottom: 0,
      position: 'relative',
      zIndex: 2,
      ...Platform.select({
        android: { elevation: 14 },
        ios: {},
      }),
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
      borderRadius: 20,
      backgroundColor: C.cardBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: C.borderLight,
      ...luxurySoftShadow,
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
      borderRadius: LUXURY.radiusInput,
      paddingHorizontal: 14,
      height: 44,
      borderWidth: 1,
      borderColor: C.borderLight,
      ...luxurySoftShadow,
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
      width: '100%',
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
      ...luxurySoftShadow,
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
        ios: { shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10 },
        android: { elevation: 5 },
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
    /** Shadow/elevation on outer so inner can clip zoomed images (Android breaks clip when both are on one view). */
    cardOuter: {
      marginHorizontal: 12,
      marginBottom: 20,
      borderRadius: LUXURY.radiusCard,
      ...luxuryCardShadow,
    },
    cardInner: {
      backgroundColor: C.cardBg,
      borderRadius: LUXURY.radiusCard,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.borderLight,
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

/** Same formula as feedService (km) for consistent “Nearby” ordering on the client. */
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

/** Apply home feed chip ordering using fields we actually have on each post. */
function applyFeedSort(posts, feedMode, userPosition) {
  const list = [...posts];
  const lat = userPosition?.latitude;
  const lng = userPosition?.longitude;
  const hasUserCoords = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);

  if (feedMode === 'popular') {
    return list.sort((a, b) => {
      const up = (b.upvotes ?? 0) - (a.upvotes ?? 0);
      if (up !== 0) return up;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }

  if (feedMode === 'recent') {
    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  if (feedMode === 'nearby' && hasUserCoords) {
    return list.sort((a, b) => {
      if (a.lat == null || a.lng == null) return 1;
      if (b.lat == null || b.lng == null) return -1;
      return haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng);
    });
  }

  if (feedMode === 'photos') {
    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  return list;
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

/** Instagram-style: Upvote (replaces Like), Share; no comment. Bookmark on right. Built in HomeScreen from theme. */

const NOTIFICATION_COUNT = 3;
const CARD_MARGIN_H = 16;
const CARD_PADDING = 14;

const DESC_COLLAPSED_LENGTH = 100; // ~2 lines

function PostCard({ item, isHighlighted = false, onHighlightDone, onUpvoteToggle, onClientPress, upvoteScaleAnim, styles, COLORS, ACTION_BUTTONS_LEFT, UPVOTE_COLOR }) {
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

  const handleImageDoubleTap = (pageX, pageY) => {
    if (!hasUpvoted) {
      animateUpvote();
    }
    onUpvoteToggle?.(item, { nativeEvent: { pageX, pageY } });
  };

  const glowOpacity = highlightGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.85],
  });

  return (
    <Animated.View
      style={[styles.cardOuter, { transform: [{ scale: highlightScale }] }]}
    >
      <Animated.View style={styles.cardInner}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cardHighlightGlow,
          { opacity: glowOpacity, borderRadius: LUXURY.radiusCard },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cardHighlightBorder,
          { opacity: glowOpacity, borderRadius: LUXURY.radiusCard },
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
      <View style={styles.cardImageContainer} collapsable={false}>
        {item.imageUri ? (
          <PinchZoomPostImage
            uri={item.imageUri}
            style={[styles.cardImage, { width: '100%', height: '100%' }]}
            onImageDoubleTap={handleImageDoubleTap}
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
                { translateY: upvoteAnimTranslateY },
              ],
            },
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
function StaggeredFeedItem({ index, children, isRefreshing = false }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  
  useEffect(() => {
    // Reset animations
    opacity.setValue(0);
    translateY.setValue(24);
    scale.setValue(0.95);
    
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
        Animated.spring(translateY, {
          toValue: 0,
          tension: 120,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: 140,
          friction: 9,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [index, isRefreshing]);
  
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      {children}
    </Animated.View>
  );
}

function CoolRefreshControl({ scrollY, refreshing, topInset, colors }) {
  const spinValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;
  const dotsRotate = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (refreshing) {
      // Smooth continuous spin
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
      
      // Pulse effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleValue, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleValue, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Orbiting dots
      Animated.loop(
        Animated.timing(dotsRotate, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
      scaleValue.setValue(1);
      dotsRotate.setValue(0);
      spinValue.stopAnimation();
      scaleValue.stopAnimation();
      dotsRotate.stopAnimation();
    }
  }, [refreshing, spinValue, scaleValue, dotsRotate]);

  const scale = scrollY.interpolate({
    inputRange: [-120, -60, 0],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  const pullRotate = scrollY.interpolate({
    inputRange: [-150, 0],
    outputRange: ['360deg', '0deg'],
    extrapolate: 'clamp',
  });
  
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });
  
  const dotsRotation = dotsRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const translateY = scrollY.interpolate({
    inputRange: [-150, 0],
    outputRange: [10, -50],
    extrapolate: 'clamp',
  });

  return (
    <View style={{
      position: 'absolute',
      top: topInset + 20,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
      pointerEvents: 'none'
    }}>
      <Animated.View style={{
        transform: [{ translateY }, { scale }],
        opacity: scale
      }}>
        <Animated.View style={{
          transform: [
            { scale: scaleValue },
            { rotate: refreshing ? spin : pullRotate }
          ]
        }}>
          {/* Main gradient circle */}
          <View style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            ...Platform.select({
              ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
              },
              android: {
                elevation: 6,
              }
            })
          }}>
            <LinearGradient
              colors={[colors.primary, colors.primaryLight || colors.primary, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {refreshing ? (
                <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                  {/* Three dots loader */}
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' }} />
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF', opacity: 0.7 }} />
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF', opacity: 0.4 }} />
                  </View>
                </View>
              ) : (
                <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
              )}
            </LinearGradient>
          </View>
          
          {/* Orbiting dots when refreshing */}
          {refreshing && (
            <Animated.View style={{
              position: 'absolute',
              width: 70,
              height: 70,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: dotsRotation }]
            }}>
              {[0, 120, 240].map((angle, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.primary,
                    opacity: 0.6,
                    transform: [
                      { translateX: Math.cos((angle * Math.PI) / 180) * 35 },
                      { translateY: Math.sin((angle * Math.PI) / 180) * 35 },
                    ]
                  }}
                />
              ))}
            </Animated.View>
          )}
        </Animated.View>
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
  const { preferences } = useUserPreferences();
  const { isAwaitingHomeOpen, notifyHomeReady } = useDoorTransition();

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
    { id: 'all', label: 'For you', icon: 'sparkles', color: colors.primary },
    { id: 'nearby', label: 'Nearby', icon: 'navigate', color: colors.success },
    { id: 'popular', label: 'Popular', icon: 'flame', color: colors.morning },
    { id: 'recent', label: 'New', icon: 'time', color: colors.afternoon },
    { id: 'photos', label: 'Photos', icon: 'images', color: colors.primary },
  ], [colors]);

  const ACTION_BUTTONS_LEFT = useMemo(() => [
    { id: 'upvote', icon: 'arrow-up', iconFilled: 'arrow-up-circle', color: colors.success },
    { id: 'share', icon: 'paper-plane-outline', iconFilled: 'paper-plane', color: colors.textPrimary },
  ], [colors]);

  const UPVOTE_COLOR = colors.success;
  const styles = useMemo(() => StyleSheet.create(getHomeStyles(colors)), [colors]);

  const [locationUpdating, setLocationUpdating] = useState(false);
  const [userPosition, setUserPosition] = useState(null);
  const [locationModeActive, setLocationModeActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const filtersSectionAnim = useRef(new Animated.Value(0)).current;
  const [upvoteParticlesVisible, setUpvoteParticlesVisible] = useState(false);
  const [upvoteParticlePosition, setUpvoteParticlePosition] = useState({ x: 0, y: 0 });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [showMapAnimation, setShowMapAnimation] = useState(false);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const mapAnimOpacity = useRef(new Animated.Value(0)).current;
  const mapAnimScale = useRef(new Animated.Value(0)).current;
  const mapAnimRotate = useRef(new Animated.Value(0)).current;
  const mapPulse = useRef(new Animated.Value(1)).current;
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
  // Reserve space so first post is not covered. Must match header: paddingTop (2) + title row (44) + search (52) + filters row + buffer
  const FILTERS_SECTION_EXPANDED_HEIGHT = 96;
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
    const target = filtersExpanded ? 1 : 0;
    const anim = Animated.timing(filtersSectionAnim, {
      toValue: target,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) {
        filtersSectionAnim.setValue(target);
      }
    });
    return () => anim.stop();
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
    extrapolate: 'clamp',
  });

  const filteredPosts = useMemo(() => {
    let result = posts;

    if (searchQuery.trim()) {
      result = filterPostsBySearch(result, searchQuery);
    }

    if (selectedCategory === 'photos') {
      result = result.filter((p) => Boolean(p.imageUri));
    }

    // Sort by distance if location mode is active
    if (locationModeActive && userPosition?.latitude && userPosition?.longitude) {
      // Sort by distance
      const sorted = [...result].sort((a, b) => {
        if (!a.lat || !a.lng) return 1;
        if (!b.lat || !b.lng) return -1;
        
        const distA = Math.sqrt(
          Math.pow(a.lat - userPosition.latitude, 2) + 
          Math.pow(a.lng - userPosition.longitude, 2)
        );
        const distB = Math.sqrt(
          Math.pow(b.lat - userPosition.latitude, 2) + 
          Math.pow(b.lng - userPosition.longitude, 2)
        );
        
        return distA - distB;
      });
      
      // Apply diversification (no consecutive same user)
      const diversified = [];
      const remaining = [...sorted];
      const recentUsers = new Set();
      
      while (remaining.length > 0) {
        let selectedIndex = -1;
        
        // Try to find a post from a user not in recent set
        for (let i = 0; i < remaining.length; i++) {
          const post = remaining[i];
          if (!recentUsers.has(post.clientId)) {
            selectedIndex = i;
            break;
          }
        }
        
        // If all remaining posts are from recent users, clear the set and pick the closest
        if (selectedIndex === -1) {
          recentUsers.clear();
          selectedIndex = 0;
        }
        
        const selected = remaining[selectedIndex];
        diversified.push(selected);
        recentUsers.add(selected.clientId);
        
        // Keep last 2 users in memory to prevent consecutive duplicates
        if (recentUsers.size > 2) {
          const firstUser = [...recentUsers][0];
          recentUsers.delete(firstUser);
        }
        
        remaining.splice(selectedIndex, 1);
      }
      
      return diversified;
    }

    return applyFeedSort(result, selectedCategory, userPosition);
  }, [
    posts,
    searchQuery,
    selectedCategory,
    userPosition?.latitude,
    userPosition?.longitude,
    locationModeActive,
  ]);

  const fetchPosts = useCallback(async (opts = {}) => {
    const { skipGlobalLoading = false, onDone, append = false } = opts;
    try {
      setFetchError(null);
      if (!skipGlobalLoading && !append) setLoading(true);
      if (append) setLoadingMore(true);
      
      console.log('[Home] Fetching feed page...');
      
      const result = await fetchFeedPage({
        cursor: append ? nextCursor : null,
        limit: 15,
        userLat: userPosition?.latitude,
        userLng: userPosition?.longitude,
        category: null,
        searchQuery: searchQuery.trim() || null,
        useCache: !append && !skipGlobalLoading,
        userPersonaSummary: preferences?.profileSummary || '',
      });
      
      console.log('[Home] Feed result:', { 
        posts: result.posts.length, 
        hasMore: result.hasMore,
        nextCursor: result.nextCursor 
      });
      
      if (append) {
        setPosts(prev => [...prev, ...result.posts]);
      } else {
        setPosts(result.posts);
      }
      
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      
      // Only trigger re-animation for full refresh, not append
      if (!append && !skipGlobalLoading) {
        setFeedRefreshKey(prev => prev + 1);
      }
    } catch (err) {
      console.error('[Home] Failed to fetch posts:', err);
      const errMsg = String(err?.message ?? err ?? '');
      const isNetworkError = /network request failed|failed to fetch|network error/i.test(errMsg);
      setFetchError(isNetworkError ? 'network' : errMsg || 'unknown');
      if (!append) setPosts([]);
    } finally {
      if (!skipGlobalLoading && !append) setLoading(false);
      if (append) setLoadingMore(false);
      onDone?.();
    }
  }, [nextCursor, userPosition?.latitude, userPosition?.longitude, searchQuery, preferences?.profileSummary]);

  useEffect(() => {
    // Only fetch on mount, not when dependencies change
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && isAwaitingHomeOpen) {
      let cancelled = false
      const task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) notifyHomeReady()
      })
      return () => {
        cancelled = true
        if (task && typeof task.cancel === 'function') task.cancel()
      }
    }
  }, [loading, isAwaitingHomeOpen, notifyHomeReady])
  
  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    
    console.log('[Home] 🔄 REFRESH STARTED - Clearing cache...');
    await clearFeedCache();
    setNextCursor(null);
    setHasMore(true);
    
    // Call fetchPosts directly without relying on callback reference
    try {
      setFetchError(null);
      setLoading(false);
      
      console.log('[Home] 🔄 Fetching fresh feed with randomization...');
      
      const result = await fetchFeedPage({
        cursor: null,
        limit: 15,
        userLat: userPosition?.latitude,
        userLng: userPosition?.longitude,
        category: null,
        searchQuery: searchQuery.trim() || null,
        useCache: false, // Always fetch fresh on refresh
        isRefresh: true, // Add randomization to scoring
        userPersonaSummary: preferences?.profileSummary || '',
      });
      
      console.log('[Home] ✅ Refresh complete:', { 
        posts: result.posts.length, 
        hasMore: result.hasMore,
        firstPostId: result.posts[0]?.id,
        firstPostBusiness: result.posts[0]?.businessName 
      });
      
      setPosts(result.posts);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setFeedRefreshKey(prev => prev + 1); // Trigger re-animation
    } catch (err) {
      console.error('[Home] Failed to refresh:', err);
      const errMsg = String(err?.message ?? err ?? '');
      const isNetworkError = /network request failed|failed to fetch|network error/i.test(errMsg);
      setFetchError(isNetworkError ? 'network' : errMsg || 'unknown');
    } finally {
      setRefreshing(false);
      refreshingRef.current = false;
    }
  }, [userPosition?.latitude, userPosition?.longitude, searchQuery, preferences?.profileSummary]);
  
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading || refreshing) return;
    
    console.log('[Home] Loading more posts...');
    fetchPosts({ skipGlobalLoading: true, append: true });
  }, [loadingMore, hasMore, loading, refreshing, fetchPosts]);

  const handleViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const viewable = viewableItems[0]?.item;
      if (viewable?.id) {
        trackInteraction('VIEW', { 
          postId: viewable.id, 
          clientId: viewable.clientId,
          tags: viewable.tags 
        });
      }
    }
  }).current;
  
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 1000,
  }).current;

  const handleUpvoteToggle = useCallback(async (post, event) => {
    const adding = !post.hasUpvoted;
    if (upvoteInFlightRef.current.has(post.id)) return;
    upvoteInFlightRef.current.add(post.id);

    if (!upvoteAnimations[post.id]) upvoteAnimations[post.id] = { scale: new Animated.Value(1) };
    const scaleAnim = upvoteAnimations[post.id].scale;

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
      
      trackInteraction('LIKE', { 
        postId: post.id, 
        clientId: post.clientId,
        tags: post.tags 
      });
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

  // Scroll to top when home button is pressed while on Home screen
  useEffect(() => {
    if (route.params?.scrollToTop) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      navigation.setParams({ scrollToTop: undefined });
    }
  }, [route.params?.scrollToTop, navigation]);

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
    
    // Toggle location mode
    if (locationModeActive) {
      // Turn OFF location mode - back to default algorithm
      setLocationModeActive(false);
      setUserPosition(null);
      
      // Animate button back to normal
      Animated.spring(locationBtnScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 120,
      }).start();
      
      // Refetch with default algorithm
      await clearFeedCache();
      setNextCursor(null);
      setHasMore(true);
      
      try {
        const result = await fetchFeedPage({
          cursor: null,
          limit: 15,
          userLat: null,
          userLng: null,
          category: null,
          searchQuery: searchQuery.trim() || null,
          useCache: false,
          isRefresh: true,
          userPersonaSummary: preferences?.profileSummary || '',
        });
        
        setPosts(result.posts);
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
        setFeedRefreshKey(prev => prev + 1); // Trigger re-animation
      } catch (err) {
        console.error('[Home] Failed to reset feed:', err);
      }
      
      return;
    }
    
    if (!userUuid) {
      Alert.alert('Location', 'Sign in as a user to save your location.');
      return;
    }
    setLocationUpdating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location', 'Permission denied. Enable location in Settings to save your position.');
        setLocationUpdating(false);
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = coords;
      
      // Show map loading animation
      setShowMapAnimation(true);
      mapAnimOpacity.setValue(0);
      mapAnimScale.setValue(0);
      mapAnimRotate.setValue(0);
      mapPulse.setValue(1);
      
      // Entrance animation
      Animated.parallel([
        Animated.spring(mapAnimScale, {
          toValue: 1,
          tension: 150,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(mapAnimOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Scanning/loading animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(mapAnimRotate, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(mapAnimRotate, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(mapPulse, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(mapPulse, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
      
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

      // Set user position and ENABLE location mode
      setUserPosition({ latitude, longitude });
      setLocationModeActive(true);
      
      // Fetch fresh posts from database with distance sorting
      await clearFeedCache();
      setNextCursor(null);
      setHasMore(true);
      
      try {
        console.log('[Home] Fetching posts with location:', latitude, longitude);
        const result = await fetchFeedPage({
          cursor: null,
          limit: 30, // Fetch more posts for better distance variety
          userLat: latitude,
          userLng: longitude,
          category: 'nearby',
          searchQuery: searchQuery.trim() || null,
          useCache: false,
          isRefresh: false, // Don't randomize, pure distance
          userPersonaSummary: preferences?.profileSummary || '',
        });
        
        console.log('[Home] Location-based posts loaded:', result.posts.length);
        setPosts(result.posts);
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
        setFeedRefreshKey(prev => prev + 1); // Trigger re-animation
      } catch (err) {
        console.error('[Home] Failed to fetch location-based posts:', err);
      }
      
      // Hide map animation after fetch completes
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(mapAnimOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(mapAnimScale, {
            toValue: 0.8,
            tension: 150,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowMapAnimation(false);
          mapAnimRotate.stopAnimation();
          mapPulse.stopAnimation();
        });
      }, 1800);

      // Animate list appearance
      LayoutAnimation.configureNext(
        LayoutAnimation.create(320, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
      );
      
      // Scroll to top to show closest place
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

      // No alert dialog - animation is the feedback
    } catch (e) {
      Alert.alert('Location', e?.message ?? 'Could not get or save location.');
    } finally {
      setLocationUpdating(false);
    }
  }, [profile?.user?.user_a_uuid, locationModeActive, locationBtnScale, locationBtnRingScale, locationBtnRingOpacity, locationSuccessOpacity, mapAnimOpacity, mapAnimScale, mapAnimRotate, mapPulse]);

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
              style={[styles.headerIconBtn, locationModeActive && styles.headerIconBtnActive]}
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
                  ) : locationModeActive ? (
                    <>
                      <Animated.View
                        style={{
                          opacity: locationBtnBlinkOpacity,
                        }}
                      >
                        <Ionicons name="location" size={24} color={COLORS.primary} />
                      </Animated.View>
                    </>
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
            collapsable={false}
            style={[
              styles.filtersSection,
              {
                height: filtersSectionHeight,
                overflow: 'hidden',
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.filtersScroll}
              style={[styles.filtersScrollView, { height: FILTERS_SECTION_EXPANDED_HEIGHT }]}
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
      ) : posts.length > 0 && filteredPosts.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="images-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>
            {selectedCategory === 'photos'
              ? 'No posts with a photo in your feed yet'
              : 'Nothing matches this filter right now'}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setSelectedCategory('all');
              setHighlightedPostId(null);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.retryBtnText}>Show all posts</Text>
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
              <StaggeredFeedItem key={`${item.id}-${feedRefreshKey}`} index={index} isRefreshing={refreshing}>
                <PostCard
                  item={item}
                  isHighlighted={item.id === highlightedPostId}
                  onHighlightDone={() => setHighlightedPostId(null)}
                  onUpvoteToggle={handleUpvoteToggle}
                  onClientPress={(post) => {
                    if (post?.clientId) {
                      trackInteraction('PROFILE_VIEW', { clientId: post.clientId });
                      setSelectedClientId(post.clientId);
                    }
                  }}
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
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListFooterComponent={
            loadingMore && hasMore ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ marginTop: 12, fontSize: 14, color: COLORS.textMuted }}>
                  Loading more posts...
                </Text>
              </View>
            ) : !hasMore && posts.length > 0 ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: COLORS.textMuted }}>
                  You've reached the end!
                </Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]} 
              tintColor={COLORS.primary}
              progressBackgroundColor={COLORS.cardBg}
              title="Pull to refresh"
              titleColor={COLORS.textMuted}
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
      <UpvoteParticles visible={upvoteParticlesVisible} position={upvoteParticlePosition} accentColor={UPVOTE_COLOR} />
      
      {/* Map Loading Animation */}
      {showMapAnimation && (
        <Animated.View
          style={{
            position: 'absolute',
            top: '40%',
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            opacity: mapAnimOpacity,
            transform: [{ scale: mapAnimScale }]
          }}
          pointerEvents="none"
        >
          <View style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: COLORS.cardBg,
            alignItems: 'center',
            justifyContent: 'center',
            ...Platform.select({
              ios: {
                shadowColor: COLORS.primary,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.4,
                shadowRadius: 30,
              },
              android: {
                elevation: 15,
              }
            }),
          }}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryLight || COLORS.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 60,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Animated.View style={{
                transform: [
                  { scale: mapPulse },
                  { 
                    rotate: mapAnimRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg']
                    })
                  }
                ]
              }}>
                <Ionicons name="map" size={50} color="#FFFFFF" />
              </Animated.View>
            </LinearGradient>
            
            {/* Scanning rings */}
            <Animated.View style={{
              position: 'absolute',
              width: 120,
              height: 120,
              borderRadius: 60,
              borderWidth: 3,
              borderColor: COLORS.primary,
              opacity: mapPulse.interpolate({
                inputRange: [1, 1.2],
                outputRange: [0.5, 0]
              }),
              transform: [{ scale: mapPulse }]
            }} />
            <Animated.View style={{
              position: 'absolute',
              width: 140,
              height: 140,
              borderRadius: 70,
              borderWidth: 2,
              borderColor: COLORS.primary,
              opacity: mapPulse.interpolate({
                inputRange: [1, 1.2],
                outputRange: [0.3, 0]
              }),
              transform: [{ 
                scale: mapPulse.interpolate({
                  inputRange: [1, 1.2],
                  outputRange: [1, 1.3]
                })
              }]
            }} />
          </View>
        </Animated.View>
      )}
      
      {!loading && posts.length > 0 && showScrollToTop ? (
        <TouchableOpacity
          style={[styles.scrollToTopBtn, { bottom: 90 + insets.bottom }]}
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

