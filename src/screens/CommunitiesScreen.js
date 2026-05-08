// communities screen
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { FlatList as GHFlatList } from 'react-native-gesture-handler';

const AnimatedGHFlatList = Animated.createAnimatedComponent(GHFlatList)
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import ScreenContainer from '../components/ScreenContainer';
import PageHeadingBar from '../components/PageHeadingBar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  fetchCommunityPostsPage,
  COMMUNITY_FEED_PAGE_SIZE,
  createCommunityPost,
  uploadCommunityImages,
  getCommunityUserId,
  fetchClients,
  fetchClientByQrPayload,
} from '../services/community';
import { UpvoteParticles } from '../components/FeedUpvoteInteractions';
import { useCommunityUpvoteToggle } from '../hooks/useCommunityUpvoteToggle';
import { colors as themeColors, colorsDark as themeColorsDark } from '../theme/designTokens'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { layoutContentWidth } from '../constants/webLayout'
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_MEDIUM,
  FONT_POPPINS_REGULAR,
  FONT_POPPINS_SEMIBOLD,
} from '../constants/brandFont'
import {
  getCommunityPalette,
  buildCommunityFeedStyles,
  CommunityReviewCard,
} from '../components/community/CommunityReviewViews'
const DEFAULT_PROFILE_IMAGE = require('../../assets/pfp.png')

// Community page top filter: All, Trending + hashtags (no AI chip — AI results show temporarily until another filter is tapped)
const TOPICS = [
  { id: 'all', label: 'All' },
  { id: 'trending', label: 'Trending' },
  { id: 'food', label: 'Food' },
  { id: 'places', label: 'Places' },
  { id: 'events', label: 'Events' },
  { id: 'beaches', label: 'Beaches' },
  { id: 'culture', label: 'Culture' },
  { id: 'family', label: 'Family' },
  { id: 'tips', label: 'Tips' },
];
const PRIMARY_TOPICS = TOPICS.slice(0, 2)
const SECONDARY_TOPICS = TOPICS.slice(2)

// Create post — Select topic: only these 8, multiple select
const CREATE_POST_TOPICS = [
  { id: 'food', label: 'Food' },
  { id: 'places', label: 'Places' },
  { id: 'events', label: 'Events' },
  { id: 'beaches', label: 'Beaches' },
  { id: 'culture', label: 'Culture' },
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

// Top feed filters: feed chips use icons only; labels kept for accessibility
const TOPIC_FILTER_ICONS = {
  all: 'apps-outline',
  trending: 'flame-outline',
  ...CREATE_POST_TOPIC_ICONS,
};

/** Smooth shimmer skeleton loader for community feed. */
function CommunityLoadingShimmer({ scrollable = true }) {
  const { isDark } = useTheme()
  const palette = useMemo(() => getCommunityPalette(isDark), [isDark])
  const s = useMemo(() => buildCommunitiesScreenStyles(palette, isDark), [palette, isDark])
  const { width: winW = 375 } = useWindowDimensions();
  const layoutW = layoutContentWidth(winW);
  const cardWidth = layoutW - 64;
  const imgH = Math.round(cardWidth * 0.75);
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

  const skeletonCards = (
    <>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            s.skeletonGlassOuter,
            isDark && { borderColor: 'rgba(148,148,158,0.28)' },
          ]}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 30 : 18}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View
            style={s.skeletonGlassFrost}
            pointerEvents="none"
          />
          <View style={s.skeletonGlassInner}>
            {/* User row */}
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <SkeletonBox style={s.skeletonAvatar} width={36} height={36} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <SkeletonBox width="42%" height={13} />
                  <SkeletonBox width="55%" height={11} style={{ marginTop: 5 }} />
                </View>
              </View>
            </View>
            {/* Body lines */}
            <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
              <SkeletonBox width="100%" height={13} style={{ marginBottom: 5 }} />
              <SkeletonBox width="78%" height={13} style={{ marginBottom: 10 }} />
              {/* Image */}
              <View style={{ height: imgH, width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
                <Animated.View style={[StyleSheet.absoluteFill, s.skeletonImage, { opacity }]} />
              </View>
              {/* Tags */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                <SkeletonBox width={54} height={20} style={{ borderRadius: 8 }} />
                <SkeletonBox width={46} height={20} style={{ borderRadius: 8 }} />
              </View>
              {/* Action row */}
              <View style={{
                flexDirection: 'row',
                gap: 14,
                paddingTop: 8,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: palette.border + '60',
              }}>
                <SkeletonBox width={52} height={16} />
                <SkeletonBox width={42} height={16} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </>
  )

  if (!scrollable) {
    return (
      <View style={[s.loaderScroll, s.loaderContent]}>
        {skeletonCards}
      </View>
    )
  }

  return (
    <ScrollView
      style={s.loaderScroll}
      contentContainerStyle={s.loaderContent}
      showsVerticalScrollIndicator={false}
    >
      {skeletonCards}
    </ScrollView>
  );
}

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;

/** Match HomeScreen feed header behavior */
const SCROLL_THRESHOLD = 80
const SCROLL_DIRECTION_THRESHOLD = 5
const HEADER_ANIM_DURATION = 300
/** Prefetch next page when user has scrolled this far (same idea as HomeScreen). */
const COMMUNITY_PREFETCH_SCROLL_PROGRESS = 0.75

const SCAN_BOX_SIZE = 240;

function QRScannerModal({ visible, onClose, onScanned }) {
  const { isDark } = useTheme()
  const palette = useMemo(() => getCommunityPalette(isDark), [isDark])
  const s = useMemo(() => buildCommunitiesScreenStyles(palette, isDark), [palette, isDark])
  const C = palette
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
        Alert.alert('Unknown code', 'This QR code is not linked to a venue in SiyahaBH.');
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
  const { isDark } = useTheme();
  const C = useMemo(() => getCommunityPalette(isDark), [isDark])
  const s = useMemo(() => buildCommunitiesScreenStyles(C, isDark), [C, isDark])
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

  const ratingPhrase = useMemo(() => {
    const r = rating
    if (r <= 0) return ''
    if (r <= 1) return 'Needs improvement'
    if (r <= 2) return 'Could be better'
    if (r <= 3) return 'It was fine'
    if (r <= 4) return 'Really enjoyed it'
    return 'Absolutely loved it'
  }, [rating])

  const progressSteps = useMemo(
    () => [
      { ok: place.trim().length > 0 },
      { ok: rating > 0 },
      { ok: body.trim().length > 0 },
      { ok: hasTopic },
    ],
    [place, rating, body, hasTopic],
  )
  const progressCount = progressSteps.filter((x) => x.ok).length

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
        <View style={s.createGlassShell}>
          <BlurView intensity={Platform.OS === 'ios' ? 38 : 24} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
          <View style={s.createGlassFrost} pointerEvents="none" />
          <View style={s.createGlassInner}>
        <View style={s.createHeader}>
          <TouchableOpacity
            onPress={handleClose}
            disabled={posting}
            style={s.createHeaderBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={21} color={C.text} />
          </TouchableOpacity>
          <View style={s.createHeaderCenter}>
            <Text style={s.createTitle}>New review</Text>
            <Text style={s.createSubtitle}>
              {canPost ? 'Ready to post' : `${progressCount}/4 complete`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost || posting}
            activeOpacity={0.8}
            style={[s.postBtn, canPost && s.postBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={canPost ? 'Publish review' : 'Complete all sections to post'}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            {posting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={[s.postBtnText, canPost && s.postBtnTextActive]}>Post</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.createScroll, { paddingBottom: insets.bottom + 22 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.createProgressRow} accessibilityLabel={`Form progress: ${progressCount} of 4 sections complete`}>
            {progressSteps.map((step, i) => (
              <View
                key={`p-${i}`}
                style={[s.createProgressChunk, step.ok && s.createProgressChunkOn]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ))}
          </View>

          {/* 1. Place or venue */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <View style={s.createIconPill}>
                <Ionicons name="location" size={15} color={C.red} />
              </View>
              <Text style={s.createCardTitle}>Where did you go?</Text>
            </View>
            <Text style={s.createFieldHint}>Type a name or pick a place from the app for a link to the venue.</Text>
            <View style={s.placeInputRow}>
              <TextInput
                style={s.placeInput}
                placeholder="Restaurant, cafe, or venue name"
                placeholderTextColor={C.muted}
                value={place}
                onChangeText={(t) => { setPlace(t); setSelectedClientUuid(null); }}
              />
              <TouchableOpacity
                style={s.fromAppBtn}
                onPress={() => setShowClientPicker(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Browse venues from the app"
              >
                <Ionicons name="search" size={16} color={C.red} />
                <Text style={s.fromAppBtnText}>Browse</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. Rating */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <View style={[s.createIconPill, s.createIconPillAmber]}>
                <Ionicons name="star" size={15} color="#B45309" />
              </View>
              <Text style={s.createCardTitle}>How was it?</Text>
            </View>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <View key={n} style={s.starTouchWrap}>
                  <TouchableOpacity
                    style={s.starHalf}
                    activeOpacity={0.8}
                    accessibilityLabel={`${n - 0.5} stars`}
                    onPress={() => {
                      const v = n - 0.5
                      setRating(rating === v ? 0 : v)
                    }}
                  />
                  <TouchableOpacity
                    style={s.starHalf}
                    activeOpacity={0.8}
                    accessibilityLabel={`${n} stars`}
                    onPress={() => setRating(rating === n ? 0 : n)}
                  />
                  <View pointerEvents="none" style={s.starIconOverlay}>
                    <Ionicons name={rating >= n ? 'star' : rating >= n - 0.5 ? 'star-half' : 'star-outline'} size={28} color="#B45309" />
                  </View>
                </View>
              ))}
              {rating > 0 && (
                <View style={s.starsMeta}>
                  <Text style={s.starsLabel}>{rating % 1 === 0 ? `${rating}.0` : rating.toFixed(1)}</Text>
                  <Text style={s.starsVerbal}>{ratingPhrase}</Text>
                </View>
              )}
            </View>
          </View>

          {/* 3. Your post */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <View style={s.createIconPill}>
                <Ionicons name="chatbubble-ellipses" size={15} color={C.red} />
              </View>
              <Text style={s.createCardTitle}>Your review</Text>
            </View>
            <TextInput
              style={s.createTextInput}
              placeholder="What stood out? Tips, must-tries, or who you would bring along…"
              placeholderTextColor={C.muted}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <View style={s.charCountRow}>
              <Text style={[s.charCount, body.length >= 450 && s.charCountWarn]}>{body.length}/500</Text>
            </View>
          </View>

          {/* 4. Photos */}
          <View style={s.createCard}>
            <View style={s.createCardHeader}>
              <View style={s.createIconPill}>
                <Ionicons name="images" size={15} color={C.red} />
              </View>
              <Text style={s.createCardTitle}>Photos</Text>
              <Text style={s.photoCountBadge}>{imageEntries.length}/2</Text>
            </View>
            <Text style={s.createFieldHint}>Optional · up to 2 images help others picture the visit.</Text>
            <View style={s.photoRow}>
              {imageEntries.length === 0 ? (
                <TouchableOpacity style={s.photoAddSingle} onPress={pickImage} activeOpacity={0.7}>
                  <View style={s.photoAddIconWrap}>
                    <Ionicons name="add" size={22} color={C.red} />
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
                        <Ionicons name="add" size={20} color={C.red} />
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
              <View style={s.createIconPill}>
                <Ionicons name="pricetags" size={15} color={C.red} />
              </View>
              <Text style={s.createCardTitle}>Tags</Text>
            </View>
            <Text style={s.createCardDesc}>Pick one or more topics, or add your own — helps others discover your post.</Text>
            <View style={s.topicGrid}>
              {CREATE_POST_TOPICS.map((t) => {
                const on = selectedTopicIds.includes(t.id);
                return (
                  <TouchableOpacity key={t.id} style={[s.topicChip, on && s.topicChipOn]} onPress={() => toggleTopic(t.id)} activeOpacity={0.8}>
                    <Ionicons name={CREATE_POST_TOPIC_ICONS[t.id] || 'pricetag-outline'} size={15} color={on ? C.red : C.sub} />
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

          {!canPost && (body.length > 0 || place.length > 0 || selectedTopicIds.length > 0 || rating > 0) && (
            <View style={s.createChecklist}>
              {[
                { ok: place.trim().length > 0, text: 'Venue or place' },
                { ok: rating > 0, text: 'Star rating' },
                { ok: body.trim().length > 0, text: 'Review text' },
                { ok: hasTopic, text: 'At least one tag' },
              ].map((row) => (
                <View key={row.text} style={s.createChecklistRow}>
                  <Ionicons name={row.ok ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={row.ok ? C.green : C.muted} />
                  <Text style={[s.createChecklistText, row.ok && s.createChecklistTextDone]}>{row.text}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
          </View>
        </View>

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

// FAB menu: Post on top, Scan on left — each with distinct look
const FAB_MENU_OPTIONS = [
  { id: 'post', label: 'Post', icon: 'create-outline', position: 'top', variant: 'post' },
  { id: 'scan', label: 'Scan', icon: 'scan-outline', position: 'left', variant: 'scan' },
];

function FabButton({ expanded, onPress, commStyles: st }) {
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
      <Animated.View style={[st.fab, { transform: [{ rotate }] }]}>
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

function FabOptionIconScanning({ icon, expanded, commStyles: st }) {
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
    <View style={st.fabOptionIconWrap}>
      <Ionicons name={icon} size={22} color="#FFF" />
      {expanded && (
        <Animated.View style={[st.fabOptionScanLine, { transform: [{ translateY }] }]} pointerEvents="none">
          <View style={st.fabOptionScanLineInner} />
        </Animated.View>
      )}
    </View>
  );
}

function RevolverFabOverlay({ expanded, onClose, commStyles: st }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 180 : 120,
      useNativeDriver: true,
    }).start();
  }, [expanded]);
  return (
    <Animated.View style={[st.fabOverlay, st.fabOverlayDim, { opacity }]} pointerEvents={expanded ? 'auto' : 'none'}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

function RevolverFabOptions({ expanded, onOptionPress, children, commStyles: st }) {
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
    const btnStyle = isPost ? st.fabOptionBtnPost : st.fabOptionBtnScan;
    const textStyle = isPost ? st.fabOptionTextPost : st.fabOptionTextScan;
    return (
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[st.fabOptionAbsolute, style, { opacity: optionAnims[index], transform: [{ scale }, { translateY }] }]}
      >
        <TouchableOpacity style={[st.fabRadialOptionBtn, btnStyle]} onPress={() => onOptionPress(opt.id)} activeOpacity={0.85}>
          {isPost ? (
            <FabOptionIconWriting icon={opt.icon} expanded={expanded} />
          ) : (
            <FabOptionIconScanning icon={opt.icon} expanded={expanded} commStyles={st} />
          )}
          <Text style={[st.fabRadialOptionText, textStyle]}>{opt.label}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={st.fabMenuLayout}>
      {topOpt && <OptionBtn opt={topOpt} index={FAB_MENU_OPTIONS.indexOf(topOpt)} style={st.fabOptionTop} />}
      {leftOpt && <OptionBtn opt={leftOpt} index={FAB_MENU_OPTIONS.indexOf(leftOpt)} style={st.fabOptionLeft} />}
      {children}
    </View>
  );
}

const COMMUNITY_CARD_STAGGER_MS = 36;
const COMMUNITY_CARD_STAGGER_CAP = 12;

/** Staggered fade + slide-up when a row mounts or shows a new post (FlatList recycle). */
const CommunityFeedCardWrapper = ({ itemId, index, children }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(14);
    const delay = Math.min(index, COMMUNITY_CARD_STAGGER_CAP) * COMMUNITY_CARD_STAGGER_MS;
    const parallel = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 340,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        damping: 19,
        stiffness: 210,
      }),
    ]);
    parallel.start();
    return () => parallel.stop();
  }, [itemId, index, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};

export default function CommunitiesScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const { isDark, colors } = useTheme()
  const { session } = useAuth()
  const { preferences } = useUserPreferences()
  const palette = useMemo(() => getCommunityPalette(isDark), [isDark])
  const s = useMemo(() => buildCommunitiesScreenStyles(palette, isDark), [palette, isDark])
  const feedStyles = useMemo(() => buildCommunityFeedStyles(palette, isDark), [palette, isDark])
  const insets = useSafeAreaInsets()
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [activeTopic, setActiveTopic] = useState('all');
  const [activeClientFilter, setActiveClientFilter] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanInitialPlace, setScanInitialPlace] = useState(null);
  const [scanInitialClientUuid, setScanInitialClientUuid] = useState(null);
  const [fabExpanded, setFabExpanded] = useState(false);
  const fabBottom = TAB_BAR_HEIGHT + 72 + (Platform.OS === 'android' ? insets.bottom : 0);

  const scrollY = useRef(new Animated.Value(0)).current
  const lastScrollY = useRef(0)
  const headerTranslateY = useRef(new Animated.Value(0)).current
  const headerVisibleRef = useRef(true)
  const appendInFlightRef = useRef(false)
  const nextCursorRef = useRef(null)
  const activeTopicRef = useRef(activeTopic)
  const pagingRef = useRef({
    hasMore: true,
    loadingMore: false,
    loading: true,
    refreshing: false,
    loadMore: () => {},
  })
  const [headerBarHeight, setHeaderBarHeight] = useState(() => insets.top + 130)

  useEffect(() => {
    activeTopicRef.current = activeTopic
  }, [activeTopic])

  useEffect(() => {
    nextCursorRef.current = nextCursor
  }, [nextCursor])

  useEffect(() => {
    const clientFilter = route.params?.clientFilter
    if (clientFilter?.clientId) {
      setActiveClientFilter({ clientId: clientFilter.clientId, businessName: clientFilter.businessName || null })
      setActiveTopic('all')
    }
  }, [route.params?.clientFilter])

  const handleHeaderBarLayout = useCallback((event) => {
    const h = event.nativeEvent.layout.height
    if (h <= 0) return
    setHeaderBarHeight((prev) => (Math.abs(prev - h) < 2 ? prev : h))
  }, [])

  const handleScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: true,
          listener: (e) => {
            const y = e.nativeEvent.contentOffset.y
            const diff = y - lastScrollY.current
            lastScrollY.current = y

            const { contentSize, layoutMeasurement } = e.nativeEvent
            const contentH = contentSize?.height ?? 0
            const viewH = layoutMeasurement?.height ?? 0
            if (contentH > 1 && viewH > 1) {
              const maxScrollY = contentH - viewH
              const paging = pagingRef.current
              const canLoad = paging.hasMore && !paging.loadingMore && !paging.loading && !paging.refreshing
              if (canLoad) {
                if (maxScrollY <= 8) {
                  paging.loadMore()
                } else {
                  const progress = y / maxScrollY
                  if (progress >= COMMUNITY_PREFETCH_SCROLL_PROGRESS) {
                    paging.loadMore()
                  }
                }
              }
            }

            if (diff > SCROLL_DIRECTION_THRESHOLD && y > SCROLL_THRESHOLD && headerVisibleRef.current) {
              headerVisibleRef.current = false
              Animated.timing(headerTranslateY, {
                toValue: -headerBarHeight,
                duration: HEADER_ANIM_DURATION,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start()
            } else if (diff < -SCROLL_DIRECTION_THRESHOLD && !headerVisibleRef.current) {
              headerVisibleRef.current = true
              Animated.timing(headerTranslateY, {
                toValue: 0,
                duration: HEADER_ANIM_DURATION,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start()
            }
          },
        }
      ),
    [scrollY, headerTranslateY, headerBarHeight]
  )

  const fetchCommunityPage = useCallback(async (opts = {}) => {
    const { append = false, isRefresh = false } = opts
    if (append && appendInFlightRef.current) return
    if (append) appendInFlightRef.current = true

    const topicSnapshot = activeTopic
    const clientIdSnapshot = activeClientFilter?.clientId ?? null
    const cursor = append && !isRefresh ? nextCursorRef.current : null

    try {
      if (isRefresh) {
        setRefreshing(true)
      } else if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setPosts([])
      }

      const result = await fetchCommunityPostsPage({
        topicId: topicSnapshot,
        limit: COMMUNITY_FEED_PAGE_SIZE,
        cursor,
        clientId: clientIdSnapshot,
        preferences,
      })

      if (topicSnapshot !== activeTopicRef.current) return

      if (append) {
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          const merged = [...prev]
          for (const p of result.posts) {
            if (!seen.has(p.id)) {
              seen.add(p.id)
              merged.push(p)
            }
          }
          return merged
        })
      } else {
        setPosts(result.posts)
      }
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (e) {
      console.error('[Community] load posts failed:', e)
      if (!append && !isRefresh) {
        setPosts([])
        setHasMore(false)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
      if (append) appendInFlightRef.current = false
    }
  }, [activeTopic, activeClientFilter, preferences])

  useEffect(() => {
    setNextCursor(null)
    setHasMore(true)
    nextCursorRef.current = null
    fetchCommunityPage({ append: false, isRefresh: false })
  }, [activeTopic, activeClientFilter, fetchCommunityPage])

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading || refreshing || appendInFlightRef.current) return
    fetchCommunityPage({ append: true })
  }, [loadingMore, hasMore, loading, refreshing, fetchCommunityPage])

  const handleRefresh = useCallback(() => {
    fetchCommunityPage({ append: false, isRefresh: true })
  }, [fetchCommunityPage])

  useEffect(() => {
    lastScrollY.current = 0
    headerVisibleRef.current = true
    headerTranslateY.setValue(0)
  }, [activeTopic, activeClientFilter])

  const handleClearClientFilter = useCallback(() => {
    setActiveClientFilter(null)
  }, [])

  const handleOpenProfile = useCallback(() => {
    navigation.navigate('Profile', { screen: 'ProfileMain' })
  }, [navigation])

  const communityHeadingRightSlot = useMemo(() => {
    if (!session?.user) return undefined
    return (
      <TouchableOpacity
        style={[s.communityProfileHeaderBtn, { backgroundColor: palette.bg, borderColor: palette.border }]}
        activeOpacity={0.7}
        onPress={handleOpenProfile}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Image source={DEFAULT_PROFILE_IMAGE} style={s.communityProfileHeaderImage} resizeMode="cover" />
      </TouchableOpacity>
    )
  }, [
    session?.user,
    s,
    palette.bg,
    palette.border,
    handleOpenProfile,
  ])

  const {
    handleUpvoteToggle,
    getUpvoteScaleAnim,
    particlesVisible,
    particlePosition,
  } = useCommunityUpvoteToggle();

  const syncCommunityPost = useCallback((updated) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }, []);

  const onCommunityUpvoteToggle = useCallback(
    (item, e) => {
      handleUpvoteToggle(item, e, syncCommunityPost);
    },
    [handleUpvoteToggle, syncCommunityPost],
  );

  const handleOpenPost = useCallback((post) => {
    navigation.navigate('CommunityPostDetail', { post });
  }, [navigation]);

  const handleOpenPostComments = useCallback((post) => {
    navigation.navigate('CommunityPostDetail', { post, focusComposer: true });
  }, [navigation]);

  const handleTaggedClientPress = useCallback(({ clientId, businessName }) => {
    if (!clientId) return
    setActiveClientFilter({ clientId, businessName: businessName || null })
    setActiveTopic('all')
  }, [])

  pagingRef.current = {
    hasMore,
    loadingMore,
    loading,
    refreshing,
    loadMore: handleLoadMore,
  }

  return (
    <ScreenContainer style={s.screen}>
      <View style={s.communityFeedRoot}>
        <Animated.View
          pointerEvents="box-none"
          style={[
            s.communityHeaderBar,
            { backgroundColor: palette.bg, transform: [{ translateY: headerTranslateY }] },
          ]}
          onLayout={handleHeaderBarLayout}
        >
          <PageHeadingBar
            title="Community"
            backgroundColor={palette.bg}
            rightSlot={communityHeadingRightSlot}
          />
          <View style={s.communityFilterOuter}>
            <View style={s.filterPrimaryRow}>
              {PRIMARY_TOPICS.map((t) => {
                const on = activeTopic === t.id;
                const iconName = TOPIC_FILTER_ICONS[t.id] || 'ellipse-outline';
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.filterPrimaryChip, on && s.filterPrimaryChipOn]}
                    onPress={() => setActiveTopic(t.id)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t.label}
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons
                      name={iconName}
                      size={17}
                      color={on ? '#FFF' : palette.sub}
                    />
                    <Text style={[s.filterPrimaryChipLabel, on && s.filterPrimaryChipLabelOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.filterTabsWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
                {SECONDARY_TOPICS.map((t) => {
                  const on = activeTopic === t.id;
                  const iconName = TOPIC_FILTER_ICONS[t.id] || 'ellipse-outline';
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[s.filterChip, on && s.filterChipOn]}
                      onPress={() => setActiveTopic(t.id)}
                      activeOpacity={0.82}
                      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                      accessibilityRole="button"
                      accessibilityLabel={t.label}
                      accessibilityState={{ selected: on }}
                    >
                      <Ionicons
                        name={iconName}
                        size={16}
                        color={on ? '#FFF' : palette.sub}
                      />
                      <Text style={[s.filterChipLabel, on && s.filterChipLabelOn]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            {activeClientFilter ? (
              <View style={s.clientFilterBanner}>
                <Ionicons name="storefront-outline" size={14} color={palette.accent || palette.red} style={{ marginRight: 6 }} />
                <Text style={[s.clientFilterBannerText, { color: palette.text }]} numberOfLines={1}>
                  {activeClientFilter.businessName || 'Selected venue'}
                </Text>
                <TouchableOpacity
                  onPress={handleClearClientFilter}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear venue filter"
                  style={s.clientFilterClearBtn}
                >
                  <Ionicons name="close-circle" size={16} color={palette.sub} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </Animated.View>

        <AnimatedGHFlatList
          style={s.feedArea}
          data={loading && posts.length === 0 ? [] : posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <CommunityFeedCardWrapper itemId={item.id} index={index}>
              <CommunityReviewCard
                item={item}
                C={palette}
                styles={feedStyles}
                onPress={handleOpenPost}
                onTaggedClientPress={handleTaggedClientPress}
                onCommentPress={handleOpenPostComments}
                onUpvoteToggle={onCommunityUpvoteToggle}
                upvoteScaleAnim={getUpvoteScaleAnim(item.id)}
              />
            </CommunityFeedCardWrapper>
          )}
          contentContainerStyle={[
            feedStyles.feed,
            { paddingTop: headerBarHeight },
            posts.length === 0 && { flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              {...(Platform.OS === 'android' ? { progressViewOffset: headerBarHeight } : {})}
              colors={[palette.red]}
            />
          }
          ListFooterComponent={
            loadingMore && hasMore ? (
              <View style={{ paddingBottom: 24 }}>
                <CommunityLoadingShimmer scrollable={false} />
              </View>
            ) : !hasMore && posts.length > 0 ? (
              <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: FONT_POPPINS_REGULAR, color: palette.sub }}>End of feed</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading && posts.length === 0 ? (
              <CommunityLoadingShimmer scrollable={false} />
            ) : (
              <View style={feedStyles.empty}>
                <View style={feedStyles.emptyIcon}>
                  <Ionicons name="people" size={48} color={palette.red} />
                </View>
                <Text style={feedStyles.emptyTitle}>No reviews yet</Text>
                <Text style={feedStyles.emptySub}>Be the first to share your experience and help build our community</Text>
              </View>
            )
          }
        />
      </View>

      <RevolverFabOverlay expanded={fabExpanded} onClose={() => setFabExpanded(false)} commStyles={s} />
      <View style={[s.fabContainer, { bottom: fabBottom }]} pointerEvents="box-none">
        <RevolverFabOptions
          expanded={fabExpanded}
          commStyles={s}
          onOptionPress={(id) => {
            setFabExpanded(false);
            if (id === 'post') setShowCreate(true);
            if (id === 'scan') setShowScanner(true);
          }}
        >
          <FabButton expanded={fabExpanded} onPress={() => setFabExpanded((v) => !v)} commStyles={s} />
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
      <CreatePostModal
        visible={showCreate}
        onClose={() => { setShowCreate(false); setScanInitialPlace(null); setScanInitialClientUuid(null); }}
        onPosted={handleRefresh}
        initialPlace={scanInitialPlace}
        initialClientUuid={scanInitialClientUuid}
      />
      <UpvoteParticles
        visible={particlesVisible}
        position={particlePosition}
        accentColor={palette.green}
      />
    </ScreenContainer>
  );
}

function buildCommunitiesScreenStyles(C, isDark = false) {
  return StyleSheet.create({
  screen: { backgroundColor: C.bg },
  communityFeedRoot: {
    flex: 1,
    minHeight: 0,
  },
  communityHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    ...Platform.select({
      android: { elevation: 8 },
      default: {},
    }),
  },
  communityProfileHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.35 : 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  communityProfileHeaderImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  communityFilterOuter: {
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  feedArea: {
    flex: 1,
    minHeight: 0,
  },
  filterTabsWrap: {
    paddingBottom: 4,
    overflow: 'hidden',
  },
  filterPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 8,
  },
  filterPrimaryChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  filterPrimaryChipOn: {
    backgroundColor: C.red,
    borderColor: C.red,
  },
  filterPrimaryChipLabel: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    color: C.sub,
  },
  filterPrimaryChipLabelOn: {
    color: '#FFF',
    fontFamily: FONT_POPPINS_BOLD,
  },
  filterScroll: {
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 6,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.35 : 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  filterChipOn: {
    backgroundColor: C.red,
    borderColor: C.red,
    ...Platform.select({
      ios: { shadowColor: C.red, shadowOpacity: 0.35 },
      android: { elevation: 4 },
    }),
  },
  filterChipLabel: {
    fontSize: 12,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    color: C.sub,
  },
  filterChipLabelOn: {
    color: '#FFF',
    fontFamily: FONT_POPPINS_BOLD,
  },
  clientFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginBottom: 6,
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.card || C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  clientFilterBannerText: {
    fontSize: 13,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    flex: 1,
    flexShrink: 1,
  },
  clientFilterClearBtn: {
    marginLeft: 6,
  },
  feed: { paddingHorizontal: 16, paddingBottom: 110 },
  feedHeader: { paddingTop: 18, paddingBottom: 14 },
  feedHeaderTitle: { fontSize: 18, fontFamily: FONT_POPPINS_BOLD, color: C.text, marginBottom: 4 },
  feedHeaderSub: { fontSize: 14, color: C.muted, fontFamily: FONT_POPPINS_MEDIUM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loaderScroll: { flex: 1 },
  loaderContent: { paddingTop: 12, paddingBottom: 40 },
  skeletonGlassOuter: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(148,148,158,0.28)' : 'rgba(142,142,147,0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  skeletonGlassFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDark ? 'rgba(18,18,20,0.92)' : 'rgba(255,255,255,0.9)',
  },
  skeletonGlassFrostDark: {
    backgroundColor: 'rgba(18,18,20,0.92)',
  },
  skeletonGlassInner: {
    position: 'relative',
    zIndex: 2,
  },
  skeletonBox: {
    backgroundColor: C.chip,
    borderRadius: 8,
  },
  skeletonAvatar: { borderRadius: 18 },
  skeletonImage: {
    backgroundColor: C.chip,
  },
  card: {
    backgroundColor: C.card,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
  },
  cardInner: { flex: 1, paddingHorizontal: 0, paddingVertical: 0 },
  cardAuthorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  av: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.chip, marginRight: 10 },
  avPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.chip },
  avInitial: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, color: C.text },
  cardMeta: { flex: 1, minWidth: 0 },
  authorText: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, color: C.text },
  cardPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  cardPlaceText: { fontSize: 12, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.red },
  cardClientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  clientAv: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.chip, marginRight: 12, overflow: 'hidden' },
  clientAvPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.red + '18' },
  cardClientMeta: { flex: 1, minWidth: 0 },
  clientPlaceText: { fontSize: 16, fontFamily: FONT_POPPINS_BOLD, color: C.text, marginBottom: 2 },
  cardAuthorSub: { fontSize: 12, color: C.sub, fontFamily: FONT_POPPINS_MEDIUM, marginTop: 2 },
  cardRatingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  cardRatingNum: { fontSize: 12, fontFamily: FONT_POPPINS_SEMIBOLD, marginLeft: 2, color: C.sub },
  bodyText: { fontSize: 14, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 21, color: C.text, marginBottom: 10 },
  cardTopicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  cardTopicPill: { backgroundColor: C.chip, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  cardTopicPillText: { fontSize: 12, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.sub },
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
  imgCountText: { color: '#FFF', fontSize: 12, fontFamily: FONT_POPPINS_BOLD },
  ratingOnImg: {
    position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  ratingOnImgNum: { fontSize: 12, fontFamily: FONT_POPPINS_BOLD, color: '#FFF' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 10, paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionNum: { fontSize: 13, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.muted },
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
    paddingHorizontal: 18,
    minWidth: 118,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
  fabOptionBtnPost: {
    backgroundColor: C.red,
    ...Platform.select({
      ios: { shadowColor: C.red },
      android: {},
    }),
  },
  fabOptionBtnScan: {
    backgroundColor: C.green,
    ...Platform.select({
      ios: { shadowColor: C.green },
      android: {},
    }),
  },
  fabRadialOptionText: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, color: '#FFF', letterSpacing: 0.2 },
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
  scannerPermissionText: { fontSize: 16, fontFamily: FONT_POPPINS_REGULAR, color: C.text, textAlign: 'center', marginBottom: 24 },
  scannerPermissionBtn: {
    backgroundColor: C.red, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, marginBottom: 12,
  },
  scannerPermissionBtnText: { fontSize: 16, fontFamily: FONT_POPPINS_BOLD, color: '#FFF' },
  scannerCloseBtn: { padding: 12 },
  scannerCloseText: { fontSize: 16, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.sub },
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
  scannerHint: { fontSize: 14, color: 'rgba(255,255,255,0.95)', fontFamily: FONT_POPPINS_SEMIBOLD, flex: 1, textAlign: 'center' },
  empty: { paddingVertical: 80, alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: C.redSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: C.red,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  emptyTitle: { fontSize: 20, fontFamily: FONT_POPPINS_BOLD, color: C.text, marginBottom: 8, letterSpacing: -0.3 },
  emptySub: { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22, fontFamily: FONT_POPPINS_MEDIUM },
  // Popup
  popOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  popCard: {
    backgroundColor: isDark ? C.card : '#FFFFFF',
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
  popHeaderAvLetter: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, color: C.red },
  popHeaderName: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, color: C.text },
  popHeaderSub: { fontSize: 12, color: C.sub, fontFamily: FONT_POPPINS_MEDIUM, marginTop: 1 },
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
  popImgBadgeText: { color: '#FFF', fontSize: 12, fontFamily: FONT_POPPINS_BOLD },
  popBody: { paddingHorizontal: 18, paddingTop: 16 },
  popRatingWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  popRatingNum: { fontSize: 13, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.sub },
  popPlaceText: { fontSize: 13, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.red },
  popReviewText: {
    fontSize: 15, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 24, color: C.text, marginTop: 14,
  },
  popUpvoteRow: { marginTop: 12 },
  popUpvoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  popUpvoteNum: { fontSize: 14, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.muted },
  popReplySection: { marginTop: 14, paddingTop: 12, marginBottom: 14, borderTopWidth: 1, borderTopColor: C.border },
  popReplyTitle: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, color: C.text, marginBottom: 8 },
  popReplyBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
  },
  popReplyAv: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: C.chip,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  popReplyInput: { flex: 1, fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, color: C.text, paddingVertical: 0, minHeight: 20 },
  popReplyPlaceholder: { flex: 1, fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, color: C.muted },
  // Create — light: warm stone; dark: neutral black surfaces
  createRoot: { flex: 1, backgroundColor: isDark ? C.bg : '#F0F0EE' },
  createGlassShell: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 4,
    marginTop: 0,
    marginBottom: 4,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(142,142,147,0.18)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.28 : 0.06,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
    }),
  },
  createGlassFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDark ? 'rgba(28,28,30,0.9)' : 'rgba(255,255,255,0.78)',
  },
  createGlassFrostDark: {
    backgroundColor: 'rgba(28,28,30,0.9)',
  },
  createGlassInner: {
    flex: 1,
    minHeight: 0,
    zIndex: 2,
    position: 'relative',
  },
  createHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, paddingTop: 6,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
  },
  createHeaderBtn: { padding: 6, marginLeft: -6 },
  createHeaderCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  createTitle: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, color: isDark ? C.text : '#1C1917', letterSpacing: -0.2 },
  createSubtitle: { fontSize: 11, color: isDark ? C.muted : '#78716C', marginTop: 2, fontFamily: FONT_POPPINS_SEMIBOLD },
  postBtn: {
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18,
    backgroundColor: isDark ? C.chip : '#E7E5E4', minWidth: 64, alignItems: 'center', justifyContent: 'center',
  },
  postBtnActive: { backgroundColor: C.red },
  postBtnText: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, color: isDark ? C.muted : '#A8A29E' },
  postBtnTextActive: { color: '#FFF' },
  createScroll: { paddingHorizontal: 12, paddingTop: 10 },
  createProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  createProgressChunk: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
  },
  createProgressChunkOn: {
    backgroundColor: C.red,
  },
  createCard: {
    backgroundColor: isDark ? '#1C1C1E' : '#FFF', borderRadius: 14, padding: 12, marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0.28 : 0.05, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  createCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  createIconPill: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: isDark ? 'rgba(230,57,80,0.18)' : 'rgba(200,16,46,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  createIconPillAmber: {
    backgroundColor: isDark ? 'rgba(180,83,9,0.22)' : 'rgba(180,83,9,0.12)',
  },
  createFieldHint: {
    fontSize: 11,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 15,
    color: C.muted,
    marginBottom: 8,
    marginTop: -1,
  },
  createCardTitle: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, color: isDark ? C.text : '#1C1917', flex: 1 },
  createCardDesc: { fontSize: 12, fontFamily: FONT_POPPINS_REGULAR, color: isDark ? C.sub : '#78716C', marginBottom: 10, lineHeight: 16 },
  createTextInput: {
    fontSize: 15, fontFamily: FONT_POPPINS_REGULAR, lineHeight: 22, color: isDark ? C.text : '#1C1917',
    minHeight: 88, textAlignVertical: 'top', paddingTop: 10, paddingBottom: 10,
    backgroundColor: isDark ? '#121212' : '#FAFAF9', borderRadius: 12, borderWidth: 1, borderColor: isDark ? C.border : '#E7E5E4',
    paddingHorizontal: 12,
  },
  charCountRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  charCount: { fontSize: 11, fontFamily: FONT_POPPINS_MEDIUM, color: isDark ? C.sub : '#78716C' },
  charCountWarn: { color: C.orange },
  createHint: { fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, color: isDark ? C.sub : '#78716C', textAlign: 'center', marginBottom: 24, paddingHorizontal: 16, lineHeight: 18 },
  createChecklist: {
    marginTop: 4,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    gap: 7,
  },
  createChecklistRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  createChecklistText: { flex: 1, fontSize: 13, fontFamily: FONT_POPPINS_MEDIUM, color: C.muted },
  createChecklistTextDone: { color: C.sub, fontFamily: FONT_POPPINS_SEMIBOLD },
  placeInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: isDark ? '#121212' : '#FAFAF9', borderRadius: 10, borderWidth: 1, borderColor: isDark ? C.border : '#E7E5E4', overflow: 'hidden',
  },
  placeInput: { flex: 1, fontSize: 15, fontFamily: FONT_POPPINS_REGULAR, color: isDark ? C.text : '#1C1917', paddingVertical: 10, paddingHorizontal: 12 },
  fromAppBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 9, paddingHorizontal: 12,
    backgroundColor: isDark ? 'rgba(230,57,80,0.14)' : '#FEF2F2',
    borderLeftWidth: 1, borderLeftColor: isDark ? C.border : '#E7E5E4',
  },
  fromAppBtnText: { fontSize: 13, fontFamily: FONT_POPPINS_BOLD, color: C.red },
  starsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 8,
  },
  starTouchWrap: { width: 34, height: 34, flexDirection: 'row', position: 'relative' },
  starHalf: { width: 17, height: 34 },
  starIconOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  starsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginLeft: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  starsLabel: {
    fontSize: 15,
    fontFamily: FONT_POPPINS_BOLD,
    color: '#B45309',
    letterSpacing: -0.2,
  },
  starsVerbal: {
    fontSize: 12,
    fontFamily: FONT_POPPINS_SEMIBOLD,
    color: isDark ? C.sub : '#57534E',
    flexShrink: 1,
  },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10,
    backgroundColor: isDark ? '#121212' : '#FAFAF9', borderWidth: 1.5, borderColor: isDark ? C.border : '#E7E5E4',
  },
  topicChipOn: {
    backgroundColor: isDark ? 'rgba(230,57,80,0.2)' : '#FEF2F2',
    borderColor: C.red,
  },
  topicChipLabel: { fontSize: 12, fontFamily: FONT_POPPINS_SEMIBOLD, color: isDark ? C.sub : '#57534E' },
  topicChipLabelOn: { color: C.red, fontFamily: FONT_POPPINS_BOLD },
  customHashtagRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: isDark ? '#121212' : '#FAFAF9', borderRadius: 10, borderWidth: 1.5, borderColor: isDark ? C.border : '#E7E5E4',
    paddingVertical: 9, paddingHorizontal: 12,
  },
  customHashtagPrefix: { fontSize: 14, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.muted, marginRight: 4 },
  customHashtagInput: { flex: 1, fontSize: 14, fontFamily: FONT_POPPINS_REGULAR, color: isDark ? C.text : '#1C1917', paddingVertical: 0, minWidth: 0 },
  customHashtagCount: { fontSize: 12, fontFamily: FONT_POPPINS_REGULAR, color: C.muted, marginLeft: 8 },
  photoRow: { flexDirection: 'row', height: 96, alignItems: 'stretch' },
  photoAddSingle: {
    width: '100%', height: 96, borderRadius: 12,
    borderWidth: 2, borderStyle: 'dashed', borderColor: isDark ? '#48484A' : '#D6D3D1',
    alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: isDark ? '#121212' : '#FAFAF9',
  },
  photoAddIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: isDark ? 'rgba(230,57,80,0.2)' : '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddText: { fontSize: 13, fontFamily: FONT_POPPINS_SEMIBOLD, color: isDark ? C.sub : '#57534E' },
  photoAddHint: { fontSize: 11, fontFamily: FONT_POPPINS_REGULAR, color: isDark ? C.sub : '#78716C' },
  photoCountBadge: { fontSize: 11, fontFamily: FONT_POPPINS_BOLD, color: C.muted, marginLeft: 'auto' },
  photoHalf: { flex: 1 },
  photoGap: { width: 8 },
  photoThumb: {
    width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden',
    backgroundColor: isDark ? '#2C2C2E' : '#E7E5E4', position: 'relative',
  },
  photoThumbImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: '100%', height: '100%', borderRadius: 12,
    borderWidth: 2, borderStyle: 'dashed', borderColor: isDark ? '#48484A' : '#D6D3D1',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: isDark ? '#121212' : '#FAFAF9',
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
  pickerTitle: { fontSize: 18, fontFamily: FONT_POPPINS_BOLD, color: C.text },
  pickerSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  pickerSearchInput: { flex: 1, fontSize: 15, fontFamily: FONT_POPPINS_REGULAR, color: C.text },
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
  pickerItemText: { flex: 1, fontSize: 15, fontFamily: FONT_POPPINS_SEMIBOLD, color: C.text },
  pickerEmpty: { padding: 28, fontSize: 15, fontFamily: FONT_POPPINS_REGULAR, color: C.muted, textAlign: 'center' },
  })
}
