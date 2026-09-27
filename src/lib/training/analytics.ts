// تحليلات سجل التمارين: أعمدة أسبوعية، توزيع المجموعات على العضلات، وتقدم أهم الرفعات — كلها بمقارنات
import { MOTIONS } from '../../three/motions';
import type { Muscle } from '../../three/rig';
import { e1rm, summarize, type SessionData } from './stats';

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';
export const MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
const GROUP_OF: Record<Muscle, MuscleGroup> = {
  chest: 'chest', upperBack: 'back', lats: 'back', lowerBack: 'back', shoulders: 'shoulders', rearDelts: 'shoulders',
  triceps: 'arms', biceps: 'arms', forearms: 'arms', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', abs: 'core',
};

const DAY = 86400000;
/** بداية الأسبوع (الأحد) بتوقيت الجهاز */
export function weekStart(t: number): number {
  const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

const minutesOf = (s: SessionData) => (s.finished_at ? Math.max(0, Math.round((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60000)) : null);
const volumeOf = (s: SessionData) => s.sets.reduce((a, x) => a + x.weight_kg * x.reps, 0);

export interface WeekStat { start: number; sessions: number; volume: number; sets: number; minutes: number }

/** آخر N أسابيع (الأقدم ← الأحدث) */
export function weeklySeries(history: SessionData[], weeks = 8, now = Date.now()): WeekStat[] {
  const cur = weekStart(now);
  const out: WeekStat[] = Array.from({ length: weeks }, (_, i) => ({ start: cur - (weeks - 1 - i) * 7 * DAY, sessions: 0, volume: 0, sets: 0, minutes: 0 }));
  for (const s of history) {
    if (!s.sets.length) continue;
    const ws = weekStart(Date.parse(s.started_at));
    // ±ساعة لتغيّر التوقيت الصيفي
    const w = out.find((x) => Math.abs(x.start - ws) < 2 * 3600000);
    if (!w) continue;
    w.sessions++; w.volume += volumeOf(s); w.sets += s.sets.length; w.minutes += minutesOf(s) ?? 0;
  }
  for (const w of out) w.volume = Math.round(w.volume);
  return out;
}

export const pctDelta = (now: number, prev: number): number | null => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);

/** المجموعات لكل عضلة كبيرة في فترتين متتاليتين بنفس الطول (مثلاً آخر ٤ أسابيع مقابل الـ٤ قبلها) */
export function muscleSets(history: SessionData[], days = 28, now = Date.now()) {
  const res = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, { now: 0, prev: 0 }])) as Record<MuscleGroup, { now: number; prev: number }>;
  for (const s of history) {
    const age = now - Date.parse(s.started_at);
    const bucket = age < days * DAY ? 'now' : age < 2 * days * DAY ? 'prev' : null;
    if (!bucket || age < 0) continue;
    for (const set of s.sets) {
      if (set.reps <= 0) continue;
      const groups = new Set((MOTIONS[set.exercise_id as keyof typeof MOTIONS]?.primary ?? []).map((m) => GROUP_OF[m]));
      // المجموعة تنحسب مرة لكل عضلة كبيرة أساسية فيها
      for (const g of groups) res[g][bucket]++;
    }
  }
  return res;
}

export interface LiftProgress { exercise_id: string; sessions: number; series: number[]; best: number; prevBest: number | null; delta: number | null; top: { weight_kg: number; reps: number } | null }

/** أهم الرفعات (الأكثر تكراراً): أعلى 1RM تقديري لكل جلسة، ومقارنة آخر ٢٨ يوم بما قبلها */
export function liftProgress(history: SessionData[], limit = 6, now = Date.now(), days = 28): LiftProgress[] {
  const byEx = new Map<string, { t: number; e: number; top: { weight_kg: number; reps: number } | null }[]>();
  for (const s of history) {
    const t = Date.parse(s.started_at);
    for (const ex of new Set(s.sets.map((x) => x.exercise_id))) {
      const sm = summarize(ex, s.sets);
      if (!sm.sets) continue;
      if (!byEx.has(ex)) byEx.set(ex, []);
      byEx.get(ex)!.push({ t, e: sm.e1rm, top: sm.top ? { weight_kg: sm.top.weight_kg, reps: sm.top.reps } : null });
    }
  }
  const out: LiftProgress[] = [];
  for (const [ex, pts] of byEx) {
    pts.sort((a, b) => a.t - b.t);
    const recent = pts.filter((p) => now - p.t < days * DAY);
    const older = pts.filter((p) => now - p.t >= days * DAY);
    const best = Math.max(0, ...recent.map((p) => p.e));
    const prevBest = older.length ? Math.max(...older.map((p) => p.e)) : null;
    const topPt = [...recent].sort((a, b) => b.e - a.e)[0];
    out.push({ exercise_id: ex, sessions: pts.length, series: pts.slice(-8).map((p) => p.e), best, prevBest, delta: prevBest && best ? pctDelta(best, prevBest) : null, top: topPt?.top ?? null });
  }
  return out.filter((x) => x.best > 0).sort((a, b) => b.sessions - a.sessions || b.best - a.best).slice(0, limit);
}

/** ترتيب رقم اليوم مقابل أفضل رقم عند الأصدقاء (نفس مقياس الخادم) */
export const liftScore = (w: number, r: number) => (w > 0 ? e1rm(w, r) : r / 1000);
