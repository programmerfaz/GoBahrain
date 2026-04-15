import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  getCommunityPalette,
  buildCommunityFeedStyles,
  CommunityReviewCard,
} from '../components/community/CommunityReviewViews'
import { fetchCommunityComments, createCommunityComment } from '../services/community'
import { UpvoteParticles } from '../components/FeedUpvoteInteractions'
import { useCommunityUpvoteToggle } from '../hooks/useCommunityUpvoteToggle'
import { useTheme } from '../context/ThemeContext'
import { LUXURY, luxurySoftShadow } from '../theme/luxuryPremium'

export default function CommunityPostDetailScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const insets = useSafeAreaInsets()
  const { isDark } = useTheme()
  const initialPost = route.params?.post
  const focusComposer = !!route.params?.focusComposer

  const C = useMemo(() => getCommunityPalette(isDark), [isDark])
  const feedStyles = useMemo(() => buildCommunityFeedStyles(C, isDark), [C, isDark])

  const [post, setPost] = useState(initialPost)
  const [comments, setComments] = useState([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef(null)

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: 'Post',
      headerBackTitleVisible: false,
      headerStyle: { backgroundColor: C.bg },
      headerTintColor: C.text,
      headerTitleStyle: { fontWeight: '700', color: C.text },
      headerShadowVisible: false,
    })
  }, [navigation, C.bg, C.text])

  const loadComments = useCallback(async () => {
    if (!post?.id) {
      setComments([])
      setLoadingComments(false)
      return
    }
    setLoadingComments(true)
    try {
      const list = await fetchCommunityComments(post.id)
      setComments(list)
    } catch (e) {
      setComments([])
    } finally {
      setLoadingComments(false)
    }
  }, [post?.id])

  useFocusEffect(
    useCallback(() => {
      loadComments()
    }, [loadComments]),
  )

  useEffect(() => {
    if (!focusComposer || !post) return
    const t = setTimeout(() => {
      inputRef.current?.focus()
    }, 350)
    return () => clearTimeout(t)
  }, [focusComposer, post])

  const {
    handleUpvoteToggle,
    getUpvoteScaleAnim,
    particlesVisible,
    particlePosition,
  } = useCommunityUpvoteToggle()

  const syncDetailPost = useCallback((updated) => {
    setPost((p) => (p && p.id === updated.id ? { ...p, ...updated } : p))
  }, [])

  const onDetailUpvoteToggle = useCallback(
    (item, e) => {
      handleUpvoteToggle(item, e, syncDetailPost)
    },
    [handleUpvoteToggle, syncDetailPost],
  )

  const handleSendComment = useCallback(async () => {
    const text = draft.trim()
    if (!text || !post?.id) return
    setSending(true)
    try {
      const created = await createCommunityComment(post.id, text)
      setDraft('')
      setComments((prev) => [...prev, created])
    } catch (e) {
      Alert.alert(
        'Cannot post reply',
        'Replies need the community_comment table in your project. Run database/migrations/002_community_comment.sql in Supabase, or try again later.',
      )
    } finally {
      setSending(false)
    }
  }, [draft, post?.id])

  if (!post) {
    return (
      <View style={[styles.centered, { backgroundColor: C.bg }]}>
        <Text style={{ color: C.sub }}>This post is unavailable.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: C.red, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: C.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CommunityReviewCard
          item={post}
          C={C}
          styles={feedStyles}
          expandBody
          hideCardBottomBorder
          onPress={null}
          onCommentPress={null}
          onUpvoteToggle={onDetailUpvoteToggle}
          upvoteScaleAnim={getUpvoteScaleAnim(post.id)}
        />

        <View style={[styles.repliesHeader, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.repliesTitle, { color: C.text }]}>Replies</Text>
          {loadingComments ? (
            <ActivityIndicator size="small" color={C.red} />
          ) : (
            <Text style={[styles.repliesCount, { color: C.sub }]}>{comments.length}</Text>
          )}
        </View>

        {loadingComments ? null : comments.length === 0 ? (
          <View style={[styles.emptyReplies, { backgroundColor: C.card, borderColor: C.border }]}>
            <Ionicons name="chatbubbles-outline" size={40} color={C.muted} />
            <Text style={[styles.emptyTitle, { color: C.text }]}>No replies yet</Text>
            <Text style={[styles.emptySub, { color: C.sub }]}>
              Be the first to share your thoughts on this review.
            </Text>
          </View>
        ) : (
          comments.map((c) => (
            <View
              key={c.id}
              style={[styles.commentRow, { backgroundColor: C.card, borderColor: C.border }]}
            >
              <View style={[styles.commentAv, { backgroundColor: C.chip }]}>
                <Ionicons name="person" size={16} color={C.muted} />
              </View>
              <View style={styles.commentBody}>
                <View style={styles.commentMeta}>
                  <Text style={[styles.commentAuthor, { color: C.text }]} numberOfLines={1}>
                    {c.author}
                  </Text>
                  <Text style={[styles.commentTime, { color: C.sub }]}>{c.time}</Text>
                </View>
                <Text style={[styles.commentText, { color: C.text }]}>{c.body}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View
        style={[
          styles.composerWrap,
          {
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.composerGlassOuter}>
          <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.composerGlassFrost, isDark && styles.composerGlassFrostDark]} pointerEvents="none" />
          <View style={styles.composerGlassInner}>
            <View style={[styles.composerInner, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)', borderColor: C.border }]}>
              <View style={[styles.composerAv, { backgroundColor: C.card }]}>
                <Ionicons name="person" size={18} color={C.muted} />
              </View>
              <TextInput
                ref={inputRef}
                style={[styles.composerInput, { color: C.text }]}
                placeholder="Post your reply"
                placeholderTextColor={C.muted}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={2000}
                editable={!sending}
                accessibilityLabel="Write a reply"
              />
              <TouchableOpacity
                onPress={handleSendComment}
                disabled={sending || !draft.trim()}
                style={[
                  styles.sendBtn,
                  { backgroundColor: draft.trim() ? C.red : C.chip },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send reply"
                accessibilityState={{ disabled: sending || !draft.trim() }}
              >
                {sending ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color={draft.trim() ? '#FFF' : C.muted} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      <UpvoteParticles
        visible={particlesVisible}
        position={particlePosition}
        accentColor={C.green}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  repliesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: LUXURY.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    ...luxurySoftShadow,
  },
  repliesTitle: { fontSize: 16, fontWeight: '800' },
  repliesCount: { fontSize: 14, fontWeight: '600' },
  emptyReplies: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginHorizontal: 14,
    marginBottom: 8,
    gap: 8,
    borderRadius: LUXURY.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    ...luxurySoftShadow,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  commentRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: LUXURY.radiusMarkerPill,
    borderWidth: StyleSheet.hairlineWidth,
    ...luxurySoftShadow,
  },
  commentAv: {
    width: 36,
    height: 36,
    borderRadius: LUXURY.radiusPill - 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentBody: { flex: 1, minWidth: 0 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  commentAuthor: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  commentTime: { fontSize: 13 },
  commentText: { fontSize: 15, lineHeight: 21 },
  composerWrap: {
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  composerGlassOuter: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(142,142,147,0.22)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
    }),
  },
  composerGlassFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  composerGlassFrostDark: {
    backgroundColor: 'rgba(28,28,30,0.88)',
  },
  composerGlassInner: {
    position: 'relative',
    zIndex: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  composerInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 22,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 6,
    gap: 8,
  },
  composerAv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  composerInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
})
