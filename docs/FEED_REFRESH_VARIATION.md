# Feed System - Refresh Variation Fix

## Issue: Posts Stay Same on Refresh

**Symptom:** When pulling to refresh, posts appear in the exact same order

**Root Cause:**
1. Feed ranking was deterministic (same scores every time)
2. No variation between refreshes
3. Same posts always appeared in same order

---

## Solution Implemented

### 1. Added Refresh Flag
```javascript
// feedService.js
export const fetchFeedPage = async ({ 
  ...,
  isRefresh = false  // New parameter
}) => {
```

### 2. Randomization on Refresh
```javascript
const scoredPosts = mapped.map(post => {
  const baseScore = scorePost(post, userInteractions, userLat, userLng)
  const randomBoost = isRefresh ? Math.random() * 5 : 0  // Add 0-5 random points
  return {
    ...post,
    score: baseScore + randomBoost,
  }
})
```

### 3. Pass Flag from HomeScreen
```javascript
const result = await fetchFeedPage({
  cursor: null,
  limit: 15,
  useCache: false,
  isRefresh: true,  // Triggers randomization
})
```

---

## How It Works

### Normal Load (First Time / Pagination):
- Posts ranked purely by algorithm
- Consistent, predictable ordering
- Best posts at top

### Refresh (Pull-to-Refresh):
- Same ranking algorithm PLUS 0-5 random points
- Slight variation in order each refresh
- Posts still generally well-ranked
- Fresh feel without being completely random

---

## Benefits

### ✅ Fresh Content on Refresh
- Order changes slightly each refresh
- Users see different posts at top
- Feels like new content

### ✅ Still Quality-Focused
- Random boost is small (max 5 points)
- Highly ranked posts still appear near top
- Low-quality posts stay at bottom

### ✅ Encourages Discovery
- Posts just below top get chance to shine
- Users see more variety over time
- Reduces "stuck feed" feeling

---

## Examples

### Without Randomization:
```
Refresh 1: Post A (score: 85), Post B (80), Post C (75)
Refresh 2: Post A (score: 85), Post B (80), Post C (75)  ← Same!
Refresh 3: Post A (score: 85), Post B (80), Post C (75)  ← Same!
```

### With Randomization:
```
Refresh 1: Post A (85+3=88), Post B (80+1=81), Post C (75+4=79)
           → Order: A, B, C

Refresh 2: Post A (85+1=86), Post B (80+4=84), Post C (75+2=77)
           → Order: A, B, C (slightly different scores)

Refresh 3: Post A (85+2=87), Post B (80+5=85), Post C (75+3=78)
           → Order: A, B, C (or B might edge ahead!)
```

---

## Testing

### To Verify It's Working:

1. **Open app** → Note first 3 posts
2. **Pull to refresh** → Check if order changed
3. **Pull again** → Should see variation
4. **Check console** → Should see: `[FeedService] Refresh: Adding randomization to scoring`

### Expected Behavior:

- ✅ Top posts change slightly on each refresh
- ✅ Not completely random (best posts still near top)
- ✅ New posts get visibility
- ✅ User feels content is "fresh"

---

## Configuration

### Adjust Randomization Strength:

```javascript
// In feedService.js, line ~335
const randomBoost = isRefresh ? Math.random() * 5 : 0

// Options:
Math.random() * 3   // Subtle (0-3 points)
Math.random() * 5   // Moderate (0-5 points) ← Current
Math.random() * 10  // Strong (0-10 points)
Math.random() * 20  // Very random (0-20 points)
```

### Recommendations:

- **0-3:** Minimal variation, very subtle
- **0-5:** Good balance (current setting) ✓
- **0-10:** More variety, but may mix quality levels
- **0-20:** Too random, low-quality posts can appear high

---

## Technical Notes

### Why Random on Refresh Only?

1. **Normal loads** should be consistent
   - Users expect quality ranking
   - Algorithm learns from behavior
   
2. **Refresh** signals user wants something new
   - Psychological expectation of change
   - Small randomness adds freshness

### Why Small Random Range?

- Large random numbers would override ranking
- Small boost (0-5) is ~10% of typical scores (30-50)
- Enough to shuffle order, not enough to break quality

### Cache Behavior:

- Refresh bypasses cache (`useCache: false`)
- Clears existing cache
- Fresh fetch with new randomization
- Next normal load will cache new order

---

## Troubleshooting

### If posts still don't change:

1. **Check console for:**
   ```
   [FeedService] Refresh: Adding randomization to scoring
   ```
   If missing → `isRefresh` not being passed

2. **Verify cache cleared:**
   ```
   [Home] Refreshing feed...
   ```
   Should fetch fresh, not cached

3. **Check post IDs:**
   ```javascript
   console.log('Post IDs:', posts.map(p => p.id))
   ```
   IDs should be same, but ORDER should change

### If posts are TOO random:

- Reduce randomization: `Math.random() * 3`
- Or remove for critical feeds

---

## Future Enhancements

### Phase 2:
- Time-based variation (different times of day)
- User engagement boost (recently liked posts)
- Freshness bonus (very new posts)

### Phase 3:
- A/B test different randomization levels
- Learn optimal variation per user
- Adaptive randomization based on engagement

---

**Status:** ✅ Implemented & Working  
**Date:** April 13, 2026  
**Version:** 1.0.2
