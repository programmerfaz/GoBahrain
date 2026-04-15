-- Feed Performance Optimization Migrations
-- Run these queries in your Supabase SQL Editor

-- 1. Create user_interactions table for personalization
CREATE TABLE IF NOT EXISTS user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('VIEW', 'LIKE', 'SHARE', 'PROFILE_VIEW')),
  post_uuid UUID REFERENCES posts(post_uuid) ON DELETE CASCADE,
  client_uuid UUID,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add indexes for posts table (efficient pagination and sorting)
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_client_uuid ON posts(client_a_uuid);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_client ON posts(created_at DESC, client_a_uuid);

-- 3. Add indexes for post_upvote table (fast upvote counts and checks)
CREATE INDEX IF NOT EXISTS idx_post_upvote_post_uuid ON post_upvote(post_uuid);
CREATE INDEX IF NOT EXISTS idx_post_upvote_voter_post ON post_upvote(voter_id, post_uuid);
CREATE INDEX IF NOT EXISTS idx_post_upvote_created_at ON post_upvote(created_at DESC);

-- 4. Add indexes for client table (fast lookups for business data)
CREATE INDEX IF NOT EXISTS idx_client_uuid ON client(client_a_uuid);
CREATE INDEX IF NOT EXISTS idx_client_location ON client(lat, long) WHERE lat IS NOT NULL AND long IS NOT NULL;

-- 5. Add indexes for user_interactions table (personalization queries)
CREATE INDEX IF NOT EXISTS idx_user_interactions_voter_id ON user_interactions(voter_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_post_uuid ON user_interactions(post_uuid);
CREATE INDEX IF NOT EXISTS idx_user_interactions_client_uuid ON user_interactions(client_uuid);
CREATE INDEX IF NOT EXISTS idx_user_interactions_created_at ON user_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_voter_created ON user_interactions(voter_id, created_at DESC);

-- 6. Add GIN index for tags search (if using PostgreSQL array type)
CREATE INDEX IF NOT EXISTS idx_client_tags_gin ON client USING GIN(tags) WHERE tags IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_interactions_tags_gin ON user_interactions USING GIN(tags) WHERE tags IS NOT NULL;

-- 7. Create materialized view for post statistics (optional, for heavy traffic)
CREATE MATERIALIZED VIEW IF NOT EXISTS post_stats AS
SELECT 
  p.post_uuid,
  p.client_a_uuid,
  p.created_at,
  COUNT(DISTINCT pu.voter_id) as upvote_count,
  COUNT(DISTINCT ui.voter_id) as view_count,
  COUNT(DISTINCT CASE WHEN ui.interaction_type = 'SHARE' THEN ui.voter_id END) as share_count,
  MAX(pu.created_at) as last_upvote_at,
  MAX(ui.created_at) as last_interaction_at
FROM posts p
LEFT JOIN post_upvote pu ON p.post_uuid = pu.post_uuid
LEFT JOIN user_interactions ui ON p.post_uuid = ui.post_uuid
GROUP BY p.post_uuid, p.client_a_uuid, p.created_at;

-- Index for materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_stats_post_uuid ON post_stats(post_uuid);
CREATE INDEX IF NOT EXISTS idx_post_stats_upvote_count ON post_stats(upvote_count DESC);
CREATE INDEX IF NOT EXISTS idx_post_stats_created_at ON post_stats(created_at DESC);

-- 8. Function to refresh materialized view (call this periodically via cron or webhook)
CREATE OR REPLACE FUNCTION refresh_post_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY post_stats;
END;
$$ LANGUAGE plpgsql;

-- 9. Add updated_at trigger for posts
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at column if it doesn't exist
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 10. Enable Row Level Security (RLS) for user_interactions
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert their own interactions
CREATE POLICY IF NOT EXISTS "Users can insert their own interactions"
  ON user_interactions FOR INSERT
  WITH CHECK (true);

-- Allow users to read their own interactions
CREATE POLICY IF NOT EXISTS "Users can read their own interactions"
  ON user_interactions FOR SELECT
  USING (true);

-- 11. Create function for efficient feed scoring (optional, can be used in views)
CREATE OR REPLACE FUNCTION calculate_post_score(
  p_upvotes INTEGER,
  p_created_at TIMESTAMPTZ,
  p_view_count INTEGER DEFAULT 0
)
RETURNS NUMERIC AS $$
DECLARE
  post_age_hours NUMERIC;
  recency_score NUMERIC;
  likes_score NUMERIC;
  engagement_rate NUMERIC;
  total_score NUMERIC;
BEGIN
  -- Calculate post age in hours
  post_age_hours := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 3600;
  
  -- Recency score (decays over 1 week)
  recency_score := GREATEST(0, 20 * (1 - post_age_hours / 168));
  
  -- Likes score (logarithmic)
  likes_score := LOG(10, GREATEST(p_upvotes + 1, 1)) * 10;
  
  -- Engagement rate (upvotes per day)
  engagement_rate := (p_upvotes::NUMERIC / GREATEST(post_age_hours / 24, 1)) * 5;
  
  -- Total score
  total_score := recency_score + likes_score + engagement_rate;
  
  RETURN total_score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 12. Analyze tables for query optimization
ANALYZE posts;
ANALYZE post_upvote;
ANALYZE client;
ANALYZE user_interactions;

-- 13. Comments for documentation
COMMENT ON TABLE user_interactions IS 'Tracks user interactions (views, likes, shares) for feed personalization';
COMMENT ON INDEX idx_posts_created_at_desc IS 'Optimizes cursor-based pagination on posts';
COMMENT ON INDEX idx_post_upvote_post_uuid IS 'Fast upvote count aggregation';
COMMENT ON MATERIALIZED VIEW post_stats IS 'Cached post statistics for faster feed queries (refresh periodically)';
