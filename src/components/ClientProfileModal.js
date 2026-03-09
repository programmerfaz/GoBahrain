import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  Animated,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { colors as themeColors } from '../theme/designTokens';
import { useTheme } from '../context/ThemeContext';

function getModalColors(themeColors) {
  return {
    primary: themeColors.primary,
    textPrimary: themeColors.textPrimary,
    textSecondary: themeColors.textSecondary,
    textMuted: themeColors.textMuted,
    screenBg: themeColors.background,
    pillBg: themeColors.borderLight,
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

const PROFILE_TAB_POSTS = 'posts';
const PROFILE_TAB_REVIEWS = 'reviews';

function getModalStyles(C) {
  return {
    clientProfilePage: { flex: 1, backgroundColor: C.screenBg },
    clientProfileHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16,
      backgroundColor: themeColors.surface,
      borderBottomWidth: 1, borderBottomColor: themeColors.border,
      ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 }, android: { elevation: 2 } }),
    },
    clientProfileBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingRight: 12, minWidth: 80 },
    clientProfileBackText: { fontSize: 17, fontWeight: '600', color: C.textPrimary },
    clientProfileHeaderTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.textPrimary, textAlign: 'center' },
    clientProfileHeaderPlaceholder: { width: 80 },
    clientProfileLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    clientProfileLoadingText: { fontSize: 16, color: C.textSecondary },
    clientProfileError: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 },
    clientProfileErrorText: { fontSize: 16, color: C.textSecondary, textAlign: 'center' },
    clientProfileRetryBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: C.primary, borderRadius: 12 },
    clientProfileRetryBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
    clientProfileTop: { flexShrink: 0 },
    clientProfileCompactMeta: { 
      backgroundColor: themeColors.surface, 
      paddingHorizontal: 20, 
      paddingVertical: 16, 
      borderBottomWidth: 1, 
      borderBottomColor: themeColors.border, 
      alignItems: 'stretch' 
    },
    clientProfileCompactMetaRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: 12, 
      marginBottom: 16 
    },
    clientProfileCompactPill: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 6, 
      backgroundColor: C.primary + '10', 
      paddingVertical: 6, 
      paddingHorizontal: 12, 
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.primary + '20'
    },
    clientProfileCompactPillText: { 
      fontSize: 14, 
      fontWeight: '700', 
      color: C.primary 
    },
    clientProfileCompactPillTextMuted: { 
      color: C.textSecondary, 
      fontWeight: '600' 
    },
    clientProfileCompactAbout: { 
      fontSize: 14, 
      color: C.textPrimary, 
      lineHeight: 20, 
      marginBottom: 16, 
      textAlign: 'center',
      fontWeight: '400'
    },
    clientProfileCompactTags: { 
      flexDirection: 'row', 
      flexWrap: 'wrap', 
      gap: 8, 
      justifyContent: 'center',
      marginBottom: 4
    },
    clientProfileCompactTag: { 
      backgroundColor: C.screenBg, 
      paddingVertical: 6, 
      paddingHorizontal: 12, 
      borderRadius: 10,
      borderWidth: 1,
      borderColor: themeColors.border
    },
    clientProfileCompactTagText: { 
      fontSize: 12, 
      fontWeight: '600', 
      color: C.textSecondary 
    },
    clientProfileARBtn: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: 10, 
      marginHorizontal: 20, 
      marginTop: 8, 
      marginBottom: 16, 
      paddingVertical: 16, 
      backgroundColor: C.primary, 
      borderRadius: 16,
      ...Platform.select({
        ios: { shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
        android: { elevation: 4 }
      })
    },
    clientProfileARBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
    clientProfileTabs: { 
      flexDirection: 'row', 
      backgroundColor: themeColors.surface, 
      borderBottomWidth: 1, 
      borderBottomColor: themeColors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 12
    },
    clientProfileTab: { 
      flex: 1, 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: 8, 
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: 'transparent'
    },
    clientProfileTabActive: { 
      backgroundColor: C.primary + '15',
      borderBottomWidth: 0
    },
    clientProfileTabText: { 
      fontSize: 14, 
      fontWeight: '700', 
      color: C.textSecondary 
    },
    clientProfileTabTextActive: { 
      color: C.primary 
    },
    clientProfileTabBadge: { 
      backgroundColor: 'rgba(0,0,0,0.05)', 
      paddingVertical: 2, 
      paddingHorizontal: 8, 
      borderRadius: 8 
    },
    clientProfileTabBadgeActive: { 
      backgroundColor: C.primary 
    },
    clientProfileTabBadgeText: { fontSize: 12, fontWeight: '800', color: C.textSecondary },
    clientProfileTabBadgeTextActive: { color: '#FFFFFF' },
    clientProfileTabContent: { flex: 1, backgroundColor: C.screenBg },
    clientProfileEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
    clientProfileEmptyText: { fontSize: 16, color: C.textMuted, fontWeight: '600' },
    clientProfileReviewsScrollContent: { padding: 16, paddingBottom: 24 },
    clientProfileHero: { paddingVertical: 20, paddingHorizontal: 20, alignItems: 'center', backgroundColor: 'transparent' },
    clientProfileHeroIconWrap: { marginBottom: 10 },
    clientProfileHeroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.pillBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
    clientProfileHeroImage: { width: 72, height: 72, borderRadius: 36 },
    clientProfileName: { fontSize: 20, fontWeight: '800', color: C.textPrimary, textAlign: 'center', marginBottom: 4, letterSpacing: 0.2 },
    clientProfileHeroBadge: { backgroundColor: C.primary + '15', paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12 },
    clientProfileSubtitle: { fontSize: 12, color: C.primary, fontWeight: '700' },
    clientProfileGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    clientProfileGridItem: { overflow: 'hidden', backgroundColor: themeColors.border },
    clientProfileGridImage: { width: '100%', height: '100%' },
    clientProfileGridPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.pillBg },
    clientProfileReviewsList: { gap: 14 },
    clientProfileReviewCard: {
      backgroundColor: themeColors.surface, borderRadius: 16, overflow: 'hidden', borderLeftWidth: 4, borderLeftColor: C.primary,
      ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 3 } }),
    },
    clientProfileReviewCardInner: { padding: 16 },
    clientProfileReviewRating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
    clientProfileReviewRatingNum: { fontSize: 15, fontWeight: '800', color: '#F59E0B', marginLeft: 6 },
    clientProfileReviewBody: { fontSize: 15, color: C.textPrimary, lineHeight: 23, fontStyle: 'italic' },
    clientProfileReviewImage: { width: '100%', height: 140, borderRadius: 12, marginTop: 12, backgroundColor: C.pillBg },
  };
}

export default function ClientProfileModal({ visible, clientId, onClose, insets, onOpenARNavigate }) {
  const { colors } = useTheme();
  const COLORS = React.useMemo(() => getModalColors(colors), [colors]);
  const styles = React.useMemo(() => StyleSheet.create(getModalStyles(COLORS)), [COLORS]);
  const { width: screenWidth } = useWindowDimensions();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientPosts, setClientPosts] = useState([]);
  const [clientReviews, setClientReviews] = useState([]);
  const [activeTab, setActiveTab] = useState(PROFILE_TAB_POSTS);
  const slideAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(1);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(1);
    }
  }, [visible, slideAnim]);

  useEffect(() => {
    if (!visible || !clientId) {
      setClient(null);
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
        if (e1) {
          const { data: byId } = await supabase.from('client').select('*').eq('id', clientId).maybeSingle();
          if (cancelled) return;
          if (byId) setClient(byId);
          else setError(e1.message || 'Could not load profile');
        } else if (byUuid) {
          setClient(byUuid);
        } else {
          setError('Profile not found');
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
    if (!visible || !clientId || !client) return;
    let cancelled = false;
    (async () => {
      const [postsRes, reviewsRes] = await Promise.all([
        supabase.from('posts').select('post_uuid, post_image, description, created_at').eq('client_a_uuid', clientId).order('created_at', { ascending: false }).limit(30),
        supabase.from('community').select('community_uuid, review_text, rating, badge, image, created_at').eq('client_a_uuid', clientId).order('created_at', { ascending: false }).limit(20),
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
      let reviews = (reviewsRes.data || []).map((r) => ({
        id: r.community_uuid,
        body: (r.review_text || '').trim(),
        rating: r.rating != null ? Number(r.rating) : null,
        place: r.badge || null,
        imageUri: parseReviewImage(r.image),
      }));
      if (reviews.length === 0 && name) {
        const { data: byBadge } = await supabase.from('community').select('community_uuid, review_text, rating, badge, image, created_at').ilike('badge', `%${name.slice(0, 20)}%`).order('created_at', { ascending: false }).limit(20);
        if (!cancelled && byBadge?.length) reviews = byBadge.map((r) => ({ id: r.community_uuid, body: (r.review_text || '').trim(), rating: r.rating != null ? Number(r.rating) : null, place: r.badge || null, imageUri: parseReviewImage(r.image) }));
      }
      if (!cancelled) setClientReviews(reviews);
    })();
    return () => { cancelled = true; };
  }, [visible, clientId, client]);

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
  const cuisine = client?.cuisine || client?.cuisine_type || '';

  const GRID_COLS = 3;
  const gridGap = 2;
  const gridCellSize = (screenWidth - gridGap * (GRID_COLS - 1)) / GRID_COLS;

  const slideTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, screenWidth],
  });

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.clientProfilePage, { transform: [{ translateX: slideTranslateX }] }]}>
        <View style={[styles.clientProfileHeader, { paddingTop: (insets?.top ?? 0) + 10, paddingBottom: 14 }]}>
          <TouchableOpacity style={styles.clientProfileBackBtn} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            <Text style={styles.clientProfileBackText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.clientProfileHeaderTitle} numberOfLines={1}>
            {client ? (name || 'Profile') : 'Profile'}
          </Text>
          <View style={styles.clientProfileHeaderPlaceholder} />
        </View>

        {loading ? (
          <View style={styles.clientProfileLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.clientProfileLoadingText}>Loading profile…</Text>
          </View>
        ) : error ? (
          <View style={styles.clientProfileError}>
            <Ionicons name="alert-circle-outline" size={56} color={COLORS.textMuted} />
            <Text style={styles.clientProfileErrorText}>{error}</Text>
            <TouchableOpacity style={styles.clientProfileRetryBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.clientProfileRetryBtnText}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : client ? (
          <>
            <ScrollView 
              style={{ flex: 1 }} 
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.clientProfileTop}>
                <View style={styles.clientProfileHero}>
                  <View style={styles.clientProfileHeroIconWrap}>
                    <View style={styles.clientProfileHeroIcon}>
                      {client.client_image ? (
                        <Image source={{ uri: client.client_image }} style={styles.clientProfileHeroImage} resizeMode="cover" />
                      ) : (
                        <Ionicons name="storefront" size={36} color={COLORS.primary} />
                      )}
                    </View>
                  </View>
                  <Text style={styles.clientProfileName} numberOfLines={2}>{name}</Text>
                  {(category || cuisine) ? (
                    <View style={styles.clientProfileHeroBadge}>
                      <Text style={styles.clientProfileSubtitle} numberOfLines={1}>
                        {[category, cuisine].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.clientProfileCompactMeta}>
                  <View style={styles.clientProfileCompactMetaRow}>
                    {rating != null && (
                      <View style={styles.clientProfileCompactPill}>
                        <Ionicons name="star" size={14} color="#F59E0B" />
                        <Text style={styles.clientProfileCompactPillText}>{Number(rating).toFixed(1)}</Text>
                      </View>
                    )}
                    {priceRange ? (
                      <View style={styles.clientProfileCompactPill}>
                        <Ionicons name="cash-outline" size={14} color={COLORS.primary} />
                        <Text style={styles.clientProfileCompactPillText}>{priceRange}</Text>
                      </View>
                    ) : null}
                    {location ? (
                      <View style={styles.clientProfileCompactPill}>
                        <Ionicons name="location" size={12} color={COLORS.textSecondary} />
                        <Text style={[styles.clientProfileCompactPillText, styles.clientProfileCompactPillTextMuted]} numberOfLines={1}>{location}</Text>
                      </View>
                    ) : null}
                  </View>
                  {description ? (
                    <Text style={styles.clientProfileCompactAbout} numberOfLines={3}>{description}</Text>
                  ) : null}
                  {tags.length > 0 ? (
                    <View style={styles.clientProfileCompactTags}>
                      {tags.slice(0, 6).map((tag, idx) => (
                        <View key={idx} style={styles.clientProfileCompactTag}>
                          <Text style={styles.clientProfileCompactTagText} numberOfLines={1}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>

                {onOpenARNavigate && client?.lat != null && client?.long != null ? (
                  <TouchableOpacity
                    style={styles.clientProfileARBtn}
                    onPress={() => {
                      onClose?.();
                      onOpenARNavigate({ lat: Number(client.lat), lng: Number(client.long), name: name || 'Destination' });
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="navigate" size={20} color="#FFF" />
                    <Text style={styles.clientProfileARBtnText}>Open in AR Navigate</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.clientProfileTabs}>
                  <TouchableOpacity
                    style={[styles.clientProfileTab, activeTab === PROFILE_TAB_POSTS && styles.clientProfileTabActive]}
                    onPress={() => setActiveTab(PROFILE_TAB_POSTS)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="grid" size={20} color={activeTab === PROFILE_TAB_POSTS ? COLORS.primary : COLORS.textSecondary} />
                    <Text style={[styles.clientProfileTabText, activeTab === PROFILE_TAB_POSTS && styles.clientProfileTabTextActive]}>Posts</Text>
                    <View style={[styles.clientProfileTabBadge, activeTab === PROFILE_TAB_POSTS && styles.clientProfileTabBadgeActive]}>
                      <Text style={[styles.clientProfileTabBadgeText, activeTab === PROFILE_TAB_POSTS && styles.clientProfileTabBadgeTextActive]}>{clientPosts.length}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.clientProfileTab, activeTab === PROFILE_TAB_REVIEWS && styles.clientProfileTabActive]}
                    onPress={() => setActiveTab(PROFILE_TAB_REVIEWS)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubbles" size={20} color={activeTab === PROFILE_TAB_REVIEWS ? COLORS.primary : COLORS.textSecondary} />
                    <Text style={[styles.clientProfileTabText, activeTab === PROFILE_TAB_REVIEWS && styles.clientProfileTabTextActive]}>Reviews</Text>
                    <View style={[styles.clientProfileTabBadge, activeTab === PROFILE_TAB_REVIEWS && styles.clientProfileTabBadgeActive]}>
                      <Text style={[styles.clientProfileTabBadgeText, activeTab === PROFILE_TAB_REVIEWS && styles.clientProfileTabBadgeTextActive]}>{clientReviews.length}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {activeTab === PROFILE_TAB_POSTS ? (
                <View style={[styles.clientProfileTabContent, { paddingBottom: (insets?.bottom ?? 0) + 16 }]}>
                  {clientPosts.length === 0 ? (
                    <View style={styles.clientProfileEmpty}>
                      <Ionicons name="images-outline" size={48} color={COLORS.textMuted} />
                      <Text style={styles.clientProfileEmptyText}>No posts yet</Text>
                    </View>
                  ) : (
                    <View style={[styles.clientProfileGrid, { width: screenWidth }]}>
                      {clientPosts.map((post, idx) => (
                        <View key={post.id || idx} style={[styles.clientProfileGridItem, { width: gridCellSize, height: gridCellSize, marginRight: (idx % GRID_COLS) < GRID_COLS - 1 ? gridGap : 0, marginBottom: gridGap }]}>
                          {post.imageUri ? (
                            <Image source={{ uri: post.imageUri }} style={styles.clientProfileGridImage} resizeMode="cover" />
                          ) : (
                            <View style={styles.clientProfileGridPlaceholder}>
                              <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.clientProfileReviewsScrollContent, { paddingBottom: (insets?.bottom ?? 0) + 24 }]}>
                  {clientReviews.length === 0 ? (
                    <View style={styles.clientProfileEmpty}>
                      <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
                      <Text style={styles.clientProfileEmptyText}>No reviews yet</Text>
                    </View>
                  ) : (
                    <View style={styles.clientProfileReviewsList}>
                      {clientReviews.map((rev, idx) => (
                        <View key={rev.id || idx} style={styles.clientProfileReviewCard}>
                          <View style={styles.clientProfileReviewCardInner}>
                            {rev.rating != null && rev.rating > 0 && (
                              <View style={styles.clientProfileReviewRating}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <Ionicons key={i} name={rev.rating >= i ? 'star' : rev.rating >= i - 0.5 ? 'star-half' : 'star-outline'} size={16} color="#F59E0B" />
                                ))}
                                <Text style={styles.clientProfileReviewRatingNum}>{Number(rev.rating).toFixed(1)}</Text>
                              </View>
                            )}
                            {rev.body ? <Text style={styles.clientProfileReviewBody} numberOfLines={4}>"{rev.body}"</Text> : null}
                            {rev.imageUri ? (
                              <Image source={{ uri: rev.imageUri }} style={styles.clientProfileReviewImage} resizeMode="cover" />
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </>
        ) : null}
      </Animated.View>
    </Modal>
  );
}
