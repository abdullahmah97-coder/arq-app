// مؤشرات إضافية من الساعة (حسابات بحتة قابلة للاختبار):
//   • مراقبة التوتر 0..3 من النبض مقارنة بنبض الراحة (نستبعد أوقات التمرين)
//   • مراقبة الصحة: التنفس، الأكسجين، نبض الراحة، HRV، الحرارة — مقارنة بمعدلك الشخصي
//   • لوحتي: رقم اليوم مقابل معدل آخر ٣٠ يوم
//   • العمر الرياضي: تقدير تحفيزي من VO₂ Max أو نبض الراحة والنشاط (مو تشخيص طبي)
import type { DailyHealth, DayScores } from './types';

const MIN = 60_000;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = mean(xs);
  if (m == null || xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x != null && Number.isFinite(x));

// ---------------------------------------------------------------- التوتر
export type StressLevel = 'low' | 'medium' | 'high';
export interface StressPoint {
  /** بداية الفترة (ms) */
  t: number;
  /** 0..3 أو null (ما فيه قياس / تمرين) */
  v: number | null;
  activity: boolean;
  asleep: boolean;
}
export interface StressSummary {
  current: number | null;
  level: StressLevel | null;
  /** وقت آخر قياس */
  at: number | null;
  /** دقائق التوتر العالي (≥ 2) اليوم */
  highMin: number;
  /** متوسط اليوم (بدون النوم والتمرين) */
  avg: number | null;
}

export const stressLevel = (v: number): StressLevel => (v < 1 ? 'low' : v < 2 ? 'medium' : 'high');

/**
 * يقسم اليوم لفترات (١٠ دقائق) ويحسب التوتر من نسبة النبض في احتياطي القلب:
 *   (النبض − نبض الراحة) ÷ (أقصى نبض − نبض الراحة) → ٠٫٤ = ٣ (أعلى توتر)
 * فوق ٤٥٪ نعتبره نشاط/تمرين ونستبعده (مثل WHOOP).
 */
export function stressSeries(
  samples: { t: number; bpm: number }[] | null | undefined,
  opts: { restingHr: number | null; age: number; sleep?: { start: string; end: string } | null; bucketMin?: number; dayStart?: number },
): StressPoint[] {
  const s = [...(samples ?? [])].filter((x) => x.bpm > 25 && x.bpm < 230).sort((a, b) => a.t - b.t);
  if (s.length < 6) return [];
  const bucket = (opts.bucketMin ?? 10) * MIN;
  const maxHr = 220 - clamp(opts.age, 14, 90);
  const sorted = s.map((x) => x.bpm).sort((a, b) => a - b);
  const rhr = opts.restingHr ?? sorted[Math.floor(sorted.length * 0.05)];
  const reserve = Math.max(40, maxHr - rhr);
  const t0 = opts.dayStart ?? Math.floor(s[0].t / bucket) * bucket;
  const t1 = s[s.length - 1].t;
  const sl = opts.sleep ? { a: Date.parse(opts.sleep.start), b: Date.parse(opts.sleep.end) } : null;
  const out: StressPoint[] = [];
  let i = 0;
  for (let t = t0; t <= t1; t += bucket) {
    const vals: number[] = [];
    while (i < s.length && s[i].t < t + bucket) { if (s[i].t >= t) vals.push(s[i].bpm); i++; }
    const asleep = !!sl && t + bucket / 2 >= sl.a && t + bucket / 2 <= sl.b;
    const m = mean(vals);
    if (m == null) { out.push({ t, v: null, activity: false, asleep }); continue; }
    const frac = (m - rhr) / reserve;
    if (frac >= 0.45 && !asleep) { out.push({ t, v: null, activity: true, asleep }); continue; }
    out.push({ t, v: round(clamp((frac / 0.4) * 3, 0, 3), 1), activity: false, asleep });
  }
  return out;
}

export function stressSummary(series: StressPoint[]): StressSummary {
  const valid = series.filter((p) => p.v != null);
  const last = valid[valid.length - 1];
  const bucketMin = series.length > 1 ? (series[1].t - series[0].t) / MIN : 10;
  const awake = valid.filter((p) => !p.asleep).map((p) => p.v as number);
  return {
    current: last ? last.v : null,
    level: last?.v != null ? stressLevel(last.v) : null,
    at: last ? last.t : null,
    highMin: Math.round(valid.filter((p) => !p.asleep && (p.v as number) >= 2).length * bucketMin),
    avg: awake.length ? round(mean(awake)!, 1) : null,
  };
}

// ---------------------------------------------------------------- مراقبة الصحة
export type MonitorKey = 'resp' | 'spo2' | 'rhr' | 'hrv' | 'temp';
export type MonitorStatus = 'ok' | 'out' | 'calibrating' | 'none';
export interface MonitorItem {
  key: MonitorKey;
  value: number | null;
  base: number | null;
  lo: number | null;
  hi: number | null;
  status: MonitorStatus;
}
export interface MonitorResult {
  items: MonitorItem[];
  inRange: number;
  measured: number;
  /** كم ليلة باقية لين يكتمل المعدل الشخصي (٠ = جاهز) */
  nightsNeeded: number;
}

export const MONITOR_KEYS: MonitorKey[] = ['resp', 'spo2', 'rhr', 'hrv', 'temp'];
const PICK: Record<MonitorKey, (d: DailyHealth) => number | null | undefined> = {
  resp: (d) => d.resp_rate, spo2: (d) => d.spo2, rhr: (d) => d.resting_hr, hrv: (d) => d.hrv_ms, temp: (d) => d.skin_temp,
};
/** أقل عرض للنطاق (عشان ما يطلع «خارج المعدل» بفروق بسيطة) */
const MIN_BAND: Record<MonitorKey, (m: number) => number> = {
  resp: () => 1, spo2: () => 2, rhr: () => 4, hrv: (m) => m * 0.2, temp: () => 0.5,
};
export const CALIBRATION_NIGHTS = 4;

export function healthMonitor(today: DailyHealth | null, history: DailyHealth[]): MonitorResult {
  const past = history.filter((h) => !today || h.day < today.day).slice(-30);
  let nightsNeeded = 0;
  const items = MONITOR_KEYS.map((key): MonitorItem => {
    const value = today ? PICK[key](today) ?? null : null;
    const xs = nums(past.map(PICK[key]));
    if (xs.length < CALIBRATION_NIGHTS) {
      if (value != null || xs.length) nightsNeeded = Math.max(nightsNeeded, CALIBRATION_NIGHTS - xs.length);
      return { key, value, base: xs.length ? round(mean(xs)!, 1) : null, lo: null, hi: null, status: value == null && !xs.length ? 'none' : 'calibrating' };
    }
    const m = mean(xs)!;
    const band = Math.max(2 * sd(xs), MIN_BAND[key](m));
    const lo = m - band;
    const hi = key === 'spo2' ? 100 : m + band;
    const status: MonitorStatus = value == null ? 'none' : value >= lo && value <= hi ? 'ok' : 'out';
    return { key, value, base: round(m, key === 'temp' ? 2 : 1), lo: round(lo, 2), hi: round(hi, 2), status };
  });
  const measured = items.filter((x) => x.status === 'ok' || x.status === 'out').length;
  return { items, inRange: items.filter((x) => x.status === 'ok').length, measured, nightsNeeded };
}

// ---------------------------------------------------------------- لوحتي (اليوم مقابل معدل ٣٠ يوم)
export type DashKey =
  | 'hrv' | 'rhr' | 'avg_hr' | 'steps' | 'kcal' | 'sleep' | 'restorative_h' | 'restorative_pct'
  | 'resp' | 'spo2' | 'zones13' | 'zones45' | 'vo2max' | 'recovery' | 'strain';
export type DashFormat = 'int' | 'dec1' | 'dur' | 'pct' | 'thousands';
export interface DashRow {
  key: DashKey;
  value: number | null;
  base: number | null;
  format: DashFormat;
  /** أي اتجاه أفضل (للتلوين) */
  better: 'up' | 'down' | 'none';
  trend: 'up' | 'down' | 'flat' | null;
}

type Day = { day: DailyHealth; scores: DayScores };
const restorative = (d: DailyHealth) => (d.sleep?.stages ? d.sleep.stages.deep + d.sleep.stages.rem : null);
const zoneSum = (days: DailyHealth[], from: number, to: number) => {
  const zs = days.map((d) => d.hr_zone_min).filter((z): z is number[] => !!z);
  return zs.length ? zs.reduce((s, z) => s + z.slice(from, to + 1).reduce((a, b) => a + b, 0), 0) : null;
};

export function dashboardRows(history: Day[]): DashRow[] {
  if (!history.length) return [];
  const today = history[history.length - 1];
  const past = history.slice(0, -1).slice(-30);
  const avgOf = (f: (x: Day) => number | null | undefined) => {
    const xs = nums(past.map(f));
    return xs.length ? mean(xs) : null;
  };
  const row = (key: DashKey, f: (x: Day) => number | null | undefined, format: DashFormat, better: DashRow['better']): DashRow => {
    const value = f(today) ?? null;
    const base = avgOf(f);
    return { key, value, base, format, better, trend: trendOf(value, base) };
  };
  // مناطق النبض أسبوعية: آخر ٧ أيام مقابل الأسبوع اللي قبله
  const days = history.map((x) => x.day);
  const w = days.slice(-7), prevW = days.slice(-14, -7);
  const zRow = (key: 'zones13' | 'zones45', a: number, b: number): DashRow => {
    const value = zoneSum(w, a, b);
    const base = prevW.length ? zoneSum(prevW, a, b) : null;
    return { key, value, base, format: 'dur', better: 'up', trend: trendOf(value, base) };
  };
  const vo2 = [...history].reverse().find((x) => x.day.vo2max != null)?.day.vo2max ?? null;
  const vo2Base = avgOf((x) => x.day.vo2max);
  const rows: DashRow[] = [
    row('hrv', (x) => x.day.hrv_ms, 'int', 'up'),
    row('rhr', (x) => x.day.resting_hr, 'int', 'down'),
    row('recovery', (x) => x.scores.recovery, 'pct', 'up'),
    row('strain', (x) => x.scores.strain, 'dec1', 'none'),
    row('avg_hr', (x) => x.day.avg_hr, 'int', 'none'),
    row('steps', (x) => x.day.steps, 'thousands', 'up'),
    row('kcal', (x) => x.day.active_kcal, 'thousands', 'up'),
    row('sleep', (x) => x.day.sleep?.asleep_min, 'dur', 'up'),
    row('restorative_h', (x) => restorative(x.day), 'dur', 'up'),
    row('restorative_pct', (x) => {
      const r = restorative(x.day);
      return r != null && x.day.sleep?.asleep_min ? (r / x.day.sleep.asleep_min) * 100 : null;
    }, 'pct', 'up'),
    row('resp', (x) => x.day.resp_rate, 'dec1', 'none'),
    row('spo2', (x) => x.day.spo2, 'pct', 'up'),
    zRow('zones13', 0, 2),
    zRow('zones45', 3, 4),
    { key: 'vo2max', value: vo2, base: vo2Base, format: 'dec1', better: 'up', trend: trendOf(vo2, vo2Base) } as DashRow,
  ];
  return rows.filter((r) => r.value != null || r.base != null);
}

function trendOf(value: number | null, base: number | null): DashRow['trend'] {
  if (value == null || base == null) return null;
  const diff = value - base;
  if (Math.abs(diff) < Math.max(0.5, Math.abs(base) * 0.02)) return 'flat';
  return diff > 0 ? 'up' : 'down';
}

// ---------------------------------------------------------------- العمر الرياضي
export interface FitnessAge {
  /** العمر الرياضي المقدّر */
  age: number;
  /** الفرق عن العمر الحقيقي (سالب = أصغر) */
  diff: number;
  basis: 'vo2max' | 'vitals';
  /** بيانات قليلة → الرقم يتذبذب */
  calibrating: boolean;
}

/**
 * VO₂ Max: العمر اللي يكون فيه متوسط الناس بنفس لياقتك (معادلة خطية تقريبية لمتوسطات الرجال والنساء).
 * بدونه: نعدّل العمر الحقيقي حسب نبض الراحة والخطوات والنوم (±١٠ سنوات كحد أقصى).
 */
export function fitnessAge(history: DailyHealth[], opts: { age: number | null; gender: 'male' | 'female' | null }): FitnessAge | null {
  if (!opts.age || opts.age < 14 || opts.age > 100 || !history.length) return null;
  const age = opts.age;
  const last30 = history.slice(-30);
  const vo2 = [...last30].reverse().find((d) => d.vo2max != null)?.vo2max ?? null;
  const rhrs = nums(last30.map((d) => d.resting_hr));
  const steps = nums(last30.map((d) => d.steps));
  const sleeps = nums(last30.map((d) => d.sleep?.asleep_min));
  let est: number;
  let basis: FitnessAge['basis'];
  if (vo2 != null) {
    basis = 'vo2max';
    est = opts.gender === 'female' ? (49 - vo2) / 0.35 : (57 - vo2) / 0.4;
    // نبض الراحة يعدّل شوي
    if (rhrs.length >= 3) est += (mean(rhrs)! - 60) * 0.1;
  } else {
    if (rhrs.length < 3 && steps.length < 3) return null;
    basis = 'vitals';
    est = age;
    if (rhrs.length >= 3) est += (mean(rhrs)! - 62) * 0.35;
    if (steps.length >= 3) est += clamp((7500 - mean(steps)!) / 1500, -3, 3);
    if (sleeps.length >= 3) est += mean(sleeps)! < 390 ? 1 : mean(sleeps)! >= 450 ? -0.5 : 0;
  }
  est = clamp(est, Math.max(14, age - 15), Math.min(95, age + 15));
  const rounded = round(est, 1);
  return { age: rounded, diff: round(rounded - age, 1), basis, calibrating: rhrs.length < 7 && vo2 == null };
}
