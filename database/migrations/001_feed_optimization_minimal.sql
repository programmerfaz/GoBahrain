-- Minimal Feed Performance Optimization (No New Tables)
-- Run these queries in your Supabase SQL Editor

-- This is a minimal version that only adds indexes to existing tables
-- No new tables are created - personalization features will be disabled

-- 1. Add indexes for posts table (efficient pagination and sorting)
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_client_uuid ON posts(client_a_uuid);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_client ON posts(created_at DESC, client_a_uuid);

-- 2. Add indexes for post_upvote table (fast upvote counts and checks)
CREATE INDEX IF NOT EXISTS idx_post_upvote_post_uuid ON post_upvote(post_uuid);
CREATE INDEX IF NOT EXISTS idx_post_upvote_voter_post ON post_upvote(voter_id, post_uuid);
CREATE INDEX IF NOT EXISTS idx_post_upvote_created_at ON post_upvote(created_at DESC);

-- 3. Add indexes for client table (fast lookups for business data)
CREATE INDEX IF NOT EXISTS idx_client_uuid ON client(client_a_uuid);
CREATE INDEX IF NOT EXISTS idx_client_location ON client(lat, long) WHERE lat IS NOT NULL AND long IS NOT NULL;

-- 4. Add GIN index for tags search (if client table has tags column)
-- This will fail silently if tags column doesn't exist or isn't array type
DO $$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_client_tags_gin ON client USING GIN(tags);
EXCEPTION
    WHEN undefined_column THEN
        RAISE NOTICE 'Column "tags" does not exist, skipping GIN index';
    WHEN undefined_object THEN
        RAISE NOTICE 'GIN index type not available or column is not array type';
END$$;

-- 5. Add updated_at trigger for posts (optional but recommended)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION
    WHEN duplicate_column THEN
        RAISE NOTICE 'Column "updated_at" already exists in posts table';
END$$;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Analyze tables for query optimization
ANALYZE posts;
ANALYZE post_upvote;
ANALYZE client;

-- 7. Verify indexes were created
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('posts', 'post_upvote', 'client')
ORDER BY tablename, indexname;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Feed optimization indexes created successfully!';
    RAISE NOTICE '📊 Feed will now use: cursor pagination, caching, and intelligent ranking';
    RAISE NOTICE '⚠️  Personalization disabled (user_interactions table not created)';
    RAISE NOTICE '💡 To enable personalization later, run the full migration: 001_feed_optimization.sql';
END$$;
