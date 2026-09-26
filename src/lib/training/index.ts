// سجل التمارين: بدء جلسة، تسجيل المجموعات، الإنهاء، وقراءة التاريخ للمقارنة
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { supabase } from '../supabase';
import type { SessionData, SetEntry } from './stats';

export * from './stats';

export interface PlannedExercise { exercise_id: string; sets: number; reps: string; rest_sec: number }

export interface ActiveWorkout {
  session_id: string;
  title: string;
  source: 'plan' | 'coach' | 'free';
  plan_id?: string | null;
  plan_day?: number | null;
  started_at: string;
  exercises: PlannedExercise[];
  /** المجموعات المسجلة (المكتملة ✓ فقط) */
  done: SetEntry[];
}

const KEY = 'arq.activeWorkout';

export async function getActiveWorkout(): Promise<ActiveWorkout | null> {
  try { const v = await AsyncStorage.getItem(KEY); return v ? (JSON.parse(v) as ActiveWorkout) : null; } catch { return null; }
}
export async function saveActiveWorkout(w: ActiveWorkout | null) {
  try { if (w) await AsyncStorage.setItem(KEY, JSON.stringify(w)); else await AsyncStorage.removeItem(KEY); } catch {}
}

/** يبدأ جلسة جديدة ويفتح شاشة التسجيل (لو فيه جلسة مفتوحة يرجع لها) */
export async function startWorkout(userId: string, opts: { title: string; source: ActiveWorkout['source']; exercises: PlannedExercise[]; plan_id?: string | null; plan_day?: number | null }) {
  const existing = await getActiveWorkout();
  if (existing) { router.push('/workout/log'); return existing; }
  const { data, error } = await supabase.from('workout_sessions')
    .insert({ user_id: userId, title: opts.title.slice(0, 80), source: opts.source, plan_id: opts.plan_id ?? null })
    .select('id, started_at').single();
  if (error) throw error;
  const w: ActiveWorkout = {
    session_id: data.id, started_at: data.started_at, title: opts.title, source: opts.source,
    plan_id: opts.plan_id ?? null, plan_day: opts.plan_day ?? null, exercises: opts.exercises, done: [],
  };
  await saveActiveWorkout(w);
  router.push('/workout/log');
  return w;
}

export async function logSet(userId: string, sessionId: string, s: SetEntry) {
  const { error } = await supabase.from('workout_sets').upsert({
    session_id: sessionId, user_id: userId, exercise_id: s.exercise_id, set_index: s.set_index,
    reps: s.reps, weight_kg: s.weight_kg, done_at: s.done_at ?? new Date().toISOString(),
  }, { onConflict: 'session_id,exercise_id,set_index' });
  if (error) throw error;
}

export async function unlogSet(sessionId: string, exerciseId: string, setIndex: number) {
  await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('exercise_id', exerciseId).eq('set_index', setIndex);
}

/** ينهي الجلسة؛ لو هي تمرين اليوم من الخطة يحتسب نقاط الإنجاز */
export async function finishWorkout(w: ActiveWorkout): Promise<{ points: number }> {
  await supabase.from('workout_sessions').update({ finished_at: new Date().toISOString() }).eq('id', w.session_id);
  let points = 0;
  if (w.plan_id != null && w.plan_day != null && w.done.length > 0) {
    const { data } = await supabase.rpc('complete_workout', { p_plan: w.plan_id, p_day: w.plan_day });
    points = Number(data ?? 0);
  }
  await saveActiveWorkout(null);
  return { points };
}

export async function discardWorkout(w: ActiveWorkout) {
  await supabase.from('workout_sessions').delete().eq('id', w.session_id);
  await saveActiveWorkout(null);
}

type Row = { id: string; title: string | null; started_at: string; finished_at: string | null; workout_sets: SetEntry[] };
const toSession = (r: Row): SessionData => ({ id: r.id, title: r.title, started_at: r.started_at, finished_at: r.finished_at, sets: r.workout_sets ?? [] });

/** آخر الجلسات مع مجموعاتها (للمقارنة والسجل) */
export async function loadHistory(limit = 60): Promise<SessionData[]> {
  const { data } = await supabase.from('workout_sessions')
    .select('id, title, started_at, finished_at, workout_sets(exercise_id, set_index, reps, weight_kg, done_at)')
    .order('started_at', { ascending: false }).limit(limit);
  return ((data ?? []) as Row[]).map(toSession);
}

export async function loadSession(id: string): Promise<SessionData | null> {
  const { data } = await supabase.from('workout_sessions')
    .select('id, title, started_at, finished_at, workout_sets(exercise_id, set_index, reps, weight_kg, done_at)')
    .eq('id', id).maybeSingle();
  return data ? toSession(data as Row) : null;
}

/** آخر مرة سويت هذا التمرين (مجموعات آخر جلسة فيها) */
export function lastTimeFor(exerciseId: string, history: SessionData[], excludeSession?: string): { session: SessionData; sets: SetEntry[] } | null {
  for (const s of history) {
    if (s.id === excludeSession) continue;
    const sets = s.sets.filter((x) => x.exercise_id === exerciseId && x.reps > 0).sort((a, b) => a.set_index - b.set_index);
    if (sets.length) return { session: s, sets };
  }
  return null;
}

// عزل اتجاه النص (LRI…PDI) حتى يظهر «60×10» بنفس الترتيب داخل النص العربي
export const fmtSet = (s: Pick<SetEntry, 'weight_kg' | 'reps'>) => `\u2066${s.weight_kg > 0 ? `${+s.weight_kg}×${s.reps}` : `${s.reps}`}\u2069`;

export function daysAgo(iso: string, now = Date.now()) {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 86400000));
}
