// «صباح الخير ☀️» و«تصبحون على خير 🌙» في التايم لاين، مدة التمرين، ونصوص الوقت
import assert from 'node:assert/strict';
import { REACTION_EMOJI, isReaction, normalizeReactors, withReaction, type Reactable } from '../src/lib/reactionsCore.ts';
import {
  alarmRangToday, clockOf, dateLine, dayOf, durationText, greetingOf, localDayKey, stableIndex, trainedMinutes, wakeMoment, wakePlan,
} from '../src/lib/wakeCore.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };
// الأربعاء ٣٠ سبتمبر ٢٠٢٦ (getDay = 3) بالتوقيت المحلي
const at = (h: number, m = 0, day = 30) => new Date(2026, 8, day, h, m, 0, 0);
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
  assert.equal(alarmRangToday(at(6, 0), alarm), null, 'not rung yet');
});

test('an alarm set before 3 AM is not used as a wake time', () => {
  assert.equal(wakeMoment(at(9, 0), { ...alarm, wakeMin: 2 * 60 })?.src, 'open');
});

test('plan without a good night: once a day in the morning', () => {
  assert.equal(wakePlan(at(8, 0), null, null, false)?.afterSleep, false);
  assert.equal(wakePlan(at(8, 0), null, null, true), null, 'already posted today');
  assert.equal(wakePlan(at(16, 0), null, null, false), null, 'afternoon without a good night → nothing');
});

test('plan after «good night»: first open 2h+ later, any hour except midnight–3', () => {
  const slept = at(23, 30, 29);
  assert.equal(wakePlan(at(0, 45), null, slept, false), null, 'still in bed (1h15)');
  assert.equal(wakePlan(at(2, 30), null, slept, false), null, '2:30 AM — probably up for a moment');
  const p = wakePlan(at(6, 50), null, slept, true)!;
  assert.ok(p && p.afterSleep && p.src === 'open' && p.at.getTime() === at(6, 50).getTime(), 'posts even if a morning post was already marked');
  const a = wakePlan(at(8, 10), alarm, slept, false)!;
  assert.equal(a.src, 'alarm');
  assert.equal(a.at.getHours(), 6);
  // قيلولة: ينام ٢:٥٢ العصر ويفتح ٩:١٤ الليل
  const nap = wakePlan(at(21, 14), alarm, at(14, 52), true)!;
  assert.ok(nap.afterSleep && nap.src === 'open', 'the alarm rang before the nap → use the open time');
  assert.equal(wakePlan(at(21, 14), null, at(0, 30, 29), true), null, 'a good night older than 20h is over');
});

test('trained minutes from a check-in', () => {
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', '2026-09-30T06:15:00Z'), 75);
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', null), null, 'still at the gym');
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', '2026-09-30T05:03:00Z'), null, 'too short to count');
  assert.equal(trainedMinutes('2026-09-30T05:00:00Z', '2026-09-30T13:00:00Z'), null, 'forgot to check out');
});

test('durations in Arabic and English', () => {
  assert.equal(durationText(435, 'ar'), '7 ساعات و15 د');
  assert.equal(durationText(120, 'ar'), 'ساعتين');
  assert.equal(durationText(75, 'ar'), 'ساعة و15 د');
  assert.equal(durationText(40, 'ar'), '40 د');
  assert.equal(durationText(660, 'ar'), '11 ساعة');
  assert.equal(durationText(435, 'en'), '7h 15m');
  assert.equal(durationText(120, 'en'), '2h');
  assert.equal(durationText(40, 'en'), '40m');
});

test('clock, day and date labels (no Intl)', () => {
  assert.equal(clockOf(at(6, 5), 'ar'), '6:05 ص');
  assert.equal(clockOf(at(21, 14), 'en'), '9:14 PM');
  assert.equal(clockOf(at(0, 0), 'en'), '12:00 AM');
  assert.equal(clockOf(at(12, 30), 'ar'), '12:30 م');
  assert.equal(dayOf(at(1).toISOString(), at(23)), 'today');
  assert.equal(dayOf(at(23, 0, 29).toISOString(), at(7)), 'yesterday');
  assert.equal(dayOf(at(10, 0, 27).toISOString(), at(7)), 'older');
  assert.equal(dateLine(at(9), 'ar'), 'الأربعاء 30 سبتمبر');
  assert.equal(dateLine(at(9), 'en'), 'Wednesday, Sep 30');
  assert.equal(greetingOf(at(7)), 'morning');
  assert.equal(greetingOf(at(13)), 'afternoon');
  assert.equal(greetingOf(at(19)), 'evening');
  assert.equal(greetingOf(at(1)), 'late');
});

test('the good-night line is the same for everyone who sees it', () => {
  const i = stableIndex('9f1c2d3e-aaaa-4bbb-8ccc-123456789abc', 5);
  assert.ok(i >= 0 && i < 5);
  assert.equal(stableIndex('9f1c2d3e-aaaa-4bbb-8ccc-123456789abc', 5), i);
});

test('local day key', () => {
  assert.equal(localDayKey(at(7)), '2026-09-30');
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

// ---------- التفاعل بالإيموجي ----------
const me = { id: 'me', name: 'عبدالله', avatar: null };
const base: Reactable = { like_count: 2, my_reaction: null, reactors: [{ u: 'f1', n: 'فيصل', a: null, e: 'fire' }, { u: 'f2', n: 'سارة', a: null, e: 'love' }] };

test('reacting adds me first and counts once', () => {
  const r = withReaction(base, me, 'strong');
  assert.equal(r.like_count, 3);
  assert.equal(r.my_reaction, 'strong');
  assert.deepEqual(r.reactors.map((x) => x.u), ['me', 'f1', 'f2']);
});

test('changing my reaction keeps the count', () => {
  const r = withReaction(withReaction(base, me, 'strong'), me, 'laugh');
  assert.equal(r.like_count, 3);
  assert.equal(r.reactors[0].e, 'laugh');
  assert.equal(r.reactors.filter((x) => x.u === 'me').length, 1);
});

test('removing my reaction', () => {
  const r = withReaction(withReaction(base, me, 'clap'), me, null);
  assert.equal(r.like_count, 2);
  assert.equal(r.my_reaction, null);
  assert.ok(!r.reactors.some((x) => x.u === 'me'));
  assert.equal(withReaction({ ...base, like_count: 0, reactors: [] }, me, null).like_count, 0, 'never below zero');
});

test('at most 6 faces kept', () => {
  const many: Reactable = { like_count: 6, my_reaction: null, reactors: Array.from({ length: 6 }, (_, i) => ({ u: `u${i}`, n: `${i}`, a: null, e: 'love' as const })) };
  assert.equal(withReaction(many, me, 'fire').reactors.length, 6);
});

test('server rows are cleaned (unknown emoji dropped)', () => {
  assert.deepEqual(normalizeReactors([{ u: 'a', n: 'A', a: 'x.jpg', e: 'fire' }, { u: 'b', n: 'B', e: 'poop' }, null, 'x']), [{ u: 'a', n: 'A', a: 'x.jpg', e: 'fire' }]);
  assert.deepEqual(normalizeReactors(null), []);
  assert.ok(isReaction('clap') && !isReaction('like'));
  assert.equal(REACTION_EMOJI.strong, '💪');
});

console.log(`\n${passed} wake + reaction tests passed`);
