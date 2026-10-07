// ===================== الثوابت =====================
const PROJECT = 'hfplqbnbuskiaeblxpfo';
const SERVER = 'Supabase';
const TOOL = 'execute_sql';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTNER_KINDS = ['club', 'store', 'coach', 'center', 'venue'];
const AGENT_DESKS = ['lead', 'clubs', 'stores', 'coaches', 'care', 'reports', 'marketing', 'ai'];
const REPORT_STATUSES = ['new', 'seen', 'fixed', 'wontfix'];
const REPORT_FINAL = ['seen', 'fixed', 'wontfix'];
const NUDGE_CATS = ['gym', 'friend', 'streak', 'workout', 'meal'];
const NUDGE_WHO = ['all', 'male', 'female'];
const LANGS = ['ar', 'en'];
const NUDGE_VARS = { gym: ['name', 'gym'], friend: ['name', 'friend', 'gym'], streak: ['name', 'streak', 'gym'], workout: ['name', 'workout'], meal: ['name'] };
const LIMIT_MAX = { barcode_per_day: 100, meal_photos_per_day: 200 };
const NOTE_MAX = 300;
const REPLY_MAX = 1000;
const BRIEF_MAX = 300;
const STALE_MS = 15 * 60_000; // نفس AGENT_STALE_MS بالتطبيق: مهمة «شغّالة» أقدم من كذا وقفت
const REFRESH_MS = 60_000;
const POLL_MS = 4000;
const POLL_FOR_MS = 120_000;
/** رموز أخطاء دوال القاعدة (docs/office-web.md) — نطابقها بـ \b في نص الخطأ */
const DB_CODES = ['not_waiting', 'already_decided', 'bad_input', 'note_required', 'bad_nudge', 'bad_status', 'request_not_found',
  'report_not_found', 'choose_admin', 'not_allowed', 'agent_unavailable', 'agent_not_configured', 'rate_limited'];
/** أخطاء الموصّل اللي معناها «ما فيه اتصال» على مستوى الصفحة كلها */
const CONN_CODES = {
  server_not_connected: 'server_not_connected', needs_reauth: 'needs_reauth', selection_required: 'selection_required',
  not_in_manifest: 'denied', consent_required: 'denied', blocked_by_policy: 'policy', approval_required: 'policy',
  not_granted: 'disabled', capability_disabled: 'disabled', capability_removed: 'disabled', server_not_found: 'server_not_connected',
  user_changed: 'user_changed',
};

// المكاتب: شبكة ٥×٣ على الأرضية، المدير في النص، والزاوية القريبة من الكاميرا (٢،١) جلسة استراحة
// row -1 = آخر المكتب (فوق بالشاشة)، row 1 = أقرب للكاميرا. نفس ألوان القمصان بالتطبيق + ألوان للمكاتب الجديدة
const DESKS = [
  { id: 'clubs', icon: 'building', col: -2, row: -1, shirt: '#F1551D', kinds: ['club'] },
  { id: 'stores', icon: 'store', col: -1, row: -1, shirt: '#5B8DEF', kinds: ['store'] },
  { id: 'coaches', icon: 'user', col: 0, row: -1, shirt: '#2E9E6A', kinds: ['coach'] },
  { id: 'care', icon: 'medkit', col: 1, row: -1, shirt: '#3FA7A0', kinds: ['center', 'venue'] },
  { id: 'bookings', icon: 'calendar', col: 2, row: -1, shirt: '#C9822B', kinds: [] },
  { id: 'reports', icon: 'bug', col: -2, row: 0, shirt: '#E06C75', kinds: [] },
  { id: 'lead', icon: 'briefcase', col: 0, row: 0, shirt: '#0A332D', kinds: [] },
  { id: 'orders', icon: 'bag', col: 2, row: 0, shirt: '#B98A1E', kinds: [] },
  { id: 'marketing', icon: 'megaphone', col: -2, row: 1, shirt: '#FEA94F', kinds: [] },
  { id: 'activity', icon: 'users', col: -1, row: 1, shirt: '#8E6CC8', kinds: [] },
  { id: 'community', icon: 'chat', col: 0, row: 1, shirt: '#C2588F', kinds: [] },
  { id: 'ai', icon: 'sparkles', col: 1, row: 1, shirt: '#2F4B3C', kinds: [] },
];
const DESK = Object.fromEntries(DESKS.map((d) => [d.id, d]));
const KIND_DESK = { club: 'clubs', store: 'stores', coach: 'coaches', center: 'care', venue: 'care' };
/** مكتب «المتدربين» بالتطبيق صار مكتب «النشاط» بالويب */
const deskOf = (id) => (id === 'users' ? 'activity' : DESK[id] ? id : 'lead');

// ===================== أدوات صغيرة =====================
const $ = (id) => document.getElementById(id);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const get = (o, path) => path.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
const n = (o, path) => num(get(o, path));

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(`arqOffice.${key}`);
    if (val === null) localStorage.removeItem(`arqOffice.${key}`); else localStorage.setItem(`arqOffice.${key}`, val);
  } catch (e) { /* التخزين ممكن يكون مقفول: مو مشكلة */ }
  return null;
}

/** عنصر DOM: النصوص دايماً textContent (كل البيانات من القاعدة نعاملها كنص غير موثوق) */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && isObj(v)) Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(3)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// أيقونات خطية بسيطة (مرسومة هنا لأن الصفحة ما تقدر تحمّل صور من برّا)
const ICONS = {
  building: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4',
  store: 'M3 9l1.6-5h14.8L21 9M3 9v11h18V9M3 9h18M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-5h6v5',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  medkit: 'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 7V4h6v3M12 11v6M9 14h6',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2',
  bug: 'M8 9a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0zM12 11v8M4 13h4M16 13h4M5 7l3 2M19 7l-3 2M5 19l3-2M19 19l-3-2M10 4l1 1.5M14 4l-1 1.5',
  briefcase: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  bag: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13',
  chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',
  sparkles: 'M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1-2.1-.9 2.1-.9z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  check: 'M20 6L9 17l-5-5', x: 'M18 6L6 18M6 6l12 12',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  cube: 'M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7L12 12l8.7-5M12 22V12',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  play: 'M6 4l14 8-14 8z', up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M19 12l-7 7-7-7',
  arrowEnd: 'M5 12h14M12 5l7 7-7 7', db: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};
function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `ic ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  svg.append(p);
  return svg;
}

// ===================== الحالة =====================
const SAMPLE = (() => {
  try { return JSON.parse(document.getElementById('office-sample').textContent); } catch (e) { return null; }
})();
const clone = (v) => JSON.parse(JSON.stringify(v));
const savedTheme = store('theme');
const state = {
  lang: store('lang') === 'en' ? 'en' : 'ar',
  theme: savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null,
  days: store('days') === '30' ? 30 : 7,
  desk: DESK[store('desk')] ? store('desk') : 'lead',
  tab: ['all', 'waiting', 'working', 'done'].includes(store('tab')) ? store('tab') : 'waiting',
  deskOnly: store('deskOnly') === '1',
  view: store('view') === 'grid' ? 'grid' : '3d',
  can3d: true,
  /** connecting | live | sample | error */
  mode: 'connecting',
  conn: null, // { kind, raw } لما يكون فيه مشكلة اتصال
  isSample: true, // البيانات اللي على الشاشة تجريبية (SAMPLE) مو من القاعدة — ما نقدّمها أبد كبيانات حية
  readOnly: false,
  data: null, // نتيجة office_overview
  tasks: null, // صفوف office_tasks
  errs: { overview: null, tasks: null },
  updatedAt: null,
  busyRefresh: false,
  sampleStart: Date.now(),
  run: null, // { desk, started, known:Set, newIds:[], phase:'queued'|'waiting'|'done'|'none'|'error', err }
  drafts: {}, // مسودات النماذج في لوحة المكتب: key → { mode, note, status }
  itemBusy: {}, // key → true
  itemErr: {}, // key → رسالة
  sheet: null, // { id, draft, rejecting, note, busy, err, errCode }
  adminId: UUID_RE.test(store('adminId') || '') ? store('adminId') : null,
  needAdmin: false,
  fresh: new Set(),
};
let mcp = null;

/** «الحين»: مع البيانات التجريبية الوقت هو وقت إنشائها (عشان «قبل كم دقيقة» تطلع منطقية) */
function clock() {
  if (!state.isSample || !SAMPLE) return Date.now();
  const base = Date.parse(get(SAMPLE, 'overview.meta.generated_at')) || Date.now();
  return base + (Date.now() - state.sampleStart);
}

// ===================== اللغة والتنسيق =====================
function t(key, vars) {
  let s = (I18N[state.lang] && I18N[state.lang][key]) ?? I18N.ar[key] ?? key;
  // بالعربي: القيم اللي ما فيها حروف عربية (أرقام، نسب، أسماء إنجليزية) نعزلها عشان ما يتلخبط ترتيبها (7.8% مو %7.8)
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : state.lang === 'ar' && !/[\u0600-\u06FF]/.test(String(vars[k])) ? `\u2066${vars[k]}\u2069` : String(vars[k])));
  return s;
}
/** نص ثنائي اللغة من الوكيل {ar, en} */
function L(bi) {
  if (typeof bi === 'string') return bi;
  if (!isObj(bi)) return '';
  const v = bi[state.lang];
  return typeof v === 'string' && v.trim() ? v : str(bi.ar || bi.en);
}
const NF = new Intl.NumberFormat('en-US');
const NF1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const NFC = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
/** أرقام لاتينية دايماً، ومختصرة من ١٠ آلاف وفوق */
function fmt(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return Math.abs(v) >= 10000 ? NFC.format(v) : Number.isInteger(v) ? NF.format(v) : NF1.format(v);
}
const sar = (v) => t('sar_v', { n: fmt(v) });
const locale = () => (state.lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
function fmtDate(v, withYear) {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? Date.parse(`${v}T12:00:00+03:00`) : Date.parse(str(v));
  if (!Number.isFinite(ms)) return '';
  const o = { day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' };
  if (withYear) o.year = 'numeric';
  try { return new Intl.DateTimeFormat(locale(), o).format(ms); } catch (e) { return new Date(ms).toISOString().slice(0, 10); }
}
function fmtTime(v) {
  const ms = Date.parse(str(v));
  if (!Number.isFinite(ms)) return '';
  try { return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(ms); } catch (e) { return ''; }
}
/** «قبل ٥ دقايق» / «بعد يومين» بأرقام لاتينية */
function ago(v) {
  const ms = Date.parse(str(v));
  if (!Number.isFinite(ms)) return '';
  const s = Math.round((clock() - ms) / 1000);
  const a = Math.abs(s);
  if (a < 45) return t('just_now');
  let rtf;
  try { rtf = new Intl.RelativeTimeFormat(state.lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto', style: 'short' }); } catch (e) { return fmtDate(v); }
  if (a < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (a < 86400 * 21) return rtf.format(-Math.round(s / 86400), 'day');
  return fmtDate(v, true);
}

// ===================== قيم SQL آمنة (ما نلصق أي مدخل خام) =====================
class ArgError extends Error {}
const lit = {
  uuid(v) {
    if (typeof v !== 'string' || !UUID_RE.test(v)) throw new ArgError('uuid');
    return `'${v.toLowerCase()}'::uuid`;
  },
  /** قيمة من قائمة ثابتة (كلها [a-z_]) */
  oneOf(v, list) {
    if (!list.includes(v) || !/^[a-z_]+$/.test(v)) throw new ArgError('enum');
    return `'${v}'`;
  },
  int(v, lo, hi) {
    const x = Math.round(Number(v));
    if (!Number.isFinite(x)) throw new ArgError('int');
    return String(Math.min(hi, Math.max(lo, x)));
  },
  /** نص عادي: نشيل \0 ونضاعف ' (standard_conforming_strings شغّال، فالـ \ حرف عادي) */
  text(v) {
    if (v === null || v === undefined) return 'null';
    return `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
  },
  json(v) {
    const s = JSON.stringify(v, (k, x) => (typeof x === 'string' ? x.replace(/\u0000/g, '') : x));
    if (typeof s !== 'string') throw new ArgError('json');
    return `'${s.replace(/'/g, "''")}'::jsonb`;
  },
};
const Q = {
  overview: (days) => `select office_overview(${lit.int(days, 1, 90)}) as o`,
  tasks: () => `select office_admin.tasks(150) as t`,
  apply: (id, final) => `select office_admin.apply(${lit.uuid(id)}, ${lit.json(final)}) as r`,
  reject: (id, note) => `select office_admin.reject(${lit.uuid(id)}, ${note ? lit.text(note) : 'null'}) as r`,
  review: (kind, id, decision, note) =>
    `select office_admin.review(${lit.oneOf(kind, PARTNER_KINDS)}, ${lit.uuid(id)}, ${lit.oneOf(decision, ['approve', 'reject'])}, ${note ? lit.text(note) : 'null'}) as r`,
  report: (id, status, note) => `select office_admin.report(${lit.uuid(id)}, ${lit.oneOf(status, REPORT_STATUSES)}, ${note ? lit.text(note) : 'null'}) as r`,
  runAgent: (desk, brief) => `select office_admin.run_agent(${lit.oneOf(desk, AGENT_DESKS)}, ${brief ? lit.text(brief) : 'null'}) as r`,
};
/** مع أكثر من مدير: نحدد المدير في نفس الاستعلام (set_config داخل from يتنفّذ قبل الدالة) */
function asAdmin(q) {
  if (!state.adminId || !q.includes('office_admin.')) return q;
  return `${q} from (select set_config('office.admin_id', ${lit.text(state.adminId)}, true)) as _a`;
}

// ===================== الموصّل =====================
/** يطلّع مصفوفة الصفوف من رد execute_sql: النص بين <untrusted-data-ID> و </untrusted-data-ID>.
 * أول وسم بالنص يجي من المقدمة («within the below <untrusted-data-ID> boundaries») قبل أي بيانات، فناخذ منه المعرّف
 * (uuid عشوائي ما يعرفه أحد) ونقبل بس البلوك اللي بنفس المعرّف: من وسم الفتح اللي بعده لين آخر وسم قفل (البلوك الخارجي).
 * أي وسوم مزيّفة داخل نصوص القاعدة تبقى جزء من JSON. لو الشكل غير كذا: null (ما نخمّن) */
function between(txt) {
  const m = /<untrusted-data-([A-Za-z0-9_-]+)>/.exec(txt);
  if (!m) return null;
  const open = `<untrusted-data-${m[1]}>`;
  const end = txt.lastIndexOf(`</untrusted-data-${m[1]}>`);
  if (end < m.index) return null;
  // لو فيه وسم فتح ثاني بنفس المعرّف قبل القفل فالأول كان ذكره بالمقدمة والبيانات تبدأ من الثاني
  const next = txt.indexOf(open, m.index + open.length);
  const start = (next >= 0 && next < end ? next : m.index) + open.length;
  try { const v = JSON.parse(txt.slice(start, end).trim()); return Array.isArray(v) ? v : null; } catch (e) { return null; }
}
function rowsFromText(s) {
  let txt = s;
  for (let i = 0; i < 3 && typeof txt === 'string'; i++) {
    // نص مغلّف بعلامات تنصيص (JSON string): نفكّه أول قبل ما ندوّر على الوسوم
    if (txt.trim().startsWith('"')) { try { const v = JSON.parse(txt); if (typeof v === 'string') { txt = v; continue; } } catch (e) { /* مو JSON */ } }
    const rows = between(txt);
    if (rows) return rows;
    // النص نفسه ممكن يكون JSON (مصفوفة، أو نص مغلّف بعلامات تنصيص)
    try {
      const v = JSON.parse(txt);
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { txt = v; continue; }
      if (isObj(v) && Array.isArray(v.rows)) return v.rows;
      if (isObj(v) && typeof v.result === 'string') { txt = v.result; continue; }
    } catch (e) { /* مو JSON */ }
    break;
  }
  return null;
}
function rowsFrom(res) {
  const cands = [];
  if (res && res.payload !== undefined) cands.push(res.payload);
  for (const b of arr(res && res.content)) if (b && b.type === 'text') cands.push(b.text);
  for (const c of cands) {
    if (Array.isArray(c)) return c;
    if (isObj(c) && Array.isArray(c.rows)) return c.rows;
    if (typeof c === 'string') { const r = rowsFromText(c); if (r) return r; }
  }
  const e = new Error('unreadable_result');
  e.code = 'unreadable_result';
  throw e;
}
/** قيمة العمود الوحيد في الصف الأول (jsonb ممكن يجي كائن أو نص) */
function cell(rows, col) {
  const v = rows && rows[0] ? rows[0][col] : undefined;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } }
  return v;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** استعلام واحد. القراءات بس تنعاد مرة وحدة لو الخطأ مختوم retryable */
async function sql(query, { read = false } = {}) {
  if (!mcp) { const e = new Error('no_mcp'); e.code = 'not_granted'; throw e; }
  // الحساب تغيّر: ما نرسل شي بعدها أبد (لين تنفتح الصفحة من جديد)
  if (state.conn && state.conn.kind === 'user_changed') { const e = new Error('user_changed'); e.code = 'user_changed'; throw e; }
  const q = asAdmin(query);
  try {
    return rowsFrom(await mcp.callTool(SERVER, TOOL, { project_id: PROJECT, query: q }, { cache: false }));
  } catch (e) {
    if (read && e && e.retryable === true) {
      await sleep(Math.min(60_000, e.retryAfterMs || 0) + 400 + Math.random() * 900);
      return rowsFrom(await mcp.callTool(SERVER, TOOL, { project_id: PROJECT, query: q }, { cache: false }));
    }
    throw e;
  }
}
const errText = (e) => [e && e.message, e && e.result ? (() => { try { return JSON.stringify(e.result); } catch (x) { return ''; } })() : ''].filter(Boolean).join(' ');
/** رمز الخطأ: من القاعدة (not_waiting…) أو حالات معروفة (read-only، صلاحيات، الدوال ناقصة) */
function dbCode(e) {
  if (e instanceof ArgError) return 'bad_input';
  const txt = errText(e);
  for (const c of DB_CODES) if (new RegExp(`\\b${c}\\b`).test(txt)) return c;
  if (/read-only transaction|read only transaction/i.test(txt)) return 'read_only';
  if (/permission denied/i.test(txt)) return 'permission_denied';
  if (/(office_overview|office_admin)[\s\S]{0,80}does not exist|schema "office_admin" does not exist/i.test(txt)) return 'not_installed';
  if (e && e.code === 'unreadable_result') return 'unknown_result';
  return null;
}
/** نص خطأ نعرضه في القسم المتأثر: رسالة مفهومة + النص الخام (مقصوص) */
function errInfo(e) {
  const code = dbCode(e);
  const raw = str(e && e.message).replace(/\s+/g, ' ').trim().slice(0, 300);
  return { code, msg: code ? t(`err_${code}`) : t('err_generic'), raw: code && code !== 'unknown_result' ? '' : raw };
}
/** خطأ اتصال على مستوى الصفحة؟ */
function connKind(e) {
  if (!e || !e.code) return null;
  if (e.code === 'tool_error') return null;
  if (CONN_CODES[e.code]) return CONN_CODES[e.code];
  if (e.code === 'server_unavailable' || e.code === 'upstream_error' || e.code === 'rate_limited') return 'unavailable';
  return null;
}

// ===================== حالة المهام والمكاتب =====================
const isOpenStatus = (s) => s === 'scheduled' || s === 'in_progress' || s === 'waiting_approval';
const isStale = (task) => (task.status === 'scheduled' || task.status === 'in_progress') && clock() - Date.parse(task.created_at) > STALE_MS;
/** waiting | working | done | failed */
function phase(task) {
  if (task.status === 'waiting_approval') return 'waiting';
  if (task.status === 'scheduled' || task.status === 'in_progress') return isStale(task) ? 'failed' : 'working';
  if (task.status === 'failed') return 'failed';
  return 'done';
}
const AGENT_KIND = { triage_report: 'agent_report', review_partner: 'agent_partner', draft_nudge: 'agent_nudge', review_ai_limits: 'agent_limits', daily_brief: 'agent_brief' };
function kindLabel(task) {
  if (phase(task) === 'failed') return t('kind_agent_failed');
  return t(`kind_${AGENT_KIND[task.kind] || 'agent_brief'}`);
}
/** اسم المهمة: عنوانها، أو اسم العنصر، أو عنوان التنبيه المقترح، أو عنوان ملخص اليوم */
function taskName(task) {
  const o = isObj(task.output) ? task.output : {};
  if (task.kind === 'daily_brief' && o.headline) return L(o.headline);
  if (task.title) return str(task.title);
  const items = arr(get(state.data, 'partners.items')).concat(arr(get(state.data, 'reports.latest_new')));
  const it = items.find((x) => x && x.id === task.target_id);
  if (it) return str(it.name || it.message);
  if (task.kind === 'draft_nudge' && isObj(o.template) && o.template.title) return str(o.template.title);
  return kindLabel(task);
}
function taskWhen(task) { return task.decided_at || task.finished_at || task.created_at; }

/** عدّادات كل مكتب: ينتظرك (مهام الوكيل + العناصر اللي بدون مهمة وكيل)، شغّال، منتهي، تحتاج نظرة */
function deskStates() {
  const o = state.data || {};
  const tasks = arr(state.tasks);
  const st = Object.fromEntries(DESKS.map((d) => [d.id, { waiting: 0, working: 0, done: 0, alert: 0 }]));
  for (const task of tasks) {
    const d = deskOf(task.desk);
    const p = phase(task);
    if (p === 'waiting') st[d].waiting++; else if (p === 'working') st[d].working++; else st[d].done++;
  }
  // طلبات الشركاء والتقارير الجديدة اللي ما عليها مهمة وكيل مفتوحة = تنتظر قرارك يدوي.
  // القاعدة تعدّ المغطّى على كل العناصر (pending_covered / new_covered)؛ القوائم مقصوصة (25 و20)، فنعدّ منها بس لو المفتاح ناقص (قاعدة أقدم)
  const has = (path) => typeof get(o, path) === 'number';
  const openAgent = (x) => x && x.agent_task && isOpenStatus(x.agent_task.status);
  const items = arr(get(o, 'partners.items'));
  for (const k of PARTNER_KINDS) {
    const covered = has(`partners.pending_covered.${k}`) ? n(o, `partners.pending_covered.${k}`) : items.filter((x) => openAgent(x) && x.kind === k).length;
    st[KIND_DESK[k]].waiting += Math.max(0, n(o, `partners.pending.${k}`) - covered);
  }
  const repCovered = has('reports.new_covered') ? n(o, 'reports.new_covered') : arr(get(o, 'reports.latest_new')).filter(openAgent).length;
  st.reports.waiting += Math.max(0, n(o, 'reports.by_status.new') - repCovered);
  if (state.run && (state.run.phase === 'queued' || state.run.phase === 'waiting') && st[state.run.desk]) st[state.run.desk].working++;
  // تنبيهات (ما تحتاج قرار من هنا بس تستاهل نظرة)
  st.bookings.alert = arr(get(o, 'bookings.attention')).filter((x) => x && x.priority === 1).length;
  st.activity.alert = n(o, 'activity.errors.today');
  st.community.alert = n(o, 'community.moderation.reported.open') + n(o, 'community.challenges.ended_unsettled');
  st.orders.alert = n(o, 'store.products.sold_out');
  st.marketing.alert = (o.marketing && n(o, 'marketing.ads.live_marketing') === 0 ? 1 : 0) + n(o, 'marketing.events.past_still_active');
  // المدير: كل اللي ينتظر موافقتك من المكاتب يوصله
  st.lead.waiting = DESKS.reduce((a, d) => a + (d.id === 'lead' ? st.lead.waiting : st[d.id].waiting), 0);
  return st;
}

// ===================== مسودات الموافقة (نفس منطق officeAgentsCore.ts) =====================
function validNudgeText(category, title, body) {
  const allowed = NUDGE_VARS[category];
  if (!allowed || typeof title !== 'string' || typeof body !== 'string') return false;
  for (const s of [title, body]) {
    const rest = s.replace(/\{([^{}]*)\}/g, (m, k) => (allowed.includes(k) ? '' : '\u0000'));
    if (/[{}\u0000]/.test(rest)) return false;
  }
  const a = title.trim(), b = body.trim();
  return a.length >= 1 && a.length <= 80 && b.length >= 3 && b.length <= 240;
}
function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
function draftFrom(task) {
  const o = isObj(task.output) ? task.output : null;
  if (!o) return null;
  switch (task.kind) {
    case 'triage_report': return { status: REPORT_FINAL.includes(o.status) ? o.status : 'seen', reply: str(o.reply) };
    // رسالة الشريك توصله مع الرفض بس، فمع توصية القبول تبدأ فاضية
    case 'review_partner': return { decision: o.recommendation === 'reject' ? 'reject' : 'approve', note: o.recommendation === 'reject' ? str(o.note) : '' };
    case 'draft_nudge': return isObj(o.template) ? { template: { category: str(o.template.category), gender: str(o.template.gender), locale: str(o.template.locale), title: str(o.template.title), body: str(o.template.body) } } : null;
    case 'review_ai_limits': return { barcode_per_day: str(o.barcode_per_day), meal_photos_per_day: str(o.meal_photos_per_day) };
    default: return null;
  }
}
/** يتحقق من مسودتك قبل ما تنرسل (القاعدة تتحقق بعد بنفسها) */
function prepareFinal(kind, d) {
  if (!isObj(d)) return { error: 'final_bad' };
  switch (kind) {
    case 'triage_report': {
      if (!REPORT_FINAL.includes(d.status) || typeof d.reply !== 'string') return { error: 'final_bad' };
      const reply = d.reply.trim();
      if (reply.length > REPLY_MAX) return { error: 'final_reply' };
      return { final: { status: d.status, reply } };
    }
    case 'review_partner': {
      if (!['approve', 'reject'].includes(d.decision)) return { error: 'final_bad' };
      const note = str(d.note).trim().slice(0, NOTE_MAX).trim();
      if (d.decision === 'reject' && note.length < 3) return { error: 'note_required' };
      return { final: { decision: d.decision, note: d.decision === 'reject' ? note : '' } };
    }
    case 'draft_nudge': {
      const tp = d.template;
      if (!isObj(tp) || !NUDGE_CATS.includes(tp.category) || !NUDGE_WHO.includes(tp.gender) || !LANGS.includes(tp.locale)) return { error: 'final_bad' };
      if (!validNudgeText(tp.category, str(tp.title), str(tp.body))) return { error: 'bad_nudge' };
      return { final: { template: { category: tp.category, gender: tp.gender, locale: tp.locale, title: str(tp.title).trim(), body: str(tp.body).trim() } } };
    }
    case 'review_ai_limits': {
      const a = toNum(d.barcode_per_day), b = toNum(d.meal_photos_per_day);
      if (a === null || b === null) return { error: 'final_bad' };
      const c = (x, hi) => Math.max(0, Math.min(hi, Math.round(x)));
      return { final: { barcode_per_day: c(a, LIMIT_MAX.barcode_per_day), meal_photos_per_day: c(b, LIMIT_MAX.meal_photos_per_day) } };
    }
    default: return { error: 'final_bad' };
  }
}

// ===================== المعاينة: نفس الإجراءات بس على نسخة محلية =====================
function sampleData() {
  const base = state.days === 30 && SAMPLE && SAMPLE.overview_30 ? SAMPLE.overview_30 : SAMPLE && SAMPLE.overview;
  return base ? clone(base) : null;
}
function recountOffice() {
  const o = state.data;
  if (!o || !o.office) return;
  const zero = () => ({ scheduled: 0, in_progress: 0, waiting_approval: 0, done: 0, failed: 0 });
  const by = zero();
  const desk = {};
  for (const task of arr(state.tasks)) {
    if (by[task.status] === undefined) continue;
    by[task.status]++;
    desk[task.desk] = desk[task.desk] || zero();
    desk[task.desk][task.status]++;
  }
  o.office.by_status = by;
  o.office.by_desk = Object.assign(o.office.by_desk || {}, desk);
  o.office.waiting_total = by.waiting_approval;
  o.office.working_total = by.scheduled + by.in_progress;
  const w = arr(state.tasks).filter((x) => x.status === 'waiting_approval').map((x) => x.created_at).sort();
  o.office.oldest_waiting_at = w[0] || null;
}
/** عنصر طلع من «المغطّى بوكيل» (انقرّر أو انقفلت مهمته): ننقص عدّاده لو موجود */
function simUncover(kind) {
  const o = state.data;
  if (kind === 'report') { if (typeof get(o, 'reports.new_covered') === 'number') o.reports.new_covered = Math.max(0, o.reports.new_covered - 1); }
  else if (typeof get(o, `partners.pending_covered.${kind}`) === 'number') o.partners.pending_covered[kind] = Math.max(0, o.partners.pending_covered[kind] - 1);
}
function simDecideItem(kind, id) {
  const o = state.data;
  const list = kind === 'report' ? arr(get(o, 'reports.latest_new')) : arr(get(o, 'partners.items'));
  const it = list.find((x) => x && x.id === id);
  if (it && it.agent_task) simUncover(kind);
  if (kind === 'report') {
    o.reports.latest_new = arr(o.reports.latest_new).filter((x) => x.id !== id);
    o.reports.by_status.new = Math.max(0, n(o, 'reports.by_status.new') - 1);
  } else {
    o.partners.items = arr(o.partners.items).filter((x) => x.id !== id);
    o.partners.pending[kind] = Math.max(0, n(o, `partners.pending.${kind}`) - 1);
    o.partners.pending_total = Math.max(0, n(o, 'partners.pending_total') - 1);
  }
}
function simTaskDone(task, decision, extra) {
  const now = new Date(clock()).toISOString();
  Object.assign(task, { status: 'done', decision, decided_at: now, updated_at: now, decided_by: task.created_by }, extra);
}
/** يرجّع true لو انطبق محلياً (المعاينة) */
function simulate(action, a) {
  const tasks = arr(state.tasks);
  if (action === 'apply' || action === 'reject') {
    const task = tasks.find((x) => x.id === a.id);
    if (!task || task.status !== 'waiting_approval') throw Object.assign(new Error('not_waiting'), { code: 'tool_error' });
    if (action === 'apply') {
      simTaskDone(task, 'approved', { final: a.final });
      if (task.target_kind === 'report') {
        simDecideItem('report', task.target_id);
        state.data.reports.by_status[a.final.status] = n(state.data, `reports.by_status.${a.final.status}`) + 1;
      } else if (task.target_kind) simDecideItem(task.target_kind, task.target_id);
      if (task.kind === 'review_ai_limits') Object.assign(state.data.ai.limits, a.final);
      if (task.kind === 'draft_nudge') state.data.marketing.nudges.templates_paused = n(state.data, 'marketing.nudges.templates_paused') + 1;
    } else simTaskDone(task, 'rejected', { decision_note: a.note || null });
  } else if (action === 'review' || action === 'report') {
    const kind = action === 'report' ? 'report' : a.kind;
    if (action === 'report' && a.status === 'new') return true;
    simDecideItem(kind, a.id);
    if (action === 'report') state.data.reports.by_status[a.status] = n(state.data, `reports.by_status.${a.status}`) + 1;
  }
  // عناصر باقية ومهمة وكيلها انقفلت: نشيل الربط وتصير تنتظر قرارك يدوي
  const unlink = (x, kind) => {
    const tk = x && x.agent_task ? tasks.find((y) => y.id === x.agent_task.id) : null;
    if (tk && !isOpenStatus(tk.status)) { x.agent_task = null; simUncover(kind); }
  };
  for (const x of arr(get(state.data, 'partners.items'))) unlink(x, x.kind);
  for (const x of arr(get(state.data, 'reports.latest_new'))) unlink(x, 'report');
  recountOffice();
  return true;
}
