/**
 * Shared preference options.
 * - GENERAL_PREFERENCES: unique, general "about you" options (understand the user). Used everywhere.
 * - PREFERENCES: experience types — chosen in the AI Plan builder only (not profile).
 * - FOOD_CATEGORIES: food / cuisine styles — chosen in the AI Plan builder only (not profile).
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
  { id: 'solo', label: 'Mostly solo', icon: 'person-outline', color: M.muted, group: 'companion' },
  { id: 'family', label: 'Family outings', icon: 'people-outline', color: M.success, group: 'companion' },
  { id: 'friends', label: 'Friends & social', icon: 'people-circle-outline', color: M.afternoon, group: 'companion' },
  /** What the user wants AI / personalization to optimize for (not venue types). */
  { id: 'focus-discover', label: "Spots I wouldn't find alone", icon: 'compass-outline', color: M.morning, group: 'coach_focus' },
  { id: 'focus-dayflow', label: 'Smooth schedule & timing', icon: 'calendar-outline', color: M.indigo, group: 'coach_focus' },
  { id: 'focus-people', label: 'Clear picks—less decision fatigue', icon: 'checkmark-done-outline', color: M.success, group: 'coach_focus' },
  { id: 'focus-host', label: 'Birthdays, milestones & visitors', icon: 'star-outline', color: M.afternoon, group: 'coach_focus' },
  { id: 'focus-shake', label: 'New picks, not my same loop', icon: 'shuffle-outline', color: M.evening, group: 'coach_focus' },
  { id: 'pace-relaxed', label: 'Relaxed — lighter day', icon: 'leaf-outline', color: M.success, group: 'pace' },
  { id: 'pace-balanced', label: 'Balanced — steady full day', icon: 'scale-outline', color: M.morning, group: 'pace' },
  { id: 'pace-packed', label: 'Packed — max the schedule', icon: 'flash-outline', color: M.dining, group: 'pace' },
  { id: 'budget-friendly', label: 'Budget-smart', icon: 'wallet-outline', color: M.success, group: 'budget' },
  { id: 'moderate', label: 'Moderate — mid-range', icon: 'card-outline', color: M.afternoon, group: 'budget' },
  { id: 'splurge', label: 'Happy to splurge', icon: 'diamond-outline', color: M.evening, group: 'budget' },
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
  /** Saved profile: how much day plans should minimize driving / backtracking. */
  { id: 'route-efficient', label: 'Short drives between stops', icon: 'navigate-outline', color: M.success, group: 'route_efficiency' },
  { id: 'route-flexible', label: 'Best picks over short drives', icon: 'map-outline', color: M.indigo, group: 'route_efficiency' },
  /** Legacy life_lens chips (profile only — no longer asked in onboarding). */
  { id: 'lens-exploring', label: 'Still learning Bahrain', icon: 'map-outline', color: M.morning, group: 'life_lens' },
  { id: 'lens-local', label: 'Local — deeper & fresher picks', icon: 'home-outline', color: M.success, group: 'life_lens' },
  { id: 'lens-weekends', label: 'Mostly free Fri–Sun', icon: 'calendar-outline', color: M.indigo, group: 'life_lens' },
  { id: 'lens-evenings', label: 'Evenings / off-hours outings', icon: 'moon-outline', color: M.evening, group: 'life_lens' },
  { id: 'lens-between', label: 'Split time—here sometimes', icon: 'trail-sign-outline', color: M.muted, group: 'life_lens' },
  { id: 'choose-research', label: 'Research & reviews first', icon: 'search-outline', color: M.indigo, group: 'choose_style' },
  { id: 'choose-circle', label: 'Trusted people’s picks', icon: 'chatbubbles-outline', color: M.afternoon, group: 'choose_style' },
  { id: 'choose-mood', label: 'Mood in the moment', icon: 'color-filter-outline', color: M.evening, group: 'choose_style' },
  { id: 'choose-blend', label: 'Depends — I mix styles', icon: 'options-outline', color: M.muted, group: 'choose_style' },
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
  { key: 'coach_focus', label: 'What should the AI help you with most?' },
  { key: 'pace', label: 'How do you like your day to feel?' },
  { key: 'budget', label: 'What budget level do you prefer?' },
  { key: 'interests', label: 'Which experiences do you enjoy most?' },
  { key: 'route_efficiency', label: 'How should we order stops on your day plan?' },
  { key: 'life_lens', label: 'What’s your day-to-day context in Bahrain? (legacy)' },
  { key: 'choose_style', label: 'How do you pick where to go?' },
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

/** Profile route preference for day-plan ordering — default tight routes. */
export const getRouteEfficiencyFromGeneralIds = (ids) => {
  const list = Array.isArray(ids) ? ids : []
  if (list.includes('route-flexible')) return 'flexible'
  if (list.includes('route-efficient')) return 'efficient'
  return 'efficient'
}
