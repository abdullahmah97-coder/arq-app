// ===================== تبويب «التطبيق»: طلبات التعديل + المحتوى والإعدادات =====================
// القاعدة: كل قراءة وكتابة من office_admin.* (docs/office-web.md القسم ٧) عن طريق execute_sql مثل باقي الصفحة،
// وكل قيمة بالـ SQL من الأدوات الصارمة (lit). طلبات التعديل تفتح جلسات Claude Code من موصّل «Claude Code Remote»
// (create_session / get_session / send_message). كل تغيير على البيانات الحية بضغطة منك وبعد تأكيد داخل الصفحة.

const CCR = 'Claude Code Remote';
const CCR_ENV = 'env_015h3mhaLk9zRidxQnwSu6fN';
const CCR_REPO = 'https://github.com/abdullahmah97-coder/arq-app';
const CCR_TAGS = ['arq-office-request'];
const SESSION_RE = /^session_[A-Za-z0-9]{8,80}$/;
const SESSION_URL_RE = /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]{8,80}$/;
const PR_URL_RE = /^https:\/\/github\.com\/[^\s"'<>\\]{3,200}$/;
// روابط طلبات الدمج اللي نقبلها من رد الجلسة: نفس المستودع بس، ومن حقول الرد مو من العنوان أو نص الطلب
// (والرابط اللي مكتوب في طلبك نفسه ما ناخذه أبد). أكثر من واحد = الأحدث (أكبر رقم)
const PR_ALL_RE = /https:\/\/github\.com\/abdullahmah97-coder\/arq-app\/pull\/(\d{1,7})(?!\d)/gi;
const PR_SKIP_KEYS = /^(title|prompt|initial_prompt)$/i; // الحقول اللي كتبتها الصفحة نفسها للجلسة
/** ردود ما ندري وش صار فيها (طوّل، انقطع، 5xx): الكتابة يمكن انطبقت، فما نقول «ما صار شي» ولا نعيد بدون ما تشيّك */
const OUTCOME_UNKNOWN = ['server_unavailable', 'upstream_error', 'cancelled'];
const unknownOutcome = (e) => !!e && OUTCOME_UNKNOWN.includes(e.code);
/** أخطاء القاعدة اللي معناها الطلب ما راح ينحفظ مهما أعدت (الإرسال يوقف قبل ما تنفتح جلسة) */
const REQ_DB_BLOCK = ['not_installed', 'permission_denied', 'read_only', 'choose_admin'];
/** طول النص بالحروف (code points) مثل char_length بالقاعدة — .length يعدّ الإيموجي حرفين */
const cpLen = (s) => [...str(s)].length;
const REQ_AREAS = ['app', 'lead', 'clubs', 'stores', 'coaches', 'care', 'reports', 'marketing', 'ai', 'activity', 'bookings', 'orders', 'community'];
const REQ_AREAS_DB = REQ_AREAS.concat('users');
const REQ_STATUSES = ['sent', 'working', 'needs_you', 'review', 'done', 'failed', 'cancelled'];
const REQ_OPEN = ['sent', 'working', 'needs_you', 'review'];
/** status_bucket الجلسة → حالة الطلب (القسم 7.4) */
const BUCKETS = { working: 'working', blocked: 'needs_you', review_ready: 'review', completed: 'done', failed: 'failed' };
const REQ_PILL = { sent: 'plain', working: 'work', needs_you: 'wait', review: 'info', done: 'ok', failed: 'fail', cancelled: 'plain' };
const AD_KINDS = ['ad', 'awareness', 'occasion'];
const AD_AUD = ['all', 'men', 'women'];
const AD_FREQ = ['every_open', 'daily', 'once'];
const AD_STATES = ['live', 'scheduled', 'ended', 'off'];
const EVENT_CATS = ['running', 'horse_racing', 'hiking', 'shooting', 'boxing', 'motorsport', 'cycling', 'football', 'other'];
const PARTNER_ACTIONS = ['hide', 'show', 'partner_on', 'partner_off'];
const USER_KINDS = ['all', 'trainee', 'partner'];
const SETTING_KEYS = ['ai_limits', 'calorie_alert'];
const ACTIVE_FN = { ad: 'set_ad_active', event: 'set_event_active', nudge: 'set_nudge_active' };
const APP_SUBS = ['ads', 'events', 'nudges', 'settings', 'partners', 'users'];
const CONTENT_SUBS = ['ads', 'events', 'nudges', 'settings'];
const USERS_PAGE = 50;
const STATUS_MAX = 10;
const NUDGE_PAGE = 40;
const RIYADH_MS = 3 * 3600_000;
const LINK_RE = /^\/[A-Za-z0-9_/?=&.%[\]-]*$/;
const HTTPS_RE = /^https:\/\/\S+$/;
const CAL_VARS = ['n', 'eaten', 'goal'];
const URL_VARS = { a: '/', b: 'https://' };

Object.assign(ICONS, {
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6M14.5 4l-5 16',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  plus: 'M12 5v14M5 12h14', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  power: 'M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z', branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
});

// ===================== قيم SQL (نفس أدوات lit الصارمة) =====================
const litBool = (v) => { if (typeof v !== 'boolean') throw new ArgError('bool'); return v ? 'true' : 'false'; };
const litOpt = (v) => (v === null || v === undefined || v === '' ? 'null' : lit.text(v));
const okRe = (re, v) => { if (typeof v !== 'string' || !re.test(v)) throw new ArgError('format'); return v; };
const QA = {
  requests: () => 'select office_admin.requests(50) as r',
  addRequest: (title, body, area, sid, url) => `select office_admin.add_request(${lit.text(title)}, ${lit.text(body)}, ${area ? lit.oneOf(area, REQ_AREAS_DB) : 'null'}, ${sid ? lit.text(okRe(SESSION_RE, sid)) : 'null'}, ${url ? lit.text(okRe(SESSION_URL_RE, url)) : 'null'}) as r`,
  updateRequest: (id, status, pr) => `select office_admin.update_request(${lit.uuid(id)}, ${lit.oneOf(status, REQ_STATUSES)}, ${pr ? lit.text(okRe(PR_URL_RE, pr)) : 'null'}) as r`,
  content: () => 'select office_admin.content() as r',
  saveAd: (id, p) => `select office_admin.save_ad(${lit.uuid(id)}, ${lit.json(p)}) as r`,
  saveEvent: (id, p) => `select office_admin.save_event(${id ? lit.uuid(id) : 'null'}, ${lit.json(p)}) as r`,
  saveNudge: (id, p) => `select office_admin.save_nudge(${id ? lit.uuid(id) : 'null'}, ${lit.json(p)}) as r`,
  setActive: (kind, id, v) => { if (!Object.prototype.hasOwnProperty.call(ACTIVE_FN, kind)) throw new ArgError('enum'); return `select office_admin.${ACTIVE_FN[kind]}(${lit.uuid(id)}, ${litBool(v)}) as r`; },
  saveSetting: (key, value) => `select office_admin.save_setting(${lit.oneOf(key, SETTING_KEYS)}, ${lit.json(value)}) as r`,
  partners: (kind, q) => `select office_admin.partners(${lit.oneOf(kind, PARTNER_KINDS)}, ${litOpt(q)}) as r`,
  partnerAction: (kind, id, action, note) => `select office_admin.partner_action(${lit.oneOf(kind, PARTNER_KINDS)}, ${lit.uuid(id)}, ${lit.oneOf(action, PARTNER_ACTIONS)}, ${litOpt(note)}) as r`,
  users: (q, kind, offset) => `select office_admin.users(${litOpt(q)}, ${lit.oneOf(kind, USER_KINDS)}, ${USERS_PAGE}, ${lit.int(offset, 0, 1e7)}) as r`,
  updateUser: (id, name, username) => `select office_admin.update_user(${lit.uuid(id)}, ${litOpt(name)}, ${lit.text(username)}) as r`,
  setVerified: (id, v) => `select office_admin.set_verified(${lit.uuid(id)}, ${litBool(v)}) as r`,
};

// ===================== الحالة =====================
const app = {
  sub: APP_SUBS.includes(store('appSub')) ? store('appSub') : 'ads',
  isSample: true, // اللي على الشاشة من sample.json (معاينة)
  db: null, // نسخة المعاينة اللي تتعدّل محلياً
  requests: null, reqErr: null, reqLoading: false, reqAt: 0, reqSeq: 0,
  content: null, contentErr: null, contentLoading: false, contentSeq: 0,
  partners: { kind: 'club', q: '', qDraft: '', rows: null, err: null, loading: false, key: null, seq: 0 },
  users: { q: '', qDraft: '', kind: 'all', offset: 0, rows: null, total: 0, err: null, loading: false, key: null, seq: 0 },
  ccr: null, // null = ما ندري | ok | missing | needs_reauth | denied | policy | selection | disabled
  ccrProbed: false,
  // pending = الجلسة انفتحت والحفظ فشل (ينحفظ بالمتصفح لين ينحفظ الطلب)، unknown = create_session ما ردّ (يمكن انفتحت)
  form: Object.assign({ title: '', area: 'app', body: '', errs: {}, confirm: false, busy: null, err: null, notice: null, pending: null, unknown: false, closeAsk: false }, pendingRestore()),
  ctNotice: null, // ملاحظة فوق قائمة المحتوى: { sub, msg }
  rq: {}, // حالة كل صف طلب: { open, note, busy, msg, err, cancelAsk }
  checking: false, checkedAt: 0,
  ask: null, // تأكيد داخل صف: { key, msg, yes, danger, withNote, note, run, ctx, busy, err }
  sheet: null, // ورقة تعديل: { kind, id, orig, draft, errs, confirm, busy, err }
  set: { ai: null, cal: null, dirty: {}, errs: {}, confirm: null, busy: null, err: {} },
  evShowPast: false,
  nd: { cat: 'all', locale: 'all', show: NUDGE_PAGE },
};

const appLoaded = () => !app.isSample;
/** القراءات الحية بس مع اتصال شغّال (أول تحديث للمكتب نجح) */
const appCanLoad = () => !!mcp && state.mode === 'live';
const rowsOk = (v) => arr(v).filter((x) => isObj(x) && UUID_RE.test(str(x.id)));

function sampleDbInit() {
  const s = SAMPLE && isObj(SAMPLE.app) ? clone(SAMPLE.app) : { requests: [], content: { ads: [], events: [], nudges: [], settings: {} }, partners: {}, users: [] };
  app.db = s;
  app.requests = rowsOk(s.requests);
  app.content = s.content;
  app.reqAt = 0;
  sampleLists();
  setDrafts(true);
}
/** يرجّع البيانات التجريبية أو يمسحها لما يتغيّر وضع الصفحة (أول بيانات حية = نمسح التجريبي كله) */
function appSyncMode() {
  if (state.isSample && !app.isSample) return; // ما يرجع للتجريبي بعد الحي أبد
  if (state.isSample && app.isSample && !app.db) sampleDbInit();
  if (!state.isSample && app.isSample) appWipe(false);
}
/** نمسح كل بيانات التبويب (أول بيانات حية، أو تغيّر الحساب) */
function appWipe(stop) {
  Object.assign(app, { isSample: false, db: null, requests: null, reqErr: null, reqAt: 0, content: null, contentErr: null, checkedAt: 0, ask: null, rq: {}, ctNotice: null });
  Object.assign(app.partners, { rows: null, err: null, key: null });
  Object.assign(app.users, { rows: null, err: null, key: null, total: 0 });
  app.set = { ai: null, cal: null, dirty: {}, errs: {}, confirm: null, busy: null, err: {} };
  if (app.sheet) closeAppSheet();
  if (stop) { clearInterval(appTimer); app.ccr = null; }
}

// ===================== أدوات صغيرة =====================
const riyadhDay = (ms) => new Date(ms + RIYADH_MS).toISOString().slice(0, 10);
const tsDay = (ts) => { const ms = Date.parse(str(ts)); return Number.isFinite(ms) ? riyadhDay(ms) : ''; };
/** نهاية الإعلان تنحفظ «منتصف الليل اللي بعد آخر يوم»: نعرض آخر يوم داخل المدة */
const tsEndDay = (ts) => { const ms = Date.parse(str(ts)); if (!Number.isFinite(ms)) return ''; return riyadhDay((ms + RIYADH_MS) % 86_400_000 === 0 ? ms - 1 : ms); };
const dayStartMs = (d) => Date.parse(`${d}T00:00:00+03:00`);
const validDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const todayRiyadh = () => riyadhDay(clock());
const collapse = (s) => str(s).replace(/\s+/g, ' ').trim();
const clip = (s, n) => { const x = str(s); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const safeJson = (v) => { try { return JSON.stringify(v) || ''; } catch (e) { return ''; } };
const areaLabel = (a, lang) => { const L0 = I18N[lang || state.lang] || I18N.ar; return a === 'app' ? L0.ra_app : (L0[`desk_${a}`] || I18N.ar[`desk_${a}`] || a); };
const pickEn = (ar, en) => (state.lang === 'en' && str(en).trim() ? str(en) : str(ar));
function newUuid() {
  try { if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (e) { /* قديم */ }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
/** الجلسة اللي انفتحت وطلبها ما انحفظ: تنحفظ بالمتصفح (لو التخزين متاح) عشان رابطها ما يضيع لو انقفلت الصفحة */
function pendingRestore() {
  try {
    const p = JSON.parse(store('reqPending') || 'null');
    if (!isObj(p) || typeof p.title !== 'string' || typeof p.body !== 'string' || !REQ_AREAS.includes(p.area)) return {};
    const sid = p.sid === null || SESSION_RE.test(str(p.sid)) ? p.sid : undefined;
    const url = p.url === null || SESSION_URL_RE.test(str(p.url)) ? p.url : undefined;
    if (sid === undefined || url === undefined || cpLen(p.title) > 120 || cpLen(p.body) > 4000) return {};
    const pending = { title: p.title, body: p.body, area: p.area, sid, url };
    return { pending, title: p.title, body: p.body, area: p.area };
  } catch (e) { return {}; }
}
function pendingStore(p) { store('reqPending', p ? JSON.stringify(p) : null); }
/** القاعدة تقدر تحفظ الطلب؟ (الطلبات انقرت من القاعدة الحية وما فيه خطأ دائم) — غير كذا ما نفتح جلسة ما تنحفظ */
function reqDbReady() {
  if (app.isSample) return true;
  return Array.isArray(app.requests) && !state.readOnly && !(app.reqErr && REQ_DB_BLOCK.includes(app.reqErr.code));
}
/** نحدّث صف طلب محلياً بالرد (عشان فحص الحالات اللي شغّال يشوف آخر حالة حتى لو التحديث فشل) */
function patchReq(row) {
  if (!isObj(row) || !UUID_RE.test(str(row.id)) || !Array.isArray(app.requests)) return;
  app.requests = app.requests.map((x) => (x.id === row.id ? Object.assign({}, x, row) : x));
}
/** مكان القائمة قبل ما توصل: «نحمّل…»، أو لو التحميل مو ممكن (الاتصال مقطوع) نقول ليش بدل ما ننتظر للأبد */
function waitBox() {
  if (app.isSample || appCanLoad()) return h('div', { class: 'empty', text: t('loading') });
  const k = (state.conn && state.conn.kind) || 'other';
  return errBox({ code: k, msg: t('app_no_conn'), raw: '' }, connTitle(k));
}
const randAlnum = (n) =>Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 56)]).join('');
const sampleErr = (code) => { const e = new Error(t(`err_${code}`)); e.info = { code, msg: t(`err_${code}`), raw: '' }; return e; };
/** رسالة مفهومة لخطأ إجراء: bad_value مع اسم الحقل، وحالة الشريك */
function friendly(e, ctx) {
  const info = (e && e.info) || errInfo(e);
  if (info.code === 'bad_value' && info.field) return t('err_bad_value_f', { f: fieldName(ctx, info.field) });
  if (ctx === 'partner' && info.code === 'bad_status') return t('err_partner_state');
  return info.raw ? `${info.msg} (${info.raw})` : info.msg;
}

// ===================== رد Claude Code Remote (نقرأه بحذر: الشكل ممكن يتغيّر) =====================
/** كل المرشّحين من نتيجة الأداة: payload، structuredContent، ونص كل بلوك (ونفسه لو كان JSON) */
function ccrCands(res) {
  const out = [];
  if (!res || typeof res !== 'object') return typeof res === 'string' ? [res] : out;
  if (res.payload !== undefined) out.push(res.payload);
  if (res.structuredContent !== undefined) out.push(res.structuredContent);
  for (const b of arr(res.content)) {
    if (b && b.type === 'text' && typeof b.text === 'string') {
      out.push(b.text);
      try { const v = JSON.parse(b.text); if (v && typeof v === 'object') out.push(v); } catch (e) { /* نص عادي */ }
    }
  }
  for (const c of out.slice()) if (typeof c === 'string') { try { const v = JSON.parse(c); if (v && typeof v === 'object') out.push(v); } catch (e) { /* نص */ } }
  return out;
}
/** بحث بالعرض (الأقرب للسطح يفوز) عن مفتاح يحقق الشرط */
function bfs(root, pred, max = 5000) {
  if (!root || typeof root !== 'object') return undefined;
  const q = [root];
  let n = 0;
  while (q.length && n < max) {
    const v = q.shift();
    for (const [k, x] of Object.entries(v)) {
      n++;
      if (pred(k, x)) return x;
      if (x && typeof x === 'object') q.push(x);
    }
  }
  return undefined;
}
/** رقم الجلسة من رد create_session: id / session_id / ccr.id … وإلا أول session_xxx بالنص */
function sessionIdFrom(res) {
  const cands = ccrCands(res);
  const okS = (v) => typeof v === 'string' && SESSION_RE.test(v);
  for (const c of cands) {
    if (!isObj(c)) continue;
    for (const v of [c.id, c.session_id, c.sessionId, get(c, 'ccr.id'), get(c, 'ccr.session_id'), get(c, 'session.id'), get(c, 'session.session_id')]) if (okS(v)) return v;
  }
  for (const c of cands) { const v = bfs(c, (k, x) => (k === 'id' || k === 'session_id' || k === 'sessionId') && okS(x)); if (v) return v; }
  for (const c of cands) {
    const m = /(?:^|[^A-Za-z0-9_])(session_[A-Za-z0-9]{8,80})(?![A-Za-z0-9_])/.exec(typeof c === 'string' ? c : safeJson(c));
    if (m) return m[1];
  }
  return null;
}
/** رابط طلب الدمج من رد get_session: من قيم الحقول (بدون العنوان/النص اللي كتبناه للجلسة)، والنص العادي لو الرد نص.
 * أي رقم طلب دمج مكتوب في طلبك نفسه (own = العنوان والتفاصيل) ما ناخذه. أكثر من واحد = الأكبر رقم (الأحدث) */
function prFrom(cands, own) {
  const nums = (s) => [...str(s).matchAll(PR_ALL_RE)];
  const mine = new Set(nums(own).map((m) => Number(m[1])));
  const found = new Map();
  let budget = 5000;
  const scan = (s) => { for (const m of nums(s)) if (!mine.has(Number(m[1]))) found.set(Number(m[1]), m[0]); };
  const walk = (v, depth) => {
    if (--budget < 0 || depth > 16) return;
    if (typeof v === 'string') { scan(v); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) if (!PR_SKIP_KEYS.test(k)) walk(x, depth + 1);
  };
  const isJsonObj = (s) => { try { const v = JSON.parse(s); return !!v && typeof v === 'object'; } catch (e) { return false; } };
  // نص هو JSON = نفسه موجود كمرشّح مفكوك (نمشي على حقوله بدل ما ندوّر في النص كله)
  for (const c of cands) { if (typeof c === 'string') { if (!isJsonObj(c)) scan(c); } else walk(c, 0); }
  if (!found.size) return null;
  const url = found.get(Math.max(...found.keys()));
  return PR_URL_RE.test(url) ? url : null;
}
/** حالة الجلسة من رد get_session: status_bucket (بأي عمق، أو بالنص) + رابط طلب الدمج لو موجود (own = نص الطلب نفسه) */
function sessionInfo(res, own) {
  const cands = ccrCands(res);
  let raw = null;
  for (const c of cands) { const v = bfs(c, (k, x) => k === 'status_bucket' && typeof x === 'string'); if (v) { raw = v; break; } }
  if (!raw) for (const c of cands) { const m = /status_bucket\W{0,6}([A-Za-z_]{3,60})/.exec(typeof c === 'string' ? c : safeJson(c)); if (m) { raw = m[1]; break; } }
  const bucket = raw ? raw.toLowerCase().replace(/^session_status_bucket_/, '').replace(/^status_bucket_/, '') : null;
  return { bucket, status: bucket && Object.prototype.hasOwnProperty.call(BUCKETS, bucket) ? BUCKETS[bucket] : null, pr: prFrom(cands, own) };
}

/** نوع مشكلة الموصّل (على مستوى الموصّل كله) — tool_error = الأداة نفسها رفضت (مو مشكلة اتصال) */
function ccrKind(e) {
  const c = e && e.code;
  if (!c || c === 'tool_error') return null;
  if (c === 'server_not_connected' || c === 'server_not_found') return 'missing';
  if (c === 'needs_reauth') return 'needs_reauth';
  if (c === 'selection_required') return 'selection';
  if (c === 'not_in_manifest' || c === 'consent_required') return 'denied';
  if (c === 'blocked_by_policy' || c === 'approval_required') return 'policy';
  if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return 'disabled';
  if (c === 'user_changed') return 'user_changed';
  if (c === 'bad_request' || c === 'transform_error') return null;
  return 'unavailable';
}
const ccrBlocked = () => !!app.ccr && app.ccr !== 'ok';
function ccrMsg(e) {
  const k = ccrKind(e);
  if (k) return t(`ccr_${k === 'user_changed' ? 'disabled' : k}_t`);
  const m = str(e && e.message).replace(/\s+/g, ' ').trim().slice(0, 240);
  return m ? `${t('ccr_tool_error')} ${m}` : t('err_generic');
}
async function ccrCall(tool, input, { read = false } = {}) {
  if (!mcp) { const e = new Error('no_mcp'); e.code = 'not_granted'; throw e; }
  if (state.conn && state.conn.kind === 'user_changed') { const e = new Error('user_changed'); e.code = 'user_changed'; throw e; }
  const once = () => mcp.callTool(CCR, tool, input, { cache: false });
  try {
    let res;
    try { res = await once(); } catch (e) {
      if (!read || !e || e.retryable !== true) throw e;
      await sleep(Math.min(60_000, e.retryAfterMs || 0) + 400 + Math.random() * 900);
      res = await once();
    }
    app.ccr = 'ok';
    return res;
  } catch (e) {
    const k = ccrKind(e);
    if (k === 'user_changed') { connFail(e, 'user_changed'); renderAll(); }
    else if (k && k !== 'unavailable') app.ccr = k;
    throw e;
  }
}
/** نظرة أولى (بدون ما نسأل المستخدم): الموصّل مو مضاف = نوريه كيف يضيفه قبل ما يكتب طلب */
function ccrProbe(force) {
  if (!mcp || typeof mcp.listTools !== 'function' || (app.ccrProbed && !force)) return;
  app.ccrProbed = true;
  Promise.resolve().then(() => mcp.listTools(CCR)).then((r) => {
    const s = arr(r && r.servers).find((x) => x && x.server === CCR);
    if (!s || !arr(s.tools).length) app.ccr = 'missing';
    else if (s.authStatus === 'needs_reauth') app.ccr = 'needs_reauth';
    else if (app.ccr === 'missing' || app.ccr === 'needs_reauth') app.ccr = null;
    renderApp();
  }).catch(() => { /* قائمة الموصّلات مو متاحة: نعرف من أول استدعاء */ });
}

// ===================== القراءة من القاعدة =====================
async function appRead(query) {
  try {
    const rows = await sql(query, { read: true });
    // ردّ حي وصل: علامة «متأخر» من انقطاع قبل تنشال
    if (state.conn && state.conn.kind === 'unavailable' && !state.isSample) { state.conn = null; renderTop(); renderBanner(); }
    return cell(rows, 'r');
  } catch (e) {
    const ck = connKind(e);
    if (ck) { connFail(e, ck); renderAll(); }
    throw e;
  }
}
function readErr(e) {
  const ck = connKind(e);
  if (ck) return { code: ck, msg: connTitle(ck), raw: '' };
  const info = errInfo(e);
  if (info.code === 'choose_admin') state.needAdmin = true;
  return info;
}
const unreadable = () => Object.assign(new Error('unreadable_result'), { code: 'unreadable_result' });

async function loadRequests() {
  if (!appCanLoad()) return;
  const seq = ++app.reqSeq;
  app.reqLoading = true; renderApp();
  try {
    const v = await appRead(QA.requests());
    if (!Array.isArray(v)) throw unreadable();
    if (seq !== app.reqSeq) return;
    app.requests = rowsOk(v);
    app.reqErr = null;
    app.reqAt = Date.now();
  } catch (e) {
    if (seq === app.reqSeq) app.reqErr = readErr(e);
  } finally {
    if (seq === app.reqSeq) app.reqLoading = false;
    renderApp(); renderTop();
  }
}
async function loadContent() {
  if (!appCanLoad()) return;
  const seq = ++app.contentSeq;
  app.contentLoading = true; renderApp();
  try {
    const v = await appRead(QA.content());
    if (!isObj(v) || !Array.isArray(v.ads)) throw unreadable();
    if (seq !== app.contentSeq) return;
    app.content = { ads: rowsOk(v.ads), events: rowsOk(v.events), nudges: rowsOk(v.nudges), settings: isObj(v.settings) ? v.settings : {} };
    app.contentErr = null;
    setDrafts(false);
  } catch (e) {
    if (seq === app.contentSeq) app.contentErr = readErr(e);
  } finally {
    if (seq === app.contentSeq) app.contentLoading = false;
    renderApp();
  }
}
const partnersKey = () => `${app.partners.kind}|${app.partners.q}`;
async function loadPartners() {
  const P = app.partners;
  if (app.isSample) { sampleLists(); renderApp(); return; }
  if (!appCanLoad()) return;
  const seq = ++P.seq, key = partnersKey();
  if (P.key !== key) P.rows = null;
  P.loading = true; renderApp();
  try {
    const v = await appRead(QA.partners(P.kind, P.q || null));
    if (!Array.isArray(v)) throw unreadable();
    if (seq !== P.seq) return;
    P.rows = rowsOk(v); P.key = key; P.err = null;
  } catch (e) {
    if (seq === P.seq) { P.err = readErr(e); P.key = key; }
  } finally {
    if (seq === P.seq) P.loading = false;
    renderApp();
  }
}
const usersKey = () => `${app.users.kind}|${app.users.q}|${app.users.offset}`;
async function loadUsers() {
  const U = app.users;
  if (app.isSample) { sampleLists(); renderApp(); return; }
  if (!appCanLoad()) return;
  const seq = ++U.seq, key = usersKey();
  U.loading = true; renderApp();
  try {
    const v = await appRead(QA.users(U.q || null, U.kind, U.offset));
    if (!Array.isArray(v)) throw unreadable();
    if (seq !== U.seq) return;
    U.rows = rowsOk(v); U.key = key; U.err = null;
    U.total = U.rows.length ? Math.max(num(U.rows[0].total), U.offset + U.rows.length) : (U.offset ? U.total : 0);
  } catch (e) {
    if (seq === U.seq) { U.err = readErr(e); U.key = key; }
  } finally {
    if (seq === U.seq) U.loading = false;
    renderApp();
  }
}
/** يحمّل اللي يحتاجه التبويب الفرعي المفتوح (force = حتى لو محمّل) */
function ensureSub(force) {
  if (app.isSample) { sampleLists(); return; }
  if (!appCanLoad()) return;
  if (CONTENT_SUBS.includes(app.sub)) { if (force || (!app.content && !app.contentLoading)) loadContent(); }
  else if (app.sub === 'partners') { if (force || (app.partners.key !== partnersKey() && !app.partners.loading)) loadPartners(); }
  else if (app.sub === 'users') { if (force || (app.users.key !== usersKey() && !app.users.loading)) loadUsers(); }
}

// ===================== المعاينة: قوائم الشركاء والمتدربين من النسخة المحلية =====================
function sampleLists() {
  if (!app.db) return;
  const P = app.partners, U = app.users;
  const q = P.q.toLowerCase();
  P.rows = arr(app.db.partners && app.db.partners[P.kind]).filter((x) => !q || [x.name, x.subtitle, x.owner_username].some((s) => str(s).toLowerCase().includes(q)));
  P.key = partnersKey(); P.err = null;
  const uq = U.q.toLowerCase();
  const all = arr(app.db.users).filter((x) => (U.kind === 'all' || (U.kind === 'trainee' ? x.account_type === 'trainee' : x.account_type !== 'trainee'))
    && (!uq || [x.username, x.full_name].some((s) => str(s).toLowerCase().includes(uq))));
  U.total = all.length;
  if (U.offset >= all.length && U.offset) U.offset = Math.max(0, Math.floor((all.length - 1) / USERS_PAGE) * USERS_PAGE);
  U.rows = all.slice(U.offset, U.offset + USERS_PAGE).map((x) => Object.assign({}, x, { total: all.length }));
  U.key = usersKey(); U.err = null;
}
function adStateOf(a) {
  const now = clock();
  if (!a.active) return 'off';
  if (a.ends_at && Date.parse(a.ends_at) <= now) return 'ended';
  if (a.starts_at && Date.parse(a.starts_at) > now) return 'scheduled';
  return 'live';
}

// ===================== طلبات التعديل =====================
const rowState = (id) => (app.rq[id] = app.rq[id] || {});
function requestPrompt(title, area, body) {
  return [
    'طلب تعديل من مالك تطبيق أرك (من مكتب أرك أب على الويب)',
    `العنوان: ${title}`,
    `القسم: ${areaLabel(area, 'ar')} (${area})`,
    'التفاصيل:',
    body,
    '---',
    'You are working in the ARQ app repository (Expo SDK 57 / React Native + Supabase). Implement the owner\'s request above.',
    '- Read AGENTS.md / CLAUDE.md first and follow them.',
    '- Work on a new branch named claude/office-<short-english-slug>; never push to main.',
    '- Keep the change focused on the request. Any new UI text must exist in Arabic and English (src/locales/ar.json and en.json).',
    '- Database changes only as new migration files with tests; never change the live database or deploy functions.',
    '- Run npx tsc --noEmit and the relevant tests and fix failures.',
    '- Open a pull request to main with an Arabic summary of what changed and how to try it. Do not merge it.',
    '- If the request is unclear or risky, ask the owner in this session before building.',
  ].join('\n');
}
function validateRequest() {
  const f = app.form;
  const errs = {};
  const title = collapse(f.title), body = str(f.body).trim();
  // نفس عدّ القاعدة (char_length): الإيموجي حرف واحد، وإلا الجلسة تنفتح والحفظ يرفض
  const tl = cpLen(title), bl = cpLen(body);
  if (tl < 2 || tl > 120) errs.title = t('req_err_title');
  if (bl < 3 || bl > 4000) errs.body = t('req_err_body');
  f.errs = errs;
  return Object.keys(errs).length ? null : { title, body, area: REQ_AREAS.includes(f.area) ? f.area : 'app' };
}
function reqAsk() {
  const f = app.form;
  if (f.busy || !canAct() || !reqDbReady()) return;
  f.err = null; f.notice = null;
  if (!validateRequest()) { renderApp(); const el = $(f.errs.title ? 'reqFTitle' : 'reqFBody'); if (el) el.focus(); return; }
  f.confirm = true; renderApp();
  const b = $('reqGo'); if (b) b.focus();
}
/** «ابدأ الجلسة»: create_session ثم add_request. فشل الجلسة = ما ينحفظ شي؛ فشل الحفظ = نعرض رابط الجلسة.
 * create_session ما ردّ (طوّل/انقطع) = يمكن انفتحت: نقول كذا ونطلب تشيّك قبل أي إرسال ثاني */
async function reqSubmit() {
  const f = app.form;
  if (f.busy) return;
  if (!app.isSample && (!canAct() || !reqDbReady())) { f.confirm = false; renderApp(); return; }
  const v = validateRequest();
  if (!v) { f.confirm = false; renderApp(); return; }
  f.busy = 'create'; f.err = null; f.notice = null; renderApp();
  if (app.isSample) {
    const sid = `session_01Sample${randAlnum(12)}`;
    const now = new Date(clock()).toISOString();
    app.db.requests.unshift({ id: newUuid(), title: v.title, request: v.body, area: v.area, session_id: sid, session_url: `https://claude.ai/code/${sid}`, pr_url: null, status: 'working', created_by: null, created_at: now, updated_at: now });
    app.requests = rowsOk(app.db.requests);
    Object.assign(f, { title: '', body: '', area: 'app', confirm: false, busy: null, unknown: false });
    toast(t('sample_action'));
    renderApp();
    return;
  }
  let sid = null;
  try {
    const res = await ccrCall('create_session', {
      prompt: requestPrompt(v.title, v.area, v.body), title: `طلب من المكتب: ${v.title}`.slice(0, 200), environment_id: CCR_ENV,
      source_url: CCR_REPO, tags: CCR_TAGS, permission_mode: 'auto',
    });
    sid = sessionIdFrom(res);
  } catch (e) {
    // ما وصل رد: الجلسة يمكن انفتحت. النموذج يبقى، والإرسال الثاني يحتاج تأكيد صريح بعد ما تشيّك claude.ai/code
    if (unknownOutcome(e)) Object.assign(f, { busy: null, confirm: false, err: null, unknown: true });
    else Object.assign(f, { busy: null, confirm: false, err: `${t('req_err_create')} ${ccrMsg(e)}` });
    renderApp();
    return;
  }
  f.pending = { title: v.title, body: v.body, area: v.area, sid, url: sid ? `https://claude.ai/code/${sid}` : null };
  f.unknown = false; f.closeAsk = false;
  pendingStore(f.pending);
  await reqSave();
}
async function reqSave() {
  const f = app.form, p = f.pending;
  if (!p || f.busy === 'save') return;
  f.busy = 'save'; f.err = null; f.saveFatal = false; f.closeAsk = false; renderApp();
  try {
    await write(QA.addRequest(p.title, p.body, p.area, p.sid, p.url));
    Object.assign(f, { title: '', body: '', area: 'app', confirm: false, busy: null, pending: null, saveErr: null, saveFatal: false, unknown: false, errs: {}, notice: p.sid ? null : t('req_no_sid') });
    pendingStore(null);
    toast(t('req_sent_ok'));
    await loadRequests();
  } catch (e) {
    const info = (e && e.info) || errInfo(e);
    // القاعدة رفضت قيم الطلب نفسها: إعادة الحفظ بنفس القيم ما تفيد، فما نعرض «أعد الحفظ» (الرابط يبقى)
    const fatal = info.code === 'bad_input';
    Object.assign(f, { busy: null, confirm: false, err: t(fatal ? 'req_err_save_bad' : 'req_err_save'), saveErr: friendly(e, 'request'), saveFatal: fatal });
    renderApp();
  }
}
/** إغلاق صندوق «الجلسة انفتحت والحفظ فشل» بعد التأكيد: الجلسة تكمل بدون متابعة، والنموذج ينمسح عشان ما ينرسل نفس الطلب مرة ثانية */
function reqDropPending() {
  const f = app.form;
  Object.assign(f, { pending: null, closeAsk: false, err: null, saveErr: null, saveFatal: false, title: '', body: '', area: 'app', errs: {}, confirm: false });
  pendingStore(null);
  renderApp();
  const el = $('reqFTitle'); if (el) el.focus();
}
/** يفحص حالة الجلسات: المفتوحة (≤10، الأحدث أول) أو صف واحد (only). يحفظ اللي تغيّر بـ update_request */
async function checkStatuses({ only = null, manual = false } = {}) {
  if (app.checking && !only) return;
  if (app.isSample) {
    if (only) { const rs = rowState(only); rs.msg = t('req_status_same'); rs.err = null; }
    if (manual || only) toast(t('sample_action'));
    renderApp();
    return;
  }
  if (!mcp || !Array.isArray(app.requests)) return;
  if (!only && !manual && ccrBlocked()) return; // الموصّل ناقص: ما نعيد نفس الاستدعاء الفاشل بدون ما تضغط
  const list = only ? app.requests.filter((r) => r.id === only)
    : app.requests.filter((r) => REQ_OPEN.includes(r.status) && SESSION_RE.test(str(r.session_id))).slice(0, STATUS_MAX);
  if (!only) { app.checking = true; app.checkErr = null; }
  renderApp();
  let changed = 0;
  for (const r of list) {
    if (!SESSION_RE.test(str(r.session_id))) continue;
    const rs = rowState(r.id);
    if (only) { rs.busy = 'status'; rs.msg = null; rs.err = null; renderApp(); }
    let res = null, stop = false;
    try { res = await ccrCall('get_session', { session_id: r.session_id }, { read: true }); } catch (e) {
      const k = ccrKind(e);
      // مشكلة بالموصّل كله (أو ما ردّ): نوقف الدورة. رفض للجلسة نفسها: نكتبه على صفها ونكمل
      stop = !!k;
      if (only || !k) rs.err = ccrMsg(e); else app.checkErr = ccrMsg(e);
    }
    if (res) {
      if (!only) rs.err = null;
      const info = sessionInfo(res, `${str(r.title)}\n${str(r.request)}`);
      // وقت ما ننتظر الرد ممكن الطلب تغيّر (ألغيته، أو فحص ثاني حدّثه): نقارن بآخر نسخة، وما نكتب فوق إلغاء أبد
      const cur = arr(app.requests).find((x) => x.id === r.id);
      const moved = !cur || cur.status !== r.status || cur.status === 'cancelled' || rs.busy === 'cancel';
      const status = info.status || r.status;
      const pr = info.pr && info.pr !== (cur || r).pr_url ? info.pr : null;
      if (!moved && (status !== r.status || pr)) {
        // وقت الحفظ: أزرار الصف (ومنها «إلغاء») موقفة لين يخلص
        const mine = !rs.busy;
        if (mine) { rs.busy = 'status'; renderApp(); }
        try {
          patchReq(await write(QA.updateRequest(r.id, status, pr)));
          changed++;
          if (only) rs.msg = t('req_status_new', { s: t(`rs_${status}`) });
        } catch (e) { rs.err = friendly(e, 'request'); } finally { if (mine) rs.busy = null; }
      } else if (only && !moved) rs.msg = info.status ? t('req_status_same') : t('req_status_unknown');
      // فحص ثاني (الفحص العام) سبقنا وحدّث نفس الطلب للحالة اللي قرأناها: نقول وش صارت بدل ما نسكت
      else if (only && cur && cur.status !== r.status && cur.status === status && rs.busy !== 'cancel') rs.msg = t('req_status_new', { s: t(`rs_${status}`) });
    }
    if (only) rs.busy = null;
    if (stop) break;
  }
  if (!only) { app.checking = false; app.checkedAt = Date.now(); }
  if (changed) await loadRequests(); else renderApp();
}
async function reqNote(r) {
  const rs = rowState(r.id);
  const note = str(rs.note).trim();
  if (!note) { rs.err = t('req_note_empty'); renderApp(); const el = $(`rq-${r.id}-note`); if (el) el.focus(); return; }
  rs.busy = 'note'; rs.err = null; rs.msg = null; renderApp();
  try {
    if (app.isSample) toast(t('sample_action'));
    else {
      await ccrCall('send_message', { session_id: r.session_id, message: `${t('req_note_prefix')}\n${note.slice(0, 4000)}` });
      toast(t('req_note_ok'));
    }
    rs.note = null; rs.msg = t('req_note_ok'); rs.noteUnknown = false;
  } catch (e) {
    // ما وصل رد: الملاحظة يمكن وصلت — نقول كذا، والإرسال الثاني بزر واضح إنه «مرة ثانية»
    rs.noteUnknown = unknownOutcome(e);
    rs.err = rs.noteUnknown ? t('req_note_unknown') : ccrMsg(e);
  } finally { rs.busy = null; renderApp(); }
}
async function reqCancel(r) {
  const rs = rowState(r.id);
  if (rs.busy) return;
  rs.busy = 'cancel'; rs.err = null; renderApp();
  try {
    if (app.isSample) {
      const x = app.db.requests.find((y) => y.id === r.id);
      if (x) { x.status = 'cancelled'; x.updated_at = new Date(clock()).toISOString(); }
      app.requests = rowsOk(app.db.requests);
      toast(t('sample_action'));
    } else {
      const saved = await write(QA.updateRequest(r.id, 'cancelled', null));
      // الحالة الجديدة محلياً على طول (فحص الحالات الشغّال ما يكتب فوقها حتى لو تحديث القائمة فشل)
      patchReq(isObj(saved) && saved.id === r.id ? saved : { id: r.id, status: 'cancelled' });
      toast(t('req_cancel_ok'));
      await loadRequests();
    }
    rs.cancelAsk = false;
  } catch (e) { rs.err = friendly(e, 'request'); } finally { rs.busy = null; renderApp(); }
}

// ===================== تأكيد داخل الصف (تشغيل/إيقاف، إجراءات الشركاء، التوثيق) =====================
function ask(key, o) {
  app.ask = Object.assign({ key, note: '', busy: false, err: null }, o);
  renderApp();
  const el = $(`${key}:yes`); if (el) el.focus();
}
async function runAsk() {
  const a = app.ask;
  if (!a || a.busy) return;
  a.busy = true; a.err = null; renderApp();
  try {
    await a.run(a);
    if (app.ask === a) app.ask = null;
    toast(app.isSample ? t('sample_action') : t('saved_ok'));
  } catch (e) { a.err = friendly(e, a.ctx); } finally { a.busy = false; renderApp(); }
}
async function setActive(kind, row, v) {
  if (app.isSample) {
    const list = app.content[{ ad: 'ads', event: 'events', nudge: 'nudges' }[kind]];
    const x = arr(list).find((y) => y.id === row.id);
    if (!x) throw sampleErr('not_found');
    x.active = v; x.updated_at = new Date(clock()).toISOString();
    if (kind === 'ad') x.state = adStateOf(x);
    return;
  }
  await write(QA.setActive(kind, row.id, v));
  await loadContent();
}
async function partnerAct(p, action, note) {
  const kind = app.partners.kind;
  if (app.isSample) {
    const x = arr(app.db.partners[kind]).find((y) => y.id === p.id);
    if (!x) throw sampleErr('request_not_found');
    if (kind !== 'club' && ((action === 'hide' && x.status !== 'approved') || (action === 'show' && x.status !== 'suspended') || action.startsWith('partner'))) throw sampleErr('bad_status');
    if (action === 'hide') x.status = 'suspended';
    else if (action === 'show') x.status = kind === 'club' ? (x.partner ? 'approved' : 'listed') : 'approved';
    else { x.partner = action === 'partner_on'; if (x.status !== 'suspended') x.status = x.partner ? 'approved' : 'listed'; }
    sampleLists();
    return;
  }
  await write(QA.partnerAction(kind, p.id, action, note || null));
  await loadPartners();
}
async function verifyUser(u, v) {
  if (app.isSample) {
    const x = arr(app.db.users).find((y) => y.id === u.id);
    if (!x) throw sampleErr('user_not_found');
    x.is_coach = v; sampleLists();
    return;
  }
  await write(QA.setVerified(u.id, v));
  await loadUsers();
}

// ===================== ورقة التعديل (إعلان / فعالية / تنبيه / حساب) =====================
const opts = (list, prefix) => list.map((v) => ({ value: v, label: t(`${prefix}${v}`) }));
function sheetSpec(kind, sh) {
  switch (kind) {
    case 'ad': return [
      { key: 'title', label: 'f_ad_title', type: 'text', max: 80, wide: true },
      { key: 'kind', label: 'f_kind', type: 'chips', options: opts(AD_KINDS, 'ad_kind_'), wide: true },
      { key: 'link', label: 'f_link', type: 'text', max: 300, dir: 'ltr', hintText: t('f_link_hint', URL_VARS), wide: true },
      { key: 'cta', label: 'f_cta', type: 'text', max: 30 },
      { key: 'audience', label: 'f_audience', type: 'chips', options: opts(AD_AUD, 'ad_aud_') },
      { key: 'starts_at', label: 'f_starts_at', type: 'date', hint: 'f_dates_hint' },
      { key: 'ends_at', label: 'f_ends_at', type: 'date' },
      { key: 'frequency', label: 'f_frequency', type: 'chips', options: opts(AD_FREQ, 'freq_'), wide: true },
      { key: 'auto_close', label: 'f_auto_close', type: 'num', hint: 'f_auto_close_hint', lo: 0, hi: 30 },
      { key: 'priority', label: 'f_priority', type: 'num', hint: 'f_priority_hint', lo: 0, hi: 100 },
    ];
    case 'event': return [
      { key: 'title', label: 'f_ev_title', type: 'text', max: 90, dir: 'rtl' },
      { key: 'title_en', label: 'f_ev_title_en', type: 'text', max: 90, dir: 'ltr' },
      { key: 'category', label: 'f_category', type: 'select', options: opts(EVENT_CATS, 'ecat_') },
      { key: 'url', label: 'f_url', type: 'text', max: 300, dir: 'ltr', hintText: t('f_url_hint', URL_VARS) },
      { key: 'city', label: 'f_city', type: 'text', max: 40, dir: 'rtl' },
      { key: 'city_en', label: 'f_city_en', type: 'text', max: 40, dir: 'ltr' },
      { key: 'venue', label: 'f_venue', type: 'text', max: 90, dir: 'rtl' },
      { key: 'venue_en', label: 'f_venue_en', type: 'text', max: 90, dir: 'ltr' },
      { key: 'starts_on', label: 'f_starts_on', type: 'date', hint: 'f_ev_dates_hint' },
      { key: 'ends_on', label: 'f_ends_on', type: 'date' },
      { key: 'date_note', label: 'f_date_note', type: 'text', max: 80, dir: 'rtl', hint: 'f_date_note_hint' },
      { key: 'date_note_en', label: 'f_date_note_en', type: 'text', max: 80, dir: 'ltr' },
      { key: 'summary', label: 'f_summary', type: 'textarea', max: 500, dir: 'rtl', wide: true },
      { key: 'summary_en', label: 'f_summary_en', type: 'textarea', max: 500, dir: 'ltr', wide: true },
      { key: 'featured', label: 'f_featured', type: 'check', wide: true },
      { key: 'active', label: 'f_active', type: 'check', wide: true },
    ];
    case 'nudge': {
      const cat = NUDGE_CATS.includes(sh && sh.draft.category) ? sh.draft.category : 'gym';
      return [
        { key: 'category', label: 'f_nd_category', type: 'chips', options: opts(NUDGE_CATS, 'ncat_'), wide: true },
        { key: 'gender', label: 'f_gender', type: 'chips', options: NUDGE_WHO.map((g) => ({ value: g, label: t(g === 'all' ? 'aud_all' : `g_${g}`) })) },
        cat === 'friend' ? { key: 'friend_gender', label: 'f_friend_gender', type: 'chips', options: NUDGE_WHO.map((g) => ({ value: g, label: t(g === 'all' ? 'aud_all' : `g_${g}`) })) } : null,
        { key: 'locale', label: 'f_locale', type: 'chips', options: LANGS.map((l) => ({ value: l, label: t(`lang_${l}`) })) },
        { key: 'title', label: 'f_nd_title', type: 'text', max: 80, wide: true, dir: sh && sh.draft.locale === 'en' ? 'ltr' : 'rtl' },
        { key: 'body', label: 'f_nd_body', type: 'textarea', max: 240, wide: true, dir: sh && sh.draft.locale === 'en' ? 'ltr' : 'rtl', hintText: t('nd_vars', { vars: NUDGE_VARS[cat].map((v) => `{${v}}`).join(' ') }) },
      ].filter(Boolean);
    }
    case 'user': return [
      { key: 'full_name', label: 'f_full_name', type: 'text', max: 60, wide: true },
      { key: 'username', label: 'f_username', type: 'text', max: 24, dir: 'ltr', hint: 'f_username_hint', wide: true },
    ];
    default: return [];
  }
}
const SHEET_FIELDS = { ad: ['title', 'kind', 'link', 'cta', 'audience', 'starts_at', 'ends_at', 'frequency', 'auto_close', 'priority'],
  event: ['category', 'title', 'title_en', 'city', 'city_en', 'venue', 'venue_en', 'starts_on', 'ends_on', 'date_note', 'date_note_en', 'summary', 'summary_en', 'url', 'featured', 'active'],
  nudge: ['category', 'gender', 'friend_gender', 'locale', 'title', 'body'], user: ['full_name', 'username'] };
/** اسم الحقل لرسالة bad_value (من الورقة أو الإعدادات) */
function fieldName(ctx, f) {
  const map = { ad: { title: 'f_ad_title' }, event: { title: 'f_ev_title', title_en: 'f_ev_title_en' }, nudge: { category: 'f_nd_category', title: 'f_nd_title', body: 'f_nd_body' },
    ai_limits: {}, calorie_alert: {} };
  const k = (map[ctx] && map[ctx][f]) || `f_${f}`;
  return t(k) !== k ? t(k) : f;
}
function draftOf(kind, row) {
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  switch (kind) {
    case 'ad': return { title: s(row.title), kind: AD_KINDS.includes(row.kind) ? row.kind : 'ad', link: s(row.link), cta: s(row.cta), audience: AD_AUD.includes(row.audience) ? row.audience : 'all',
      starts_at: tsDay(row.starts_at), ends_at: tsEndDay(row.ends_at), frequency: AD_FREQ.includes(row.frequency) ? row.frequency : 'daily', auto_close: s(row.auto_close), priority: s(row.priority) };
    case 'event': return Object.assign(Object.fromEntries(SHEET_FIELDS.event.map((k) => [k, s(row[k])])),
      { category: EVENT_CATS.includes(row.category) ? row.category : 'other', featured: row.featured === true, active: row.active !== false });
    case 'nudge': return { category: NUDGE_CATS.includes(row.category) ? row.category : 'gym', gender: NUDGE_WHO.includes(row.gender) ? row.gender : 'all',
      friend_gender: NUDGE_WHO.includes(row.friend_gender) ? row.friend_gender : 'all', locale: LANGS.includes(row.locale) ? row.locale : 'ar', title: s(row.title), body: s(row.body) };
    case 'user': return { full_name: s(row.full_name), username: s(row.username) };
    default: return {};
  }
}
function openAppSheet(kind, row) {
  const isNew = !row;
  app.ctNotice = null;
  const base = row || (kind === 'event' ? { category: 'other', active: true, featured: false } : kind === 'nudge' ? { category: app.nd.cat !== 'all' ? app.nd.cat : 'gym', gender: 'all', friend_gender: 'all', locale: app.nd.locale !== 'all' ? app.nd.locale : state.lang } : {});
  app.sheet = { kind, id: isNew ? null : row.id, row: row || null, orig: draftOf(kind, base), draft: draftOf(kind, base), errs: {}, confirm: null, busy: false, err: null };
  if (isNew) app.sheet.orig = draftOf(kind, kind === 'event' ? { category: 'other', active: true } : kind === 'nudge' ? {} : {});
  renderAppSheet();
  const dlg = $('appSheet');
  if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
  const first = dlg.querySelector('input:not([type=checkbox]), textarea');
  if (first) first.focus();
}
function closeAppSheet() {
  const dlg = $('appSheet');
  app.sheet = null;
  if (dlg && dlg.open) dlg.close();
}
const varsOk = (allowed, s) => !/[{}\u0000]/.test(str(s).replace(/\{([^{}]*)\}/g, (m, k) => (allowed.includes(k) ? '' : '\u0000')));
/** تحقق قبل الحفظ (القاعدة تتحقق بعد بنفسها) — يرجّع { key: رسالة } */
function validateSheet(sh) {
  const d = sh.draft, e = {};
  const len = (k, lo, hi) => { const v = str(d[k]).trim(); if (v.length < lo || v.length > hi) e[k] = lo ? t('v_len', { a: lo, b: hi }) : t('v_max', { n: hi }); };
  const intIn = (k, lo, hi) => { const v = toNum(d[k]); if (v === null || !Number.isInteger(v) || v < lo || v > hi) e[k] = t('v_int', { a: lo, b: hi }); };
  if (sh.kind === 'ad') {
    len('title', 2, 80); len('cta', 0, 30); len('link', 0, 300);
    const link = str(d.link).trim();
    if (link && !(LINK_RE.test(link) || HTTPS_RE.test(link))) e.link = t('v_link', URL_VARS);
    for (const k of ['starts_at', 'ends_at']) if (d[k] && !validDay(d[k])) e[k] = t('v_date');
    if (!e.starts_at && !e.ends_at) {
      const ms = (k, end) => (d[k] === sh.orig[k] && sh.row ? Date.parse(str(sh.row[k])) : d[k] ? dayStartMs(d[k]) + (end ? 86_400_000 : 0) : NaN);
      const a = ms('starts_at', false), b = ms('ends_at', true);
      if (Number.isFinite(a) && Number.isFinite(b) && b <= a) e.ends_at = t('v_order');
    }
    intIn('auto_close', 0, 30); intIn('priority', 0, 100);
  } else if (sh.kind === 'event') {
    len('title', 2, 90);
    for (const [k, hi] of [['title_en', 90], ['city', 40], ['city_en', 40], ['venue', 90], ['venue_en', 90], ['date_note', 80], ['date_note_en', 80], ['summary', 500], ['summary_en', 500], ['url', 300]]) len(k, 0, hi);
    if (str(d.url).trim() && !HTTPS_RE.test(str(d.url).trim())) e.url = t('v_https', URL_VARS);
    for (const k of ['starts_on', 'ends_on']) if (str(d[k]) && !validDay(d[k])) e[k] = t('v_date');
    if (!e.starts_on && !e.ends_on && d.starts_on && d.ends_on && d.ends_on < d.starts_on) e.ends_on = t('v_order');
  } else if (sh.kind === 'nudge') {
    const allowed = NUDGE_VARS[d.category] || [];
    len('title', 1, 80); len('body', 3, 240);
    if (!e.title && !varsOk(allowed, d.title)) e.title = t('v_vars');
    if (!e.body && !varsOk(allowed, d.body)) e.body = t('v_vars');
  } else if (sh.kind === 'user') {
    len('full_name', 0, 60);
    if (!/^[a-z0-9_.]{3,24}$/.test(str(d.username).trim().toLowerCase())) e.username = t('v_username');
  }
  return e;
}
/** القيمة كما تنعرض في ملخص التأكيد */
function showVal(f, v) {
  if (f.type === 'check') return t(v ? 'yes' : 'no');
  if (f.type === 'chips' || f.type === 'select') { const o = f.options.find((x) => x.value === v); return o ? o.label : str(v); }
  const s = str(v).trim();
  if (!s) return t('empty_v');
  if (f.type === 'date') return fmtDate(s, true) || s;
  if (f.type === 'num' && toNum(s) !== null) return fmt(toNum(s));
  return clip(s.replace(/\s+/g, ' '), 70);
}
const normV = (f, v) => (f.type === 'check' ? !!v : f.type === 'num' ? (toNum(v) === null ? str(v).trim() : toNum(v)) : f.type === 'text' || f.type === 'textarea' ? str(v).trim() : str(v));
/** التغييرات: [{ key, label, from, to }] — للجديد كل الحقول اللي فيها شي */
function sheetChanges(sh) {
  const spec = sheetSpec(sh.kind, sh);
  const out = [];
  for (const f of spec) {
    const a = normV(f, sh.orig[f.key]), b = normV(f, sh.draft[f.key]);
    if (sh.id === null) { if (b === '' || (f.type === 'check' && !b && f.key !== 'active')) continue; out.push({ key: f.key, label: t(f.label), to: showVal(f, sh.draft[f.key]) }); continue; }
    if (a !== b) out.push({ key: f.key, label: t(f.label), from: showVal(f, sh.orig[f.key]), to: showVal(f, sh.draft[f.key]) });
  }
  return out;
}
/** p jsonb للحفظ: المفاتيح اللي تغيّرت بس (الغايب = تبقى القيمة)، وللجديد كل اللي فيه شي */
function sheetPayload(sh, changes) {
  const spec = sheetSpec(sh.kind, sh);
  const keys = new Set(changes.map((c) => c.key));
  const p = {};
  for (const f of spec) {
    if (!keys.has(f.key) && !(sh.id === null && f.type === 'check')) continue;
    const v = sh.draft[f.key];
    if (f.type === 'check') p[f.key] = !!v;
    else if (f.type === 'num') p[f.key] = toNum(v);
    else if (f.type === 'date') p[f.key] = str(v) || null;
    else if (f.type === 'text' || f.type === 'textarea') p[f.key] = str(v).trim();
    else p[f.key] = v;
  }
  // نوع غير «صديقك سبقك»: جمهور الصديق يرجع «الكل» (القاعدة تسويها بعد)
  if (sh.kind === 'nudge' && p.category && p.category !== 'friend') delete p.friend_gender;
  return p;
}
function sheetSave() {
  const sh = app.sheet;
  if (!sh || sh.busy) return;
  sh.err = null;
  sh.errs = validateSheet(sh);
  const bad = Object.keys(sh.errs);
  if (bad.length) { renderAppSheet(); const el = $(`as-${bad[0]}`) || $(`as-${bad[0]}-${sh.draft[bad[0]]}`); if (el) el.focus(); return; }
  const changes = sheetChanges(sh);
  if (!changes.length) { sh.err = t('cf_none'); renderAppSheet(); return; }
  sh.confirm = changes;
  renderAppSheet();
  const b = $('asConfirm'); if (b) b.focus();
}
async function sheetConfirm() {
  const sh = app.sheet;
  if (!sh || sh.busy || !sh.confirm) return;
  sh.busy = true; sh.err = null; renderAppSheet();
  try {
    if (app.isSample) simSheet(sh);
    else {
      const p = sheetPayload(sh, sh.confirm);
      if (sh.kind === 'ad') await write(QA.saveAd(sh.id, p));
      else if (sh.kind === 'event') await write(QA.saveEvent(sh.id, p));
      else if (sh.kind === 'nudge') await write(QA.saveNudge(sh.id, p));
      else if (sh.kind === 'user') await write(QA.updateUser(sh.id, str(sh.draft.full_name).trim() || null, str(sh.draft.username).trim().toLowerCase()));
    }
    const kind = sh.kind;
    if (app.sheet === sh) closeAppSheet();
    toast(app.isSample ? t('sample_action') : t('saved_ok'));
    if (!app.isSample) { if (kind === 'user') await loadUsers(); else await loadContent(); } else renderApp();
  } catch (e) {
    sh.busy = false; sh.confirm = null;
    const info = (e && e.info) || errInfo(e);
    if (info.unknown && sh.id === null && !app.isSample) {
      // إضافة جديدة وما وصل رد: يمكن انحفظت (والفعالية الجديدة ظاهرة على طول). ما نخلي «حفظ» ثاني يضيفها مرتين:
      // نقفل الورقة ونحدّث القائمة ونقول تشيّك قبل ما تضيفها من جديد
      if (app.sheet === sh) closeAppSheet();
      app.ctNotice = { sub: sh.kind === 'event' ? 'events' : 'nudges', msg: t('err_new_unknown') };
      await loadContent();
      return;
    }
    sh.err = friendly(e, sh.kind);
    if (info.code === 'bad_value' && info.field && sheetSpec(sh.kind, sh).some((f) => f.key === info.field)) sh.errs = { [info.field]: sh.err };
    if (info.code === 'bad_nudge') sh.errs = { body: t('v_vars') };
    if (['username_taken', 'bad_username'].includes(info.code)) sh.errs = { username: sh.err };
    if (info.code === 'name_too_long') sh.errs = { full_name: sh.err };
    if (app.sheet === sh) renderAppSheet(); else toast(sh.err);
  }
}
/** المعاينة: نفس الحفظ على النسخة المحلية */
function simSheet(sh) {
  const p = sh.kind === 'user' ? null : sheetPayload(sh, sh.confirm);
  const now = new Date(clock()).toISOString();
  const nul = (v) => (v === '' ? null : v);
  if (sh.kind === 'ad') {
    const a = app.content.ads.find((x) => x.id === sh.id);
    if (!a) throw sampleErr('not_found');
    for (const [k, v] of Object.entries(p)) {
      if (k === 'starts_at') a.starts_at = v ? new Date(dayStartMs(v)).toISOString() : null;
      else if (k === 'ends_at') a.ends_at = v ? new Date(dayStartMs(v) + 86_400_000).toISOString() : null;
      else a[k] = typeof v === 'string' ? nul(v) : v;
    }
    a.updated_at = now; a.state = adStateOf(a);
  } else if (sh.kind === 'event') {
    let ev = sh.id ? app.content.events.find((x) => x.id === sh.id) : null;
    if (sh.id && !ev) throw sampleErr('not_found');
    if (!ev) { ev = { id: newUuid(), category: 'other', featured: false, active: true, image_path: null, created_by: null, created_at: now }; for (const k of SHEET_FIELDS.event) if (!(k in ev)) ev[k] = null; app.content.events.unshift(ev); }
    for (const [k, v] of Object.entries(p)) ev[k] = typeof v === 'string' ? nul(v) : v;
    ev.updated_at = now;
  } else if (sh.kind === 'nudge') {
    let nd = sh.id ? app.content.nudges.find((x) => x.id === sh.id) : null;
    if (sh.id && !nd) throw sampleErr('not_found');
    if (!nd) { nd = { id: newUuid(), gender: 'all', friend_gender: 'all', locale: 'ar', active: false, last_broadcast_at: null, last_broadcast_n: null }; app.content.nudges.push(nd); }
    Object.assign(nd, p);
    if (nd.category !== 'friend') nd.friend_gender = 'all';
    nd.updated_at = now;
  } else if (sh.kind === 'user') {
    const u = arr(app.db.users).find((x) => x.id === sh.id);
    if (!u) throw sampleErr('user_not_found');
    const un = str(sh.draft.username).trim().toLowerCase();
    if (arr(app.db.users).some((x) => x.id !== u.id && x.username === un)) throw sampleErr('username_taken');
    u.username = un; u.full_name = str(sh.draft.full_name).trim() || null;
    sampleLists();
  }
}

// ===================== الإعدادات =====================
function setDrafts(force) {
  const s = app.content && app.content.settings;
  if (!isObj(s)) return;
  const ai = isObj(s.ai_limits) ? s.ai_limits : {}, cal = isObj(s.calorie_alert) ? s.calorie_alert : {};
  const S = app.set;
  S.base = { ai: { barcode_per_day: str(ai.barcode_per_day), meal_photos_per_day: str(ai.meal_photos_per_day) },
    cal: { enabled: cal.enabled !== false, threshold: str(cal.threshold), title_ar: str(cal.title_ar), body_ar: str(cal.body_ar), title_en: str(cal.title_en), body_en: str(cal.body_en) } };
  if (force || !S.dirty.ai) S.ai = Object.assign({}, S.base.ai);
  if (force || !S.dirty.cal) S.cal = Object.assign({}, S.base.cal);
}
const SET_SPEC = {
  ai: [{ key: 'barcode_per_day', label: 'f_barcode_per_day', type: 'num', lo: 0, hi: LIMIT_MAX.barcode_per_day }, { key: 'meal_photos_per_day', label: 'f_meal_photos_per_day', type: 'num', lo: 0, hi: LIMIT_MAX.meal_photos_per_day }],
  cal: [{ key: 'enabled', label: 'f_enabled', type: 'check' }, { key: 'threshold', label: 'f_threshold', type: 'num', lo: 50, hi: 500 },
    { key: 'title_ar', label: 'f_title_ar', type: 'text', max: 80, dir: 'rtl', wide: true }, { key: 'body_ar', label: 'f_body_ar', type: 'textarea', max: 200, dir: 'rtl', wide: true },
    { key: 'title_en', label: 'f_title_en', type: 'text', max: 80, dir: 'ltr', wide: true }, { key: 'body_en', label: 'f_body_en', type: 'textarea', max: 200, dir: 'ltr', wide: true }],
};
function validateSet(which) {
  const d = app.set[which], e = {};
  if (which === 'ai') {
    for (const f of SET_SPEC.ai) { const v = toNum(d[f.key]); if (v === null || !Number.isInteger(v) || v < f.lo || v > f.hi) e[f.key] = t('v_int', { a: f.lo, b: f.hi }); }
  } else {
    const v = toNum(d.threshold);
    if (v === null || !Number.isInteger(v) || v < 50 || v > 500) e.threshold = t('v_int', { a: 50, b: 500 });
    for (const [k, lo, hi] of [['title_ar', 2, 80], ['body_ar', 2, 200], ['title_en', 0, 80], ['body_en', 0, 200]]) {
      const s = str(d[k]).trim();
      if (s.length < lo || s.length > hi) e[k] = lo ? t('v_len', { a: lo, b: hi }) : t('v_max', { n: hi });
      else if (!varsOk(CAL_VARS, s)) e[k] = t('v_vars');
    }
  }
  return e;
}
function setAsk(which) {
  const S = app.set;
  if (S.busy || !canAct()) return;
  S.err[which] = null;
  S.errs[which] = validateSet(which);
  if (Object.keys(S.errs[which]).length) { S.confirm = null; renderApp(); return; }
  const changes = [];
  for (const f of SET_SPEC[which]) {
    const a = normV(f, S.base[which][f.key]), b = normV(f, S[which][f.key]);
    if (a !== b) changes.push({ label: t(f.label), from: showVal(f, S.base[which][f.key]), to: showVal(f, S[which][f.key]) });
  }
  if (!changes.length) { S.err[which] = t('cf_none'); renderApp(); return; }
  S.confirm = { which, changes };
  renderApp();
  const b = $(`set-${which}-yes`); if (b) b.focus();
}
async function setSave(which) {
  const S = app.set;
  if (S.busy || !S.confirm || S.confirm.which !== which) return;
  const d = S[which];
  const key = which === 'ai' ? 'ai_limits' : 'calorie_alert';
  const value = which === 'ai'
    ? { barcode_per_day: toNum(d.barcode_per_day), meal_photos_per_day: toNum(d.meal_photos_per_day) }
    : { enabled: !!d.enabled, threshold: toNum(d.threshold), title_ar: str(d.title_ar).trim(), body_ar: str(d.body_ar).trim(), title_en: str(d.title_en).trim() || null, body_en: str(d.body_en).trim() || null };
  S.busy = which; renderApp();
  try {
    let saved = value;
    if (app.isSample) toast(t('sample_action'));
    else { const res = await write(QA.saveSetting(key, value)); if (isObj(res) && isObj(res.value)) saved = res.value; toast(t('saved_ok')); }
    // البطاقة اللي انحفظت بس تاخذ القيمة المحفوظة (حتى لو إعادة القراءة فشلت)؛ البطاقة الثانية تحتفظ بتعديلاتك اللي ما حفظتها
    if (app.content && isObj(app.content.settings)) app.content.settings[key] = saved;
    S.confirm = null; S.dirty[which] = false;
    setDrafts(false);
    if (!app.isSample) await loadContent();
  } catch (e) {
    S.confirm = null; S.err[which] = friendly(e, key);
    const info = (e && e.info) || errInfo(e);
    if (info.code === 'bad_value' && info.field) S.errs[which] = { [info.field]: S.err[which] };
  } finally { S.busy = null; renderApp(); }
}

// ===================== الرسم =====================
function renderApp() {
  if (state.top !== 'app') return;
  appSyncMode();
  const root = $('appView');
  if (!root) return;
  if (!$('reqSec')) {
    root.replaceChildren(h('div', { class: 'app-grid' },
      h('section', { class: 'sec', id: 'reqSec', 'aria-labelledby': 'reqTitle' }),
      h('section', { class: 'sec', id: 'ctSec', 'aria-labelledby': 'ctTitle' })));
  }
  const keep = focusState();
  renderReqSec();
  renderCtSec();
  restoreFocus(keep);
  if (app.sheet) renderAppSheet();
  renderTop(); // زر «تحديث» يدور وقت التحميل، و«الطلبات تحدّثت»
}
function secHead(id, ic, title, sub, right) {
  return h('div', { class: 'sec-head' }, h('span', { class: 'sec-ic' }, icon(ic)),
    h('div', { class: 'item-main' }, h('h2', { id, text: title }), sub ? h('p', { text: sub }) : null), right || null);
}
function xlink(href, label, ic) {
  return h('a', { class: 'xlink', href, target: '_blank', rel: 'noopener noreferrer' }, icon(ic || 'link', 'xs'), h('span', { text: label }));
}
function ccrNote() {
  if (app.isSample) return h('div', { class: 'note-box ccr', role: 'note' }, h('span', { text: t('ccr_sample') }));
  if (!ccrBlocked()) return null;
  const k = app.ccr;
  return h('div', { class: 'err-box ccr', role: 'alert' }, h('strong', { text: t(`ccr_${k}_t`) }), h('span', { text: t(`ccr_${k}`) }),
    k !== 'policy' && k !== 'disabled' ? h('div', null, h('button', { type: 'button', class: 'btn sm', id: 'ccrRetry', onclick: () => { app.ccr = null; ccrProbe(true); renderApp(); checkStatuses({ manual: true }); } }, icon('refresh', 'sm'), t('try_again'))) : null);
}
function renderReqSec() {
  const sec = $('reqSec');
  put(sec, secHead('reqTitle', 'code', t('req_title'), t('req_sub')), ccrNote(), reqForm(), reqList());
}
function fieldErr(id, msg) { return msg ? h('span', { class: 'inline-err', id: `${id}-err`, text: msg }) : null; }
function selectEl(id, options, value, onPick, extra) {
  const sel = h('select', Object.assign({ id, class: 'input' }, extra || {}));
  for (const o of options) sel.append(h('option', { value: o.value, selected: o.value === value || null }, o.label));
  sel.value = value;
  sel.addEventListener('change', (e) => onPick(e.target.value));
  return sel;
}
function reqForm() {
  const f = app.form;
  const busy = !!f.busy;
  const dbReady = reqDbReady();
  const can = canAct() && dbReady;
  const body = h('div', { class: 'req-form' });
  body.append(h('h3', { class: 'block-title', text: t('req_new') }));
  body.append(h('div', { class: 'field' }, h('label', { for: 'reqFTitle', text: t('req_f_title') }),
    h('input', { id: 'reqFTitle', class: 'input', maxlength: 120, value: f.title, placeholder: t('req_f_title_ph'), disabled: busy || null, 'aria-invalid': f.errs.title ? 'true' : null,
      'aria-describedby': f.errs.title ? 'reqFTitle-err' : null, oninput: (e) => { f.title = e.target.value; } }), fieldErr('reqFTitle', f.errs.title)));
  body.append(h('div', { class: 'field' }, h('label', { for: 'reqFArea', text: t('req_f_area') }),
    selectEl('reqFArea', REQ_AREAS.map((a) => ({ value: a, label: areaLabel(a) })), f.area, (v) => { f.area = v; }, { disabled: busy || null })));
  const count = h('span', { class: 'count', dir: 'ltr', text: t('req_f_count', { n: fmt(cpLen(f.body)) }) });
  body.append(h('div', { class: 'field' }, h('label', { for: 'reqFBody', text: t('req_f_body') }),
    h('textarea', { id: 'reqFBody', class: 'input', maxlength: 4000, rows: 5, value: f.body, placeholder: t('req_f_body_ph'), disabled: busy || null, 'aria-invalid': f.errs.body ? 'true' : null,
      'aria-describedby': f.errs.body ? 'reqFBody-err' : null, oninput: (e) => { f.body = e.target.value; count.textContent = t('req_f_count', { n: fmt(cpLen(f.body)) }); } }),
    h('div', { class: 'field-foot' }, fieldErr('reqFBody', f.errs.body) || h('span'), count)));
  if (f.pending && !busy && !app.isSample) {
    // الجلسة انفتحت والحفظ فشل: الرابط ما يضيع (ينحفظ بالمتصفح لين ينحفظ الطلب)، والإغلاق يحتاج تأكيد
    const close = f.closeAsk
      ? h('div', { class: 'confirm', role: 'group', 'aria-labelledby': 'reqCloseT' }, h('span', { class: 'small', id: 'reqCloseT', text: t('req_close_confirm') }),
        h('div', { class: 'item-actions' },
          h('button', { type: 'button', id: 'reqCloseYes', class: 'btn sm danger', onclick: reqDropPending }, icon('x', 'sm'), t('req_close_btn')),
          h('button', { type: 'button', id: 'reqCloseNo', class: 'btn sm ghost', onclick: () => { f.closeAsk = false; renderApp(); const el = $('reqCloseP'); if (el) el.focus(); } }, t('back'))))
      : null;
    body.append(h('div', { class: 'err-box', role: 'alert' }, h('strong', { text: f.err || t('req_err_save') }),
      f.saveErr ? h('span', { text: f.saveErr }) : null,
      f.pending.url ? xlink(f.pending.url, f.pending.url, 'branch') : h('span', { text: t('req_find_session') }),
      close || h('div', { class: 'item-actions' },
        f.saveFatal ? null : h('button', { type: 'button', id: 'reqRetrySave', class: 'btn sm primary', disabled: !canAct() || null, onclick: reqSave }, icon('refresh', 'sm'), t('req_retry_save')),
        h('button', { type: 'button', id: 'reqCloseP', class: 'btn sm ghost', onclick: () => { f.closeAsk = true; renderApp(); const el = $('reqCloseNo'); if (el) el.focus(); } }, t('close')))));
  } else if (busy) {
    body.append(h('div', { class: 'run-state', role: 'status' }, h('span', { class: 'spin' }), t(f.busy === 'save' ? 'req_saving' : 'req_sending')));
  } else if (f.confirm) {
    // بعد create_session ما ردّ: التأكيد يذكّرك إن الأولى يمكن انفتحت، والزر يقول «جلسة ثانية»
    body.append(h('div', { class: 'confirm', role: 'group', 'aria-labelledby': 'reqConfirmT' },
      h('strong', { id: 'reqConfirmT', text: t(f.unknown ? 'req_unknown_confirm_t' : 'req_confirm_t') }), h('span', { class: 'small', text: t(f.unknown ? 'req_unknown_confirm' : 'req_confirm') }),
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', id: 'reqGo', class: `btn sm ${f.unknown ? 'danger' : 'primary'}`, disabled: !can || null, onclick: reqSubmit }, icon('send', 'sm'), t(f.unknown ? 'req_unknown_go' : 'req_confirm_btn')),
        h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { f.confirm = false; renderApp(); $('reqSend') && $('reqSend').focus(); } }, t('cancel')))));
  } else {
    if (f.unknown) {
      body.append(h('div', { class: 'err-box', role: 'alert', id: 'reqUnknown' }, h('strong', { text: t('req_unknown_t') }), h('span', { text: t('req_unknown') }),
        xlink('https://claude.ai/code', 'claude.ai/code', 'code'),
        h('div', { class: 'item-actions' }, h('button', { type: 'button', id: 'reqClear', class: 'btn sm ghost', onclick: () => { Object.assign(f, { unknown: false, title: '', body: '', area: 'app', errs: {} }); renderApp(); const el = $('reqFTitle'); if (el) el.focus(); } }, t('req_clear')))));
    }
    if (f.err) body.append(h('div', { class: 'err-box', role: 'alert', text: f.err }));
    if (f.notice) body.append(h('div', { class: 'note-box', role: 'status', text: f.notice }));
    // القاعدة ما تقدر تحفظ الطلب (الدوال ناقصة، صلاحيات، للقراءة بس…): ما نفتح جلسة ما تنحفظ
    if (canAct() && !dbReady && (app.reqErr || state.readOnly)) body.append(h('div', { class: 'note-box', role: 'status', id: 'reqDbNote', text: t('req_db_block') }));
    body.append(h('div', { class: 'item-actions' }, h('button', { type: 'button', id: 'reqSend', class: 'btn primary', disabled: !can || null, onclick: reqAsk }, icon('send', 'sm'), t(f.unknown ? 'req_send_again' : 'req_send'))));
  }
  return body;
}
function reqList() {
  const list = app.requests;
  const open = arr(list).filter((r) => REQ_OPEN.includes(r.status)).length;
  const head = h('div', { class: 'block-head' },
    h('h3', { class: 'block-title' }, t('req_list'), list && list.length ? h('span', { class: 'pill plain num', text: fmt(list.length) }) : null,
      open ? h('span', { class: 'pill work', text: t('req_open_n', { n: fmt(open) }) }) : null),
    h('button', { type: 'button', id: 'reqCheck', class: `btn sm${app.checking ? ' busy' : ''}`, disabled: !canAct() || app.checking || !list || null, onclick: () => checkStatuses({ manual: true }) },
      app.checking ? h('span', { class: 'spin' }) : icon('refresh', 'sm'), t(app.checking ? 'req_checking' : 'req_check_all')));
  const out = [head];
  if (app.checkedAt && !app.isSample) out.push(h('div', { class: 'small muted', text: t('req_checked', { t: ago(new Date(app.checkedAt).toISOString()) }) }));
  if (app.checkErr) out.push(h('div', { class: 'inline-err', role: 'alert', text: app.checkErr }));
  if (app.reqErr) out.push(errBox(app.reqErr, app.requests ? t('dash_stale') : null));
  if (state.needAdmin && !app.requests) out.push(adminPicker('A'));
  if (!list) { if (!app.reqErr) out.push(waitBox()); }
  else if (!list.length) out.push(h('div', { class: 'empty', text: t('req_empty') }));
  else out.push(h('div', { class: 'reqs' }, list.map(reqRow)));
  return h('div', { class: 'block req-list' }, out);
}
function reqRow(r) {
  const rs = app.rq[r.id] || {};
  const st = REQ_STATUSES.includes(r.status) ? r.status : 'sent';
  const hasS = SESSION_RE.test(str(r.session_id));
  const sUrl = SESSION_URL_RE.test(str(r.session_url)) ? r.session_url : hasS ? `https://claude.ai/code/${r.session_id}` : null;
  const pr = PR_URL_RE.test(str(r.pr_url)) ? r.pr_url : null;
  const can = canAct() && !rs.busy;
  const id = `rq-${r.id}`;
  const area = REQ_AREAS_DB.includes(r.area) ? areaLabel(r.area === 'users' ? 'activity' : r.area) : null;
  // التفاصيل تنفتح وتنقفل بزر (تبقى مفتوحة بعد التحديث كل دقيقة)
  const detBtn = h('button', { type: 'button', class: 'link', id: `${id}-more`, 'aria-expanded': String(!!rs.open), 'aria-controls': `${id}-body`,
    onclick: () => { const x = rowState(r.id); x.open = !x.open; renderApp(); } }, icon('down', `xs${rs.open ? ' up' : ''}`), t('req_details'));
  const actions = [detBtn];
  if (hasS && st !== 'cancelled') {
    actions.push(h('button', { type: 'button', id: `${id}-status`, class: `btn sm${rs.busy === 'status' ? ' busy' : ''}`, disabled: !can || null, onclick: () => checkStatuses({ only: r.id }) },
      rs.busy === 'status' ? h('span', { class: 'spin' }) : icon('refresh', 'sm'), t('req_refresh')));
    actions.push(h('button', { type: 'button', id: `${id}-noteBtn`, class: 'btn sm', 'aria-expanded': String(typeof rs.note === 'string'), disabled: !can || null,
      onclick: () => { const x = rowState(r.id); x.note = typeof x.note === 'string' ? null : ''; x.err = null; x.msg = null; x.noteUnknown = false; renderApp(); const el = $(`${id}-note`); if (el) el.focus(); } }, icon('send', 'sm'), t('req_note')));
  }
  if (REQ_OPEN.includes(st)) {
    actions.push(h('button', { type: 'button', id: `${id}-cancel`, class: 'btn sm ghost', disabled: !can || null, onclick: () => { const x = rowState(r.id); x.cancelAsk = true; x.err = null; renderApp(); const el = $(`${id}-cancelYes`); if (el) el.focus(); } }, icon('x', 'sm'), t('req_cancel')));
  }
  const kids = [
    h('div', { class: 'item-top' },
      h('div', { class: 'item-main' }, h('div', { class: 'item-name', dir: 'auto', text: str(r.title) }),
        h('div', { class: 'item-meta' }, area ? h('span', { text: area }) : null, h('span', { class: 'num', text: ago(r.created_at) }),
          sUrl ? xlink(sUrl, t('req_session'), 'code') : null, pr ? xlink(pr, t('req_pr'), 'branch') : null)),
      pill(t(`rs_${st}`), REQ_PILL[st], st === 'working' || st === 'needs_you')),
    h('div', { class: 'item-actions' }, actions),
  ];
  if (rs.open) kids.push(h('div', { class: 'item-msg req-text', id: `${id}-body`, dir: 'auto', text: str(r.request) }));
  if (typeof rs.note === 'string') {
    kids.push(h('div', { class: 'confirm' },
      h('div', { class: 'field' }, h('label', { for: `${id}-note`, text: t('req_note_label') }),
        h('textarea', { id: `${id}-note`, class: 'input', maxlength: 4000, rows: 3, value: rs.note, placeholder: t('req_note_ph'), disabled: rs.busy === 'note' || null, oninput: (e) => { rowState(r.id).note = e.target.value; } })),
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', id: `${id}-noteSend`, class: `btn sm primary${rs.busy === 'note' ? ' busy' : ''}`, disabled: !!rs.busy || null, onclick: () => reqNote(r) }, rs.busy === 'note' ? h('span', { class: 'spin' }) : icon('send', 'sm'), t(rs.noteUnknown ? 'req_note_again' : 'req_note_send')),
        h('button', { type: 'button', class: 'btn sm ghost', disabled: !!rs.busy || null, onclick: () => { rowState(r.id).note = null; renderApp(); } }, t('cancel')))));
  }
  if (rs.cancelAsk) {
    kids.push(h('div', { class: 'confirm' }, h('span', { class: 'small', text: t('req_cancel_confirm') }),
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', id: `${id}-cancelYes`, class: `btn sm danger${rs.busy === 'cancel' ? ' busy' : ''}`, disabled: !!rs.busy || null, onclick: () => reqCancel(r) }, rs.busy === 'cancel' ? h('span', { class: 'spin' }) : icon('x', 'sm'), t('req_cancel_btn')),
        h('button', { type: 'button', class: 'btn sm ghost', disabled: !!rs.busy || null, onclick: () => { rowState(r.id).cancelAsk = false; renderApp(); } }, t('back')))));
  }
  if (rs.msg) kids.push(h('div', { class: 'small ok-text', role: 'status', text: rs.msg }));
  if (rs.err) kids.push(h('div', { class: 'inline-err', role: 'alert', text: rs.err }));
  return h('article', { class: `item req ${st}`, id }, kids);
}

// ---------- المحتوى والإعدادات ----------
function renderCtSec() {
  const sec = $('ctSec');
  const tabs = h('div', { class: 'ctabs', role: 'tablist', 'aria-label': t('ct_title') }, APP_SUBS.map((s) =>
    h('button', { type: 'button', role: 'tab', id: `ct-${s}`, 'aria-selected': String(app.sub === s), 'aria-controls': 'ctPanel', tabindex: app.sub === s ? '0' : '-1',
      onclick: () => selectSub(s), onkeydown: (e) => tabKeys(e, APP_SUBS, s, selectSub, 'ct-') }, t(`sub_${s}`))));
  const panel = h('div', { class: 'ct-panel', id: 'ctPanel', role: 'tabpanel', 'aria-labelledby': `ct-${app.sub}` });
  let body;
  try { body = subBody(app.sub); } catch (e) { body = [errBox({ msg: t('err_generic'), raw: str(e && e.message) })]; }
  put(panel, body);
  put(sec, secHead('ctTitle', 'sliders', t('ct_title'), t('ct_sub')), tabs, panel);
}
/** أسهم الكيبورد بين التبويبات */
function tabKeys(e, list, cur, pick, idOf) {
  const rtl = document.documentElement.dir === 'rtl';
  let d = 0;
  if (e.key === 'ArrowRight') d = rtl ? -1 : 1; else if (e.key === 'ArrowLeft') d = rtl ? 1 : -1; else if (e.key === 'Home') d = -list.indexOf(cur); else if (e.key === 'End') d = list.length - 1 - list.indexOf(cur);
  if (!d) return;
  e.preventDefault();
  const next = list[(list.indexOf(cur) + d + list.length) % list.length];
  pick(next);
  const el = $(typeof idOf === 'function' ? idOf(next) : `${idOf}${next}`); if (el) el.focus();
}
function selectSub(s) {
  if (!APP_SUBS.includes(s)) return;
  app.sub = s; store('appSub', s); app.ask = null; app.ctNotice = null;
  renderApp();
  ensureSub(false);
}
function subBody(s) {
  if (CONTENT_SUBS.includes(s)) {
    if (!app.content) return [app.contentErr ? errBox(app.contentErr) : waitBox(), state.needAdmin && app.requests ? adminPicker('B') : null];
    const stale = [app.contentErr ? errBox(app.contentErr, t('dash_stale')) : null,
      app.ctNotice && app.ctNotice.sub === s ? h('div', { class: 'note-box', role: 'status', id: 'ctNotice', text: app.ctNotice.msg }) : null];
    if (s === 'ads') return [stale, adsBody()];
    if (s === 'events') return [stale, eventsBody()];
    if (s === 'nudges') return [stale, nudgesBody()];
    return [stale, settingsBody()];
  }
  if (s === 'partners') return partnersBody();
  return usersBody();
}
function rowActs(...kids) { return h('div', { class: 'item-actions' }, kids); }
/** صف محتوى: يمين = العنوان والتفاصيل، يسار = الحالة والأزرار (وعلى الجوال تحت بعض) */
function crow(key, cls, main, chips, actions) {
  return h('div', { class: `item crow${cls ? ` ${cls}` : ''}`, id: `row-${key}` },
    h('div', { class: 'crow-main' }, main),
    h('div', { class: 'crow-side' }, chips && chips.filter(Boolean).length ? h('div', { class: 'chips' }, chips) : null, actions || null),
    askBox(key));
}
function editBtn(id, onclick) { return h('button', { type: 'button', id, class: 'btn sm', disabled: !canAct() || null, onclick }, icon('pen', 'sm'), t('edit')); }
function askBox(key) {
  const a = app.ask;
  if (!a || a.key !== key) return null;
  return h('div', { class: 'confirm ask', role: 'group' }, h('span', { class: 'small', text: a.msg }),
    a.withNote ? h('div', { class: 'field' }, h('label', { for: `${key}:note`, text: t('pa_note') }),
      h('textarea', { id: `${key}:note`, class: 'input', maxlength: NOTE_MAX, rows: 2, value: a.note, disabled: a.busy || null, oninput: (e) => { a.note = e.target.value; } })) : null,
    h('div', { class: 'item-actions' },
      h('button', { type: 'button', id: `${key}:yes`, class: `btn sm ${a.danger ? 'danger' : 'primary'}${a.busy ? ' busy' : ''}`, disabled: a.busy || null, onclick: runAsk }, a.busy ? h('span', { class: 'spin' }) : icon('check', 'sm'), a.yes),
      h('button', { type: 'button', class: 'btn sm ghost', disabled: a.busy || null, onclick: () => { app.ask = null; renderApp(); } }, t('cancel'))),
    a.err ? h('div', { class: 'inline-err', role: 'alert', text: a.err }) : null);
}
function toggleBtn(kind, row, onLabel, offLabel) {
  const key = `${kind}:${row.id}`;
  const on = row.active === true;
  return h('button', { type: 'button', id: `${key}:toggle`, class: 'btn sm', 'aria-pressed': String(on), disabled: !canAct() || (app.ask && app.ask.busy) || null,
    onclick: () => ask(key, { msg: t(`cf_${kind}_${on ? 'off' : 'on'}`), yes: on ? offLabel : onLabel, danger: on, ctx: kind, run: () => setActive(kind, row, !on) }) },
  icon('power', 'sm'), on ? offLabel : onLabel);
}
function adsBody() {
  const ads = arr(app.content.ads);
  return [
    h('div', { class: 'note-box', text: t('ads_note') }),
    ads.length ? h('div', { class: 'crows' }, ads.map(adRow)) : h('div', { class: 'empty', text: t('ads_empty') }),
  ];
}
function adDates(a) {
  const s = a.starts_at ? fmtDate(a.starts_at, true) : '', e = a.ends_at ? fmtDate(`${tsEndDay(a.ends_at)}`, true) : '';
  if (s && e) return t('ad_dates', { a: s, b: e });
  if (s) return t('ad_from', { a: s });
  if (e) return t('ad_until', { b: e });
  return t('ad_nodate');
}
function adRow(a) {
  const key = `ad:${a.id}`;
  const st = AD_STATES.includes(a.state) ? a.state : 'off';
  const kind = AD_KINDS.includes(a.kind) ? a.kind : 'ad';
  return crow(key, st === 'live' ? 'live' : st === 'off' ? 'off' : '', [
    h('div', { class: 'item-name', dir: 'auto', text: str(a.title) }),
    h('div', { class: 'item-meta' }, h('span', { text: t(`ad_kind_${kind}`) }), h('span', { class: 'num', text: adDates(a) }),
      h('span', { text: t(`ad_aud_${AD_AUD.includes(a.audience) ? a.audience : 'all'}`) }), h('span', { text: t(`freq_${AD_FREQ.includes(a.frequency) ? a.frequency : 'daily'}`) }),
      h('span', { class: 'num', text: t('ad_priority', { n: fmt(num(a.priority)) }) }),
      ['image', 'gif', 'video'].includes(a.media_type) ? h('span', { text: t(`media_${a.media_type}`) }) : null),
    a.link || a.cta ? h('div', { class: 'ad-link small muted' }, a.cta ? h('span', { dir: 'auto', text: `«${str(a.cta)}»` }) : null, a.link ? h('bdi', { class: 'mono', dir: 'ltr', text: clip(a.link, 80) }) : null) : null,
  ], [pill(t(`ad_state_${st}`), st === 'live' ? 'ok' : st === 'scheduled' ? 'info' : 'plain', st === 'live')],
  rowActs(editBtn(`${key}:edit`, () => openAppSheet('ad', a)), toggleBtn('ad', a, t('turn_on'), t('turn_off'))));
}
function eventsBody() {
  const today = todayRiyadh();
  const evs = arr(app.content.events);
  const endOf = (e) => str(e.ends_on || e.starts_on);
  const past = evs.filter((e) => endOf(e) && endOf(e) < today).sort((a, b) => endOf(b).localeCompare(endOf(a)));
  const up = evs.filter((e) => !past.includes(e)).sort((a, b) => (str(a.starts_on) || '9999').localeCompare(str(b.starts_on) || '9999'));
  return [
    h('div', { class: 'toolbar' }, h('span', { class: 'small muted', text: t('p_count', { n: fmt(evs.length) }) }),
      h('button', { type: 'button', id: 'evAdd', class: 'btn sm primary', disabled: !canAct() || null, onclick: () => openAppSheet('event', null) }, icon('plus', 'sm'), t('ev_add'))),
    evs.length ? null : h('div', { class: 'empty', text: t('ev_empty') }),
    up.length ? h('h4', { class: 'group-t', text: t('ev_upcoming') }) : null,
    up.length ? h('div', { class: 'crows' }, up.map((e) => eventRow(e, false))) : null,
    past.length ? h('h4', { class: 'group-t', text: t('ev_past_h') }) : null,
    past.length ? h('div', { class: 'crows' }, past.map((e) => eventRow(e, true))) : null,
  ];
}
function eventRow(e, isPast) {
  const key = `event:${e.id}`;
  const cat = EVENT_CATS.includes(e.category) ? e.category : 'other';
  const note = pickEn(e.date_note, e.date_note_en);
  const when = note || (e.starts_on ? `${fmtDate(e.starts_on, true)}${e.ends_on && e.ends_on !== e.starts_on ? ` – ${fmtDate(e.ends_on, true)}` : ''}` : t('ev_year_round'));
  return crow(key, e.active === false ? 'off' : '', [
    h('div', { class: 'item-name', dir: 'auto', text: pickEn(e.title, e.title_en) }),
    h('div', { class: 'item-meta' }, h('span', { text: t(`ecat_${cat}`) }), h('span', { class: 'num', text: when }),
      e.city || e.city_en ? h('span', { text: pickEn(e.city, e.city_en) }) : null, e.venue ? h('span', { dir: 'auto', text: pickEn(e.venue, e.venue_en) }) : null),
  ], [e.featured ? pill(t('ev_featured'), 'work') : null, isPast ? pill(t('ev_past'), 'plain') : null,
    pill(t(e.active === false ? 'ev_hidden' : 'ev_visible'), e.active === false ? 'plain' : 'ok', e.active !== false)],
  rowActs(editBtn(`${key}:edit`, () => openAppSheet('event', e)), toggleBtn('event', e, t('ev_show'), t('ev_hide'))));
}
function nudgesBody() {
  const N = app.nd;
  const all = arr(app.content.nudges);
  const list = all.filter((x) => (N.cat === 'all' || x.category === N.cat) && (N.locale === 'all' || x.locale === N.locale));
  const shown = list.slice(0, N.show);
  return [
    h('div', { class: 'toolbar' },
      h('div', { class: 'field inline' }, h('label', { for: 'ndCat', text: t('f_nd_category') }),
        selectEl('ndCat', [{ value: 'all', label: t('all') }].concat(opts(NUDGE_CATS, 'ncat_')), N.cat, (v) => { N.cat = v; N.show = NUDGE_PAGE; renderApp(); })),
      h('div', { class: 'chips', role: 'group', 'aria-label': t('f_locale') }, ['all'].concat(LANGS).map((l) =>
        h('button', { type: 'button', class: 'chip', id: `ndLoc-${l}`, 'aria-pressed': String(N.locale === l), onclick: () => { N.locale = l; N.show = NUDGE_PAGE; renderApp(); } }, l === 'all' ? t('all') : t(`lang_${l}`)))),
      h('span', { class: 'small muted grow', text: t('nd_count', { n: fmt(list.length) }) }),
      h('button', { type: 'button', id: 'ndAdd', class: 'btn sm primary', disabled: !canAct() || null, onclick: () => openAppSheet('nudge', null) }, icon('plus', 'sm'), t('nd_add'))),
    shown.length ? h('div', { class: 'crows' }, shown.map(nudgeRow)) : h('div', { class: 'empty', text: t('nd_empty') }),
    list.length > shown.length ? h('button', { type: 'button', class: 'btn sm ghost', id: 'ndMore', onclick: () => { N.show += NUDGE_PAGE; renderApp(); } }, t('show_more', { n: fmt(list.length - shown.length) })) : null,
  ];
}
function nudgeRow(x) {
  const key = `nudge:${x.id}`;
  const cat = NUDGE_CATS.includes(x.category) ? x.category : 'gym';
  const who = (g) => t(g === 'male' || g === 'female' ? `g_${g}` : 'aud_all');
  const dir = x.locale === 'en' ? 'ltr' : 'rtl'; // المتغيرات {name} إنجليزية: الاتجاه من لغة النص مو من أول حرف
  const last = x.last_broadcast_at ? (typeof x.last_broadcast_n === 'number' ? t('nd_last', { t: ago(x.last_broadcast_at), n: fmt(x.last_broadcast_n) }) : t('nd_last_t', { t: ago(x.last_broadcast_at) })) : t('nd_never');
  return crow(key, x.active ? '' : 'off', [
    h('div', { class: 'item-name txt', dir, text: str(x.title) }), h('div', { class: 'item-msg txt', dir, text: str(x.body) }),
    h('div', { class: 'item-meta' }, h('span', { text: t(`ncat_${cat}`) }), h('span', { text: who(x.gender) }),
      cat === 'friend' ? h('span', { text: t('nd_friend_v', { v: who(x.friend_gender) }) }) : null,
      h('span', { text: t(`lang_${x.locale === 'en' ? 'en' : 'ar'}`) }), h('span', { class: 'num', text: last })),
  ], [pill(t(x.active ? 'nd_active' : 'nd_paused'), x.active ? 'ok' : 'plain', !!x.active)],
  rowActs(editBtn(`${key}:edit`, () => openAppSheet('nudge', x)), toggleBtn('nudge', x, t('turn_on'), t('turn_off'))));
}
function setField(which, f) {
  const S = app.set, d = S[which];
  const id = `set-${which}-${f.key}`;
  const err = S.errs[which] && S.errs[which][f.key];
  const busy = !!S.busy;
  const touch = () => { S.dirty[which] = true; if (S.confirm && S.confirm.which === which) { S.confirm = null; renderApp(); } };
  if (f.type === 'check') {
    return h('label', { class: 'check-row', for: id }, h('input', { type: 'checkbox', id, checked: d[f.key] || null, disabled: busy || null, onchange: (e) => { d[f.key] = e.target.checked; touch(); } }), h('span', { text: t(f.label) }));
  }
  const attrs = { id, class: `input${f.type === 'num' ? ' num' : ''}`, value: str(d[f.key]), disabled: busy || null, dir: f.dir || (f.type === 'num' ? 'ltr' : 'auto'),
    'aria-invalid': err ? 'true' : null, 'aria-describedby': err ? `${id}-err` : null, oninput: (e) => { d[f.key] = e.target.value; touch(); } };
  if (f.type === 'num') Object.assign(attrs, { inputmode: 'numeric', maxlength: 4 });
  else Object.assign(attrs, { maxlength: f.max });
  const input = f.type === 'textarea' ? h('textarea', Object.assign(attrs, { rows: 2 })) : h('input', attrs);
  const hint = f.type === 'num' ? (which === 'ai' ? t('f_range', { a: f.lo, b: f.hi }) : t('f_threshold_hint')) : null;
  return h('div', { class: `field${f.wide ? ' wide' : ''}` }, h('label', { for: id, text: t(f.label) }), input, hint ? h('span', { class: 'hint', text: hint }) : null, fieldErr(id, err));
}
function setCard(which) {
  const S = app.set;
  if (!S[which]) return null;
  const title = which === 'ai' ? t('set_ai_t') : t('set_cal_t');
  const sub = which === 'ai' ? t('set_ai_sub') : t('set_cal_sub');
  const conf = S.confirm && S.confirm.which === which ? S.confirm : null;
  const busy = S.busy === which;
  return h('section', { class: 'set-card', 'aria-labelledby': `set-${which}-t` },
    h('h3', { class: 'block-title', id: `set-${which}-t`, text: title }), h('p', { class: 'small muted', text: sub }),
    h('div', { class: 'fgrid' }, SET_SPEC[which].map((f) => setField(which, f))),
    which === 'cal' ? h('div', { class: 'hint small muted', text: t('cal_vars') }) : null,
    conf ? diffBox(conf.changes, h('div', { class: 'item-actions' },
      h('button', { type: 'button', id: `set-${which}-yes`, class: `btn sm primary${busy ? ' busy' : ''}`, disabled: busy || null, onclick: () => setSave(which) }, busy ? h('span', { class: 'spin' }) : icon('check', 'sm'), t('cf_confirm')),
      h('button', { type: 'button', class: 'btn sm ghost', disabled: busy || null, onclick: () => { S.confirm = null; renderApp(); } }, t('cf_back'))))
      : h('div', { class: 'item-actions' }, h('button', { type: 'button', id: `set-${which}-save`, class: 'btn sm primary', disabled: !canAct() || !!S.busy || null, onclick: () => setAsk(which) }, icon('check', 'sm'), t('set_save'))),
    S.err[which] ? h('div', { class: 'inline-err', role: 'alert', text: S.err[which] }) : null);
}
function settingsBody() {
  if (!app.set.ai) setDrafts(true);
  return [h('div', { class: 'set-grid' }, setCard('ai'), setCard('cal'))];
}
/** ملخص التغييرات قبل الحفظ */
function diffBox(changes, actions) {
  return h('div', { class: 'confirm diff', role: 'group', 'aria-label': t('cf_title') },
    h('strong', { text: t('cf_title') }),
    // كل قيمة معزولة (<bdi>) والسهم يمشي مع اتجاه الصفحة: القديم ثم الجديد
    h('ul', { class: 'diff-list' }, changes.map((c) => h('li', null, h('span', { class: 'dk', text: c.label }),
      h('span', { class: 'dv' }, c.from === undefined ? h('bdi', { text: c.to }) : [h('bdi', { class: 'old', text: c.from }), ` ${t('cf_arrow')} `, h('bdi', { text: c.to })])))),
    h('span', { class: 'small muted', text: t('cf_live') }), actions);
}
function partnersBody() {
  const P = app.partners;
  const go = () => { P.q = collapse(P.qDraft).slice(0, 80); app.ask = null; loadPartners(); };
  const rows = P.rows;
  return [
    h('div', { class: 'chips', role: 'group', 'aria-label': t('sub_partners') }, PARTNER_KINDS.map((k) =>
      h('button', { type: 'button', class: 'chip', id: `pk-${k}`, 'aria-pressed': String(P.kind === k), onclick: () => { if (P.kind === k) return; P.kind = k; app.ask = null; if (!app.isSample) P.rows = null; loadPartners(); } }, t(`pk_${k}`)))),
    searchBar('pSearch', P.qDraft, t('p_search_ph'), (v) => { P.qDraft = v; }, go),
    P.err ? errBox(P.err, rows ? t('dash_stale') : null) : null,
    !rows ? (P.err ? null : waitBox()) : !rows.length ? h('div', { class: 'empty', text: t('p_empty') })
      : [h('div', { class: 'small muted', text: t('p_count', { n: fmt(rows.length) }) }), h('div', { class: 'crows' }, rows.map(partnerRow))],
  ];
}
function searchBar(id, value, ph, onInput, onGo, extra) {
  const form = h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); onGo(); } },
    h('label', { for: id, class: 'sr-only', text: ph }),
    h('input', { id, class: 'input', type: 'search', maxlength: 80, value, placeholder: ph, oninput: (e) => onInput(e.target.value) }),
    extra || null,
    h('button', { type: 'submit', class: 'btn sm', id: `${id}Go` }, icon('search', 'sm'), t('search')));
  return form;
}
function partnerMeta(kind, m) {
  if (!isObj(m)) return null;
  if (kind === 'club') return t('pm_club', { a: fmt(num(m.branches)), b: fmt(num(m.managers)) });
  if (kind === 'store') return [str(m.city), t('pm_store', { a: fmt(num(m.products)) })].filter(Boolean).join(' · ');
  if (kind === 'coach') return [str(m.city), t('pm_coach', { a: fmt(num(m.clients)) })].filter(Boolean).join(' · ');
  if (kind === 'venue') return [str(m.city), t('pm_venue', { a: fmt(num(m.courts)), b: fmt(num(m.classes)) })].filter(Boolean).join(' · ');
  if (kind === 'center') return arr(m.cities).map(str).filter(Boolean).join('، ');
  return null;
}
function partnerRow(p) {
  const kind = app.partners.kind;
  const key = `partner:${p.id}`;
  const st = ['pending', 'approved', 'listed', 'suspended', 'rejected'].includes(p.status) ? p.status : 'pending';
  const stCls = { pending: 'wait', approved: 'ok', listed: 'info', suspended: 'plain', rejected: 'fail' }[st];
  const act = (action, danger) => h('button', { type: 'button', id: `${key}:${action}`, class: 'btn sm', disabled: !canAct() || (app.ask && app.ask.busy) || null,
    onclick: () => ask(key, { msg: t(`cf_pa_${action}`), yes: t(`pa_${action}`), danger, ctx: 'partner', withNote: action === 'hide', run: (a) => partnerAct(p, action, str(a.note).trim().slice(0, NOTE_MAX)) }) },
  t(`pa_${action}`));
  const acts = [];
  if (kind === 'club') {
    acts.push(st === 'suspended' ? act('show') : act('hide', true));
    acts.push(p.partner ? act('partner_off', true) : act('partner_on'));
  } else if (st === 'approved') acts.push(act('hide', true));
  else if (st === 'suspended') acts.push(act('show'));
  const meta = partnerMeta(kind, p.meta);
  // مدراء النادي يجون «a، b»: كل واحد بـ @
  const owners = str(p.owner_username).split(/\s*[،,]\s*/).filter(Boolean).map((u) => `@${u}`).join('، ');
  return crow(key, st === 'suspended' ? 'off' : '', [
    h('div', { class: 'item-name', dir: 'auto', text: str(p.name) || t('anon') }),
    h('div', { class: 'item-meta' }, p.subtitle ? h('span', { dir: 'auto', text: str(p.subtitle) }) : null,
      owners ? h('span', { dir: 'ltr', text: owners }) : null,
      p.listed_by === 'arq' ? h('span', { text: t('p_by_arq') }) : null, meta ? h('span', { text: meta }) : null, h('span', { class: 'num', text: ago(p.created_at) })),
    acts.length ? null : h('div', { class: 'small muted', text: t('p_pending_note') }),
  ], [p.partner ? pill(t('p_partner'), 'work') : null, pill(t(`pst_${st}`), stCls)], acts.length ? rowActs(acts) : null);
}
function usersBody() {
  const U = app.users;
  const go = () => { U.q = collapse(U.qDraft).slice(0, 80); U.offset = 0; app.ask = null; loadUsers(); };
  const rows = U.rows;
  const kindSel = h('div', { class: 'field inline' }, h('label', { for: 'uKind', class: 'sr-only', text: t('f_kind') }),
    selectEl('uKind', USER_KINDS.map((k) => ({ value: k, label: t(`ukind_${k}`) })), U.kind, (v) => { U.kind = v; U.offset = 0; app.ask = null; loadUsers(); }));
  const pager = rows && U.total > USERS_PAGE ? h('div', { class: 'pager' },
    h('button', { type: 'button', id: 'uPrev', class: 'btn sm', disabled: U.offset <= 0 || U.loading || null, onclick: () => { U.offset = Math.max(0, U.offset - USERS_PAGE); loadUsers(); } }, icon('arrowEnd', 'xs flip-back'), t('u_prev')),
    h('span', { class: 'small muted num', text: t('u_range', { r: `${fmt(U.offset + 1)}–${fmt(U.offset + rows.length)}`, n: fmt(U.total) }) }),
    h('button', { type: 'button', id: 'uNext', class: 'btn sm', disabled: U.offset + rows.length >= U.total || U.loading || null, onclick: () => { U.offset += USERS_PAGE; loadUsers(); } }, t('u_next'), icon('arrowEnd', 'xs flip'))) : null;
  return [
    searchBar('uSearch', U.qDraft, t('u_search_ph'), (v) => { U.qDraft = v; }, go, kindSel),
    h('div', { class: 'small muted', text: t('u_no_email') }),
    U.err ? errBox(U.err, rows ? t('dash_stale') : null) : null,
    !rows ? (U.err ? null : waitBox()) : !rows.length ? h('div', { class: 'empty', text: t('u_empty') })
      : [rows.length && U.total <= USERS_PAGE ? h('div', { class: 'small muted', text: t('p_count', { n: fmt(U.total) }) }) : null, h('div', { class: 'crows' }, rows.map(userRow)), pager],
  ];
}
function userRow(u) {
  const key = `user:${u.id}`;
  const acct = ['trainee', 'club', 'coach', 'store', 'restaurant', 'center', 'venue'].includes(u.account_type) ? u.account_type : 'trainee';
  const v = u.is_coach === true;
  const gym = pickEn(u.gym_name, u.gym_name_en);
  return crow(key, '', [
    h('div', { class: 'item-name', dir: 'auto', text: str(u.full_name) || t('u_no_name') }),
    h('div', { class: 'item-meta' }, h('span', { dir: 'ltr', text: `@${str(u.username)}` }), h('span', { text: t(`acct_${acct}`) }),
      h('span', { class: 'num', text: t('u_joined', { t: ago(u.created_at) }) }), h('span', { class: 'num', text: t('u_points', { n: fmt(num(u.points)) }) }),
      gym ? h('span', { dir: 'auto', text: gym }) : null,
      PARTNER_KINDS.includes(u.partner_intent) ? h('span', { text: t('u_intent', { k: t(`kind_${u.partner_intent}`) }) }) : null),
  ], [v ? pill(t('u_verified'), 'ok') : null, u.is_admin ? pill(t('u_admin'), 'info') : null],
  rowActs(editBtn(`${key}:edit`, () => openAppSheet('user', u)),
    h('button', { type: 'button', id: `${key}:verify`, class: 'btn sm', 'aria-pressed': String(v), disabled: !canAct() || (app.ask && app.ask.busy) || null,
      onclick: () => ask(key, { msg: t(v ? 'cf_u_unverify' : 'cf_u_verify'), yes: t(v ? 'u_unverify' : 'u_verify'), danger: v, ctx: 'user', run: () => verifyUser(u, !v) }) },
    t(v ? 'u_unverify' : 'u_verify'))));
}

// ---------- ورقة التعديل ----------
function sheetInput(sh, f) {
  const id = `as-${f.key}`;
  const v = sh.draft[f.key];
  const err = sh.errs[f.key];
  const busy = sh.busy || !!sh.confirm;
  const set = (val, rerender) => { sh.draft[f.key] = val; if (sh.errs[f.key]) delete sh.errs[f.key]; sh.err = null; if (rerender) renderAppSheet(); };
  const common = { id, disabled: busy || null, 'aria-invalid': err ? 'true' : null, 'aria-describedby': err ? `${id}-err` : null };
  let input;
  if (f.type === 'check') {
    return h('div', { class: 'field wide' }, h('label', { class: 'check-row', for: id }, h('input', Object.assign({ type: 'checkbox', checked: v || null, onchange: (e) => set(e.target.checked) }, common)), h('span', { text: t(f.label) })));
  }
  if (f.type === 'chips') {
    input = h('div', { class: 'chips', role: 'radiogroup', 'aria-labelledby': `${id}-l` }, f.options.map((o) =>
      h('button', { type: 'button', role: 'radio', class: 'chip', id: `${id}-${o.value}`, 'aria-checked': String(v === o.value), disabled: busy || null, onclick: () => set(o.value, true) }, o.label)));
    return h('div', { class: `field${f.wide ? ' wide' : ''}` }, h('span', { class: 'flabel', id: `${id}-l`, text: t(f.label) }), input, fieldErr(id, err));
  }
  if (f.type === 'select') input = selectEl(id, f.options, v, (val) => set(val, false), common);
  else if (f.type === 'textarea') input = h('textarea', Object.assign({ class: 'input', rows: 3, maxlength: f.max, dir: f.dir || 'auto', value: str(v), oninput: (e) => set(e.target.value) }, common));
  else if (f.type === 'date') input = h('input', Object.assign({ class: 'input num', type: 'date', dir: 'ltr', value: str(v), oninput: (e) => set(e.target.value), onchange: (e) => set(e.target.value) }, common));
  else if (f.type === 'num') input = h('input', Object.assign({ class: 'input num', inputmode: 'numeric', maxlength: 4, dir: 'ltr', value: str(v), oninput: (e) => set(e.target.value) }, common));
  else input = h('input', Object.assign({ class: 'input', type: 'text', maxlength: f.max, dir: f.dir || 'auto', value: str(v), oninput: (e) => set(e.target.value) }, common));
  const hint = f.hintText || (f.hint ? t(f.hint) : null);
  return h('div', { class: `field${f.wide ? ' wide' : ''}` }, h('label', { for: id, text: t(f.label) }), input, hint ? h('span', { class: 'hint', text: hint }) : null, fieldErr(id, err));
}
function renderAppSheet() {
  const sh = app.sheet;
  const dlg = $('appSheet');
  if (!sh || !dlg) return;
  const keep = focusState();
  const titleKey = { ad: 'ad_edit_t', event: sh.id ? 'ev_edit_t' : 'ev_new_t', nudge: sh.id ? 'nd_edit_t' : 'nd_new_t', user: 'u_edit_t' }[sh.kind];
  const sub = sh.row ? str(sh.kind === 'user' ? `@${sh.row.username}` : sh.row.title) : t('cf_new');
  const head = h('div', { class: 'sh-head' }, h('span', { class: 'sec-ic' }, icon(sh.kind === 'user' ? 'user' : sh.kind === 'nudge' ? 'megaphone' : sh.kind === 'event' ? 'calendar' : 'pen')),
    h('div', { class: 'item-main' }, h('h2', { id: 'appSheetTitle', text: t(titleKey) }), h('div', { class: 'meta', dir: 'auto', text: sub })),
    h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': t('close'), disabled: sh.busy || null, onclick: closeAppSheet }, icon('x')));
  const body = h('div', { class: 'sh-body' });
  if (sh.kind === 'nudge' && !sh.id) body.append(h('div', { class: 'note-box', text: t('nd_new_paused') }));
  body.append(h('div', { class: 'fgrid' }, sheetSpec(sh.kind, sh).map((f) => sheetInput(sh, f))));
  if (sh.confirm) body.append(diffBox(sh.confirm, null));
  if (sh.err) body.append(h('div', { class: 'err-box', role: 'alert', text: sh.err }));
  const foot = h('div', { class: 'sh-foot' });
  if (sh.confirm) {
    foot.append(h('div', { class: 'row' },
      h('button', { type: 'button', id: 'asConfirm', class: `btn primary${sh.busy ? ' busy' : ''}`, disabled: sh.busy || null, onclick: sheetConfirm }, sh.busy ? h('span', { class: 'spin' }) : icon('check', 'sm'), t('cf_confirm')),
      h('button', { type: 'button', id: 'asBack', class: 'btn ghost', disabled: sh.busy || null, onclick: () => { sh.confirm = null; renderAppSheet(); } }, t('cf_back'))));
  } else {
    foot.append(h('div', { class: 'row' },
      h('button', { type: 'button', id: 'asSave', class: 'btn primary', disabled: !canAct() || null, onclick: sheetSave }, icon('check', 'sm'), t('save')),
      h('button', { type: 'button', class: 'btn ghost', onclick: closeAppSheet }, t('cancel'))));
  }
  dlg.replaceChildren(head, body, foot);
  restoreFocus(keep);
  if (sh.confirm && !sh.busy) { const c = body.querySelector('.diff'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); }
}

// ===================== التبويب العلوي والتحديث =====================
let appTimer = 0;
function applyTop() {
  const isApp = state.top === 'app';
  $('officeView').hidden = isApp;
  $('appView').hidden = !isApp;
  for (const [id, v] of [['topOffice', 'office'], ['topApp', 'app']]) {
    const b = $(id);
    b.setAttribute('aria-selected', String(state.top === v));
    b.tabIndex = state.top === v ? 0 : -1;
  }
}
function showTop(v) {
  if (v !== 'office' && v !== 'app') return;
  const changed = state.top !== v;
  state.top = v;
  store('top', v);
  applyTop();
  renderTop();
  if (v === 'app') { renderApp(); if (changed) appEnter(); }
  else {
    renderAll();
    layoutStage();
    kick();
    if (changed && autoRefreshOk() && Date.now() - lastTry > REFRESH_MS) refresh();
  }
}
/** فتح التبويب: الطلبات (لو قديمة) + بيانات التبويب الفرعي + فحص حالات الطلبات المفتوحة */
async function appEnter() {
  appSyncMode();
  renderApp();
  if (app.isSample || !appCanLoad()) return;
  ccrProbe(false);
  ensureSub(false);
  if (Date.now() - app.reqAt > 15_000 && !app.reqLoading) await loadRequests();
  if (Date.now() - app.checkedAt > 15_000) checkStatuses({});
}
/** زر «تحديث» وهو على تبويب التطبيق */
async function appRefresh() {
  if (!mcp) {
    if (state.mode === 'sample') { app.db = null; app.isSample = true; sampleDbInit(); toast(t('sample_action')); renderApp(); }
    return;
  }
  if (state.mode !== 'live') { await refresh(true); return; } // الاتصال مقطوع: نحاول من جديد
  ccrProbe(true);
  ensureSub(true);
  await loadRequests();
  checkStatuses({ manual: true });
}
const appBusy = () => app.reqLoading || app.contentLoading || app.partners.loading || app.users.loading || app.checking;
function appTick() {
  if (document.hidden || state.top !== 'app' || app.sheet) return;
  if (state.mode === 'live') loadRequests().then(() => checkStatuses({}));
  else if (autoRefreshOk()) refresh();
}
function startAppTimer() { clearInterval(appTimer); appTimer = setInterval(appTick, REFRESH_MS); }
function bindApp() {
  $('topOffice').addEventListener('click', () => showTop('office'));
  $('topApp').addEventListener('click', () => showTop('app'));
  for (const id of ['topOffice', 'topApp']) $(id).addEventListener('keydown', (e) => tabKeys(e, ['office', 'app'], state.top, showTop, (v) => (v === 'app' ? 'topApp' : 'topOffice')));
  const dlg = $('appSheet');
  const busy = () => !!(app.sheet && app.sheet.busy);
  dlg.addEventListener('cancel', (e) => { if (busy()) e.preventDefault(); });
  dlg.addEventListener('close', () => { app.sheet = null; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && !busy()) closeAppSheet(); });
}
