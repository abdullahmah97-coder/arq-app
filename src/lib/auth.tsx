import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { setCalorieGoal } from './nutrition/calorieAlert';
import { supabase } from './supabase';
import type { HealthProfile, Profile } from './types';
import type { WeeklyPlan } from './plan/types';

export interface ActivePlan {
  id: string;
  source: 'ai' | 'rules';
  data: WeeklyPlan;
  created_at: string;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  health: HealthProfile | null;
  plan: ActivePlan | null;
  refreshProfile: () => Promise<void>;
  refreshPlan: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [health, setHealth] = useState<HealthProfile | null>(null);
  const [plan, setPlan] = useState<ActivePlan | null>(null);

  const uid = session?.user.id;

  const refreshProfile = useCallback(async () => {
    if (!uid) return;
    const [p, h] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('health_profiles').select('*').eq('user_id', uid).maybeSingle(),
    ]);
    if (p.data) setProfile(p.data as Profile);
    setHealth((h.data as HealthProfile) ?? null);
  }, [uid]);

  const refreshPlan = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase
      .from('plans').select('id, source, data, created_at')
      .eq('user_id', uid).eq('active', true).maybeSingle();
    setPlan((data as ActivePlan) ?? null);
  }, [uid]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) {
      setProfile(null); setHealth(null); setPlan(null);
      return;
    }
    setLoading(true);
    Promise.all([refreshProfile(), refreshPlan()]).finally(() => setLoading(false));
  }, [uid, refreshProfile, refreshPlan]);

  // هدف السعرات لتنبيه «باقي لك ٢٠٠ سعرة» بعد تسجيل الأكل
  useEffect(() => { setCalorieGoal(plan?.data.targets?.calories ?? null); }, [plan]);

  return (
    <Ctx.Provider value={{ session, loading, profile, health, plan, refreshProfile, refreshPlan }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** للشاشات التي تتطلب مستخدماً مسجلاً */
export function useUser() {
  const a = useAuth();
  return { ...a, userId: a.session!.user.id, profile: a.profile! };
}
