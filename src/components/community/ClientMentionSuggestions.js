import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { filterClientsForMention } from '../../utils/communityMentions'

export function ClientMentionSuggestions({
  visible,
  clients,
  query,
  onSelect,
  palette,
}) {
  if (!visible) return null
  const matches = filterClientsForMention(clients, query)
  if (!matches.length) return null

  const C = palette || {}

  return (
    <View style={[styles.wrap, { backgroundColor: C.card || '#FFF', borderColor: C.border || '#E5E7EB' }]}>
      <Text style={[styles.hint, { color: C.muted || '#536471' }]}>Tag a venue</Text>
      <ScrollView
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
        style={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {matches.map((client) => (
          <TouchableOpacity
            key={client.client_a_uuid}
            style={[styles.row, { borderBottomColor: C.border || '#E5E7EB' }]}
            activeOpacity={0.75}
            onPress={() => onSelect(client)}
            accessibilityRole="button"
            accessibilityLabel={`Tag ${client.business_name}`}
          >
            <Ionicons name="storefront-outline" size={16} color={C.red || '#E53E3E'} />
            <Text style={[styles.name, { color: C.text || '#0F1419' }]} numberOfLines={1}>
              {client.business_name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 10,
    marginBottom: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 180,
    overflow: 'hidden',
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  list: {
    maxHeight: 140,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
})
