import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import ScreenContainer from '../components/ScreenContainer'
import { useTheme } from '../context/ThemeContext'
import { listSavedPlans } from '../services/savedPlans'

const formatSavedPlanDate = (iso) => {
  if (!iso) return 'Updated recently'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Updated recently'
  try {
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return 'Updated recently'
  }
}

export default function SavedPlansScreen() {
  const navigation = useNavigation()
  const { colors, isDark } = useTheme()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadPlans = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const list = await listSavedPlans()
      setItems(Array.isArray(list) ? list : [])
    } catch {
      setItems([])
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadPlans(false)
    }, [loadPlans])
  )

  const handleOpenInAiPlan = () => {
    navigation.navigate('AI Plan')
  }

  const handleOpenSavedPlan = (item) => {
    if (!item) return
    navigation.navigate('AI Plan', {
      openSavedPlan: {
        id: item.id,
        title: item.title || 'My plan',
        plan_data: Array.isArray(item.plan_data) ? item.plan_data : [],
      },
    })
  }

  const renderItem = ({ item }) => {
    const stopsCount = Array.isArray(item?.plan_data) ? item.plan_data.length : 0
    const title = typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : 'My plan'

    return (
      <TouchableOpacity
        style={[
          s.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
          },
        ]}
        onPress={() => handleOpenSavedPlan(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open saved plan ${title}`}
        activeOpacity={0.9}
      >
        <View style={s.cardTop}>
          <View style={[s.iconWrap, { backgroundColor: `${colors.primary}20` }]}>
            <Ionicons name="bookmark-outline" size={18} color={colors.primary} />
          </View>
          <View style={s.textWrap}>
            <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[s.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {stopsCount} stops · {formatSavedPlanDate(item?.updated_at)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <ScreenContainer style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={s.container}>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading saved plans…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="bookmark-outline" size={28} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No saved plans yet</Text>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>
              Build a plan in AI Plan and save it to see it here.
            </Text>
            <TouchableOpacity
              style={[s.cta, { backgroundColor: colors.primary }]}
              onPress={handleOpenInAiPlan}
              accessibilityRole="button"
              accessibilityLabel="Open AI Plan"
              activeOpacity={0.85}
            >
              <Text style={s.ctaText}>Open AI Plan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadPlans(true)}
                tintColor={colors.primary}
              />
            }
          />
        )}
      </View>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  cta: {
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
  },
})
