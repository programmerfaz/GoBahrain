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
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { gradients } from '../theme/designTokens'
import { FadeInView, AnimatedPressable, GradientButton } from '../components/AnimatedUI'
import { LUXURY, luxurySoftShadow } from '../theme/luxuryPremium'
import { buildAndPersistUserPersona, deriveActivityIdsFromInterestIds } from '../services/personalization'
import { useDoorTransition } from '../context/DoorTransitionContext'

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

const ONBOARDING_QUESTIONS = [
  {
    key: 'profile-age',
    type: 'age-slider',
    title: 'How old are you?',
    subtitle: 'We tune recommendations and pacing for your age range.',
    icon: 'calendar-outline',
    minSelected: 1,
  },
  {
    key: 'general-companion',
    type: 'general-group',
    groupKey: 'companion',
    title: "Who's coming with you?",
    subtitle: 'We tailor vibe and venue pick based on who you travel with.',
    icon: 'people-outline',
    minSelected: 1,
    selectionMode: 'single',
  },
  {
    key: 'general-interests',
    type: 'general-group',
    groupKey: 'interests',
    title: 'Which experiences light you up?',
    subtitle: 'Pick 3–5. This helps us understand your travel personality.',
    icon: 'sparkles-outline',
    minSelected: 3,
    maxSelected: 5,
    selectionMode: 'multi',
    optionIds: [
      'foodie',
      'adventure',
      'instagram-spots',
      'local-authentic',
      'family-friendly',
      'quiet-peaceful',
      'social-lively',
    ],
  },
  {
    key: 'general-pace',
    type: 'general-group',
    groupKey: 'pace',
    title: 'How do you like your day to feel?',
    subtitle: 'We tune itinerary intensity around your pace.',
    icon: 'speedometer-outline',
    minSelected: 1,
    selectionMode: 'single',
  },
  {
    key: 'general-budget',
    type: 'general-group',
    groupKey: 'budget',
    title: "What's your spending comfort?",
    subtitle: 'So we match venues to how you like to spend.',
    icon: 'wallet-outline',
    minSelected: 1,
    selectionMode: 'single',
  },
  {
    key: 'general-planning',
    type: 'general-group',
    groupKey: 'planning',
    title: 'How do you like plans to be organized?',
    subtitle: 'This helps us decide between flexible and structured flow.',
    icon: 'list-outline',
    minSelected: 1,
    selectionMode: 'single',
  },
]

const AGE_MIN = 13
const AGE_MAX = 80
const AGE_WHEEL_ITEM_HEIGHT = 44
const AGE_OPTIONS = Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, idx) => AGE_MIN + idx)

const ChipItem = ({ item, selected, onPress, isDark, isGrid }) => {
  const popAnim = useRef(new Animated.Value(1)).current
  const tint = item.color
  const iconBgUnselected = isDark ? 'rgba(148,163,184,0.14)' : 'rgba(100,116,139,0.08)'
  const iconBgSelected = isDark ? `${tint}2E` : `${tint}1F`
  const borderUnselected = isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.28)'
  const surfaceUnselected = isDark ? 'rgba(15,23,42,0.58)' : 'rgba(255,255,255,0.96)'
  const surfaceSelected = isDark ? `${tint}1A` : `${tint}12`
  const labelBase = isDark ? '#E2E8F0' : '#0F172A'
  const iconColorUnselected = isDark ? '#CBD5E1' : '#475569'
  const checkBorderUnselected = isDark ? 'rgba(148,163,184,0.38)' : 'rgba(100,116,139,0.32)'

  useEffect(() => {
    if (selected) {
      Animated.sequence([
        Animated.spring(popAnim, {
          toValue: 1.05,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(popAnim, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [selected])

  // Compact sizing for grid mode
  const iconSize = isGrid ? 44 : 40
  const fontSize = isGrid ? 13.5 : 15.5
  const paddingH = isGrid ? 8 : 14
  const minHeight = isGrid ? 96 : 62
  const internalGap = isGrid ? 8 : 12

  return (
    <AnimatedPressable
      style={[
        cs.chip,
        {
          borderColor: selected ? tint : borderUnselected,
          backgroundColor: selected ? surfaceSelected : surfaceUnselected,
          minHeight,
          paddingHorizontal: paddingH,
          width: '100%',
          flexDirection: isGrid ? 'column' : 'row',
          justifyContent: 'center',
          alignItems: 'center', // Ensure horizontal centering in column mode
          gap: internalGap,
          transform: [{ scale: popAnim }],
          ...(selected
            ? Platform.select({
                ios: {
                  shadowColor: tint,
                  shadowOpacity: isDark ? 0.28 : 0.18,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                },
                android: { elevation: 3 },
              })
            : null),
        },
      ]}
      onPress={onPress}
      scaleDown={0.96}
    >
      <View 
        style={[
          cs.chipIconWrap, 
          { 
            width: iconSize, 
            height: iconSize, 
            backgroundColor: selected ? iconBgSelected : iconBgUnselected,
            borderRadius: isGrid ? 14 : 12,
            borderWidth: isGrid ? 1 : 0,
            borderColor: selected ? `${tint}44` : borderUnselected,
          }
        ]}
      >
        <Ionicons 
          name={item.icon} 
          size={isGrid ? 22 : 18} 
          color={selected ? tint : iconColorUnselected} 
        />
      </View>
      <Text
        style={[
          cs.chipLabel,
          { 
            color: selected ? tint : labelBase, 
            fontSize, 
            textAlign: isGrid ? 'center' : 'left',
            marginTop: isGrid ? 2 : 0,
            flex: isGrid ? 0 : 1, // Don't flex in grid mode to allow vertical centering
          },
          selected && cs.chipLabelSelected,
        ]}
        numberOfLines={2}
      >
        {item.label}
      </Text>
      {!isGrid && (
        <View
          style={[
            cs.chipCheck,
            {
              borderColor: selected ? tint : checkBorderUnselected,
              backgroundColor: selected ? tint : 'transparent',
            },
          ]}
        >
          {selected ? <Ionicons name="checkmark" size={12} color="#FFF" /> : null}
        </View>
      )}
    </AnimatedPressable>
  )
}

const CHAMPAGNE = '#C9A87C'
const CHAMPAGNE_MUTED = 'rgba(201, 168, 124, 0.45)'

const OnboardingFinishOverlay = ({
  phase,
  isDark,
  primary,
  textColor,
  textMuted,
  width,
  craftingError,
  onRetry,
}) => {
  const ringOuter = useRef(new Animated.Value(0)).current
  const ringInner = useRef(new Animated.Value(0)).current
  const corePulse = useRef(new Animated.Value(0)).current
  const orbit = useRef(new Animated.Value(0)).current
  const shimmer = useRef(new Animated.Value(0)).current
  const craftingGroup = useRef(new Animated.Value(1)).current
  const completeGroup = useRef(new Animated.Value(0)).current
  const sealScale = useRef(new Animated.Value(0.4)).current
  const line1 = useRef(new Animated.Value(0)).current
  const line2 = useRef(new Animated.Value(0)).current
  const line3 = useRef(new Animated.Value(0)).current
  const glowSweep = useRef(new Animated.Value(0)).current
  const mountFade = useRef(new Animated.Value(0)).current
  const craftHeroY = useRef(new Animated.Value(0)).current
  const craftHeroScale = useRef(new Animated.Value(1)).current
  const craftCopyY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const spinOut = Animated.loop(
      Animated.timing(ringOuter, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
    const spinIn = Animated.loop(
      Animated.timing(ringInner, {
        toValue: 1,
        duration: 9500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(corePulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(corePulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    )
    const orbitLoop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 10000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    )
    const sweep = Animated.loop(
      Animated.timing(glowSweep, {
        toValue: 1,
        duration: 3200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    )
    spinOut.start()
    spinIn.start()
    pulse.start()
    orbitLoop.start()
    shimmerLoop.start()
    sweep.start()
    Animated.timing(mountFade, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
    return () => {
      spinOut.stop()
      spinIn.stop()
      pulse.stop()
      orbitLoop.stop()
      shimmerLoop.stop()
      sweep.stop()
    }
  }, [ringOuter, ringInner, corePulse, orbit, shimmer, glowSweep, mountFade])

  useEffect(() => {
    if (phase !== 'complete') return undefined
    line1.setValue(0)
    line2.setValue(0)
    line3.setValue(0)
    Animated.parallel([
      Animated.timing(craftingGroup, {
        toValue: 0,
        duration: 420,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(completeGroup, {
        toValue: 1,
        duration: 520,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sealScale, {
        toValue: 1,
        damping: 14,
        stiffness: 220,
        mass: 0.62,
        useNativeDriver: true,
      }),
      Animated.stagger(125, [
        Animated.spring(line1, {
          toValue: 1,
          damping: 16,
          stiffness: 230,
          overshootClamping: true,
          useNativeDriver: true,
        }),
        Animated.spring(line2, {
          toValue: 1,
          damping: 16,
          stiffness: 230,
          overshootClamping: true,
          useNativeDriver: true,
        }),
        Animated.spring(line3, {
          toValue: 1,
          damping: 16,
          stiffness: 230,
          overshootClamping: true,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
    return undefined
  }, [
    phase,
    craftingGroup,
    completeGroup,
    sealScale,
    line1,
    line2,
    line3,
  ])

  useEffect(() => {
    if (phase === 'crafting') {
      craftingGroup.setValue(1)
      completeGroup.setValue(0)
      sealScale.setValue(0.4)
    }
  }, [phase, craftingGroup, completeGroup, sealScale])

  useEffect(() => {
    if (phase !== 'crafting') return undefined
    craftHeroY.setValue(56)
    craftHeroScale.setValue(0.88)
    craftCopyY.setValue(36)
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      Animated.stagger(110, [
        Animated.parallel([
          Animated.spring(craftHeroY, {
            toValue: 0,
            damping: 19,
            stiffness: 330,
            mass: 0.72,
            useNativeDriver: true,
          }),
          Animated.spring(craftHeroScale, {
            toValue: 1,
            damping: 15,
            stiffness: 260,
            mass: 0.78,
            useNativeDriver: true,
          }),
        ]),
        Animated.spring(craftCopyY, {
          toValue: 0,
          damping: 19,
          stiffness: 320,
          mass: 0.7,
          useNativeDriver: true,
        }),
      ]).start()
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [phase, craftHeroY, craftHeroScale, craftCopyY])

  const rotOut = ringOuter.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const rotIn = ringInner.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] })
  const orbitRot = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const coreScale = corePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
  const coreGlow = corePulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })
  const subtitleShimmer = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] })
  const sweepOpacity = glowSweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.85, 0.2] })
  const line1y = line1.interpolate({ inputRange: [0, 1], outputRange: [22, 0] })
  const line2y = line2.interpolate({ inputRange: [0, 1], outputRange: [18, 0] })
  const line3y = line3.interpolate({ inputRange: [0, 1], outputRange: [14, 0] })

  const heroSize = Math.min(width * 0.72, 280)
  const orbitSize = heroSize + 64
  const blurTint = isDark ? 'dark' : 'light'

  return (
    <Animated.View style={[finishStyles.overlayRoot, { opacity: mountFade }]} pointerEvents="box-none">
      <BlurView intensity={isDark ? 42 : 58} tint={blurTint} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={
          isDark
            ? ['rgba(11,17,32,0.88)', 'rgba(15,23,42,0.72)', 'rgba(11,17,32,0.92)']
            : ['rgba(248,250,252,0.92)', 'rgba(255,255,255,0.78)', 'rgba(248,250,252,0.94)']
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={finishStyles.heroWrap}>
        <Animated.View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            opacity: craftingGroup,
            transform: [{ translateY: craftHeroY }, { scale: craftHeroScale }],
          }}
        >
          <Animated.View
            style={[
              finishStyles.ringOuter,
              {
                width: heroSize + 56,
                height: heroSize + 56,
                borderColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.2)',
                transform: [{ rotate: rotOut }],
              },
            ]}
          />
          <Animated.View
            style={[
              finishStyles.ringInner,
              {
                width: heroSize + 28,
                height: heroSize + 28,
                borderColor: CHAMPAGNE_MUTED,
                transform: [{ rotate: rotIn }],
              },
            ]}
          />

          <Animated.View
            style={[
              finishStyles.orbitDots,
              { width: orbitSize, height: orbitSize, transform: [{ rotate: orbitRot }] },
            ]}
            pointerEvents="none"
          >
            {[0, 120, 240].map((deg, i) => {
              const dotColor = i === 1 ? primary : i === 0 ? CHAMPAGNE : CHAMPAGNE_MUTED
              return (
                <View
                  key={`spoke-${deg}`}
                  style={{
                    position: 'absolute',
                    width: orbitSize,
                    height: orbitSize,
                    transform: [{ rotate: `${deg}deg` }],
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      marginTop: 2,
                      backgroundColor: dotColor,
                      opacity: i === 1 ? 1 : 0.88,
                    }}
                  />
                </View>
              )
            })}
          </Animated.View>

          <Animated.View style={finishStyles.craftingCoreWrap}>
            <Animated.View style={{ transform: [{ scale: coreScale }], opacity: coreGlow }}>
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(30,41,59,0.95)', `${primary}44`, 'rgba(15,23,42,0.98)']
                    : ['#FFFFFF', `${primary}22`, '#F8FAFC']
                }
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.95, y: 1 }}
                style={[
                  finishStyles.coreOrb,
                  {
                    width: heroSize,
                    height: heroSize,
                    borderRadius: heroSize / 2,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: isDark ? 'rgba(201,168,124,0.35)' : 'rgba(201,168,124,0.5)',
                  },
                ]}
              >
                <Animated.View
                  style={[
                    finishStyles.coreInnerGlow,
                    {
                      opacity: sweepOpacity,
                      backgroundColor: isDark ? `${CHAMPAGNE}28` : `${CHAMPAGNE}18`,
                    },
                  ]}
                />
                <Ionicons name="sparkles" size={44} color={CHAMPAGNE} style={{ marginBottom: 6 }} />
                <View style={finishStyles.loaderTrack}>
                  <Animated.View
                    style={[
                      finishStyles.loaderBar,
                      {
                        backgroundColor: primary,
                        opacity: subtitleShimmer,
                        width: '72%',
                      },
                    ]}
                  />
                </View>
              </LinearGradient>
            </Animated.View>
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={[
            finishStyles.completeSealWrap,
            {
              opacity: completeGroup,
              transform: [{ scale: sealScale }],
            },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[CHAMPAGNE, `${primary}CC`, '#1E293B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              finishStyles.sealCircle,
              {
                width: heroSize * 0.52,
                height: heroSize * 0.52,
                borderRadius: (heroSize * 0.52) / 2,
              },
            ]}
          >
            <View style={finishStyles.sealInner}>
              <Ionicons name="checkmark" size={Math.round(heroSize * 0.22)} color="#FFF" />
            </View>
          </LinearGradient>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          finishStyles.copyBlock,
          {
            opacity: craftingGroup,
            transform: [{ translateY: craftCopyY }],
          },
        ]}
      >
        <View
          style={[
            finishStyles.iosWelcomePill,
            {
              backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
              borderColor: isDark ? 'rgba(148,163,184,0.28)' : 'rgba(100,116,139,0.2)',
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[finishStyles.iosWelcomePillText, { color: textMuted }]}>Welcome</Text>
        </View>
        <Text style={[finishStyles.headline, { color: textColor }]} accessibilityRole="header">
          Crafting your personalized experience
        </Text>
        <Animated.Text style={[finishStyles.subline, { color: textMuted, opacity: subtitleShimmer }]}>
          Curating venues, flavors, and moments tailored to you
        </Animated.Text>
        {craftingError ? (
          <View style={finishStyles.errorBox}>
            <Text style={[finishStyles.errorText, { color: textMuted }]}>{craftingError}</Text>
            <TouchableOpacity
              onPress={onRetry}
              style={[finishStyles.retryBtn, { borderColor: primary }]}
              accessibilityRole="button"
              accessibilityLabel="Retry saving your preferences"
            >
              <Text style={[finishStyles.retryBtnText, { color: primary }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Animated.View>

      <Animated.View
        style={[
          finishStyles.copyBlockComplete,
          {
            opacity: completeGroup,
          },
        ]}
        pointerEvents="none"
      >
        <Animated.Text
          style={[
            finishStyles.headlineComplete,
            { color: textColor, opacity: line1, transform: [{ translateY: line1y }] },
          ]}
        >
          Your app is ready
        </Animated.Text>
        <Animated.Text
          style={[
            finishStyles.tagline,
            { color: CHAMPAGNE, opacity: line2, transform: [{ translateY: line2y }] },
          ]}
        >
          Experience Bahrain
        </Animated.Text>
        <Animated.Text
          style={[
            finishStyles.sublineComplete,
            { color: textMuted, opacity: line3, transform: [{ translateY: line3y }] },
          ]}
        >
          Discover places, plans, and community — all tuned to your taste.
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  )
}

const finishStyles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  ringOuter: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
  },
  ringInner: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1.5,
    borderStyle: 'solid',
  },
  orbitDots: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  craftingCoreWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreOrb: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...luxurySoftShadow,
  },
  coreInnerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
  },
  loaderTrack: {
    width: '62%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
    marginTop: 4,
  },
  loaderBar: {
    height: '100%',
    borderRadius: 2,
  },
  completeSealWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    ...luxurySoftShadow,
  },
  sealInner: {
    width: '86%',
    height: '86%',
    borderRadius: 9999,
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBlock: {
    alignItems: 'center',
    maxWidth: 340,
    gap: 10,
  },
  iosWelcomePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  iosWelcomePillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  copyBlockComplete: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? '22%' : '18%',
    left: 28,
    right: 28,
    alignItems: 'center',
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  headlineComplete: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 12,
  },
  subline: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: -0.15,
  },
  sublineComplete: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: -0.1,
    maxWidth: 320,
  },
  errorBox: {
    marginTop: 16,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderWidth: 2,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
})

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme()
  const { GENERAL_PREFERENCES, FOOD_CATEGORIES, completeOnboarding, setPreferences } = useUserPreferences()
  const { profile } = useAuth()
  const { startFadeGateUntilHomeReady } = useDoorTransition()
  const { width = 375 } = useWindowDimensions()
  const [generalIds, setGeneralIds] = useState([])
  const [foodIds, setFoodIds] = useState([])
  const [age, setAge] = useState(28)
  const [step, setStep] = useState(0)
  const [finishPhase, setFinishPhase] = useState(null)
  const [craftingError, setCraftingError] = useState(null)
  const ageWheelRef = useRef(null)
  const rootFade = useRef(new Animated.Value(1)).current
  const rootLift = useRef(new Animated.Value(0)).current

  const C = isDark ? {
    bg: '#0B1120',
    text: '#F8FAFC',
    textMuted: 'rgba(203,213,225,0.85)',
    label: '#94A3B8',
    primary: colors.primary,
    panel: 'rgba(15,23,42,0.62)',
    panelBorder: 'rgba(148,163,184,0.22)',
    surface: 'rgba(15,23,42,0.72)',
  } : {
    bg: colors.background,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    label: colors.textMuted,
    primary: colors.primary,
    panel: 'rgba(255,255,255,0.82)',
    panelBorder: 'rgba(148,163,184,0.24)',
    surface: 'rgba(255,255,255,0.86)',
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

  const questionFlow = ONBOARDING_QUESTIONS

  const toggleSelection = (listSetter, listValue, id, mode, maxSelected) => {
    if (mode === 'single') {
      listSetter([id])
      return
    }
    const isSelected = listValue.includes(id)
    if (isSelected) {
      listSetter(listValue.filter((x) => x !== id))
      return
    }
    if (typeof maxSelected === 'number' && listValue.length >= maxSelected) return
    listSetter([...listValue, id])
  }

  const toggleGeneral = (id, groupKey, mode, maxSelected) => {
    const inGroup = GENERAL_PREFERENCES.filter((p) => p.group === groupKey).map((p) => p.id)
    const otherGroupIds = generalIds.filter((x) => !inGroup.includes(x))
    const currentGroupIds = generalIds.filter((x) => inGroup.includes(x))
    const groupSetter = (nextIds) => setGeneralIds([...otherGroupIds, ...nextIds])
    toggleSelection(groupSetter, currentGroupIds, id, mode, maxSelected)
  }
  const toggleFood = (id, mode, maxSelected) => toggleSelection(setFoodIds, foodIds, id, mode, maxSelected)

  const persistPersona = useCallback(async () => {
    const activityIds = deriveActivityIdsFromInterestIds(generalIds)
    const viewerUType =
      String(profile?.user?.u_type || '').toLowerCase() === 'tourist' ? 'tourist' : 'local'
    const profileSummary = await buildAndPersistUserPersona({
      generalIds,
      activityIds,
      foodIds,
      profileAnswers: { age },
      viewerUType,
    })
    await setPreferences({
      generalIds,
      activityIds,
      foodIds,
      profileAnswers: { age },
      profileSummary,
    })
  }, [generalIds, foodIds, age, setPreferences, profile?.user?.u_type])

  const runFinishWork = useCallback(async () => {
    setCraftingError(null)
    const minDelay = new Promise((resolve) => {
      setTimeout(resolve, 2800)
    })
    try {
      await Promise.all([persistPersona(), minDelay])
      setFinishPhase('complete')
    } catch (e) {
      console.warn('[Onboarding] complete failed', e?.message)
      setCraftingError(
        typeof e?.message === 'string' && e.message.length > 0
          ? e.message
          : 'We could not finish setup. Try again.'
      )
    }
  }, [persistPersona])

  useEffect(() => {
    if (finishPhase !== 'complete') return undefined
    let cancelled = false
    const runExit = async () => {
      await new Promise((r) => setTimeout(r, 2200))
      if (cancelled) return
      rootFade.setValue(1)
      rootLift.setValue(0)
      const gateIn = startFadeGateUntilHomeReady()
      const crossfadeOut = new Promise((resolve) => {
        Animated.parallel([
          Animated.timing(rootFade, {
            toValue: 0,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(rootLift, {
            toValue: 18,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => resolve())
      })
      await Promise.all([gateIn, crossfadeOut])
      if (cancelled) return
      try {
        await completeOnboarding()
      } catch (_) {}
    }
    runExit()
    return () => {
      cancelled = true
    }
  }, [finishPhase, completeOnboarding, startFadeGateUntilHomeReady, rootFade, rootLift])

  const handleContinue = () => {
    if (step < questionFlow.length - 1) {
      animateStep(step + 1)
      return
    }
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: 0.96,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 16,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFinishPhase('crafting')
      runFinishWork()
    })
  }

  const handleBack = () => {
    if (finishPhase) return
    if (step > 0) animateStep(step - 1)
  }

  const currentStep = questionFlow[step]
  const isLastStep = step === questionFlow.length - 1

  const selectedCount = currentStep?.type === 'general-group'
    ? generalIds.filter((id) => GENERAL_PREFERENCES.some((p) => p.group === currentStep.groupKey && p.id === id)).length
    : currentStep?.type === 'age-slider'
      ? 1
    : currentStep?.type === 'food'
      ? foodIds.length
      : 0

  const minSelected = currentStep?.minSelected ?? 1
  const canContinue = selectedCount >= minSelected

  const getProgressPercent = () => {
    if (finishPhase) return 100
    return ((step + 1) / questionFlow.length) * 100
  }

  const bgColors = isDark ? gradients.heroDark : gradients.heroLight
  const optionsForCurrentStep = useMemo(() => {
    if (currentStep?.type === 'general-group') {
      const grouped = GENERAL_PREFERENCES.filter((p) => p.group === currentStep.groupKey)
      if (Array.isArray(currentStep.optionIds) && currentStep.optionIds.length > 0) {
        return grouped.filter((p) => currentStep.optionIds.includes(p.id))
      }
      return grouped
    }
    if (currentStep?.type === 'food') return FOOD_CATEGORIES
    return []
  }, [currentStep, GENERAL_PREFERENCES, FOOD_CATEGORIES])

  useEffect(() => {
    if (currentStep?.type !== 'age-slider') return
    const index = Math.max(0, AGE_OPTIONS.indexOf(age))
    requestAnimationFrame(() => {
      ageWheelRef.current?.scrollTo({ y: index * AGE_WHEEL_ITEM_HEIGHT, animated: false })
    })
  }, [currentStep?.type])

  return (
    <Animated.View
      style={[
        s.safe,
        {
          opacity: rootFade,
          transform: [{ translateY: rootLift }],
        },
      ]}
    >
    <SafeAreaView style={[s.safe, { backgroundColor: C.bg }]}>
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />

      <FloatingBubble size={180} color={`${C.primary}06`} startX={-50} startY={100} duration={7000} delay={0} />
      <FloatingBubble size={140} color={`${C.primary}08`} startX={width - 70} startY={150} duration={6000} delay={800} />
      <FloatingBubble size={100} color={isDark ? 'rgba(167,139,250,0.05)' : 'rgba(124,58,237,0.04)'} startX={width * 0.3} startY={500} duration={8000} delay={400} />
      <FloatingBubble size={120} color={`${C.primary}04`} startX={width * 0.7} startY={420} duration={9000} delay={1200} />

      <View style={s.container}>
        <View style={s.topBar}>
          {step > 0 && !finishPhase ? (
            <AnimatedPressable style={s.backBtnTop} onPress={handleBack} scaleDown={0.95}>
              <Ionicons name="arrow-back" size={20} color={C.text} />
              <Text style={[s.backBtnTopText, { color: C.textMuted }]}>Back</Text>
            </AnimatedPressable>
          ) : (
            <View style={s.topBarSpacer} />
          )}
        </View>

        {!finishPhase ? (
          <View style={s.progressBarWrap}>
            <View style={[s.progressTrack, { backgroundColor: `${C.primary}12` }]}>
              <Animated.View style={[s.progressFill, { backgroundColor: C.primary, width: `${getProgressPercent()}%` }]} />
            </View>
          </View>
        ) : null}

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
          pointerEvents={finishPhase ? 'none' : 'auto'}
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

          <View style={[s.questionPanel, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
            {currentStep?.type === 'age-slider' ? (
              <View style={[s.ageSliderWrap, { backgroundColor: C.surface, borderColor: C.panelBorder }]}>
                <View style={[s.ageValuePill, { backgroundColor: `${C.primary}18` }]}>
                  <Text style={[s.ageValueText, { color: C.primary }]}>{age} years old</Text>
                </View>
                <View style={s.ageWheelShell}>
                  <ScrollView
                    ref={ageWheelRef}
                    style={s.ageWheel}
                    contentContainerStyle={s.ageWheelContent}
                    showsVerticalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={AGE_WHEEL_ITEM_HEIGHT}
                    snapToAlignment="start"
                    onMomentumScrollEnd={(event) => {
                      const offsetY = event.nativeEvent.contentOffset.y
                      const index = Math.round(offsetY / AGE_WHEEL_ITEM_HEIGHT)
                      const clamped = Math.max(0, Math.min(AGE_OPTIONS.length - 1, index))
                      setAge(AGE_OPTIONS[clamped])
                    }}
                    onScrollEndDrag={(event) => {
                      const offsetY = event.nativeEvent.contentOffset.y
                      const index = Math.round(offsetY / AGE_WHEEL_ITEM_HEIGHT)
                      const clamped = Math.max(0, Math.min(AGE_OPTIONS.length - 1, index))
                      setAge(AGE_OPTIONS[clamped])
                    }}
                    accessibilityLabel="Age wheel picker"
                  >
                    {AGE_OPTIONS.map((value) => {
                      const selected = value === age
                      return (
                        <TouchableOpacity
                          key={`age-${value}`}
                          style={s.ageWheelItem}
                          onPress={() => {
                            const idx = value - AGE_MIN
                            setAge(value)
                            ageWheelRef.current?.scrollTo({ y: idx * AGE_WHEEL_ITEM_HEIGHT, animated: true })
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.ageWheelItemText, { color: selected ? C.primary : C.textMuted }, selected && s.ageWheelItemTextSelected]}>
                            {value}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                  <View style={[s.ageWheelFocusRow, { borderColor: `${C.primary}45`, backgroundColor: `${C.primary}10` }]} pointerEvents="none" />
                </View>
                <View style={s.ageRangeRow}>
                  <Text style={[s.ageRangeText, { color: C.textMuted }]}>{AGE_MIN}</Text>
                  <Text style={[s.ageRangeText, { color: C.textMuted }]}>{AGE_MAX}</Text>
                </View>
              </View>
            ) : (
              <View style={s.chipList}>
                {optionsForCurrentStep.map((p, idx) => {
                  const isGrid = optionsForCurrentStep.length > 6
                  return (
                    <FadeInView
                      key={`${currentStep.key}-${p.id}`}
                      delay={idx * 15}
                      from={6}
                      duration={250}
                      springUp
                      style={isGrid ? { width: '31%' } : { width: '100%' }}
                    >
                      <ChipItem
                        item={p}
                        isGrid={isGrid}
                        selected={
                          currentStep?.type === 'general-group'
                            ? generalIds.includes(p.id)
                            : foodIds.includes(p.id)
                        }
                        onPress={() =>
                          currentStep?.type === 'general-group'
                            ? toggleGeneral(p.id, currentStep.groupKey, currentStep.selectionMode, currentStep.maxSelected)
                            : toggleFood(p.id, currentStep.selectionMode, currentStep.maxSelected)
                        }
                        isDark={isDark}
                      />
                    </FadeInView>
                  )
                })}
              </View>
            )}
          </View>
        </Animated.View>

        {!finishPhase ? (
        <Animated.View style={[s.footer, { transform: [{ translateY: ctaLift }] }]}>
          <View style={s.footerTop}>
            {selectedCount > 0 && currentStep?.type !== 'age-slider' && (
              <Animated.View 
                style={[s.countBadge, { backgroundColor: `${C.primary}15` }]}
              >
                <Text style={[s.countBadgeText, { color: C.primary }]}>{selectedCount} selected</Text>
              </Animated.View>
            )}
          </View>

          <GradientButton
            onPress={handleContinue}
            style={[s.continueBtn, !canContinue && { opacity: 0.55 }]}
            gradientColors={['#0F172A', '#1E293B']}
            disabled={!canContinue}
          >
            <Text style={s.continueBtnText}>
              {isLastStep ? "Let's go" : 'Continue'}
            </Text>
            <Ionicons name={isLastStep ? 'checkmark-circle' : 'arrow-forward'} size={20} color="#FFF" />
          </GradientButton>
        </Animated.View>
        ) : null}

        {finishPhase ? (
          <OnboardingFinishOverlay
            phase={finishPhase}
            isDark={isDark}
            primary={C.primary}
            textColor={C.text}
            textMuted={C.textMuted}
            width={width}
            craftingError={craftingError}
            onRetry={runFinishWork}
          />
        ) : null}
      </View>
    </SafeAreaView>
    </Animated.View>
  )
}

const cs = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  chipIconWrap: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    flex: 1,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  chipLabelSelected: {
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  chipCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
})

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  topBar: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 4 : 8,
    justifyContent: 'center',
  },
  topBarSpacer: { minHeight: 44 },
  backBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  backBtnTopText: { fontSize: 16, fontWeight: '600' },
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
    marginBottom: 18,
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
    paddingTop: 8,
    paddingBottom: 8,
  },
  stepHeader: {
    marginBottom: 12,
    alignItems: 'center',
    width: '100%',
  },
  stepMeta: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
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
    fontSize: 28, 
    fontWeight: '700', 
    lineHeight: 34,
    marginBottom: 6,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: { 
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    letterSpacing: -0.1,
    textAlign: 'center',
    maxWidth: 340,
  },
  questionPanel: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  scroll: { flex: 1, width: '100%' },
  scrollContent: { 
    paddingBottom: 16,
    paddingTop: 12,
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
  chipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
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
  ageSliderWrap: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  ageValuePill: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  ageValueText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ageWheelShell: {
    width: '100%',
    height: AGE_WHEEL_ITEM_HEIGHT * 5,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  ageWheel: {
    flex: 1,
  },
  ageWheelContent: {
    paddingVertical: AGE_WHEEL_ITEM_HEIGHT * 2,
  },
  ageWheelItem: {
    height: AGE_WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageWheelItemText: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  ageWheelItemTextSelected: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  ageWheelFocusRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: AGE_WHEEL_ITEM_HEIGHT * 2,
    height: AGE_WHEEL_ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  ageRangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  ageRangeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    paddingTop: 10,
    gap: 12,
  },
  footerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 24,
  },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
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
