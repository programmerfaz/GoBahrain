/**
 * Modern design tokens — light & dark palettes.
 * Use getColors(isDark) and useTheme() for dark mode support.
 */

export const colors = {
  primary: '#C8102E',
  primaryLight: '#E63950',
  primaryDark: '#9B0C23',
  primaryMuted: 'rgba(200, 16, 46, 0.12)',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  success: '#059669',
  successMuted: 'rgba(5, 150, 105, 0.12)',
  error: '#B91C1C',
  errorMuted: 'rgba(185, 28, 28, 0.08)',
  warning: '#B45309',
  warningMuted: 'rgba(180, 83, 9, 0.1)',

  morning: '#B45309',
  afternoon: '#A61E32',
  evening: '#5B21B6',
  dining: '#B91C1C',
  event: '#9D174D',

  route: '#C8102E',
  routeMuted: 'rgba(200, 16, 46, 0.2)',

  shimmerBase: '#E2E8F0',
  shimmerHighlight: '#F1F5F9',

  accent2: '#7C3AED',
  accent3: '#0891B2',
}

export const colorsDark = {
  primary: '#E63950',
  primaryLight: '#F87171',
  primaryDark: '#C8102E',
  primaryMuted: 'rgba(230, 57, 80, 0.2)',

  background: '#000000',
  surface: '#121212',
  surfaceElevated: '#1C1C1E',
  surfaceGlass: 'rgba(0, 0, 0, 0.88)',
  border: '#38383A',
  borderLight: '#48484A',

  textPrimary: '#F8FAFC',
  textSecondary: '#C7C7CC',
  textMuted: '#8E8E93',
  textInverse: '#000000',

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

  shimmerBase: '#1C1C1E',
  shimmerHighlight: '#2C2C2E',

  accent2: '#A78BFA',
  accent3: '#22D3EE',
}

export const gradients = {
  primaryButton: (isDark) => isDark
    ? ['#E63950', '#C8102E']
    : ['#E63950', '#C8102E'],
  primarySoft: (isDark) => isDark
    ? ['rgba(230,57,80,0.15)', 'rgba(230,57,80,0.05)']
    : ['rgba(200,16,46,0.08)', 'rgba(200,16,46,0.02)'],
  heroLight: ['#F8FAFC', '#EFF6FF', '#F8FAFC'],
  heroDark: ['#000000', '#0A0A0A', '#000000'],
  hero: (isDark) => isDark
    ? ['#000000', '#0A0A0A', '#000000']
    : ['#F8FAFC', '#EFF6FF', '#F8FAFC'],
  cardGlow: (isDark) => isDark
    ? ['rgba(230,57,80,0.12)', 'rgba(0,0,0,0)']
    : ['rgba(200,16,46,0.06)', 'rgba(248,250,252,0)'],
  avatarRing: ['#E63950', '#C8102E', '#7C3AED'],
  onboardingBg: ['#000000', '#0A0A0A', '#000000'],
  glassDark: ['rgba(28,28,30,0.85)', 'rgba(0,0,0,0.92)'],
  glassLight: ['rgba(255,255,255,0.9)', 'rgba(248,250,252,0.95)'],
}

export const timing = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: { damping: 15, stiffness: 150 },
  springBouncy: { damping: 12, stiffness: 180 },
  springGentle: { damping: 20, stiffness: 100 },
}

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
}

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
