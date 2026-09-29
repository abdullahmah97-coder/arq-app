// حجز الملاعب والحصص: منطق بحت بدون شبكة (الرياضات، أوقات الملعب لليوم، التعارض، نصوص الوقت) عشان ينختبر بسهولة
import { riyadhDay } from './launchAdsCore';

export type Sport = 'football' | 'padel' | 'tennis' | 'yoga' | 'pilates';
export const SPORTS: Sport[] = ['football', 'padel', 'tennis', 'yoga', 'pilates'];
export const COURT_SPORTS: Sport[] = ['football', 'padel', 'tennis'];
export const CLASS_SPORTS: Sport[] = ['yoga', 'pilates'];
export const isCourtSport = (s: Sport) => COURT_SPORTS.includes(s);
/** أيقونات MaterialCommunityIcons */
export const SPORT_ICON: Record<Sport, string> = { football: 'soccer', padel: 'racquetball', tennis: 'tennis', yoga: 'yoga', pilates: 'gymnastics' };

export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'done' | 'no_show';
export const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

export interface VenueHours { open_hour: number; close_hour: number; slot_min: number }
export interface Slot {
  /** بداية الحجز (ISO) */
  start: string;
  end: string;
  /** دقائق من بداية اليوم (يتجاوز ١٤٤٠ بعد ١٢ الليل) */
  minute: number;
  /** بعد ١٢ الليل (يوم الحجز الفعلي هو اليوم اللي بعده) */
  nextDay: boolean;
}

const MIN = 60_000;
/** منتصف ليل يوم الرياض */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00+03:00`);

/** أوقات الملعب في يوم معيّن حسب ساعات العمل ومدة الحجز (بعد ١٢ الليل تبقى على نفس اليوم) */
export function daySlots(v: VenueHours, day: string): Slot[] {
  const out: Slot[] = [];
  const base = dayStart(day);
  if (!(v.slot_min > 0) || v.close_hour <= v.open_hour) return out;
  for (let m = v.open_hour * 60; m + v.slot_min <= v.close_hour * 60; m += v.slot_min) {
    out.push({ start: new Date(base + m * MIN).toISOString(), end: new Date(base + (m + v.slot_min) * MIN).toISOString(), minute: m, nextDay: m >= 1440 });
  }
  return out;
}

/** هل الوقت متعارض مع حجز موجود؟ */
export function overlaps(a: { start: string; end: string }, b: { starts_at: string; ends_at: string }): boolean {
  return Date.parse(a.start) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.end);
}

/** الوقت قريب مرة أو فات (الحجز لازم قبل البداية بعشر دقايق على الأقل) */
export const tooSoon = (start: string, now = Date.now()) => Date.parse(start) < now + 10 * MIN;

/** الأيام الجاية (يوم الرياض) */
export function nextDays(n: number, today = riyadhDay()): string[] {
  const base = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekdayName = (dow: number, lng: string) => (lng === 'en' ? EN_DAYS : AR_DAYS)[((dow % 7) + 7) % 7];

/** «اليوم» / «بكرة» / «الخميس 2/10» */
export function dayLabel(day: string, lng: string, today = riyadhDay()): { top: string; bottom: string } {
  const d = new Date(`${day}T12:00:00Z`);
  const [, m, dd] = day.split('-').map(Number);
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const top = diff === 0 ? (lng === 'en' ? 'Today' : 'اليوم') : diff === 1 ? (lng === 'en' ? 'Tomorrow' : 'بكرة') : weekdayName(d.getUTCDay(), lng);
  return { top, bottom: `${dd}/${m}` };
}

/** «8:00 م» أو «8:00 PM» من دقائق اليوم */
export function clockLabel(minute: number, lng: string): string {
  const m = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60); const mm = String(m % 60).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (lng === 'en') return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  return `${h12}:${mm} ${h < 12 ? 'ص' : 'م'}`;
}

/** وقت ISO بتوقيت الرياض → دقائق اليوم */
export const riyadhMinute = (iso: string) => {
  const d = new Date(Date.parse(iso) + 3 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
/** يوم الرياض لوقت ISO */
export const riyadhDate = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 10);

/** «الخميس 2/10 · 8:00 م» */
export function whenLabel(iso: string, lng: string, today = riyadhDay()): string {
  const day = riyadhDate(iso);
  const d = dayLabel(day, lng, today);
  const sameWeek = d.top === (lng === 'en' ? 'Today' : 'اليوم') || d.top === (lng === 'en' ? 'Tomorrow' : 'بكرة');
  return `${d.top}${sameWeek ? '' : ` ${d.bottom}`} · ${clockLabel(riyadhMinute(iso), lng)}`;
}

/** الحجز القادم الفعّال الأقرب (لمربع الرئيسية) */
export function nextBooking<T extends { status: BookingStatus; starts_at: string }>(rows: T[], now = Date.now()): T | null {
  return rows.filter((b) => ACTIVE_STATUSES.includes(b.status) && Date.parse(b.starts_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null;
}

/** ساعات العمل للعرض: «4:00 م – 2:00 ص» */
export const hoursLabel = (v: VenueHours, lng: string) => `${clockLabel(v.open_hour * 60, lng)} – ${clockLabel(v.close_hour * 60, lng)}`;

/** الحجز داخل التطبيق متاح للشريك المعتمد فقط (المدرج من أرك يحجز من موقعه) */
export const bookableInApp = (v: { listed_by: 'owner' | 'arq'; status: string }) => v.listed_by === 'owner' && v.status === 'approved';
