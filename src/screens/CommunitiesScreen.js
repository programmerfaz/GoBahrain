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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import ScreenContainer from '../components/ScreenContainer';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  fetchCommunityPosts,
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
import {
  getCommunityPalette,
  buildCommunityFeedStyles,
  CommunityReviewCard,
} from '../components/community/CommunityReviewViews'

let C = getCommunityPalette(false)

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

// Top feed filters: feed chips use icons only; labels kept for accessibility
const TOPIC_FILTER_ICONS = {
  all: 'apps-outline',
  trending: 'flame-outline',
  ...CREATE_POST_TOPIC_ICONS,
};

/** Smooth shimmer skeleton loader for community feed. */
function CommunityLoadingShimmer() {
  const { isDark } = useTheme()
  const palette = useMemo(() => getCommunityPalette(isDark), [isDark])
  const { width = 375 } = useWindowDimensions();
  const cardWidth = width - 64;
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

  return (
    <ScrollView
      style={s.loaderScroll}
      contentContainerStyle={s.loaderContent}
      showsVerticalScrollIndicator={false}
    >
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            s.skeletonGlassOuter,
            isDark && { borderColor: 'rgba(148,148,158,0.28)' },
          ]}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 52 : 32}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View
            style={[s.skeletonGlassFrost, isDark && s.skeletonGlassFrostDark]}
            pointerEvents="none"
          />
          <View style={s.skeletonGlassInner}>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
              <View style={s.cardAuthorRow}>
                <SkeletonBox style={s.skeletonAvatar} width={44} height={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <SkeletonBox width="50%" height={16} />
                  <SkeletonBox width="35%" height={12} style={{ marginTop: 6 }} />
                </View>
              </View>
            </View>
            <View style={{ height: imgH, width: '100%' }}>
              <Animated.View style={[StyleSheet.absoluteFill, s.skeletonImage, { opacity }]} />
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <SkeletonBox width="100%" height={14} style={{ marginTop: 14, marginBottom: 6 }} />
              <SkeletonBox width="85%" height={14} style={{ marginBottom: 6 }} />
              <SkeletonBox width="60%" height={14} style={{ marginBottom: 14 }} />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <SkeletonBox width={70} height={24} style={{ borderRadius: 12 }} />
                <SkeletonBox width={60} height={24} style={{ borderRadius: 12 }} />
              </View>
              <View style={{ 
                flexDirection: 'row', 
                gap: 24, 
                paddingTop: 12, 
                paddingBottom: 16, 
                borderTopWidth: 1, 
                borderTopColor: palette.border + '40',
                marginTop: 4,
              }}>
                <SkeletonBox width={60} height={22} />
                <SkeletonBox width={50} height={22} />
                <SkeletonBox width={30} height={22} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
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
  const { isDark } = useTheme();
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
        <View style={s.createGlassShell}>
          <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
          <View style={[s.createGlassFrost, isDark && s.createGlassFrostDark]} pointerEvents="none" />
          <View style={s.createGlassInner}>
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
  const { isDark } = useTheme()
  const palette = useMemo(() => getCommunityPalette(isDark), [isDark])
  C = palette
  const feedStyles = useMemo(() => buildCommunityFeedStyles(palette, isDark), [palette, isDark])
  const insets = useSafeAreaInsets()
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTopic, setActiveTopic] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanInitialPlace, setScanInitialPlace] = useState(null);
  const [scanInitialClientUuid, setScanInitialClientUuid] = useState(null);
  const [fabExpanded, setFabExpanded] = useState(false);
  const filterSlideAnim = useRef(new Animated.Value(0)).current;
  const lastFeedScrollYRef = useRef(0);
  const isFilterHiddenRef = useRef(false);
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

  const setFilterHidden = useCallback((hidden) => {
    if (isFilterHiddenRef.current === hidden) return
    isFilterHiddenRef.current = hidden
    Animated.timing(filterSlideAnim, {
      toValue: hidden ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [filterSlideAnim])

  const handleFeedScroll = useCallback((event) => {
    const nextY = Math.max(0, event.nativeEvent.contentOffset.y || 0)
    const delta = nextY - lastFeedScrollYRef.current

    // Always show at top to avoid a hidden filter on pull-to-refresh.
    if (nextY <= 8) {
      setFilterHidden(false)
      lastFeedScrollYRef.current = nextY
      return
    }

    if (delta > 6) {
      setFilterHidden(true)
    } else if (delta < -6) {
      setFilterHidden(false)
    }

    lastFeedScrollYRef.current = nextY
  }, [setFilterHidden])

  const filterTranslateY = filterSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -16],
  })
  const filterOpacity = filterSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  })
  const filterMaxHeight = filterSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [66, 0],
  })

  return (
    <ScreenContainer style={s.screen}>
      <View style={[s.communityTopWrap, { paddingTop: insets.top + 4 }]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Community</Text>
          <Text style={s.headerSubtitle}>Discover Bahrain together</Text>
        </View>

        <Animated.View
          style={[
            s.filterTabsWrap,
            {
              transform: [{ translateY: filterTranslateY }],
              opacity: filterOpacity,
              maxHeight: filterMaxHeight,
            },
          ]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
            {TOPICS.map((t) => {
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
                    size={22}
                    color={on ? '#FFF' : C.sub}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
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
          renderItem={({ item, index }) => (
            <CommunityFeedCardWrapper itemId={item.id} index={index}>
              <CommunityReviewCard
                item={item}
                C={palette}
                styles={feedStyles}
                onPress={handleOpenPost}
                onCommentPress={handleOpenPostComments}
                onUpvoteToggle={onCommunityUpvoteToggle}
                upvoteScaleAnim={getUpvoteScaleAnim(item.id)}
              />
            </CommunityFeedCardWrapper>
          )}
          contentContainerStyle={feedStyles.feed}
          showsVerticalScrollIndicator={false}
          onScroll={handleFeedScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPosts({ isRefresh: true })} colors={[C.red]} />}
          ListEmptyComponent={(
            <View style={feedStyles.empty}>
              <View style={feedStyles.emptyIcon}>
                <Ionicons name="people" size={48} color={C.red} />
              </View>
              <Text style={feedStyles.emptyTitle}>No reviews yet</Text>
              <Text style={feedStyles.emptySub}>Be the first to share your experience and help build our community</Text>
            </View>
          )}
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
      <CreatePostModal
        visible={showCreate}
        onClose={() => { setShowCreate(false); setScanInitialPlace(null); setScanInitialClientUuid(null); }}
        onPosted={() => loadPosts({ isRefresh: true })}
        initialPlace={scanInitialPlace}
        initialClientUuid={scanInitialClientUuid}
      />
      <UpvoteParticles
        visible={particlesVisible}
        position={particlePosition}
        accentColor={C.green}
      />
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: C.bg },
  communityTopWrap: {
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  header: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
    textAlign: 'center',
    width: '100%',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: C.sub,
    marginTop: 2,
    letterSpacing: 0.1,
    textAlign: 'center',
    width: '100%',
  },
  filterTabsWrap: {
    paddingBottom: 4,
    overflow: 'hidden',
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
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
  feed: { paddingHorizontal: 16, paddingBottom: 110 },
  feedHeader: { paddingTop: 18, paddingBottom: 14 },
  feedHeaderTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 },
  feedHeaderSub: { fontSize: 14, color: C.muted, fontWeight: '500' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loaderScroll: { flex: 1 },
  loaderContent: { paddingTop: 12, paddingBottom: 40 },
  skeletonGlassOuter: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(142,142,147,0.22)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 22,
      },
      android: { elevation: 4 },
    }),
  },
  skeletonGlassFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  skeletonGlassFrostDark: {
    backgroundColor: 'rgba(28,28,30,0.88)',
  },
  skeletonGlassInner: {
    position: 'relative',
    zIndex: 2,
  },
  skeletonBox: {
    backgroundColor: C.chip,
    borderRadius: 8,
  },
  skeletonAvatar: { borderRadius: 22 },
  skeletonImage: {
    backgroundColor: C.chip,
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
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8, letterSpacing: -0.3 },
  emptySub: { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22, fontWeight: '500' },
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
  createGlassShell: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 10,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(142,142,147,0.22)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.08,
        shadowRadius: 28,
      },
      android: { elevation: 5 },
    }),
  },
  createGlassFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  createGlassFrostDark: {
    backgroundColor: 'rgba(28,28,30,0.88)',
  },
  createGlassInner: {
    flex: 1,
    minHeight: 0,
    zIndex: 2,
    position: 'relative',
  },
  createHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 14,
    backgroundColor: 'transparent',
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
