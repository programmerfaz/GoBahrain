import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PREFERENCES,
  FOOD_CATEGORIES,
  GENERAL_PREFERENCES,
  getLabelsFromIds,
  getGeneralLabelsFromIds,
} from '../constants/preferences';

const ONBOARDING_KEY = '@gobahrain_onboarding_complete';
const PREFERENCES_KEY = '@gobahrain_user_preferences';

const defaultPreferences = {
  generalIds: [],
  activityIds: [],
  foodIds: [],
};

const UserPreferencesContext = createContext(null);

export function UserPreferencesProvider({ children }) {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(null);
  const [preferences, setPreferencesState] = useState(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);

  const loadStored = useCallback(async () => {
    try {
      const [onboardingRaw, prefsRaw] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(PREFERENCES_KEY),
      ]);
      setIsOnboardingComplete(onboardingRaw === 'true');
      if (prefsRaw) {
        try {
          const parsed = JSON.parse(prefsRaw);
          if (parsed && typeof parsed === 'object') {
            setPreferencesState({
              generalIds: Array.isArray(parsed.generalIds) ? parsed.generalIds : [],
              activityIds: Array.isArray(parsed.activityIds) ? parsed.activityIds : [],
              foodIds: Array.isArray(parsed.foodIds) ? parsed.foodIds : [],
            });
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('[UserPreferences] load failed', e?.message);
      setIsOnboardingComplete(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  const setPreferences = useCallback(async (next) => {
    let merged = null;
    setPreferencesState((prev) => {
      merged = {
        generalIds: next?.generalIds !== undefined
          ? (Array.isArray(next.generalIds) ? next.generalIds : defaultPreferences.generalIds)
          : (prev?.generalIds ?? defaultPreferences.generalIds),
        activityIds: next?.activityIds !== undefined
          ? (Array.isArray(next.activityIds) ? next.activityIds : defaultPreferences.activityIds)
          : (prev?.activityIds ?? defaultPreferences.activityIds),
        foodIds: next?.foodIds !== undefined
          ? (Array.isArray(next.foodIds) ? next.foodIds : defaultPreferences.foodIds)
          : (prev?.foodIds ?? defaultPreferences.foodIds),
      };
      return merged;
    });
    if (merged) {
      try {
        await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(merged));
      } catch (e) {
        console.warn('[UserPreferences] save failed', e?.message);
      }
    }
  }, []);

  const completeOnboarding = useCallback(async (prefs) => {
    if (prefs) await setPreferences(prefs);
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      setIsOnboardingComplete(true);
    } catch (e) {
      console.warn('[UserPreferences] onboarding save failed', e?.message);
    }
  }, [setPreferences]);

  const generalLabels = getGeneralLabelsFromIds(preferences.generalIds);
  const activityLabels = getLabelsFromIds(preferences.activityIds, PREFERENCES);
  const foodLabels = getLabelsFromIds(preferences.foodIds, FOOD_CATEGORIES);

  const value = {
    isOnboardingComplete: isOnboardingComplete === true,
    isLoading: isLoading || isOnboardingComplete === null,
    preferences,
    setPreferences,
    completeOnboarding,
    generalLabels,
    activityLabels,
    foodLabels,
    GENERAL_PREFERENCES,
    PREFERENCES,
    FOOD_CATEGORIES,
  };

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  return ctx;
}
