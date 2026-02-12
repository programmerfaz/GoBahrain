import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';

export default function ProfileScreen() {
  return (
    <ScreenContainer showHeader headerTitle="Profile">
      <View style={styles.content}>
        <Text style={styles.text}>Profile page</Text>
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
