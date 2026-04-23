import React from 'react'
import { View } from 'react-native'
import styles from '../AIPlanScreen.styles'
import { useAIPlanScreenOuter } from './useAIPlanScreenOuter'
import { AIPlanScreenViewMap } from './AIPlanScreenViewMap'
import { AIPlanScreenViewDialogsA } from './AIPlanScreenViewDialogsA'
import { AIPlanScreenViewDialogsB } from './AIPlanScreenViewDialogsB'

export default function AIPlanScreen() {
  const screen = useAIPlanScreenOuter()
  return (
    <View style={[styles.container, { backgroundColor: screen.colors.background }]}>
      <AIPlanScreenViewMap screen={screen} />
      <AIPlanScreenViewDialogsA screen={screen} />
      <AIPlanScreenViewDialogsB screen={screen} />
    </View>
  )
}
