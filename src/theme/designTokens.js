/**
 * Modern design tokens — light & dark palettes.
 * Use getColors(isDark) and useTheme() for dark mode support.
 */

export const colors = {
  // Primary brand (Bahrain red — national identity)
  primary: '#C8102E',
  primaryLight: '#E63950',
  primaryMuted: 'rgba(200, 16, 46, 0.12)',

  // Neutrals
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Semantic (muted, not bright)
  success: '#059669',
  successMuted: 'rgba(5, 150, 105, 0.12)',
  error: '#B91C1C',
  errorMuted: 'rgba(185, 28, 28, 0.08)',
  warning: '#B45309',
  warningMuted: 'rgba(180, 83, 9, 0.1)',

  // Time of day / categories (subdued)
  morning: '#B45309',
  afternoon: '#A61E32',
  evening: '#5B21B6',
  dining: '#B91C1C',
  event: '#9D174D',

  // Map & transport
  route: '#C8102E',
  routeMuted: 'rgba(200, 16, 46, 0.2)',
};

export const colorsDark = {
  primary: '#E63950',
  primaryLight: '#F87171',
  primaryMuted: 'rgba(230, 57, 80, 0.2)',

  background: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  border: '#334155',
  borderLight: '#475569',

  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textInverse: '#0F172A',

  success: '#10B981',
  successMuted: 'rgba(16, 185, 129, 0.2)',
  error: '#EF4444',
  errorMuted: 'rgba(239, 68, 68, 0.2)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.2)',

  morning: '#F59E0B',
  afternoon: '#F87171',
  evening: '#A78BFA',
  dining: '#F87171',
  event: '#F472B6',

  route: '#E63950',
  routeMuted: 'rgba(230, 57, 80, 0.3)',
};

export function getColors(isDark) {
  return isDark ? colorsDark : colors;
}

export function getShadows(platform, colorSet = colors) {
  const shadowColor = colorSet.textPrimary || '#0F172A';
  const isDark = colorSet === colorsDark;
  return {
    sm: {
      shadowColor,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.15 : 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: 12,
      elevation: 6,
    },
    primary:
      platform === 'ios'
        ? {
            shadowColor: colorSet.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
          }
        : { elevation: 4 },
  };
}

// Legacy export: shadows for light mode (backward compat)
export const shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  primary: (platform) =>
    platform === 'ios'
      ? {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }
      : { elevation: 4 },
};
