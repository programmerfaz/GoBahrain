import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  SafeAreaView,
  Alert,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ScreenContainer from '../components/ScreenContainer'
import { useTheme } from '../context/ThemeContext'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useAuth } from '../context/AuthContext'
import { GENERAL_GROUPS } from '../constants/preferences'
import { gradients } from '../theme/designTokens'
import { FadeInView, AnimatedPressable, GradientButton } from '../components/AnimatedUI'
import { fetchMyCommunityPosts, getCommunityUserId } from '../services/community'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60
const TILE_GAP = 10
const TILE_COLS = 3

const APPEARANCE_OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sunny-outline', desc: 'Always use light theme' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline', desc: 'Always use dark theme' },
  { id: 'system', label: 'System', icon: 'phone-portrait-outline', desc: 'Match device settings' },
]

const ProfileBlockTitle = ({ title, C }) => (
  <View style={blockTitleStyles.wrap}>
    <LinearGradient
      colors={[C.primary, `${C.primary}55`]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={blockTitleStyles.accent}
    />
    <Text style={[blockTitleStyles.text, { color: C.textPrimary }]}>{title}</Text>
  </View>
)

const blockTitleStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 4 },
  accent: { width: 4, height: 22, borderRadius: 3 },
  text: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
})

const ProfileTile = ({ icon, iconColor, label, onPress, disabled, C, width, delay }) => (
  <FadeInView delay={delay} from={14} duration={380}>
    <AnimatedPressable
      style={[
        tileStyles.tile,
        { width, backgroundColor: C.cardBg, borderColor: C.border },
        disabled && { opacity: 0.55 },
      ]}
      onPress={onPress}
      disabled={disabled || !onPress}
      scaleDown={0.96}
    >
      <LinearGradient
        colors={[`${iconColor || C.primary}24`, `${iconColor || C.primary}06`]}
        style={tileStyles.iconRing}
      >
        <Ionicons name={icon} size={22} color={iconColor || C.primary} />
      </LinearGradient>
      <Text style={[tileStyles.label, { color: C.textPrimary }]} numberOfLines={2}>
        {label}
      </Text>
    </AnimatedPressable>
  </FadeInView>
)

const tileStyles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 10,
    minHeight: 100,
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  iconRing: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
})

const ProfileTileGrid = ({ items, C, baseDelay = 0 }) => {
  const { width: winW } = useWindowDimensions()
  const scrollPad = 16
  const innerW = winW - scrollPad * 2
  const tileW = Math.max(1, Math.floor((innerW - TILE_GAP * (TILE_COLS - 1)) / TILE_COLS))

  return (
    <View style={[gridStyles.grid, { width: innerW, gap: TILE_GAP }]}>
      {items.map((item, idx) => {
        const span = item.colSpan === TILE_COLS ? TILE_COLS : 1
        const w = span === TILE_COLS ? innerW : tileW
        return (
          <ProfileTile
            key={item.key}
            icon={item.icon}
            iconColor={item.iconColor}
            label={item.label}
            onPress={item.onPress}
            disabled={item.disabled}
            C={C}
            width={w}
            delay={baseDelay + idx * 55}
          />
        )
      })}
    </View>
  )
}

const gridStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
})

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { width: winW } = useWindowDimensions()
  const navigation = useNavigation()
  const { colors, colorScheme, setColorScheme, isDark } = useTheme()
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0)
  const {
    preferences,
    setPreferences,
    GENERAL_PREFERENCES,
    PREFERENCES,
    FOOD_CATEGORIES,
  } = useUserPreferences()
  const { profile, user: authUser, signOut } = useAuth()
  const [preferencesModalVisible, setPreferencesModalVisible] = useState(false)
  const [appearanceModalVisible, setAppearanceModalVisible] = useState(false)
  const [editGeneralIds, setEditGeneralIds] = useState([])
  const [editActivityIds, setEditActivityIds] = useState([])
  const [editFoodIds, setEditFoodIds] = useState([])
  const [myReviewCount, setMyReviewCount] = useState(0)
  const avatarPulse = useRef(new Animated.Value(0)).current

  const loadMyReviewCount = useCallback(async () => {
    try {
      const userId = await getCommunityUserId()
      if (!userId) {
        setMyReviewCount(0)
        return
      }
      const list = await fetchMyCommunityPosts(userId)
      const myOnly = (list || []).filter((p) => p.user_a_uuid === userId)
      setMyReviewCount(myOnly.length)
    } catch {
      setMyReviewCount(0)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadMyReviewCount()
    }, [loadMyReviewCount])
  )

  useEffect(() => {
    avatarPulse.setValue(0)
    Animated.timing(avatarPulse, {
      toValue: 1,
      duration: 680,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [avatarPulse])

  const C = useMemo(() => ({
    primary: colors.primary,
    screenBg: colors.background,
    cardBg: colors.surface,
    cardBgAlt: colors.borderLight,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    border: colors.border,
    pillBg: colors.borderLight,
    accent2: colors.accent2,
    accent3: colors.accent3,
  }), [colors])

  useEffect(() => {
    if (preferencesModalVisible) {
      setEditGeneralIds(Array.isArray(preferences?.generalIds) ? preferences.generalIds : [])
      setEditActivityIds(Array.isArray(preferences?.activityIds) ? preferences.activityIds : [])
      setEditFoodIds(Array.isArray(preferences?.foodIds) ? preferences.foodIds : [])
    }
  }, [preferencesModalVisible, preferences?.generalIds, preferences?.activityIds, preferences?.foodIds])

  const toggleGeneral = (id) => setEditGeneralIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleActivity = (id) => setEditActivityIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleFood = (id) => setEditFoodIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const handleSavePreferences = async () => {
    await setPreferences({ generalIds: editGeneralIds, activityIds: editActivityIds, foodIds: editFoodIds })
    setPreferencesModalVisible(false)
  }

  const userName = profile?.account?.user_name || authUser?.email?.split('@')[0] || 'User'
  const userInitial = (profile?.account?.user_name || authUser?.email || 'U').charAt(0).toUpperCase()
  const userEmail = authUser?.email ?? 'Signed in'

  const prefCount = (preferences?.activityIds?.length || 0) + (preferences?.foodIds?.length || 0)

  const scrollPad = 16
  const innerW = winW - scrollPad * 2
  const statGap = 10
  const statW = Math.max(1, Math.floor((innerW - statGap * 2) / 3))
  const prefChipGap = 10
  const prefChipW = Math.max(96, Math.floor((winW - 40 - prefChipGap * 2) / 3))

  const avatarScale = avatarPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  })
  const avatarFade = avatarPulse

  const accountTiles = useMemo(() => [
    { key: 'edit', icon: 'person-outline', label: 'Edit profile', iconColor: C.primary, onPress: () => {} },
    {
      key: 'reviews',
      icon: 'chatbubbles-outline',
      label: 'My reviews',
      iconColor: isDark ? '#10B981' : '#059669',
      onPress: () => navigation.navigate('MyReviews'),
    },
    { key: 'notif', icon: 'notifications-outline', label: 'Notifications', iconColor: C.accent2, onPress: () => {} },
    { key: 'privacy', icon: 'lock-closed-outline', label: 'Privacy & security', iconColor: C.textSecondary, onPress: () => {} },
  ], [C, isDark, navigation])

  const preferenceTiles = useMemo(() => [
    {
      key: 'prefs',
      icon: 'heart-outline',
      label: 'Activity & food',
      iconColor: C.primary,
      onPress: () => setPreferencesModalVisible(true),
    },
    { key: 'lang', icon: 'language-outline', label: 'Language', iconColor: C.accent3, onPress: () => {} },
    {
      key: 'look',
      icon: 'color-palette-outline',
      label: 'Appearance',
      iconColor: isDark ? '#A78BFA' : '#7C3AED',
      onPress: () => setAppearanceModalVisible(true),
    },
  ], [C, isDark])

  const supportTiles = useMemo(() => [
    { key: 'help', icon: 'help-circle-outline', label: 'Help & FAQ', iconColor: C.textSecondary, onPress: () => {} },
    { key: 'contact', icon: 'chatbubble-outline', label: 'Contact us', iconColor: C.textSecondary, onPress: () => {} },
    { key: 'about', icon: 'document-text-outline', label: 'About Go Bahrain', iconColor: C.textSecondary, onPress: () => {} },
  ], [C])

  const devTiles = useMemo(() => [{
    key: 'resetOb',
    icon: 'refresh-outline',
    label: 'Reset onboarding',
    iconColor: colors.warning,
    colSpan: TILE_COLS,
    onPress: () => {
      Alert.alert(
        'Reset Onboarding',
        'This will clear your onboarding status and show the onboarding screen again. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              try {
                await AsyncStorage.removeItem('@gobahrain_onboarding_complete')
                Alert.alert('Success', 'Onboarding reset! Close and reopen the app to see the onboarding screen.')
              } catch (e) {
                Alert.alert('Error', `Failed to reset onboarding: ${e.message}`)
              }
            },
          },
        ]
      )
    },
  }], [colors.warning])

  return (
    <ScreenContainer showHeader headerTitle="Profile">
      <ScrollView
        style={[s.scroll, { backgroundColor: C.screenBg }]}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPadding + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.heroBleed}>
          <LinearGradient
            colors={gradients.hero(isDark)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.heroGradient}
          >
            <LinearGradient
              colors={gradients.cardGlow(isDark)}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <FadeInView delay={0} from={20} duration={420}>
              <View style={s.heroInner}>
                <Animated.View style={{ opacity: avatarFade, transform: [{ scale: avatarScale }] }}>
                  <View style={s.avatarOuter}>
                    <LinearGradient
                      colors={gradients.avatarRing}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.avatarGradientRing}
                    >
                      <View style={[s.avatarInner, { backgroundColor: C.cardBg }]}>
                        <Text style={[s.avatarInitial, { color: C.primary }]}>{userInitial}</Text>
                      </View>
                    </LinearGradient>
                  </View>
                </Animated.View>
                <Text style={[s.userName, { color: C.textPrimary }]}>{userName}</Text>
                <Text style={[s.userSub, { color: C.textMuted }]}>{userEmail}</Text>

                <View style={[s.statsRow, { gap: statGap }]}>
                  <LinearGradient
                    colors={[`${C.primary}18`, `${C.primary}06`]}
                    style={[s.statCard, { width: statW, borderColor: `${C.primary}35` }]}
                  >
                    <Ionicons name="heart" size={18} color={C.primary} />
                    <Text style={[s.statValue, { color: C.textPrimary }]}>{prefCount}</Text>
                    <Text style={[s.statLabel, { color: C.textMuted }]}>Preferences</Text>
                  </LinearGradient>
                  <LinearGradient
                    colors={isDark ? ['rgba(167,139,250,0.2)', 'rgba(167,139,250,0.06)'] : ['rgba(124,58,237,0.12)', 'rgba(124,58,237,0.04)']}
                    style={[s.statCard, { width: statW, borderColor: isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.25)' }]}
                  >
                    <Ionicons name="calendar" size={18} color={isDark ? '#A78BFA' : '#7C3AED'} />
                    <Text style={[s.statValue, { color: C.textPrimary }]}>0</Text>
                    <Text style={[s.statLabel, { color: C.textMuted }]}>Plans</Text>
                  </LinearGradient>
                  <TouchableOpacity
                    style={s.statTouchable}
                    onPress={() => navigation.navigate('MyReviews')}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel="Open my reviews"
                  >
                    <LinearGradient
                      colors={isDark ? ['rgba(16,185,129,0.22)', 'rgba(16,185,129,0.06)'] : ['rgba(5,150,105,0.14)', 'rgba(5,150,105,0.05)']}
                      style={[s.statCard, { width: statW, borderColor: isDark ? 'rgba(16,185,129,0.4)' : 'rgba(5,150,105,0.28)' }]}
                    >
                      <Ionicons name="star" size={18} color={isDark ? '#10B981' : '#059669'} />
                      <Text style={[s.statValue, { color: C.textPrimary }]}>{myReviewCount}</Text>
                      <Text style={[s.statLabel, { color: C.textMuted }]}>Reviews</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </FadeInView>
          </LinearGradient>
        </View>

        <View style={s.sectionStack}>
          <FadeInView delay={120} from={16} duration={400}>
            <ProfileBlockTitle title="Account" C={C} />
            <ProfileTileGrid items={accountTiles} C={C} baseDelay={140} />
          </FadeInView>

          <FadeInView delay={200} from={16} duration={400}>
            <ProfileBlockTitle title="Preferences" C={C} />
            <ProfileTileGrid items={preferenceTiles} C={C} baseDelay={220} />
          </FadeInView>

          <FadeInView delay={280} from={16} duration={400}>
            <ProfileBlockTitle title="Support" C={C} />
            <ProfileTileGrid items={supportTiles} C={C} baseDelay={300} />
          </FadeInView>

          {__DEV__ && (
            <FadeInView delay={340} from={14} duration={380}>
              <ProfileBlockTitle title="Developer" C={C} />
              <ProfileTileGrid items={devTiles} C={C} baseDelay={360} />
            </FadeInView>
          )}
        </View>

        <FadeInView delay={400} from={12} duration={360}>
          <View style={s.ctaSection}>
            <AnimatedPressable
              style={[s.signOutBtn, { borderColor: colors.error + '40', backgroundColor: C.cardBg }]}
              onPress={() => signOut()}
              scaleDown={0.97}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[s.signOutText, { color: colors.error }]}>Sign out</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>
      </ScrollView>

      <Modal
        visible={appearanceModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAppearanceModalVisible(false)}
      >
        <SafeAreaView style={[s.modalSafe, { backgroundColor: C.screenBg }]}>
          <View style={[s.modalHeader, { borderBottomColor: C.border }]}>
            <TouchableOpacity
              onPress={() => setAppearanceModalVisible(false)}
              style={s.modalCloseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: C.textPrimary }]}>Appearance</Text>
            <View style={s.modalCloseBtn} />
          </View>
          <View style={s.modalScrollContent}>
            {APPEARANCE_OPTIONS.map((opt, i) => {
              const selected = colorScheme === opt.id
              return (
                <AnimatedPressable
                  key={opt.id}
                  style={[
                    s.appearanceOption,
                    { borderBottomColor: C.border },
                    i === APPEARANCE_OPTIONS.length - 1 && s.appearanceOptionLast,
                    selected && { backgroundColor: `${C.primary}08` },
                  ]}
                  onPress={() => {
                    setColorScheme(opt.id)
                    setAppearanceModalVisible(false)
                  }}
                  scaleDown={0.98}
                >
                  <LinearGradient
                    colors={selected ? [`${C.primary}20`, `${C.primary}08`] : [C.pillBg, C.pillBg]}
                    style={s.appearanceIconWrap}
                  >
                    <Ionicons name={opt.icon} size={22} color={selected ? C.primary : C.textMuted} />
                  </LinearGradient>
                  <View style={s.appearanceTextWrap}>
                    <Text style={[s.appearanceOptionLabel, { color: C.textPrimary }]}>{opt.label}</Text>
                    <Text style={[s.appearanceOptionDesc, { color: C.textMuted }]}>{opt.desc}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={24} color={C.primary} />}
                </AnimatedPressable>
              )
            })}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={preferencesModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreferencesModalVisible(false)}
      >
        <SafeAreaView style={[s.modalSafe, { backgroundColor: C.screenBg }]}>
          <View style={[s.modalHeader, { borderBottomColor: C.border }]}>
            <TouchableOpacity
              onPress={() => setPreferencesModalVisible(false)}
              style={s.modalCloseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: C.textPrimary }]}>Edit preferences</Text>
            <View style={s.modalCloseBtn} />
          </View>
          <ScrollView
            style={s.modalScroll}
            contentContainerStyle={s.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[s.modalSectionLabel, { color: C.textPrimary }]}>About you</Text>
            <Text style={[s.modalSectionHint, { color: C.textMuted }]}>We use this to understand you everywhere — separate from plan preferences below.</Text>
            {GENERAL_GROUPS.map((grp) => {
              const options = GENERAL_PREFERENCES.filter((p) => p.group === grp.key)
              if (options.length === 0) return null
              return (
                <View key={grp.key} style={s.modalGroupBlock}>
                  <Text style={[s.modalGroupLabel, { color: C.textMuted }]}>{grp.label}</Text>
                  <View style={s.prefChipGrid}>
                    {options.map((p) => {
                      const selected = editGeneralIds.includes(p.id)
                      return (
                        <AnimatedPressable
                          key={p.id}
                          style={[
                            s.prefChipCell,
                            { width: prefChipW, borderColor: p.color, backgroundColor: C.cardBgAlt },
                            selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                          ]}
                          onPress={() => toggleGeneral(p.id)}
                          scaleDown={0.95}
                        >
                          <Ionicons name={p.icon} size={18} color={selected ? p.color : C.textMuted} />
                          <Text style={[s.prefChipLabel, { color: C.textSecondary }, selected && { color: p.color, fontWeight: '700' }]} numberOfLines={2}>
                            {p.label}
                          </Text>
                        </AnimatedPressable>
                      )
                    })}
                  </View>
                </View>
              )
            })}
            <Text style={[s.modalSectionLabel, { marginTop: 20, color: C.textPrimary }]}>For your plans — activities</Text>
            <View style={s.prefChipGrid}>
              {PREFERENCES.map((p) => {
                const selected = editActivityIds.includes(p.id)
                return (
                  <AnimatedPressable
                    key={p.id}
                    style={[
                      s.prefChipCell,
                      { width: prefChipW, borderColor: p.color, backgroundColor: C.cardBgAlt },
                      selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                    ]}
                    onPress={() => toggleActivity(p.id)}
                    scaleDown={0.95}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : C.textMuted} />
                    <Text style={[s.prefChipLabel, { color: C.textSecondary }, selected && { color: p.color, fontWeight: '700' }]} numberOfLines={2}>
                      {p.label}
                    </Text>
                  </AnimatedPressable>
                )
              })}
            </View>
            <Text style={[s.modalSectionLabel, { marginTop: 16, color: C.textPrimary }]}>For your plans — food</Text>
            <View style={s.prefChipGrid}>
              {FOOD_CATEGORIES.map((p) => {
                const selected = editFoodIds.includes(p.id)
                return (
                  <AnimatedPressable
                    key={p.id}
                    style={[
                      s.prefChipCell,
                      { width: prefChipW, borderColor: p.color, backgroundColor: C.cardBgAlt },
                      selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                    ]}
                    onPress={() => toggleFood(p.id)}
                    scaleDown={0.95}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : C.textMuted} />
                    <Text style={[s.prefChipLabel, { color: C.textSecondary }, selected && { color: p.color, fontWeight: '700' }]} numberOfLines={2}>
                      {p.label}
                    </Text>
                  </AnimatedPressable>
                )
              })}
            </View>
            <Text style={[s.modalHint, { color: C.textMuted }]}>
              "About you" helps us understand you everywhere. Plan preferences are used when generating day plans; we prioritize, not filter.
            </Text>
          </ScrollView>
          <View style={[s.modalFooter, { borderTopColor: C.border }]}>
            <GradientButton onPress={handleSavePreferences} style={{ flex: 1 }}>
              <Text style={s.modalSaveBtnText}>Save</Text>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            </GradientButton>
          </View>
        </SafeAreaView>
      </Modal>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  heroBleed: { marginHorizontal: -16, marginTop: -8, marginBottom: 8 },
  heroGradient: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    paddingBottom: 22,
  },
  heroInner: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 16 },
  avatarOuter: { marginBottom: 12 },
  avatarGradientRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 34, fontWeight: '800' },
  userName: { fontSize: 23, fontWeight: '800', marginBottom: 4, letterSpacing: -0.4 },
  userSub: { fontSize: 14, fontWeight: '500', marginBottom: 18 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', width: '100%' },
  statTouchable: { borderRadius: 18 },
  statCard: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  statValue: { fontSize: 19, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionStack: { gap: 26, paddingTop: 8 },
  ctaSection: { paddingTop: 12, paddingHorizontal: 0 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  signOutText: { fontSize: 16, fontWeight: '700' },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 20, paddingBottom: 24 },
  modalSectionLabel: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  modalSectionHint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  modalGroupBlock: { marginBottom: 14 },
  modalGroupLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  prefChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  prefChipCell: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  prefChipLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  modalHint: { fontSize: 13, marginTop: 20, lineHeight: 20 },
  modalFooter: { padding: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, borderTopWidth: 1 },
  modalSaveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  appearanceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
    borderBottomWidth: 1,
  },
  appearanceOptionLast: { borderBottomWidth: 0 },
  appearanceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceTextWrap: { flex: 1 },
  appearanceOptionLabel: { fontSize: 16, fontWeight: '600' },
  appearanceOptionDesc: { fontSize: 13, marginTop: 2 },
})