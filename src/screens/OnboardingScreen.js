import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  SafeAreaView,
  Animated,
  Easing,
  useWindowDimensions,
  LayoutAnimation,
  UIManager,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useTheme } from '../context/ThemeContext'
import { gradients } from '../theme/designTokens'
import { GENERAL_GROUPS } from '../constants/preferences'
import { FadeInView, AnimatedPressable, GradientButton } from '../components/AnimatedUI'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const STEPS = [
  { title: 'Tell us about you', subtitle: 'Pick what fits — we tailor suggestions just for you.', icon: 'person-outline' },
  { title: 'What do you like to do?', subtitle: 'Activities we\'ll prioritize in your day plans.', icon: 'compass-outline' },
  { title: 'What do you like to eat?', subtitle: 'Food types we\'ll prioritize. Nothing hidden — just tailored.', icon: 'restaurant-outline' },
]

const StepIndicator = ({ currentStep, totalSteps }) => {
  const progressAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: (currentStep + 1) / totalSteps,
      damping: 18,
      stiffness: 120,
      useNativeDriver: false,
    }).start()
  }, [currentStep, totalSteps, progressAnim])

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  return (
    <View style={si.container}>
      <View style={si.stepsRow}>
        {STEPS.map((s, i) => {
          const active = i <= currentStep
          return (
            <View key={i} style={si.stepDot}>
              <View style={[si.dot, active && si.dotActive]}>
                {i < currentStep ? (
                  <Ionicons name="checkmark" size={12} color="#FFF" />
                ) : (
                  <Text style={[si.dotText, active && si.dotTextActive]}>{i + 1}</Text>
                )}
              </View>
              {i < STEPS.length - 1 && (
                <View style={[si.connector, i < currentStep && si.connectorActive]} />
              )}
            </View>
          )
        })}
      </View>
      <View style={si.progressTrack}>
        <Animated.View style={[si.progressFill, { width: progressWidth }]}>
          <LinearGradient
            colors={['#E63950', '#C8102E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  )
}

const ChipItem = ({ item, selected, onPress, delay }) => {
  return (
    <FadeInView delay={delay} from={12} duration={300}>
      <AnimatedPressable
        style={[
          cs.chip,
          { borderColor: item.color || 'rgba(148,163,184,0.3)' },
          selected && { backgroundColor: `${item.color}22`, borderWidth: 2, borderColor: item.color },
        ]}
        onPress={onPress}
        scaleDown={0.94}
      >
        <Ionicons name={item.icon} size={20} color={selected ? item.color : '#64748B'} />
        <Text style={[cs.chipLabel, selected && { color: item.color, fontWeight: '700' }]}>
          {item.label}
        </Text>
        {selected && (
          <View style={[cs.chipCheck, { backgroundColor: item.color }]}>
            <Ionicons name="checkmark" size={10} color="#FFF" />
          </View>
        )}
      </AnimatedPressable>
    </FadeInView>
  )
}

export default function OnboardingScreen() {
  const { colors } = useTheme()
  const { GENERAL_PREFERENCES, PREFERENCES, FOOD_CATEGORIES, completeOnboarding } = useUserPreferences()
  const { width } = useWindowDimensions()
  const [generalIds, setGeneralIds] = useState([])
  const [activityIds, setActivityIds] = useState([])
  const [foodIds, setFoodIds] = useState([])
  const [step, setStep] = useState(0)

  const titleOpacity = useRef(new Animated.Value(1)).current
  const titleTranslateY = useRef(new Animated.Value(0)).current
  const contentOpacity = useRef(new Animated.Value(1)).current

  const animateStepChange = useCallback((newStep) => {
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(titleTranslateY, { toValue: -10, duration: 150, useNativeDriver: true }),
      Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      setStep(newStep)
      titleTranslateY.setValue(10)
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(titleTranslateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start()
    })
  }, [titleOpacity, titleTranslateY, contentOpacity])

  const toggleGeneral = (id) => setGeneralIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleActivity = (id) => setActivityIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleFood = (id) => setFoodIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const handleContinue = () => {
    if (step === 0) animateStepChange(1)
    else if (step === 1) animateStepChange(2)
    else completeOnboarding({ generalIds, activityIds, foodIds })
  }

  const handleBack = () => {
    if (step >= 1) animateStepChange(step - 1)
  }

  const currentStep = STEPS[step]
  const isLastStep = step === 2

  const selectedCount = step === 0 ? generalIds.length : step === 1 ? activityIds.length : foodIds.length

  return (
    <SafeAreaView style={s.safe}>
      <LinearGradient
        colors={gradients.onboardingBg}
        style={StyleSheet.absoluteFill}
      />

      <View style={s.container}>
        <FadeInView delay={0} from={20}>
          <StepIndicator currentStep={step} totalSteps={STEPS.length} />
        </FadeInView>

        <Animated.View style={[s.header, { opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }]}>
          <View style={s.stepIconWrap}>
            <LinearGradient
              colors={['rgba(230,57,80,0.2)', 'rgba(230,57,80,0.08)']}
              style={s.stepIconGradient}
            >
              <Ionicons name={currentStep.icon} size={24} color="#E63950" />
            </LinearGradient>
          </View>
          <Text style={s.title}>{currentStep.title}</Text>
          <Text style={s.subtitle}>{currentStep.subtitle}</Text>
        </Animated.View>

        <Animated.View style={[s.scrollWrap, { opacity: contentOpacity }]}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 0 ? (
              <View style={s.chipColumn}>
                {GENERAL_GROUPS.map((grp, gi) => {
                  const options = GENERAL_PREFERENCES.filter((p) => p.group === grp.key)
                  if (options.length === 0) return null
                  return (
                    <FadeInView key={grp.key} delay={gi * 60} from={16}>
                      <View style={s.groupBlock}>
                        <Text style={s.groupLabel}>{grp.label}</Text>
                        <View style={s.chipRow}>
                          {options.map((p, pi) => (
                            <ChipItem
                              key={p.id}
                              item={p}
                              selected={generalIds.includes(p.id)}
                              onPress={() => toggleGeneral(p.id)}
                              delay={gi * 60 + pi * 40}
                            />
                          ))}
                        </View>
                      </View>
                    </FadeInView>
                  )
                })}
              </View>
            ) : step === 1 ? (
              <View style={s.chipRow}>
                {PREFERENCES.map((p, i) => (
                  <ChipItem
                    key={p.id}
                    item={p}
                    selected={activityIds.includes(p.id)}
                    onPress={() => toggleActivity(p.id)}
                    delay={i * 50}
                  />
                ))}
              </View>
            ) : (
              <View style={s.chipRow}>
                {FOOD_CATEGORIES.map((p, i) => (
                  <ChipItem
                    key={p.id}
                    item={p}
                    selected={foodIds.includes(p.id)}
                    onPress={() => toggleFood(p.id)}
                    delay={i * 50}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>

        <View style={s.footer}>
          {step >= 1 ? (
            <AnimatedPressable style={s.backBtn} onPress={handleBack} scaleDown={0.95}>
              <Ionicons name="arrow-back" size={20} color="#64748B" />
              <Text style={s.backBtnText}>Back</Text>
            </AnimatedPressable>
          ) : (
            <View style={s.backBtnPlaceholder} />
          )}

          <View style={s.footerRight}>
            {selectedCount > 0 && (
              <FadeInView from={8} duration={200}>
                <View style={s.countBadge}>
                  <Text style={s.countBadgeText}>{selectedCount} selected</Text>
                </View>
              </FadeInView>
            )}
            <GradientButton onPress={handleContinue} style={s.continueBtn}>
              <Text style={s.continueBtnText}>
                {isLastStep ? "Let's go" : 'Continue'}
              </Text>
              <Ionicons name={isLastStep ? 'checkmark-circle' : 'arrow-forward'} size={20} color="#FFF" />
            </GradientButton>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

const si = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  stepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepDot: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(148,163,184,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { backgroundColor: '#E63950' },
  dotText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  dotTextActive: { color: '#FFF' },
  connector: {
    width: 36,
    height: 2,
    backgroundColor: 'rgba(148,163,184,0.15)',
    marginHorizontal: 6,
    borderRadius: 1,
  },
  connectorActive: { backgroundColor: '#E63950' },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(148,163,184,0.12)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 1.5, overflow: 'hidden' },
})

const cs = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  chipLabel: { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
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
  safe: { flex: 1, backgroundColor: '#0F172A' },
  container: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, paddingBottom: 16 },
  stepIconWrap: { marginBottom: 16 },
  stepIconGradient: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: '#F8FAFC', marginBottom: 8, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, color: 'rgba(203,213,225,0.9)', lineHeight: 22 },
  scrollWrap: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  chipColumn: { gap: 8 },
  groupBlock: { marginBottom: 16 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    gap: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 12 },
  backBtnPlaceholder: { width: 80 },
  backBtnText: { fontSize: 15, color: '#64748B', fontWeight: '600' },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'flex-end' },
  countBadge: {
    backgroundColor: 'rgba(230,57,80,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: '#E63950' },
  continueBtn: { minWidth: 140 },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
})
