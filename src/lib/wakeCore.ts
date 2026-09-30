// «صحى ☀️» في التايم لاين (منطق بحت عشان يتختبر):
// مرة باليوم لما تفتح التطبيق الصبح. الوقت = وقت منبّه أرك لو رنّ اليوم، وإلا وقت الفتح («صباح الخير»).
// ما نستخدم بيانات النوم من الساعة (بيانات صحية) — بس إعداد المنبّه اللي حطيته أنت.

export interface AlarmInfo { on: boolean; wakeMin: number | null; days: number[] }
export interface WakeMoment { at: Date; src: 'alarm' | 'open' }

/** أول ساعة وآخر ساعة نعتبر فيها فتح التطبيق «صحيان» */
export const WAKE_FROM_HOUR = 3;
export const WAKE_UNTIL_HOUR = 14;

export function wakeMoment(now: Date, alarm: AlarmInfo | null): WakeMoment | null {
  const h = now.getHours();
  if (h < WAKE_FROM_HOUR || h >= WAKE_UNTIL_HOUR) return null;
  if (alarm?.on && alarm.wakeMin != null && alarm.days.includes(now.getDay())) {
    const at = new Date(now);
    at.setHours(Math.floor(alarm.wakeMin / 60), alarm.wakeMin % 60, 0, 0);
    if (at.getTime() <= now.getTime() && at.getHours() >= WAKE_FROM_HOUR) return { at, src: 'alarm' };
  }
  return { at: now, src: 'open' };
}

/** اليوم المحلي YYYY-MM-DD (نسجّل فيه إننا نشرنا «صحى» اليوم) */
export const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** دقائق التمرين من الحضور (دخول ← خروج)، null لو ما طلع أو المدة غير منطقية */
export function trainedMinutes(inIso: string, outIso: string | null | undefined): number | null {
  if (!outIso) return null;
  const m = Math.round((Date.parse(outIso) - Date.parse(inIso)) / 60000);
  return Number.isFinite(m) && m >= 5 && m <= 6 * 60 ? m : null;
}
