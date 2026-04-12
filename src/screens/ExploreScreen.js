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

const DISCOVER_CHIPS = [
  { id: 'events', label: 'Events', icon: 'calendar', color: '#E63950' },
  { id: 'restaurants', label: 'Restaurants', icon: 'restaurant', color: '#F59E0B' },
  { id: 'beaches', label: 'Beaches', icon: 'water', color: '#0891B2' },
  { id: 'culture', label: 'Culture', icon: 'library', color: '#7C3AED' },
  { id: 'nightlife', label: 'Nightlife', icon: 'moon', color: '#EC4899' },
  { id: 'shopping', label: 'Shopping', icon: 'bag', color: '#10B981' },
]

const CARD_GAP = 16

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

  return (
    <TouchableOpacity activeOpacity={1} onPress={() => onPress?.(item)} style={{ width: cardWidth }}>
      <Animated.View style={[cs.card, { width: cardWidth, height: cardHeight, transform: [{ scale }, { translateY }] }]}>
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
  const { width, height } = useWindowDimensions()
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0)

  const timeOfDay = useMemo(() => getTimeOfDay(), [])

  const cardWidth = Math.round(width * 0.85)
  const cardHeight = Math.round(height * 0.52)
  const peekPadding = (width - cardWidth) / 2

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeChip, setActiveChip] = useState('events')
  const scrollX = useRef(new Animated.Value(0)).current
  const headerOpacity = useRef(new Animated.Value(0)).current
  const headerTranslateY = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerTranslateY, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [headerOpacity, headerTranslateY])

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

  const heroGradient = isDark
    ? ['#0F172A', '#0F172A']
    : [colors.background, colors.background]

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingBottom: bottomPadding }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Immersive Header */}
        <Animated.View style={[s.heroSection, { opacity: headerOpacity, transform: [{ translateY: headerTranslateY }] }]}>
          <View style={s.heroTopRow}>
            <View>
              <Text style={[s.heroGreeting, { color: colors.textMuted }]}>{timeOfDay.greeting}</Text>
              <Text style={[s.heroTitle, { color: colors.textPrimary }]}>Explore</Text>
            </View>
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
          </View>

          <Text style={[s.heroSub, { color: colors.textSecondary }]}>
            Discover what Bahrain has to offer
          </Text>
        </Animated.View>

        {/* Discover Chips */}
        <FadeInView delay={150} from={12}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipsScroll}
          >
            {DISCOVER_CHIPS.map((chip, i) => {
              const active = chip.id === activeChip
              return (
                <AnimatedPressable
                  key={chip.id}
                  onPress={() => setActiveChip(chip.id)}
                  scaleDown={0.93}
                >
                  <View style={[
                    s.chip,
                    { borderColor: active ? chip.color : isDark ? 'rgba(51,65,85,0.6)' : 'rgba(226,232,240,0.8)' },
                    active && { backgroundColor: `${chip.color}15` },
                    !active && { backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(255,255,255,0.8)' },
                  ]}>
                    <View style={[s.chipIconWrap, { backgroundColor: `${chip.color}${active ? '25' : '12'}` }]}>
                      <Ionicons name={chip.icon} size={16} color={active ? chip.color : colors.textMuted} />
                    </View>
                    <Text style={[
                      s.chipLabel,
                      { color: active ? chip.color : colors.textSecondary },
                      active && { fontWeight: '700' },
                    ]}>
                      {chip.label}
                    </Text>
                    {active && <View style={[s.chipActiveDot, { backgroundColor: chip.color }]} />}
                  </View>
                </AnimatedPressable>
              )
            })}
          </ScrollView>
        </FadeInView>

        {/* Events Section */}
        <FadeInView delay={250} from={16}>
          <View style={s.eventsHeader}>
            <View>
              <Text style={[s.eventsTitle, { color: colors.textPrimary }]}>Happening now</Text>
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
          <FadeInView delay={300} from={20}>
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
              <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(51,65,85,0.4)' : 'rgba(226,232,240,0.6)' }]}>
                <Animated.View
                  style={[
                    s.progressFill,
                    {
                      width: events.length > 1
                        ? `${((activeIndex + 1) / events.length) * 100}%`
                        : '100%',
                    },
                  ]}
                >
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

        {/* Quick Actions */}
        <FadeInView delay={450} from={16}>
          <View style={s.quickActionsSection}>
            <Text style={[s.quickActionsTitle, { color: colors.textPrimary }]}>Quick actions</Text>
            <View style={s.quickActionsGrid}>
              <AnimatedPressable onPress={openAR} scaleDown={0.95} style={{ width: (width - 48 - 12) / 2 }}>
                <LinearGradient
                  colors={isDark ? ['#1E293B', '#334155'] : ['#FFFFFF', '#F8FAFC']}
                  style={[s.quickActionCard, { borderColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(226,232,240,0.8)' }]}
                >
                  <LinearGradient colors={['rgba(230,57,80,0.15)', 'rgba(230,57,80,0.05)']} style={s.quickActionIconWrap}>
                    <Ionicons name="scan" size={22} color={colors.primary} />
                  </LinearGradient>
                  <Text style={[s.quickActionLabel, { color: colors.textPrimary }]}>AR Explorer</Text>
                  <Text style={[s.quickActionDesc, { color: colors.textMuted }]}>Point & discover</Text>
                </LinearGradient>
              </AnimatedPressable>

              <AnimatedPressable onPress={() => setActiveChip('restaurants')} scaleDown={0.95} style={{ width: (width - 48 - 12) / 2 }}>
                <LinearGradient
                  colors={isDark ? ['#1E293B', '#334155'] : ['#FFFFFF', '#F8FAFC']}
                  style={[s.quickActionCard, { borderColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(226,232,240,0.8)' }]}
                >
                  <LinearGradient colors={['rgba(245,158,11,0.15)', 'rgba(245,158,11,0.05)']} style={s.quickActionIconWrap}>
                    <Ionicons name="restaurant" size={22} color="#F59E0B" />
                  </LinearGradient>
                  <Text style={[s.quickActionLabel, { color: colors.textPrimary }]}>Top Eats</Text>
                  <Text style={[s.quickActionDesc, { color: colors.textMuted }]}>Trending spots</Text>
                </LinearGradient>
              </AnimatedPressable>

              <AnimatedPressable onPress={() => setActiveChip('beaches')} scaleDown={0.95} style={{ width: (width - 48 - 12) / 2 }}>
                <LinearGradient
                  colors={isDark ? ['#1E293B', '#334155'] : ['#FFFFFF', '#F8FAFC']}
                  style={[s.quickActionCard, { borderColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(226,232,240,0.8)' }]}
                >
                  <LinearGradient colors={['rgba(8,145,178,0.15)', 'rgba(8,145,178,0.05)']} style={s.quickActionIconWrap}>
                    <Ionicons name="water" size={22} color="#0891B2" />
                  </LinearGradient>
                  <Text style={[s.quickActionLabel, { color: colors.textPrimary }]}>Beaches</Text>
                  <Text style={[s.quickActionDesc, { color: colors.textMuted }]}>Sun & sand</Text>
                </LinearGradient>
              </AnimatedPressable>

              <AnimatedPressable onPress={() => setActiveChip('culture')} scaleDown={0.95} style={{ width: (width - 48 - 12) / 2 }}>
                <LinearGradient
                  colors={isDark ? ['#1E293B', '#334155'] : ['#FFFFFF', '#F8FAFC']}
                  style={[s.quickActionCard, { borderColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(226,232,240,0.8)' }]}
                >
                  <LinearGradient colors={['rgba(124,58,237,0.15)', 'rgba(124,58,237,0.05)']} style={s.quickActionIconWrap}>
                    <Ionicons name="library" size={22} color="#7C3AED" />
                  </LinearGradient>
                  <Text style={[s.quickActionLabel, { color: colors.textPrimary }]}>Heritage</Text>
                  <Text style={[s.quickActionDesc, { color: colors.textMuted }]}>History & art</Text>
                </LinearGradient>
              </AnimatedPressable>
            </View>
          </View>
        </FadeInView>
      </ScrollView>

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

  heroSection: { paddingHorizontal: 24, paddingTop: 8, marginBottom: 20 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heroGreeting: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2 },
  heroTitle: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  heroSub: { fontSize: 15, lineHeight: 22, marginTop: 4 },
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

  chipsScroll: { paddingHorizontal: 20, gap: 10, paddingBottom: 4, marginBottom: 24 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    paddingRight: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipIconWrap: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  chipActiveDot: { width: 5, height: 5, borderRadius: 2.5, marginLeft: -2 },

  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  eventsTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  eventsSub: { fontSize: 13, marginTop: 2 },

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

  quickActionsSection: { paddingHorizontal: 24, marginTop: 28 },
  quickActionsTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 14 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  quickActionCard: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  quickActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  quickActionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  quickActionDesc: { fontSize: 12 },

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
