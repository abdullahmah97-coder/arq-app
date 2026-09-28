// اختبار محرك الجاهزية/الإجهاد/النوم: node --experimental-strip-types tests/health.test.ts
import { adaptWorkout, dayLoad, recoveryZone, scoreDay, sleepNeed, strainFromLoad } from '../src/lib/health/score.ts';
import { hrZoneMinutes, mergedMinutes, summarizeSleep } from '../src/lib/health/aggregate.ts';
import { dashboardRows, fitnessAge, healthMonitor, stressSeries, stressSummary } from '../src/lib/health/insights.ts';
import type { DailyHealth } from '../src/lib/health/types.ts';
import type { PlanDay } from '../src/lib/plan/types.ts';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const day = (i: number, o: Partial<DailyHealth> = {}): DailyHealth => ({
  day: `2026-09-${String(i).padStart(2, '0')}`, steps: 8000, active_kcal: 450, resting_hr: 56, hrv_ms: 60,
  sleep: { start: '', end: '', in_bed_min: 480, asleep_min: 440, stages: { deep: 80, rem: 100, light: 260, awake: 40 } },
  source: 'apple_health', ...o,
});
const hist = Array.from({ length: 14 }, (_, i) => day(i + 1, { hrv_ms: 58 + (i % 5), resting_hr: 55 + (i % 3) }));

// المقاييس الأساسية
ok(strainFromLoad(0) === 0, 'strain 0 at rest');
ok(strainFromLoad(100) > 9 && strainFromLoad(100) < 11, `moderate load ~10 (${strainFromLoad(100)})`);
ok(strainFromLoad(5000) <= 21, 'strain capped at 21');
ok(dayLoad(day(1, { hr_zone_min: [30, 20, 10, 0, 0] })) === 30 + 40 + 30, 'TRIMP from HR zones');
ok(dayLoad(day(1, { active_kcal: null, steps: 15000 })) === 100, 'load from steps when no kcal');
ok(recoveryZone(80) === 'green' && recoveryZone(50) === 'yellow' && recoveryZone(20) === 'red', 'zones');
ok(sleepNeed(0, []) === 450, 'base sleep need 7.5h');
ok(sleepNeed(21, [{ asleep_min: 300 }, { asleep_min: 300 }, { asleep_min: 300 }]) === 450 + 60 + 60, 'need grows with strain + debt (capped)');

// يوم جيد: HRV أعلى من الأساس ونبض أقل ونوم كامل → أخضر
const good = scoreDay(day(15, { hrv_ms: 75, resting_hr: 51, sleep: { start: '', end: '', in_bed_min: 500, asleep_min: 470 } }), hist);
ok(good.zone === 'green' && good.recovery! >= 67, `good day green (${good.recovery})`);
ok(good.baseline.hrv_ms === 60, `hrv baseline median (${good.baseline.hrv_ms})`);
ok(good.strain_target[0] === 14, 'green target 14-18');

// يوم سيئ: HRV منخفض ونبض مرتفع ونوم قليل → أحمر
const bad = scoreDay(day(15, { hrv_ms: 38, resting_hr: 66, sleep: { start: '', end: '', in_bed_min: 330, asleep_min: 270 } }), hist);
ok(bad.zone === 'red' && bad.recovery! < 34, `bad day red (${bad.recovery})`);

// بدون ساعة (خطوات فقط): لا جاهزية
const phoneOnly = scoreDay({ day: '2026-09-15', steps: 6000, active_kcal: null, resting_hr: null, hrv_ms: null, sleep: null, source: 'pedometer' }, []);
ok(phoneOnly.recovery === null && phoneOnly.zone === null && phoneOnly.strain > 0, 'phone-only: strain yes, recovery none');

// نوم بدون مؤشرات قلبية → جاهزية محصورة
const sleepOnly = scoreDay(day(15, { hrv_ms: null, resting_hr: null }), hist.map((h) => ({ ...h, hrv_ms: null, resting_hr: null })));
ok(sleepOnly.recovery! <= 85 && sleepOnly.recovery! >= 20, `sleep-only bounded (${sleepOnly.recovery})`);

// أيام قليلة: لا خط أساس
const early = scoreDay(day(3), hist.slice(0, 2));
ok(early.baseline.hrv_ms === null && early.components.hrv === null, 'no baseline with < 4 days');

// تعديل التمرين
const plan: PlanDay = {
  day: 1, rest: false, focus: { ar: 'صدر', en: 'Chest' },
  exercises: [
    { name: { ar: 'بنش', en: 'Bench' }, sets: 4, reps: '8', rest_sec: 90 },
    { name: { ar: 'دمبل', en: 'DB' }, sets: 3, reps: '10', rest_sec: 75 },
    { name: { ar: 'تفتيح', en: 'Fly' }, sets: 3, reps: '12', rest_sec: 60 },
  ],
  cardio: { ar: 'HIIT', en: 'HIIT' },
};
const r = adaptWorkout(plan, 'red');
ok(r.changed && r.day.exercises[0].sets === 3 && r.day.exercises.every((e) => e.sets >= 2) && !!r.day.cardio?.en.includes('zone 2'), 'red: lighter + zone 2');
const y = adaptWorkout(plan, 'yellow');
ok(y.day.exercises[0].sets === 4 && y.day.exercises[2].sets === 2, 'yellow: trims accessories only');
ok(!adaptWorkout(plan, 'green').changed && !adaptWorkout({ ...plan, rest: true }, 'red').changed, 'green/rest untouched');
ok(plan.exercises[0].sets === 4, 'original plan not mutated');

// تجميع النوم والنبض (الساعة + الجوال قد يكرران نفس الفترة)
const M = 60_000, t0 = Date.UTC(2026, 8, 14, 21, 0);
ok(mergedMinutes([{ start: t0, end: t0 + 60 * M }, { start: t0 + 30 * M, end: t0 + 90 * M }, { start: t0 + 120 * M, end: t0 + 130 * M }]) === 100, 'merge overlapping intervals');
const night = summarizeSleep([
  { start: t0, end: t0 + 480 * M, kind: 'in_bed' },
  { start: t0 + 10 * M, end: t0 + 460 * M, kind: 'asleep' },          // iPhone (بدون مراحل)
  { start: t0 + 10 * M, end: t0 + 110 * M, kind: 'light' },           // Apple Watch (مراحل)
  { start: t0 + 110 * M, end: t0 + 200 * M, kind: 'deep' },
  { start: t0 + 200 * M, end: t0 + 215 * M, kind: 'awake' },
  { start: t0 + 215 * M, end: t0 + 320 * M, kind: 'rem' },
  { start: t0 + 320 * M, end: t0 + 460 * M, kind: 'light' },
]);
ok(!!night && night.asleep_min === 435 && night.stages!.deep === 90 && night.stages!.rem === 105 && night.in_bed_min === 480, `staged sleep preferred over unstaged (${JSON.stringify(night)})`);
ok(summarizeSleep([]) === null, 'no sleep → null');
const hrS = Array.from({ length: 61 }, (_, i) => ({ t: t0 + i * M, bpm: i < 30 ? 100 : 160 }));
const z = hrZoneMinutes(hrS, 30); // max 190 → z1≥95, z4≥152
ok(z[0] === 29 && z[1] === 1 && z[3] === 30 && z.reduce((a, b) => a + b) === 60, `hr zones ${z}`);

// ---------------- مؤشرات إضافية من الساعة
// التوتر: راحة (60) → منخفض، 85 → متوسط، 100 → عالي، 140 → تمرين (مستبعد)
const T0 = Date.UTC(2026, 8, 28, 9, 0);
const hrDay = [...Array(6)].map((_, i) => ({ t: T0 + i * 2 * M, bpm: 62 }))
  .concat([...Array(6)].map((_, i) => ({ t: T0 + 10 * M + i * 2 * M, bpm: 86 })))
  .concat([...Array(6)].map((_, i) => ({ t: T0 + 20 * M + i * 2 * M, bpm: 100 })))
  .concat([...Array(6)].map((_, i) => ({ t: T0 + 30 * M + i * 2 * M, bpm: 150 })));
const ser = stressSeries(hrDay, { restingHr: 60, age: 30, dayStart: T0 });
ok(ser.length === 5 && ser[0].v! < 1 && ser[1].v! >= 1 && ser[1].v! < 2 && ser[2].v! >= 2 && ser[3].v === null && ser[3].activity,
  `stress levels low/medium/high/activity ${JSON.stringify(ser.map((p) => [p.v, p.activity]))}`);
const sum = stressSummary(ser);
ok(sum.current === ser[2].v && sum.level === 'high' && sum.highMin === 10, `stress summary ${JSON.stringify(sum)}`);
const asleepSer = stressSeries(hrDay, { restingHr: 60, age: 30, dayStart: T0, sleep: { start: new Date(T0).toISOString(), end: new Date(T0 + 50 * M).toISOString() } });
ok(asleepSer.every((p) => p.asleep) && stressSummary(asleepSer).highMin === 0, 'sleep time is not counted as stress');
ok(stressSeries([], { restingHr: 60, age: 30 }).length === 0, 'no heart data → no stress chart');

// مراقبة الصحة: يتعاير أول ٤ ليالي، بعدها يقارن بالمعدل الشخصي
const nights = Array.from({ length: 10 }, (_, i) => day(i + 1, { resp_rate: 14 + (i % 2) * 0.4, spo2: 97, skin_temp: 34.5, hrv_ms: 60 + (i % 3), resting_hr: 56 }));
const mon = healthMonitor(day(11, { resp_rate: 14.3, spo2: 96.8, skin_temp: 34.6, hrv_ms: 61, resting_hr: 57 }), nights);
ok(mon.inRange === 5 && mon.measured === 5 && mon.nightsNeeded === 0, `within range 5/5 ${JSON.stringify(mon.items.map((x) => x.status))}`);
const sick = healthMonitor(day(11, { resp_rate: 17.5, spo2: 97, skin_temp: 35.6, hrv_ms: 40, resting_hr: 66 }), nights);
ok(sick.inRange === 1 && sick.items.find((x) => x.key === 'temp')!.status === 'out', `out of range flagged ${JSON.stringify(sick.items.map((x) => [x.key, x.status]))}`);
const fresh = healthMonitor(day(3, { resp_rate: 14 }), nights.slice(0, 2));
ok(fresh.nightsNeeded === 2 && fresh.items.find((x) => x.key === 'resp')!.status === 'calibrating', 'calibrating until 4 nights');

// لوحتي: اليوم مقابل المعدل
const scored = nights.map((d, i) => ({ day: d, scores: scoreDay(d, nights.slice(0, i)) }));
const rows = dashboardRows([...scored, { day: day(11, { hrv_ms: 70, steps: 12000, resting_hr: 52, hr_zone_min: [30, 10, 5, 2, 0] }), scores: scoreDay(day(11), nights) }]);
const hrvRow = rows.find((r) => r.key === 'hrv')!;
ok(hrvRow.value === 70 && Math.round(hrvRow.base!) === 61 && hrvRow.trend === 'up', `hrv vs 30-day average ${JSON.stringify(hrvRow)}`);
ok(rows.find((r) => r.key === 'rhr')!.trend === 'down' && rows.find((r) => r.key === 'steps')!.value === 12000, 'resting HR down, steps today');
ok(rows.find((r) => r.key === 'restorative_h')!.value === 180 && rows.find((r) => r.key === 'zones13')!.value === 45, 'restorative sleep and weekly zones');
ok(!rows.some((r) => r.key === 'vo2max'), 'hidden when the watch has no data');

// العمر الرياضي
const fitHist = Array.from({ length: 10 }, (_, i) => day(i + 1, { vo2max: 45, resting_hr: 55 }));
const fa = fitnessAge(fitHist, { age: 35, gender: 'male' });
ok(!!fa && fa.basis === 'vo2max' && fa.age < 35 && fa.diff < 0, `good VO2 max → younger (${JSON.stringify(fa)})`);
const faLow = fitnessAge(Array.from({ length: 10 }, (_, i) => day(i + 1, { resting_hr: 78, steps: 2500 })), { age: 35, gender: 'male' });
ok(!!faLow && faLow.basis === 'vitals' && faLow.diff > 0 && faLow.age <= 50, `high resting HR + few steps → older, capped (${JSON.stringify(faLow)})`);
ok(fitnessAge(fitHist, { age: null, gender: null }) === null, 'no birth year → no estimate');

console.log(fail ? `\n${fail} FAILED` : '\nALL HEALTH TESTS PASSED');
if (fail) process.exit(1);
