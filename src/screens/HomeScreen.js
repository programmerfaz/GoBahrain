import React, { useState, useRef, useMemo, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import ProfileButton from '../components/ProfileButton';

const DOUBLE_TAP_DELAY = 350;
const UPVOTE_ARROW_COUNT = 14;
const UPVOTE_GREEN = '#10B981';

// Modern app theme — warm neutrals, clear hierarchy
const COLORS = {
  primary: '#C8102E',
  primarySoft: 'rgba(200, 16, 46, 0.08)',
  screenBg: '#F5F5F7',
  cardBg: '#FFFFFF',
  cardBgAlt: '#FAFAFA',
  textPrimary: '#1A1A1A',
  textSecondary: '#5C5C5C',
  textMuted: '#8E8E93',
  textMutedAlt: '#3A3A3C',
  border: 'rgba(0,0,0,0.06)',
  borderAlt: 'rgba(0,0,0,0.08)',
  openNow: '#34C759',
  openNowSoft: 'rgba(52, 199, 89, 0.12)',
  badge: '#C8102E',
  pillBg: '#F2F2F7',
  shadow: 'rgba(0,0,0,0.06)',
  shadowStrong: 'rgba(0,0,0,0.1)',
};

const CATEGORIES = [
  { id: 'nearby', label: 'Nearby', icon: 'location', color: COLORS.primary },
  { id: 'food', label: 'Food', icon: 'restaurant', color: '#10B981' },
  { id: 'hangout', label: 'Hangout', icon: 'pin', color: '#0EA5E9' },
  { id: 'trending', label: 'Trending', icon: 'trending-up', color: '#F97316' },
  { id: 'opennow', label: 'Open Now', icon: 'time', color: '#6366F1' },
];

// Map user choice (quick-select id or custom text) to a post id for scroll + highlight
function choiceToPostId(choice) {
  const q = (choice || '').trim().toLowerCase();
  if (q === 'nearby') return '2'; // Cafe Lilou 0.8 km
  if (q === 'opennow' || q === 'open now') return '1';
  if (q === 'toprated' || q === 'top rated') return '1'; // Pink Burger 892 upvotes
  if (q === 'cafes' || q.includes('cafe') || q.includes('coffee') || q.includes('brunch')) return '2';
  if (q === 'withaview' || q.includes('view') || q.includes('scenery') || q.includes('fort') || q.includes('tea')) return '3';
  if (q === 'food' || q.includes('burger') || q.includes('eat')) return '1';
  if (q.includes('seafood') || q.includes('grill') || q.includes('sunset')) return '4';
  if (q.includes('sweet') || q.includes('souq') || q.includes('baklava')) return '5';
  return '1';
}

const MOCK_POSTS = [
  {
    id: '1',
    username: 'pink_burger',
    verified: true,
    location: 'Pink Burger Restaurant',
    distance: '1.2 km away',
    priceRange: '8-25 BHD',
    imageUri: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
    openNow: true,
    upvotes: 892,
    description: 'Delicious burgers made with love! Try our signature Pink Burger with special sauce. Order now for self-pickup!',
  },
  {
    id: '2',
    username: 'manama_eats',
    verified: true,
    location: 'Cafe Lilou',
    distance: '0.8 km away',
    priceRange: '5-15 BHD',
    imageUri: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
    openNow: true,
    upvotes: 456,
    description: 'Best brunch in Manama. Fresh pastries and great coffee.',
  },
  {
    id: '3',
    username: 'bahrain_fort_view',
    verified: false,
    location: 'Bahrain Fort Cafe',
    distance: '3.1 km away',
    priceRange: '10-30 BHD',
    imageUri: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
    openNow: false,
    upvotes: 234,
    description: 'Stunning views and traditional Bahraini tea.',
  },
  {
    id: '4',
    username: 'corniche_grill',
    verified: true,
    location: 'Corniche Grill',
    distance: '2.0 km away',
    priceRange: '12-35 BHD',
    imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
    openNow: true,
    upvotes: 621,
    description: 'Fresh seafood by the water. Perfect for sunset dinners.',
  },
  {
    id: '5',
    username: 'souq_sweets',
    verified: false,
    location: 'Manama Souq Sweets',
    distance: '1.5 km away',
    priceRange: '3-12 BHD',
    imageUri: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800',
    openNow: true,
    upvotes: 189,
    description: 'Traditional sweets and baklava. A must-visit in the souq.',
  },
];

const ACTION_BUTTONS = [
  { id: 'upvote', icon: 'arrow-up', label: 'Upvote', color: '#10B981', getLabel: (item) => `Upvote ${item?.upvotes ?? 0}` },
  { id: 'share', icon: 'paper-plane-outline', label: 'Share', color: '#0EA5E9' },
  { id: 'menu', icon: 'restaurant-outline', label: 'Menu', color: '#EC4899' },
];

const NOTIFICATION_COUNT = 3;
const CARD_MARGIN_H = 16;
const CARD_PADDING = 14;

const FEED_PADDING_H = 16;
const CARD_IMAGE_MARGIN_H = 12;

function PostCard({ item, isHighlighted = false, onHighlightDone }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - FEED_PADDING_H * 2;
  const imageWidth = cardWidth - CARD_IMAGE_MARGIN_H * 2;
  const imageHeight = Math.round(imageWidth * 1.05);

  const lastTapRef = useRef(0);
  const upvoteAnim = useRef(new Animated.Value(0)).current;
  const [displayUpvotes, setDisplayUpvotes] = useState(item.upvotes);
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

  const arrowConfigs = useMemo(() => {
    const seed = (item.id || '1').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const rnd = (i) => {
      const x = Math.sin(seed * 9973 + i * 1237) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: UPVOTE_ARROW_COUNT }, (_, i) => ({
      key: i,
      size: Math.round(28 + rnd(i) * 48),
      offsetX: (rnd(i + 100) - 0.5) * 160,
      rotation: (rnd(i + 200) - 0.5) * 24,
    }));
  }, [item.id]);

  const triggerUpvoteAnimation = () => {
    setDisplayUpvotes((prev) => prev + 1);
    upvoteAnim.setValue(0);
    Animated.sequence([
      Animated.timing(upvoteAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(upvoteAnim, {
        toValue: 2,
        duration: 480,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleImagePress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      triggerUpvoteAnimation();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const upvoteScale = upvoteAnim.interpolate({
    inputRange: [0, 0.4, 1, 2],
    outputRange: [0.15, 1.25, 1.1, 0.9],
  });
  const upvoteOpacity = upvoteAnim.interpolate({
    inputRange: [0, 0.2, 1, 2],
    outputRange: [0.7, 1, 1, 0],
  });
  const upvoteRise = upvoteAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, -70, -140],
  });

  const itemWithDisplayUpvotes = { ...item, upvotes: displayUpvotes };
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
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          <Ionicons name="person" size={20} color={COLORS.textMuted} />
        </View>
        <View style={styles.cardHeaderCenter}>
          <View style={styles.usernameRow}>
            <Text style={styles.username} numberOfLines={1}>
              {item.username}
            </Text>
            {item.verified && (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} style={styles.verifiedIcon} />
            )}
          </View>
          {item.distance ? (
            <Text style={styles.distanceText} numberOfLines={1}>{item.distance}</Text>
          ) : null}
        </View>
        {item.openNow && (
          <View style={styles.openNowPill}>
            <View style={styles.openNowDot} />
            <Text style={styles.openNowText}>Open now</Text>
          </View>
        )}
      </View>
      <TouchableWithoutFeedback onPress={handleImagePress}>
        <View style={[styles.imageWrap, { width: imageWidth, height: imageHeight }]}>
          <Image
            source={{ uri: item.imageUri }}
            style={[styles.cardImage, { width: imageWidth, height: imageHeight }]}
            resizeMode="cover"
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.upvoteOverlay, { opacity: upvoteOpacity }]}
          >
            {arrowConfigs.map((arrow) => (
              <Animated.View
                key={arrow.key}
                style={[
                  styles.upvoteArrowWrap,
                  {
                    width: arrow.size,
                    height: arrow.size,
                    marginLeft: -arrow.size / 2,
                    marginTop: -arrow.size / 2,
                    transform: [
                      { translateX: arrow.offsetX },
                      { translateY: upvoteRise },
                      { scale: upvoteScale },
                      { rotate: `${arrow.rotation}deg` },
                    ],
                  },
                ]}
              >
                <Ionicons name="arrow-up" size={arrow.size} color={UPVOTE_GREEN} />
              </Animated.View>
            ))}
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
      <View style={styles.actionRow}>
        {ACTION_BUTTONS.map((btn) => (
          <TouchableOpacity
            key={btn.id}
            style={[styles.actionBtn, btn.iconOnly && styles.actionBtnIconOnly]}
            activeOpacity={0.8}
            onPress={btn.id === 'upvote' ? triggerUpvoteAnimation : undefined}
          >
            <Ionicons name={btn.icon} size={18} color={btn.color} style={btn.iconOnly ? null : styles.actionBtnIcon} />
            {!btn.iconOnly && (
              <Text style={[styles.actionBtnText, { color: btn.color }]} numberOfLines={1}>
                {typeof btn.getLabel === 'function' ? btn.getLabel(itemWithDisplayUpvotes) : btn.label}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      {item.description ? (
        <View style={styles.commentSection}>
          <Text style={styles.description} numberOfLines={3}>
            {item.description}
          </Text>
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

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const [selectedCategory, setSelectedCategory] = useState('nearby');
  const [showAIOverlay, setShowAIOverlay] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const lastPulseRef = useRef(0);
  const flatListRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollAnimationRef = useRef(null);
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
    const postId = choiceToPostId(resolved);
    closeOverlayWithAnimation(() => {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          const idx = MOCK_POSTS.findIndex((p) => p.id === postId);
          if (flatListRef.current && idx >= 0) {
            smoothScrollToIndex(idx, () => setHighlightedPostId(postId));
          } else {
            setHighlightedPostId(postId);
          }
        }, 120);
      });
    });
  };

  return (
    <ScreenContainer style={styles.screen}>
      {/* Instagram-style top bar: plus (left), logo (center), heart (right) */}
      <View style={[styles.instagramHeader, { paddingTop: insets.top + 6, paddingBottom: 4 }]}>
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

      {/* Filters (in place of stories) */}
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

      <FlatList
        ref={flatListRef}
        data={MOCK_POSTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            item={item}
            isHighlighted={item.id === highlightedPostId}
            onHighlightDone={() => setHighlightedPostId(null)}
          />
        )}
        contentContainerStyle={styles.feedContent}
        style={styles.feedList}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={() => {}}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: COLORS.screenBg,
  },
  instagramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
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
    borderRadius: 22,
  },
  instagramLogo: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
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
    backgroundColor: COLORS.cardBg,
    paddingVertical: 12,
    paddingLeft: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  filtersScrollView: {
    flexGrow: 0,
  },
  filtersScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  filterChip: {
    alignItems: 'center',
    marginRight: 16,
  },
  filterChipSelected: {
    opacity: 1,
  },
  filterCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  filterLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    maxWidth: 64,
    textAlign: 'center',
  },
  filterLabelSelected: {
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  feedList: {
    flex: 1,
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadowStrong,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  cardHighlightGlow: {
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
      },
      android: { elevation: 0 },
    }),
  },
  cardHighlightBorder: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeaderCenter: {
    flex: 1,
    minWidth: 0,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  username: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginRight: 4,
  },
  distanceText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  verifiedIcon: {
    marginLeft: 2,
  },
  openNowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.openNowSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
  },
  openNowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.openNow,
    marginRight: 6,
  },
  openNowText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.openNow,
  },
  imageWrap: {
    position: 'relative',
    backgroundColor: COLORS.pillBg,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardImage: {
    backgroundColor: COLORS.pillBg,
    borderRadius: 16,
  },
  upvoteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upvoteArrowWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginRight: 10,
    marginBottom: 4,
    backgroundColor: COLORS.pillBg,
  },
  actionBtnIconOnly: {
    width: 44,
    height: 44,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginRight: 10,
  },
  actionBtnIcon: {
    marginRight: 6,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  commentSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
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
});
