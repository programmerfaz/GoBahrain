import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { FONT_POPPINS_SEMIBOLD } from '../../constants/brandFont'

export const normalizeCommunityUType = (raw) =>
  String(raw || '').trim().toLowerCase() === 'tourist' ? 'tourist' : 'local'

export function CommunityUserTypeBadge({ uType, compact = false }) {
  const { isDark } = useTheme()
  const isTourist = normalizeCommunityUType(uType) === 'tourist'

  const touristColor = isDark ? '#7CC4F8' : '#1D9BF0'
  const localColor = isDark ? '#5EE9B5' : '#00BA7C'
  const accent = isTourist ? touristColor : localColor

  const styles = useMemo(
    () =>
      StyleSheet.create({
        pill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 3 : 4,
          paddingHorizontal: compact ? 6 : 8,
          paddingVertical: compact ? 2 : 3,
          borderRadius: compact ? 8 : 10,
          backgroundColor: isTourist
            ? isDark
              ? 'rgba(29,155,240,0.2)'
              : 'rgba(29,155,240,0.12)'
            : isDark
              ? 'rgba(0,186,124,0.2)'
              : 'rgba(0,186,124,0.12)',
          flexShrink: 0,
        },
        label: {
          fontSize: compact ? 10 : 11,
          fontFamily: FONT_POPPINS_SEMIBOLD,
          color: accent,
        },
      }),
    [accent, compact, isDark, isTourist],
  )

  return (
    <View
      style={styles.pill}
      accessibilityRole="text"
      accessibilityLabel={isTourist ? 'Tourist' : 'Local'}
    >
      <Ionicons
        name={isTourist ? 'airplane-outline' : 'home-outline'}
        size={compact ? 10 : 11}
        color={accent}
      />
      <Text style={styles.label}>{isTourist ? 'Tourist' : 'Local'}</Text>
    </View>
  )
}
