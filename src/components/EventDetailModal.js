import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Animated,
  Easing,
  useWindowDimensions,
  Platform,
  ScrollView,
  PanResponder,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../config/supabase'
import { useTheme } from '../context/ThemeContext'
import { resolvePublicImageUrl } from '../utils/imageUrl'
import { CachedImage } from './CachedImage'

const HERO_HEIGHT_RATIO = 0.5
const HERO_COLLAPSED_EXTRA = 68
const CARD_RADIUS = 22
const OPEN_DURATION = 460
const CLOSE_DURATION = 320
const SWIPE_DISMISS_RATIO = 0.28
const SWIPE_DISMISS_VELOCITY = 0.85
const SWIPE_TRAVEL_RATIO = 0.55

const AnimatedScrollViewComp = Animated.ScrollView

const formatMetaPills = (metadata) => {
  const pills = []
  const eventType = metadata?.event_type
  if (eventType) pills.push({ key: 'type', icon: 'pricetag', label: String(eventType) })
  const date = metadata?.start_date || metadata?.end_date
  if (date) pills.push({ key: 'date', icon: 'calendar-outline', label: String(date) })
  const time = [metadata?.start_time, metadata?.end_time].filter(Boolean).join(' – ')
  if (time) pills.push({ key: 'time', icon: 'time-outline', label: time })
  if (metadata?.venue) pills.push({ key: 'venue', icon: 'location-outline', label: String(metadata.venue) })
  if (metadata?.indoor_outdoor) pills.push({ key: 'io', icon: 'sunny-outline', label: String(metadata.indoor_outdoor) })
  if (metadata?.status) pills.push({ key: 'status', icon: 'ribbon-outline', label: String(metadata.status) })
  return pills
}

function MetaPill({ icon, label, color, bg }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function OrganizerCard({ organizer, colors, onOpenProfile }) {
  if (!organizer) {
    return (
      <View style={[styles.organizerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.organizerAvatar, { backgroundColor: colors.border }]}>
          <Ionicons name="person-outline" size={22} color={colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.organizerName, { color: colors.textPrimary }]}>Loading organizer…</Text>
        </View>
      </View>
    )
  }
  const name = organizer.business_name || organizer.name || organizer.business_name_ar || 'Organizer'
  const avatar = organizer.client_image ? resolvePublicImageUrl(String(organizer.client_image).trim()) : null
  const desc = organizer.description || ''
  const location = organizer.location || organizer.address || ''

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onOpenProfile}
      style={[styles.organizerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.organizerAvatar, { borderColor: colors.primary }]}>
        {avatar ? (
          <CachedImage source={{ uri: avatar }} style={styles.organizerAvatarImg} resizeMode="cover" />
        ) : (
          <Ionicons name="business-outline" size={22} color={colors.textSecondary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.organizerName, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {desc ? (
          <Text style={[styles.organizerBio, { color: colors.textSecondary }]} numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
        {location ? (
          <View style={styles.organizerLocRow}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.organizerLoc, { color: colors.textMuted }]} numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

function OrganizerPosts({ clientUuid, visible, colors }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible || !clientUuid) {
      setPosts([])
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('posts')
        .select('post_uuid, post_image, description, created_at')
        .eq('client_a_uuid', clientUuid)
        .order('created_at', { ascending: false })
        .limit(18)
      if (cancelled) return
      const mapped = (data || [])
        .map((r) => ({
          id: r.post_uuid,
          imageUri: resolvePublicImageUrl(r.post_image),
          description: r.description || '',
        }))
        .filter((p) => p.imageUri)
      setPosts(mapped)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [visible, clientUuid])

  if (!visible || !clientUuid) return null
  if (!loading && posts.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Photos</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryRow}
      >
        {posts.map((p) => (
          <View key={p.id} style={[styles.galleryItem, { backgroundColor: colors.border }]}>
            <CachedImage source={{ uri: p.imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

export default function EventDetailModal({ visible, event, sourceRect, onClose, onOpenOrganizer }) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { width: screenW, height: screenH } = useWindowDimensions()

  const progress = useRef(new Animated.Value(0)).current
  const scrollY = useRef(new Animated.Value(0)).current
  const scrollRef = useRef(null)
  const gestureActiveRef = useRef(false)
  const gestureDismissCommitRef = useRef(false)
  const lastEventRef = useRef(null)
  if (event) lastEventRef.current = event
  const activeEvent = event ?? lastEventRef.current

  const [rendered, setRendered] = useState(false)
  const [organizer, setOrganizer] = useState(null)
  const [organizerLoading, setOrganizerLoading] = useState(false)

  const metadata = activeEvent?.metadata || {}
  const title = metadata.event_name || 'Event'
  const imageUri = metadata.image || null
  const venue = metadata.venue || ''
  const eventType = metadata.event_type || ''
  const clientUuid = metadata.client_a_uuid || null

  const heroH = Math.round(screenH * HERO_HEIGHT_RATIO)
  const collapsedHeroH = Math.min(heroH, insets.top + HERO_COLLAPSED_EXTRA)
  const collapseDistance = Math.max(1, heroH - collapsedHeroH)

  const hasSource = !!sourceRect && sourceRect.width > 0 && sourceRect.height > 0
  const srcX = hasSource ? sourceRect.x : screenW / 2
  const srcY = hasSource ? sourceRect.y : screenH / 2
  const srcW = hasSource ? sourceRect.width : 120
  const srcH = hasSource ? sourceRect.height : 120

  const metaPills = useMemo(() => formatMetaPills(metadata), [metadata])

  useEffect(() => {
    if (visible) {
      setRendered(true)
      progress.setValue(0)
      scrollY.setValue(0)
      gestureActiveRef.current = false
      gestureDismissCommitRef.current = false
      if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ y: 0, animated: false })
      }
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start()
    } else if (rendered) {
      if (gestureDismissCommitRef.current) {
        gestureDismissCommitRef.current = false
        progress.stopAnimation()
        progress.setValue(0)
        setRendered(false)
        return
      }
      progress.stopAnimation((currentValue) => {
        const startValue = typeof currentValue === 'number' ? currentValue : 1
        const remaining = Math.max(0.25, Math.min(1, startValue))
        Animated.timing(progress, {
          toValue: 0,
          duration: Math.round(CLOSE_DURATION * remaining),
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished) setRendered(false)
        })
      })
    }
  }, [visible, rendered, progress, scrollY])

  useEffect(() => {
    if (!clientUuid) {
      setOrganizer(null)
      return
    }
    if (!visible && !rendered) {
      setOrganizer(null)
      return
    }
    if (!visible) {
      return
    }
    let cancelled = false
    setOrganizerLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase
          .from('client')
          .select('*')
          .eq('client_a_uuid', clientUuid)
          .maybeSingle()
        if (!cancelled) setOrganizer(data || null)
      } catch (e) {
        if (!cancelled) setOrganizer(null)
      } finally {
        if (!cancelled) setOrganizerLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, rendered, clientUuid])

  const atTopRef = useRef(true)

  const commitGesturalDismiss = useCallback(() => {
    gestureDismissCommitRef.current = true
    if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
      scrollRef.current.scrollTo({ y: 0, animated: false })
    }
    onClose?.()
  }, [onClose])

  const closeWithAnimation = useCallback(() => {
    if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
      scrollRef.current.scrollTo({ y: 0, animated: true })
    }
    onClose?.()
  }, [onClose])

  const handleScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: false,
          listener: (e) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0
            atTopRef.current = y <= 2
          },
        },
      ),
    [scrollY],
  )

  const handleScrollEndDrag = useCallback(
    (e) => {
      const y = e?.nativeEvent?.contentOffset?.y ?? 0
      if (y < -70) commitGesturalDismiss()
    },
    [commitGesturalDismiss],
  )

  const swipeTravel = Math.max(180, screenH * SWIPE_TRAVEL_RATIO)
  const dismissDistance = Math.max(120, screenH * SWIPE_DISMISS_RATIO)

  const springBackOpen = useCallback(() => {
    gestureActiveRef.current = false
    Animated.spring(progress, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: false,
    }).start()
  }, [progress])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          atTopRef.current && g.dy > 4 && g.dy > Math.abs(g.dx) * 1.1,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          atTopRef.current && g.dy > 6 && g.dy > Math.abs(g.dx) * 1.2,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          gestureActiveRef.current = true
          progress.stopAnimation()
        },
        onPanResponderMove: (_, g) => {
          if (g.dy <= 0) {
            progress.setValue(1)
            return
          }
          const pct = Math.min(g.dy / swipeTravel, 1)
          progress.setValue(1 - pct)
        },
        onPanResponderRelease: (_, g) => {
          gestureActiveRef.current = false
          if (g.dy > 0) {
            const pct = Math.min(g.dy / swipeTravel, 1)
            progress.setValue(1 - pct)
          }
          const shouldDismiss =
            g.dy > dismissDistance || g.vy > SWIPE_DISMISS_VELOCITY
          if (shouldDismiss) {
            commitGesturalDismiss()
          } else {
            springBackOpen()
          }
        },
        onPanResponderTerminate: () => {
          springBackOpen()
        },
      }),
    [progress, commitGesturalDismiss, springBackOpen, swipeTravel, dismissDistance],
  )

  if (!rendered || !activeEvent) return null

  const clampedScroll = scrollY.interpolate({
    inputRange: [0, collapseDistance],
    outputRange: [0, collapseDistance],
    extrapolate: 'clamp',
  })
  const shrinkBy = Animated.multiply(clampedScroll, progress)

  const imgLeft = progress.interpolate({ inputRange: [0, 1], outputRange: [srcX, 0] })
  const imgTop = progress.interpolate({ inputRange: [0, 1], outputRange: [srcY, 0] })
  const imgWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [srcW, screenW] })
  const imgHeightBase = progress.interpolate({ inputRange: [0, 1], outputRange: [srcH, heroH] })
  const imgHeight = Animated.subtract(imgHeightBase, shrinkBy)
  const imgRadius = progress.interpolate({ inputRange: [0, 1], outputRange: [CARD_RADIUS, 0] })

  const scrimOpacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.55, 1],
    extrapolate: 'clamp',
  })
  const contentOpacity = progress.interpolate({
    inputRange: [0, 0.45, 0.85, 1],
    outputRange: [0, 0, 0.85, 1],
    extrapolate: 'clamp',
  })
  const contentTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [Math.round(screenH * 0.22), 0],
    extrapolate: 'clamp',
  })
  const overlayControlsOpacity = progress.interpolate({
    inputRange: [0, 0.75, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  })

  const heroTextFade = scrollY.interpolate({
    inputRange: [0, collapseDistance * 0.45, collapseDistance * 0.95],
    outputRange: [1, 0.35, 0],
    extrapolate: 'clamp',
  })
  const heroTextTranslate = scrollY.interpolate({
    inputRange: [0, collapseDistance],
    outputRange: [0, -24],
    extrapolate: 'clamp',
  })
  const compactBarOpacity = scrollY.interpolate({
    inputRange: [collapseDistance * 0.55, collapseDistance],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const scrimBg = isDark ? 'rgba(6,5,12,0.92)' : 'rgba(10,10,16,0.82)'

  return (
    <Modal visible transparent animationType="none" onRequestClose={closeWithAnimation} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: scrimBg, opacity: scrimOpacity }]}
        />

        <Animated.View
          style={StyleSheet.absoluteFill}
          {...panResponder.panHandlers}
        >
          <AnimatedScrollViewComp
            ref={scrollRef}
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{ paddingTop: heroH, paddingBottom: insets.bottom + 48 }}
            showsVerticalScrollIndicator={false}
            bounces
            scrollEventThrottle={16}
            onScroll={handleScroll}
            onScrollEndDrag={handleScrollEndDrag}
          >
            <Animated.View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.background,
                  opacity: contentOpacity,
                  transform: [{ translateY: contentTranslate }],
                  minHeight: screenH - collapsedHeroH + 40,
                },
              ]}
            >
              <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
                {metaPills.length > 0 ? (
                  <View style={styles.metaRow}>
                    {metaPills.map((p) => (
                      <MetaPill
                        key={p.key}
                        icon={p.icon}
                        label={p.label}
                        color={colors.textPrimary}
                        bg={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(17,17,24,0.05)'}
                      />
                    ))}
                  </View>
                ) : null}

                {metadata.description ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>About</Text>
                    <Text style={[styles.body, { color: colors.textSecondary }]}>{metadata.description}</Text>
                  </View>
                ) : null}

                {clientUuid ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Organizer</Text>
                    <OrganizerCard
                      organizer={organizerLoading && !organizer ? null : organizer}
                      colors={colors}
                      onOpenProfile={() => onOpenOrganizer?.(clientUuid)}
                    />
                  </View>
                ) : null}

                <OrganizerPosts clientUuid={clientUuid} visible={rendered} colors={colors} />

                <View style={styles.swipeHint}>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  <Text style={[styles.swipeHintText, { color: colors.textMuted }]}>
                    Swipe down to close
                  </Text>
                </View>
              </View>
            </Animated.View>
          </AnimatedScrollViewComp>

          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: imgLeft,
              top: imgTop,
              width: imgWidth,
              height: imgHeight,
              borderRadius: imgRadius,
              overflow: 'hidden',
              backgroundColor: '#111',
            }}
          >
            {imageUri ? (
              <CachedImage
                source={{ uri: imageUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                pointerEvents="none"
              />
            ) : (
              <LinearGradient
                colors={isDark ? ['#1a1520', '#2d2640', '#3d3555'] : ['#e8ecf2', '#d4dae4', '#b8c2d1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}

            <LinearGradient
              colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.55)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            <Animated.View
              pointerEvents={rendered ? 'auto' : 'none'}
              style={[styles.overlayTopRow, { top: insets.top + 10, opacity: overlayControlsOpacity }]}
            >
              <TouchableOpacity
                onPress={closeWithAnimation}
                style={styles.closeBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Close event details"
              >
                <Ionicons name="chevron-down" size={22} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.dragPill} />
              <View style={styles.closeBtnPlaceholder} />
            </Animated.View>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.heroTextWrap,
                {
                  opacity: Animated.multiply(overlayControlsOpacity, heroTextFade),
                  paddingBottom: 22,
                  transform: [{ translateY: heroTextTranslate }],
                },
              ]}
            >
              {eventType ? (
                <View style={styles.heroTypeBadge}>
                  <Ionicons name="pricetag" size={11} color="#FFF" />
                  <Text style={styles.heroTypeText} numberOfLines={1}>
                    {eventType}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.heroTitle} numberOfLines={3}>
                {title}
              </Text>
              {venue ? (
                <View style={styles.heroVenueRow}>
                  <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.92)" />
                  <Text style={styles.heroVenue} numberOfLines={1}>
                    {venue}
                  </Text>
                </View>
              ) : null}
            </Animated.View>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.compactBar,
                { paddingTop: insets.top + 6, opacity: Animated.multiply(overlayControlsOpacity, compactBarOpacity) },
              ]}
            >
              <Text style={styles.compactTitle} numberOfLines={1}>
                {title}
              </Text>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlayTopRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  closeBtnPlaceholder: {
    width: 38,
    height: 38,
  },
  dragPill: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  heroTextWrap: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
  },
  heroTypeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 10,
  },
  heroTypeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  heroVenue: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
  },
  sheet: {
    overflow: 'hidden',
  },
  compactBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 64,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  compactTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 12,
    maxWidth: '100%',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    maxWidth: 200,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  organizerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  organizerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#FAFBFC',
  },
  organizerAvatarImg: { width: '100%', height: '100%' },
  organizerName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  organizerBio: {
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
  },
  organizerLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  organizerLoc: {
    fontSize: 12,
    fontWeight: '600',
  },
  galleryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 8,
  },
  galleryItem: {
    width: 130,
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
    opacity: 0.75,
  },
  swipeHintText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
})
