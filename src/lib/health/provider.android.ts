// Health Connect (أندرويد 14+ مدمج، وأقدم عبر تطبيق Health Connect)
// المصادر: Google Fit/Pixel Watch/Fitbit، Samsung Health/Galaxy Watch، Garmin، WHOOP، Oura…
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  SleepStageType,
  type Permission,
} from 'react-native-health-connect';
import { avg, dayRange, hrZoneMinutes, lastDays, sleepWindow, summarizeSleep, type SleepKind, type SleepSegment } from './aggregate';
import type { HealthProvider } from './provider-types';
import type { DailyHealth } from './types';

const TYPES = ['Steps', 'ActiveCaloriesBurned', 'Distance', 'RestingHeartRate', 'HeartRateVariabilityRmssd', 'HeartRate', 'SleepSession',
  'RespiratoryRate', 'OxygenSaturation', 'SkinTemperature', 'Vo2Max'] as const;
const PERMS: Permission[] = TYPES.map((recordType) => ({ accessType: 'read', recordType }));

const STAGE: Record<number, SleepKind> = {
  [SleepStageType.AWAKE]: 'awake', [SleepStageType.OUT_OF_BED]: 'awake', [SleepStageType.SLEEPING]: 'asleep',
  [SleepStageType.LIGHT]: 'light', [SleepStageType.DEEP]: 'deep', [SleepStageType.REM]: 'rem', [SleepStageType.UNKNOWN]: 'asleep',
};

let ready = false;
async function init() {
  if (!ready) ready = await initialize();
  return ready;
}
const between = (s: Date, e: Date) => ({ operator: 'between' as const, startTime: s.toISOString(), endTime: e.toISOString() });
const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };
const round1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

async function readDay(day: string, age: number, granted: Set<string>): Promise<DailyHealth> {
  const { start, end } = dayRange(day);
  const sw = sleepWindow(day);
  const has = (t: string) => granted.has(t);
  const vo2From = new Date(end.getTime() - 60 * 86_400_000);
  const [steps, kcal, dist, rhr, hrv, hr, sleep, resp, spo2, temp, vo2] = await Promise.all([
    has('Steps') ? safe(aggregateRecord({ recordType: 'Steps', timeRangeFilter: between(start, end) })) : null,
    has('ActiveCaloriesBurned') ? safe(aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: between(start, end) })) : null,
    has('Distance') ? safe(aggregateRecord({ recordType: 'Distance', timeRangeFilter: between(start, end) })) : null,
    has('RestingHeartRate') ? safe(aggregateRecord({ recordType: 'RestingHeartRate', timeRangeFilter: between(start, end) })) : null,
    has('HeartRateVariabilityRmssd') ? safe(readRecords('HeartRateVariabilityRmssd', { timeRangeFilter: between(sw.start, sw.end) })) : null,
    has('HeartRate') ? safe(readRecords('HeartRate', { timeRangeFilter: between(start, end) })) : null,
    has('SleepSession') ? safe(readRecords('SleepSession', { timeRangeFilter: between(sw.start, sw.end) })) : null,
    has('RespiratoryRate') ? safe(readRecords('RespiratoryRate', { timeRangeFilter: between(sw.start, sw.end) })) : null,
    has('OxygenSaturation') ? safe(readRecords('OxygenSaturation', { timeRangeFilter: between(sw.start, sw.end) })) : null,
    has('SkinTemperature') ? safe(readRecords('SkinTemperature', { timeRangeFilter: between(sw.start, sw.end) })) : null,
    has('Vo2Max') ? safe(readRecords('Vo2Max', { timeRangeFilter: between(vo2From, end) })) : null,
  ]);

  const segs: SleepSegment[] = [];
  for (const s of sleep?.records ?? []) {
    const t0 = Date.parse(s.startTime), t1 = Date.parse(s.endTime);
    segs.push({ start: t0, end: t1, kind: 'in_bed' });
    if (s.stages?.length) for (const st of s.stages) segs.push({ start: Date.parse(st.startTime), end: Date.parse(st.endTime), kind: STAGE[st.stage] ?? 'asleep' });
    else segs.push({ start: t0, end: t1, kind: 'asleep' });
  }
  const hrs = (hr?.records ?? []).flatMap((r) => r.samples.map((x) => ({ t: Date.parse(x.time), bpm: x.beatsPerMinute })));
  const hrvVals = (hrv?.records ?? []).map((r) => r.heartRateVariabilityMillis);
  const hrvAvg = avg(hrvVals);
  return {
    day,
    steps: steps ? Math.round(steps.COUNT_TOTAL) : null,
    active_kcal: kcal ? Math.round(kcal.ACTIVE_CALORIES_TOTAL.inKilocalories) : null,
    distance_m: dist ? Math.round(dist.DISTANCE.inMeters) : null,
    resting_hr: rhr && rhr.BPM_AVG ? rhr.BPM_AVG : null,
    hrv_ms: hrvAvg == null ? null : Math.round(hrvAvg * 10) / 10,
    avg_hr: avg(hrs.map((h) => h.bpm)),
    hr_zone_min: hrs.length > 20 ? hrZoneMinutes(hrs, age) : null,
    sleep: summarizeSleep(segs),
    resp_rate: round1(avg((resp?.records ?? []).map((r) => r.rate))),
    spo2: round1(avg((spo2?.records ?? []).map((r) => r.percentage))),
    // Health Connect يعطي فرق الحرارة عن خط أساس الجهاز → نجمعه مع الأساس لو موجود
    skin_temp: (() => {
      const vals = (temp?.records ?? []).flatMap((r) => r.deltas.map((d) => (r.baseline?.inCelsius ?? 0) + d.delta.inCelsius));
      const a = avg(vals);
      return a == null ? null : Math.round(a * 100) / 100;
    })(),
    vo2max: (() => {
      const recs = [...(vo2?.records ?? [])].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
      return recs.length ? round1(recs[0].vo2MillilitersPerMinuteKilogram) : null;
    })(),
    hr_series: hrs,
    source: 'health_connect',
  };
}

async function grantedSet() {
  const g = await safe(getGrantedPermissions());
  return new Set((g ?? []).filter((p) => 'recordType' in p && p.accessType === 'read').map((p) => (p as Permission).recordType as string));
}

export const provider: HealthProvider = {
  id: 'health_connect',
  readVersion: 2,
  async isAvailable() {
    const s = await safe(getSdkStatus());
    return s === SdkAvailabilityStatus.SDK_AVAILABLE;
  },
  async requestAccess() {
    if (!(await init())) return false;
    const res = await safe(requestPermission(PERMS));
    return !!res && res.length > 0;
  },
  async readDays(n, age) {
    if (!(await init())) return [];
    const granted = await grantedSet();
    const out: DailyHealth[] = [];
    for (const d of lastDays(n)) out.push(await readDay(d, age, granted));
    out.forEach((d, i) => { if (i < out.length - 1) d.hr_series = null; });
    return out;
  },
  openSettings: () => openHealthConnectSettings(),
};
