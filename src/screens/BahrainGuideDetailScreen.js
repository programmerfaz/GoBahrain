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

/** Subtle geometric tech-forward overlay drawn with Views */
const GeometricOverlay = ({ accent }) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {/* Large circle 1 */}
    <View style={[go.circle, {
      width: 340, height: 340, borderRadius: 170,
      borderColor: `${accent}28`,
      top: -120, right: -80,
    }]} />
    {/* Large circle 2 */}
    <View style={[go.circle, {
      width: 220, height: 220, borderRadius: 110,
      borderColor: `${accent}18`,
      bottom: -60, left: -50,
    }]} />
    {/* Diagonal band */}
    <View style={[go.band, {
      backgroundColor: `${accent}0D`,
      transform: [{ rotate: '-22deg' }],
      top: '20%', left: '-10%', width: '130%', height: 60,
    }]} />
    {/* Second diagonal */}
    <View style={[go.band, {
      backgroundColor: `${accent}08`,
      transform: [{ rotate: '-22deg' }],
      top: '30%', left: '-10%', width: '130%', height: 30,
    }]} />
    {/* Small accent dot cluster */}
    <View style={[go.dot, { backgroundColor: `${accent}55`, top: '18%', left: '15%' }]} />
    <View style={[go.dot, { backgroundColor: `${accent}40`, top: '23%', left: '22%', width: 5, height: 5, borderRadius: 2.5 }]} />
    <View style={[go.dot, { backgroundColor: `${accent}35`, top: '16%', left: '28%', width: 3, height: 3, borderRadius: 1.5 }]} />
    {/* Hexagonal ring (rotated square) */}
    <View style={[go.hexRing, {
      borderColor: `${accent}22`,
      width: 100, height: 100, borderRadius: 8,
      transform: [{ rotate: '45deg' }],
      bottom: '28%', right: '-18%',
    }]} />
    <View style={[go.hexRing, {
      borderColor: `${accent}14`,
      width: 140, height: 140, borderRadius: 12,
      transform: [{ rotate: '45deg' }],
      bottom: '24%', right: '-28%',
    }]} />
    {/* Wave line strip */}
    <View style={[go.waveLine, { backgroundColor: `${accent}12`, top: '60%', left: 0, width: '100%' }]} />
    <View style={[go.waveLine, { backgroundColor: `${accent}08`, top: '63%', left: '8%', width: '85%' }]} />
  </View>
)

const go = StyleSheet.create({
  circle: { position: 'absolute', borderWidth: 1.5 },
  band: { position: 'absolute' },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5 },
  hexRing: { position: 'absolute', borderWidth: 1.5 },
  waveLine: { position: 'absolute', height: 1.5 },
})

/** Single glassmorphism activity card */
const GlassActivityCard = ({ activity, accent, index, isDark }) => {
  const slideIn = useRef(new Animated.Value(36)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const delay = 200 + index * 80
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideIn, { toValue: 0, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [opacity, slideIn, index])

  return (
    <Animated.View style={[gds.glassCard, { opacity, transform: [{ translateY: slideIn }] }]}>
      {/* Glassmorphism backdrop */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={isDark ? 55 : 65}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, gds.androidFrost, {
          backgroundColor: isDark ? 'rgba(10,10,20,0.82)' : 'rgba(255,255,255,0.88)',
          borderRadius: 20,
        }]} />
      )}
      <View style={[gds.glassBorder, {
        borderColor: isDark ? `${accent}35` : `${accent}55`,
      }]} />

      <View style={gds.cardInner}>
        {/* Icon circle */}
        <View style={[gds.iconCircle, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
          <Ionicons name={activity.icon || 'location-outline'} size={22} color={accent} />
        </View>

        {/* Text */}
        <View style={gds.cardText}>
          <Text style={[gds.cardTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={2}>
            {activity.title}
          </Text>
          <Text style={[gds.cardSubtitle, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(15,23,42,0.62)' }]} numberOfLines={2}>
            {activity.subtitle}
          </Text>
        </View>

        {/* Tag */}
        <View style={[gds.tagBadge, { backgroundColor: `${accent}22`, borderColor: `${accent}45` }]}>
          <Text style={[gds.tagText, { color: accent }]}>{activity.tag || 'VISIT'}</Text>
        </View>
      </View>

      {/* Subtle shimmer line at top */}
      <View style={[gds.shimmerTop, { backgroundColor: `${accent}35` }]} />
    </Animated.View>
  )
}

const DEFAULT_TIPS = [
  'Start early in the morning to avoid the midday heat.',
  'Carry water — temperatures can rise quickly.',
  'Respect local customs and dress modestly at heritage sites.',
]

export default function BahrainGuideDetailScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const { category } = route.params || {}
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { width: winW, height: winH } = useWindowDimensions()

  const heroHeight = Math.round(Math.min(winH * 0.44, 380))
  const accent = category?.accent || '#CE1126'
  const gradientColors = category?.gradientColors || ['#1a0005', '#5a000e', '#CE1126']
  const bgImage = category?.bgImage || null
  const activities = Array.isArray(category?.activities) ? category.activities : []
  const tips = Array.isArray(category?.tips) ? category.tips : DEFAULT_TIPS

  const headerFade = useRef(new Animated.Value(0)).current
  const headerSlide = useRef(new Animated.Value(28)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [headerFade, headerSlide])

  const handleBack = useCallback(() => navigation.goBack(), [navigation])

  return (
    <View style={gds.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── HERO (top ~44%) ── */}
      <View style={[gds.hero, { height: heroHeight }]}>
        {/* Background */}
        {bgImage ? (
          <Image source={{ uri: bgImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />
        )}

        {/* Geometric tech-forward overlay */}
        <GeometricOverlay accent={accent} />

        {/* Bottom scrim — keeps bottom 2/3 darker for text legibility */}
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.94)']}
          locations={[0, 0.25, 0.7, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Back button */}
        <TouchableOpacity
          style={[gds.backBtn, { top: insets.top + 10 }]}
          onPress={handleBack}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to explore screen"
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 24 }]} />
          )}
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Hero content — lives in bottom third of hero */}
        <Animated.View style={[gds.heroContent, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <View style={[gds.categoryBadge, { backgroundColor: `${accent}DD` }]}>
            <Text style={gds.categoryBadgeText}>PERSONALIZED FOR YOU</Text>
          </View>
          <Text style={gds.heroTitle} numberOfLines={2}>{category?.title || 'Bahrain Guide'}</Text>
          <Text style={gds.heroSubtitle} numberOfLines={2}>{category?.subtitle || ''}</Text>
        </Animated.View>
      </View>

      {/* ── CONTENT (bottom) ── */}
      <View style={[gds.contentWrapper, { backgroundColor: isDark ? '#080C14' : '#F0F4FA' }]}>
        {/* Curved top connector */}
        <View style={[gds.curveConnector, { backgroundColor: isDark ? '#080C14' : '#F0F4FA' }]} />

        <ScrollView
          style={gds.contentScroll}
          contentContainerStyle={[gds.contentPad, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Section eyebrow */}
          <View style={gds.eyebrowRow}>
            <View style={[gds.eyebrowLine, { backgroundColor: accent }]} />
            <Text style={[gds.eyebrowText, { color: accent }]}>HIGHLIGHTS & ACTIVITIES</Text>
            <View style={[gds.eyebrowLine, { backgroundColor: accent, flex: 1 }]} />
          </View>

          {/* Activity cards */}
          {activities.map((activity, index) => (
            <GlassActivityCard
              key={activity.id || `act-${index}`}
              activity={activity}
              accent={accent}
              index={index}
              isDark={isDark}
            />
          ))}

          {/* Tips glassmorphism card */}
          <View style={[gds.tipsCard, { borderColor: `${accent}35`, marginTop: 24 }]}>
            {Platform.OS === 'ios' ? (
              <BlurView
                intensity={isDark ? 50 : 60}
                tint={isDark ? 'dark' : 'light'}
                style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, {
                backgroundColor: isDark ? 'rgba(10,10,20,0.85)' : 'rgba(255,255,255,0.92)',
                borderRadius: 20,
              }]} />
            )}
            <View style={[gds.tipsInner]}>
              <View style={gds.tipsHeaderRow}>
                <View style={[gds.tipsIconBg, { backgroundColor: `${accent}20` }]}>
                  <Ionicons name="bulb-outline" size={18} color={accent} />
                </View>
                <Text style={[gds.tipsTitle, { color: accent }]}>Local Tips</Text>
              </View>
              {tips.map((tip, i) => (
                <View key={`tip-${i}`} style={gds.tipRow}>
                  <Ionicons name="checkmark-circle" size={15} color={accent} style={{ marginTop: 1 }} />
                  <Text style={[gds.tipText, { color: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.7)' }]}>
                    {tip}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[gds.shimmerTop, { backgroundColor: `${accent}40` }]} />
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

const gds = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

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
    borderColor: 'rgba(255,255,255,0.28)',
    zIndex: 10,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 38,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 19,
  },

  /* Content */
  contentWrapper: { flex: 1, position: 'relative' },
  curveConnector: {
    position: 'absolute',
    top: -22,
    left: 0,
    right: 0,
    height: 28,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  contentScroll: { flex: 1 },
  contentPad: { paddingHorizontal: 20, paddingTop: 14 },

  /* Eyebrow */
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  eyebrowLine: { height: 1.5, width: 24, borderRadius: 1 },
  eyebrowText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  /* Glass activity card */
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
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
  androidFrost: {},
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 20,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 4 },
  cardSubtitle: { fontSize: 12, lineHeight: 16 },
  tagBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  tagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  shimmerTop: { position: 'absolute', top: 0, left: 16, right: 16, height: 1 },

  /* Tips */
  tipsCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  tipsInner: { padding: 18 },
  tipsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  tipsIconBg: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tipsTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18 },
})
