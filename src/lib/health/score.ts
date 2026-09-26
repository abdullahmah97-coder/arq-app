// محرك الجاهزية والإجهاد والنوم (حتمي، بدون شبكة) — مستوحى من منهجية WHOOP / Garmin Body Battery:
//  • الجاهزية = مقارنة HRV ونبض الراحة بخط الأساس الشخصي (30 يوماً) + أداء النوم.
//  • الإجهاد 0..21 = حِمل قلبي (TRIMP) على مقياس لوغاريتمي، أو تقدير من السعرات النشطة/الخطوات.
//  • احتياج النوم = أساس 7.5 ساعة + إضافة حسب إجهاد الأمس + جزء من دين النوم.
import type { PlanDay, PlanExercise } from '../plan/types';
import type { DailyHealth, DayScores, RecoveryZone } from './types';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

export const BASE_SLEEP_NEED_MIN = 450;
export const DEFAULT_STEP_GOAL = 8000;
const STRAIN_K = 155;
const ZONE_WEIGHTS = [1, 2, 3, 4, 5];

function median(xs: number[]): number | null {
  if (xs.length < 4) return null; // خط الأساس يحتاج 4 أيام على الأقل
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** الحِمل التدريبي لليوم (وحدات TRIMP تقريبية) */
export function dayLoad(d: DailyHealth, extraWorkoutMin = 0): number {
  let load: number;
  if (d.hr_zone_min && d.hr_zone_min.some((m) => m > 0)) {
    load = d.hr_zone_min.reduce((s, m, i) => s + m * (ZONE_WEIGHTS[i] ?? 5), 0);
  } else if (d.active_kcal != null) {
    load = d.active_kcal / 6;
  } else {
    load = (d.steps ?? 0) / 150;
  }
  // تمرين نادٍ مُسجّل في التطبيق بدون ساعة: تقدير متوسط الشدة (منطقة 2-3)
  return load + extraWorkoutMin * 2.5;
}

/** الإجهاد 0..21 */
export function strainFromLoad(load: number): number {
  return round(21 * (1 - Math.exp(-Math.max(0, load) / STRAIN_K)), 1);
}

export function recoveryZone(recovery: number): RecoveryZone {
  return recovery >= 67 ? 'green' : recovery >= 34 ? 'yellow' : 'red';
}

export function strainTarget(zone: RecoveryZone | null): [number, number] {
  if (zone === 'green') return [14, 18];
  if (zone === 'yellow') return [10, 14];
  if (zone === 'red') return [4, 10];
  return [8, 14];
}

/** احتياج النوم الليلة (دقائق) */
export function sleepNeed(yesterdayStrain: number, recentNights: { asleep_min: number; need_min?: number }[]): number {
  const strainExtra = (yesterdayStrain / 21) * 60;
  const debt = recentNights.slice(-3).reduce((s, n) => s + Math.max(0, (n.need_min ?? BASE_SLEEP_NEED_MIN) - n.asleep_min), 0);
  return Math.round(BASE_SLEEP_NEED_MIN + strainExtra + Math.min(60, debt / 3));
}

/**
 * يحسب نتائج اليوم.
 * @param today بيانات اليوم (النوم = ليلة البارحة)
 * @param history الأيام السابقة (الأقدم أولاً) — تُستخدم لخط الأساس والدين والإجهاد
 */
export function scoreDay(today: DailyHealth, history: DailyHealth[], opts: { workoutMin?: number } = {}): DayScores {
  const past = history.filter((h) => h.day < today.day).slice(-30);
  const baseHrv = median(past.map((h) => h.hrv_ms).filter((x): x is number => x != null && x > 0));
  const baseRhr = median(past.map((h) => h.resting_hr).filter((x): x is number => x != null && x > 0));

  const recent = past.filter((h) => h.sleep).map((h) => ({ asleep_min: h.sleep!.asleep_min }));
  const needLastNight = sleepNeed(past.length > 1 ? strainFromLoad(dayLoad(past[past.length - 2])) : 0, recent.slice(0, -1));
  const needTonight = sleepNeed(strainFromLoad(dayLoad(today, opts.workoutMin)), [...recent, ...(today.sleep ? [{ asleep_min: today.sleep.asleep_min }] : [])]);

  const hrvC = today.hrv_ms != null && baseHrv ? clamp01((today.hrv_ms / baseHrv - 0.75) / 0.5) : null;
  const rhrC = today.resting_hr != null && baseRhr ? clamp01(0.5 + (baseRhr - today.resting_hr) / 16) : null;
  const sleepPerf = today.sleep ? clamp01(today.sleep.asleep_min / needLastNight) : null;
  const eff = today.sleep && today.sleep.in_bed_min > 0 ? clamp01(today.sleep.asleep_min / today.sleep.in_bed_min) : null;

  // وزن المكوّنات المتاحة فقط
  const parts: [number | null, number][] = [[hrvC, 0.5], [rhrC, 0.2], [sleepPerf != null ? sleepPerf * (0.85 + 0.15 * (eff ?? 0.9)) : null, 0.3]];
  const avail = parts.filter(([v]) => v != null) as [number, number][];
  const hasPhysio = hrvC != null || rhrC != null;
  let recovery: number | null = null;
  if (avail.length && (hasPhysio || sleepPerf != null)) {
    const w = avail.reduce((s, [, k]) => s + k, 0);
    recovery = Math.round((100 * avail.reduce((s, [v, k]) => s + v * k, 0)) / w);
    // بدون مؤشرات قلبية لا نعطي جاهزية كاملة الثقة: نحصرها بين 20 و 85
    if (!hasPhysio) recovery = Math.min(85, Math.max(20, recovery));
  }
  const zone = recovery == null ? null : recoveryZone(recovery);

  return {
    recovery,
    zone,
    strain: strainFromLoad(dayLoad(today, opts.workoutMin)),
    sleep_performance: sleepPerf == null ? null : Math.round(sleepPerf * 100),
    sleep_need_min: needTonight,
    sleep_efficiency: eff == null ? null : Math.round(eff * 100),
    strain_target: strainTarget(zone),
    components: {
      hrv: hrvC == null ? null : Math.round(hrvC * 100),
      rhr: rhrC == null ? null : Math.round(rhrC * 100),
      sleep: sleepPerf == null ? null : Math.round(sleepPerf * 100),
    },
    baseline: { hrv_ms: baseHrv == null ? null : round(baseHrv, 1), resting_hr: baseRhr == null ? null : round(baseRhr, 1) },
  };
}

export interface AdaptedDay {
  day: PlanDay;
  changed: boolean;
  /** مفتاح ترجمة يشرح التعديل */
  reason: 'health.adapt.red' | 'health.adapt.yellow' | 'health.adapt.green' | null;
}

/** يعدّل تمرين اليوم حسب الجاهزية (أحمر = تخفيف، أصفر = حذف مجموعة من التمارين المساعدة، أخضر = كما هو) */
export function adaptWorkout(day: PlanDay, zone: RecoveryZone | null): AdaptedDay {
  if (day.rest || !zone) return { day, changed: false, reason: null };
  if (zone === 'green') return { day, changed: false, reason: 'health.adapt.green' };
  const note = zone === 'red'
    ? { ar: 'جاهزية منخفضة: شدة خفيفة (RPE ٦ كحد أقصى) وركّز على التكنيك', en: 'Low recovery: keep it light (RPE ≤ 6) and focus on technique' }
    : { ar: 'جاهزية متوسطة: حافظ على الأوزان وخفّف الحجم', en: 'Moderate recovery: keep the load, trim the volume' };
  const exercises: PlanExercise[] = day.exercises.map((e, i) => {
    let sets = e.sets;
    if (zone === 'red') sets = Math.max(2, Math.round(e.sets * 0.66));
    else if (i >= 2) sets = Math.max(2, e.sets - 1);
    return { ...e, sets, notes: i === 0 ? note : e.notes };
  });
  const cardio = zone === 'red'
    ? { ar: '٢٠ دقيقة مشي أو دراجة بنبض مريح (المنطقة ٢)', en: '20 min easy walk or bike (zone 2)' }
    : day.cardio;
  const changed = exercises.some((e, i) => e.sets !== day.exercises[i].sets) || cardio !== day.cardio;
  return { day: { ...day, exercises, cardio }, changed, reason: zone === 'red' ? 'health.adapt.red' : 'health.adapt.yellow' };
}

/** دقائق → "7س 32د" / "7h 32m" */
export function fmtDuration(min: number | null | undefined, lang: string): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return lang.startsWith('ar') ? `${h}س ${m}د` : `${h}h ${m}m`;
}
