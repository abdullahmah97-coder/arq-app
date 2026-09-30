// أوقات المحادثات واتجاه النص (مثل الواتساب): وقت الرسالة، فاصل الأيام، ووقت آخر رسالة في صندوق الرسائل
type Lng = 'ar' | 'en';
type Tr = (key: string) => string;

const loc = (lng: Lng) => (lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US');
const DAY = 86400000;

/** يوم الرسالة بتوقيت الجوال */
export const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** كم يوم بين يوم الرسالة واليوم (٠ = اليوم، ١ = أمس) */
export function daysAgo(iso: string, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
}

/** وقت الرسالة: 10:45 م */
export function msgTime(iso: string, lng: Lng): string {
  try { return new Date(iso).toLocaleTimeString(loc(lng), { hour: 'numeric', minute: '2-digit' }); }
  catch { return iso.slice(11, 16); }
}

/** فاصل الأيام في المحادثة: اليوم، أمس، اسم اليوم (خلال أسبوع)، أو التاريخ */
export function dayLabel(iso: string, lng: Lng, t: Tr, now = new Date()): string {
  const n = daysAgo(iso, now);
  // (ساعة الجوال ممكن تكون متأخرة شوي عن الخادم: رسالة «بكرة» نحسبها اليوم)
  if (n <= 0) return t('chat.today');
  if (n === 1) return t('chat.yesterday');
  const d = new Date(iso);
  try {
    if (n < 7) return d.toLocaleDateString(loc(lng), { weekday: 'long' });
    return d.toLocaleDateString(loc(lng), { day: 'numeric', month: 'long', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
  } catch { return iso.slice(0, 10); }
}

/** وقت آخر رسالة في صندوق الرسائل: الساعة لليوم، «أمس»، اسم اليوم، أو التاريخ المختصر */
export function inboxTime(iso: string, lng: Lng, t: Tr, now = new Date()): string {
  const n = daysAgo(iso, now);
  if (n <= 0) return msgTime(iso, lng);
  if (n === 1) return t('chat.yesterday');
  const d = new Date(iso);
  try {
    if (n < 7) return d.toLocaleDateString(loc(lng), { weekday: 'long' });
    return d.toLocaleDateString(loc(lng), { day: 'numeric', month: 'numeric', year: 'numeric' });
  } catch { return iso.slice(0, 10); }
}

// حروف الكتابة من اليمين (عربي/عبري وأشكالها) ومن اليسار (لاتيني/يوناني/سيريلي)
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/**
 * اتجاه الفقرة من أول حرف قوي (مثل الجوال): «هلا» يمين، «ok» يسار.
 * لو ما فيها حروف (إيموجي أو أرقام) تمشي على اتجاه الواجهة.
 */
export function textIsRTL(s: string, fallback: boolean): boolean {
  for (const ch of s) {
    if (RTL_CHAR.test(ch)) return true;
    if (LTR_CHAR.test(ch)) return false;
  }
  return fallback;
}
