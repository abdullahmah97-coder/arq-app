// البطولات والفعاليات: منطق بحت بدون شبكة (نص التاريخ، القادمة، الترتيب، وقت التذكير) عشان ينختبر بسهولة
import { riyadhDay } from './launchAdsCore';

export type EventCategory = 'running' | 'horse_racing' | 'hiking' | 'shooting' | 'boxing' | 'motorsport' | 'cycling' | 'football' | 'other';
export const EVENT_CATEGORIES: EventCategory[] = ['running', 'horse_racing', 'hiking', 'shooting', 'boxing', 'motorsport', 'cycling', 'football', 'other'];
/** أيقونات MaterialCommunityIcons لكل نوع */
export const EVENT_ICON: Record<EventCategory, string> = {
  running: 'run-fast', horse_racing: 'horse-variant', hiking: 'hiking', shooting: 'target', boxing: 'boxing-glove',
  motorsport: 'flag-checkered', cycling: 'bike', football: 'soccer', other: 'trophy',
};

export interface LocalEvent {
  id: string; category: EventCategory; title: string; title_en: string | null;
  city: string | null; city_en: string | null; venue: string | null; venue_en: string | null;
  /** YYYY-MM-DD */
  starts_on: string | null; ends_on: string | null;
  /** يظهر بدل التاريخ لو الموعد تقريبي */
  date_note: string | null; date_note_en: string | null;
  summary: string | null; summary_en: string | null; url: string | null; image_path: string | null;
  featured: boolean; active: boolean; created_at?: string; updated_at?: string;
}

/** now: جارية اليوم · soon: قادمة · open: بدون تاريخ (نشاط مستمر) · past: انتهت */
export type EventState = 'now' | 'soon' | 'open' | 'past';

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);

export function eventState(e: Pick<LocalEvent, 'starts_on' | 'ends_on'>, today = riyadhDay()): EventState {
  const s = day(e.starts_on); const end = day(e.ends_on) ?? s;
  if (!s && !end) return 'open';
  if (end && end < today) return 'past';
  if (s && s > today) return 'soon';
  return 'now';
}

/** كم يوم باقي على البداية (٠ = اليوم، null = بدون تاريخ أو بدأت) */
export function daysUntil(e: Pick<LocalEvent, 'starts_on'>, today = riyadhDay()): number | null {
  const s = day(e.starts_on);
  if (!s || s < today) return null;
  return Math.round((Date.parse(`${s}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** الفعّالة اللي ما انتهت: الجارية والقادمة بالتاريخ، وبعدها الأنشطة المستمرة */
export function upcomingEvents<T extends LocalEvent>(rows: T[], today = riyadhDay()): T[] {
  const rank = (e: T) => (eventState(e, today) === 'open' ? 1 : 0);
  return rows
    .filter((e) => e.active && eventState(e, today) !== 'past')
    .sort((a, b) => rank(a) - rank(b) || (day(a.starts_on) ?? '').localeCompare(day(b.starts_on) ?? '') || a.title.localeCompare(b.title));
}

/** للمربع في الرئيسية: أقرب فعالية مميزة قادمة، وإذا ما فيه فأقرب فعالية بتاريخ */
export function nextHighlight<T extends LocalEvent>(rows: T[], today = riyadhDay()): T | null {
  const dated = upcomingEvents(rows, today).filter((e) => eventState(e, today) !== 'open');
  return dated.find((e) => e.featured && eventState(e, today) === 'soon') ?? dated.find((e) => eventState(e, today) === 'soon') ?? dated[0] ?? null;
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** «22 يناير 2027»، «5–6 فبراير 2027»، «16 أكتوبر 2026 – 17 أبريل 2027»، أو الملاحظة لو الموعد تقريبي */
export function eventDateLabel(e: Pick<LocalEvent, 'starts_on' | 'ends_on' | 'date_note' | 'date_note_en'>, lng: string, opts: { withYear?: boolean } = {}): string {
  const note = lng === 'en' ? e.date_note_en || e.date_note : e.date_note;
  if (note) return note;
  const s = day(e.starts_on); const end = day(e.ends_on);
  if (!s) return '';
  const M = lng === 'en' ? EN_MONTHS : AR_MONTHS;
  const parts = (v: string) => { const [y, m, d] = v.split('-').map(Number); return { y, m: M[m - 1], d }; };
  const a = parts(s);
  const withYear = opts.withYear !== false;
  const one = (p: { y: number; m: string; d: number }, y = withYear) => `${p.d} ${p.m}${y ? ` ${p.y}` : ''}`;
  if (!end || end === s) return one(a);
  const b = parts(end);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${a.m}${withYear ? ` ${a.y}` : ''}`;
  if (a.y === b.y) return `${one(a, false)} – ${one(b)}`;
  return `${one(a, true)} – ${one(b, true)}`;
}

/** وقت التذكير: الساعة ٩ الصبح بتوقيت الرياض قبل البداية بيوم (null لو فات الوقت أو الموعد تقريبي) */
export function reminderTime(e: Pick<LocalEvent, 'starts_on' | 'date_note'>, now = new Date()): Date | null {
  const s = day(e.starts_on);
  if (!s || e.date_note) return null;
  const at = new Date(Date.parse(`${s}T06:00:00Z`) - 86_400_000); // ٩ الصبح الرياض = ٦ UTC
  return at.getTime() > now.getTime() + 60_000 ? at : null;
}

/** رابط الفعالية صالح: https فقط */
export const validEventUrl = (u: string) => /^https:\/\/[^\s]+\.[^\s]+$/.test(u.trim());

/** حقل التاريخ في لوحة الإدارة: «2027-2-5» أو «٢٠٢٧-٠٢-٠٥» → «2027-02-05». فاضي = null، تاريخ غلط = undefined */
export function parseEventDate(s: string): string | null | undefined {
  const v = s.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[/.]/g, '-');
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return undefined;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // يرفض ٣٠ فبراير و١٣/٠١ وغيرها (التاريخ لازم يرجع نفسه)
  if (y < 2000 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** حالة الفعالية في لوحة الإدارة (المخفية أول شي) */
export type EventAdminState = EventState | 'hidden';
export const eventAdminState = (e: Pick<LocalEvent, 'active' | 'starts_on' | 'ends_on'>, today = riyadhDay()): EventAdminState =>
  (e.active ? eventState(e, today) : 'hidden');
