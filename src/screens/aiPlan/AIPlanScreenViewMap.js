import React from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Animated,
  PanResponder,
  Platform,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Easing,
  Share,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Reanimated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutUp,
  ZoomInEasyDown,
  ZoomOutEasyDown,
  Easing as REasing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { GestureDetector } from 'react-native-gesture-handler'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import MapView from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist'
import { colors as themeColors } from '../../theme/designTokens'
import styles from '../AIPlanScreen.styles'
import {
  PLAN_MAP_CLIENT_TYPE_FILTERS,
  BAHRAIN_REGION,
  SCREEN_WIDTH,
  INITIAL_SNAP_INDEX,
  getPlanSheetBottomPadding,
  ORBIT_DONE_BELOW_FILTER_OFFSET,
  ORBIT_VIEW_DETAILS_ABOVE_DOCK,
  ORBIT_BOTTOM_CHROME_PULL_DOWN,
  BOTTOM_CONTROL_BAR_MAP_CLEARANCE,
  TRAVEL_EXPLORE_OPTIONS,
  STOP_DIALOG_SLIDE_WIDTH,
  STOP_DIALOG_IMAGE_H,
  STOP_DIALOG_IMAGE_W,
} from './constants'
import { AnimatedStopRow, AiStagger, PopIn, PlanStepBubble } from './uiAnimChips'
import { PreviewImage, KhalidScoutPlanVisual } from './uiScoutMosaic'
import { StopDetailGallery } from './stopDetailGallery'
import { PlanDrawerLoadingPanel, PlanModalLoadingView } from './planLoadingViews'
import { AnimatedPlaceMarker } from './mapMarkerViews'
import { OrbitClientPostsStrip } from './OrbitClientPostsStrip'
import { MapScanningOverlay, mapMarkerFilterCategoryKey, markerMatchesPlanMapClientFilter, buildMapMarkers } from './mapOverlayAndMarkersModel'
import { openKhalidChat } from '../../utils/khalidChatLink'
import { openGoogleMapsDirections } from '../../utils/googleMapsDirections'
import {
  clampRegionToBahrain,
  formatPlanShareMessage,
  parseShareCodeFromUrl,
  openAllStopsInGoogleMaps,
  parsePlanItemCoords,
} from './planGeoAndShare'
import {
  attachPlanRowKeys,
  buildDraftStopFromClient,
  getLuxuryCategoryStyle,
  getPlanStopVenueExtraTags,
} from './planRowModel'
import { isTruthyFoodTruck } from '../../utils/restaurantClientMeta'
import {
  formatStopEventDetailsText,
  getStopAboutPrimaryText,
  pickPlanStopGalleryUris,
  pickPlanStopThumbUri,
} from './planMatching'

const markerMatchesShowcase = (mk, showcaseMk) => {
  if (!mk || !showcaseMk) return false
  if (mk.clientId && showcaseMk.clientId && mk.clientId === showcaseMk.clientId) return true
  const mkLat = Number(mk.lat)
  const mkLng = Number(mk.lng)
  const selectedLat = Number(showcaseMk.lat)
  const selectedLng = Number(showcaseMk.lng)
  if (!Number.isFinite(mkLat) || !Number.isFinite(mkLng) || !Number.isFinite(selectedLat) || !Number.isFinite(selectedLng)) {
    return false
  }
  const sameLat = Math.abs(mkLat - selectedLat) < 0.000001
  const sameLng = Math.abs(mkLng - selectedLng) < 0.000001
  return sameLat && sameLng
}

const splitGuideHighlight = (rawText) => {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim()
  if (!text) return { pre: '', highlight: '', post: '' }

  const candidates = [
    /(?:tip|try|order|dont miss|best time|must-try)\s*:\s*([^.,;!?]{3,48})/i,
    /(?:tip|try|order|dont miss|best time|must-try)\s+([^.,;!?]{3,48})/i,
    /"([^"]{3,42})"/,
    /'([^']{3,42})'/,
  ]

  for (const re of candidates) {
    const m = text.match(re)
    if (!m) continue
    const g = (m[1] || '').trim()
    const full = (m[0] || '').trim()
    const chosen = g || full
    if (!chosen || chosen.length < 3) continue
    const idx = text.toLowerCase().indexOf(chosen.toLowerCase())
    if (idx < 0) continue
    const end = idx + chosen.length
    return {
      pre: text.slice(0, idx),
      highlight: chosen,
      post: text.slice(end),
    }
  }

  // fallback: highlight first short meaningful phrase (2-4 words)
  const words = text.split(' ').filter(Boolean)
  if (words.length >= 3) {
    const take = Math.min(4, Math.max(2, Math.floor(words.length / 5)))
    const highlight = words.slice(0, take).join(' ')
    const idx = text.indexOf(highlight)
    if (idx >= 0) {
      return {
        pre: text.slice(0, idx),
        highlight,
        post: text.slice(idx + highlight.length),
      }
    }
  }
  return { pre: text, highlight: '', post: '' }
}

const distanceKmBetween = (latA, lngA, latB, lngB) => {
  const aLat = Number(latA)
  const aLng = Number(lngA)
  const bLat = Number(latB)
  const bLng = Number(lngB)
  if (!Number.isFinite(aLat) || !Number.isFinite(aLng) || !Number.isFinite(bLat) || !Number.isFinite(bLng)) return null
  const toRad = (deg) => (deg * Math.PI) / 180
  const earthKm = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const a = (sinLat * sinLat) + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * (sinLng * sinLng)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthKm * c
}

const PROFILE_GOLD_LIGHT = '#F3D99E'

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1F2937' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B1220' }] },
]

export function AIPlanScreenViewMap({ screen }) {
  const [expandedStopKeys, setExpandedStopKeys] = React.useState({})
  React.useEffect(() => {
    setExpandedStopKeys({})
  }, [screen.dayPlan?.length])

  const buildDayCtaScale = useSharedValue(1)
  const buildDayCtaPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buildDayCtaScale.value }],
  }))

  React.useEffect(() => {
    if (screen.drawerStep !== 0) return
    if (!screen.buildDayCtaAttentionKey) return
    buildDayCtaScale.value = withSequence(
      withSpring(1.065, { damping: 12, stiffness: 320 }),
      withSpring(1, { damping: 16, stiffness: 240 }),
    )
  }, [screen.drawerStep, screen.buildDayCtaAttentionKey])

  const blurTint = screen.isDark ? 'dark' : 'light'
  const surfaceColor = screen.isDark ? '#000000' : '#FFFFFF'
  const subtleSurfaceColor = screen.isDark ? '#0A0A0A' : '#F2F2F7'
  const borderColor = screen.isDark ? '#334155' : '#CBD5E1'
  const swipeGripPillBg = screen.isDark ? 'rgba(10,10,10,0.92)' : 'rgba(248,250,252,0.97)'
  const swipeGripPillBorder = screen.isDark ? 'rgba(71,85,105,0.55)' : 'rgba(203,213,225,0.9)'
  const planSheetAtTopSnap = (screen.planSheetSnapIndex ?? INITIAL_SNAP_INDEX) === 0
  const sheetDragHintLabel = planSheetAtTopSnap ? 'Swipe down' : 'Swipe up'
  const sheetDragHintA11y = planSheetAtTopSnap
    ? 'Swipe down to collapse the sheet and see more map'
    : 'Swipe up to expand the plan, or drag down to see more map'
  const iconMuted = screen.isDark ? '#94A3B8' : '#64748B'
  const iconSubtle = screen.isDark ? '#CBD5E1' : '#374151'
  const overlayColor = screen.isDark ? 'rgba(2,6,23,0.62)' : 'rgba(15,23,42,0.45)'
  const planMapStyle = screen.isDark ? DARK_MAP_STYLE : undefined
  const sheetBackgroundColor = screen.isDark ? '#000000' : '#FFFFFF'
  const sheetStep0BackgroundColor = screen.isDark ? '#0A0A0A' : '#F2F2F7'
  const sheetStep3BackgroundColor = 'transparent'
  const sheetBorderColor = screen.isDark ? '#1F2937' : 'rgba(148,163,184,0.18)'
  const sheetShadowColor = screen.isDark ? '#000000' : '#0F172A'
  const innerCardBg = screen.isDark ? '#050505' : '#FFFFFF'
  const innerSoftBg = screen.isDark ? '#0A0A0A' : '#F8FAFC'
  const innerBorder = screen.isDark ? '#334155' : '#E2E8F0'
  const innerTextPrimary = screen.colors.textPrimary
  const innerTextSecondary = screen.colors.textSecondary
  const orbitDestLat = Number(screen.showcaseMarkerMk?.lat)
  const orbitDestLng = Number(screen.showcaseMarkerMk?.lng)
  const orbitCanOpenMaps = Number.isFinite(orbitDestLat) && Number.isFinite(orbitDestLng)
  const orbitShowcaseClientId =
    screen.showcaseMarkerMk?.clientId || screen.showcaseMarkerMk?.client_a_uuid || null
  /** Curated venue blurb only — empty when the listing has none (chat must still answer from persona + retrieval + local knowledge). */
  const orbitPlaceAiSummary = String(screen.showcaseMarkerMk?.ai_summary || '').trim()
  const orbitUi = React.useMemo(() => {
    const dark = !!screen.isDark
    const ios = Platform.OS === 'ios'
    const hairline = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'
    const glassTint = dark ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.72)'
    return {
      dark,
      blurTint: dark ? 'dark' : 'light',
      blurDockInt: ios ? (dark ? 72 : 48) : dark ? 48 : 38,
      /** Orbit chrome: map shows through frost */
      blurChromeInt: ios ? (dark ? 78 : 58) : dark ? 52 : 42,
      chromeFrost: dark ? 'rgba(0,0,0,0.42)' : 'rgba(248,252,255,0.48)',
      glassBorder: dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.92)',
      profileHairline: hairline,
      profileGlassTint: glassTint,
      mapsBtnText: dark ? PROFILE_GOLD_LIGHT : '#8A6A14',
      mapsBtnBorder: 'rgba(212,175,55,0.55)',
      closeBg: themeColors.primary,
      closeBorder: 'rgba(255,255,255,0.28)',
      closeIcon: '#FFFFFF',
      dockBaseGradColors: dark
        ? ['rgba(0,0,0,0.72)', 'rgba(4,4,4,0.86)', 'rgba(10,10,10,0.94)']
        : ['rgba(255,255,255,0.84)', 'rgba(247,249,252,0.94)', 'rgba(241,245,249,0.97)'],
      dockWashGradColors: dark
        ? [themeColors.primaryDark + '33', 'transparent']
        : [`${themeColors.primary}14`, 'transparent'],
      dockBorderFallback: dark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.1)',
      titleColor: dark ? '#F8FAFC' : '#0F172A',
      sublabelColor: dark ? '#FECACA' : themeColors.primaryDark,
    }
  }, [screen.isDark])
  const nearbySuggestions = React.useMemo(() => {
    if (screen.dayPlan || screen.focusedMapClientId || !Array.isArray(screen.allPlaceMarkers)) return []
    const centerLat = Number(screen.userLocation?.latitude ?? screen.mapRegion?.latitude)
    const centerLng = Number(screen.userLocation?.longitude ?? screen.mapRegion?.longitude)
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return []
    const rows = screen.allPlaceMarkers
      .map((mk) => {
        const distanceKm = distanceKmBetween(centerLat, centerLng, mk?.lat, mk?.lng)
        if (distanceKm == null || !mk?.spot) return null
        return { ...mk, distanceKm }
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
    return rows
  }, [screen.dayPlan, screen.focusedMapClientId, screen.allPlaceMarkers, screen.userLocation, screen.mapRegion])
  const [nearbyVisibleCount, setNearbyVisibleCount] = React.useState(5)
  React.useEffect(() => {
    setNearbyVisibleCount(5)
  }, [screen.userLocation, screen.mapRegion, screen.focusedMapClientId, screen.dayPlan])
  React.useEffect(() => {
    if (nearbySuggestions.length <= 5) {
      setNearbyVisibleCount(nearbySuggestions.length)
      return
    }
    let cancelled = false
    const revealStep = () => {
      if (cancelled) return
      setNearbyVisibleCount((prev) => {
        const next = Math.min(nearbySuggestions.length, prev + 5)
        if (next >= nearbySuggestions.length) return nearbySuggestions.length
        setTimeout(revealStep, 90)
        return next
      })
    }
    const t = setTimeout(revealStep, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [nearbySuggestions.length])
  const nearbyVisibleSuggestions = React.useMemo(
    () => nearbySuggestions.slice(0, Math.max(nearbyVisibleCount, 5)),
    [nearbySuggestions, nearbyVisibleCount],
  )
  const nearbySkeletonItems = React.useMemo(() => Array.from({ length: 5 }, (_, idx) => idx), [])
  /** Quick find with one pin: collapse plan sheet chrome while orbit is active; restore when user exits orbit */
  const quickFindOrbitCollapsesSheet =
    screen.quickFindMapOnly &&
    screen.dayPlan?.length === 1 &&
    screen.isMarkerShowcaseActive
  /** Hide map-type filter chips only during orbit for this flow (after exit orbit, chips return) */
  const hidePlanMapFiltersForQuickFindOrbit =
    screen.quickFindMapOnly &&
    screen.dayPlan?.length === 1 &&
    screen.isMarkerShowcaseActive

  return (
<>
      <MapView
        ref={screen.mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={BAHRAIN_REGION}
        mapType={Platform.OS === 'ios' && screen.isDark ? 'mutedStandard' : 'standard'}
        customMapStyle={planMapStyle}
        userInterfaceStyle={screen.isDark ? 'dark' : 'light'}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={screen.handleMapPress}
        onRegionChange={screen.handleRegionChange}
        onRegionChangeComplete={screen.handleRegionChangeComplete}
      >
        {/* Focused client mode: always render from all client markers so restaurant branches are visible. */}
        {!!screen.focusedMapClientId &&
          screen.allPlaceMarkers
            .filter((mk) => markerMatchesPlanMapClientFilter(mk, screen.activePlanMapClientFilter))
            .filter((mk) => screen.markerMatchesFocusedClient(mk))
            .map((mk) => {
          const isEat = mapMarkerFilterCategoryKey(mk) === 'restaurant';
          const isEvent = mapMarkerFilterCategoryKey(mk) === 'event';
          const accent = isEat ? screen.colors.dining : isEvent ? screen.colors.event : screen.colors.textSecondary;
          const isSelectedInOrbit = screen.isMarkerShowcaseActive && markerMatchesShowcase(mk, screen.showcaseMarkerMk)
          return (
            <AnimatedPlaceMarker
              key={`pre-${mk.clientId || 'client'}-${mk.idx}-${mk.lat}-${mk.lng}`}
              mk={mk}
              accent={accent}
              isCurrent={false}
              showBadge={false}
              showCircle={false}
              zoomScale={screen.zoomScale}
              hideLabel={screen.isMarkerShowcaseActive}
              selectedGlow={isSelectedInOrbit}
              onPress={() => screen.handlePlaceMarkerPress(mk)}
            />
          );
        })}
        {/* Pre-plan: all clients with profile images as markers */}
        {!screen.focusedMapClientId && !screen.dayPlan &&
          screen.allPlaceMarkers
            .filter((mk) => markerMatchesPlanMapClientFilter(mk, screen.activePlanMapClientFilter))
            .map((mk) => {
          const isEat = mapMarkerFilterCategoryKey(mk) === 'restaurant';
          const isEvent = mapMarkerFilterCategoryKey(mk) === 'event';
          const accent = isEat ? screen.colors.dining : isEvent ? screen.colors.event : screen.colors.textSecondary;
          const isSelectedInOrbit = screen.isMarkerShowcaseActive && markerMatchesShowcase(mk, screen.showcaseMarkerMk)
          return (
            <AnimatedPlaceMarker
              key={`pre-${mk.clientId || 'client'}-${mk.idx}-${mk.lat}-${mk.lng}`}
              mk={mk}
              accent={accent}
              isCurrent={false}
              showBadge={false}
              showCircle={false}
              zoomScale={screen.zoomScale}
              hideLabel={screen.isMarkerShowcaseActive}
              selectedGlow={isSelectedInOrbit}
              onPress={() => screen.handlePlaceMarkerPress(mk)}
            />
          );
        })}
        {/* Plan markers — reveal one by one with profile images and entrance animation */}
        {!screen.focusedMapClientId && screen.dayPlan && (() => {
          const markers = buildMapMarkers(screen.dayPlan, screen.allPlaceMarkers);
          const maxVisible = screen.revealingPins ? screen.visiblePinCount : markers.length;
          const revealPopStep = screen.revealingPins ? screen.visiblePinCount : null
          return markers
            .filter((mk) => mk.idx < maxVisible)
            .filter((mk) => markerMatchesPlanMapClientFilter(mk, screen.activePlanMapClientFilter))
            .filter((mk) => screen.markerMatchesFocusedClient(mk))
            .map((mk) => {
            const isEat = mapMarkerFilterCategoryKey(mk) === 'restaurant';
            const isEvent = mapMarkerFilterCategoryKey(mk) === 'event';
            const timeCols = { Morning: screen.colors.morning, Afternoon: screen.colors.afternoon, Evening: screen.colors.evening };
            const accent = isEat ? screen.colors.dining : isEvent ? screen.colors.event : (timeCols[mk.time] || screen.colors.textSecondary);
            const isCurrent = screen.revealingPins && mk.idx === screen.visiblePinCount - 1;
            const isSelectedInOrbit = screen.isMarkerShowcaseActive && markerMatchesShowcase(mk, screen.showcaseMarkerMk)
            return (
              <AnimatedPlaceMarker
                key={mk.idx}
                mk={mk}
                accent={accent}
                isCurrent={isCurrent}
                zoomScale={screen.zoomScale}
                revealPopStep={revealPopStep}
                hideLabel={screen.isMarkerShowcaseActive}
                selectedGlow={isSelectedInOrbit}
                onPress={() => screen.handlePlaceMarkerPress(mk)}
              />
            );
          });
        })()}
      </MapView>

      {screen.isMarkerShowcaseActive && screen.showcaseMarkerMk ? (
        <>
          <View
            style={[
              styles.markerShowcaseExitWrap,
              { top: screen.insets.top + ORBIT_DONE_BELOW_FILTER_OFFSET },
            ]}
            pointerEvents="box-none"
          >
            <View style={[styles.orbitProfileChromeCard, { borderColor: orbitUi.glassBorder }]}>
              <BlurView
                pointerEvents="none"
                intensity={orbitUi.blurChromeInt}
                tint={orbitUi.blurTint}
                style={StyleSheet.absoluteFill}
              />
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, { backgroundColor: orbitUi.chromeFrost }]}
              />
              <LinearGradient
                pointerEvents="none"
                colors={[`${themeColors.primary}26`, `${themeColors.primary}00`]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.orbitProfileOrbA}
              />
              <LinearGradient
                pointerEvents="none"
                colors={[`${themeColors.primaryLight}1F`, `${themeColors.primaryLight}00`]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.orbitProfileOrbB}
              />
              <View style={[styles.orbitProfileOrbGold, { opacity: orbitUi.dark ? 0.1 : 0.06 }]} pointerEvents="none" />
              <View style={styles.orbitProfileContent} pointerEvents="box-none">
                <TouchableOpacity
                  style={[
                    styles.orbitProfileCloseBtn,
                    styles.orbitProfileCloseFloating,
                    { backgroundColor: orbitUi.closeBg, borderColor: orbitUi.closeBorder },
                  ]}
                  onPress={screen.exitMarkerShowcase}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Close place view"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={18} color={orbitUi.closeIcon} />
                </TouchableOpacity>

                <Text
                  style={[
                    styles.orbitProfileSpotName,
                    { color: orbitUi.titleColor },
                    Platform.OS === 'ios' && { fontWeight: '400' },
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                  accessibilityRole="header"
                >
                  {screen.showcaseMarkerMk?.spot ? String(screen.showcaseMarkerMk.spot) : 'Place'}
                </Text>
                <View style={styles.orbitProfileNameAccentRow}>
                  <View style={styles.orbitProfileNameAccentLine} />
                  <View style={styles.orbitProfileNameAccentDot} />
                  <View style={styles.orbitProfileNameAccentLine} />
                </View>

                <View style={styles.orbitProfileCtaRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.orbitProfileArBtn,
                      pressed && styles.orbitPlaceCardCTAPressed,
                      !orbitCanOpenMaps && { opacity: 0.45 },
                    ]}
                    onPress={() => {
                      if (!orbitCanOpenMaps) return
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      screen.navigation.navigate('AR', {
                        navigateTo: {
                          lat: orbitDestLat,
                          lng: orbitDestLng,
                          name: String(screen.showcaseMarkerMk?.spot || 'Destination'),
                        },
                      })
                    }}
                    disabled={!orbitCanOpenMaps}
                    accessibilityRole="button"
                    accessibilityLabel="Open in AR"
                  >
                    <LinearGradient
                      colors={[themeColors.primary, themeColors.primaryLight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.orbitProfileArBtnShine}
                    />
                    <Ionicons name="navigate" size={15} color="#FFF" />
                    <Text style={styles.orbitProfileArBtnText}>Open in AR</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.orbitProfileMapsBtn,
                      {
                        backgroundColor: orbitUi.profileGlassTint,
                        borderColor: orbitUi.mapsBtnBorder,
                      },
                      pressed && styles.orbitPlaceCardCTAPressed,
                      !orbitCanOpenMaps && { opacity: 0.45 },
                    ]}
                    onPress={() => {
                      if (!orbitCanOpenMaps) return
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      openGoogleMapsDirections(orbitDestLat, orbitDestLng)
                    }}
                    disabled={!orbitCanOpenMaps}
                    accessibilityRole="button"
                    accessibilityLabel="Open in Maps"
                  >
                    <Ionicons name="map-outline" size={15} color={orbitUi.mapsBtnText} />
                    <Text style={[styles.orbitProfileMapsBtnText, { color: orbitUi.mapsBtnText }]}>
                      Open in Maps
                    </Text>
                  </Pressable>
                </View>

                <View style={[styles.orbitProfileCtaRow, styles.orbitProfileCtaRowSecond]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.orbitProfileMapsBtn,
                      {
                        backgroundColor: orbitUi.profileGlassTint,
                        borderColor: orbitUi.mapsBtnBorder,
                      },
                      pressed && styles.orbitPlaceCardCTAPressed,
                    ]}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      openKhalidChat({
                        source: 'orbit',
                        place: String(screen.showcaseMarkerMk?.spot || 'this place'),
                        summary: orbitPlaceAiSummary,
                      })
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Ask Khalid about this place"
                  >
                    <Ionicons name="sparkles-outline" size={15} color={orbitUi.mapsBtnText} />
                    <Text style={[styles.orbitProfileMapsBtnText, { color: orbitUi.mapsBtnText }]}>Ask Khalid</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.orbitProfileArBtn,
                      pressed && styles.orbitPlaceCardCTAPressed,
                      !orbitShowcaseClientId && { opacity: 0.45 },
                    ]}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      if (!orbitShowcaseClientId) return
                      screen.setProfileClientId(orbitShowcaseClientId)
                    }}
                    disabled={!orbitShowcaseClientId}
                    accessibilityRole="button"
                    accessibilityLabel="View profile"
                  >
                    <LinearGradient
                      colors={[themeColors.primary, themeColors.primaryLight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.orbitProfileArBtnShine}
                    />
                    <Text
                      style={styles.orbitProfileArBtnText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      View profile
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color="#FFF" />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {screen.showcaseOrbitPostUris?.length > 0 ? (
            <View
              style={[
                styles.markerViewDetailsWrapBase,
                styles.orbitBottomChromeWrap,
                {
                  bottom:
                    BOTTOM_CONTROL_BAR_MAP_CLEARANCE +
                    screen.insets.bottom +
                    ORBIT_VIEW_DETAILS_ABOVE_DOCK -
                    ORBIT_BOTTOM_CHROME_PULL_DOWN,
                },
              ]}
              pointerEvents="box-none"
            >
              <View
                style={[
                  styles.orbitPlaceUnifiedCard,
                  styles.orbitFilmstripDockCard,
                  {
                    borderColor:
                      typeof screen.showcaseMarkerAccent === 'string' && screen.showcaseMarkerAccent.length === 7
                        ? `${screen.showcaseMarkerAccent}40`
                        : orbitUi.dockBorderFallback,
                    shadowColor: screen.showcaseMarkerAccent || themeColors.primaryDark,
                  },
                ]}
              >
                <BlurView intensity={orbitUi.blurDockInt} tint={orbitUi.blurTint} style={StyleSheet.absoluteFill} />
                <LinearGradient
                  pointerEvents="none"
                  colors={orbitUi.dockBaseGradColors}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={orbitUi.dockWashGradColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0.6 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.orbitBottomHighlightsWrap}>
                  <View style={[styles.orbitBottomHighlightsTray, !orbitUi.dark && styles.orbitBottomHighlightsTrayLight]}>
                    <OrbitClientPostsStrip
                      imageUris={screen.showcaseOrbitPostUris}
                      accent={screen.showcaseMarkerAccent}
                      isDark={orbitUi.dark}
                    />
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      <View style={[styles.topBarWrap, { paddingTop: screen.insets.top + 2 }]} pointerEvents="box-none">
        <View style={styles.topBarBalanceSpacer} pointerEvents="none" accessibilityElementsHidden />
        {!hidePlanMapFiltersForQuickFindOrbit ? (
          <View style={styles.planMapFilterCenterWrap} pointerEvents="box-none">
            <View style={styles.planMapFilterOuter}>
              <View style={styles.planMapFilterTabsWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.planMapFilterScroll}
                  accessibilityRole="toolbar"
                  accessibilityLabel="Filter map pins by client type from the client table"
                >
                  {PLAN_MAP_CLIENT_TYPE_FILTERS.map((t) => {
                    const on = screen.activePlanMapClientFilter === t.id;
                    const P = screen.communityPalette;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.planMapFilterChipCommunity,
                          {
                            backgroundColor: on ? P.red : P.bg,
                            borderColor: on ? P.red : P.border,
                            ...(on
                              ? Platform.select({
                                  ios: { shadowColor: P.red, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.35, shadowRadius: 4 },
                                  android: { elevation: 4 },
                                })
                              : {}),
                          },
                        ]}
                        onPress={() => screen.handlePlanMapClientFilterPress(t.id)}
                        activeOpacity={0.82}
                        hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                        accessibilityRole="button"
                        accessibilityLabel={t.label}
                        accessibilityState={{ selected: on }}
                      >
                        <Ionicons name={t.icon} size={22} color={on ? '#FFF' : P.sub} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.planMapFilterCenterWrap} pointerEvents="none" />
        )}
        <TouchableOpacity
          style={[
            styles.searchButton,
            { backgroundColor: surfaceColor, borderColor: screen.isDark ? '#1F1F1F' : 'transparent' },
            screen.planReadOnly && { opacity: 0.4 },
          ]}
          activeOpacity={0.8}
          onPress={() => {
            if (screen.planReadOnly) return
            screen.setShowSearchModal(true)
          }}
          disabled={screen.planReadOnly}
          accessibilityRole="button"
          accessibilityLabel={screen.dayPlan?.length ? 'Add a stop or browse places' : 'Search places'}
        >
          <Ionicons name={screen.dayPlan?.length ? 'add' : 'search'} size={22} color={screen.colors.primary || themeColors.primary} />
        </TouchableOpacity>
      </View>

      {/* Scanning overlay during Hang tight removed (no radar effect) */}
      <MapScanningOverlay visible={false} />

      <Animated.View
        style={[
          styles.sheet,
          screen.drawerStep === 0 && styles.sheetStep0Tint,
          screen.drawerStep === 3 && styles.sheetPlanResultsTint,
          screen.drawerStep === 3 && styles.sheetPlanOverflowVisible,
          {
            backgroundColor: sheetBackgroundColor,
            borderTopColor: sheetBorderColor,
            shadowColor: sheetShadowColor,
          },
          screen.drawerStep === 0 && { backgroundColor: sheetStep0BackgroundColor },
          
          screen.drawerStep === 3 && { backgroundColor: 'transparent' },
          {
            paddingBottom: screen.drawerStep === 3 ? 0 : getPlanSheetBottomPadding(screen.insets),
            opacity: screen.sheetOpacity,
            transform: [
              ...(screen.orbitSheetExtraTranslateY != null
                ? [{ translateY: screen.orbitSheetExtraTranslateY }]
                : []),
              { translateY: screen.sheetAnim },
            ],
          },
        ]}
      >
        {screen.drawerStep === 3 ? (
          <View style={styles.sheetDragArea} pointerEvents="box-none">
            <View style={styles.sheetDragAreaGripRow} pointerEvents="box-none">
              <View
                style={[
                  styles.sheetSwipeGripPill,
                  { backgroundColor: swipeGripPillBg, borderColor: swipeGripPillBorder },
                ]}
                {...screen.panResponder.panHandlers}
                hitSlop={{ top: 12, bottom: 10, left: 24, right: 24 }}
                accessibilityRole="button"
                accessibilityLabel={sheetDragHintA11y}
              >
                <View style={[styles.grabber, { backgroundColor: borderColor }]} />
                <Text style={[styles.sheetDragHint, { color: screen.colors.textSecondary }]}>
                  {sheetDragHintLabel}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.sheetDragArea} pointerEvents="box-none">
            <View
              style={[
                styles.sheetSwipeGripPill,
                { backgroundColor: swipeGripPillBg, borderColor: swipeGripPillBorder },
              ]}
              {...screen.panResponder.panHandlers}
              hitSlop={{ top: 28, bottom: 18, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={sheetDragHintA11y}
            >
              <View style={[styles.grabber, { backgroundColor: borderColor }]} />
              <Text style={[styles.sheetDragHint, { color: screen.colors.textSecondary }]}>{sheetDragHintLabel}</Text>
            </View>
          </View>
        )}

        {/* Step 0 — Past Plans (modern hero layout) */}
        {screen.drawerStep === 0 && (
          <View
            style={[
              styles.pastPlansStepWrap,
              quickFindOrbitCollapsesSheet && styles.pastPlansStepWrapHiddenForQuickOrbit,
            ]}
          >
            <View style={[styles.sheetStep0GlassOuter, { backgroundColor: innerSoftBg, borderColor: innerBorder }]}>
              <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint={blurTint} style={styles.planMastheadBlur} />
              <View
                style={[
                  styles.planMastheadFrost,
                  { backgroundColor: screen.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.2)' },
                ]}
                pointerEvents="none"
              />
              <ScrollView style={styles.sheetStep0GlassScroll} contentContainerStyle={styles.d0ScrollContent} showsVerticalScrollIndicator={false}>
                {screen.quickFindMapOnly && screen.loading ? (
                  <View style={{ height: 48 }} />
                ) : quickFindOrbitCollapsesSheet ? (
                  <View style={{ height: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
                ) : (
                  <>
                    <View style={[styles.d0FixedBottomCta, { paddingHorizontal: 0, paddingTop: 0 }, screen.isMarkerShowcaseActive && styles.d0FixedBottomCtaMinimized]}>
                      {!screen.isMarkerShowcaseActive ? (
                        <Reanimated.View style={[{ width: '100%', marginBottom: 0 }, buildDayCtaPulseStyle]}>
                          <View style={styles.d0CtaDualRow}>
                            <View style={styles.d0CtaCol}>
                              <Pressable
                                style={({ pressed }) => [
                                  pressed && { opacity: 0.93, transform: [{ scale: 0.98 }] },
                                ]}
                                onPress={() => {
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                  screen.setShowBuildModePickerModal(true)
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Build my day"
                              >
                                <LinearGradient
                                  colors={[themeColors.primary, '#E63950']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={styles.d0CtaChipRowGradient}
                                >
                                  <Image
                                    source={require('../../../assets/bahrain-flag.png')}
                                    style={styles.d0CtaChipIconImage}
                                    accessibilityIgnoresInvertColors
                                  />
                                  <Text style={styles.d0CtaChipTitleLight} numberOfLines={2}>
                                    Build my day
                                  </Text>
                                </LinearGradient>
                              </Pressable>
                            </View>
                            <View style={[styles.d0CtaCol, styles.d0CtaColQuickShadow]}>
                              <Pressable
                                style={({ pressed }) => [
                                  pressed && { opacity: 0.93, transform: [{ scale: 0.98 }] },
                                ]}
                                onPress={() => {
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                  screen.openQuickAiSearchModal()
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="AI search"
                              >
                                <View
                                  style={[
                                    styles.d0CtaChipRowOutlined,
                                    screen.isDark && styles.d0CtaChipRowOutlinedDark,
                                  ]}
                                >
                                  <Ionicons
                                    name="flash-outline"
                                    size={20}
                                    color={screen.isDark ? '#F7DFA0' : themeColors.primary}
                                  />
                                  <Text
                                    style={[
                                      styles.d0CtaChipTitleOutlined,
                                      screen.isDark && styles.d0CtaChipTitleOutlinedDark,
                                    ]}
                                    numberOfLines={2}
                                  >
                                    AI search
                                  </Text>
                                </View>
                              </Pressable>
                            </View>
                          </View>
                        </Reanimated.View>
                      ) : null}
                      {!screen.isMarkerShowcaseActive && (screen.allPlaceMarkersLoading || nearbySuggestions.length) ? (
                        <View style={styles.d0NearbySection}>
                          <View style={[styles.d0NearbyTopDivider, { backgroundColor: screen.isDark ? 'rgba(148,163,184,0.26)' : 'rgba(15,23,42,0.12)' }]} />
                          <Text style={[styles.d0NearbyEyebrow, { color: screen.isDark ? 'rgba(245,210,122,0.92)' : '#8A6A14' }]}>Curated for you</Text>
                          <View style={styles.d0NearbyHeaderRow}>
                            <View style={[styles.d0NearbyHeaderIconWrap, { backgroundColor: screen.isDark ? 'rgba(212,175,55,0.16)' : 'rgba(212,175,55,0.13)' }]}>
                              <Ionicons name="compass-outline" size={14} color={screen.isDark ? '#F5D27A' : '#8A6A14'} />
                            </View>
                            <View style={styles.d0NearbyHeaderTextWrap}>
                              <Text style={[styles.d0NearbyTitle, { color: innerTextPrimary }]}>Nearby</Text>
                              <Text style={[styles.d0NearbySubtitle, { color: innerTextSecondary }]}>Elegant picks around your current map</Text>
                            </View>
                          </View>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.d0NearbyScrollContent}
                          >
                            {screen.allPlaceMarkersLoading
                              ? nearbySkeletonItems.map((idx) => (
                                <View
                                  key={`nearby-skeleton-${idx}`}
                                  style={[
                                    styles.d0NearbyCard,
                                    styles.d0NearbyCardSkeleton,
                                    {
                                      borderColor: screen.isDark ? 'rgba(148,163,184,0.24)' : 'rgba(226,232,240,0.95)',
                                      backgroundColor: innerCardBg,
                                    },
                                  ]}
                                >
                                  <View style={[styles.d0NearbyCardImageWrap, styles.d0NearbySkeletonBlock, { backgroundColor: screen.isDark ? 'rgba(148,163,184,0.17)' : '#E2E8F0' }]} />
                                  <View style={styles.d0NearbyCardBody}>
                                    <View style={[styles.d0NearbySkeletonLineLg, { backgroundColor: screen.isDark ? 'rgba(148,163,184,0.2)' : '#E2E8F0' }]} />
                                    <View style={[styles.d0NearbySkeletonLineSm, { backgroundColor: screen.isDark ? 'rgba(148,163,184,0.15)' : '#EDF2F7' }]} />
                                  </View>
                                </View>
                              ))
                              : nearbyVisibleSuggestions.map((item, idx) => (
                                <TouchableOpacity
                                  key={`${item.clientId || item.spot}-${idx}`}
                                  style={[
                                    styles.d0NearbyCard,
                                    {
                                      borderColor: screen.isDark ? 'rgba(148,163,184,0.3)' : 'rgba(226,232,240,0.95)',
                                      backgroundColor: innerCardBg,
                                      shadowColor: screen.isDark ? '#000000' : '#0F172A',
                                    },
                                  ]}
                                  activeOpacity={0.86}
                                  onPress={() => screen.handlePlaceMarkerPress(item)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Open ${item.spot} on map`}
                                >
                                  <View style={styles.d0NearbyCardImageWrap}>
                                    {item.image ? (
                                      <Image source={{ uri: item.image }} style={styles.d0NearbyCardImage} />
                                    ) : (
                                      <View style={[styles.d0NearbyCardFallback, { backgroundColor: screen.isDark ? '#0A0A0A' : '#E2E8F0' }]}>
                                        <Ionicons name="location-outline" size={16} color={iconMuted} />
                                      </View>
                                    )}
                                    <LinearGradient
                                      colors={['transparent', 'rgba(2,6,23,0.62)', 'rgba(2,6,23,0.88)']}
                                      start={{ x: 0.5, y: 0 }}
                                      end={{ x: 0.5, y: 1 }}
                                      style={styles.d0NearbyImageOverlay}
                                    >
                                      <Text style={styles.d0NearbyCardTitleOnImage} numberOfLines={2}>{item.spot}</Text>
                                      <View style={styles.d0NearbyCardMetaRow}>
                                        <View style={styles.d0NearbyDistancePillOnImage}>
                                          <Ionicons name="navigate-outline" size={11} color="rgba(248,250,252,0.95)" />
                                          <Text style={styles.d0NearbyCardMetaTextOnImage} numberOfLines={1}>
                                            {item.distanceKm < 1
                                              ? `${Math.round(item.distanceKm * 1000)} m away`
                                              : `${item.distanceKm.toFixed(1)} km away`}
                                          </Text>
                                        </View>
                                      </View>
                                    </LinearGradient>
                                  </View>
                                  <View style={styles.d0NearbyCardBody}>
                                    <View style={[styles.d0NearbyDistancePill, { backgroundColor: screen.isDark ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.14)' }]}>
                                        <Ionicons name="navigate-outline" size={11} color={iconMuted} />
                                        <Text style={[styles.d0NearbyCardMetaText, { color: innerTextSecondary }]} numberOfLines={1}>
                                          View on map
                                        </Text>
                                    </View>
                                  </View>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Step 3 — Day plan results (steps 1–2 now in modal) */}
        {screen.drawerStep === 3 && (
          <View style={[styles.planStep3Body, { backgroundColor: 'transparent' }]}>
            {screen.loading || screen.error || !screen.dayPlan?.length ? (
              <View style={[styles.drawerPageHeader, { borderBottomColor: innerBorder }]}>
                <TouchableOpacity
                  style={styles.backButton}
                  activeOpacity={0.65}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    screen.setQuickFindMapOnly(false)
                    screen.resetQuickFindRotationState()
                    screen.setDrawerStep(0)
                    screen.setDayPlan(null)
                    screen.setError(null)
                    screen.setActiveSavedPlanId(null)
                    screen.setSharedCollaboration(null)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Back to plans"
                >
                  <Ionicons name="chevron-back" size={20} color={iconSubtle} />
                </TouchableOpacity>
                <View style={styles.drawerPageHeaderCenter} pointerEvents="none">
                  {screen.loading ? (
                    <Text style={[styles.drawerPageHeaderTitle, { color: innerTextPrimary }]} numberOfLines={1}>
                      {screen.quickFindMapOnly ? 'Quick searching' : 'Building your day'}
                    </Text>
                  ) : screen.error ? (
                    <Text style={[styles.drawerPageHeaderTitle, { color: innerTextPrimary }]} numberOfLines={1}>
                      Something went wrong
                    </Text>
                  ) : screen.quickFindMapOnly && !(screen.dayPlan?.length > 0) ? (
                    <Text style={[styles.drawerPageHeaderTitle, { color: innerTextPrimary }]} numberOfLines={1}>
                      Quick search
                    </Text>
                  ) : (
                    <Text style={[styles.drawerPageHeaderTitle, { color: innerTextPrimary }]} numberOfLines={1}>
                      Your plan
                    </Text>
                  )}
                </View>
                <View style={styles.drawerPageHeaderSpacer} />
              </View>
            ) : null}

            {screen.loading ? (
              <Reanimated.View
                style={[styles.planContentFill, styles.loadingWrap]}
                entering={FadeInDown.duration(400).springify().damping(17).stiffness(200).mass(0.85)}
              >
                <View style={styles.planSheetLoadingGlassOuter}>
                  <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint={blurTint} style={styles.planMastheadBlur} />
                  <View
                    style={[
                      styles.planMastheadFrost,
                      { backgroundColor: screen.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.2)' },
                    ]}
                    pointerEvents="none"
                  />
                  <View style={[styles.planSheetLoadingGlassInner, { backgroundColor: innerSoftBg, borderColor: innerBorder }]}>
                    <PlanDrawerLoadingPanel
                      loading={screen.loading}
                      loadingStatus={screen.loadingStatus}
                      spotPreviews={screen.spotPreviews}
                      themePrimary={themeColors.primary}
                    />
                  </View>
                </View>
              </Reanimated.View>
            ) : screen.error ? (
              <Reanimated.View
                style={[styles.planContentFill, styles.errorWrap]}
                entering={ZoomInEasyDown.duration(360).springify().damping(16).stiffness(220)}
              >
                <View style={[styles.errorCard, { backgroundColor: innerCardBg, borderColor: innerBorder }]}>
                  <View style={styles.errorIconWrap}>
                    <Ionicons name="alert-circle" size={28} color="#DC2626" />
                  </View>
                  <Text style={[styles.errorTitle, { color: innerTextPrimary }]}>Something went wrong</Text>
                  <Text style={[styles.errorText, { color: innerTextSecondary }]}>{screen.error}</Text>
                </View>
                <TouchableOpacity style={styles.retryButton} activeOpacity={0.85} onPress={screen.handleGenerate}>
                  <Ionicons name="refresh" size={20} color={themeColors.primary} />
                  <Text style={styles.retryButtonText}>Try again</Text>
                </TouchableOpacity>
              </Reanimated.View>
            ) : !screen.dayPlan || screen.dayPlan.length === 0 ? (
              <Reanimated.View
                style={[styles.planContentFill, { paddingHorizontal: 20, justifyContent: 'center' }]}
                entering={FadeIn.duration(320)}
              >
                {screen.customPlanDraftActive ? (
                  <View style={{ alignItems: 'center', gap: 14 }}>
                    <Text style={[styles.emptyResults, { textAlign: 'center' }]}>Custom plan</Text>
                    <Text style={[styles.d0CopyHint, { textAlign: 'center', maxWidth: 320 }]}>
                      Search the catalog and add stops to build your own day. Your first pick creates the itinerary.
                    </Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      activeOpacity={0.85}
                      onPress={() => screen.setShowSearchModal(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Open catalog search"
                    >
                      <Ionicons name="search-outline" size={20} color={themeColors.primary} />
                      <Text style={styles.retryButtonText}>Search catalog</Text>
                    </TouchableOpacity>
                  </View>
                ) : screen.quickFindMapOnly ? (
                  <View style={{ alignItems: 'center', gap: 14 }}>
                    <Text style={[styles.emptyResults, { textAlign: 'center' }]}>
                      Quick search is idle
                    </Text>
                    <Text style={[styles.d0CopyHint, { textAlign: 'center', maxWidth: 320 }]}>
                      This is not day-plan generation — go back or run AI search again.
                    </Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      activeOpacity={0.85}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        screen.setQuickFindMapOnly(false)
                        screen.resetQuickFindRotationState()
                        screen.setDrawerStep(0)
                        screen.setDayPlan(null)
                        screen.setError(null)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Back to Build my day and AI search"
                    >
                      <Ionicons name="arrow-back-outline" size={20} color={themeColors.primary} />
                      <Text style={styles.retryButtonText}>Back to sheet</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.emptyResults}>No plan generated.</Text>
                )}
              </Reanimated.View>
            ) : screen.quickFindMapOnly && screen.dayPlan?.length === 1 ? (
              <Reanimated.View
                style={[styles.planContentFill, { paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center' }]}
                entering={FadeIn.duration(280)}
              >
                <Text style={[styles.emptyResults, { textAlign: 'center', marginBottom: 8 }]}>Your pick is on the map</Text>
                <Text style={[styles.d0BuildHint, { textAlign: 'center', marginBottom: 18 }]}>
                  Pull the plan sheet up if you need more room — Search again picks a different match for the same tag.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.retryButton, !!screen.loading && { opacity: 0.48 }]}
                    activeOpacity={0.85}
                    disabled={!!screen.loading}
                    onPress={() => void screen.handleQuickFindSearchAgain()}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!screen.loading }}
                    accessibilityLabel="Search again for the same quick find tag"
                  >
                    <Ionicons name="refresh-outline" size={20} color={themeColors.primary} />
                    <Text style={styles.retryButtonText}>Search again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.retryButton}
                    activeOpacity={0.85}
                    onPress={() => {
                      screen.setDrawerStep(0)
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Back to map and sheet"
                  >
                    <Ionicons name="map-outline" size={20} color={themeColors.primary} />
                    <Text style={styles.retryButtonText}>Back to map</Text>
                  </TouchableOpacity>
                </View>
              </Reanimated.View>
            ) : (
              <View style={styles.planContentFill}>
                  <DraggableFlatList
                    style={styles.resultsScrollInCard}
                    data={screen.dayPlan}
                    keyExtractor={(item) => item._planRowKey || `fallback-${item.spot}`}
                    onDragEnd={({ data }) => {
                      if (screen.planReadOnly) return
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                      screen.setDayPlan(data)
                    }}
                    activationDistance={screen.planReadOnly ? 1000 : 12}
                    containerStyle={styles.planDraggableListContainerCard}
                    contentContainerStyle={styles.resultsContent}
                    contentInsetAdjustmentBehavior="never"
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={screen.renderPlanTimelineOverviewHeader}
                    ListFooterComponent={
                      <View style={styles.planListEndFooter}>
                        <Text style={styles.planListEndFooterText}>
                          You reached the end of your plan. Add another stop anytime to keep the day going.
                        </Text>
                      </View>
                    }
                    renderItem={({ item, drag, isActive, getIndex }) => {
                  const planIndex = getIndex() ?? 0
                  const isEat = item.type === 'restaurant'
                  const isEvent = item.type === 'event'
                  const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : screen.colors.morning
                  const galleryUris = pickPlanStopGalleryUris(item, screen.allPlaceMarkers)
                  const thumbUri = galleryUris[0] || null
                  const hasImages = !!thumbUri
                  const hasProfile = !!(item.clientId)
                  const rowKey = item._planRowKey || `fallback-${item.spot || planIndex}`
                  const isExpanded = !!expandedStopKeys[rowKey]
                  const isVisible = planIndex < screen.visibleStopCount
                  const category = getLuxuryCategoryStyle(item)
                  const venueExtraTags = getPlanStopVenueExtraTags(item)
                  /** Food trucks use only the Food truck chip — hide the generic “Dining” pill */
                  const hideCategoryPillForFoodTruck =
                    isEat && isTruthyFoodTruck(item?.isfoodtruck)
                  const reasonText = String(item.reason || '').replace(/\s+/g, ' ').trim()
                  const canToggleReason = reasonText.length > 0
                  const guideParts = splitGuideHighlight(reasonText)

                  return (
                    <ScaleDecorator>
                      <AnimatedStopRow isVisible={isVisible} style={styles.planRowEnterWrap}>
                        <Reanimated.View
                          entering={item.userAdded ? FadeInDown.duration(320) : undefined}
                          style={item.userAdded ? styles.planLuxuryNewPlaceGlow : undefined}
                        >
                        <View style={styles.planLuxuryStopBlock}>
                          <View style={[styles.planLuxuryRowLayout, isActive && styles.planLuxuryRowLayoutActive]}>
                            <View
                              style={[
                                styles.planLuxuryStopSurface,
                                { backgroundColor: innerCardBg, borderColor: innerBorder },
                                isActive && styles.planLuxuryStopSurfaceActive,
                              ]}
                            >
                              <TouchableOpacity
                                onLongPress={screen.planReadOnly ? undefined : drag}
                                delayLongPress={screen.planReadOnly ? 60000 : 180}
                                style={[styles.planLuxuryDragAffordance, screen.planReadOnly && { opacity: 0.35 }]}
                                activeOpacity={0.75}
                                disabled={screen.planReadOnly}
                                accessibilityRole="button"
                                accessibilityLabel="Drag to reorder stop"
                              >
                                <Ionicons name="reorder-three" size={22} color={screen.isDark ? '#64748B' : '#AEAEB2'} />
                              </TouchableOpacity>
                              <Pressable
                                style={styles.planLuxuryStopMainPress}
                                onPress={() => {
                                  if (!hasProfile) return
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                                  screen.setProfileClientId(item.clientId)
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ expanded: isExpanded }}
                                accessibilityLabel={item.spot}
                              >
                                <View style={styles.planLuxuryStopThumb}>
                                  {hasImages ? (
                                    <PreviewImage uri={thumbUri} style={styles.planLuxuryStopThumbImg} noFade />
                                  ) : (
                                    <View style={[styles.planLuxuryStopThumbImg, styles.planLuxuryStopThumbPlaceholder, { backgroundColor: `${accent}22` }]}>
                                      <Ionicons name={isEat ? 'restaurant' : isEvent ? 'calendar' : 'location'} size={22} color={accent} />
                                    </View>
                                  )}
                                </View>
                                <View style={styles.planLuxuryStopTextCol}>
                                  <View style={styles.planLuxuryCategoryRow}>
                                    {!hideCategoryPillForFoodTruck ? (
                                      <View style={[styles.planLuxuryCategoryPill, { backgroundColor: category.bg }]}>
                                        <Ionicons name={category.icon} size={12} color={category.fg} />
                                        <Text style={[styles.planLuxuryCategoryPillText, { color: category.fg }]}>{category.label}</Text>
                                      </View>
                                    ) : null}
                                    {item.userAdded ? (
                                      <View style={styles.planLuxuryUserPickPill} accessibilityRole="text" accessibilityLabel="You added this stop">
                                        <Ionicons name="person" size={11} color={screen.isDark ? '#34D399' : '#059669'} />
                                        <Text style={styles.planLuxuryUserPickPillText}>Your pick</Text>
                                      </View>
                                    ) : null}
                                    {venueExtraTags.map((tag) => (
                                      <View
                                        key={tag.key}
                                        style={styles.planLuxuryVenueTagFoodTruck}
                                        accessibilityRole="text"
                                        accessibilityLabel={tag.label}
                                      >
                                        <Ionicons name="bus-outline" size={11} color="#B45309" />
                                        <Text style={styles.planLuxuryVenueTagFoodTruckText}>{tag.label}</Text>
                                      </View>
                                    ))}
                                  </View>
                                  <Text style={styles.planLuxuryStopTitle} numberOfLines={2}>
                                    {item.spot}
                                  </Text>
                                  {item.rating != null && (
                                    <View style={styles.planLuxuryRatingRow}>
                                      <Ionicons name="star" size={12} color="#FF9F00" />
                                      <Text style={styles.planLuxuryRatingText}>{Number(item.rating).toFixed(1)}</Text>
                                    </View>
                                  )}
                                  {reasonText ? (
                                    <Text
                                      style={[
                                        styles.planLuxuryStopGuideText,
                                        isExpanded && styles.planLuxuryStopGuideTextExpanded,
                                      ]}
                                      numberOfLines={isExpanded ? undefined : 2}
                                    >
                                      {guideParts.pre}
                                      {guideParts.highlight ? (
                                        <Text style={styles.planLuxuryStopGuideTextStrong}>{guideParts.highlight}</Text>
                                      ) : null}
                                      {guideParts.post}
                                    </Text>
                                  ) : null}
                                  {canToggleReason ? (
                                    <TouchableOpacity
                                      style={styles.planLuxuryReasonToggleBtn}
                                      activeOpacity={0.8}
                                      onPress={() => {
                                        setExpandedStopKeys((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }))
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={isExpanded ? 'Collapse stop summary' : 'Expand stop summary'}
                                    >
                                      <Text style={styles.planLuxuryReasonToggleText}>
                                        {isExpanded ? 'Show less' : 'Read more'}
                                      </Text>
                                      <Ionicons
                                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                        size={13}
                                        color={screen.colors.primary || themeColors.primary}
                                      />
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              </Pressable>
                              <View style={styles.planLuxuryActionsCol}>
                                <CinematicAIButton
                                  loading={screen.enhancingIndices?.has?.(planIndex)}
                                  disabled={screen.enhancingIndices?.has?.(planIndex) || screen.planReadOnly}
                                  onPress={() => screen.handleEnhanceStop(planIndex)}
                                  tintColor="#FFFFFF"
                                />
                              </View>
                            </View>
                          </View>
                        </View>
                        </Reanimated.View>
                      </AnimatedStopRow>
                    </ScaleDecorator>
                  )
                    }}
                  />
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {screen.loading && screen.quickFindMapOnly ? (
        <QuickFindCinematicLoader
          subtitle={typeof screen.loadingStatus === 'string' ? screen.loadingStatus : ''}
        />
      ) : null}

    </>
  )
}

/** Fullscreen cinematic quick-search chrome — map stays visible underneath; no card tray */
function QuickFindCinematicLoader({ subtitle }) {
  const pulse = useSharedValue(0)
  React.useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1180, easing: REasing.bezier(0.42, 0, 0.58, 1) }),
      -1,
      true,
    )
  }, [pulse])

  const beamStyle = useAnimatedStyle(() => {
    const s = 0.22 + pulse.value * 0.88
    return {
      opacity: 0.52 + pulse.value * 0.43,
      transform: [{ scaleX: s }],
    }
  })

  const beamShimmerStyle = useAnimatedStyle(() => {
    const x = interpolate(pulse.value, [0, 1], [-96, 96])
    return {
      opacity: 0.35 + pulse.value * 0.55,
      transform: [{ translateX: x }],
    }
  })

  const d0 = useAnimatedStyle(() => {
    const wave = pulse.value * Math.PI * 2
    const opacityRaw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(wave))
    const opacity = Math.min(1, Math.max(0.35, opacityRaw))
    const y = Math.sin(wave + Math.PI / 2) * -8
    return { opacity, transform: [{ translateY: y }, { scale: 0.82 + opacity * 0.22 }] }
  })

  const d1 = useAnimatedStyle(() => {
    const wave = pulse.value * Math.PI * 2 + (Math.PI * 2) / 3
    const opacityRaw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(wave))
    const opacity = Math.min(1, Math.max(0.35, opacityRaw))
    const y = Math.sin(wave + Math.PI / 2) * -8
    return { opacity, transform: [{ translateY: y }, { scale: 0.82 + opacity * 0.22 }] }
  })

  const d2 = useAnimatedStyle(() => {
    const wave = pulse.value * Math.PI * 2 + (Math.PI * 4) / 3
    const opacityRaw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(wave))
    const opacity = Math.min(1, Math.max(0.35, opacityRaw))
    const y = Math.sin(wave + Math.PI / 2) * -8
    return { opacity, transform: [{ translateY: y }, { scale: 0.82 + opacity * 0.22 }] }
  })

  const subline =
    String(subtitle || '')
      .trim() || 'Locating one memorable stop on your map.'

  return (
    <Reanimated.View
      entering={FadeIn.duration(340)}
      exiting={FadeOut.duration(420)}
      style={styles.quickFindCinematicRoot}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel={`Quick search. ${subline}`}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,6,22,0.06)', 'rgba(2,10,34,0.48)', 'rgba(0,0,10,0.9)', 'rgba(0,0,0,0.94)']}
        locations={[0, 0.4, 0.74, 1]}
        style={styles.quickFindCinematicGlow}
      />
      <View style={styles.quickFindCinematicCenter}>
        <Reanimated.View
          entering={FadeInDown.duration(520).springify().damping(20).stiffness(200).mass(0.88)}
        >
          <Text style={styles.quickFindCinematicEyebrow} pointerEvents="none">
            Bahrain in motion
          </Text>
          <Text style={styles.quickFindCinematicTitle} pointerEvents="none">
            Quick search
          </Text>
          <Text style={styles.quickFindCinematicSub} pointerEvents="none">
            {subline}
          </Text>
          <View style={[styles.quickFindCinematicBeamWrap, { alignSelf: 'center' }]}>
            <Reanimated.View style={[styles.quickFindCinematicBeam, beamStyle]}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(233,200,119,0.25)', '#E9C877', '#D4243A', '#C8102E']}
                locations={[0, 0.35, 0.72, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
            </Reanimated.View>
            <Reanimated.View style={[styles.quickFindCinematicBeamShimmer, beamShimmerStyle]} pointerEvents="none">
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.55)',
                  'rgba(255,255,255,0)',
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
            </Reanimated.View>
          </View>
          <View style={[styles.quickFindCinematicDots, { alignSelf: 'center' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Reanimated.View style={[styles.quickFindCinematicDot, { backgroundColor: '#F7DFA0' }, d0]} />
            <Reanimated.View style={[styles.quickFindCinematicDot, { backgroundColor: '#E9C877' }, d1]} />
            <Reanimated.View style={[styles.quickFindCinematicDot, { backgroundColor: '#C8102E' }, d2]} />
          </View>
        </Reanimated.View>
      </View>
    </Reanimated.View>
  )
}

function CinematicAIButton({ loading, disabled, onPress, tintColor }) {
  const breathe = React.useRef(new Animated.Value(0)).current
  const spin = React.useRef(new Animated.Value(0)).current
  const pulse = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    if (loading || disabled) {
      breathe.stopAnimation()
      breathe.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [breathe, loading, disabled])

  React.useEffect(() => {
    if (!loading) {
      spin.stopAnimation()
      pulse.stopAnimation()
      spin.setValue(0)
      pulse.setValue(0)
      return
    }
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    spinLoop.start()
    pulseLoop.start()
    return () => {
      spinLoop.stop()
      pulseLoop.stop()
    }
  }, [loading, pulse, spin])

  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.045],
  })
  const glowOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.52],
  })
  const spinRotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1.06],
  })
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  })

  return (
    <TouchableOpacity
      style={styles.planLuxuryEnhanceBtnWrap}
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Enhance with AI, replace this stop"
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.planLuxuryEnhanceGlow, { opacity: glowOpacity, transform: [{ scale }] }]}
      />
      <LinearGradient
        colors={disabled ? ['#E2E8F0', '#CBD5E1'] : ['#7F0D1F', '#CE1126', '#F43F5E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.planLuxuryEnhanceBtn}
      >
        {loading ? (
          <View style={styles.planLuxuryEnhanceLoadingWrap}>
            <Animated.View
              style={[
                styles.planLuxuryEnhanceLoadingRing,
                { transform: [{ rotate: spinRotate }] },
              ]}
            />
            <Animated.View
              style={[
                styles.planLuxuryEnhanceLoadingCore,
                { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />
          </View>
        ) : (
          <>
            <Ionicons name="sparkles" size={15} color="#FFFFFF" />
            <Text style={[styles.planLuxuryEnhanceBtnText, { color: tintColor || '#FFFFFF' }]}>AI</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  )
}
