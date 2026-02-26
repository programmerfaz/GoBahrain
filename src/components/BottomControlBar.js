import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, Easing, Image, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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

  const navItems = [
    { screen: 'Home', icon: 'home', label: 'Home' },
    { screen: 'Explore', icon: 'compass', label: 'Explore' },
    null, // center slot for AI FAB
    { screen: 'AI Plan', icon: 'map-outline', label: 'AI Plan' },
    { screen: 'Community', icon: 'people', label: 'Community' },
  ];

  const barContentHeight = 56;
  const bottomInset = Math.max(insets.bottom, 12);
  const totalBarHeight = barContentHeight + bottomInset;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.bar,
          {
            height: totalBarHeight,
            paddingBottom: bottomInset,
          },
        ]}
      >
        <View style={styles.navRow}>
          {navItems.map((item, index) => {
            if (item === null) {
              return (
                <View key="ai" style={styles.aiContainer}>
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
                      if (Platform.OS !== 'web') {
                        Vibration.vibrate(40);
                      }
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
                      navigation.navigate('AI Plan', { openPlanModal: Date.now() });
                    }}
                  >
                    <Image
                      source={require('../../assets/ai-button-logo.png')}
                      style={styles.aiIcon}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                  <Text style={styles.fabLabel}>AI</Text>
                </View>
              );
            }
            const isActive = currentRouteName === item.screen;
            return (
              <TouchableOpacity
                key={item.screen}
                style={styles.navItem}
                activeOpacity={0.7}
                onPress={() => handleNavigate(item.screen)}
              >
                <Ionicons
                  name={item.icon}
                  size={24}
                  color={isActive ? '#C8102E' : '#9CA3AF'}
                />
                <Text
                  style={[
                    styles.navLabel,
                    isActive && styles.navLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    left: 0,
    right: 0,
    bottom: 0,
    position: 'absolute',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  navLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#C8102E',
  },
  aiContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  aiGlow: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.3)',
    backgroundColor: 'rgba(17,24,39,0.08)',
  },
  aiImpulseGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.25)',
    backgroundColor: 'rgba(17,24,39,0.10)',
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
});

