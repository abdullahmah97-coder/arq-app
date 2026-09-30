// «صباح الخير ☀️» و«تصبحون على خير 🌙» في التايم لاين (منطق بحت عشان يتختبر):
// «صباح الخير» تلقائي مرة باليوم لما تفتح التطبيق الصبح. الوقت = وقت منبّه أرك لو رنّ اليوم، وإلا وقت الفتح.
// ولو نشرت «تصبحون على خير» من زر ＋: التايم لاين يتقفل بشاشة النوم لين تضغط «صباح الخير»، والخادم يحسب كم نمت.
// ما نستخدم بيانات النوم من الساعة (بيانات صحية) — بس إعداد المنبّه والوقتين اللي نشرتهم أنت.

export interface AlarmInfo { on: boolean; wakeMin: number | null; days: number[] }
export interface WakeMoment { at: Date; src: 'alarm' | 'open' }
export interface WakePlan extends WakeMoment { afterSleep: boolean }

/** أول ساعة وآخر ساعة نعتبر فيها فتح التطبيق «صحيان» */
export const WAKE_FROM_HOUR = 3;
export const WAKE_UNTIL_HOUR = 14;
/** بعد «تصبحون على خير»: كم دقيقة لازم تمر قبل ما نفتح له شاشة النوم الصبح */
export const AUTO_WAKE_AFTER_MIN = 120;
/** «تصبحون على خير» أقدم من كذا نعتبرها خلصت (نسي يفتح التطبيق) */
export const SLEEP_OPEN_HOURS = 20;

/** وقت منبّه أرك اليوم لو رنّ (مفعّل، اليوم من أيامه، ووقته فات ومن ٣ الفجر) */
export function alarmRangToday(now: Date, alarm: AlarmInfo | null): Date | null {
  if (!alarm?.on || alarm.wakeMin == null || !alarm.days.includes(now.getDay())) return null;
  const at = new Date(now);
  at.setHours(Math.floor(alarm.wakeMin / 60), alarm.wakeMin % 60, 0, 0);
  return at.getTime() <= now.getTime() && at.getHours() >= WAKE_FROM_HOUR ? at : null;
}

export function wakeMoment(now: Date, alarm: AlarmInfo | null): WakeMoment | null {
  const h = now.getHours();
  if (h < WAKE_FROM_HOUR || h >= WAKE_UNTIL_HOUR) return null;
  const a = alarmRangToday(now, alarm);
  return a ? { at: a, src: 'alarm' } : { at: now, src: 'open' };
}

/** هل «تصبحون على خير» هذي لسا مفتوحة (ما صحى منها ولا قدمت) */
export const sleepStillOpen = (now: Date, sleepAt: Date | null) =>
  !!sleepAt && sleepAt.getTime() <= now.getTime() + 60_000 && now.getTime() - sleepAt.getTime() < SLEEP_OPEN_HOURS * 3600_000;

/**
 * متى ننشر «صباح الخير» تلقائياً (null = لا الحين): مرة باليوم (doneToday) الصبح ٣:٠٠–١٣:٥٩.
 * وأنت نايم (بعد «تصبحون على خير») ما ننشر تلقائي: التايم لاين مقفل بشاشة النوم لين تضغط «صباح الخير».
 */
export function wakePlan(now: Date, alarm: AlarmInfo | null, sleepAt: Date | null, doneToday: boolean): WakePlan | null {
  if (sleepAt && sleepStillOpen(now, sleepAt)) return null;
  if (doneToday) return null;
  const m = wakeMoment(now, alarm);
  return m ? { ...m, afterSleep: false } : null;
}

/** نايم من ساعتين أو أكثر والوقت صار الصبح (من ٣ الفجر): نفتح له شاشة النوم في التايم لاين عشان يضغط «صباح الخير» */
export function wakePromptDue(now: Date, sleepAt: Date | null): boolean {
  if (!sleepAt || !sleepStillOpen(now, sleepAt)) return false;
  return (now.getTime() - sleepAt.getTime()) / 60000 >= AUTO_WAKE_AFTER_MIN && now.getHours() >= WAKE_FROM_HOUR;
}

/** اليوم المحلي YYYY-MM-DD (نسجّل فيه إننا نشرنا «صباح الخير» اليوم) */
export const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** دقائق التمرين من الحضور (دخول ← خروج)، null لو ما طلع أو المدة غير منطقية */
export function trainedMinutes(inIso: string, outIso: string | null | undefined): number | null {
  if (!outIso) return null;
  const m = Math.round((Date.parse(outIso) - Date.parse(inIso)) / 60000);
  return Number.isFinite(m) && m >= 5 && m <= 6 * 60 ? m : null;
}

/** مدة: «7 ساعات و15 د» / «ساعتين» / «40 د» — «7h 15m» */
export function durationText(min: number, lng: 'ar' | 'en'): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (lng === 'en') return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  if (!h) return `${m} د`;
  const hh = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  return m ? `${hh} و${m} د` : hh;
}

/** اليوم ولا أمس ولا أقدم (بتوقيت الجهاز) */
export function dayOf(iso: string, now: Date): 'today' | 'yesterday' | 'older' {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'older';
  if (localDayKey(d) === localDayKey(now)) return 'today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return localDayKey(d) === localDayKey(y) ? 'yesterday' : 'older';
}

/** تحية الغلاف حسب الوقت: الصبح، الظهر والعصر، المساء، وبعد نص الليل */
export function greetingOf(d: Date): 'morning' | 'afternoon' | 'evening' | 'late' {
  const h = d.getHours();
  if (h < 4) return 'late';
  if (h < 12) return 'morning';
  return h < 17 ? 'afternoon' : 'evening';
}

/** رقم ثابت من النص (نختار فيه جملة «تصبحون على خير» نفسها لكل من يشوف المنشور) */
export function stableIndex(id: string, n: number): number {
  let x = 0;
  for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0;
  return n > 0 ? x % n : 0;
}

/** «6:30 ص» / «6:30 AM» بتوقيت الجهاز (بدون Intl عشان يطلع نفسه في كل الأجهزة) */
export function clockOf(d: Date, lng: 'ar' | 'en'): string {
  if (!Number.isFinite(d.getTime())) return '';
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return lng === 'en' ? `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}` : `${h12}:${mm} ${h < 12 ? 'ص' : 'م'}`;
}

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** «الأربعاء 30 سبتمبر» / «Wednesday, Sep 30» */
export function dateLine(d: Date, lng: 'ar' | 'en'): string {
  return lng === 'en'
    ? `${EN_DAYS[d.getDay()]}, ${EN_MONTHS[d.getMonth()]} ${d.getDate()}`
    : `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}
