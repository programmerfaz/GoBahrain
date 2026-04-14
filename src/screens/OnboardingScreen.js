import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Animated,
  Easing,
  useWindowDimensions,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useDoorTransition, yieldTwoFrames } from '../context/DoorTransitionContext'
import { useTheme } from '../context/ThemeContext'
import { gradients } from '../theme/designTokens'
import { GENERAL_GROUPS } from '../constants/preferences'
import { FadeInView, AnimatedPressable, GradientButton } from '../components/AnimatedUI'

const FloatingBubble = ({ size, color, startX, startY, duration, delay }) => {
  const anim = useRef(new Animated.Value(0)).current
  const floatAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { 
              toValue: 1, 
              duration, 
              easing: Easing.bezier(0.4, 0, 0.6, 1), 
              useNativeDriver: true 
            }),
            Animated.timing(anim, { 
              toValue: 0, 
              duration, 
              easing: Easing.bezier(0.4, 0, 0.6, 1), 
              useNativeDriver: true 
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(floatAnim, { 
              toValue: 1, 
              duration: duration * 1.3, 
              easing: Easing.inOut(Easing.sin), 
              useNativeDriver: true 
            }),
            Animated.timing(floatAnim, { 
              toValue: 0, 
              duration: duration * 1.3, 
              easing: Easing.inOut(Easing.sin), 
              useNativeDriver: true 
            }),
          ])
        ),
      ]).start()
    }, delay)
    return () => clearTimeout(timer)
  }, [anim, floatAnim, duration, delay])

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] })
  const translateX = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 15] })
  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.2, 1] })
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.6, 0.3] })

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: startY,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ translateY }, { translateX }, { scale }],
        opacity,
      }}
    />
  )
}

const STEPS = [
  { 
    title: 'Tell us about you', 
    subtitle: 'Pick what fits — we tailor suggestions just for you.', 
    icon: 'person-outline',
    type: 'general'
  },
  { 
    title: 'What do you like to do?', 
    subtitle: 'Activities we\'ll prioritize in your day plans.', 
    icon: 'compass-outline',
    type: 'activities'
  },
  { 
    title: 'What do you like to eat?', 
    subtitle: 'Food types we\'ll prioritize. Nothing hidden — just tailored.', 
    icon: 'restaurant-outline',
    type: 'food'
  },
]

const ChipItem = ({ item, selected, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const opacityAnim = useRef(new Animated.Value(1)).current

  const handlePress = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0.92,
          damping: 15,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 10,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
    onPress()
  }

  return (
    <AnimatedPressable
      style={[
        cs.chip,
        { 
          borderColor: selected ? item.color : 'rgba(148,163,184,0.25)',
          backgroundColor: selected ? `${item.color}18` : 'rgba(30,41,59,0.5)',
          borderWidth: selected ? 2 : 1,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
      onPress={handlePress}
      scaleDown={0.94}
    >
      <Ionicons name={item.icon} size={20} color={selected ? item.color : '#64748B'} />
      <Text style={[cs.chipLabel, selected && { color: item.color, fontWeight: '700' }]}>
        {item.label}
      </Text>
      {selected && (
        <Animated.View 
          style={[cs.chipCheck, { backgroundColor: item.color }]}
          entering={{
            animation: 'spring',
            damping: 15,
          }}
        >
          <Ionicons name="checkmark" size={10} color="#FFF" />
        </Animated.View>
      )}
    </AnimatedPressable>
  )
}

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme()
  const { GENERAL_PREFERENCES, PREFERENCES, FOOD_CATEGORIES, completeOnboarding } = useUserPreferences()
  const { startDoorToHome, cancelDoorTransition } = useDoorTransition()
  const { width = 375 } = useWindowDimensions()
  const [generalIds, setGeneralIds] = useState([])
  const [activityIds, setActivityIds] = useState([])
  const [foodIds, setFoodIds] = useState([])
  const [step, setStep] = useState(0)

  const C = isDark ? {
    bg: '#0B1120',
    text: '#F8FAFC',
    textMuted: 'rgba(203,213,225,0.85)',
    label: '#94A3B8',
    primary: colors.primary,
  } : {
    bg: colors.background,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    label: colors.textMuted,
    primary: colors.primary,
  }

  const contentOpacity = useRef(new Animated.Value(1)).current
  const contentTranslateY = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(1)).current
  const logoScale = useRef(new Animated.Value(0.3)).current
  const logoOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, damping: 12, stiffness: 100, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start()
  }, [logoScale, logoOpacity])

  const animateStep = useCallback((newStep) => {
    Animated.parallel([
      Animated.timing(contentOpacity, { 
        toValue: 0, 
        duration: 200, 
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true 
      }),
      Animated.timing(contentScale, { 
        toValue: 0.95, 
        duration: 200, 
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true 
      }),
      Animated.timing(contentTranslateY, { 
        toValue: 20, 
        duration: 200,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true 
      }),
    ]).start(() => {
      setStep(newStep)
      contentTranslateY.setValue(-20)
      contentScale.setValue(0.95)
      Animated.parallel([
        Animated.spring(contentOpacity, { 
          toValue: 1, 
          damping: 20,
          stiffness: 120,
          useNativeDriver: true 
        }),
        Animated.spring(contentScale, { 
          toValue: 1, 
          damping: 18,
          stiffness: 140,
          useNativeDriver: true 
        }),
        Animated.spring(contentTranslateY, { 
          toValue: 0, 
          damping: 20,
          stiffness: 120,
          useNativeDriver: true 
        }),
      ]).start()
    })
  }, [contentOpacity, contentScale, contentTranslateY])

  const toggleGeneral = (id) => setGeneralIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleActivity = (id) => setActivityIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleFood = (id) => setFoodIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const handleContinue = async () => {
    if (step === 0) {
      animateStep(1)
    } else if (step === 1) {
      animateStep(2)
    } else {
      try {
        startDoorToHome()
        await yieldTwoFrames()
        await completeOnboarding({ generalIds, activityIds, foodIds })
      } catch (e) {
        cancelDoorTransition()
        console.warn('[Onboarding] complete failed', e?.message)
      }
    }
  }

  const handleBack = () => {
    if (step > 0) animateStep(step - 1)
  }

  const currentStep = STEPS[step]
  const isLastStep = step === 2

  const selectedCount = step === 0 ? generalIds.length : step === 1 ? activityIds.length : foodIds.length

  const getProgressPercent = () => {
    return ((step + 1) / STEPS.length) * 100
  }

  const bgColors = isDark ? gradients.heroDark : gradients.heroLight

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.bg }]}>
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />

      <FloatingBubble size={180} color={`${C.primary}06`} startX={-50} startY={100} duration={7000} delay={0} />
      <FloatingBubble size={140} color={`${C.primary}08`} startX={width - 70} startY={150} duration={6000} delay={800} />
      <FloatingBubble size={100} color={isDark ? 'rgba(167,139,250,0.05)' : 'rgba(124,58,237,0.04)'} startX={width * 0.3} startY={500} duration={8000} delay={400} />
      <FloatingBubble size={120} color={`${C.primary}04`} startX={width * 0.7} startY={420} duration={9000} delay={1200} />

      <View style={s.container}>
        <View style={s.header}>
          <Animated.View style={[s.logoBadge, { backgroundColor: `${C.primary}18`, borderColor: `${C.primary}30`, transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
            <Ionicons name="compass" size={30} color={C.primary} />
          </Animated.View>
          <FadeInView delay={200} from={12}>
            <Text style={[s.title, { color: C.text }]}>Let's personalize</Text>
          </FadeInView>
        </View>

        <View style={s.progressBarWrap}>
          <View style={[s.progressTrack, { backgroundColor: `${C.primary}12` }]}>
            <Animated.View style={[s.progressFill, { backgroundColor: C.primary, width: `${getProgressPercent()}%` }]} />
          </View>
        </View>

        <Animated.View 
          style={[
            s.contentWrap, 
            { 
              opacity: contentOpacity, 
              transform: [
                { translateY: contentTranslateY },
                { scale: contentScale },
              ] 
            }
          ]}
        >
          <View style={s.stepHeader}>
            <View style={[s.stepIconWrap, { backgroundColor: `${C.primary}15` }]}>
              <Ionicons name={currentStep.icon} size={26} color={C.primary} />
            </View>
            <Text style={[s.question, { color: C.text }]}>{currentStep.title}</Text>
            <Text style={[s.subtitle, { color: C.textMuted }]}>{currentStep.subtitle}</Text>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 0 ? (
              <View style={s.chipColumn}>
                {GENERAL_GROUPS.map((grp) => {
                  const options = GENERAL_PREFERENCES.filter((p) => p.group === grp.key)
                  if (options.length === 0) return null
                  return (
                    <View key={grp.key} style={s.groupBlock}>
                      <Text style={[s.groupLabel, { color: C.label }]}>{grp.label}</Text>
                      <View style={s.chipRow}>
                        {options.map((p) => (
                          <ChipItem
                            key={p.id}
                            item={p}
                            selected={generalIds.includes(p.id)}
                            onPress={() => toggleGeneral(p.id)}
                          />
                        ))}
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : step === 1 ? (
              <View style={s.chipRow}>
                {PREFERENCES.map((p) => (
                  <ChipItem
                    key={p.id}
                    item={p}
                    selected={activityIds.includes(p.id)}
                    onPress={() => toggleActivity(p.id)}
                  />
                ))}
              </View>
            ) : (
              <View style={s.chipRow}>
                {FOOD_CATEGORIES.map((p) => (
                  <ChipItem
                    key={p.id}
                    item={p}
                    selected={foodIds.includes(p.id)}
                    onPress={() => toggleFood(p.id)}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>

        <View style={s.footer}>
          <View style={s.footerTop}>
            {step > 0 && (
              <AnimatedPressable style={s.backBtn} onPress={handleBack} scaleDown={0.95}>
                <Ionicons name="arrow-back" size={20} color={C.label} />
                <Text style={[s.backBtnText, { color: C.label }]}>Back</Text>
              </AnimatedPressable>
            )}
            {selectedCount > 0 && (
              <Animated.View 
                style={[s.countBadge, { backgroundColor: `${C.primary}15` }]}
              >
                <Text style={[s.countBadgeText, { color: C.primary }]}>{selectedCount} selected</Text>
              </Animated.View>
            )}
          </View>

          <GradientButton onPress={handleContinue} style={s.continueBtn}>
            <Text style={s.continueBtnText}>
              {isLastStep ? "Let's go" : 'Continue'}
            </Text>
            <Ionicons name={isLastStep ? 'checkmark-circle' : 'arrow-forward'} size={20} color="#FFF" />
          </GradientButton>
        </View>
      </View>
    </SafeAreaView>
  )
}

const cs = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  chipLabel: { 
    fontSize: 15, 
    color: '#94A3B8', 
    fontWeight: '500',
  },
  chipCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
})

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  header: { 
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 20, 
    alignItems: 'center',
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
  },
  title: { 
    fontSize: 32, 
    fontWeight: '800', 
    letterSpacing: -0.5, 
    textAlign: 'center',
  },
  progressBarWrap: { 
    paddingHorizontal: 24, 
    marginBottom: 32,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  contentWrap: { 
    flex: 1, 
    paddingHorizontal: 24,
  },
  stepHeader: {
    marginBottom: 24,
  },
  stepIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  question: { 
    fontSize: 26, 
    fontWeight: '700', 
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  subtitle: { 
    fontSize: 15, 
    lineHeight: 22,
    fontWeight: '500',
  },
  scroll: { flex: 1 },
  scrollContent: { 
    paddingBottom: 24,
  },
  chipColumn: { gap: 8 },
  groupBlock: { marginBottom: 24 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chipRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 10,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    paddingTop: 20,
    gap: 16,
  },
  footerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  backBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backBtnText: { 
    fontSize: 16, 
    fontWeight: '600',
  },
  countBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  countBadgeText: { 
    fontSize: 13, 
    fontWeight: '700',
  },
  continueBtn: { 
    width: '100%',
  },
  continueBtnText: { 
    fontSize: 17, 
    fontWeight: '700', 
    color: '#FFF',
  },
})
