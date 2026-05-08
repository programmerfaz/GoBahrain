import AsyncStorage from '@react-native-async-storage/async-storage';

async function resetOnboarding() {
  try {
    await AsyncStorage.removeItem('@gobahrain_onboarding_complete');
    console.log('✅ Onboarding reset! Restart your app to see OnboardingScreen.');
  } catch (e) {
    console.error('Error:', e);
  }
}

resetOnboarding();
