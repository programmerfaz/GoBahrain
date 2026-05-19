import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { parseTextWithMentions } from '../../utils/communityMentions'

export function ClientMentionText({
  text,
  style,
  mentionStyle,
  onMentionPress,
  numberOfLines,
}) {
  const segments = parseTextWithMentions(text)
  const mentionTextStyle = mentionStyle || styles.mention

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, index) => {
        if (seg.type === 'mention' && seg.clientId && onMentionPress) {
          return (
            <Text
              key={`m-${index}-${seg.clientId}`}
              onPress={() => onMentionPress({ clientId: seg.clientId, businessName: seg.name })}
              suppressHighlighting
              style={mentionTextStyle}
              accessibilityRole="link"
              accessibilityLabel={`Open profile for ${seg.name}`}
            >
              @{seg.name}
            </Text>
          )
        }
        return (
          <Text key={`t-${index}`} suppressHighlighting>
            {seg.value}
          </Text>
        )
      })}
    </Text>
  )
}

const styles = StyleSheet.create({
  mention: {
    color: '#1D9BF0',
    fontWeight: '700',
  },
})
