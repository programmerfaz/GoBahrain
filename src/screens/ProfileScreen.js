import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';

export default function ProfileScreen() {
  const { session } = useAuth();

  const handleSignOut = () => {
    supabase.auth.signOut();
  };

  return (
    <ScreenContainer showHeader headerTitle="Profile">
      <View style={styles.content}>
        <Text style={styles.text}>Profile page</Text>
        {session?.user?.email ? (
          <Text style={styles.email}>{session.user.email}</Text>
        ) : null}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontSize: 24,
  },
  email: {
    fontSize: 14,
    color: '#475569',
  },
  signOutBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#C8102E',
    borderRadius: 12,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
