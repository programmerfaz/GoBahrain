import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const COLORS = {
  primary: '#C8102E',
  screenBg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: 'rgba(226,232,240,0.9)',
  pillBg: '#F1F5F9',
};

const PLACES_BY_TYPE = {
  restaurants: [
    { id: 'r1', name: 'Haji\'s Cafe', type: 'Cafe · Karak', description: 'Best karak in Manama, 500 fils.', image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400', rating: 4.8 },
    { id: 'r2', name: 'Block 338', type: 'Fine dining', description: 'Restaurant strip with international cuisine.', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400', rating: 4.6 },
    { id: 'r3', name: 'Café Lilou', type: 'Cafe · Breakfast', description: 'Popular breakfast and coffee in Adliya.', image: 'https://images.unsplash.com/photo-1554118811-1e0d58224ef0?w=400', rating: 4.5 },
  ],
  beaches: [
    { id: 'b1', name: 'Al Jazayer Beach', type: 'Public beach', description: 'Clear water, less crowded, scenic drive.', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400', rating: 4.7 },
    { id: 'b2', name: 'Bahrain Bay Beach', type: 'Urban beach', description: 'City views, clean sand, family-friendly.', image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400', rating: 4.4 },
    { id: 'b3', name: 'Diyar Al Muharraq', type: 'Resort beach', description: 'Resort-style beach and lagoon.', image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400', rating: 4.6 },
  ],
  spots: [
    { id: 's1', name: 'Bahrain Fort', type: 'History · UNESCO', description: 'Golden hour views, museum, seaside.', image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400', rating: 4.9 },
    { id: 's2', name: 'Tree of Life', type: 'Landmark', description: 'Iconic tree in the desert, sunset visits.', image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400', rating: 4.7 },
    { id: 's3', name: 'Manama Souq', type: 'Souq · Shopping', description: 'Gold souq, spices, sweets, culture.', image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400', rating: 4.5 },
    { id: 's4', name: 'Bahrain National Museum', type: 'Museum', description: 'History and archaeology of Bahrain.', image: 'https://images.unsplash.com/photo-1566127444979-b3d2b64d71b7?w=400', rating: 4.6 },
  ],
  foodTrucks: [
    { id: 'f1', name: 'Karak & Chai Truck', type: 'Drinks · Snacks', description: 'Mobile karak and fresh chai near souq.', image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', rating: 4.5 },
    { id: 'f2', name: 'Shawarma Express', type: 'Street food', description: 'Shawarma and falafel on the go.', image: 'https://images.unsplash.com/photo-1529006557810-274b9a2fd2a2?w=400', rating: 4.4 },
    { id: 'f3', name: 'Grill on Wheels', type: 'BBQ · Grill', description: 'Grilled meats and wraps, evening spots.', image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400', rating: 4.3 },
  ],
};

const CATEGORY_CONFIG = {
  restaurants: { label: 'Restaurants', icon: 'restaurant', emoji: '🍽️' },
  beaches: { label: 'Beaches', icon: 'water', emoji: '🏖️' },
  spots: { label: 'Spots', icon: 'location', emoji: '📍' },
  foodTrucks: { label: 'Food trucks', icon: 'fast-food', emoji: '🚚' },
};

const CIRCLE_SIZE = 76;
const CIRCLE_MARGIN = 14;

function ProfileCircle({ place }) {
  return (
    <TouchableOpacity style={styles.profileCircleWrap} activeOpacity={0.85}>
      <View style={styles.profileCircle}>
        <Image source={{ uri: place.image }} style={styles.profileCircleImage} resizeMode="cover" />
        <View style={styles.profileCircleRating}>
          <Ionicons name="star" size={10} color="#FBBF24" />
          <Text style={styles.profileCircleRatingText}>{place.rating}</Text>
        </View>
      </View>
      <Text style={styles.profileCircleName} numberOfLines={1}>{place.name}</Text>
    </TouchableOpacity>
  );
}

function CategoryRow({ categoryKey, label, emoji, places }) {
  return (
    <View style={styles.categoryRow}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEmoji}>{emoji}</Text>
        <Text style={styles.sectionTitle}>{label}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScrollContent}
        style={styles.categoryScroll}
      >
        {places.map((place) => (
          <ProfileCircle key={place.id} place={place} />
        ))}
      </ScrollView>
    </View>
  );
}

function PlaceCard({ place }) {
  return (
    <TouchableOpacity style={styles.placeCard} activeOpacity={0.88}>
      <View style={styles.placeImageWrap}>
        <Image source={{ uri: place.image }} style={styles.placeImage} resizeMode="cover" />
        <View style={styles.placeRating}>
          <Ionicons name="star" size={12} color="#FBBF24" />
          <Text style={styles.placeRatingText}>{place.rating}</Text>
        </View>
      </View>
      <View style={styles.placeInfo}>
        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.placeType} numberOfLines={1}>{place.type}</Text>
        <Text style={styles.placeDescription} numberOfLines={2}>{place.description}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({ label, emoji }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEmoji}>{emoji}</Text>
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

export default function SearchScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filteredByCategory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLACES_BY_TYPE;
    const out = {};
    Object.keys(PLACES_BY_TYPE).forEach((key) => {
      const config = CATEGORY_CONFIG[key];
      const matches = PLACES_BY_TYPE[key].filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          config.label.toLowerCase().includes(q)
      );
      if (matches.length) out[key] = matches;
    });
    return out;
  }, [query]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search places..."
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {Object.keys(filteredByCategory).length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No places match "{query}"</Text>
            <Text style={styles.emptySub}>Try another search term</Text>
          </View>
        ) : (
          Object.entries(filteredByCategory).map(([type, places]) => (
            <CategoryRow
              key={type}
              categoryKey={type}
              label={CATEGORY_CONFIG[type].label}
              emoji={CATEGORY_CONFIG[type].emoji}
              places={places}
            />
          ))
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
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerRight: { width: 44, height: 44 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
    paddingVertical: 0,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  clearBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  categoryRow: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  categoryScroll: {
    marginHorizontal: -4,
  },
  categoryScrollContent: {
    paddingHorizontal: 12,
    paddingRight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profileCircleWrap: {
    alignItems: 'center',
    width: CIRCLE_SIZE + 4,
    marginRight: CIRCLE_MARGIN,
  },
  profileCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: COLORS.pillBg,
    marginBottom: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  profileCircleImage: {
    width: '100%',
    height: '100%',
  },
  profileCircleRating: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 6,
  },
  profileCircleRatingText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginLeft: 2,
  },
  profileCircleName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    maxWidth: CIRCLE_SIZE + 8,
  },
  placeCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  placeImageWrap: {
    height: 140,
    backgroundColor: COLORS.pillBg,
  },
  placeImage: {
    width: '100%',
    height: '100%',
  },
  placeRating: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  placeRatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  placeInfo: {
    padding: 14,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  placeType: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  placeDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
