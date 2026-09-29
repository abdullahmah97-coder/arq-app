// تمارين الساعة (Apple Watch وغيرها عبر Apple Health): تحويل أنواع التمارين والوحدات. منطق بحت عشان يتختبر

export type WorkoutKind =
  | 'running' | 'walking' | 'cycling' | 'swimming' | 'strength' | 'hiit' | 'yoga' | 'hiking' | 'elliptical'
  | 'rowing' | 'stairs' | 'dance' | 'core' | 'football' | 'racket' | 'combat' | 'cooldown' | 'other';

export interface ExternalWorkout {
  id: string;
  kind: WorkoutKind;
  start: string;
  end: string;
  minutes: number;
  kcal: number | null;
  distance_m: number | null;
  /** اسم التطبيق اللي سجّله (Workout، Strava…) */
  source: string | null;
  from_watch: boolean;
}

/** أرقام HKWorkoutActivityType → نوع عندنا */
const KIND_BY_TYPE: Record<number, WorkoutKind> = {
  37: 'running', 52: 'walking', 13: 'cycling', 74: 'cycling', 46: 'swimming', 53: 'swimming', 82: 'running',
  50: 'strength', 20: 'strength', 11: 'strength', 63: 'hiit', 30: 'hiit', 73: 'hiit', 64: 'hiit',
  57: 'yoga', 66: 'yoga', 62: 'yoga', 29: 'yoga', 72: 'yoga', 58: 'yoga',
  24: 'hiking', 16: 'elliptical', 35: 'rowing', 44: 'stairs', 68: 'stairs', 69: 'stairs',
  14: 'dance', 15: 'dance', 77: 'dance', 78: 'dance', 59: 'core', 41: 'football', 1: 'football', 3: 'football',
  48: 'racket', 43: 'racket', 4: 'racket', 47: 'racket', 79: 'racket', 34: 'racket',
  8: 'combat', 65: 'combat', 28: 'combat', 56: 'combat', 80: 'cooldown', 33: 'cooldown',
};
export const workoutKind = (type: number): WorkoutKind => KIND_BY_TYPE[type] ?? 'other';

export const WORKOUT_ICON: Record<WorkoutKind, string> = {
  running: 'walk', walking: 'footsteps', cycling: 'bicycle', swimming: 'water', strength: 'barbell', hiit: 'flash',
  yoga: 'leaf', hiking: 'trail-sign', elliptical: 'infinite', rowing: 'boat', stairs: 'trending-up', dance: 'musical-notes',
  core: 'body', football: 'football', racket: 'tennisball', combat: 'hand-left', cooldown: 'snow', other: 'fitness',
};

type Q = { quantity: number; unit: string } | null | undefined;

/** الطاقة بالسعرات مهما كانت الوحدة */
export function toKcal(q: Q): number | null {
  if (!q || !Number.isFinite(q.quantity)) return null;
  const u = q.unit.toLowerCase();
  const v = u === 'kj' ? q.quantity / 4.184 : u === 'j' ? q.quantity / 4184 : q.quantity; // kcal و Cal نفس الشي
  return Math.round(v);
}

/** المسافة بالمتر مهما كانت الوحدة */
export function toMeters(q: Q): number | null {
  if (!q || !Number.isFinite(q.quantity)) return null;
  const u = q.unit.toLowerCase();
  const f = u === 'km' ? 1000 : u === 'mi' ? 1609.344 : u === 'yd' ? 0.9144 : u === 'ft' ? 0.3048 : u === 'cm' ? 0.01 : 1;
  return Math.round(q.quantity * f);
}

/** المدة بالدقائق: من قيمة المدة لو موجودة، وإلا من البداية والنهاية */
export function toMinutes(q: Q, start: Date | string, end: Date | string): number {
  if (q && Number.isFinite(q.quantity)) {
    const u = q.unit.toLowerCase();
    const sec = u === 'min' ? q.quantity * 60 : u === 'hr' || u === 'h' ? q.quantity * 3600 : q.quantity;
    return Math.max(0, Math.round(sec / 60));
  }
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

/** تمرين من Apple Watch؟ (الجهاز أو نوع المنتج فيه Watch) */
export const isWatch = (...hints: (string | null | undefined)[]) => hints.some((h) => !!h && /watch/i.test(h));

/** ملخص أسبوع التمارين الخارجية للبطاقة */
export function weekSummary(ws: ExternalWorkout[], now = Date.now()) {
  const recent = ws.filter((w) => now - new Date(w.start).getTime() < 7 * 86_400_000);
  return {
    count: recent.length,
    minutes: recent.reduce((a, w) => a + w.minutes, 0),
    kcal: recent.reduce((a, w) => a + (w.kcal ?? 0), 0),
    distance_m: recent.reduce((a, w) => a + (w.distance_m ?? 0), 0),
  };
}

/** نبض الجلسة من عينات الساعة: المتوسط والأعلى */
export function hrStats(bpm: number[]): { avg: number; max: number } | null {
  const v = bpm.filter((x) => Number.isFinite(x) && x > 30 && x < 240);
  if (v.length < 3) return null;
  return { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.round(Math.max(...v)) };
}
