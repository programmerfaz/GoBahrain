import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
} from 'react'
import {
  View,
  Text,
  Image,
  Animated,
  StyleSheet,
  Dimensions,
  Easing,
  useWindowDimensions,
  Modal,
  Platform,
} from 'react-native'
import { useAuth } from './AuthContext'
import { useUserPreferences } from './UserPreferencesContext'

const DoorTransitionContext = createContext(null)

const FAILSAFE_MS = 14000

/** Same easing as AR / AI Plan door open */
const DOOR_EASING = Easing.bezier(0.4, 0, 0.2, 1)

/** Let native commit modal + closed door before heavy work */
const yieldTwoFrames = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })

function DoorRevealOverlay() {
  const { width, height } = useWindowDimensions()
  const ctx = useContext(DoorTransitionContext)

  useEffect(() => {
    ctx?.setLayoutWidth(width)
  }, [width, ctx])

  if (!ctx) return null

  const {
    phase,
    doorLeft,
    doorRight,
    doorIconScale,
    doorIconOpacity,
    doorFade,
    setLayoutWidth,
  } = ctx

  const visible = phase !== 'idle'
  const half = width / 2
  const TOOTH_COUNT = 5
  const toothH = height / TOOTH_COUNT
  const toothW = width * 0.12

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      hardwareAccelerated={Platform.OS === 'android'}
    >
      <View
        style={modalStyles.fill}
        pointerEvents="auto"
        onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[overlayStyles.doorOverlay, { opacity: doorFade }]} pointerEvents="box-none">
          <Animated.View style={[overlayStyles.doorHalf, overlayStyles.doorLeft, { width: half, transform: [{ translateX: doorLeft }] }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
          </Animated.View>
          <Animated.View style={[overlayStyles.doorHalf, overlayStyles.doorRight, { width: half, transform: [{ translateX: doorRight }] }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#CE1126' }]} />
          </Animated.View>
          <Animated.View style={[overlayStyles.doorZigzag, { left: half, transform: [{ translateX: doorLeft }] }]}>
            {Array.from({ length: TOOTH_COUNT }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 0,
                  height: 0,
                  borderTopWidth: toothH / 2,
                  borderBottomWidth: toothH / 2,
                  borderLeftWidth: toothW,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderLeftColor: '#FFFFFF',
                }}
              />
            ))}
          </Animated.View>
          <Animated.View
            style={[
              overlayStyles.doorIconWrap,
              { transform: [{ scale: doorIconScale }], opacity: doorIconOpacity },
            ]}
          >
            <View style={overlayStyles.doorLogoShadow}>
              <Image
                source={require('../../assets/ai-button-logo.png')}
                style={overlayStyles.doorLogoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={overlayStyles.doorFlagLabel}>GoBahrain</Text>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const modalStyles = StyleSheet.create({
  fill: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
})

const overlayStyles = StyleSheet.create({
  doorOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  doorHalf: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  doorLeft: {
    left: 0,
  },
  doorRight: {
    right: 0,
  },
  doorZigzag: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 2,
  },
  doorIconWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  doorLogoShadow: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 14,
  },
  doorLogoImage: {
    width: 116,
    height: 116,
    borderRadius: 58,
  },
  doorFlagLabel: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
})

export function DoorTransitionProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const { isOnboardingComplete } = useUserPreferences()

  const [phase, setPhase] = useState('idle')
  const doorLeft = useRef(new Animated.Value(0)).current
  const doorRight = useRef(new Animated.Value(0)).current
  const doorIconScale = useRef(new Animated.Value(1)).current
  const doorIconOpacity = useRef(new Animated.Value(1)).current
  const doorFade = useRef(new Animated.Value(1)).current
  const layoutWidthRef = useRef(Dimensions.get('window').width)
  const openingRef = useRef(false)
  const phaseRef = useRef('idle')
  const failSafeRef = useRef(null)
  const armDoorAfterNextAuthSuccessRef = useRef(false)
  const prevAuthenticatedRef = useRef(isAuthenticated)

  const clearFailSafe = useCallback(() => {
    if (failSafeRef.current) {
      clearTimeout(failSafeRef.current)
      failSafeRef.current = null
    }
  }, [])

  const setLayoutWidth = useCallback((w) => {
    if (typeof w === 'number' && w > 0) {
      layoutWidthRef.current = w
    }
  }, [])

  const resetDoorValuesClosed = useCallback(() => {
    doorLeft.setValue(0)
    doorRight.setValue(0)
    doorIconScale.setValue(1)
    doorIconOpacity.setValue(1)
    doorFade.setValue(1)
  }, [doorLeft, doorRight, doorIconScale, doorIconOpacity, doorFade])

  const cancelDoorTransition = useCallback(() => {
    clearFailSafe()
    openingRef.current = false
    resetDoorValuesClosed()
    phaseRef.current = 'idle'
    setPhase('idle')
  }, [clearFailSafe, resetDoorValuesClosed])

  const armDoorForNextAuthSuccess = useCallback(() => {
    armDoorAfterNextAuthSuccessRef.current = true
  }, [])

  const disarmDoorForNextAuthSuccess = useCallback(() => {
    armDoorAfterNextAuthSuccessRef.current = false
  }, [])

  const openDoorsInternal = useCallback(() => {
    if (openingRef.current) return
    openingRef.current = true
    phaseRef.current = 'opening'
    setPhase('opening')
    clearFailSafe()

    const doorW = layoutWidthRef.current
    const half = doorW / 2

    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(doorIconOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(doorIconScale, {
          toValue: 0.5,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(doorLeft, {
          toValue: -half,
          duration: 480,
          easing: DOOR_EASING,
          useNativeDriver: true,
        }),
        Animated.timing(doorRight, {
          toValue: half,
          duration: 480,
          easing: DOOR_EASING,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(doorFade, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      resetDoorValuesClosed()
      phaseRef.current = 'idle'
      openingRef.current = false
      setPhase('idle')
    })
  }, [doorLeft, doorRight, doorIconScale, doorIconOpacity, doorFade, clearFailSafe, resetDoorValuesClosed])

  const scheduleFailSafe = useCallback(() => {
    clearFailSafe()
    failSafeRef.current = setTimeout(() => {
      if (phaseRef.current === 'blocking') {
        openDoorsInternal()
      }
    }, FAILSAFE_MS)
  }, [clearFailSafe, openDoorsInternal])

  const startDoorToHome = useCallback(() => {
    if (phaseRef.current === 'opening' || openingRef.current) {
      return
    }
    if (phaseRef.current === 'blocking') {
      scheduleFailSafe()
      return
    }
    clearFailSafe()
    openingRef.current = false
    resetDoorValuesClosed()
    phaseRef.current = 'blocking'
    setPhase('blocking')
    scheduleFailSafe()
  }, [clearFailSafe, resetDoorValuesClosed, scheduleFailSafe])

  useLayoutEffect(() => {
    if (!isAuthenticated) {
      armDoorAfterNextAuthSuccessRef.current = false
      prevAuthenticatedRef.current = false
      return
    }

    const prev = prevAuthenticatedRef.current
    prevAuthenticatedRef.current = isAuthenticated

    const becameAuthenticated = !prev && isAuthenticated
    if (
      becameAuthenticated &&
      armDoorAfterNextAuthSuccessRef.current &&
      isOnboardingComplete
    ) {
      armDoorAfterNextAuthSuccessRef.current = false
      startDoorToHome()
    }
  }, [isAuthenticated, isOnboardingComplete, startDoorToHome])

  const notifyHomeReady = useCallback(() => {
    if (phaseRef.current !== 'blocking') return
    openDoorsInternal()
  }, [openDoorsInternal])

  useEffect(() => () => clearFailSafe(), [clearFailSafe])

  const value = useMemo(
    () => ({
      startDoorToHome,
      notifyHomeReady,
      cancelDoorTransition,
      armDoorForNextAuthSuccess,
      disarmDoorForNextAuthSuccess,
      isAwaitingHomeOpen: phase === 'blocking',
      phase,
      doorLeft,
      doorRight,
      doorIconScale,
      doorIconOpacity,
      doorFade,
      setLayoutWidth,
    }),
    [
      startDoorToHome,
      notifyHomeReady,
      cancelDoorTransition,
      armDoorForNextAuthSuccess,
      disarmDoorForNextAuthSuccess,
      phase,
      doorLeft,
      doorRight,
      doorIconScale,
      doorIconOpacity,
      doorFade,
      setLayoutWidth,
    ]
  )

  return (
    <DoorTransitionContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <DoorRevealOverlay />
      </View>
    </DoorTransitionContext.Provider>
  )
}

export function useDoorTransition() {
  const ctx = useContext(DoorTransitionContext)
  if (!ctx) {
    throw new Error('useDoorTransition must be used within DoorTransitionProvider')
  }
  return ctx
}

export { yieldTwoFrames }
