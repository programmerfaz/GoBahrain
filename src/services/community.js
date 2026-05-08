import { decode as decodeBase64ToArrayBuffer } from 'base64-arraybuffer';
import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OPENAI_KEY } from '../config/keys';
import { ensureImageUrl } from '../utils/imageUrl';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const AI_REVIEWS_LIMIT = 40;
const AI_REVIEW_SNIPPET_LEN = 220;

const COMMUNITY_USER_ID_KEY = '@gobahrain_community_user_id';
const BUCKET_NAME = 'community_reviews';
const MAX_IMAGES = 2;

/** Generate a valid v4 UUID for use as user_a_uuid (DB column is type uuid). */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** True if string is a valid UUID (so DB accepts it). */
function isValidUUID(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

/** Default user for community posts (Hassan / local user). Override with EXPO_PUBLIC_GUEST_USER_UUID if needed. */
const GUEST_USER_UUID = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GUEST_USER_UUID) || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003';

/**
 * Get user_a_uuid for community posts. Must be a UUID that exists in public."user" (FK constraint).
 * Returns the signed-in user's user_a_uuid from get_my_profile when available; otherwise GUEST_USER_UUID.
 * Ensure GUEST_USER_UUID exists in public."user" (e.g. seed row or EXPO_PUBLIC_GUEST_USER_UUID).
 */
export async function getCommunityUserId() {
  try {
    const { data: profile } = await supabase.rpc('get_my_profile');
    const userUuid = profile?.user?.user_a_uuid;
    if (userUuid && isValidUUID(userUuid)) return userUuid;
  } catch (e) {
    console.warn('[Community] getCommunityUserId get_my_profile failed:', e?.message);
  }
  if (GUEST_USER_UUID && isValidUUID(GUEST_USER_UUID)) return GUEST_USER_UUID;
  return generateUUID();
}

/**
 * Parse image column: stored as JSON array of URLs or single URL string.
 */
function parseImageUrls(imageColumn) {
  if (!imageColumn) return [];
  if (Array.isArray(imageColumn)) return imageColumn.slice(0, 2);
  try {
    const parsed = JSON.parse(imageColumn);
    return Array.isArray(parsed) ? parsed.slice(0, 2) : [parsed].filter(Boolean);
  } catch {
    return [imageColumn].filter(Boolean);
  }
}

/**
 * Fetch all clients (business_name, client_a_uuid) for place/venue dropdown.
 * UI filters by search term locally.
 */
export async function fetchClients() {
  const { data: rows, error } = await supabase
    .from('client')
    .select('client_a_uuid, business_name')
    .order('business_name', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[Community] fetchClients error:', error);
    return [];
  }
  return (rows || []).map((r) => ({
    client_a_uuid: r.client_a_uuid,
    business_name: (r.business_name || 'Unnamed').trim(),
  }));
}

/**
 * Find a client by scanned QR payload (client UUID).
 * Returns { client_a_uuid, business_name } or null.
 */
export async function fetchClientByQrPayload(payload) {
  const raw = (payload || '').trim();
  if (!raw) return null;
  const { data: rows, error } = await supabase
    .from('client')
    .select('client_a_uuid, business_name')
    .eq('client_a_uuid', raw)
    .limit(1);

  if (error) {
    console.error('[Community] fetchClientByQrPayload error:', error);
    return null;
  }
  const r = rows?.[0];
  if (!r) return null;
  return {
    client_a_uuid: r.client_a_uuid,
    business_name: (r.business_name || 'Unnamed').trim(),
  };
}

const COMMUNITY_SELECT_WITH_AUTHOR = '*, user(account(user_name))';
const PERSONALIZED_TOPIC_BOOSTS = {
  foodie: ['food', 'restaurant', 'cafe', 'dessert', 'brunch', 'dining'],
  'culture-history': ['culture', 'museum', 'heritage', 'history', 'traditional', 'fort'],
  'nature-outdoors': ['nature', 'beach', 'park', 'outdoor', 'garden', 'trail'],
  nightlife: ['nightlife', 'bar', 'lounge', 'night', 'club'],
  shopping: ['shopping', 'mall', 'souq', 'market', 'store'],
  adventure: ['adventure', 'dive', 'kayak', 'jetski', 'hiking'],
  'instagram-spots': ['instagram', 'photo', 'aesthetic', 'scenic', 'view'],
  'local-authentic': ['local', 'authentic', 'bahraini', 'traditional', 'hidden'],
  'family-friendly': ['family', 'kids', 'children', 'playground', 'fun'],
  'beaches-sun': ['beach', 'sea', 'coast', 'sunset', 'island'],
  'quiet-peaceful': ['quiet', 'peaceful', 'calm', 'serene'],
  'social-lively': ['social', 'lively', 'crowded', 'buzz', 'vibe'],
  'hidden-gems': ['hidden', 'gem', 'underrated', 'secret'],
}

/** Fetch client_image for community posts (batch by client_a_uuid). Converts paths to full URLs. */
async function fetchClientImagesForPosts(rows) {
  const ids = [...new Set((rows || []).map((r) => r.client_a_uuid).filter(Boolean))];
  if (ids.length === 0) return {};
  const { data } = await supabase.from('client').select('client_a_uuid, client_image').in('client_a_uuid', ids);
  const map = {};
  (data || []).forEach((c) => {
    if (c.client_a_uuid && c.client_image) {
      const raw = String(c.client_image).trim();
      map[c.client_a_uuid] = ensureImageUrl(raw) || raw;
    }
  });
  return map;
}

/** Matches home feed page size for consistent infinite-scroll behaviour. */
export const COMMUNITY_FEED_PAGE_SIZE = 15

function escapePostgrestQuotes(value) {
  return String(value ?? '').replace(/'/g, "''")
}

function quoteTimestamptz(value) {
  const iso =
    typeof value === 'string' && value.includes('T')
      ? value
      : value
        ? new Date(value).toISOString()
        : new Date(0).toISOString()
  return `'${escapePostgrestQuotes(iso)}'`
}

function quoteUuid(value) {
  return `'${escapePostgrestQuotes(value)}'`
}

/** Keyset for newest-first with stable tie-break (created_at DESC, community_uuid ASC). */
function buildRecentKeysetOr(createdAt, communityUuid) {
  const ts = quoteTimestamptz(createdAt)
  const id = quoteUuid(communityUuid)
  return `created_at.lt.${ts},and(created_at.eq.${ts},community_uuid.gt.${id})`
}

/** Keyset for trending: num_of_upvote DESC, created_at DESC, community_uuid DESC. */
function buildTrendingKeysetOr(votes, createdAt, communityUuid) {
  const v = Number(votes ?? 0)
  const ts = quoteTimestamptz(createdAt)
  const id = quoteUuid(communityUuid)
  return `num_of_upvote.lt.${v},and(num_of_upvote.eq.${v},created_at.lt.${ts}),and(num_of_upvote.eq.${v},created_at.eq.${ts},community_uuid.lt.${id})`
}

function buildCommunityPreferenceSignals(preferences) {
  const generalIds = Array.isArray(preferences?.generalIds) ? preferences.generalIds : []
  const activityIds = Array.isArray(preferences?.activityIds) ? preferences.activityIds : []
  const foodIds = Array.isArray(preferences?.foodIds) ? preferences.foodIds : []
  const all = [...generalIds, ...activityIds, ...foodIds]
  if (!all.length) return { hasSignals: false, keywords: [] }

  const keywords = new Set()
  all.forEach((id) => {
    const seeds = PERSONALIZED_TOPIC_BOOSTS[id]
    if (Array.isArray(seeds)) {
      seeds.forEach((k) => keywords.add(String(k).toLowerCase()))
    } else if (typeof id === 'string' && id.trim()) {
      keywords.add(id.toLowerCase().replace(/-/g, ' '))
    }
  })
  return { hasSignals: keywords.size > 0, keywords: [...keywords] }
}

function scoreCommunityPostForPreference(post, prefSignals) {
  const text = [
    post.topic,
    post.place,
    post.body,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const matchedKeywordCount = prefSignals.keywords.reduce(
    (acc, kw) => (kw && text.includes(kw) ? acc + 1 : acc),
    0
  )
  const keywordScore = Math.min(1, matchedKeywordCount / 3)
  const ratingScore = Math.max(0, Math.min(1, Number(post.rating ?? 0) / 5))
  const upvoteScore = Math.min(1, Math.log10(Number(post.upvotes ?? 0) + 1) / Math.log10(101))
  const commentScore = Math.min(1, Math.log10(Number(post.comments ?? 0) + 1) / Math.log10(41))

  // Keep freshness as a light signal so old posts can still win if they strongly match preference.
  let recencyScore = 0.4
  if (typeof post.time === 'string') {
    if (post.time === 'now') recencyScore = 1
    else if (post.time.endsWith('m')) recencyScore = 0.95
    else if (post.time.endsWith('h')) recencyScore = 0.85
    else if (post.time.endsWith('d')) recencyScore = 0.65
    else if (post.time.endsWith('mo')) recencyScore = 0.45
  }

  return keywordScore * 0.44 + ratingScore * 0.28 + upvoteScore * 0.12 + commentScore * 0.08 + recencyScore * 0.08
}

/**
 * One page of community posts (cursor-based; avoids loading the entire table).
 * @param {{ topicId?: string, limit?: number, cursor?: { kind: 'recent', created_at: string, community_uuid: string } | { kind: 'trending', num_of_upvote: number, created_at: string, community_uuid: string } | null, clientId?: string | null }} opts
 * @returns {Promise<{ posts: Array, hasMore: boolean, nextCursor: object | null }>}
 */
export async function fetchCommunityPostsPage({
  topicId = 'all',
  limit = COMMUNITY_FEED_PAGE_SIZE,
  cursor = null,
  clientId = null,
  preferences = null,
} = {}) {
  const pageLimit = Math.min(Math.max(1, Number(limit) || COMMUNITY_FEED_PAGE_SIZE), 50)
  const take = pageLimit + 1
  const isTrending = topicId === 'trending'

  let query = supabase.from('community').select(COMMUNITY_SELECT_WITH_AUTHOR)

  if (clientId) {
    query = query.eq('client_a_uuid', clientId)
  }

  if (!isTrending && topicId && topicId !== 'all') {
    query = query.ilike('hashtags', `%${topicId}%`)
  }

  if (isTrending) {
    query = query
      .order('num_of_upvote', { ascending: false })
      .order('created_at', { ascending: false })
      .order('community_uuid', { ascending: false })

    if (cursor?.kind === 'trending' && cursor.created_at && cursor.community_uuid) {
      query = query.or(
        buildTrendingKeysetOr(cursor.num_of_upvote, cursor.created_at, cursor.community_uuid)
      )
    }
  } else {
    query = query.order('created_at', { ascending: false }).order('community_uuid', { ascending: true })

    if (cursor?.kind === 'recent' && cursor.created_at && cursor.community_uuid) {
      query = query.or(buildRecentKeysetOr(cursor.created_at, cursor.community_uuid))
    }
  }

  query = query.limit(take)

  const { data: rows, error } = await query

  if (error) {
    console.error('[Community] fetchCommunityPostsPage error:', error)
    return { posts: [], hasMore: false, nextCursor: null }
  }

  const raw = rows || []
  const hasMore = raw.length > pageLimit
  const pageRows = hasMore ? raw.slice(0, pageLimit) : raw

  const clientMap = await fetchClientImagesForPosts(pageRows)
  const posts = pageRows.map((row) => mapRowToPost(row, clientMap))
  const commentMap = await fetchCommentCountsByCommunityIds(posts.map((p) => p.id))
  const hydrated = posts.map((p) => ({ ...p, comments: commentMap[p.id] ?? p.comments ?? 0 }))
  const prefSignals = buildCommunityPreferenceSignals(preferences)
  const ranked = prefSignals.hasSignals
    ? [...hydrated]
        .map((post) => ({ ...post, __rankScore: scoreCommunityPostForPreference(post, prefSignals) }))
        .sort((a, b) => b.__rankScore - a.__rankScore)
        .map(({ __rankScore, ...rest }) => rest)
    : hydrated

  let nextCursor = null
  const last = pageRows[pageRows.length - 1]
  if (hasMore && last?.community_uuid) {
    if (isTrending) {
      nextCursor = {
        kind: 'trending',
        num_of_upvote: Number(last.num_of_upvote ?? 0),
        created_at: last.created_at,
        community_uuid: last.community_uuid,
      }
    } else {
      nextCursor = {
        kind: 'recent',
        created_at: last.created_at,
        community_uuid: last.community_uuid,
      }
    }
  }

  return { posts: ranked, hasMore, nextCursor }
}

/** Count comments per post from community_comment (empty map if table missing or error). */
export async function fetchCommentCountsByCommunityIds(communityUuids) {
  const ids = [...new Set((communityUuids || []).filter(Boolean))];
  if (ids.length === 0) return {};
  const map = Object.fromEntries(ids.map((id) => [id, 0]));
  const { data, error } = await supabase.from('community_comment').select('community_uuid').in('community_uuid', ids);
  if (error || !data) {
    if (error) console.warn('[Community] fetchCommentCountsByCommunityIds:', error.message);
    return map;
  }
  data.forEach((row) => {
    const id = row.community_uuid;
    if (id) map[id] = (map[id] || 0) + 1;
  });
  return map;
}

/**
 * Fetch community posts by the current user (user's own reviews).
 */
export async function fetchMyCommunityPosts(userId) {
  if (!userId) return [];
  const { data: rows, error } = await supabase
    .from('community')
    .select(COMMUNITY_SELECT_WITH_AUTHOR)
    .eq('user_a_uuid', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Community] fetchMyCommunityPosts error:', error);
    return [];
  }

  const clientMap = await fetchClientImagesForPosts(rows || []);
  const posts = (rows || []).map((row) => mapRowToPost(row, clientMap));
  const commentMap = await fetchCommentCountsByCommunityIds(posts.map((p) => p.id));
  return posts.map((p) => ({ ...p, comments: commentMap[p.id] ?? p.comments ?? 0 }));
}

function mapRowToPost(row, clientMap = {}) {
  const rawImages = parseImageUrls(row.image);
  const images = rawImages.map((u) => ensureImageUrl(u) || u).filter(Boolean);
  const userName = (row.user?.account?.user_name || '').trim() || null;
  const author = userName || 'User';
  const handle = userName ? `@${userName.replace(/\s+/g, '').toLowerCase().slice(0, 16)}` : `@${(row.user_a_uuid || '').slice(0, 8)}`;
  const clientImage = row.client_a_uuid ? clientMap[row.client_a_uuid] || null : null;
  return {
    id: row.community_uuid,
    author,
    handle,
    avatar: null,
    client_image: clientImage,
    client_a_uuid: row.client_a_uuid || null,
    time: formatTimeAgo(row.created_at),
    topic: row.hashtags || 'tips',
    place: row.badge || null,
    rating: row.rating != null ? Number(row.rating) : null,
    body: row.review_text || '',
    image: images[0] || null,
    images: images,
    upvotes: Number(row.num_of_upvote ?? row.likes ?? 0) || 0,
    comments: 0,
    reposts: 0,
    upvoted: false,
    user_a_uuid: row.user_a_uuid,
  };
}

/**
 * Fetch recent community posts (review_text only needed for AI; we fetch full rows for display).
 * Used by AI search to send review_text to OpenAI. Limited to AI_REVIEWS_LIMIT.
 */
async function fetchCommunityReviewsForAI() {
  const { data: rows, error } = await supabase
    .from('community')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(AI_REVIEWS_LIMIT);

  if (error) {
    console.error('[Community] fetchCommunityReviewsForAI error:', error);
    return [];
  }
  return rows || [];
}

/**
 * Call OpenAI to match user query against reviews and get one-line Khalid suggestion per match.
 * Returns array of { id, suggestion }.
 */
async function openAIMatchReviews(userQuery, reviewsPayload) {
  const systemPrompt = `You are Khalid, a friendly local guide in Bahrain. You will receive a user search query and a list of community reviews. Each review has an "id", "review_text", and "rating" (number out of 5).

Important: Only suggest places that have a good rating (4.0 or above). Do NOT include in your response any review with a rating below 4.0 — we only want Khalid to recommend places that reviewers liked. Never write positive or recommending suggestions for low-rated places.

Your task:
1. From the list, pick only reviews that match the user's intent AND have rating >= 4.0 (e.g. "food" matches burger, paratha, restaurants, cafes).
2. For each matching review, write ONE short friendly suggestion (as Khalid) — e.g. "You can try this out, it looks yum!" or "Great spot for a coffee — worth a visit!"
3. Respond with a JSON array only, no other text. Each item: { "id": "<exact id from the list>", "suggestion": "Khalid says: <one line>" }
4. Use only the ids provided. Keep each suggestion under 100 characters. Be warm and casual.`;
  const userContent = `User search: "${userQuery.replace(/"/g, '\\"')}"

Reviews (id, review_text, rating):
${reviewsPayload}`;

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.6,
      max_tokens: 2000,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI error (${res.status})`);

  const raw = json?.choices?.[0]?.message?.content?.trim() || '';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
}

/**
 * AI search: fetch all reviews from DB, send to OpenAI with user query, get matching posts + one-line suggestion each.
 * Returns array of full post objects with aiSuggestion set.
 */
export async function searchCommunityWithOpenAI(userQuery) {
  const term = (userQuery || '').trim().slice(0, 50);
  if (!term) return [];

  const rows = await fetchCommunityReviewsForAI();
  if (rows.length === 0) return [];

  // Only send well-rated reviews to AI so Khalid never suggests bad-rated places
  const minRatingForAI = 3.5;
  const rowsWithGoodRating = rows.filter((r) => {
    const rating = r.rating != null ? Number(r.rating) : null;
    return rating != null && rating >= minRatingForAI;
  });

  const reviewsPayload = rowsWithGoodRating
    .map((r) => {
      const id = r.community_uuid;
      const text = (r.review_text || '').replace(/\s+/g, ' ').trim().slice(0, AI_REVIEW_SNIPPET_LEN);
      const rating = r.rating != null ? Number(r.rating) : 'n/a';
      return `id: ${id}\nreview_text: ${text}\nrating: ${rating}`;
    })
    .join('\n\n');

  const matches = await openAIMatchReviews(term, reviewsPayload);
  if (!Array.isArray(matches) || matches.length === 0) return [];

  const suggestionById = {};
  matches.forEach((m) => {
    if (m?.id && m?.suggestion) suggestionById[m.id] = m.suggestion;
  });

  const posts = rows.map((row) => mapRowToPost(row));
  return posts
    .filter((p) => suggestionById[p.id])
    .map((p) => ({ ...p, aiSuggestion: suggestionById[p.id] }));
}

function formatTimeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return 'now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d`;
  return `${Math.floor(sec / 2592000)}mo`;
}

const COMMENT_SELECT = 'comment_uuid, body, created_at, user_a_uuid, user(account(user_name))';

function mapCommentRow(row) {
  if (!row) return null;
  const userName = (row.user?.account?.user_name || '').trim();
  const shortId = String(row.user_a_uuid || '').replace(/-/g, '').slice(0, 6);
  const author = userName ? `@${userName.replace(/\s+/g, '').toLowerCase()}` : (shortId ? `@${shortId}` : 'Member');
  return {
    id: row.comment_uuid,
    body: row.body || '',
    author,
    time: formatTimeAgo(row.created_at),
  };
}

/**
 * Replies for a community post. Requires table public.community_comment (see database/migrations/002_community_comment.sql).
 * Returns [] if the table is missing or on error.
 */
export async function fetchCommunityComments(communityUuid) {
  if (!communityUuid) return [];
  const { data, error } = await supabase
    .from('community_comment')
    .select(COMMENT_SELECT)
    .eq('community_uuid', communityUuid)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[Community] fetchCommunityComments:', error.message);
    return [];
  }
  return (data || []).map(mapCommentRow).filter(Boolean);
}

/**
 * Insert a reply. Uses getCommunityUserId() for user_a_uuid (same as posts).
 */
export async function createCommunityComment(communityUuid, text) {
  const body = (text || '').trim();
  if (!communityUuid || !body) {
    throw new Error('Comment cannot be empty');
  }
  const user_a_uuid = await getCommunityUserId();
  const { data, error } = await supabase
    .from('community_comment')
    .insert({
      community_uuid: communityUuid,
      user_a_uuid,
      body,
    })
    .select(COMMENT_SELECT)
    .single();

  if (error) {
    console.error('[Community] createCommunityComment:', error);
    throw error;
  }
  return mapCommentRow(data);
}

/**
 * Upload up to 2 images to bucket community_reviews. Accepts array of { base64, mimeType? } (React Native friendly).
 * Returns array of public URLs.
 */
export async function uploadCommunityImages(imageEntries) {
  if (!imageEntries || imageEntries.length === 0) return [];
  const toUpload = imageEntries.slice(0, MAX_IMAGES);
  const userId = await getCommunityUserId();
  const prefix = `${userId}/${Date.now()}`;
  const urls = [];

  for (let i = 0; i < toUpload.length; i++) {
    const entry = toUpload[i];
    const base64 = typeof entry === 'string' ? entry : entry?.base64;
    if (!base64) continue;
    const mimeType = (typeof entry === 'object' && entry?.mimeType) || 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/gif' ? 'gif' : 'jpg';
    const path = `${prefix}_${i}.${ext}`;

    try {
      const arrayBuffer = decodeBase64ToArrayBuffer(base64);
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });

      if (error) {
        console.error('[Community] upload error:', error);
        continue;
      }
      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    } catch (e) {
      console.error('[Community] upload decode/upload failed:', e);
    }
  }

  return urls;
}

/**
 * Create a community review post. imageUrls should be from uploadCommunityImages (max 2).
 * user_a_uuid must already exist in public."user" (use guest user when not signed in).
 */
export async function createCommunityPost({
  user_a_uuid,
  review_text,
  rating = null,
  hashtags = null,
  imageUrls = [],
  badge = null,
  client_a_uuid = null,
}) {
  const imagePayload = imageUrls.length > 0 ? JSON.stringify(imageUrls.slice(0, MAX_IMAGES)) : null;

  const { data, error } = await supabase
    .from('community')
    .insert({
      user_a_uuid,
      client_a_uuid: client_a_uuid || null,
      rating: rating != null ? Number(rating) : null,
      review_text: review_text || null,
      num_of_upvote: 0,
      hashtags: hashtags || null,
      image: imagePayload,
      badge: badge || null,
    })
    .select('community_uuid, created_at')
    .single();

  if (error) {
    console.error('[Community] createCommunityPost error:', error);
    throw error;
  }
  return data;
}

/**
 * Increment upvote count for a community post.
 */
export async function upvoteCommunityPost(communityUuid) {
  const { data: row } = await supabase
    .from('community')
    .select('num_of_upvote')
    .eq('community_uuid', communityUuid)
    .single();

  const currentCount = Number(row?.num_of_upvote ?? 0) + 1;
  const { error } = await supabase
    .from('community')
    .update({ num_of_upvote: currentCount })
    .eq('community_uuid', communityUuid);

  if (error) {
    console.error('[Community] upvoteCommunityPost error:', error);
    throw error;
  }
  return currentCount;
}

/**
 * Decrement upvote count for a community post (min 0). Used for toggle-off.
 */
export async function removeUpvoteCommunityPost(communityUuid) {
  const { data: row } = await supabase
    .from('community')
    .select('num_of_upvote')
    .eq('community_uuid', communityUuid)
    .single();

  const current = Number(row?.num_of_upvote ?? 0);
  const newCount = Math.max(0, current - 1);
  const { error } = await supabase
    .from('community')
    .update({ num_of_upvote: newCount })
    .eq('community_uuid', communityUuid);

  if (error) {
    console.error('[Community] removeUpvoteCommunityPost error:', error);
    throw error;
  }
  return newCount;
}
