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
  Image,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
  Vibration,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'
import { fetchBrowseClientsGrouped, fetchExploreEventsFromSupabase } from '../services/aiPipeline'
import ClientProfileModal from '../components/ClientProfileModal'
import { coerceImageValueToString, resolvePublicImageUrl } from '../utils/imageUrl'
import { FadeInView, ShimmerPlaceholder, AnimatedPressable, PulseView } from '../components/AnimatedUI'
import { LUXURY, luxuryCardShadow } from '../theme/luxuryPremium'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView)
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

const CARD_GAP = 16

/** Vertical scan line over the icon only — same pattern as CommunitiesScreen `FabOptionIconScanning`. */
const ArScanIcon = ({ name, size = 24, color = '#FFF' }) => {
  const scanLine = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [scanLine])

  const translateY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 28] })

  return (
    <View style={[arScanIconStyles.wrap, { width: size, height: size }]}>
      <Ionicons name={name} size={size} color={color} />
      <Animated.View style={[arScanIconStyles.scanLine, { transform: [{ translateY }] }]} pointerEvents="none">
        <View style={arScanIconStyles.scanLineInner} />
      </Animated.View>
    </View>
  )
}

const arScanIconStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    top: -2,
    left: -4,
    right: -4,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLineInner: {
    width: 32,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
  },
})

const buildMergedEventBrowseItems = (eventsCarousel, clientEvents) => {
  const fromDb = (eventsCarousel || []).map((e) => ({
    kind: 'dbEvent',
    key: `db-${e.id}`,
    name: e.metadata?.event_name || 'Event',
    image: e.metadata?.image,
    lat: e.metadata?.lat,
    long: e.metadata?.long,
  }))
  const fromClient = (clientEvents || []).map((c) => ({
    kind: 'client',
    key: `c-${c.client_a_uuid}`,
    name: c.name,
    image: resolvePublicImageUrl(c.client_image),
    clientId: c.client_a_uuid,
    raw: c,
  }))
  return [...fromDb, ...fromClient]
}

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

function CinematicEventCard({ item, index, cardWidth, cardHeight, scrollX, onPress }) {
  const { isDark, colors } = useTheme()
  const m = item?.metadata || {}
  const name = m.event_name || 'Event'
  const venue = m.venue || ''
  const time = [m.start_time, m.end_time].filter(Boolean).join(' – ')
  const date = m.start_date || m.end_date || ''
  const eventType = m.event_type || ''
  const imageUri = useMemo(() => {
    const resolved = resolvePublicImageUrl(m.image)
    if (resolved) return resolved
    const s = coerceImageValueToString(m.image)
    if (s && (s.startsWith('http://') || s.startsWith('https://'))) return s
    return null
  }, [m.image])
  const itemWidth = cardWidth + CARD_GAP

  const sheenPhase = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sheenPhase, {
          toValue: 1,
          duration: 4800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sheenPhase, {
          toValue: 0,
          duration: 4800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [sheenPhase])

  const sheenTranslateX = sheenPhase.interpolate({
    inputRange: [0, 1],
    outputRange: [-cardWidth * 0.95, cardWidth * 0.95],
  })

  const scale = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [0.93, 1, 0.93],
    extrapolate: 'clamp',
  })
  const translateY = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [12, 0, 12],
    extrapolate: 'clamp',
  })
  const imageTranslateX = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [32, 0, -32],
    extrapolate: 'clamp',
  })
  const cardOpacity = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [0.76, 1, 0.76],
    extrapolate: 'clamp',
  })
  const focusShadow = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [0.16, 0.38, 0.16],
    extrapolate: 'clamp',
  })
  const focusLift = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth],
    outputRange: [10, 22, 10],
    extrapolate: 'clamp',
  })

  const whenLine = [date, time].filter(Boolean).join(' · ')
  const topRightDateLabel = date || whenLine
  const showDateTop = Boolean(topRightDateLabel)
  const showBottomTime = Boolean(date && time)
  const rimLight = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.22)'

  return (
    <AnimatedPressable
      scaleDown={0.982}
      activeOpacity={1}
      onPress={() => onPress?.(item)}
      style={{ width: cardWidth }}
      accessibilityRole="button"
      accessibilityLabel={`${name}${whenLine ? `, ${whenLine}` : ''}${venue ? `, ${venue}` : ''}`}
    >
      <Animated.View
        style={[
          cs.card,
          {
            width: cardWidth,
            height: cardHeight,
            opacity: cardOpacity,
            transform: [{ scale }, { translateY }],
            borderColor: rimLight,
            ...Platform.select({
              ios: {
                shadowOpacity: focusShadow,
                shadowRadius: focusLift,
                shadowOffset: { width: 0, height: 14 },
                shadowColor: '#0a0608',
              },
              android: { elevation: 14 },
            }),
          },
        ]}
      >
        <View style={[cs.cardImageRegion, { height: cardHeight, width: cardWidth }]}>
          <View style={[cs.cardImageWrap, { height: cardHeight }]}>
            <Animated.View style={[cs.cardImageInner, { height: cardHeight, width: cardWidth + 64, transform: [{ translateX: imageTranslateX }] }]}>
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={[StyleSheet.absoluteFill, { width: cardWidth + 64, left: -32 }]}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={isDark ? ['#1a1520', '#2d2640', '#3d3555'] : ['#e8ecf2', '#d4dae4', '#b8c2d1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { width: cardWidth + 64, left: -32 }]}
                />
              )}
            </Animated.View>
          </View>

          <View style={[cs.cardSheenMask, { height: cardHeight * 0.38 }]} pointerEvents="none">
            <Animated.View style={[cs.cardSheenStrip, { transform: [{ translateX: sheenTranslateX }] }]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)', 'transparent']}
                locations={[0, 0.45, 0.55, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ width: cardWidth * 0.55, height: '100%' }}
              />
            </Animated.View>
          </View>

          <LinearGradient
            colors={['rgba(255,255,255,0.12)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={cs.cardTopHighlight}
            pointerEvents="none"
          />

          {eventType ? (
            <View style={[cs.cardTagTop, { maxWidth: cardWidth * 0.52 }]} pointerEvents="none">
              <LinearGradient
                colors={[`${colors.primary}F0`, colors.primaryDark, `${colors.primary}99`]}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={cs.cardTagTopPill}
              >
                <Ionicons name="pricetag" size={12} color="#FFF" style={cs.cardPanelTagIcon} />
                <Text style={cs.cardBadgeText} numberOfLines={2}>
                  {eventType}
                </Text>
              </LinearGradient>
            </View>
          ) : null}

          {showDateTop ? (
            <View style={[cs.cardDateTop, { maxWidth: cardWidth * 0.58 }]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(255,255,255,0.14)', `${colors.primary}55`, 'rgba(8,6,10,0.88)']}
                locations={[0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={cs.cardDateTopInner}
              >
                <Ionicons name="calendar-outline" size={13} color="#FFF" />
                <Text style={cs.cardDateTopText} numberOfLines={1}>
                  {topRightDateLabel}
                </Text>
              </LinearGradient>
            </View>
          ) : null}
        </View>

        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(0,0,0,0.04)', 'rgba(8,6,12,0.42)', 'rgba(6,4,10,0.82)']}
          locations={[0, 0.2, 0.55, 1]}
          style={cs.cardBottomScrim}
        />

        <View style={cs.cardContentOverlay} pointerEvents="box-none">
          <Text style={cs.cardTitle} numberOfLines={2}>
            {name}
          </Text>

          {(showBottomTime || venue) ? (
            <View style={cs.cardMetaCol}>
              {showBottomTime ? (
                <View style={cs.cardMetaPill}>
                  <Ionicons name="time-outline" size={14} color={colors.primaryLight} />
                  <Text style={cs.cardMetaPlain} numberOfLines={2}>
                    {time}
                  </Text>
                </View>
              ) : null}
              {venue ? (
                <View style={cs.cardMetaPill}>
                  <Ionicons name="location-outline" size={14} color="rgba(147,197,253,0.95)" />
                  <Text style={cs.cardMetaPlain} numberOfLines={2}>
                    {venue}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </AnimatedPressable>
  )
}

const cs = StyleSheet.create({
  card: {
    borderRadius: LUXURY.radiusHero,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 1,
    position: 'relative',
    ...luxuryCardShadow,
    ...Platform.select({
      ios: { shadowColor: '#050308', shadowOffset: { width: 0, height: 16 } },
      android: { elevation: 14 },
    }),
  },
  cardImageRegion: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  cardImageWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  cardImageInner: { overflow: 'hidden' },
  cardSheenMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  cardSheenStrip: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  cardTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '36%',
    opacity: 0.65,
  },
  cardTagTop: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 3,
  },
  cardTagTopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  cardDateTop: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 3,
  },
  cardDateTopInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  cardDateTopText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.2,
  },
  cardBottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '62%',
    zIndex: 1,
  },
  cardContentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
  },
  cardPanelTagIcon: { marginTop: 1 },
  cardBadgeText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  cardTitle: {
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -1,
    color: '#FFF',
    lineHeight: 28,
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  cardMetaCol: { gap: 8, marginBottom: 0 },
  cardMetaPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardMetaPlain: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 17,
  },
})

function LoadingSkeleton({ width: w, height: h }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
      <FadeInView delay={0} from={20}>
        <View style={{ width: w, height: h, borderRadius: LUXURY.radiusHero, overflow: 'hidden' }}>
          <ShimmerPlaceholder width={w} height={h} borderRadius={LUXURY.radiusHero} />
          <View style={{ position: 'absolute', bottom: 24, left: 22, right: 22 }}>
            <ShimmerPlaceholder width={w * 0.65} height={20} borderRadius={10} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <ShimmerPlaceholder width={w * 0.35} height={28} borderRadius={14} />
              <ShimmerPlaceholder width={w * 0.35} height={28} borderRadius={14} />
            </View>
          </View>
        </View>
      </FadeInView>
    </View>
  )
}

export default function ExploreScreen({ navigation }) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { width = 375, height = 667 } = useWindowDimensions()
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0)

  const cardWidth = Math.round(width * 0.85)
  const cardHeight = Math.round(height * 0.52)
  const peekPadding = (width - cardWidth) / 2

  const [events, setEvents] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [browseClients, setBrowseClients] = useState({ restaurants: [], places: [], events: [] })
  const [browseLoadError, setBrowseLoadError] = useState(null)
  const [profileClientId, setProfileClientId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [progressTrackW, setProgressTrackW] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const scrollY = useRef(new Animated.Value(0)).current
  const headerOpacity = useRef(new Animated.Value(0)).current
  const headerTranslateY = useRef(new Animated.Value(20)).current
  const titlePop = useRef(new Animated.Value(0.88)).current
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

  const loadExplore = useCallback(async () => {
    try {
      setLoadError(null)
      setBrowseLoadError(null)
      const [evRes, browseRes] = await Promise.all([
        fetchExploreEventsFromSupabase(),
        fetchBrowseClientsGrouped(),
      ])
      setEvents(evRes.events || [])
      setLoadError(evRes.error || null)
      setBrowseClients({
        restaurants: browseRes.restaurants || [],
        places: browseRes.places || [],
        events: browseRes.events || [],
      })
      setBrowseLoadError(browseRes.error || null)
    } catch (e) {
      console.warn('[Explore] loadExplore failed:', e?.message)
      setEvents([])
      setBrowseClients({ restaurants: [], places: [], events: [] })
      setLoadError(e?.message || 'Could not load')
      setBrowseLoadError(e?.message || null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadExplore()
  }, [loadExplore])

  const mergedEventBrowseItems = useMemo(
    () => buildMergedEventBrowseItems(events, browseClients.events),
    [events, browseClients.events],
  )

  const handleBrowseDbEventPress = useCallback(
    (item) => {
      const lat = parseFloat(item.lat)
      const lng = parseFloat(item.long)
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        navigation.navigate('AR', { navigateTo: { lat, lng, name: item.name || 'Event' } })
      }
    },
    [navigation],
  )

  useEffect(() => {
    if (events.length === 0) return
    setActiveIndex((idx) => (idx >= events.length ? events.length - 1 : idx))
  }, [events.length])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadExplore()
  }, [loadExplore])

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

  const keyExtractor = useCallback((item, index) => {
    const id = item?.id
    if (id != null && String(id) !== '') return String(id)
    const name = item?.metadata?.event_name || item?.metadata?.business_name || 'event'
    return `explore-${String(name)}-${index}`
  }, [])

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

  const eventAccent = colors.event
  const eventsCarouselSectionHeader = (
    <View style={s.eventsHeadingRow}>
      <View style={s.browseSectionHeader}>
        <View style={[s.browseSectionIcon, { backgroundColor: `${eventAccent}18` }]}>
          <Ionicons name="calendar" size={20} color={eventAccent} />
        </View>
        <Text style={[s.browseSectionTitle, { color: eventAccent }]}>Events</Text>
      </View>
    </View>
  )

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingBottom: bottomPadding }]}>
      <AnimatedScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
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
              <FadeInView delay={120} from={22} duration={560}>
                <Animated.Text style={[s.heroTitle, { color: colors.textPrimary, transform: [{ scale: titlePop }] }]}>
                  Explore
                </Animated.Text>
              </FadeInView>
              <FadeInView delay={200} from={14} duration={480}>
                <Text
                  style={[s.heroSub, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  Discover what Bahrain has to offer
                </Text>
              </FadeInView>
            </View>
            <FadeInView delay={160} from={28} duration={520} style={s.heroArWrap}>
              <AnimatedPressable onPress={openAR} scaleDown={0.92} style={s.arPillPulseWrap}>
                <LinearGradient
                  colors={[colors.primary, isDark ? '#C8102E' : '#9B0C23']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.arPill}
                >
                  <ArScanIcon name="scan" size={24} color="#FFF" />
                  <Text style={s.arPillText}>AR View</Text>
                </LinearGradient>
              </AnimatedPressable>
            </FadeInView>
          </View>
        </Animated.View>

        {loading ? (
          <View style={s.eventsSectionTopSpacer}>
            {eventsCarouselSectionHeader}
            <LoadingSkeleton width={cardWidth} height={cardHeight} />
          </View>
        ) : events.length === 0 ? (
          <FadeInView delay={300} from={24} style={s.eventsSectionTopSpacer}>
            {eventsCarouselSectionHeader}
            <View style={[s.emptyWrap, { backgroundColor: isDark ? colors.surface : colors.surface, borderColor: colors.border }]}>
              <PulseView pulseScale={1.06} duration={2800}>
                <LinearGradient
                  colors={[`${colors.primary}18`, `${colors.primary}06`]}
                  style={s.emptyIconCircle}
                >
                  <Ionicons name="telescope-outline" size={44} color={colors.primary} />
                </LinearGradient>
              </PulseView>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {loadError ? 'Could not load events' : 'Nothing happening yet'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {loadError ? loadError : 'Pull down to refresh or explore Bahrain through AR'}
              </Text>
              {!loadError && __DEV__ ? (
                <Text style={[s.emptySub, { color: colors.textMuted, fontSize: 12, marginTop: 10, paddingHorizontal: 8 }]}>
                  Table has rows but list is empty? Run database/migrations/004_events_public_read.sql in Supabase (RLS anon SELECT).
                </Text>
              ) : null}
              <AnimatedPressable onPress={openAR} scaleDown={0.94} style={s.arEmptyCtaPulseWrap}>
                <LinearGradient
                  colors={[colors.primary, '#9B0C23']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.emptyCtaGradient}
                >
                  <ArScanIcon name="scan" size={24} color="#FFF" />
                  <Text style={s.emptyCtaText}>Launch AR Explorer</Text>
                  <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.85)" />
                </LinearGradient>
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : (
          <FadeInView delay={280} from={22} duration={520} style={s.eventsSectionTopSpacer}>
            {eventsCarouselSectionHeader}
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

        {!loading && (
          <FadeInView delay={120} from={14} duration={420}>
            <View style={s.browseWrap}>
              <Text style={[s.browseHeading, { color: colors.textPrimary }]}>Browse by category</Text>
              {browseLoadError ? (
                <Text style={[s.browseInlineError, { color: colors.error }]}>{browseLoadError}</Text>
              ) : null}
              {['restaurants', 'places', 'events'].map((key) => {
                const sectionLabel = key === 'restaurants' ? 'Restaurants' : key === 'places' ? 'Places' : 'Events'
                const items =
                  key === 'restaurants'
                    ? browseClients.restaurants || []
                    : key === 'places'
                      ? browseClients.places || []
                      : mergedEventBrowseItems
                const accent =
                  key === 'restaurants' ? colors.dining : key === 'events' ? colors.event : colors.textSecondary
                return (
                  <View key={key} style={s.browseSection}>
                    <View style={s.browseSectionHeader}>
                      <View style={[s.browseSectionIcon, { backgroundColor: `${accent}18` }]}>
                        <Ionicons
                          name={key === 'restaurants' ? 'restaurant' : key === 'events' ? 'calendar' : 'location'}
                          size={20}
                          color={accent}
                        />
                      </View>
                      <Text style={[s.browseSectionTitle, { color: accent }]}>{sectionLabel}</Text>
                    </View>
                    {items.length === 0 ? (
                      <Text style={[s.browseEmpty, { color: colors.textMuted }]}>
                        {`No ${sectionLabel.toLowerCase()} yet`}
                      </Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        nestedScrollEnabled
                        contentContainerStyle={s.browseHorizontalContent}
                      >
                        {key === 'events'
                          ? items.map((item) => {
                              if (item.kind === 'client') {
                                const imageUrl = item.image
                                return (
                                  <TouchableOpacity
                                    key={item.key}
                                    style={s.browseClientCard}
                                    activeOpacity={0.7}
                                    onPress={() => setProfileClientId(item.clientId)}
                                  >
                                    <View style={[s.browseClientCircle, { borderColor: accent }]}>
                                      {imageUrl ? (
                                        <Image source={{ uri: imageUrl }} style={s.browseClientImage} />
                                      ) : (
                                        <Ionicons name="calendar" size={32} color={accent} />
                                      )}
                                    </View>
                                    <Text style={[s.browseClientName, { color: colors.textSecondary }]} numberOfLines={2}>
                                      {item.name}
                                    </Text>
                                  </TouchableOpacity>
                                )
                              }
                              const imageUrl = item.image
                              return (
                                <TouchableOpacity
                                  key={item.key}
                                  style={s.browseClientCard}
                                  activeOpacity={0.7}
                                  onPress={() => handleBrowseDbEventPress(item)}
                                >
                                  <View style={[s.browseClientCircle, { borderColor: accent }]}>
                                    {imageUrl ? (
                                      <Image source={{ uri: imageUrl }} style={s.browseClientImage} />
                                    ) : (
                                      <Ionicons name="calendar" size={32} color={accent} />
                                    )}
                                  </View>
                                  <Text style={[s.browseClientName, { color: colors.textSecondary }]} numberOfLines={2}>
                                    {item.name}
                                  </Text>
                                </TouchableOpacity>
                              )
                            })
                          : items.map((client) => {
                              const imageUrl = resolvePublicImageUrl(client.client_image)
                              return (
                                <TouchableOpacity
                                  key={client.client_a_uuid || client.clientId}
                                  style={s.browseClientCard}
                                  activeOpacity={0.7}
                                  onPress={() => setProfileClientId(client.client_a_uuid || client.clientId)}
                                >
                                  <View style={[s.browseClientCircle, { borderColor: accent }]}>
                                    {imageUrl ? (
                                      <Image source={{ uri: imageUrl }} style={s.browseClientImage} />
                                    ) : (
                                      <Ionicons
                                        name={key === 'restaurants' ? 'restaurant' : 'location'}
                                        size={32}
                                        color={accent}
                                      />
                                    )}
                                  </View>
                                  <Text style={[s.browseClientName, { color: colors.textSecondary }]} numberOfLines={2}>
                                    {client.name || client.business_name || 'Spot'}
                                  </Text>
                                </TouchableOpacity>
                              )
                            })}
                      </ScrollView>
                    )}
                  </View>
                )
              })}
            </View>
          </FadeInView>
        )}
      </AnimatedScrollView>

      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        onClose={() => setProfileClientId(null)}
        insets={insets}
        onOpenARNavigate={(dest) => {
          setProfileClientId(null)
          if (dest?.lat != null && dest?.lng != null) {
            navigation.navigate('AR', {
              navigateTo: { lat: dest.lat, lng: dest.lng, name: dest.name || 'Destination' },
            })
          }
        }}
      />

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
  scrollContent: { paddingBottom: 48 },

  heroSection: {
    position: 'relative',
    overflow: 'visible',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    marginBottom: 0,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  heroSub: { fontSize: 14, lineHeight: 18, marginTop: 4 },
  heroArWrap: { alignSelf: 'flex-start', marginTop: 2 },
  arPillPulseWrap: { alignSelf: 'flex-start' },
  arPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 26,
    minHeight: 52,
    ...Platform.select({
      ios: {
        shadowColor: '#C8102E',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  arPillText: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 },

  eventsSectionTopSpacer: { marginTop: -10 },
  eventsHeadingRow: { paddingHorizontal: 24 },

  browseWrap: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 },
  browseHeading: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 14 },
  browseInlineError: { fontSize: 13, marginBottom: 8, fontWeight: '600' },
  browseSection: { marginBottom: 22 },
  browseSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  browseSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseSectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  browseEmpty: { fontSize: 14, fontWeight: '500', fontStyle: 'italic' },
  browseHorizontalContent: { flexDirection: 'row', gap: 14, paddingRight: 8 },
  browseClientCard: { alignItems: 'center', width: 76 },
  browseClientCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFC',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  browseClientImage: { width: '100%', height: '100%' },
  browseClientName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 76,
    lineHeight: 14,
  },

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
  arEmptyCtaPulseWrap: { alignSelf: 'center' },
  emptyCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 24,
    minHeight: 58,
    ...Platform.select({
      ios: {
        shadowColor: '#C8102E',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  emptyCtaText: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },

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
