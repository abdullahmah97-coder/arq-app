// بيانات تجريبية واقعية (للمعاينة ولمن لا يملك ساعة بعد)
import { lastDays } from './aggregate';
import type { DailyHealth } from './types';
import type { ExternalWorkout } from './workouts';

/** مولّد عشوائي ثابت (نفس النتائج في كل تشغيل) */
function rng(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

export function demoDays(n: number, now = new Date()): DailyHealth[] {
  const r = rng(42);
  return lastDays(n, now).map((day, i) => {
    const tough = i % 7 === 5; // يوم تمرين قوي كل أسبوع
    const asleep = Math.round(390 + r() * 90 - (tough ? 0 : 0));
    const deep = Math.round(asleep * (0.16 + r() * 0.06)), rem = Math.round(asleep * (0.2 + r() * 0.05));
    const [y, m, d] = day.split('-').map(Number);
    const bed = new Date(y, m - 1, d - 1, 23, Math.round(r() * 50));
    return {
      day,
      steps: Math.round(6500 + r() * 6500 + (tough ? 2500 : 0)),
      active_kcal: Math.round(380 + r() * 380 + (tough ? 250 : 0)),
      distance_m: Math.round(5200 + r() * 4000),
      resting_hr: Math.round((55 + r() * 5 + (i === n - 1 ? -2 : 0)) * 10) / 10,
      hrv_ms: Math.round((56 + r() * 14 + (i === n - 1 ? 8 : 0)) * 10) / 10,
      hr_zone_min: [Math.round(40 + r() * 30), Math.round(15 + r() * 20), Math.round(r() * 20 + (tough ? 15 : 0)), Math.round(r() * 6 + (tough ? 8 : 0)), Math.round(r() * 2)],
      sleep: {
        start: bed.toISOString(),
        end: new Date(bed.getTime() + (asleep + 28) * 60000).toISOString(),
        in_bed_min: asleep + 28, asleep_min: asleep,
        stages: { deep, rem, light: asleep - deep - rem, awake: 28 },
      },
      resp_rate: Math.round((14.2 + r() * 1.2) * 10) / 10,
      spo2: Math.round((96 + r() * 2.5) * 10) / 10,
      skin_temp: Math.round((34.4 + r() * 0.5) * 100) / 100,
      vo2max: 44.5,
      hr_series: i === n - 1 ? demoHr(day, r) : null,
      source: 'demo' as const,
    };
  });
}

/** نبض يوم كامل كل ٥ دقائق: نوم هادئ، يوم عمل، تمرين العصر، وتوتر خفيف قبله */
function demoHr(day: string, r: () => number) {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0).getTime();
  const now = Math.min(Date.now(), start + 86_400_000);
  const out: { t: number; bpm: number }[] = [];
  for (let t = start; t <= now; t += 5 * 60_000) {
    const h = (t - start) / 3_600_000;
    let bpm = h < 6.5 ? 54 + r() * 4 : h < 17 ? 68 + r() * 10 + (h > 15.5 ? 14 * r() : 0) : h < 18 ? 128 + r() * 25 : 72 + r() * 8;
    if (r() < 0.04) bpm += 18;
    out.push({ t, bpm: Math.round(bpm) });
  }
  return out;
}


// تمارين تجريبية كأنها من Apple Watch (للمعاينة فقط)
const ago = (d: number, h: number) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000);
const demoWorkout = (id: string, kind: ExternalWorkout['kind'], d: number, h: number, minutes: number, kcal: number, distance_m: number | null): ExternalWorkout =>
  ({ id, kind, start: ago(d, h).toISOString(), end: new Date(ago(d, h).getTime() + minutes * 60_000).toISOString(), minutes, kcal, distance_m, source: 'Workout', from_watch: true });

export const demoWorkouts = (): ExternalWorkout[] => [
  demoWorkout('d1', 'running', 0, 3, 32, 348, 5400),
  demoWorkout('d2', 'walking', 1, 10, 45, 190, 3900),
  demoWorkout('d3', 'hiit', 3, 2, 22, 260, null),
  demoWorkout('d4', 'cycling', 5, 4, 50, 420, 18200),
];
export const demoSessionStats = () => ({ avg_hr: 128, max_hr: 164, kcal: 312 });
