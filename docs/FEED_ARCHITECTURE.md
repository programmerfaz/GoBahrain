# Feed System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER OPENS HOME SCREEN                      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Check AsyncStorage   │◄── Cache (5 min TTL)
                    │   for Cached Feed      │
                    └────────────┬───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              Cache Hit                  Cache Miss
                    │                         │
                    ▼                         ▼
          ┌─────────────────┐    ┌──────────────────────┐
          │ Return Cached   │    │  Fetch from Database │
          │ Posts (instant) │    │  (cursor-based)      │
          └────────┬────────┘    └──────────┬───────────┘
                   │                         │
                   │                         ▼
                   │             ┌──────────────────────┐
                   │             │  Load Client Data    │
                   │             │  (business info)     │
                   │             └──────────┬───────────┘
                   │                         │
                   │                         ▼
                   │             ┌──────────────────────┐
                   │             │  Load Upvote Counts  │
                   │             │  (aggregated)        │
                   │             └──────────┬───────────┘
                   │                         │
                   │                         ▼
                   │             ┌──────────────────────┐
                   │             │ Get User Interactions│
                   │             │ (last 100)           │
                   │             └──────────┬───────────┘
                   │                         │
                   │                         ▼
                   │             ┌──────────────────────┐
                   │             │  SCORING ENGINE      │
                   │             │  ─────────────────   │
                   │             │  • Likes Score       │
                   │             │  • Recency Score     │
                   │             │  • Personalization   │
                   │             │  • Distance Score    │
                   │             │  • Engagement Rate   │
                   │             └──────────┬───────────┘
                   │                         │
                   │                         ▼
                   │             ┌──────────────────────┐
                   │             │  DIVERSIFICATION     │
                   │             │  ─────────────────   │
                   │             │  Reorder to prevent  │
                   │             │  consecutive posts   │
                   │             │  from same user      │
                   │             └──────────┬───────────┘
                   │                         │
                   │                         ▼
                   │             ┌──────────────────────┐
                   │             │  Cache Results       │
                   │             │  (AsyncStorage)      │
                   │             └──────────┬───────────┘
                   │                         │
                   └─────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Display in FlatList  │
                    │   (15 posts)           │
                    └────────────┬───────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
   ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐
   │ User Scrolls │   │ User Likes Post  │   │ User Opens      │
   │ to Bottom    │   │ (double-tap)     │   │ Profile         │
   └──────┬───────┘   └────────┬─────────┘   └────────┬────────┘
          │                    │                       │
          ▼                    ▼                       ▼
   ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐
   │ Load Next    │   │ Track LIKE       │   │ Track PROFILE   │
   │ 15 Posts     │   │ Interaction      │   │ VIEW            │
   │ (cursor++)   │   │ (weight: 3)      │   │ (weight: 2)     │
   └──────┬───────┘   └────────┬─────────┘   └────────┬────────┘
          │                    │                       │
          │                    └───────────┬───────────┘
          │                                │
          │                                ▼
          │                    ┌──────────────────────┐
          │                    │  user_interactions   │
          │                    │  Table (PostgreSQL)  │
          │                    └──────────────────────┘
          │                                │
          │                                ▼
          │                    ┌──────────────────────┐
          │                    │  Improves Future     │
          │                    │  Feed Ranking        │
          │                    └──────────────────────┘
          │
          ▼
   ┌──────────────────────────────────────────────────┐
   │  Repeat: Fetch → Score → Diversify → Display    │
   └──────────────────────────────────────────────────┘


════════════════════════════════════════════════════════════

                    DATABASE STRUCTURE

┌─────────────────────────────────────────────────────────┐
│                      POSTS TABLE                        │
│  ─────────────────────────────────────────────────────  │
│  • post_uuid (PK)         • description                 │
│  • client_a_uuid (FK)     • post_image                  │
│  • created_at (indexed)   • price_range                 │
│  • updated_at             • ...                         │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┴───────────┬─────────────────┐
        │                       │                 │
        ▼                       ▼                 ▼
┌───────────────┐    ┌─────────────────┐   ┌──────────────────┐
│ POST_UPVOTE   │    │ CLIENT TABLE    │   │ USER_INTERACTIONS│
│ ────────────  │    │ ──────────────  │   │ ──────────────── │
│ • post_uuid   │    │ • client_a_uuid │   │ • voter_id       │
│ • voter_id    │    │ • business_name │   │ • post_uuid      │
│ • created_at  │    │ • location      │   │ • client_uuid    │
│               │    │ • lat, long     │   │ • type (VIEW,    │
│ (indexed)     │    │ • tags          │   │   LIKE, etc)     │
└───────────────┘    │ • rating        │   │ • created_at     │
                     └─────────────────┘   │                  │
                                           │ (indexed)        │
                                           └──────────────────┘

════════════════════════════════════════════════════════════

                    SCORING FORMULA

┌─────────────────────────────────────────────────────────┐
│                    FINAL SCORE                          │
│                         │                               │
│        ┌────────────────┼────────────────┐             │
│        │                │                │             │
│        ▼                ▼                ▼             │
│  ┌──────────┐   ┌──────────────┐  ┌──────────────┐   │
│  │  LIKES   │   │   RECENCY    │  │PERSONALIZATION│   │
│  │  SCORE   │   │    SCORE     │  │     SCORE     │   │
│  │          │   │              │  │               │   │
│  │ log10(   │   │  20 × (1 -   │  │ Σ(interaction │   │
│  │ likes+1) │   │  age/168hrs) │  │   × weight)   │   │
│  │  × 10    │   │              │  │               │   │
│  └──────────┘   └──────────────┘  └──────────────┘   │
│        │                │                │             │
│        └────────────────┼────────────────┘             │
│                         │                               │
│        ┌────────────────┼────────────────┐             │
│        │                                 │             │
│        ▼                                 ▼             │
│  ┌──────────────┐              ┌──────────────────┐   │
│  │  DISTANCE    │              │   ENGAGEMENT     │   │
│  │   SCORE      │              │      RATE        │   │
│  │              │              │                  │   │
│  │ 15 × exp(    │              │  (upvotes/days)  │   │
│  │ -dist/5km)   │              │      × 5         │   │
│  └──────────────┘              └──────────────────┘   │
│        │                                 │             │
│        └─────────────┬───────────────────┘             │
│                      │                                 │
│                      ▼                                 │
│              ┌──────────────┐                          │
│              │ FINAL SCORE  │                          │
│              │   (0-100+)   │                          │
│              └──────────────┘                          │
└─────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════

                 DIVERSIFICATION ALGORITHM

Input: [ Post1(A, score:100), Post2(A, score:90), Post3(B, score:80) ]
       └─ Same User ─┘

Step 1: Sort by score (descending)
        [ Post1(A, 100), Post2(A, 90), Post3(B, 80) ]

Step 2: Apply diversity constraint
        ┌─────────────────────────────────────────┐
        │ Track last 3 users seen                 │
        │ Skip posts from recent users            │
        │ Reorder to alternate users              │
        └─────────────────────────────────────────┘

Output: [ Post1(A, 100), Post3(B, 80), Post2(A, 90) ]
        └─ No consecutive same user ─┘

════════════════════════════════════════════════════════════

                    CACHING STRATEGY

┌─────────────────────────────────────────────────────────┐
│                  AsyncStorage Cache                     │
│  ─────────────────────────────────────────────────────  │
│  Key: @gobahrain_feed_cache                            │
│  Value: { posts: [...], nextCursor, hasMore }         │
│  TTL: 5 minutes                                         │
│                                                         │
│  On Read:                                              │
│    1. Check timestamp                                  │
│    2. If < 5min old → Return cached                   │
│    3. If > 5min old → Fetch fresh, update cache       │
│                                                         │
│  On Refresh:                                           │
│    1. Clear cache                                      │
│    2. Fetch fresh data                                 │
│    3. Write to cache                                   │
│                                                         │
│  On New Post:                                          │
│    1. Invalidate cache (clearFeedCache)               │
│    2. Next load will fetch fresh                       │
└─────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════

                 INFINITE SCROLL FLOW

User scrolls down...
        │
        ▼
┌───────────────────────┐
│ Scroll Position > 50% │  ◄── onEndReachedThreshold
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ hasMore = true?       │
│ loadingMore = false?  │
└───────────┬───────────┘
            │ Yes
            ▼
┌───────────────────────┐
│ Set loadingMore=true  │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ fetchFeedPage({       │
│   cursor: nextCursor, │
│   append: true        │
│ })                    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Append new posts to   │
│ existing list         │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Update nextCursor     │
│ Set loadingMore=false │
└───────────────────────┘

════════════════════════════════════════════════════════════
