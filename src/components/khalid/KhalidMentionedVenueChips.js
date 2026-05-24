import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { FONT_POPPINS_MEDIUM, FONT_POPPINS_SEMIBOLD } from '../../constants/brandFont'
import { pickMentionedKhalidVenueLinks } from '../../utils/khalidVenueLinks'

export function KhalidMentionedVenueChips({
  replyText,
  venueLinks = [],
  onViewProfile,
  onAskAbout,
  accentColor = '#E9C877',
  borderColor = 'rgba(233,200,119,0.28)',
  chipBg = 'rgba(233,200,119,0.1)',
  isDark = true,
}) {
  const mentioned = useMemo(
    () => pickMentionedKhalidVenueLinks(replyText, venueLinks),
    [replyText, venueLinks],
  )

  if (!mentioned.length || (!onViewProfile && !onAskAbout)) return null

  const viewGrad = isDark ? ['#A91F35', '#C8102E'] : ['#B61933', '#C8102E']

  return (
    <View style={styles.row} accessibilityRole="list">
      {mentioned.map((venue) => (
        <View
          key={venue.clientId}
          style={[styles.chip, { borderColor, backgroundColor: chipBg }]}
          accessibilityLabel={`Actions for ${venue.name}`}
        >
          <View style={styles.chipHead}>
            <Ionicons name="storefront-outline" size={14} color={accentColor} />
            <Text style={[styles.chipName, { color: accentColor }]} numberOfLines={2}>
              {venue.name}
            </Text>
          </View>
          <View style={styles.btnRow}>
            {onAskAbout ? (
              <TouchableOpacity
                style={[styles.askBtn, { borderColor }]}
                onPress={() => onAskAbout(venue)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={`Ask Khalid about ${venue.name}`}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={12} color={accentColor} />
                <Text style={[styles.askBtnText, { color: accentColor }]}>Ask</Text>
              </TouchableOpacity>
            ) : null}
            {onViewProfile ? (
              <TouchableOpacity
                onPress={() => onViewProfile(venue.clientId)}
                activeOpacity={0.82}
                style={styles.viewBtnTouch}
                accessibilityRole="button"
                accessibilityLabel={`View profile for ${venue.name}`}
              >
                <LinearGradient
                  colors={viewGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.viewBtnGrad}
                >
                  <Text style={styles.viewBtnText}>View</Text>
                  <Ionicons name="arrow-forward-circle" size={13} color="#F8FAFC" />
                </LinearGradient>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    minWidth: 168,
    maxWidth: '100%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  chipHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  chipName: {
    fontFamily: FONT_POPPINS_MEDIUM,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  askBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  askBtnText: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 11,
  },
  viewBtnTouch: {
    flex: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  viewBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  viewBtnText: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    fontSize: 11,
    color: '#F8FAFC',
  },
})
