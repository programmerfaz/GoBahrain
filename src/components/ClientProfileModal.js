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

const COLORS = {
  primary: '#C8102E',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  screenBg: '#F8FAFC',
  pillBg: '#F3F4F6',
};

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

export default function ClientProfileModal({ visible, clientId, onClose, insets }) {
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
        supabase.from('post').select('post_uuid, post_image, description, created_at').eq('client_a_uuid', clientId).order('created_at', { ascending: false }).limit(30),
        supabase.from('community').select('community_uuid, review_text, rating, badge, image, created_at').eq('client_a_uuid', clientId).order('created_at', { ascending: false }).limit(20),
      ]);
      if (cancelled) return;
      const name = client.business_name || client.name || client.business_name_ar || '';
      if (postsRes.data) setClientPosts(postsRes.data.map((r) => ({ id: r.post_uuid, imageUri: r.post_image || null, description: r.description || '' })));
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
            <View style={styles.clientProfileTop}>
              <LinearGradient
                colors={['#C8102E', '#A00D24', '#7A0A1B']}
                style={styles.clientProfileHero}
              >
                <View style={styles.clientProfileHeroIconWrap}>
                  <View style={styles.clientProfileHeroIcon}>
                    <Ionicons name="storefront" size={44} color="#FFF" />
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
              </LinearGradient>

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
                  <Text style={styles.clientProfileCompactAbout} numberOfLines={2}>{description}</Text>
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

              <View style={styles.clientProfileTabs}>
                <TouchableOpacity
                  style={[styles.clientProfileTab, activeTab === PROFILE_TAB_POSTS && styles.clientProfileTabActive]}
                  onPress={() => setActiveTab(PROFILE_TAB_POSTS)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="grid" size={20} color={activeTab === PROFILE_TAB_POSTS ? '#FFF' : COLORS.textSecondary} />
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
                  <Ionicons name="chatbubbles" size={20} color={activeTab === PROFILE_TAB_REVIEWS ? '#FFF' : COLORS.textSecondary} />
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
              <ScrollView
                style={styles.clientProfileTabContent}
                contentContainerStyle={[styles.clientProfileReviewsScrollContent, { paddingBottom: (insets?.bottom ?? 0) + 24 }]}
                showsVerticalScrollIndicator={false}
              >
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
              </ScrollView>
            )}
          </>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  clientProfilePage: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  clientProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  clientProfileBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingRight: 12,
    minWidth: 80,
  },
  clientProfileBackText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  clientProfileHeaderTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  clientProfileHeaderPlaceholder: {
    width: 80,
  },
  clientProfileLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  clientProfileLoadingText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  clientProfileError: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  clientProfileErrorText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  clientProfileRetryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  clientProfileRetryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  clientProfileTop: {
    flexShrink: 0,
  },
  clientProfileCompactMeta: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  clientProfileCompactMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  clientProfileCompactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '48%',
  },
  clientProfileCompactPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  clientProfileCompactPillTextMuted: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  clientProfileCompactAbout: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  clientProfileCompactTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  clientProfileCompactTag: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  clientProfileCompactTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    maxWidth: 80,
  },
  clientProfileTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  clientProfileTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  clientProfileTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    backgroundColor: 'rgba(200, 16, 46, 0.06)',
  },
  clientProfileTabText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  clientProfileTabTextActive: {
    color: COLORS.primary,
  },
  clientProfileTabBadge: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  clientProfileTabBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  clientProfileTabBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  clientProfileTabBadgeTextActive: {
    color: '#FFFFFF',
  },
  clientProfileTabContent: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  clientProfileEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  clientProfileEmptyText: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  clientProfileReviewsScrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  clientProfileHero: {
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  clientProfileHeroIconWrap: {
    marginBottom: 20,
  },
  clientProfileHeroIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  clientProfileName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  clientProfileHeroBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  clientProfileSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  clientProfileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  clientProfileGridItem: {
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  clientProfileGridImage: {
    width: '100%',
    height: '100%',
  },
  clientProfileGridPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  clientProfileReviewsList: {
    gap: 14,
  },
  clientProfileReviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  clientProfileReviewCardInner: {
    padding: 16,
  },
  clientProfileReviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  clientProfileReviewRatingNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F59E0B',
    marginLeft: 6,
  },
  clientProfileReviewBody: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 23,
    fontStyle: 'italic',
  },
  clientProfileReviewImage: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: COLORS.pillBg,
  },
});
