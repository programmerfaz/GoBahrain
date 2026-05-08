import React, { forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'

/**
 * Web stub for `react-native-maps` — the real package uses native codegen and does not bundle for web.
 * Native iOS/Android still resolve to `node_modules/react-native-maps`.
 */
const MapView = forwardRef((props, ref) => {
  const {
    style,
    children,
    onPress,
    onRegionChange,
    onRegionChangeComplete,
    initialRegion,
  } = props

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion() {},
      animateCamera() {},
      fitToCoordinates() {},
    }),
    [],
  )

  const handleMapPress = useCallback(() => {
    if (typeof onPress !== 'function') return
    onPress({ nativeEvent: { coordinate: null, position: null } })
  }, [onPress])

  useEffect(() => {
    if (!initialRegion) return
    if (typeof onRegionChange === 'function') {
      onRegionChange(initialRegion)
    }
    if (typeof onRegionChangeComplete === 'function') {
      onRegionChangeComplete(initialRegion)
    }
  }, [initialRegion, onRegionChange, onRegionChangeComplete])

  return (
    <View style={[{ flex: 1, backgroundColor: '#dfe6ec' }, style]}>
      <Pressable
        accessibilityLabel="Map area (preview on web)"
        style={StyleSheet.absoluteFill}
        onPress={handleMapPress}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {children}
      </View>
    </View>
  )
})

MapView.displayName = 'MapView'

const Marker = forwardRef((props, ref) => {
  const { children, style } = props
  return (
    <View ref={ref} style={style} pointerEvents="box-none">
      {children}
    </View>
  )
})

Marker.displayName = 'Marker'

const Circle = forwardRef((props, ref) => (
  <View ref={ref} style={{ width: 0, height: 0, opacity: 0 }} pointerEvents="none" />
))

Circle.displayName = 'Circle'

export { Marker, Circle }
export default MapView
