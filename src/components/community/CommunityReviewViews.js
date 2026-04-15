import React, { useEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
  Pressable,
} from 'react-native'
import { ScrollView as GHScrollView } from 'react-native-gesture-handler'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { colors as themeColors, colorsDark as themeColorsDark } from '../../theme/designTokens'
import { useTheme } from '../../context/ThemeContext'
import { PinchZoomPostImage } from '../FeedUpvoteInteractions'

export function getCommunityPalette(isDark) {
  const tc = isDark ? themeColorsDark : themeColors
  return {
    bg: isDark ? '#000000' : '#FFFFFF',
    card: isDark ? '#000000' : '#FFFFFF',
    text: isDark ? '#E7E9EA' : '#0F1419',
    sub: isDark ? '#71767B' : '#536471',
    muted: isDark ? '#71767B' : '#536471',
    border: isDark ? '#2F3336' : '#EFF3F4',
    red: tc.error,
    redSoft: tc.errorMuted,
    orange: tc.morning,
    orangeSoft: tc.warningMuted,
    blue: '#1D9BF0',
    blueSoft: tc.primaryMuted,
    green: '#00BA7C',
    upvoteLight: tc.success,
    upvoteDark: isDark ? '#10B981' : '#047857',
    chip: isDark ? '#16181C' : '#F7F9F9',
    chipActive: tc.textPrimary,
    accent: isDark ? '#CBD5E1' : tc.textSecondary,
    warmGlow: tc.textMuted,
  }
}

const TOTAL_STARS = 5

export function CommunityReviewRatingStars({ rating, size = 12, color, mutedColor }) {
  if (rating == null || rating <= 0) return null
  const r = Math.min(5, Math.max(0, Number(rating)))
  const starColor = color ?? themeColors.morning
  const emptyColor = mutedColor ?? themeColors.textMuted
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: TOTAL_STARS }, (_, i) => {
        const starValue = i + 1
        const filled = r >= starValue
        const half = !filled && r >= starValue - 0.5
        const name = filled ? 'star' : half ? 'star-half' : 'star-outline'
        return (
          <Ionicons key={i} name={name} size={size} color={filled || half ? starColor : emptyColor} />
        )
      })}
    </View>
  )
}

export function buildCommunityFeedStyles(C, isDark = false) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    cardGlassOuter: {
      marginHorizontal: 16,
      marginBottom: 14,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(148,148,158,0.28)' : 'rgba(142,142,147,0.22)',
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
    cardGlassFrost: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.78)',
    },
    cardGlassFrostDark: {
      backgroundColor: 'rgba(28,28,30,0.88)',
    },
    cardGlassContent: {
      position: 'relative',
      zIndex: 2,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    cardInner: { flex: 1 },
    cardClientRow: { 
      flexDirection: 'row', 
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    clientAv: { 
      width: 40, 
      height: 40, 
      borderRadius: 20, 
      backgroundColor: C.chip, 
      marginRight: 12, 
      overflow: 'hidden',
    },
    clientAvPlaceholder: { 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: C.redSoft,
    },
    cardClientMeta: { flex: 1, minWidth: 0 },
    placeAndTagsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 2,
    },
    clientPlaceText: { 
      fontSize: 15, 
      fontWeight: '700', 
      color: C.text,
      flexShrink: 0,
    },
    cardTopicRowInline: {
      flexDirection: 'row',
      gap: 4,
      flexShrink: 1,
    },
    cardTopicPillSmall: {
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    cardTopicPillTextSmall: {
      fontSize: 13,
      fontWeight: '400',
      color: C.blue,
    },
    cardAuthorSub: { 
      fontSize: 15, 
      color: C.sub, 
      fontWeight: '400',
    },
    cardRatingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 4,
    },
    cardRatingNum: { 
      fontSize: 13, 
      fontWeight: '400', 
      marginLeft: 2, 
      color: C.sub,
    },
    bodyText: { 
      fontSize: 15, 
      lineHeight: 20, 
      color: C.text,
      marginBottom: 12,
      fontWeight: '400',
    },
    cardTopicRow: { 
      flexDirection: 'row', 
      flexWrap: 'wrap', 
      gap: 8, 
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    cardTopicPill: { 
      backgroundColor: C.chipActive + '12',
      paddingHorizontal: 12, 
      paddingVertical: 6, 
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.chipActive + '18',
    },
    cardTopicPillText: { 
      fontSize: 12, 
      fontWeight: '700', 
      color: C.red,
      letterSpacing: 0.2,
    },
    cardImgWrap: { 
      overflow: 'hidden', 
      backgroundColor: C.chip, 
      position: 'relative',
      width: '100%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
    },
    cardImg: { width: '100%', height: '100%' },
    cardImgPills: {
      position: 'absolute',
      bottom: 12,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    cardImgPill: { 
      width: 6, 
      height: 6, 
      borderRadius: 3, 
      backgroundColor: 'rgba(255,255,255,0.6)',
    },
    cardImgPillActive: { 
      backgroundColor: '#FFF', 
      width: 20, 
      borderRadius: 3,
    },
    imgCountBadge: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: 'rgba(0,0,0,0.7)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
    },
    imgCountText: { 
      color: '#FFF', 
      fontSize: 11, 
      fontWeight: '600',
      marginLeft: 4,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      marginTop: 12,
    },
    actionPill: {
      flex: 1,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
      borderRadius: 16,
      backgroundColor: C.chip,
      borderWidth: 1.5,
      borderColor: C.border + '55',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
        },
        android: { elevation: 1 },
      }),
    },
    actionPillUpvote: {
      borderColor: C.green,
      backgroundColor: 'transparent',
    },
    actionPillUpvoteOn: {
      backgroundColor: C.green,
      borderColor: C.green,
    },
    actionPillNum: {
      fontSize: 14,
      fontWeight: '800',
      color: C.text,
      letterSpacing: -0.2,
      minWidth: 18,
      textAlign: 'center',
    },
    actionPillNumOn: {
      color: '#FFFFFF',
    },
    actionPillNumMuted: {
      color: C.sub,
      fontWeight: '700',
    },
    feed: { 
      paddingHorizontal: 0, 
      paddingTop: 0,
      paddingBottom: 110,
    },
    popOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    popCard: {
      backgroundColor: C.card,
      borderRadius: 24,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.3,
      shadowRadius: 24,
      elevation: 24,
    },
    popHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      paddingTop: 16,
      backgroundColor: C.card,
      borderBottomWidth: 1,
      borderBottomColor: C.border + '50',
    },
    popHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    popHeaderAv: { 
      width: 44, 
      height: 44, 
      borderRadius: 22, 
      backgroundColor: C.chip, 
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: C.border,
    },
    popHeaderAvPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.redSoft },
    popHeaderName: { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
    popHeaderSub: { fontSize: 12, color: C.sub, fontWeight: '500', marginTop: 2 },
    popPlaceRatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    popPlaceWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
    popImgWrap: { position: 'relative', overflow: 'hidden', backgroundColor: C.chip },
    popImgPills: {
      position: 'absolute',
      bottom: 10,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
    },
    popImgPill: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
    popImgPillActive: { backgroundColor: '#FFF', width: 18, borderRadius: 3 },
    popImgBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    popImgBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    popBody: { paddingHorizontal: 20, paddingTop: 20 },
    popRatingWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    popRatingNum: { fontSize: 13, fontWeight: '700', color: C.sub },
    popPlaceText: { fontSize: 14, fontWeight: '700', color: C.red },
    popReviewText: {
      fontSize: 16,
      lineHeight: 26,
      color: C.text,
      marginTop: 16,
    },
    popUpvoteRow: { marginTop: 16, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    popUpvoteBtn: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 52,
      paddingVertical: 4,
    },
    popUpvoteNum: { fontSize: 15, fontWeight: '800', color: C.muted },
    likeCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: C.green,
      backgroundColor: 'transparent',
    },
    likeCircleActive: {
      backgroundColor: C.green,
      borderColor: C.green,
    },
    popReplySection: { marginTop: 20, paddingTop: 16, marginBottom: 14, borderTopWidth: 1, borderTopColor: C.border + '50' },
    popReplyTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 12 },
    popReplyBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.bg,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    popReplyAv: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.chip,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    popReplyInput: { flex: 1, fontSize: 13, color: C.text, paddingVertical: 0, minHeight: 20 },
    empty: { paddingVertical: 72, alignItems: 'center', paddingHorizontal: 32 },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.chip,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 6 },
    emptySub: { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22 },
  })
}

export function CommunityReviewCard({
  item,
  C,
  styles: st,
  onPress,
  onCommentPress,
  onUpvoteToggle,
  upvoteScaleAnim,
  expandBody = false,
  hideCardBottomBorder = false,
  useGlass = true,
}) {
  const { isDark } = useTheme()
  const { width = 375 } = useWindowDimensions()
  const cardWidth = useGlass ? width - 64 : width - 32
  const imgH = Math.round(cardWidth * 0.75)
  const [imageIndex, setImageIndex] = useState(0)
  const hasUpvoted = item.upvoted ?? false
  const count = item.upvotes ?? 0
  const commentCount = item.comments ?? 0

  const images = item.images?.length > 0 ? item.images : item.image ? [item.image] : []

  const upvoteAnimScale = useRef(new Animated.Value(0)).current
  const upvoteAnimOpacity = useRef(new Animated.Value(0)).current
  const upvoteAnimTranslateY = useRef(new Animated.Value(0)).current

  const animateUpvoteBurst = () => {
    upvoteAnimScale.setValue(0)
    upvoteAnimOpacity.setValue(0)
    upvoteAnimTranslateY.setValue(0)
    Animated.parallel([
      Animated.spring(upvoteAnimScale, {
        toValue: 1.5,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(upvoteAnimOpacity, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(400),
        Animated.timing(upvoteAnimOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(upvoteAnimTranslateY, {
        toValue: -50,
        duration: 850,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()
  }

  useEffect(() => {
    setImageIndex(0)
  }, [item.id])

  const handleUpvotePress = (e) => {
    if (!onUpvoteToggle) return
    if (!hasUpvoted) {
      animateUpvoteBurst()
    }
    onUpvoteToggle(item, e)
  }

  const handleImageDoubleTap = (pageX, pageY) => {
    if (!onUpvoteToggle) return
    if (!hasUpvoted) {
      animateUpvoteBurst()
    }
    onUpvoteToggle(item, { nativeEvent: { pageX, pageY } })
  }

  const topicIds = (item.topic || '').split(',').map((t) => t.trim()).filter(Boolean)
  const clientProfilePic = item.client_image || null
  const hasClientProfilePic = !!clientProfilePic

  const cardShellStyle = [
    st.card,
    hideCardBottomBorder ? { borderBottomWidth: 0 } : null,
  ]

  const glassLayers = (
    <>
      <BlurView
        intensity={Platform.OS === 'ios' ? 52 : 32}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View
        style={[st.cardGlassFrost, isDark && st.cardGlassFrostDark]}
        pointerEvents="none"
      />
    </>
  )

  const inner = (
    <>
        {/* Author header */}
        <View style={st.cardClientRow}>
          {hasClientProfilePic ? (
            <Image source={{ uri: clientProfilePic }} style={st.clientAv} resizeMode="cover" />
          ) : (
            <View style={[st.clientAv, st.clientAvPlaceholder]}>
              <Ionicons name="storefront" size={24} color={C.red} />
            </View>
          )}
          <View style={st.cardClientMeta}>
            <View style={st.placeAndTagsRow}>
              <Text style={st.clientPlaceText} numberOfLines={1}>{item.place || 'A place in Bahrain'}</Text>
              {topicIds.length > 0 && (
                <View style={st.cardTopicRowInline}>
                  {topicIds.slice(0, 2).map((tid) => (
                    <View key={tid} style={st.cardTopicPillSmall}>
                      <Text style={st.cardTopicPillTextSmall}>#{tid}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <Text style={st.cardAuthorSub} numberOfLines={1}>by {item.author}</Text>
            {item.rating != null && item.rating > 0 && (
              <View style={st.cardRatingPill}>
                <CommunityReviewRatingStars rating={item.rating} size={12} color="#F59E0B" mutedColor={C.muted} />
                <Text style={st.cardRatingNum}>{Number(item.rating).toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Review text */}
        <Text style={st.bodyText} numberOfLines={expandBody ? undefined : 3}>{item.body}</Text>

        {/* Images - prominent and full width */}
        {images.length > 0 && (
          <View style={[st.cardImgWrap, { height: imgH }]}>
            {images.length === 1 ? (
              <View style={{ flex: 1, width: '100%', height: imgH }} collapsable={false}>
                <PinchZoomPostImage
                  uri={images[0]}
                  style={[st.cardImg, { width: '100%', height: imgH }]}
                  resizeMode="contain"
                  pinchEnabled
                  onImageDoubleTap={handleImageDoubleTap}
                />
                <Animated.View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: upvoteAnimOpacity,
                      transform: [
                        { scale: upvoteAnimScale },
                        { translateY: upvoteAnimTranslateY },
                      ],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Ionicons name="arrow-up-circle" size={100} color="#FFFFFF" />
                </Animated.View>
              </View>
            ) : (
              <>
                <GHScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / cardWidth)
                    setImageIndex(i)
                  }}
                  onScrollEndDrag={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / cardWidth)
                    setImageIndex(i)
                  }}
                  style={{ width: cardWidth, height: imgH }}
                  contentContainerStyle={{ width: cardWidth * images.length }}
                >
                  {images.map((uri, i) => (
                    <View key={i} style={{ width: cardWidth, height: imgH }}>
                      <PinchZoomPostImage
                        uri={uri}
                        style={{ width: cardWidth, height: imgH }}
                        resizeMode="contain"
                        pinchEnabled={false}
                        onImageDoubleTap={handleImageDoubleTap}
                      />
                    </View>
                  ))}
                </GHScrollView>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: upvoteAnimOpacity,
                      transform: [
                        { scale: upvoteAnimScale },
                        { translateY: upvoteAnimTranslateY },
                      ],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Ionicons name="arrow-up-circle" size={100} color="#FFFFFF" />
                </Animated.View>
                {images.length > 1 && (
                  <View style={st.cardImgPills}>
                    {images.map((_, i) => (
                      <View key={i} style={[st.cardImgPill, i === imageIndex && st.cardImgPillActive]} />
                    ))}
                  </View>
                )}
                {images.length > 1 && (
                  <View style={st.imgCountBadge}>
                    <Ionicons name="images" size={12} color="#FFF" />
                    <Text style={st.imgCountText}>{imageIndex + 1}/{images.length}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Action bar — equal-width tappable pills */}
        <View style={st.actions}>
          {(() => {
            const upvotePillBtn = (
              <TouchableOpacity
                style={[st.actionPill, st.actionPillUpvote, hasUpvoted && st.actionPillUpvoteOn]}
                activeOpacity={0.88}
                onPress={handleUpvotePress}
                accessibilityRole="button"
                accessibilityLabel={`Upvote, ${count}`}
                accessibilityState={{ selected: hasUpvoted }}
              >
                <Ionicons
                  name={hasUpvoted ? 'arrow-up-circle' : 'arrow-up'}
                  size={20}
                  color={hasUpvoted ? '#FFFFFF' : C.green}
                />
                <Text style={[st.actionPillNum, hasUpvoted && st.actionPillNumOn]}>{count}</Text>
              </TouchableOpacity>
            )
            if (upvoteScaleAnim != null) {
              return (
                <Animated.View style={{ flex: 1, transform: [{ scale: upvoteScaleAnim }] }}>
                  {upvotePillBtn}
                </Animated.View>
              )
            }
            return <View style={{ flex: 1 }}>{upvotePillBtn}</View>
          })()}
          <TouchableOpacity
            style={st.actionPill}
            activeOpacity={0.88}
            onPress={() => onCommentPress?.(item)}
            accessibilityRole="button"
            accessibilityLabel={`Comments, ${commentCount}`}
          >
            <Ionicons name="chatbubble-outline" size={20} color={C.text} />
            <Text style={[st.actionPillNum, commentCount === 0 && st.actionPillNumMuted]}>{commentCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={st.actionPill}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Share"
          >
            <Ionicons name="paper-plane-outline" size={20} color={C.text} />
          </TouchableOpacity>
        </View>
    </>
  )

  if (useGlass) {
    if (onPress) {
      return (
        <Pressable
          style={({ pressed }) => [
            st.cardGlassOuter,
            pressed && { opacity: 0.94 },
          ]}
          onPress={() => onPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`Open post: ${item.place || 'Community review'}`}
        >
          {glassLayers}
          <View style={st.cardGlassContent}>
            <View style={st.cardInner}>{inner}</View>
          </View>
        </Pressable>
      )
    }
    return (
      <View style={st.cardGlassOuter}>
        {glassLayers}
        <View style={st.cardGlassContent}>
          <View style={st.cardInner}>{inner}</View>
        </View>
      </View>
    )
  }

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [cardShellStyle, pressed && { opacity: 0.94 }]}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open post: ${item.place || 'Community review'}`}
      >
        <View style={st.cardInner}>{inner}</View>
      </Pressable>
    )
  }

  return (
    <View style={cardShellStyle}>
      <View style={st.cardInner}>{inner}</View>
    </View>
  )
}

export function CommunityReviewDetailModal({
  post,
  C,
  styles: st,
  onClose,
  onUpvoteToggle,
  upvoteScaleAnim,
  focusReplyWhenOpen = false,
  onClearFocusReply,
}) {
  const insets = useSafeAreaInsets()
  const { width = 375, height = 667 } = useWindowDimensions()
  const cardMargin = 24
  const cardW = width - cardMargin * 2
  const imgW = cardW
  const imgH = Math.round(imgW * 0.6)
  const popupMaxHeight = height * 0.88
  const popupCardHeaderH = 54
  const [imageIndex, setImageIndex] = useState(0)
  const [cardHeight, setCardHeight] = useState(popupMaxHeight)
  const [replyText, setReplyText] = useState('')
  const imageScrollRef = useRef(null)
  const replyInputRef = useRef(null)
  const hasUpvoted = post?.upvoted ?? false
  const count = post?.upvotes ?? 0
  const commentCount = post?.comments ?? 0

  const upvoteAnimScale = useRef(new Animated.Value(0)).current
  const upvoteAnimOpacity = useRef(new Animated.Value(0)).current
  const upvoteAnimTranslateY = useRef(new Animated.Value(0)).current

  const animateUpvoteBurst = () => {
    upvoteAnimScale.setValue(0)
    upvoteAnimOpacity.setValue(0)
    upvoteAnimTranslateY.setValue(0)
    Animated.parallel([
      Animated.spring(upvoteAnimScale, {
        toValue: 1.5,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(upvoteAnimOpacity, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(400),
        Animated.timing(upvoteAnimOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(upvoteAnimTranslateY, {
        toValue: -50,
        duration: 850,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()
  }

  useEffect(() => {
    setImageIndex(0)
    setCardHeight(popupMaxHeight)
    setReplyText('')
  }, [post?.id, popupMaxHeight])

  useEffect(() => {
    if (post && focusReplyWhenOpen && replyInputRef.current) {
      const t = setTimeout(() => {
        replyInputRef.current?.focus()
        onClearFocusReply?.()
      }, 400)
      return () => clearTimeout(t)
    }
  }, [post?.id, focusReplyWhenOpen, onClearFocusReply])

  if (!post) return null

  const images = post.images?.length > 0 ? post.images : post.image ? [post.image] : []

  const handleUpvotePress = (e) => {
    if (!onUpvoteToggle) return
    if (!hasUpvoted) {
      animateUpvoteBurst()
    }
    onUpvoteToggle(post, e)
  }

  const handleImageDoubleTap = (pageX, pageY) => {
    if (!onUpvoteToggle) return
    if (!hasUpvoted) {
      animateUpvoteBurst()
    }
    onUpvoteToggle(post, { nativeEvent: { pageX, pageY } })
  }

  return (
    <Modal visible={!!post} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.popOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={[st.popOverlay, { flex: 1 }]} collapsable={false}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} />
              )}
            </View>
          </TouchableWithoutFeedback>

          <View style={[st.popCard, { width: cardW, height: cardHeight, maxHeight: popupMaxHeight, zIndex: 10 }]}>
            <View style={st.popHeader}>
              <View style={st.popHeaderLeft}>
                {post.client_image ? (
                  <Image source={{ uri: post.client_image }} style={st.popHeaderAv} resizeMode="cover" />
                ) : (
                  <View style={[st.popHeaderAv, st.popHeaderAvPlaceholder]}>
                    <Ionicons name="storefront" size={20} color={C.red} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.popHeaderName} numberOfLines={1}>{post.place || 'A place in Bahrain'}</Text>
                  <Text style={st.popHeaderSub} numberOfLines={1}>by {post.author}</Text>
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
                const total = popupCardHeaderH + contentH
                setCardHeight(Math.min(total, popupMaxHeight))
              }}
            >
              {images.length > 0 ? (
                <View style={[st.popImgWrap, { width: cardW, height: imgH }]}>
                  {images.length === 1 ? (
                    <View style={{ flex: 1, width: cardW, height: imgH }} collapsable={false}>
                      <PinchZoomPostImage
                        uri={images[0]}
                        style={{ width: imgW, height: imgH }}
                        resizeMode="contain"
                        pinchEnabled
                        onImageDoubleTap={handleImageDoubleTap}
                      />
                      <Animated.View
                        style={[
                          StyleSheet.absoluteFillObject,
                          {
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: upvoteAnimOpacity,
                            transform: [
                              { scale: upvoteAnimScale },
                              { translateY: upvoteAnimTranslateY },
                            ],
                          },
                        ]}
                        pointerEvents="none"
                      >
                        <Ionicons name="arrow-up-circle" size={100} color="#FFFFFF" />
                      </Animated.View>
                    </View>
                  ) : (
                    <>
                      <ScrollView
                        ref={imageScrollRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) => {
                          const i = Math.round(e.nativeEvent.contentOffset.x / imgW)
                          setImageIndex(i)
                        }}
                        style={{ width: cardW, height: imgH }}
                      >
                        {images.map((uri, i) => (
                          <View key={i} style={{ width: imgW, height: imgH }}>
                            <PinchZoomPostImage
                              uri={uri}
                              style={{ width: imgW, height: imgH }}
                              resizeMode="contain"
                              pinchEnabled={false}
                              onImageDoubleTap={handleImageDoubleTap}
                            />
                          </View>
                        ))}
                      </ScrollView>
                      <Animated.View
                        style={[
                          StyleSheet.absoluteFillObject,
                          {
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: upvoteAnimOpacity,
                            transform: [
                              { scale: upvoteAnimScale },
                              { translateY: upvoteAnimTranslateY },
                            ],
                          },
                        ]}
                        pointerEvents="none"
                      >
                        <Ionicons name="arrow-up-circle" size={100} color="#FFFFFF" />
                      </Animated.View>
                    </>
                  )}
                  {images.length > 1 && (
                    <View style={st.popImgPills}>
                      {images.map((_, i) => (
                        <View key={i} style={[st.popImgPill, i === imageIndex && st.popImgPillActive]} />
                      ))}
                    </View>
                  )}
                  <View style={st.popImgBadge}>
                    <Ionicons name="images-outline" size={13} color="#FFF" />
                    <Text style={st.popImgBadgeText}>{imageIndex + 1}/{images.length}</Text>
                  </View>
                </View>
              ) : null}

              <View style={st.popBody}>
                <View style={st.popPlaceRatingRow}>
                  {post.place ? (
                    <View style={st.popPlaceWrap}>
                      <Ionicons name="location-sharp" size={13} color={C.red} />
                      <Text style={st.popPlaceText} numberOfLines={1}>{post.place}</Text>
                    </View>
                  ) : null}
                  {post.rating != null && post.rating > 0 && (
                    <View style={st.popRatingWrap}>
                      <CommunityReviewRatingStars rating={post.rating} size={13} color={C.sub} mutedColor={C.muted} />
                      <Text style={st.popRatingNum}>{Number(post.rating).toFixed(1)}</Text>
                    </View>
                  )}
                </View>

                <Text style={st.popReviewText}>{post.body}</Text>

                <View style={st.popUpvoteRow}>
                  <TouchableOpacity onPress={handleUpvotePress} activeOpacity={0.88} style={st.popUpvoteBtn}>
                    {upvoteScaleAnim != null ? (
                      <Animated.View style={[
                        st.likeCircle,
                        hasUpvoted && st.likeCircleActive,
                        { transform: [{ scale: upvoteScaleAnim }] },
                      ]}>
                        <Ionicons
                          name={hasUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
                          size={20}
                          color={hasUpvoted ? '#FFF' : C.green}
                        />
                      </Animated.View>
                    ) : (
                      <View style={[st.likeCircle, hasUpvoted && st.likeCircleActive]}>
                        <Ionicons
                          name={hasUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
                          size={20}
                          color={hasUpvoted ? '#FFF' : C.green}
                        />
                      </View>
                    )}
                    <Text style={[st.popUpvoteNum, { color: hasUpvoted ? C.green : C.muted }]}>{count}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={st.popUpvoteBtn}
                    onPress={() => replyInputRef.current?.focus()}
                    accessibilityRole="button"
                    accessibilityLabel={`Comments, ${commentCount}`}
                  >
                    <View style={[st.likeCircle, { borderColor: C.border + 'AA', backgroundColor: C.chip }]}>
                      <Ionicons name="chatbubble-outline" size={20} color={C.text} />
                    </View>
                    <Text style={[st.popUpvoteNum, { color: commentCount > 0 ? C.text : C.muted }]}>{commentCount}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.88} style={st.popUpvoteBtn} accessibilityRole="button" accessibilityLabel="Share">
                    <View style={[st.likeCircle, { borderColor: C.border + 'AA', backgroundColor: C.chip }]}>
                      <Ionicons name="paper-plane-outline" size={20} color={C.text} />
                    </View>
                    <View style={{ height: 18 }} />
                  </TouchableOpacity>
                </View>

                <View style={[st.popReplySection, { paddingBottom: (insets?.bottom ?? 0) + 8 }]}>
                  <Text style={st.popReplyTitle}>Replies</Text>
                  <View style={st.popReplyBox}>
                    <View style={st.popReplyAv}>
                      <Ionicons name="person" size={14} color={C.muted} />
                    </View>
                    <TextInput
                      ref={replyInputRef}
                      style={st.popReplyInput}
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
  )
}
