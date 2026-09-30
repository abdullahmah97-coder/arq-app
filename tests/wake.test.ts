// «صحى ☀️» في التايم لاين ومدة التمرين في بطاقة الحضور
import assert from 'node:assert/strict';
import { localDayKey, trainedMinutes, wakeMoment } from '../src/lib/wakeCore.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };
// الأربعاء ٣٠ سبتمبر ٢٠٢٦ (getDay = 3) بالتوقيت المحلي
const at = (h: number, m = 0) => new Date(2026, 8, 30, h, m, 0, 0);
const alarm = { on: true, wakeMin: 6 * 60 + 30, days: [0, 1, 2, 3, 4] };

test('only in the morning window (3:00 – 13:59)', () => {
  assert.equal(wakeMoment(at(2, 59), null), null);
  assert.equal(wakeMoment(at(14, 0), null), null);
  assert.equal(wakeMoment(at(3, 0), null)?.src, 'open');
  assert.equal(wakeMoment(at(13, 59), null)?.src, 'open');
});

test('the ARQ alarm rang today → its time', () => {
  const m = wakeMoment(at(8, 10), alarm)!;
  assert.equal(m.src, 'alarm');
  assert.equal(m.at.getHours(), 6);
  assert.equal(m.at.getMinutes(), 30);
});

test('opened before the alarm, alarm off, or not an alarm day → the opening time («good morning»)', () => {
  assert.deepEqual(wakeMoment(at(5, 45), alarm), { at: at(5, 45), src: 'open' });
  assert.equal(wakeMoment(at(8, 0), { ...alarm, on: false })?.src, 'open');
  assert.equal(wakeMoment(at(8, 0), { ...alarm, days: [5, 6] })?.src, 'open');
  assert.equal(wakeMoment(at(8, 0), { ...alarm, wakeMin: null })?.src, 'open');
});

test('an alarm set before 3 AM is not used as a wake time', () => {
  assert.equal(wakeMoment(at(9, 0), { ...alarm, wakeMin: 2 * 60 })?.src, 'open');
});

test('trained minutes from a check-in', () => {
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', '2026-09-30T06:15:00Z'), 75);
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', null), null, 'still at the gym');
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', '2026-09-30T05:03:00Z'), null, 'too short to count');
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', '2026-09-30T13:00:00Z'), null, 'forgot to check out');
});

test('local day key', () => {
  assert.equal(localDayKey(at(7)), '2026-09-30');
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

console.log(`\n${passed} wake tests passed`);
