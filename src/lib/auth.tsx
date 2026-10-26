import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { registerForPushNotifications, unregisterPushNotifications } from './notifications';
import { supabase, type Profile } from './supabase';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = session?.user.id;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('id, display_name, phone').eq('id', userId).single();
    setProfile(data);
  }, [userId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    refreshProfile();
    if (userId) registerForPushNotifications(userId).catch((e) => console.warn('Push setup failed', e));
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    if (userId) await unregisterPushNotifications(userId).catch((e) => console.warn('Push cleanup failed', e));
    await supabase.auth.signOut();
  }, [userId]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
