import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
  Image,
  Vibration,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  FlatList,
  TouchableWithoutFeedback,
  PanResponder,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { OPENAI_KEY } from '../config/keys';
import { supabase } from '../config/supabase';
import { fetchPineconePlacesForChat } from '../services/aiPipeline';
import { useUserPreferences } from '../context/UserPreferencesContext';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const PICS_LIKE_QUERIES = ['pic', 'pics', 'photo', 'photos', 'image', 'images', 'picture', 'pictures', 'show me', 'posts', 'feed'];

function getPostImageUrl(row) {
  const url = row.post_image ?? row.image ?? null;
  if (url != null && String(url).trim() !== '') return String(url).trim();
  return null;
}

async function fetchPostsByQuery(query) {
  const q = (query && String(query).trim()) ? query.trim().toLowerCase() : '';
  const isGenericPicsRequest = PICS_LIKE_QUERIES.some((k) => q === k || q.includes(k));
  const { data: rows, error } = await supabase
    .from('post')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.warn('[Khalid] fetchPostsByQuery error:', error.message);
    return [];
  }
  const list = rows || [];
  if (list.length === 0) return [];
  let matches = list.filter(
    (r) =>
      (r.description && String(r.description).toLowerCase().includes(q)) ||
      (getPostImageUrl(r) && String(getPostImageUrl(r)).toLowerCase().includes(q))
  ).slice(0, 6);
  if (matches.length === 0 && (isGenericPicsRequest || !q)) {
    matches = list.filter((r) => getPostImageUrl(r) != null).slice(0, 6);
  }
  if (matches.length === 0) {
    matches = list.slice(0, 6);
  }
  const clientIds = [...new Set(matches.map((r) => r.client_a_uuid).filter(Boolean))];
  let clientMap = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('client').select('client_a_uuid, business_name, name').in('client_a_uuid', clientIds);
    (clients || []).forEach((c) => {
      const id = c.client_a_uuid;
      clientMap[id] = c?.business_name || c?.name || null;
    });
  }
  return matches.map((r) => ({
    id: r.post_uuid,
    description: r.description || '',
    imageUri: getPostImageUrl(r),
    businessName: clientMap[r.client_a_uuid] ? String(clientMap[r.client_a_uuid]).trim() : null,
  }));
}

function parseReviewImages(imageColumn) {
  if (!imageColumn) return [];
  if (Array.isArray(imageColumn)) return imageColumn.slice(0, 2);
  try {
    const parsed = JSON.parse(imageColumn);
    return Array.isArray(parsed) ? parsed.slice(0, 2) : [parsed].filter(Boolean);
  } catch {
    return [imageColumn].filter(Boolean);
  }
}

async function fetchReviewsByPlace(place) {
  if (!place || !place.trim()) return { place: place || '', reviews: [] };
  const p = place.trim();
  const { data: rows, error } = await supabase
    .from('community')
    .select('community_uuid, review_text, rating, badge, image')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !rows?.length) return { place: p, reviews: [] };
  const filtered = rows.filter((r) => {
    const text = (r.review_text || '').toLowerCase();
    const badge = (r.badge || '').toLowerCase();
    return text.includes(p.toLowerCase()) || badge.includes(p.toLowerCase());
  });
  const reviews = filtered.slice(0, 5).map((r) => {
    const images = parseReviewImages(r.image);
    return {
      id: r.community_uuid,
      body: (r.review_text || '').trim().slice(0, 200),
      rating: r.rating != null ? Number(r.rating) : null,
      place: r.badge || null,
      imageUri: images[0] || null,
      images: images,
    };
  });
  return { place: p, reviews };
}

const SWIPE_UP_THRESHOLD = 72;
const TAP_MAX_MOVE = 18;
const TAP_MAX_MS = 400;

const KHALID_SUGGESTIONS_DEFAULT = [
  'Best breakfast spots',
  'Show me pics',
  'Things to do in Bahrain',
  'Recommend a restaurant',
  'Where can I try karak?',
];

function getSmartSuggestions(generalLabels = [], activityLabels = [], foodLabels = []) {
  const out = [];
  if (foodLabels.length > 0) {
    out.push(`Best ${foodLabels[0].toLowerCase()} spots`);
    if (foodLabels.length > 1) out.push(`Recommend a ${foodLabels[1].toLowerCase()} place`);
  }
  if (generalLabels.some((l) => /family/i.test(l))) out.push('Family-friendly places');
  else if (generalLabels.some((l) => /foodie/i.test(l)) && !out.some((s) => /recommend|restaurant/i.test(s))) out.push('Recommend a restaurant');
  if (activityLabels.length > 0 && !out.some((s) => /things to do/i.test(s))) out.push('Things to do in Bahrain');
  if (!out.some((s) => /pics|photos/i.test(s))) out.push('Show me pics');
  if (!out.some((s) => /breakfast/i.test(s))) out.push('Best breakfast spots');
  while (out.length < 5) {
    const next = KHALID_SUGGESTIONS_DEFAULT.find((d) => !out.includes(d));
    if (!next) break;
    out.push(next);
  }
  return out.slice(0, 5);
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TYPEWRITER_MS_PER_CHAR = 28;
const TYPEWRITER_MIN_MS = 500;
const TYPEWRITER_MAX_MS = 3800;

function AnimatedMessageText({ text, isUser, style }) {
  const fullLen = (text || '').length;
  const [visibleLen, setVisibleLen] = useState(isUser ? fullLen : 0);
  const progressRef = useRef(new Animated.Value(0)).current;
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    const len = fullLen;
    if (len === 0) {
      setVisibleLen(0);
      return;
    }
    if (isUser) return;
    const duration = Math.min(TYPEWRITER_MAX_MS, Math.max(TYPEWRITER_MIN_MS, len * TYPEWRITER_MS_PER_CHAR));
    const listener = progressRef.addListener(({ value }) => {
      setVisibleLen(Math.min(len, Math.floor(value * (len + 1))));
    });
    Animated.timing(progressRef, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      progressRef.removeListener(listener);
      setVisibleLen(len);
    });
    return () => progressRef.removeAllListeners();
  }, [fullLen, isUser, progressRef]);

  const displayText = (text || '').slice(0, visibleLen);
  const showCaret = !isUser && visibleLen < (text || '').length;

  return (
    <Text style={style}>
      {displayText}
      {showCaret ? (
        <Text style={{ color: 'rgba(200,16,46,0.75)', fontWeight: '600' }}>|</Text>
      ) : null}
    </Text>
  );
}

function KhalidCardRow({ item }) {
  const { action, loading, data, error } = item;
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  const isPost = action?.type === 'go_home_highlight_post';
  const isReviews = action?.type === 'go_community_filter_reviews';
  const posts = (isPost && data?.posts) ? data.posts : [];

  return (
    <View style={[styles.khalidMessageRow, styles.khalidMessageRowAssistant]}>
      <View style={styles.khalidAvatar}>
        <Ionicons name="sparkles" size={14} color="#FFF" />
      </View>
      <Animated.View style={[styles.khalidCardAnimatedWrap, { opacity, transform: [{ scale }] }]}>
        <View style={styles.khalidCard}>
          <View style={styles.khalidCardBadge}>
            <Ionicons name="sparkles" size={10} color="rgba(200,16,46,0.95)" />
            <Text style={styles.khalidCardBadgeText}>From Khalid</Text>
          </View>
          {loading ? (
            <View style={[styles.khalidCardContent, styles.khalidCardContentRow]}>
              <View style={styles.khalidCardLoaderDots}>
                <View style={styles.khalidCardLoaderDot} />
                <View style={styles.khalidCardLoaderDot} />
                <View style={styles.khalidCardLoaderDot} />
              </View>
              <Text style={styles.khalidCardLoadingText}>Finding for you…</Text>
            </View>
          ) : error ? (
            <View style={[styles.khalidCardContent, styles.khalidCardErrorContent]}>
              <View style={styles.khalidCardErrorIconWrap}>
                <Ionicons name="cloud-offline-outline" size={22} color="#FCA5A5" />
              </View>
              <Text style={styles.khalidCardErrorText}>{error}</Text>
            </View>
          ) : isPost && posts.length > 0 ? (
            <View style={styles.khalidCardContent}>
              <Text style={styles.khalidCardSectionLabel}>From your feed</Text>
              {posts.map((post, idx) => (
                <View
                  key={post.id || idx}
                  style={[styles.khalidCardPostBlock, idx === posts.length - 1 && styles.khalidCardPostBlockLast]}
                >
                  {post.imageUri ? (
                    <View style={styles.khalidCardPostImageWrap}>
                      <Image source={{ uri: post.imageUri }} style={styles.khalidCardPostImage} resizeMode="cover" />
                      <View style={styles.khalidCardPostImageShade} />
                    </View>
                  ) : null}
                  <View style={styles.khalidCardPostBody}>
                    {(post.businessName || post.description) ? (
                      <Text style={styles.khalidCardPostTitle} numberOfLines={1}>
                        {post.businessName || post.description || 'Post'}
                      </Text>
                    ) : null}
                    {post.description ? (
                      <Text style={styles.khalidCardPostDesc} numberOfLines={3}>
                        {post.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : isReviews && data ? (
            <View style={styles.khalidCardContent}>
              <Text style={styles.khalidCardSectionLabel}>Community reviews</Text>
              <Text style={styles.khalidCardReviewsTitle}>{data.place || 'This place'}</Text>
              {(data.reviews || []).length === 0 ? (
                <Text style={styles.khalidCardNoReviews}>No reviews yet. Be the first to share!</Text>
              ) : (
                (data.reviews || []).slice(0, 3).map((rev, idx) => (
                  <View key={rev.id || idx} style={styles.khalidCardReviewBlock}>
                    {rev.imageUri ? (
                      <Image source={{ uri: rev.imageUri }} style={styles.khalidCardReviewImage} resizeMode="cover" />
                    ) : null}
                    <View style={styles.khalidCardReviewContent}>
                      {rev.rating != null ? (
                        <View style={styles.khalidCardReviewRating}>
                          <Ionicons name="star" size={14} color="#FBBF24" />
                          <Text style={styles.khalidCardReviewRatingText}>{rev.rating}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.khalidCardReviewBody} numberOfLines={3}>{rev.body || '—'}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : (
            <View style={[styles.khalidCardContent, styles.khalidCardErrorContent]}>
              <View style={styles.khalidCardEmptyIconWrap}>
                <Ionicons name="search-outline" size={24} color="rgba(148,163,184,0.7)" />
              </View>
              <Text style={styles.khalidCardEmptyText}>Nothing found here.</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function buildKhalidSystemPrompt(pineconePlacesContext, userPreferences = {}) {
  const placesBlock =
    pineconePlacesContext && pineconePlacesContext.trim()
      ? `\n\n${pineconePlacesContext.trim()}\n`
      : '\n\nYou may only recommend or mention places, restaurants, and events that exist in the app\'s database (Pinecone). If you are not given a list of allowed places below, keep recommendations general or say you\'ll need more context.\n';
  const generalLabels = userPreferences.generalLabels || [];
  const activityLabels = userPreferences.activityLabels || [];
  const foodLabels = userPreferences.foodLabels || [];
  const hasGeneral = generalLabels.length > 0;
  const hasPlanPrefs = activityLabels.length > 0 || foodLabels.length > 0;
  const prefsBlock = (hasGeneral || hasPlanPrefs)
    ? `\n\nUSER UNDERSTANDING (use this to tailor tone and suggestions; prioritize, do NOT filter):
${hasGeneral ? `About them (general): ${generalLabels.join(', ')}. Use this to understand who they are — travel style, pace, budget, what they value.\n` : ''}${hasPlanPrefs ? `For day plans they prefer: activities ${activityLabels.length ? activityLabels.join(', ') : 'none'}; food ${foodLabels.length ? foodLabels.join(', ') : 'none'}. When suggesting places or plans, lead with these when relevant; still suggest other options.\n` : ''}\n`
    : '';
  return `You are Khalid, a warm, friendly, causal speaking non formal Bahraini local and the assistant for the Go Bahrain tourism app. You are an INITIATOR: you suggest and invite, you don't just answer and wait.
${prefsBlock}

PERSONALITY (critical):
- Be casual and friendly. Use casual language and phrases.
- Be non formal. Use non formal language and phrases.
- Make your responses short and concise and more human like
- Be proactive. Offer things: "Want to see pics from the feed?", "Do you wanna try [place]?", "Should I show you reviews for [X]?", "I can show you the best breakfast spots — want me to pull them up?"
- After answering a question, often add a follow-up offer: "Want me to show you photos?", "I can show you reviews for that place if you'd like."
- Use inviting phrases: "Want to...?", "Do you wanna...?", "Should I show you...?", "I can show you... if you'd like.", "Fancy seeing...?"
- You are not a yes-man. You lead the conversation by suggesting what to see or try next. Only mention places from the allowed list below.
${placesBlock}
RESPOND WITH STRICT JSON ONLY — no markdown, no extra text:
{
  "reply": "your short, friendly message to the user",
  "actions": []
}

INTENT RULES (very important):
- DEFAULT: Answer in chat and INITIATE. Suggest something to see or try when it fits (from the allowed list). Keep "actions" as [] unless the user (or you in your reply) is clearly asking to SHOW something in the app.
- Use actions when the user (or your suggested next step) is to show content: e.g. user says "yes show me" / "sure" / "show me pics" / "show me that" → use the right action. Also use action when user explicitly asks to open/show something.
  - "Show me pics" / "Show me photos" / "yes show me" (after you offered pics) → go_home_highlight_post with "query": "pics".
  - "Show me that post about karak" / "Open the burger post" → go_home_highlight_post with "query" = short keyword.
  - "Show me reviews for [place]" / "What do people say about [X]?" → go_community_filter_reviews with "place" = the place name.
- Do NOT use actions on every message. Many replies are just you suggesting or answering; use actions when you're actually showing posts or reviews.
- Never use more than one action per reply. Never invent action types.

Allowed action types only:
1) {"type": "go_home_highlight_post", "query": "short keyword for home feed"}
2) {"type": "go_community_filter_reviews", "place": "place or restaurant name"}

Reply: 1-3 short sentences, friendly, and often end with an offer (e.g. "Want me to show you...?"). JSON only.`;
}

export default function BottomControlBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const currentRouteName = state.routes[state.index]?.name;
  const { generalLabels, activityLabels, foodLabels } = useUserPreferences();

  // Pulsing idle glow + press impulse for AI button (center)
  const pulse = useRef(new Animated.Value(0)).current;
  const impulse = useRef(new Animated.Value(0)).current;
  const longPressTriggeredRef = useRef(false);
  const [showKhalidOverlay, setShowKhalidOverlay] = useState(false);
  const [isHoldingForKhalid, setIsHoldingForKhalid] = useState(false);
  const dragProgress = useRef(new Animated.Value(0)).current;
  const swipeTriggeredRef = useRef(false);
  const touchStartTimeRef = useRef(0);
  const khalidBackdropOpacity = useRef(new Animated.Value(0)).current;
  const khalidBackdropScale = useRef(new Animated.Value(1)).current;
  const khalidContentScale = useRef(new Animated.Value(0.88)).current;
  const khalidContentOpacity = useRef(new Animated.Value(0)).current;
  const [khalidMessages, setKhalidMessages] = useState([
    {
      id: 'intro',
      role: 'assistant',
      text: "Hi, I'm Khalid — your Bahrain guide. Ask me for breakfast spots, things to do, or say “show me pics” and I’ll help you discover the best of Bahrain.",
    },
  ]);
  const [khalidInput, setKhalidInput] = useState('');
  const [khalidLoading, setKhalidLoading] = useState(false);
  const [khalidError, setKhalidError] = useState(null);
  const khalidListRef = useRef(null);
  const typingDot1 = useRef(new Animated.Value(0)).current;
  const typingDot2 = useRef(new Animated.Value(0)).current;
  const typingDot3 = useRef(new Animated.Value(0)).current;
  const siriOrbScale = useRef(new Animated.Value(1)).current;
  const siriOrbOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, [pulse]);

  const glowScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.25],
  });

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  const impulseScale = impulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.6],
  });

  const impulseOpacity = impulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const swipeRingRotation = dragProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const swipeRingOpacity = dragProgress.interpolate({
    inputRange: [0, 0.01],
    outputRange: [0.4, 1],
  });
  const typingScale1 = typingDot1.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] });
  const typingScale2 = typingDot2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] });
  const typingScale3 = typingDot3.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] });

  const scrollKhalidToEnd = () => {
    requestAnimationFrame(() => {
      khalidListRef.current?.scrollToEnd({ animated: true });
    });
  };

  const closeKhalidOverlay = () => {
    khalidBackdropOpacity.setValue(1);
    khalidBackdropScale.setValue(1);
    khalidContentScale.setValue(0.94);
    khalidContentOpacity.setValue(0);
    setShowKhalidOverlay(false);
  };

  const runKhalidEntranceAnimation = () => {
    khalidBackdropOpacity.setValue(0);
    khalidBackdropScale.setValue(1);
    khalidContentScale.setValue(0.94);
    khalidContentOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(khalidBackdropOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(khalidBackdropScale, {
          toValue: 1.06,
          duration: 200,
          easing: Easing.out(Easing.circle),
          useNativeDriver: true,
        }),
        Animated.spring(khalidBackdropScale, {
          toValue: 1,
          tension: 180,
          friction: 14,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(100),
        Animated.parallel([
          Animated.spring(khalidContentScale, {
            toValue: 1,
            tension: 90,
            friction: 11,
            useNativeDriver: true,
          }),
          Animated.timing(khalidContentOpacity, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  };

  useEffect(() => {
    if (!showKhalidOverlay) return;
    runKhalidEntranceAnimation();
  }, [showKhalidOverlay]);

  const typingLoopRef = useRef(null);
  const siriOrbLoopRef = useRef(null);
  useEffect(() => {
    if (!khalidLoading) {
      typingLoopRef.current?.stop();
      siriOrbLoopRef.current?.stop();
      typingDot1.setValue(0);
      typingDot2.setValue(0);
      typingDot3.setValue(0);
      siriOrbScale.setValue(1);
      siriOrbOpacity.setValue(0.7);
      return;
    }
    const bounce = (anim, delay) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]);
    const oneCycle = Animated.parallel([
      bounce(typingDot1, 0),
      bounce(typingDot2, 120),
      bounce(typingDot3, 240),
    ]);
    const loop = Animated.loop(oneCycle);
    typingLoopRef.current = loop;
    loop.start();

    const siriOrbBreath = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(siriOrbScale, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(siriOrbOpacity, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(siriOrbScale, {
            toValue: 0.92,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(siriOrbOpacity, {
            toValue: 0.5,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
      { resetBeforeIteration: false }
    );
    siriOrbLoopRef.current = siriOrbBreath;
    siriOrbBreath.start();

    return () => {
      loop.stop();
      siriOrbBreath.stop();
      typingLoopRef.current = null;
      siriOrbLoopRef.current = null;
    };
  }, [khalidLoading, typingDot1, typingDot2, typingDot3, siriOrbScale, siriOrbOpacity]);

  const openKhalidFromSwipe = () => {
    if (swipeTriggeredRef.current) return;
    swipeTriggeredRef.current = true;
    longPressTriggeredRef.current = true;
    if (Platform.OS !== 'web') Vibration.vibrate(80);
    impulse.setValue(0);
    Animated.sequence([
      Animated.timing(impulse, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.circle),
        useNativeDriver: true,
      }),
      Animated.timing(impulse, {
        toValue: 0,
        duration: 280,
        easing: Easing.in(Easing.circle),
        useNativeDriver: true,
      }),
    ]).start();
    khalidBackdropOpacity.setValue(0);
    khalidBackdropScale.setValue(1);
    khalidContentScale.setValue(0.94);
    khalidContentOpacity.setValue(0);
    setShowKhalidOverlay(true);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        touchStartTimeRef.current = Date.now();
        swipeTriggeredRef.current = false;
        setIsHoldingForKhalid(true);
        dragProgress.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (swipeTriggeredRef.current) return;
        const { dy } = gestureState;
        const progress = Math.min(1, Math.max(0, -dy / SWIPE_UP_THRESHOLD));
        dragProgress.setValue(progress);
        if (progress >= 1) openKhalidFromSwipe();
      },
      onPanResponderRelease: (_, gestureState) => {
        const elapsed = Date.now() - touchStartTimeRef.current;
        const isTap =
          !swipeTriggeredRef.current &&
          Math.abs(gestureState.dy) <= TAP_MAX_MOVE &&
          elapsed < TAP_MAX_MS;
        setIsHoldingForKhalid(false);
        dragProgress.setValue(0);
        if (swipeTriggeredRef.current) return;
        if (isTap) {
          longPressTriggeredRef.current = false;
          if (Platform.OS !== 'web') Vibration.vibrate(40);
          impulse.setValue(0);
          Animated.sequence([
            Animated.timing(impulse, {
              toValue: 1,
              duration: 550,
              easing: Easing.out(Easing.circle),
              useNativeDriver: true,
            }),
            Animated.timing(impulse, { toValue: 0, duration: 350, easing: Easing.in(Easing.circle), useNativeDriver: true }),
          ]).start();
          if (currentRouteName === 'AI Plan') {
            navigation.navigate('AI Plan', { openPlanModal: Date.now() });
          } else {
            navigation.navigate('AI Plan');
          }
        }
      },
    }),
  ).current;

  const addActionCardAndMaybeNavigate = (action, openInApp) => {
    if (!action || !action.type) return;
    if (action.type === 'go_home_highlight_post') {
      const query = String(action.query || '').trim();
      if (!query) return;
      if (openInApp) {
        navigation.navigate('Home', {
          fromKhalid: { type: 'highlight_post', query, ts: Date.now() },
        });
        setTimeout(closeKhalidOverlay, 320);
      }
    } else if (action.type === 'go_community_filter_reviews') {
      const place = String(action.place || '').trim();
      if (!place) return;
      if (openInApp) {
        navigation.navigate('Community', {
          fromKhalid: { type: 'filter_reviews', place, ts: Date.now() },
        });
        setTimeout(closeKhalidOverlay, 320);
      }
    }
  };

  const handleKhalidAction = (action) => {
    if (!action || !action.type) return;
    const query = String(action.query || '').trim();
    const place = String(action.place || '').trim();
    const cardId = `card-${Date.now()}`;
    const cardMsg = {
      id: cardId,
      role: 'assistant',
      type: 'card',
      action: { type: action.type, query, place },
      loading: true,
      data: null,
      error: null,
    };
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setKhalidMessages((prev) => [...prev, cardMsg]);
    setTimeout(scrollKhalidToEnd, 100);

    const updateCard = (update) => {
      setKhalidMessages((prev) =>
        prev.map((m) => (m.id === cardId ? { ...m, ...update } : m))
      );
      setTimeout(scrollKhalidToEnd, 80);
    };

    if (action.type === 'go_home_highlight_post') {
      fetchPostsByQuery(query)
        .then((posts) => updateCard({ loading: false, data: posts?.length ? { posts } : null, error: null }))
        .catch((e) => updateCard({ loading: false, data: null, error: e?.message || 'Could not load posts' }));
    } else if (action.type === 'go_community_filter_reviews') {
      fetchReviewsByPlace(place)
        .then((data) => updateCard({ loading: false, data, error: null }))
        .catch((e) => updateCard({ loading: false, data: null, error: e?.message || 'Could not load reviews' }));
    }
  };

  const sendMessageWithText = async (text) => {
    const trimmed = String(text).trim();
    if (!trimmed || khalidLoading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextMessages = [...khalidMessages, userMsg];
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setKhalidMessages(nextMessages);
    setKhalidInput('');
    setKhalidError(null);
    scrollKhalidToEnd();

    try {
      setKhalidLoading(true);
      const historyForApi = nextMessages
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.text && m.type !== 'card'))
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.text,
        }));

      const pineconePlacesContext = await fetchPineconePlacesForChat(trimmed, { generalLabels, activityLabels, foodLabels });
      const systemPrompt = buildKhalidSystemPrompt(pineconePlacesContext, { generalLabels, activityLabels, foodLabels });

      const res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyForApi,
          ],
          temperature: 0.6,
          max_tokens: 500,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || `GPT error (${res.status})`);
      }

      const raw = json?.choices?.[0]?.message?.content?.trim();
      if (!raw) throw new Error('Empty reply from Khalid');

      let replyText = raw;
      let actions = [];
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.reply === 'string') replyText = parsed.reply;
          if (Array.isArray(parsed.actions)) actions = parsed.actions;
        }
      } catch {
        // fall back to raw text
      }

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: replyText,
      };
      LayoutAnimation.configureNext({
        duration: 260,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setKhalidMessages((prev) => [...prev, assistantMsg]);
      scrollKhalidToEnd();

      (actions || []).forEach(handleKhalidAction);
    } catch (e) {
      console.error('[KhalidOverlay] chat error', e);
      setKhalidError(e.message || 'Something went wrong talking to Khalid');
    } finally {
      setKhalidLoading(false);
    }
  };

  const sendKhalidMessage = () => sendMessageWithText(khalidInput);

  const renderKhalidItem = ({ item }) => {
    if (item.type === 'card' && item.action) {
      return <KhalidCardRow item={item} />;
    }
    const isUser = item.role === 'user';
    return (
      <View
        style={[
          styles.khalidMessageRow,
          isUser ? styles.khalidMessageRowUser : styles.khalidMessageRowAssistant,
        ]}
      >
        {!isUser && (
          <View style={styles.khalidAvatar}>
            <Ionicons name="sparkles" size={16} color="#FFF" />
          </View>
        )}
        <View
          style={[
            styles.khalidBubble,
            isUser ? styles.khalidBubbleUser : styles.khalidBubbleAssistant,
          ]}
        >
          <AnimatedMessageText
            text={item.text}
            isUser={isUser}
            style={[
              styles.khalidBubbleText,
              isUser ? styles.khalidBubbleTextUser : styles.khalidBubbleTextAssistant,
            ]}
          />
        </View>
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (!khalidLoading) return null;
    return (
      <View style={[styles.khalidMessageRow, styles.khalidMessageRowAssistant]}>
        <View style={styles.khalidAvatar}>
          <Ionicons name="sparkles" size={16} color="#FFF" />
        </View>
        <View style={[styles.khalidBubble, styles.khalidBubbleAssistant, styles.khalidTypingBubble]}>
          <View style={styles.khalidSiriOrbWrap}>
            <Animated.View
              style={[
                styles.khalidSiriOrb,
                {
                  opacity: siriOrbOpacity,
                  transform: [{ scale: siriOrbScale }],
                },
              ]}
            />
          </View>
        </View>
      </View>
    );
  };

  const handleNavigate = (screenName) => {
    if (currentRouteName === screenName) return;
    navigation.navigate(screenName);
  };

  const navItems = [
    { screen: 'Home', icon: 'home', label: 'Home' },
    { screen: 'Explore', icon: 'compass', label: 'Explore' },
    null, // center slot for AI FAB (AI Plan)
    { screen: 'Community', icon: 'people', label: 'Community' },
    { screen: 'Profile', icon: 'person-circle-outline', label: 'Profile' },
  ];

  const barContentHeight = 56;
  const bottomInset = Math.max(insets.bottom, 12);
  const totalBarHeight = barContentHeight + bottomInset;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.bar,
          {
            height: totalBarHeight,
            paddingBottom: bottomInset,
          },
        ]}
      >
        <View style={styles.navRow}>
          {navItems.map((item, index) => {
            if (item === null) {
              return (
                <View key="ai" style={styles.aiContainer}>
                  {isHoldingForKhalid ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.swipeUpRing,
                        { opacity: swipeRingOpacity },
                      ]}
                    >
                      <View style={styles.swipeUpRingTrack} />
                      <Animated.View
                        style={[
                          styles.swipeUpRingFillWrap,
                          { transform: [{ rotate: swipeRingRotation }] },
                        ]}
                      >
                        <View style={styles.swipeUpRingDot} />
                      </Animated.View>
                    </Animated.View>
                  ) : null}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.aiGlow,
                      {
                        opacity: glowOpacity,
                        transform: [{ scale: glowScale }],
                      },
                    ]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.aiImpulseGlow,
                      {
                        opacity: impulseOpacity,
                        transform: [{ scale: impulseScale }],
                      },
                    ]}
                  />
                  <View style={styles.fabWrap} {...panResponder.panHandlers}>
                    <View style={styles.fab}>
                      <Image
                        source={require('../../assets/ai-button-logo.png')}
                        style={styles.aiIcon}
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                  <Text style={styles.fabLabel}>AI</Text>
                </View>
              );
            }
            const isActive = currentRouteName === item.screen;
            return (
              <TouchableOpacity
                key={item.screen}
                style={styles.navItem}
                activeOpacity={0.7}
                onPress={() => handleNavigate(item.screen)}
              >
                <Ionicons
                  name={item.icon}
                  size={24}
                  color={isActive ? '#C8102E' : '#9CA3AF'}
                />
                <Text
                  style={[
                    styles.navLabel,
                    isActive && styles.navLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {/* Khalid overlay: Siri/Gemini-style assistant over the whole app */}
      <Modal visible={showKhalidOverlay} transparent animationType="none">
        <KeyboardAvoidingView
          style={styles.khalidRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={closeKhalidOverlay}>
            <Animated.View
              style={[
                styles.khalidBackdrop,
                {
                  opacity: khalidBackdropOpacity,
                  transform: [{ scale: khalidBackdropScale }],
                },
              ]}
            >
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.khalidBackdropDim} />
            </Animated.View>
          </TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.khalidContentWrap,
              {
                paddingTop: insets.top + 6,
                paddingBottom: insets.bottom + 6,
                opacity: khalidContentOpacity,
                transform: [{ scale: khalidContentScale }],
              },
            ]}
          >
            <View style={styles.khalidContentBlur}>
              <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.khalidContentOverlay} />
            </View>
            <View style={styles.khalidHeader}>
              <View style={styles.khalidHeaderLeft}>
                <View style={styles.khalidHeaderAvatar}>
                  <Ionicons name="sparkles" size={20} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.khalidHeaderTitle}>Khalid</Text>
                  <Text style={styles.khalidHeaderSubtitle}>Your Bahrain guide</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={closeKhalidOverlay}
                style={styles.khalidCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <FlatList
              ref={khalidListRef}
              data={khalidMessages}
              keyExtractor={(item) => item.id}
              renderItem={renderKhalidItem}
              ListFooterComponent={renderTypingIndicator}
              contentContainerStyle={styles.khalidMessagesContent}
              onContentSizeChange={scrollKhalidToEnd}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />

            {khalidError ? (
              <View style={styles.khalidErrorBar}>
                <Ionicons name="warning-outline" size={18} color="#FCA5A5" />
                <Text style={styles.khalidErrorText} numberOfLines={2}>{khalidError}</Text>
              </View>
            ) : null}

            {!khalidLoading && !khalidMessages.some((m) => m.role === 'user') ? (
              <View style={styles.khalidSuggestionsWrap}>
                <Text style={styles.khalidSuggestionsLabel}>Suggestions</Text>
                <View style={styles.khalidSuggestionsRow}>
                  {getSmartSuggestions(generalLabels, activityLabels, foodLabels).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.khalidSuggestionChip}
                      onPress={() => sendMessageWithText(s)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.khalidSuggestionChipText} numberOfLines={1}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.khalidInputWrap}>
              <TextInput
                style={styles.khalidInput}
                placeholder="What can I help you with?"
                placeholderTextColor="rgba(148,163,184,0.85)"
                value={khalidInput}
                onChangeText={setKhalidInput}
                editable={!khalidLoading}
                onSubmitEditing={sendKhalidMessage}
                returnKeyType="send"
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[
                  styles.khalidSendBtn,
                  (!khalidInput.trim() || khalidLoading) && styles.khalidSendBtnDisabled,
                ]}
                onPress={sendKhalidMessage}
                disabled={!khalidInput.trim() || khalidLoading}
                activeOpacity={0.8}
              >
                {khalidLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    left: 0,
    right: 0,
    bottom: 0,
    position: 'absolute',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  navLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#C8102E',
  },
  aiContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  aiGlow: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.3)',
    backgroundColor: 'rgba(17,24,39,0.08)',
  },
  aiImpulseGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.25)',
    backgroundColor: 'rgba(17,24,39,0.10)',
  },
  fabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeUpRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeUpRingTrack: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: 'rgba(200,16,46,0.45)',
    backgroundColor: 'transparent',
  },
  swipeUpRingFillWrap: {
    position: 'absolute',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  swipeUpRingDot: {
    position: 'absolute',
    top: 2,
    left: 32,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8102E',
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  khalidRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  khalidBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  khalidBackdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  khalidContentWrap: {
    flex: 1,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  khalidContentBlur: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  khalidContentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,41,59,0.35)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  khalidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
  },
  khalidHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  khalidHeaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(200,16,46,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  khalidHeaderTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#F9FAFB',
    letterSpacing: 0.2,
  },
  khalidHeaderSubtitle: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.9)',
    marginTop: 2,
    fontWeight: '400',
  },
  khalidCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidMessagesContent: {
    flexGrow: 1,
    paddingVertical: 16,
    paddingBottom: 24,
  },
  khalidMessageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  khalidMessageRowUser: {
    justifyContent: 'flex-end',
  },
  khalidMessageRowAssistant: {
    justifyContent: 'flex-start',
  },
  khalidAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(200,16,46,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginBottom: 4,
  },
  khalidBubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  khalidBubbleUser: {
    backgroundColor: 'rgba(51,65,85,0.92)',
    borderBottomRightRadius: 6,
    borderWidth: 0,
  },
  khalidBubbleAssistant: {
    backgroundColor: 'rgba(51,65,85,0.75)',
    borderBottomLeftRadius: 6,
    borderWidth: 0,
  },
  khalidTypingBubble: {
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  khalidSiriOrbWrap: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khalidSiriOrb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(200,16,46,0.85)',
  },
  khalidTypingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  khalidTypingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(200,16,46,0.6)',
  },
  khalidCardAnimatedWrap: {
    maxWidth: '88%',
  },
  khalidCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  khalidCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 2,
    marginLeft: 16,
    marginTop: 12,
    backgroundColor: 'rgba(200,16,46,0.12)',
    borderRadius: 10,
  },
  khalidCardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(200,16,46,0.95)',
    letterSpacing: 0.5,
  },
  khalidCardContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    alignItems: 'flex-start',
    gap: 12,
  },
  khalidCardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  khalidCardLoaderDots: {
    flexDirection: 'row',
    gap: 6,
  },
  khalidCardLoaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(200,16,46,0.6)',
  },
  khalidCardLoadingText: {
    fontSize: 14,
    color: 'rgba(203,213,225,0.9)',
    marginLeft: 10,
    fontWeight: '500',
  },
  khalidCardErrorContent: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  khalidCardErrorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(248,113,113,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  khalidCardErrorText: {
    fontSize: 14,
    color: '#FCA5A5',
    textAlign: 'center',
  },
  khalidCardSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.9)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  khalidCardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingRight: 4,
  },
  khalidCardLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C8102E',
  },
  khalidCardPostBlock: {
    width: '100%',
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.08)',
  },
  khalidCardPostBlockLast: {
    marginBottom: 0,
  },
  khalidCardPostImageWrap: {
    width: '100%',
    height: 168,
    position: 'relative',
    overflow: 'hidden',
  },
  khalidCardPostImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  khalidCardPostImageShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: 'rgba(15,23,42,0.7)',
  },
  khalidCardPostBody: {
    width: '100%',
    padding: 12,
    gap: 4,
  },
  khalidCardPostTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  khalidCardPostDesc: {
    fontSize: 13,
    color: 'rgba(203,213,225,0.88)',
    lineHeight: 19,
  },
  khalidCardReviewsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  khalidCardNoReviews: {
    fontSize: 14,
    color: 'rgba(203,213,225,0.75)',
    fontStyle: 'italic',
  },
  khalidCardReviewBlock: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
    marginBottom: 10,
  },
  khalidCardReviewImage: {
    width: '100%',
    height: 110,
    backgroundColor: 'rgba(30,41,59,0.5)',
  },
  khalidCardReviewContent: {
    padding: 12,
    gap: 6,
  },
  khalidCardReviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  khalidCardReviewRatingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
  },
  khalidCardReviewBody: {
    fontSize: 13,
    color: 'rgba(203,213,225,0.9)',
    lineHeight: 19,
  },
  khalidCardEmptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  khalidCardEmptyText: {
    fontSize: 14,
    color: 'rgba(148,163,184,0.85)',
  },
  khalidBubbleText: {
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: 0.2,
  },
  khalidBubbleTextUser: {
    color: '#F8FAFC',
  },
  khalidBubbleTextAssistant: {
    color: '#F1F5F9',
  },
  khalidInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.12)',
  },
  khalidInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 23,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 13 : 11,
    paddingBottom: Platform.OS === 'ios' ? 13 : 11,
    fontSize: 16,
    color: '#F8FAFC',
    borderWidth: 0,
  },
  khalidSendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(200,16,46,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#C8102E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  khalidSendBtnDisabled: {
    backgroundColor: '#475569',
    opacity: 0.9,
  },
  khalidErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  khalidErrorText: {
    fontSize: 13,
    color: '#FCA5A5',
    flex: 1,
    lineHeight: 18,
  },
  khalidSuggestionsWrap: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.1)',
  },
  khalidSuggestionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.8)',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  khalidSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  khalidSuggestionChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 0,
  },
  khalidSuggestionChipText: {
    fontSize: 14,
    color: '#E2E8F0',
    fontWeight: '500',
  },
});

