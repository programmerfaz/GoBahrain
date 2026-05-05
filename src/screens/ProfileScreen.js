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
  TextInput,
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
import { LUXURY, luxuryCardShadow, luxurySoftShadow } from '../theme/luxuryPremium'
import { FadeInView, AnimatedPressable, GradientButton } from '../components/AnimatedUI'
import { fetchMyCommunityPosts, getCommunityUserId } from '../services/community'
import { buildAndPersistUserPersona } from '../services/personalization'
import { invalidatePersonalizationCache } from '../services/feedService'
import { listSavedPlans } from '../services/savedPlans'

const TILE_GAP = 10
const TILE_COLS = 3

const APPEARANCE_OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sunny-outline', desc: 'Always use light theme' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline', desc: 'Always use dark theme' },
  { id: 'system', label: 'System', icon: 'phone-portrait-outline', desc: 'Match device settings' },
]

const SettingsSection = ({ title, C, children }) => (
  <View style={settingsStyles.sectionWrap}>
    <Text style={[settingsStyles.sectionTitle, { color: C.textSecondary }]}>{title}</Text>
    <View style={settingsStyles.feedCardOuter}>
      <View style={[settingsStyles.feedCardInner, { backgroundColor: C.cardBg, borderColor: C.borderLight }]}>
        {children}
      </View>
    </View>
  </View>
)

const SettingsRow = ({ icon, iconColor, label, value, onPress, isLast = false, C, danger = false }) => (
  <AnimatedPressable
    style={[
      settingsStyles.row,
      !isLast && [settingsStyles.rowDivider, { borderBottomColor: C.border }],
    ]}
    onPress={onPress}
    disabled={!onPress}
    scaleDown={0.985}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <View style={settingsStyles.rowLeft}>
      <View style={[settingsStyles.rowIconWrap, { backgroundColor: `${(iconColor || C.primary)}20` }]}>
        <Ionicons name={icon} size={18} color={danger ? C.error : (iconColor || C.primary)} />
      </View>
      <Text style={[settingsStyles.rowLabel, { color: danger ? C.error : C.textPrimary }]}>{label}</Text>
    </View>
    <View style={settingsStyles.rowRight}>
      {!!value && <Text style={[settingsStyles.rowValue, { color: C.textMuted }]} numberOfLines={1}>{value}</Text>}
      {!!onPress && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={danger ? C.error : C.textMuted}
          style={settingsStyles.rowChevron}
        />
      )}
    </View>
  </AnimatedPressable>
)

const settingsStyles = StyleSheet.create({
  /** Same as HomeScreen feed `cardOuter` / `cardInner` */
  feedCardOuter: {
    marginHorizontal: 12,
    marginBottom: 0,
    borderRadius: LUXURY.radiusCard,
    ...luxuryCardShadow,
  },
  feedCardInner: {
    borderRadius: LUXURY.radiusCard,
    overflow: 'hidden',
    borderWidth: 1,
  },
  sectionWrap: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
    marginLeft: 16,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  rowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    flexShrink: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    maxWidth: '46%',
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowChevron: {
    marginLeft: 6,
    marginTop: 1,
  },
})

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { width: winW, height: winH } = useWindowDimensions()
  const navigation = useNavigation()
  const { colors, colorScheme, setColorScheme, isDark } = useTheme()
  const {
    preferences,
    setPreferences,
    GENERAL_PREFERENCES,
    PREFERENCES,
    FOOD_CATEGORIES,
  } = useUserPreferences()
  const { profile, user: authUser, signOut } = useAuth()
  const [preferencesModalVisible, setPreferencesModalVisible] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [appearanceModalVisible, setAppearanceModalVisible] = useState(false)
  const [editGeneralIds, setEditGeneralIds] = useState([])
  const [editActivityIds, setEditActivityIds] = useState([])
  const [editFoodIds, setEditFoodIds] = useState([])
  const [editIdealDay, setEditIdealDay] = useState('')
  const [editAvoidList, setEditAvoidList] = useState('')
  const [myReviewCount, setMyReviewCount] = useState(0)
  const [savedPlansCount, setSavedPlansCount] = useState(0)
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

  const loadSavedPlansCount = useCallback(async () => {
    try {
      const list = await listSavedPlans()
      setSavedPlansCount(Array.isArray(list) ? list.length : 0)
    } catch {
      setSavedPlansCount(0)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadMyReviewCount()
      loadSavedPlansCount()
    }, [loadMyReviewCount, loadSavedPlansCount])
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
    error: colors.error,
    screenBg: colors.background,
    cardBg: colors.surface,
    cardBgAlt: colors.borderLight,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    border: colors.border,
    borderLight: colors.borderLight,
    pillBg: colors.borderLight,
    accent2: colors.accent2,
    accent3: colors.accent3,
  }), [colors])

  useEffect(() => {
    if (preferencesModalVisible) {
      setEditGeneralIds(Array.isArray(preferences?.generalIds) ? preferences.generalIds : [])
      setEditActivityIds(Array.isArray(preferences?.activityIds) ? preferences.activityIds : [])
      setEditFoodIds(Array.isArray(preferences?.foodIds) ? preferences.foodIds : [])
      setEditIdealDay(String(preferences?.profileAnswers?.idealDay || ''))
      setEditAvoidList(String(preferences?.profileAnswers?.avoidList || ''))
    }
  }, [preferencesModalVisible, preferences?.generalIds, preferences?.activityIds, preferences?.foodIds, preferences?.profileAnswers?.idealDay, preferences?.profileAnswers?.avoidList])

  const toggleGeneral = (id) => setEditGeneralIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleActivity = (id) => setEditActivityIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleFood = (id) => setEditFoodIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const handleSavePreferences = async () => {
    if (isSavingPreferences) return
    setIsSavingPreferences(true)
    try {
      const profileAnswers = {
        idealDay: editIdealDay.trim(),
        avoidList: editAvoidList.trim(),
      }
      const viewerUType =
        String(profile?.user?.u_type || '').toLowerCase() === 'tourist' ? 'tourist' : 'local'
      const profileSummary = await buildAndPersistUserPersona({
        generalIds: editGeneralIds,
        activityIds: editActivityIds,
        foodIds: editFoodIds,
        profileAnswers,
        viewerUType,
      })
      await setPreferences({
        generalIds: editGeneralIds,
        activityIds: editActivityIds,
        foodIds: editFoodIds,
        profileAnswers,
        profileSummary,
      })
      invalidatePersonalizationCache()
      setPreferencesModalVisible(false)
    } catch (e) {
      const msg = typeof e?.message === 'string' && e.message.length ? e.message : 'Could not save preferences. Try again.'
      Alert.alert('Save failed', msg)
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const userName = profile?.account?.user_name || authUser?.email?.split('@')[0] || 'User'
  const userInitial = (profile?.account?.user_name || authUser?.email || 'U').charAt(0).toUpperCase()
  const userEmail = authUser?.email ?? 'Signed in'
  const rawPhone = profile?.account?.phone ?? authUser?.user_metadata?.phone
  const userPhone =
    rawPhone == null || rawPhone === ''
      ? ''
      : String(rawPhone).trim()
  const accountTypeResolved =
    profile?.account_type ?? profile?.account?.account_type ?? authUser?.user_metadata?.account_type
  const isClientAccount = String(accountTypeResolved || '').toLowerCase() === 'client'

  const prefCount =
    (preferences?.generalIds?.length || 0)
    + (preferences?.activityIds?.length || 0)
    + (preferences?.foodIds?.length || 0)

  /** Home feed cards: marginHorizontal 12 + inner padding 14 each side */
  const feedCardContentW = Math.max(1, winW - 24 - 28)
  const statGap = 10
  const statW = Math.max(1, Math.floor((feedCardContentW - statGap) / 2))
  const prefChipGap = 10
  const prefChipW = Math.max(96, Math.floor((winW - 40 - prefChipGap * 2) / 3))

  const avatarScale = avatarPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  })
  const avatarFade = avatarPulse

  const handleResetOnboarding = useCallback(() => {
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
  }, [colors.warning])

  const appearanceLabel = useMemo(() => {
    if (colorScheme === 'dark') return 'Dark'
    if (colorScheme === 'light') return 'Light'
    return 'System'
  }, [colorScheme])

  return (
    <ScreenContainer style={{ flex: 1, backgroundColor: C.screenBg }}>
      <View style={{ flex: 1 }}>
        <View style={s.screenGradientWrap} pointerEvents="none">
          <LinearGradient
            colors={isDark ? gradients.heroDark : gradients.heroLight}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <ScrollView
          style={[s.scroll, { flex: 1, backgroundColor: 'transparent' }]}
          contentContainerStyle={[s.scrollContent, { paddingTop: 0, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
        <FadeInView delay={0} from={20} duration={420} springUp>
          <View style={[s.homeHeader, { paddingTop: insets.top + 4 }]}>
            <View style={s.headerSideSpacer} />
            <View style={s.headerTitleWrap}>
              <Text style={[s.homeHeaderTitle, { color: C.primary }]}>Profile</Text>
            </View>
            <View style={s.headerSideSpacer} />
          </View>
        </FadeInView>

        <FadeInView delay={70} from={24} duration={500} springUp style={s.profileIdentityOuter}>
          <View style={settingsStyles.feedCardOuter}>
            <View style={[settingsStyles.feedCardInner, { backgroundColor: C.cardBg, borderColor: C.borderLight }]}>
              <View style={s.profileHeaderRow}>
                <FadeInView delay={120} from={16} duration={420} springUp>
                  <Animated.View style={{ opacity: avatarFade, transform: [{ scale: avatarScale }] }}>
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
                  </Animated.View>
                </FadeInView>
                <FadeInView delay={160} from={16} duration={420} springUp style={s.profileHeaderText}>
                  <Text style={[s.profileDisplayName, { color: C.textPrimary }]} numberOfLines={1}>
                    {userName}
                  </Text>
                  <Text style={[s.profileEmailLine, { color: C.textSecondary }]} numberOfLines={2}>
                    {userEmail}
                  </Text>
                  {isClientAccount && !!userPhone && (
                    <Text
                      style={[s.profilePhoneLine, { color: C.textSecondary }]}
                      numberOfLines={1}
                      accessibilityLabel={`Phone number ${userPhone}`}
                    >
                      {userPhone}
                    </Text>
                  )}
                  <LinearGradient
                    colors={isDark ? ['rgba(230,57,80,0.22)', 'rgba(124,58,237,0.16)'] : ['rgba(200,16,46,0.12)', 'rgba(124,58,237,0.08)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[s.profileTierPill, { borderColor: `${C.primary}40` }]}
                  >
                    <Ionicons name="diamond-outline" size={12} color={C.primary} />
                    <Text style={[s.profileTierText, { color: C.primary }]}>Premium Explorer</Text>
                  </LinearGradient>
                </FadeInView>
              </View>
              <View style={[s.statsRow, { gap: statGap, paddingHorizontal: 14, paddingBottom: 16, borderTopColor: C.borderLight }]}>
                <FadeInView delay={220} from={18} duration={380} springUp>
                  <TouchableOpacity
                    style={s.statTouchable}
                    onPress={() => setPreferencesModalVisible(true)}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel="Edit travel and food preferences"
                  >
                    <View
                      style={[
                        s.statCard,
                        { width: statW, backgroundColor: `${C.primary}12`, borderColor: C.borderLight },
                      ]}
                    >
                      <Ionicons name="heart" size={17} color={C.primary} />
                      <Text style={[s.statValue, { color: C.textPrimary }]}>{prefCount}</Text>
                      <Text style={[s.statLabel, { color: C.textMuted }]}>Preferences</Text>
                    </View>
                  </TouchableOpacity>
                </FadeInView>
                <FadeInView delay={260} from={18} duration={380} springUp>
                  <TouchableOpacity
                    style={s.statTouchable}
                    onPress={() => navigation.navigate('MyReviews')}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel="Open my reviews"
                  >
                    <View
                      style={[
                        s.statCard,
                        {
                          width: statW,
                          backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : colors.successMuted,
                          borderColor: C.borderLight,
                        },
                      ]}
                    >
                      <Ionicons name="star" size={17} color={isDark ? '#10B981' : colors.success} />
                      <Text style={[s.statValue, { color: C.textPrimary }]}>{myReviewCount}</Text>
                      <Text style={[s.statLabel, { color: C.textMuted }]}>Reviews</Text>
                    </View>
                  </TouchableOpacity>
                </FadeInView>
              </View>
            </View>
          </View>
        </FadeInView>

        <View style={s.sectionStack}>
          <FadeInView delay={360} from={18} duration={420} springUp>
            <SettingsSection title="Account" C={C}>
              <FadeInView delay={390} from={14} duration={320} springUp>
                <SettingsRow
                  icon="person-outline"
                  iconColor={C.primary}
                  label="Edit profile"
                  value="Coming soon"
                  C={C}
                />
              </FadeInView>
              <FadeInView delay={420} from={14} duration={320} springUp>
                <SettingsRow
                  icon="chatbubbles-outline"
                  iconColor={isDark ? '#10B981' : '#059669'}
                  label="My reviews"
                  value={String(myReviewCount)}
                  onPress={() => navigation.navigate('MyReviews')}
                  C={C}
                />
              </FadeInView>
              <FadeInView delay={450} from={14} duration={320} springUp>
                <SettingsRow
                  icon="bookmark-outline"
                  iconColor={isDark ? '#A78BFA' : '#7C3AED'}
                  label="Saved plans"
                  value={String(savedPlansCount)}
                  onPress={() => navigation.navigate('SavedPlans')}
                  C={C}
                />
              </FadeInView>
              <FadeInView delay={480} from={14} duration={320} springUp>
                <SettingsRow
                  icon="heart-outline"
                  iconColor={C.primary}
                  label="Activity & food preferences"
                  value={`${prefCount} selected`}
                  onPress={() => setPreferencesModalVisible(true)}
                  C={C}
                  isLast
                />
              </FadeInView>
            </SettingsSection>
          </FadeInView>

          <FadeInView delay={500} from={18} duration={420} springUp>
            <SettingsSection title="App" C={C}>
              <FadeInView delay={530} from={14} duration={320} springUp>
                <SettingsRow
                  icon="color-palette-outline"
                  iconColor={isDark ? '#A78BFA' : '#7C3AED'}
                  label="Appearance"
                  value={appearanceLabel}
                  onPress={() => setAppearanceModalVisible(true)}
                  C={C}
                />
              </FadeInView>
              <FadeInView delay={560} from={14} duration={320} springUp>
                <SettingsRow
                  icon="language-outline"
                  iconColor={C.accent3}
                  label="Language"
                  value="English"
                  C={C}
                  isLast
                />
              </FadeInView>
            </SettingsSection>
          </FadeInView>

          <FadeInView delay={610} from={18} duration={420} springUp>
            <SettingsSection title="Support" C={C}>
              <FadeInView delay={640} from={14} duration={320} springUp>
                <SettingsRow icon="help-circle-outline" iconColor={C.textSecondary} label="Help & FAQ" value="Coming soon" C={C} />
              </FadeInView>
              <FadeInView delay={670} from={14} duration={320} springUp>
                <SettingsRow icon="chatbubble-outline" iconColor={C.textSecondary} label="Contact us" value="Coming soon" C={C} />
              </FadeInView>
              <FadeInView delay={700} from={14} duration={320} springUp>
                <SettingsRow icon="document-text-outline" iconColor={C.textSecondary} label="About SiyahaBH" value="Version info" C={C} isLast />
              </FadeInView>
            </SettingsSection>
          </FadeInView>

          {__DEV__ && (
            <FadeInView delay={750} from={16} duration={380} springUp>
              <SettingsSection title="Developer" C={C}>
                <FadeInView delay={780} from={14} duration={320} springUp>
                  <SettingsRow
                    icon="refresh-outline"
                    iconColor={colors.warning}
                    label="Reset onboarding"
                    onPress={handleResetOnboarding}
                    C={C}
                    isLast
                  />
                </FadeInView>
              </SettingsSection>
            </FadeInView>
          )}

          <FadeInView delay={820} from={16} duration={380} springUp>
            <SettingsSection title="Session" C={C}>
              <FadeInView delay={850} from={14} duration={320} springUp>
                <SettingsRow
                  icon="log-out-outline"
                  iconColor={colors.error}
                  label="Sign out"
                  onPress={() => signOut()}
                  C={C}
                  danger
                  isLast
                />
              </FadeInView>
            </SettingsSection>
          </FadeInView>
        </View>
        </ScrollView>
      </View>

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
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        onRequestClose={() => setPreferencesModalVisible(false)}
      >
        <SafeAreaView
          style={[
            s.modalSafe,
            { backgroundColor: C.screenBg },
            Platform.OS === 'web' && winH > 0 ? { minHeight: winH } : null,
          ]}
        >
          <View style={s.modalPrefsColumn}>
            <View style={[s.modalHeader, { borderBottomColor: C.border }]}>
              <TouchableOpacity
                onPress={() => setPreferencesModalVisible(false)}
                style={s.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close without saving"
              >
                <Ionicons name="close" size={26} color={C.textPrimary} />
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: C.textPrimary, flex: 1, textAlign: 'center' }]} numberOfLines={1}>
                Edit preferences
              </Text>
              <TouchableOpacity
                onPress={handleSavePreferences}
                disabled={isSavingPreferences}
                style={s.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={isSavingPreferences ? 'Saving preferences' : 'Save preferences'}
              >
                <Text
                  style={[
                    s.modalHeaderSaveText,
                    { color: C.primary, opacity: isSavingPreferences ? 0.45 : 1 },
                  ]}
                >
                  {isSavingPreferences ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={s.modalScroll}
              contentContainerStyle={s.modalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            <Text style={[s.modalSectionLabel, { color: C.textPrimary }]}>Travel profile questions</Text>
            <Text style={[s.modalSectionHint, { color: C.textMuted }]}>Answer these so we can understand your preferences and personalize recommendations across the app.</Text>
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
                            {
                              width: prefChipW,
                              borderWidth: 2,
                              borderColor: selected ? p.color : `${p.color}55`,
                              backgroundColor: selected ? p.color + '22' : C.cardBgAlt,
                            },
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
            <Text style={[s.modalSectionLabel, { marginTop: 20, color: C.textPrimary }]}>What experiences should your plan focus on?</Text>
            <View style={s.prefChipGrid}>
              {PREFERENCES.map((p) => {
                const selected = editActivityIds.includes(p.id)
                return (
                  <AnimatedPressable
                    key={p.id}
                    style={[
                      s.prefChipCell,
                      {
                        width: prefChipW,
                        borderWidth: 2,
                        borderColor: selected ? p.color : `${p.color}55`,
                        backgroundColor: selected ? p.color + '22' : C.cardBgAlt,
                      },
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
            <Text style={[s.modalSectionLabel, { marginTop: 16, color: C.textPrimary }]}>What food styles should we prioritize?</Text>
            <View style={s.prefChipGrid}>
              {FOOD_CATEGORIES.map((p) => {
                const selected = editFoodIds.includes(p.id)
                return (
                  <AnimatedPressable
                    key={p.id}
                    style={[
                      s.prefChipCell,
                      {
                        width: prefChipW,
                        borderWidth: 2,
                        borderColor: selected ? p.color : `${p.color}55`,
                        backgroundColor: selected ? p.color + '22' : C.cardBgAlt,
                      },
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
            <Text style={[s.modalSectionLabel, { marginTop: 20, color: C.textPrimary }]}>Your perfect Bahrain day (typed)</Text>
            <TextInput
              value={editIdealDay}
              onChangeText={setEditIdealDay}
              placeholder="Example: Specialty coffee, one cultural stop, sunset seaside walk, local dinner"
              placeholderTextColor={C.textMuted}
              multiline
              textAlignVertical="top"
              style={[s.profileTextInput, { color: C.textPrimary, backgroundColor: C.cardBgAlt, borderColor: C.border }]}
            />
            <Text style={[s.modalSectionLabel, { marginTop: 14, color: C.textPrimary }]}>Hard no's to avoid (typed)</Text>
            <TextInput
              value={editAvoidList}
              onChangeText={setEditAvoidList}
              placeholder="Example: No loud venues, no shellfish, avoid long drives"
              placeholderTextColor={C.textMuted}
              multiline
              textAlignVertical="top"
              style={[s.profileTextInput, { color: C.textPrimary, backgroundColor: C.cardBgAlt, borderColor: C.border }]}
            />
            <Text style={[s.modalHint, { color: C.textMuted }]}>
              Your travel profile personalizes the app experience. Activity and food answers shape itinerary suggestions so each plan fits you better.
            </Text>
          </ScrollView>
            <View style={[s.modalFooter, { borderTopColor: C.border, backgroundColor: C.screenBg }]}>
              <GradientButton
                onPress={handleSavePreferences}
                disabled={isSavingPreferences}
                style={s.modalSaveButtonWide}
              >
                <Text style={s.modalSaveBtnText}>{isSavingPreferences ? 'Saving…' : 'Save changes'}</Text>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              </GradientButton>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  screenGradientWrap: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { paddingHorizontal: 0, paddingTop: 0 },
  /** Home `instagramHeader` + `instagramLogo` */
  homeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 44,
    marginBottom: 10,
  },
  headerSideSpacer: { width: 44, height: 44 },
  headerTitleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  homeHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  profileHeaderText: { flex: 1, minWidth: 0 },
  profileDisplayName: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  profileEmailLine: { fontSize: 13, fontWeight: '500', marginTop: 4, lineHeight: 18 },
  profilePhoneLine: { fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  profileTierPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: LUXURY.radiusPill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileTierText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  avatarGradientRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 24, fontWeight: '800' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  statTouchable: { borderRadius: LUXURY.radiusInput },
  statCard: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: LUXURY.radiusInput,
    borderWidth: 1,
    gap: 5,
    ...luxurySoftShadow,
  },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.35 },
  profileIdentityOuter: { marginBottom: 16 },
  sectionStack: { gap: 0, paddingTop: 4 },
  ctaSection: { paddingTop: 12, paddingHorizontal: 0 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: LUXURY.radiusPill,
    borderWidth: 1.5,
    ...luxurySoftShadow,
  },
  signOutText: { fontSize: 16, fontWeight: '700' },
  modalSafe: { flex: 1 },
  /** Column so the footer stays above the fold; `minHeight: 0` lets ScrollView shrink on web. */
  modalPrefsColumn: { flex: 1, minHeight: 0, width: '100%' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  modalCloseBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalHeaderSaveText: { fontSize: 16, fontWeight: '700' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalScroll: { flex: 1, minHeight: 0 },
  modalScrollContent: { padding: 20, paddingBottom: 32 },
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
    borderRadius: LUXURY.radiusChip + 2,
    ...luxurySoftShadow,
  },
  prefChipLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  profileTextInput: {
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  modalHint: { fontSize: 13, marginTop: 20, lineHeight: 20 },
  modalFooter: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    flexShrink: 0,
    width: '100%',
  },
  modalSaveButtonWide: { width: '100%', alignSelf: 'stretch' },
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
    borderRadius: LUXURY.radiusChip + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceTextWrap: { flex: 1 },
  appearanceOptionLabel: { fontSize: 16, fontWeight: '600' },
  appearanceOptionDesc: { fontSize: 13, marginTop: 2 },
})