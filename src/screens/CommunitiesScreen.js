// communities screen
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
  Easing,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { ScrollView as GHScrollView, FlatList as GHFlatList, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ScreenContainer from '../components/ScreenContainer';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  fetchCommunityPosts,
  fetchMyCommunityPosts,
  createCommunityPost,
  uploadCommunityImages,
  upvoteCommunityPost,
  removeUpvoteCommunityPost,
  getCommunityUserId,
  fetchClients,
  fetchClientByQrPayload,
} from '../services/community';
import { colors as themeColors } from '../theme/designTokens';
import { useTheme } from '../context/ThemeContext';

const C = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#111827',
  sub: '#6B7280',
  muted: '#9CA3AF',
  border: 'rgba(209,213,219,0.7)',
  red: themeColors.error,
  redSoft: themeColors.errorMuted,
  orange: themeColors.morning,
  orangeSoft: themeColors.warningMuted,
  blue: themeColors.afternoon,
  blueSoft: themeColors.primaryMuted,
  green: themeColors.success,
  upvoteLight: themeColors.success,
  upvoteDark: '#047857',
  chip: '#F1F5F9',
  chipActive: themeColors.textPrimary,
  accent: themeColors.textSecondary,
  warmGlow: themeColors.textMuted,
};

// Muted accent palette for review strips (modern, not rainbow)
const REVIEW_ACCENT_COLORS = [
  themeColors.primary,
  themeColors.morning,
  themeColors.afternoon,
  themeColors.evening,
  themeColors.success,
  themeColors.textSecondary,
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

const CREATE_POST_TOPIC_ICONS = {
  food: 'restaurant-outline',
  places: 'location-outline',
  events: 'calendar-outline',
  beaches: 'water-outline',
  culture: 'library-outline',
  nightlife: 'moon-outline',
  family: 'people-outline',
  tips: 'bulb-outline',
};

const TOTAL_STARS = 5;

/** Smooth shimmer skeleton loader for community feed. */
function CommunityLoadingShimmer() {
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;
  const imgH = Math.round(cardWidth * 0.6);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 0.75, 0.35],
  });

  const SkeletonBox = ({ style, width: w, height: h }) => (
    <Animated.View style={[s.skeletonBox, style, { width: w || '100%', height: h || 14, opacity }]} />
  );

  return (
    <ScrollView
      style={s.loaderScroll}
      contentContainerStyle={s.loaderContent}
      showsVerticalScrollIndicator={false}
    >
      {[1, 2, 3].map((i) => (
        <View key={i} style={s.skeletonCard}>
          <View style={s.cardAuthorRow}>
            <SkeletonBox style={s.skeletonAvatar} width={38} height={38} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <SkeletonBox width="60%" height={14} />
              <SkeletonBox width="40%" height={11} style={{ marginTop: 8 }} />
            </View>
          </View>
          <SkeletonBox width="100%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonBox width="90%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonBox width="70%" height={14} style={{ marginBottom: 12 }} />
          <View style={[s.cardImgWrap, { height: imgH }]}>
            <Animated.View style={[StyleSheet.absoluteFill, s.skeletonImage, { opacity }]} />
          </View>
          <View style={[s.actions, { marginTop: 12 }]}>
            <SkeletonBox width={60} height={20} />
            <SkeletonBox width={50} height={20} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

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

function ReviewCard({ item, onPress, onCommentPress, onUpvote, onRemoveUpvote }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;
  const imgH = Math.round(cardWidth * 0.6);
  const [upvoted, setUpvoted] = useState(item.upvoted);
  const [imageIndex, setImageIndex] = useState(0);
  const scale = useRef(new Animated.Value(1)).current;
  const count = item.upvotes ?? 0;

  const images = item.images?.length > 0 ? item.images : item.image ? [item.image] : [];

  useEffect(() => {
    setImageIndex(0);
  }, [item.id]);

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

  const clientProfilePic = item.client_image || null;
  const hasClientProfilePic = !!clientProfilePic;

  const body = (
    <GHTouchableOpacity activeOpacity={0.94} onPress={() => onPress?.(item)} style={s.card}>
      <View style={s.cardInner}>
        {/* Client row — place name + rating, with client profile pic */}
        <View style={s.cardClientRow}>
          {hasClientProfilePic ? (
            <Image source={{ uri: clientProfilePic }} style={s.clientAv} resizeMode="cover" />
          ) : (
            <View style={[s.clientAv, s.clientAvPlaceholder]}>
              <Ionicons name="storefront-outline" size={22} color={C.red} />
            </View>
          )}
          <View style={s.cardClientMeta}>
            <Text style={s.clientPlaceText} numberOfLines={1}>{item.place || 'A place in Bahrain'}</Text>
            {item.rating != null && item.rating > 0 && (
              <View style={s.cardRatingPill}>
                <RatingStars rating={item.rating} size={11} color={C.sub} />
                <Text style={s.cardRatingNum}>{Number(item.rating).toFixed(1)}</Text>
              </View>
            )}
            <Text style={s.cardAuthorSub} numberOfLines={1}>by {item.author}</Text>
          </View>
        </View>

        {/* Review photos — slider when 2+ (gesture-handler for nested scroll) */}
        {images.length > 0 && (
          <View style={[s.cardImgWrap, { height: imgH, width: cardWidth }]}>
            {images.length === 1 ? (
              <Image source={{ uri: images[0] }} style={s.cardImg} resizeMode="contain" />
            ) : (
              <>
                <GHScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
                    setImageIndex(i);
                  }}
                  onScrollEndDrag={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
                    setImageIndex(i);
                  }}
                  style={{ width: cardWidth, height: imgH }}
                  contentContainerStyle={{ width: cardWidth * images.length }}
                >
                  {images.map((uri, i) => (
                    <View key={i} style={{ width: cardWidth, height: imgH }}>
                      <Image source={{ uri }} style={{ width: cardWidth, height: imgH }} resizeMode="contain" />
                    </View>
                  ))}
                </GHScrollView>
                <View style={s.cardImgPills}>
                  {images.map((_, i) => (
                    <View key={i} style={[s.cardImgPill, i === imageIndex && s.cardImgPillActive]} />
                  ))}
                </View>
                {images.length > 2 && (
                  <View style={s.imgCountBadge}>
                    <Text style={s.imgCountText}>+{images.length - 1}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Review body — main emphasis */}
        <Text style={s.bodyText} numberOfLines={4}>{item.body}</Text>

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
    </GHTouchableOpacity>
  );

  return body;
}

function DetailModal({ post, onClose, onUpvote, onRemoveUpvote, focusReplyWhenOpen = false, onClearFocusReply }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cardMargin = 24;
  const cardW = width - cardMargin * 2;
  const imgW = cardW;
  const imgH = Math.round(imgW * 0.6);
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
              {post.client_image ? (
                <Image source={{ uri: post.client_image }} style={s.popHeaderAv} resizeMode="cover" />
              ) : (
                <View style={[s.popHeaderAv, s.popHeaderAvPlaceholder]}>
                  <Ionicons name="storefront-outline" size={18} color={C.red} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.popHeaderName} numberOfLines={1}>{post.place || 'A place in Bahrain'}</Text>
                <Text style={s.popHeaderSub} numberOfLines={1}>by {post.author}</Text>
              </View>
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
                    <Image key={i} source={{ uri }} style={{ width: imgW, height: imgH }} resizeMode="contain" />
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
                    <RatingStars rating={post.rating} size={13} color={C.sub} />
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

const SCAN_BOX_SIZE = 240;

function QRScannerModal({ visible, onClose, onScanned }) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanned = useRef(null);
  const insets = useSafeAreaInsets();

  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (!data || typeof data !== 'string') return;
      const raw = data.trim();
      if (!raw) return;
      const now = Date.now();
      if (lastScanned.current && now - lastScanned.current < 2500) return;
      lastScanned.current = now;
      const client = await fetchClientByQrPayload(raw);
      if (client) {
        onScanned?.(client);
        onClose?.();
      } else {
        Alert.alert('Unknown code', 'This QR code is not linked to a venue in Go Bahrain.');
      }
    },
    [onScanned, onClose]
  );

  if (!visible) return null;
  if (!permission) {
    return (
      <Modal visible transparent>
        <View style={s.scannerPlaceholder}><ActivityIndicator size="large" color={C.red} /></View>
      </Modal>
    );
  }
  if (!permission.granted) {
    return (
      <Modal visible transparent animationType="slide">
        <View style={[s.scannerPlaceholder, { paddingTop: insets.top + 40 }]}>
          <Text style={s.scannerPermissionText}>Camera access is needed to scan venue QR codes.</Text>
          <TouchableOpacity style={s.scannerPermissionBtn} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={s.scannerPermissionBtnText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.scannerCloseBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={s.scannerCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        {/* Dark overlay with transparent center box (viewfinder) */}
        <View style={s.scannerOverlay} pointerEvents="none">
          <View style={[s.scannerMask, { paddingTop: insets.top }]}>
            <View style={s.scannerMaskRow} />
            <View style={s.scannerMaskCenter}>
              <View style={s.scannerMaskSide} />
              <View style={[s.scannerBox, { width: SCAN_BOX_SIZE, height: SCAN_BOX_SIZE }]}>
                <View style={[s.scannerBoxCorner, s.scannerBoxCornerTL]} />
                <View style={[s.scannerBoxCorner, s.scannerBoxCornerTR]} />
                <View style={[s.scannerBoxCorner, s.scannerBoxCornerBL]} />
                <View style={[s.scannerBoxCorner, s.scannerBoxCornerBR]} />
              </View>
              <View style={s.scannerMaskSide} />
            </View>
            <View style={s.scannerMaskRow} />
          </View>
        </View>
        <View style={[s.scannerHeader, { paddingTop: insets.top + 12, paddingBottom: 16 }]} pointerEvents="box-none">
          <TouchableOpacity style={s.scannerCloseBtn} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.scannerHint}>Position the venue's QR code inside the box</Text>
          <View style={{ width: 28 }} />
        </View>
      </View>
    </Modal>
  );
}

function CreatePostModal({ visible, onClose, onPosted, initialPlace, initialClientUuid }) {
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

  useEffect(() => {
    if (visible && (initialPlace != null || initialClientUuid != null)) {
      if (initialPlace != null) setPlace(initialPlace);
      if (initialClientUuid != null) setSelectedClientUuid(initialClientUuid);
    }
  }, [visible, initialPlace, initialClientUuid]);

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
          <TouchableOpacity onPress={handleClose} disabled={posting} style={s.createHeaderBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={s.createHeaderCenter}>
            <Text style={s.createTitle}>Add a Review</Text>
            <Text style={s.createSubtitle}>Share your experience in Bahrain</Text>
          </View>
          <TouchableOpacity onPress={handlePost} disabled={!canPost || posting} activeOpacity={0.8} style={[s.postBtn, canPost && s.postBtnActive]}>
            {posting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={[s.postBtnText, canPost && s.postBtnTextActive]}>Post</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.createScroll, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Place or venue */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <Ionicons name="location" size={20} color={C.red} />
              <Text style={s.createCardTitle}>Where did you go?</Text>
            </View>
            <View style={s.placeInputRow}>
              <TextInput
                style={s.placeInput}
                placeholder="Restaurant, cafe, or venue name"
                placeholderTextColor={C.muted}
                value={place}
                onChangeText={(t) => { setPlace(t); setSelectedClientUuid(null); }}
              />
              <TouchableOpacity style={s.fromAppBtn} onPress={() => setShowClientPicker(true)} activeOpacity={0.8}>
                <Ionicons name="search" size={18} color={C.red} />
                <Text style={s.fromAppBtnText}>Browse</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. Rating */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <Ionicons name="star" size={20} color="#B45309" />
              <Text style={s.createCardTitle}>How was it?</Text>
            </View>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <View key={n} style={s.starTouchWrap}>
                  <TouchableOpacity style={s.starHalf} activeOpacity={0.8} onPress={() => { const v = n - 0.5; setRating(rating === v ? 0 : v); }} />
                  <TouchableOpacity style={s.starHalf} activeOpacity={0.8} onPress={() => setRating(rating === n ? 0 : n)} />
                  <View pointerEvents="none" style={s.starIconOverlay}>
                    <Ionicons name={rating >= n ? 'star' : rating >= n - 0.5 ? 'star-half' : 'star-outline'} size={36} color="#B45309" />
                  </View>
                </View>
              ))}
              {rating > 0 && <Text style={s.starsLabel}>{rating % 1 === 0 ? `${rating}.0` : rating.toFixed(1)}</Text>}
            </View>
          </View>

          {/* 3. Your post */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <Ionicons name="chatbubble-ellipses" size={20} color={C.red} />
              <Text style={s.createCardTitle}>Your review</Text>
            </View>
            <TextInput
              style={s.createTextInput}
              placeholder="What did you discover? Share tips, highlights, or must-trys..."
              placeholderTextColor={C.muted}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={500}
            />
            <View style={s.charCountRow}><Text style={s.charCount}>{body.length}/500</Text></View>
          </View>

          {/* 4. Photos */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <Ionicons name="images" size={20} color={C.red} />
              <Text style={s.createCardTitle}>Photos</Text>
              <Text style={s.photoCountBadge}>{imageEntries.length}/2</Text>
            </View>
            <View style={s.photoRow}>
              {imageEntries.length === 0 ? (
                <TouchableOpacity style={s.photoAddSingle} onPress={pickImage} activeOpacity={0.7}>
                  <View style={s.photoAddIconWrap}>
                    <Ionicons name="add" size={28} color={C.red} />
                  </View>
                  <Text style={s.photoAddText}>Add up to 2 photos</Text>
                  <Text style={s.photoAddHint}>Tap to choose from library</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={s.photoHalf}>
                    {imageEntries[0] ? (
                      <View style={s.photoThumb}>
                        <Image source={{ uri: imageEntries[0].uri }} style={s.photoThumbImg} resizeMode="cover" />
                        <TouchableOpacity style={s.photoRemove} onPress={() => removeImage(0)}>
                          <Ionicons name="close" size={18} color="#FFF" />
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
                          <Ionicons name="close" size={18} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={s.photoAdd} onPress={pickImage} activeOpacity={0.7}>
                        <Ionicons name="add" size={24} color={C.red} />
                        <Text style={s.photoAddText}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          </View>

          {/* 5. Hashtags */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <Ionicons name="pricetags" size={20} color={C.red} />
              <Text style={s.createCardTitle}>Tags</Text>
            </View>
            <Text style={s.createCardDesc}>Help others find your review</Text>
            <View style={s.topicGrid}>
              {CREATE_POST_TOPICS.map((t) => {
                const on = selectedTopicIds.includes(t.id);
                return (
                  <TouchableOpacity key={t.id} style={[s.topicChip, on && s.topicChipOn]} onPress={() => toggleTopic(t.id)} activeOpacity={0.8}>
                    <Ionicons name={CREATE_POST_TOPIC_ICONS[t.id] || 'pricetag-outline'} size={18} color={on ? C.red : C.sub} />
                    <Text style={[s.topicChipLabel, on && s.topicChipLabelOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.customHashtagRow}>
              <Text style={s.customHashtagPrefix}>#</Text>
              <TextInput
                style={s.customHashtagInput}
                placeholder="Add your own tag"
                placeholderTextColor={C.muted}
                value={customHashtag}
                onChangeText={onCustomHashtagChange}
                maxLength={MAX_CUSTOM_HASHTAG_LEN}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {customHashtag.length > 0 && <Text style={s.customHashtagCount}>{customHashtag.length}/{MAX_CUSTOM_HASHTAG_LEN}</Text>}
            </View>
          </View>

          {!canPost && (body.length > 0 || place.length > 0 || selectedTopicIds.length > 0) && (
            <Text style={s.createHint}>Fill in place, rating, review text, and at least one tag to post.</Text>
          )}
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

const MAIN_TABS = [
  { id: 'public', label: 'Public Reviews', icon: 'globe-outline' },
  { id: 'my', label: 'My Reviews', icon: 'person-outline' },
];

// FAB menu: Post on top, Scan on left — each with distinct look
const FAB_MENU_OPTIONS = [
  { id: 'post', label: 'Post', icon: 'create-outline', position: 'top', variant: 'post' },
  { id: 'scan', label: 'Scan', icon: 'scan-outline', position: 'left', variant: 'scan' },
];

function FabButton({ expanded, onPress }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
  }, [expanded]);
  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Animated.View style={[s.fab, { transform: [{ rotate }] }]}>
        <Ionicons name="add" size={28} color="#FFF" />
      </Animated.View>
    </TouchableOpacity>
  );
}

function FabOptionIconWriting({ icon, expanded }) {
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!expanded) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotate, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [expanded]);
  const rotateDeg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
      <Ionicons name={icon} size={22} color="#FFF" />
    </Animated.View>
  );
}

function FabOptionIconScanning({ icon, expanded }) {
  const scanLine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!expanded) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [expanded]);
  const translateY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 28] });
  return (
    <View style={s.fabOptionIconWrap}>
      <Ionicons name={icon} size={22} color="#FFF" />
      {expanded && (
        <Animated.View style={[s.fabOptionScanLine, { transform: [{ translateY }] }]} pointerEvents="none">
          <View style={s.fabOptionScanLineInner} />
        </Animated.View>
      )}
    </View>
  );
}

function RevolverFabOverlay({ expanded, onClose }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 180 : 120,
      useNativeDriver: true,
    }).start();
  }, [expanded]);
  return (
    <Animated.View style={[s.fabOverlay, s.fabOverlayDim, { opacity }]} pointerEvents={expanded ? 'auto' : 'none'}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

function RevolverFabOptions({ expanded, onOptionPress, children }) {
  const optionAnims = useRef(FAB_MENU_OPTIONS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (expanded) {
      optionAnims.forEach((a) => a.setValue(0));
      FAB_MENU_OPTIONS.forEach((_, i) => {
        Animated.timing(optionAnims[i], {
          toValue: 1,
          duration: 260,
          delay: 50 + i * 65,
          easing: Easing.out(Easing.back(1.35)),
          useNativeDriver: true,
        }).start();
      });
    } else {
      optionAnims.forEach((a) => {
        Animated.timing(a, { toValue: 0, duration: 100, useNativeDriver: true }).start();
      });
    }
  }, [expanded]);

  const topOpt = FAB_MENU_OPTIONS.find((o) => o.position === 'top');
  const leftOpt = FAB_MENU_OPTIONS.find((o) => o.position === 'left');

  const OptionBtn = ({ opt, index, style }) => {
    const scale = optionAnims[index].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
    const translateY = optionAnims[index].interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
    const isPost = opt.variant === 'post';
    const btnStyle = isPost ? s.fabOptionBtnPost : s.fabOptionBtnScan;
    const textStyle = isPost ? s.fabOptionTextPost : s.fabOptionTextScan;
    return (
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[s.fabOptionAbsolute, style, { opacity: optionAnims[index], transform: [{ scale }, { translateY }] }]}
      >
        <TouchableOpacity style={[s.fabRadialOptionBtn, btnStyle]} onPress={() => onOptionPress(opt.id)} activeOpacity={0.85}>
          {isPost ? (
            <FabOptionIconWriting icon={opt.icon} expanded={expanded} />
          ) : (
            <FabOptionIconScanning icon={opt.icon} expanded={expanded} />
          )}
          <Text style={[s.fabRadialOptionText, textStyle]}>{opt.label}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={s.fabMenuLayout}>
      {topOpt && <OptionBtn opt={topOpt} index={FAB_MENU_OPTIONS.indexOf(topOpt)} style={s.fabOptionTop} />}
      {leftOpt && <OptionBtn opt={leftOpt} index={FAB_MENU_OPTIONS.indexOf(leftOpt)} style={s.fabOptionLeft} />}
      {children}
    </View>
  );
}

export default function CommunitiesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mainTab, setMainTab] = useState('public');
  const [activeTopic, setActiveTopic] = useState('all');
  const [selectedPost, setSelectedPost] = useState(null);
  const [focusReplyWhenOpen, setFocusReplyWhenOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanInitialPlace, setScanInitialPlace] = useState(null);
  const [scanInitialClientUuid, setScanInitialClientUuid] = useState(null);
  const [fabExpanded, setFabExpanded] = useState(false);
  const fabBottom = TAB_BAR_HEIGHT + 72 + (Platform.OS === 'android' ? insets.bottom : 0);

  const loadPosts = useCallback(async (opts = {}) => {
    const { isRefresh = false } = opts;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setPosts([]);
      setLoading(true);
    }
    try {
      if (mainTab === 'my') {
        const userId = await getCommunityUserId();
        const list = await fetchMyCommunityPosts(userId);
        // Ensure only current user's posts (filter by user_a_uuid)
        const myOnly = (list || []).filter((p) => p.user_a_uuid === userId);
        setPosts(myOnly);
      } else {
        const list = await fetchCommunityPosts(activeTopic);
        setPosts(list);
      }
    } catch (e) {
      console.error('[Community] load posts failed:', e);
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mainTab, activeTopic]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleUpvote = useCallback(async (item) => {
    try {
      const newCount = await upvoteCommunityPost(item.id);
      const updater = (p) => (p.id === item.id ? { ...p, upvotes: newCount, upvoted: true } : p);
      setPosts((prev) => prev.map(updater));
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
      if (selectedPost?.id === item.id) setSelectedPost((p) => (p?.id === item.id ? { ...p, upvotes: newCount, upvoted: false } : p));
    } catch (e) {
      console.warn('[Community] remove upvote failed:', e);
    }
  }, [selectedPost?.id]);

  return (
    <ScreenContainer style={s.screen}>
      <View style={[s.topBar, { paddingTop: insets.top + 4 }]}>
        {/* Header row */}
        <View style={s.header}>
          <View style={s.headerSpacer} />
          <Text style={s.headerTitle}>Community</Text>
          <View style={s.headerSpacer} />
        </View>

        {/* Main tabs: Public Reviews | My Reviews */}
        <View style={s.mainTabsWrap}>
          <View style={s.mainTabsRow}>
            {MAIN_TABS.map((tab) => {
              const on = mainTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[s.mainTab, on && s.mainTabOn]}
                  onPress={() => setMainTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={tab.icon} size={18} color={on ? C.red : C.sub} />
                  <Text style={[s.mainTabText, on && s.mainTabTextOn]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.mainTabsIndicatorWrap}>
            <View style={[s.mainTabsIndicator, { left: mainTab === 'public' ? 0 : '50%' }]} />
          </View>
        </View>

        {/* Topic filter tabs — only when Public */}
        {mainTab === 'public' && (
          <View style={s.filterTabsWrap}>
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
        )}
      </View>

      {/* Ask Khalid — full-screen blurred modal */}
      {/* Removed Ask Khalid modal */}

      {loading && posts.length === 0 ? (
        <CommunityLoadingShimmer />
      ) : (
        <GHFlatList
          data={posts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            null
          }
          renderItem={({ item }) => (
            <ReviewCard
                item={item}
                onPress={setSelectedPost}
                onCommentPress={(it) => { setSelectedPost(it); setFocusReplyWhenOpen(true); }}
                onUpvote={handleUpvote}
                onRemoveUpvote={handleRemoveUpvote}
              />
          )}
          contentContainerStyle={s.feed}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPosts({ isRefresh: true })} colors={[C.red]} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons
                  name={mainTab === 'my' ? 'document-text-outline' : 'compass-outline'}
                  size={44}
                  color={C.muted}
                />
              </View>
              <Text style={s.emptyTitle}>
                {mainTab === 'my' ? 'No reviews from you yet' : 'No reviews yet'}
              </Text>
              <Text style={s.emptySub}>
                {mainTab === 'my'
                  ? 'Tap + to post your first review and share your favorite spots'
                  : 'Be the first to share a hidden gem in Bahrain'}
              </Text>
            </View>
          }
        />
      )}

      <RevolverFabOverlay expanded={fabExpanded} onClose={() => setFabExpanded(false)} />
      <View style={[s.fabContainer, { bottom: fabBottom }]} pointerEvents="box-none">
        <RevolverFabOptions
          expanded={fabExpanded}
          onOptionPress={(id) => {
            setFabExpanded(false);
            if (id === 'post') setShowCreate(true);
            if (id === 'scan') setShowScanner(true);
          }}
        >
          <FabButton expanded={fabExpanded} onPress={() => setFabExpanded((v) => !v)} />
        </RevolverFabOptions>
      </View>

      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanned={(client) => {
          setScanInitialPlace(client.business_name);
          setScanInitialClientUuid(client.client_a_uuid);
          setShowCreate(true);
        }}
      />
      <DetailModal
        post={selectedPost}
        onClose={() => { setSelectedPost(null); setFocusReplyWhenOpen(false); }}
        onUpvote={handleUpvote}
        onRemoveUpvote={handleRemoveUpvote}
        focusReplyWhenOpen={focusReplyWhenOpen}
        onClearFocusReply={() => setFocusReplyWhenOpen(false)}
      />
      <CreatePostModal
        visible={showCreate}
        onClose={() => { setShowCreate(false); setScanInitialPlace(null); setScanInitialClientUuid(null); }}
        onPosted={() => loadPosts({ isRefresh: true })}
        initialPlace={scanInitialPlace}
        initialClientUuid={scanInitialClientUuid}
      />
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: C.bg },
  topBar: {
    backgroundColor: C.bg,
    paddingBottom: 6,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingBottom: 6,
  },
  headerSpacer: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  mainTabsWrap: {
    marginHorizontal: 20,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  mainTabsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  mainTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  mainTabOn: {},
  mainTabText: { fontSize: 14, fontWeight: '600', color: C.sub },
  mainTabTextOn: { color: C.text, fontWeight: '700' },
  mainTabsIndicatorWrap: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 3,
    alignItems: 'center',
  },
  mainTabsIndicator: {
    position: 'absolute',
    bottom: 0,
    width: '50%',
    height: 3,
    backgroundColor: C.red,
    borderRadius: 2,
  },
  filterTabsWrap: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 6,
  },
  filterScroll: { paddingHorizontal: 20, paddingVertical: 4, gap: 4, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: 'transparent',
  },
  filterChipOn: {
    backgroundColor: C.redSoft,
  },
  filterChipText: { fontSize: 13, fontWeight: '600', color: C.sub },
  filterChipTextOn: { color: C.red, fontWeight: '700' },
  filterChipDisabled: { opacity: 0.5 },
  filterChipTextDisabled: { color: C.muted },
  feed: { paddingHorizontal: 16, paddingBottom: 110 },
  feedHeader: { paddingTop: 18, paddingBottom: 14 },
  feedHeaderTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 },
  feedHeaderSub: { fontSize: 14, color: C.muted, fontWeight: '500' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loaderScroll: { flex: 1 },
  loaderContent: { paddingHorizontal: 16, paddingBottom: 40 },
  skeletonCard: {
    backgroundColor: C.card,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  skeletonBox: {
    backgroundColor: C.chip,
    borderRadius: 8,
  },
  skeletonAvatar: { borderRadius: 19 },
  skeletonImage: {
    backgroundColor: C.chip,
    borderRadius: 12,
  },
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
  // Client-focused card layout
  cardClientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  clientAv: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.chip, marginRight: 12, overflow: 'hidden' },
  clientAvPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.red + '18' },
  cardClientMeta: { flex: 1, minWidth: 0 },
  clientPlaceText: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 },
  cardAuthorSub: { fontSize: 12, color: C.sub, fontWeight: '500', marginTop: 2 },
  cardRatingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  cardRatingNum: { fontSize: 12, fontWeight: '600', marginLeft: 2, color: C.sub },
  bodyText: { fontSize: 14, lineHeight: 21, color: C.text, marginBottom: 10 },
  cardTopicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  cardTopicPill: { backgroundColor: C.chip, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  cardTopicPillText: { fontSize: 12, fontWeight: '600', color: C.sub },
  cardImgWrap: { overflow: 'hidden', backgroundColor: C.chip, position: 'relative', borderRadius: 12, marginBottom: 12 },
  cardImg: { width: '100%', height: '100%' },
  cardImgSplitRow: { flexDirection: 'row', width: '100%', height: '100%' },
  cardImgHalf: { flex: 1, height: '100%' },
  cardImgGap: { width: 2, backgroundColor: 'rgba(0,0,0,0.08)' },
  cardImgPills: {
    position: 'absolute', bottom: 8, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  cardImgPill: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  cardImgPillActive: { backgroundColor: '#FFF', width: 18, borderRadius: 3 },
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
  fabOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0,
  },
  fabOverlayDim: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  fabContainer: {
    position: 'absolute', right: 20, width: 200, height: 170, alignItems: 'flex-end', justifyContent: 'flex-end', zIndex: 1, overflow: 'visible',
  },
  fabMenuLayout: {
    position: 'relative',
    width: '100%',
    height: '100%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  fabOptionAbsolute: {
    position: 'absolute',
  },
  fabOptionTop: {
    bottom: 76,
    right: 0,
  },
  fabOptionLeft: {
    bottom: 0,
    right: 76,
  },
  fabRadialOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 56,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  fabOptionBtnPost: {
    backgroundColor: C.red,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    ...Platform.select({
      ios: { shadowColor: C.red },
      android: {},
    }),
  },
  fabOptionBtnScan: {
    backgroundColor: C.green,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    ...Platform.select({
      ios: { shadowColor: C.green },
      android: {},
    }),
  },
  fabRadialOptionText: { fontSize: 15, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  fabOptionTextPost: {},
  fabOptionTextScan: {},
  fabOptionIconWrap: { position: 'relative', overflow: 'hidden', width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  fabOptionScanLine: {
    position: 'absolute',
    top: -2,
    left: -4,
    right: -4,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOptionScanLineInner: {
    width: 30,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
  },
  fab: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
      android: { elevation: 10 },
    }),
  },
  scannerPlaceholder: {
    flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  scannerPermissionText: { fontSize: 16, color: C.text, textAlign: 'center', marginBottom: 24 },
  scannerPermissionBtn: {
    backgroundColor: C.red, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, marginBottom: 12,
  },
  scannerPermissionBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  scannerCloseBtn: { padding: 12 },
  scannerCloseText: { fontSize: 16, fontWeight: '600', color: C.sub },
  scannerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flex: 1,
  },
  scannerMask: { flex: 1, flexDirection: 'column' },
  scannerMaskRow: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scannerMaskCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  scannerMaskSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignSelf: 'stretch' },
  scannerBox: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', position: 'relative',
  },
  scannerBoxCorner: {
    position: 'absolute', width: 24, height: 24, borderColor: '#FFF',
  },
  scannerBoxCornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  scannerBoxCornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  scannerBoxCornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  scannerBoxCornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  scannerHeader: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8,
  },
  scannerHint: { fontSize: 14, color: 'rgba(255,255,255,0.95)', fontWeight: '600', flex: 1, textAlign: 'center' },
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
  popHeaderAv: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.chip, overflow: 'hidden' },
  popHeaderAvPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.red + '18' },
  popHeaderAvLetter: { fontSize: 14, fontWeight: '800', color: C.red },
  popHeaderName: { fontSize: 15, fontWeight: '700', color: C.text },
  popHeaderSub: { fontSize: 12, color: C.sub, fontWeight: '500', marginTop: 1 },
  popPlaceRatingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12,
  },
  popPlaceWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  popImgWrap: { position: 'relative', overflow: 'hidden', backgroundColor: C.chip },
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
  popRatingNum: { fontSize: 13, fontWeight: '600', color: C.sub },
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
  createRoot: { flex: 1, backgroundColor: '#F5F5F4' },
  createHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 14,
    backgroundColor: '#FFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  createHeaderBtn: { padding: 8, marginLeft: -8 },
  createHeaderCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 },
  createTitle: { fontSize: 18, fontWeight: '800', color: '#1C1917', letterSpacing: -0.3 },
  createSubtitle: { fontSize: 12, color: '#78716C', marginTop: 2, fontWeight: '500' },
  postBtn: {
    paddingVertical: 10, paddingHorizontal: 22, borderRadius: 22,
    backgroundColor: '#E7E5E4', minWidth: 72, alignItems: 'center',
  },
  postBtnActive: { backgroundColor: C.red },
  postBtnText: { fontSize: 15, fontWeight: '700', color: '#A8A29E' },
  postBtnTextActive: { color: '#FFF' },
  createScroll: { paddingHorizontal: 16, paddingTop: 20 },
  createCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  createCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  createCardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1917', flex: 1 },
  createCardDesc: { fontSize: 13, color: '#78716C', marginBottom: 12, lineHeight: 18 },
  createTextInput: {
    fontSize: 16, lineHeight: 24, color: '#1C1917',
    minHeight: 100, textAlignVertical: 'top', paddingTop: 14, paddingBottom: 14,
    backgroundColor: '#FAFAF9', borderRadius: 12, borderWidth: 1, borderColor: '#E7E5E4',
    paddingHorizontal: 14,
  },
  charCountRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  charCount: { fontSize: 12, color: '#78716C' },
  createHint: { fontSize: 13, color: '#78716C', textAlign: 'center', marginBottom: 24, paddingHorizontal: 16, lineHeight: 18 },
  placeInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FAFAF9', borderRadius: 12, borderWidth: 1, borderColor: '#E7E5E4', overflow: 'hidden',
  },
  placeInput: { flex: 1, fontSize: 16, color: '#1C1917', paddingVertical: 14, paddingHorizontal: 14 },
  fromAppBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#FEF2F2', borderLeftWidth: 1, borderLeftColor: '#E7E5E4',
  },
  fromAppBtnText: { fontSize: 14, fontWeight: '700', color: C.red },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  starTouchWrap: { width: 40, height: 40, flexDirection: 'row', position: 'relative' },
  starHalf: { width: 20, height: 40 },
  starIconOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  starsLabel: { fontSize: 17, fontWeight: '800', color: '#B45309', marginLeft: 10 },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: '#FAFAF9', borderWidth: 1.5, borderColor: '#E7E5E4',
  },
  topicChipOn: { backgroundColor: '#FEF2F2', borderColor: C.red },
  topicChipLabel: { fontSize: 13, fontWeight: '600', color: '#57534E' },
  topicChipLabelOn: { color: C.red, fontWeight: '700' },
  customHashtagRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FAFAF9', borderRadius: 12, borderWidth: 1.5, borderColor: '#E7E5E4',
    paddingVertical: 12, paddingHorizontal: 14,
  },
  customHashtagPrefix: { fontSize: 15, fontWeight: '600', color: C.muted, marginRight: 4 },
  customHashtagInput: { flex: 1, fontSize: 15, color: '#1C1917', paddingVertical: 0, minWidth: 0 },
  customHashtagCount: { fontSize: 12, color: C.muted, marginLeft: 8 },
  photoRow: { flexDirection: 'row', height: 128, alignItems: 'stretch' },
  photoAddSingle: {
    width: '100%', height: 128, borderRadius: 14,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#D6D3D1',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FAFAF9',
  },
  photoAddIconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center',
  },
  photoAddText: { fontSize: 14, fontWeight: '600', color: '#57534E' },
  photoAddHint: { fontSize: 12, color: '#78716C' },
  photoCountBadge: { fontSize: 12, fontWeight: '700', color: C.muted, marginLeft: 'auto' },
  photoHalf: { flex: 1 },
  photoGap: { width: 12 },
  photoThumb: {
    width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#E7E5E4', position: 'relative',
  },
  photoThumbImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: '100%', height: '100%', borderRadius: 14,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#D6D3D1',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: '#FAFAF9',
  },
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
