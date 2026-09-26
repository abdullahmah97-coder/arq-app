// تواريخ: الأسبوع يبدأ الأحد (السعودية)، والحسابات بتوقيت الجهاز

export function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function todayIndex(d = new Date()): number {
  return d.getDay(); // 0 = الأحد
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function daysBetween(fromIso: string, to = new Date()): number {
  const a = new Date(fromIso + 'T00:00:00');
  const b = new Date(isoDate(to) + 'T00:00:00');
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function durationLabel(fromIso: string, lng: 'ar' | 'en', now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (lng === 'ar') return h ? `${h} س ${m} د` : `${m} د`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function timeAgo(iso: string, lng: 'ar' | 'en'): string {
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto' });
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { day: 'numeric', month: 'short' });
}
