import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors, getShadows } from '../theme/designTokens';

const THEME_STORAGE_KEY = '@gobahrain_color_scheme';

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [colorScheme, setColorSchemeState] = useState('system'); // 'light' | 'dark' | 'system'

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setColorSchemeState(saved);
      }
    });
  }, []);

  const setColorScheme = (scheme) => {
    const next = scheme === 'light' || scheme === 'dark' || scheme === 'system' ? scheme : 'system';
    setColorSchemeState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  };

  const isDark =
    colorScheme === 'dark' || (colorScheme === 'system' && systemScheme === 'dark');

  const colors = useMemo(() => getColors(isDark), [isDark]);
  const shadows = useMemo(
    () => getShadows(Platform.OS, colors),
    [colors]
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      isDark,
      colors,
      shadows,
    }),
    [colorScheme, isDark, colors, shadows]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
