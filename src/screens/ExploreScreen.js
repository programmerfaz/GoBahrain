import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  useWindowDimensions,
  Dimensions,
  RefreshControl,
  ImageBackground,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
  Vibration,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { useTheme } from '../context/ThemeContext'
import { fetchEvents } from '../services/aiPipeline'
import { FadeInView, ShimmerPlaceholder, AnimatedPressable, PulseView } from '../components/AnimatedUI'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView)
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

function getEventImage(m) {
  const uri = m.image_url || m.image || m.photo || m.img
  if (uri && typeof uri === 'string') return uri
  const seed = (m.event_name || m.business_name || m.name || 'event').replace(/\s/g, '')
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/900`
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 6) return { label: 'night', greeting: 'Night owl?', icon: 'moon', gradient: ['#0F172A', '#1E1B4B', '#312E81'] }
  if (h < 12) return { label: 'morning', greeting: 'Good morning', icon: 'sunny', gradient: ['#FEF3C7', '#FDE68A', '#F59E0B'] }
  if (h < 17) return { label: 'afternoon', greeting: 'Good afternoon', icon: 'partly-sunny', gradient: ['#FFE4E6', '#FECDD3', '#FB7185'] }
  if (h < 21) return { label: 'evening', greeting: 'Good evening', icon: 'cloudy-night', gradient: ['#312E81', '#4C1D95', '#5B21B6'] }
  return { label: 'night', greeting: 'Good evening', icon: 'moon', gradient: ['#0F172A', '#1E1B4B', '#312E81'] }
}

const CARD_GAP = 16

function HeroAmbientLayer({ accent, isDark }) {
  const drift = useRef(new Animated.Value(0)).current
  const driftB = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(driftB, { toValue: 1, duration: 6400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftB, { toValue: 0, duration: 6400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    a.start()
    b.start()
    return () => {
      a.stop()
      b.stop()
    }
  }, [drift, driftB])

  const orb1Y = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] })
  const orb1X = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 10] })
  const orb1Scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })
  const orb2Y = driftB.interpolate({ inputRange: [0, 1], outputRange: [0, 18] })
  const orb2X = driftB.interpolate({ inputRange: [0, 1], outputRange: [0, -16] })
  const orb2Opacity = driftB.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] })

  return (
    <View style={ambientStyles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          ambientStyles.orb,
          {
            backgroundColor: `${accent}${isDark ? '35' : '22'}`,
            top: -40,
            right: -30,
            width: 160,
            height: 160,
            borderRadius: 80,
            opacity: isDark ? 0.45 : 0.7,
            transform: [{ translateX: orb1X }, { translateY: orb1Y }, { scale: orb1Scale }],
          },
        ]}
      />
      <Animated.View
        style={[
          ambientStyles.orb,
          {
            backgroundColor: isDark ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.14)',
            bottom: -50,
            left: -40,
            width: 200,
            height: 200,
            borderRadius: 100,
            transform: [{ translateX: orb2X }, { translateY: orb2Y }],
            opacity: orb2Opacity,
          },
        ]}
      />
    </View>
  )
}

const ambientStyles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, overflow: 'visible' },
  orb: { position: 'absolute' },
})

function LivePulseDot({ color }) {
  return (
    <View style={liveDotStyles.wrap} accessibilityLabel="Live updates">
      <PulseView pulseScale={1.45} duration={1400}>
        <View style={[liveDotStyles.dot, { backgroundColor: color }]} />
      </PulseView>
    </View>
  )
}

const liveDotStyles = StyleSheet.create({
  wrap: { marginRight: 10, marginTop: 6, width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
})

function SectionTitleAccent({ accent }) {
  const slide = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(slide, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [slide])
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] })
  return (
    <View style={accentLineStyles.track}>
      <Animated.View style={{ transform: [{ translateX }], width: '42%' }}>
        <LinearGradient
          colors={[`${accent}00`, accent, `${accent}00`]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={accentLineStyles.grad}
        />
      </Animated.View>
    </View>
  )
}

const accentLineStyles = StyleSheet.create({
  track: { height: 3, marginTop: 8, borderRadius: 2, overflow: 'hidden', maxWidth: 120 },
  grad: { height: 3, borderRadius: 2 },
})

function CinematicEventCard({ item, index, cardWidth, cardHeight, scrollX, onPress }) {
  const m = item?.metadata || {}
  const name = m.event_name || m.business_name || m.name || 'Event'
  const venue = m.venue || m.location || m.area || ''
  const time = [m.start_time, m.end_time].filter(Boolean).join(' – ')
  const date = m.start_date || m.end_date || ''
  const eventType = m.event_type || ''
  const imageUri = getEventImage(m)
  const itemWidth = cardWidth + CARD_GAP

  const scale = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [0.92, 1, 0.92],
    extrapolate: 'clamp',
  })
  const translateY = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [14, 0, 14],
    extrapolate: 'clamp',
  })
  const imageTranslateX = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [40, 0, -40],
    extrapolate: 'clamp',
  })
  const cardOpacity = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [0.72, 1, 0.72],
    extrapolate: 'clamp',
  })

  return (
    <TouchableOpacity activeOpacity={1} onPress={() => onPress?.(item)} style={{ width: cardWidth }}>
      <Animated.View style={[cs.card, { width: cardWidth, height: cardHeight, opacity: cardOpacity, transform: [{ scale }, { translateY }] }]}>
        <View style={[cs.cardImageWrap, { height: cardHeight }]}>
          <Animated.View style={[cs.cardImageInner, { height: cardHeight, width: cardWidth + 80, transform: [{ translateX: imageTranslateX }] }]}>
            <ImageBackground
              source={{ uri: imageUri }}
              style={[StyleSheet.absoluteFill, { width: cardWidth + 80, left: -40 }]}
              resizeMode="cover"
            />
          </Animated.View>
        </View>

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.3, 0.6, 1]}
          style={cs.cardOverlay}
        />

        {eventType ? (
          <View style={cs.cardBadgeWrap}>
            <BlurView intensity={Platform.OS === 'ios' ? 60 : 0} tint="dark" style={cs.cardBadge}>
              <View style={cs.cardBadgeDot} />
              <Text style={cs.cardBadgeText} numberOfLines={1}>{eventType}</Text>
            </BlurView>
          </View>
        ) : null}

        <View style={cs.cardBottom}>
          <Text style={cs.cardTitle} numberOfLines={3}>{name}</Text>

          <View style={cs.cardInfoRow}>
            {(date || time) ? (
              <View style={cs.cardInfoPill}>
                <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.9)" />
                <Text style={cs.cardInfoText} numberOfLines={1}>{[date, time].filter(Boolean).join(' · ')}</Text>
              </View>
            ) : null}
            {venue ? (
              <View style={cs.cardInfoPill}>
                <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.9)" />
                <Text style={cs.cardInfoText} numberOfLines={1}>{venue}</Text>
              </View>
            ) : null}
          </View>

          <View style={cs.cardActions}>
            <View style={cs.cardCtaBtn}>
              <Text style={cs.cardCtaText}>View details</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFF" />
            </View>
            <View style={cs.cardSaveBtn}>
              <Ionicons name="bookmark-outline" size={18} color="rgba(255,255,255,0.85)" />
            </View>
          </View>
        </View>

        <View style={cs.cardNumberWrap}>
          <Text style={cs.cardNumber}>{String(index + 1).padStart(2, '0')}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  )
}

const cs = StyleSheet.create({
  card: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#000',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.35, shadowRadius: 30 },
      android: { elevation: 18 },
    }),
  },
  cardImageWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  cardImageInner: { overflow: 'hidden' },
  cardOverlay: { ...StyleSheet.absoluteFillObject },
  cardBadgeWrap: { position: 'absolute', top: 18, left: 18 },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Platform.OS === 'android' ? 'rgba(0,0,0,0.55)' : 'transparent',
    overflow: 'hidden',
  },
  cardBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E63950' },
  cardBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF', letterSpacing: 0.3, maxWidth: 140 },
  cardBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 22, paddingTop: 0 },
  cardTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  cardInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  cardInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardInfoText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600', maxWidth: 140 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardCtaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(230,57,80,0.9)',
    paddingVertical: 12,
    borderRadius: 16,
  },
  cardCtaText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  cardSaveBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardNumberWrap: { position: 'absolute', top: 18, right: 20 },
  cardNumber: {
    fontSize: 42,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.1)',
    letterSpacing: -2,
  },
})

function LoadingSkeleton({ width: w, height: h }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
      <FadeInView delay={0} from={20}>
        <View style={{ width: w, height: h, borderRadius: 28, overflow: 'hidden' }}>
          <ShimmerPlaceholder width={w} height={h} borderRadius={28} />
          <View style={{ position: 'absolute', bottom: 24, left: 22, right: 22 }}>
            <ShimmerPlaceholder width={w * 0.65} height={20} borderRadius={10} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <ShimmerPlaceholder width={w * 0.35} height={28} borderRadius={14} />
              <ShimmerPlaceholder width={w * 0.35} height={28} borderRadius={14} />
            </View>
            <ShimmerPlaceholder width={w - 44} height={44} borderRadius={16} style={{ marginTop: 14 }} />
          </View>
        </View>
      </FadeInView>
    </View>
  )
}

function AnimatedCounter({ current, total, accent }) {
  const scaleAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.25, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true }),
    ]).start()
  }, [current, scaleAnim])

  return (
    <View style={counterStyles.wrap}>
      <Animated.Text style={[counterStyles.current, { color: accent, transform: [{ scale: scaleAnim }] }]}>
        {String(current + 1).padStart(2, '0')}
      </Animated.Text>
      <View style={counterStyles.divider} />
      <Text style={counterStyles.total}>{String(total).padStart(2, '0')}</Text>
    </View>
  )
}

const counterStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  current: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  divider: { width: 16, height: 2, backgroundColor: 'rgba(148,163,184,0.3)', borderRadius: 1, marginBottom: 6 },
  total: { fontSize: 16, fontWeight: '700', color: '#94A3B8', letterSpacing: -0.5 },
})

export default function ExploreScreen({ navigation }) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { width = 375, height = 667 } = useWindowDimensions()
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0)

  const timeOfDay = useMemo(() => getTimeOfDay(), [])

  const cardWidth = Math.round(width * 0.85)
  const cardHeight = Math.round(height * 0.52)
  const peekPadding = (width - cardWidth) / 2

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [progressTrackW, setProgressTrackW] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const scrollY = useRef(new Animated.Value(0)).current
  const headerOpacity = useRef(new Animated.Value(0)).current
  const headerTranslateY = useRef(new Animated.Value(20)).current
  const titlePop = useRef(new Animated.Value(0.88)).current
  const rock = useRef(new Animated.Value(0)).current
  const fillW = useRef(new Animated.Value(0)).current

  const heroParallaxY = scrollY.interpolate({
    inputRange: [0, 180],
    outputRange: [0, -42],
    extrapolate: 'clamp',
  })
  const heroParallaxScale = scrollY.interpolate({
    inputRange: [0, 220],
    outputRange: [1, 0.965],
    extrapolate: 'clamp',
  })
  const heroScrollOpacity = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  })
  const headerTranslateCombined = Animated.add(headerTranslateY, heroParallaxY)
  const heroOpacityCombined = Animated.multiply(headerOpacity, heroScrollOpacity)

  const rockDeg = rock.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] })

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 680, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerTranslateY, { toValue: 0, duration: 680, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [headerOpacity, headerTranslateY])

  useEffect(() => {
    Animated.spring(titlePop, {
      toValue: 1,
      friction: 7,
      tension: 78,
      delay: 200,
      useNativeDriver: true,
    }).start()
  }, [titlePop])

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rock, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(rock, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [rock])

  useEffect(() => {
    if (loading || events.length === 0 || progressTrackW <= 0) {
      if (events.length === 0) fillW.setValue(0)
      return
    }
    const target = Math.max(((activeIndex + 1) / events.length) * progressTrackW, 8)
    Animated.spring(fillW, {
      toValue: target,
      friction: 8,
      tension: 72,
      useNativeDriver: false,
    }).start()
  }, [activeIndex, events.length, progressTrackW, loading, fillW])

  const loadEvents = useCallback(async () => {
    try {
      const data = await fetchEvents([])
      setEvents(data || [])
    } catch (e) {
      console.warn('[Explore] fetchEvents failed:', e?.message)
      setEvents([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    if (events.length === 0) return
    setActiveIndex((idx) => (idx >= events.length ? events.length - 1 : idx))
  }, [events.length])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadEvents()
  }, [loadEvents])

  const handleCardPress = useCallback(() => {
    if (Platform.OS !== 'web') Vibration.vibrate(20)
  }, [])

  const onScroll = useCallback((e) => {
    const offset = e.nativeEvent.contentOffset.x
    const index = Math.round(offset / (cardWidth + CARD_GAP))
    setActiveIndex(Math.max(0, Math.min(index, events.length - 1)))
  }, [cardWidth, events.length])

  const renderCard = useCallback(
    ({ item, index }) => (
      <CinematicEventCard
        item={item}
        index={index}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        scrollX={scrollX}
        onPress={handleCardPress}
      />
    ),
    [cardWidth, cardHeight, scrollX, handleCardPress]
  )

  const keyExtractor = useCallback((item) => item?.id || item?.metadata?.event_name || String(Math.random()), [])

  const [doorVisible, setDoorVisible] = useState(false)
  const doorLeft = useRef(new Animated.Value(-SCREEN_W / 2)).current
  const doorRight = useRef(new Animated.Value(SCREEN_W / 2)).current
  const doorIconScale = useRef(new Animated.Value(0)).current
  const doorIconOpacity = useRef(new Animated.Value(0)).current
  const doorFade = useRef(new Animated.Value(1)).current

  const handleProgressTrackLayout = useCallback((e) => {
    setProgressTrackW(e.nativeEvent.layout.width)
  }, [])

  const openAR = () => {
    if (Platform.OS !== 'web') Vibration.vibrate(40)

    doorLeft.setValue(-SCREEN_W / 2)
    doorRight.setValue(SCREEN_W / 2)
    doorIconScale.setValue(0)
    doorIconOpacity.setValue(0)
    doorFade.setValue(1)
    setDoorVisible(true)

    Animated.sequence([
      Animated.parallel([
        Animated.spring(doorIconScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
        Animated.timing(doorIconOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(doorLeft, { toValue: 0, duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
        Animated.timing(doorRight, { toValue: 0, duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
      ]),
    ]).start(() => {
      const nav = navigation?.getParent?.() ?? navigation
      nav?.navigate?.('AR', { fromExplore: true })
      setTimeout(() => setDoorVisible(false), 500)
    })
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingBottom: bottomPadding }]}>
      <AnimatedScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Immersive Header */}
        <Animated.View
          style={[
            s.heroSection,
            {
              opacity: heroOpacityCombined,
              transform: [
                { translateY: headerTranslateCombined },
                { scale: heroParallaxScale },
              ],
            },
          ]}
        >
          <HeroAmbientLayer accent={colors.primary} isDark={isDark} />
          <View style={s.heroTopRow}>
            <View style={s.heroTextCol}>
              <FadeInView delay={40} from={20} duration={520}>
                <View style={s.heroGreetingRow}>
                  <Animated.View style={{ transform: [{ rotate: rockDeg }] }}>
                    <Ionicons name={timeOfDay.icon} size={20} color={colors.primary} />
                  </Animated.View>
                  <Text style={[s.heroGreeting, { color: colors.textMuted }]}>{timeOfDay.greeting}</Text>
                </View>
              </FadeInView>
              <FadeInView delay={120} from={22} duration={560}>
                <Animated.Text style={[s.heroTitle, { color: colors.textPrimary, transform: [{ scale: titlePop }] }]}>
                  Explore
                </Animated.Text>
              </FadeInView>
              <FadeInView delay={200} from={14} duration={480}>
                <Text style={[s.heroSub, { color: colors.textSecondary }]}>
                  Discover what Bahrain has to offer
                </Text>
              </FadeInView>
            </View>
            <FadeInView delay={160} from={28} duration={520} style={s.heroArWrap}>
              <AnimatedPressable onPress={openAR} scaleDown={0.9}>
                <LinearGradient
                  colors={[colors.primary, isDark ? '#C8102E' : '#9B0C23']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.arPill}
                >
                  <Ionicons name="scan" size={18} color="#FFF" />
                  <Text style={s.arPillText}>AR View</Text>
                </LinearGradient>
              </AnimatedPressable>
            </FadeInView>
          </View>
        </Animated.View>

        {/* Events Section */}
        <FadeInView delay={220} from={18} duration={480}>
          <View style={s.eventsHeader}>
            <View style={s.eventsTitleBlock}>
              <View style={s.eventsTitleRow}>
                {!loading && events.length > 0 ? <LivePulseDot color={colors.primary} /> : <View style={s.liveDotSpacer} />}
                <Text style={[s.eventsTitle, { color: colors.textPrimary }]}>Happening now</Text>
              </View>
              <SectionTitleAccent accent={colors.primary} />
              <Text style={[s.eventsSub, { color: colors.textMuted }]}>Live events across Bahrain</Text>
            </View>
            {!loading && events.length > 0 && (
              <AnimatedCounter current={activeIndex} total={events.length} accent={colors.primary} />
            )}
          </View>
        </FadeInView>

        {loading ? (
          <LoadingSkeleton width={cardWidth} height={cardHeight} />
        ) : events.length === 0 ? (
          <FadeInView delay={300} from={24}>
            <View style={[s.emptyWrap, { backgroundColor: isDark ? colors.surface : colors.surface, borderColor: colors.border }]}>
              <PulseView pulseScale={1.06} duration={2800}>
                <LinearGradient
                  colors={[`${colors.primary}18`, `${colors.primary}06`]}
                  style={s.emptyIconCircle}
                >
                  <Ionicons name="telescope-outline" size={44} color={colors.primary} />
                </LinearGradient>
              </PulseView>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Nothing happening yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                Pull down to refresh or explore Bahrain through AR
              </Text>
              <AnimatedPressable onPress={openAR} scaleDown={0.95}>
                <LinearGradient
                  colors={[colors.primary, '#9B0C23']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.emptyCtaGradient}
                >
                  <Ionicons name="scan" size={18} color="#FFF" />
                  <Text style={s.emptyCtaText}>Launch AR Explorer</Text>
                  <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.7)" />
                </LinearGradient>
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : (
          <FadeInView delay={280} from={22} duration={520}>
            <FlatList
              data={events}
              renderItem={renderCard}
              keyExtractor={keyExtractor}
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + CARD_GAP}
              snapToAlignment="center"
              decelerationRate="fast"
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: false, listener: onScroll }
              )}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: peekPadding }}
              ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
            />

            {/* Progress Bar */}
            <View style={s.progressWrap}>
              <View
                style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(51,65,85,0.4)' : 'rgba(226,232,240,0.6)' }]}
                onLayout={handleProgressTrackLayout}
              >
                <Animated.View style={[s.progressFill, { width: fillW }]}>
                  <LinearGradient
                    colors={[colors.primary, '#9B0C23']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
            </View>
          </FadeInView>
        )}
      </AnimatedScrollView>

      {doorVisible && (() => {
        const TOOTH_COUNT = 5
        const toothH = SCREEN_H / TOOTH_COUNT
        const toothW = SCREEN_W * 0.12
        return (
          <Animated.View style={[s.doorOverlay, { opacity: doorFade }]} pointerEvents="box-none">
            <Animated.View style={[s.doorHalf, s.doorL, { transform: [{ translateX: doorLeft }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
            </Animated.View>
            <Animated.View style={[s.doorHalf, s.doorR, { transform: [{ translateX: doorRight }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#CE1126' }]} />
            </Animated.View>
            <Animated.View style={[s.doorZigzag, { transform: [{ translateX: doorLeft }] }]}>
              {Array.from({ length: TOOTH_COUNT }, (_, i) => (
                <View key={i} style={{
                  width: 0, height: 0,
                  borderTopWidth: toothH / 2, borderBottomWidth: toothH / 2, borderLeftWidth: toothW,
                  borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#FFFFFF',
                }} />
              ))}
            </Animated.View>
            <Animated.View style={[s.doorCenter, { transform: [{ scale: doorIconScale }], opacity: doorIconOpacity }]}>
              <View style={s.doorIconRing}>
                <LinearGradient colors={['#CE1126', '#9B0C23']} style={s.doorIconGrad}>
                  <Ionicons name="scan" size={44} color="#FFF" />
                </LinearGradient>
              </View>
              <Text style={s.doorLabel}>AR EXPLORER</Text>
              <Text style={s.doorSubLabel}>Bahrain</Text>
            </Animated.View>
          </Animated.View>
        )
      })()}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  heroSection: {
    position: 'relative',
    overflow: 'visible',
    paddingHorizontal: 24,
    paddingTop: 8,
    marginBottom: 22,
    minHeight: 120,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroGreetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  heroGreeting: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3, flex: 1 },
  heroTitle: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  heroSub: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  heroArWrap: { alignSelf: 'flex-start', marginTop: 2 },
  arPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  arPillText: { fontSize: 13, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },

  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  eventsTitleBlock: { flex: 1, minWidth: 0, marginRight: 8 },
  eventsTitleRow: { flexDirection: 'row', alignItems: 'center' },
  liveDotSpacer: { width: 18, marginRight: 10 },
  eventsTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
  eventsSub: { fontSize: 13, marginTop: 6 },

  progressWrap: { paddingHorizontal: 24, marginTop: 18, marginBottom: 8 },
  progressTrack: { height: 3, borderRadius: 1.5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 1.5, overflow: 'hidden' },

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    paddingVertical: 48,
    paddingHorizontal: 28,
    borderRadius: 28,
    borderWidth: 1,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
  emptyCtaText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  doorOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
  doorHalf: { position: 'absolute', top: 0, bottom: 0, width: SCREEN_W / 2, overflow: 'hidden' },
  doorL: { left: 0 },
  doorR: { right: 0 },
  doorZigzag: { position: 'absolute', top: 0, left: SCREEN_W / 2, bottom: 0, zIndex: 2 },
  doorCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  doorIconRing: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: '#FFF', overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16 },
      android: { elevation: 14 },
    }),
  },
  doorIconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doorLabel: { marginTop: 14, fontSize: 18, fontWeight: '900', color: '#FFF', letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  doorSubLabel: { marginTop: 4, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' },
})
