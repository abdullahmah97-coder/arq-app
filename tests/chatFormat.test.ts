// المحادثات: اتجاه النص (مكان الوقت داخل الفقاعة)، فواصل الأيام، ووقت آخر رسالة في الصندوق
import assert from 'node:assert/strict';
import { dayKey, dayLabel, daysAgo, inboxTime, msgTime, textIsRTL } from '../src/lib/chatFormat.ts';

process.env.TZ = 'Asia/Riyadh';
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };
const t = (k: string) => ({ 'chat.today': 'اليوم', 'chat.yesterday': 'أمس' } as Record<string, string>)[k] ?? k;
// الأربعاء ٣٠ سبتمبر ٢٠٢٦، ١٠:٣٠ مساءً بتوقيت الرياض
const now = new Date('2026-09-30T19:30:00Z');
const at = (days: number, h = 12) => new Date(Date.UTC(2026, 8, 30 - days, h - 3, 5)).toISOString();

test('paragraph direction comes from the first letter (like the phone)', () => {
  assert.equal(textIsRTL('هلا والله', false), true);
  assert.equal(textIsRTL('ok 👍', true), false);
  assert.equal(textIsRTL('OK تمام', true), false);
  assert.equal(textIsRTL('١٢٣ هلا', false), true, 'digits are skipped');
  assert.equal(textIsRTL('Leg day 🔥', true), false);
});

test('emoji-only or digits-only messages follow the app direction', () => {
  assert.equal(textIsRTL('👍👍', true), true);
  assert.equal(textIsRTL('👍👍', false), false);
  assert.equal(textIsRTL('7:30', true), true);
  assert.equal(textIsRTL('', false), false);
});

test('days ago counts calendar days in local time', () => {
  assert.equal(daysAgo(at(0, 1), now), 0);
  assert.equal(daysAgo(at(1, 23), now), 1);
  assert.equal(daysAgo(at(6), now), 6);
  assert.equal(dayKey(at(0, 1)), dayKey(now));
});

test('day separators: today, yesterday, weekday, then the date', () => {
  assert.equal(dayLabel(at(0), 'ar', t, now), 'اليوم');
  assert.equal(dayLabel(at(1), 'ar', t, now), 'أمس');
  assert.equal(dayLabel(at(3), 'ar', t, now), 'الأحد');
  assert.equal(dayLabel(at(3), 'en', t, now), 'Sunday');
  assert.match(dayLabel(at(20), 'ar', t, now), /10 سبتمبر/);
  assert.match(dayLabel(at(20), 'en', t, now), /September 10/);
  assert.match(dayLabel('2025-12-31T09:00:00Z', 'en', t, now), /2025/, 'another year shows the year');
});

test('a message a few seconds "in the future" (phone clock behind) is still today', () => {
  assert.equal(dayLabel(new Date(now.getTime() + 90 * 60000).toISOString(), 'ar', t, now), 'اليوم');
});

test('inbox time: clock for today, then yesterday, weekday, date', () => {
  assert.match(inboxTime(at(0, 21), 'ar', t, now), /9:05/);
  assert.match(inboxTime(at(0, 21), 'en', t, now), /9:05\sPM/);
  assert.equal(inboxTime(at(1), 'ar', t, now), 'أمس');
  assert.equal(inboxTime(at(4), 'en', t, now), 'Saturday');
  assert.match(inboxTime(at(12), 'en', t, now), /9\/18\/2026/);
  assert.match(inboxTime(at(12), 'ar', t, now), /18\/9\/2026|2026\/9\/18|18‏\/9‏\/2026/);
});

test('message time uses Latin digits in Arabic', () => {
  assert.match(msgTime(at(0, 21), 'ar'), /^9:05/);
});

console.log(`\n${passed} passed`);
