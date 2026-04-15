import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Platform, View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'
import { luxurySoftShadow } from '../theme/luxuryPremium'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60

export default function ScreenContainer({ children, style, showHeader, headerTitle }) {
  const insets = useSafeAreaInsets()
  const { colors, isDark } = useTheme()
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0)

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding, backgroundColor: colors.background }, style]}>
      {showHeader && (
        <View style={[styles.headerOuter, { paddingTop: insets.top }]}>
          <LinearGradient
            colors={isDark
              ? [colors.surface, colors.background]
              : [colors.surface, colors.background]
            }
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.headerInner}>
            <View style={styles.headerLeft} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {headerTitle || ''}
            </Text>
            <View style={styles.headerRight} />
          </View>
          <View style={[styles.headerBorder, { backgroundColor: colors.border }]} />
        </View>
      )}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerOuter: {
    position: 'relative',
    overflow: 'hidden',
    ...luxurySoftShadow,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerLeft: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerBorder: {
    height: 0.5,
    opacity: 0.5,
  },
})
