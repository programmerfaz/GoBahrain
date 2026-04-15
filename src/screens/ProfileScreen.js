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
import { LUXURY, luxuryElevated, luxurySoftShadow } from '../theme/luxuryPremium'
import { FadeInView, AnimatedPressable, GradientButton } from '../components/AnimatedUI'
import { fetchMyCommunityPosts, getCommunityUserId } from '../services/community'
import { buildAndPersistUserPersona } from '../services/personalization'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60
const TILE_GAP = 10
const TILE_COLS = 3

const APPEARANCE_OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sunny-outline', desc: 'Always use light theme' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline', desc: 'Always use dark theme' },
  { id: 'system', label: 'System', icon: 'phone-portrait-outline', desc: 'Match device settings' },
]

const SettingsSection = ({ title, C, children }) => (
  <View style={settingsStyles.sectionWrap}>
    <Text style={[settingsStyles.sectionTitle, { color: C.textMuted }]}>{title}</Text>
    <View style={[settingsStyles.groupCard, { backgroundColor: C.cardBg, borderColor: C.border }]}>
      {children}
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
  sectionWrap: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    marginBottom: 8,
    marginLeft: 6,
  },
  groupCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...luxurySoftShadow,
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
  const [editIdealDay, setEditIdealDay] = useState('')
  const [editAvoidList, setEditAvoidList] = useState('')
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
    error: colors.error,
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
      setEditIdealDay(String(preferences?.profileAnswers?.idealDay || ''))
      setEditAvoidList(String(preferences?.profileAnswers?.avoidList || ''))
    }
  }, [preferencesModalVisible, preferences?.generalIds, preferences?.activityIds, preferences?.foodIds, preferences?.profileAnswers?.idealDay, preferences?.profileAnswers?.avoidList])

  const toggleGeneral = (id) => setEditGeneralIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleActivity = (id) => setEditActivityIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleFood = (id) => setEditFoodIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const handleSavePreferences = async () => {
    const profileAnswers = {
      idealDay: editIdealDay.trim(),
      avoidList: editAvoidList.trim(),
    }
    const profileSummary = await buildAndPersistUserPersona({
      generalIds: editGeneralIds,
      activityIds: editActivityIds,
      foodIds: editFoodIds,
      profileAnswers,
    })
    await setPreferences({
      generalIds: editGeneralIds,
      activityIds: editActivityIds,
      foodIds: editFoodIds,
      profileAnswers,
      profileSummary,
    })
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
            <SettingsSection title="Account" C={C}>
              <SettingsRow
                icon="person-outline"
                iconColor={C.primary}
                label="Edit profile"
                value="Coming soon"
                C={C}
              />
              <SettingsRow
                icon="chatbubbles-outline"
                iconColor={isDark ? '#10B981' : '#059669'}
                label="My reviews"
                value={String(myReviewCount)}
                onPress={() => navigation.navigate('MyReviews')}
                C={C}
              />
              <SettingsRow
                icon="heart-outline"
                iconColor={C.primary}
                label="Activity & food preferences"
                value={`${prefCount} selected`}
                onPress={() => setPreferencesModalVisible(true)}
                C={C}
                isLast
              />
            </SettingsSection>
          </FadeInView>

          <FadeInView delay={200} from={16} duration={400}>
            <SettingsSection title="App" C={C}>
              <SettingsRow
                icon="color-palette-outline"
                iconColor={isDark ? '#A78BFA' : '#7C3AED'}
                label="Appearance"
                value={appearanceLabel}
                onPress={() => setAppearanceModalVisible(true)}
                C={C}
              />
              <SettingsRow
                icon="language-outline"
                iconColor={C.accent3}
                label="Language"
                value="English"
                C={C}
                isLast
              />
            </SettingsSection>
          </FadeInView>

          <FadeInView delay={280} from={16} duration={400}>
            <SettingsSection title="Support" C={C}>
              <SettingsRow icon="help-circle-outline" iconColor={C.textSecondary} label="Help & FAQ" value="Coming soon" C={C} />
              <SettingsRow icon="chatbubble-outline" iconColor={C.textSecondary} label="Contact us" value="Coming soon" C={C} />
              <SettingsRow icon="document-text-outline" iconColor={C.textSecondary} label="About Go Bahrain" value="Version info" C={C} isLast />
            </SettingsSection>
          </FadeInView>

          {__DEV__ && (
            <FadeInView delay={340} from={14} duration={380}>
              <SettingsSection title="Developer" C={C}>
                <SettingsRow
                  icon="refresh-outline"
                  iconColor={colors.warning}
                  label="Reset onboarding"
                  onPress={handleResetOnboarding}
                  C={C}
                  isLast
                />
              </SettingsSection>
            </FadeInView>
          )}

          <FadeInView delay={400} from={12} duration={360}>
            <SettingsSection title="Session" C={C}>
              <SettingsRow
                icon="log-out-outline"
                iconColor={colors.error}
                label="Sign out"
                onPress={() => signOut()}
                C={C}
                danger
                isLast
              />
            </SettingsSection>
          </FadeInView>
        </View>
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
    borderBottomLeftRadius: LUXURY.radiusHero,
    borderBottomRightRadius: LUXURY.radiusHero,
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
  statTouchable: { borderRadius: LUXURY.radiusInput },
  statCard: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: LUXURY.radiusInput,
    borderWidth: 1,
    gap: 6,
    ...luxurySoftShadow,
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
    borderRadius: LUXURY.radiusPill,
    borderWidth: 1.5,
    ...luxurySoftShadow,
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
    borderRadius: LUXURY.radiusChip + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceTextWrap: { flex: 1 },
  appearanceOptionLabel: { fontSize: 16, fontWeight: '600' },
  appearanceOptionDesc: { fontSize: 13, marginTop: 2 },
})