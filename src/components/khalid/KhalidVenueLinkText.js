import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Text, StyleSheet, Easing, Animated } from 'react-native'
import { FONT_POPPINS_REGULAR, FONT_POPPINS_SEMIBOLD } from '../../constants/brandFont'
import {
  buildTextSegmentsWithVenueLinks,
  sliceSegmentsToVisibleLength,
} from '../../utils/khalidVenueLinks'

const TYPEWRITER_MS_PER_CHAR = 28
const TYPEWRITER_MIN_MS = 500
const TYPEWRITER_MAX_MS = 3800

function TypingCaretBlink({ color }) {
  const op = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.15, duration: 420, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [op])
  return (
    <Animated.Text style={{ color, fontWeight: '700', opacity: op }}>|</Animated.Text>
  )
}

export function KhalidVenueLinkText({
  text,
  style,
  mentionStyle,
  venueLinks = [],
  skipTypewriter = false,
  messageId,
  onTypewriterComplete,
  onRevealProgress,
  onVenuePress,
}) {
  const fullText = String(text ?? '')
  const segments = useMemo(
    () => buildTextSegmentsWithVenueLinks(fullText, venueLinks),
    [fullText, venueLinks],
  )
  const fullLen = fullText.length
  const revealAll = skipTypewriter
  const [visibleLen, setVisibleLen] = useState(() => (revealAll ? fullLen : 0))
  const progressRef = useRef(new Animated.Value(revealAll ? 1 : 0)).current
  const animRef = useRef(null)
  const listenerRef = useRef(null)
  const onCompleteRef = useRef(onTypewriterComplete)
  const onRevealProgressRef = useRef(onRevealProgress)

  useEffect(() => {
    onCompleteRef.current = onTypewriterComplete
  }, [onTypewriterComplete])

  useEffect(() => {
    onRevealProgressRef.current = onRevealProgress
  }, [onRevealProgress])

  useEffect(() => {
    if (revealAll) {
      setVisibleLen(fullLen)
      progressRef.setValue(1)
      return undefined
    }

    const stopAnim = () => {
      if (listenerRef.current != null) {
        progressRef.removeListener(listenerRef.current)
        listenerRef.current = null
      }
      if (animRef.current) {
        animRef.current.stop()
        animRef.current = null
      }
    }

    stopAnim()
    progressRef.setValue(0)
    setVisibleLen(0)

    if (fullLen === 0) return undefined

    const duration = Math.min(TYPEWRITER_MAX_MS, Math.max(TYPEWRITER_MIN_MS, fullLen * TYPEWRITER_MS_PER_CHAR))
    listenerRef.current = progressRef.addListener(({ value }) => {
      const nextLen = Math.min(fullLen, Math.floor(value * (fullLen + 1)))
      setVisibleLen(nextLen)
      onRevealProgressRef.current?.(nextLen, fullLen)
    })

    const anim = Animated.timing(progressRef, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    })
    animRef.current = anim
    anim.start(({ finished }) => {
      stopAnim()
      if (!finished) return
      setVisibleLen(fullLen)
      if (messageId) onCompleteRef.current?.(messageId)
    })

    return () => {
      stopAnim()
    }
  }, [fullText, fullLen, messageId, progressRef, revealAll])

  const visibleSegments = useMemo(
    () => sliceSegmentsToVisibleLength(segments, visibleLen),
    [segments, visibleLen],
  )
  const showCaret = !revealAll && visibleLen < fullLen
  const linkStyle = mentionStyle || styles.mention

  return (
    <Text style={style}>
      {visibleSegments.map((seg, index) => {
        if (seg.type === 'link' || seg.type === 'highlight') {
          if (seg.type === 'link' && seg.clientId && onVenuePress) {
            return (
              <Text
                key={`link-${index}-${seg.clientId}`}
                onPress={() => onVenuePress({ clientId: seg.clientId, name: seg.name })}
                suppressHighlighting
                style={linkStyle}
                accessibilityRole="link"
                accessibilityLabel={`Open profile for ${seg.name}`}
              >
                {seg.value}
              </Text>
            )
          }
          return (
            <Text
              key={`hl-${index}-${seg.name}`}
              suppressHighlighting
              style={linkStyle}
            >
              {seg.value}
            </Text>
          )
        }
        return (
          <Text key={`t-${index}`} suppressHighlighting>
            {seg.value}
          </Text>
        )
      })}
      {showCaret ? <TypingCaretBlink color="rgba(233,200,119,0.95)" /> : null}
    </Text>
  )
}

const styles = StyleSheet.create({
  mention: {
    fontFamily: FONT_POPPINS_SEMIBOLD,
    color: '#E9C877',
    textDecorationLine: 'underline',
  },
  body: {
    fontFamily: FONT_POPPINS_REGULAR,
  },
})
