// timeAgo بدون Intl.RelativeTimeFormat (غير موجود في Hermes)، وتواريخ اليوم والشهر بتوقيت الجهاز
import assert from 'node:assert/strict';
import { monthStartIso, timeAgo, todayIso } from '../src/lib/dates.ts';

// بعد نص الليل بتوقيت الجهاز (قبل ٣ الفجر في السعودية كان التاريخ يرجع يوم/شهر لورا)
{
  const early = new Date(2026, 9, 3, 2, 28); // ٣ أكتوبر ٢:٢٨ الفجر بتوقيت الجهاز
  assert.equal(monthStartIso(0, early), '2026-10-01');
  assert.equal(monthStartIso(-1, early), '2026-09-01');
  assert.equal(monthStartIso(-2, early), '2026-08-01');
  assert.equal(monthStartIso(0, new Date(2026, 9, 1, 0, 5)), '2026-10-01');
  assert.equal(monthStartIso(-1, new Date(2026, 0, 15, 1, 0)), '2025-12-01');
  assert.equal(monthStartIso(-1, new Date(2026, 2, 31, 23, 50)), '2026-02-01');
  assert.equal(todayIso(0, early), '2026-10-03');
  assert.equal(todayIso(7, early), '2026-10-10');
  assert.equal(todayIso(30, new Date(2026, 11, 15, 0, 30)), '2027-01-14');
  assert.equal(todayIso(0, new Date(2026, 9, 31, 23, 59)), '2026-10-31');
}

const now = Date.parse('2026-09-28T16:00:00Z');
const ago = (s: number) => new Date(now - s * 1000).toISOString();

// نتأكد إنها ما تعتمد على RelativeTimeFormat
const saved = (Intl as any).RelativeTimeFormat;
delete (Intl as any).RelativeTimeFormat;
try {
  assert.equal(timeAgo(ago(10), 'ar', now), 'الآن');
  assert.equal(timeAgo(ago(10), 'en', now), 'just now');
  assert.equal(timeAgo(ago(60), 'ar', now), 'قبل دقيقة');
  assert.equal(timeAgo(ago(120), 'ar', now), 'قبل دقيقتين');
  assert.equal(timeAgo(ago(5 * 60), 'ar', now), 'قبل 5 دقائق');
  assert.equal(timeAgo(ago(25 * 60), 'ar', now), 'قبل 25 دقيقة');
  assert.equal(timeAgo(ago(3600), 'ar', now), 'قبل ساعة');
  assert.equal(timeAgo(ago(2 * 3600), 'ar', now), 'قبل ساعتين');
  assert.equal(timeAgo(ago(7 * 3600), 'ar', now), 'قبل 7 ساعات');
  assert.equal(timeAgo(ago(86400), 'ar', now), 'أمس');
  assert.equal(timeAgo(ago(3 * 86400), 'ar', now), 'قبل 3 أيام');
  assert.equal(timeAgo(ago(5 * 60), 'en', now), '5 min ago');
  assert.equal(timeAgo(ago(3600), 'en', now), '1 hr ago');
  assert.equal(timeAgo(ago(86400), 'en', now), 'yesterday');
  assert.equal(timeAgo(ago(3 * 86400), 'en', now), '3 days ago');
  assert.equal(timeAgo(new Date(now + 2 * 3600 * 1000).toISOString(), 'ar', now), 'بعد ساعتين');
  assert.equal(timeAgo('not a date', 'ar', now), '');
  assert.ok(timeAgo(ago(30 * 86400), 'en', now).length > 0);
} finally {
  (Intl as any).RelativeTimeFormat = saved;
}
console.log('dates: ok');
