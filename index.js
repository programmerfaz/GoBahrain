import 'react-native-reanimated';
import 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { registerRootComponent } from 'expo';

/** Prime GoTrue `initialize()` before App.js pulls the rest of the tree (reduces raced first-queries on cold start). */
import './src/config/supabase';
import App from './App';

SplashScreen.preventAutoHideAsync().catch(() => {})

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
