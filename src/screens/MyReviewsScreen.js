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
import { fetchMyCommunityPosts, getCommunityUserId } from '../services/community'
import { UpvoteParticles } from '../components/FeedUpvoteInteractions'
import { useCommunityUpvoteToggle } from '../hooks/useCommunityUpvoteToggle'
import { useTheme } from '../context/ThemeContext'
import ClientProfileModal from '../components/ClientProfileModal'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60

export default function MyReviewsScreen() {
  const { isDark } = useTheme()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const C = getCommunityPalette(isDark)
  const feedStyles = useMemo(() => buildCommunityFeedStyles(C, isDark), [C, isDark])

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [focusReplyWhenOpen, setFocusReplyWhenOpen] = useState(false)
  const [profileClientId, setProfileClientId] = useState(null)

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

  const {
    handleUpvoteToggle,
    getUpvoteScaleAnim,
    particlesVisible,
    particlePosition,
  } = useCommunityUpvoteToggle()

  const syncMyReviewsPost = useCallback((updated) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
    setSelectedPost((p) => (p?.id === updated.id ? { ...p, ...updated } : p))
  }, [])

  const onMyReviewsUpvoteToggle = useCallback(
    (item, e) => {
      handleUpvoteToggle(item, e, syncMyReviewsPost)
    },
    [handleUpvoteToggle, syncMyReviewsPost],
  )

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
            onTaggedClientPress={({ clientId }) => {
              if (clientId) setProfileClientId(clientId)
            }}
            onCommentPress={(it) => {
              setSelectedPost(it)
              setFocusReplyWhenOpen(true)
            }}
            onUpvoteToggle={onMyReviewsUpvoteToggle}
            upvoteScaleAnim={getUpvoteScaleAnim(item.id)}
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
        onUpvoteToggle={onMyReviewsUpvoteToggle}
        upvoteScaleAnim={selectedPost ? getUpvoteScaleAnim(selectedPost.id) : null}
        focusReplyWhenOpen={focusReplyWhenOpen}
        onClearFocusReply={() => setFocusReplyWhenOpen(false)}
        onTaggedClientPress={({ clientId }) => {
          if (clientId) setProfileClientId(clientId)
        }}
      />
      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        onClose={() => setProfileClientId(null)}
        insets={insets}
      />
      <UpvoteParticles
        visible={particlesVisible}
        position={particlePosition}
        accentColor={C.green}
      />
    </View>
  )
}
