// البطولات والفعاليات: الحالة، الترتيب، الفعالية اللي تطلع في مربع الرئيسية، نص التاريخ، وقت التذكير، وحقل التاريخ في اللوحة
// التشغيل: npx esbuild@0.25 tests/events.test.ts --bundle --platform=node --outfile=node_modules/.cache/events.test.js && node node_modules/.cache/events.test.js
import {
  daysUntil, eventAdminState, eventDateLabel, eventState, nextHighlight, parseEventDate, reminderTime, upcomingEvents, validEventUrl,
  type LocalEvent,
} from '../src/lib/eventsCore';

let failed = 0;
const ok = (c: boolean, label: string) => { console.log(c ? 'ok  ' : 'FAIL', label); if (!c) { failed++; process.exitCode = 1; } };
const eq = <T,>(a: T, b: T, label: string) => ok(a === b, `${label}${a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);

const ev = (p: Partial<LocalEvent> & { id: string }): LocalEvent => ({
  category: 'other', title: p.id, title_en: null, city: null, city_en: null, venue: null, venue_en: null,
  starts_on: null, ends_on: null, date_note: null, date_note_en: null, summary: null, summary_en: null, url: null, image_path: null,
  featured: false, active: true, ...p,
});

const today = '2026-09-29';

// الحالة
eq(eventState(ev({ id: 'a' }), today), 'open', 'no dates → ongoing');
eq(eventState(ev({ id: 'a', starts_on: '2026-10-01', ends_on: '2026-10-10' }), today), 'soon', 'starts later → upcoming');
eq(eventState(ev({ id: 'a', starts_on: '2026-09-20', ends_on: '2026-10-02' }), today), 'now', 'started, not ended → on now');
eq(eventState(ev({ id: 'a', starts_on: today }), today), 'now', 'one-day event today → on now');
eq(eventState(ev({ id: 'a', starts_on: '2026-09-01', ends_on: '2026-09-28' }), today), 'past', 'ended yesterday → past');
eq(eventState(ev({ id: 'a', starts_on: '2026-09-28' }), today), 'past', 'one-day event yesterday → past');
eq(eventAdminState(ev({ id: 'a', active: false, starts_on: '2026-10-01' }), today), 'hidden', 'hidden wins in the admin list');

// كم باقي
eq(daysUntil(ev({ id: 'a', starts_on: '2026-10-01' }), today), 2, 'two days to go');
eq(daysUntil(ev({ id: 'a', starts_on: today }), today), 0, 'today → 0');
eq(daysUntil(ev({ id: 'a', starts_on: '2026-09-01' }), today), null, 'already started → null');
eq(daysUntil(ev({ id: 'a', starts_on: '2027-03-29' }), today), 181, 'across the new year');

// القائمة: الجارية والقادمة بالتاريخ، وبعدها المستمرة، وبدون المنتهية والمخفية
const rows = [
  ev({ id: 'open', title: 'Hiking' }),
  ev({ id: 'past', starts_on: '2026-09-01', ends_on: '2026-09-10' }),
  ev({ id: 'hidden', active: false, starts_on: '2026-10-05' }),
  ev({ id: 'cup', starts_on: '2027-02-05', ends_on: '2027-02-06', featured: true }),
  ev({ id: 'falcons', starts_on: '2026-10-01', ends_on: '2026-10-10', featured: true }),
  ev({ id: 'racing', starts_on: '2026-10-16', ends_on: '2027-04-17' }),
  ev({ id: 'now', starts_on: '2026-09-25', ends_on: '2026-10-03' }),
];
eq(upcomingEvents(rows, today).map((e) => e.id).join(','), 'now,falcons,racing,cup,open', 'upcoming order');

// مربع الرئيسية: أقرب مميزة قادمة، ثم أقرب قادمة، ثم الجارية
eq(nextHighlight(rows, today)?.id, 'falcons', 'nearest featured upcoming');
eq(nextHighlight(rows.filter((e) => e.id !== 'falcons' && e.id !== 'cup'), today)?.id, 'racing', 'no featured → nearest upcoming');
eq(nextHighlight([rows[0], rows[6]], today)?.id, 'now', 'only an ongoing dated one → it');
eq(nextHighlight([rows[0]], today), null, 'only undated → nothing (tile shows the teaser)');
eq(nextHighlight([], today), null, 'empty list');

// نص التاريخ
eq(eventDateLabel(ev({ id: 'a', starts_on: '2027-01-22' }), 'ar'), '22 يناير 2027', 'single day (ar)');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2027-02-05', ends_on: '2027-02-06' }), 'ar'), '5–6 فبراير 2027', 'same month (ar)');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2027-02-05', ends_on: '2027-02-06' }), 'en'), '5–6 Feb 2027', 'same month (en)');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2027-02-05', ends_on: '2027-02-06' }), 'ar', { withYear: false }), '5–6 فبراير', 'without year for the home tile');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2026-10-01', ends_on: '2026-11-10' }), 'ar'), '1 أكتوبر – 10 نوفمبر 2026', 'two months, same year');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2026-10-16', ends_on: '2027-04-17' }), 'ar'), '16 أكتوبر 2026 – 17 أبريل 2027', 'across years');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2027-03-19', ends_on: '2027-03-19' }), 'en'), '19 Mar 2027', 'same start and end → one day');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2027-01-31', date_note: 'نهاية يناير 2027', date_note_en: 'Late January 2027' }), 'ar'), 'نهاية يناير 2027', 'note replaces the date (ar)');
eq(eventDateLabel(ev({ id: 'a', starts_on: '2027-01-31', date_note: 'نهاية يناير 2027', date_note_en: 'Late January 2027' }), 'en'), 'Late January 2027', 'note replaces the date (en)');
eq(eventDateLabel(ev({ id: 'a', date_note: 'تُعلن لاحقاً' }), 'en'), 'تُعلن لاحقاً', 'English falls back to the Arabic note');
eq(eventDateLabel(ev({ id: 'a' }), 'ar'), '', 'no date, no note → empty');

// التذكير: ٩ الصبح بالرياض قبل البداية بيوم
eq(reminderTime(ev({ id: 'a', starts_on: '2027-02-05' }), new Date('2026-09-29T10:00:00Z'))?.toISOString(), '2027-02-04T06:00:00.000Z', '9 am Riyadh the day before');
eq(reminderTime(ev({ id: 'a', starts_on: '2026-10-01' }), new Date('2026-09-30T07:00:00Z')), null, 'reminder time already passed');
eq(reminderTime(ev({ id: 'a', starts_on: '2027-01-31', date_note: 'نهاية يناير' }), new Date('2026-09-29T10:00:00Z')), null, 'no reminder for unconfirmed dates');
eq(reminderTime(ev({ id: 'a' }), new Date('2026-09-29T10:00:00Z')), null, 'no reminder without a date');

// حقل التاريخ في اللوحة
eq(parseEventDate(''), null, 'empty → null');
eq(parseEventDate('  '), null, 'spaces → null');
eq(parseEventDate('2027-2-5'), '2027-02-05', 'pads month and day');
eq(parseEventDate('٢٠٢٧-٠٢-٠٥'), '2027-02-05', 'Arabic digits');
eq(parseEventDate('2027/02/05'), '2027-02-05', 'slashes');
eq(parseEventDate('2027-02-30'), undefined, '30 February is rejected');
eq(parseEventDate('2027-13-01'), undefined, 'month 13 is rejected');
eq(parseEventDate('05-02-2027'), undefined, 'day-first is rejected');
eq(parseEventDate('2028-02-29'), '2028-02-29', 'leap day is fine');

// الرابط
ok(validEventUrl('https://www.riyadhmarathon.org/') && validEventUrl(' https://x.com/saudishooting '), 'https links');
ok(!validEventUrl('http://example.com') && !validEventUrl('https://localhost') && !validEventUrl('riyadhmarathon.org'), 'bad links');

console.log(failed ? `\n${failed} failed` : '\nall passed');
