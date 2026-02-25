import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { PREDEFINED_AVATARS } from '../constants/avatars';

const COLORS = {
  primary: '#C8102E',
  screenBg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

function suggestUsernameFromEmail(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e) return '';
  const local = e.split('@')[0] || '';
  const clean = local.replace(/[^a-z0-9]/g, '');
  if (!clean) return `explorer_${Date.now().toString(36).slice(-6)}`;
  return clean.charAt(0).toUpperCase() + clean.slice(1) + '_BH';
}

export default function SignUpScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [userType, setUserType] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);

  const handleEmailBlur = useCallback(() => {
    if (!username.trim()) {
      const suggested = suggestUsernameFromEmail(email);
      if (suggested) setUsername(suggested);
    }
  }, [email, username]);

  const requestLocation = useCallback(async () => {
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. You can enable it in Settings.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (loc?.coords) {
        setLatitude(loc.coords.latitude);
        setLongitude(loc.coords.longitude);
      } else {
        setLocationError('Could not get current position.');
      }
    } catch (e) {
      setLocationError(e.message || 'Location error.');
    }
  }, []);

  const validate = useCallback(() => {
    const e = email.trim();
    if (!e) {
      Alert.alert('Required', 'Please enter your email.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return false;
    }
    if (!password) {
      Alert.alert('Required', 'Please enter a password.');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Password and confirm password do not match.');
      return false;
    }
    if (!username.trim()) {
      Alert.alert('Required', 'Please enter a username.');
      return false;
    }
    const a = age.trim();
    if (!a) {
      Alert.alert('Required', 'Please enter your age.');
      return false;
    }
    const num = parseInt(a, 10);
    if (isNaN(num) || num < 1 || num > 120) {
      Alert.alert('Invalid age', 'Please enter a valid age (1–120).');
      return false;
    }
    if (!userType) {
      Alert.alert('Required', 'Please choose Tourist or Local.');
      return false;
    }
    if (!avatar) {
      Alert.alert('Required', 'Please choose an avatar.');
      return false;
    }
    if (latitude == null || longitude == null) {
      Alert.alert('Location required', 'Please enable location and try again.');
      return false;
    }
    return true;
  }, [email, password, confirmPassword, username, age, userType, avatar, latitude, longitude]);

  const handleSignUp = useCallback(async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: username.trim(),
            phone: phone.trim() || null,
            username: username.trim(),
            age: age.trim() ? parseInt(age.trim(), 10) : null,
            user_type: userType || 'tourist',
            avatar: avatar || '',
            latitude,
            longitude,
          },
        },
      });

      if (error) {
        console.error('[SignUp] auth.signUp error:', error.message);
        console.error('[SignUp] error object:', JSON.stringify(error, null, 2));
        console.error('[SignUp] error.code:', error.code, 'error.status:', error.status);
        throw error;
      }

      // If we have a session (e.g. email confirmation off), ensure profile row exists (fallback if DB trigger failed)
      const uid = data?.user?.id;
      if (uid) {
        const { error: profileError } = await supabase.from('user').upsert(
          {
            account_uuid: uid,
            username: username.trim(),
            age: age.trim() ? parseInt(age.trim(), 10) : null,
            user_type: userType || 'tourist',
            avatar: avatar || '',
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
          },
          { onConflict: 'account_uuid' }
        );
        if (profileError) {
          console.error('[SignUp] profile upsert error:', profileError.message);
          console.error('[SignUp] profile error object:', JSON.stringify(profileError, null, 2));
          console.error('[SignUp] profile error.details:', profileError.details, 'code:', profileError.code);
        }
      }

      Alert.alert('Success', 'Account created. You can sign in now.', [
        { text: 'OK', onPress: () => navigation.replace('SignIn') },
      ]);
    } catch (err) {
      console.error('[SignUp] caught error:', err?.message);
      console.error('[SignUp] full error:', err);
      console.error('[SignUp] error stringified:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      const isRateLimit = err?.code === 'over_email_send_rate_limit' || err?.status === 429;
      const message = isRateLimit
        ? 'Email rate limit exceeded. Please try again in a few minutes.'
        : (err?.message || 'Could not create account.');
      Alert.alert('Sign up failed', message);
    } finally {
      setLoading(false);
    }
  }, [validate, email, password, username, phone, age, userType, avatar, latitude, longitude, navigation]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.replace('SignIn')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Sign up</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={COLORS.textMuted}
          value={email}
          onChangeText={setEmail}
          onBlur={handleEmailBlur}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpacer]}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 6 characters"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpacer]}>Confirm password</Text>
        <TextInput
          style={styles.input}
          placeholder="Re-enter password"
          placeholderTextColor={COLORS.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpacer]}>Username</Text>
        <Text style={styles.hint}>Leave email field first to get a suggested name.</Text>
        <TextInput
          style={[styles.input, { marginTop: 4 }]}
          placeholder="e.g. Jane_BH"
          placeholderTextColor={COLORS.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="words"
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpacer]}>Phone (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="+973 1234 5678"
          placeholderTextColor={COLORS.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpacer]}>Age</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 25"
          placeholderTextColor={COLORS.textMuted}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          maxLength={3}
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpacer]}>I am a</Text>
        <View style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, userType === 'tourist' && styles.chipSelected]}
            onPress={() => setUserType('tourist')}
            activeOpacity={0.8}
          >
            <Ionicons name="airplane-outline" size={24} color={userType === 'tourist' ? '#FFF' : COLORS.primary} />
            <Text style={[styles.chipText, userType === 'tourist' && styles.chipTextSelected]}>Tourist</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, userType === 'local' && styles.chipSelected]}
            onPress={() => setUserType('local')}
            activeOpacity={0.8}
          >
            <Ionicons name="home-outline" size={24} color={userType === 'local' ? '#FFF' : COLORS.primary} />
            <Text style={[styles.chipText, userType === 'local' && styles.chipTextSelected]}>Local</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, styles.labelSpacer]}>Choose avatar</Text>
        <View style={styles.avatarGrid}>
          {PREDEFINED_AVATARS.map((url) => (
            <TouchableOpacity
              key={url}
              style={[styles.avatarWrap, avatar === url && styles.avatarWrapSelected]}
              onPress={() => setAvatar(url)}
              activeOpacity={0.8}
            >
              <Image source={{ uri: url }} style={styles.avatarImg} />
              {avatar === url && (
                <View style={styles.avatarCheck}>
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, styles.labelSpacer]}>Location</Text>
        <Text style={styles.hint}>We use it to personalize your experience. Lat/long are stored in your profile.</Text>
        {latitude != null && longitude != null ? (
          <View style={styles.locationOk}>
            <Ionicons name="location" size={32} color={COLORS.primary} />
            <Text style={styles.locationOkText}>Location enabled</Text>
            <Text style={styles.locationCoords}>{latitude.toFixed(4)}, {longitude.toFixed(4)}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.locationBtn} onPress={requestLocation} disabled={loading} activeOpacity={0.85}>
            <Ionicons name="location-outline" size={28} color="#FFF" />
            <Text style={styles.locationBtnText}>Enable location</Text>
          </TouchableOpacity>
        )}
        {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={handleSignUp}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Create account</Text>
          )}
        </TouchableOpacity>
        <View style={styles.signInRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.replace('SignIn')} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  labelSpacer: {
    marginTop: 16,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.cardBg,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
  },
  chipText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: COLORS.border,
  },
  avatarWrapSelected: {
    borderColor: COLORS.primary,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarCheck: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(200,16,46,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  locationBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  locationOk: {
    alignItems: 'center',
    marginTop: 12,
    padding: 16,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locationOkText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 8,
  },
  locationCoords: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.primary,
    marginTop: 8,
  },
  footer: {
    paddingTop: 16,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
