import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';

export default function HomeScreen() {
  return (
    <ScreenContainer>
      <View style={styles.content}>
        <Text style={styles.text}>Home</Text>
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
