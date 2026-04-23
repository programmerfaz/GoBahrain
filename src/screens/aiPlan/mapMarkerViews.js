import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  Animated,
  ActivityIndicator,
  Easing,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'

import { Marker, Circle } from 'react-native-maps'
import { CachedImage } from '../../components/CachedImage'

import { mapMarkerFilterCategoryKey } from './mapOverlayAndMarkersModel'
import { Gesture, GestureDetector, ScrollView as GHScrollView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Reanimated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../config/supabase'
import { resolvePublicImageUrl, parseStorageImageUrl } from '../../utils/imageUrl'
import { openGoogleMapsDirections } from '../../utils/googleMapsDirections'
import { colors as themeColors } from '../../theme/designTokens'
import { luxurySoftShadow } from '../../theme/luxuryPremium'
import { useTheme } from '../../context/ThemeContext'
import styles from '../AIPlanScreen.styles'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './constants'
import { PreviewImage } from './uiScoutMosaic'

const ReanimatedScrollView = Reanimated.createAnimatedComponent(GHScrollView)

export function AnimatedPlaceMarker({
  mk,
  accent,
  isCurrent,
  onPress,
  showBadge = true,
  showCircle = true,
  zoomScale = 1,
  revealPopStep = null,
  hideLabel = false,
  selectedGlow = false,
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseRing = useRef(new Animated.Value(0)).current;
  const breatheScale = useRef(new Animated.Value(1)).current;

  /** Snappy overshoot pop — used on mount and on each sequential plan reveal step (syncs with map pan). */
  const playMarkerPop = useCallback(() => {
    scaleAnim.stopAnimation()
    opacityAnim.stopAnimation()
    scaleAnim.setValue(0)
    opacityAnim.setValue(0)
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.14,
          friction: 5,
          tension: 260,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }, [scaleAnim, opacityAnim])

  // Plan build: pop when this stop becomes the newest visible pin (matches camera pan in useAIPlanScreenOuter).
  useEffect(() => {
    if (revealPopStep == null) return
    if (revealPopStep !== mk.idx + 1) return
    playMarkerPop()
  }, [revealPopStep, mk.idx, playMarkerPop])

  // Pre-plan markers, or plan pins when not in sequential reveal — one-time entrance (mount only).
  useEffect(() => {
    if (revealPopStep != null) return
    playMarkerPop()
    // revealPopStep intentionally read only at mount so pins do not all re-pop when reveal ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pulseActive = isCurrent

  useEffect(() => {
    if (!pulseActive) {
      breatheScale.setValue(1);
      pulseRing.setValue(0);
      return;
    }
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheScale, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breatheScale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRing, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseRing, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    breathe.start();
    ring.start();
    return () => { breathe.stop(); ring.stop(); };
  }, [pulseActive, breatheScale, pulseRing]);

  const ringScale = pulseRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulseRing.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0.2, 0] });
  const combinedScale = Animated.multiply(scaleAnim, breatheScale);
  const showLabel = !hideLabel && zoomScale >= 0.55;

  const mkCat = mapMarkerFilterCategoryKey(mk);
  const pinIcon = mkCat === 'restaurant' ? 'restaurant' : mkCat === 'event' ? 'calendar' : 'location';
  const imageUrl = resolvePublicImageUrl(mk.image);

  const showRadius = showCircle

  return (
    <React.Fragment>
      {showRadius && (
        <Circle
          center={{ latitude: mk.lat, longitude: mk.lng }}
          radius={260}
          fillColor={`${accent}0D`}
          strokeColor={`${accent}2E`}
          strokeWidth={1.5}
        />
      )}
      <Marker coordinate={{ latitude: mk.lat, longitude: mk.lng }} onPress={onPress} anchor={{ x: 0.5, y: 1 }}>
        <Animated.View style={[styles.animatedMarkerWrap, { opacity: opacityAnim, transform: [{ scale: Animated.multiply(combinedScale, zoomScale) }] }]}>
          {showLabel ? (
            <View
              style={[
                styles.animatedMarkerLabel,
                typeof accent === 'string' && accent.length === 7
                  ? { borderColor: `${accent}44` }
                  : null,
              ]}
            >
              <Text style={[styles.animatedMarkerLabelText, { color: accent }]} numberOfLines={1}>{mk.spot}</Text>
            </View>
          ) : null}
          <View style={styles.animatedMarkerAnchor}>
            <View style={styles.animatedMarkerPinColumn}>
              <View style={styles.animatedMarkerPinHeadWrap}>
                {pulseActive && (
                  <Animated.View
                    style={[
                      styles.animatedMarkerPulseRing,
                      {
                        borderColor: accent,
                        transform: [{ scale: ringScale }],
                        opacity: ringOpacity,
                      },
                    ]}
                  />
                )}
                {selectedGlow ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.animatedMarkerPulseRing,
                      {
                        borderColor: accent,
                        opacity: 0.75,
                        transform: [{ scale: 1.18 }],
                      },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.animatedMarkerPinHead,
                    typeof accent === 'string' && accent.length === 7 ? { borderColor: accent } : { borderColor: accent || '#94a3b8' },
                  ]}
                >
                  {imageUrl ? (
                    <CachedImage source={{ uri: imageUrl }} style={styles.animatedMarkerImage} recyclingKey={imageUrl} resizeMode="cover" />
                  ) : (
                    <>
                      <View style={[styles.animatedMarkerIconBg, { backgroundColor: accent }]}>
                        <Ionicons name={pinIcon} size={18} color="#FFF" />
                      </View>
                      {showBadge ? (
                        <View style={[styles.animatedMarkerBadge, { backgroundColor: accent }]}>
                          <Text style={styles.animatedMarkerBadgeText}>{mk.idx + 1}</Text>
                        </View>
                      ) : null}
                    </>
                  )}
                  {imageUrl && showBadge ? (
                    <View style={[styles.animatedMarkerBadge, styles.animatedMarkerBadgeOnImage, { backgroundColor: accent }]}>
                      <Text style={styles.animatedMarkerBadgeText}>{mk.idx + 1}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={[styles.animatedMarkerPinStem, { borderTopColor: accent }]} />
            </View>
          </View>
        </Animated.View>
      </Marker>
    </React.Fragment>
  );
}

/** Hero height when detail is open (full-screen feel) — must match styles.markerDetailHeroFrame height */
const MARKER_DETAIL_HERO_H = SCREEN_HEIGHT * 0.48;

export function parseMarkerCommunityImage(imageColumn) {
  if (!imageColumn) return null;
  try {
    const parsed = typeof imageColumn === 'string' ? JSON.parse(imageColumn) : imageColumn;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const raw = arr[0] || null;
    return raw ? resolvePublicImageUrl(raw) : null;
  } catch {
    return typeof imageColumn === 'string' ? resolvePublicImageUrl(imageColumn) : null;
  }
}

export function MarkerDetailStarRow({ rating, size = 13 }) {
  if (rating == null || rating <= 0) return null;
  return (
    <View style={styles.markerDetailStarRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={rating >= i ? 'star' : rating >= i - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={rating >= i - 0.5 ? '#C9A227' : 'rgba(15, 23, 42, 0.2)'}
        />
      ))}
    </View>
  );
}

/** Glass luxury full-screen sheet: one CachedImage expands from marker rect (not a duplicate layer). */
export function MarkerShowcaseDetailSheet({ visible, mk, onDismiss, insets, accent, onViewProfile, morphAnchor }) {
  const { colors, isDark } = useTheme();
  const [feedPosts, setFeedPosts] = useState([]);
  const [feedReviews, setFeedReviews] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const openProgress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const scrollCollapseY = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const anchorX = useSharedValue(SCREEN_WIDTH / 2);
  const anchorY = useSharedValue(SCREEN_HEIGHT * 0.42);
  const anchorSize = useSharedValue(58);
  const onDismissRef = useRef(onDismiss);
  const onViewProfileRef = useRef(onViewProfile);
  onDismissRef.current = onDismiss;
  onViewProfileRef.current = onViewProfile;

  useEffect(() => {
    if (morphAnchor && typeof morphAnchor.x === 'number' && typeof morphAnchor.y === 'number') {
      anchorX.value = morphAnchor.x;
      anchorY.value = morphAnchor.y;
      anchorSize.value = morphAnchor.sizePx ?? 58;
    }
  }, [morphAnchor]);

  useEffect(() => {
    if (!visible || !mk) {
      setFeedPosts([]);
      setFeedReviews([]);
      setFeedLoading(false);
      return;
    }
    let cancelled = false;
    setFeedLoading(true);
    const spot = (mk.spot || '').trim();
    const clientId = mk.clientId || null;
    (async () => {
      try {
        if (clientId) {
          const [postsRes, revRes] = await Promise.all([
            supabase
              .from('posts')
              .select('post_uuid, post_image, description, created_at')
              .eq('client_a_uuid', clientId)
              .order('created_at', { ascending: false })
              .limit(16),
            supabase
              .from('community')
              .select('community_uuid, review_text, rating, badge, image, created_at')
              .eq('client_a_uuid', clientId)
              .order('created_at', { ascending: false })
              .limit(12),
          ]);
          if (cancelled) return;
          const posts = (postsRes.data || [])
            .map((r) => ({
              id: r.post_uuid,
              imageUri: resolvePublicImageUrl(r.post_image),
              description: (r.description || '').trim(),
            }))
            .filter((p) => p.imageUri);
          setFeedPosts(posts);
          const reviews = (revRes.data || []).map((r) => ({
            id: r.community_uuid,
            body: (r.review_text || '').trim(),
            rating: r.rating != null ? Number(r.rating) : null,
            place: r.badge || null,
            imageUri: parseMarkerCommunityImage(r.image),
          }));
          setFeedReviews(reviews);
        } else if (spot.length >= 2) {
          const { data: communityRows } = await supabase
            .from('community')
            .select('community_uuid, review_text, rating, badge, image, created_at')
            .ilike('badge', `%${spot.slice(0, 28)}%`)
            .order('created_at', { ascending: false })
            .limit(12);
          if (cancelled) return;
          setFeedPosts([]);
          setFeedReviews(
            (communityRows || []).map((r) => ({
              id: r.community_uuid,
              body: (r.review_text || '').trim(),
              rating: r.rating != null ? Number(r.rating) : null,
              place: r.badge || null,
              imageUri: parseMarkerCommunityImage(r.image),
            })),
          );
        } else {
          if (!cancelled) {
            setFeedPosts([]);
            setFeedReviews([]);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setFeedPosts([]);
          setFeedReviews([]);
        }
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, mk]);

  const runDismissFromUI = useCallback(() => {
    onDismissRef.current();
  }, []);

  const finishDismissAndProfile = useCallback((clientId) => {
    onDismissRef.current();
    if (clientId != null) onViewProfileRef.current?.(clientId);
  }, []);

  const closeWithMorph = useCallback(() => {
    dragY.value = withTiming(0, { duration: 50 });
    backdropOpacity.value = withTiming(0, { duration: 340 });
    openProgress.value = withTiming(0, { duration: 400 }, (finished) => {
      if (finished) runOnJS(runDismissFromUI)();
    });
  }, [backdropOpacity, dragY, openProgress, runDismissFromUI]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      const y = e.contentOffset.y;
      scrollCollapseY.value = y > 0 ? y : 0;
    },
  });

  useEffect(() => {
    if (visible && mk) {
      dragY.value = 0;
      scrollCollapseY.value = 0;
      openProgress.value = 0;
      backdropOpacity.value = 0;
      openProgress.value = withSpring(1, { damping: 17, stiffness: 188, mass: 0.78 });
      backdropOpacity.value = withTiming(1, { duration: 360 });
    }
  }, [visible, mk, backdropOpacity, dragY, openProgress]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
          'worklet';
          if (e.translationY > 0) dragY.value = e.translationY;
        })
        .onEnd((e) => {
          'worklet';
          if (dragY.value > 88 || e.velocityY > 620) {
            dragY.value = withTiming(0, { duration: 40 });
            backdropOpacity.value = withTiming(0, { duration: 340 });
            openProgress.value = withTiming(0, { duration: 400 }, (finished) => {
              if (finished) runOnJS(runDismissFromUI)();
            });
          } else {
            dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
          }
        }),
    [backdropOpacity, dragY, openProgress, runDismissFromUI],
  );

  /** One shared hero: same CachedImage expands from marker pixel rect to full hero (layout, not a second copy). */
  const heroImageExpandStyle = useAnimatedStyle(() => {
    const dragFactor = Math.min(dragY.value / 520, 0.3);
    const p = openProgress.value * (1 - dragFactor);
    const ax = anchorX.value;
    const ay = anchorY.value;
    const sz = anchorSize.value;
    const dragLift = dragY.value * 0.42;
    const left = interpolate(p, [0, 1], [ax - sz / 2, 0], Extrapolation.CLAMP);
    const top = interpolate(p, [0, 1], [ay - sz / 2, 0], Extrapolation.CLAMP) + dragLift;
    const width = interpolate(p, [0, 1], [sz, SCREEN_WIDTH], Extrapolation.CLAMP);
    const baseH = interpolate(p, [0, 1], [sz, MARKER_DETAIL_HERO_H], Extrapolation.CLAMP);
    const scrollShrink = interpolate(scrollCollapseY.value, [0, 220], [0, MARKER_DETAIL_HERO_H * 0.48], Extrapolation.CLAMP)
      * interpolate(p, [0.88, 1], [0, 1], Extrapolation.CLAMP);
    const height = Math.max(sz * 0.92, baseH - scrollShrink);
    const baseRadius = interpolate(p, [0, 1], [sz * 0.5, 0], Extrapolation.CLAMP);
    const scrollRound = interpolate(scrollCollapseY.value, [24, 200], [0, 22], Extrapolation.CLAMP)
      * interpolate(p, [0.88, 1], [0, 1], Extrapolation.CLAMP);
    const borderRadius = baseRadius + scrollRound;
    const shadowOp = interpolate(p, [0, 0.45, 1], [0.38, 0.14, 0.08], Extrapolation.CLAMP);
    const shadowR = interpolate(p, [0, 1], [18, 4], Extrapolation.CLAMP);
    const elev = Math.round(interpolate(p, [0, 1], [12, 3], Extrapolation.CLAMP));
    return {
      position: 'absolute',
      left,
      top,
      width,
      height,
      borderRadius,
      overflow: 'hidden',
      zIndex: 8,
      shadowColor: '#0f0a08',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: shadowOp,
      shadowRadius: shadowR,
      elevation: elev,
    };
  });

  /** Glass + scroll sits directly under the expanding image (same frame math). */
  const glassPanelStyle = useAnimatedStyle(() => {
    const dragFactor = Math.min(dragY.value / 520, 0.3);
    const p = openProgress.value * (1 - dragFactor);
    const ax = anchorX.value;
    const ay = anchorY.value;
    const sz = anchorSize.value;
    const dragLift = dragY.value * 0.42;
    const top = interpolate(p, [0, 1], [ay - sz / 2, 0], Extrapolation.CLAMP) + dragLift;
    const baseH = interpolate(p, [0, 1], [sz, MARKER_DETAIL_HERO_H], Extrapolation.CLAMP);
    const scrollShrink = interpolate(scrollCollapseY.value, [0, 220], [0, MARKER_DETAIL_HERO_H * 0.48], Extrapolation.CLAMP)
      * interpolate(p, [0.88, 1], [0, 1], Extrapolation.CLAMP);
    const h = Math.max(sz * 0.92, baseH - scrollShrink);
    const fade = interpolate(p, [0, 0.22, 0.5, 1], [0, 0.35, 0.92, 1], Extrapolation.CLAMP);
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: top + h,
      bottom: 0,
      opacity: fade,
      zIndex: 10,
    };
  });

  const infoCardExpandStyle = useAnimatedStyle(() => {
    const dragFactor = Math.min(dragY.value / 520, 0.3)
    const p = openProgress.value * (1 - dragFactor)
    const introLift = interpolate(p, [0, 1], [20, 0], Extrapolation.CLAMP)
    const expand = interpolate(scrollCollapseY.value, [0, 220], [0, 1], Extrapolation.CLAMP)
    return {
      marginHorizontal: interpolate(expand, [0, 1], [16, 4], Extrapolation.CLAMP),
      marginTop: interpolate(expand, [0, 1], [6, -4], Extrapolation.CLAMP),
      paddingHorizontal: interpolate(expand, [0, 1], [14, 18], Extrapolation.CLAMP),
      paddingTop: interpolate(expand, [0, 1], [10, 18], Extrapolation.CLAMP),
      paddingBottom: interpolate(expand, [0, 1], [10, 16], Extrapolation.CLAMP),
      borderRadius: interpolate(expand, [0, 1], [16, 20], Extrapolation.CLAMP),
      transform: [
        { translateY: introLift },
      ],
    }
  })

  const heroScrimStyle = useAnimatedStyle(() => {
    const expand = interpolate(scrollCollapseY.value, [0, 220], [0, 1], Extrapolation.CLAMP)
    return {
      opacity: interpolate(expand, [0, 1], [0.85, 1], Extrapolation.CLAMP),
    }
  })

  const grabberStyle = useAnimatedStyle(() => {
    const dragFactor = Math.min(dragY.value / 520, 0.3);
    const p = openProgress.value * (1 - dragFactor);
    const o = interpolate(p, [0, 0.55, 1], [0, 0.85, 1], Extrapolation.CLAMP);
    return { opacity: o };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * (1 - Math.min(dragY.value / 700, 0.35)),
  }));

  if (!visible || !mk) return null;

  const imageUrl = resolvePublicImageUrl(mk.image);
  const mkCat = mapMarkerFilterCategoryKey(mk);
  const pinIcon = mkCat === 'restaurant' ? 'restaurant' : mkCat === 'event' ? 'calendar' : 'location';
  const typeLabel = mkCat === 'restaurant' ? 'Dining' : mkCat === 'event' ? 'Event' : 'Place';
  const hasCoords = Number.isFinite(Number(mk.lat)) && Number.isFinite(Number(mk.lng));
  const lat = Number(mk.lat);
  const lng = Number(mk.lng);

  const handleOpenMaps = () => {
    if (!hasCoords) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openGoogleMapsDirections(lat, lng);
  };

  const handleViewProfilePress = () => {
    if (!mk.clientId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const cid = mk.clientId;
    backdropOpacity.value = withTiming(0, { duration: 300 });
    openProgress.value = withTiming(0, { duration: 380 }, (finished) => {
      if (finished) {
        runOnJS(finishDismissAndProfile)(cid);
      }
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={closeWithMorph}>
      <View style={styles.markerDetailModalRoot} pointerEvents="box-none">
        <Reanimated.View style={[styles.markerDetailBackdropDim, backdropStyle]} pointerEvents="none" />
        <Pressable
          style={styles.markerDetailBackdropPress}
          onPress={closeWithMorph}
          accessibilityRole="button"
          accessibilityLabel="Close place details"
        />

        <View style={styles.markerDetailModalContent} pointerEvents="box-none">
          <GestureDetector gesture={panGesture}>
            <View
              style={[
                styles.markerDetailHeroGestureLayer,
                { height: MARKER_DETAIL_HERO_H + insets.top + 52 },
              ]}
              pointerEvents="box-none"
            >
              {/* Single image: expands from marker on map to full hero — same URI as the pin */}
              <Reanimated.View style={heroImageExpandStyle}>
                {imageUrl ? (
                  <CachedImage
                    source={{ uri: imageUrl }}
                    style={styles.markerDetailHeroImageFill}
                    resizeMode="cover"
                    recyclingKey={imageUrl}
                  />
                ) : (
                  <View style={[styles.markerDetailHeroPlaceholder, { backgroundColor: `${accent}33` }]}>
                    <Ionicons name={pinIcon} size={48} color={accent} />
                  </View>
                )}
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.12)', 'transparent', 'rgba(15,23,42,0.12)', 'rgba(15,23,42,0.58)']}
                  locations={[0, 0.2, 0.55, 1]}
                  style={[styles.markerDetailHeroScrim, heroScrimStyle]}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.35)', 'transparent']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.85, y: 0.65 }}
                  style={styles.markerDetailHeroLuxSheen}
                />
              </Reanimated.View>

              <Reanimated.View style={[styles.markerDetailGrabberFloat, { paddingTop: insets.top + 6 }, grabberStyle]} pointerEvents="box-none">
                <View style={styles.markerDetailGrabberHit} accessibilityRole="adjustable" accessibilityLabel="Drag down to close">
                  <View style={styles.markerDetailGrabber} />
                </View>
              </Reanimated.View>
            </View>
          </GestureDetector>

          <Reanimated.View style={glassPanelStyle} pointerEvents="box-none">
            <BlurView intensity={Platform.OS === 'ios' ? 94 : 62} tint="light" style={styles.markerDetailGlassBlur}>
              <View style={styles.markerDetailGlassBody}>
                <View style={styles.markerDetailGlassFrost} pointerEvents="none" />
                <ReanimatedScrollView
                  style={styles.markerDetailScroll}
                  contentContainerStyle={[styles.markerDetailScrollContent, styles.markerDetailScrollContentLux, { paddingBottom: insets.bottom + 28 }]}
                  showsVerticalScrollIndicator={false}
                  bounces
                  onScroll={scrollHandler}
                  scrollEventThrottle={8}
                >
                  <Reanimated.View
                    style={[
                      {
                        backgroundColor: isDark ? 'rgba(15,23,42,0.82)' : 'rgba(255,255,255,0.8)',
                        borderWidth: 1,
                        borderColor: isDark ? `${accent}40` : `${accent}2A`,
                      },
                      infoCardExpandStyle,
                    ]}
                  >
                    <LinearGradient
                      colors={[`${accent}55`, `${accent}18`, 'transparent']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.markerDetailPremiumAccentBar}
                    />
                    <Text style={[styles.markerDetailTitle, styles.markerDetailTitlePremium, { color: colors.textPrimary }]} numberOfLines={3}>{mk.spot}</Text>
                    <View style={styles.markerDetailMetaRow}>
                      <View style={[styles.markerDetailTypeChip, styles.markerDetailTypeChipLux, { borderColor: `${accent}55`, backgroundColor: `${accent}12` }]}>
                        <Ionicons name={pinIcon} size={14} color={accent} />
                        <Text style={[styles.markerDetailTypeChipText, { color: accent }]}>{typeLabel}</Text>
                      </View>
                      {mk.time ? (
                        <Text style={[styles.markerDetailTimeText, { color: colors.textSecondary }]}>{mk.time}</Text>
                      ) : null}
                    </View>
                    {mk.reason ? (
                      <Text style={[styles.markerDetailReason, { color: colors.textSecondary }]}>{mk.reason}</Text>
                    ) : (
                      <Text style={[styles.markerDetailHint, { color: colors.textMuted }]}>Explore this stop on your map — open directions or the full profile when linked.</Text>
                    )}
                  </Reanimated.View>
                  <View style={{ height: 8 }} />

                  {feedLoading ? (
                    <View style={styles.markerDetailFeedLoading} accessibilityLabel="Loading feed">
                      <ActivityIndicator size="small" color={accent} />
                      <Text style={[styles.markerDetailFeedLoadingText, { color: colors.textSecondary }]}>Loading moments & reviews…</Text>
                    </View>
                  ) : null}

                  {feedPosts.length > 0 ? (
                    <View style={styles.markerDetailSection}>
                      <View style={styles.markerDetailSectionHeader}>
                        <Ionicons name="images-outline" size={18} color={accent} />
                        <Text style={[styles.markerDetailSectionTitle, { color: colors.textPrimary }]}>From the feed</Text>
                      </View>
                      <Text style={[styles.markerDetailSectionSub, { color: colors.textSecondary }]}>Recent posts featuring this place</Text>
                      <ScrollView
                        horizontal
                        nestedScrollEnabled
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.markerDetailPostStripContent}
                      >
                        {feedPosts.map((post) => (
                          <View key={post.id} style={[styles.markerDetailPostTile, { borderColor: `${accent}30` }]}>
                            <CachedImage
                              source={{ uri: post.imageUri }}
                              style={styles.markerDetailPostTileImg}
                              resizeMode="cover"
                              recyclingKey={post.imageUri}
                            />
                            <LinearGradient
                              pointerEvents="none"
                              colors={['transparent', 'rgba(15,23,42,0.65)']}
                              style={styles.markerDetailPostTileScrim}
                            />
                            {post.description ? (
                              <Text style={styles.markerDetailPostCaption} numberOfLines={2}>{post.description}</Text>
                            ) : null}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  {feedReviews.length > 0 ? (
                    <View style={styles.markerDetailSection}>
                      <View style={styles.markerDetailSectionHeader}>
                        <Ionicons name="chatbubbles-outline" size={18} color={accent} />
                        <Text style={[styles.markerDetailSectionTitle, { color: colors.textPrimary }]}>Community</Text>
                      </View>
                      <Text style={[styles.markerDetailSectionSub, { color: colors.textSecondary }]}>What locals are saying</Text>
                      {feedReviews.map((rev) => (
                        <View key={rev.id} style={[styles.markerDetailReviewCard, luxurySoftShadow]}>
                          <View style={styles.markerDetailReviewCardInner}>
                            <View style={styles.markerDetailReviewTop}>
                              <MarkerDetailStarRow rating={rev.rating} size={14} />
                              {rev.rating != null && Number.isFinite(rev.rating) ? (
                                <Text style={styles.markerDetailReviewScore}>{Number(rev.rating).toFixed(1)}</Text>
                              ) : null}
                            </View>
                            <View style={styles.markerDetailReviewBodyRow}>
                              {rev.imageUri ? (
                                <CachedImage
                                  source={{ uri: rev.imageUri }}
                                  style={styles.markerDetailReviewThumb}
                                  resizeMode="cover"
                                  recyclingKey={rev.imageUri}
                                />
                              ) : null}
                              <Text style={[styles.markerDetailReviewBody, { color: colors.textSecondary }]} numberOfLines={rev.imageUri ? 5 : 8}>
                                {rev.body || '—'}
                              </Text>
                            </View>
                            {rev.place ? (
                              <View style={styles.markerDetailReviewPlaceRow}>
                                <Ionicons name="location-outline" size={13} color={accent} />
                                <Text style={styles.markerDetailReviewPlace} numberOfLines={1}>{rev.place}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {!feedLoading && feedPosts.length === 0 && feedReviews.length === 0 && (
                    <Text style={[styles.markerDetailEmptyFeed, { color: colors.textSecondary }]}>No feed posts or reviews linked yet — open the full profile when available.</Text>
                  )}

                  <View style={styles.markerDetailActions}>
                    <GHTouchableOpacity
                      style={[styles.markerDetailBtn, styles.markerDetailBtnPrimary, { borderColor: `${accent}55` }]}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        handleOpenMaps();
                      }}
                      disabled={!hasCoords}
                      activeOpacity={0.88}
                      accessibilityRole="button"
                      accessibilityLabel="Open in maps"
                    >
                      <Ionicons name="navigate" size={18} color={accent} />
                      <Text style={[styles.markerDetailBtnText, { color: accent }]}>Directions</Text>
                    </GHTouchableOpacity>
                    {mk.clientId ? (
                      <GHTouchableOpacity
                        style={[styles.markerDetailBtn, styles.markerDetailBtnGhost]}
                        onPress={handleViewProfilePress}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel="View full profile"
                      >
                        <Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} />
                        <Text style={[styles.markerDetailBtnText, { color: colors.textSecondary }]}>Profile</Text>
                      </GHTouchableOpacity>
                    ) : null}
                  </View>
                </ReanimatedScrollView>
              </View>
            </BlurView>
          </Reanimated.View>
        </View>
      </View>
    </Modal>
  );
}
