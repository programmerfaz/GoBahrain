import React, { useState, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const REMEMBER_ME_KEY = '@gobahrain_remember_email';

const CLIENT_TYPES = [
  { id: 'place', label: 'Place' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'cafe', label: 'Cafe' },
];

function getAuthStyles(C) {
  return {
    safe: { flex: 1, backgroundColor: C.bg },
    container: { flex: 1, backgroundColor: C.bg },
    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, alignItems: 'center' },
    logoBadge: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.primary + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: C.primary + '44' },
    title: { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 10, letterSpacing: -0.5, textAlign: 'center' },
    subtitle: { fontSize: 15, color: C.textMuted, lineHeight: 22, textAlign: 'center', paddingHorizontal: 8, maxWidth: 320 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },
    formCard: { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 20, paddingVertical: 24, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24 }, android: { elevation: 8 } }) },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    toggleText: { fontSize: 15, color: C.textMuted },
    toggleLink: { fontSize: 15, fontWeight: '700', color: C.primary },
    inputWrap: { marginBottom: 18 },
    label: { fontSize: 12, fontWeight: '600', color: C.label, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    input: { backgroundColor: C.cardBorder || C.border, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, fontSize: 16, color: C.text },
    passwordRow: { position: 'relative' },
    passwordInput: { paddingRight: 48 },
    eyeBtn: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
    rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 4 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    checkboxChecked: { backgroundColor: C.primary, borderColor: C.primary },
    rememberLabel: { fontSize: 15, color: C.textMuted, fontWeight: '500' },
    textArea: { minHeight: 72, textAlignVertical: 'top' },
    sectionLabel: { fontSize: 12, fontWeight: '600', color: C.label, marginBottom: 10, marginTop: 10, textTransform: 'uppercase', letterSpacing: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
    chipSelected: { borderColor: C.primary, borderWidth: 2, backgroundColor: C.primary + '22' },
    chipLabel: { fontSize: 15, color: C.label, fontWeight: '500' },
    chipLabelSelected: { color: C.primary, fontWeight: '700' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 17, borderRadius: 14, backgroundColor: C.primary, marginTop: 28, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 }, android: { elevation: 6 } }) },
    submitBtnDisabled: { opacity: 0.55 },
    submitBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
    successBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: C.primary + '22', borderWidth: 1, borderColor: C.primary, marginTop: 20 },
    successBannerText: { flex: 1, fontSize: 14, color: C.text, lineHeight: 20 },
  };
}

export default function AuthScreen() {
  const { colors, isDark } = useTheme();
  const { signIn, signUp, ensureProfileAfterSignUp } = useAuth();
  const COLORS = useMemo(() => (isDark ? {
    bg: '#0B1120',
    bgGradientTop: '#0F172A',
    card: 'rgba(30,41,59,0.5)',
    cardBorder: 'rgba(148,163,184,0.15)',
    border: 'rgba(148,163,184,0.25)',
    text: '#F8FAFC',
    textMuted: 'rgba(203,213,225,0.85)',
    label: '#94A3B8',
    primary: colors.primary,
    primaryGlow: colors.primary + '40',
  } : {
    bg: colors.background,
    bgGradientTop: colors.surface,
    card: colors.surface,
    cardBorder: colors.border,
    border: colors.border,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    label: colors.textMuted,
    primary: colors.primary,
    primaryGlow: colors.primary + '40',
  }), [colors, isDark]);
  const styles = useMemo(() => StyleSheet.create(getAuthStyles(COLORS)), [COLORS]);
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('user'); // 'user' | 'client'
  const [uType, setUType] = useState('local'); // 'local' | 'tourist'
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [clientType, setClientType] = useState('place');
  const [loading, setLoading] = useState(false);
  const [securePassword, setSecurePassword] = useState(true);
  const [signUpSuccessMessage, setSignUpSuccessMessage] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);

  // Load remembered email on mount
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(REMEMBER_ME_KEY).then((saved) => {
      if (!cancelled && saved) setEmail(saved.trim());
    });
    return () => { cancelled = true; };
  }, []);

  const isSignUp = mode === 'signup';
  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (!isSignUp || (userName.trim().length > 0 && (accountType !== 'client' || businessName.trim().length > 0)));

  const handleLogin = async () => {
    if (!canSubmit && !isSignUp) {
      if (password.length > 0 && password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters.');
        return;
      }
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_ME_KEY, email.trim());
      } else {
        await AsyncStorage.removeItem(REMEMBER_ME_KEY);
      }
    } catch (e) {
      Alert.alert('Login failed', e?.message ?? 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!canSubmit) {
      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters.');
        return;
      }
      if (isSignUp && !userName.trim()) {
        Alert.alert('Error', 'Please enter your name.');
        return;
      }
      if (accountType === 'client' && !businessName.trim()) {
        Alert.alert('Error', 'Please enter business name.');
        return;
      }
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setSignUpSuccessMessage(null);
    try {
      const { session: newSession } = await signUp(email.trim(), password, {
        accountType,
        userName: userName.trim(),
        phone: phone.trim() || null,
        uType: accountType === 'user' ? uType : undefined,
        businessName: accountType === 'client' ? businessName.trim() : undefined,
        description: accountType === 'client' ? description.trim() || null : undefined,
        clientType: accountType === 'client' ? clientType : undefined,
      });
      if (newSession) {
        await ensureProfileAfterSignUp({
          accountType,
          userName: userName.trim(),
          phone: phone.trim() || null,
          uType: accountType === 'user' ? uType : 'local',
          businessName: accountType === 'client' ? businessName.trim() : '',
          description: accountType === 'client' ? description.trim() || null : null,
          clientType: accountType === 'client' ? clientType : 'place',
        });
      } else {
        setSignUpSuccessMessage('Check your email to confirm your account, then sign in.');
      }
    } catch (e) {
      const msg = e?.message ?? 'Could not create account.';
      if (/rate limit|rate_limit|too many requests/i.test(msg)) {
        Alert.alert(
          'Too many signup attempts',
          'Please wait a while and try again, or turn off "Confirm email" in Supabase (Auth → Providers → Email) for development.'
        );
      } else if (/database error saving new user/i.test(msg)) {
        Alert.alert(
          'Sign up failed',
          'A database trigger on new users is likely failing. In Supabase: run the SQL in supabase/fix-auth-trigger.sql to list or remove it, or check Logs → Postgres for the real error.'
        );
      } else if (/ensure_user_profile|ensure_client_profile|auth_user_id|get_my_profile|column.*does not exist|function.*does not exist/i.test(msg)) {
        Alert.alert(
          'Profile setup failed',
          msg + '\n\nMake sure you ran the full SQL in Supabase: Project → SQL Editor → run supabase/auth-setup.sql (all of it).'
        );
      } else {
        Alert.alert('Sign up failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (isSignUp) handleSignUp();
    else handleLogin();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      >
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="compass" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>{isSignUp ? 'Create account' : 'Welcome back'}</Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? 'Join as a local, tourist, or business — one account for all.'
              : 'Sign in to continue exploring Bahrain.'}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formCard}>
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setSignUpSuccessMessage(null); }}
            activeOpacity={0.8}
          >
            <Text style={styles.toggleText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <Text style={styles.toggleLink}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.label}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>Password (min 6)</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={COLORS.label}
                secureTextEntry={securePassword}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setSecurePassword((s) => !s)}
                style={styles.eyeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name={securePassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={COLORS.label} />
              </TouchableOpacity>
            </View>
          </View>

          {!isSignUp && (
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe((r) => !r)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color="#FFF" />}
              </View>
              <Text style={styles.rememberLabel}>Remember me</Text>
            </TouchableOpacity>
          )}

          {isSignUp && (
            <>
              <View style={styles.inputWrap}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={userName}
                  onChangeText={setUserName}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.label}
                  editable={!loading}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.label}>Phone (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+973 ..."
                  placeholderTextColor={COLORS.label}
                  keyboardType="phone-pad"
                  editable={!loading}
                />
              </View>

              <Text style={styles.sectionLabel}>Account type</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, accountType === 'user' && styles.chipSelected]}
                  onPress={() => setAccountType('user')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-outline" size={20} color={accountType === 'user' ? COLORS.primary : COLORS.label} />
                  <Text style={[styles.chipLabel, accountType === 'user' && styles.chipLabelSelected]}>User</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, accountType === 'client' && styles.chipSelected]}
                  onPress={() => setAccountType('client')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="business-outline" size={20} color={accountType === 'client' ? COLORS.primary : COLORS.label} />
                  <Text style={[styles.chipLabel, accountType === 'client' && styles.chipLabelSelected]}>Business</Text>
                </TouchableOpacity>
              </View>

              {accountType === 'user' && (
                <>
                  <Text style={styles.sectionLabel}>I am</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, uType === 'local' && styles.chipSelected]}
                      onPress={() => setUType('local')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipLabel, uType === 'local' && styles.chipLabelSelected]}>Local</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, uType === 'tourist' && styles.chipSelected]}
                      onPress={() => setUType('tourist')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipLabel, uType === 'tourist' && styles.chipLabelSelected]}>Tourist</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {accountType === 'client' && (
                <>
                  <View style={styles.inputWrap}>
                    <Text style={styles.label}>Business name</Text>
                    <TextInput
                      style={styles.input}
                      value={businessName}
                      onChangeText={setBusinessName}
                      placeholder="Your business name"
                      placeholderTextColor={COLORS.label}
                      editable={!loading}
                    />
                  </View>
                  <View style={styles.inputWrap}>
                    <Text style={styles.label}>Description (optional)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Short description"
                      placeholderTextColor={COLORS.label}
                      multiline
                      numberOfLines={2}
                      editable={!loading}
                    />
                  </View>
                  <Text style={styles.sectionLabel}>Business type</Text>
                  <View style={styles.chipRow}>
                    {CLIENT_TYPES.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.chip, clientType === t.id && styles.chipSelected]}
                        onPress={() => setClientType(t.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipLabel, clientType === t.id && styles.chipLabelSelected]}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {signUpSuccessMessage ? (
            <View style={styles.successBanner}>
              <Ionicons name="mail-outline" size={24} color={COLORS.primary} />
              <Text style={styles.successBannerText}>{signUpSuccessMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.submitBtn, (!canSubmit || loading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Text style={styles.submitBtnText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

