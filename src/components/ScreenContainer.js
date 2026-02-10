import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { View, StyleSheet } from 'react-native';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;

export default function ScreenContainer({ children, style }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0);

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
