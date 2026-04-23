import React, { useEffect } from 'react'
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
              <Text style={styles.buildModeLuxuryEyebrow}>SIYAHABH PLAN STUDIO</Text>
            </Reanimated.View>
            <Reanimated.View entering={ZoomInEasyDown.duration(340)} style={styles.buildModeStandaloneWrap}>
                <Text style={styles.buildModeStandaloneTitle}>Build your day</Text>
                <Text style={styles.buildModeStandaloneHint}>Choose how you want to build your Bahrain day.</Text>
                <View style={styles.buildModeStandaloneButtonRow}>
                  <Reanimated.View entering={FadeInDown.delay(40).duration(360)} style={styles.buildModeStandaloneOptionSlot}>
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
                  <Reanimated.View entering={FadeInDown.delay(110).duration(360)} style={styles.buildModeStandaloneOptionSlot}>
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
                </View>
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

      {/* Clients search modal — all clients by Restaurants, Places, Events */}
      <Modal
        visible={screen.showSearchModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (screen.addingPlanStop) return
          screen.setShowSearchModal(false)
        }}
      >
        <View style={[styles.searchModalRoot, { paddingTop: screen.insets.top + 4 }]}>
          {screen.searchModalLoading ? (
            <View style={styles.searchModalLoading}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={styles.searchModalLoadingText}>Loading clients…</Text>
            </View>
          ) : (
            <>
              <View style={styles.searchModalHeadingWrap}>
                <Text style={styles.searchModalHeading}>
                  {screen.addToPlanMode ? 'Add to your day' : 'Browse clients'}
                </Text>
                {screen.addToPlanMode ? (
                  <Text style={styles.searchModalSubheading}>
                    {screen.customPlanDraftActive && (!screen.dayPlan || screen.dayPlan.length === 0)
                      ? 'Choose your first stop to start your custom plan. After that you can keep adding from here or the map.'
                      : 'Tap a restaurant, place, or event — it is added to the end of your list. Long-press a card to reorder anytime.'}
                  </Text>
                ) : null}
              </View>
              <View style={styles.searchModalHeaderRow}>
                <View style={styles.searchModalSearchWrap}>
                  <Ionicons name="search" size={20} color={themeColors.primary} style={styles.searchModalSearchIcon} />
                  <TextInput
                    style={styles.searchModalSearchInput}
                    placeholder="Search restaurants, places, events…"
                    placeholderTextColor={placeholderColor}
                    value={screen.searchModalQuery}
                    onChangeText={screen.setSearchModalQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {screen.searchModalQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => screen.setSearchModalQuery('')}
                      style={styles.searchModalSearchClear}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={placeholderColor} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.searchModalCloseBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (screen.addingPlanStop) return
                    screen.setShowSearchModal(false)
                  }}
                  accessibilityState={{ disabled: screen.addingPlanStop }}
                >
                  <Ionicons name="close" size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.searchModalScroll}
                contentContainerStyle={styles.searchModalContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {['restaurants', 'places', 'events'].map((key) => {
                  const sectionLabel = key === 'restaurants' ? 'Restaurants' : key === 'places' ? 'Places' : 'Events';
                  const rawItems = screen.searchModalClients[key] || [];
                  const q = (screen.searchModalQuery || '').trim().toLowerCase();
                  const items = q
                    ? rawItems.filter(
                        (c) =>
                          (c.name || c.business_name || '').toLowerCase().includes(q) ||
                          (c.business_name_ar || '').toLowerCase().includes(q)
                      )
                    : rawItems;
                const accent = key === 'restaurants' ? screen.colors.dining : key === 'events' ? screen.colors.event : screen.colors.textSecondary;
                if (q && items.length === 0) return null;
                return (
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
                    </View>
                    {items.length === 0 ? (
                      <Text style={styles.searchModalEmpty}>
                        {q ? `No ${sectionLabel.toLowerCase()} match "${screen.searchModalQuery.trim()}"` : `No ${sectionLabel.toLowerCase()} yet`}
                      </Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.searchModalHorizontalContent}
                      >
                        {items.map((client) => {
                          const imageUrl = resolvePublicImageUrl(client.client_image);
                          return (
                            <TouchableOpacity
                              key={client.client_a_uuid || client.clientId}
                              style={styles.searchModalClientCard}
                              activeOpacity={0.7}
                              disabled={screen.addingPlanStop}
                              onPress={() => {
                                if (screen.addToPlanMode) {
                                  screen.handleAddClientToPlan(client)
                                  return
                                }
                                screen.setShowSearchModal(false);
                                screen.setProfileClientId(client.client_a_uuid || client.clientId);
                              }}
                            >
                              <View style={[styles.searchModalClientCircle, { borderColor: accent }]}>
                                {imageUrl ? (
                                  <CachedImage source={{ uri: imageUrl }} style={styles.searchModalClientImage} recyclingKey={imageUrl} resizeMode="cover" />
                                ) : (
                                  <Ionicons
                                    name={key === 'restaurants' ? 'restaurant' : key === 'events' ? 'calendar' : 'location'}
                                    size={32}
                                    color={accent}
                                  />
                                )}
                              </View>
                              <Text style={styles.searchModalClientName} numberOfLines={2}>
                                {client.name || client.business_name || 'Spot'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
              </ScrollView>
            </>
          )}
          {screen.addingPlanStop && !screen.searchModalLoading ? (
            <View style={styles.searchModalAddingOverlay} pointerEvents="box-none">
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={styles.searchModalAddingOverlayText}>Adding to your plan…</Text>
            </View>
          ) : null}
        </View>
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
          <View style={styles.sharePlanModalCard} pointerEvents="box-none">
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
            <View style={styles.sharePlanModalPermRow}>
              <TouchableOpacity
                style={[
                  styles.sharePlanModalPermChip,
                  screen.sharePermissionDraft === 'view' && styles.sharePlanModalPermChipActive,
                ]}
                onPress={() => screen.setSharePermissionDraft('view')}
                accessibilityRole="button"
                accessibilityLabel="View only"
              >
                <Text style={styles.sharePlanModalPermChipText}>View only</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sharePlanModalPermChip,
                  screen.sharePermissionDraft === 'edit' && styles.sharePlanModalPermChipActive,
                ]}
                onPress={() => screen.setSharePermissionDraft('edit')}
                accessibilityRole="button"
                accessibilityLabel="Can edit"
              >
                <Text style={styles.sharePlanModalPermChipText}>Can edit</Text>
              </TouchableOpacity>
            </View>
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
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>Turn off sharing</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => screen.setShowSharePlanModal(false)}
              style={{ marginTop: 16, alignItems: 'center' }}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: tertiaryTextColor }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={screen.showEditSavedPlanTitleModal}
        transparent
        animationType="fade"
        onRequestClose={screen.handleCloseEditSavedPlanTitleModal}
      >
        <View style={styles.sharePlanModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={screen.handleCloseEditSavedPlanTitleModal}
            accessibilityLabel="Dismiss rename dialog"
            accessibilityRole="button"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ zIndex: 2, maxWidth: 400, width: '100%', alignSelf: 'center' }}
          >
            <View style={styles.sharePlanModalCard} pointerEvents="box-none">
              <Text style={styles.sharePlanModalTitle}>Plan name</Text>
              <Text style={styles.sharePlanModalSub}>Choose a short name so you can find this plan later.</Text>
              <TextInput
                style={styles.editSavedPlanTitleModalInput}
                value={screen.editSavedPlanTitleDraft}
                onChangeText={screen.setEditSavedPlanTitleDraft}
                placeholder="My plan"
                placeholderTextColor={placeholderColor}
                maxLength={120}
                editable={!screen.editSavedPlanTitleBusy}
                autoFocus
                accessibilityLabel="Plan title"
                returnKeyType="done"
                onSubmitEditing={screen.handleSubmitEditSavedPlanTitle}
              />
              <View style={styles.sharePlanModalActions}>
                <TouchableOpacity
                  style={[styles.sharePlanModalBtn, styles.sharePlanModalBtnSecondary]}
                  onPress={screen.handleCloseEditSavedPlanTitleModal}
                  disabled={screen.editSavedPlanTitleBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text style={[styles.sharePlanModalBtnText, styles.sharePlanModalBtnTextDark]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sharePlanModalBtn}
                  onPress={screen.handleSubmitEditSavedPlanTitle}
                  disabled={screen.editSavedPlanTitleBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Save plan name"
                >
                  <Text style={styles.sharePlanModalBtnText}>{screen.editSavedPlanTitleBusy ? '…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ClientProfileModal
        visible={!!screen.profileClientId}
        clientId={screen.profileClientId}
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
