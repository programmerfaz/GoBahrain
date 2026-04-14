import { supabase } from '../config/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ensureImageUrl } from '../utils/imageUrl'

const FEED_CACHE_KEY = '@gobahrain_feed_cache'
const FEED_CACHE_TIMESTAMP_KEY = '@gobahrain_feed_cache_timestamp'
const CACHE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
const BATCH_SIZE = 15 // Posts per page

const INTERACTION_WEIGHTS = {
  LIKE: 3,
  VIEW: 1,
  PROFILE_VIEW: 2,
  SHARE: 2,
}

const RECENCY_DECAY_HOURS = 168 // 1 week

const scorePost = (post, userInteractions = [], userLat = null, userLng = null) => {
  let score = 0
  
  // 1. Popularity Score (Likes)
  const likesScore = Math.log10(post.upvotes + 1) * 10
  score += likesScore
  
  // 2. Recency Score (time decay)
  const postAge = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60)
  const recencyScore = Math.max(0, 20 * (1 - postAge / RECENCY_DECAY_HOURS))
  score += recencyScore
  
  // 3. Personalization Score (user interactions)
  const interactionScore = userInteractions
    .filter(i => 
      (i.post_uuid === post.id) || 
      (i.client_uuid === post.clientId) ||
      (post.tags && post.tags.some(tag => i.tags?.includes(tag)))
    )
    .reduce((sum, interaction) => {
      const weight = INTERACTION_WEIGHTS[interaction.type] || 1
      return sum + weight
    }, 0)
  score += interactionScore
  
  // 4. Distance Score (if location available)
  if (userLat != null && userLng != null && post.lat != null && post.lng != null) {
    const distance = haversineKm(userLat, userLng, post.lat, post.lng)
    const distanceScore = Math.max(0, 15 * Math.exp(-distance / 5))
    score += distanceScore
  }
  
  // 5. Engagement Rate (upvotes per day since creation)
  const daysOld = Math.max(1, postAge / 24)
  const engagementRate = post.upvotes / daysOld
  score += engagementRate * 5
  
  return score
}

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const diversifyFeed = (rankedPosts) => {
  const diversified = []
  const userPostCounts = {}
  const recentUsers = new Set()
  
  const sortedPosts = [...rankedPosts].sort((a, b) => b.score - a.score)
  const remaining = [...sortedPosts]
  
  while (remaining.length > 0) {
    let selectedIndex = -1
    
    for (let i = 0; i < remaining.length; i++) {
      const post = remaining[i]
      const userId = post.clientId
      
      if (!recentUsers.has(userId)) {
        selectedIndex = i
        break
      }
    }
    
    if (selectedIndex === -1) {
      selectedIndex = 0
      recentUsers.clear()
    }
    
    const selected = remaining[selectedIndex]
    diversified.push(selected)
    
    userPostCounts[selected.clientId] = (userPostCounts[selected.clientId] || 0) + 1
    recentUsers.add(selected.clientId)
    
    if (recentUsers.size >= 3) {
      recentUsers.delete([...recentUsers][0])
    }
    
    remaining.splice(selectedIndex, 1)
  }
  
  return diversified
}

export const getVoterId = async () => {
  try {
    const VOTER_ID_KEY = '@gobahrain_voter_id'
    let id = await AsyncStorage.getItem(VOTER_ID_KEY)
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      await AsyncStorage.setItem(VOTER_ID_KEY, id)
    }
    return id
  } catch {
    return `anon-${Date.now()}`
  }
}

export const trackInteraction = async (type, data) => {
  try {
    const voterId = await getVoterId()
    
    const interaction = {
      voter_id: voterId,
      interaction_type: type,
      post_uuid: data.postId || null,
      client_uuid: data.clientId || null,
      tags: data.tags || null,
      created_at: new Date().toISOString(),
    }
    
    // Check if user_interactions table exists before tracking
    const { error } = await supabase
      .from('user_interactions')
      .insert(interaction)
    
    if (error) {
      // Silently skip if table doesn't exist - tracking is optional
      return
    }
  } catch (err) {
    // Silently fail - tracking is completely optional
    return
  }
}

const getUserInteractions = async (voterId, limit = 100) => {
  try {
    const { data, error } = await supabase
      .from('user_interactions')
      .select('*')
      .eq('voter_id', voterId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      // If table doesn't exist, return empty array (personalization disabled)
      if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return []
      }
      throw error
    }
    return data || []
  } catch (err) {
    // Silently return empty array - personalization is optional
    return []
  }
}

export const fetchFeedPage = async ({ 
  cursor = null, 
  limit = BATCH_SIZE, 
  userId = null,
  userLat = null,
  userLng = null,
  category = null,
  searchQuery = null,
  useCache = true,
  isRefresh = false
}) => {
  try {
    const voterId = await getVoterId()
    
    // Don't use cache if it's a refresh
    if (useCache && !cursor && !isRefresh) {
      const cached = await getCachedFeed()
      if (cached) {
        console.log('[FeedService] Using cached feed:', cached.posts.length, 'posts')
        return cached
      }
    }
    
    let query = supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (cursor) {
      query = query.lt('created_at', cursor)
    }
    
    if (category && category !== 'nearby' && category !== 'trending') {
      // Category filtering can be enhanced based on your schema
    }
    
    const { data: postRows, error: postsError } = await query
    
    if (postsError) throw postsError
    
    if (!postRows || postRows.length === 0) {
      return {
        posts: [],
        nextCursor: null,
        hasMore: false,
      }
    }
    
    const clientIds = [...new Set(postRows.map(r => r.client_a_uuid).filter(Boolean))]
    let clientMap = {}
    
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from('client')
        .select('*')
        .in('client_a_uuid', clientIds)
      
      if (clientRows?.length) {
        clientRows.forEach(c => {
          const id = c.client_a_uuid || c.id
          if (id) clientMap[id] = c
        })
      }
    }
    
    const postIds = postRows.map(r => r.post_uuid)
    let upvoteCounts = {}
    let myUpvotedIds = new Set()
    
    if (postIds.length > 0) {
      const { data: upvoteRows } = await supabase
        .from('post_upvote')
        .select('post_uuid, voter_id')
        .in('post_uuid', postIds)
      
      if (upvoteRows?.length) {
        upvoteRows.forEach(r => {
          upvoteCounts[r.post_uuid] = (upvoteCounts[r.post_uuid] || 0) + 1
          if (r.voter_id === voterId) myUpvotedIds.add(r.post_uuid)
        })
      }
    }
    
    const userInteractions = await getUserInteractions(voterId)
    
    const mapped = postRows.map(row => {
      const client = clientMap[row.client_a_uuid] || null
      const tags = client?.tags != null
        ? (Array.isArray(client.tags) ? client.tags : String(client.tags).split(',').map(t => t.trim()).filter(Boolean))
        : []
      
      const rating = client?.rating != null && client?.rating !== '' ? client.rating : null
      const clientPrice = client?.price_range != null && client?.price_range !== '' ? client.price_range : null
      const postPrice = row.price_range != null && row.price_range !== '' ? row.price_range : null
      const priceRange = postPrice ?? clientPrice
      const businessName = client?.business_name ?? client?.name ?? client?.business_name_ar ?? null
      const rawClientImage = client?.client_image != null && String(client.client_image).trim() !== '' ? String(client.client_image).trim() : null
      const clientImage = rawClientImage ? (ensureImageUrl(rawClientImage) || rawClientImage) : null
      
      let imageUri = row.post_image
      
      if (imageUri && typeof imageUri === 'string' && imageUri.startsWith('[{')) {
        try {
          const parsed = JSON.parse(imageUri)
          if (Array.isArray(parsed) && parsed[0]?.url) {
            imageUri = parsed[0].url
          } else if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            imageUri = parsed[0]
          }
        } catch (e) {
          console.warn('[FeedService] Failed to parse post_image JSON:', e)
        }
      }
      
      if (imageUri && typeof imageUri === 'string' && !imageUri.startsWith('http')) {
        const cleanPath = imageUri.startsWith('gobahrain-post-images/') 
          ? imageUri.replace('gobahrain-post-images/', '') 
          : imageUri
        imageUri = `https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/${cleanPath}`
      }
      
      if (!imageUri && row.post_image) {
        imageUri = row.post_image
      }
      
      const lat = client?.lat != null && client?.lat !== '' ? parseFloat(client.lat) : null
      const lng = client?.long != null && client?.long !== '' ? parseFloat(client.long) : (client?.lng != null && client?.lng !== '' ? parseFloat(client.lng) : null)
      const hasCoords = lat != null && !Number.isNaN(lat) && lng != null && !Number.isNaN(lng)
      
      const upvotes = upvoteCounts[row.post_uuid] ?? 0
      const hasUpvoted = myUpvotedIds.has(row.post_uuid)
      
      return {
        id: row.post_uuid,
        clientId: row.client_a_uuid,
        username: row.client_a_uuid?.slice(0, 8) ?? 'client',
        businessName: businessName ? String(businessName).trim() : null,
        clientImage,
        tags,
        rating,
        priceRange: priceRange != null ? `${priceRange} BHD` : '',
        verified: false,
        location: client?.location || client?.address || '',
        distance: '',
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        imageUri: imageUri,
        openNow: false,
        upvotes,
        hasUpvoted,
        description: row.description || '',
        created_at: row.created_at,
      }
    })
    
    const scoredPosts = mapped.map((post, idx) => {
      const baseScore = scorePost(post, userInteractions, userLat, userLng)
      const randomBoost = isRefresh ? Math.random() * 15 : 0  // Increased from 5 to 15 for more variation
      const finalScore = baseScore + randomBoost
      
      if (isRefresh && idx < 5) {
        console.log(`[FeedService] Post ${idx + 1}: base=${baseScore.toFixed(1)}, random=+${randomBoost.toFixed(1)}, final=${finalScore.toFixed(1)}`)
      }
      
      return {
        ...post,
        score: finalScore,
      }
    })
    
    if (isRefresh) {
      console.log('[FeedService] Refresh: Adding randomization to scoring (0-15 points)')
    }
    
    const diversifiedPosts = diversifyFeed(scoredPosts)
    
    if (searchQuery && searchQuery.trim()) {
      const filtered = diversifiedPosts.filter(post => {
        const q = searchQuery.toLowerCase()
        const text = [
          post.description || '',
          post.businessName || '',
          post.location || '',
          ...(post.tags || [])
        ].join(' ').toLowerCase()
        return text.includes(q)
      })
      
      const nextCursor = postRows.length > 0 ? postRows[postRows.length - 1].created_at : null
      
      return {
        posts: filtered,
        nextCursor,
        hasMore: postRows.length === limit,
      }
    }
    
    if (category === 'nearby' && userLat != null && userLng != null) {
      diversifiedPosts.sort((a, b) => {
        if (a.lat == null || a.lng == null) return 1
        if (b.lat == null || b.lng == null) return -1
        const distA = haversineKm(userLat, userLng, a.lat, a.lng)
        const distB = haversineKm(userLat, userLng, b.lat, b.lng)
        return distA - distB
      })
    }
    
    const nextCursor = postRows.length > 0 ? postRows[postRows.length - 1].created_at : null
    
    const result = {
      posts: diversifiedPosts,
      nextCursor,
      hasMore: postRows.length === limit,
    }
    
    if (!cursor && useCache) {
      await cacheFeed(result)
    }
    
    return result
  } catch (err) {
    console.error('[FeedService] Failed to fetch feed:', err)
    throw err
  }
}

const getCachedFeed = async () => {
  try {
    const [cached, timestamp] = await Promise.all([
      AsyncStorage.getItem(FEED_CACHE_KEY),
      AsyncStorage.getItem(FEED_CACHE_TIMESTAMP_KEY),
    ])
    
    if (!cached || !timestamp) return null
    
    const age = Date.now() - parseInt(timestamp, 10)
    if (age > CACHE_EXPIRY_MS) {
      await clearFeedCache()
      return null
    }
    
    return JSON.parse(cached)
  } catch (err) {
    console.warn('[FeedService] Cache read error:', err)
    return null
  }
}

const cacheFeed = async (data) => {
  try {
    await Promise.all([
      AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(data)),
      AsyncStorage.setItem(FEED_CACHE_TIMESTAMP_KEY, Date.now().toString()),
    ])
  } catch (err) {
    console.warn('[FeedService] Cache write error:', err)
  }
}

export const clearFeedCache = async () => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(FEED_CACHE_KEY),
      AsyncStorage.removeItem(FEED_CACHE_TIMESTAMP_KEY),
    ])
  } catch (err) {
    console.warn('[FeedService] Cache clear error:', err)
  }
}

export const invalidateFeedCache = clearFeedCache
