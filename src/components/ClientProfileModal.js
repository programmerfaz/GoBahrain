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

function PostFullViewModal({ visible, posts, index, onClose, COLORS, isDark, insets, businessName }) {
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(index || 0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
  const current = posts[activeIndex] || posts[0];
  const total = posts.length;
  const dateLabel = formatPostDate(current?.createdAt);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View style={[pvStyles.backdrop, { opacity: fadeAnim }]}>
        <View style={StyleSheet.absoluteFill}>
          {current?.imageUri ? (
            <CachedImage
              source={{ uri: current.imageUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              recyclingKey={`blur-${current.imageUri}`}
            />
          ) : null}
          <BlurView intensity={Platform.OS === 'ios' ? 95 : 80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        </View>

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
              <Text style={pvStyles.headerCount}>{activeIndex + 1} of {total}</Text>
            ) : null}
          </View>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={pvStyles.scroll}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {posts.map((p, i) => (
            <View key={p.id || `pv-${i}`} style={{ width: screenWidth, height: '100%', justifyContent: 'center', alignItems: 'center' }}>
              {p.imageUri ? (
                <CachedImage
                  source={{ uri: p.imageUri }}
                  style={{ width: screenWidth, aspectRatio: 1 }}
                  resizeMode="contain"
                  recyclingKey={`full-${p.imageUri}`}
                />
              ) : (
                <View style={pvStyles.noImage}>
                  <Ionicons name="image-outline" size={44} color="rgba(255,255,255,0.5)" />
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {total > 1 ? (
          <View style={pvStyles.dotsRow} pointerEvents="none">
            {posts.map((_, i) => (
              <View key={i} style={[pvStyles.dot, i === activeIndex && pvStyles.dotActive]} />
            ))}
          </View>
        ) : null}

        {(current?.description || dateLabel) ? (
          <View style={[pvStyles.infoPanel, { paddingBottom: (insets?.bottom ?? 0) + 18 }]}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
            {dateLabel ? (
              <View style={pvStyles.dateRow}>
                <Ionicons name="calendar-outline" size={13} color={GOLD_LIGHT} />
                <Text style={pvStyles.dateText}>{dateLabel}</Text>
              </View>
            ) : null}
            {current?.description ? (
              <Text style={pvStyles.description} numberOfLines={6}>
                {current.description}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const pvStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
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
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  scroll: { flex: 1 },
  noImage: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 160,
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
  infoPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 28,
    overflow: 'hidden',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '700',
    color: GOLD_LIGHT,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#FFFFFF',
    fontWeight: '500',
    letterSpacing: -0.15,
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

function getModalStyles(C, isDark) {
  const surface = C.surface ?? themeColors.surface;
  const border = C.border ?? themeColors.border;
  const glassTint = isDark ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.72)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  return {
    clientProfilePage: { flex: 1, backgroundColor: C.screenBg },
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
      paddingTop: 120,
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
      marginTop: 20,
      marginHorizontal: 22,
      paddingLeft: 14,
      borderLeftWidth: 2,
      borderLeftColor: GOLD,
    },
    bio: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 22,
      fontWeight: '500',
      fontStyle: 'italic',
      letterSpacing: 0.1,
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
  };
}

export default function ClientProfileModal({ visible, clientId, onClose, insets, onOpenARNavigate }) {
  const { colors, isDark } = useTheme();
  const COLORS = React.useMemo(() => getModalColors(colors), [colors]);
  const styles = React.useMemo(() => StyleSheet.create(getModalStyles(COLORS, isDark)), [COLORS, isDark]);
  const { width: screenWidth = 375 } = useWindowDimensions();
  const [client, setClient] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientPosts, setClientPosts] = useState([]);
  const [clientReviews, setClientReviews] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(PROFILE_TAB_POSTS);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const slideAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const tabIndicatorX = useRef(new Animated.Value(0)).current;
  const [tabSegment, setTabSegment] = useState(0);
  const prevTabSegment = useRef(0);
  const avatarEntrance = useRef(new Animated.Value(0)).current;
  const nameEntrance = useRef(new Animated.Value(0)).current;
  const skeletonPulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (visible) {
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
      slideAnim.setValue(1);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  useEffect(() => {
    if (!visible || !clientId) {
      setClient(null);
      setRestaurant(null);
      setError(null);
      setClientPosts([]);
      setClientReviews([]);
      setPostsLoading(false);
      setReviewsLoading(false);
      setViewerOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: byUuid, error: e1 } = await supabase
          .from('client')
          .select('*')
          .eq('client_a_uuid', clientId)
          .maybeSingle();
        if (cancelled) return;
        let finalClient = null;
        if (e1) {
          const { data: byId } = await supabase.from('client').select('*').eq('id', clientId).maybeSingle();
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
          const uuidForRest = finalClient.client_a_uuid;
          if (uuidForRest) {
            try {
              const { data: restData } = await supabase
                .from('restaurant_client')
                .select('cuisine, meal_type, food_type, speciality, isfoodtruck')
                .eq('a_uuid', uuidForRest)
                .maybeSingle();
              if (!cancelled && restData) setRestaurant(restData);
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
  }, [visible, clientId]);

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
    setClientPosts([]);
    setClientReviews([]);
    setPostsLoading(true);
    setReviewsLoading(true);
    (async () => {
      try {
        const postsRes = await supabase
          .from('posts')
          .select('post_uuid, post_image, description, created_at')
          .eq('client_a_uuid', uuid)
          .order('created_at', { ascending: false })
          .limit(30);
        if (!cancelled) {
          setClientPosts((postsRes.data || []).map((r) => ({
            id: r.post_uuid,
            imageUri: resolvePublicImageUrl(r.post_image),
            description: r.description || '',
            createdAt: r.created_at || null,
          })));
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
        if (!cancelled) setClientReviews(reviews);
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, client]);

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

  if (!visible) return null;

  const name = client?.business_name || client?.name || client?.business_name_ar || 'Business';
  const description = client?.description || '';
  const location = client?.location || client?.address || '';
  const rating = client?.rating != null && client?.rating !== '' ? Number(client.rating) : null;
  const priceRange = client?.price_range != null && client?.price_range !== '' ? String(client.price_range) : null;
  const category = client?.category || client?.client_type || '';
  const cuisine = client?.cuisine || client?.cuisine_type || restaurant?.cuisine || '';
  const profileAvatarUri = client?.client_image ? resolvePublicImageUrl(String(client.client_image).trim()) : null;
  const isVerified = Boolean(client?.verified || client?.is_verified || client?.status === 'verified');

  const mealTypes = parseJsonField(restaurant?.meal_type);
  const foodTypes = parseJsonField(restaurant?.food_type);
  const speciality = restaurant?.speciality;
  const isFoodTruck = restaurant?.isfoodtruck === true;

  const GRID_COLS = 3;
  const GALLERY_H_PAD = 14;
  const gridGap = 8;
  const galleryWidth = Math.max(0, screenWidth - GALLERY_H_PAD * 2);
  const gridCellSize = Math.max(
    1,
    Math.floor((galleryWidth - gridGap * (GRID_COLS - 1)) / GRID_COLS),
  );

  const slideTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 24],
  });

  const avatarScale = avatarEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const avatarOpacityAnim = avatarEntrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const nameTranslate = nameEntrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const nameOpacity = nameEntrance;

  const showHeaderSolid = scrollY > 40;

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.clientProfilePage, { opacity: fadeAnim, transform: [{ translateY: slideTranslateY }] }]}>
        <View style={[styles.headerBlur, showHeaderSolid && styles.headerBlurSolid, { paddingTop: (insets?.top ?? 0) + 8 }]}>
          <TouchableOpacity style={styles.clientProfileBackBtn} onPress={onClose} activeOpacity={0.85}>
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

        {loading ? (
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
            <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={[styles.clientProfileLoadingText, { marginTop: 12 }]}>Loading profile…</Text>
            </View>
          </ScrollView>
        ) : error ? (
          <View style={styles.clientProfileError}>
            <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.clientProfileErrorText}>{error}</Text>
            <TouchableOpacity style={styles.clientProfileRetryBtn} onPress={onClose} activeOpacity={0.85}>
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

                <View style={styles.heroContent}>
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
                  </Animated.View>
                </View>
              </View>

              {/* DESCRIPTION */}
              {description ? (
                <View style={styles.bioWrap}>
                  <Text style={styles.bio} numberOfLines={5}>{description}</Text>
                </View>
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
