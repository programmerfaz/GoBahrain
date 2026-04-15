import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useTheme } from '../context/ThemeContext'
import { gradients } from '../theme/designTokens'
import { GENERAL_GROUPS } from '../constants/preferences'
import { FadeInView, AnimatedPressable, GradientButton } from '../components/AnimatedUI'
import { LUXURY, luxurySoftShadow } from '../theme/luxuryPremium'
import { buildAndPersistUserPersona } from '../services/personalization'

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

const GENERAL_GROUP_ICONS = {
  companion: 'people-outline',
  pace: 'speedometer-outline',
  budget: 'wallet-outline',
  interests: 'sparkles-outline',
  planning: 'list-outline',
  timing: 'time-outline',
}

const GENERAL_GROUP_HINTS = {
  companion: 'Pick all that apply. This helps us adapt vibe, pace, and stop types.',
  pace: 'We use this to set how full or relaxed each itinerary should feel.',
  budget: 'This guides venue selection so recommendations match your spending comfort.',
  interests: 'Select the experiences you genuinely enjoy most.',
  planning: 'This tells us how much structure vs flexibility to include.',
  timing: 'This helps us suggest places at the times you naturally prefer.',
}

const ChipItem = ({ item, selected, onPress, isDark, chipWidth }) => {
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

  const borderUnselected = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.28)'

  return (
    <AnimatedPressable
      style={[
        cs.chip,
        {
          width: chipWidth,
          borderWidth: 2,
          borderColor: selected ? item.color : borderUnselected,
          backgroundColor: selected ? `${item.color}1E` : (isDark ? 'rgba(30,41,59,0.72)' : '#FFFFFF'),
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
      onPress={handlePress}
      scaleDown={0.94}
    >
      <Ionicons name={item.icon} size={20} color={selected ? item.color : (isDark ? '#CBD5E1' : '#334155')} />
      <Text style={[cs.chipLabel, { color: isDark ? '#E2E8F0' : '#1E293B' }, selected && { color: item.color, fontWeight: '700' }]}>
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
  const { width = 375 } = useWindowDimensions()
  const [generalIds, setGeneralIds] = useState([])
  const [activityIds, setActivityIds] = useState([])
  const [foodIds, setFoodIds] = useState([])
  const [profileAnswers, setProfileAnswers] = useState({
    idealDay: '',
    avoidList: '',
  })
  const [step, setStep] = useState(0)

  const C = isDark ? {
    bg: '#0B1120',
    text: '#F8FAFC',
    textMuted: 'rgba(203,213,225,0.85)',
    label: '#94A3B8',
    primary: colors.primary,
    panel: 'rgba(15,23,42,0.62)',
    panelBorder: 'rgba(148,163,184,0.22)',
  } : {
    bg: colors.background,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    label: colors.textMuted,
    primary: colors.primary,
    panel: 'rgba(255,255,255,0.82)',
    panelBorder: 'rgba(148,163,184,0.24)',
  }

  const contentOpacity = useRef(new Animated.Value(1)).current
  const contentTranslateY = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(1)).current
  const questionPop = useRef(new Animated.Value(0.92)).current
  const questionFade = useRef(new Animated.Value(0)).current
  const ctaLift = useRef(new Animated.Value(8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(questionPop, {
        toValue: 1,
        damping: 13,
        stiffness: 165,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(questionFade, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ctaLift, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [questionPop, questionFade, ctaLift])

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
        Animated.spring(questionPop, {
          toValue: 1,
          damping: 14,
          stiffness: 170,
          mass: 0.76,
          useNativeDriver: true,
        }),
        Animated.timing(questionFade, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start()
    })
  }, [contentOpacity, contentScale, contentTranslateY, questionPop, questionFade])

  const questionFlow = [
    ...GENERAL_GROUPS.map((group) => ({
      key: `general-${group.key}`,
      type: 'general-group',
      groupKey: group.key,
      title: group.label,
      subtitle: GENERAL_GROUP_HINTS[group.key] || 'Pick all that apply.',
      icon: GENERAL_GROUP_ICONS[group.key] || 'person-outline',
    })),
    {
      key: 'activities',
      type: 'activities',
      title: 'Which activities should your plans prioritize?',
      subtitle: 'Think about what makes a day memorable for you in Bahrain.',
      icon: 'compass-outline',
    },
    {
      key: 'food',
      type: 'food',
      title: 'What kind of food experiences fit you best?',
      subtitle: 'Choose the cuisines and dining style you naturally gravitate toward.',
      icon: 'restaurant-outline',
    },
    {
      key: 'ideal-day',
      type: 'text',
      title: 'What are the top 3 things your perfect Bahrain day must include?',
      subtitle: 'Write specific preferences (pace, vibe, places, and timing). The more concrete you are, the better we personalize.',
      placeholder: 'Example: 1) Specialty coffee in a quiet place, 2) One cultural or heritage stop, 3) Sunset by the sea with a casual local dinner',
      answerKey: 'idealDay',
    },
    {
      key: 'avoid-list',
      type: 'text',
      title: 'What are your non-negotiables and hard no\'s?',
      subtitle: 'List anything we should avoid: food restrictions, crowd/noise tolerance, mobility limits, budget limits, or anything else.',
      placeholder: 'Example: No shellfish, avoid very crowded/loud venues, max 20-minute drives between stops, no outdoor activity at noon',
      answerKey: 'avoidList',
    },
  ]

  const toggleGeneral = (id) => setGeneralIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleActivity = (id) => setActivityIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleFood = (id) => setFoodIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const handleContinue = async () => {
    if (currentStep?.type === 'text') {
      const raw = profileAnswers[currentStep.answerKey] || ''
      const trimmed = raw.trim()
      if (!trimmed) return
      if (raw !== trimmed) {
        setProfileAnswers((prev) => ({ ...prev, [currentStep.answerKey]: trimmed }))
      }
    }

    if (step < questionFlow.length - 1) {
      animateStep(step + 1)
    } else {
      try {
        const profileSummary = await buildAndPersistUserPersona({
          generalIds,
          activityIds,
          foodIds,
          profileAnswers,
        })
        await completeOnboarding({ generalIds, activityIds, foodIds, profileAnswers, profileSummary })
      } catch (e) {
        console.warn('[Onboarding] complete failed', e?.message)
      }
    }
  }

  const handleBack = () => {
    if (step > 0) animateStep(step - 1)
  }

  const currentStep = questionFlow[step]
  const isLastStep = step === questionFlow.length - 1

  const selectedCount = currentStep?.type === 'general-group'
    ? generalIds.filter((id) => GENERAL_PREFERENCES.some((p) => p.group === currentStep.groupKey && p.id === id)).length
    : currentStep?.type === 'activities'
      ? activityIds.length
      : currentStep?.type === 'food'
        ? foodIds.length
        : (profileAnswers[currentStep?.answerKey] || '').trim().length

  const getProgressPercent = () => {
    return ((step + 1) / questionFlow.length) * 100
  }

  const bgColors = isDark ? gradients.heroDark : gradients.heroLight
  const chipGap = 10
  const chipCols = 3
  const chipWidth = Math.floor((width - (24 * 2) - (chipGap * (chipCols - 1))) / chipCols)
  const optionsForCurrentStep = useMemo(() => {
    if (currentStep?.type === 'general-group') {
      return GENERAL_PREFERENCES.filter((p) => p.group === currentStep.groupKey)
    }
    if (currentStep?.type === 'activities') return PREFERENCES
    if (currentStep?.type === 'food') return FOOD_CATEGORIES
    return []
  }, [currentStep, GENERAL_PREFERENCES, PREFERENCES, FOOD_CATEGORIES])

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.bg }]}>
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />

      <FloatingBubble size={180} color={`${C.primary}06`} startX={-50} startY={100} duration={7000} delay={0} />
      <FloatingBubble size={140} color={`${C.primary}08`} startX={width - 70} startY={150} duration={6000} delay={800} />
      <FloatingBubble size={100} color={isDark ? 'rgba(167,139,250,0.05)' : 'rgba(124,58,237,0.04)'} startX={width * 0.3} startY={500} duration={8000} delay={400} />
      <FloatingBubble size={120} color={`${C.primary}04`} startX={width * 0.7} startY={420} duration={9000} delay={1200} />

      <View style={s.container}>
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
          <Animated.View
            style={[
              s.stepHeader,
              {
                opacity: questionFade,
                transform: [{ scale: questionPop }],
              },
            ]}
          >
            <Text style={[s.stepMeta, { color: C.label }]}>
              Question {step + 1} of {questionFlow.length}
            </Text>
            <Text style={[s.question, { color: C.text }]}>{currentStep.title}</Text>
            <Text style={[s.subtitle, { color: C.textMuted }]}>{currentStep.subtitle}</Text>
          </Animated.View>

          <View style={[s.questionPanel, { backgroundColor: C.panel, borderColor: C.panelBorder }]}>
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {currentStep?.type === 'text' ? (
                <View style={s.textQuestionWrap}>
                  <TextInput
                    value={profileAnswers[currentStep.answerKey] || ''}
                    onChangeText={(value) => setProfileAnswers((prev) => ({ ...prev, [currentStep.answerKey]: value }))}
                    placeholder={currentStep.placeholder}
                    placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                    multiline
                    textAlignVertical="top"
                    style={[
                      s.textInput,
                      {
                        color: C.text,
                        backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.95)',
                        borderColor: C.panelBorder,
                      },
                    ]}
                    accessibilityLabel={currentStep.title}
                  />
                  <Text style={[s.textHint, { color: C.label }]}>
                    More detail gives better personalization.
                  </Text>
                </View>
              ) : (
                <View style={s.chipRow}>
                  {optionsForCurrentStep.map((p, idx) => (
                    <FadeInView key={`${currentStep.key}-${p.id}`} delay={60 + idx * 35} from={16} duration={280}>
                      <ChipItem
                        item={p}
                        selected={
                          currentStep?.type === 'general-group'
                            ? generalIds.includes(p.id)
                            : currentStep?.type === 'activities'
                              ? activityIds.includes(p.id)
                              : foodIds.includes(p.id)
                        }
                        onPress={() =>
                          currentStep?.type === 'general-group'
                            ? toggleGeneral(p.id)
                            : currentStep?.type === 'activities'
                              ? toggleActivity(p.id)
                              : toggleFood(p.id)
                        }
                        isDark={isDark}
                        chipWidth={chipWidth}
                      />
                    </FadeInView>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>

        <Animated.View style={[s.footer, { transform: [{ translateY: ctaLift }] }]}>
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

          <GradientButton
            onPress={handleContinue}
            style={s.continueBtn}
            gradientColors={['#0F172A', '#1E293B']}
            disabled={currentStep?.type === 'text' && !(profileAnswers[currentStep.answerKey] || '').trim()}
          >
            <Text style={s.continueBtnText}>
              {isLastStep ? "Let's go" : 'Continue'}
            </Text>
            <Ionicons name={isLastStep ? 'checkmark-circle' : 'arrow-forward'} size={20} color="#FFF" />
          </GradientButton>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}

const cs = StyleSheet.create({
  chip: {
    minHeight: 82,
    aspectRatio: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderCurve: 'continuous',
    position: 'relative',
    ...luxurySoftShadow,
  },
  chipLabel: { 
    fontSize: 12, 
    color: '#94A3B8', 
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 15,
  },
  chipCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: LUXURY.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    ...luxurySoftShadow,
  },
  title: { 
    fontSize: 32, 
    fontWeight: '800', 
    letterSpacing: -0.5, 
    textAlign: 'center',
  },
  progressBarWrap: { 
    paddingHorizontal: 24, 
    marginTop: 18,
    marginBottom: 24,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  contentWrap: { 
    flex: 1, 
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
  },
  stepHeader: {
    marginBottom: 14,
    alignItems: 'center',
    width: '100%',
  },
  stepMeta: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  stepIconWrap: {
    width: 52,
    height: 52,
    borderRadius: LUXURY.radiusChip + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  question: { 
    fontSize: 26, 
    fontWeight: '900', 
    lineHeight: 31,
    marginBottom: 8,
    letterSpacing: -0.55,
    textAlign: 'center',
  },
  subtitle: { 
    fontSize: 15, 
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.1,
    textAlign: 'center',
    maxWidth: 320,
  },
  questionPanel: {
    flex: 1,
    width: '100%',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...luxurySoftShadow,
  },
  scroll: { flex: 1, width: '100%' },
  scrollContent: { 
    paddingBottom: 20,
    paddingTop: 14,
    alignItems: 'center',
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
    justifyContent: 'center',
    width: '100%',
  },
  textQuestionWrap: {
    width: '100%',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  textInput: {
    minHeight: 152,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  textHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    paddingTop: 14,
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
    borderRadius: LUXURY.radiusPill,
    ...luxurySoftShadow,
  },
  countBadgeText: { 
    fontSize: 13, 
    fontWeight: '700',
  },
  continueBtn: { 
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  continueBtnText: { 
    fontSize: 16, 
    fontWeight: '800', 
    letterSpacing: 0.2,
    color: '#FFF',
  },
})
