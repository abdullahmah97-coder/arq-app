import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking } from 'react-native';
import { parseAuthLink } from './authLink';
import i18n from './i18n';
import { setCalorieGoal } from './nutrition/calorieAlert';
import { effectiveTargets } from './nutrition/goal';
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

/** آخر رابط تأكيد تطبّق (عشان ما يتطبّق مرتين) */
const AUTH_LINK_KEY = 'arq.authLink.v1';

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

  // رابط تأكيد الإيميل يفتح التطبيق ومعه الجلسة: ندخّل المستخدم على طول بدل ما يكتب كلمة المرور من جديد.
  // كل رابط يتطبّق مرة وحدة بس: بعد تحديث التطبيق (إعادة تشغيل) getInitialURL يرجع نفس الرابط، ولو طبّقناه
  // مرة ثانية يرجع جلسة قديمة مكان الحالية.
  useEffect(() => {
    const handle = async (url: string | null) => {
      const link = parseAuthLink(url);
      if (!link || !url) return;
      const mark = link.kind === 'session' ? link.refresh_token : url.slice(0, 300);
      if ((await AsyncStorage.getItem(AUTH_LINK_KEY).catch(() => null)) === mark) return;
      await AsyncStorage.setItem(AUTH_LINK_KEY, mark).catch(() => {});
      if (link.kind === 'session') {
        const { error } = await supabase.auth.setSession({ access_token: link.access_token, refresh_token: link.refresh_token });
        if (error) Alert.alert(i18n.t('auth.linkExpired'), i18n.t('auth.linkExpiredBody'));
      } else {
        Alert.alert(i18n.t('auth.linkExpired'), i18n.t('auth.linkExpiredBody'));
      }
    };
    Linking.getInitialURL().then((u) => handle(u), () => {}).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => { handle(url).catch(() => {}); });
    return () => sub.remove();
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
  useEffect(() => { setCalorieGoal(effectiveTargets(plan?.data.targets, profile?.kcal_goal)?.calories ?? null); }, [plan, profile?.kcal_goal]);

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
