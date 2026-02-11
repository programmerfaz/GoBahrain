import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, Easing, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Order: Home, Explore, AI Plan, Community
const NAV_ITEMS = [
  { name: 'Home', icon: 'home' },
  { name: 'Explore', icon: 'compass' },
  { name: 'AI Plan', icon: 'sparkles' },
  { name: 'Community', icon: 'people' },
];

export default function BottomControlBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const currentRouteName = state.routes[state.index]?.name;

  // Pulsing idle glow + press impulse for AI button (center)
  const pulse = useRef(new Animated.Value(0)).current;
  const impulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, [pulse]);

  const glowScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.25],
  });

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  const impulseScale = impulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.6],
  });

  const impulseOpacity = impulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const handleNavigate = (screenName) => {
    if (currentRouteName === screenName) return;
    navigation.navigate(screenName);
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.bar,
          {
            // Sit closer to the very bottom, similar to Facebook
            bottom: insets.bottom + 4,
          },
        ]}
      >
        {/* Single row: Home · Explore · + · AI Plan · Community */}
        <View style={styles.navRow}>
          {/* Home */}
          <TouchableOpacity
            style={styles.navItem}
            activeOpacity={0.8}
            onPress={() => handleNavigate('Home')}
          >
            <Ionicons
              name="home"
              size={26}
              color={currentRouteName === 'Home' ? '#C8102E' : '#9CA3AF'}
            />
            {currentRouteName === 'Home' && <View style={styles.navDot} />}
          </TouchableOpacity>

          {/* Explore */}
          <TouchableOpacity
            style={styles.navItem}
            activeOpacity={0.8}
            onPress={() => handleNavigate('Explore')}
          >
            <Ionicons
              name="compass"
              size={26}
              color={currentRouteName === 'Explore' ? '#0EA5E9' : '#9CA3AF'}
            />
            {currentRouteName === 'Explore' && <View style={styles.navDot} />}
          </TouchableOpacity>

          {/* Center AI button with idle glow + press impulse */}
          <View style={styles.aiContainer}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.aiGlow,
                {
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.aiImpulseGlow,
                {
                  opacity: impulseOpacity,
                  transform: [{ scale: impulseScale }],
                },
              ]}
            />
            <TouchableOpacity
              style={styles.fab}
              activeOpacity={0.9}
              onPress={() => {
                // Local impulse glow
                impulse.setValue(0);
                Animated.sequence([
                  Animated.timing(impulse, {
                    toValue: 1,
                    duration: 550,
                    easing: Easing.out(Easing.circle),
                    useNativeDriver: true,
                  }),
                  Animated.timing(impulse, {
                    toValue: 0,
                    duration: 350,
                    easing: Easing.in(Easing.circle),
                    useNativeDriver: true,
                  }),
                ]).start();

                // Trigger AI effect on the CURRENT page only (no navigation)
                const current = state.routes[state.index]?.name;
                if (current) {
                  navigation.navigate(current, { aiPulse: Date.now() });
                }
              }}
            >
              <Image
                source={require('../../assets/ai-button-logo.png')}
                style={styles.aiIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          {/* AI Plan */}
          <TouchableOpacity
            style={styles.navItem}
            activeOpacity={0.8}
            onPress={() => handleNavigate('AI Plan')}
          >
            <Ionicons
              name="map-outline"
              size={26}
              color={currentRouteName === 'AI Plan' ? '#C8102E' : '#9CA3AF'}
            />
            {currentRouteName === 'AI Plan' && <View style={styles.navDot} />}
          </TouchableOpacity>

          {/* Community */}
          <TouchableOpacity
            style={styles.navItem}
            activeOpacity={0.8}
            onPress={() => handleNavigate('Community')}
          >
            <Ionicons
              name="people"
              size={26}
              color={currentRouteName === 'Community' ? '#0EA5E9' : '#9CA3AF'}
            />
            {currentRouteName === 'Community' && <View style={styles.navDot} />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 25,
      },
      android: {
        elevation: 14,
      },
    }),
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  aiContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudge AI button up slightly so it floats above the bar
    marginBottom: 4,
  },
  navDot: {
    marginTop: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    // Bahrain red accent under active icon
    backgroundColor: '#C8102E',
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    // Bright Bahrain red base so the AI logo pops
    backgroundColor: '#C8102E',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#C8102E',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 18,
      },
      android: {
        elevation: 14,
      },
    }),
  },
  aiGlow: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    borderColor: '#C8102E',
    backgroundColor: 'rgba(200,16,46,0.22)',
  },
  aiImpulseGlow: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 2,
    borderColor: '#F97373',
    backgroundColor: 'rgba(248,113,113,0.26)',
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
});

