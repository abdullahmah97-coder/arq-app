// سياق الصحة: يربط الجوال/الساعة، يقرأ آخر 30 يوماً، يحسب الجاهزية/الإجهاد/النوم، ويزامن مع Supabase.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../auth';
import { supabase } from '../supabase';
import { provider } from './provider';
import { demoDays } from './demo';
import { DEFAULT_STEP_GOAL, scoreDay } from './score';
import type { DailyHealth, DayScores, HealthSource } from './types';

export * from './types';
export { adaptWorkout, fmtDuration, DEFAULT_STEP_GOAL } from './score';

type Status = 'loading' | 'disconnected' | 'connected' | 'unavailable';
const KEY = 'arq.health.connected';
const PERM_KEY = 'arq.health.readVersion';
const HISTORY_DAYS = 30;

interface HealthState {
  status: Status;
  source: HealthSource | null;
  /** آخر 30 يوماً (الأقدم أولاً) */
  days: DailyHealth[];
  today: DailyHealth | null;
  scores: DayScores | null;
  /** نتائج كل يوم (للرسوم) */
  history: { day: DailyHealth; scores: DayScores }[];
  stepGoal: number;
  syncing: boolean;
  lastSync: Date | null;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  /** وضع المعاينة: بيانات تجريبية بدون جهاز */
  useDemo(): void;
  openSettings?: () => void;
}

const Ctx = createContext<HealthState | null>(null);

function toRow(d: DailyHealth, s: DayScores) {
  return {
    day: d.day, steps: d.steps, active_kcal: d.active_kcal, distance_m: d.distance_m ?? null,
    resting_hr: d.resting_hr, hrv_ms: d.hrv_ms,
    sleep_min: d.sleep?.asleep_min ?? null, in_bed_min: d.sleep?.in_bed_min ?? null,
    deep_min: d.sleep?.stages?.deep ?? null, rem_min: d.sleep?.stages?.rem ?? null,
    light_min: d.sleep?.stages?.light ?? null, awake_min: d.sleep?.stages?.awake ?? null,
    recovery: s.recovery, strain: s.strain, source: d.source,
  };
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const { session, health } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [source, setSource] = useState<HealthSource | null>(null);
  const [days, setDays] = useState<DailyHealth[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const busy = useRef(false);
  const age = health?.birth_year ? new Date().getFullYear() - health.birth_year : 30;

  const load = useCallback(async (src: HealthSource) => {
    if (busy.current) return;
    busy.current = true; setSyncing(true);
    try {
      const d = src === 'demo' ? demoDays(HISTORY_DAYS) : await provider.readDays(HISTORY_DAYS, age);
      setDays(d);
      setLastSync(new Date());
      if (session && src !== 'demo') {
        // مزامنة آخر 7 أيام مع الخادم (للتحديات والنقاط وترتيب الأصدقاء)
        const recent = d.slice(-7);
        const rows = recent.map((x) => toRow(x, scoreDay(x, d)));
        await supabase.rpc('sync_daily_health', { p_days: rows });
      }
    } catch (e) {
      console.warn('health sync failed', e);
    } finally {
      busy.current = false; setSyncing(false);
    }
  }, [age, session]);

  // استعادة حالة الربط عند فتح التطبيق
  useEffect(() => {
    (async () => {
      const saved = (await AsyncStorage.getItem(KEY)) as HealthSource | null;
      if (saved === 'demo' || (saved && saved === provider.id)) {
        setSource(saved); setStatus('connected');
        // أنواع جديدة (تنفّس، أكسجين، حرارة، VO₂ Max): نطلب إذنها مرة وحدة قبل القراءة
        const v = Number(await AsyncStorage.getItem(PERM_KEY).catch(() => null)) || 1;
        if (saved !== 'demo' && (provider.readVersion ?? 1) > v) {
          await provider.requestAccess().catch(() => false);
          await AsyncStorage.setItem(PERM_KEY, String(provider.readVersion ?? 1)).catch(() => {});
        }
        load(saved);
      } else {
        const ok = Platform.OS === 'web' ? true : await provider.isAvailable().catch(() => false);
        setStatus(ok ? 'disconnected' : 'unavailable');
      }
    })();
  }, [load]);

  // تحديث عند العودة للتطبيق
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && source) load(source); });
    return () => sub.remove();
  }, [source, load]);

  const connect = useCallback(async () => {
    const ok = await provider.requestAccess().catch(() => false);
    if (!ok) return false;
    await AsyncStorage.setItem(KEY, provider.id);
    await AsyncStorage.setItem(PERM_KEY, String(provider.readVersion ?? 1)).catch(() => {});
    setSource(provider.id); setStatus('connected');
    await load(provider.id);
    return true;
  }, [load]);

  const useDemo = useCallback(() => {
    AsyncStorage.setItem(KEY, 'demo');
    setSource('demo'); setStatus('connected'); load('demo');
  }, [load]);

  const disconnect = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    setSource(null); setDays([]); setStatus('disconnected');
  }, []);

  const history = useMemo(() => days.map((d, i) => ({ day: d, scores: scoreDay(d, days.slice(0, i)) })), [days]);
  const last = history[history.length - 1];

  const value: HealthState = {
    status, source, days, history, syncing, lastSync,
    today: last?.day ?? null,
    scores: last?.scores ?? null,
    stepGoal: DEFAULT_STEP_GOAL,
    connect, disconnect, useDemo,
    refresh: () => (source ? load(source) : Promise.resolve()),
    openSettings: provider.openSettings,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHealth(): HealthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHealth must be used inside HealthProvider');
  return v;
}
