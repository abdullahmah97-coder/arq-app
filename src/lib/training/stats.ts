// محرك المقارنة: الحجم، القوة القصوى التقديرية (1RM)، الأرقام الشخصية، وإيجاد آخر جلسة مماثلة
import { getExercise } from '../../three/catalog';
import { MOTIONS } from '../../three/motions';
import type { Muscle } from '../../three/rig';

export interface SetEntry { exercise_id: string; set_index: number; reps: number; weight_kg: number; done_at?: string }
export interface SessionData { id: string; started_at: string; finished_at?: string | null; title?: string | null; sets: SetEntry[] }

export interface ExerciseSummary {
  exercise_id: string;
  sets: number;
  reps: number;
  volume: number;          // Σ الوزن × العدّات
  top: SetEntry | null;    // أفضل مجموعة (أثقل وزن ثم أكثر عدّات)
  e1rm: number;            // أعلى قوة قصوى تقديرية
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** معادلة Epley — دقيقة حتى ~12 عدّة. للتمارين بوزن الجسم (0 كجم) نرجع العدّات كمقياس */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (weight <= 0) return reps;
  if (reps === 1) return weight;
  return round1(weight * (1 + Math.min(reps, 12) / 30));
}

export function summarize(exercise_id: string, sets: SetEntry[]): ExerciseSummary {
  const s = sets.filter((x) => x.exercise_id === exercise_id && x.reps > 0);
  let top: SetEntry | null = null;
  for (const x of s) if (!top || x.weight_kg > top.weight_kg || (x.weight_kg === top.weight_kg && x.reps > top.reps)) top = x;
  return {
    exercise_id,
    sets: s.length,
    reps: s.reduce((a, x) => a + x.reps, 0),
    volume: round1(s.reduce((a, x) => a + x.weight_kg * x.reps, 0)),
    top,
    e1rm: s.reduce((a, x) => Math.max(a, e1rm(x.weight_kg, x.reps)), 0),
  };
}

export function exercisesOf(session: SessionData): string[] {
  const seen: string[] = [];
  for (const s of [...session.sets].sort((a, b) => a.set_index - b.set_index)) if (!seen.includes(s.exercise_id)) seen.push(s.exercise_id);
  return seen;
}

export function musclesOf(ids: string[]): Set<Muscle> {
  const out = new Set<Muscle>();
  for (const id of ids) for (const m of MOTIONS[(getExercise(id)?.motion ?? id) as keyof typeof MOTIONS]?.primary ?? []) out.add(m);
  return out;
}

/** تشابه جلستين (0..1): تقاطع العضلات الأساسية ÷ اتحادها، مع وزن إضافي للتمارين المشتركة */
export function similarity(a: string[], b: string[]): number {
  const ma = musclesOf(a), mb = musclesOf(b);
  const inter = [...ma].filter((m) => mb.has(m)).length;
  const union = new Set([...ma, ...mb]).size || 1;
  const sharedEx = a.filter((x) => b.includes(x)).length / Math.max(1, Math.min(a.length, b.length));
  return Math.min(1, 0.7 * (inter / union) + 0.3 * sharedEx);
}

/** آخر جلسة منتهية قبل الحالية وتشبهها (نفس العضلات) — مثلاً ترابيس مع آخر ترابيس */
export function findLastSimilar(current: SessionData, history: SessionData[], min = 0.45): SessionData | null {
  const ids = exercisesOf(current);
  const past = history
    .filter((h) => h.id !== current.id && h.started_at < current.started_at && h.sets.length)
    .sort((x, y) => y.started_at.localeCompare(x.started_at));
  for (const h of past) if (similarity(ids, exercisesOf(h)) >= min) return h;
  return null;
}

export interface CompareRow {
  exercise_id: string;
  now: ExerciseSummary;
  prev: ExerciseSummary | null;
  /** تغيّر الحجم ٪ (null لو ما فيه سابق) */
  volumeDelta: number | null;
  e1rmDelta: number | null;
  /** رقم شخصي جديد مقارنة بكل التاريخ */
  pr: boolean;
}

export interface SessionCompare {
  rows: CompareRow[];
  totals: { now: { volume: number; sets: number; reps: number; minutes: number | null }; prev: { volume: number; sets: number; reps: number; minutes: number | null } | null };
  volumeDelta: number | null;
  prs: number;
  previous: SessionData | null;
}

const minutes = (s: SessionData) => (s.finished_at ? Math.round((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60000) : null);
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

export function compareSession(current: SessionData, history: SessionData[]): SessionCompare {
  const previous = findLastSimilar(current, history);
  const older = history.filter((h) => h.id !== current.id && h.started_at < current.started_at);
  const rows: CompareRow[] = exercisesOf(current).map((id) => {
    const now = summarize(id, current.sets);
    // لكل تمرين: آخر مرة سويته (حتى لو في جلسة مختلفة)
    const lastWith = older.filter((h) => h.sets.some((s) => s.exercise_id === id)).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    const prev = lastWith ? summarize(id, lastWith.sets) : null;
    const bestBefore = older.reduce((m, h) => Math.max(m, summarize(id, h.sets).e1rm), 0);
    return {
      exercise_id: id, now, prev,
      volumeDelta: prev ? pct(now.volume || now.reps, prev.volume || prev.reps) : null,
      e1rmDelta: prev ? round1(now.e1rm - prev.e1rm) : null,
      pr: bestBefore > 0 && now.e1rm > bestBefore,
    };
  });
  const tot = (s: SessionData) => ({
    volume: round1(s.sets.reduce((a, x) => a + x.weight_kg * x.reps, 0)),
    sets: s.sets.filter((x) => x.reps > 0).length,
    reps: s.sets.reduce((a, x) => a + x.reps, 0),
    minutes: minutes(s),
  });
  const now = tot(current);
  const prevT = previous ? tot(previous) : null;
  return { rows, totals: { now, prev: prevT }, volumeDelta: prevT ? pct(now.volume, prevT.volume) : null, prs: rows.filter((r) => r.pr).length, previous };
}

/** نطاق العدّات من نص مثل "8-12" أو "10" */
export function repRange(reps: string): [number, number] {
  const n = (reps.match(/\d+/g) ?? []).map(Number);
  if (!n.length) return [8, 12];
  return n.length === 1 ? [n[0], n[0]] : [Math.min(n[0], n[1]), Math.max(n[0], n[1])];
}

const LOWER = new Set(['back_squat', 'deadlift', 'leg_press', 'hack_squat', 'rdl_bb', 'hip_thrust_bb']);

/** اقتراح وزن اليوم من آخر مرة (زيادة تدريجية): كمّلت الحد الأعلى بكل المجموعات → زِد */
export function suggestNext(exercise_id: string, last: SetEntry[], target: string): { weight: number; reps: number; increase: boolean } | null {
  const s = last.filter((x) => x.exercise_id === exercise_id && x.reps > 0);
  if (!s.length) return null;
  const [lo, hi] = repRange(target);
  const working = Math.max(...s.map((x) => x.weight_kg));
  const atWorking = s.filter((x) => x.weight_kg === working);
  const hitTop = atWorking.length >= Math.min(2, s.length) && atWorking.every((x) => x.reps >= hi);
  if (working === 0) return { weight: 0, reps: Math.max(...s.map((x) => x.reps)) + (hitTop ? 1 : 0), increase: hitTop };
  const step = LOWER.has(exercise_id) ? 5 : 2.5;
  return hitTop ? { weight: working + step, reps: lo, increase: true } : { weight: working, reps: Math.min(hi, Math.max(...atWorking.map((x) => x.reps)) + 1), increase: false };
}
