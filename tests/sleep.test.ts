// حاسبة النوم: وقت النوم، دورات النوم، التذكير في اليوم الصح، وتنظيف الإعدادات المحفوظة
import assert from 'node:assert/strict';
import {
  bedtimeFor, bedtimeReminders, bestCycle, cycleBedtimes, DEFAULT_NEED_MIN, DEFAULT_SLEEP, fmtDuration, fmtHm, isNightWindow,
  nextWake, parseHm, sanitizeSleep, sleepNeed, wakeTimesFrom,
} from '../src/lib/sleep/core.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };

test('parse and format times', () => {
  assert.equal(parseHm('07:00'), 420);
  assert.equal(parseHm('7:05'), 425);
  assert.equal(parseHm('24:00'), null);
  assert.equal(parseHm('7'), null);
  assert.equal(fmtHm(425), '07:05');
  assert.equal(fmtHm(-30), '23:30');
  assert.equal(fmtHm(1440 + 60), '01:00');
  assert.equal(fmtDuration(465), '7:45');
});

test('bedtime: wake 7:00 with an 8h need → in bed by 22:45', () => {
  assert.equal(fmtHm(bedtimeFor(420, 480)), '22:45');
  assert.equal(fmtHm(bedtimeFor(420, 465)), '23:00');
  assert.equal(fmtHm(bedtimeFor(30, 480)), '16:15'); // صحيان بعد نص الليل
});

test('sleep need from the watch is used only when it is realistic', () => {
  assert.equal(sleepNeed(465), 465);
  assert.equal(sleepNeed(null), DEFAULT_NEED_MIN);
  assert.equal(sleepNeed(200), DEFAULT_NEED_MIN);
  assert.equal(sleepNeed(900), DEFAULT_NEED_MIN);
});

test('cycle bedtimes: wake 7:00 → 21:45 (6), 23:15 (5), 00:45 (4)', () => {
  const c = cycleBedtimes(420);
  assert.deepEqual(c.map((x) => fmtHm(x.at)), ['21:45', '23:15', '00:45']);
  assert.deepEqual(c.map((x) => x.sleepMin), [540, 450, 360]);
  assert.equal(bestCycle(c, 465)!.cycles, 5, '7h45 need → 5 cycles (7h30)');
  assert.equal(bestCycle(c, 540)!.cycles, 6);
  assert.equal(bestCycle([], 480), null);
});

test('sleep now at 01:40 → wake 07:55 / 09:25 / 10:55 is the 6-cycle option', () => {
  const w = wakeTimesFrom(100);
  assert.deepEqual(w.map((x) => fmtHm(x.at)), ['07:55', '09:25', '10:55']);
});

test('night window: from 2h before bedtime until wake, across midnight', () => {
  const bed = 22 * 60 + 45; const wake = 420;
  assert.equal(isNightWindow(21 * 60, bed, wake), true);
  assert.equal(isNightWindow(100, bed, wake), true);
  assert.equal(isNightWindow(420, bed, wake), false);
  assert.equal(isNightWindow(12 * 60, bed, wake), false);
  // نوم نهاري (عمل ليلي): النافذة ما تعدّي نص الليل
  assert.equal(isNightWindow(9 * 60, 10 * 60, 18 * 60), true);
  assert.equal(isNightWindow(19 * 60, 10 * 60, 18 * 60), false);
});

test('next wake respects the chosen days', () => {
  const wed0100 = new Date(2026, 8, 30, 1, 0); // الأربعاء ١:٠٠ الفجر
  assert.equal(nextWake(wed0100, 420, [0, 1, 2, 3, 4, 5, 6])!.getDate(), 30, 'same morning');
  const wed0800 = new Date(2026, 8, 30, 8, 0);
  const n = nextWake(wed0800, 420, [0, 1, 2, 3, 4])!; // الأحد–الخميس
  assert.equal(n.getDay(), 4); assert.equal(n.getHours(), 7);
  const fri = nextWake(wed0800, 420, [0])!; // الأحد بس
  assert.equal(fri.getDay(), 0);
  assert.equal(nextWake(wed0800, 420, []), null);
});

test('bedtime reminder lands on the evening before the wake day', () => {
  // صحيان ٧:٠٠ الأحد والإثنين، احتياج ٨ ساعات، تذكير قبل ٣٠ دقيقة → ٢٢:١٥ السبت والأحد
  const r = bedtimeReminders(420, 480, [0, 1], 30);
  assert.deepEqual(r.map(([d, m]) => [d, fmtHm(m)]), [[0, '22:15'], [6, '22:15']]);
  // صحيان ١٢:٠٠ الظهر → التذكير في نفس اليوم ٣:١٥ الفجر
  assert.deepEqual(bedtimeReminders(720, 480, [3], 30).map(([d, m]) => [d, fmtHm(m)]), [[3, '03:15']]);
});

test('saved settings are cleaned', () => {
  assert.deepEqual(sanitizeSleep(null), DEFAULT_SLEEP);
  assert.deepEqual(sanitizeSleep({ wake: '6:30', days: [5, 1, 1, 9, 'x'], alarm: true, remind: 'yes', remindBefore: 17 }),
    { wake: '06:30', days: [1, 5], alarm: true, remind: false, remindBefore: 30 });
  assert.equal(sanitizeSleep({ wake: '25:00' }).wake, '07:00');
  assert.deepEqual(sanitizeSleep({ days: [] }).days, DEFAULT_SLEEP.days, 'no days → every day');
});

console.log(`\n${passed} sleep tests passed`);
