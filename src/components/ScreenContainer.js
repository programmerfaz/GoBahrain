import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, Text, StyleSheet } from 'react-native';
import ProfileButton from './ProfileButton';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;

export default function ScreenContainer({ children, style, showHeader, headerTitle }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0);

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }, style]}>
      {showHeader && (
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerLeft} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle || ''}
          </Text>
          <View style={styles.headerRight}>
            <ProfileButton />
          </View>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(209,213,219,0.7)',
  },
  headerLeft: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
