import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { gradients } from '../theme/designTokens'
import { FadeInView, GradientButton, AnimatedPressable } from '../components/AnimatedUI'

const REMEMBER_ME_KEY = '@gobahrain_remember_email'

const CLIENT_TYPES = [
  { id: 'place', label: 'Place', icon: 'location-outline' },
  { id: 'restaurant', label: 'Restaurant', icon: 'restaurant-outline' },
  { id: 'cafe', label: 'Cafe', icon: 'cafe-outline' },
]

const FloatingOrb = ({ size, color, startX, startY, duration, delay }) => {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start()
    }, delay)
    return () => clearTimeout(timer)
  }, [anim, duration, delay])

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -30] })
  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.15, 1] })

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
        transform: [{ translateY }, { scale }],
      }}
    />
  )
}

export default function AuthScreen() {
  const { colors, isDark } = useTheme()
  const { signIn, signUp, ensureProfileAfterSignUp } = useAuth()
  const { width } = useWindowDimensions()

  const logoScale = useRef(new Animated.Value(0.3)).current
  const logoOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, damping: 12, stiffness: 100, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start()
  }, [logoScale, logoOpacity])

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
  const [securePassword, setSecurePassword] = useState(true)
  const [signUpSuccessMessage, setSignUpSuccessMessage] = useState(null)
  const [rememberMe, setRememberMe] = useState(true)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(REMEMBER_ME_KEY).then((saved) => {
      if (!cancelled && saved) setEmail(saved.trim())
    })
    return () => { cancelled = true }
  }, [])

  const isSignUp = mode === 'signup'
  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (!isSignUp || (userName.trim().length > 0 && (accountType !== 'client' || businessName.trim().length > 0)))

  const handleLogin = async () => {
    if (!canSubmit && !isSignUp) {
      if (password.length > 0 && password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters.')
        return
      }
      Alert.alert('Error', 'Please enter email and password.')
      return
    }
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_ME_KEY, email.trim())
      } else {
        await AsyncStorage.removeItem(REMEMBER_ME_KEY)
      }
    } catch (e) {
      Alert.alert('Login failed', e?.message ?? 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    if (!canSubmit) {
      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters.')
        return
      }
      if (isSignUp && !userName.trim()) {
        Alert.alert('Error', 'Please enter your name.')
        return
      }
      if (accountType === 'client' && !businessName.trim()) {
        Alert.alert('Error', 'Please enter business name.')
        return
      }
      Alert.alert('Error', 'Please fill in all required fields.')
      return
    }
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

  const handleSubmit = () => {
    if (isSignUp) handleSignUp()
    else handleLogin()
  }

  const bgColors = isDark ? gradients.heroDark : gradients.heroLight

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.bg }]}>
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />

      <FloatingOrb size={160} color={`${C.primary}08`} startX={-40} startY={80} duration={6000} delay={0} />
      <FloatingOrb size={120} color={`${C.primary}06`} startX={width - 80} startY={200} duration={7000} delay={1000} />
      <FloatingOrb size={90} color={isDark ? 'rgba(167,139,250,0.06)' : 'rgba(124,58,237,0.04)'} startX={40} startY={400} duration={5500} delay={500} />

      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      >
        <View style={s.header}>
          <Animated.View style={[s.logoBadge, { backgroundColor: `${C.primary}18`, borderColor: `${C.primary}30`, transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
            <Ionicons name="compass" size={30} color={C.primary} />
          </Animated.View>
          <FadeInView delay={200} from={12}>
            <Text style={[s.title, { color: C.text }]}>
              {isSignUp ? 'Create account' : 'Welcome back'}
            </Text>
          </FadeInView>
          <FadeInView delay={350} from={10}>
            <Text style={[s.subtitle, { color: C.textMuted }]}>
              {isSignUp
                ? 'Join as a local, tourist, or business — one account for all.'
                : 'Sign in to continue exploring Bahrain.'}
            </Text>
          </FadeInView>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <FadeInView delay={400} from={24}>
            <View style={[s.formCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
              <TouchableOpacity
                style={s.toggleRow}
                onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setSignUpSuccessMessage(null) }}
                activeOpacity={0.8}
              >
                <Text style={[s.toggleText, { color: C.textMuted }]}>
                  {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                </Text>
                <Text style={[s.toggleLink, { color: C.primary }]}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
              </TouchableOpacity>

              <View style={s.inputWrap}>
                <Text style={[s.label, { color: C.label }]}>Email</Text>
                <View style={[s.inputContainer, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                  <Ionicons name="mail-outline" size={18} color={C.label} style={s.inputIcon} />
                  <TextInput
                    style={[s.input, { color: C.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={C.label}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </View>
              </View>

              <View style={s.inputWrap}>
                <Text style={[s.label, { color: C.label }]}>Password (min 6)</Text>
                <View style={[s.inputContainer, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={C.label} style={s.inputIcon} />
                  <TextInput
                    style={[s.input, s.passwordInput, { color: C.text }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={C.label}
                    secureTextEntry={securePassword}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    onPress={() => setSecurePassword((v) => !v)}
                    style={s.eyeBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name={securePassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.label} />
                  </TouchableOpacity>
                </View>
              </View>

              {!isSignUp && (
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
              )}

              {isSignUp && (
                <>
                  <View style={s.inputWrap}>
                    <Text style={[s.label, { color: C.label }]}>Name</Text>
                    <View style={[s.inputContainer, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                      <Ionicons name="person-outline" size={18} color={C.label} style={s.inputIcon} />
                      <TextInput
                        style={[s.input, { color: C.text }]}
                        value={userName}
                        onChangeText={setUserName}
                        placeholder="Your name"
                        placeholderTextColor={C.label}
                        editable={!loading}
                      />
                    </View>
                  </View>
                  <View style={s.inputWrap}>
                    <Text style={[s.label, { color: C.label }]}>Phone (optional)</Text>
                    <View style={[s.inputContainer, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                      <Ionicons name="call-outline" size={18} color={C.label} style={s.inputIcon} />
                      <TextInput
                        style={[s.input, { color: C.text }]}
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="+973 ..."
                        placeholderTextColor={C.label}
                        keyboardType="phone-pad"
                        editable={!loading}
                      />
                    </View>
                  </View>

                  <Text style={[s.sectionLabel, { color: C.label }]}>Account type</Text>
                  <View style={s.chipRow}>
                    {[
                      { id: 'user', label: 'User', icon: 'person-outline' },
                      { id: 'client', label: 'Business', icon: 'business-outline' },
                    ].map((t) => {
                      const sel = accountType === t.id
                      return (
                        <AnimatedPressable
                          key={t.id}
                          style={[s.chip, { borderColor: sel ? C.primary : C.border, backgroundColor: sel ? `${C.primary}15` : C.inputBg }]}
                          onPress={() => setAccountType(t.id)}
                          scaleDown={0.95}
                        >
                          <Ionicons name={t.icon} size={20} color={sel ? C.primary : C.label} />
                          <Text style={[s.chipLabel, { color: sel ? C.primary : C.label }, sel && s.chipLabelSel]}>{t.label}</Text>
                        </AnimatedPressable>
                      )
                    })}
                  </View>

                  {accountType === 'user' && (
                    <>
                      <Text style={[s.sectionLabel, { color: C.label }]}>I am</Text>
                      <View style={s.chipRow}>
                        {[
                          { id: 'local', label: 'Local', icon: 'home-outline' },
                          { id: 'tourist', label: 'Tourist', icon: 'airplane-outline' },
                        ].map((t) => {
                          const sel = uType === t.id
                          return (
                            <AnimatedPressable
                              key={t.id}
                              style={[s.chip, { borderColor: sel ? C.primary : C.border, backgroundColor: sel ? `${C.primary}15` : C.inputBg }]}
                              onPress={() => setUType(t.id)}
                              scaleDown={0.95}
                            >
                              <Ionicons name={t.icon} size={18} color={sel ? C.primary : C.label} />
                              <Text style={[s.chipLabel, { color: sel ? C.primary : C.label }, sel && s.chipLabelSel]}>{t.label}</Text>
                            </AnimatedPressable>
                          )
                        })}
                      </View>
                    </>
                  )}

                  {accountType === 'client' && (
                    <>
                      <View style={s.inputWrap}>
                        <Text style={[s.label, { color: C.label }]}>Business name</Text>
                        <View style={[s.inputContainer, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                          <Ionicons name="storefront-outline" size={18} color={C.label} style={s.inputIcon} />
                          <TextInput
                            style={[s.input, { color: C.text }]}
                            value={businessName}
                            onChangeText={setBusinessName}
                            placeholder="Your business name"
                            placeholderTextColor={C.label}
                            editable={!loading}
                          />
                        </View>
                      </View>
                      <View style={s.inputWrap}>
                        <Text style={[s.label, { color: C.label }]}>Description (optional)</Text>
                        <View style={[s.inputContainer, s.textAreaContainer, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                          <TextInput
                            style={[s.input, s.textArea, { color: C.text }]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Short description"
                            placeholderTextColor={C.label}
                            multiline
                            numberOfLines={2}
                            editable={!loading}
                          />
                        </View>
                      </View>
                      <Text style={[s.sectionLabel, { color: C.label }]}>Business type</Text>
                      <View style={s.chipRow}>
                        {CLIENT_TYPES.map((t) => {
                          const sel = clientType === t.id
                          return (
                            <AnimatedPressable
                              key={t.id}
                              style={[s.chip, { borderColor: sel ? C.primary : C.border, backgroundColor: sel ? `${C.primary}15` : C.inputBg }]}
                              onPress={() => setClientType(t.id)}
                              scaleDown={0.95}
                            >
                              <Ionicons name={t.icon} size={18} color={sel ? C.primary : C.label} />
                              <Text style={[s.chipLabel, { color: sel ? C.primary : C.label }, sel && s.chipLabelSel]}>{t.label}</Text>
                            </AnimatedPressable>
                          )
                        })}
                      </View>
                    </>
                  )}
                </>
              )}

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

              <View style={s.submitWrap}>
                <GradientButton
                  onPress={handleSubmit}
                  disabled={!canSubmit || loading}
                  style={{ marginTop: 8 }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Text style={s.submitBtnText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
                      <Ionicons name="arrow-forward" size={20} color="#FFF" />
                    </>
                  )}
                </GradientButton>
              </View>
            </View>
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20, alignItems: 'center' },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
  },
  title: { fontSize: 30, fontWeight: '800', marginBottom: 10, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: 8, maxWidth: 320 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },
  formCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 28,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24 },
      android: { elevation: 8 },
    }),
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  toggleText: { fontSize: 15 },
  toggleLink: { fontSize: 15, fontWeight: '700' },
  inputWrap: { marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 14 : 10 },
  passwordInput: { paddingRight: 40 },
  eyeBtn: { padding: 6 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.4)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rememberLabel: { fontSize: 15, fontWeight: '500' },
  textAreaContainer: { alignItems: 'flex-start', paddingVertical: 8 },
  textArea: { minHeight: 68, textAlignVertical: 'top' },
  sectionLabel: { fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 10, textTransform: 'uppercase', letterSpacing: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  chipLabel: { fontSize: 15, fontWeight: '500' },
  chipLabelSel: { fontWeight: '700' },
  submitWrap: { marginTop: 12 },
  submitBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
  },
  successIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBannerText: { flex: 1, fontSize: 14, lineHeight: 20 },
})
