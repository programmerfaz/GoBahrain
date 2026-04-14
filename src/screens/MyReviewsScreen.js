import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { View, Platform, RefreshControl, ActivityIndicator } from 'react-native'
import { FlatList as GHFlatList } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from 'react-native'
import {
  getCommunityPalette,
  buildCommunityFeedStyles,
  CommunityReviewCard,
  CommunityReviewDetailModal,
} from '../components/community/CommunityReviewViews'
import {
  fetchMyCommunityPosts,
  getCommunityUserId,
  upvoteCommunityPost,
  removeUpvoteCommunityPost,
} from '../services/community'
import { useTheme } from '../context/ThemeContext'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60

export default function MyReviewsScreen() {
  const { isDark } = useTheme()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const C = getCommunityPalette(isDark)
  const feedStyles = useMemo(() => buildCommunityFeedStyles(C), [C])

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [focusReplyWhenOpen, setFocusReplyWhenOpen] = useState(false)

  const fabBottom = TAB_BAR_HEIGHT + 24 + (Platform.OS === 'android' ? insets.bottom : 0)

  const loadPosts = useCallback(async (opts = {}) => {
    const { isRefresh = false } = opts
    if (isRefresh) setRefreshing(true)
    else {
      setPosts([])
      setLoading(true)
    }
    try {
      const userId = await getCommunityUserId()
      const list = await fetchMyCommunityPosts(userId)
      const myOnly = (list || []).filter((p) => p.user_a_uuid === userId)
      setPosts(myOnly)
    } catch (e) {
      console.error('[MyReviews] load failed:', e)
      setPosts([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  useEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: C.bg },
      headerTintColor: C.red,
      headerTitleStyle: { color: C.text, fontWeight: '800', fontSize: 17 },
      headerShadowVisible: false,
    })
  }, [navigation, C.bg, C.red, C.text])

  const handleUpvote = useCallback(async (item) => {
    try {
      const newCount = await upvoteCommunityPost(item.id)
      const updater = (p) => (p.id === item.id ? { ...p, upvotes: newCount, upvoted: true } : p)
      setPosts((prev) => prev.map(updater))
      if (selectedPost?.id === item.id) setSelectedPost((p) => (p?.id === item.id ? { ...p, upvotes: newCount, upvoted: true } : p))
    } catch (e) {
      console.warn('[MyReviews] upvote failed:', e)
    }
  }, [selectedPost?.id])

  const handleRemoveUpvote = useCallback(async (item) => {
    try {
      const newCount = await removeUpvoteCommunityPost(item.id)
      const updater = (p) => (p.id === item.id ? { ...p, upvotes: newCount, upvoted: false } : p)
      setPosts((prev) => prev.map(updater))
      if (selectedPost?.id === item.id) setSelectedPost((p) => (p?.id === item.id ? { ...p, upvotes: newCount, upvoted: false } : p))
    } catch (e) {
      console.warn('[MyReviews] remove upvote failed:', e)
    }
  }, [selectedPost?.id])

  if (loading && posts.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', paddingBottom: fabBottom }}>
        <ActivityIndicator size="large" color={C.red} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <GHFlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CommunityReviewCard
            item={item}
            C={C}
            styles={feedStyles}
            onPress={setSelectedPost}
            onCommentPress={(it) => {
              setSelectedPost(it)
              setFocusReplyWhenOpen(true)
            }}
            onUpvote={handleUpvote}
            onRemoveUpvote={handleRemoveUpvote}
          />
        )}
        contentContainerStyle={[feedStyles.feed, { paddingBottom: fabBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPosts({ isRefresh: true })} colors={[C.red]} />}
        ListEmptyComponent={(
          <View style={feedStyles.empty}>
            <View style={feedStyles.emptyIcon}>
              <Ionicons name="document-text-outline" size={44} color={C.muted} />
            </View>
            <Text style={feedStyles.emptyTitle}>No reviews from you yet</Text>
            <Text style={feedStyles.emptySub}>
              Open Community and tap + to post your first review and share your favorite spots
            </Text>
          </View>
        )}
      />
      <CommunityReviewDetailModal
        post={selectedPost}
        C={C}
        styles={feedStyles}
        onClose={() => {
          setSelectedPost(null)
          setFocusReplyWhenOpen(false)
        }}
        onUpvote={handleUpvote}
        onRemoveUpvote={handleRemoveUpvote}
        focusReplyWhenOpen={focusReplyWhenOpen}
        onClearFocusReply={() => setFocusReplyWhenOpen(false)}
      />
    </View>
  )
}
