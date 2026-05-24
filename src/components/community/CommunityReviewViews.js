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
import { layoutContentWidth } from '../../constants/webLayout'
import { PinchZoomPostImage } from '../FeedUpvoteInteractions'
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_MEDIUM,
  FONT_POPPINS_REGULAR,
  FONT_POPPINS_SEMIBOLD,
} from '../../constants/brandFont'
import { CommunityUserTypeBadge } from './CommunityUserTypeBadge'

export function getCommunityPalette(isDark) {
  const tc = isDark ? themeColorsDark : themeColors
  return {
    bg: tc.background,
    card: tc.background,
    text: isDark ? '#E7E9EA' : '#0F1419',
    sub: isDark ? '#C7C7CC' : '#536471',
    muted: isDark ? '#8E8E93' : '#536471',
    border: tc.border,
    red: tc.error,
    redSoft: tc.errorMuted,
    orange: tc.morning,
    orangeSoft: tc.warningMuted,
    blue: '#1D9BF0',
    blueSoft: tc.primaryMuted,
    green: '#00BA7C',
    upvoteLight: tc.success,
    upvoteDark: isDark ? '#10B981' : '#047857',
    chip: isDark ? tc.surface : '#F7F9F9',
    chipActive: tc.textPrimary,
    accent: isDark ? '#C7C7CC' : tc.textSecondary,
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
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(148,148,158,0.22)' : 'rgba(142,142,147,0.16)',
      ...Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.2 : 0.07,
          shadowRadius: 16,
        },
        android: { elevation: 3 },
      }),
    },
    cardGlassFrost: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(18,18,20,0.92)' : 'rgba(255,255,255,0.9)',
    },
    cardGlassFrostDark: {
      backgroundColor: 'rgba(18,18,20,0.92)',
    },
    cardGlassContent: {
      position: 'relative',
      zIndex: 2,
      paddingTop: 12,
      paddingBottom: 10,
      paddingHorizontal: 14,
    },
    cardInner: { flex: 1 },
    // User-focused header row
    cardUserRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    userAv: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginRight: 10,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    userAvImage: {
      width: '100%',
      height: '100%',
      borderRadius: 18,
    },
    cardUserMeta: { flex: 1, minWidth: 0 },
    cardUserNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexWrap: 'wrap',
    },
    cardUserName: {
      fontSize: 14,
      fontFamily: FONT_POPPINS_BOLD,
      color: C.text,
      flexShrink: 1,
    },
    cardDot: {
      fontSize: 13,
      fontFamily: FONT_POPPINS_REGULAR,
      color: C.muted,
    },
    cardTimeText: {
      fontSize: 11,
      color: C.muted,
      fontFamily: FONT_POPPINS_REGULAR,
      flexShrink: 0,
    },
    cardPlaceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingVertical: 4,
      paddingHorizontal: 4,
      marginHorizontal: -4,
      borderRadius: 6,
      flexShrink: 1,
      maxWidth: '100%',
    },
    cardPlaceText: {
      fontSize: 13,
      fontFamily: FONT_POPPINS_SEMIBOLD,
      color: C.red,
      flexShrink: 1,
      textDecorationLine: 'underline',
    },
    cardRatingInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    cardRatingNum: {
      fontSize: 11,
      fontFamily: FONT_POPPINS_SEMIBOLD,
      color: C.muted,
    },
    // Legacy aliases kept for compat
    cardClientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    clientAv: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.chip,
      marginRight: 10,
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
      fontSize: 14,
      fontFamily: FONT_POPPINS_BOLD,
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
      fontSize: 12,
      fontFamily: FONT_POPPINS_REGULAR,
      color: C.blue,
    },
    cardAuthorSub: {
      fontSize: 13,
      color: C.text,
      fontFamily: FONT_POPPINS_SEMIBOLD,
    },
    cardTimeSuffix: {
      fontSize: 13,
      fontFamily: FONT_POPPINS_REGULAR,
      color: C.sub,
    },
    cardRatingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 3,
    },
    bodyText: {
      fontSize: 14,
      lineHeight: 20,
      color: C.text,
      marginBottom: 8,
      fontFamily: FONT_POPPINS_REGULAR,
    },
    cardTopicRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    cardTopicPill: {
      backgroundColor: C.blue + '10',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    cardTopicPillText: {
      fontSize: 12,
      fontFamily: FONT_POPPINS_SEMIBOLD,
      color: C.blue,
      letterSpacing: 0.1,
    },
    cardImgWrap: {
      overflow: 'hidden',
      backgroundColor: isDark ? '#0D0D0D' : '#F0F2F4',
      position: 'relative',
      width: '100%',
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : C.border,
    },
    cardImg: { width: '100%', height: '100%' },
    cardImgPills: {
      position: 'absolute',
      bottom: 8,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
    },
    cardImgPill: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.6)',
    },
    cardImgPillActive: {
      backgroundColor: '#FFF',
      width: 16,
      borderRadius: 3,
    },
    imgCountBadge: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    imgCountText: {
      color: '#FFF',
      fontSize: 10,
      fontFamily: FONT_POPPINS_SEMIBOLD,
      marginLeft: 3,
    },
    // Flat action bar (Twitter/Reddit style)
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,20,25,0.08)',
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      minHeight: 42,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 20,
      marginRight: 10,
    },
    actionBtnUpvote: {},
    actionBtnUpvoteOn: {},
    actionNum: {
      fontSize: 12,
      fontFamily: FONT_POPPINS_SEMIBOLD,
      color: C.sub,
    },
    upvoteCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: C.green,
      backgroundColor: 'transparent',
    },
    upvoteCircleActive: {
      backgroundColor: C.green,
      borderColor: C.green,
    },
    actionNumOn: {
      color: C.green,
      fontFamily: FONT_POPPINS_BOLD,
    },
    actionNumMuted: {
      color: C.muted,
    },
    actionSpacer: { flex: 1 },
    // Keep pill aliases so detail modal still works
    actionPill: {
      flex: 1,
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
      borderRadius: 14,
      backgroundColor: C.chip,
      borderWidth: 1.5,
      borderColor: C.border + '55',
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
      fontFamily: FONT_POPPINS_BOLD,
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
      fontFamily: FONT_POPPINS_BOLD,
    },
    feed: {
      paddingHorizontal: 0,
      paddingTop: 10,
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
    popHeaderName: { fontSize: 16, fontFamily: FONT_POPPINS_BOLD, color: C.text, letterSpacing: -0.3 },
    popHeaderSub: { fontSize: 12, color: C.sub, fontFamily: FONT_POPPINS_MEDIUM, flexShrink: 1 },
    popHeaderSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
      flexWrap: 'wrap',
    },
    popHeaderSubAccent: { fontFamily: FONT_POPPINS_REGULAR, color: C.muted },
    popPlaceRatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    popPlaceWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
    popImgWrap: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: C.chip,
      alignSelf: 'center',
      borderRadius: 14,
    },
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
    popImgBadgeText: { color: '#FFF', fontSize: 12, fontFamily: FONT_POPPINS_BOLD },
    popBody: { paddingHorizontal: 20, paddingTop: 20 },
    popRatingWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    popRatingNum: { fontSize: 13, fontFamily: FONT_POPPINS_BOLD, color: C.sub },
    popPlaceText: { fontSize: 14, fontFamily: FONT_POPPINS_BOLD, color: C.red },
    popReviewText: {
      fontSize: 16,
      fontFamily: FONT_POPPINS_REGULAR,
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
    popUpvoteNum: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, color: C.muted },
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
    popReplyTitle: { fontSize: 15, fontFamily: FONT_POPPINS_BOLD, color: C.text, marginBottom: 12 },
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
    popReplyAvImage: {
      width: '100%',
      height: '100%',
      borderRadius: 13,
    },
    popReplyInput: { flex: 1, fontSize: 13, fontFamily: FONT_POPPINS_REGULAR, color: C.text, paddingVertical: 0, minHeight: 20 },
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
    emptyTitle: { fontSize: 18, fontFamily: FONT_POPPINS_BOLD, color: C.text, marginBottom: 6 },
    emptySub: { fontSize: 15, fontFamily: FONT_POPPINS_REGULAR, color: C.sub, textAlign: 'center', lineHeight: 22 },
  })
}

const DEFAULT_PROFILE_IMAGES = [
  require('../../../assets/pfp.png'),
  require('../../../assets/pfp2.png'),
]

const getDefaultAvatarSource = (seedValue) => {
  const seed = String(seedValue || '').trim()
  if (!seed) return DEFAULT_PROFILE_IMAGES[0]
  let hash = 5381
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i)
  }
  const normalized = Math.abs(hash + seed.length * 31)
  return normalized % 4 <= 1 ? DEFAULT_PROFILE_IMAGES[0] : DEFAULT_PROFILE_IMAGES[1]
}

export function CommunityReviewCard({
  item,
  C,
  styles: st,
  onPress,
  onTaggedClientPress,
  onCommentPress,
  onUpvoteToggle,
  upvoteScaleAnim,
  expandBody = false,
  hideCardBottomBorder = false,
  useGlass = true,
}) {
  const { isDark } = useTheme()
  const { width: winW = 375 } = useWindowDimensions()
  const layoutW = layoutContentWidth(winW)
  const cardWidth = useGlass ? layoutW - 48 : layoutW - 32
  const imgW = Math.round(cardWidth)
  const imgH = Math.round(imgW * 0.75)
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
    if (!hasUpvoted) animateUpvoteBurst()
    onUpvoteToggle(item, e)
  }

  const handleImageDoubleTap = (pageX, pageY) => {
    if (!onUpvoteToggle) return
    if (!hasUpvoted) animateUpvoteBurst()
    onUpvoteToggle(item, { nativeEvent: { pageX, pageY } })
  }

  const handleClientPress = () => {
    if (!onTaggedClientPress) return
    const clientId = item?.client_a_uuid || item?.clientId || null
    if (!clientId) return
    onTaggedClientPress({
      clientId,
      businessName: item.place || null,
    })
  }

  const canOpenClientProfile = Boolean(
    onTaggedClientPress && (item?.client_a_uuid || item?.clientId),
  )

  const avatarSource = getDefaultAvatarSource(`${item.author || item.user_a_uuid || 'user'}-${item.id || ''}`)

  const cardShellStyle = [
    st.card,
    hideCardBottomBorder ? { borderBottomWidth: 0 } : null,
  ]

  const glassLayers = (
    <>
      <BlurView
        intensity={Platform.OS === 'ios' ? 30 : 18}
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

  const cardHeader = (
    <View style={st.cardUserRow} pointerEvents="box-none">
      <View style={st.userAv}>
        <Image source={avatarSource} style={st.userAvImage} resizeMode="cover" />
      </View>
      <View style={st.cardUserMeta}>
        <View style={st.cardUserNameRow}>
          <Text style={st.cardUserName} numberOfLines={1}>{item.author || 'Explorer'}</Text>
          <CommunityUserTypeBadge uType={item.uType} compact />
          {item.place ? (
            <>
              <Text style={st.cardDot}>·</Text>
              {canOpenClientProfile ? (
                <TouchableOpacity
                  style={st.cardPlaceBtn}
                  onPress={handleClientPress}
                  activeOpacity={0.6}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open profile for ${item.place}`}
                >
                  <Ionicons name="location-sharp" size={11} color={C.red} />
                  <Text style={st.cardPlaceText} numberOfLines={1}>{item.place}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 }}>
                  <Ionicons name="location-sharp" size={11} color={C.red} />
                  <Text style={[st.cardPlaceText, { textDecorationLine: 'none' }]} numberOfLines={1}>{item.place}</Text>
                </View>
              )}
            </>
          ) : null}
          {item.rating != null && item.rating > 0 ? (
            <View style={st.cardRatingInline}>
              <Text style={st.cardDot}>·</Text>
              <CommunityReviewRatingStars rating={item.rating} size={10} color="#F59E0B" mutedColor={C.muted} />
              <Text style={st.cardRatingNum}>{Number(item.rating).toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )

  const cardMain = (
    <>
      <Text style={st.bodyText} numberOfLines={expandBody ? undefined : 3}>{item.body}</Text>

      {images.length > 0 && (
        <View style={[st.cardImgWrap, { width: imgW, height: imgH, marginBottom: 8 }]}>
          {images.length === 1 ? (
            <View style={{ width: imgW, height: imgH }} collapsable={false}>
              <PinchZoomPostImage
                uri={images[0]}
                style={[st.cardImg, { width: imgW, height: imgH }]}
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
                    transform: [{ scale: upvoteAnimScale }, { translateY: upvoteAnimTranslateY }],
                  },
                ]}
                pointerEvents="none"
              >
                <Ionicons name="arrow-up-circle" size={80} color="#FFFFFF" />
              </Animated.View>
            </View>
          ) : (
            <>
              <GHScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const i = Math.round(e.nativeEvent.contentOffset.x / imgW)
                  setImageIndex(i)
                }}
                onScrollEndDrag={(e) => {
                  const i = Math.round(e.nativeEvent.contentOffset.x / imgW)
                  setImageIndex(i)
                }}
                style={{ width: imgW, height: imgH }}
                contentContainerStyle={{ width: imgW * images.length }}
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
              </GHScrollView>
              <Animated.View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: upvoteAnimOpacity,
                    transform: [{ scale: upvoteAnimScale }, { translateY: upvoteAnimTranslateY }],
                  },
                ]}
                pointerEvents="none"
              >
                <Ionicons name="arrow-up-circle" size={80} color="#FFFFFF" />
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
                  <Ionicons name="images" size={10} color="#FFF" />
                  <Text style={st.imgCountText}>{imageIndex + 1}/{images.length}</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </>
  )

  const cardActions = (
      <View style={st.actions}>
        {(() => {
          const upvoteBtn = (
            <TouchableOpacity
              style={[st.actionBtn, st.actionBtnUpvote]}
              activeOpacity={0.8}
              onPress={handleUpvotePress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Upvote, ${count}`}
              accessibilityState={{ selected: hasUpvoted }}
            >
              <View style={[st.upvoteCircle, hasUpvoted && st.upvoteCircleActive]}>
                <Ionicons
                  name={hasUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
                  size={21}
                  color={hasUpvoted ? '#FFFFFF' : C.green}
                />
              </View>
              <Text style={[st.actionNum, hasUpvoted && st.actionNumOn]}>{count}</Text>
            </TouchableOpacity>
          )
          if (upvoteScaleAnim != null) {
            return <Animated.View style={{ transform: [{ scale: upvoteScaleAnim }] }}>{upvoteBtn}</Animated.View>
          }
          return upvoteBtn
        })()}

        <TouchableOpacity
          style={st.actionBtn}
          activeOpacity={0.8}
          onPress={() => onCommentPress?.(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Comments, ${commentCount}`}
        >
          <Ionicons name="chatbubble-outline" size={17} color={C.sub} />
          <Text style={[st.actionNum, commentCount === 0 && st.actionNumMuted]}>{commentCount}</Text>
        </TouchableOpacity>

        <View style={st.actionSpacer} />

        <TouchableOpacity
          style={st.actionBtn}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <Ionicons name="paper-plane-outline" size={17} color={C.sub} />
        </TouchableOpacity>
      </View>
  )

  const cardBody = (
    <>
      {cardHeader}
      {onPress ? (
        <Pressable
          onPress={() => onPress(item)}
          style={({ pressed }) => [pressed && { opacity: 0.94 }]}
          accessibilityRole="button"
          accessibilityLabel={`Open post: ${item.place || 'Community review'}`}
        >
          {cardMain}
        </Pressable>
      ) : (
        cardMain
      )}
      {cardActions}
    </>
  )

  if (useGlass) {
    return (
      <View style={st.cardGlassOuter}>
        {glassLayers}
        <View style={st.cardGlassContent}>
          <View style={st.cardInner}>{cardBody}</View>
        </View>
      </View>
    )
  }

  return (
    <View style={cardShellStyle}>
      <View style={st.cardInner}>{cardBody}</View>
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
  onTaggedClientPress,
}) {
  const insets = useSafeAreaInsets()
  const { width: winW = 375, height = 667 } = useWindowDimensions()
  const layoutW = layoutContentWidth(winW)
  const cardMargin = 24
  const cardW = layoutW - cardMargin * 2
  const imgW = cardW
  const imgH = imgW
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
                  {post.place && post.client_a_uuid && onTaggedClientPress ? (
                    <TouchableOpacity
                      onPress={() => onTaggedClientPress({
                        clientId: post.client_a_uuid,
                        businessName: post.place,
                      })}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Open profile for ${post.place}`}
                    >
                      <Text style={st.popHeaderName} numberOfLines={1}>{post.place}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={st.popHeaderName} numberOfLines={1}>{post.place || 'A place in Bahrain'}</Text>
                  )}
                  <View style={st.popHeaderSubRow}>
                    <Text style={st.popHeaderSub} numberOfLines={1}>
                      by {post.author}
                    </Text>
                    <CommunityUserTypeBadge uType={post.uType} compact />
                  </View>
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
                    post.client_a_uuid && onTaggedClientPress ? (
                      <TouchableOpacity
                        style={st.popPlaceWrap}
                        onPress={() => onTaggedClientPress({
                          clientId: post.client_a_uuid,
                          businessName: post.place,
                        })}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`Open profile for ${post.place}`}
                      >
                        <Ionicons name="location-sharp" size={13} color={C.red} />
                        <Text style={st.popPlaceText} numberOfLines={1}>{post.place}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={st.popPlaceWrap}>
                        <Ionicons name="location-sharp" size={13} color={C.red} />
                        <Text style={st.popPlaceText} numberOfLines={1}>{post.place}</Text>
                      </View>
                    )
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
                      <Image source={getDefaultAvatarSource(`${post.author || post.user_a_uuid || 'user'}-${post.id || ''}`)} style={st.popReplyAvImage} resizeMode="cover" />
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
