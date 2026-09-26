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

async function readDay(day: string, age: number): Promise<DailyHealth> {
  const { start, end } = dayRange(day);
  const sw = sleepWindow(day);
  const [steps, kcal, dist, rhr, hrv, hr, sleep] = await Promise.all([
    sum('HKQuantityTypeIdentifierStepCount', 'count', start, end),
    sum('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', start, end),
    sum('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', start, end),
    mean('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', start, end),
    // HRV يُقاس غالباً أثناء النوم → نأخذه من نافذة الليلة
    mean('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', sw.start, sw.end),
    queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', { limit: 0, unit: 'count/min', filter: { date: { startDate: start, endDate: end } } }),
    queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter: { date: { startDate: sw.start, endDate: sw.end } } }),
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
    source: 'apple_health',
  };
}

export const provider: HealthProvider = {
  id: 'apple_health',
  isAvailable: () => isHealthDataAvailableAsync(),
  // Apple لا تكشف هل مُنحت القراءة (للخصوصية)، فنعتبر الطلب ناجحاً ونعرض "لا بيانات" إن رُفض
  requestAccess: () => requestAuthorization({ toRead: READ }),
  async readDays(n, age) {
    const out: DailyHealth[] = [];
    for (const d of lastDays(n)) out.push(await readDay(d, age));
    return out;
  },
  openSettings: () => { Linking.openURL('x-apple-health://').catch(() => Linking.openSettings()); },
};
