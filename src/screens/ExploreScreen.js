import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
  Animated,
  TouchableOpacity,
  Platform,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenContainer from '../components/ScreenContainer';
import { fetchEvents } from '../services/aiPipeline';

const C = {
  bg: '#FFFFFF',
  text: '#111827',
  sub: '#6B7280',
  muted: '#9CA3AF',
  accent: '#C8102E',
  cardBg: '#F9FAFB',
  border: 'rgba(209,213,219,0.7)',
};

// Placeholder image when event has no image (deterministic per name)
function getEventImage(m) {
  const uri = m.image_url || m.image || m.photo || m.img;
  if (uri && typeof uri === 'string') return uri;
  const seed = (m.event_name || m.business_name || m.name || 'event').replace(/\s/g, '');
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/900`;
}

const CARD_GAP = 20;

function EventCard({ item, index, cardWidth, cardHeight, scrollX, onPress }) {
  const m = item?.metadata || {};
  const name = m.event_name || m.business_name || m.name || 'Event';
  const venue = m.venue || m.location || m.area || '';
  const time = [m.start_time, m.end_time].filter(Boolean).join(' – ');
  const date = m.start_date || m.end_date || '';
  const eventType = m.event_type || '';
  const imageUri = getEventImage(m);
  const itemWidth = cardWidth + CARD_GAP;

  const scale = scrollX.interpolate({
    inputRange: [
      (index - 1) * itemWidth,
      index * itemWidth,
      (index + 1) * itemWidth,
    ],
    outputRange: [0.85, 1, 0.85],
    extrapolate: 'clamp',
  });

  const opacity = scrollX.interpolate({
    inputRange: [
      (index - 1) * itemWidth,
      index * itemWidth,
      (index + 1) * itemWidth,
    ],
    outputRange: [0.6, 1, 0.6],
    extrapolate: 'clamp',
  });

  const imageTranslateX = scrollX.interpolate({
    inputRange: [
      (index - 1) * itemWidth,
      index * itemWidth,
      (index + 1) * itemWidth,
    ],
    outputRange: [30, 0, -30],
    extrapolate: 'clamp',
  });

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => onPress?.(item)}
      style={{ width: cardWidth }}
    >
    <Animated.View
      style={[
        styles.card,
        {
          width: cardWidth,
          transform: [{ scale }],
          opacity,
        },
      ]}
    >
      <View style={[styles.cardImageWrap, { height: cardHeight }]}>
        <Animated.View
          style={[
            styles.cardImage,
            {
              height: cardHeight,
              width: cardWidth + 60,
              transform: [{ translateX: imageTranslateX }],
            },
          ]}
        >
          <ImageBackground
            source={{ uri: imageUri }}
            style={[StyleSheet.absoluteFill, { width: cardWidth + 60, left: -30 }]}
            resizeMode="cover"
          >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.95)']}
          locations={[0, 0.4, 0.75, 1]}
          style={styles.cardGradient}
        >
          <View style={styles.cardContent}>
            {eventType ? (
              <View style={styles.badge}>
                <Ionicons name="pricetag" size={11} color="#FFF" />
                <Text style={styles.badgeText} numberOfLines={1} ellipsizeMode="tail">{eventType}</Text>
              </View>
            ) : null}
            <Text style={styles.cardTitle} numberOfLines={4} ellipsizeMode="tail">{name}</Text>
            <View style={styles.cardMetaBlock}>
              {(date || time) ? (
                <View style={styles.cardMetaRow}>
                  <View style={styles.cardMetaIcon}>
                    <Ionicons name="time" size={14} color="rgba(255,255,255,0.95)" />
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={2} ellipsizeMode="tail">{[date, time].filter(Boolean).join(' · ')}</Text>
                </View>
              ) : null}
              {venue ? (
                <View style={styles.cardMetaRow}>
                  <View style={styles.cardMetaIcon}>
                    <Ionicons name="location" size={14} color="rgba(255,255,255,0.95)" />
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={2} ellipsizeMode="tail">{venue}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.cardCta}>Tap to view</Text>
              <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.8)" />
            </View>
          </View>
        </LinearGradient>
          </ImageBackground>
        </Animated.View>
      </View>
    </Animated.View>
    </TouchableOpacity>
  );
}

export default function ExploreScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const cardWidth = Math.round(width * 0.78);
  const peekPadding = (width - cardWidth - CARD_GAP) / 2;
  const cardHeight = Math.round(height * 0.55);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const loadEvents = useCallback(async () => {
    try {
      const data = await fetchEvents([]);
      setEvents(data || []);
    } catch (e) {
      console.warn('[Explore] fetchEvents failed:', e?.message);
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadEvents();
  }, [loadEvents]);

  const handleCardPress = useCallback((item) => {
    if (Platform.OS !== 'web') Vibration.vibrate(20);
  }, []);

  const onScroll = useCallback((e) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / (cardWidth + CARD_GAP));
    setActiveIndex(Math.max(0, Math.min(index, events.length - 1)));
  }, [cardWidth, events.length]);

  const renderCard = useCallback(
    ({ item, index }) => (
      <EventCard
        item={item}
        index={index}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        scrollX={scrollX}
        onPress={handleCardPress}
      />
    ),
    [cardWidth, cardHeight, scrollX, handleCardPress]
  );

  const keyExtractor = useCallback((item) => item?.id || item?.metadata?.event_name || String(Math.random()), []);

  const openAR = () => {
    if (Platform.OS !== 'web') Vibration.vibrate(40);
    const nav = navigation?.getParent?.() ?? navigation;
    nav?.navigate?.('AR');
  };

  return (
    <ScreenContainer showHeader headerTitle="Explore">
      <TouchableOpacity
        style={styles.arButton}
        onPress={openAR}
        activeOpacity={0.85}
      >
        <View style={styles.arButtonInner}>
          <Ionicons name="scan" size={24} color="#FFF" />
          <Text style={styles.arButtonText}>AR</Text>
        </View>
      </TouchableOpacity>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Events in Bahrain</Text>
            <Text style={styles.sectionSub}>Swipe to explore what's happening</Text>
          </View>
          {loading ? (
            <View style={[styles.loaderWrap, { minHeight: 320 }]}>
              <View style={styles.loaderCard}>
                <View style={styles.skeletonImage} />
                <View style={styles.skeletonText} />
                <View style={[styles.skeletonText, { width: '60%' }]} />
              </View>
              <ActivityIndicator size="large" color={C.accent} style={styles.loaderSpinner} />
            </View>
          ) : events.length === 0 ? (
            <View style={[styles.emptyWrap, { width: cardWidth }]}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="calendar-outline" size={40} color={C.accent} />
              </View>
              <Text style={styles.emptyText}>No events right now</Text>
              <Text style={styles.emptySub}>Pull down to refresh or try the AR mode</Text>
              <TouchableOpacity style={styles.emptyCta} onPress={openAR} activeOpacity={0.8}>
                <Ionicons name="scan" size={18} color="#FFF" />
                <Text style={styles.emptyCtaText}>Explore with AR</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <FlatList
                data={events}
                renderItem={renderCard}
                keyExtractor={keyExtractor}
                horizontal
                pagingEnabled={false}
                showsHorizontalScrollIndicator={false}
                snapToInterval={cardWidth + CARD_GAP}
                snapToAlignment="center"
                decelerationRate="fast"
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  {
                    useNativeDriver: false,
                    listener: onScroll,
                  }
                )}
                scrollEventThrottle={16}
                contentContainerStyle={[
                  styles.carouselContent,
                  { paddingHorizontal: peekPadding },
                ]}
                ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
              />
              <View style={styles.pageIndicator}>
                {events.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.pageDot,
                      i === activeIndex && styles.pageDotActive,
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.swipeHint}>
                <Ionicons name="chevron-back" size={12} color={C.muted} /> Swipe to explore
                <Ionicons name="chevron-forward" size={12} color={C.muted} />
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 32,
  },
  section: {
    paddingHorizontal: 0,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
  },
  sectionSub: {
    fontSize: 15,
    color: C.sub,
    marginTop: 4,
  },
  carouselContent: {
    paddingRight: 24,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardImageWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  cardImage: {
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
    justifyContent: 'flex-end',
  },
  cardContent: {
    gap: 4,
    flexShrink: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,16,46,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.3,
    flexShrink: 1,
    maxWidth: 120,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 12,
    lineHeight: 26,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    flexShrink: 1,
  },
  cardMetaBlock: {
    gap: 8,
    marginBottom: 10,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 24,
  },
  cardMetaIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    flex: 1,
    minWidth: 0,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  cardCta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  loaderCard: {
    width: '85%',
    maxWidth: 340,
    height: 280,
    borderRadius: 20,
    backgroundColor: C.cardBg,
    padding: 20,
    marginBottom: 20,
  },
  skeletonImage: {
    height: 160,
    backgroundColor: C.border,
    borderRadius: 12,
    marginBottom: 16,
  },
  skeletonText: {
    height: 14,
    backgroundColor: C.border,
    borderRadius: 4,
    marginBottom: 8,
    width: '80%',
  },
  loaderSpinner: {
    marginTop: 8,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    backgroundColor: C.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginTop: 4,
  },
  emptySub: {
    fontSize: 14,
    color: C.sub,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: C.accent,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.border,
  },
  pageDotActive: {
    width: 20,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  swipeHint: {
    textAlign: 'center',
    fontSize: 13,
    color: C.muted,
    marginTop: 12,
  },
  arButton: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  arButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
});
