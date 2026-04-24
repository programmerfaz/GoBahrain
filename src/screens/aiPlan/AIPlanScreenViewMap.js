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
  ActivityIndicator,
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
} from 'react-native-reanimated'
import { GestureDetector } from 'react-native-gesture-handler'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import MapView from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist'
import { openGoogleMapsDirections } from '../../utils/googleMapsDirections'
import { colors as themeColors } from '../../theme/designTokens'
import styles from '../AIPlanScreen.styles'
import {
  PLAN_MAP_CLIENT_TYPE_FILTERS,
  BAHRAIN_REGION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SNAP_POINTS,
  getPlanSheetBottomPadding,
  ORBIT_SLIDER_TOP_FRACTION,
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
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../../utils/imageUrl'
import { openKhalidChat } from '../../utils/khalidChatLink'
import {
  clampRegionToBahrain,
  formatPlanShareMessage,
  parseShareCodeFromUrl,
  openAllStopsInGoogleMaps,
  parsePlanItemCoords,
} from './planGeoAndShare'
import { attachPlanRowKeys, buildDraftStopFromClient, getLuxuryCategoryStyle } from './planRowModel'
import {
  formatStopEventDetailsText,
  getStopAboutPrimaryText,
  pickPlanStopGalleryUris,
  pickPlanStopThumbUri,
} from './planMatching'

const pickOrbitPlaceBlurb = (mk) => {
  if (!mk) return '';
  const raw = String(mk.reason || '').trim();
  if (raw) {
    return raw.length > 168 ? `${raw.slice(0, 165)}…` : raw;
  }
  const chips = [];
  if (mk.time) chips.push(String(mk.time));
  const k = mapMarkerFilterCategoryKey(mk);
  chips.push(k === 'restaurant' ? 'Dining' : k === 'event' ? 'Event' : 'Place');
  return chips.join(' · ');
}

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
  const blurTint = screen.isDark ? 'dark' : 'light'
  const inputPlaceholderColor = screen.isDark ? '#94A3B8' : '#94A3B8'
  const surfaceColor = screen.isDark ? '#0F172A' : '#FFFFFF'
  const subtleSurfaceColor = screen.isDark ? '#1E293B' : '#F2F2F7'
  const borderColor = screen.isDark ? '#334155' : '#CBD5E1'
  const iconMuted = screen.isDark ? '#94A3B8' : '#64748B'
  const iconSubtle = screen.isDark ? '#CBD5E1' : '#374151'
  const overlayColor = screen.isDark ? 'rgba(2,6,23,0.62)' : 'rgba(15,23,42,0.45)'
  const planMapStyle = screen.isDark ? DARK_MAP_STYLE : undefined
  const sheetBackgroundColor = screen.isDark ? '#0B1220' : '#FFFFFF'
  const sheetStep0BackgroundColor = screen.isDark ? '#111827' : '#F2F2F7'
  const sheetStep3BackgroundColor = screen.isDark ? '#0F172A' : '#F2F2F7'
  const sheetBorderColor = screen.isDark ? '#1F2937' : 'rgba(148,163,184,0.18)'
  const sheetShadowColor = screen.isDark ? '#000000' : '#0F172A'
  const innerCardBg = screen.isDark ? '#111827' : '#FFFFFF'
  const innerSoftBg = screen.isDark ? '#1E293B' : '#F8FAFC'
  const innerBorder = screen.isDark ? '#334155' : '#E2E8F0'
  const innerTextPrimary = screen.colors.textPrimary
  const innerTextSecondary = screen.colors.textSecondary
  const orbitPlaceBlurb =
    screen.isMarkerShowcaseActive && screen.showcaseMarkerMk
      ? pickOrbitPlaceBlurb(screen.showcaseMarkerMk)
      : ''
  const orbitPlaceAiSummary = React.useMemo(() => {
    const raw = String(screen.showcaseMarkerMk?.ai_summary || '').trim()
    if (raw) return raw
    return 'Khalid does not have an AI summary for this place yet.'
  }, [screen.showcaseMarkerMk])

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

      {screen.isMarkerShowcaseActive ? (
        <View
          style={[
            styles.markerShowcaseExitWrap,
            { top: screen.insets.top + ORBIT_DONE_BELOW_FILTER_OFFSET },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.orbitHeaderPill}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 82 : 48}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.orbitHeaderPillTint} pointerEvents="none" />
            <View style={styles.orbitHeaderLeft} pointerEvents="none">
              <View style={styles.orbitHeaderDot} />
              {screen.showcaseMarkerMk?.spot ? (
                <Text style={styles.orbitHeaderTitle} numberOfLines={1}>
                  {String(screen.showcaseMarkerMk.spot)}
                </Text>
              ) : (
                <Text style={styles.orbitHeaderTitle} numberOfLines={1}>
                  Place
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.orbitHeaderCloseBtn}
              onPress={screen.exitMarkerShowcase}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Close place view"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color="#1A120A" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {screen.isMarkerShowcaseActive && screen.showcaseMarkerMk && screen.showcaseOrbitPostUris?.length > 0 ? (
        <View
          style={[
            styles.orbitClientPostsStripWrap,
            {
              top: Math.max(
                screen.insets.top + ORBIT_DONE_BELOW_FILTER_OFFSET + 60,
                SCREEN_HEIGHT * ORBIT_SLIDER_TOP_FRACTION,
              ),
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.orbitClientPostsStripTray}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 72 : 44}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.orbitClientPostsStripTint} pointerEvents="none" />
            <OrbitClientPostsStrip imageUris={screen.showcaseOrbitPostUris} accent={screen.showcaseMarkerAccent} />
          </View>
        </View>
      ) : null}

      {screen.isMarkerShowcaseActive && screen.showcaseMarkerMk ? (
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
              {
                borderColor:
                  typeof screen.showcaseMarkerAccent === 'string' && screen.showcaseMarkerAccent.length === 7
                    ? `${screen.showcaseMarkerAccent}55`
                    : 'rgba(233, 200, 119, 0.35)',
                shadowColor: screen.showcaseMarkerAccent || '#000000',
              },
            ]}
          >
            <BlurView
              intensity={Platform.OS === 'ios' ? 82 : 56}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(7,6,10,0.55)', 'rgba(7,6,10,0.82)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.orbitPlaceCardHeader}>
              <View style={styles.orbitPlaceCardOverlinePill}>
                <View style={[styles.orbitPlaceCardOverlineDot, { backgroundColor: screen.showcaseMarkerAccent || '#E9C877' }]} />
                <Text style={styles.orbitPlaceCardOverlineText}>
                  {(() => {
                    const k = mapMarkerFilterCategoryKey(screen.showcaseMarkerMk);
                    if (k === 'restaurant') return 'DINING';
                    if (k === 'event') return 'EVENT';
                    return 'PLACE';
                  })()}
                </Text>
              </View>
              {screen.showcaseMarkerMk?.time ? (
                <View style={styles.orbitPlaceCardTimeChip}>
                  <Ionicons name="time-outline" size={11} color="#F7DFA0" />
                  <Text style={styles.orbitPlaceCardTimeText}>
                    {String(screen.showcaseMarkerMk.time)}
                  </Text>
                </View>
              ) : null}
            </View>
            {orbitPlaceBlurb ? (
              <View style={styles.orbitPlaceBlurbSection} accessibilityRole="text" accessibilityLabel="About this place">
                <Text
                  style={styles.orbitPlaceBlurbText}
                  numberOfLines={2}
                >
                  {orbitPlaceBlurb}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.orbitPlaceSecondaryCTA,
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
              <View style={styles.orbitPlaceSecondaryCTAInner}>
                <Ionicons name="sparkles-outline" size={16} color="#F7DFA0" />
                <Text style={styles.orbitPlaceSecondaryCTALabel}>Ask Khalid</Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.orbitPlaceCardCTA,
                pressed && styles.orbitPlaceCardCTAPressed,
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const clientId = screen.showcaseMarkerMk?.clientId || screen.showcaseMarkerMk?.client_a_uuid || null
                if (!clientId) return
                screen.setProfileClientId(clientId)
              }}
              accessibilityRole="button"
              accessibilityLabel="View client profile"
            >
              <LinearGradient
                colors={['#F7DFA0', '#E9C877', '#B9892F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.orbitPlaceCardCTAGradient}
              >
              
                <Text style={styles.orbitPlaceCardCTALabel}>View details</Text>
                <Ionicons name="chevron-up" size={16} color="#1A120A" />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={[styles.topBarWrap, { paddingTop: screen.insets.top + 2 }]} pointerEvents="box-none">
        <View style={styles.topBarBalanceSpacer} pointerEvents="none" accessibilityElementsHidden />
        {!(screen.quickFindMapOnly && screen.dayPlan?.length === 1) ? (
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
            { backgroundColor: surfaceColor, borderColor: screen.isDark ? '#1E293B' : 'transparent' },
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
          screen.drawerStep === 3 && { backgroundColor: sheetStep3BackgroundColor },
          {
            paddingBottom: getPlanSheetBottomPadding(screen.insets),
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
        <View
          style={styles.sheetDragArea}
          {...screen.panResponder.panHandlers}
          hitSlop={{ top: 16, bottom: 6, left: 0, right: 0 }}
          accessibilityRole="button"
          accessibilityLabel="Swipe up to expand the plan, or drag down to see more map"
        >
          <View style={[styles.grabber, { backgroundColor: borderColor }]} />
          <Text style={[styles.sheetDragHint, { color: screen.colors.textSecondary }]}>Swipe up</Text>
        </View>

        {/* Step 0 — Past Plans (modern hero layout) */}
        {screen.drawerStep === 0 && (
          <View style={styles.pastPlansStepWrap}>
            <View style={[styles.sheetStep0GlassOuter, { backgroundColor: innerSoftBg, borderColor: innerBorder }]}>
              <BlurView intensity={Platform.OS === 'ios' ? 52 : 32} tint={blurTint} style={styles.planMastheadBlur} />
              <View
                style={[
                  styles.planMastheadFrost,
                  { backgroundColor: screen.isDark ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.2)' },
                ]}
                pointerEvents="none"
              />
              <ScrollView style={styles.sheetStep0GlassScroll} contentContainerStyle={styles.d0ScrollContent} showsVerticalScrollIndicator={false}>
                {screen.quickFindMapOnly && screen.loading ? (
                  <View style={{ height: 48 }} />
                ) : screen.quickFindMapOnly && screen.dayPlan?.length === 1 ? (
                  <Reanimated.View
                    entering={FadeInDown.duration(260)}
                    exiting={FadeOutUp.duration(180)}
                    style={[styles.d0QuickFindResultWrap, { backgroundColor: innerCardBg, borderColor: innerBorder }]}
                  >
                    <Text style={[styles.d0BuildSectionTitle, { color: innerTextPrimary }]}>Quick find</Text>
                    <Text style={styles.d0QuickFindSpotName} numberOfLines={3}>
                      {screen.dayPlan[0].spot}
                    </Text>
                    <Text style={[styles.d0BuildHint, { marginBottom: 20, color: innerTextSecondary }]}>
                      Found a strong match near you. Open details, or quickly try another vibe.
                    </Text>
                    <View style={styles.d0QuickFindActionRow}>
                      <TouchableOpacity
                        style={styles.d0QuickFindPrimaryBtn}
                        activeOpacity={0.88}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                          screen.goToStopDetailIndex(0)
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="View place details"
                      >
                        <Ionicons name="information-circle-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.d0QuickFindPrimaryBtnText}>View details</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.d0QuickFindSecondaryBtn}
                        activeOpacity={0.85}
                        onPress={screen.dismissQuickFindResult}
                        accessibilityRole="button"
                        accessibilityLabel="Find another place"
                      >
                        <Ionicons name="refresh" size={18} color="#475569" />
                        <Text style={styles.d0QuickFindSecondaryBtnText}>Find another</Text>
                      </TouchableOpacity>
                    </View>
                  </Reanimated.View>
                ) : (
                  <>
                    <View style={[styles.d0FixedBottomCta, { paddingHorizontal: 0, paddingTop: 0 }]}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.d0CtaRow,
                          pressed && { opacity: 0.93, transform: [{ scale: 0.98 }] },
                          { marginBottom: 0 },
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
                          style={styles.d0CtaGradient}
                        >
                          <View style={styles.d0CtaLogoWrap}>
                        <Image
                          source={require('../../../assets/bahrain-flag.png')}
                          style={styles.d0CtaLogo}
                          accessibilityIgnoresInvertColors
                        />
                          </View>
                          <View style={styles.d0CtaLeft}>
                            <Text style={styles.d0CtaTitle}>Build my day</Text>
                            <Text style={styles.d0CtaSub}>AI plans your perfect Bahrain day</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                        </LinearGradient>
                      </Pressable>
                    </View>
                    {/* Past plans section */}
                    <AiStagger delay={120}>
                      <View style={[styles.d0JoinRow, { backgroundColor: innerCardBg, borderColor: innerBorder }]}>
                        <Text style={[styles.d0JoinLabel, { color: innerTextSecondary }]}>Open a shared plan</Text>
                        <View style={styles.d0JoinInputRow}>
                          <TextInput
                            style={[
                              styles.d0JoinInput,
                              {
                                backgroundColor: surfaceColor,
                                color: screen.colors.textPrimary,
                                borderColor: screen.isDark ? '#334155' : '#E2E8F0',
                              },
                            ]}
                            value={screen.joinCodeInput}
                            onChangeText={(t) => screen.setJoinCodeInput(t.toUpperCase())}
                            placeholder="ENTER CODE"
                            placeholderTextColor={inputPlaceholderColor}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            maxLength={12}
                            editable={!screen.joinCodeBusy}
                            accessibilityLabel="Share code"
                          />
                          <TouchableOpacity
                            style={styles.d0JoinBtn}
                            activeOpacity={0.85}
                            disabled={screen.joinCodeBusy}
                            onPress={() => screen.applyShareCodeFromString(screen.joinCodeInput)}
                            accessibilityRole="button"
                            accessibilityLabel="Open shared plan"
                          >
                            {screen.joinCodeBusy ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <Text style={styles.d0JoinBtnText}>Open</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </AiStagger>
                    {screen.savedPlansList.length > 0 && (
                      <>
                        <AiStagger delay={140}>
                          <View style={styles.d0SectionHeader}>
                            <Text style={[styles.d0SectionTitle, { color: innerTextPrimary }]}>Saved plans</Text>
                            <View style={styles.d0SectionCount}>
                              <Text style={styles.d0SectionCountText}>{screen.savedPlansList.length}</Text>
                            </View>
                          </View>
                        </AiStagger>
                        {screen.savedPlansList.map((plan, idx) => {
                          const n = Array.isArray(plan.plan_data) ? plan.plan_data.length : 0
                          return (
                            <AiStagger key={plan.id} delay={180 + idx * 50}>
                              <View style={[styles.d0PlanCard, { backgroundColor: innerCardBg, borderColor: innerBorder }]}>
                                <TouchableOpacity
                                  style={styles.d0PlanCardMainHit}
                                  activeOpacity={0.8}
                                  disabled={screen.joinCodeBusy}
                                  onPress={() => screen.handleOpenSavedPlanRow(plan)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Open saved plan ${plan.title}`}
                                >
                                  <View style={styles.d0PlanIconWrap}>
                                    <Ionicons name="map" size={20} color={themeColors.primary} />
                                  </View>
                                  <View style={styles.d0PlanInfo}>
                                    <Text style={styles.d0PlanName}>{plan.title}</Text>
                                    <Text style={styles.d0PlanMeta}>
                                      {n} stops · {screen.formatSavedPlanDate(plan.updated_at)}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={16} color={screen.isDark ? '#64748B' : '#CBD5E1'} />
                                </TouchableOpacity>
                                <View style={styles.d0PlanRowActions}>
                                  <TouchableOpacity
                                    style={styles.d0PlanRowActionBtn}
                                    activeOpacity={0.75}
                                    disabled={screen.joinCodeBusy}
                                    onPress={() => screen.handleOpenEditSavedPlanTitle(plan.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Rename ${plan.title}`}
                                  >
                                    <Ionicons name="create-outline" size={20} color="#64748B" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.d0PlanRowActionBtn}
                                    activeOpacity={0.75}
                                    disabled={screen.joinCodeBusy}
                                    onPress={() => screen.handleRequestDeleteSavedPlan(plan)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Delete ${plan.title}`}
                                  >
                                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </AiStagger>
                          )
                        })}
                      </>
                    )}
                    {screen.savedPlansLoading ? (
                      <Text style={[styles.d0CopyHint, { marginTop: 8 }]}>Loading saved plans…</Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Step 3 — Day plan results (steps 1–2 now in modal) */}
        {screen.drawerStep === 3 && (
          <View style={[styles.planStep3Body, { backgroundColor: sheetStep3BackgroundColor }]}>
            {screen.loading || screen.error || !screen.dayPlan?.length ? (
              <View style={[styles.drawerPageHeader, { borderBottomColor: innerBorder }]}>
                <TouchableOpacity
                  style={styles.backButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    screen.setQuickFindMapOnly(false)
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
                      { backgroundColor: screen.isDark ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.2)' },
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
                  Quick find keeps one pin — open the sheet on the home tab for build options.
                </Text>
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
              </Reanimated.View>
            ) : (
              <View style={styles.planContentFill}>
              <DraggableFlatList
                style={styles.resultsScroll}
                data={screen.dayPlan}
                keyExtractor={(item) => item._planRowKey || `fallback-${item.spot}`}
                onDragEnd={({ data }) => {
                  if (screen.planReadOnly) return
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  screen.setDayPlan(data)
                }}
                activationDistance={screen.planReadOnly ? 1000 : 12}
                containerStyle={styles.planDraggableListContainer}
                contentContainerStyle={styles.resultsContent}
                contentInsetAdjustmentBehavior="never"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={screen.renderPlanTimelineOverviewHeader}
                renderItem={({ item, drag, isActive, getIndex }) => {
                  const planIndex = getIndex() ?? 0
                  const isEat = item.type === 'restaurant'
                  const isEvent = item.type === 'event'
                  const accent = isEat ? themeColors.dining : isEvent ? themeColors.event : screen.colors.morning
                  const galleryUris = pickPlanStopGalleryUris(item, screen.allPlaceMarkers)
                  const thumbUri = galleryUris[0] || null
                  const hasImages = !!thumbUri
                  const hasProfile = !!(item.clientId)
                  const isExpanded = false
                  const isVisible = planIndex < screen.visibleStopCount
                  const category = getLuxuryCategoryStyle(item)
                  const canOpenMaps = item.lat != null && item.lng != null

                  return (
                    <ScaleDecorator>
                      <AnimatedStopRow isVisible={isVisible} style={styles.planRowEnterWrap}>
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
                                  <Text style={styles.planLuxuryStopTitle} numberOfLines={2}>
                                    {item.spot}
                                  </Text>
                                  <View style={styles.planLuxuryCategoryRow}>
                                    <View style={[styles.planLuxuryCategoryPill, { backgroundColor: category.bg }]}>
                                      <Ionicons name={category.icon} size={12} color={category.fg} />
                                      <Text style={[styles.planLuxuryCategoryPillText, { color: category.fg }]}>{category.label}</Text>
                                    </View>
                                    {item.userAdded ? (
                                      <View style={styles.planLuxuryUserPickPill} accessibilityRole="text" accessibilityLabel="You added this stop">
                                        <Ionicons name="person" size={11} color={screen.isDark ? '#34D399' : '#059669'} />
                                        <Text style={styles.planLuxuryUserPickPillText}>Your pick</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  {item.rating != null && (
                                    <View style={styles.planLuxuryRatingRow}>
                                      <Ionicons name="star" size={12} color="#FF9F00" />
                                      <Text style={styles.planLuxuryRatingText}>{Number(item.rating).toFixed(1)}</Text>
                                    </View>
                                  )}
                                </View>
                              </Pressable>
                              <TouchableOpacity
                                style={styles.planLuxuryConnectorNavBtn}
                                activeOpacity={0.85}
                                onPress={() => {
                                  if (canOpenMaps) openGoogleMapsDirections(item.lat, item.lng)
                                }}
                                disabled={!canOpenMaps}
                                accessibilityRole="button"
                                accessibilityLabel="Open directions for this stop"
                              >
                                <Ionicons name="navigate" size={17} color="#FFFFFF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.planLuxuryEnhanceBtn}
                                activeOpacity={0.85}
                                onPress={() => screen.handleEnhanceStop(planIndex)}
                                disabled={screen.enhancingIndex !== null || screen.planReadOnly}
                                accessibilityRole="button"
                                accessibilityLabel="Enhance with AI, replace this stop"
                              >
                                {screen.enhancingIndex === planIndex ? (
                                  <ActivityIndicator size="small" color={screen.colors.primary || themeColors.primary} />
                                ) : (
                                  <>
                                    <Ionicons name="sparkles" size={15} color={screen.colors.primary || themeColors.primary} />
                                    <Text style={styles.planLuxuryEnhanceBtnText}>AI</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
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
        <Reanimated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(160)}
          style={styles.quickFindSearchingOverlay}
          pointerEvents="auto"
          accessibilityViewIsModal
        >
          <BlurView intensity={Platform.OS === 'ios' ? 36 : 0} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
          <Reanimated.View entering={ZoomInEasyDown.duration(240)} style={styles.quickFindSearchingCard}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.quickFindSearchingTitle}>Quick searching…</Text>
            <Text style={styles.quickFindSearchingSub}>Finding one mappable match that fits your pick</Text>
          </Reanimated.View>
        </Reanimated.View>
      ) : null}

    </>
  )
}
