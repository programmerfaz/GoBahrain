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

const CLIENT_TYPES = [
  { id: 'place', label: 'Place', icon: 'location-outline' },
  { id: 'restaurant', label: 'Restaurant', icon: 'restaurant-outline' },
  { id: 'cafe', label: 'Cafe', icon: 'cafe-outline' },
]

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
  const { width = 375 } = useWindowDimensions()

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
  const [accountType, setAccountType] = useState('user')
  const [uType, setUType] = useState('local')
  const [businessName, setBusinessName] = useState('')
  const [description, setDescription] = useState('')
  const [clientType, setClientType] = useState('place')
  const [loading, setLoading] = useState(false)
  const [rememberBootstrapLoading, setRememberBootstrapLoading] = useState(true)
  const [securePassword, setSecurePassword] = useState(true)
  const [signUpSuccessMessage, setSignUpSuccessMessage] = useState(null)
  const [rememberMe, setRememberMe] = useState(true)

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
        uType: accountType === 'user' ? uType : undefined,
        businessName: accountType === 'client' ? businessName.trim() : undefined,
        description: accountType === 'client' ? description.trim() || null : undefined,
        clientType: accountType === 'client' ? clientType : undefined,
      })
      if (newSession) {
        await ensureProfileAfterSignUp({
          accountType,
          userName: userName.trim(),
          phone: phone.trim() || null,
          uType: accountType === 'user' ? uType : 'local',
          businessName: accountType === 'client' ? businessName.trim() : '',
          description: accountType === 'client' ? description.trim() || null : null,
          clientType: accountType === 'client' ? clientType : 'place',
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
        if (accountType === 'user') {
          handleSignUp()
        } else {
          animateStep(5)
        }
      } else if (step === 5) {
        if (!businessName.trim()) {
          Alert.alert('Required', 'Please enter business name.')
          return
        }
        animateStep(6)
      } else if (step === 6) {
        animateStep(7)
      } else if (step === 7) {
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
      Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setMode(mode === 'login' ? 'signup' : 'login')
      setStep(0)
      setSignUpSuccessMessage(null)
      Animated.spring(contentOpacity, { toValue: 1, damping: 15, useNativeDriver: true }).start()
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
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>What type of account?</Text>
            <View style={s.optionsColumn}>
              {[
                { id: 'user', label: 'User', subtitle: 'Explore and discover Bahrain', icon: 'person-outline' },
                { id: 'client', label: 'Business', subtitle: 'Promote your business', icon: 'business-outline' },
              ].map((t) => {
                const sel = accountType === t.id
                return (
                  <AnimatedPressable
                    key={t.id}
                    style={[s.optionCard, { 
                      borderColor: sel ? C.primary : C.border, 
                      backgroundColor: sel ? `${C.primary}10` : C.inputBg 
                    }]}
                    onPress={() => setAccountType(t.id)}
                    scaleDown={0.97}
                  >
                    <View style={[s.optionIconWrap, { backgroundColor: sel ? `${C.primary}18` : 'rgba(148,163,184,0.1)' }]}>
                      <Ionicons name={t.icon} size={28} color={sel ? C.primary : C.label} />
                    </View>
                    <View style={s.optionTextWrap}>
                      <Text style={[s.optionLabel, { color: sel ? C.primary : C.text }]}>{t.label}</Text>
                      <Text style={[s.optionSubtitle, { color: C.textMuted }]}>{t.subtitle}</Text>
                    </View>
                    {sel && (
                      <View style={[s.checkCircle, { backgroundColor: C.primary }]}>
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                      </View>
                    )}
                  </AnimatedPressable>
                )
              })}
            </View>
            {accountType === 'user' && (
              <View style={s.subOptionsWrap}>
                <Text style={[s.subLabel, { color: C.label }]}>I am</Text>
                <View style={s.chipRow}>
                  {[
                    { id: 'local', label: 'Local', icon: 'home-outline' },
                    { id: 'tourist', label: 'Tourist', icon: 'airplane-outline' },
                  ].map((t) => {
                    const sel = uType === t.id
                    return (
                      <AnimatedPressable
                        key={t.id}
                        style={[s.chip, { 
                          borderColor: sel ? C.primary : C.border, 
                          backgroundColor: sel ? `${C.primary}15` : C.inputBg 
                        }]}
                        onPress={() => setUType(t.id)}
                        scaleDown={0.95}
                      >
                        <Ionicons name={t.icon} size={20} color={sel ? C.primary : C.label} />
                        <Text style={[s.chipLabel, { color: sel ? C.primary : C.label }]}>{t.label}</Text>
                      </AnimatedPressable>
                    )
                  })}
                </View>
              </View>
            )}
          </View>
        )
      } else if (step === 5) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>Business name</Text>
            <MorphingInput
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Your business name"
              editable={!loading}
              autoFocus
              C={C}
            />
          </View>
        )
      } else if (step === 6) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>Short description</Text>
            <Text style={[s.optionalLabel, { color: C.textMuted }]}>Optional</Text>
            <MorphingInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your business"
              editable={!loading}
              autoFocus
              C={C}
              style={s.textAreaContainer}
            />
          </View>
        )
      } else if (step === 7) {
        return (
          <View style={s.stepContent}>
            <Text style={[s.question, { color: C.text }]}>Business type</Text>
            <View style={s.optionsColumn}>
              {CLIENT_TYPES.map((t) => {
                const sel = clientType === t.id
                return (
                  <AnimatedPressable
                    key={t.id}
                    style={[s.optionCard, { 
                      borderColor: sel ? C.primary : C.border, 
                      backgroundColor: sel ? `${C.primary}10` : C.inputBg 
                    }]}
                    onPress={() => setClientType(t.id)}
                    scaleDown={0.97}
                  >
                    <View style={[s.optionIconWrap, { backgroundColor: sel ? `${C.primary}18` : 'rgba(148,163,184,0.1)' }]}>
                      <Ionicons name={t.icon} size={28} color={sel ? C.primary : C.label} />
                    </View>
                    <Text style={[s.optionLabel, { color: sel ? C.primary : C.text }]}>{t.label}</Text>
                    {sel && (
                      <View style={[s.checkCircle, { backgroundColor: C.primary }]}>
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                      </View>
                    )}
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
      const lastStep = accountType === 'client' ? 7 : 4
      return step === lastStep ? 'Create Account' : 'Continue'
    }
    return step === 1 ? 'Sign In' : 'Continue'
  }

  const getProgressPercent = () => {
    if (isSignUp) {
      const totalSteps = accountType === 'client' ? 8 : 5
      return ((step + 1) / totalSteps) * 100
    }
    return ((step + 1) / 2) * 100
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

          <View style={s.progressBarWrap}>
            <View style={[s.progressTrack, { backgroundColor: `${C.primary}12` }]}>
              <Animated.View style={[s.progressFill, { backgroundColor: C.primary, width: `${getProgressPercent()}%` }]} />
            </View>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
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
          </ScrollView>

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  inner: { flex: 1 },
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
  progressBarWrap: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  bootstrapLoaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 24,
    paddingTop: 8,
    justifyContent: 'flex-start',
  },
  stepContent: { 
    width: '100%',
  },
  question: { 
    fontSize: 28, 
    fontWeight: '700', 
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  optionalLabel: {
    fontSize: 15,
    marginBottom: 16,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: LUXURY.radiusInput,
    paddingHorizontal: 18,
    minHeight: 58,
    marginTop: 16,
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
  subOptionsWrap: { marginTop: 28 },
  subLabel: { 
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: LUXURY.radiusChip + 2,
    borderWidth: 2,
    ...luxurySoftShadow,
  },
  chipLabel: { fontSize: 15, fontWeight: '600' },
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
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    paddingTop: 8,
    gap: 12,
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
    marginBottom: 16,
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
