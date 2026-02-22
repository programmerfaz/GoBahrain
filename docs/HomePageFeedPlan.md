# Home Page – Instagram-style feed

**Constraint:** Colors and theme must match the rest of the app (see [App theme](#app-theme-must-match) below).

## App theme (must match)

Use the same palette as [BottomControlBar.js](src/components/BottomControlBar.js), [ScreenContainer.js](src/components/ScreenContainer.js), and [AIPlanScreen.js](src/screens/AIPlanScreen.js):

| Usage | Color | Notes |
|-------|--------|------|
| **Primary / brand** | `#C8102E` | Bahrain red – Home tab active, AI button, primary actions, selected states |
| **Screen background** | `#fff` | Same as ScreenContainer |
| **Cards / surfaces** | `#FFFFFF`, `#F9FAFB` | White and light gray |
| **Primary text** | `#111827` | Headings, usernames |
| **Secondary text** | `#6B7280` | Location, metadata |
| **Muted text** | `#9CA3AF`, `#4B5563` | Inactive nav, hints |
| **Borders / dividers** | `rgba(209,213,219,0.7)` or `rgba(209,213,219,0.8)` | Card borders |
| **Explore / blue accent** | `#0EA5E9` | Used for Explore tab; can use for one category chip |
| **Success / “Open Now”** | `#10B981` or `#16A34A` | Green pill, success states |
| **Category chip set** | From AIPlanScreen SPOT_COLORS: `#C8102E`, `#F97316`, `#0EA5E9`, `#10B981`, `#6366F1` | Orange, blue, green, purple for Nearby/Food/Hangout/Trending/Open Now |
| **Bar background** | `#FFFFFF` | Same as bottom bar; use for app bar |
| **Badge (notifications)** | Red background (e.g. `#EF4444` or `#C8102E`) with white text | Bell count |
| **Shadows** | `shadowColor: '#000'`, light opacity | Same as bottom bar where needed |

No new color system; reuse these hex/rgba values so the Home screen matches the rest of the app.

---

## Current state

- [HomeScreen.js](src/screens/HomeScreen.js) is a minimal placeholder.
- App uses bottom tabs with custom [BottomControlBar](src/components/BottomControlBar.js); no stack navigator, so each screen owns its own header.
- [ScreenContainer](src/components/ScreenContainer.js) uses `backgroundColor: '#fff'` and bottom padding for the tab bar.
- StatusBar is `style="dark"` in [App.js](App.js).

## Target layout (from reference, light theme matching app)

1. **App bar (top)**  
   - Left: airplane icon in Bahrain red (`#C8102E`) + “Go Bahrain” text in primary text color (`#111827`).  
   - Right: bell icon (muted `#6B7280` or `#4B5563`) + red badge with count (e.g. “3”) using `#C8102E` or `#EF4444` and white text.  
   - Background: `#FFFFFF`; optional border `rgba(209,213,219,0.7)`.

2. **Category bar (horizontal scroll)**  
   - Chips: Nearby (selected), Food, Hangout, Trending, Open Now.  
   - Use app accent set: e.g. Nearby `#C8102E`, Food `#10B981`, Hangout `#0EA5E9`, Trending `#F97316`, Open Now `#6366F1` or `#10B981`.  
   - Selected: filled circle + icon + label; unselected: same colors with lighter background (e.g. `${color}11` as in AIPlanScreen).  
   - Text: primary/dark (`#111827`) for readability on light theme.

3. **Feed (vertical scroll)**  
   - [FlatList](https://reactnative.dev/docs/flatlist) of post cards.  
   - Each **post card** (background `#FFFFFF`, borders `rgba(209,213,219,0.7)`):  
     - **Header row:** Avatar placeholder | username (`#111827`) + verified check (red `#C8102E`) | location (`#6B7280`) | right-aligned “Open Now” pill (green `#10B981` or `#16A34A`, white text).  
     - **Metadata row:** Pills for distance and price (background `#F3F4F6` or `#F9FAFB`, text `#4B5563` or `#6B7280`).  
     - **Image:** Full-width image (placeholder URI or local asset).

4. **Bottom nav**  
   - No change; already in BottomControlBar.

## Implementation

- Implement in [src/screens/HomeScreen.js](src/screens/HomeScreen.js): custom app bar, horizontal ScrollView for categories, FlatList for posts. Use ScreenContainer so tab bar spacing stays correct.
- Icons: `@expo/vector-icons` (Ionicons) – e.g. `airplane`, `notifications-outline`, `location`, `restaurant`, `pricetag`, `checkmark-circle`.
- Data: mock array of posts (`id`, `username`, `verified`, `location`, `distance`, `priceRange`, `imageUri`).
- Safe area: `useSafeAreaInsets()` for top padding of app bar; ScreenContainer handles bottom.

## File changes

| File | Change |
|------|--------|
| [src/screens/HomeScreen.js](src/screens/HomeScreen.js) | Replace placeholder with app bar, category bar, and FlatList feed; use only the colors listed in [App theme](#app-theme-must-match) above. |
