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
  Image,
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
import { fetchCommunityComments, createCommunityComment, fetchClients } from '../services/community'
import { UpvoteParticles } from '../components/FeedUpvoteInteractions'
import { useCommunityUpvoteToggle } from '../hooks/useCommunityUpvoteToggle'
import { useTheme } from '../context/ThemeContext'
import { LUXURY, luxurySoftShadow } from '../theme/luxuryPremium'
import ClientProfileModal from '../components/ClientProfileModal'
import { ClientMentionText } from '../components/community/ClientMentionText'
import { ClientMentionSuggestions } from '../components/community/ClientMentionSuggestions'
import {
  getActiveMentionTrigger,
  applyMentionSelection,
} from '../utils/communityMentions'
import { CommunityUserTypeBadge } from '../components/community/CommunityUserTypeBadge'

const DEFAULT_PROFILE_IMAGES = [
  require('../../assets/pfp.png'),
  require('../../assets/pfp2.png'),
]

const getDefaultAvatarSource = (seedValue) => {
  const seed = String(seedValue || '').trim()
  if (!seed) return DEFAULT_PROFILE_IMAGES[0]
  let hash = 5381
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i)
  }
  const normalized = Math.abs(hash + seed.length * 31)
  return normalized % 4 <= 1 ? DEFAULT_PROFILE_IMAGES[0] : DEFAULT_PROFILE_IMAGES[1]
}

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
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [sending, setSending] = useState(false)
  const [clients, setClients] = useState([])
  const [profileClientId, setProfileClientId] = useState(null)
  const inputRef = useRef(null)

  const mentionTrigger = useMemo(
    () => getActiveMentionTrigger(draft, selection.end),
    [draft, selection.end],
  )

  useEffect(() => {
    let cancelled = false
    fetchClients().then((list) => {
      if (!cancelled) setClients(list || [])
    })
    return () => { cancelled = true }
  }, [])

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

  const handleTaggedClientPress = useCallback(({ clientId }) => {
    if (!clientId) return
    setProfileClientId(clientId)
  }, [])

  const handleDraftChange = useCallback((text) => {
    setDraft(text)
    setSelection((prev) => ({
      start: prev.start,
      end: Math.min(text.length, Math.max(prev.end, text.length)),
    }))
  }, [])

  const handleSelectionChange = useCallback((e) => {
    const { start, end } = e.nativeEvent.selection
    setSelection({ start, end })
  }, [])

  const handleMentionSelect = useCallback((client) => {
    if (!mentionTrigger) return
    const { text, cursor } = applyMentionSelection(draft, mentionTrigger, client)
    setDraft(text)
    setSelection({ start: cursor, end: cursor })
    setTimeout(() => {
      inputRef.current?.setNativeProps?.({ selection: { start: cursor, end: cursor } })
    }, 0)
  }, [draft, mentionTrigger])

  const handleSendComment = useCallback(async () => {
    const text = draft.trim()
    if (!text || !post?.id) return
    setSending(true)
    try {
      const created = await createCommunityComment(post.id, text)
      setDraft('')
      setSelection({ start: 0, end: 0 })
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
          onTaggedClientPress={handleTaggedClientPress}
          onUpvoteToggle={onDetailUpvoteToggle}
          upvoteScaleAnim={getUpvoteScaleAnim(post.id)}
        />

        <View style={[styles.repliesHeader, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.repliesTitleRow}>
            <View style={[styles.repliesTitleIcon, { backgroundColor: C.redSoft }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={C.red} />
            </View>
            <Text style={[styles.repliesTitle, { color: C.text }]}>Replies</Text>
          </View>
          {loadingComments ? (
            <ActivityIndicator size="small" color={C.red} />
          ) : (
            <View style={[styles.repliesCountPill, { backgroundColor: C.chip }]}>
              <Text style={[styles.repliesCount, { color: C.sub }]}>{comments.length}</Text>
            </View>
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
                <Image source={getDefaultAvatarSource(`${c.author || 'user'}-${c.id || ''}`)} style={styles.profileAvatarImage} resizeMode="cover" />
              </View>
              <View style={[styles.commentBody, { borderColor: C.border }]}>
                <View style={styles.commentMeta}>
                  <Text style={[styles.commentAuthor, { color: C.text }]} numberOfLines={1}>
                    {c.author}
                  </Text>
                  <CommunityUserTypeBadge uType={c.uType} compact />
                </View>
                <ClientMentionText
                  text={c.body}
                  style={[styles.commentText, { color: C.text }]}
                  mentionStyle={[styles.commentText, styles.commentMention]}
                  onMentionPress={handleTaggedClientPress}
                />
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
        <ClientMentionSuggestions
          visible={!!mentionTrigger}
          clients={clients}
          query={mentionTrigger?.query}
          onSelect={handleMentionSelect}
          palette={C}
        />
        <View style={[styles.composerGlassOuter, { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(142,142,147,0.22)' }]}>
          <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.composerGlassFrost, isDark && styles.composerGlassFrostDark]} pointerEvents="none" />
          <View style={styles.composerGlassInner}>
            <View style={[styles.composerInner, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)', borderColor: C.border }]}>
              <View style={[styles.composerAv, { backgroundColor: C.card }]}>
                <Image source={DEFAULT_PROFILE_IMAGES[0]} style={styles.profileAvatarImage} resizeMode="cover" />
              </View>
              <TextInput
                ref={inputRef}
                style={[styles.composerInput, { color: C.text }]}
                placeholder="Post your reply — type @ to tag a venue"
                placeholderTextColor={C.muted}
                value={draft}
                onChangeText={handleDraftChange}
                onSelectionChange={handleSelectionChange}
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
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
      <ClientProfileModal
        visible={!!profileClientId}
        clientId={profileClientId}
        onClose={() => setProfileClientId(null)}
        insets={insets}
        onOpenARNavigate={(dest) => {
          setProfileClientId(null)
          navigation.navigate('AR', { navigateTo: dest })
        }}
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
  repliesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repliesTitleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repliesTitle: { fontSize: 16, fontWeight: '800' },
  repliesCountPill: {
    minWidth: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: LUXURY.radiusMarkerPill,
    borderWidth: StyleSheet.hairlineWidth,
    ...luxurySoftShadow,
  },
  commentAv: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  commentAuthor: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 13, lineHeight: 18 },
  commentMention: { color: '#1D9BF0', fontWeight: '700' },
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
  profileAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
})
