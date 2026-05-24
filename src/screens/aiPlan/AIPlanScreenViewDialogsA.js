import React, { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
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
} from 'react-native'
import { CachedImage } from '../../components/CachedImage'
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
import styles from '../AIPlanScreen.styles'
import ClientProfileModal from '../../components/ClientProfileModal'
import {
  PLAN_MAP_CLIENT_TYPE_FILTERS,
  BAHRAIN_REGION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SNAP_POINTS,
  getPlanSheetBottomPadding,
  PREFERENCES,
  FOOD_CATEGORIES,
  PLAN_MODAL_MAX_FOOD_CATEGORIES,
  STOP_DIALOG_SLIDE_WIDTH,
  STOP_DIALOG_IMAGE_H,
  STOP_DIALOG_IMAGE_W,
} from './constants'
import { AnimatedStopRow, AiStagger, PopIn, PlanStepBubble, AnimatedOptionChip } from './uiAnimChips'
import { PreviewImage, KhalidScoutPlanVisual } from './uiScoutMosaic'
import { StopDetailGallery } from './stopDetailGallery'
import { PlanDrawerLoadingPanel, PlanModalLoadingView, PlanCinematicShell } from './planLoadingViews'
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

/** One plan-modal preference/food chip — stable press handler; toggles draft state only (no full-screen re-render) */
const PlanModalOptionChipTile = memo(function PlanModalOptionChipTile({
  item,
  staggerDelay,
  variant,
  isSelected,
  isPrefStep,
  isAtLimit,
  onTogglePreferenceId,
  onToggleFoodCategoryId,
}) {
  const pressCtxRef = useRef({})
  pressCtxRef.current = {
    isPrefStep,
    isSelected,
    isAtLimit,
    id: item.id,
    onTogglePreferenceId,
    onToggleFoodCategoryId,
  }

  const handlePress = useCallback(() => {
    const c = pressCtxRef.current
    if (!c.isPrefStep && !c.isSelected && c.isAtLimit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
      return
    }
    if (c.isPrefStep) c.onTogglePreferenceId(c.id)
    else c.onToggleFoodCategoryId(c.id)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])

  return (
    <PopIn delay={staggerDelay}>
      <AnimatedOptionChip item={item} variant={variant} isSelected={isSelected} onPress={handlePress} />
    </PopIn>
  )
})

export function AIPlanScreenViewDialogsA({ screen }) {
  const iconColor = screen.isDark ? '#CBD5E1' : '#0F172A'
  const modalBackdrop = screen.isDark ? '#020617' : '#07060A'
  const isPrefStep = screen.planModalStep === 1
  const hasSelectionLimit = !isPrefStep

  /** Draft picks live only in this subtree so chip taps do not re-render the map + rest of the plan screen */
  const [draftPreferences, setDraftPreferences] = useState([])
  const [draftFoodCategories, setDraftFoodCategories] = useState([])

  const draftPreferencesRef = useRef(draftPreferences)
  const draftFoodRef = useRef(draftFoodCategories)
  draftPreferencesRef.current = draftPreferences
  draftFoodRef.current = draftFoodCategories

  const showPlanModalPrevRef = useRef(screen.showPlanModal)

  useLayoutEffect(() => {
    const next = screen.showPlanModal
    const prev = showPlanModalPrevRef.current

    if (next && !prev) {
      setDraftPreferences(Array.isArray(screen.selectedPreferences) ? [...screen.selectedPreferences] : [])
      setDraftFoodCategories(Array.isArray(screen.selectedFoodCategories) ? [...screen.selectedFoodCategories] : [])
    }

    if (prev && !next) {
      screen.setSelectedPreferences(draftPreferencesRef.current)
      screen.setSelectedFoodCategories(draftFoodRef.current)
    }

    showPlanModalPrevRef.current = next
  }, [screen.showPlanModal, screen.setSelectedPreferences, screen.setSelectedFoodCategories])

  const toggleDraftPreference = useCallback((id) => {
    setDraftPreferences((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id)
      return [...prev, id]
    })
  }, [])

  const toggleDraftFoodCategory = useCallback((id) => {
    setDraftFoodCategories((prev) => {
      if (prev.includes(id)) return prev.filter((f) => f !== id)
      if (prev.length >= PLAN_MODAL_MAX_FOOD_CATEGORIES) return prev
      return [...prev, id]
    })
  }, [])

  const selectedCount = isPrefStep ? draftPreferences.length : draftFoodCategories.length
  const maxSelected = PLAN_MODAL_MAX_FOOD_CATEGORIES
  const isAtLimit = hasSelectionLimit && selectedCount >= maxSelected
  return (
<>

      {/* Plan modal — cinematic design (photo stage, viewfinder, gold/red accents) */}
      <Modal visible={screen.showPlanModal} transparent animationType="none">
        <KeyboardAvoidingView
          style={styles.planModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[styles.planModalBackdropWrap, { opacity: screen.planModalBackdrop }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: modalBackdrop }]} />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => screen.closePlanModal()}
              disabled={screen.loading || screen.planGenerationSuccess}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.planModalContentWrap,
              {
                opacity: screen.planModalOpacity,
                transform: [{ scale: screen.planModalScale }],
              },
            ]}
          >
            <View style={styles.planModalGlassShell}>
              <View style={styles.planModalGlassBody}>
                {screen.loading || screen.planGenerationSuccess ? (
                  <View style={styles.planModalPresenceLayer}>
                    <PlanModalLoadingView
                      loadingStatus={screen.loadingStatus}
                      showSuccess={screen.planGenerationSuccess}
                      spotPreviews={screen.spotPreviews}
                    />
                  </View>
                ) : (
                  <View style={styles.planModalPresenceLayer}>
                    <PlanCinematicShell
                      photos={screen.spotPreviews}
                      label={screen.planModalStep === 1 ? 'PLAN · STEP 1 OF 2' : 'PLAN · STEP 2 OF 2'}
                    >
                      <View style={styles.pmCinematicContent} pointerEvents="box-none">
                        <View style={styles.pmCinematicHero} pointerEvents="none">
                          <PopIn key={`cine-dots-${screen.planModalStep}`} delay={60}>
                            <View style={styles.pmCinematicStepDots}>
                              <View style={[styles.pmCinematicDot, screen.planModalStep >= 1 && styles.pmCinematicDotActive]} />
                              <View style={styles.pmCinematicDotLine} />
                              <View style={[styles.pmCinematicDot, screen.planModalStep >= 2 && styles.pmCinematicDotActive]} />
                            </View>
                          </PopIn>
                          <PopIn key={`cine-title-${screen.planModalStep}`} delay={140}>
                            <Text style={styles.pmCinematicTitle}>
                              {screen.planModalStep === 1 ? 'What excites you?' : 'What are you craving?'}
                            </Text>
                          </PopIn>
                          <PopIn key={`cine-sub-${screen.planModalStep}`} delay={200}>
                            {(() => {
                              const prefCount = draftPreferences.length
                              const foodCount = draftFoodCategories.length
                              const isFoodStep = screen.planModalStep === 2
                              const pickedCount = isFoodStep ? foodCount : prefCount
                              const hasPick = pickedCount > 0
                              const subtitle =
                                screen.planModalStep === 1
                                  ? 'Pick the vibes that match your Bahrain trip'
                                  : `Choose up to ${PLAN_MODAL_MAX_FOOD_CATEGORIES} food moods for the day`
                              const tallyText = isFoodStep
                                ? `${foodCount}/${PLAN_MODAL_MAX_FOOD_CATEGORIES} picked`
                                : `${prefCount} picked`

                              return (
                                <View style={styles.pmCinematicHeroMeta} accessibilityLiveRegion="polite">
                                  <Text style={styles.pmCinematicSub}>{subtitle}</Text>
                                  <View
                                    style={[
                                      styles.pmCinematicPickedPill,
                                      !hasPick && styles.pmCinematicPickedPillIdle,
                                    ]}
                                    accessibilityLabel={tallyText}
                                  >
                                    <Ionicons
                                      name={hasPick ? 'checkmark-circle' : 'ellipse-outline'}
                                      size={14}
                                      color={hasPick ? '#E9C877' : 'rgba(255,255,255,0.42)'}
                                    />
                                    <Text style={[styles.pmCinematicPickedText, !hasPick && styles.pmCinematicPickedTextIdle]}>
                                      {tallyText}
                                    </Text>
                                  </View>
                                </View>
                              )
                            })()}
                          </PopIn>
                        </View>

                        <View style={styles.pmCinematicChipsPanel}>
                          <LinearGradient
                            colors={['rgba(7,6,10,0.3)', 'rgba(7,6,10,0.82)', 'rgba(7,6,10,0.95)']}
                            locations={[0, 0.25, 1]}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                          />
                          <ScrollView
                            style={styles.pmCinematicChipsScroll}
                            contentContainerStyle={[styles.pmCinematicChipsScrollContent, { paddingTop: 10 }]}
                            showsVerticalScrollIndicator={false}
                          >
                            <View style={styles.pmOptionGrid}>
                              {(screen.planModalStep === 1 ? PREFERENCES : FOOD_CATEGORIES).map((item, idx) => {
                                const selected =
                                  screen.planModalStep === 1
                                    ? draftPreferences.includes(item.id)
                                    : draftFoodCategories.includes(item.id)
                                return (
                                  <PlanModalOptionChipTile
                                    key={`${screen.planModalStep}-cchip-${item.id}`}
                                    item={item}
                                    staggerDelay={280 + idx * 30}
                                    variant="dark"
                                    isSelected={selected}
                                    isPrefStep={isPrefStep}
                                    isAtLimit={isAtLimit}
                                    onTogglePreferenceId={toggleDraftPreference}
                                    onToggleFoodCategoryId={toggleDraftFoodCategory}
                                  />
                                )
                              })}
                            </View>
                          </ScrollView>
                          {hasSelectionLimit && isAtLimit ? (
                            <Text style={styles.pmCinematicLimitHint}>
                              {`Max ${PLAN_MODAL_MAX_FOOD_CATEGORIES} food categories selected`}
                            </Text>
                          ) : null}

                          <PopIn key={`cine-actions-${screen.planModalStep}`} delay={500}>
                            <View style={styles.pmCinematicActionRow}>
                              {screen.planModalStep === 1 ? (
                                <>
                                  <TouchableOpacity
                                    style={styles.pmCinematicBackBtn}
                                    activeOpacity={0.8}
                                    onPress={() => screen.closePlanModal()}
                                    accessibilityLabel="Close"
                                    accessibilityRole="button"
                                  >
                                    <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.pmCinematicPrimaryBtn}
                                    activeOpacity={0.88}
                                    onPress={() => {
                                      screen.setSelectedPreferences(draftPreferences)
                                      const prefLabels = draftPreferences
                                        .map((id) => PREFERENCES.find((p) => p.id === id)?.label)
                                        .filter(Boolean)
                                      screen.startBackgroundPrefetch(prefLabels)
                                      screen.setPlanModalStep(2)
                                    }}
                                    accessibilityLabel="Continue to food preferences"
                                    accessibilityRole="button"
                                  >
                                    <LinearGradient
                                      colors={['#F7DFA0', '#E9C877']}
                                      start={{ x: 0, y: 0 }}
                                      end={{ x: 1, y: 1 }}
                                      style={styles.pmCinematicBtnGradient}
                                    >
                                      <Text style={styles.pmCinematicBtnText}>Continue</Text>
                                      <Ionicons name="arrow-forward" size={18} color="#1A120A" />
                                    </LinearGradient>
                                  </TouchableOpacity>
                                </>
                              ) : (
                                <>
                                  <TouchableOpacity
                                    style={styles.pmCinematicBackBtn}
                                    activeOpacity={0.8}
                                    onPress={() => screen.setPlanModalStep(1)}
                                    accessibilityLabel="Go back"
                                    accessibilityRole="button"
                                  >
                                    <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.85)" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.pmCinematicPrimaryBtn}
                                    activeOpacity={0.88}
                                    onPress={() => {
                                      screen.setSelectedPreferences(draftPreferences)
                                      screen.setSelectedFoodCategories(draftFoodCategories)
                                      screen.handleGenerate(() => screen.closePlanModal())
                                    }}
                                    accessibilityLabel="Generate your plan"
                                    accessibilityRole="button"
                                  >
                                    <LinearGradient
                                      colors={['#F7DFA0', '#E9C877']}
                                      start={{ x: 0, y: 0 }}
                                      end={{ x: 1, y: 1 }}
                                      style={styles.pmCinematicBtnGradient}
                                    >
                                      <Ionicons name="sparkles" size={18} color="#1A120A" />
                                      <Text style={styles.pmCinematicBtnText}>Generate My Plan</Text>
                                    </LinearGradient>
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          </PopIn>
                        </View>
                      </View>
                    </PlanCinematicShell>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

</>
  )
}
