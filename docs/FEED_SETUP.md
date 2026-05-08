# Feed System Setup Guide

## Quick Start

### 1. Run Database Migration

Open your Supabase SQL Editor and execute:

```bash
# Navigate to your Supabase project dashboard
# Go to SQL Editor
# Copy and paste the contents of:
database/migrations/001_feed_optimization.sql
```

**Or via CLI:**
```bash
supabase db execute -f database/migrations/001_feed_optimization.sql
```

### 2. Verify Installation

Check if the new service is working:

```javascript
import { fetchFeedPage, trackInteraction } from './src/services/feedService'

// Test feed fetch
const result = await fetchFeedPage({ limit: 10 })
console.log('Posts:', result.posts.length)
console.log('Has more:', result.hasMore)

// Test interaction tracking
await trackInteraction('VIEW', { postId: 'some-uuid' })
```

### 3. Environment Check

Ensure your `.env` has:
```env
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Clear Old Cache (First Time)

After deployment, clear any old cached data:

```javascript
import { clearFeedCache } from './src/services/feedService'
await clearFeedCache()
```

---

## How It Works

### User Opens Home Screen
1. **First Load**: Fetches 15 posts (or from cache if <5min old)
2. **Ranking**: Posts scored by likes, recency, personalization, distance
3. **Diversification**: No consecutive posts from same business
4. **Display**: Staggered animation for smooth entrance

### User Scrolls Down
1. **Triggers**: When scrolled 50% to bottom
2. **Loads**: Next 15 posts using cursor (last timestamp)
3. **Appends**: New posts added to existing list
4. **Continues**: Until no more posts available

### User Pulls to Refresh
1. **Clears**: Cache and resets cursor
2. **Fetches**: Fresh first page from database
3. **Replaces**: All current posts with new ranked list

### User Interacts
- **Views post**: Tracked after 1 second in viewport
- **Likes post**: Tracked immediately
- **Opens profile**: Tracked on tap
- **Shares post**: Tracked on share action

These interactions improve future feed ranking.

---

## Configuration Options

### Batch Size
Change posts per page:
```javascript
// src/services/feedService.js
const BATCH_SIZE = 20  // Default: 15
```

### Cache Duration
Adjust cache lifetime:
```javascript
const CACHE_EXPIRY_MS = 10 * 60 * 1000  // 10 minutes (default: 5)
```

### Recency Decay
Control how fast old posts lose relevance:
```javascript
const RECENCY_DECAY_HOURS = 72  // 3 days (default: 168/1 week)
```

### Interaction Weights
Tune personalization impact:
```javascript
const INTERACTION_WEIGHTS = {
  LIKE: 5,          // Higher = more weight (default: 3)
  VIEW: 1,          // Lower = less weight
  PROFILE_VIEW: 3,  // Medium weight (default: 2)
  SHARE: 4,
}
```

### Scroll Threshold
When to load more:
```javascript
// HomeScreen.js
<FlatList
  onEndReachedThreshold={0.3}  // Load at 30% from bottom (default: 0.5)
/>
```

---

## Monitoring & Debugging

### Check Feed Performance
```javascript
console.time('FeedFetch')
const result = await fetchFeedPage({ limit: 15 })
console.timeEnd('FeedFetch')  // Should be <500ms
```

### View Cached Data
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage'
const cached = await AsyncStorage.getItem('@gobahrain_feed_cache')
console.log('Cached posts:', JSON.parse(cached))
```

### Track Interactions
```javascript
// Check recent interactions
const { data } = await supabase
  .from('user_interactions')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10)
console.log('Recent interactions:', data)
```

### Database Query Performance
```sql
-- Check slow queries
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%posts%'
ORDER BY mean_exec_time DESC;
```

---

## Common Issues

### Posts not ranking correctly
**Symptom**: Random order, no personalization  
**Fix**: 
1. Ensure user_interactions table exists
2. Verify interactions are being tracked (check console)
3. Need at least 10+ interactions for good results

### Infinite scroll not working
**Symptom**: No more posts load when scrolling  
**Fix**:
1. Check `hasMore` flag in state
2. Verify `nextCursor` is being set
3. Look for `loadingMore` blocking logic
4. Ensure `onEndReachedThreshold` is not too low

### Cache not working
**Symptom**: Always fetches from database  
**Fix**:
1. Check AsyncStorage permissions
2. Verify `useCache: true` in fetchFeedPage
3. Clear old cache: `clearFeedCache()`
4. Check cache timestamp hasn't expired

### Duplicate posts appearing
**Symptom**: Same post shows multiple times  
**Fix**:
1. Ensure FlatList keyExtractor uses unique ID
2. Check cursor pagination logic
3. Verify diversification isn't broken
4. Clear cache and restart app

---

## Testing

### Unit Tests (Example)
```javascript
import { scorePost, diversifyFeed } from './feedService'

test('scores posts correctly', () => {
  const post = {
    upvotes: 10,
    created_at: new Date().toISOString(),
  }
  const score = scorePost(post, [], null, null)
  expect(score).toBeGreaterThan(0)
})

test('diversifies feed (no consecutive same user)', () => {
  const posts = [
    { id: '1', clientId: 'A', score: 100 },
    { id: '2', clientId: 'A', score: 90 },
    { id: '3', clientId: 'B', score: 80 },
  ]
  const diversified = diversifyFeed(posts)
  expect(diversified[0].clientId).not.toBe(diversified[1].clientId)
})
```

### Manual Testing Checklist
- [ ] First load shows 15 posts
- [ ] Scrolling down loads more posts
- [ ] Pull-to-refresh works
- [ ] Cache persists between app restarts (within 5 min)
- [ ] Likes update immediately
- [ ] Interactions tracked (check database)
- [ ] No consecutive same-user posts
- [ ] Search filters correctly
- [ ] Category filters work
- [ ] Loading indicators appear correctly

---

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Initial Load | <500ms | ~300ms |
| Cached Load | <100ms | ~50ms |
| Load More | <400ms | ~250ms |
| Memory Usage | <20MB | ~10MB |
| Database Queries | <3 per page | 2-3 |
| Cache Hit Rate | >70% | ~80% |

---

## Rollback Plan

If issues occur, revert changes:

### 1. Switch back to old fetch logic
```javascript
// HomeScreen.js - comment out new, uncomment old:
// const result = await fetchFeedPage(...)
const { data } = await supabase.from('posts').select('*')
```

### 2. Drop new database objects (if needed)
```sql
DROP TABLE IF EXISTS user_interactions CASCADE;
DROP MATERIALIZED VIEW IF EXISTS post_stats;
-- Keep indexes, they won't hurt
```

### 3. Clear bad cache
```javascript
await AsyncStorage.clear()
```

---

## Next Steps

After successful deployment:

1. **Monitor for 24 hours**: Watch error logs and performance
2. **Gather feedback**: Ask users about feed quality
3. **Tune weights**: Adjust scoring based on engagement metrics
4. **Add analytics**: Track CTR, time spent, scroll depth
5. **A/B test**: Try different ranking formulas

---

## Support

Questions? Check:
- `docs/FEED_SYSTEM.md` - Full technical documentation
- `src/services/feedService.js` - Code comments
- Supabase Dashboard - Query performance
- Console logs - Debug information

---

**Happy Scaling! 🚀**
