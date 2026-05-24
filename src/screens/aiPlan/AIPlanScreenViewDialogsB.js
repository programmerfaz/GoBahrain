import React, { memo, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
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
  BackHandler,
} from 'react-native'
import { CachedImage } from '../../components/CachedImage'
import * as Haptics from 'expo-haptics'
import Reanimated, {
  FadeIn,
  FadeOut,
  FadeInUp,
  FadeOutUp,
  ZoomInEasyDown,
  ZoomOutEasyDown,
  Easing as ReEasing,
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
import ClientProfileModal from '../../components/ClientProfileModal'
import {
  PLAN_MAP_CLIENT_TYPE_FILTERS,
  QUICK_FIND_KIND_OPTIONS,
  BAHRAIN_REGION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SNAP_POINTS,
  getPlanSheetBottomPadding,
  TRAVEL_EXPLORE_OPTIONS,
  STOP_DIALOG_SLIDE_WIDTH,
  STOP_DIALOG_IMAGE_H,
  STOP_DIALOG_IMAGE_W,
} from './constants'
import { AnimatedStopRow, AiStagger, PopIn, PlanStepBubble } from './uiAnimChips'
import { PreviewImage, KhalidScoutPlanVisual } from './uiScoutMosaic'
import { StopDetailGallery } from './stopDetailGallery'
import { PlanDrawerLoadingPanel, PlanModalLoadingView } from './planLoadingViews'
import { AnimatedPlaceMarker, MarkerShowcaseDetailSheet } from './mapMarkerViews'
import { MapScanningOverlay, mapMarkerFilterCategoryKey, markerMatchesPlanMapClientFilter, buildMapMarkers } from './mapOverlayAndMarkersModel'
import { ensureImageUrl, parseStorageImageUrl, resolvePublicImageUrl } from '../../utils/imageUrl'
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
import { FONT_POPPINS_BOLD } from '../../constants/brandFont'
const PLAN_SEARCH_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'restaurants', label: 'Eat' },
  { id: 'places', label: 'Places' },
  { id: 'events', label: 'Events' },
]

const SHARE_PERMISSION_OPTIONS = [
  {
    value: 'view',
    label: 'View only',
    hint: 'They can open and read your plan, but cannot change stops or order.',
  },
  {
    value: 'edit',
    label: 'Can edit',
    hint: 'They can reorder stops and add places — changes sync to your shared plan.',
  },
]

const SharePlanPermissionOptions = memo(function SharePlanPermissionOptions({
  variant,
  selected,
  onSelect,
  disabled,
}) {
  const isDark = variant === 'dark'
  return (
    <View style={isDark ? styles.sharePlanPermOptionsCard : styles.sharePlanPermOptionsCardLight}>
      {SHARE_PERMISSION_OPTIONS.map((opt) => {
        const isSelected = selected === opt.value
        return (
          <Pressable
            key={opt.value}
            style={[
              isDark ? styles.sharePlanPermOptionRow : styles.sharePlanPermOptionRowLight,
              isSelected && (isDark ? styles.sharePlanPermOptionRowActive : styles.sharePlanPermOptionRowLightActive),
              disabled && { opacity: 0.5 },
            ]}
            onPress={() => {
              if (disabled) return
              onSelect(opt.value)
            }}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected, disabled: !!disabled }}
            accessibilityLabel={`${opt.label}. ${opt.hint}`}
          >
            <View
              style={[
                isDark ? styles.sharePlanPermCheckbox : styles.sharePlanPermCheckboxLight,
                isSelected && (isDark ? styles.sharePlanPermCheckboxChecked : styles.sharePlanPermCheckboxLightChecked),
              ]}
            >
              {isSelected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
            </View>
            <View style={styles.sharePlanPermOptionTextCol}>
              <Text style={isDark ? styles.sharePlanPermOptionLabel : styles.sharePlanPermOptionLabelLight}>
                {opt.label}
              </Text>
              <Text style={isDark ? styles.sharePlanPermOptionHint : styles.sharePlanPermOptionHintLight}>
                {opt.hint}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
})

export function AIPlanScreenViewDialogsB({ screen }) {
  const blurTint = screen.isDark ? 'dark' : 'light'
  const placeholderColor = screen.isDark ? '#64748B' : '#94A3B8'
  const tertiaryTextColor = screen.isDark ? '#94A3B8' : '#64748B'
  const chipChevronColor = screen.isDark ? 'rgba(226,232,240,0.52)' : 'rgba(15,23,42,0.35)'
  useEffect(() => {
    if (!screen.showBuildModePickerModal) return undefined
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      screen.closeBuildModePickerModal()
      return true
    })
    return () => sub.remove()
  }, [screen.showBuildModePickerModal, screen.closeBuildModePickerModal])

  useEffect(() => {
    if (!screen.showShareActionPickerModal) return undefined
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      screen.handleCloseShareActionPickerModal()
      return true
    })
    return () => sub.remove()
  }, [screen.showShareActionPickerModal, screen.handleCloseShareActionPickerModal])

  return (
<>

      <Modal
        visible={screen.showBuildModePickerModal}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={screen.closeBuildModePickerModal}
      >
        <View style={styles.buildModeLayer}>
          <Pressable
            style={styles.buildModeBackdrop}
            onPress={screen.closeBuildModePickerModal}
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(6,8,16,0.6)', 'rgba(6,8,16,0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[styles.buildModeCenterWrap, { paddingBottom: screen.insets.bottom + 16 }]}
            pointerEvents="box-none"
          >
            <Reanimated.View
              entering={FadeIn.duration(220)}
              style={styles.buildModeLuxuryHead}
              pointerEvents="none"
            >
              <Text style={styles.buildModeLuxuryEyebrow}>SIYAHABH PLAN BUILDER</Text>
            </Reanimated.View>
            <Reanimated.View entering={ZoomInEasyDown.duration(340)} style={styles.buildModeStandaloneWrap}>
              {screen.buildDayModalPhase === 'menu' ? (
                <>
                  <Text style={styles.buildModeStandaloneTitle}>Build your day</Text>
                  <Text style={styles.buildModeStandaloneHint}>Choose how you want to build your Bahrain day.</Text>
                  <View style={styles.buildModeStandaloneButtonRow}>
                    <Reanimated.View entering={FadeInUp.delay(40).duration(380).easing(ReEasing.out(ReEasing.cubic))} style={styles.buildModeStandaloneOptionSlot}>
                      <TouchableOpacity
                        style={styles.buildModeStandaloneButton}
                        activeOpacity={0.9}
                        onPress={screen.handleBuildDayPickAiPlan}
                        accessibilityRole="button"
                        accessibilityLabel="AI plan mode"
                      >
                        <LinearGradient
                          colors={[themeColors.primary, '#E63950']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.buildModeStandaloneButtonGradient}
                        >
                          <Ionicons name="sparkles" size={22} color="#FFFFFF" />
                          <Text style={styles.buildModeStandaloneButtonTextLight}>AI{'\n'}plan</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </Reanimated.View>
                    <Reanimated.View entering={FadeInUp.delay(110).duration(380).easing(ReEasing.out(ReEasing.cubic))} style={styles.buildModeStandaloneOptionSlot}>
                      <TouchableOpacity
                        style={styles.buildModeStandaloneButton}
                        activeOpacity={0.9}
                        onPress={screen.handleBuildDayPickCustomPlan}
                        accessibilityRole="button"
                        accessibilityLabel="Custom plan"
                      >
                        <View style={styles.buildModeStandaloneButtonOutline}>
                          <Ionicons name="create-outline" size={22} color="#F7DFA0" />
                          <Text style={styles.buildModeStandaloneButtonText}>Custom{'\n'}plan</Text>
                        </View>
                      </TouchableOpacity>
                    </Reanimated.View>
                    <Reanimated.View entering={FadeInUp.delay(180).duration(380).easing(ReEasing.out(ReEasing.cubic))} style={styles.buildModeStandaloneOptionSlot}>
                      <TouchableOpacity
                        style={styles.buildModeStandaloneButton}
                        activeOpacity={0.9}
                        onPress={screen.handleBuildDayPickEnterCode}
                        accessibilityRole="button"
                        accessibilityLabel="Enter shared code"
                      >
                        <View style={styles.buildModeStandaloneButtonOutline}>
                          <Ionicons name="key-outline" size={22} color="#F7DFA0" />
                          <Text style={styles.buildModeStandaloneButtonText}>Enter{'\n'}code</Text>
                        </View>
                      </TouchableOpacity>
                    </Reanimated.View>
                  </View>
                </>
              ) : screen.buildDayModalPhase === 'joinCode' ? (
                <>
                  <Text style={styles.buildModeStandaloneTitle}>Enter code</Text>
                  <Text style={styles.buildModeStandaloneHint}>Paste a shared plan code to open it instantly.</Text>
                  <Reanimated.View
                    entering={FadeInUp.delay(50).duration(400).easing(ReEasing.out(ReEasing.cubic))}
                    style={styles.buildModeJoinCard}
                  >
                    <TextInput
                      style={styles.buildModeJoinInput}
                      value={screen.joinCodeInput}
                      onChangeText={(t) => screen.setJoinCodeInput(t.toUpperCase())}
                      placeholder="ENTER CODE"
                      placeholderTextColor="rgba(148,163,184,0.9)"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={12}
                      editable={!screen.joinCodeBusy}
                      accessibilityLabel="Shared plan code"
                    />
                    <TouchableOpacity
                      style={[
                        styles.buildModeJoinOpenBtn,
                        !screen.joinCodeInput?.trim() && styles.buildModeJoinOpenBtnDisabled,
                      ]}
                      activeOpacity={0.85}
                      disabled={screen.joinCodeBusy || !screen.joinCodeInput?.trim()}
                      onPress={screen.handleBuildDaySubmitJoinCode}
                      accessibilityRole="button"
                      accessibilityLabel="Open shared plan"
                    >
                      {screen.joinCodeBusy ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.buildModeJoinOpenBtnText}>Open</Text>
                      )}
                    </TouchableOpacity>
                  </Reanimated.View>
                </>
              ) : screen.buildDayModalPhase === 'quickKind' || screen.buildDayModalPhase === 'quickSub' ? (
                <>
                  <Text style={styles.buildModeStandaloneTitle}>Quick AI search</Text>
                  <Text style={styles.buildModeStandaloneHint}>
                    Restaurants, places, or events — we match the nearest spot to your profile.
                  </Text>
                  <View style={styles.buildModeStandaloneButtonRow}>
                    {QUICK_FIND_KIND_OPTIONS.map((opt, i) => (
                      <Reanimated.View
                        key={opt.id}
                        entering={FadeInUp.delay(40 + i * 70).duration(380).easing(ReEasing.out(ReEasing.cubic))}
                        style={styles.buildModeStandaloneOptionSlot}
                      >
                        <TouchableOpacity
                          style={styles.buildModeStandaloneButton}
                          activeOpacity={0.9}
                          onPress={() => void screen.handleBuildDayQuickFindSelectKind(opt.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Quick search ${opt.label}`}
                        >
                          <View style={styles.buildModeStandaloneButtonOutline}>
                            <Ionicons name={opt.icon} size={22} color="#F7DFA0" />
                            <Text
                              style={styles.buildModeStandaloneButtonText}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.62}
                            >
                              {opt.label}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </Reanimated.View>
                    ))}
                  </View>
                </>
              ) : null}
                <View style={styles.buildModeFooterRow}>
                  <TouchableOpacity
                    style={styles.buildModeGlassCloseBtn}
                    activeOpacity={0.7}
                    onPress={screen.handleBuildDayQuickFindGoBack}
                    accessibilityLabel="Close"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={22} color={screen.isDark ? 'rgba(226,232,240,0.72)' : 'rgba(15,23,42,0.72)'} />
                  </TouchableOpacity>
                </View>
              </Reanimated.View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!screen.showShareActionPickerModal}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={screen.handleCloseShareActionPickerModal}
      >
        <View style={styles.buildModeLayer}>
          <Pressable
            style={styles.buildModeBackdrop}
            onPress={screen.handleCloseShareActionPickerModal}
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(6,8,16,0.6)', 'rgba(6,8,16,0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[styles.buildModeCenterWrap, { paddingBottom: screen.insets.bottom + 16 }]}
            pointerEvents="box-none"
          >
            <View style={styles.buildModeStandaloneWrap}>
              <Text style={styles.buildModeStandaloneTitle}>Share plan</Text>
              <Text style={styles.buildModeStandaloneHint}>
                {screen.sharePickerPreparing
                  ? 'Preparing your plan…'
                  : 'Choose permissions, copy the code, or share the link.'}
              </Text>
              {screen.sharePickerCode ? (
                <>
                  <Pressable
                    style={styles.sharePlanModalCodeBoxDark}
                    onPress={screen.handleCopySharePickerCode}
                    disabled={screen.sharePickerPreparing || screen.sharePickerSharing}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy share code ${screen.sharePickerCode}`}
                    accessibilityHint="Copies the share code to your clipboard"
                  >
                    <Text style={styles.sharePlanModalCodeDark} selectable>
                      {screen.sharePickerCode}
                    </Text>
                    <Ionicons name="copy-outline" size={22} color="#F7DFA0" />
                  </Pressable>
                  {screen.sharePickerCopyHint ? (
                    <Text style={styles.sharePlanModalCodeCopyHint}>Copied to clipboard</Text>
                  ) : (
                    <Text style={[styles.buildModeStandaloneHint, { marginTop: -6, marginBottom: 14 }]}>
                      Tap the code to copy
                    </Text>
                  )}
                </>
              ) : null}
              <SharePlanPermissionOptions
                variant="dark"
                selected={screen.sharePickerPermission}
                onSelect={screen.handleSharePickerPermissionSelect}
                disabled={screen.sharePickerPreparing || screen.sharePickerSharing}
              />
              <View style={styles.sharePlanModalActions}>
                <TouchableOpacity
                  style={[
                    styles.sharePlanModalBtn,
                    (screen.sharePickerPreparing || screen.sharePickerSharing) && { opacity: 0.55 },
                  ]}
                  onPress={screen.handleShareActionEnableAndBack}
                  disabled={screen.sharePickerPreparing || screen.sharePickerSharing}
                  accessibilityRole="button"
                  accessibilityLabel="Share plan with selected permission"
                >
                  {screen.sharePickerSharing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.sharePlanModalBtnText}>Share plan</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.buildModeFooterRow}>
                <TouchableOpacity
                  style={styles.buildModeGlassCloseBtn}
                  activeOpacity={0.7}
                  onPress={screen.handleCloseShareActionPickerModal}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={22} color={screen.isDark ? 'rgba(226,232,240,0.72)' : 'rgba(15,23,42,0.72)'} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Plan catalog search — fullscreen, Maps-style top search bar (not a bottom sheet) */}
      <Modal
        visible={screen.showSearchModal}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => {
          if (screen.addingPlanStop) return
          if (screen.customPlanDraftActive && !(screen.dayPlan?.length > 0)) {
            screen.dismissCustomPlanDraft()
            return
          }
          screen.setShowSearchModal(false)
        }}
      >
        <KeyboardAvoidingView
          style={styles.searchModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.searchModalRoot,
              { backgroundColor: screen.isDark ? '#0B1220' : '#FFFFFF' },
            ]}
          >
            <View
              style={[styles.planMapsSearchChrome, screen.isDark && styles.planMapsSearchChromeDark]}
            >
              <View
                style={[
                  styles.planMapsSearchTopRow,
                  { paddingTop: screen.insets.top + 4 },
                ]}
              >
                <TouchableOpacity
                  style={styles.planMapsSearchBackBtn}
                  activeOpacity={0.65}
                  onPress={() => {
                    if (screen.addingPlanStop) return
                    if (screen.customPlanDraftActive && !(screen.dayPlan?.length > 0)) {
                      screen.dismissCustomPlanDraft()
                      return
                    }
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                    screen.setShowSearchModal(false)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Go back to map"
                  accessibilityState={{ disabled: screen.addingPlanStop }}
                >
                  <Ionicons
                    name="arrow-back"
                    size={24}
                    color={screen.isDark ? '#F8FAFC' : '#202124'}
                  />
                </TouchableOpacity>
                {screen.searchModalLoading ? (
                  <View
                    style={[styles.planMapsSearchPill, screen.isDark && styles.planMapsSearchPillDark, { opacity: 0.92 }]}
                  >
                    <ActivityIndicator style={{ marginRight: 10 }} size="small" color={themeColors.primary} />
                    <Text
                      style={[
                        styles.planMapsSearchInput,
                        screen.isDark && styles.planMapsSearchInputDark,
                        { flex: 0 },
                      ]}
                      numberOfLines={1}
                    >
                      Loading catalog…
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[styles.planMapsSearchPill, screen.isDark && styles.planMapsSearchPillDark]}
                  >
                    <Ionicons
                      name="search"
                      size={22}
                      color={screen.isDark ? '#94A3B8' : '#5F6368'}
                      style={styles.planMapsSearchIcon}
                    />
                    <TextInput
                      style={[styles.planMapsSearchInput, screen.isDark && styles.planMapsSearchInputDark]}
                      placeholder={screen.addToPlanMode ? 'Search for a stop to add…' : 'Search places and events…'}
                      placeholderTextColor={placeholderColor}
                      value={screen.searchModalQuery}
                      onChangeText={screen.setSearchModalQuery}
                      autoCapitalize="none"
                      autoCorrect
                      returnKeyType="search"
                      {...(Platform.OS === 'ios' ? { clearButtonMode: 'never' } : {})}
                      accessibilityLabel="Search catalog"
                    />
                    {screen.searchModalSemanticSearching &&
                    (screen.searchModalQuery || '').trim().length >= 2 ? (
                      <ActivityIndicator
                        style={styles.searchModalSearchSpinner}
                        size="small"
                        color={themeColors.primary}
                      />
                    ) : null}
                    {screen.searchModalQuery.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => screen.setSearchModalQuery('')}
                        style={styles.searchModalSearchClear}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Clear search text"
                      >
                        <Ionicons name="close-circle" size={22} color={placeholderColor} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
              {!screen.searchModalLoading ? (
                <>
                  <Text
                    style={[
                      styles.planMapsSearchHintText,
                      screen.isDark && styles.planMapsSearchHintTextDark,
                    ]}
                    accessibilityLiveRegion="polite"
                  >
                    {(screen.searchModalQuery || '').trim().length >= 2
                      ? screen.searchModalSemanticSearching
                        ? 'Finding similar places…'
                        : 'Closest matches listed first.'
                      : 'Keep typing — smart matches begin after two characters.'}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.planMapsChipScroll}
                    contentContainerStyle={styles.planMapsChipRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {PLAN_SEARCH_FILTER_OPTIONS.map((opt) => {
                      const active = screen.searchModalCatalogFilter === opt.id
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                            screen.setSearchModalCatalogFilter(opt.id)
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Show ${opt.label}`}
                          activeOpacity={0.85}
                          style={[
                            styles.searchModalFilterChip,
                            screen.isDark && styles.searchModalFilterChipDark,
                            active && styles.searchModalFilterChipActive,
                            active && screen.isDark && styles.searchModalFilterChipActiveDark,
                          ]}
                        >
                          <Text
                            style={[
                              styles.searchModalFilterChipLabel,
                              screen.isDark && styles.searchModalFilterChipLabelDark,
                              active &&
                                (screen.isDark
                                  ? styles.searchModalFilterChipLabelActiveOnDark
                                  : styles.searchModalFilterChipLabelActive),
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                </>
              ) : null}
            </View>

            {screen.searchModalLoading ? (
              <View style={styles.searchModalLoading}>
                <ActivityIndicator size="large" color={themeColors.primary} />
                <Text
                  style={[styles.searchModalLoadingText, screen.isDark && styles.searchModalLoadingTextDark]}
                >
                  Fetching venue catalog…
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.planMapsSearchResultsScroll}
                contentContainerStyle={[
                  styles.planMapsSearchResultsContent,
                  { paddingBottom: Math.max(screen.insets.bottom, 16) + 16 },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {(() => {
                  const qTrim = (screen.searchModalQuery || '').trim()
                  const qLow = qTrim.toLowerCase()
                  const filt = screen.searchModalCatalogFilter
                  const bucketKeys =
                    filt === 'all' ? ['restaurants', 'places', 'events'] : [filt]
                  const blocks = []

                  const sectionLabelOf = (key) =>
                    key === 'restaurants' ? 'Restaurants' : key === 'places' ? 'Places' : 'Events'

                  let totalMatches = 0
                  const display = screen.searchModalDisplayClients || {
                    restaurants: [],
                    places: [],
                    events: [],
                  }

                  bucketKeys.forEach((key) => {
                    const items = display[key] || []
                    if (qLow) totalMatches += items.length
                  })

                  for (const key of bucketKeys) {
                    const sectionLabel = sectionLabelOf(key)
                    const accent =
                      key === 'restaurants'
                        ? screen.colors.dining
                        : key === 'events'
                          ? screen.colors.event
                          : screen.colors.textSecondary
                    const items = display[key] || []
                    if (qLow && items.length === 0) continue

                    blocks.push(
                      <View key={key} style={styles.searchModalSection}>
                        <View style={styles.searchModalSectionHeader}>
                          <View style={[styles.searchModalSectionIcon, { backgroundColor: `${accent}18` }]}>
                            <Ionicons
                              name={key === 'restaurants' ? 'restaurant' : key === 'events' ? 'calendar' : 'location'}
                              size={20}
                              color={accent}
                            />
                          </View>
                          <Text style={[styles.searchModalSectionTitle, { color: accent }]}>{sectionLabel}</Text>
                          {qTrim.length >= 2 && filt !== 'all' && filt === key ? (
                            <View
                              style={[
                                styles.searchModalSmartBadge,
                                screen.isDark && styles.searchModalSmartBadgeDark,
                                { borderColor: `${accent}55` },
                              ]}
                            >
                              <Text style={[styles.searchModalSmartBadgeLabel, { color: accent }]}>Ranked</Text>
                            </View>
                          ) : null}
                        </View>
                        {items.length === 0 ? (
                          <Text style={[styles.searchModalEmpty, screen.isDark && styles.searchModalEmptyDark]}>
                            {qLow ? `No ${sectionLabel.toLowerCase()} for this query` : `No ${sectionLabel.toLowerCase()} yet`}
                          </Text>
                        ) : (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.searchModalHorizontalContent}
                          >
                            {items.map((client, cardIdx) => {
                              const imageUrl = resolvePublicImageUrl(client.client_image)
                              return (
                                <Reanimated.View
                                  key={client.client_a_uuid || client.clientId}
                                  entering={FadeInUp.delay(Math.min(cardIdx, 12) * 44).duration(380).easing(ReEasing.out(ReEasing.cubic))}
                                >
                                  <TouchableOpacity
                                    style={[styles.searchModalClientCard, screen.isDark && styles.searchModalClientCardDark]}
                                    activeOpacity={0.72}
                                    disabled={screen.addingPlanStop}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${sectionLabel}: ${client.name || client.business_name || 'Spot'}`}
                                    onPress={() => {
                                      if (screen.addToPlanMode) {
                                        screen.handleAddClientToPlan(client)
                                        return
                                      }
                                      screen.handleFocusClientFromSearch(client)
                                    }}
                                  >
                                  <View style={[styles.searchModalClientCircle, { borderColor: accent }]}>
                                    {imageUrl ? (
                                      <CachedImage
                                        source={{ uri: imageUrl }}
                                        style={styles.searchModalClientImage}
                                        recyclingKey={imageUrl}
                                        resizeMode="cover"
                                      />
                                    ) : (
                                      <Ionicons
                                        name={
                                          key === 'restaurants' ? 'restaurant' : key === 'events' ? 'calendar' : 'location'
                                        }
                                        size={32}
                                        color={accent}
                                      />
                                    )}
                                  </View>
                                  <Text
                                    style={[
                                      styles.searchModalClientName,
                                      screen.isDark && styles.searchModalClientNameDark,
                                    ]}
                                    numberOfLines={2}
                                  >
                                    {client.name || client.business_name || 'Spot'}
                                  </Text>
                                </TouchableOpacity>
                                </Reanimated.View>
                              )
                            })}
                          </ScrollView>
                        )}
                      </View>,
                    )
                  }

                  if (qLow && totalMatches === 0) {
                    return (
                      <View style={styles.searchModalGlobalEmptyWrap}>
                        <Ionicons name="search-outline" size={42} color={placeholderColor} />
                        <Text
                          style={[
                            styles.searchModalGlobalEmptyTitle,
                            screen.isDark && styles.searchModalGlobalEmptyTitleDark,
                          ]}
                        >
                          No venues match "{qTrim}"
                        </Text>
                        <Text
                          style={[
                            styles.searchModalGlobalEmptySub,
                            screen.isDark && styles.searchModalGlobalEmptySubDark,
                          ]}
                        >
                          Try different words or a category chip — or spell part of the name for a keyword match.
                        </Text>
                      </View>
                    )
                  }

                  if (blocks.length === 0 && !qLow) {
                    return (
                      <Text style={[styles.searchModalEmpty, screen.isDark && styles.searchModalEmptyDark]}>
                        Nothing in this category yet.
                      </Text>
                    )
                  }

                  return blocks
                })()}
              </ScrollView>
            )}
          {screen.addingPlanStop && !screen.searchModalLoading ? (
            <View
              style={[
                styles.searchModalAddingOverlay,
                screen.isDark && styles.searchModalAddingOverlayDark,
              ]}
              pointerEvents="box-none"
            >
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text
                style={[
                  styles.searchModalAddingOverlayText,
                  screen.isDark && styles.searchModalAddingOverlayTextDark,
                ]}
              >
                Adding to your plan…
              </Text>
            </View>
          ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={screen.showSharePlanModal}
        transparent
        animationType="fade"
        onRequestClose={() => screen.setShowSharePlanModal(false)}
      >
        <View style={styles.sharePlanModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => screen.setShowSharePlanModal(false)}
            accessibilityLabel="Dismiss share dialog"
            accessibilityRole="button"
          />
          <Reanimated.View
            entering={FadeInUp.duration(400).easing(ReEasing.out(ReEasing.cubic))}
            style={styles.sharePlanModalCard}
            pointerEvents="box-none"
          >
            <Text style={styles.sharePlanModalTitle}>Share plan</Text>
            <Text style={styles.sharePlanModalSub}>
              Friends open this in SiyahaBH using your link or code. Choose view-only, or let them edit the same plan.
            </Text>
            {screen.shareModalCode ? (
              <View style={styles.sharePlanModalCodeBox}>
                <Text style={styles.sharePlanModalCode}>{screen.shareModalCode}</Text>
              </View>
            ) : (
              <Text style={[styles.sharePlanModalSub, { marginBottom: 12 }]}>Enable sharing to create a code.</Text>
            )}
            <SharePlanPermissionOptions
              variant="light"
              selected={screen.sharePermissionDraft}
              onSelect={screen.setSharePermissionDraft}
            />
            <View style={styles.sharePlanModalActions}>
              <TouchableOpacity
                style={[styles.sharePlanModalBtn, styles.sharePlanModalBtnSecondary]}
                onPress={screen.handleCopyShareLinkOnly}
                disabled={!screen.shareModalCode || screen.shareModalBusy}
              >
                <Text style={[styles.sharePlanModalBtnText, styles.sharePlanModalBtnTextDark]}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sharePlanModalBtn}
                onPress={screen.handleConfirmShareSettings}
                disabled={screen.shareModalBusy}
              >
                <Text style={styles.sharePlanModalBtnText}>
                  {screen.shareModalBusy ? '…' : screen.shareModalCode ? 'Apply' : 'Enable'}
                </Text>
              </TouchableOpacity>
            </View>
            {screen.shareModalCode ? (
              <TouchableOpacity
                onPress={screen.handleDisableSharing}
                style={{ marginTop: 14, alignItems: 'center' }}
                accessibilityRole="button"
                accessibilityLabel="Turn off sharing"
              >
                <Text style={{ fontSize: 13, fontFamily: FONT_POPPINS_BOLD, color: '#DC2626' }}>Turn off sharing</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => screen.setShowSharePlanModal(false)}
              style={{ marginTop: 16, alignItems: 'center' }}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 15, fontFamily: FONT_POPPINS_BOLD, color: tertiaryTextColor }}>Close</Text>
            </TouchableOpacity>
          </Reanimated.View>
        </View>
      </Modal>

      <ClientProfileModal
        visible={!!screen.profileClientId}
        clientId={screen.profileClientId}
        animationFrom="bottom"
        presentation="sheet"
        onClose={() => screen.setProfileClientId(null)}
        insets={screen.insets}
        onOpenARNavigate={(dest) => {
          screen.setProfileClientId(null);
          if (dest?.lat != null && dest?.lng != null) {
            screen.navigation.navigate('AR', { navigateTo: { lat: dest.lat, lng: dest.lng, name: dest.name || 'Destination' } });
          }
        }}
      />

      {screen.doorVisible && (() => {
        const TOOTH_COUNT = 5
        const toothH = SCREEN_HEIGHT / TOOTH_COUNT
        const toothW = SCREEN_WIDTH * 0.12
        return (
          <Animated.View style={[styles.doorOverlay, { opacity: screen.doorFade }]} pointerEvents="box-none">
            <Animated.View style={[styles.doorHalf, styles.doorLeft, { transform: [{ translateX: screen.doorLeft }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
            </Animated.View>
            <Animated.View style={[styles.doorHalf, styles.doorRight, { transform: [{ translateX: screen.doorRight }] }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#CE1126' }]} />
            </Animated.View>
            <Animated.View style={[styles.doorZigzag, { transform: [{ translateX: screen.doorLeft }] }]}>
              {Array.from({ length: TOOTH_COUNT }, (_, i) => (
                <View key={i} style={{
                  width: 0,
                  height: 0,
                  borderTopWidth: toothH / 2,
                  borderBottomWidth: toothH / 2,
                  borderLeftWidth: toothW,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderLeftColor: '#FFFFFF',
                }} />
              ))}
            </Animated.View>
            <Animated.View style={[styles.doorIconWrap, { transform: [{ scale: screen.doorIconScale }], opacity: screen.doorIconOpacity }]}>
              <View style={styles.doorLogoShadow}>
                <CachedImage
                  source={require('../../../assets/ai-button-logo.png')}
                  style={styles.doorLogoImage}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.doorFlagLabel}>SiyahaBH</Text>
            </Animated.View>
          </Animated.View>
        )
      })()}

</>
  )
}
