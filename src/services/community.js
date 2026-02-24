import { decode as decodeBase64ToArrayBuffer } from 'base64-arraybuffer';
import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OPENAI_KEY } from '../config/keys';

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
 * Get user_a_uuid for community posts. Uses Supabase auth if available; otherwise uses guest user (EXPO_PUBLIC_GUEST_USER_UUID).
 */
export async function getCommunityUserId() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id && isValidUUID(user.id)) return user.id;

    const { data: anon, error: anonError } = await supabase.auth.signInAnonymously();
    if (!anonError && anon?.user?.id && isValidUUID(anon.user.id)) return anon.user.id;

    if (GUEST_USER_UUID && isValidUUID(GUEST_USER_UUID)) return GUEST_USER_UUID;
    return generateUUID();
  } catch (e) {
    console.warn('[Community] getCommunityUserId failed:', e);
    if (GUEST_USER_UUID && isValidUUID(GUEST_USER_UUID)) return GUEST_USER_UUID;
    return generateUUID();
  }
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
 * Fetch community posts from Supabase.
 * - all: all posts, newest first
 * - trending: top 40 by upvotes (descending)
 * - other topicId: filter by hashtags, newest first
 */
export async function fetchCommunityPosts(topicId = 'all') {
  let query = supabase.from('community').select('*');

  if (topicId === 'trending') {
    query = query.order('num_of_upvote', { ascending: false }).limit(40);
  } else {
    query = query.order('created_at', { ascending: false });
    if (topicId && topicId !== 'all') {
      query = query.ilike('hashtags', `%${topicId}%`);
    }
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error('[Community] fetchCommunityPosts error:', error);
    return [];
  }

  return (rows || []).map((row) => mapRowToPost(row));
}

function mapRowToPost(row) {
  const images = parseImageUrls(row.image);
  return {
    id: row.community_uuid,
    author: 'User',
    handle: `@${(row.user_a_uuid || '').slice(0, 8)}`,
    avatar: null,
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
