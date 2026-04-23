import { Dimensions } from 'react-native'
import { PREFERENCES, FOOD_CATEGORIES, TRAVEL_EXPLORE_OPTIONS } from '../../constants/preferences'
import { colors as themeColors } from '../../theme/designTokens'

export const PLAN_MAP_CLIENT_TYPE_FILTERS = [
  { id: 'all', label: 'All', icon: 'apps-outline' },
  { id: 'restaurant', label: 'Restaurants', icon: 'restaurant-outline' },
  { id: 'place', label: 'Places', icon: 'location-outline' },
  { id: 'event', label: 'Events', icon: 'calendar-outline' },
]

/** Quick find: pick a category then a subcategory (same three groups as map filters, without “All”). */
export const QUICK_FIND_KIND_OPTIONS = PLAN_MAP_CLIENT_TYPE_FILTERS.filter((f) => f.id !== 'all')

export const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

export const PLAN_TIME_SLOTS = ['Morning', 'Afternoon', 'Evening']

/** Bottom inset for plan sheet / marker sheet — matches floating BottomControlBar (lifted FAB + dock) + safe area */
export const PLAN_TAB_BAR_ROW_HEIGHT = 100
/**
 * Map orbit / full-screen map: clearance from the **screen bottom** to float controls so they sit
 * fully **above** `BottomControlBar` (dock + `FAB_FLOAT_LIFT` + center FAB). Larger than
 * `PLAN_TAB_BAR_ROW_HEIGHT` because the bar’s visual stack is taller than the dock row alone.
 */
export const BOTTOM_CONTROL_BAR_MAP_CLEARANCE = 200
/** Map orbit mode: filmstrip vertical anchor (fraction of screen height from top) */
export const ORBIT_SLIDER_TOP_FRACTION = 0.22
/**
 * Orbit “Done” — `top` offset added to safe-area top so the pill sits centered, just under the
 * map filter row (`topBarWrap` + chip row ~52–56pt + bar padding).
 */
export const ORBIT_DONE_BELOW_FILTER_OFFSET = 72
/** Extra gap above the tab bar stack for the “View details” pill (orbit mode) */
export const ORBIT_VIEW_DETAILS_ABOVE_DOCK = 0
/**
 * Orbit bottom chrome: subtract from the usual map bottom offset so the card sits lower (closer to the dock).
 * Larger value = more map visible above the card (so the tapped marker isn't covered).
 */
export const ORBIT_BOTTOM_CHROME_PULL_DOWN = 96
/**
 * Map orbit: keep the BottomControlBar + plan sheet in their normal position. The orbit chrome floats
 * above them without displacing the navbar to avoid a jarring tab-bar shift when entering orbit.
 */
export const ORBIT_PLAN_SHEET_AND_TAB_PULL_DOWN = 0
export const ORBIT_TAB_BAR_PULL_DOWN = ORBIT_PLAN_SHEET_AND_TAB_PULL_DOWN
/** Added to plan sheet translateY while orbit is active */
export const ORBIT_SHEET_EXTRA_TRANSLATE_Y = ORBIT_PLAN_SHEET_AND_TAB_PULL_DOWN
export const getPlanSheetBottomPadding = (insets) => {
  const bottomInset = Math.max(insets?.bottom ?? 0, 12)
  return PLAN_TAB_BAR_ROW_HEIGHT + bottomInset + 16
}

export const SHEET_VISIBLE_PEEK = 0.28
export const SHEET_VISIBLE_MID = 0.75
/** Fraction of screen height for the sheet (list + masthead). Higher = taller plan container */
export const SHEET_VISIBLE_EXPANDED = 0.94

export const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_VISIBLE_EXPANDED
export const SHEET_TOP_EXPANDED = SCREEN_HEIGHT - SHEET_HEIGHT
export const SHEET_TOP_MID = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_MID)
export const SHEET_TOP_PEEK = SCREEN_HEIGHT * (1 - SHEET_VISIBLE_PEEK)

export const SNAP_POINTS = [
  0,
  SHEET_TOP_MID - SHEET_TOP_EXPANDED,
  SHEET_TOP_PEEK - SHEET_TOP_EXPANDED,
]
export const INITIAL_SNAP_INDEX = 2

export const BAHRAIN_REGION = {
  latitude: 26.0667,
  longitude: 50.5577,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
}

export const BAHRAIN_BOUNDS = {
  minLat: 25.55,
  maxLat: 26.40,
  minLng: 50.30,
  maxLng: 50.95,
}

export { PREFERENCES, FOOD_CATEGORIES, TRAVEL_EXPLORE_OPTIONS }

export const SURPRISE_THEMES = [
  { label: 'Scenic Day', icon: 'heart', color: themeColors.evening, prefs: ['Landmarks', 'Leisure'], food: ['Italian', 'Seafood'] },
  { label: 'Adventure', icon: 'rocket', color: themeColors.error, prefs: ['Adventure', 'Nature'], food: ['Quick'] },
  { label: 'Chill Vibes', icon: 'leaf', color: themeColors.success, prefs: ['Leisure', 'Nature'], food: ['Café'] },
  { label: 'Foodie Tour', icon: 'restaurant', color: themeColors.dining, prefs: ['Landmarks'], food: ['Subcontinent', 'Seafood', 'Asian'] },
  { label: 'Culture Buff', icon: 'color-palette', color: themeColors.primary, prefs: ['Culture', 'History'], food: ['Local'] },
  { label: 'Nightlife', icon: 'moon', color: themeColors.evening, prefs: ['Photos', 'Leisure'], food: ['Global'] },
  { label: 'Family Fun', icon: 'people', color: themeColors.afternoon, prefs: ['Landmarks', 'Leisure'], food: ['American', 'Quick'] },
  { label: 'Hidden Gems', icon: 'diamond', color: themeColors.morning, prefs: ['Culture', 'Nature'], food: ['Subcontinent', 'Local'] },
]

// Plan modal overlay (modern primary)
export const PLAN_COLORS = {
  primary: themeColors.primary,
  overlayQuestionTitle: '#FFFFFF',
  overlayQuestionSub: 'rgba(255,255,255,0.88)',
  overlayBlockBg: 'rgba(255,255,255,0.2)',
  overlayBlockBorder: 'rgba(255,255,255,0.35)',
  overlayBlockText: '#FFFFFF',
}

// Bahrain trivia while the plan modal is generating
export const BAHRAIN_FACTS = [
  'Bahrain was once the heart of the ancient Dilmun civilization, a key trading hub for thousands of years.',
  'Locals love evening walks along the corniche – the skyline and sea breeze are perfect after sunset.',
  'Traditional Bahraini breakfast often includes balaleet (sweet vermicelli) and khubz (Arabic bread).',
  'Manama Souq is one of the best places to feel the old-meets-new soul of Bahrain in a single walk.',
  'Pearling was once Bahrain’s main industry – the Pearling Trail in Muharraq is now a UNESCO site.',
  'Bahrain has a vibrant cafe culture – from hidden specialty coffee spots to seaside shisha lounges.',
  'The Bahrain International Circuit hosts Formula 1 night races – the desert lights make it unforgettable.',
  "Bahrain Fort (Qal'at al-Bahrain) is a UNESCO site where you can walk through 4,000 years of history.",
  'The Tree of Life stands alone in the desert – nobody is quite sure how its deep roots still find water.',
  'Block 338 in Adliya is famous for street art, galleries, and some of the island’s best casual dining.',
  'Bahrain’s islands are linked by the King Fahd Causeway – a scenic drive to Saudi Arabia on a clear day.',
  'Muharraq’s lanes hide restored pearling merchant houses that tell the story of the Gulf’s golden age.',
  'Winter months bring perfect outdoor weather – rooftop sunsets and open-air markets feel made for it.',
  'The National Museum is a calm, air-conditioned deep dive into archaeology, dhows, and modern Bahrain.',
]

export const STOP_DIALOG_EDGE = 4
export const STOP_DIALOG_ARROW_BTN = 32
export const STOP_DIALOG_ARROW_GAP = 3
export const STOP_DIALOG_SLIDE_WIDTH = Math.min(
  580,
  SCREEN_WIDTH - STOP_DIALOG_EDGE * 2 - STOP_DIALOG_ARROW_BTN * 2 - STOP_DIALOG_ARROW_GAP * 2
)
export const STOP_DIALOG_IMAGE_H = Math.min(312, Math.round(SCREEN_HEIGHT * 0.36))
export const STOP_DIALOG_IMAGE_W = STOP_DIALOG_SLIDE_WIDTH

/** Stop-detail swipe: peek + exit distances */
export const STOP_DETAIL_SWIPE_PEEK_RANGE = SCREEN_WIDTH * 0.34
export const STOP_DETAIL_EXIT_X = SCREEN_WIDTH * 1.12
export const STOP_DETAIL_SWIPE_SNAP_BACK = { damping: 19, stiffness: 260, mass: 0.72 }
export const STOP_DETAIL_SWIPE_COMMIT = { damping: 17, stiffness: 300, mass: 0.58 }


