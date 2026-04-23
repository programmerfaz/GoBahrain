import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  useWindowDimensions,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../context/AuthContext'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { yieldTwoFrames } from '../context/DoorTransitionContext'
import { useTheme } from '../context/ThemeContext'
import { gradients } from '../theme/designTokens'
import { FadeInView, GradientButton, AnimatedPressable } from '../components/AnimatedUI'
import { LUXURY, luxuryElevated, luxurySoftShadow } from '../theme/luxuryPremium'

const REMEMBER_ME_EMAIL_KEY = '@gobahrain_remember_email'
const REMEMBER_ME_PASSWORD_KEY = '@gobahrain_remember_password'

/** RN Web has no native animated driver; false avoids console noise and JS fallback. */
const useNativeAnimDriver = Platform.OS !== 'web'

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
              useNativeDriver: useNativeAnimDriver 
            }),
            Animated.timing(anim, { 
              toValue: 0, 
              duration, 
              easing: Easing.bezier(0.4, 0, 0.6, 1), 
              useNativeDriver: useNativeAnimDriver 
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(floatAnim, { 
              toValue: 1, 
              duration: duration * 1.3, 
              easing: Easing.inOut(Easing.sin), 
              useNativeDriver: useNativeAnimDriver 
            }),
            Animated.timing(floatAnim, { 
              toValue: 0, 
              duration: duration * 1.3, 
              easing: Easing.inOut(Easing.sin), 
              useNativeDriver: useNativeAnimDriver 
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

const MorphingInput = ({ value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, autoCorrect, editable, autoFocus, style, C, onEyePress, showEye }) => {
  const focusAnim = useRef(new Animated.Value(0)).current
  const shakeAnim = useRef(new Animated.Value(0)).current

  const handleFocus = () => {
    Animated.spring(focusAnim, {
      toValue: 1,
      damping: 15,
      stiffness: 150,
      useNativeDriver: false,
    }).start()
  }

  const handleBlur = () => {
    Animated.spring(focusAnim, {
      toValue: 0,
      damping: 15,
      stiffness: 150,
      useNativeDriver: false,
    }).start()
  }

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.border, C.primary],
  })

  const backgroundColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.inputBg, `${C.primary}05`],
  })

  const scale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  })

  return (
    <Animated.View
      style={[
        s.inputContainer,
        {
          borderColor,
          backgroundColor,
          transform: [{ scale }],
        },
        style,
      ]}
    >
      <TextInput
        style={[s.input, { color: C.text }, showEye && s.passwordInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.label}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        editable={editable}
        autoFocus={autoFocus}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {showEye && (
        <TouchableOpacity
          onPress={onEyePress}
          style={s.eyeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons 
            name={secureTextEntry ? 'eye-off-outline' : 'eye-outline'} 
            size={22} 
            color={C.label} 
          />
        </TouchableOpacity>
      )}
    </Animated.View>
  )
}

export default function AuthScreen() {
  const { colors, isDark } = useTheme()
  const { signIn, signUp, ensureProfileAfterSignUp } = useAuth()
  const { isOnboardingComplete } = useUserPreferences()
  const { width = 375, height = 812 } = useWindowDimensions()

  const contentOpacity = useRef(new Animated.Value(1)).current
  const contentTranslateY = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(1)).current

  const C = useMemo(() => (isDark ? {
    bg: '#0B1120',
    card: 'rgba(30,41,59,0.6)',
    cardBorder: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.2)',
    text: '#F8FAFC',
    textMuted: 'rgba(203,213,225,0.85)',
    label: '#94A3B8',
    primary: colors.primary,
    inputBg: 'rgba(30,41,59,0.8)',
  } : {
    bg: colors.background,
    card: 'rgba(255,255,255,0.8)',
    cardBorder: 'rgba(226,232,240,0.6)',
    border: colors.border,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    label: colors.textMuted,
    primary: colors.primary,
    inputBg: 'rgba(241,245,249,0.8)',
  }), [colors, isDark])

  const [mode, setMode] = useState('login')
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userName, setUserName] = useState('')
  const [phone, setPhone] = useState('')
  const [uType, setUType] = useState('local')
  const [loading, setLoading] = useState(false)
  const [rememberBootstrapLoading, setRememberBootstrapLoading] = useState(true)
  const [securePassword, setSecurePassword] = useState(true)
  const [signUpSuccessMessage, setSignUpSuccessMessage] = useState(null)
  const [rememberMe, setRememberMe] = useState(true)
  const accountType = 'user'

  useEffect(() => {
    let cancelled = false

    const bootstrapRememberedLogin = async () => {
      try {
        const [savedEmail, savedPassword] = await Promise.all([
          AsyncStorage.getItem(REMEMBER_ME_EMAIL_KEY),
          AsyncStorage.getItem(REMEMBER_ME_PASSWORD_KEY),
        ])
        if (cancelled) return

        const nextEmail = savedEmail?.trim() ?? ''
        const nextPassword = savedPassword ?? ''
        const hasRememberedCredentials = Boolean(nextEmail && nextPassword)

        if (!hasRememberedCredentials) {
          setRememberMe(false)
          setRememberBootstrapLoading(false)
          return
        }

        setEmail(nextEmail)
        setPassword(nextPassword)
        setRememberMe(true)
        setLoading(true)

        try {
          await signIn(nextEmail, nextPassword)
          await yieldTwoFrames()
        } catch (_e) {
          await Promise.all([
            AsyncStorage.removeItem(REMEMBER_ME_EMAIL_KEY),
            AsyncStorage.removeItem(REMEMBER_ME_PASSWORD_KEY),
          ])
          if (!cancelled) {
            setRememberMe(false)
          }
        } finally {
          if (!cancelled) {
            setLoading(false)
            setRememberBootstrapLoading(false)
          }
        }
      } catch (_e) {
        if (!cancelled) {
          setRememberMe(false)
          setRememberBootstrapLoading(false)
        }
      }
    }

    bootstrapRememberedLogin()

    return () => { cancelled = true }
  }, [signIn, yieldTwoFrames])

  const animateStep = (newStep) => {
    Animated.parallel([
      Animated.timing(contentOpacity, { 
        toValue: 0, 
        duration: 200, 
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: useNativeAnimDriver 
      }),
      Animated.timing(contentScale, { 
        toValue: 0.95, 
        duration: 200, 
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: useNativeAnimDriver 
      }),
      Animated.timing(contentTranslateY, { 
        toValue: 20, 
        duration: 200,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: useNativeAnimDriver 
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
          useNativeDriver: useNativeAnimDriver 
        }),
        Animated.spring(contentScale, { 
          toValue: 1, 
          damping: 18,
          stiffness: 140,
          useNativeDriver: useNativeAnimDriver 
        }),
        Animated.spring(contentTranslateY, { 
          toValue: 0, 
          damping: 20,
          stiffness: 120,
          useNativeDriver: useNativeAnimDriver 
        }),
      ]).start()
    })
  }

  const isSignUp = mode === 'signup'

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password.')
      return
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      await yieldTwoFrames()
      if (rememberMe) {
        await Promise.all([
          AsyncStorage.setItem(REMEMBER_ME_EMAIL_KEY, email.trim()),
          AsyncStorage.setItem(REMEMBER_ME_PASSWORD_KEY, password),
        ])
      } else {
        await Promise.all([
          AsyncStorage.removeItem(REMEMBER_ME_EMAIL_KEY),
          AsyncStorage.removeItem(REMEMBER_ME_PASSWORD_KEY),
        ])
      }
    } catch (e) {
      Alert.alert('Login failed', e?.message ?? 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    setLoading(true)
    setSignUpSuccessMessage(null)
    try {
      const { session: newSession } = await signUp(email.trim(), password, {
        accountType,
        userName: userName.trim(),
        phone: phone.trim() || null,
        uType,
      })
      if (newSession) {
        await ensureProfileAfterSignUp({
          accountType,
          userName: userName.trim(),
          phone: phone.trim() || null,
          uType,
          businessName: '',
          description: null,
          clientType: 'place',
        })
        if (isOnboardingComplete) {
          await yieldTwoFrames()
        }
      } else {
        setSignUpSuccessMessage('Check your email to confirm your account, then sign in.')
      }
    } catch (e) {
      const msg = e?.message ?? 'Could not create account.'
      if (/rate limit|rate_limit|too many requests/i.test(msg)) {
        Alert.alert(
          'Too many signup attempts',
          'Please wait a while and try again, or turn off "Confirm email" in Supabase (Auth → Providers → Email) for development.'
        )
      } else if (/database error saving new user/i.test(msg)) {
        Alert.alert(
          'Sign up failed',
          'A database trigger on new users is likely failing. In Supabase: run the SQL in supabase/fix-auth-trigger.sql to list or remove it, or check Logs → Postgres for the real error.'
        )
      } else if (/ensure_user_profile|ensure_client_profile|auth_user_id|get_my_profile|column.*does not exist|function.*does not exist/i.test(msg)) {
        Alert.alert(
          'Profile setup failed',
          msg + '\n\nMake sure you ran the full SQL in Supabase: Project → SQL Editor → run supabase/auth-setup.sql (all of it).'
        )
      } else {
        Alert.alert('Sign up failed', msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = () => {
    if (isSignUp) {
      if (step === 0) {
        if (!email.trim()) {
          Alert.alert('Required', 'Please enter your email.')
          return
        }
        if (!/\S+@\S+\.\S+/.test(email.trim())) {
          Alert.alert('Invalid Email', 'Please enter a valid email address.')
          return
        }
        animateStep(1)
      } else if (step === 1) {
        if (password.length < 6) {
          Alert.alert('Error', 'Password must be at least 6 characters.')
          return
        }
        animateStep(2)
      } else if (step === 2) {
        if (!userName.trim()) {
          Alert.alert('Required', 'Please enter your name.')
          return
        }
        animateStep(3)
      } else if (step === 3) {
        animateStep(4)
      } else if (step === 4) {
        handleSignUp()
      }
    } else {
      if (step === 0) {
        if (!email.trim()) {
          Alert.alert('Required', 'Please enter your email.')
          return
        }
        animateStep(1)
      } else if (step === 1) {
        handleLogin()
      }
    }
  }

  const handleBack = () => {
    if (step > 0) animateStep(step - 1)
  }

  const switchMode = () => {
    Animated.sequence([
      Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: useNativeAnimDriver }),
    ]).start(() => {
      setMode(mode === 'login' ? 'signup' : 'login')
      setStep(0)
      setSignUpSuccessMessage(null)
      Animated.spring(contentOpacity, { toValue: 1, damping: 15, useNativeDriver: useNativeAnimDriver }).start()
    })
  }

  const bgColors = isDark ? gradients.heroDark : gradients.heroLight

  if (rememberBootstrapLoading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: C.bg }]}>
        <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />
        <View style={s.bootstrapLoaderWrap}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const renderStepContent = () => {
    if (isSignUp) {
      if (step === 0) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>What's your email?</Text>
            <MorphingInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              autoFocus
              C={C}
            />
          </View>
        )
      } else if (step === 1) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>Create a password</Text>
            <MorphingInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter at least 6 characters"
              secureTextEntry={securePassword}
              editable={!loading}
              autoFocus
              C={C}
              showEye
              onEyePress={() => setSecurePassword((v) => !v)}
            />
          </View>
        )
      } else if (step === 2) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>What's your name?</Text>
            <MorphingInput
              value={userName}
              onChangeText={setUserName}
              placeholder="First name"
              editable={!loading}
              autoFocus
              C={C}
            />
          </View>
        )
      } else if (step === 3) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>Phone number</Text>
            <Text style={[s.optionalLabel, { color: C.textMuted }]}>Optional</Text>
            <MorphingInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+973 ..."
              keyboardType="phone-pad"
              editable={!loading}
              autoFocus
              C={C}
            />
          </View>
        )
      } else if (step === 4) {
        const personaOptions = [
          {
            id: 'local',
            label: 'Local',
            subtitle: 'I live in Bahrain — lean on neighborhood picks and timely events.',
            icon: 'home',
          },
          {
            id: 'tourist',
            label: 'Tourist',
            subtitle: 'I am visiting — prioritize highlights, routes, and easy discovery.',
            icon: 'airplane',
          },
        ]
        return (
          <View style={s.stepContent}>
            <View style={s.personaHeader}>
              <Text style={[s.question, { color: C.text, marginBottom: 10 }]}>Local or tourist?</Text>
              <Text style={[s.personaLead, { color: C.textMuted }]}>
                This shapes how we rank places, pacing, and tips in your feed and plans.
              </Text>
            </View>
            <View
              style={s.personaCardsColumn}
              accessibilityRole="radiogroup"
              accessibilityLabel="Are you a local or a tourist?"
            >
              {personaOptions.map((t) => {
                const sel = uType === t.id
                const borderColor = sel ? C.primary : C.border
                const baseBg = isDark ? 'rgba(30,41,59,0.55)' : C.inputBg
                return (
                  <AnimatedPressable
                    key={t.id}
                    onPress={() => setUType(t.id)}
                    scaleDown={0.98}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={`${t.label}. ${t.subtitle}`}
                  >
                    <View
                      style={[
                        s.personaCardOuter,
                        {
                          borderColor,
                          backgroundColor: baseBg,
                        },
                      ]}
                    >
                      {sel ? (
                        <LinearGradient
                          colors={[`${C.primary}26`, `${C.primary}10`, `${C.primary}00`]}
                          locations={[0, 0.38, 1]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : null}
                      <View style={s.personaCardInner}>
                        <View
                          style={[
                            s.personaIconRing,
                            {
                              backgroundColor: sel ? `${C.primary}20` : isDark ? 'rgba(15,23,42,0.65)' : 'rgba(255,255,255,0.9)',
                              borderColor: sel ? `${C.primary}55` : C.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={t.icon}
                            size={26}
                            color={sel ? C.primary : C.label}
                          />
                        </View>
                        <View style={s.personaTextCol}>
                          <Text style={[s.personaCardTitle, { color: C.text }]}>{t.label}</Text>
                          <Text style={[s.personaCardSubtitle, { color: C.textMuted }]}>{t.subtitle}</Text>
                        </View>
                        <View
                          style={[
                            s.personaRadio,
                            {
                              borderColor: sel ? C.primary : C.border,
                              backgroundColor: sel ? C.primary : 'transparent',
                            },
                          ]}
                        >
                          {sel ? (
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </AnimatedPressable>
                )
              })}
            </View>
          </View>
        )
      }
    } else {
      if (step === 0) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>What's your email?</Text>
            <MorphingInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              autoFocus
              C={C}
            />
          </View>
        )
      } else if (step === 1) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>Enter your password</Text>
            <MorphingInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry={securePassword}
              editable={!loading}
              autoFocus
              C={C}
              showEye
              onEyePress={() => setSecurePassword((v) => !v)}
            />
            <TouchableOpacity
              style={s.rememberRow}
              onPress={() => setRememberMe((r) => !r)}
              activeOpacity={0.8}
            >
              <View style={[s.checkbox, rememberMe && { backgroundColor: C.primary, borderColor: C.primary }]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color="#FFF" />}
              </View>
              <Text style={[s.rememberLabel, { color: C.textMuted }]}>Remember me</Text>
            </TouchableOpacity>
          </View>
        )
      }
    }
  }

  const getButtonText = () => {
    if (isSignUp) {
      const lastStep = 4
      return step === lastStep ? 'Create Account' : 'Continue'
    }
    return step === 1 ? 'Sign In' : 'Continue'
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.bg }]}>
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />

      <FloatingBubble size={180} color={`${C.primary}06`} startX={-50} startY={100} duration={7000} delay={0} />
      <FloatingBubble size={140} color={`${C.primary}08`} startX={width - 70} startY={150} duration={6000} delay={800} />
      <FloatingBubble size={100} color={isDark ? 'rgba(167,139,250,0.05)' : 'rgba(124,58,237,0.04)'} startX={width * 0.3} startY={500} duration={8000} delay={400} />
      <FloatingBubble size={120} color={`${C.primary}04`} startX={width * 0.7} startY={400} duration={9000} delay={1200} />

      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <View style={s.inner}>
          <View style={s.topBar}>
            {step > 0 ? (
              <AnimatedPressable
                style={s.backBtnTop}
                onPress={handleBack}
                scaleDown={0.95}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={22} color={C.text} />
                <Text style={[s.backBtnTopText, { color: C.textMuted }]}>Back</Text>
              </AnimatedPressable>
            ) : (
              <View style={s.topBarSpacer} />
            )}
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={[
              s.scrollContent,
              { paddingTop: Math.max(40, Math.round(height * 0.11)) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={s.centerColumn}>
              <Animated.View
                style={[
                  s.contentWrap,
                  {
                    opacity: contentOpacity,
                    transform: [
                      { translateY: contentTranslateY },
                      { scale: contentScale },
                    ],
                  },
                ]}
              >
                {renderStepContent()}
              </Animated.View>

              {signUpSuccessMessage ? (
                <FadeInView from={10}>
                  <View style={[s.successBanner, { backgroundColor: `${C.primary}15`, borderColor: C.primary }]}>
                    <View style={[s.successIconWrap, { backgroundColor: `${C.primary}20` }]}>
                      <Ionicons name="mail-outline" size={22} color={C.primary} />
                    </View>
                    <Text style={[s.successBannerText, { color: C.text }]}>{signUpSuccessMessage}</Text>
                  </View>
                </FadeInView>
              ) : null}
            </View>
          </ScrollView>

          <View style={s.footerWrap}>
            <View style={s.centerColumn}>
              <View style={s.footer}>
                <GradientButton
                  onPress={handleContinue}
                  disabled={loading}
                  style={s.continueBtn}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Text style={s.continueBtnText}>{getButtonText()}</Text>
                      <Ionicons name="arrow-forward" size={20} color="#FFF" />
                    </>
                  )}
                </GradientButton>

                <TouchableOpacity
                  style={s.switchModeBtn}
                  onPress={switchMode}
                  activeOpacity={0.7}
                >
                  <Text style={[s.switchModeText, { color: C.textMuted }]}>
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                  </Text>
                  <Text style={[s.switchModeLink, { color: C.primary }]}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  inner: { flex: 1 },
  centerColumn: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
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
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: 16,
  },
  footerWrap: {
    width: '100%',
    flexShrink: 0,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  bootstrapLoaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrap: {
    paddingHorizontal: 24,
    justifyContent: 'center',
    width: '100%',
  },
  stepContent: { 
    width: '100%',
    alignItems: 'center',
  },
  question: { 
    fontSize: 28, 
    fontWeight: '700', 
    marginBottom: 4,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  optionalLabel: {
    fontSize: 15,
    marginBottom: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  personaHeader: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  personaLead: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 360,
  },
  personaCardsColumn: {
    width: '100%',
    marginTop: 22,
    gap: 14,
    alignSelf: 'stretch',
  },
  personaCardOuter: {
    width: '100%',
    borderRadius: LUXURY.radiusCard,
    borderWidth: 2,
    overflow: 'hidden',
    ...luxuryElevated,
  },
  personaCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 14,
    zIndex: 1,
  },
  personaIconRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaTextCol: {
    flex: 1,
    minWidth: 0,
  },
  personaCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  personaCardSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  personaRadio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: LUXURY.radiusInput,
    paddingHorizontal: 18,
    minHeight: 58,
    marginTop: 8,
    ...luxurySoftShadow,
  },
  input: { 
    flex: 1, 
    fontSize: 17, 
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontWeight: '500',
  },
  passwordInput: { paddingRight: 40 },
  eyeBtn: { padding: 6 },
  textAreaContainer: { 
    alignItems: 'flex-start', 
    minHeight: 120,
  },
  optionsColumn: { 
    gap: 12,
    marginTop: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: LUXURY.radiusInput,
    borderWidth: 2,
    gap: 14,
    ...luxuryElevated,
  },
  optionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: LUXURY.radiusChip + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: { flex: 1 },
  optionLabel: { 
    fontSize: 18, 
    fontWeight: '700',
    marginBottom: 3,
  },
  optionSubtitle: { 
    fontSize: 14, 
    lineHeight: 19,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.4)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rememberLabel: { fontSize: 15, fontWeight: '500' },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
    width: '100%',
  },
  continueBtn: { 
    width: '100%',
  },
  continueBtnText: { 
    fontSize: 17, 
    fontWeight: '700', 
    color: '#FFF',
  },
  switchModeBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingVertical: 12,
  },
  switchModeText: { fontSize: 15 },
  switchModeLink: { fontSize: 15, fontWeight: '700' },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: LUXURY.radiusInput,
    borderWidth: 1,
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    alignSelf: 'center',
    width: '100%',
    maxWidth: '100%',
    ...luxuryElevated,
  },
  successIconWrap: {
    width: 40,
    height: 40,
    borderRadius: LUXURY.radiusChip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBannerText: { flex: 1, fontSize: 14, lineHeight: 20 },
})
