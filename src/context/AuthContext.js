import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

const REMEMBER_ME_EMAIL_KEY = '@gobahrain_remember_email';
const REMEMBER_ME_PASSWORD_KEY = '@gobahrain_remember_password';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) {
        console.warn('[Auth] get_my_profile failed', error.message);
        setProfile(null);
        return null;
      }
      const next = data || null;
      setProfile(next);
      return next;
    } catch (e) {
      console.warn('[Auth] fetchProfile error', e?.message);
      setProfile(null);
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let timeoutId = null
    /**
     * INITIAL_SESSION fires only after GoTrue initializePromise settles (recover + refresh), same gate as getSession().
     * Do NOT use a short timer to clear loading — it lets Tabs mount while auth init still holds locks and first Supabase reads fail cold.
     */
    const AUTH_DEADLOCK_MS = 20000
    let bootstrapEnded = false

    const clearBootstrapTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const maybeFinishBootstrap = () => {
      if (bootstrapEnded) return
      bootstrapEnded = true
      clearBootstrapTimer()
      setAuthLoading(false)
    }

    timeoutId = setTimeout(() => {
      if (bootstrapEnded) return
      console.warn(
        '[Auth] Auth bootstrap deadlock after',
        AUTH_DEADLOCK_MS,
        'ms — check internet connectivity and EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY'
      )
      maybeFinishBootstrap()
    }, AUTH_DEADLOCK_MS)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        setSession(s);
        if (event === 'INITIAL_SESSION') {
          maybeFinishBootstrap()
        }
        if (s?.user?.id) {
          const existingProfile = await fetchProfile();
          if (!existingProfile && s.user.user_metadata?.account_type) {
            const meta = s.user.user_metadata;
            const accountType = meta.account_type || 'user';
            try {
              if (accountType === 'user') {
                await supabase.rpc('ensure_user_profile', {
                  p_user_name: meta.user_name ?? '',
                  p_phone: meta.phone ?? null,
                  p_u_type: meta.u_type ?? 'local',
                });
              } else if (accountType === 'client') {
                await supabase.rpc('ensure_client_profile', {
                  p_user_name: meta.user_name ?? '',
                  p_phone: meta.phone ?? null,
                  p_business_name: meta.business_name ?? '',
                  p_description: meta.description ?? null,
                  p_client_type: meta.client_type ?? 'place',
                });
              }
              await fetchProfile();
            } catch (err) {
              console.warn('[Auth] ensure profile from metadata failed', err?.message);
            }
          }
        } else {
          setProfile(null);
        }
        if (event === 'SIGNED_OUT') setProfile(null);
      }
    );

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s)
        if (s?.user?.id) fetchProfile()
      })
      .catch((e) => {
        console.warn('[Auth] getSession failed', e?.message)
        setSession(null)
      })
      .finally(() => {
        maybeFinishBootstrap()
      })

    return () => {
      clearBootstrapTimer()
      subscription.unsubscribe()
    }
  }, [fetchProfile]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_name: options.userName,
          phone: options.phone,
          account_type: options.accountType,
          u_type: options.uType,
          business_name: options.businessName,
          description: options.description,
          client_type: options.clientType,
        },
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const ensureProfileAfterSignUp = useCallback(async (options = {}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (options.accountType === 'user') {
      const { error } = await supabase.rpc('ensure_user_profile', {
        p_user_name: options.userName ?? '',
        p_phone: options.phone ?? null,
        p_u_type: options.uType ?? 'local',
      });
      if (error) throw error;
    } else if (options.accountType === 'client') {
      const { error } = await supabase.rpc('ensure_client_profile', {
        p_user_name: options.userName ?? '',
        p_phone: options.phone ?? null,
        p_business_name: options.businessName ?? '',
        p_description: options.description ?? null,
        p_client_type: options.clientType ?? 'place',
      });
      if (error) throw error;
    }
    await fetchProfile();
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      const { error: globalErr } = await supabase.auth.signOut({ scope: 'global' });
      if (globalErr) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (e) {
      console.warn('[Auth] signOut failed', e?.message);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } finally {
      setSession(null);
      setProfile(null);
      try {
        await AsyncStorage.multiRemove([REMEMBER_ME_EMAIL_KEY, REMEMBER_ME_PASSWORD_KEY]);
      } catch (_) {}
    }
  }, []);

  const ownerProfileDisabledRaw =
    profile?.account?.owner_profile_disabled ??
    profile?.owner_profile_disabled ??
    false
  const isOwnerProfileDisabled =
    ownerProfileDisabledRaw === true || ownerProfileDisabledRaw === 'true'

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    authLoading,
    signIn,
    signUp,
    ensureProfileAfterSignUp,
    signOut,
    isAuthenticated: !!session,
    isOwnerProfileDisabled,
    profileLoading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
