import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#C8102E',
  screenBg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: 'rgba(226,232,240,0.9)',
};

const SPOT_COLORS = ['#C8102E', '#F97316', '#0EA5E9', '#10B981', '#6366F1'];

function getSpotColorForDay(day) {
  if (!day) return SPOT_COLORS[0];
  const index = (day - 1 + SPOT_COLORS.length) % SPOT_COLORS.length;
  return SPOT_COLORS[index];
}

export default function PlaceDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const place = route.params?.place;
  if (!place) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.missingText}>Place not found</Text>
      </View>
    );
  }

  const accentColor = getSpotColorForDay(place.day);
  const displayTitle = place.title?.replace(/^Spot\s+\d+\s+·\s*/, '') || place.title || 'Place';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Place details</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { width: width - 32, backgroundColor: `${accentColor}15` }]}>
          <View style={[styles.spotBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.spotBadgeText}>Spot {place.day}</Text>
          </View>
          <Ionicons name="location" size={48} color={accentColor} style={styles.heroIcon} />
          <Text style={styles.heroTitle}>{displayTitle}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>About</Text>
          <Text style={styles.description}>{place.description || 'No description available.'}</Text>
        </View>

        {place.coordinate && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Location</Text>
            <Text style={styles.coordsText}>
              {place.coordinate.latitude?.toFixed(4)}, {place.coordinate.longitude?.toFixed(4)}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  headerRight: { width: 44, height: 44 },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 20,
  },
  hero: {
    alignSelf: 'center',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  spotBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  spotBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroIcon: {
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  coordsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  missingText: {
    flex: 1,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: COLORS.textMuted,
  },
});
