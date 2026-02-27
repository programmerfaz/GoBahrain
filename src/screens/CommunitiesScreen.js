import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  useWindowDimensions,
  Platform,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ScreenContainer from '../components/ScreenContainer';
import ProfileButton from '../components/ProfileButton';
import {
  fetchCommunityPosts,
  searchCommunityWithOpenAI,
  createCommunityPost,
   uploadCommunityImages,
   upvoteCommunityPost,
   removeUpvoteCommunityPost,
   getCommunityUserId,
   fetchClients,
 } from '../services/community';

const C = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#111827',
  sub: '#6B7280',
  muted: '#9CA3AF',
  border: 'rgba(209,213,219,0.7)',
  red: '#C8102E',
  redSoft: '#FEF2F2',
  orange: '#EA580C',
  orangeSoft: '#FFF7ED',
  blue: '#0284C7',
  blueSoft: '#EFF6FF',
  green: '#059669',
  upvoteLight: '#22C55E',
  upvoteDark: '#15803D',
  chip: '#F3F4F6',
  chipActive: '#1C1917',
  accent: '#D4A574',
  warmGlow: '#9CA3AF',
};

// Different accent color per review (left strip + avatar border)
const REVIEW_ACCENT_COLORS = [
  '#C8102E', '#B45309', '#0D9488', '#7C3AED', '#DC2626',
  '#CA8A04', '#059669', '#2563EB', '#C2410C', '#9333EA',
];
function getReviewAccentColor(item) {
  const id = (item?.id ?? item?.body ?? '0').toString();
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  return REVIEW_ACCENT_COLORS[n % REVIEW_ACCENT_COLORS.length];
}

// Community page top filter: All, Trending + hashtags (no AI chip — AI results show temporarily until another filter is tapped)
const TOPICS = [
  { id: 'all', label: 'All' },
  { id: 'trending', label: 'Trending' },
  { id: 'food', label: 'Food' },
  { id: 'places', label: 'Places' },
  { id: 'events', label: 'Events' },
  { id: 'beaches', label: 'Beaches' },
  { id: 'culture', label: 'Culture' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'family', label: 'Family' },
  { id: 'tips', label: 'Tips' },
];

const TOPIC_EMOJIS = {
  all: '🌴', trending: '🔥', food: '🍽️', places: '📍', events: '🎉',
  beaches: '🏖️', culture: '🕌', nightlife: '🌙', family: '👨‍👩‍👧‍👦', tips: '💡',
};

const AI_SEARCH_MAX_LEN = 50;

// Create post — Select topic: only these 8, multiple select
const CREATE_POST_TOPICS = [
  { id: 'food', label: 'Food' },
  { id: 'places', label: 'Places' },
  { id: 'events', label: 'Events' },
  { id: 'beaches', label: 'Beaches' },
  { id: 'culture', label: 'Culture' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'family', label: 'Family' },
  { id: 'tips', label: 'Tips' },
];

const CREATE_POST_TOPIC_EMOJIS = {
  food: '🍽️', places: '📍', events: '🎉', beaches: '🏖️',
  culture: '🕌', nightlife: '🌙', family: '👨‍👩‍👧‍👦', tips: '💡',
};

const TOTAL_STARS = 5;

function RatingStars({ rating, size = 12, color }) {
  if (rating == null || rating <= 0) return null;
  const r = Math.min(5, Math.max(0, Number(rating)));
  const starColor = color ?? C.orange;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: TOTAL_STARS }, (_, i) => {
        const starValue = i + 1;
        const filled = r >= starValue;
        const half = !filled && r >= starValue - 0.5;
        const name = filled ? 'star' : half ? 'star-half' : 'star-outline';
        return (
          <Ionicons key={i} name={name} size={size} color={filled || half ? starColor : C.muted} />
        );
      })}
    </View>
  );
}

function ReviewCard({ item, onPress, onCommentPress, onUpvote, onRemoveUpvote, aiTip }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;
  const imgH = Math.round(cardWidth * 0.48);
  const [upvoted, setUpvoted] = useState(item.upvoted);
  const scale = useRef(new Animated.Value(1)).current;
  const count = item.upvotes ?? 0;

  const images = item.images?.length > 0 ? item.images : item.image ? [item.image] : [];

  const doUpvote = () => {
    const next = !upvoted;
    setUpvoted(next);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 100, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    if (next) onUpvote?.(item); else onRemoveUpvote?.(item);
  };

  const topicIds = (item.topic || '').split(',').map((t) => t.trim()).filter(Boolean);

  const body = (
    <TouchableOpacity activeOpacity={0.94} onPress={() => onPress?.(item)} style={s.card}>
      <View style={s.cardInner}>
        {/* Author row */}
        <View style={s.cardAuthorRow}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={s.av} />
          ) : (
            <View style={[s.av, s.avPlaceholder]}>
              <Text style={s.avInitial}>{(item.author || 'U')[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={s.cardMeta}>
            <Text style={s.authorText} numberOfLines={1}>{item.author}</Text>
            {item.place ? (
              <View style={s.cardPlaceRow}>
                <Ionicons name="location-sharp" size={11} color={C.red} />
                <Text style={s.cardPlaceText} numberOfLines={1}>{item.place}</Text>
              </View>
            ) : null}
          </View>
          {item.rating != null && item.rating > 0 && (
            <View style={[s.cardRatingPill, { backgroundColor: C.redSoft }]}>
              <RatingStars rating={item.rating} size={11} color={C.red} />
              <Text style={[s.cardRatingNum, { color: C.red }]}>{Number(item.rating).toFixed(1)}</Text>
            </View>
          )}
        </View>

        <Text style={s.bodyText} numberOfLines={3}>{item.body}</Text>

        {/* Topic pills */}
        {topicIds.length > 0 && (
          <View style={s.cardTopicRow}>
            {topicIds.slice(0, 3).map((tid) => (
              <View key={tid} style={s.cardTopicPill}>
                <Text style={s.cardTopicPillText}>#{tid}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Image */}
        {images.length > 0 && (
          <View style={[s.cardImgWrap, { height: imgH, width: '100%' }]}>
            {images.length === 1 ? (
              <Image source={{ uri: images[0] }} style={s.cardImg} resizeMode="cover" />
            ) : images.length === 2 ? (
              <View style={s.cardImgSplitRow}>
                <Image source={{ uri: images[0] }} style={s.cardImgHalf} resizeMode="cover" />
                <View style={s.cardImgGap} />
                <Image source={{ uri: images[1] }} style={s.cardImgHalf} resizeMode="cover" />
              </View>
            ) : (
              <>
                <Image source={{ uri: images[0] }} style={s.cardImg} resizeMode="cover" />
                <View style={s.imgCountBadge}>
                  <Text style={s.imgCountText}>+{images.length - 1}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Khalid's tip — dashed line + yellow block (same as itinerary tip) */}
        {aiTip ? (
          <>
            <View style={s.cardKhalidDashedLine} />
            <View style={s.cardKhalidTipWrap}>
              <Ionicons name="bulb-outline" size={15} color="#D97706" />
              <Text style={s.cardKhalidTipText}>{aiTip}</Text>
            </View>
          </>
        ) : null}

        {/* Actions: Upvote · Comment only */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={doUpvote} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale }] }}>
              <Ionicons name={upvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={20} color={upvoted ? C.upvoteDark : C.upvoteLight} />
            </Animated.View>
            <Text style={[s.actionNum, { color: upvoted ? C.upvoteDark : C.upvoteLight }]}>{count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => onCommentPress?.(item)} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={17} color={C.blue} />
            <Text style={[s.actionNum, { color: C.blue }]}>{item.comments}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return body;
}

function DetailModal({ post, onClose, onUpvote, onRemoveUpvote, focusReplyWhenOpen = false, onClearFocusReply }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cardMargin = 24;
  const cardW = width - cardMargin * 2;
  const imgW = cardW;
  const imgH = Math.round(imgW * 0.5);
  const popupMaxHeight = height * 0.88;
  const popupCardHeaderH = 54; // "Review" header row
  const [upvoted, setUpvoted] = useState(post?.upvoted ?? false);
  const [imageIndex, setImageIndex] = useState(0);
  const [cardHeight, setCardHeight] = useState(popupMaxHeight);
  const [replyText, setReplyText] = useState('');
  const imageScrollRef = useRef(null);
  const replyInputRef = useRef(null);
  const scale = useRef(new Animated.Value(1)).current;
  const count = post?.upvotes ?? 0;

  useEffect(() => {
    if (post?.upvoted) setUpvoted(true);
  }, [post?.id, post?.upvoted]);
  useEffect(() => { setImageIndex(0); setCardHeight(popupMaxHeight); setReplyText(''); }, [post?.id, popupMaxHeight]);
  useEffect(() => {
    if (post && focusReplyWhenOpen && replyInputRef.current) {
      const t = setTimeout(() => {
        replyInputRef.current?.focus();
        onClearFocusReply?.();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [post?.id, focusReplyWhenOpen]);

  if (!post) return null;

  const images = post.images?.length > 0 ? post.images : post.image ? [post.image] : [];
  const hasMultipleImages = images.length > 1;

  const goToImage = (index) => {
    const i = Math.max(0, Math.min(index, images.length - 1));
    setImageIndex(i);
    imageScrollRef.current?.scrollTo({ x: i * imgW, animated: true });
  };
  const topicIds = (post.topic || '').split(',').map((s2) => s2.trim()).filter(Boolean);
  const topicLabels = topicIds.map((id) => TOPICS.find((t) => t.id === id)?.label || CREATE_POST_TOPICS.find((t) => t.id === id)?.label || id);

  const doUpvote = () => {
    const next = !upvoted;
    setUpvoted(next);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    if (next) onUpvote?.(post); else onRemoveUpvote?.(post);
  };

  return (
    <Modal visible={!!post} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.popOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={[s.popOverlay, { flex: 1 }]} collapsable={false}>
        {/* Blurred / dim backdrop — tap to close */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} />
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Card — height shrinks to content, max popupMaxHeight */}
        <View style={[s.popCard, { width: cardW, height: cardHeight, maxHeight: popupMaxHeight, zIndex: 10 }]}>
          <View style={s.popHeader}>
            <View style={s.popHeaderLeft}>
              {post.avatar ? (
                <Image source={{ uri: post.avatar }} style={s.popHeaderAv} />
              ) : (
                <View style={[s.popHeaderAv, s.popHeaderAvPlaceholder]}>
                  <Text style={s.popHeaderAvLetter}>{(post.author || 'U')[0].toUpperCase()}</Text>
                </View>
              )}
              <Text style={s.popHeaderName}>{post.author}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={14} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={28} color={C.red} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 12, flexGrow: 0 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
            onContentSizeChange={(_, contentH) => {
              const total = popupCardHeaderH + contentH;
              setCardHeight(Math.min(total, popupMaxHeight));
            }}
          >
            {/* Images */}
            {images.length > 0 ? (
              <View style={[s.popImgWrap, { width: cardW, height: imgH }]}>
                <ScrollView
                  ref={imageScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / imgW);
                    setImageIndex(i);
                  }}
                  style={{ width: cardW, height: imgH }}
                >
                  {images.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={{ width: imgW, height: imgH }} resizeMode="cover" />
                  ))}
                </ScrollView>
                {images.length > 1 && (
                  <View style={s.popImgPills}>
                    {images.map((_, i) => (
                      <View key={i} style={[s.popImgPill, i === imageIndex && s.popImgPillActive]} />
                    ))}
                  </View>
                )}
                <View style={s.popImgBadge}>
                  <Ionicons name="images-outline" size={13} color="#FFF" />
                  <Text style={s.popImgBadgeText}>{imageIndex + 1}/{images.length}</Text>
                </View>
              </View>
            ) : null}

            {/* Body content */}
            <View style={s.popBody}>
              {/* Location + rating in same row */}
              <View style={s.popPlaceRatingRow}>
                {post.place ? (
                  <View style={s.popPlaceWrap}>
                    <Ionicons name="location-sharp" size={13} color={C.red} />
                    <Text style={s.popPlaceText} numberOfLines={1}>{post.place}</Text>
                  </View>
                ) : null}
                {post.rating != null && post.rating > 0 && (
                  <View style={s.popRatingWrap}>
                    <RatingStars rating={post.rating} size={13} />
                    <Text style={s.popRatingNum}>{Number(post.rating).toFixed(1)}</Text>
                  </View>
                )}
              </View>

              {/* Review text */}
              <Text style={s.popReviewText}>{post.body}</Text>

              {/* Upvote */}
              <View style={s.popUpvoteRow}>
                <TouchableOpacity style={s.popUpvoteBtn} onPress={doUpvote} activeOpacity={0.7}>
                  <Animated.View style={{ transform: [{ scale }] }}>
                    <Ionicons name={upvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={20} color={upvoted ? C.upvoteDark : C.upvoteLight} />
                  </Animated.View>
                  <Text style={[s.popUpvoteNum, { color: upvoted ? C.upvoteDark : C.upvoteLight }]}>{count}</Text>
                </TouchableOpacity>
              </View>

              {/* Replies — always show so user can add reply */}
              <View style={s.popReplySection}>
                <Text style={s.popReplyTitle}>Replies</Text>
                <View style={s.popReplyBox}>
                  <View style={s.popReplyAv}>
                    <Ionicons name="person" size={14} color={C.muted} />
                  </View>
                  <TextInput
                    ref={replyInputRef}
                    style={s.popReplyInput}
                    placeholder="Add your thoughts..."
                    placeholderTextColor={C.muted}
                    value={replyText}
                    onChangeText={setReplyText}
                    multiline={false}
                    returnKeyType="send"
                    blurOnSubmit
                  />
                  <TouchableOpacity onPress={() => replyInputRef.current?.focus()} hitSlop={8}>
                    <Ionicons name="send" size={16} color={C.red} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;

function CreatePostModal({ visible, onClose, onPosted }) {
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState('');
  const [place, setPlace] = useState('');
  const [selectedClientUuid, setSelectedClientUuid] = useState(null);
  const [rating, setRating] = useState(0);
  const [selectedTopicIds, setSelectedTopicIds] = useState([]);
  const [customHashtag, setCustomHashtag] = useState('');
  const [imageEntries, setImageEntries] = useState([]);
  const [posting, setPosting] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const handleClose = () => {
    setBody(''); setPlace(''); setSelectedClientUuid(null);
    setRating(0); setSelectedTopicIds([]); setCustomHashtag(''); setImageEntries([]);
    setShowClientPicker(false); setClientSearch('');
    onClose();
  };

  const MAX_CUSTOM_HASHTAG_LEN = 15;
  const onCustomHashtagChange = (text) => {
    const withoutHash = text.replace(/^#+/, '').slice(0, MAX_CUSTOM_HASHTAG_LEN);
    setCustomHashtag(withoutHash);
  };

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    const list = await fetchClients();
    setClients(list);
    setClientsLoading(false);
  }, []);

  useEffect(() => {
    if (showClientPicker) loadClients();
  }, [showClientPicker, loadClients]);

  const filteredClients = (() => {
    if (!clientSearch.trim()) return clients;
    const term = clientSearch.trim().toLowerCase();
    return clients.filter((c) => (c.business_name || '').toLowerCase().includes(term));
  })();

  const toggleTopic = (id) => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to photos to add images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets?.length) {
      const added = result.assets.slice(0, 2 - imageEntries.length).map((a) => ({
        uri: a.uri, base64: a.base64, mimeType: a.mimeType || 'image/jpeg',
      })).filter((a) => a.base64);
      setImageEntries((prev) => [...prev, ...added].slice(0, 2));
    }
  };

  const removeImage = (i) => setImageEntries((prev) => prev.filter((_, idx) => idx !== i));

  const handlePost = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      const userId = await getCommunityUserId();
      const imageUrls = imageEntries.length > 0 ? await uploadCommunityImages(imageEntries) : [];
      const allTags = [...selectedTopicIds];
      const customTag = customHashtag.trim().replace(/^#+/, '').toLowerCase();
      if (customTag) allTags.push(customTag);
      const hashtagsValue = allTags.length > 0 ? allTags.join(',') : null;
      await createCommunityPost({
        user_a_uuid: userId,
        review_text: body.trim(),
        rating: rating > 0 ? rating : null,
        hashtags: hashtagsValue,
        imageUrls,
        badge: place.trim() || null,
        client_a_uuid: selectedClientUuid || null,
      });
      handleClose();
      onPosted?.();
    } catch (e) {
      console.error('[Community] create post failed:', e);
      Alert.alert('Could not post', e?.message || 'Something went wrong. Try again.');
    } finally {
      setPosting(false);
    }
  };

  const hasTopic = selectedTopicIds.length > 0 || customHashtag.trim().replace(/^#+/, '').length > 0;
  const canPost = body.trim().length > 0 && place.trim().length > 0 && hasTopic && rating > 0;

  const selectClient = (client) => {
    setPlace(client.business_name);
    setSelectedClientUuid(client.client_a_uuid);
    setShowClientPicker(false);
    setClientSearch('');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[s.createRoot, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.createHeader}>
          <TouchableOpacity onPress={handleClose} disabled={posting} activeOpacity={0.7}>
            <Text style={s.createCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.createTitle}>Add a Review</Text>
          <TouchableOpacity onPress={handlePost} disabled={!canPost || posting} activeOpacity={0.7} style={[s.postBtn, canPost && s.postBtnActive]}>
            {posting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={[s.postBtnText, canPost && s.postBtnTextActive]}>Post</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.createScroll, { paddingBottom: insets.bottom + 32, paddingTop: 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Photos: 0 = one Add button; 1 = left image + right Add; 2 = both images */}
          <Text style={s.sectionLabel}>Photos</Text>
          <View style={s.photoRow}>
            {imageEntries.length === 0 ? (
              <TouchableOpacity style={s.photoAddSingle} onPress={pickImage} activeOpacity={0.7}>
                <Ionicons name="camera-outline" size={32} color="#78716C" />
                <Text style={s.photoAddText}>Add photo</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={s.photoHalf}>
                  {imageEntries[0] ? (
                    <View style={s.photoThumb}>
                      <Image source={{ uri: imageEntries[0].uri }} style={s.photoThumbImg} resizeMode="cover" />
                      <TouchableOpacity style={s.photoRemove} onPress={() => removeImage(0)}>
                        <Ionicons name="close" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
                <View style={s.photoGap} />
                <View style={s.photoHalf}>
                  {imageEntries[1] ? (
                    <View style={s.photoThumb}>
                      <Image source={{ uri: imageEntries[1].uri }} style={s.photoThumbImg} resizeMode="cover" />
                      <TouchableOpacity style={s.photoRemove} onPress={() => removeImage(1)}>
                        <Ionicons name="close" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={s.photoAdd} onPress={pickImage} activeOpacity={0.7}>
                      <Ionicons name="camera-outline" size={26} color="#78716C" />
                      <Text style={s.photoAddText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
          <Text style={s.photoCountHint}>({imageEntries.length}/2)</Text>

          {/* 2. Your post */}
          <Text style={s.sectionLabel}>Your post</Text>
          <TextInput
            style={s.createTextInput}
            placeholder="What did you discover in Bahrain?"
            placeholderTextColor="#78716C"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={500}
          />
          <Text style={s.charCount}>{body.length}/500</Text>

          {/* 3. Rating */}
          <Text style={s.sectionLabel}>Rating</Text>
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <View key={n} style={s.starTouchWrap}>
                <TouchableOpacity
                  style={s.starHalf}
                  activeOpacity={0.8}
                  onPress={() => { const v = n - 0.5; setRating(rating === v ? 0 : v); }}
                />
                <TouchableOpacity
                  style={s.starHalf}
                  activeOpacity={0.8}
                  onPress={() => setRating(rating === n ? 0 : n)}
                />
                <View pointerEvents="none" style={s.starIconOverlay}>
                  <Ionicons
                    name={rating >= n ? 'star' : rating >= n - 0.5 ? 'star-half' : 'star-outline'}
                    size={30}
                    color="#B45309"
                  />
                </View>
              </View>
            ))}
            {rating > 0 && <Text style={s.starsLabel}>{rating % 1 === 0 ? `${rating}.0` : rating.toFixed(1)}</Text>}
          </View>

          {/* 4. Place or venue */}
          <Text style={s.sectionLabel}>Place or venue</Text>
          <View style={s.placeInputRow}>
            <Ionicons name="location-outline" size={18} color="#78716C" style={{ marginLeft: 14 }} />
            <TextInput
              style={s.placeInput}
              placeholder="e.g. Local cafe, Manama"
              placeholderTextColor="#78716C"
              value={place}
              onChangeText={(t) => { setPlace(t); setSelectedClientUuid(null); }}
            />
            <TouchableOpacity style={s.fromAppBtn} onPress={() => setShowClientPicker(true)} activeOpacity={0.8}>
              <Ionicons name="search" size={16} color="#C8102E" />
              <Text style={s.fromAppBtnText}>Browse</Text>
            </TouchableOpacity>
          </View>

          {/* 5. Select topic + custom hashtag */}
          <Text style={s.sectionLabel}>#Hashtags</Text>
          <View style={s.topicGrid}>
            {CREATE_POST_TOPICS.map((t) => {
              const on = selectedTopicIds.includes(t.id);
              return (
                <TouchableOpacity key={t.id} style={[s.topicChip, on && s.topicChipOn]} onPress={() => toggleTopic(t.id)} activeOpacity={0.8}>
                  <Text style={s.topicChipEmoji}>{CREATE_POST_TOPIC_EMOJIS[t.id] || ''}</Text>
                  <Text style={[s.topicChipLabel, on && s.topicChipLabelOn]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.customHashtagRow}>
            <Text style={s.customHashtagPrefix}>#</Text>
            <TextInput
              style={s.customHashtagInput}
              placeholder="Add your own (e.g. paratha)"
              placeholderTextColor="#9CA3AF"
              value={customHashtag}
              onChangeText={onCustomHashtagChange}
              maxLength={MAX_CUSTOM_HASHTAG_LEN}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {customHashtag.length > 0 && (
              <Text style={s.customHashtagCount}>{customHashtag.length}/{MAX_CUSTOM_HASHTAG_LEN}</Text>
            )}
          </View>
        </ScrollView>

        <Modal visible={showClientPicker} animationType="slide" transparent onRequestClose={() => setShowClientPicker(false)}>
          <View style={[s.pickerOverlay, { paddingTop: insets.top + 60 }]}>
            <View style={s.pickerCard}>
              <View style={s.pickerHeader}>
                <Text style={s.pickerTitle}>Choose a business</Text>
                <TouchableOpacity onPress={() => setShowClientPicker(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={C.text} />
                </TouchableOpacity>
              </View>
              <View style={s.pickerSearchWrap}>
                <Ionicons name="search" size={18} color={C.muted} />
                <TextInput
                  style={s.pickerSearchInput}
                  placeholder="Search..."
                  placeholderTextColor={C.muted}
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  autoCapitalize="none"
                />
              </View>
              {clientsLoading ? (
                <View style={s.pickerLoading}><ActivityIndicator size="small" color={C.red} /></View>
              ) : (
                <FlatList
                  data={filteredClients}
                  keyExtractor={(item) => item.client_a_uuid}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={s.pickerItem} onPress={() => selectClient(item)} activeOpacity={0.7}>
                      <View style={s.pickerItemIcon}><Ionicons name="storefront-outline" size={18} color={C.sub} /></View>
                      <Text style={s.pickerItemText} numberOfLines={1}>{item.business_name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={C.muted} />
                    </TouchableOpacity>
                  )}
                  style={{ maxHeight: 300 }}
                  ListEmptyComponent={<Text style={s.pickerEmpty}>No businesses found</Text>}
                />
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function CommunitiesScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTopic, setActiveTopic] = useState('all');
  const [selectedPost, setSelectedPost] = useState(null);
  const [focusReplyWhenOpen, setFocusReplyWhenOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAiFilterPanel, setShowAiFilterPanel] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [aiFilteredPosts, setAiFilteredPosts] = useState([]);
  const [aiSearching, setAiSearching] = useState(false);
  const [khalidFilterBanner, setKhalidFilterBanner] = useState(null);
  const askKhalidModalOpacity = useRef(new Animated.Value(0)).current;
  const askKhalidCardScale = useRef(new Animated.Value(0.9)).current;
  const lightningPulse = useRef(new Animated.Value(1)).current;
  const fabBottom = TAB_BAR_HEIGHT + 72 + (Platform.OS === 'android' ? insets.bottom : 0);

  const loadPosts = useCallback(async (opts = {}) => {
    if (activeTopic === 'ai') return;
    const { isRefresh = false } = opts;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const list = await fetchCommunityPosts(activeTopic);
      setPosts(list);
    } catch (e) {
      console.error('[Community] load posts failed:', e);
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTopic]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    if (activeTopic !== 'ai') setKhalidFilterBanner(null);
  }, [activeTopic]);

  const runAiSearch = useCallback(async () => {
    const term = aiSearchQuery.trim().slice(0, AI_SEARCH_MAX_LEN);
    if (!term) return;
    setAiSearching(true);
    try {
      const list = await searchCommunityWithOpenAI(term);
      setAiFilteredPosts(list);
      setActiveTopic('ai');
      setShowAiFilterPanel(false);
      setAiSearchQuery('');
    } catch (e) {
      console.error('[Community] AI search failed:', e);
      Alert.alert('Search failed', e?.message || 'Try again.');
      setAiFilteredPosts([]);
    } finally {
      setAiSearching(false);
    }
  }, [aiSearchQuery]);

  // Allow Khalid assistant to jump here and filter reviews for a specific place
  useEffect(() => {
    const fromKhalid = route.params?.fromKhalid;
    if (!fromKhalid || fromKhalid.type !== 'filter_reviews') return;
    const term = (fromKhalid.place || '').trim().slice(0, AI_SEARCH_MAX_LEN);
    if (!term) return;

    (async () => {
      setAiSearching(true);
      setKhalidFilterBanner(term);
      try {
        const list = await searchCommunityWithOpenAI(term);
        setAiFilteredPosts(list);
        setActiveTopic('ai');
      } catch (e) {
        console.error('[Community] AI search (from Khalid) failed:', e);
        Alert.alert('Search failed', e?.message || 'Try again.');
        setKhalidFilterBanner(null);
      } finally {
        setAiSearching(false);
        navigation.setParams({ fromKhalid: undefined });
      }
    })();
    const t = setTimeout(() => setKhalidFilterBanner(null), 6000);
    return () => clearTimeout(t);
  }, [route.params?.fromKhalid, navigation]);

  const openAiFilterPanel = useCallback(() => {
    setShowAiFilterPanel(true);
    askKhalidModalOpacity.setValue(0);
    askKhalidCardScale.setValue(0.9);
    Animated.parallel([
      Animated.timing(askKhalidModalOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(askKhalidCardScale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 120 }),
    ]).start();
  }, [askKhalidModalOpacity, askKhalidCardScale]);

  const closeAiFilterPanel = useCallback(() => {
    if (aiSearching) return;
    Animated.timing(askKhalidModalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowAiFilterPanel(false));
    askKhalidCardScale.setValue(0.9);
  }, [askKhalidModalOpacity, askKhalidCardScale, aiSearching]);

  useEffect(() => {
    if (!aiSearching) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(lightningPulse, { toValue: 1.4, duration: 400, useNativeDriver: true }),
        Animated.timing(lightningPulse, { toValue: 0.8, duration: 400, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [aiSearching, lightningPulse]);

  const displayPosts = activeTopic === 'ai' ? aiFilteredPosts : posts;
  const showAiTip = activeTopic === 'ai';

  const handleUpvote = useCallback(async (item) => {
    try {
      const newCount = await upvoteCommunityPost(item.id);
      const updater = (p) => (p.id === item.id ? { ...p, upvotes: newCount, upvoted: true } : p);
      setPosts((prev) => prev.map(updater));
      setAiFilteredPosts((prev) => prev.map(updater));
      if (selectedPost?.id === item.id) setSelectedPost((p) => (p?.id === item.id ? { ...p, upvotes: newCount, upvoted: true } : p));
    } catch (e) {
      console.warn('[Community] upvote failed:', e);
    }
  }, [selectedPost?.id]);

  const handleRemoveUpvote = useCallback(async (item) => {
    try {
      const newCount = await removeUpvoteCommunityPost(item.id);
      const updater = (p) => (p.id === item.id ? { ...p, upvotes: newCount, upvoted: false } : p);
      setPosts((prev) => prev.map(updater));
      setAiFilteredPosts((prev) => prev.map(updater));
      if (selectedPost?.id === item.id) setSelectedPost((p) => (p?.id === item.id ? { ...p, upvotes: newCount, upvoted: false } : p));
    } catch (e) {
      console.warn('[Community] remove upvote failed:', e);
    }
  }, [selectedPost?.id]);

  return (
    <ScreenContainer style={s.screen}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        {/* Header row */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Community</Text>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.aiFilterBtn} onPress={openAiFilterPanel} activeOpacity={0.75}>
              <Ionicons name="sparkles" size={14} color="#FFF" />
              <Text style={s.aiFilterText}>Ask Khalid</Text>
            </TouchableOpacity>
            <ProfileButton iconColor={C.text} />
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {TOPICS.map((t) => {
            const on = activeTopic === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[s.filterChip, on && s.filterChipOn]}
                onPress={() => setActiveTopic(t.id)}
                activeOpacity={0.75}
              >
                <Text style={[s.filterChipText, on && s.filterChipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Ask Khalid — full-screen blurred modal */}
      <Modal visible={showAiFilterPanel} transparent animationType="none" onRequestClose={closeAiFilterPanel}>
        <Animated.View style={[s.askKhalidOverlay, { opacity: askKhalidModalOpacity }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
          )}
          <TouchableWithoutFeedback onPress={closeAiFilterPanel}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <Animated.View style={[s.askKhalidCardWrap, { transform: [{ scale: askKhalidCardScale }] }]}>
            <View style={s.askKhalidCard}>
              <View style={s.askKhalidHeader}>
                <View style={s.askKhalidTitleRow}>
                  <Ionicons name="sparkles" size={24} color={C.red} />
                  <Text style={s.askKhalidTitle}>Ask Khalid</Text>
                </View>
                <Text style={s.askKhalidSub}>AI-powered suggestions from community reviews</Text>
              </View>
              {!aiSearching ? (
                <>
                  <TextInput
                    style={s.askKhalidInput}
                    placeholder="e.g. food, burger, breakfast..."
                    placeholderTextColor={C.muted}
                    value={aiSearchQuery}
                    onChangeText={(t) => setAiSearchQuery(t.slice(0, AI_SEARCH_MAX_LEN))}
                    maxLength={AI_SEARCH_MAX_LEN}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={s.askKhalidActions}>
                    <TouchableOpacity
                      style={[s.askKhalidSearchBtn, !aiSearchQuery.trim() && s.askKhalidSearchBtnDisabled]}
                      onPress={runAiSearch}
                      disabled={!aiSearchQuery.trim()}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="flash" size={18} color="#FFF" />
                      <Text style={s.askKhalidSearchBtnText}>Search</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={closeAiFilterPanel} style={s.askKhalidCloseBtn} hitSlop={12}>
                      <Text style={s.askKhalidCloseText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={s.askKhalidSearching}>
                  <Animated.View style={{ transform: [{ scale: lightningPulse }] }}>
                    <Ionicons name="flash" size={48} color="#FBBF24" />
                  </Animated.View>
                  <Text style={s.askKhalidSearchingTitle}>Khalid is searching...</Text>
                  <Text style={s.askKhalidSearchingSub}>Scanning through reviews for you</Text>
                </View>
              )}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {loading && activeTopic !== 'ai' && displayPosts.length === 0 ? (
        <View style={s.loadingWrap}><ActivityIndicator size="large" color={C.red} /></View>
      ) : (
        <FlatList
          data={displayPosts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            khalidFilterBanner ? (
              <View style={s.khalidFilterBanner}>
                <Ionicons name="sparkles" size={16} color={C.red} />
                <Text style={s.khalidFilterBannerText} numberOfLines={1}>
                  Reviews for: {khalidFilterBanner}
                </Text>
                <TouchableOpacity onPress={() => setKhalidFilterBanner(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={C.muted} />
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ReviewCard
                item={item}
                onPress={setSelectedPost}
                onCommentPress={(it) => { setSelectedPost(it); setFocusReplyWhenOpen(true); }}
                onUpvote={handleUpvote}
                onRemoveUpvote={handleRemoveUpvote}
                aiTip={showAiTip ? item.aiSuggestion : undefined}
              />
          )}
          contentContainerStyle={s.feed}
          showsVerticalScrollIndicator={false}
          refreshControl={activeTopic !== 'ai' ? <RefreshControl refreshing={refreshing} onRefresh={() => loadPosts({ isRefresh: true })} colors={[C.red]} /> : undefined}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}><Ionicons name="compass-outline" size={44} color={C.muted} /></View>
              <Text style={s.emptyTitle}>{activeTopic === 'ai' ? 'No matching reviews' : 'No reviews yet'}</Text>
              <Text style={s.emptySub}>{activeTopic === 'ai' ? 'Try a different search (e.g. food, burger)' : 'Be the first to share a hidden gem in Bahrain'}</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[s.fab, { bottom: fabBottom }]} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      <DetailModal
        post={selectedPost}
        onClose={() => { setSelectedPost(null); setFocusReplyWhenOpen(false); }}
        onUpvote={handleUpvote}
        onRemoveUpvote={handleRemoveUpvote}
        focusReplyWhenOpen={focusReplyWhenOpen}
        onClearFocusReply={() => setFocusReplyWhenOpen(false)}
      />
      <CreatePostModal visible={showCreate} onClose={() => setShowCreate(false)} onPosted={() => loadPosts({ isRefresh: true })} />
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: C.bg },
  topBar: {
    backgroundColor: C.bg,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  aiFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.red, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16,
  },
  aiFilterText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  filterScroll: { paddingHorizontal: 20, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: C.chip,
  },
  filterChipOn: {
    backgroundColor: C.red,
    ...Platform.select({
      ios: { shadowColor: C.red, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  filterChipText: { fontSize: 13, fontWeight: '600', color: C.sub },
  filterChipTextOn: { color: '#FFFFFF', fontWeight: '700' },
  filterChipDisabled: { opacity: 0.5 },
  filterChipTextDisabled: { color: C.muted },
  askKhalidOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  askKhalidCardWrap: { width: '100%', maxWidth: 340 },
  askKhalidCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24 },
      android: { elevation: 16 },
    }),
  },
  askKhalidHeader: { marginBottom: 20 },
  askKhalidTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  askKhalidTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  askKhalidSub: { fontSize: 14, color: C.muted, lineHeight: 20 },
  askKhalidInput: {
    height: 48,
    backgroundColor: C.chip,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: C.text,
    marginBottom: 16,
  },
  askKhalidActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  askKhalidSearchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.red,
    paddingVertical: 14,
    borderRadius: 14,
  },
  askKhalidSearchBtnDisabled: { opacity: 0.5 },
  askKhalidSearchBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  askKhalidCloseBtn: { paddingVertical: 14, paddingHorizontal: 16 },
  askKhalidCloseText: { fontSize: 16, fontWeight: '600', color: C.sub },
  askKhalidSearching: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  askKhalidSearchingTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 16, marginBottom: 4 },
  askKhalidSearchingSub: { fontSize: 14, color: C.muted },
  khalidFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: C.red,
    borderRadius: 12,
  },
  khalidFilterBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  feed: { paddingHorizontal: 16, paddingBottom: 110 },
  feedHeader: { paddingTop: 18, paddingBottom: 14 },
  feedHeaderTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 },
  feedHeaderSub: { fontSize: 14, color: C.muted, fontWeight: '500' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: {
    backgroundColor: C.card,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  cardInner: { flex: 1, paddingHorizontal: 0, paddingVertical: 0 },
  cardAuthorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  av: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.chip, marginRight: 10 },
  avPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.chip },
  avInitial: { fontSize: 15, fontWeight: '800', color: C.text },
  cardMeta: { flex: 1, minWidth: 0 },
  authorText: { fontSize: 14, fontWeight: '700', color: C.text },
  cardPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  cardPlaceText: { fontSize: 12, fontWeight: '600', color: C.red },
  cardRatingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  cardRatingNum: { fontSize: 12, fontWeight: '700', marginLeft: 2 },
  bodyText: { fontSize: 14, lineHeight: 21, color: C.text, marginBottom: 10 },
  cardKhalidDashedLine: {
    height: 1, marginVertical: 10, marginHorizontal: 0,
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 1,
  },
  cardKhalidTipWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FDE68A',
    marginHorizontal: 0, paddingHorizontal: 12, paddingVertical: 12,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
  },
  cardKhalidTipText: { fontSize: 12.5, color: '#92400E', lineHeight: 17, flex: 1, fontStyle: 'italic' },
  cardTopicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  cardTopicPill: { backgroundColor: C.chip, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  cardTopicPillText: { fontSize: 12, fontWeight: '600', color: C.sub },
  cardImgWrap: { overflow: 'hidden', backgroundColor: C.chip, position: 'relative', borderRadius: 12, marginBottom: 10 },
  cardImg: { width: '100%', height: '100%' },
  cardImgSplitRow: { flexDirection: 'row', width: '100%', height: '100%' },
  cardImgHalf: { flex: 1, height: '100%' },
  cardImgGap: { width: 2, backgroundColor: 'rgba(0,0,0,0.08)' },
  imgCountBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  imgCountText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  ratingOnImg: {
    position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  ratingOnImgNum: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 10, paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionNum: { fontSize: 13, fontWeight: '600', color: C.muted },
  fab: {
    position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29,
    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
      android: { elevation: 10 },
    }),
  },
  empty: { paddingVertical: 72, alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: C.chip,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub: { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22 },
  // Popup
  popOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  popCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 24,
  },
  popHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12, paddingTop: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  popHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  popHeaderAv: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.chip },
  popHeaderAvPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.red + '18' },
  popHeaderAvLetter: { fontSize: 14, fontWeight: '800', color: C.red },
  popHeaderName: { fontSize: 15, fontWeight: '700', color: C.text },
  popPlaceRatingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12,
  },
  popPlaceWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  popImgWrap: { position: 'relative', overflow: 'hidden' },
  popImgPills: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  popImgPill: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  popImgPillActive: { backgroundColor: '#FFF', width: 18, borderRadius: 3 },
  popImgBadge: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  popImgBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  popBody: { paddingHorizontal: 18, paddingTop: 16 },
  popRatingWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  popRatingNum: { fontSize: 13, fontWeight: '700', color: C.text },
  popPlaceText: { fontSize: 13, fontWeight: '600', color: C.red },
  popReviewText: {
    fontSize: 15, lineHeight: 24, color: C.text, marginTop: 14,
  },
  popUpvoteRow: { marginTop: 12 },
  popUpvoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  popUpvoteNum: { fontSize: 14, fontWeight: '600', color: C.muted },
  popReplySection: { marginTop: 14, paddingTop: 12, marginBottom: 14, borderTopWidth: 1, borderTopColor: C.border },
  popReplyTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  popReplyBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
  },
  popReplyAv: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: C.chip,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  popReplyInput: { flex: 1, fontSize: 13, color: C.text, paddingVertical: 0, minHeight: 20 },
  popReplyPlaceholder: { flex: 1, fontSize: 13, color: C.muted },
  // Create — warm color scheme
  createRoot: { flex: 1, backgroundColor: '#FAF8F5' },
  createHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8E4DF',
    backgroundColor: '#FFF',
  },
  createCancelText: { fontSize: 16, color: '#78716C', fontWeight: '600' },
  createTitle: { fontSize: 18, fontWeight: '800', color: '#1C1917' },
  postBtn: {
    paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20,
    backgroundColor: '#E7E5E4',
  },
  postBtnActive: { backgroundColor: '#C8102E' },
  postBtnText: { fontSize: 15, fontWeight: '700', color: '#A8A29E' },
  postBtnTextActive: { color: '#FFF' },
  createScroll: { paddingHorizontal: 20, paddingTop: 24 },
  createTextInput: {
    fontSize: 17, lineHeight: 26, color: '#1C1917',
    minHeight: 120, textAlignVertical: 'top', paddingTop: 0,
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E4DF', paddingHorizontal: 14, paddingVertical: 12,
  },
  charCount: { fontSize: 12, color: '#78716C', textAlign: 'right', marginTop: 4, marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#44403C', marginBottom: 10, marginTop: 4 },
  placeInputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E8E4DF', marginBottom: 20, overflow: 'hidden',
  },
  placeInput: { flex: 1, fontSize: 15, color: '#1C1917', paddingVertical: 12, paddingHorizontal: 10 },
  fromAppBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#FEF2F2',
    borderLeftWidth: 1, borderLeftColor: '#E8E4DF',
  },
  fromAppBtnText: { fontSize: 14, fontWeight: '700', color: '#C8102E' },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  starTouchWrap: { width: 34, height: 34, flexDirection: 'row', position: 'relative' },
  starHalf: { width: 17, height: 34 },
  starIconOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  starsLabel: { fontSize: 16, fontWeight: '700', color: '#B45309', marginLeft: 8 },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E8E4DF',
  },
  topicChipOn: { backgroundColor: '#FEF2F2', borderColor: '#C8102E' },
  topicChipEmoji: { fontSize: 15 },
  topicChipLabel: { fontSize: 13, fontWeight: '600', color: '#57534E' },
  topicChipLabelOn: { color: '#C8102E', fontWeight: '700' },
  customHashtagRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8E4DF',
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 20,
  },
  customHashtagPrefix: { fontSize: 15, fontWeight: '600', color: '#9CA3AF', marginRight: 4 },
  customHashtagInput: { flex: 1, fontSize: 15, color: '#1C1917', paddingVertical: 0, minWidth: 0 },
  customHashtagCount: { fontSize: 12, color: '#9CA3AF', marginLeft: 8 },
  photoRow: { flexDirection: 'row', marginBottom: 20, height: 120, alignItems: 'center' },
  photoAddSingle: {
    width: '100%', height: 120, borderRadius: 16,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#D6D3D1',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  photoHalf: { flex: 1 },
  photoGap: { width: 10 },
  photoThumb: {
    width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#E7E5E4', position: 'relative',
  },
  photoThumbImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: '100%', height: '100%', borderRadius: 16,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#D6D3D1',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  photoAddText: { fontSize: 12, fontWeight: '600', color: '#78716C' },
  photoCountHint: { fontSize: 12, color: '#78716C', marginTop: 4, marginBottom: 4 },
  // Picker
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20, justifyContent: 'flex-start',
  },
  pickerCard: {
    backgroundColor: C.card, borderRadius: 22, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  pickerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  pickerSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  pickerSearchInput: { flex: 1, fontSize: 15, color: C.text },
  pickerLoading: { padding: 32, alignItems: 'center' },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  pickerItemIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerItemText: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  pickerEmpty: { padding: 28, fontSize: 15, color: C.muted, textAlign: 'center' },
});
