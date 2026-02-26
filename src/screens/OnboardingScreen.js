import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { GENERAL_GROUPS } from '../constants/preferences';

export default function OnboardingScreen() {
  const { GENERAL_PREFERENCES, PREFERENCES, FOOD_CATEGORIES, completeOnboarding } = useUserPreferences();
  const [generalIds, setGeneralIds] = useState([]);
  const [activityIds, setActivityIds] = useState([]);
  const [foodIds, setFoodIds] = useState([]);
  const [step, setStep] = useState(0);

  const toggleGeneral = (id) => {
    setGeneralIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleActivity = (id) => {
    setActivityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleFood = (id) => {
    setFoodIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    if (step === 0) setStep(1);
    else if (step === 1) setStep(2);
    else completeOnboarding({ generalIds, activityIds, foodIds });
  };

  const canContinue = true;
  const isLastStep = step === 2;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {step === 0
              ? "Tell us about you"
              : step === 1
                ? "What do you like to do?"
                : "What do you like to eat?"}
          </Text>
          <Text style={styles.subtitle}>
            {step === 0
              ? "Pick what fits — we use this to understand you and tailor suggestions. Separate from your plan preferences below."
              : step === 1
                ? "For day plans: activities we'll prioritize (you can still see everything)."
                : "For day plans: food types we'll prioritize. Nothing is hidden — just tailored."}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 ? (
            <View style={styles.chipColumn}>
              {GENERAL_GROUPS.map((grp) => {
                const options = GENERAL_PREFERENCES.filter((p) => p.group === grp.key);
                if (options.length === 0) return null;
                return (
                  <View key={grp.key} style={styles.groupBlock}>
                    <Text style={styles.groupLabel}>{grp.label}</Text>
                    <View style={styles.chipRow}>
                      {options.map((p) => {
                        const selected = generalIds.includes(p.id);
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={[styles.chip, { borderColor: p.color }, selected && { backgroundColor: p.color + '22', borderWidth: 2 }]}
                            onPress={() => toggleGeneral(p.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name={p.icon} size={20} color={selected ? p.color : '#64748B'} />
                            <Text style={[styles.chipLabel, selected && { color: p.color, fontWeight: '700' }]}>
                              {p.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : step === 1 ? (
            <View style={styles.chipRow}>
              {PREFERENCES.map((p) => {
                const selected = activityIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, { borderColor: p.color }, selected && { backgroundColor: p.color + '22', borderWidth: 2 }]}
                    onPress={() => toggleActivity(p.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : '#64748B'} />
                    <Text style={[styles.chipLabel, selected && { color: p.color, fontWeight: '700' }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.chipRow}>
              {FOOD_CATEGORIES.map((p) => {
                const selected = foodIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, { borderColor: p.color }, selected && { backgroundColor: p.color + '22', borderWidth: 2 }]}
                    onPress={() => toggleFood(p.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={p.icon} size={20} color={selected ? p.color : '#64748B'} />
                    <Text style={[styles.chipLabel, selected && { color: p.color, fontWeight: '700' }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step >= 1 ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setStep((s) => s - 1)}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#64748B" />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>
              {isLastStep ? "Let's go" : 'Continue'}
            </Text>
            <Ionicons name={isLastStep ? 'checkmark-circle' : 'arrow-forward'} size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 24,
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(203,213,225,0.9)',
    lineHeight: 22,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  chipColumn: {
    gap: 20,
  },
  groupBlock: {
    marginBottom: 20,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  chipLabel: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '600',
  },
  continueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#C8102E',
    ...Platform.select({
      ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  continueBtnDisabled: {
    opacity: 0.6,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});
