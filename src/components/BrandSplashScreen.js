import React, { useCallback, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { useTheme } from '../context/ThemeContext'
import { BRAND_WORDMARK_FONT } from '../constants/brandFont'

export default function BrandSplashScreen({ onComplete }) {
  const { colors, isDark } = useTheme()
  const [hasVideoError, setHasVideoError] = useState(false)
  const didCompleteRef = useRef(false)

  const completeSplash = useCallback(() => {
    if (didCompleteRef.current) return
    didCompleteRef.current = true
    onComplete?.()
  }, [onComplete])

  return (
    <View style={styles.wrap} accessibilityLabel="SiyahaBH loading">
      {!hasVideoError && (
        <Video
          source={require('../../assets/animate_this_so_that_i_can_u.mp4')}
          style={styles.video}
          shouldPlay
          isLooping={false}
          isMuted
          rate={1.35}
          shouldCorrectPitch
          resizeMode={ResizeMode.CONTAIN}
          onPlaybackStatusUpdate={(status) => {
            if (!status?.isLoaded) return
            if (status.didJustFinish) completeSplash()
          }}
          onError={() => {
            setHasVideoError(true)
            completeSplash()
          }}
        />
      )}

      {hasVideoError && (
        <View style={[styles.fallback, { backgroundColor: isDark ? '#000000' : '#0F172A' }]}>
          <Text style={[styles.wordmark, { color: colors.primary }]}>SiyahaBH</Text>
          <Text style={styles.tagline}>Discover Bahrain</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  wordmark: {
    fontFamily: BRAND_WORDMARK_FONT,
    fontSize: 40,
    fontWeight: '400',
    letterSpacing: 1,
    textAlign: 'center',
  },
  tagline: {
    color: 'rgba(226,232,240,0.78)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
})
