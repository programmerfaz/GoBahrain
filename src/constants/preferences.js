/**
 * Shared preference options.
 * - GENERAL_PREFERENCES: unique, general "about you" options (understand the user). Used everywhere.
 * - PREFERENCES: activity types for plan generation only.
 * - FOOD_CATEGORIES: food types for plan generation only.
 */

/** General "about you" options — who they are, how they travel, what they value. Not the same as plan activities/food. */
export const GENERAL_PREFERENCES = [
  { id: 'solo', label: 'Solo traveler', icon: 'person-outline', color: '#64748B', group: 'companion' },
  { id: 'couples', label: 'Couples', icon: 'heart-outline', color: '#EC4899', group: 'companion' },
  { id: 'family', label: 'Family', icon: 'people-outline', color: '#10B981', group: 'companion' },
  { id: 'friends', label: 'Friends', icon: 'people-circle-outline', color: '#0EA5E9', group: 'companion' },
  { id: 'business', label: 'Business', icon: 'briefcase-outline', color: '#6366F1', group: 'companion' },
  { id: 'pace-relaxed', label: 'Relaxed pace', icon: 'leaf-outline', color: '#22C55E', group: 'pace' },
  { id: 'pace-balanced', label: 'Balanced', icon: 'swap-horizontal-outline', color: '#F59E0B', group: 'pace' },
  { id: 'pace-packed', label: 'Packed schedule', icon: 'flash-outline', color: '#EF4444', group: 'pace' },
  { id: 'budget-friendly', label: 'Budget-friendly', icon: 'wallet-outline', color: '#10B981', group: 'budget' },
  { id: 'moderate', label: 'Moderate', icon: 'card-outline', color: '#0EA5E9', group: 'budget' },
  { id: 'splurge', label: 'Splurge', icon: 'diamond-outline', color: '#8B5CF6', group: 'budget' },
  { id: 'culture-history', label: 'Culture & history', icon: 'library-outline', color: '#6366F1', group: 'interests' },
  { id: 'nature-outdoors', label: 'Nature & outdoors', icon: 'earth-outline', color: '#22C55E', group: 'interests' },
  { id: 'foodie', label: 'Foodie', icon: 'restaurant-outline', color: '#C8102E', group: 'interests' },
  { id: 'nightlife', label: 'Nightlife', icon: 'moon-outline', color: '#7C3AED', group: 'interests' },
  { id: 'shopping', label: 'Shopping', icon: 'bag-outline', color: '#EC4899', group: 'interests' },
  { id: 'relaxation-wellness', label: 'Relaxation & wellness', icon: 'sparkles-outline', color: '#14B8A6', group: 'interests' },
  { id: 'adventure', label: 'Adventure', icon: 'rocket-outline', color: '#EF4444', group: 'interests' },
  { id: 'instagram-spots', label: 'Instagram spots', icon: 'camera-outline', color: '#EC4899', group: 'interests' },
  { id: 'local-authentic', label: 'Local & authentic', icon: 'compass-outline', color: '#F59E0B', group: 'interests' },
  { id: 'family-friendly', label: 'Family-friendly', icon: 'happy-outline', color: '#10B981', group: 'interests' },
  { id: 'art-museums', label: 'Art & museums', icon: 'color-palette-outline', color: '#818CF8', group: 'interests' },
  { id: 'beaches-sun', label: 'Beaches & sun', icon: 'sunny-outline', color: '#F97316', group: 'interests' },
  { id: 'quiet-peaceful', label: 'Quiet & peaceful', icon: 'volume-mute-outline', color: '#64748B', group: 'interests' },
  { id: 'social-lively', label: 'Social & lively', icon: 'chatbubbles-outline', color: '#0EA5E9', group: 'interests' },
];

/** Activity types — for plan generation only (what to do). */
export const PREFERENCES = [
  { id: 'sightseeing', label: 'Sightseeing', icon: 'eye-outline', color: '#0EA5E9' },
  { id: 'instagram', label: 'Instagram', icon: 'camera-outline', color: '#EC4899' },
  { id: 'leisure', label: 'Leisure', icon: 'leaf-outline', color: '#10B981' },
  { id: 'nature', label: 'Nature', icon: 'earth-outline', color: '#22C55E' },
  { id: 'historical', label: 'Historical', icon: 'time-outline', color: '#818CF8' },
  { id: 'cultural', label: 'Cultural', icon: 'color-palette-outline', color: '#6366F1' },
  { id: 'adventure', label: 'Adventure', icon: 'rocket-outline', color: '#EF4444' },
];

/** Food types — for plan generation only (what to eat). */
export const FOOD_CATEGORIES = [
  { id: 'cuisine', label: 'Cuisine', icon: 'restaurant-outline', color: '#C8102E' },
  { id: 'seafood', label: 'Seafood', icon: 'fish-outline', color: '#0EA5E9' },
  { id: 'american', label: 'American', icon: 'fast-food-outline', color: '#F97316' },
  { id: 'international', label: 'International', icon: 'globe-outline', color: '#6366F1' },
  { id: 'cafe', label: 'Cafe', icon: 'cafe-outline', color: '#A16207' },
  { id: 'asian', label: 'Asian', icon: 'nutrition-outline', color: '#DC2626' },
  { id: 'italian', label: 'Italian', icon: 'pizza-outline', color: '#16A34A' },
  { id: 'south-asian', label: 'South Asian', icon: 'flame-outline', color: '#F59E0B' },
  { id: 'fast-food', label: 'Fast Food', icon: 'fast-food-outline', color: '#EF4444' },
];

export const GENERAL_GROUPS = [
  { key: 'companion', label: "Who you're with" },
  { key: 'pace', label: 'Pace' },
  { key: 'budget', label: 'Budget' },
  { key: 'interests', label: "What you love" },
];

export function getLabelsFromIds(ids, list) {
  return (ids || [])
    .map((id) => list.find((p) => p.id === id)?.label)
    .filter(Boolean);
}

export function getGeneralLabelsFromIds(ids) {
  return getLabelsFromIds(ids, GENERAL_PREFERENCES);
}
