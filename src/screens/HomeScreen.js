import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
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
  TextInput,
  Modal,
  KeyboardAvoidingView,
  InteractionManager,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenContainer from '../components/ScreenContainer';
import ProfileButton from '../components/ProfileButton';
import ClientProfileModal from '../components/ClientProfileModal';
import { supabase } from '../config/supabase';

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
const UPVOTE_GREEN = '#10B981';
const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');

const PARTICLE_SIZE = 32;
const PARTICLE_COUNT = 10;

function UpvoteParticles({ visible, position }) {
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
      const angle = (index * 360) / particles.length;
      const distance = 95 + Math.random() * 55;
      const radians = (angle * Math.PI) / 180;

      particle.x.setValue(centerX);
      particle.y.setValue(centerY);
      particle.opacity.setValue(1);
      particle.scale.setValue(0.4);

      Animated.parallel([
        Animated.timing(particle.x, {
          toValue: centerX + Math.cos(radians) * distance,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: centerY + Math.sin(radians) * distance - 40,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(particle.scale, {
            toValue: 1.2,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.6,
            duration: 520,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(250),
          Animated.timing(particle.opacity, {
            toValue: 0,
            duration: 450,
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
            <Ionicons name="arrow-up-circle" size={PARTICLE_SIZE} color={UPVOTE_GREEN} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

// App theme (match rest of app)
const COLORS = {
  primary: '#C8102E',
  screenBg: '#fff',
  cardBg: '#FFFFFF',
  cardBgAlt: '#F9FAFB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textMutedAlt: '#4B5563',
  border: 'rgba(209,213,219,0.7)',
  borderAlt: 'rgba(209,213,219,0.8)',
  openNow: '#10B981',
  badge: '#C8102E',
  pillBg: '#F3F4F6',
};

const CATEGORIES = [
  { id: 'nearby', label: 'Nearby', icon: 'location', color: COLORS.primary },
  { id: 'food', label: 'Food', icon: 'restaurant', color: '#10B981' },
  { id: 'hangout', label: 'Hangout', icon: 'pin', color: '#0EA5E9' },
  { id: 'trending', label: 'Trending', icon: 'trending-up', color: '#F97316' },
  { id: 'opennow', label: 'Open Now', icon: 'time', color: '#6366F1' },
];

function choiceToPostId(choice, posts) {
  const q = (choice || '').trim().toLowerCase();
  if (!posts.length) return null;
  const match = posts.find((p) => {
    const desc = (p.description || '').toLowerCase();
    return desc.includes(q) || q.includes(desc.split(' ')[0]);
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

const ACTION_BUTTONS = [
  { id: 'upvote', icon: 'arrow-up', label: 'Upvote', color: '#10B981', getLabel: (item) => `Upvote ${item?.upvotes ?? 0}` },
  { id: 'share', icon: 'paper-plane-outline', label: 'Share', color: '#0EA5E9' },
  { id: 'menu', icon: 'restaurant-outline', label: 'Menu', color: '#EC4899' },
];

const NOTIFICATION_COUNT = 3;
const CARD_MARGIN_H = 16;
const CARD_PADDING = 14;

function PostCard({ item, isHighlighted = false, onHighlightDone, onUpvoteToggle, onClientPress, upvoteScaleAnim }) {
  const { width } = useWindowDimensions();
  const imageWidth = width;
  const imageHeight = Math.round(imageWidth * 1.05);

  const lastTapRef = useRef(0);
  const hasUpvoted = item.hasUpvoted ?? false;
  const displayUpvotes = item.upvotes ?? 0;
  const highlightScale = useRef(new Animated.Value(1)).current;
  const highlightGlow = useRef(new Animated.Value(0)).current;

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
    onUpvoteToggle?.(item, e);
  };

  const handleImagePress = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      onUpvoteToggle?.(item, e);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const itemWithDisplayUpvotes = { ...item, upvotes: displayUpvotes, hasUpvoted };
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
          { opacity: glowOpacity },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cardHighlightBorder,
          { opacity: glowOpacity },
        ]}
      />
      <TouchableOpacity
        style={styles.cardHeader}
        activeOpacity={0.8}
        onPress={() => onClientPress?.(item)}
      >
        <View style={styles.cardAvatar}>
          <Ionicons name="storefront" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.businessName} numberOfLines={1}>
            {item.businessName || 'Business'}
          </Text>
          <View style={styles.cardSubline}>
            {item.rating != null && item.rating !== '' && (
              <Text style={styles.cardSublineText}>★ {item.rating}</Text>
            )}
            {item.rating != null && item.rating !== '' && item.priceRange ? (
              <Text style={styles.cardSublineDot}> · </Text>
            ) : null}
            {item.priceRange ? (
              <Text style={styles.cardSublineText}>{item.priceRange}</Text>
            ) : null}
          </View>
        </View>
        {item.openNow && (
          <View style={styles.openNowPill}>
            <View style={styles.openNowDot} />
            <Text style={styles.openNowText}>Open</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      <TouchableWithoutFeedback onPress={handleImagePress}>
        <View style={[styles.imageWrap, { width: imageWidth, height: imageHeight }]}>
          <Image
            source={{ uri: item.imageUri }}
            style={[styles.cardImage, { width: imageWidth, height: imageHeight }]}
            resizeMode="cover"
          />
        </View>
      </TouchableWithoutFeedback>
      <View style={styles.actionRow}>
        {ACTION_BUTTONS.map((btn) => {
          const isUpvote = btn.id === 'upvote';
          const isUpvoteActive = isUpvote && hasUpvoted;
          const btnContent = (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                btn.iconOnly && styles.actionBtnIconOnly,
                { borderColor: btn.color },
                isUpvoteActive && { backgroundColor: UPVOTE_GREEN, borderColor: UPVOTE_GREEN },
              ]}
              activeOpacity={0.8}
              onPress={isUpvote ? handleUpvotePress : undefined}
            >
              <Ionicons
                name={isUpvote && hasUpvoted ? 'arrow-up-circle' : btn.icon}
                size={18}
                color={isUpvoteActive ? '#FFFFFF' : btn.color}
                style={btn.iconOnly ? null : styles.actionBtnIcon}
              />
              {!btn.iconOnly && (
                <Text
                  style={[styles.actionBtnText, { color: isUpvoteActive ? '#FFFFFF' : btn.color }]}
                  numberOfLines={1}
                >
                  {typeof btn.getLabel === 'function' ? btn.getLabel(itemWithDisplayUpvotes) : btn.label}
                </Text>
              )}
            </TouchableOpacity>
          );
          return isUpvote && upvoteScaleAnim ? (
            <Animated.View key={btn.id} style={{ transform: [{ scale: upvoteScaleAnim }] }}>
              {btnContent}
            </Animated.View>
          ) : (
            <View key={btn.id}>{btnContent}</View>
          );
        })}
      </View>
      {item.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {item.description}
        </Text>
      ) : null}
      {Array.isArray(item.tags) && item.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {item.tags.slice(0, 4).map((tag, idx) => (
            <View key={idx} style={styles.tagPill}>
              <Text style={styles.tagText} numberOfLines={1}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
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

function PlaneLoader({ label = 'Refreshing…' }) {
  return (
    <View style={styles.loaderWithPlaneWrap}>
      <View style={styles.loaderWithPlaneCircle}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <View style={styles.loaderWithPlaneInner} pointerEvents="none">
          <Ionicons name="airplane" size={18} color={COLORS.primary} />
        </View>
      </View>
      {label ? <Text style={styles.footerLoaderText}>{label}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const [selectedCategory, setSelectedCategory] = useState('nearby');
  const [showAIOverlay, setShowAIOverlay] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [upvoteParticlesVisible, setUpvoteParticlesVisible] = useState(false);
  const [upvoteParticlePosition, setUpvoteParticlePosition] = useState({ x: 0, y: 0 });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const lastPulseRef = useRef(0);
  const flatListRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollAnimationRef = useRef(null);
  const upvoteAnimations = useRef({}).current;
  const refreshingRef = useRef(false);
  const lastScrollY = useRef(0);
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const headerVisibleRef = useRef(true);
  const headerBarHeight = insets.top + 6 + 52 + 58;
  const khalidCommandRef = useRef(null);
  const [khalidContextBanner, setKhalidContextBanner] = useState(null);

  const fetchPosts = useCallback(async (opts = {}) => {
    const { skipGlobalLoading = false, onDone } = opts;
    try {
      setFetchError(null);
      if (!skipGlobalLoading) setLoading(true);
      console.log('[Home] Fetching posts from Supabase...');
      const { data: postRows, error } = await supabase
        .from('post')
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
        return {
          id: row.post_uuid,
          clientId: row.client_a_uuid,
          username: row.client_a_uuid?.slice(0, 8) ?? 'client',
          businessName: businessName ? String(businessName).trim() : null,
          tags,
          rating,
          priceRange: priceRange != null ? `${priceRange} BHD` : '',
          verified: false,
          location: client?.location || client?.address || '',
          distance: '',
          imageUri: row.post_image,
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
    if (!upvoteAnimations[post.id]) upvoteAnimations[post.id] = { scale: new Animated.Value(1) };
    const scaleAnim = upvoteAnimations[post.id].scale;

    if (event?.nativeEvent) {
      const { pageX, pageY } = event.nativeEvent;
      setUpvoteParticlePosition({ x: pageX, y: pageY });
    }
    if (adding) {
      setUpvoteParticlesVisible(true);
      setTimeout(() => setUpvoteParticlesVisible(false), 950);
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.15,
          tension: 300,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 300,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 300,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
    }

    const voterId = await getVoterId();
    if (adding) {
      const { error } = await supabase.from('post_upvote').insert({ post_uuid: post.id, voter_id: voterId });
      if (error) {
        console.warn('[Home] Upvote insert failed:', error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('post_upvote').delete().eq('post_uuid', post.id).eq('voter_id', voterId);
      if (error) {
        console.warn('[Home] Upvote delete failed:', error.message);
        return;
      }
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, hasUpvoted: adding, upvotes: Math.max(0, p.upvotes + (adding ? 1 : -1)) }
          : p
      )
    );
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
    const resolved = typeof choice === 'string' ? choice : (customQuery.trim() || choice);
    const postId = choiceToPostId(resolved, posts);
    closeOverlayWithAnimation(() => {
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
    });
  };

  const handleScroll = useCallback(
    (e) => {
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
    [headerTranslateY, headerBarHeight]
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

  return (
    <ScreenContainer style={styles.screen}>
      <Animated.View
        style={[
          styles.headerFloatingWrap,
          { paddingTop: insets.top + 6, transform: [{ translateY: headerTranslateY }] },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.instagramHeader}>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="add" size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.instagramLogo}>Go Bahrain</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
              <View style={styles.heartWrap}>
                <Ionicons name="heart-outline" size={26} color={COLORS.textPrimary} />
                {NOTIFICATION_COUNT > 0 && (
                  <View style={[styles.badge, styles.badgeOnHeart]}>
                    <Text style={styles.badgeText}>{NOTIFICATION_COUNT > 9 ? '9+' : NOTIFICATION_COUNT}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <ProfileButton iconColor={COLORS.textPrimary} />
          </View>
        </View>
        <View style={styles.filtersSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersScroll}
            style={styles.filtersScrollView}
          >
            {CATEGORIES.map((cat) => {
              const selected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.filterChip, selected && styles.filterChipSelected]}
                  onPress={() => setSelectedCategory(cat.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.filterCircle, { borderColor: cat.color }, selected && { backgroundColor: `${cat.color}18` }]}>
                    <Ionicons name={cat.icon} size={16} color={cat.color} />
                  </View>
                  <Text style={[styles.filterLabel, selected && styles.filterLabelSelected]} numberOfLines={1}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : posts.length === 0 ? (
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
      ) : (
        <FlatList
          ref={flatListRef}
          data={posts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            khalidContextBanner ? (
              <View style={styles.khalidContextBanner}>
                <Ionicons name="sparkles" size={16} color={COLORS.primary} />
                <Text style={styles.khalidContextBannerText} numberOfLines={1}>
                  Khalid showed you: {khalidContextBanner}
                </Text>
                <TouchableOpacity onPress={() => setKhalidContextBanner(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            if (!upvoteAnimations[item.id]) upvoteAnimations[item.id] = { scale: new Animated.Value(1) };
            return (
              <PostCard
                item={item}
                isHighlighted={item.id === highlightedPostId}
                onHighlightDone={() => setHighlightedPostId(null)}
                onUpvoteToggle={handleUpvoteToggle}
                onClientPress={(post) => post?.clientId && setSelectedClientId(post.clientId)}
                upvoteScaleAnim={upvoteAnimations[item.id].scale}
              />
            );
          }}
          contentContainerStyle={[styles.feedContent, { paddingTop: headerBarHeight + 8 }]}
          style={styles.feedList}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={() => {}}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={refreshing ? <PlaneLoader label="Refreshing…" /> : null}
        />
      )}

      <ClientProfileModal
        visible={!!selectedClientId}
        clientId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
        insets={insets}
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
      <UpvoteParticles visible={upvoteParticlesVisible} position={upvoteParticlePosition} />
      {!loading && posts.length > 0 && showScrollToTop ? (
        <TouchableOpacity
          style={[styles.scrollToTopBtn, { bottom: 24 + insets.bottom }]}
          onPress={scrollToTop}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: COLORS.screenBg,
  },
  scrollToTopBtn: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  headerFloatingWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: COLORS.cardBg,
    paddingBottom: 4,
  },
  instagramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: COLORS.cardBg,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramLogo: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  heartWrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeOnHeart: {
    top: -4,
    right: -4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filtersSection: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
  },
  filtersScrollView: {
    flexGrow: 0,
  },
  filtersScroll: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterChip: {
    alignItems: 'center',
    marginRight: 12,
  },
  filterChipSelected: {
    opacity: 1,
  },
  filterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  filterLabel: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '500',
    maxWidth: 56,
    textAlign: 'center',
  },
  filterLabelSelected: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  feedList: {
    flex: 1,
  },
  feedContent: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  loaderWithPlaneWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderWithPlaneCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  loaderWithPlaneInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  footerLoaderText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 0,
    marginBottom: 16,
    borderRadius: 0,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  cardHighlightGlow: {
    borderRadius: 0,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 16,
      },
      android: { elevation: 0 },
    }),
  },
  cardHighlightBorder: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingLeft: 14,
  },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardHeaderContent: {
    flex: 1,
    minWidth: 0,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  cardSubline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardSublineText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  cardSublineDot: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '400',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  tagPill: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  tagText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginRight: 4,
  },
  verifiedIcon: {
    marginLeft: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  openNowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.openNow,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  openNowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  openNowText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  imageWrap: {
    position: 'relative',
    backgroundColor: COLORS.pillBg,
  },
  cardImage: {
    backgroundColor: COLORS.pillBg,
  },
  upvoteParticlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    pointerEvents: 'none',
  },
  upvoteParticle: {
    position: 'absolute',
    left: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upvoteParticleIconWrap: {
    width: PARTICLE_SIZE,
    height: PARTICLE_SIZE,
    borderRadius: PARTICLE_SIZE / 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: { elevation: 6 },
    }),
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  actionBtnIconOnly: {
    width: 40,
    height: 40,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  actionBtnIcon: {
    marginRight: 5,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
  },
  khalidContextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderRadius: 12,
    marginHorizontal: 0,
  },
  khalidContextBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  overlayRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlayBackdropWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayBackdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  overlayContentWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
    alignItems: 'stretch',
  },
  overlayQuestionBlock: {
    marginBottom: 28,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  overlayQuestionInner: {
    alignItems: 'center',
    maxWidth: 320,
  },
  overlayQuestionTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: 1.2,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.25)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  overlayQuestionAccent: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    opacity: 0.95,
    marginBottom: 16,
  },
  overlayQuestionSub: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    letterSpacing: 0.4,
    lineHeight: 22,
  },
  overlayOptionsWrap: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  overlayOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  overlayOptionBlock: {
    width: '47%',
    minHeight: 56,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  overlayOptionBlockText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  overlayInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  overlayInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  overlaySubmitBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  retryBtnText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
