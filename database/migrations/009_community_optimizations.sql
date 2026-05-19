-- Community table optimizations for production scale
-- Run this migration in Supabase SQL Editor

-- ============================================================================
-- 1. Indexes for community table sorting (trending & recent feeds)
-- ============================================================================

-- Index for trending sort: (num_of_upvote DESC, created_at DESC, community_uuid DESC)
CREATE INDEX IF NOT EXISTS idx_community_trending 
ON public.community (num_of_upvote DESC, created_at DESC, community_uuid DESC);

-- Index for recent sort: (created_at DESC, community_uuid ASC)
CREATE INDEX IF NOT EXISTS idx_community_recent 
ON public.community (created_at DESC, community_uuid ASC);

-- Index for user's posts: (user_a_uuid, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_community_user_posts 
ON public.community (user_a_uuid, created_at DESC);

-- Index for client/venue posts: (client_a_uuid, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_community_client_posts 
ON public.community (client_a_uuid, created_at DESC);

-- Index for hashtag search (GIN for text search on hashtags)
CREATE INDEX IF NOT EXISTS idx_community_hashtags 
ON public.community USING gin (hashtags gin_trgm_ops);

COMMENT ON INDEX idx_community_trending IS 'Supports trending feed pagination with keyset cursor';
COMMENT ON INDEX idx_community_recent IS 'Supports recent feed pagination with keyset cursor';
COMMENT ON INDEX idx_community_user_posts IS 'Fast lookup for user review history';
COMMENT ON INDEX idx_community_client_posts IS 'Fast lookup for venue-specific reviews';
COMMENT ON INDEX idx_community_hashtags IS 'Trigram index for hashtag search with ILIKE';

-- ============================================================================
-- 2. Atomic upvote RPC (fixes race condition)
-- ============================================================================

-- Increment upvote atomically (no read-then-write race)
CREATE OR REPLACE FUNCTION public.increment_community_upvote(p_community_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE public.community
  SET num_of_upvote = COALESCE(num_of_upvote, 0) + 1
  WHERE community_uuid = p_community_uuid
  RETURNING num_of_upvote INTO v_new_count;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community post % not found', p_community_uuid;
  END IF;
  
  RETURN v_new_count;
END;
$$;

-- Decrement upvote atomically (minimum 0)
CREATE OR REPLACE FUNCTION public.decrement_community_upvote(p_community_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE public.community
  SET num_of_upvote = GREATEST(0, COALESCE(num_of_upvote, 0) - 1)
  WHERE community_uuid = p_community_uuid
  RETURNING num_of_upvote INTO v_new_count;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community post % not found', p_community_uuid;
  END IF;
  
  RETURN v_new_count;
END;
$$;

COMMENT ON FUNCTION public.increment_community_upvote IS 'Atomically increment upvote count without race conditions';
COMMENT ON FUNCTION public.decrement_community_upvote IS 'Atomically decrement upvote count (min 0) without race conditions';

-- Grant execute to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.increment_community_upvote(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_community_upvote(uuid) TO anon, authenticated;

-- ============================================================================
-- 3. Optimized comment counting (batch aggregation)
-- ============================================================================

-- Get comment counts for multiple community posts in one query
CREATE OR REPLACE FUNCTION public.get_community_comment_counts(p_community_uuids uuid[])
RETURNS TABLE (
  community_uuid uuid,
  comment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cc.community_uuid,
    COUNT(*) AS comment_count
  FROM public.community_comment cc
  WHERE cc.community_uuid = ANY(p_community_uuids)
  GROUP BY cc.community_uuid;
$$;

COMMENT ON FUNCTION public.get_community_comment_counts IS 'Batch fetch comment counts for multiple posts in one query (replaces N+1 pattern)';

GRANT EXECUTE ON FUNCTION public.get_community_comment_counts(uuid[]) TO anon, authenticated;

-- ============================================================================
-- 4. Index for comment counting
-- ============================================================================

-- Index for comment aggregation by community post
CREATE INDEX IF NOT EXISTS idx_community_comment_aggregate 
ON public.community_comment (community_uuid);

COMMENT ON INDEX idx_community_comment_aggregate IS 'Speeds up comment count aggregation per post';

-- ============================================================================
-- 5. Analyze tables to update statistics
-- ============================================================================

ANALYZE public.community;
ANALYZE public.community_comment;
