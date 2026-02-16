import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Platform,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import ProfileButton from '../components/ProfileButton';
import { submitPostToN8n } from '../services/n8nApi';

const COLORS = {
  primary: '#C8102E',
  screenBg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: 'rgba(226,232,240,0.9)',
  upvote: '#E11D48',
  comment: '#0EA5E9',
  repost: '#10B981',
  accent: '#F97316',
  pillBg: '#F1F5F9',
};

const TOPICS = [
  { id: 'all', label: 'All', emoji: '🌴' },
  { id: 'food', label: 'Food', emoji: '🍽️' },
  { id: 'forts', label: 'Forts & History', emoji: '🏰' },
  { id: 'beaches', label: 'Beaches', emoji: '🏖️' },
  { id: 'souq', label: 'Souq', emoji: '🛒' },
  { id: 'events', label: 'Events', emoji: '🎉' },
  { id: 'tips', label: 'Tips', emoji: '💡' },
  { id: 'culture', label: 'Culture', emoji: '🕌' },
];

const MOCK_POSTS = [
  {
    id: '1',
    author: 'Sara AlBaharna',
    handle: '@sarainbh',
    avatar: 'https://i.pravatar.cc/100?u=sara',
    time: '2h',
    topic: 'food',
    body: 'Best karak in Manama? Haji’s Cafe near the souq — 500 fils and they don’t skimp on the cardamom. Perfect after a morning at Bahrain Fort. ☕️',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600',
    upvotes: 124,
    comments: 18,
    reposts: 5,
    upvoted: false,
  },
  {
    id: '2',
    author: 'Ahmed Travels',
    handle: '@ahmed_travels',
    avatar: 'https://i.pravatar.cc/100?u=ahmed',
    time: '5h',
    topic: 'forts',
    body: 'Bahrain Fort at golden hour is unreal. Go around 5pm, bring water and comfy shoes. The museum is small but worth it. 🇧🇭',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600',
    upvotes: 312,
    comments: 42,
    reposts: 28,
    upvoted: true,
  },
  {
    id: '3',
    author: 'Layla Eats',
    handle: '@laylaeats',
    avatar: 'https://i.pravatar.cc/100?u=layla',
    time: '8h',
    topic: 'souq',
    body: 'Manama Souq tip: get there before 10am if you want the best sweets and spices without the crowd. Don’t skip the gold souq — even just to look!',
    image: null,
    upvotes: 89,
    comments: 12,
    reposts: 3,
    upvoted: false,
  },
  {
    id: '4',
    author: 'Go Bahrain',
    handle: '@gobahrain',
    avatar: 'https://i.pravatar.cc/100?u=gobahrain',
    time: '1d',
    topic: 'tips',
    body: 'First time in Bahrain? Our top 3: 1) Tree of Life at sunset 2) Bahrain National Museum 3) Block 338 for dinner. You’re welcome. 🌴',
    image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600',
    upvotes: 567,
    comments: 67,
    reposts: 91,
    upvoted: false,
  },
  {
    id: '5',
    author: 'Omar Explores',
    handle: '@omar_explores',
    avatar: 'https://i.pravatar.cc/100?u=omar',
    time: '1d',
    topic: 'beaches',
    body: 'Al Jazayer Beach is underrated. Clear water, less crowded than some spots, and the drive there is scenic. Great for a half-day trip.',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
    upvotes: 203,
    comments: 31,
    reposts: 14,
    upvoted: false,
  },
  {
    id: '6',
    author: 'Noor',
    handle: '@noor_in_bh',
    avatar: 'https://i.pravatar.cc/100?u=noor',
    time: '2d',
    topic: 'culture',
    body: 'Qur’an manuscript at Beit Al Qur’an — one of the most peaceful places in Bahrain. Free entry, no rush. Perfect for a quiet afternoon.',
    image: null,
    upvotes: 156,
    comments: 9,
    reposts: 7,
    upvoted: false,
  },
];

function CommunityPostCard({ item, onUpvote, onComment, onRepost, onPress }) {
  const { width } = useWindowDimensions();
  const imageWidth = width - 32;
  const imageHeight = Math.round(imageWidth * 0.55);
  const [upvoted, setUpvoted] = useState(item.upvoted);
  const [upvoteCount, setUpvoteCount] = useState(item.upvotes);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleUpvote = () => {
    const next = !upvoted;
    setUpvoted(next);
    setUpvoteCount((c) => (next ? c + 1 : c - 1));
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
    onUpvote?.(item);
  };

  const topicLabel = TOPICS.find((t) => t.id === item.topic)?.label || 'Tip';

  const mainContent = (
    <>
      <View style={styles.postHeader}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={styles.postMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName} numberOfLines={1}>{item.author}</Text>
            <View style={styles.topicPill}>
              <Text style={styles.topicPillText}>{topicLabel}</Text>
            </View>
          </View>
          <Text style={styles.handle}>{item.handle} · {item.time}</Text>
        </View>
        <TouchableOpacity style={styles.moreBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.body} numberOfLines={onPress ? 3 : undefined}>{item.body}</Text>
      {item.image ? (
        <View style={[styles.imageWrap, { width: imageWidth, height: imageHeight }]}>
          <Image
            source={{ uri: item.image }}
            style={[styles.postImage, { width: imageWidth, height: imageHeight }]}
            resizeMode="cover"
          />
          <View style={styles.imageCorner} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.postCard}>
      {onPress ? (
        <TouchableOpacity activeOpacity={0.92} onPress={() => onPress(item)}>
          {mainContent}
        </TouchableOpacity>
      ) : (
        mainContent
      )}
      <View style={[styles.actionRow, onPress && styles.actionRowBorderTop]}>
        <TouchableOpacity style={styles.actionItem} onPress={handleUpvote} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons name="chevron-up" size={22} color={upvoted ? COLORS.upvote : COLORS.textMuted} />
          </Animated.View>
          <Text style={[styles.actionCount, upvoted && styles.actionCountUpvoted]}>{upvoteCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionItem} onPress={() => onComment?.(item)} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={20} color={COLORS.textMuted} />
          <Text style={styles.actionCount}>{item.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionItem} onPress={() => onRepost?.(item)} activeOpacity={0.7}>
          <Ionicons name="repeat-outline" size={20} color={COLORS.textMuted} />
          <Text style={styles.actionCount}>{item.reposts}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionItem} activeOpacity={0.7}>
          <Ionicons name="paper-plane-outline" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PostDetailModal({ post, onClose }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const imageWidth = width - 32;
  const imageHeight = Math.round(imageWidth * 0.6);
  const [upvoted, setUpvoted] = useState(post?.upvoted ?? false);
  const [upvoteCount, setUpvoteCount] = useState(post?.upvotes ?? 0);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  if (!post) return null;

  const topicLabel = TOPICS.find((t) => t.id === post.topic)?.label || 'Tip';

  const handleUpvote = () => {
    const next = !upvoted;
    setUpvoted(next);
    setUpvoteCount((c) => (next ? c + 1 : c - 1));
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.25, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Modal visible={!!post} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.modalHeaderTitle}>Post</Text>
          <View style={styles.modalHeaderRight} />
        </View>
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.detailCard}>
            <View style={styles.postHeader}>
              <Image source={{ uri: post.avatar }} style={styles.avatar} />
              <View style={styles.postMeta}>
                <View style={styles.nameRow}>
                  <Text style={styles.authorName} numberOfLines={1}>{post.author}</Text>
                  <View style={styles.topicPill}>
                    <Text style={styles.topicPillText}>{topicLabel}</Text>
                  </View>
                </View>
                <Text style={styles.handle}>{post.handle} · {post.time}</Text>
              </View>
              <TouchableOpacity style={styles.moreBtn}>
                <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.detailBody}>{post.body}</Text>
            {post.image ? (
              <View style={[styles.imageWrap, { width: imageWidth, height: imageHeight }]}>
                <Image
                  source={{ uri: post.image }}
                  style={[styles.postImage, { width: imageWidth, height: imageHeight }]}
                  resizeMode="cover"
                />
                <View style={styles.imageCorner} />
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionItem} onPress={handleUpvote} activeOpacity={0.7}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Ionicons name="chevron-up" size={24} color={upvoted ? COLORS.upvote : COLORS.textMuted} />
                </Animated.View>
                <Text style={[styles.actionCount, upvoted && styles.actionCountUpvoted]}>{upvoteCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} activeOpacity={0.7}>
                <Ionicons name="chatbubble-outline" size={22} color={COLORS.textMuted} />
                <Text style={styles.actionCount}>{post.comments}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} activeOpacity={0.7}>
                <Ionicons name="repeat-outline" size={22} color={COLORS.textMuted} />
                <Text style={styles.actionCount}>{post.reposts}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} activeOpacity={0.7}>
                <Ionicons name="paper-plane-outline" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.replySection}>
            <Text style={styles.replySectionTitle}>Replies</Text>
            <TouchableOpacity style={styles.replyInputRow} activeOpacity={0.8}>
              <View style={styles.replyAvatar}>
                <Ionicons name="person" size={20} color={COLORS.textMuted} />
              </View>
              <Text style={styles.replyPlaceholder}>Post your reply...</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;

const RADIAL_MENU_SIZE = 200;
const RADIAL_HALF = RADIAL_MENU_SIZE / 2;

function RadialPostMenu({ visible, onClose, onWriteReview, onCameraScan }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const handleOption = (fn) => {
    Animated.timing(opacityAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      scaleAnim.setValue(0);
      fn();
      onClose();
    });
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.radialBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.radialMenuWrap,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.radialCircle}>
            {/* Top half — Write a review */}
            <TouchableOpacity
              style={styles.radialSegmentTop}
              activeOpacity={0.85}
              onPress={() => handleOption(onWriteReview)}
            >
              <View style={styles.radialSegmentInner}>
                <Ionicons name="pencil" size={32} color="#FFFFFF" />
                <Text style={styles.radialSegmentLabel}>Write a review</Text>
              </View>
            </TouchableOpacity>
            {/* Bottom half — Camera scan */}
            <TouchableOpacity
              style={styles.radialSegmentBottom}
              activeOpacity={0.85}
              onPress={() => handleOption(onCameraScan)}
            >
              <View style={styles.radialSegmentInner}>
                <Ionicons name="scan" size={32} color="#FFFFFF" />
                <Text style={styles.radialSegmentLabel}>Camera scan</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

function CreatePostModal({ visible, onClose, onPost }) {
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('tips');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    if (isSubmitting) return;
    setBody('');
    setSelectedTopicId('tips');
    onClose();
  };

  const handlePost = async () => {
    if (!body.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onPost?.({ body: body.trim(), topicId: selectedTopicId });
      setBody('');
      setSelectedTopicId('tips');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.createModalRoot, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.createModalHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.createModalCancel}>
            <Text style={styles.createModalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.createModalTitle}>New post</Text>
          <TouchableOpacity onPress={handlePost} style={styles.createModalPostBtn} disabled={!body.trim() || isSubmitting} activeOpacity={0.7}>
            <Text style={[styles.createModalPostBtnText, (!body.trim() || isSubmitting) && styles.createModalPostBtnDisabled]}>{isSubmitting ? 'Posting…' : 'Post'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.createModalScroll}
          contentContainerStyle={[styles.createModalScrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.createModalBody}>
            <View style={styles.createAvatar}>
              <Ionicons name="person" size={24} color={COLORS.textMuted} />
            </View>
            <TextInput
              style={styles.createTextInput}
              placeholder="Share a tip about Bahrain..."
              placeholderTextColor={COLORS.textMuted}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={500}
            />
          </View>
          <Text style={styles.createCharCount}>{body.length}/500</Text>
          <View style={styles.createTopicRow}>
            <Text style={styles.createTopicLabel}>Topic</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.createTopicChips}>
              {TOPICS.filter((t) => t.id !== 'all').map((t) => {
                const selected = selectedTopicId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.createTopicChip, selected && styles.createTopicChipSelected]}
                    onPress={() => setSelectedTopicId(t.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.createTopicChipEmoji}>{t.emoji}</Text>
                    <Text style={[styles.createTopicChipLabel, selected && styles.createTopicChipLabelSelected]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.createActionsRow}>
            <TouchableOpacity style={styles.createActionBtn} activeOpacity={0.7}>
              <Ionicons name="image-outline" size={24} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.createActionBtn} activeOpacity={0.7}>
              <Ionicons name="location-outline" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CameraScanModal({ visible, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.cameraScanModal}>
        <View style={styles.cameraScanHeader}>
          <TouchableOpacity onPress={onClose} style={styles.cameraScanClose}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.cameraScanTitle}>Camera scan</Text>
          <View style={styles.cameraScanClose} />
        </View>
        <View style={styles.cameraScanPlaceholder}>
          <Ionicons name="scan-outline" size={80} color={COLORS.textMuted} />
          <Text style={styles.cameraScanPlaceholderText}>Camera scan</Text>
          <Text style={styles.cameraScanPlaceholderSub}>Scan a place or object to add a review</Text>
        </View>
      </View>
    </Modal>
  );
}

export default function CommunitiesScreen() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState(MOCK_POSTS);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRadialMenu, setShowRadialMenu] = useState(false);
  const [showCameraScan, setShowCameraScan] = useState(false);
  const fabBottom = TAB_BAR_HEIGHT + 72 + (Platform.OS === 'android' ? insets.bottom : 0);

  const handleWriteReview = () => {
    setShowRadialMenu(false);
    setShowCreateModal(true);
  };

  const handleCreatePost = async ({ body, topicId }) => {
    await submitPostToN8n({ body, topicId });
    const newPost = {
      id: `new-${Date.now()}`,
      author: 'You',
      handle: '@you',
      avatar: 'https://i.pravatar.cc/100?u=you',
      time: 'Now',
      topic: topicId || 'tips',
      body,
      image: null,
      upvotes: 0,
      comments: 0,
      reposts: 0,
      upvoted: false,
    };
    setPosts((prev) => [newPost, ...prev]);
  };

  const handleCameraScan = () => {
    setShowRadialMenu(false);
    setShowCameraScan(true);
  };

  return (
    <ScreenContainer style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft} />
        <Text style={styles.headerTitle}>Community</Text>
        <View style={styles.headerRight}>
          <ProfileButton iconColor={COLORS.textPrimary} />
        </View>
      </View>

      {/* Feed */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CommunityPostCard
            item={item}
            onPress={setSelectedPost}
            onUpvote={() => {}}
            onComment={() => {}}
            onRepost={() => {}}
          />
        )}
        contentContainerStyle={styles.feedContent}
        style={styles.feedList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.feedHeader}>
            <Text style={styles.feedHeaderText}>Latest from the community</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No posts yet.</Text>
            <Text style={styles.emptySub}>Be the first to share a tip!</Text>
          </View>
        }
      />

      {/* Floating create post button — opens radial menu (GTA-style) */}
      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => setShowRadialMenu(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="create" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <RadialPostMenu
        visible={showRadialMenu}
        onClose={() => setShowRadialMenu(false)}
        onWriteReview={handleWriteReview}
        onCameraScan={handleCameraScan}
      />
      <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      <CreatePostModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} onPost={handleCreatePost} />
      <CameraScanModal visible={showCameraScan} onClose={() => setShowCameraScan(false)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: COLORS.screenBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: { width: 40, height: 40 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  // GTA-style radial menu
  radialBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radialMenuWrap: {
    width: RADIAL_MENU_SIZE,
    height: RADIAL_MENU_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radialCircle: {
    width: RADIAL_MENU_SIZE,
    height: RADIAL_MENU_SIZE,
    borderRadius: RADIAL_HALF,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  radialSegmentTop: {
    width: RADIAL_MENU_SIZE,
    height: RADIAL_HALF,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: RADIAL_HALF,
    borderTopRightRadius: RADIAL_HALF,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialSegmentBottom: {
    width: RADIAL_MENU_SIZE,
    height: RADIAL_HALF,
    backgroundColor: '#9B0C24',
    borderBottomLeftRadius: RADIAL_HALF,
    borderBottomRightRadius: RADIAL_HALF,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialSegmentInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialSegmentLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 6,
  },
  // Camera scan placeholder modal
  cameraScanModal: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  cameraScanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
  },
  cameraScanClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraScanTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cameraScanPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cameraScanPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  cameraScanPlaceholderSub: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  feedList: {
    flex: 1,
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  feedHeader: {
    marginBottom: 12,
  },
  feedHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  postCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.pillBg,
    marginRight: 10,
  },
  postMeta: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    maxWidth: '60%',
  },
  topicPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: `${COLORS.primary}18`,
  },
  topicPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  handle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  moreBtn: {
    padding: 4,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  imageWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: COLORS.pillBg,
  },
  postImage: {
    borderRadius: 12,
  },
  imageCorner: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 4,
  },
  actionRowBorderTop: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 4,
    paddingTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalHeaderRight: { width: 44, height: 44 },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  // Create post modal
  createModalRoot: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  createModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
  },
  createModalCancel: {
    minWidth: 70,
    paddingVertical: 8,
  },
  createModalCancelText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  createModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  createModalPostBtn: {
    minWidth: 70,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  createModalPostBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  createModalPostBtnDisabled: {
    color: COLORS.textMuted,
  },
  createModalScroll: {
    flex: 1,
  },
  createModalScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  createModalBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  createAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  createTextInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.textPrimary,
    paddingVertical: 8,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  createCharCount: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
    textAlign: 'right',
  },
  createTopicRow: {
    marginBottom: 20,
  },
  createTopicLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  createTopicChips: {
    flexDirection: 'row',
    gap: 8,
  },
  createTopicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.pillBg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  createTopicChipSelected: {
    backgroundColor: `${COLORS.primary}12`,
    borderColor: `${COLORS.primary}40`,
  },
  createTopicChipEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  createTopicChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  createTopicChipLabelSelected: {
    color: COLORS.primary,
  },
  createActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  createActionBtn: {
    padding: 8,
  },
  detailCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  detailBody: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  replySection: {
    marginTop: 20,
  },
  replySectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  replyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  replyPlaceholder: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionCount: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  actionCountUpvoted: {
    color: COLORS.upvote,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
