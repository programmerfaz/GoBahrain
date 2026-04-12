import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  Image,
  Animated,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { colors as themeColors } from '../theme/designTokens';
import { useTheme } from '../context/ThemeContext';
import { ensureImageUrl } from '../utils/imageUrl';

function getModalColors(c) {
  return {
    primary: c.primary,
    primaryLight: c.primaryLight || c.primary,
    textPrimary: c.textPrimary,
    textSecondary: c.textSecondary,
    textMuted: c.textMuted,
    screenBg: c.background,
    pillBg: c.borderLight,
    surface: c.surface ?? themeColors.surface,
    border: c.border ?? themeColors.border,
    rating: c.warning ?? '#B45309',
  };
}

function parseReviewImage(imageColumn) {
  if (!imageColumn) return null;
  try {
    const parsed = typeof imageColumn === 'string' ? JSON.parse(imageColumn) : imageColumn;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr[0] || null;
  } catch {
    return typeof imageColumn === 'string' ? imageColumn : null;
  }
}

function parseJsonField(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [p];
    } catch {
      return val ? [val] : null;
    }
  }
  return [val];
}

const PROFILE_TAB_POSTS = 'posts';
const PROFILE_TAB_REVIEWS = 'reviews';

function getModalStyles(C) {
  const surface = C.surface ?? themeColors.surface;
  const border = C.border ?? themeColors.border;
  return {
    clientProfilePage: { flex: 1, backgroundColor: C.screenBg },
    headerBlur: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      overflow: 'hidden',
      backgroundColor: Platform.OS === 'android' ? surface : 'transparent',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border + '40',
    },
    clientProfileBackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingRight: 8,
      minWidth: 64,
    },
    clientProfileBackText: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
    clientProfileHeaderTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.textPrimary, textAlign: 'center' },
    clientProfileHeaderPlaceholder: { width: 64 },
    clientProfileLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
    clientProfileLoadingText: { fontSize: 14, color: C.textSecondary },
    skeletonCard: { marginHorizontal: 14, marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: surface },
    skeletonAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.pillBg },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: C.pillBg, marginTop: 8 },
    skeletonLineShort: { width: '60%' },
    clientProfileError: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 28 },
    clientProfileErrorText: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },
    clientProfileRetryBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    clientProfileRetryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    clientProfileTop: { flexShrink: 0 },
    /* Profile card */
    profileCard: {
      marginHorizontal: 14,
      marginTop: 12,
      marginBottom: 10,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: border + '80',
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
        android: { elevation: 4 },
      }),
    },
    profileCardGradient: {
      borderRadius: 18,
      overflow: 'hidden',
    },
    profileCardInner: {
      padding: 16,
      backgroundColor: surface,
      borderRadius: 18,
    },
    profileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    profileAvatarWrap: {
      width: 60,
      height: 60,
      borderRadius: 30,
      padding: 2,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.pillBg,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    profileAvatarImg: { width: 56, height: 56, borderRadius: 28 },
    profileMain: { flex: 1, minWidth: 0 },
    profileName: { fontSize: 17, fontWeight: '800', color: C.textPrimary, marginBottom: 2, letterSpacing: -0.3 },
    profileSub: { fontSize: 12, color: C.textSecondary, marginBottom: 8 },
    profileStats: {
      flexDirection: 'row',
      gap: 20,
      paddingVertical: 8,
      paddingHorizontal: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border + '60',
      marginTop: 4,
    },
    profileStat: { alignItems: 'center', flex: 1 },
    profileStatNum: { fontSize: 15, fontWeight: '800', color: C.textPrimary },
    profileStatLabel: { fontSize: 10, color: C.textMuted, marginTop: 1 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 10 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: C.primary + '14',
    },
    chipText: { fontSize: 11, fontWeight: '700', color: C.primary },
    chipRating: { backgroundColor: (C.rating || '#B45309') + '22' },
    chipRatingText: { color: C.rating || '#B45309' },
    chipMuted: { backgroundColor: C.pillBg },
    chipMutedText: { color: C.textSecondary },
    bio: { fontSize: 13, color: C.textSecondary, lineHeight: 18, marginTop: 6 },
    arBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 14,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
        android: { elevation: 4 },
      }),
    },
    arBtnText: { fontSize: 14, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 14,
      marginTop: 16,
      marginBottom: 12,
      backgroundColor: C.pillBg,
      borderRadius: 14,
      padding: 4,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: 'transparent',
    },
    tabActive: { backgroundColor: surface, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }, android: { elevation: 2 } }) },
    tabText: { fontSize: 12, fontWeight: '700', color: C.textSecondary },
    tabTextActive: { color: C.primary },
    tabBadge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, backgroundColor: C.primary + '15' },
    tabBadgeActive: { backgroundColor: C.primary },
    tabBadgeText: { fontSize: 10, fontWeight: '800', color: C.textSecondary },
    tabBadgeTextActive: { color: '#FFF' },
    tabContent: { flex: 1, backgroundColor: C.screenBg },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, marginBottom: 8, marginHorizontal: 14, letterSpacing: 0.5 },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 12,
      backgroundColor: C.pillBg + '50',
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 16,
    },
    emptyText: { fontSize: 14, color: C.textMuted, fontWeight: '600' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 2 },
    gridItem: {
      overflow: 'hidden',
      backgroundColor: C.pillBg,
      borderRadius: 8,
    },
    gridImage: { width: '100%', height: '100%', borderRadius: 8 },
    gridPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.pillBg, borderRadius: 8 },
    reviewsContent: { padding: 14, paddingBottom: 20 },
    reviewsList: { gap: 10 },
    reviewCard: {
      backgroundColor: surface,
      borderRadius: 14,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
        android: { elevation: 3 },
      }),
    },
    reviewCardGradient: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
    reviewInner: { padding: 14 },
    reviewRating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    reviewRatingNum: { fontSize: 13, fontWeight: '800', color: '#F59E0B', marginLeft: 2 },
    reviewBody: { fontSize: 13, color: C.textPrimary, lineHeight: 19, fontStyle: 'italic' },
    reviewImage: { width: '100%', height: 90, borderRadius: 10, marginTop: 8, backgroundColor: C.pillBg },
  };
}

export default function ClientProfileModal({ visible, clientId, onClose, insets, onOpenARNavigate }) {
  const { colors, isDark } = useTheme();
  const COLORS = React.useMemo(() => getModalColors(colors), [colors]);
  const styles = React.useMemo(() => StyleSheet.create(getModalStyles(COLORS)), [COLORS]);
  const { width: screenWidth } = useWindowDimensions();
  const [client, setClient] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientPosts, setClientPosts] = useState([]);
  const [clientReviews, setClientReviews] = useState([]);
  const [activeTab, setActiveTab] = useState(PROFILE_TAB_POSTS);
  const slideAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(1);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(1);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  useEffect(() => {
    if (!visible || !clientId) {
      setClient(null);
      setRestaurant(null);
      setError(null);
      setClientPosts([]);
      setClientReviews([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: byUuid, error: e1 } = await supabase
          .from('client')
          .select('*')
          .eq('client_a_uuid', clientId)
          .maybeSingle();
        if (cancelled) return;
        let finalClient = null;
        if (e1) {
          const { data: byId } = await supabase.from('client').select('*').eq('id', clientId).maybeSingle();
          if (cancelled) return;
          if (byId) finalClient = byId;
          else setError(e1.message || 'Could not load profile');
        } else if (byUuid) {
          finalClient = byUuid;
        } else {
          setError('Profile not found');
        }
        if (finalClient) {
          setClient(finalClient);
          const uuidForRest = finalClient.client_a_uuid;
          if (uuidForRest) {
            try {
              const { data: restData } = await supabase
                .from('restaurant_client')
                .select('cuisine, meal_type, food_type, speciality, isfoodtruck')
                .eq('a_uuid', uuidForRest)
                .maybeSingle();
              if (!cancelled && restData) setRestaurant(restData);
            } catch (_) {
              // restaurant_client table may not exist yet
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, clientId]);

  useEffect(() => {
    if (!visible || !client || !client.client_a_uuid) return;
    let cancelled = false;
    const uuid = client.client_a_uuid;
    (async () => {
      const [postsRes, reviewsRes] = await Promise.all([
        supabase.from('posts').select('post_uuid, post_image, description, created_at').eq('client_a_uuid', uuid).order('created_at', { ascending: false }).limit(30),
        supabase.from('community').select('community_uuid, review_text, rating, badge, image, created_at').eq('client_a_uuid', uuid).order('created_at', { ascending: false }).limit(20),
      ]);
      if (cancelled) return;
      const name = client.business_name || client.name || client.business_name_ar || '';
      if (postsRes.data) {
        setClientPosts(postsRes.data.map((r) => {
          let imageUri = r.post_image;
          if (imageUri && typeof imageUri === 'string' && imageUri.startsWith('[{')) {
            try {
              const parsed = JSON.parse(imageUri);
              if (Array.isArray(parsed) && parsed[0]?.url) {
                imageUri = parsed[0].url;
              } else if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                imageUri = parsed[0];
              }
            } catch (e) {
              console.warn('[ClientProfile] Failed to parse post_image JSON:', e);
            }
          }
          if (imageUri && typeof imageUri === 'string' && !imageUri.startsWith('http')) {
            const cleanPath = imageUri.startsWith('gobahrain-post-images/')
              ? imageUri.replace('gobahrain-post-images/', '')
              : imageUri;
            imageUri = `https://zonhaprelkjyjugpqfdn.supabase.co/storage/v1/object/public/gobahrain-post-images/${cleanPath}`;
          }
          if (!imageUri && r.post_image) {
            imageUri = r.post_image;
          }
          return { id: r.post_uuid, imageUri: imageUri || null, description: r.description || '' };
        }));
      }
      const toReviewUri = (img) => {
        const raw = parseReviewImage(img);
        return raw ? (ensureImageUrl(raw) || raw) : null;
      };
      let reviews = (reviewsRes.data || []).map((r) => ({
        id: r.community_uuid,
        body: (r.review_text || '').trim(),
        rating: r.rating != null ? Number(r.rating) : null,
        place: r.badge || null,
        imageUri: toReviewUri(r.image),
      }));
      if (reviews.length === 0 && name) {
        const { data: byBadge } = await supabase.from('community').select('community_uuid, review_text, rating, badge, image, created_at').ilike('badge', `%${name.slice(0, 20)}%`).order('created_at', { ascending: false }).limit(20);
        if (!cancelled && byBadge?.length) reviews = byBadge.map((r) => ({ id: r.community_uuid, body: (r.review_text || '').trim(), rating: r.rating != null ? Number(r.rating) : null, place: r.badge || null, imageUri: toReviewUri(r.image) }));
      }
      if (!cancelled) setClientReviews(reviews);
    })();
    return () => { cancelled = true; };
  }, [visible, client]);

  if (!visible) return null;

  const name = client?.business_name || client?.name || client?.business_name_ar || 'Business';
  const description = client?.description || '';
  const location = client?.location || client?.address || '';
  const rating = client?.rating != null && client?.rating !== '' ? Number(client.rating) : null;
  const priceRange = client?.price_range != null && client?.price_range !== '' ? String(client.price_range) : null;
  const tags = client?.tags != null
    ? (Array.isArray(client.tags) ? client.tags : String(client.tags).split(',').map((t) => t.trim()).filter(Boolean))
    : [];
  const category = client?.category || client?.client_type || '';
  const cuisine = client?.cuisine || client?.cuisine_type || restaurant?.cuisine || '';

  const mealTypes = parseJsonField(restaurant?.meal_type);
  const foodTypes = parseJsonField(restaurant?.food_type);
  const speciality = restaurant?.speciality;
  const isFoodTruck = restaurant?.isfoodtruck === true;

  const chips = [];
  if (rating != null) chips.push({ icon: 'star', label: Number(rating).toFixed(1), primary: true, accent: 'rating' });
  if (priceRange) chips.push({ icon: 'cash-outline', label: priceRange, primary: true });
  if (cuisine) chips.push({ icon: 'restaurant-outline', label: cuisine, primary: true });
  if (mealTypes?.length) chips.push({ icon: 'time-outline', label: mealTypes.slice(0, 2).join(', '), primary: false });
  if (foodTypes?.length) chips.push({ icon: 'pizza-outline', label: foodTypes.slice(0, 2).join(', '), primary: false });
  if (speciality) chips.push({ icon: 'sparkles', label: speciality, primary: true });
  if (isFoodTruck) chips.push({ icon: 'car', label: 'Food truck', primary: true });
  if (location) chips.push({ icon: 'location-outline', label: location, primary: false });
  tags.slice(0, 3).forEach((t) => chips.push({ icon: null, label: t, primary: false }));

  const GRID_COLS = 3;
  const gridGap = 1;
  const gridCellSize = (screenWidth - gridGap * (GRID_COLS - 1)) / GRID_COLS;

  const slideTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, screenWidth],
  });

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.clientProfilePage, { transform: [{ translateX: slideTranslateX }] }]}>
        <View style={[styles.headerBlur, { paddingTop: (insets?.top ?? 0) + 8, paddingBottom: 10 }]}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          )}
          <TouchableOpacity style={styles.clientProfileBackBtn} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
            <Text style={styles.clientProfileBackText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.clientProfileHeaderTitle} numberOfLines={1}>
            {client ? (name || 'Profile') : 'Profile'}
          </Text>
          <View style={styles.clientProfileHeaderPlaceholder} />
        </View>

        {loading ? (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={styles.skeletonCard}>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <View style={styles.skeletonAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={[styles.skeletonLine, { width: '80%' }]} />
                  <View style={[styles.skeletonLine, styles.skeletonLineShort, { marginTop: 12 }]} />
                  <View style={{ flexDirection: 'row', gap: 20, marginTop: 16 }}>
                    <View style={[styles.skeletonLine, { width: 40, height: 32 }]} />
                    <View style={[styles.skeletonLine, { width: 40, height: 32 }]} />
                  </View>
                </View>
              </View>
              <View style={[styles.skeletonLine, { marginTop: 16, width: '100%' }]} />
              <View style={[styles.skeletonLine, { marginTop: 8, width: '70%' }]} />
            </View>
            <View style={[styles.tabs, { opacity: 0.5 }]}>
              <View style={[styles.tab]} />
              <View style={[styles.tab]} />
            </View>
            <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={[styles.clientProfileLoadingText, { marginTop: 12 }]}>Loading profile…</Text>
            </View>
          </ScrollView>
        ) : error ? (
          <View style={styles.clientProfileError}>
            <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.clientProfileErrorText}>{error}</Text>
            <TouchableOpacity style={styles.clientProfileRetryBtn} onPress={onClose} activeOpacity={0.85}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.clientProfileRetryBtnText}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : client ? (
          <>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <Animated.View style={{ opacity: fadeAnim }}>
              <View style={styles.profileCard}>
                <View style={[styles.profileCardGradient, styles.profileCardInner]}>
                  <View style={styles.profileRow}>
                    <LinearGradient
                      colors={[COLORS.primary, COLORS.primaryLight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.profileAvatarWrap}
                    >
                      <View style={styles.profileAvatar}>
                        {client.client_image ? (
                          <Image source={{ uri: ensureImageUrl(client.client_image) || client.client_image }} style={styles.profileAvatarImg} resizeMode="cover" />
                        ) : (
                          <Ionicons name="storefront" size={26} color={COLORS.primary} />
                        )}
                      </View>
                    </LinearGradient>
                    <View style={styles.profileMain}>
                      <Text style={styles.profileName} numberOfLines={1}>{name}</Text>
                      {(category || cuisine) ? (
                        <Text style={styles.profileSub} numberOfLines={1}>
                          {[category, cuisine].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                      <View style={styles.profileStats}>
                        <View style={styles.profileStat}>
                          <Text style={styles.profileStatNum}>{clientPosts.length}</Text>
                          <Text style={styles.profileStatLabel}>Posts</Text>
                        </View>
                        <View style={styles.profileStat}>
                          <Text style={styles.profileStatNum}>{clientReviews.length}</Text>
                          <Text style={styles.profileStatLabel}>Reviews</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {chips.length > 0 && (
                    <View style={styles.chipsRow}>
                      {chips.slice(0, 6).map((c, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.chip,
                            c.primary ? null : styles.chipMuted,
                            c.accent === 'rating' ? styles.chipRating : null,
                          ]}
                        >
                          {c.icon ? (
                            <Ionicons
                              name={c.icon}
                              size={10}
                              color={c.accent === 'rating' ? (COLORS.rating || '#B45309') : c.primary ? COLORS.primary : COLORS.textSecondary}
                            />
                          ) : null}
                          <Text
                            style={[
                              styles.chipText,
                              c.primary ? null : styles.chipMutedText,
                              c.accent === 'rating' ? styles.chipRatingText : null,
                            ]}
                            numberOfLines={1}
                          >
                            {c.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {description ? (
                    <Text style={styles.bio} numberOfLines={2}>{description}</Text>
                  ) : null}

                  {onOpenARNavigate && client?.lat != null && client?.long != null && (
                    <TouchableOpacity
                      style={styles.arBtn}
                      onPress={() => {
                        onClose?.();
                        onOpenARNavigate({ lat: Number(client.lat), lng: Number(client.long), name: name || 'Destination' });
                      }}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={[COLORS.primary, COLORS.primaryLight]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <Ionicons name="navigate" size={18} color="#FFF" />
                      <Text style={styles.arBtnText}>Open in AR</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.tabs}>
                <Pressable
                  style={({ pressed }) => [styles.tab, activeTab === PROFILE_TAB_POSTS && styles.tabActive, pressed && { opacity: 0.8 }]}
                  onPress={() => setActiveTab(PROFILE_TAB_POSTS)}
                >
                  <Ionicons name="grid-outline" size={18} color={activeTab === PROFILE_TAB_POSTS ? COLORS.primary : COLORS.textSecondary} />
                  <Text style={[styles.tabText, activeTab === PROFILE_TAB_POSTS && styles.tabTextActive]}>Posts</Text>
                  <View style={[styles.tabBadge, activeTab === PROFILE_TAB_POSTS && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === PROFILE_TAB_POSTS && styles.tabBadgeTextActive]}>{clientPosts.length}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.tab, activeTab === PROFILE_TAB_REVIEWS && styles.tabActive, pressed && { opacity: 0.8 }]}
                  onPress={() => setActiveTab(PROFILE_TAB_REVIEWS)}
                >
                  <Ionicons name="chatbubbles-outline" size={18} color={activeTab === PROFILE_TAB_REVIEWS ? COLORS.primary : COLORS.textSecondary} />
                  <Text style={[styles.tabText, activeTab === PROFILE_TAB_REVIEWS && styles.tabTextActive]}>Reviews</Text>
                  <View style={[styles.tabBadge, activeTab === PROFILE_TAB_REVIEWS && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === PROFILE_TAB_REVIEWS && styles.tabBadgeTextActive]}>{clientReviews.length}</Text>
                  </View>
                </Pressable>
              </View>

              {activeTab === PROFILE_TAB_POSTS ? (
                <View style={[styles.tabContent, { paddingBottom: (insets?.bottom ?? 0) + 12 }]}>
                  <Text style={styles.sectionLabel}>GALLERY</Text>
                  {clientPosts.length === 0 ? (
                    <View style={styles.empty}>
                      <Ionicons name="images-outline" size={36} color={COLORS.textMuted} />
                      <Text style={styles.emptyText}>No posts yet</Text>
                    </View>
                  ) : (
                    <View style={[styles.grid, { width: screenWidth }]}>
                      {clientPosts.map((post, idx) => (
                        <Pressable
                          key={post.id || idx}
                          style={({ pressed }) => [
                            styles.gridItem,
                            { width: gridCellSize, height: gridCellSize, marginRight: (idx % GRID_COLS) < GRID_COLS - 1 ? gridGap : 0, marginBottom: gridGap },
                            pressed && { opacity: 0.9 },
                          ]}
                        >
                          {post.imageUri ? (
                            <Image source={{ uri: post.imageUri }} style={styles.gridImage} resizeMode="cover" />
                          ) : (
                            <View style={styles.gridPlaceholder}>
                              <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
                            </View>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.reviewsContent, { paddingBottom: (insets?.bottom ?? 0) + 20 }]}>
                  <Text style={[styles.sectionLabel, { marginHorizontal: 0 }]}>REVIEWS</Text>
                  {clientReviews.length === 0 ? (
                    <View style={styles.empty}>
                      <Ionicons name="chatbubbles-outline" size={36} color={COLORS.textMuted} />
                      <Text style={styles.emptyText}>No reviews yet</Text>
                    </View>
                  ) : (
                    <View style={styles.reviewsList}>
                      {clientReviews.map((rev, idx) => (
                        <View key={rev.id || idx} style={styles.reviewCard}>
                          <LinearGradient
                            colors={[COLORS.primary, COLORS.primaryLight]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.reviewCardGradient}
                          />
                          <View style={styles.reviewInner}>
                            {rev.rating != null && rev.rating > 0 && (
                              <View style={styles.reviewRating}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <Ionicons key={i} name={rev.rating >= i ? 'star' : rev.rating >= i - 0.5 ? 'star-half' : 'star-outline'} size={12} color="#F59E0B" />
                                ))}
                                <Text style={styles.reviewRatingNum}>{Number(rev.rating).toFixed(1)}</Text>
                              </View>
                            )}
                            {rev.body ? <Text style={styles.reviewBody} numberOfLines={3}>"{rev.body}"</Text> : null}
                            {rev.imageUri ? (
                              <Image source={{ uri: rev.imageUri }} style={styles.reviewImage} resizeMode="cover" />
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
              </Animated.View>
            </ScrollView>
          </>
        ) : null}
      </Animated.View>
    </Modal>
  );
}
