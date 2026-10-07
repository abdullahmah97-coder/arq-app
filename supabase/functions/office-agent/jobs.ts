// وش يشتغل عليه كل مكتب: يقرا الطلبات/البلاغات المعلّقة من القاعدة (بمفتاح الخدمة) ويطلع «شغلة» لكل عنصر.
// العنصر اللي له مهمة سابقة (بأي حالة غير failed) ما يرجع له الوكيل: ينراجع مرة وحدة، والمالك يقدر يتصرف بنفسه
// (إلا طلب شريك انرفض بموافقة المالك ورجع معلّق: الشريك قدّمه من جديد، فينراجع مرة ثانية).
// نص المستخدمين كله يمر على clean (بدون < > ورموز التحكم) ويروح للنموذج داخل وسم، فما يقدر يطلع منه.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  clean, languageName, schemaFor, systemFor, tagged,
  type AgentKind, type DeskId, type Locale, type PartnerKind, type TargetKind,
} from './agents.ts';

/** أقصى عدد مهام بالتشغيلة الوحدة (الطلبات والبلاغات) */
export const PER_RUN = 5;
/** نقلّب الطابور صفحات (SCAN بالصفحة، لين MAX_PAGES) عشان نلقى اللي ما انراجع: البلاغ اللي انفرز وباقي new
 *  والطلب اللي ينتظر قرار المالك ما يسدّون الطريق على الأحدث منهم */
export const SCAN = 100;
export const MAX_PAGES = 10;
/** حد صورة المستند: ٤ ميقا وأقل (بعد الترميز base64 تبقى تحت حد Claude للصورة) */
export const MAX_DOC_BYTES = 3_750_000;
/** صفوف ai_usage لآخر ٧ أيام: صفحات ١٠٠٠ (حد PostgREST الافتراضي) لين ٢٠ ألف */
const USAGE_PAGE = 1000;
const USAGE_MAX = 20_000;
/** الحدود الثابتة بالقاعدة (ai_take): الخطة ٨ والمكتب ٨٠ باليوم */
const FIXED_CAPS: Record<string, number> = { plan: 8, office: 80 };

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export interface ImageBlock { type: 'image'; source: { type: 'base64'; media_type: ImageType; data: string } }

export interface Job {
  desk: DeskId;
  kind: AgentKind;
  target_kind: TargetKind | null;
  target_id: string | null;
  title: string | null;
  input: Record<string, unknown>;
  /** لغة الشخص اللي بيقرا الرد أو الملاحظة (المختبر أو الشريك) */
  locale: Locale;
  system: string;
  schema: Record<string, unknown>;
  /** رسالة الطلب: تنبني وقت التشغيل (تحميل المستندات وجمع الأرقام ياخذ وقت) */
  build: () => Promise<{ text: string; images: ImageBlock[] }>;
}

interface Ctx {
  /** مفتاح الخدمة: قراءة الجداول وكتابة office_tasks */
  db: SupabaseClient;
  /** توكن المالك: RPC الإدارة (admin_user_stats) */
  user: SupabaseClient;
  brief: string | null;
}

type Row = Record<string, unknown>;
type Q = PromiseLike<{ data: unknown; error: { message?: string } | null }>;

/** تاريخ اليوم بتوقيت الرياض */
export const riyadhDay = (t = Date.now()) => new Date(t + 3 * 3600_000).toISOString().slice(0, 10);
const localeOf = (p?: Row | null): Locale => (p?.locale === 'en' ? 'en' : 'ar');
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const strs = (v: unknown, max: number, n = 15) => (Array.isArray(v) ? v.map((x) => clean(x, max)).filter(Boolean).slice(0, n) : []);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
const opt = (v: unknown, max: number) => clean(v, max) || null;
const today = () => `Today's date: ${riyadhDay()} (Riyadh).`;
const writeIn = (who: string, what: string, l: Locale) => `The ${who}'s app language is ${languageName(l)}: write the ${what} in ${languageName(l)}.`;

/** قراءة لازمة: لو فشلت ما نكمّل (busy) عشان ما نراجع شي مرتين أو نفوّت شي */
async function rows(q: Q, label: string): Promise<Row[]> {
  const { data, error } = await q;
  if (error) {
    console.error('office_read_failed', label, error.message);
    throw new Error('busy');
  }
  return (Array.isArray(data) ? data : []) as Row[];
}

/** مراجعة شريك وافق المالك على رفضها: الطلب انرفض فعلاً، فلو رجع معلّق يعني الشريك عدّله وقدّمه من جديد
 *  (المتاجر والمدربين والمراكز والملاعب يرجعون بنفس الصف). هذي ما تنحسب، والطلب ينراجع مرة ثانية */
const resubmitted = (kind: AgentKind, t: Row) =>
  kind === 'review_partner' && t.status === 'done' && t.decision === 'approved' &&
  !!t.final && typeof t.final === 'object' && (t.final as Row).decision === 'reject';

/** العناصر اللي لها مهمة من نفس النوع بأي حالة غير failed (ما عدا resubmitted) */
async function handled(db: SupabaseClient, kind: AgentKind, tk: TargetKind, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const found = await rows(db.from('office_tasks').select('target_id, status, decision, final').eq('kind', kind).eq('target_kind', tk)
    .in('target_id', ids).neq('status', 'failed'), 'office_tasks');
  return new Set(found.filter((t) => !resubmitted(kind, t)).map((t) => String(t.target_id)));
}

/** صفحة من طابور المكتب (الأقدم أول): الصفوف from..to */
type Page = (from: number, to: number) => Promise<Row[]>;

/** أقدم العناصر اللي ما انراجعت (لين PER_RUN): يقرا الطابور صفحة صفحة لين يلقاها، أو يخلص الطابور، أو MAX_PAGES */
async function fresh(db: SupabaseClient, kind: AgentKind, tk: TargetKind, page: Page): Promise<Row[]> {
  const out: Row[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < MAX_PAGES && out.length < PER_RUN; p++) {
    const got = await page(p * SCAN, (p + 1) * SCAN - 1);
    // لو تغيّر الطابور بين صفحتين ممكن يتكرر صف، فما ناخذه مرتين
    const items = got.filter((r) => !seen.has(String(r.id)));
    for (const r of items) seen.add(String(r.id));
    const done = await handled(db, kind, tk, items.map((r) => String(r.id)));
    out.push(...items.filter((r) => !done.has(String(r.id))));
    if (got.length < SCAN) break;
  }
  return out.slice(0, PER_RUN);
}

/** أسماء ولغة أصحاب الطلبات (لو تعطّلت نكمّل بالعربي) */
async function profilesOf(db: SupabaseClient, ids: unknown[]): Promise<Map<string, Row>> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === 'string' && !!x))];
  if (!uniq.length) return new Map();
  const { data } = await db.from('profiles').select('id, username, full_name, locale').in('id', uniq);
  return new Map(((data ?? []) as Row[]).map((p) => [String(p.id), p]));
}

async function namesOf(db: SupabaseClient, table: string, ids: unknown[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === 'string' && !!x))];
  if (!uniq.length) return new Map();
  const { data } = await db.from(table).select('id, name').in('id', uniq);
  return new Map(((data ?? []) as Row[]).map((r) => [String(r.id), clean(r.name, 80)]));
}

// ---------------------------------------------------------------------------
// مستندات طلبات الأندية: صور JPEG/PNG/WebP بس (نتعرف عليها من أول بايتات الملف، مو من الاسم)
// ---------------------------------------------------------------------------
function imageType(b: Uint8Array): ImageType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function loadImage(db: SupabaseClient, path: string): Promise<ImageBlock | null> {
  try {
    const { data, error } = await db.storage.from('partner_docs').download(path);
    if (error || !data || data.size > MAX_DOC_BYTES) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const media = bytes.length <= MAX_DOC_BYTES ? imageType(bytes) : null;
    return media ? { type: 'image', source: { type: 'base64', media_type: media, data: toBase64(bytes) } } : null;
  } catch (e) {
    console.warn('office_doc_failed', String(e).slice(0, 120));
    return null;
  }
}

// ---------------------------------------------------------------------------
// المكاتب
// ---------------------------------------------------------------------------
type Base = Pick<Job, 'desk' | 'kind' | 'target_kind' | 'target_id' | 'title' | 'locale'> & { partner?: PartnerKind };
const job = (b: Base, input: Record<string, unknown>, build: Job['build']): Job => ({
  ...b, input, build,
  system: systemFor(b.kind, { partner: b.partner, locale: b.locale }),
  schema: schemaFor(b.kind, b.locale),
});

/** البلاغات: الجديدة (status new) */
async function reportJobs({ db }: Ctx): Promise<Job[]> {
  const picked = await fresh(db, 'triage_report', 'report', (from, to) => rows(db.from('beta_feedback')
    .select('id, user_id, category, message, screen, app_version, platform, created_at')
    .eq('status', 'new').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 'beta_feedback'));
  const people = await profilesOf(db, picked.map((r) => r.user_id));
  return picked.map((r) => {
    const p = people.get(String(r.user_id));
    const locale = localeOf(p);
    return job({ desk: 'reports', kind: 'triage_report', target_kind: 'report', target_id: String(r.id), title: clean(r.message, 80) || null, locale },
      { locale },
      async () => ({
        images: [],
        text: [today(), writeIn('tester', 'reply', locale), tagged('report', {
          category: clean(r.category, 20), message: clean(r.message, 2000), screen: opt(r.screen, 120), app_version: opt(r.app_version, 60),
          platform: opt(r.platform, 20), sent_at: clean(r.created_at, 40), tester: opt(p?.username, 40),
        })].join('\n\n'),
      }));
  });
}

/** طلبات الأندية المعلّقة (مع صور السجل التجاري والرخصة لو انرفعت) */
async function clubJobs({ db }: Ctx): Promise<Job[]> {
  const rs = await fresh(db, 'review_partner', 'club', (from, to) => rows(db.from('club_requests')
    .select('id, user_id, chain_id, gym_id, club_name, role, cr_number, license_number, city, branches, note, email, created_at, cr_doc_path, license_doc_path')
    .eq('status', 'pending').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 'club_requests'));
  const [people, gyms, chains] = await Promise.all([
    profilesOf(db, rs.map((r) => r.user_id)), namesOf(db, 'gyms', rs.map((r) => r.gym_id)), namesOf(db, 'gym_chains', rs.map((r) => r.chain_id)),
  ]);
  return rs.map((r) => {
    const p = people.get(String(r.user_id));
    const locale = localeOf(p);
    return job({ desk: 'clubs', kind: 'review_partner', target_kind: 'club', target_id: String(r.id), title: clean(r.club_name, 80) || null, locale, partner: 'club' },
      { locale },
      async () => {
        const images: ImageBlock[] = [];
        const notes: string[] = [];
        const docs: [string, unknown][] = [['commercial registration document', r.cr_doc_path], ['license document', r.license_doc_path]];
        for (const [label, path] of docs) {
          if (typeof path !== 'string' || !path) continue;
          const img = await loadImage(db, path);
          if (img) { images.push(img); notes.push(`Attached image ${images.length} is the ${label}.`); }
          else notes.push(`A ${label} was uploaded but couldn't be viewed (not a JPEG, PNG or WebP image under 4 MB, or it couldn't be loaded).`);
        }
        if (!notes.length) notes.push('No documents were uploaded.');
        return {
          images,
          text: [today(), writeIn('applicant', 'note', locale), notes.join('\n'), tagged('request', {
            club_name: clean(r.club_name, 80), role: clean(r.role, 20), cr_number: opt(r.cr_number, 20), license_number: opt(r.license_number, 40),
            city: opt(r.city, 40), branches: num(r.branches), note: opt(r.note, 400), email: opt(r.email, 120), sent_at: clean(r.created_at, 40),
            existing_gym_in_arq: gyms.get(String(r.gym_id)) || null, existing_chain_in_arq: chains.get(String(r.chain_id)) || null,
            requester: { username: opt(p?.username, 40), full_name: opt(p?.full_name, 80) },
          })].join('\n\n'),
        };
      });
  });
}

/** المتاجر المعلّقة (مع أول ١٠ منتجات) */
async function storeJobs({ db }: Ctx): Promise<Job[]> {
  const picked = await fresh(db, 'review_partner', 'store', (from, to) => rows(db.from('brands')
    .select('id, owner, name, tagline, description, category, city, website, instagram, created_at')
    .eq('status', 'pending').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 'brands'));
  const people = await profilesOf(db, picked.map((r) => r.owner));
  return picked.map((r) => {
    const locale = localeOf(people.get(String(r.owner)));
    return job({ desk: 'stores', kind: 'review_partner', target_kind: 'store', target_id: String(r.id), title: clean(r.name, 80) || null, locale, partner: 'store' },
      { locale },
      async () => {
        const { data } = await db.from('brand_products').select('name, description, price_sar').eq('brand_id', String(r.id))
          .order('created_at', { ascending: true }).limit(10);
        const products = ((data ?? []) as Row[]).slice(0, 10).map((x) => ({ name: clean(x.name, 80), description: opt(x.description, 300), price_sar: num(x.price_sar) }));
        return {
          images: [],
          text: [today(), writeIn('store owner', 'note', locale), tagged('request', {
            name: clean(r.name, 60), tagline: opt(r.tagline, 120), description: opt(r.description, 600), category: clean(r.category, 20),
            city: opt(r.city, 40), website: opt(r.website, 200), instagram: opt(r.instagram, 30), sent_at: clean(r.created_at, 40), products,
          })].join('\n\n'),
        };
      });
  });
}

/** ملفات المدربين المعلّقة (المعرّف = user_id) */
async function coachJobs({ db }: Ctx): Promise<Job[]> {
  const picked = await fresh(db, 'review_partner', 'coach', async (from, to) => (await rows(db.from('coach_profiles')
    .select('user_id, headline, bio, specialties, years_exp, certifications, languages, trains, city, online, in_person, price_from_sar, instagram, submitted_at')
    .eq('status', 'pending').order('submitted_at', { ascending: true }).order('user_id', { ascending: true }).range(from, to), 'coach_profiles'))
    .map((r) => ({ ...r, id: r.user_id })));
  const people = await profilesOf(db, picked.map((r) => r.user_id));
  return picked.map((r) => {
    const p = people.get(String(r.user_id));
    const locale = localeOf(p);
    const name = clean(p?.full_name, 80) || (clean(p?.username, 40) ? `@${clean(p?.username, 40)}` : '') || clean(r.headline, 80);
    return job({ desk: 'coaches', kind: 'review_partner', target_kind: 'coach', target_id: String(r.user_id), title: name || null, locale, partner: 'coach' },
      { locale },
      async () => ({
        images: [],
        text: [today(), writeIn('coach', 'note', locale), tagged('request', {
          name: opt(p?.full_name, 80), username: opt(p?.username, 40), headline: opt(r.headline, 80), bio: opt(r.bio, 800),
          specialties: strs(r.specialties, 30), years_exp: num(r.years_exp), certifications: opt(r.certifications, 400), languages: strs(r.languages, 10),
          trains: clean(r.trains, 10), city: opt(r.city, 40), online: bool(r.online), in_person: bool(r.in_person),
          price_from_sar: num(r.price_from_sar), instagram: opt(r.instagram, 60), submitted_at: clean(r.submitted_at, 40),
        })].join('\n\n'),
      }));
  });
}

/** مراكز الاستشفاء (اللي سجّلها أصحابها) والملاعب/الاستوديوهات المعلّقة: ٥ بالمجموع، الأقدم أول.
 *  كل طابور يتقلّب لحاله (أقدم ٥ ما انراجعت من كل واحد)، وبعدين ناخذ أقدم ٥ منهم مع بعض */
async function careJobs({ db }: Ctx): Promise<Job[]> {
  const [centers, venues] = await Promise.all([
    fresh(db, 'review_partner', 'center', (from, to) => rows(db.from('recovery_centers')
      .select('id, owner, name, name_en, kind, cities, services, description, phone, website, instagram, license_no, created_at')
      .eq('status', 'pending').eq('listed_by', 'owner').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 'recovery_centers')),
    fresh(db, 'review_partner', 'venue', (from, to) => rows(db.from('venues')
      .select('id, owner, name, city, district, sports, audience, about, phone, website, instagram, open_hour, close_hour, price_sar, created_at')
      .eq('status', 'pending').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 'venues')),
  ]);
  const picked = [...centers.map((row) => ({ tk: 'center' as const, row })), ...venues.map((row) => ({ tk: 'venue' as const, row }))]
    .sort((a, b) => String(a.row.created_at ?? '').localeCompare(String(b.row.created_at ?? ''))).slice(0, PER_RUN);
  const people = await profilesOf(db, picked.map((x) => x.row.owner));
  return picked.map(({ tk, row: r }) => {
    const locale = localeOf(people.get(String(r.owner)));
    const data = tk === 'center'
      ? {
        name: clean(r.name, 80), name_en: opt(r.name_en, 80), kind: clean(r.kind, 20), cities: strs(r.cities, 40, 12), services: strs(r.services, 30, 14),
        description: opt(r.description, 600), phone: opt(r.phone, 20), website: opt(r.website, 200), instagram: opt(r.instagram, 60),
        license_no: opt(r.license_no, 40), sent_at: clean(r.created_at, 40),
      }
      : {
        name: clean(r.name, 80), city: clean(r.city, 40), district: opt(r.district, 60), sports: strs(r.sports, 20, 5), audience: opt(r.audience, 10),
        about: opt(r.about, 500), phone: opt(r.phone, 20), website: opt(r.website, 200), instagram: opt(r.instagram, 60),
        open_hour: num(r.open_hour), close_hour: num(r.close_hour), price_sar: num(r.price_sar), sent_at: clean(r.created_at, 40),
      };
    return job({ desk: 'care', kind: 'review_partner', target_kind: tk, target_id: String(r.id), title: clean(r.name, 80) || null, locale, partner: tk },
      { locale },
      async () => ({ images: [], text: [today(), writeIn(tk === 'center' ? 'center owner' : 'venue owner', 'note', locale), tagged('request', data)].join('\n\n') }));
  });
}

/** التسويق: مسودة تنبيه وحدة (مع آخر ١٥ قالب عشان ما يكررها) */
function marketingJobs({ db, brief }: Ctx): Job[] {
  return [job({ desk: 'marketing', kind: 'draft_nudge', target_kind: null, target_id: null, title: brief ? clean(brief, 80) : null, locale: 'ar' },
    { brief },
    async () => {
      const { data } = await db.from('nudge_templates').select('category, locale, title, body').order('created_at', { ascending: false }).limit(15);
      const existing = ((data ?? []) as Row[]).slice(0, 15)
        .map((t) => ({ category: clean(t.category, 10), locale: clean(t.locale, 2), title: clean(t.title, 80), body: clean(t.body, 240) }));
      return {
        images: [],
        text: [
          today(),
          tagged('existing_templates', existing),
          brief ? tagged('owner_brief', brief) : 'The owner gave no brief: pick the category and message that would help most.',
          'Write the nudge JSON now.',
        ].join('\n\n'),
      };
    })];
}

/** استهلاك الذكاء الاصطناعي لآخر ٧ أيام لكل نوع: كم مرة، كم مستخدم، كم يوم-مستخدم وصل الحد، ومتوسط اليوم */
export function aggregateUsage(list: Row[], caps: Record<string, number>) {
  const by = new Map<string, { uses: number; users: Set<string>; days: Map<string, number> }>();
  for (const k of ['meal_photo', 'barcode']) by.set(k, { uses: 0, users: new Set(), days: new Map() });
  for (const r of list) {
    const kind = clean(r.kind, 20);
    const at = Date.parse(String(r.created_at ?? ''));
    if (!kind || !Number.isFinite(at)) continue;
    const g = by.get(kind) ?? { uses: 0, users: new Set<string>(), days: new Map<string, number>() };
    by.set(kind, g);
    const uid = String(r.user_id);
    g.uses++; g.users.add(uid);
    const key = `${uid}|${riyadhDay(at)}`;
    g.days.set(key, (g.days.get(key) ?? 0) + 1);
  }
  const out: Record<string, { cap: number | null; uses: number; users: number; capped_user_days: number | null; avg_per_user_day: number }> = {};
  for (const kind of [...by.keys()].sort()) {
    const g = by.get(kind)!;
    const cap = caps[kind] ?? null;
    out[kind] = {
      cap, uses: g.uses, users: g.users.size,
      capped_user_days: cap === null ? null : [...g.days.values()].filter((n) => n >= cap).length,
      avg_per_user_day: g.days.size ? Math.round((g.uses / g.days.size) * 10) / 10 : 0,
    };
  }
  return out;
}

/** مكتب الذكاء الاصطناعي: الحدود الحالية + استهلاك آخر ٧ أيام (ينحفظ بالمهمة عشان المالك يشوف على وش انبنى الاقتراح) */
async function aiJobs({ db }: Ctx): Promise<Job[]> {
  const { data: setting, error } = await db.from('app_settings').select('value').eq('key', 'ai_limits').maybeSingle();
  if (error) { console.error('office_read_failed', 'app_settings', error.message); throw new Error('busy'); }
  const v = ((setting as Row | null)?.value ?? {}) as Row;
  const lim = (x: unknown, d: number) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : d);
  const current = { barcode_per_day: lim(v.barcode_per_day, 2), meal_photos_per_day: lim(v.meal_photos_per_day, 25) };

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const all: Row[] = [];
  for (let from = 0; from < USAGE_MAX; from += USAGE_PAGE) {
    const page = await rows(db.from('ai_usage').select('user_id, kind, created_at').gte('created_at', since)
      .order('id', { ascending: true }).range(from, from + USAGE_PAGE - 1), 'ai_usage');
    all.push(...page);
    if (page.length < USAGE_PAGE) break;
  }
  const usage = aggregateUsage(all.slice(0, USAGE_MAX), { meal_photo: current.meal_photos_per_day, barcode: current.barcode_per_day, ...FIXED_CAPS });
  return [job({ desk: 'ai', kind: 'review_ai_limits', target_kind: null, target_id: null, title: null, locale: 'ar' },
    { current, usage },
    async () => ({
      images: [],
      text: [today(), `Current limits: ${JSON.stringify(current)}`, `Usage in the last 7 days (${all.length} uses${all.length >= USAGE_MAX ? ', truncated' : ''}):\n${JSON.stringify(usage, null, 1)}`,
        'Write the limits JSON now.'].join('\n\n'),
    }))];
}

/** المدير: أرقام اليوم (كل مصدر لحاله: لو تعطّل يصير null وما يوقف الباقي) */
async function leadNumbers({ db, user }: Ctx) {
  const safe = async <T,>(f: () => PromiseLike<T> | T): Promise<T | null> => { try { return await f(); } catch { return null; } };
  const count = (table: string, filters: [string, unknown][]) => safe(async () => {
    let q = db.from(table).select('*', { count: 'exact', head: true });
    for (const [c, v] of filters) q = q.eq(c, v);
    const { count, error } = await q;
    return error ? null : count ?? 0;
  });
  const now = Date.now();
  const day = riyadhDay(now);
  const [newReports, clubs, stores, coaches, centers, venues, users, waiting, activity, events, ads] = await Promise.all([
    count('beta_feedback', [['status', 'new']]),
    count('club_requests', [['status', 'pending']]),
    count('brands', [['status', 'pending']]),
    count('coach_profiles', [['status', 'pending']]),
    count('recovery_centers', [['status', 'pending'], ['listed_by', 'owner']]),
    count('venues', [['status', 'pending']]),
    // إحصائيات المستخدمين للإدارة بس: بتوكن المالك
    safe(async () => {
      const { data, error } = await user.rpc('admin_user_stats');
      const r = (Array.isArray(data) ? data[0] : data) as Row | null;
      if (error || !r) return null;
      return { total: num(r.total), trainees: num(r.trainees), partners: num(r.partners), new_7d: num(r.new_7d), active_7d: num(r.active_7d), unconfirmed: num(r.unconfirmed) };
    }),
    safe(async () => {
      const { data, error } = await db.from('office_tasks').select('desk').eq('status', 'waiting_approval').limit(1000);
      if (error) return null;
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as Row[]) { const d = clean(r.desk, 12); out[d] = (out[d] ?? 0) + 1; }
      return out;
    }),
    safe(async () => {
      const { data, error } = await db.from('admin_log').select('kind, action, created_at').order('created_at', { ascending: false }).limit(15);
      return error ? null : ((data ?? []) as Row[]).map((r) => ({ kind: clean(r.kind, 20), action: clean(r.action, 30), at: clean(r.created_at, 40) }));
    }),
    safe(async () => {
      const { data, error } = await db.from('local_events').select('starts_on, ends_on').eq('active', true).limit(500);
      if (error) return null;
      // اللي ما خلصت: آخر يوم (أو أول يوم لو ما له نهاية) اليوم أو بعده، أو بدون تاريخ
      return ((data ?? []) as Row[]).filter((e) => { const end = (e.ends_on ?? e.starts_on) as string | null; return !end || String(end).slice(0, 10) >= day; }).length;
    }),
    safe(async () => {
      const { data, error } = await db.from('launch_ads').select('starts_at, ends_at').eq('active', true).limit(500);
      if (error) return null;
      return ((data ?? []) as Row[]).filter((a) => (!a.ends_at || Date.parse(String(a.ends_at)) > now) && (!a.starts_at || Date.parse(String(a.starts_at)) <= now)).length;
    }),
  ]);
  return {
    date: day,
    new_reports: newReports,
    pending_requests: { clubs, stores, coaches, centers, venues },
    users,
    waiting_for_your_approval: waiting,
    recent_owner_activity: activity,
    upcoming_events: events,
    live_ads: ads,
  };
}

function leadJobs(c: Ctx): Job[] {
  return [job({ desk: 'lead', kind: 'daily_brief', target_kind: null, target_id: null, title: null, locale: 'ar' },
    {},
    async () => ({ images: [], text: [today(), tagged('numbers', await leadNumbers(c)), 'Write the brief JSON now.'].join('\n\n') }))];
}

/** شغل المكتب. users ما له وكيل (يتحقق منه الطلب قبل) */
export function collectJobs(desk: DeskId, c: Ctx): Promise<Job[]> | Job[] {
  switch (desk) {
    case 'reports': return reportJobs(c);
    case 'clubs': return clubJobs(c);
    case 'stores': return storeJobs(c);
    case 'coaches': return coachJobs(c);
    case 'care': return careJobs(c);
    case 'marketing': return marketingJobs(c);
    case 'ai': return aiJobs(c);
    case 'lead': return leadJobs(c);
    default: return [];
  }
}
