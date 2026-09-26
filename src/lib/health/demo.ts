// بيانات تجريبية واقعية (للمعاينة ولمن لا يملك ساعة بعد)
import { lastDays } from './aggregate';
import type { DailyHealth } from './types';

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
      source: 'demo' as const,
    };
  });
}

