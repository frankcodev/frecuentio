import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Business, Card } from './types';

interface AuthState {
  session: Session | null;
  business: Business | null;
  card: Card | null;
  loading: boolean;
  /** Re-reads business + card after the panel changes them. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setBusiness(null);
      setCard(null);
      return;
    }
    const [{ data: b }, { data: c }] = await Promise.all([
      supabase.from('businesses').select('id, name, currency').eq('id', s.user.id).maybeSingle(),
      supabase.from('cards').select('*').eq('business_id', s.user.id).maybeSingle(),
    ]);
    setBusiness(b);
    setCard(c);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Deferred: calling Supabase inside this callback can deadlock the client
      setTimeout(() => load(s), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(() => load(session), [load, session]);

  return (
    <AuthContext.Provider value={{ session, business, card, loading, refresh }}>{children}</AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
