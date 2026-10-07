// ===================== التحميل والتحديث =====================
async function loadOverview() {
  try {
    const rows = await sql(Q.overview(state.days), { read: true });
    const o = cell(rows, 'o');
    if (!isObj(o) || !isObj(o.meta)) { const e = new Error('unreadable_result'); e.code = 'unreadable_result'; throw e; }
    state.data = o;
    state.errs.overview = null;
    return true;
  } catch (e) {
    if (connKind(e)) throw e;
    state.errs.overview = errInfo(e);
    return false;
  }
}
async function loadTasks() {
  try {
    const rows = await sql(Q.tasks(), { read: true });
    const list = cell(rows, 't');
    if (!Array.isArray(list)) { const e = new Error('unreadable_result'); e.code = 'unreadable_result'; throw e; }
    state.tasks = list.filter((x) => isObj(x) && UUID_RE.test(str(x.id)));
    state.errs.tasks = null;
    state.needAdmin = false;
    return true;
  } catch (e) {
    if (connKind(e)) throw e;
    state.errs.tasks = errInfo(e);
    if (state.errs.tasks.code === 'choose_admin') state.needAdmin = true;
    return false;
  }
}

/** مشكلة اتصال على مستوى الصفحة. القاعدة: ما نبدّل بيانات حية ببيانات تجريبية أبد.
 * - الحساب تغيّر: نمسح بيانات الحساب الأول ونوقف كل شي (sql يرفض بعدها بدون ما يتصل)
 * - انقطاع مؤقت (unavailable) وعندنا بيانات حية: نبقى «مباشر/متأخر» ونحاول مع التحديث الجاي
 * - غير كذا: وضع «غير متصل» والإجراءات موقفة؛ اللي على الشاشة يبقى (حي = آخر بيانات وصلت، تجريبي = بشريط واضح إنه تجريبي) */
function connFail(e, kind) {
  state.conn = { kind, raw: str(e && e.message).slice(0, 200) };
  if (kind === 'user_changed') {
    stopTimers();
    const info = { code: kind, msg: t('c_user_changed'), raw: '' };
    Object.assign(state, { mode: 'error', data: null, tasks: null, isSample: false, updatedAt: null, errs: { overview: info, tasks: info }, drafts: {}, itemErr: {} });
    state.fresh.clear();
    appWipe(true); // تبويب التطبيق: نفس الشي (طلبات ومحتوى الحساب الأول ما تبقى)
  } else if (kind !== 'unavailable' || state.isSample) state.mode = 'error';
  // متابعة الوكيل ما تكمل بدون اتصال: نوقفها ونقول ليش
  const run = state.run;
  if (state.mode === 'error' && run && (run.phase === 'queued' || run.phase === 'waiting')) { run.phase = 'error'; run.err = connTitle(kind); clearTimeout(pollTimer); }
}

/** يقرا الاثنين (كل واحد لحاله: لو واحد فشل الثاني يبقى). user = ضغطة من المستخدم */
let refreshAgain = false;
let lastTry = 0;
async function refresh(user) {
  if (state.busyRefresh) { refreshAgain = true; return; }
  if (!mcp) {
    if (state.mode === 'sample' && user) { state.data = sampleData(); recountOffice(); renderAll(); }
    return;
  }
  state.busyRefresh = true;
  lastTry = Date.now();
  renderTop();
  try {
    const [a, b] = await Promise.allSettled([loadOverview(), loadTasks()]);
    const conn = [a, b].find((r) => r.status === 'rejected');
    if (conn) connFail(conn.reason, connKind(conn.reason) || 'unavailable');
    else {
      state.conn = null;
      // أول رد حي بعد التجريبية: اللي فشل منهم (خطأ من القاعدة) ما نخلي مكانه بيانات تجريبية
      if (state.isSample) { if (!a.value) state.data = null; if (!b.value) state.tasks = null; state.fresh.clear(); state.isSample = false; }
      state.mode = 'live';
      // «آخر تحديث» يوصف أرقام اللوحات والمكتب: يتقدّم بس لو office_overview نفسها نجحت
      if (a.value) state.updatedAt = Date.now();
    }
  } finally {
    state.busyRefresh = false;
    renderAll();
  }
  if (refreshAgain) { refreshAgain = false; await refresh(); return; }
  // تبويب التطبيق مفتوح: أول اتصال حي (أو رجوعه) يحمّل بياناته
  if (state.top === 'app' && state.mode === 'live') appEnter();
}

// ===================== الإجراءات =====================
/** إجراء كتابة واحد: ما ينعاد تلقائياً أبد (ممكن يكون انطبق) */
async function write(query) {
  try {
    const rows = await sql(query);
    return cell(rows, 'r');
  } catch (e) {
    const ck = connKind(e);
    if (ck && ck !== 'unavailable') { connFail(e, ck); renderAll(); }
    const info = errInfo(e);
    // مشكلة اتصال (ربط منتهي، رفض…): نقول وش هي بدل «صار خطأ»
    if (ck && ck !== 'unavailable') info.msg = connTitle(ck);
    if (info.code === 'read_only') { state.readOnly = true; renderBanner(); }
    if (info.code === 'choose_admin') { state.needAdmin = true; }
    // ما وصل رد (انقطع أو طوّل): الإجراء يمكن انطبق، فنطلب تحديث قبل الإعادة
    if (e && (e.code === 'server_unavailable' || e.code === 'upstream_error' || e.code === 'cancelled')) { info.msg = t('err_outcome_unknown'); info.unknown = true; }
    const err = new Error(info.msg);
    err.info = info;
    throw err;
  }
}

async function reviewItem(it, decision) {
  const key = `p:${it.id}`;
  const dr = state.drafts[key] || {};
  const note = str(dr.note).trim();
  if (decision === 'reject' && note.length < 3) {
    state.itemErr[key] = t('err_note_required');
    renderDeskPanel();
    const el = document.getElementById(`${key}:note`);
    if (el) el.focus();
    return;
  }
  state.itemBusy[key] = true; delete state.itemErr[key];
  renderDeskPanel();
  const at = it.agent_task && it.agent_task.status === 'waiting_approval' ? it.agent_task.id : null;
  try {
    if (state.mode === 'sample') {
      simulate('review', { kind: it.kind, id: it.id });
      if (at) simulate('reject', { id: at, note: t('closedNote') });
      toast(t('sample_action'));
    } else {
      await write(Q.review(it.kind, it.id, decision, decision === 'reject' ? note.slice(0, NOTE_MAX) : null));
      // اقتراح الوكيل على نفس العنصر صار قديم: نقفله (لو فشل ما يضر، يبان بالمهام)
      if (at) { try { await write(Q.reject(at, t('closedNote'))); } catch (e) { /* يبقى ينتظر وتقدر تقفله من الورقة */ } }
      toast(t('done_ok'));
    }
    delete state.drafts[key];
  } catch (e) {
    state.itemErr[key] = e.message;
  } finally {
    delete state.itemBusy[key];
    if (state.mode === 'live') await refresh(); else renderAll();
  }
}

async function reportAction(r) {
  const key = `r:${r.id}`;
  const dr = state.drafts[key] || {};
  if (!REPORT_FINAL.includes(dr.status)) return;
  const reply = str(dr.note).trim();
  if (reply.length > REPLY_MAX) { state.itemErr[key] = t('err_final_reply'); renderDeskPanel(); return; }
  state.itemBusy[key] = true; delete state.itemErr[key];
  renderDeskPanel();
  const at = r.agent_task && r.agent_task.status === 'waiting_approval' ? r.agent_task.id : null;
  try {
    if (state.mode === 'sample') {
      simulate('report', { id: r.id, status: dr.status });
      if (at) simulate('reject', { id: at, note: t('closedNote') });
      toast(t('sample_action'));
    } else {
      await write(Q.report(r.id, dr.status, reply || null));
      if (at) { try { await write(Q.reject(at, t('closedNote'))); } catch (e) { /* تنقفل من الورقة */ } }
      toast(t('done_ok'));
    }
    delete state.drafts[key];
  } catch (e) {
    state.itemErr[key] = e.message;
  } finally {
    delete state.itemBusy[key];
    if (state.mode === 'live') await refresh(); else renderAll();
  }
}

/** نتيجة اعتماد/رفض من الورقة تخص الورقة اللي بدأته (sh) بس: لو انقفلت أو انفتحت ورقة مهمة ثانية بالنص،
 * الخطأ يطلع رسالة باسم المهمة الأولى (ما ينحط على ورقة ثانية ولا زر «اقفل المهمة» فيها يقفل مهمة غلط) */
function sheetFailed(sh, task, e) {
  sh.busy = null; sh.err = e.message; sh.errCode = e.info ? e.info.code : null;
  if (state.sheet === sh) renderSheet();
  else { toast(`${taskName(task)} — ${e.message}`); if (state.mode === 'live') refresh(); }
}
async function sheetApprove() {
  const sh = state.sheet;
  const task = sh && arr(state.tasks).find((x) => x.id === sh.id);
  if (!task || sh.busy) return;
  const ready = prepareFinal(task.kind, sh.draft);
  if (ready.error) { sh.err = t(`err_${ready.error}`); sh.errCode = ready.error; renderSheet(); return; }
  sh.busy = 'approve'; sh.err = null; renderSheet();
  try {
    if (state.mode === 'sample') { simulate('apply', { id: task.id, final: ready.final }); toast(t('sample_action')); }
    else { await write(Q.apply(task.id, ready.final)); toast(t('done_ok')); }
    if (state.sheet === sh) closeSheet();
    if (state.mode === 'live') await refresh(); else renderAll();
  } catch (e) { sheetFailed(sh, task, e); }
}
async function sheetReject(note) {
  const sh = state.sheet;
  const task = sh && arr(state.tasks).find((x) => x.id === sh.id);
  if (!task || sh.busy) return;
  sh.busy = 'reject'; sh.err = null; renderSheet();
  const clean = str(note).trim().slice(0, NOTE_MAX);
  try {
    if (state.mode === 'sample') { simulate('reject', { id: task.id, note: clean }); toast(t('sample_action')); }
    else { await write(Q.reject(task.id, clean || null)); toast(t('done_ok')); }
    if (state.sheet === sh) closeSheet();
    if (state.mode === 'live') await refresh(); else renderAll();
  } catch (e) { sheetFailed(sh, task, e); }
}

/** يشغّل وكيل المكتب (office_admin.run_agent) ويتابع المهام كل ٤ ثواني لمدة دقيقتين */
let pollTimer = 0;
async function runAgent(desk) {
  if (!AGENT_DESKS.includes(desk)) return;
  if (state.run && (state.run.phase === 'queued' || state.run.phase === 'waiting')) return;
  const brief = desk === 'marketing' ? str((state.drafts['brief:marketing'] || {}).note).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BRIEF_MAX) : '';
  state.run = { desk, started: Date.now(), known: new Set(arr(state.tasks).map((x) => x.id)), newIds: [], phase: 'queued', err: null };
  renderAll();
  if (state.mode === 'sample') {
    setTimeout(() => { if (state.run && state.run.desk === desk) { state.run.phase = 'sample'; renderAll(); } }, 2500);
    return;
  }
  try {
    await write(Q.runAgent(desk, brief || null));
    state.run.phase = 'waiting';
    if (desk === 'marketing') delete state.drafts['brief:marketing'];
  } catch (e) {
    state.run.phase = 'error';
    state.run.err = e.message;
    renderAll();
    return;
  }
  renderAll();
  const tickPoll = async () => {
    const run = state.run;
    if (!run || run.desk !== desk || run.phase !== 'waiting') return;
    // الاتصال راح (غير متصل): ما نكمل نسأل كل ٤ ثواني
    if (state.mode !== 'live') { run.phase = 'error'; run.err = state.conn ? connTitle(state.conn.kind) : t('err_generic'); renderAll(); return; }
    if (!document.hidden) {
      let got = false;
      try { got = await loadTasks(); } catch (e) {
        const k = connKind(e);
        // انقطاع مؤقت: نكمل بالدورة الجاية. غير كذا (ربط منتهي، رفض، حساب ثاني…): نوقف ونعرض السبب
        if (k && k !== 'unavailable') { connFail(e, k); renderAll(); return; }
      }
      // خطأ معروف من القاعدة (مثلاً choose_admin أو الصلاحيات) ما يتصلّح بالإعادة: نوقف ونعرضه
      const te = state.errs.tasks;
      if (!got && te && te.code && te.code !== 'unknown_result') { run.phase = 'error'; run.err = te.msg; renderAll(); return; }
      if (state.run !== run || run.phase !== 'waiting') return;
      const news = arr(state.tasks).filter((x) => !run.known.has(x.id));
      run.newIds = news.map((x) => x.id);
      news.forEach((x) => state.fresh.add(x.id));
      const settled = news.length && news.every((x) => phase(x) !== 'working');
      if (settled) { run.phase = 'done'; refresh(); return; }
    }
    if (Date.now() - run.started > POLL_FOR_MS) { run.phase = run.newIds.length ? 'done' : 'none'; refresh(); return; }
    renderAll();
    pollTimer = setTimeout(tickPoll, POLL_MS);
  };
  clearTimeout(pollTimer);
  pollTimer = setTimeout(tickPoll, POLL_MS);
}

// ===================== اختيار المكتب واللغة والثيم =====================
function selectDesk(id) {
  if (!DESK[id]) return;
  state.desk = id;
  store('desk', id);
  renderAll();
  if (window.matchMedia('(max-width: 760px)').matches) $('deskPanel').scrollIntoView({ behavior: smooth(), block: 'start' });
}
function applyLang() {
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
}
function applyTheme() {
  const root = document.documentElement;
  if (state.theme) root.setAttribute('data-theme', state.theme); else root.removeAttribute('data-theme');
}

// ===================== الرسم =====================
let office3d = null;
let raf = 0;
let stageVisible = true;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
function renderAll() {
  renderTop();
  renderBanner();
  renderStageMeta();
  renderDeskPanel();
  renderTasks();
  renderDash();
  if (state.sheet) renderSheet();
  renderApp();
  if (office3d) { try { office3d.update(deskStates(), state.desk); kick(); } catch (e) { fail3d(e); } }
}
function loop(now) {
  raf = 0;
  if (!office3d || document.hidden || !stageVisible || state.view !== '3d') return;
  try { office3d.frame(reducedMotion() ? 0 : now / 1000); } catch (e) { fail3d(e); return; }
  if (!reducedMotion()) raf = requestAnimationFrame(loop);
}
function kick() { if (!raf) raf = requestAnimationFrame(loop); }
function fail3d(e) {
  if (office3d) { try { office3d.dispose(); } catch (x) { /* خلاص */ } }
  office3d = null;
  state.can3d = false;
  if (e && window.console) console.warn('office 3D off:', e && e.message);
  renderStageMeta();
}
function layoutStage() {
  const stage = $('stage');
  const r = stage.getBoundingClientRect();
  if (!office3d || r.width < 10 || r.height < 10) return;
  office3d.resize(Math.round(r.width), Math.round(r.height));
  stage.classList.toggle('compact', office3d.ppu() < 30);
  renderSigns(deskStates());
  kick();
}
function init3d() {
  if (office3d || !state.can3d) return;
  try {
    const cv = $('cv');
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail3d(new Error('context_lost')); });
    office3d = createOffice3D(cv);
    office3d.update(deskStates(), state.desk);
  } catch (e) { fail3d(e); return; }
  if ('ResizeObserver' in window) new ResizeObserver(() => layoutStage()).observe($('stage'));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { stageVisible = en.some((x) => x.isIntersecting); if (stageVisible) kick(); }).observe($('stage'));
  }
  layoutStage();
}

// ===================== المؤقتات =====================
let refreshTimer = 0, clockTimer = 0;
function startTimers() {
  clearInterval(refreshTimer); clearInterval(clockTimer);
  // المكتب يتحدّث وهو ظاهر بس (تبويب التطبيق له مؤقته: appTick)
  refreshTimer = setInterval(() => { if (!document.hidden && state.top === 'office' && autoRefreshOk() && !state.sheet) refresh(); }, REFRESH_MS);
  startAppTimer();
  // الأوقات النسبية («قبل دقيقة») تتحدّث كل ٣٠ ثانية بدون استعلام
  clockTimer = setInterval(() => { if (!document.hidden) { renderTop(); renderTasks(); renderStageMeta(); } }, 30_000);
}
function stopTimers() { clearInterval(refreshTimer); clearInterval(clockTimer); clearTimeout(pollTimer); clearInterval(appTimer); }
/** التحديث التلقائي: مع الاتصال الحي، أو لو Supabase ما ردّ (حتى لو ما وصلت بيانات للحين) — مرة وحدة كل دقيقة بالكثير.
 * باقي المشاكل (ربط منتهي، رفض…) تحتاج منك تصلّحها وتضغط «حاول مرة ثانية» */
const autoRefreshOk = () => !!mcp && (state.mode === 'live' || (state.mode === 'error' && !!state.conn && state.conn.kind === 'unavailable'));

// ===================== البداية =====================
function bind() {
  $('days7').addEventListener('click', () => setDays(7));
  $('days30').addEventListener('click', () => setDays(30));
  $('refreshBtn').addEventListener('click', () => (state.top === 'app' ? appRefresh() : refresh(true)));
  $('langBtn').addEventListener('click', () => { state.lang = state.lang === 'ar' ? 'en' : 'ar'; store('lang', state.lang); applyLang(); renderAll(); layoutStage(); });
  $('themeBtn').addEventListener('click', () => { state.theme = currentTheme() === 'dark' ? 'light' : 'dark'; store('theme', state.theme); applyTheme(); renderTop(); });
  for (const b of [$('view3d'), $('viewGrid')]) {
    b.addEventListener('click', () => {
      state.view = b.dataset.view === 'grid' ? 'grid' : '3d';
      store('view', state.view);
      renderStageMeta();
      if (state.view === '3d') layoutStage();
    });
  }
  const dlg = $('sheet');
  // وقت الاعتماد/الرفض الورقة ما تنقفل (Esc أو برّا الورقة) لين يوصل الرد
  const sheetBusy = () => !!(state.sheet && state.sheet.busy);
  dlg.addEventListener('cancel', (e) => { if (sheetBusy()) e.preventDefault(); });
  dlg.addEventListener('close', () => { state.sheet = null; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && !sheetBusy()) closeSheet(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    kick();
    if (state.top === 'app') { if (state.mode === 'live' && Date.now() - app.reqAt > REFRESH_MS) appTick(); else if (state.mode !== 'live' && autoRefreshOk() && Date.now() - lastTry > REFRESH_MS) refresh(); return; }
    if (autoRefreshOk() && Date.now() - lastTry > REFRESH_MS) refresh();
  });
  bindApp();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderTop()); } catch (e) { /* متصفح قديم */ }
}
function setDays(d) {
  if (state.days === d) return;
  state.days = d;
  store('days', String(d));
  // بيانات حية على الشاشة (ولو الاتصال مقطوع): نطلب الفترة الجديدة؛ التجريبية نبدّلها محلياً
  if (!state.isSample) refresh(true);
  else { state.data = sampleData(); recountOffice(); renderAll(); }
}

function start() {
  applyLang();
  applyTheme();
  // أول رسمة: بيانات تجريبية مع شريط «نتصل… تشوف بيانات تجريبية» (ما تطلع صفحة فاضية أبد)
  state.data = sampleData();
  state.tasks = SAMPLE ? clone(SAMPLE.tasks) : [];
  state.isSample = true;
  recountOffice();
  const hasClaude = typeof window.claude === 'object' && window.claude && typeof window.claude.use === 'function';
  state.mode = hasClaude ? 'connecting' : 'sample';
  bind();
  applyTop();
  renderAll();
  // three.js يتحمّل async: لو وصل قبلنا نبدأ على طول، وإلا ننتظر حدث التحميل (ولو فشل نعرض البطاقات)
  const tag = document.getElementById('three-js');
  if (typeof THREE !== 'undefined') init3d();
  else if (tag) {
    tag.addEventListener('load', () => { init3d(); renderStageMeta(); });
    tag.addEventListener('error', () => fail3d(new Error('three_blocked')));
    setTimeout(() => { if (!office3d && typeof THREE === 'undefined') fail3d(new Error('three_timeout')); }, 12_000);
  } else fail3d(new Error('three_missing'));
  startTimers();
  if (!hasClaude) return;
  Promise.resolve().then(() => window.claude.use('mcp')).then(async (ns) => {
    if (!ns) { state.mode = 'sample'; renderAll(); return; }
    mcp = ns;
    await refresh();
  }).catch(() => { state.mode = 'sample'; renderAll(); });
}
start();
