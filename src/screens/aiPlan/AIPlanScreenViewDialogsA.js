import React from 'react'
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
import { colors as themeColors } from '../../theme/designTokens'
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


export function AIPlanScreenViewDialogsA({ screen }) {
  const iconColor = screen.isDark ? '#CBD5E1' : '#0F172A'
  const modalBackdrop = screen.isDark ? '#020617' : '#07060A'
  return (
<>

      {/* Stop detail — centered dialog over map / sheet */}
      <Modal
        visible={!!screen.stopDetailPayload}
        transparent
        animationType="fade"
        onRequestClose={screen.closeStopDetailDialog}
      >
        {screen.stopDetailPayload ? (
          <KeyboardAvoidingView
            style={styles.stopDialogKb}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.stopDialogRoot}>
              <TouchableOpacity
                style={styles.stopDialogDim}
                activeOpacity={1}
                onPress={screen.closeStopDetailDialog}
                accessibilityLabel="Dismiss"
                accessibilityRole="button"
              />
              <View style={styles.stopDialogTinderWrap} accessibilityViewIsModal pointerEvents="box-none">
                <View style={styles.stopDialogTinderRow}>
                  <TouchableOpacity
                    style={[
                      styles.stopDialogArrowFab,
                      styles.stopDialogArrowFabLeft,
                      (screen.stopDetailIndex || 0) <= 0 && styles.stopDialogArrowFabDisabled,
                    ]}
                    activeOpacity={0.88}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                      screen.goToStopDetailIndex((screen.stopDetailIndex || 0) - 1)
                    }}
                    disabled={(screen.stopDetailIndex || 0) <= 0}
                    accessibilityRole="button"
                    accessibilityLabel="View previous itinerary stop"
                  >
                    <Ionicons name="chevron-back" size={20} color={iconColor} />
                  </TouchableOpacity>
                  <View style={[styles.stopDialogCardShell, { width: STOP_DIALOG_SLIDE_WIDTH }]}>
                    {screen.stopDetailStackPeekNext ? (
                      <Reanimated.View
                        style={[styles.stopDialogStackBack, screen.stopDetailPeekAnimatedStyle]}
                        pointerEvents="none"
                      >
                        <LinearGradient
                          colors={[`${screen.stopDetailStackPeekNext.accent}66`, '#0f172a']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.stopDialogStackBackInner}>
                          <Ionicons
                            name={screen.stopDetailStackPeekNext.isEat ? 'restaurant' : screen.stopDetailStackPeekNext.isEvent ? 'calendar' : 'location'}
                            size={15}
                            color="#FFFFFF"
                          />
                          <Text style={styles.stopDialogStackBackTitle} numberOfLines={2}>
                            {screen.stopDetailStackPeekNext.item.spot}
                          </Text>
                        </View>
                      </Reanimated.View>
                    ) : null}
                    <GestureDetector gesture={screen.stopDetailPanGesture}>
                      <Reanimated.View
                        style={[
                          styles.stopDialogCard,
                          { width: STOP_DIALOG_SLIDE_WIDTH, maxWidth: '100%' },
                          screen.stopDetailCardAnimatedStyle,
                        ]}
                      >
                        <View style={styles.stopDialogExploreHero}>
                          <View style={[styles.stopDialogExploreImageFrame, { height: STOP_DIALOG_IMAGE_H }]}>
                            <StopDetailGallery
                              images={Array.isArray(screen.stopDetailPayload.images) ? screen.stopDetailPayload.images : []}
                              singleUri={
                                screen.stopDetailPayload.hasImages
                                  ? (screen.stopDetailPayload.images[0] || screen.stopDetailPayload.item.image)
                                  : (screen.stopDetailPayload.item.image || null)
                              }
                              accent={screen.stopDetailPayload.accent}
                              isEat={screen.stopDetailPayload.isEat}
                              isEvent={screen.stopDetailPayload.isEvent}
                              slideWidth={STOP_DIALOG_IMAGE_W}
                              imageHeight={STOP_DIALOG_IMAGE_H}
                              bottomRadius={0}
                              hideBottomDotsRow
                            />
                            <LinearGradient
                              colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
                              locations={[0, 0.3, 0.6, 1]}
                              style={styles.stopDialogExploreGrad}
                              pointerEvents="none"
                            />
                            <TouchableOpacity
                              style={styles.stopDialogExploreClose}
                              onPress={screen.closeStopDetailDialog}
                              accessibilityRole="button"
                              accessibilityLabel="Close"
                              activeOpacity={0.88}
                            >
                              <Ionicons name="close" size={20} color="#FFFFFF" />
                            </TouchableOpacity>
                            {screen.stopDetailPayload.category ? (
                              <View style={styles.stopDialogExploreBadgeWrap}>
                                <BlurView intensity={Platform.OS === 'ios' ? 60 : 0} tint="dark" style={styles.stopDialogExploreBadge}>
                                  <View style={styles.stopDialogExploreBadgeDot} />
                                  <Text style={styles.stopDialogExploreBadgeText} numberOfLines={1}>
                                    {screen.stopDetailPayload.category.label}
                                  </Text>
                                </BlurView>
                              </View>
                            ) : null}
                            <View style={styles.stopDialogExploreNumberWrap} pointerEvents="none">
                              <Text style={styles.stopDialogExploreNumber}>
                                {String((screen.stopDetailIndex ?? 0) + 1).padStart(2, '0')}
                              </Text>
                            </View>
                            <View style={styles.stopDialogExploreBottom}>
                              <Text style={styles.stopDialogExploreTitle} numberOfLines={2}>
                                {screen.stopDetailPayload.item.spot}
                              </Text>
                              {screen.stopDetailPayload.item.rating != null ? (
                                <View style={styles.stopDialogExploreInfoRow}>
                                  <View style={styles.stopDialogExploreInfoPill}>
                                    <Ionicons name="star" size={12} color="#FF9F00" />
                                    <Text style={styles.stopDialogExploreInfoText} numberOfLines={1}>
                                      {Number(screen.stopDetailPayload.item.rating).toFixed(1)}
                                    </Text>
                                  </View>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                        <View style={styles.stopDialogBodyStatic}>
                          <View style={styles.stopDialogScrollContent}>
                          <View style={styles.stopDialogLuxurySectionCard}>
                            <View style={styles.stopDialogLuxurySectionTitleRow}>
                              <View style={styles.stopDialogLuxurySectionAccentBar} accessibilityElementsHidden />
                              <Text style={styles.stopDialogLuxurySectionTitle}>
                                {screen.stopDetailPayload.isEvent ? 'About this event' : 'About this place'}
                              </Text>
                            </View>
                            <Text style={styles.stopDialogLuxuryBody}>
                              {getStopAboutPrimaryText(screen.stopDetailPayload.item, screen.stopDetailPayload.isEvent)}
                            </Text>
                          </View>

                          {screen.stopDetailPayload.isEvent ? (
                            <View style={[styles.stopDialogLuxurySectionCard, styles.stopDialogLuxurySectionCardEvent]}>
                              <View style={styles.stopDialogLuxurySectionTitleRow}>
                                <View style={styles.stopDialogLuxurySectionAccentBar} accessibilityElementsHidden />
                                <Text style={styles.stopDialogLuxurySectionTitle}>Event details</Text>
                              </View>
                              <Text style={styles.stopDialogLuxuryBody}>
                                {formatStopEventDetailsText(screen.stopDetailPayload.item)}
                              </Text>
                            </View>
                          ) : (
                            <View style={[styles.stopDialogLuxurySectionCard, styles.stopDialogLuxurySectionCardNotes]}>
                              <View style={styles.stopDialogLuxuryNotesHeading}>
                                <View style={styles.stopDialogLuxuryNotesTag}>
                                  <Text style={styles.stopDialogLuxuryNotesTagText}>Notes</Text>
                                </View>
                                <Text style={styles.stopDialogLuxuryNotesAccent}>from the Community</Text>
                              </View>
                              <Text style={styles.stopDialogLuxuryBody}>
                                {(() => {
                                  const r = String(screen.stopDetailPayload.item.reason || '').trim()
                                  if (!r) return 'Community tips will appear here when available.'
                                  const parts = r.split(/(?<=[.!?])\s+/).filter(Boolean)
                                  const rest = parts.slice(1).join(' ').trim()
                                  if (rest) return rest
                                  return 'Share your take after you visit — short notes help the next traveler plan with confidence.'
                                })()}
                              </Text>
                            </View>
                          )}

                          <View style={styles.stopDialogUnifiedActionsStrip}>
                            <TouchableOpacity
                              style={styles.stopDialogUnifiedActionBtn}
                              activeOpacity={0.88}
                              onPress={() => {
                                if (screen.stopDetailPayload.item.lat != null && screen.stopDetailPayload.item.lng != null) {
                                  openGoogleMapsDirections(screen.stopDetailPayload.item.lat, screen.stopDetailPayload.item.lng)
                                  screen.closeStopDetailDialog()
                                }
                              }}
                              disabled={screen.stopDetailPayload.item.lat == null || screen.stopDetailPayload.item.lng == null}
                              accessibilityRole="button"
                              accessibilityLabel="Get directions"
                            >
                              <Ionicons name="navigate-outline" size={16} color={themeColors.primary} />
                              <Text style={styles.stopDialogUnifiedActionBtnText} numberOfLines={2}>
                                Directions
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.stopDialogUnifiedActionBtn}
                              activeOpacity={0.88}
                              onPress={() => {
                                if (screen.stopDetailPayload.item.lat != null && screen.stopDetailPayload.item.lng != null) {
                                  screen.navigation.navigate('AR', {
                                    navigateTo: {
                                      lat: screen.stopDetailPayload.item.lat,
                                      lng: screen.stopDetailPayload.item.lng,
                                      name: screen.stopDetailPayload.item.spot,
                                    },
                                  })
                                  screen.closeStopDetailDialog()
                                }
                              }}
                              disabled={screen.stopDetailPayload.item.lat == null || screen.stopDetailPayload.item.lng == null}
                              accessibilityRole="button"
                              accessibilityLabel="Open in AR"
                            >
                              <Ionicons name="cube-outline" size={16} color={themeColors.primary} />
                              <Text style={styles.stopDialogUnifiedActionBtnText} numberOfLines={2}>
                                AR
                              </Text>
                            </TouchableOpacity>
                            {screen.stopDetailPayload.hasProfile ? (
                              <TouchableOpacity
                                style={styles.stopDialogUnifiedActionBtn}
                                activeOpacity={0.88}
                                onPress={() => {
                                  screen.setProfileClientId(screen.stopDetailPayload.item.clientId)
                                  screen.closeStopDetailDialog()
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Open host profile"
                              >
                                <Ionicons name="person-circle-outline" size={16} color={themeColors.primary} />
                                <Text style={styles.stopDialogUnifiedActionBtnText} numberOfLines={2}>
                                  Profile
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.stopDialogUnifiedActionPlaceholder} pointerEvents="none" />
                            )}
                          </View>
                          </View>
                        </View>
                      </Reanimated.View>
                    </GestureDetector>
                    <View style={styles.stopDialogTinderDots} pointerEvents="none">
                      {screen.stopDetailSlides.map((_, dotIdx) => (
                        <View
                          key={`stop-dot-${dotIdx}`}
                          style={[
                            styles.stopDialogTinderDot,
                            dotIdx === screen.stopDetailIndex && styles.stopDialogTinderDotActive,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.stopDialogArrowFab,
                      styles.stopDialogArrowFabRight,
                      (screen.stopDetailIndex || 0) >= screen.stopDetailSlides.length - 1 && styles.stopDialogArrowFabDisabled,
                    ]}
                    activeOpacity={0.88}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                      screen.goToStopDetailIndex((screen.stopDetailIndex || 0) + 1)
                    }}
                    disabled={(screen.stopDetailIndex || 0) >= screen.stopDetailSlides.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel="View next itinerary stop"
                  >
                    <Ionicons name="chevron-forward" size={20} color={iconColor} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>

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
                          <PopIn delay={60} trigger={screen.planModalStep}>
                            <View style={styles.pmCinematicStepDots}>
                              <View style={[styles.pmCinematicDot, screen.planModalStep >= 1 && styles.pmCinematicDotActive]} />
                              <View style={styles.pmCinematicDotLine} />
                              <View style={[styles.pmCinematicDot, screen.planModalStep >= 2 && styles.pmCinematicDotActive]} />
                            </View>
                          </PopIn>
                          <PopIn delay={140} trigger={screen.planModalStep}>
                            <Text style={styles.pmCinematicTitle}>
                              {screen.planModalStep === 1 ? 'What excites you?' : 'What are you craving?'}
                            </Text>
                          </PopIn>
                          <PopIn delay={200} trigger={screen.planModalStep}>
                            {(!((screen.planModalStep === 1 && screen.selectedPreferences.length > 0) ||
                                (screen.planModalStep === 2 && screen.selectedFoodCategories.length > 0))) ? (
                              <Text style={styles.pmCinematicSub}>
                                {screen.planModalStep === 1
                                  ? 'Pick the vibes that match your Bahrain trip'
                                  : 'Choose your food mood for the day'}
                              </Text>
                            ) : (
                              <View style={{ height: 28, alignItems: 'center', justifyContent: 'center' }}>
                                <View style={styles.pmCinematicPickedPill}>
                                  <Ionicons name="checkmark-circle" size={13} color="#E9C877" />
                                  <Text style={styles.pmCinematicPickedText}>
                                    {screen.planModalStep === 1
                                      ? `${screen.getSelectedPreferenceLabels().length} picked`
                                      : `${screen.getSelectedFoodLabels().length} picked`}
                                  </Text>
                                </View>
                              </View>
                            )}
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
                            <View style={styles.pmChipsGrid}>
                              {(() => {
                                const items = screen.planModalStep === 1 ? PREFERENCES : FOOD_CATEGORIES
                                const isSelectedFn = (item) =>
                                  screen.planModalStep === 1
                                    ? screen.selectedPreferences.includes(item.id)
                                    : screen.selectedFoodCategories.includes(item.id)
                                const handlePressItem = (item) => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                                  return screen.planModalStep === 1 ? screen.togglePreference(item.id) : screen.toggleFoodCategory(item.id)
                                }
                                const allItems = [...items, { id: 'other', label: 'Other', icon: 'create-outline', color: themeColors.primary }]
                                return allItems.map((item, idx) => (
                                  <PopIn key={`${screen.planModalStep}-${item.id}`} delay={280 + idx * 30} trigger={screen.planModalStep}>
                                    <AnimatedOptionChip
                                      item={item}
                                      isSelected={isSelectedFn(item)}
                                      onPress={() => handlePressItem(item)}
                                    />
                                  </PopIn>
                                ))
                              })()}
                            </View>
                            {screen.planModalStep === 1 && screen.selectedPreferences.includes('other') ? (
                              <TextInput
                                style={styles.pmCinematicOtherInput}
                                value={screen.customPreferenceInput}
                                onChangeText={screen.setCustomPreferenceInput}
                                placeholder="Type your other preference"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                autoCapitalize="sentences"
                                returnKeyType="done"
                              />
                            ) : null}
                            {screen.planModalStep === 2 && screen.selectedFoodCategories.includes('other') ? (
                              <TextInput
                                style={styles.pmCinematicOtherInput}
                                value={screen.customFoodInput}
                                onChangeText={screen.setCustomFoodInput}
                                placeholder="Type your other cuisine"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                autoCapitalize="sentences"
                                returnKeyType="done"
                              />
                            ) : null}
                          </ScrollView>

                          <PopIn delay={500} trigger={screen.planModalStep}>
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
                                      const prefLabels = screen.getSelectedPreferenceLabels()
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
