import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { GENERAL_GROUPS } from '../constants/preferences';

// Match app theme (HomeScreen, CommunitiesScreen, ScreenContainer)
const COLORS = {
  primary: '#C8102E',
  screenBg: '#FFFFFF',
  cardBg: '#FFFFFF',
  cardBgAlt: '#F9FAFB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: 'rgba(209,213,219,0.7)',
  pillBg: '#F3F4F6',
};

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;

function ProfileRow({ icon, iconColor, label, onPress, showChevron = true, isLast }) {
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.rowIconWrap, iconColor && { backgroundColor: iconColor + '18' }]}>
        <Ionicons
          name={icon}
          size={20}
          color={iconColor || COLORS.primary}
        />
      </View>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {showChevron && (
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      )}
    </TouchableOpacity>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0);
  const {
    preferences,
    setPreferences,
    GENERAL_PREFERENCES,
    PREFERENCES,
    FOOD_CATEGORIES,
  } = useUserPreferences();
  const [preferencesModalVisible, setPreferencesModalVisible] = useState(false);
  const [editGeneralIds, setEditGeneralIds] = useState([]);
  const [editActivityIds, setEditActivityIds] = useState([]);
  const [editFoodIds, setEditFoodIds] = useState([]);

  useEffect(() => {
    if (preferencesModalVisible) {
      setEditGeneralIds(Array.isArray(preferences?.generalIds) ? preferences.generalIds : []);
      setEditActivityIds(Array.isArray(preferences?.activityIds) ? preferences.activityIds : []);
      setEditFoodIds(Array.isArray(preferences?.foodIds) ? preferences.foodIds : []);
    }
  }, [preferencesModalVisible, preferences?.generalIds, preferences?.activityIds, preferences?.foodIds]);

  const toggleGeneral = (id) => {
    setEditGeneralIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const toggleActivity = (id) => {
    setEditActivityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const toggleFood = (id) => {
    setEditFoodIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const handleSavePreferences = async () => {
    await setPreferences({ generalIds: editGeneralIds, activityIds: editActivityIds, foodIds: editFoodIds });
    setPreferencesModalVisible(false);
  };

  return (
    <ScreenContainer showHeader headerTitle="Profile">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header */}
        <View style={styles.headerBlock}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>U</Text>
            </View>
          </View>
          <Text style={styles.userName}>Guest</Text>
          <Text style={styles.userSub}>Sign in to sync across devices</Text>
        </View>

        {/* Account */}
        <Section title="Account">
          <ProfileRow icon="person-outline" label="Edit profile" onPress={() => {}} />
          <ProfileRow icon="notifications-outline" label="Notifications" onPress={() => {}} />
          <ProfileRow
            icon="lock-closed-outline"
            label="Privacy & security"
            onPress={() => {}}
            isLast
          />
        </Section>

        {/* Preferences */}
        <Section title="Preferences">
          <ProfileRow
            icon="heart-outline"
            iconColor={COLORS.primary}
            label="Activity & food preferences"
            onPress={() => setPreferencesModalVisible(true)}
          />
          <ProfileRow icon="language-outline" label="Language" onPress={() => {}} />
          <ProfileRow icon="moon-outline" label="Appearance" onPress={() => {}} isLast />
        </Section>

        {/* Support */}
        <Section title="Support">
          <ProfileRow
            icon="help-circle-outline"
            iconColor={COLORS.textSecondary}
            label="Help & FAQ"
            onPress={() => {}}
          />
          <ProfileRow
            icon="chatbubble-outline"
            iconColor={COLORS.textSecondary}
            label="Contact us"
            onPress={() => {}}
          />
          <ProfileRow
            icon="document-text-outline"
            iconColor={COLORS.textSecondary}
            label="About Go Bahrain"
            onPress={() => {}}
            isLast
          />
        </Section>

        {/* Sign in CTA */}
        <View style={styles.ctaSection}>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit preferences modal */}
      <Modal
        visible={preferencesModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreferencesModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setPreferencesModalVisible(false)}
              style={styles.modalCloseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit preferences</Text>
            <View style={styles.modalCloseBtn} />
          </View>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalSectionLabel}>About you</Text>
            <Text style={styles.modalSectionHint}>We use this to understand you everywhere — separate from plan preferences below.</Text>
            {GENERAL_GROUPS.map((grp) => {
              const options = GENERAL_PREFERENCES.filter((p) => p.group === grp.key);
              if (options.length === 0) return null;
              return (
                <View key={grp.key} style={styles.modalGroupBlock}>
                  <Text style={styles.modalGroupLabel}>{grp.label}</Text>
                  <View style={styles.modalChipRow}>
                    {options.map((p) => {
                      const selected = editGeneralIds.includes(p.id);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            styles.modalChip,
                            { borderColor: p.color },
                            selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                          ]}
                          onPress={() => toggleGeneral(p.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={p.icon} size={18} color={selected ? p.color : COLORS.textMuted} />
                          <Text style={[styles.modalChipLabel, selected && { color: p.color, fontWeight: '700' }]} numberOfLines={1}>
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            <Text style={[styles.modalSectionLabel, { marginTop: 20 }]}>For your plans — activities</Text>
            <View style={styles.modalChipRow}>
              {PREFERENCES.map((p) => {
                const selected = editActivityIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.modalChip,
                      { borderColor: p.color },
                      selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                    ]}
                    onPress={() => toggleActivity(p.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : COLORS.textMuted} />
                    <Text style={[styles.modalChipLabel, selected && { color: p.color, fontWeight: '700' }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.modalSectionLabel, { marginTop: 16 }]}>For your plans — food</Text>
            <View style={styles.modalChipRow}>
              {FOOD_CATEGORIES.map((p) => {
                const selected = editFoodIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.modalChip,
                      { borderColor: p.color },
                      selected && { backgroundColor: p.color + '22', borderWidth: 2 },
                    ]}
                    onPress={() => toggleFood(p.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : COLORS.textMuted} />
                    <Text style={[styles.modalChipLabel, selected && { color: p.color, fontWeight: '700' }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalHint}>
              "About you" helps us understand you everywhere. Plan preferences are used when generating day plans; we prioritize, not filter.
            </Text>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleSavePreferences}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSaveBtnText}>Save</Text>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  headerBlock: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  userSub: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  ctaSection: {
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Edit preferences modal
  modalSafe: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  modalSectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  modalSectionHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  modalGroupBlock: {
    marginBottom: 14,
  },
  modalGroupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBgAlt,
  },
  modalChipLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  modalHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 20,
    lineHeight: 20,
  },
  modalFooter: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    ...Platform.select({
      ios: { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  modalSaveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});
