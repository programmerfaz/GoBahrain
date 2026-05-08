import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { GradientButton } from '../components/AnimatedUI'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function AccountBlockedScreen() {
  const { signOut } = useAuth()
  const { colors } = useTheme()

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Your Account Has Been Blocked
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Please contact support if you think this is a mistake.
        </Text>
        <GradientButton onPress={signOut} style={styles.button}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </GradientButton>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  button: {
    width: '100%',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
})
