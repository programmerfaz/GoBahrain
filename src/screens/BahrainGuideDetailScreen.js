import React, { useRef, useEffect, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { useTheme } from '../context/ThemeContext'
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_SEMIBOLD,
  FONT_POPPINS_MEDIUM,
  FONT_POPPINS_REGULAR,
} from '../constants/brandFont'

const DEFAULT_TIPS = [
  'Start early in the morning to avoid the midday heat.',
  'Carry water — temperatures can rise quickly.',
  'Respect local customs and dress modestly at heritage sites.',
]

const CONTENT_EYEBROW_BY_SECTION = {
  ESSENTIALS: 'WHAT YOU NEED TO KNOW',
  CULTURE: 'LOCAL CUSTOMS & TRADITIONS',
  EXPLORE: 'HIGHLIGHTS & ACTIVITIES',
  LIFESTYLE: 'WHERE TO GO',
  PRACTICAL: 'EMERGENCY ESSENTIALS',
}

/* ────────────────────────────────────────────────────────────────────────────
 * Quick-fact stat tile
 * ────────────────────────────────────────────────────────────────────────── */

const QuickFactTile = ({ fact, accent, colors, isDark, index }) => {
  const fade = useRef(new Animated.Value(0)).current
  const lift = useRef(new Animated.Value(12)).current

  useEffect(() => {
    const delay = 100 + index * 60
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 360, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 360, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [fade, lift, index])

  return (
    <Animated.View
      style={[
        s.factTile,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
          opacity: fade,
          transform: [{ translateY: lift }],
        },
      ]}
    >
      <View style={[s.factIconWrap, { backgroundColor: `${accent}1A` }]}>
        <Ionicons name={fact.icon || 'sparkles-outline'} size={15} color={accent} />
      </View>
      <Text
        style={[s.factValue, { color: colors.textPrimary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {fact.value}
      </Text>
      <Text style={[s.factLabel, { color: colors.textMuted }]} numberOfLines={2}>
        {fact.label}
      </Text>
    </Animated.View>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Activity card
 * ────────────────────────────────────────────────────────────────────────── */

const ActivityCard = ({ activity, accent, index, colors, isDark }) => {
  const slideIn = useRef(new Animated.Value(24)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const delay = 180 + index * 70
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideIn, { toValue: 0, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [opacity, slideIn, index])

  const numberLabel = String(index + 1).padStart(2, '0')
  const panelBg = isDark ? 'rgba(255,255,255,0.05)' : colors.surface
  const panelBorder = isDark ? 'rgba(255,255,255,0.1)' : colors.border

  return (
    <Animated.View
      style={[
        s.activityCard,
        {
          backgroundColor: panelBg,
          borderColor: panelBorder,
          opacity,
          transform: [{ translateY: slideIn }],
        },
      ]}
    >
      <View style={s.activityRow}>
        {/* Image column */}
        <View style={s.activityVisual}>
          {activity.image ? (
            <Image source={{ uri: activity.image }} style={s.activityImage} resizeMode="cover" />
          ) : (
            <View style={[s.activityImage, { backgroundColor: `${accent}18` }]}>
              <Ionicons name={activity.icon || 'location-outline'} size={28} color={accent} />
            </View>
          )}
          <View style={[s.numberBadge, { backgroundColor: accent }]}>
            <Text style={s.numberBadgeText}>{numberLabel}</Text>
          </View>
        </View>

        {/* Text column */}
        <View style={s.activityTextCol}>
          <View style={[s.activityTag, { backgroundColor: `${accent}14` }]}>
            <Text style={[s.activityTagText, { color: accent }]} numberOfLines={1}>
              {activity.tag || 'VISIT'}
            </Text>
          </View>
          <Text style={[s.activityTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {activity.title}
          </Text>
          <Text style={[s.activitySubtitle, { color: colors.textSecondary }]} numberOfLines={3}>
            {activity.subtitle}
          </Text>
        </View>
      </View>
    </Animated.View>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Screen
 * ────────────────────────────────────────────────────────────────────────── */

export default function BahrainGuideDetailScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const { category } = route.params || {}
  const { isDark, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: winH } = useWindowDimensions()

  const heroHeight = Math.round(Math.min(winH * 0.42, 360))
  const accent = category?.accent || '#CE1126'
  const gradientColors = category?.gradientColors || ['#1a0005', '#5a000e', '#CE1126']
  const bgImage = category?.bgImage || null
  const activities = Array.isArray(category?.activities) ? category.activities : []
  const tips = Array.isArray(category?.tips) ? category.tips : DEFAULT_TIPS
  const quickFacts = Array.isArray(category?.quickFacts) ? category.quickFacts : []
  const didYouKnow = category?.didYouKnow || ''
  const contentEyebrow = CONTENT_EYEBROW_BY_SECTION[category?.section] || 'HIGHLIGHTS & ACTIVITIES'

  const fade = useRef(new Animated.Value(0)).current
  const slide = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [fade, slide])

  const handleBack = useCallback(() => navigation.goBack(), [navigation])

  const surface = isDark ? colors.background : colors.background
  const heroScrim = isDark
    ? ['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.92)']
    : ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.82)']

  return (
    <View style={[s.root, { backgroundColor: surface }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 28, 44) }}
      >
        {/* ── HERO ── */}
        <View style={[s.hero, { height: heroHeight }]}>
          <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />
          {bgImage ? (
            <Image source={{ uri: bgImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          <LinearGradient
            colors={heroScrim}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Back button */}
          <TouchableOpacity
            style={[s.backBtn, { top: insets.top + 10 }]}
            onPress={handleBack}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            {Platform.OS === 'ios' ? (
              <BlurView intensity={60} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 22 }]} />
            )}
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Hero text */}
          <Animated.View style={[s.heroContent, { opacity: fade, transform: [{ translateY: slide }] }]}>
            <Text style={s.heroEyebrow}>
              BAHRAIN GUIDE{category?.section ? ` · ${category.section}` : ''}
            </Text>
            <View style={[s.heroPill, { backgroundColor: `${accent}CC` }]}>
              <Text style={s.heroPillText}>{category?.label || 'ESSENTIAL'}</Text>
            </View>
            <Text style={s.heroTitle} numberOfLines={2}>{category?.title || 'Bahrain Guide'}</Text>
            <Text style={s.heroSubtitle} numberOfLines={2}>{category?.subtitle || ''}</Text>
          </Animated.View>
        </View>

        {/* ── CONTENT — fills rest of page ── */}
        <View style={[s.contentWrap, { backgroundColor: surface }]}>
          {/* Quick facts */}
          {quickFacts.length > 0 ? (
            <View style={s.factsRow}>
              {quickFacts.slice(0, 3).map((f, i) => (
                <QuickFactTile key={`qf-${i}`} fact={f} accent={accent} colors={colors} isDark={isDark} index={i} />
              ))}
            </View>
          ) : null}

          {/* Section eyebrow */}
          <View style={s.sectionEyebrowRow}>
            <View style={[s.sectionLine, { backgroundColor: accent }]} />
            <Text style={[s.sectionEyebrowText, { color: accent }]}>{contentEyebrow}</Text>
            <View style={[s.sectionLine, { backgroundColor: accent, flex: 1 }]} />
          </View>

          {/* Activity cards */}
          {activities.map((activity, index) => (
            <ActivityCard
              key={activity.id || `act-${index}`}
              activity={activity}
              accent={accent}
              index={index}
              colors={colors}
              isDark={isDark}
            />
          ))}

          {/* Did You Know */}
          {didYouKnow ? (
            <View
              style={[
                s.dykCard,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface,
                  borderColor: isDark ? `${accent}40` : `${accent}30`,
                },
              ]}
            >
              <View style={s.dykHeader}>
                <View style={[s.dykIconWrap, { backgroundColor: `${accent}1A` }]}>
                  <Ionicons name="sparkles" size={16} color={accent} />
                </View>
                <Text style={[s.dykLabel, { color: accent }]}>DID YOU KNOW?</Text>
              </View>
              <Text style={[s.dykText, { color: colors.textSecondary }]}>{didYouKnow}</Text>
            </View>
          ) : null}

          {/* Local Tips */}
          <View
            style={[
              s.tipsCard,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface,
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
              },
            ]}
          >
            <View style={s.tipsHeader}>
              <View style={[s.tipsIconWrap, { backgroundColor: `${accent}1A` }]}>
                <Ionicons name="bulb-outline" size={16} color={accent} />
              </View>
              <Text style={[s.tipsTitle, { color: colors.textPrimary }]}>Local Tips</Text>
            </View>
            {tips.map((tip, i) => (
              <View key={`tip-${i}`} style={s.tipRow}>
                <Ionicons name="checkmark-circle" size={15} color={accent} style={{ marginTop: 2 }} />
                <Text style={[s.tipText, { color: colors.textSecondary }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ────────────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  root: { flex: 1 },

  /* Hero */
  hero: { position: 'relative', overflow: 'hidden', width: '100%' },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    zIndex: 10,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  heroEyebrow: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  heroPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 10,
  },
  heroPillText: {
    fontSize: 9,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 30,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#FFFFFF',
    letterSpacing: -0.6,
    lineHeight: 34,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_REGULAR,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 18,
    maxWidth: 460,
  },

  /* Content */
  contentWrap: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  /* Quick facts */
  factsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  factTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  factIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  factValue: {
    fontSize: 16,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: -0.3,
    marginBottom: 1,
  },
  factLabel: {
    fontSize: 10,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 13,
  },

  /* Section eyebrow */
  sectionEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionLine: { height: 1, width: 20, borderRadius: 1 },
  sectionEyebrowText: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 1,
  },

  /* Activity card */
  activityCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  activityRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 12,
  },
  activityVisual: {
    width: 88,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  activityImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 0.3,
  },
  activityTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  activityTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  activityTagText: {
    fontSize: 9,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 0.6,
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: -0.2,
    marginBottom: 3,
    lineHeight: 19,
  },
  activitySubtitle: {
    fontSize: 12,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 16,
  },

  /* Did You Know */
  dykCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  dykHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dykIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dykLabel: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
    letterSpacing: 1.2,
  },
  dykText: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 20,
  },

  /* Local Tips */
  tipsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tipsIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsTitle: {
    fontSize: 15,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    letterSpacing: -0.2,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 18,
  },
})
