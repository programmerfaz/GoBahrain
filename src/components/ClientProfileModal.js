import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  Animated,
  ActivityIndicator,
  PanResponder,
  Platform,
  useWindowDimensions,
  Easing,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { colors as themeColors, gradients } from '../theme/designTokens';
import { LUXURY, luxurySoftShadow } from '../theme/luxuryPremium';
import { useTheme } from '../context/ThemeContext';
import { resolvePublicImageUrl } from '../utils/imageUrl';
import { CachedImage } from './CachedImage';
import { BRAND_WORDMARK_FONT } from '../constants/brandFont';
import { openGoogleMapsDirections } from '../utils/googleMapsDirections';

const PROFILE_TAB_POSTS = 'posts';
const PROFILE_TAB_REVIEWS = 'reviews';
const GOLD = '#D4AF37';
const GOLD_LIGHT = '#F3D99E';

function formatPostDate(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function GalleryGridCell({
  post,
  idx,
  gridCellSize,
  gridGap,
  GRID_COLS,
  styles,
  COLORS,
  onPress,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const entranceScale = useRef(new Animated.Value(0.9)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(idx, 21) * 28;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(entranceScale, {
          toValue: 1,
          friction: 7,
          tension: 110,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [idx, opacity, translateY, entranceScale]);

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.96, useNativeDriver: true, friction: 8, tension: 120 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 8, tension: 120 }).start();
  };

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }, { scale: entranceScale }, { scale: pressScale }],
        width: gridCellSize,
        height: gridCellSize,
        marginRight: (idx % GRID_COLS) < GRID_COLS - 1 ? gridGap : 0,
        marginBottom: gridGap,
      }}
    >
      <Pressable
        style={[styles.gridItem, { width: gridCellSize, height: gridCellSize }]}
        onPress={() => onPress?.(post, idx)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Post ${idx + 1}`}
      >
        {post.imageUri ? (
          <>
            <CachedImage source={{ uri: post.imageUri }} style={styles.gridImage} resizeMode="cover" recyclingKey={post.imageUri} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.28)']}
              start={{ x: 0.5, y: 0.55 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.gridImageScrim}
            />
          </>
        ) : (
          <View style={styles.gridPlaceholder}>
            <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function ReviewStars({ rating, size = 14, filledColor = '#FBBF24', emptyColor = 'rgba(255,255,255,0.45)' }) {
  if (rating == null || rating <= 0) return null;
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={rating >= i ? 'star' : rating >= i - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={rating >= i - 0.5 ? filledColor : emptyColor}
        />
      ))}
    </>
  );
}

function ReviewCardAnimated({ rev, idx, styles, COLORS }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const delay = Math.min(idx, 12) * 48;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 11,
          tension: 76,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [idx, opacity, translateY]);

  const hasImage = Boolean(rev.imageUri);
  const hasBody = Boolean(rev.body && rev.body.trim());
  const ratingVal = rev.rating != null && rev.rating > 0 ? Number(rev.rating) : null;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <View style={styles.reviewCard}>
        {hasImage ? (
          <>
            <View style={styles.reviewHero}>
              <CachedImage source={{ uri: rev.imageUri }} style={styles.reviewHeroImage} resizeMode="cover" recyclingKey={rev.imageUri} />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.72)']}
                locations={[0, 0.45, 1]}
                style={styles.reviewHeroScrim}
              />
              {ratingVal != null && (
                <View style={styles.reviewRatingPill}>
                  <ReviewStars rating={ratingVal} size={13} filledColor={GOLD} emptyColor="rgba(255,255,255,0.4)" />
                  <Text style={styles.reviewRatingPillNum}>{ratingVal.toFixed(1)}</Text>
                </View>
              )}
            </View>
            {(hasBody || rev.place) ? (
              <View style={styles.reviewTextBlock}>
                {hasBody ? (
                  <Text style={styles.reviewBodyPrimary} numberOfLines={10}>
                    {rev.body.trim()}
                  </Text>
                ) : null}
                {rev.place ? (
                  <View style={styles.reviewPlaceRow}>
                    <Ionicons name="location-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.reviewPlaceText} numberOfLines={1}>{rev.place}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.reviewNoImage}>
            <LinearGradient
              colors={[`${COLORS.primary}12`, `${COLORS.primary}03`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.reviewNoImageAccent}
            />
            {ratingVal != null && (
              <View style={styles.reviewRatingInline}>
                <ReviewStars rating={ratingVal} size={16} filledColor={GOLD} emptyColor={COLORS.textMuted} />
                <Text style={styles.reviewRatingInlineNum}>{ratingVal.toFixed(1)}</Text>
              </View>
            )}
            {hasBody ? (
              <View style={styles.reviewQuoteRow}>
                <Ionicons name="chatbox-ellipses-outline" size={22} color={`${COLORS.primary}99`} style={styles.reviewQuoteIcon} />
                <Text style={styles.reviewBodyFeatured} numberOfLines={12}>
                  {rev.body.trim()}
                </Text>
              </View>
            ) : (
              <Text style={styles.reviewNoTextHint}>No written review</Text>
            )}
            {rev.place ? (
              <View style={[styles.reviewPlaceRow, styles.reviewPlaceRowMuted]}>
                <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.reviewPlaceTextMuted} numberOfLines={2}>{rev.place}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function NearbyCardAnimated({ idx, children }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(14)).current

  useEffect(() => {
    const delay = Math.min(idx, 12) * 45
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 9,
          tension: 78,
          useNativeDriver: true,
        }),
      ]).start()
    }, delay)
    return () => clearTimeout(timer)
  }, [idx, opacity, translateY])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  )
}

function PostFullViewModal({ visible, posts, index, onClose, COLORS, isDark, insets, businessName }) {
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(index || 0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cardWidth = Math.min(screenWidth - 28, 460);
  const imageHeight = Math.round(cardWidth);

  useEffect(() => {
    if (visible) {
      setActiveIndex(index || 0);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      if (scrollRef.current && screenWidth > 0) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ x: (index || 0) * screenWidth, animated: false });
        }, 0);
      }
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, index, screenWidth, fadeAnim]);

  const handleScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / Math.max(1, screenWidth));
    if (next !== activeIndex) setActiveIndex(next);
  };

  if (!visible || !posts?.length) return null;
  const total = posts.length;
  const currentPostNumber = Math.min(total, Math.max(1, activeIndex + 1));
  const counterLabel = `Post ${currentPostNumber} of ${total}`;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View style={[pvStyles.backdrop, { opacity: fadeAnim }]}>
        <BlurView intensity={Platform.OS === 'ios' ? 92 : 78} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={pvStyles.backdropScrim} />

        <View style={[pvStyles.header, { paddingTop: (insets?.top ?? 0) + 10 }]}>
          <TouchableOpacity
            style={pvStyles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityLabel="Close post"
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={pvStyles.closeBtnBg} />
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={pvStyles.headerCenter}>
            {businessName ? (
              <Text style={pvStyles.headerBusiness} numberOfLines={1}>{businessName}</Text>
            ) : null}
            {total > 1 ? (
              <View style={pvStyles.headerCountPill}>
                <Ionicons name="albums-outline" size={12} color="rgba(255,255,255,0.9)" />
                <Text style={pvStyles.headerCount}>{counterLabel}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={screenWidth}
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={pvStyles.scroll}
          contentContainerStyle={pvStyles.cardPagerContent}
        >
          {posts.map((p, i) => (
            <View key={p.id || `pv-${i}`} style={[pvStyles.cardPage, { width: screenWidth }]}>
              <View style={[pvStyles.postCard, { width: cardWidth }]}>
                <View style={pvStyles.cardHeader}>
                  <View style={pvStyles.cardAvatar}>
                    <Ionicons name="storefront-outline" size={16} color={COLORS.primary} />
                  </View>
                  <View style={pvStyles.cardHeaderInfo}>
                    <Text style={pvStyles.cardHeaderUsername} numberOfLines={1}>
                      {businessName || 'Client'}
                    </Text>
                    {p.createdAt ? (
                      <Text style={pvStyles.cardHeaderLocation} numberOfLines={1}>
                        {formatPostDate(p.createdAt)}
                      </Text>
                    ) : (
                      <Text style={pvStyles.cardHeaderLocation} numberOfLines={1}>
                        Bahrain
                      </Text>
                    )}
                  </View>
                </View>
                {p.imageUri ? (
                  <CachedImage
                    source={{ uri: p.imageUri }}
                    style={[pvStyles.postImage, { height: imageHeight }]}
                    resizeMode="cover"
                    recyclingKey={`full-${p.imageUri}`}
                  />
                ) : (
                  <View style={[pvStyles.noImage, { height: imageHeight }]}>
                    <Ionicons name="image-outline" size={44} color="rgba(255,255,255,0.45)" />
                  </View>
                )}
                <ScrollView
                  style={pvStyles.postContent}
                  contentContainerStyle={pvStyles.postContentInner}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {p.description ? (
                    <Text style={pvStyles.description}>
                      <Text style={pvStyles.descriptionName}>{businessName || 'Client'} </Text>
                      {p.description}
                    </Text>
                  ) : (
                    <Text style={pvStyles.emptyDescription}>No description for this post</Text>
                  )}
                </ScrollView>
              </View>
            </View>
          ))}
        </ScrollView>

        {total > 1 ? (
          <View style={[pvStyles.dotsRow, { paddingBottom: (insets?.bottom ?? 0) + 8 }]} pointerEvents="none">
            {posts.map((_, i) => (
              <View key={i} style={[pvStyles.dot, i === activeIndex && pvStyles.dotActive]} />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const pvStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#05070A',
  },
  backdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  closeBtnBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,20,0.38)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerBusiness: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.2,
  },
  headerCount: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.35,
  },
  headerCountPill: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  scroll: { flex: 1 },
  cardPagerContent: { alignItems: 'center' },
  cardPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  postCard: {
    maxHeight: '84%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.14)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 22,
      },
      android: { elevation: 9 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  cardAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.1)',
  },
  cardHeaderInfo: { flex: 1, minWidth: 0 },
  cardHeaderUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardHeaderLocation: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  postImage: {
    width: '100%',
    backgroundColor: '#E2E8F0',
  },
  noImage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  postContent: { maxHeight: 165 },
  postContentInner: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  dotActive: {
    backgroundColor: GOLD,
    width: 18,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '700',
    color: GOLD_LIGHT,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: '#0F172A',
  },
  descriptionName: {
    fontWeight: '700',
  },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontStyle: 'italic',
  },
});

function getModalColors(c) {
  return {
    primary: c.primary,
    primaryLight: c.primaryLight || c.primary,
    textPrimary: c.textPrimary,
    textSecondary: c.textSecondary,
    textMuted: c.textMuted,
    screenBg: c.background,
    pillBg: c.borderLight,
    surface: c.surface ?? themeColors.surface,
    border: c.border ?? themeColors.border,
    rating: GOLD,
  };
}

function parseReviewImage(imageColumn) {
  if (!imageColumn) return null;
  try {
    const parsed = typeof imageColumn === 'string' ? JSON.parse(imageColumn) : imageColumn;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr[0] || null;
  } catch {
    return typeof imageColumn === 'string' ? imageColumn : null;
  }
}

function parseJsonField(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [p];
    } catch {
      return val ? [val] : null;
    }
  }
  return [val];
}

function formatTimeToAmPm(value) {
  if (value == null) return ''
  const raw = String(value).trim()
  if (!raw) return ''

  if (/\b(am|pm)\b/i.test(raw)) {
    return raw
      .replace(/\bam\b/i, 'AM')
      .replace(/\bpm\b/i, 'PM')
  }

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return raw

  const hours24 = Number(match[1])
  const minutes = match[2] ?? '00'
  if (Number.isNaN(hours24) || hours24 < 0 || hours24 > 23) return raw

  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = (hours24 % 12) || 12
  return `${hours12}:${minutes} ${suffix}`
}

function formatTimeRangeToAmPm(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const parts = raw.split(/\s*-\s*/)
  if (parts.length === 2) {
    const start = formatTimeToAmPm(parts[0])
    const end = formatTimeToAmPm(parts[1])
    return `${start} - ${end}`
  }
  return formatTimeToAmPm(raw)
}

function formatClientTimings(value) {
  if (!value) return ''

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    try {
      const parsed = JSON.parse(trimmed)
      return formatClientTimings(parsed)
    } catch {
      return formatTimeRangeToAmPm(trimmed)
    }
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => formatClientTimings(entry))
      .filter(Boolean)
      .join(' | ')
  }

  if (typeof value === 'object') {
    const directOpen = value.open || value.opening || value.opening_time
    const directClose = value.close || value.closing || value.closing_time
    if (directOpen || directClose) {
      if (directOpen && directClose) return `${formatTimeToAmPm(directOpen)} - ${formatTimeToAmPm(directClose)}`
      return formatTimeToAmPm(directOpen || directClose)
    }

    const parts = Object.entries(value)
      .map(([day, span]) => {
        const spanLabel = formatClientTimings(span)
        if (!spanLabel) return ''
        return `${day}: ${spanLabel}`
      })
      .filter(Boolean)
    return parts.join(' | ')
  }

  return String(value)
}

function formatClientCategoryLabel(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ')
  if (normalized.includes('event organizer') || normalized.includes('eventorganizer')) return 'Event'
  if (normalized === 'events' || normalized === 'event') return 'Event'
  return raw
}

function toFiniteNumber(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatDistanceLabel(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return ''
  if (distanceKm < 1) return `${Math.max(1, Math.round(distanceKm * 1000))} m away`
  return `${distanceKm.toFixed(1)} km away`
}

function isRestaurantCategory(value) {
  const normalized = String(value || '').toLowerCase().replace(/[_-]+/g, ' ')
  if (!normalized) return false
  return ['restaurant', 'cafe', 'food', 'dining', 'coffee'].some((token) => normalized.includes(token))
}

function getModalStyles(C, isDark) {
  const surface = C.surface ?? themeColors.surface;
  const border = C.border ?? themeColors.border;
  const glassTint = isDark ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.72)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  return {
    clientProfilePage: { flex: 1, backgroundColor: C.screenBg },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.26)',
    },
    sheetContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      top: '7%',
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.2,
          shadowRadius: 14,
        },
        android: { elevation: 10 },
      }),
    },
    sheetHandleArea: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 10,
      paddingBottom: 8,
      backgroundColor: isDark ? 'rgba(15,23,42,0.98)' : 'rgba(255,255,255,0.98)',
    },
    sheetHandleBar: {
      width: 46,
      height: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.2)',
    },
    sheetHandleHint: {
      marginTop: 5,
      fontSize: 11,
      fontWeight: '600',
      color: C.textSecondary,
      letterSpacing: 0.2,
    },
    headerBlur: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      overflow: 'hidden',
      backgroundColor: 'transparent',
      zIndex: 40,
    },
    headerBlurSolid: {
      backgroundColor: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.9)',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: hairline,
    },
    clientProfileBackBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.72)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.08)',
    },
    clientProfileHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.textPrimary, textAlign: 'center', letterSpacing: 0.2 },
    clientProfileHeaderPlaceholder: { width: 42, height: 42 },
    clientProfileLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
    clientProfileLoadingText: { fontSize: 14, color: C.textSecondary },
    skeletonCard: { marginHorizontal: 14, marginTop: 100, padding: 16, borderRadius: LUXURY.radiusCardSheet, backgroundColor: surface, ...luxurySoftShadow },
    skeletonAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.pillBg, alignSelf: 'center' },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: C.pillBg, marginTop: 8 },
    skeletonLineShort: { width: '60%' },
    clientProfileError: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 28 },
    clientProfileErrorText: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },
    clientProfileRetryBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    clientProfileRetryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

    /* ===================  HERO  =================== */
    heroWrap: {
      width: '100%',
      paddingBottom: 10,
      position: 'relative',
      overflow: 'hidden',
    },
    heroBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 260,
    },
    heroOrbA: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 130,
      top: -60,
      right: -80,
      opacity: isDark ? 0.55 : 0.35,
    },
    heroOrbB: {
      position: 'absolute',
      width: 200,
      height: 200,
      borderRadius: 100,
      top: 40,
      left: -70,
      opacity: isDark ? 0.45 : 0.28,
    },
    heroOrbGold: {
      position: 'absolute',
      width: 140,
      height: 140,
      borderRadius: 70,
      top: -30,
      left: '42%',
      opacity: 0.18,
      backgroundColor: GOLD,
    },
    heroContent: {
      alignItems: 'center',
      paddingHorizontal: 22,
      paddingTop: 75,
    },
    avatarOuterRing: {
      width: 118,
      height: 118,
      borderRadius: 59,
      padding: 2,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: GOLD,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.45,
          shadowRadius: 22,
        },
        android: { elevation: 12 },
      }),
    },
    avatarMidRing: {
      width: 114,
      height: 114,
      borderRadius: 57,
      padding: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInner: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 3,
      borderColor: surface,
    },
    avatarImg: { width: 102, height: 102, borderRadius: 51 },
    verifiedBadge: {
      position: 'absolute',
      right: 2,
      bottom: 4,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: surface,
      ...luxurySoftShadow,
    },
    nameWordmark: {
      marginTop: 18,
      fontSize: 30,
      color: C.textPrimary,
      textAlign: 'center',
      letterSpacing: 0.5,
      fontFamily: BRAND_WORDMARK_FONT,
      ...Platform.select({
        ios: { fontWeight: '400' },
        android: {},
      }),
    },
    nameFallback: {
      fontSize: 26,
      fontWeight: '800',
      color: C.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.5,
      marginTop: 18,
    },
    nameAccentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 6,
    },
    nameAccentLine: {
      height: 1,
      width: 36,
      backgroundColor: GOLD,
      opacity: 0.85,
    },
    nameAccentDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: GOLD,
    },
    subCategoryRow: {
      marginTop: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subCategoryText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 2.5,
      textTransform: 'uppercase',
    },
    ratingHeroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 999,
      alignSelf: 'center',
      backgroundColor: isDark ? 'rgba(212,175,55,0.14)' : 'rgba(212,175,55,0.12)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(212,175,55,0.45)',
    },
    ratingHeroText: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? GOLD_LIGHT : '#8A6A14',
      letterSpacing: 0.3,
    },

    /* ===================  CHIPS  =================== */
    chipsSectionTitle: {
      marginTop: 10,
      marginHorizontal: 22,
      fontSize: 10.5,
      fontWeight: '800',
      color: C.textMuted,
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginHorizontal: 18,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: glassTint,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: 0.1,
    },
    chipPrimary: {
      backgroundColor: isDark ? 'rgba(230,57,80,0.14)' : 'rgba(200,16,46,0.08)',
      borderColor: isDark ? 'rgba(230,57,80,0.35)' : 'rgba(200,16,46,0.22)',
    },
    chipPrimaryText: { color: C.primary },
    chipGold: {
      backgroundColor: isDark ? 'rgba(212,175,55,0.16)' : 'rgba(212,175,55,0.12)',
      borderColor: 'rgba(212,175,55,0.45)',
    },
    chipGoldText: { color: isDark ? GOLD_LIGHT : '#8A6A14' },

    /* ===================  DESCRIPTION  =================== */
    bioWrap: {
      marginTop: 18,
      marginHorizontal: 22,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: isDark ? 'rgba(15,23,42,0.62)' : 'rgba(255,255,255,0.9)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        },
        android: { elevation: 3 },
      }),
    },
    bioHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    bioLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: isDark ? GOLD_LIGHT : '#8A6A14',
    },
    bio: {
      fontSize: 14.5,
      color: C.textPrimary,
      lineHeight: 23,
      fontWeight: '600',
      letterSpacing: 0,
    },
    bioToggleBtn: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    bioToggleText: {
      fontSize: 12.5,
      fontWeight: '800',
      color: C.primary,
      letterSpacing: 0.2,
    },
    bioSkeletonWrap: {
      marginTop: 18,
      marginHorizontal: 22,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: isDark ? 'rgba(15,23,42,0.62)' : 'rgba(255,255,255,0.9)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
    },
    bioSkeletonLine: {
      height: 10,
      borderRadius: 6,
      backgroundColor: C.pillBg,
      marginTop: 8,
    },
    timingsTopWrap: {
      marginTop: 12,
      alignSelf: 'center',
      width: '100%',
      maxWidth: 320,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(15,23,42,0.78)' : 'rgba(255,255,255,0.92)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.12)',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.14,
          shadowRadius: 10,
        },
        android: { elevation: 4 },
      }),
    },
    timingsTopLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 4,
    },
    timingsTopLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: isDark ? GOLD_LIGHT : '#8A6A14',
    },
    timingsTopValue: {
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '800',
      lineHeight: 20,
      color: C.textPrimary,
    },
    timingsTopSkeletonWrap: {
      marginTop: 12,
      alignSelf: 'center',
      width: '100%',
      maxWidth: 320,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(15,23,42,0.62)' : 'rgba(255,255,255,0.86)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)',
    },
    timingsTopSkeletonLine: {
      height: 10,
      borderRadius: 6,
      backgroundColor: C.pillBg,
      alignSelf: 'center',
    },

    /* ===================  CTA  =================== */
    ctaRow: {
      flexDirection: 'row',
      gap: 10,
      marginHorizontal: 18,
      marginTop: 22,
    },
    arBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 15,
      borderRadius: 16,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 14 },
        android: { elevation: 6 },
      }),
    },
    arBtnText: { fontSize: 14, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 },
    arBtnShine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '50%',
      opacity: 0.22,
    },
    mapsBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: glassTint,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(212,175,55,0.55)',
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 12 },
        android: { elevation: 4 },
      }),
    },
    mapsBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? GOLD_LIGHT : '#8A6A14',
      letterSpacing: 0.4,
    },

    /* ===================  TABS  =================== */
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 18,
      marginTop: 24,
      marginBottom: 8,
      position: 'relative',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: hairline,
    },
    tabIndicator: {
      position: 'absolute',
      bottom: -StyleSheet.hairlineWidth,
      left: 0,
      height: 2,
      backgroundColor: GOLD,
      borderRadius: 2,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 14,
    },
    tabText: { fontSize: 12, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
    tabTextActive: { color: C.textPrimary },
    tabBadge: {
      paddingVertical: 2,
      paddingHorizontal: 7,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    },
    tabBadgeActive: { backgroundColor: C.primary },
    tabBadgeText: { fontSize: 10, fontWeight: '800', color: C.textMuted },
    tabBadgeTextActive: { color: '#FFF' },
    tabContent: { flex: 1, backgroundColor: C.screenBg },

    /* ===================  EMPTY  =================== */
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 62,
      gap: 14,
      marginHorizontal: 18,
      marginTop: 12,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      borderStyle: 'dashed',
    },
    emptyText: { fontSize: 13, color: C.textMuted, fontWeight: '600', letterSpacing: 0.3 },

    /* ===================  GRID  =================== */
    gridWrap: { alignSelf: 'stretch' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridItem: {
      overflow: 'hidden',
      backgroundColor: C.pillBg,
      borderRadius: 14,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8 },
        android: { elevation: 3 },
      }),
    },
    gridImage: { width: '100%', height: '100%', borderRadius: 14 },
    gridImageScrim: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 14,
    },
    gridPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.pillBg, borderRadius: 14 },

    /* ===================  REVIEWS  =================== */
    reviewsContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20 },
    reviewsList: { gap: 16 },
    reviewCard: {
      backgroundColor: surface,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 18 },
        android: { elevation: 5 },
      }),
    },
    reviewHero: {
      width: '100%',
      aspectRatio: 1.22,
      backgroundColor: C.pillBg,
      position: 'relative',
    },
    reviewHeroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    reviewHeroScrim: { ...StyleSheet.absoluteFillObject },
    reviewRatingPill: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 22,
      backgroundColor: 'rgba(15, 23, 42, 0.62)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    reviewRatingPillNum: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', marginLeft: 2 },
    reviewTextBlock: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, gap: 10 },
    reviewBodyPrimary: { fontSize: 16, fontWeight: '500', color: C.textPrimary, lineHeight: 25, letterSpacing: -0.25 },
    reviewPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reviewPlaceRowMuted: { marginTop: 4 },
    reviewPlaceText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.textSecondary },
    reviewPlaceTextMuted: { flex: 1, fontSize: 13, color: C.textSecondary, lineHeight: 19 },
    reviewNoImage: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, position: 'relative', overflow: 'hidden' },
    reviewNoImageAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 4, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
    reviewRatingInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    reviewRatingInlineNum: { fontSize: 17, fontWeight: '800', color: GOLD, marginLeft: 4 },
    reviewQuoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    reviewQuoteIcon: { marginTop: 3 },
    reviewBodyFeatured: { flex: 1, fontSize: 17, fontWeight: '600', color: C.textPrimary, lineHeight: 26, letterSpacing: -0.35 },
    reviewNoTextHint: { fontSize: 14, color: C.textMuted, fontStyle: 'italic', lineHeight: 20 },

    /* ===================  NEARBY  =================== */
    nearbySection: {
      marginTop: 18,
      paddingTop: 14,
    },
    nearbyDividerWrap: {
      marginHorizontal: 18,
      marginBottom: 14,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      height: 26,
    },
    nearbyDividerLine: {
      width: '100%',
      height: 2,
      borderRadius: 999,
      overflow: 'hidden',
    },
    nearbyDividerCenter: {
      position: 'absolute',
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.98)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(212,175,55,0.42)' : 'rgba(212,175,55,0.52)',
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
        android: { elevation: 4 },
      }),
    },
    nearbyEyebrow: {
      marginHorizontal: 18,
      fontSize: 10.5,
      fontWeight: '800',
      color: C.textMuted,
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 8,
      textAlign: 'center',
    },
    nearbyHeaderRow: {
      marginHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginBottom: 6,
    },
    nearbyHeaderIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(212,175,55,0.16)' : 'rgba(212,175,55,0.12)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(212,175,55,0.45)',
    },
    nearbyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: C.textPrimary,
      letterSpacing: -0.2,
    },
    nearbySubtitle: {
      marginHorizontal: 18,
      fontSize: 13,
      color: C.textSecondary,
      marginBottom: 14,
      lineHeight: 19,
      textAlign: 'center',
    },
    nearbyGroupTitle: {
      marginHorizontal: 18,
      marginTop: 8,
      marginBottom: 8,
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: C.textMuted,
    },
    nearbyScrollContent: {
      paddingHorizontal: 18,
      gap: 12,
    },
    nearbyCard: {
      width: 206,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: hairline,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 16 },
        android: { elevation: 4 },
      }),
    },
    nearbyCardImageWrap: {
      width: '100%',
      height: 112,
      backgroundColor: C.pillBg,
      position: 'relative',
    },
    nearbyCardImage: {
      width: '100%',
      height: '100%',
    },
    nearbyCardFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nearbyCardBody: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 13,
      gap: 6,
    },
    nearbyCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: 0.1,
    },
    nearbyCardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    nearbyCardMetaText: {
      flex: 1,
      fontSize: 12,
      color: C.textSecondary,
    },
    nearbyLoadingRow: {
      marginHorizontal: 18,
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    nearbyEmpty: {
      marginHorizontal: 18,
      marginTop: 8,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      borderStyle: 'dashed',
    },
    nearbyEmptyText: {
      fontSize: 12.5,
      color: C.textMuted,
      textAlign: 'center',
    },
  };
}

export default function ClientProfileModal({
  visible,
  clientId,
  initialClientData = null,
  onClose,
  insets,
  onOpenARNavigate,
  animationFrom = 'right',
  presentation = 'page',
}) {
  const { colors, isDark } = useTheme();
  const COLORS = React.useMemo(() => getModalColors(colors), [colors]);
  const styles = React.useMemo(() => StyleSheet.create(getModalStyles(COLORS, isDark)), [COLORS, isDark]);
  const { width: screenWidth = 375, height: screenHeight = 812 } = useWindowDimensions();
  const [client, setClient] = useState(null);
  const [activeClientId, setActiveClientId] = useState(clientId || null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientPosts, setClientPosts] = useState([]);
  const [clientReviews, setClientReviews] = useState([]);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [nearbyRestaurants, setNearbyRestaurants] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [activeTab, setActiveTab] = useState(PROFILE_TAB_POSTS);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const slideAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const nearbySectionOpacity = useRef(new Animated.Value(0)).current;
  const nearbySectionTranslate = useRef(new Animated.Value(12)).current;
  const tabIndicatorX = useRef(new Animated.Value(0)).current;
  const [tabSegment, setTabSegment] = useState(0);
  const prevTabSegment = useRef(0);
  const avatarEntrance = useRef(new Animated.Value(0)).current;
  const nameEntrance = useRef(new Animated.Value(0)).current;
  const skeletonPulse = useRef(new Animated.Value(0.55)).current;
  const clientCacheRef = useRef(new Map());
  const restaurantCacheRef = useRef(new Map());
  const postsCacheRef = useRef(new Map());
  const reviewsCacheRef = useRef(new Map());
  const closeInFlightRef = useRef(false);
  const sheetDragY = useRef(new Animated.Value(0)).current;
  const sheetDragOffsetRef = useRef(0);
  const profileScrollRef = useRef(null);

  useEffect(() => {
    if (!visible) return
    if (!clientId) return
    setActiveClientId(clientId)
  }, [visible, clientId]);

  useEffect(() => {
    if (visible) {
      closeInFlightRef.current = false;
      sheetDragY.setValue(0);
      slideAnim.setValue(1);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      closeInFlightRef.current = false;
      slideAnim.setValue(1);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  useEffect(() => {
    if (!visible || !activeClientId) {
      setClient(null);
      setRestaurant(null);
      setError(null);
      setClientPosts([]);
      setClientReviews([]);
      setPostsLoading(false);
      setReviewsLoading(false);
      setShowFullDescription(false);
      setViewerOpen(false);
      return;
    }
    if (initialClientData && initialClientData.client_a_uuid === activeClientId) {
      setClient((prev) => prev || initialClientData);
      const seededClientBasics = {
        client_a_uuid: initialClientData.client_a_uuid,
        business_name: initialClientData.business_name ?? null,
        name: initialClientData.name ?? null,
        client_image: initialClientData.client_image ?? null,
        location: initialClientData.location ?? null,
        rating: initialClientData.rating ?? null,
        price_range: initialClientData.price_range ?? null,
        timings: initialClientData.timings ?? null,
        __cachePartial: true,
      };
      clientCacheRef.current.set(activeClientId, {
        ...(clientCacheRef.current.get(activeClientId) || {}),
        ...seededClientBasics,
      });
    }
    const cachedClient = clientCacheRef.current.get(activeClientId);
    if (cachedClient) {
      setClient(cachedClient);
      setRestaurant(restaurantCacheRef.current.get(cachedClient.client_a_uuid || activeClientId) || null);
      setError(null);
      if (!cachedClient.__cachePartial) {
        setLoading(false);
        return;
      }
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: byUuid, error: e1 } = await supabase
          .from('client')
          .select('*')
          .eq('client_a_uuid', activeClientId)
          .maybeSingle();
        if (cancelled) return;
        let finalClient = null;
        if (e1) {
          const { data: byId } = await supabase.from('client').select('*').eq('id', activeClientId).maybeSingle();
          if (cancelled) return;
          if (byId) finalClient = byId;
          else setError(e1.message || 'Could not load profile');
        } else if (byUuid) {
          finalClient = byUuid;
        } else {
          setError('Profile not found');
        }
        if (finalClient) {
          setClient(finalClient);
          clientCacheRef.current.set(activeClientId, {
            ...finalClient,
            __cachePartial: false,
          });
          const uuidForRest = finalClient.client_a_uuid;
          if (uuidForRest) {
            try {
              const { data: restData } = await supabase
                .from('restaurant_client')
                .select('cuisine, meal_type, food_type, speciality, isfoodtruck')
                .eq('a_uuid', uuidForRest)
                .maybeSingle();
              if (!cancelled && restData) {
                setRestaurant(restData);
                restaurantCacheRef.current.set(uuidForRest, restData);
              }
            } catch (_) {
              // restaurant_client table may not exist yet
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, activeClientId]);

  useEffect(() => {
    if (!client) {
      avatarEntrance.setValue(0);
      nameEntrance.setValue(0);
      return;
    }
    avatarEntrance.setValue(0);
    nameEntrance.setValue(0);
    Animated.parallel([
      Animated.spring(avatarEntrance, { toValue: 1, friction: 8, tension: 72, useNativeDriver: true }),
      Animated.timing(nameEntrance, { toValue: 1, duration: 520, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [client?.client_a_uuid, avatarEntrance, nameEntrance]);

  useEffect(() => {
    if (!loading || !visible) {
      skeletonPulse.setValue(0.55);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(skeletonPulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading, visible, skeletonPulse]);

  useEffect(() => {
    if (!visible || !client || !client.client_a_uuid) return;
    let cancelled = false;
    const uuid = client.client_a_uuid;
    const cachedPosts = postsCacheRef.current.get(uuid);
    const cachedReviews = reviewsCacheRef.current.get(uuid);
    if (cachedPosts) {
      setClientPosts(cachedPosts);
      setPostsLoading(false);
    } else {
      setClientPosts([]);
      setPostsLoading(true);
    }
    if (cachedReviews) {
      setClientReviews(cachedReviews);
      setReviewsLoading(false);
    } else {
      setClientReviews([]);
      setReviewsLoading(true);
    }
    if (cachedPosts && cachedReviews) return;
    (async () => {
      try {
        const postsRes = await supabase
          .from('posts')
          .select('post_uuid, post_image, description, created_at')
          .eq('client_a_uuid', uuid)
          .order('created_at', { ascending: false })
          .limit(30);
        if (!cancelled) {
          const mappedPosts = (postsRes.data || []).map((r) => ({
            id: r.post_uuid,
            imageUri: resolvePublicImageUrl(r.post_image),
            description: r.description || '',
            createdAt: r.created_at || null,
          }));
          setClientPosts(mappedPosts);
          postsCacheRef.current.set(uuid, mappedPosts);
        }
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    })();

    (async () => {
      const name = client.business_name || client.name || client.business_name_ar || '';
      const toReviewUri = (img) => {
        const raw = parseReviewImage(img);
        return resolvePublicImageUrl(raw);
      };
      try {
        const reviewsRes = await supabase
          .from('community')
          .select('community_uuid, review_text, rating, badge, image, created_at')
          .eq('client_a_uuid', uuid)
          .order('created_at', { ascending: false })
          .limit(20);

        let reviews = (reviewsRes.data || []).map((r) => ({
          id: r.community_uuid,
          body: (r.review_text || '').trim(),
          rating: r.rating != null ? Number(r.rating) : null,
          place: r.badge || null,
          imageUri: toReviewUri(r.image),
        }));

        if (reviews.length === 0 && name) {
          const { data: byBadge } = await supabase
            .from('community')
            .select('community_uuid, review_text, rating, badge, image, created_at')
            .ilike('badge', `%${name.slice(0, 20)}%`)
            .order('created_at', { ascending: false })
            .limit(20);
          if (!cancelled && byBadge?.length) {
            reviews = byBadge.map((r) => ({
              id: r.community_uuid,
              body: (r.review_text || '').trim(),
              rating: r.rating != null ? Number(r.rating) : null,
              place: r.badge || null,
              imageUri: toReviewUri(r.image),
            }));
          }
        }
        if (!cancelled) {
          setClientReviews(reviews);
          reviewsCacheRef.current.set(uuid, reviews);
        }
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, client]);

  useEffect(() => {
    setShowFullDescription(false);
  }, [client?.client_a_uuid]);

  useEffect(() => {
    if (!visible) {
      nearbySectionOpacity.setValue(0)
      nearbySectionTranslate.setValue(12)
      return
    }
    nearbySectionOpacity.setValue(0)
    nearbySectionTranslate.setValue(12)
    Animated.parallel([
      Animated.timing(nearbySectionOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(nearbySectionTranslate, {
        toValue: 0,
        friction: 10,
        tension: 76,
        useNativeDriver: true,
      }),
    ]).start()
  }, [visible, activeClientId, nearbySectionOpacity, nearbySectionTranslate]);

  useEffect(() => {
    if (!visible) {
      setNearbyPlaces([]);
      setNearbyRestaurants([]);
      setNearbyLoading(false);
      return
    }

    const originLat = toFiniteNumber(client?.lat)
    const originLng = toFiniteNumber(client?.long)
    if (originLat == null || originLng == null) {
      setNearbyPlaces([])
      setNearbyRestaurants([])
      setNearbyLoading(false)
      return
    }

    let cancelled = false
    setNearbyLoading(true)

    ;(async () => {
      try {
        const { data, error: nearbyError } = await supabase
          .from('client')
          .select('client_a_uuid, business_name, client_image, client_type, rating, lat, long')
          .limit(140)

        if (nearbyError) throw nearbyError
        if (cancelled) return

        const currentUuid = client?.client_a_uuid
        const ranked = (data || [])
          .map((row) => {
            const lat = toFiniteNumber(row?.lat)
            const lng = toFiniteNumber(row?.long)
            if (lat == null || lng == null) return null
            if (currentUuid && row?.client_a_uuid === currentUuid) return null

            const distanceKm = haversineKm(originLat, originLng, lat, lng)
            if (!Number.isFinite(distanceKm)) return null

            const combinedType = `${row?.client_type || ''} ${row?.category || ''}`
            return {
              id: row?.client_a_uuid || `${row?.business_name || row?.name || 'spot'}-${lat}-${lng}`,
              clientId: row?.client_a_uuid || null,
              title: row?.business_name || 'Nearby spot',
              imageUri: resolvePublicImageUrl(row?.client_image),
              rating: row?.rating != null && row?.rating !== '' ? Number(row.rating) : null,
              category: formatClientCategoryLabel(row?.client_type || ''),
              location: '',
              lat,
              lng,
              distanceKm,
              distanceLabel: formatDistanceLabel(distanceKm),
              isRestaurant: isRestaurantCategory(combinedType),
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.distanceKm - b.distanceKm)

        const nextRestaurants = []
        const nextPlaces = []

        for (const item of ranked) {
          if (item.isRestaurant) {
            if (nextRestaurants.length < 8) nextRestaurants.push(item)
          } else if (nextPlaces.length < 8) {
            nextPlaces.push(item)
          }
          if (nextRestaurants.length >= 8 && nextPlaces.length >= 8) break
        }

        setNearbyRestaurants(nextRestaurants)
        setNearbyPlaces(nextPlaces)
      } catch (_) {
        if (!cancelled) {
          setNearbyRestaurants([])
          setNearbyPlaces([])
        }
      } finally {
        if (!cancelled) setNearbyLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [visible, client?.client_a_uuid, client?.lat, client?.long]);

  useEffect(() => {
    if (tabSegment <= 0) return;
    const hadSegment = prevTabSegment.current > 0;
    const segmentResized = hadSegment && Math.abs(prevTabSegment.current - tabSegment) > 0.5;
    prevTabSegment.current = tabSegment;
    if (segmentResized) {
      const x = activeTab === PROFILE_TAB_POSTS ? 0 : tabSegment;
      tabIndicatorX.setValue(x);
    }
  }, [tabSegment, activeTab, tabIndicatorX]);

  useEffect(() => {
    if (tabSegment <= 0) return;
    const to = activeTab === PROFILE_TAB_POSTS ? 0 : tabSegment;
    Animated.spring(tabIndicatorX, { toValue: to, useNativeDriver: true, friction: 9, tension: 80 }).start();
  }, [activeTab, tabIndicatorX, tabSegment]);

  const handlePostPress = useCallback((_post, idx) => {
    setViewerIndex(idx);
    setViewerOpen(true);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  const handleNearbyProfilePress = useCallback((nextClientId) => {
    if (!nextClientId) return
    if (nextClientId === activeClientId) return
    setViewerOpen(false)
    setShowFullDescription(false)
    setActiveTab(PROFILE_TAB_POSTS)
    setScrollY(0)
    profileScrollRef.current?.scrollTo?.({ y: 0, animated: false })
    setClient(null)
    setRestaurant(null)
    setClientPosts([])
    setClientReviews([])
    setNearbyPlaces([])
    setNearbyRestaurants([])
    setLoading(true)
    setPostsLoading(true)
    setReviewsLoading(true)
    setNearbyLoading(true)
    setActiveClientId(nextClientId)
  }, [activeClientId]);

  const handleRequestClose = useCallback(() => {
    if (closeInFlightRef.current) return
    closeInFlightRef.current = true
    setViewerOpen(false)
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      closeInFlightRef.current = false
      onClose?.()
    })
  }, [fadeAnim, onClose, slideAnim]);

  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => presentation === 'sheet',
      onMoveShouldSetPanResponder: (_evt, g) =>
        presentation === 'sheet' && Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 0.72,
      onPanResponderGrant: () => {
        sheetDragOffsetRef.current = 0
      },
      onPanResponderMove: (_evt, g) => {
        const rawY = sheetDragOffsetRef.current + g.dy
        const dampedY = rawY > 0 ? rawY : rawY * 0.18
        sheetDragY.setValue(Math.max(0, Math.min(280, dampedY)))
      },
      onPanResponderRelease: (_evt, g) => {
        const shouldClose = g.dy > 88 || g.vy > 0.4
        if (shouldClose) {
          handleRequestClose()
          return
        }
        Animated.spring(sheetDragY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start(() => {
          sheetDragOffsetRef.current = 0
        })
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetDragY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start(() => {
          sheetDragOffsetRef.current = 0
        })
      },
    })
  ).current;

  if (!visible) return null;

  const name = client?.business_name || client?.name || client?.business_name_ar || 'Business';
  const description = client?.description || '';
  const hasLongDescription = description.trim().length > 170;
  const showDescriptionSkeleton = loading && !description;
  const location = client?.location || client?.address || '';
  const rating = client?.rating != null && client?.rating !== '' ? Number(client.rating) : null;
  const priceRange = client?.price_range != null && client?.price_range !== '' ? String(client.price_range) : null;
  const category = formatClientCategoryLabel(client?.category || client?.client_type || '');
  const cuisine = client?.cuisine || client?.cuisine_type || restaurant?.cuisine || '';
  const profileAvatarUri = client?.client_image ? resolvePublicImageUrl(String(client.client_image).trim()) : null;
  const isVerified = Boolean(client?.verified || client?.is_verified || client?.status === 'verified');
  const timingsLabel = formatClientTimings(client?.timings);
  const showTimingsSkeleton = loading && !timingsLabel;

  const mealTypes = parseJsonField(restaurant?.meal_type);
  const foodTypes = parseJsonField(restaurant?.food_type);
  const speciality = restaurant?.speciality;
  const isFoodTruck = restaurant?.isfoodtruck === true;
  const isCurrentProfileRestaurant = isRestaurantCategory(`${client?.client_type || ''} ${category || ''}`)

  const GRID_COLS = 3;
  const GALLERY_H_PAD = 14;
  const gridGap = 8;
  const galleryWidth = Math.max(0, screenWidth - GALLERY_H_PAD * 2);
  const gridCellSize = Math.max(
    1,
    Math.floor((galleryWidth - gridGap * (GRID_COLS - 1)) / GRID_COLS),
  );

  const slideTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, animationFrom === 'right' ? screenWidth : 0],
  });
  const slideTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, animationFrom === 'bottom' ? screenHeight : 0],
  });
  const slideTransform =
    animationFrom === 'bottom'
      ? [{ translateY: slideTranslateY }]
      : [{ translateX: slideTranslateX }]
  const finalTransform =
    presentation === 'sheet'
      ? [...slideTransform, { translateY: sheetDragY }]
      : slideTransform

  const avatarScale = avatarEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const avatarOpacityAnim = avatarEntrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const nameTranslate = nameEntrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const nameOpacity = nameEntrance;

  const showHeaderSolid = scrollY > 40;

  const headerTopPadding = presentation === 'sheet' ? 4 : (insets?.top ?? 0) + 8
  const heroTopPadding = presentation === 'sheet' ? 68 : 96

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleRequestClose} statusBarTranslucent>
      {presentation === 'sheet' ? (
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleRequestClose} />
        </View>
      ) : null}
      <Animated.View
        style={[
          styles.clientProfilePage,
          presentation === 'sheet' && styles.sheetContainer,
          { opacity: fadeAnim, transform: finalTransform },
        ]}
      >
        {presentation === 'sheet' ? (
          <View style={styles.sheetHandleArea} {...sheetPanResponder.panHandlers}>
            <View style={styles.sheetHandleBar} />
            <Text style={styles.sheetHandleHint}>Swipe down</Text>
          </View>
        ) : null}
        <View
          style={[styles.headerBlur, showHeaderSolid && styles.headerBlurSolid, { paddingTop: headerTopPadding }]}
          {...(presentation === 'sheet' ? sheetPanResponder.panHandlers : {})}
        >
          <TouchableOpacity style={styles.clientProfileBackBtn} onPress={handleRequestClose} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          {showHeaderSolid ? (
            <Text style={styles.clientProfileHeaderTitle} numberOfLines={1}>
              {client ? (name || 'Profile') : 'Profile'}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={styles.clientProfileHeaderPlaceholder} />
        </View>

        {loading && !client ? (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <Animated.View style={{ opacity: skeletonPulse }}>
              <View style={styles.skeletonCard}>
                <View style={styles.skeletonAvatar} />
                <View style={[styles.skeletonLine, { width: '60%', alignSelf: 'center', marginTop: 18 }]} />
                <View style={[styles.skeletonLine, styles.skeletonLineShort, { alignSelf: 'center', marginTop: 10 }]} />
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 24, justifyContent: 'center' }}>
                  <View style={[styles.skeletonLine, { width: 56, height: 40 }]} />
                  <View style={[styles.skeletonLine, { width: 56, height: 40 }]} />
                  <View style={[styles.skeletonLine, { width: 56, height: 40 }]} />
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        ) : error ? (
          <View style={styles.clientProfileError}>
            <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.clientProfileErrorText}>{error}</Text>
            <TouchableOpacity style={styles.clientProfileRetryBtn} onPress={handleRequestClose} activeOpacity={0.85}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.clientProfileRetryBtnText}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : client ? (
          <ScrollView
            ref={profileScrollRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          >
            <Animated.View>
              {/* HERO */}
              <View style={styles.heroWrap}>
                <LinearGradient
                  colors={gradients.hero(isDark)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroBackdrop}
                />
                <LinearGradient
                  colors={[COLORS.primary + '55', COLORS.primary + '00']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.heroOrbA}
                />
                <LinearGradient
                  colors={[COLORS.primaryLight + '44', COLORS.primaryLight + '00']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.heroOrbB}
                />
                <View style={styles.heroOrbGold} />

                <View style={[styles.heroContent, { paddingTop: heroTopPadding }]}>
                  <Animated.View style={{ transform: [{ scale: avatarScale }], opacity: avatarOpacityAnim }}>
                    <LinearGradient
                      colors={[GOLD, '#E9C770', GOLD, '#B8962E']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarOuterRing}
                    >
                      <LinearGradient
                        colors={[COLORS.primary, COLORS.primaryLight]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.avatarMidRing}
                      >
                        <View style={styles.avatarInner}>
                          {profileAvatarUri ? (
                            <CachedImage source={{ uri: profileAvatarUri }} style={styles.avatarImg} resizeMode="cover" recyclingKey={profileAvatarUri} />
                          ) : (
                            <Ionicons name="storefront" size={42} color={COLORS.primary} />
                          )}
                        </View>
                      </LinearGradient>
                    </LinearGradient>
                    {isVerified ? (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                      </View>
                    ) : null}
                  </Animated.View>

                  <Animated.View style={{ opacity: nameOpacity, transform: [{ translateY: nameTranslate }], alignSelf: 'stretch' }}>
                    <Text
                      style={[styles.nameWordmark]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {name}
                    </Text>

                    <View style={styles.nameAccentRow}>
                      <View style={styles.nameAccentLine} />
                      <View style={styles.nameAccentDot} />
                      <View style={styles.nameAccentLine} />
                    </View>

                    {(category || cuisine) ? (
                      <View style={styles.subCategoryRow}>
                        <Text style={styles.subCategoryText} numberOfLines={1}>
                          {[category, cuisine].filter(Boolean).join('   ·   ')}
                        </Text>
                      </View>
                    ) : null}

                    {rating != null ? (
                      <View style={styles.ratingHeroRow}>
                        <Ionicons name="star" size={13} color={isDark ? GOLD_LIGHT : '#8A6A14'} />
                        <Text style={styles.ratingHeroText}>{Number(rating).toFixed(1)} · Rated</Text>
                      </View>
                    ) : null}
                    {timingsLabel ? (
                      <View style={styles.timingsTopWrap}>
                        <View style={styles.timingsTopLabelRow}>
                          <Ionicons name="time-outline" size={13} color={isDark ? GOLD_LIGHT : '#8A6A14'} />
                          <Text style={styles.timingsTopLabel}>Opening Hours</Text>
                        </View>
                        <Text style={styles.timingsTopValue}>{timingsLabel}</Text>
                      </View>
                    ) : showTimingsSkeleton ? (
                      <Animated.View style={[styles.timingsTopSkeletonWrap, { opacity: skeletonPulse }]}>
                        <View style={[styles.timingsTopSkeletonLine, { width: 108, marginBottom: 8 }]} />
                        <View style={[styles.timingsTopSkeletonLine, { width: 210 }]} />
                      </Animated.View>
                    ) : null}
                  </Animated.View>
                </View>
              </View>

              {/* DESCRIPTION */}
              {description ? (
                <View style={styles.bioWrap}>
                  <View style={styles.bioHeaderRow}>
                    <Ionicons name="information-circle-outline" size={14} color={isDark ? GOLD_LIGHT : '#8A6A14'} />
                    <Text style={styles.bioLabel}>Description</Text>
                  </View>
                  <Text style={styles.bio} numberOfLines={showFullDescription ? undefined : 3}>{description}</Text>
                  {hasLongDescription ? (
                    <Pressable
                      style={({ pressed }) => [styles.bioToggleBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => setShowFullDescription((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={showFullDescription ? 'Collapse description' : 'Expand description'}
                    >
                      <Text style={styles.bioToggleText}>{showFullDescription ? 'Read less' : 'Read more'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : showDescriptionSkeleton ? (
                <Animated.View style={[styles.bioSkeletonWrap, { opacity: skeletonPulse }]}>
                  <View style={[styles.bioSkeletonLine, { width: 110, marginTop: 0, alignSelf: 'flex-start' }]} />
                  <View style={[styles.bioSkeletonLine, { width: '100%' }]} />
                  <View style={[styles.bioSkeletonLine, { width: '92%' }]} />
                  <View style={[styles.bioSkeletonLine, { width: '74%' }]} />
                </Animated.View>
              ) : null}
              {/* CTA BUTTONS */}
              {(client?.lat != null && client?.long != null) ? (
                <View style={styles.ctaRow}>
                  {onOpenARNavigate ? (
                    <TouchableOpacity
                      style={styles.arBtn}
                      onPress={() => {
                        onClose?.();
                        onOpenARNavigate({ lat: Number(client.lat), lng: Number(client.long), name: name || 'Destination' });
                      }}
                      activeOpacity={0.88}
                      accessibilityRole="button"
                      accessibilityLabel="Open in AR"
                    >
                      <LinearGradient
                        colors={[COLORS.primary, COLORS.primaryLight]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <LinearGradient
                        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.arBtnShine}
                      />
                      <Ionicons name="navigate" size={18} color="#FFF" />
                      <Text style={styles.arBtnText}>Open in AR</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.mapsBtn}
                    onPress={() => openGoogleMapsDirections(Number(client.lat), Number(client.long))}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Open in Maps"
                  >
                    <Ionicons name="map-outline" size={18} color={isDark ? GOLD_LIGHT : '#8A6A14'} />
                    <Text style={styles.mapsBtnText}>Open in Maps</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* TABS */}
              <View
                style={styles.tabs}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  const seg = w / 2;
                  setTabSegment(seg);
                  tabIndicatorX.setValue(activeTab === PROFILE_TAB_POSTS ? 0 : seg);
                }}
              >
                {tabSegment > 0 && (
                  <Animated.View
                    style={[
                      styles.tabIndicator,
                      { width: tabSegment, transform: [{ translateX: tabIndicatorX }] },
                    ]}
                  />
                )}
                <Pressable
                  style={({ pressed }) => [styles.tab, pressed && { opacity: 0.8 }]}
                  onPress={() => setActiveTab(PROFILE_TAB_POSTS)}
                >
                  <Ionicons name="grid-outline" size={16} color={activeTab === PROFILE_TAB_POSTS ? COLORS.textPrimary : COLORS.textMuted} />
                  <Text style={[styles.tabText, activeTab === PROFILE_TAB_POSTS && styles.tabTextActive]}>Posts</Text>
                  <View style={[styles.tabBadge, activeTab === PROFILE_TAB_POSTS && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === PROFILE_TAB_POSTS && styles.tabBadgeTextActive]}>{clientPosts.length}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.tab, pressed && { opacity: 0.8 }]}
                  onPress={() => setActiveTab(PROFILE_TAB_REVIEWS)}
                >
                  <Ionicons name="star-outline" size={16} color={activeTab === PROFILE_TAB_REVIEWS ? COLORS.textPrimary : COLORS.textMuted} />
                  <Text style={[styles.tabText, activeTab === PROFILE_TAB_REVIEWS && styles.tabTextActive]}>Reviews</Text>
                  <View style={[styles.tabBadge, activeTab === PROFILE_TAB_REVIEWS && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === PROFILE_TAB_REVIEWS && styles.tabBadgeTextActive]}>{clientReviews.length}</Text>
                  </View>
                </Pressable>
              </View>

              {activeTab === PROFILE_TAB_POSTS ? (
                <View style={[styles.tabContent, { paddingBottom: (insets?.bottom ?? 0) + 20, paddingTop: 10 }]}>
                  {clientPosts.length === 0 ? (
                    <View style={styles.empty}>
                      {postsLoading ? (
                        <>
                          <ActivityIndicator size="small" color={COLORS.primary} />
                          <Text style={styles.emptyText}>Loading posts...</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="images-outline" size={38} color={COLORS.textMuted} />
                          <Text style={styles.emptyText}>No posts yet</Text>
                        </>
                      )}
                    </View>
                  ) : (
                    <View style={[styles.gridWrap, { paddingHorizontal: GALLERY_H_PAD }]}>
                      <View style={[styles.grid, { width: galleryWidth }]}>
                        {clientPosts.map((post, idx) => (
                          <GalleryGridCell
                            key={post.id || `p-${idx}`}
                            post={post}
                            idx={idx}
                            gridCellSize={gridCellSize}
                            gridGap={gridGap}
                            GRID_COLS={GRID_COLS}
                            styles={styles}
                            COLORS={COLORS}
                            onPress={handlePostPress}
                          />
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.reviewsContent, { paddingBottom: (insets?.bottom ?? 0) + 20 }]}>
                  {clientReviews.length === 0 ? (
                    <View style={styles.empty}>
                      {reviewsLoading ? (
                        <>
                          <ActivityIndicator size="small" color={COLORS.primary} />
                          <Text style={styles.emptyText}>Loading reviews...</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="chatbubbles-outline" size={38} color={COLORS.textMuted} />
                          <Text style={styles.emptyText}>No reviews yet</Text>
                        </>
                      )}
                    </View>
                  ) : (
                    <View style={styles.reviewsList}>
                      {clientReviews.map((rev, idx) => (
                        <ReviewCardAnimated
                          key={rev.id || `r-${idx}`}
                          rev={rev}
                          idx={idx}
                          styles={styles}
                          COLORS={COLORS}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}

              <Animated.View
                style={[
                  styles.nearbySection,
                  {
                    paddingBottom: (insets?.bottom ?? 0) + 22,
                    opacity: nearbySectionOpacity,
                    transform: [{ translateY: nearbySectionTranslate }],
                  },
                ]}
              >
                <View style={styles.nearbyDividerWrap}>
                  <View style={styles.nearbyDividerLine}>
                    <LinearGradient
                      colors={['transparent', 'rgba(212,175,55,0.8)', 'transparent']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                  <View style={styles.nearbyDividerCenter}>
                    <Ionicons name="compass-outline" size={14} color={isDark ? GOLD_LIGHT : '#8A6A14'} />
                  </View>
                </View>
                <Text style={styles.nearbyEyebrow}>Discover More</Text>
                <View style={styles.nearbyHeaderRow}>
                  <View style={styles.nearbyHeaderIconWrap}>
                    <Ionicons name="compass-outline" size={16} color={isDark ? GOLD_LIGHT : '#8A6A14'} />
                  </View>
                  <Text style={styles.nearbyTitle}>Nearby</Text>
                </View>
                <Text style={styles.nearbySubtitle}>
                  Explore nearby places and restaurants around this profile
                </Text>

                {nearbyLoading ? (
                  <View style={styles.nearbyLoadingRow}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.nearbyCardMetaText}>Finding nearby recommendations...</Text>
                  </View>
                ) : null}

                {!nearbyLoading && nearbyPlaces.length === 0 && nearbyRestaurants.length === 0 ? (
                  <View style={styles.nearbyEmpty}>
                    <Text style={styles.nearbyEmptyText}>No nearby places or restaurants found</Text>
                  </View>
                ) : null}

                {!nearbyLoading && (isCurrentProfileRestaurant ? nearbyRestaurants.length > 0 : nearbyPlaces.length > 0) ? (
                  <>
                    <Text style={styles.nearbyGroupTitle}>{isCurrentProfileRestaurant ? 'Restaurants' : 'Places'}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      nestedScrollEnabled
                      contentContainerStyle={styles.nearbyScrollContent}
                    >
                      {(isCurrentProfileRestaurant ? nearbyRestaurants : nearbyPlaces).map((item, idx) => (
                        <NearbyCardAnimated
                          key={`${item.id}-${isCurrentProfileRestaurant ? 'rest' : 'place'}-${idx}`}
                          idx={idx}
                        >
                          <TouchableOpacity
                            style={styles.nearbyCard}
                            activeOpacity={0.88}
                            onPress={() => handleNearbyProfilePress(item.clientId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.title} profile`}
                          >
                            <View style={styles.nearbyCardImageWrap}>
                              {item.imageUri ? (
                                <CachedImage source={{ uri: item.imageUri }} style={styles.nearbyCardImage} resizeMode="cover" recyclingKey={item.imageUri} />
                              ) : (
                                <View style={styles.nearbyCardFallback}>
                                  <Ionicons
                                    name={isCurrentProfileRestaurant ? 'restaurant-outline' : 'location-outline'}
                                    size={28}
                                    color={COLORS.textMuted}
                                  />
                                </View>
                              )}
                            </View>
                            <View style={styles.nearbyCardBody}>
                              <Text style={styles.nearbyCardTitle} numberOfLines={2}>{item.title}</Text>
                              <View style={styles.nearbyCardMetaRow}>
                                <Ionicons name="navigate-outline" size={13} color={COLORS.textSecondary} />
                                <Text style={styles.nearbyCardMetaText} numberOfLines={1}>{item.distanceLabel}</Text>
                              </View>
                              {item.rating != null ? (
                                <View style={styles.nearbyCardMetaRow}>
                                  <Ionicons name="star" size={12} color={GOLD} />
                                  <Text style={styles.nearbyCardMetaText} numberOfLines={1}>
                                    {Number(item.rating).toFixed(1)}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        </NearbyCardAnimated>
                      ))}
                    </ScrollView>
                  </>
                ) : null}

                {!nearbyLoading && (isCurrentProfileRestaurant ? nearbyPlaces.length > 0 : nearbyRestaurants.length > 0) ? (
                  <>
                    <Text style={styles.nearbyGroupTitle}>{isCurrentProfileRestaurant ? 'Places' : 'Restaurants'}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      nestedScrollEnabled
                      contentContainerStyle={styles.nearbyScrollContent}
                    >
                      {(isCurrentProfileRestaurant ? nearbyPlaces : nearbyRestaurants).map((item, idx) => (
                        <NearbyCardAnimated
                          key={`${item.id}-${isCurrentProfileRestaurant ? 'place' : 'rest'}-${idx}`}
                          idx={idx}
                        >
                          <TouchableOpacity
                            style={styles.nearbyCard}
                            activeOpacity={0.88}
                            onPress={() => handleNearbyProfilePress(item.clientId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.title} profile`}
                          >
                            <View style={styles.nearbyCardImageWrap}>
                              {item.imageUri ? (
                                <CachedImage source={{ uri: item.imageUri }} style={styles.nearbyCardImage} resizeMode="cover" recyclingKey={item.imageUri} />
                              ) : (
                                <View style={styles.nearbyCardFallback}>
                                  <Ionicons
                                    name={isCurrentProfileRestaurant ? 'location-outline' : 'restaurant-outline'}
                                    size={28}
                                    color={COLORS.textMuted}
                                  />
                                </View>
                              )}
                            </View>
                            <View style={styles.nearbyCardBody}>
                              <Text style={styles.nearbyCardTitle} numberOfLines={2}>{item.title}</Text>
                              <View style={styles.nearbyCardMetaRow}>
                                <Ionicons name="navigate-outline" size={13} color={COLORS.textSecondary} />
                                <Text style={styles.nearbyCardMetaText} numberOfLines={1}>{item.distanceLabel}</Text>
                              </View>
                              {item.rating != null ? (
                                <View style={styles.nearbyCardMetaRow}>
                                  <Ionicons name="star" size={12} color={GOLD} />
                                  <Text style={styles.nearbyCardMetaText} numberOfLines={1}>
                                    {Number(item.rating).toFixed(1)}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        </NearbyCardAnimated>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </Animated.View>
            </Animated.View>
          </ScrollView>
        ) : null}

        <PostFullViewModal
          visible={viewerOpen}
          posts={clientPosts}
          index={viewerIndex}
          onClose={handleCloseViewer}
          COLORS={COLORS}
          isDark={isDark}
          insets={insets}
          businessName={name}
        />
      </Animated.View>
    </Modal>
  );
}
