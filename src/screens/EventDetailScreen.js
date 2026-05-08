import React, { useEffect, useMemo, useRef } from 'react'
import {
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useTheme } from '../context/ThemeContext'
import { coerceImageValueToString, resolvePublicImageUrl } from '../utils/imageUrl'
import { FONT_POPPINS_BOLD, FONT_POPPINS_MEDIUM, FONT_POPPINS_SEMIBOLD } from '../constants/brandFont'

const DEFAULT_DESCRIPTION =
  'Experience one of Bahrain\'s standout moments with curated vibes, elegant atmosphere, and a memorable premium setting.'

const FALLBACK_GALLERY = [
  'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519677100203-a0e668c92439?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
]

const toDate = (value) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const formatEventDate = (value) => {
  const d = toDate(value)
  if (!d) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const formatEventTime = (value) => {
  const d = toDate(value)
  if (!d) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const DetailRow = ({ icon, label, value, textPrimary, textMuted }) => {
  if (!value) return null
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconWrap}>
        <Ionicons name={icon} size={18} color="#D4AF37" />
      </View>
      <View style={styles.detailTextWrap}>
        <Text style={[styles.detailLabel, { color: textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: textPrimary }]}>{value}</Text>
      </View>
    </View>
  )
}

const StatPill = ({ icon, label, value, isDark }) => (
  <View style={[styles.statPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#FFFFFF' }]}>
    <Ionicons name={icon} size={16} color="#D4AF37" />
    <View style={styles.statTextWrap}>
      <Text style={[styles.statLabel, { color: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.56)' }]}>{label}</Text>
      <Text style={[styles.statValue, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>{value}</Text>
    </View>
  </View>
)

const PremiumOrbs = ({ isDark, floatY }) => (
  <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
    <Animated.View
      style={[
        styles.orb,
        {
          width: 180,
          height: 180,
          borderRadius: 90,
          top: 40,
          right: -36,
          transform: [{ translateY: floatY }],
          backgroundColor: isDark ? 'rgba(133,92,255,0.35)' : 'rgba(142,111,255,0.28)',
        },
      ]}
    />
    <Animated.View
      style={[
        styles.orb,
        {
          width: 130,
          height: 130,
          borderRadius: 65,
          bottom: 120,
          left: -32,
          transform: [{ translateY: Animated.multiply(floatY, -0.7) }],
          backgroundColor: isDark ? 'rgba(80,203,255,0.28)' : 'rgba(116,220,255,0.22)',
        },
      ]}
    />
    <View style={[styles.gridLine, { top: 52, opacity: isDark ? 0.18 : 0.14 }]} />
    <View style={[styles.gridLine, { top: 90, opacity: isDark ? 0.12 : 0.09 }]} />
  </View>
)

export default function EventDetailScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const insets = useSafeAreaInsets()
  const { isDark } = useTheme()
  const fade = useRef(new Animated.Value(0)).current
  const slide = useRef(new Animated.Value(20)).current
  const floatY = useRef(new Animated.Value(0)).current
  const { width: screenW } = Dimensions.get('window')

  const event = route.params?.event || {}
  const metadata = event.metadata || event.raw?.metadata || event

  const title =
    metadata.event_name ||
    metadata.name ||
    event.name ||
    'Featured Bahrain Event'
  const eventType = metadata.event_type || 'Premium Experience'
  const venue = metadata.venue || metadata.location || 'Bahrain'
  const dateLabel = formatEventDate(metadata.start_date || metadata.end_date || metadata.start_time || metadata.end_time)
  const startTime = formatEventTime(metadata.start_time || metadata.start_date)
  const endTime = formatEventTime(metadata.end_time)
  const timeLabel = [startTime, endTime].filter(Boolean).join(' - ')
  const imageUri = useMemo(() => {
    const fromPublic = resolvePublicImageUrl(metadata.image || event.imageUri || event.image)
    if (fromPublic) return fromPublic
    return coerceImageValueToString(metadata.image || event.imageUri || event.image)
  }, [event.image, event.imageUri, metadata.image])
  const galleryImages = useMemo(() => {
    const candidates = [
      imageUri,
      coerceImageValueToString(metadata.hero_image),
      coerceImageValueToString(metadata.image_two),
      coerceImageValueToString(metadata.image_three),
    ].filter(Boolean)
    if (candidates.length >= 3) return candidates.slice(0, 3)
    return [...new Set([...candidates, ...FALLBACK_GALLERY])].slice(0, 3)
  }, [imageUri, metadata.hero_image, metadata.image_three, metadata.image_two])

  const description =
    metadata.description ||
    metadata.details ||
    metadata.event_description ||
    DEFAULT_DESCRIPTION

  const premiumChips = [
    eventType,
    metadata.price_range || metadata.ticket_price || null,
    metadata.dress_code || null,
  ].filter(Boolean)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [fade, slide])

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -8,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 8,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [floatY])

  const surface = isDark ? '#09101D' : '#F6F8FC'
  const panelBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'
  const panelBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)'
  const textPrimary = isDark ? '#FFFFFF' : '#0F172A'
  const textSecondary = isDark ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.72)'
  const textMuted = isDark ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.54)'
  const heroScrim = isDark
    ? ['rgba(5,5,10,0.06)', 'rgba(5,5,12,0.38)', 'rgba(9,16,29,0.94)']
    : ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.34)', 'rgba(246,248,252,0.98)']
  const quickFacts = [
    { icon: 'calendar-outline', label: 'Date', value: dateLabel || 'TBA' },
    { icon: 'time-outline', label: 'Time', value: timeLabel || 'TBA' },
    { icon: 'location-outline', label: 'Venue', value: venue || 'Bahrain' },
  ]

  return (
    <View style={[styles.root, { backgroundColor: surface }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 28, 44) }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <PremiumOrbs isDark={isDark} floatY={floatY} />
          {imageUri ? (
            <Image source={{ uri: imageUri }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          ) : (
            <LinearGradient colors={isDark ? ['#0E0B14', '#1A1630', '#292145'] : ['#F6F8FF', '#E8EDFF', '#D8E4FF']} style={StyleSheet.absoluteFillObject} />
          )}
          <LinearGradient
            colors={heroScrim}
            locations={[0, 0.58, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
            style={[styles.backButton, { top: insets.top + 8 }]}
            accessibilityRole="button"
            accessibilityLabel="Back to explore"
          >
            {Platform.OS === 'ios' ? (
              <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)' }]} />
            )}
            <Ionicons name="arrow-back" size={20} color={isDark ? '#FFFFFF' : '#0F172A'} />
          </TouchableOpacity>

          <Animated.View style={[styles.heroContent, { opacity: fade, transform: [{ translateY: slide }] }]}>
            <Text style={styles.eyebrow}>EVENT DETAILS</Text>
            <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
            <View style={styles.heroVenueRow}>
              <Ionicons name="location-outline" size={14} color={isDark ? 'rgba(255,255,255,0.8)' : 'rgba(15,23,42,0.66)'} />
              <Text style={[styles.venue, { color: textSecondary }]}>{venue}</Text>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.contentWrap, { opacity: fade, transform: [{ translateY: slide }] }]}>
          <View style={[styles.floatingInfoCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <View style={styles.statsRow}>
              {quickFacts.map((item) => (
                <StatPill
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>

          <View style={styles.chipsRow}>
            {premiumChips.map((chip) => (
              <View key={chip} style={[styles.chip, { backgroundColor: isDark ? 'rgba(212,175,55,0.12)' : 'rgba(180,135,20,0.1)' }]}>
                <Text style={styles.chipText}>{String(chip).toUpperCase()}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <DetailRow icon="calendar-outline" label="Date" value={dateLabel || 'Date will be announced soon'} textPrimary={textPrimary} textMuted={textMuted} />
            <DetailRow icon="time-outline" label="Time" value={timeLabel || 'Time will be announced soon'} textPrimary={textPrimary} textMuted={textMuted} />
            <DetailRow icon="location-outline" label="Venue" value={venue} textPrimary={textPrimary} textMuted={textMuted} />
          </View>

          <View style={[styles.galleryWrap, { width: screenW - 36 }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Visual Highlights</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryScrollContent}>
              {galleryImages.map((uri, idx) => (
                <View key={`${uri}-${idx}`} style={styles.galleryCard}>
                  <Image source={{ uri }} style={styles.galleryImage} resizeMode="cover" />
                  <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.54)']} style={styles.galleryOverlay} />
                  <Text style={styles.galleryLabel}>PREMIUM VIEW {idx + 1}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <Text style={[styles.panelTitle, { color: textPrimary }]}>About this event</Text>
            <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heroWrap: {
    height: 340,
    position: 'relative',
    overflow: 'hidden',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    overflow: 'hidden',
    zIndex: 3,
  },
  heroContent: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 32,
  },
  eyebrow: {
    color: '#D4AF37',
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    lineHeight: 37,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: -0.8,
  },
  heroVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  venue: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONT_POPPINS_MEDIUM,
  },
  contentWrap: {
    paddingHorizontal: 18,
    marginTop: -26,
  },
  floatingInfoCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statPill: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statTextWrap: { flex: 1, minWidth: 0 },
  statLabel: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_MEDIUM,
    lineHeight: 12,
  },
  statValue: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    lineHeight: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.36)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: '#F7D57A',
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: FONT_POPPINS_SEMIBOLD,
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(212,175,55,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  detailTextWrap: { flex: 1 },
  detailLabel: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_MEDIUM,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    marginTop: 1,
  },
  panelTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONT_POPPINS_BOLD,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FONT_POPPINS_MEDIUM,
  },
  orb: {
    position: 'absolute',
    ...Platform.select({
      ios: {
        shadowColor: '#A78BFA',
        shadowOpacity: 0.45,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#FFFFFF',
  },
  galleryWrap: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONT_POPPINS_BOLD,
    marginBottom: 10,
  },
  galleryScrollContent: {
    paddingRight: 8,
  },
  galleryCard: {
    width: 182,
    height: 144,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  galleryLabel: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: 0.7,
  },
})
