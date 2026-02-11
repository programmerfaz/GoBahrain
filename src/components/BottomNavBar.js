import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const NAV_ITEMS = [
  { key: 'Home', label: 'Home', icon: 'home' },
  { key: 'Explore', label: 'Explore', icon: 'compass' },
  { key: 'AI Plan', label: 'Plan', icon: 'sparkles' },
  { key: 'Community', label: 'Community', icon: 'people' },
  { key: 'Profile', label: 'Profile', icon: 'person-circle-outline' },
];

export default function BottomNavBar({ navigation, activeRouteName }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 16,
          paddingBottom: Platform.OS === 'ios' ? 16 : 12,
        },
      ]}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === activeRouteName;
        return (
          <TouchableOpacity
            key={item.key}
            style={styles.navItem}
            activeOpacity={0.85}
            onPress={() => navigation?.navigate(item.key)}
          >
            <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
              <Ionicons
                name={item.icon}
                size={item.key === 'AI Plan' ? 24 : 22}
                color={isActive ? '#FFFFFF' : '#4B5563'}
              />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
    zIndex: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
  },
  iconWrapActive: {
    backgroundColor: '#111827',
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    color: '#6B7280',
    fontWeight: '500',
  },
  labelActive: {
    color: '#111827',
    fontWeight: '700',
  },
});

