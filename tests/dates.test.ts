// timeAgo بدون Intl.RelativeTimeFormat (غير موجود في Hermes)
import assert from 'node:assert/strict';
import { timeAgo } from '../src/lib/dates.ts';

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
