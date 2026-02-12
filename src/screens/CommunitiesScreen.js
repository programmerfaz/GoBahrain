import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';

export default function CommunitiesScreen() {
  return (
    <ScreenContainer showHeader headerTitle="Community">
      <View style={styles.content}>
        <Text style={styles.text}>Communities</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
  },
});
