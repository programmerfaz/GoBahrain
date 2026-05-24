import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  Platform,
  Keyboard,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import {
  FONT_POPPINS_BOLD,
  FONT_POPPINS_MEDIUM,
  FONT_POPPINS_REGULAR,
} from '../../constants/brandFont'

const KHALID_AVATAR = require('../../../assets/khalid.png')
const GUIDE_GOLD = '#E9C877'
const C = { success: '#10B981', accent: '#E63950' }

const SPRING = { damping: 22, stiffness: 220 }
const DISMISS_DRAG_Y = 56
const DISMISS_DRAG_X = 72
const PEEK_TAB_W = 46
const MESSAGE_SCROLL_MAX = 160
const KEYBOARD_GAP = 12

export const KHALID_PEEK_TAB_HEIGHT = 48

function ChatTypewriter({ text, loading, loadingLabel = 'Khalid is thinking…' }) {
  const [shown, setShown] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef(null)
  const genRef = useRef(0)

  useEffect(() => {
    if (loading) {
      setShown('')
      setIsTyping(false)
      return undefined
    }

    const full = String(text || '').trim()
    if (!full) {
      setShown('')
      setIsTyping(false)
      return undefined
    }

    const gen = genRef.current + 1
    genRef.current = gen
    setShown('')
    setIsTyping(true)

    let index = 0
    let timeoutId = null

    const stride = full.length > 140 ? 4 : full.length > 70 ? 2 : 1

    const tick = () => {
      if (genRef.current !== gen) return
      index = Math.min(full.length, index + stride)
      setShown(full.slice(0, index))
      if (index >= full.length) {
        setIsTyping(false)
        return
      }
      const ch = full[index - 1]
      const delay =
        ch === '.' || ch === '!' || ch === '?' ? 42 : ch === ',' || ch === ';' ? 28 : stride > 1 ? 22 : 17
      timeoutId = setTimeout(tick, delay)
    }

    timeoutId = setTimeout(tick, 28)

    return () => {
      genRef.current += 1
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [text, loading])

  useEffect(() => {
    if (!shown) return
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd?.({ animated: false })
    })
  }, [shown])

  if (loading) {
    return (
      <View style={s.loadingRow}>
        <Ionicons name="sparkles" size={11} color={GUIDE_GOLD} />
        <Text style={s.msgText}>{loadingLabel}</Text>
      </View>
    )
  }

  const display = shown || ' '

  return (
    <ScrollView
      ref={scrollRef}
      style={s.msgScroll}
      contentContainerStyle={s.msgScrollInner}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.msgText} selectable>
        {display}
        {isTyping ? <Text style={s.cursor}>|</Text> : null}
      </Text>
    </ScrollView>
  )
}

export default function ARKhalidGuidePanel({
  bottomOffset = 100,
  guideLine = '',
  narrationLoading = false,
  isSpeaking = false,
  isLockedMode = false,
  lockedPlaceName = '',
  lockedMeta = '',
  latestAnswer = '',
  chatLoading = false,
  chatError = null,
  onSendMessage,
  onOpenDirections,
  onUnlock,
  onHiddenChange,
  onHeightChange,
  hidden: hiddenProp,
}) {
  const { width: screenW } = useWindowDimensions()
  const dismissX = screenW - PEEK_TAB_W + 8
  const [chatInput, setChatInput] = useState('')
  const [keyboardInset, setKeyboardInset] = useState(0)

  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const hidden = useSharedValue(hiddenProp ? 1 : 0)

  useEffect(() => {
    if (hiddenProp) {
      hidden.value = 1
      translateX.value = dismissX
      translateY.value = 0
    } else {
      hidden.value = 0
      translateX.value = withSpring(0, SPRING)
      translateY.value = withSpring(0, SPRING)
    }
  }, [hiddenProp, dismissX, hidden, translateX, translateY])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const onShow = (e) => {
      const h = e?.endCoordinates?.height ?? 0
      setKeyboardInset(h)
    }
    const onHide = () => setKeyboardInset(0)

    const showSub = Keyboard.addListener(showEvent, onShow)
    const hideSub = Keyboard.addListener(hideEvent, onHide)
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const panelBottom =
    keyboardInset > 0
      ? Math.max(bottomOffset, keyboardInset + KEYBOARD_GAP)
      : bottomOffset

  const setHidden = useCallback(
    (v) => {
      onHiddenChange?.(v)
    },
    [onHiddenChange],
  )

  const snapVisible = useCallback(() => {
    hidden.value = 0
    translateX.value = withSpring(0, SPRING)
    translateY.value = withSpring(0, SPRING)
    setHidden(false)
  }, [hidden, translateX, translateY, setHidden])

  const snapDismissed = useCallback(() => {
    hidden.value = 1
    translateX.value = withSpring(dismissX, SPRING)
    translateY.value = withSpring(0, SPRING)
    setHidden(true)
    Keyboard.dismiss()
  }, [hidden, translateX, translateY, dismissX, setHidden])

  const pan = Gesture.Pan()
    .activeOffsetX(14)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      if (hidden.value === 1) return
      translateX.value = Math.max(0, e.translationX)
      translateY.value = Math.max(0, e.translationY) * 0.35
    })
    .onEnd((e) => {
      if (hidden.value === 1) return
      const dx = Math.max(0, e.translationX)
      const dy = Math.max(0, e.translationY)
      if (dx > DISMISS_DRAG_X || dy > DISMISS_DRAG_Y) {
        runOnJS(snapDismissed)()
      } else {
        translateX.value = withSpring(0, SPRING)
        translateY.value = withSpring(0, SPRING)
      }
    })

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: hidden.value === 1 && translateX.value > screenW * 0.35 ? 0 : 1,
  }))

  const peekStyle = useAnimatedStyle(() => ({
    opacity: hidden.value === 1 ? 1 : 0,
    transform: [{ translateX: hidden.value === 1 ? 0 : PEEK_TAB_W }],
  }))

  const subtitle = isLockedMode && lockedPlaceName
    ? `→ ${lockedPlaceName}`
    : 'Local guide · AR'

  const hasChatReply = Boolean(String(latestAnswer || '').trim())
  const showLatestAnswer = hasChatReply || chatLoading

  const bodyText = showLatestAnswer
    ? latestAnswer
    : guideLine

  const bodyLoading = showLatestAnswer ? chatLoading : narrationLoading

  const handleInputFocus = useCallback(() => {
    if (hiddenProp) snapVisible()
  }, [hiddenProp, snapVisible])

  const handleSend = () => {
    const trimmed = chatInput.trim()
    if (!trimmed || chatLoading || !onSendMessage) return
    setChatInput('')
    Keyboard.dismiss()
    onSendMessage(trimmed)
  }

  const handleLayout = (e) => {
    const h = Math.ceil(e.nativeEvent.layout.height)
    if (h > 0) onHeightChange?.(h)
  }

  const handleDismissKeyboard = useCallback(() => {
    Keyboard.dismiss()
  }, [])

  return (
    <>
      {keyboardInset > 0 ? (
        <Pressable
          style={s.keyboardBackdrop}
          onPress={handleDismissKeyboard}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
        />
      ) : null}

      <Animated.View
        pointerEvents={hiddenProp ? 'auto' : 'none'}
        style={[s.peekTab, { bottom: panelBottom }, peekStyle]}
      >
        <Pressable
          style={s.peekPress}
          onPress={snapVisible}
          accessibilityRole="button"
          accessibilityLabel="Show Khalid guide"
        >
          <Image source={KHALID_AVATAR} style={s.peekAvatar} />
          <Ionicons name="chevron-back" size={14} color={GUIDE_GOLD} />
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[s.floatingWrap, { bottom: panelBottom, zIndex: keyboardInset > 0 ? 40 : 26 }, cardStyle]}
          onLayout={handleLayout}
          pointerEvents={hiddenProp ? 'none' : 'auto'}
        >
          <View style={s.card}>
            <View style={s.dragHandleRow}>
              <View style={s.dragHandle} />
              <Text style={s.dragHint}>Drag right to hide</Text>
              <Pressable
                onPress={snapDismissed}
                hitSlop={10}
                style={s.dismissBtn}
                accessibilityRole="button"
                accessibilityLabel="Hide Khalid guide"
              >
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>

            <View style={s.row}>
              <View style={s.avatarWrap}>
                <Image source={KHALID_AVATAR} style={s.avatar} accessibilityLabel="Khalid" />
                {isSpeaking || narrationLoading || chatLoading ? <View style={s.liveDot} /> : null}
              </View>

              <View style={s.textCol}>
                <View style={s.titleRow}>
                  <Text style={s.name}>Khalid</Text>
                  <Text style={s.subtitle} numberOfLines={2}>
                    {subtitle}
                  </Text>
                </View>
                {lockedMeta ? (
                  <Text style={s.metaText}>{lockedMeta}</Text>
                ) : null}
                <ChatTypewriter
                  text={bodyText}
                  loading={bodyLoading}
                  loadingLabel={chatLoading ? 'Khalid is replying…' : 'Khalid is thinking…'}
                />
                {chatError ? (
                  <Text style={s.errorText} numberOfLines={2}>{chatError}</Text>
                ) : null}
              </View>
            </View>

            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder={
                  isLockedMode && lockedPlaceName
                    ? `Ask about ${lockedPlaceName}…`
                    : 'Ask Khalid anything…'
                }
                placeholderTextColor="rgba(255,255,255,0.38)"
                returnKeyType="send"
                blurOnSubmit
                submitBehavior="submit"
                onSubmitEditing={handleSend}
                onFocus={handleInputFocus}
                editable={!chatLoading}
                maxLength={280}
                accessibilityLabel="Message to Khalid"
              />
              <Pressable
                style={({ pressed }) => [
                  s.sendBtn,
                  (!chatInput.trim() || chatLoading) && s.sendBtnDisabled,
                  pressed && chatInput.trim() && !chatLoading && s.pressed,
                ]}
                onPress={handleSend}
                disabled={!chatInput.trim() || chatLoading}
                accessibilityRole="button"
                accessibilityLabel="Send message to Khalid"
              >
                <Ionicons name="arrow-up" size={18} color="#FFF" />
              </Pressable>
            </View>

            {isLockedMode ? (
              <View style={s.actionRow}>
                {onOpenDirections ? (
                  <Pressable
                    style={({ pressed }) => [s.actionBtn, pressed && s.pressed]}
                    onPress={onOpenDirections}
                    accessibilityRole="button"
                    accessibilityLabel="Open directions"
                  >
                    <Ionicons name="map" size={15} color="#FFF" />
                    <Text style={s.actionLabel}>Maps</Text>
                  </Pressable>
                ) : null}
                {onUnlock ? (
                  <Pressable
                    style={({ pressed }) => [s.actionBtn, s.actionBtnUnlock, pressed && s.pressed]}
                    onPress={onUnlock}
                    accessibilityRole="button"
                    accessibilityLabel="Unlock destination"
                  >
                    <Ionicons name="lock-open-outline" size={15} color={C.success} />
                    <Text style={[s.actionLabel, { color: C.success }]}>Unlock</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </>
  )
}

export const estimateKhalidStripHeight = ({ isLocked = false, hidden = false } = {}) => {
  if (hidden) return KHALID_PEEK_TAB_HEIGHT
  return isLocked ? 168 : 152
}

const s = StyleSheet.create({
  keyboardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 32,
  },
  floatingWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 26,
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: 'rgba(10,12,20,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(233,200,119,0.28)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  dragHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    gap: 8,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dragHint: {
    flex: 1,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontFamily: FONT_POPPINS_MEDIUM,
    textAlign: 'center',
  },
  dismissBtn: { padding: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(233,200,119,0.55)',
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  liveDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34D399',
    borderWidth: 1.5,
    borderColor: 'rgba(10,12,20,0.9)',
  },
  textCol: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  name: {
    color: GUIDE_GOLD,
    fontSize: 13,
    fontFamily: FONT_POPPINS_BOLD,
  },
  subtitle: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: FONT_POPPINS_MEDIUM,
    minWidth: 80,
  },
  metaText: {
    color: 'rgba(16,185,129,0.95)',
    fontSize: 10,
    fontFamily: FONT_POPPINS_MEDIUM,
    marginBottom: 4,
  },
  msgScroll: { maxHeight: MESSAGE_SCROLL_MAX },
  msgScrollInner: { paddingRight: 4 },
  msgText: {
    color: 'rgba(255,255,255,0.94)',
    fontSize: 12,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 17,
  },
  cursor: {
    color: GUIDE_GOLD,
    fontSize: 12,
    fontFamily: FONT_POPPINS_REGULAR,
    opacity: 0.85,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: {
    color: 'rgba(248,113,113,0.95)',
    fontSize: 10,
    fontFamily: FONT_POPPINS_MEDIUM,
    marginTop: 6,
    lineHeight: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    height: 38,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFF',
    fontSize: 12,
    fontFamily: FONT_POPPINS_REGULAR,
    lineHeight: 16,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  sendBtnDisabled: { opacity: 0.4 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnUnlock: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.28)',
  },
  actionLabel: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: FONT_POPPINS_BOLD,
  },
  pressed: { opacity: 0.88 },
  peekTab: { position: 'absolute', right: 0, zIndex: 25 },
  peekPress: {
    width: PEEK_TAB_W,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    backgroundColor: 'rgba(10,12,20,0.92)',
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: 'rgba(233,200,119,0.35)',
    alignItems: 'center',
    gap: 4,
  },
  peekAvatar: { width: 28, height: 28, borderRadius: 14 },
})
