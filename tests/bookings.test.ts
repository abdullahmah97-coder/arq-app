// حجز الملاعب والحصص: أوقات الملعب لليوم (مع بعد ١٢ الليل)، التعارض، نصوص الوقت، والحجز الجاي
// التشغيل: npx esbuild@0.25 tests/bookings.test.ts --bundle --platform=node --outfile=node_modules/.cache/bookings.test.js && node node_modules/.cache/bookings.test.js
import {
  bookableInApp, clockLabel, dayLabel, daySlots, hoursLabel, isCourtSport, nextBooking, nextDays, overlaps, riyadhDate, riyadhMinute, tooSoon, whenLabel,
} from '../src/lib/bookingsCore';

let failed = 0;
const ok = (c: boolean, label: string) => { console.log(c ? 'ok  ' : 'FAIL', label); if (!c) { failed++; process.exitCode = 1; } };
const eq = <T,>(a: T, b: T, label: string) => ok(a === b, `${label}${a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);

// أوقات اليوم: ٤ العصر لين ٢ الفجر، كل ساعة
const s = daySlots({ open_hour: 16, close_hour: 26, slot_min: 60 }, '2026-10-01');
eq(s.length, 10, '10 hourly slots from 4pm to 2am');
eq(s[0].start, '2026-10-01T13:00:00.000Z', 'first slot 4pm Riyadh');
eq(s[9].start, '2026-10-01T22:00:00.000Z', 'last slot 1am Riyadh (next calendar day)');
ok(s[9].nextDay && !s[7].nextDay, 'slots after midnight are marked');
eq(daySlots({ open_hour: 16, close_hour: 24, slot_min: 90 }, '2026-10-01').map((x) => clockLabel(x.minute, 'ar')).join(' | '),
  '4:00 م | 5:30 م | 7:00 م | 8:30 م | 10:00 م', '90-minute slots that fit before closing');
eq(daySlots({ open_hour: 16, close_hour: 16, slot_min: 60 }, '2026-10-01').length, 0, 'bad hours → no slots');

// التعارض
ok(overlaps({ start: '2026-10-01T13:00:00Z', end: '2026-10-01T14:00:00Z' }, { starts_at: '2026-10-01T13:30:00Z', ends_at: '2026-10-01T15:00:00Z' }), 'overlap');
ok(!overlaps({ start: '2026-10-01T13:00:00Z', end: '2026-10-01T14:00:00Z' }, { starts_at: '2026-10-01T14:00:00Z', ends_at: '2026-10-01T15:00:00Z' }), 'back-to-back is fine');

// قريب مرة
const now = Date.parse('2026-10-01T12:55:00Z');
ok(tooSoon('2026-10-01T13:00:00Z', now) && !tooSoon('2026-10-01T13:10:00Z', now), 'less than 10 minutes away is too soon');

// الأيام والنصوص
eq(nextDays(3, '2026-12-31').join(','), '2026-12-31,2027-01-01,2027-01-02', 'next days across the new year');
eq(dayLabel('2026-10-01', 'ar', '2026-10-01').top, 'اليوم', 'today');
eq(dayLabel('2026-10-02', 'ar', '2026-10-01').top, 'بكرة', 'tomorrow');
const th = dayLabel('2026-10-08', 'ar', '2026-10-01');
eq(`${th.top} ${th.bottom}`, 'الخميس 8/10', 'weekday and date');
eq(clockLabel(0, 'ar'), '12:00 ص', 'midnight');
eq(clockLabel(12 * 60, 'en'), '12:00 PM', 'noon');
eq(clockLabel(25 * 60 + 30, 'ar'), '1:30 ص', 'after midnight wraps');
eq(hoursLabel({ open_hour: 16, close_hour: 26, slot_min: 60 }, 'ar'), '4:00 م – 2:00 ص', 'opening hours label');
eq(riyadhMinute('2026-10-01T17:30:00Z'), 20 * 60 + 30, 'Riyadh minute');
eq(riyadhDate('2026-10-01T22:30:00Z'), '2026-10-02', 'Riyadh date after 9pm UTC');
eq(whenLabel('2026-10-01T17:00:00Z', 'ar', '2026-10-01'), 'اليوم · 8:00 م', 'today at 8pm');
eq(whenLabel('2026-10-08T17:00:00Z', 'en', '2026-10-01'), 'Thu 8/10 · 8:00 PM', 'next week in English');

// الحجز الجاي
const rows = [
  { id: 'a', status: 'confirmed' as const, starts_at: '2026-10-03T17:00:00Z' },
  { id: 'b', status: 'pending' as const, starts_at: '2026-10-02T17:00:00Z' },
  { id: 'c', status: 'cancelled' as const, starts_at: '2026-10-01T18:00:00Z' },
  { id: 'd', status: 'confirmed' as const, starts_at: '2026-09-30T17:00:00Z' },
];
eq(nextBooking(rows, now)?.id, 'b', 'nearest active upcoming booking');
eq(nextBooking([rows[2], rows[3]], now), null, 'cancelled and past are ignored');

// أنواع الحجز
ok(isCourtSport('padel') && isCourtSport('football') && !isCourtSport('yoga'), 'court vs class sports');
ok(bookableInApp({ listed_by: 'owner', status: 'approved' }) && !bookableInApp({ listed_by: 'arq', status: 'approved' }) && !bookableInApp({ listed_by: 'owner', status: 'pending' }),
  'in-app booking only for approved partner venues');

console.log(failed ? `\n${failed} failed` : '\nall passed');
