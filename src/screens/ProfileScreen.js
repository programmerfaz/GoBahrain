import React, { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  SafeAreaView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenContainer from '../components/ScreenContainer'
import { useTheme } from '../context/ThemeContext'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useAuth } from '../context/AuthContext'
import { GENERAL_GROUPS } from '../constants/preferences'
import { gradients } from '../theme/designTokens'
import { FadeInView, StaggerChildren, AnimatedPressable, GradientButton } from '../components/AnimatedUI'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60

const APPEARANCE_OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sunny-outline', desc: 'Always use light theme' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline', desc: 'Always use dark theme' },
  { id: 'system', label: 'System', icon: 'phone-portrait-outline', desc: 'Match device settings' },
]

const ProfileRow = ({ icon, iconColor, label, onPress, showChevron = true, isLast, C }) => (
  <AnimatedPressable
    style={[profileRowStyles.row, { borderBottomColor: C.border }, isLast && profileRowStyles.rowLast]}
    onPress={onPress}
    disabled={!onPress}
    scaleDown={0.98}
  >
    <LinearGradient
      colors={[`${iconColor || C.primary}20`, `${iconColor || C.primary}08`]}
      style={profileRowStyles.rowIconWrap}
    >
      <Ionicons name={icon} size={20} color={iconColor || C.primary} />
    </LinearGradient>
    <Text style={[profileRowStyles.rowLabel, { color: C.textPrimary }]} numberOfLines={1}>
      {label}
    </Text>
    {showChevron && (
      <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
    )}
  </AnimatedPressable>
)

const profileRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
})

const Section = ({ title, children, C, delay = 0 }) => (
  <FadeInView delay={delay} from={16}>
    <View style={sectionStyles.section}>
      <Text style={[sectionStyles.sectionTitle, { color: C.textPrimary }]}>{title}</Text>
      <View style={[sectionStyles.card, { backgroundColor: C.cardBg, borderColor: C.border }]}>
        {children}
      </View>
    </View>
  </FadeInView>
)

const sectionStyles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 10, paddingHorizontal: 2 },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
})

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
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

  return (
    <ScreenContainer showHeader headerTitle="Profile">
      <ScrollView
        style={[s.scroll, { backgroundColor: C.screenBg }]}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPadding + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <FadeInView delay={0} from={24}>
          <View style={s.headerBlock}>
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
            <Text style={[s.userName, { color: C.textPrimary }]}>{userName}</Text>
            <Text style={[s.userSub, { color: C.textMuted }]}>{userEmail}</Text>

            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: `${C.primary}10` }]}>
                <Ionicons name="heart" size={16} color={C.primary} />
                <Text style={[s.statValue, { color: C.textPrimary }]}>
                  {(preferences?.activityIds?.length || 0) + (preferences?.foodIds?.length || 0)}
                </Text>
                <Text style={[s.statLabel, { color: C.textMuted }]}>Preferences</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: isDark ? 'rgba(167,139,250,0.1)' : 'rgba(124,58,237,0.06)' }]}>
                <Ionicons name="calendar" size={16} color={isDark ? '#A78BFA' : '#7C3AED'} />
                <Text style={[s.statValue, { color: C.textPrimary }]}>0</Text>
                <Text style={[s.statLabel, { color: C.textMuted }]}>Plans</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: isDark ? 'rgba(16,185,129,0.1)' : 'rgba(5,150,105,0.06)' }]}>
                <Ionicons name="star" size={16} color={isDark ? '#10B981' : '#059669'} />
                <Text style={[s.statValue, { color: C.textPrimary }]}>0</Text>
                <Text style={[s.statLabel, { color: C.textMuted }]}>Reviews</Text>
              </View>
            </View>
          </View>
        </FadeInView>

        <Section title="Account" C={C} delay={100}>
          <ProfileRow icon="person-outline" label="Edit profile" onPress={() => {}} C={C} />
          <ProfileRow icon="notifications-outline" label="Notifications" onPress={() => {}} C={C} />
          <ProfileRow icon="lock-closed-outline" label="Privacy & security" onPress={() => {}} isLast C={C} />
        </Section>

        <Section title="Preferences" C={C} delay={200}>
          <ProfileRow
            icon="heart-outline"
            iconColor={C.primary}
            label="Activity & food preferences"
            onPress={() => setPreferencesModalVisible(true)}
            C={C}
          />
          <ProfileRow icon="language-outline" label="Language" onPress={() => {}} C={C} />
          <ProfileRow icon="moon-outline" label="Appearance" onPress={() => setAppearanceModalVisible(true)} isLast C={C} />
        </Section>

        <Section title="Support" C={C} delay={300}>
          <ProfileRow icon="help-circle-outline" iconColor={C.textSecondary} label="Help & FAQ" onPress={() => {}} C={C} />
          <ProfileRow icon="chatbubble-outline" iconColor={C.textSecondary} label="Contact us" onPress={() => {}} C={C} />
          <ProfileRow icon="document-text-outline" iconColor={C.textSecondary} label="About Go Bahrain" onPress={() => {}} isLast C={C} />
        </Section>

        <FadeInView delay={400} from={10}>
          <View style={s.ctaSection}>
            <AnimatedPressable
              style={[s.signOutBtn, { borderColor: colors.error + '40' }]}
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
                  <View style={s.modalChipRow}>
                    {options.map((p) => {
                      const selected = editGeneralIds.includes(p.id)
                      return (
                        <AnimatedPressable
                          key={p.id}
                          style={[
                            s.modalChip,
                            { borderColor: p.color, backgroundColor: C.cardBgAlt },
                            selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                          ]}
                          onPress={() => toggleGeneral(p.id)}
                          scaleDown={0.95}
                        >
                          <Ionicons name={p.icon} size={18} color={selected ? p.color : C.textMuted} />
                          <Text style={[s.modalChipLabel, { color: C.textSecondary }, selected && { color: p.color, fontWeight: '700' }]} numberOfLines={1}>
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
            <View style={s.modalChipRow}>
              {PREFERENCES.map((p) => {
                const selected = editActivityIds.includes(p.id)
                return (
                  <AnimatedPressable
                    key={p.id}
                    style={[
                      s.modalChip,
                      { borderColor: p.color, backgroundColor: C.cardBgAlt },
                      selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                    ]}
                    onPress={() => toggleActivity(p.id)}
                    scaleDown={0.95}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : C.textMuted} />
                    <Text style={[s.modalChipLabel, { color: C.textSecondary }, selected && { color: p.color, fontWeight: '700' }]}>
                      {p.label}
                    </Text>
                  </AnimatedPressable>
                )
              })}
            </View>
            <Text style={[s.modalSectionLabel, { marginTop: 16, color: C.textPrimary }]}>For your plans — food</Text>
            <View style={s.modalChipRow}>
              {FOOD_CATEGORIES.map((p) => {
                const selected = editFoodIds.includes(p.id)
                return (
                  <AnimatedPressable
                    key={p.id}
                    style={[
                      s.modalChip,
                      { borderColor: p.color, backgroundColor: C.cardBgAlt },
                      selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                    ]}
                    onPress={() => toggleFood(p.id)}
                    scaleDown={0.95}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : C.textMuted} />
                    <Text style={[s.modalChipLabel, { color: C.textSecondary }, selected && { color: p.color, fontWeight: '700' }]}>
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  headerBlock: { alignItems: 'center', paddingVertical: 20, marginBottom: 8 },
  avatarOuter: { marginBottom: 16 },
  avatarGradientRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 32, fontWeight: '800' },
  userName: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  userSub: { fontSize: 14, fontWeight: '500', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    gap: 4,
    minWidth: 90,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  ctaSection: { paddingTop: 8, paddingHorizontal: 2 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
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
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalChipLabel: { fontSize: 14, fontWeight: '500' },
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
