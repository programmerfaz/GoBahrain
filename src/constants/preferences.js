/**
 * Shared preference options.
 * - GENERAL_PREFERENCES: unique, general "about you" options (understand the user). Used everywhere.
 * - PREFERENCES: activity types for plan generation only.
 * - FOOD_CATEGORIES: food types for plan generation only.
 * Colors use a modern, muted palette (see theme/designTokens.js).
 */

// Muted palette for chips — Bahrain red accent, not blue
const M = {
  primary: '#C8102E',
  success: '#059669',
  morning: '#B45309',
  afternoon: '#A61E32',
  evening: '#5B21B6',
  dining: '#B91C1C',
  event: '#9D174D',
  muted: '#64748B',
  indigo: '#9D174D',
};

/** General "about you" options — who they are, how they travel, what they value. Not the same as plan activities/food. */
export const GENERAL_PREFERENCES = [
  { id: 'solo', label: 'Solo traveler', icon: 'person-outline', color: M.muted, group: 'companion' },
  { id: 'couples', label: 'Couples', icon: 'heart-outline', color: M.event, group: 'companion' },
  { id: 'family', label: 'Family', icon: 'people-outline', color: M.success, group: 'companion' },
  { id: 'friends', label: 'Friends', icon: 'people-circle-outline', color: M.afternoon, group: 'companion' },
  { id: 'business', label: 'Business', icon: 'briefcase-outline', color: M.indigo, group: 'companion' },
  { id: 'pace-relaxed', label: 'Relaxed pace', icon: 'leaf-outline', color: M.success, group: 'pace' },
  { id: 'pace-balanced', label: 'Balanced', icon: 'swap-horizontal-outline', color: M.morning, group: 'pace' },
  { id: 'pace-packed', label: 'Packed schedule', icon: 'flash-outline', color: M.dining, group: 'pace' },
  { id: 'budget-friendly', label: 'Budget-friendly', icon: 'wallet-outline', color: M.success, group: 'budget' },
  { id: 'moderate', label: 'Moderate', icon: 'card-outline', color: M.afternoon, group: 'budget' },
  { id: 'splurge', label: 'Splurge', icon: 'diamond-outline', color: M.evening, group: 'budget' },
  { id: 'culture-history', label: 'Culture & history', icon: 'library-outline', color: M.indigo, group: 'interests' },
  { id: 'nature-outdoors', label: 'Nature & outdoors', icon: 'earth-outline', color: M.success, group: 'interests' },
  { id: 'foodie', label: 'Foodie', icon: 'restaurant-outline', color: M.dining, group: 'interests' },
  { id: 'nightlife', label: 'Nightlife', icon: 'moon-outline', color: M.evening, group: 'interests' },
  { id: 'shopping', label: 'Shopping', icon: 'bag-outline', color: M.event, group: 'interests' },
  { id: 'relaxation-wellness', label: 'Relaxation & wellness', icon: 'sparkles-outline', color: M.afternoon, group: 'interests' },
  { id: 'adventure', label: 'Adventure', icon: 'rocket-outline', color: M.dining, group: 'interests' },
  { id: 'instagram-spots', label: 'Instagram spots', icon: 'camera-outline', color: M.event, group: 'interests' },
  { id: 'local-authentic', label: 'Local & authentic', icon: 'compass-outline', color: M.morning, group: 'interests' },
  { id: 'family-friendly', label: 'Family-friendly', icon: 'happy-outline', color: M.success, group: 'interests' },
  { id: 'art-museums', label: 'Art & museums', icon: 'color-palette-outline', color: M.indigo, group: 'interests' },
  { id: 'beaches-sun', label: 'Beaches & sun', icon: 'sunny-outline', color: M.morning, group: 'interests' },
  { id: 'quiet-peaceful', label: 'Quiet & peaceful', icon: 'volume-mute-outline', color: M.muted, group: 'interests' },
  { id: 'social-lively', label: 'Social & lively', icon: 'chatbubbles-outline', color: M.afternoon, group: 'interests' },
];

/** Activity types — for plan generation only (what to do). */
export const PREFERENCES = [
  { id: 'sightseeing', label: 'Sightseeing', icon: 'eye-outline', color: M.afternoon },
  { id: 'instagram', label: 'Instagram', icon: 'camera-outline', color: M.event },
  { id: 'leisure', label: 'Leisure', icon: 'leaf-outline', color: M.success },
  { id: 'nature', label: 'Nature', icon: 'earth-outline', color: M.success },
  { id: 'historical', label: 'Historical', icon: 'time-outline', color: M.indigo },
  { id: 'cultural', label: 'Cultural', icon: 'color-palette-outline', color: M.indigo },
  { id: 'adventure', label: 'Adventure', icon: 'rocket-outline', color: M.dining },
];

/** Food types — for plan generation only (what to eat). */
export const FOOD_CATEGORIES = [
  { id: 'cuisine', label: 'Cuisine', icon: 'restaurant-outline', color: M.dining },
  { id: 'seafood', label: 'Seafood', icon: 'fish-outline', color: M.afternoon },
  { id: 'american', label: 'American', icon: 'fast-food-outline', color: M.morning },
  { id: 'international', label: 'International', icon: 'globe-outline', color: M.indigo },
  { id: 'cafe', label: 'Cafe', icon: 'cafe-outline', color: M.morning },
  { id: 'asian', label: 'Asian', icon: 'nutrition-outline', color: M.dining },
  { id: 'italian', label: 'Italian', icon: 'pizza-outline', color: M.success },
  { id: 'south-asian', label: 'South Asian', icon: 'flame-outline', color: M.morning },
  { id: 'fast-food', label: 'Fast Food', icon: 'fast-food-outline', color: M.dining },
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
