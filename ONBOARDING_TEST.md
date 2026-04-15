# How to View the OnboardingScreen

The OnboardingScreen automatically appears after you sign up or sign in for the first time, before you've completed the onboarding process.

## Quick Methods to Test:

### Method 1: Sign Up as a New User
1. Open your app
2. If you're logged in, log out from the Profile screen
3. Click "Sign up" on the AuthScreen
4. Complete the signup flow
5. The OnboardingScreen will appear automatically after authentication

### Method 2: Clear AsyncStorage (Development Only)

**Using React Native Debugger or Flipper:**
1. Open React Native Debugger or Flipper
2. Find AsyncStorage
3. Delete the key: `@gobahrain_onboarding_complete`
4. Restart your app

**Using Code (Add to ProfileScreen temporarily):**
Add a button to your ProfileScreen:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage'

// Add this button somewhere in ProfileScreen
<TouchableOpacity 
  onPress={async () => {
    await AsyncStorage.removeItem('@gobahrain_onboarding_complete')
    Alert.alert('Success', 'Onboarding reset! Restart the app.')
  }}
>
  <Text>Reset Onboarding (Dev Only)</Text>
</TouchableOpacity>
```

### Method 3: Using Terminal (React Native CLI)

If using Expo:
```bash
npx expo start
# Then press 'd' to open developer menu
# Select "Debug Remote JS"
# In browser console: localStorage.clear() or sessionStorage.clear()
```

### Method 4: Uninstall and Reinstall
1. Delete the app from your device/simulator
2. Reinstall: `npm run ios` or `npm run android`
3. Sign up as a new user

## App Flow Logic

The app checks in this order:
1. **Authentication** → If not logged in, shows `AuthScreen`
2. **Onboarding** → If logged in but not onboarded, shows `OnboardingScreen`
3. **Main App** → If logged in and onboarded, shows the main tabs

This logic is in `App.js` lines 105-149.
