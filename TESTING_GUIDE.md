# Testing the New Onboarding & Auth Screens

## ✅ Easy Way: Use the Developer Option (Added Just Now!)

I've added a **Developer Options** section to your ProfileScreen that only appears in development mode (`__DEV__`).

### Steps:
1. Open your app
2. Make sure you're logged in
3. Go to the **Profile** tab
4. Scroll down to find **"Developer Options"** section (only visible in dev builds)
5. Tap **"Reset Onboarding"**
6. Confirm the reset
7. **Close the app completely** and reopen it
8. The OnboardingScreen will appear!

---

## 🎯 To Test the Full Flow:

### Test AuthScreen (Sign Up Flow):
1. If logged in, sign out from Profile screen
2. You'll see the new AuthScreen with step-by-step questions
3. Tap "Sign up"
4. Follow the one-question-at-a-time flow:
   - Email
   - Password
   - Name
   - Phone (optional)
   - Account type (User/Business)
   - User type (Local/Tourist) OR Business details

### Test OnboardingScreen:
After signing up (or after resetting onboarding), you'll automatically see:
1. Step 1: Tell us about you (General preferences)
2. Step 2: What do you like to do? (Activities)
3. Step 3: What do you like to eat? (Food preferences)

---

## 🔄 Other Testing Methods:

### Method 1: Sign Up as New User
```bash
# In the app:
1. Log out
2. Tap "Sign up" on AuthScreen
3. Complete signup
4. OnboardingScreen appears automatically
```

### Method 2: Clear App Data (iOS Simulator)
```bash
# Delete and reinstall
npx expo start
# Then in simulator: Device > Erase All Content and Settings
```

### Method 3: Clear App Data (Android Emulator)
```bash
# In Android Studio or adb
adb shell pm clear <your.package.name>
# Or: Settings > Apps > SiyahaBH > Storage > Clear Data
```

### Method 4: Manual AsyncStorage Clear (React Native Debugger)
```bash
1. Open React Native Debugger
2. Go to AsyncStorage tab
3. Delete key: @gobahrain_onboarding_complete
4. Restart app
```

---

## 📱 What's New:

### AuthScreen Features:
- ✅ One question per screen (like Typeform/Feathery)
- ✅ Smooth fade animations between steps
- ✅ Progress bar showing completion
- ✅ Back button to correct answers
- ✅ Clean, minimal design with large inputs
- ✅ Floating background orbs
- ✅ Email validation before continuing
- ✅ Password strength indication

### OnboardingScreen Features:
- ✅ Step-by-step preference selection
- ✅ Visual progress indicator
- ✅ Smooth animations between steps
- ✅ Selection counter badge
- ✅ Beautiful chip-based selections
- ✅ Back navigation support

---

## 🐛 Troubleshooting:

### OnboardingScreen not showing?
1. Check you're logged in (use `console.log` to verify `isAuthenticated`)
2. Verify AsyncStorage key is cleared: `@gobahrain_onboarding_complete`
3. Make sure you restart the app after clearing storage

### AuthScreen animations not smooth?
- Make sure you're testing on a real device or good simulator
- Animations may lag on slow emulators

### Can't see Developer Options?
- Make sure you're running in development mode (`__DEV__` is true)
- It's the section right above "Sign out"

---

## 🎨 Design Notes:

The new screens are inspired by modern onboarding experiences like:
- Typeform (one question at a time)
- Duolingo (progress indicators)
- Airbnb (smooth transitions)
- Calm app (minimal design with breathing room)

Enjoy the beautiful new experience! 🚀
