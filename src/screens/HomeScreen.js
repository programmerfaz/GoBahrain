import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import BottomNavBar from '../components/BottomNavBar';

export default function HomeScreen({ navigation, route }) {
  return (
    <ScreenContainer>
      <View style={styles.content}>
        <Text style={styles.text}>Home</Text>
      </View>
      <BottomNavBar navigation={navigation} activeRouteName={route.name} />
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
