// Apple Health (آيفون + Apple Watch، وأي تطبيق يكتب في Health مثل WHOOP / Oura / Garmin Connect)
import {
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';
import { avg, dayRange, hrZoneMinutes, lastDays, sleepWindow, summarizeSleep, type SleepKind, type SleepSegment } from './aggregate';
import type { HealthProvider } from './provider-types';
import type { DailyHealth } from './types';

const READ = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
  // مراقبة الصحة (Apple Watch / WHOOP / Oura تكتبها في Health)
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
  'HKQuantityTypeIdentifierVO2Max',
] as const;

// CategoryValueSleepAnalysis: 0 inBed, 1 asleepUnspecified, 2 awake, 3 core, 4 deep, 5 REM
const SLEEP_KIND: Record<number, SleepKind> = { 0: 'in_bed', 1: 'asleep', 2: 'awake', 3: 'light', 4: 'deep', 5: 'rem' };

const sum = async (id: (typeof READ)[number], unit: string, start: Date, end: Date) => {
  const r = await queryStatisticsForQuantity(id as 'HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
    filter: { date: { startDate: start, endDate: end } }, unit: unit as 'count',
  });
  return r.sumQuantity?.quantity ?? null;
};
const mean = async (id: (typeof READ)[number], unit: string, start: Date, end: Date) => {
  const r = await queryStatisticsForQuantity(id as 'HKQuantityTypeIdentifierRestingHeartRate', ['discreteAverage'], {
    filter: { date: { startDate: start, endDate: end } }, unit: unit as 'count/min',
  });
  return r.averageQuantity?.quantity ?? null;
};

const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };

async function readDay(day: string, age: number): Promise<DailyHealth> {
  const { start, end } = dayRange(day);
  const sw = sleepWindow(day);
  const vo2From = new Date(end.getTime() - 60 * 86_400_000);
  const [steps, kcal, dist, rhr, hrv, hr, sleep, resp, spo2, temp, vo2] = await Promise.all([
    sum('HKQuantityTypeIdentifierStepCount', 'count', start, end),
    sum('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', start, end),
    sum('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', start, end),
    mean('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', start, end),
    // HRV يُقاس غالباً أثناء النوم → نأخذه من نافذة الليلة
    mean('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', sw.start, sw.end),
    queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', { limit: 0, unit: 'count/min', filter: { date: { startDate: start, endDate: end } } }),
    queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter: { date: { startDate: sw.start, endDate: sw.end } } }),
    // مؤشرات الليل: التنفس والأكسجين وحرارة المعصم تُقاس أثناء النوم
    safe(mean('HKQuantityTypeIdentifierRespiratoryRate', 'count/min', sw.start, sw.end)),
    safe(mean('HKQuantityTypeIdentifierOxygenSaturation', '%', sw.start, sw.end)),
    safe(mean('HKQuantityTypeIdentifierAppleSleepingWristTemperature', 'degC', sw.start, sw.end)),
    // VO₂ Max يُقاس نادراً (مع المشي/الجري) → أحدث قياس خلال شهرين
    safe(queryQuantitySamples('HKQuantityTypeIdentifierVO2Max', {
      limit: 1, ascending: false, unit: 'ml/(kg*min)', filter: { date: { startDate: vo2From, endDate: end } },
    })),
  ]);
  const segs: SleepSegment[] = sleep
    .map((s) => ({ start: new Date(s.startDate).getTime(), end: new Date(s.endDate).getTime(), kind: SLEEP_KIND[Number(s.value)] }))
    .filter((s) => !!s.kind);
  const hrs = hr.map((s) => ({ t: new Date(s.startDate).getTime(), bpm: s.quantity }));
  return {
    day,
    steps: steps == null ? null : Math.round(steps),
    active_kcal: kcal == null ? null : Math.round(kcal),
    distance_m: dist == null ? null : Math.round(dist),
    resting_hr: rhr == null ? null : Math.round(rhr * 10) / 10,
    hrv_ms: hrv == null ? null : Math.round(hrv * 10) / 10,
    avg_hr: avg(hrs.map((h) => h.bpm)),
    hr_zone_min: hrs.length > 20 ? hrZoneMinutes(hrs, age) : null,
    sleep: summarizeSleep(segs),
    resp_rate: resp == null ? null : Math.round(resp * 10) / 10,
    // HealthKit يرجع النسبة ككسر (0.97) → نحولها لـ 97
    spo2: spo2 == null ? null : Math.round((spo2 <= 1.5 ? spo2 * 100 : spo2) * 10) / 10,
    skin_temp: temp == null ? null : Math.round(temp * 100) / 100,
    vo2max: vo2 && vo2.length ? Math.round(vo2[0].quantity * 10) / 10 : null,
    hr_series: hrs,
    source: 'apple_health',
  };
}

export const provider: HealthProvider = {
  id: 'apple_health',
  // لو زادت أنواع قراءة جديدة نرفع الرقم فنطلب الإذن مرة ثانية (iOS يسأل عن الجديد فقط)
  readVersion: 2,
  isAvailable: () => isHealthDataAvailableAsync(),
  // Apple لا تكشف هل مُنحت القراءة (للخصوصية)، فنعتبر الطلب ناجحاً ونعرض "لا بيانات" إن رُفض
  requestAccess: () => requestAuthorization({ toRead: READ }),
  async readDays(n, age) {
    const out: DailyHealth[] = [];
    for (const d of lastDays(n)) out.push(await readDay(d, age));
    // عينات النبض نحتاجها لليوم الحالي فقط (رسم التوتر)
    out.forEach((d, i) => { if (i < out.length - 1) d.hr_series = null; });
    return out;
  },
  openSettings: () => { Linking.openURL('x-apple-health://').catch(() => Linking.openSettings()); },
};
