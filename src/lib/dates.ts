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

type Unit = 'minute' | 'hour' | 'day';
// العربي: ١ دقيقة، ٢ دقيقتين، ٣–١٠ دقائق، ١١+ دقيقة
const AR: Record<Unit, [string, string, string]> = {
  minute: ['دقيقة', 'دقيقتين', 'دقائق'],
  hour: ['ساعة', 'ساعتين', 'ساعات'],
  day: ['يوم', 'يومين', 'أيام'],
};
const EN: Record<Unit, string> = { minute: 'min', hour: 'hr', day: 'day' };

function arCount(n: number, u: Unit): string {
  const [one, two, few] = AR[u];
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${one}`;
}

/**
 * «قبل ٥ دقائق» / «5 min ago». مكتوبة يدوياً لأن محرك Hermes في الجوال ما فيه Intl.RelativeTimeFormat
 * (استخدامه كان يقفل التطبيق عند فتح التنبيهات والمنشورات).
 */
export function timeAgo(iso: string, lng: 'ar' | 'en', now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = (t - now) / 1000;
  const past = diff <= 0;
  const abs = Math.abs(diff);
  if (abs < 60) return lng === 'ar' ? 'الآن' : 'just now';
  let n: number; let u: Unit;
  if (abs < 3600) { n = Math.round(abs / 60); u = 'minute'; }
  else if (abs < 86400) { n = Math.round(abs / 3600); u = 'hour'; }
  else if (abs < 86400 * 7) { n = Math.round(abs / 86400); u = 'day'; }
  else {
    try {
      return new Date(t).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { day: 'numeric', month: 'short' });
    } catch {
      return isoDate(new Date(t));
    }
  }
  if (u === 'day' && n === 1) return lng === 'ar' ? (past ? 'أمس' : 'بكرة') : past ? 'yesterday' : 'tomorrow';
  if (lng === 'ar') return `${past ? 'قبل' : 'بعد'} ${arCount(n, u)}`;
  const label = `${n} ${EN[u]}${u === 'day' && n > 1 ? 's' : ''}`;
  return past ? `${label} ago` : `in ${label}`;
}
