import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;

export default function ScreenContainer({ children, style, showHeader, headerTitle }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0);

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding, backgroundColor: colors.background }, style]}>
      {showHeader && (
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {headerTitle || ''}
          </Text>
          <View style={styles.headerRight} />
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
