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
  { id: 'solo', label: 'Solo', icon: 'person-outline', color: M.muted, group: 'companion' },
  { id: 'family', label: 'Family', icon: 'people-outline', color: M.success, group: 'companion' },
  { id: 'friends', label: 'Friends', icon: 'people-circle-outline', color: M.afternoon, group: 'companion' },
  { id: 'pace-relaxed', label: 'Relaxed', icon: 'leaf-outline', color: M.success, group: 'pace' },
  { id: 'pace-balanced', label: 'Balanced', icon: 'scale-outline', color: M.morning, group: 'pace' },
  { id: 'pace-packed', label: 'Packed', icon: 'flash-outline', color: M.dining, group: 'pace' },
  { id: 'budget-friendly', label: 'Budget', icon: 'wallet-outline', color: M.success, group: 'budget' },
  { id: 'moderate', label: 'Moderate', icon: 'card-outline', color: M.afternoon, group: 'budget' },
  { id: 'splurge', label: 'Premium', icon: 'diamond-outline', color: M.evening, group: 'budget' },
  { id: 'culture-history', label: 'Culture', icon: 'library-outline', color: M.indigo, group: 'interests' },
  { id: 'nature-outdoors', label: 'Nature', icon: 'earth-outline', color: M.success, group: 'interests' },
  { id: 'foodie', label: 'Foodie', icon: 'restaurant-outline', color: M.dining, group: 'interests' },
  { id: 'shopping', label: 'Shopping', icon: 'storefront-outline', color: M.event, group: 'interests' },
  { id: 'adventure', label: 'Adventure', icon: 'bicycle-outline', color: M.dining, group: 'interests' },
  { id: 'instagram-spots', label: 'Instagram', icon: 'images-outline', color: M.event, group: 'interests' },
  { id: 'local-authentic', label: 'Local', icon: 'compass-outline', color: M.morning, group: 'interests' },
  { id: 'family-friendly', label: 'Kids', icon: 'happy-outline', color: M.success, group: 'interests' },
  { id: 'art-museums', label: 'Art', icon: 'brush-outline', color: M.indigo, group: 'interests' },
  { id: 'beaches-sun', label: 'Beaches', icon: 'umbrella-outline', color: M.morning, group: 'interests' },
  { id: 'quiet-peaceful', label: 'Quiet', icon: 'volume-mute-outline', color: M.muted, group: 'interests' },
  { id: 'social-lively', label: 'Social', icon: 'chatbubbles-outline', color: M.afternoon, group: 'interests' },
  { id: 'plan-structured', label: 'Structured', icon: 'list-outline', color: M.morning, group: 'planning' },
  { id: 'plan-flexible', label: 'Flexible', icon: 'shuffle-outline', color: M.success, group: 'planning' },
  { id: 'plan-mix', label: 'Mixed', icon: 'git-compare-outline', color: M.afternoon, group: 'planning' },
  { id: 'time-early', label: 'Early', icon: 'alarm-outline', color: M.morning, group: 'timing' },
  { id: 'time-afternoon', label: 'Afternoon', icon: 'partly-sunny-outline', color: M.success, group: 'timing' },
  { id: 'time-late', label: 'Late', icon: 'moon-outline', color: M.evening, group: 'timing' },
];

/** Activity types — for plan generation only (what to do). */
export const PREFERENCES = [
  { id: 'culture', label: 'Culture', icon: 'library-outline', color: M.indigo },
  { id: 'art', label: 'Art', icon: 'brush-outline', color: M.event },
  { id: 'shopping', label: 'Shopping', icon: 'storefront-outline', color: M.afternoon },
  { id: 'waterfronts', label: 'Waterfronts', icon: 'boat-outline', color: M.morning },
  { id: 'beaches', label: 'Beaches', icon: 'umbrella-outline', color: M.morning },
  { id: 'fun', label: 'Fun', icon: 'happy-outline', color: M.success },
  { id: 'parks', label: 'Parks', icon: 'leaf-outline', color: M.success },
  { id: 'historical', label: 'Historical', icon: 'time-outline', color: M.indigo },
  { id: 'nature', label: 'Nature', icon: 'earth-outline', color: M.success },
];

/** How far the user will travel for the AI day plan — drives catalog size, ordering, and prompts. */
export const TRAVEL_EXPLORE_OPTIONS = [
  {
    id: 'nearby',
    label: 'Not much',
    description: 'Nearby spots only (quick, close experiences)',
    icon: 'walk-outline',
  },
  {
    id: 'balanced',
    label: 'Normal',
    description: 'A balanced mix of nearby and slightly farther places',
    icon: 'trail-sign-outline',
  },
  {
    id: 'wide',
    label: 'Anything',
    description: 'No limits — include the best options across wider areas',
    icon: 'globe-outline',
  },
];

/** Food types — for plan generation only (what to eat). */
export const FOOD_CATEGORIES = [
  { id: 'local-arabic', label: 'Local & Arabic', icon: 'home-outline', color: M.dining },
  { id: 'asian', label: 'Asian', icon: 'layers-outline', color: M.dining },
  { id: 'thai', label: 'Thai', icon: 'leaf-outline', color: M.success },
  { id: 'japanese-korean', label: 'Japanese/Korean', icon: 'sparkles-outline', color: M.evening },
  { id: 'indian-pakistani', label: 'Indian/Pakistani', icon: 'flame-outline', color: M.morning },
  { id: 'italian', label: 'Italian', icon: 'pizza-outline', color: M.success },
  { id: 'american', label: 'American', icon: 'fast-food-outline', color: M.afternoon },
  { id: 'seafood', label: 'Seafood', icon: 'fish-outline', color: M.indigo },
  { id: 'turkish-lebanese', label: 'Turkish/Lebanese', icon: 'restaurant-outline', color: M.dining },
  { id: 'cafe-desserts', label: 'Cafe & Desserts', icon: 'cafe-outline', color: M.morning },
  { id: 'international', label: 'International', icon: 'globe-outline', color: M.indigo },
  { id: 'fast-food', label: 'Fast Food', icon: 'fast-food-outline', color: M.event },
];

export const GENERAL_GROUPS = [
  { key: 'companion', label: 'Who do you usually travel with?' },
  { key: 'pace', label: 'How do you like your day to feel?' },
  { key: 'budget', label: 'What budget level do you prefer?' },
  { key: 'interests', label: 'Which experiences do you enjoy most?' },
  { key: 'planning', label: 'How do you like your plans organized?' },
  { key: 'timing', label: 'When do you usually enjoy going out?' },
];

export function getLabelsFromIds(ids, list) {
  return (ids || [])
    .map((id) => list.find((p) => p.id === id)?.label)
    .filter(Boolean);
}

export function getGeneralLabelsFromIds(ids) {
  return getLabelsFromIds(ids, GENERAL_PREFERENCES);
}
