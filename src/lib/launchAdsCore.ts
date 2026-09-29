// إعلان البداية: منطق بحت (متى يظهر، وتحويل التواريخ) عشان يتختبر بدون الجوال

export type AdFrequency = 'every_open' | 'daily' | 'once';
export type AdAudience = 'all' | 'men' | 'women';
export type AdKind = 'ad' | 'awareness' | 'occasion';
/** التسويقي عليه «إعلان»، والتوعوي والمناسبات بدونها ولها قسم لحالها في اللوحة */
export const isMarketing = (k: AdKind) => k === 'ad';

/** اللي ينحفظ في الجهاز لكل إعلان: آخر يوم ظهر فيه ونسخته (تتغير لو المالك عدّل الإعلان) */
export interface SeenEntry { day: string; version: string }
export type SeenMap = Record<string, SeenEntry>;

/** يوم الرياض بصيغة YYYY-MM-DD */
export function riyadhDay(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** هل نعرض الإعلان الحين؟ «كل فتح» دايم، «مرة باليوم» مرة لكل يوم، «مرة وحدة» مرة لكل نسخة */
export function shouldShowAd(freq: AdFrequency, id: string, version: string, seen: SeenMap, today: string): boolean {
  const s = seen[id];
  if (!s) return true;
  if (freq === 'every_open') return true;
  if (freq === 'daily') return s.day !== today;
  return s.version !== version;
}

/** نحتفظ بآخر ٢٠ إعلان بس عشان ما يكبر التخزين */
export function markSeen(seen: SeenMap, id: string, version: string, today: string): SeenMap {
  const next: SeenMap = { ...seen, [id]: { day: today, version } };
  const ids = Object.keys(next);
  if (ids.length > 20) ids.sort((a, b) => next[a].day.localeCompare(next[b].day)).slice(0, ids.length - 20).forEach((k) => delete next[k]);
  return next;
}

const toLatin = (s: string) => s.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** «YYYY-MM-DD» بتوقيت الرياض → بداية اليوم (أو بداية اليوم اللي بعده لو endOfDay) كـ ISO. فاضي = null، غلط = undefined */
export function riyadhDateToIso(s: string, endOfDay = false): string | null | undefined {
  const v = toLatin(s);
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + (endOfDay ? 1 : 0), -3, 0));
  if (Number.isNaN(d.getTime()) || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return undefined;
  return d.toISOString();
}

/** عكس السابق للعرض في الحقول */
export function isoToRiyadhDate(iso: string | null | undefined, endOfDay = false): string {
  if (!iso) return '';
  return riyadhDay(new Date(new Date(iso).getTime() - (endOfDay ? 1000 : 0)));
}

export type AdState = 'live' | 'scheduled' | 'ended' | 'off';
export function adState(a: { active: boolean; starts_at: string | null; ends_at: string | null }, now = Date.now()): AdState {
  if (!a.active) return 'off';
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return 'ended';
  if (a.starts_at && new Date(a.starts_at).getTime() > now) return 'scheduled';
  return 'live';
}

/** الرابط: داخل التطبيق يبدأ بـ / أو رابط https */
export const validAdLink = (s: string) => !s.trim() || /^\/[\w\-/?=&.%[\]]*$/.test(s.trim()) || /^https:\/\/[^\s]+$/.test(s.trim());

/** وين يودّي زر الإعلان: صفحة شريك معيّن، قسم في التطبيق، أو رابط خارجي */
export type AdTarget = 'none' | 'store' | 'club' | 'coach' | 'center' | 'page' | 'url';
export type AdPartnerTarget = 'store' | 'club' | 'coach' | 'center';
export const AD_TARGETS: AdTarget[] = ['none', 'store', 'club', 'coach', 'center', 'page', 'url'];

export function targetLink(kind: AdPartnerTarget, id: string): string {
  if (kind === 'store') return `/store/${id}`;
  if (kind === 'club') return `/clubs/chain/${id}`;
  if (kind === 'coach') return `/coaches/${id}`;
  return `/recovery/centers?focus=${id}`;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** عكس targetLink: نعرف نوع الزر من الرابط المحفوظ (للتعديل) */
export function parseTarget(link: string | null | undefined): { target: AdTarget; id: string | null } {
  const l = (link ?? '').trim();
  if (!l) return { target: 'none', id: null };
  if (/^https:\/\//.test(l)) return { target: 'url', id: null };
  const m = (re: string) => l.match(new RegExp(`^${re}(${UUID})$`, 'i'))?.[1] ?? null;
  const store = m('/store/'); if (store) return { target: 'store', id: store };
  const club = m('/clubs/chain/'); if (club) return { target: 'club', id: club };
  const coach = m('/coaches/'); if (coach) return { target: 'coach', id: coach };
  const center = m('/recovery/centers\\?focus='); if (center) return { target: 'center', id: center };
  return { target: 'page', id: null };
}
