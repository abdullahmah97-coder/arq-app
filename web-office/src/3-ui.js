// ===================== قطع الواجهة =====================
/** يبدّل محتوى العنصر ويتجاهل null/false (replaceChildren تكتبها نص "null") */
function put(el, ...kids) { el.replaceChildren(...kids.flat(3).filter((k) => k !== null && k !== undefined && k !== false)); }
function deskBadge(id, cls = '') {
  const d = DESK[id] || DESK.lead;
  return h('span', { class: `desk-badge ${cls}`, style: { background: d.shirt } }, icon(d.icon));
}
function pill(text, cls = '', withDot) {
  return h('span', { class: `pill ${cls}` }, withDot ? h('span', { class: 'd' }) : null, text);
}
const PHASE_PILL = { waiting: 'wait', working: 'work', done: 'ok', failed: 'fail' };
function statusPill(task) {
  const p = phase(task);
  if (p === 'done') {
    if (task.decision === 'approved') return pill(t('st_approved'), 'ok');
    if (task.decision === 'rejected') return pill(t('st_rejected'), 'plain');
    return pill(t('st_done'), 'ok');
  }
  if (p === 'failed') return pill(t('st_failed'), 'fail');
  if (p === 'working') return pill(t(task.status === 'scheduled' ? 'st_scheduled' : 'st_in_progress'), task.status === 'scheduled' ? 'info' : 'work', true);
  return pill(t('st_waiting'), 'wait', true);
}

function deltaEl(cur, prev, dir) {
  if (typeof prev !== 'number' || !Number.isFinite(prev)) return null;
  const d = cur - prev;
  const wrap = h('span', { class: 'dl' });
  if (d === 0) wrap.append(h('span', { class: 'delta flat', text: t('no_change') }));
  else {
    const good = dir === 0 ? null : (d > 0) === (dir > 0);
    const raw = prev > 0 ? (Math.abs(d) / prev) * 100 : null;
    const pct = raw === null ? '' : raw < 1 ? ' · <1%' : ` · ${fmt(Math.round(raw))}%`;
    wrap.append(h('span', { class: `delta ${good === null ? 'flat' : good ? 'good' : 'bad'}` },
      icon(d > 0 ? 'up' : 'down', 'xs'), `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${pct}`));
  }
  wrap.append(h('span', { class: 'prev num', text: t('vs_prev', { n: fmt(prev) }) }));
  return wrap;
}

/** بطاقة رقم: k = العنوان، v = القيمة، prev = الفترة السابقة (يطلع الفرق)، dir: 1 الزيادة زينة، -1 الزيادة شينة، 0 محايد */
function tile(o) {
  let v = o.v;
  if (typeof v === 'number') v = o.money ? sar(v) : o.pct ? t('pct_v', { n: fmt(v) }) : fmt(v);
  return h('div', { class: `${o.mini ? 'mini' : 'tile'}${o.warn ? ' warn' : ''}` },
    h('span', { class: 'k', text: o.k }),
    h('span', { class: `v${o.txt ? ' txt' : ''}`, text: v === undefined || v === null || v === '' ? '—' : str(v) }),
    o.prev !== undefined ? deltaEl(num(typeof o.cur === 'number' ? o.cur : o.v), o.prev, o.dir === undefined ? 1 : o.dir) : null,
    o.s ? h('span', { class: 's', text: o.s }) : null,
    o.series ? spark(o.series) : null);
}

// تلميح مشترك للرسوم
function showTip(x, y, text) {
  const tip = $('tip');
  tip.textContent = text;
  tip.hidden = false;
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}
function hideTip() { $('tip').hidden = true; }

/** خط صغير لسلسلة يومية: آخر نقطة (اليوم) عليها نقطة، والمرور يعرض اليوم والقيمة */
function spark(series) {
  const pts = arr(series).map((p) => ({ day: p.day, n: num(p.n) }));
  if (pts.length < 2) return null;
  const W = 200, H = 34, P = 4;
  const max = Math.max(1, ...pts.map((p) => p.n));
  const xs = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const ys = (v) => H - P - (v / max) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.n).toFixed(1)}`).join('');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const area = document.createElementNS(NS, 'path');
  area.setAttribute('d', `${line}L${xs(pts.length - 1).toFixed(1)},${H}L${xs(0).toFixed(1)},${H}Z`);
  area.setAttribute('style', 'fill: var(--series-wash); stroke: none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', line);
  path.setAttribute('style', 'fill: none; stroke: var(--series); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(area, path);
  const last = pts.length - 1;
  const total = pts.reduce((a, p) => a + p.n, 0);
  const wrap = h('div', { class: 'spark', role: 'img', 'aria-label': `${fmtDate(pts[0].day)} – ${fmtDate(pts[last].day)}: ${fmt(total)} · ${t('k_today')} ${fmt(pts[last].n)}` }, svg,
    h('span', { class: 'end', style: { left: `${(xs(last) / W) * 100}%`, top: `${ys(pts[last].n)}px` } }));
  const hl = h('span', { class: 'hl', hidden: true });
  const hd = h('span', { class: 'hd', hidden: true });
  wrap.append(hl, hd);
  wrap.addEventListener('pointermove', (ev) => {
    const r = wrap.getBoundingClientRect();
    const fx = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(last, Math.round(((fx - P) / (W - 2 * P)) * last)));
    const left = (xs(i) / W) * 100;
    hl.hidden = false; hd.hidden = false;
    hl.style.left = `${left}%`;
    hd.style.left = `${left}%`;
    hd.style.top = `${ys(pts[i].n)}px`;
    showTip(r.left + (xs(i) / W) * r.width, r.top + ys(pts[i].n), `${fmtDate(pts[i].day)} · ${fmt(pts[i].n)}`);
  });
  wrap.addEventListener('pointerleave', () => { hl.hidden = true; hd.hidden = true; hideTip(); });
  return wrap;
}

/** أشرطة أفقية لسلسلة وحدة: الاسم، الشريط، والرقم عند طرفه */
function bars(rows, opts = {}) {
  const list = arr(rows).filter(Boolean);
  if (!list.length) return h('div', { class: 'empty', text: opts.empty || t('v_none') });
  const max = Math.max(1, opts.max || 0, ...list.map((r) => num(r.n)));
  return h('div', { class: 'bars' }, list.map((r) => h('div', { class: 'bar-row', title: r.title || null },
    h('span', { class: 'bl', text: r.label }),
    h('span', { class: 'bt' }, h('span', { class: 'bf', style: { width: `${Math.max(0, (num(r.n) / max) * 100)}%` } })),
    h('span', { class: 'bv' }, opts.money ? sar(num(r.n)) : fmt(num(r.n)), r.sub ? h('small', { text: ` ${r.sub}` }) : null))));
}
function block(title, kids, opts = {}) {
  return h('div', { class: 'block' },
    h('div', { class: 'block-head' }, h('h4', { class: 'block-title' }, opts.icon ? icon(opts.icon, 'sm') : null, title), opts.right || null),
    kids);
}
function li(title, sub, right, onClick) {
  const tag = onClick ? 'button' : 'div';
  return h(tag, { class: 'li', type: onClick ? 'button' : null, onclick: onClick || null },
    h('div', { class: 'lm' }, h('div', { class: 'lt', dir: 'auto', text: title }), sub ? h('div', { class: 'ls' }, arr([].concat(sub)).map((s) => h('span', { dir: 'auto', text: s }))) : null),
    right ? h('div', { class: 'lr' }, right) : null);
}
function errBox(info, title) {
  return h('div', { class: 'err-box', role: 'alert' }, h('strong', { text: title || t('section_error') }), h('span', { text: info.msg }), info.raw ? h('span', { class: 'raw', text: info.raw }) : null);
}

// ===================== الشريط العلوي والتنبيه =====================
function renderTop() {
  document.title = t('doc_title');
  $('title').textContent = t('title');
  $('subtitle').textContent = t('subtitle');
  const conn = $('conn');
  const stale = state.mode === 'live' && state.conn && state.conn.kind === 'unavailable';
  const m = stale ? 'stale' : state.mode;
  // «كل الأنظمة تعمل» بس لو مباشر وأرقام المكتب والمهام انحمّلت وما فيه أعطال بالتطبيق اليوم.
  // قسم ما انحمّل (خطأ من القاعدة): «يعمل · بعض البيانات ما انحمّلت» — ما نقول «كل شي تمام» وحنا ما نعرف
  const partial = m === 'live' && (!state.data || !!state.errs.overview || !!state.errs.tasks);
  const errs = m === 'live' && !partial ? n(state.data, 'activity.errors.today') : 0;
  conn.className = `conn ${m}${errs > 0 || partial ? ' warn' : ''}`;
  $('connLbl').textContent = t('os_status');
  $('connText').textContent = partial ? t('os_st_partial') : errs > 0 ? t('os_st_errors', { n: fmt(errs) }) : t(m === 'error' && state.isSample ? 'conn_error_sample' : `conn_${m}`);
  // «آخر تحديث» = آخر مرة وصلت نتيجة office_overview (حتى لو الاتصال انقطع بعدها)، وما نعرضه أبد مع بيانات تجريبية
  const liveShown = !state.isSample && (state.mode === 'live' || state.mode === 'error') && (state.data || state.tasks);
  $('updated').textContent = state.top === 'app' ? (liveShown && app.reqAt ? t('app_updated', { t: ago(new Date(app.reqAt).toISOString()) }) : '')
    : liveShown ? (state.updatedAt ? t('updated', { t: ago(new Date(state.updatedAt).toISOString()) }) : t('updated_never')) : '';
  // التبويب العلوي: المكتب / التطبيق (الفترة تخص المكتب بس)
  $('topTabs').setAttribute('aria-label', t('top_tabs'));
  $('topOfficeL').textContent = t('top_office');
  $('topAppL').textContent = t('top_app');
  $('period').hidden = state.top === 'app';
  $('period').setAttribute('aria-label', t('period'));
  for (const b of [$('days7'), $('days30')]) {
    b.textContent = t(`days_${b.dataset.days}`);
    b.setAttribute('aria-pressed', String(Number(b.dataset.days) === state.days));
  }
  const rb = $('refreshBtn');
  const busy = state.busyRefresh || (state.top === 'app' && appBusy());
  rb.replaceChildren(busy ? h('span', { class: 'spin' }) : icon('refresh', 'sm'), h('span', { text: busy ? t('refreshing') : t('refresh') }));
  rb.disabled = state.mode === 'connecting' || busy || !!(state.conn && state.conn.kind === 'user_changed');
  const lb = $('langBtn');
  lb.textContent = t('lang_switch');
  lb.setAttribute('lang', state.lang === 'ar' ? 'en' : 'ar');
  const dark = currentTheme() === 'dark';
  syncSceneLook();
  const tb = $('themeBtn');
  tb.replaceChildren(icon(dark ? 'sun' : 'moon'));
  tb.setAttribute('aria-label', t(dark ? 'theme_to_light' : 'theme_to_dark'));
  tb.title = t(dark ? 'theme_to_light' : 'theme_to_dark');
}
function currentTheme() {
  if (state.theme) return state.theme;
  try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
}

function renderBanner() {
  const b = $('banner');
  let kind = null, title = '', body = '', action = null, ic = 'info';
  if (state.mode === 'sample') { kind = 'sample'; title = t('b_sample_t'); body = t('b_sample'); ic = 'eye'; }
  else if (state.mode === 'connecting') { kind = 'connecting'; title = t('b_connecting_t'); body = t('b_connecting'); ic = 'db'; }
  else if (state.conn) {
    const k = state.conn.kind;
    // ما وصلت ولا مرة بيانات حية: نسخة ثانية للنص (ما فيه «آخر بيانات وصلت»)
    const ck = k === 'unavailable' && state.isSample ? 'unavailable_first' : k;
    kind = 'error'; ic = 'alert';
    title = connTitle(ck);
    body = t(`c_${ck}`) !== `c_${ck}` ? t(`c_${ck}`) : state.conn.raw || '';
    // وش اللي تحت الشريط: تجريبي (نقولها صريح) ولا آخر بيانات حية (والإجراءات موقفة)
    if (state.isSample) body = `${body} ${t('err_sample')}`.trim();
    else if (state.mode === 'error' && k !== 'unavailable' && (state.data || state.tasks)) body = `${body} ${t('err_last_data')}`.trim();
    if (k !== 'user_changed' && k !== 'policy' && k !== 'disabled') action = h('button', { type: 'button', class: 'btn sm', onclick: () => refresh(true) }, icon('refresh', 'sm'), t('try_again'));
  } else if (state.readOnly) { kind = 'error'; title = t('read_only_t'); body = t('read_only'); ic = 'alert'; }
  b.hidden = !kind;
  if (!kind) { b.replaceChildren(); return; }
  b.className = `banner ${kind}`;
  b.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  put(b, h('span', { class: 'b-ic' }, icon(ic)), h('div', { class: 'b-body' }, h('strong', { text: title }), body ? h('p', { text: body }) : null), action ? h('div', { class: 'b-act' }, action) : null);
}

const connTitle = (k) => (t(`c_${k}_t`) !== `c_${k}_t` ? t(`c_${k}_t`) : t('c_other_t'));

/** يبدّل محتوى اللوحة ويحافظ على مكان التمرير لو نفس العرض (التحديث كل دقيقة ما يرجّعك لفوق)، ويرجع لفوق لو العرض تغيّر */
function swapPanel(panel, head, body, view) {
  const old = panel.querySelector('.panel-body');
  const top = old && panel.dataset.view === view ? old.scrollTop : 0;
  panel.dataset.view = view;
  panel.replaceChildren(head, body);
  if (top) body.scrollTop = top;
}

// ===================== لوحة المكتب المختار =====================
const canAct = () => state.mode === 'live' || state.mode === 'sample';

function deskMetrics(id, o) {
  const k = (key, v, extra) => Object.assign({ k: t(key), v, mini: true }, extra || {});
  const pend = (kinds) => kinds.reduce((a, x) => a + n(o, `partners.pending.${x}`), 0);
  const st = deskStates();
  switch (id) {
    case 'lead': return [
      k('k_waiting_total', st.lead.waiting), k('k_working_total', DESKS.reduce((a, d) => a + st[d.id].working, 0)),
      k('k_oldest_wait', get(o, 'office.oldest_waiting_at') ? ago(get(o, 'office.oldest_waiting_at')) : t('v_none'), { txt: true }),
      k('k_pending_total', n(o, 'partners.pending_total')),
    ];
    case 'clubs': return [
      k('k_pending_total', pend(['club'])), k('k_checkins', n(o, 'activity.checkins.cur'), { prev: n(o, 'activity.checkins.prev') }),
      k('k_memberships', n(o, 'bookings.memberships.live')), k('k_present', n(o, 'activity.checkins.present_now')),
    ];
    case 'stores': return [
      k('k_pending_total', pend(['store'])), k('k_stores', n(o, 'store.brands.live')),
      k('k_products', n(o, 'store.products.live')), k('k_offer_views', n(o, 'store.offers.views.cur'), { prev: n(o, 'store.offers.views.prev') }),
    ];
    case 'coaches': return [
      k('k_pending_total', pend(['coach'])), k('k_coaching', n(o, 'bookings.coaching.clients_active')),
      { k: t('kind_coach'), v: n(o, 'bookings.coaching.coaches_approved'), mini: true, s: t('s_coaching', { a: fmt(n(o, 'bookings.coaching.sessions.upcoming_7d')), b: fmt(n(o, 'bookings.coaching.link_requests.pending')) }) },
      k('k_today', n(o, 'bookings.coaching.sessions.today')),
    ];
    case 'care': return [
      k('k_pending_total', pend(['center', 'venue'])), k('k_recovery', n(o, 'bookings.recovery.open_requests'), { s: t('s_recovery_old', { a: fmt(n(o, 'bookings.recovery.requests_over_24h')) }), warn: n(o, 'bookings.recovery.requests_over_24h') > 0 }),
      k('k_upcoming', n(o, 'bookings.venue_bookings.upcoming_7d')), k('k_vbookings', n(o, 'bookings.venue_bookings.created.cur'), { prev: n(o, 'bookings.venue_bookings.created.prev') }),
    ];
    case 'reports': return [
      k('k_new_reports', n(o, 'reports.by_status.new')), k('st_seen', n(o, 'reports.by_status.seen')),
      k('k_received', n(o, 'reports.received.cur'), { prev: n(o, 'reports.received.prev'), dir: 0 }), k('k_errors', n(o, 'activity.errors.today'), { s: t('k_today') }),
    ];
    case 'marketing': {
      const ad = get(o, 'marketing.live_ad');
      return [
        k('k_live_ad', ad ? str(ad.title) : t('v_no_ad'), { txt: true, s: ad && ad.ends_at ? t('s_live_ad', { t: ago(ad.ends_at) }) : null, warn: !ad }),
        k('k_ad_views', n(o, 'marketing.ad_stats.cur.views'), { prev: n(o, 'marketing.ad_stats.prev.views') }),
        k('k_nudges', n(o, 'marketing.nudges.cur'), { prev: n(o, 'marketing.nudges.prev') }),
        k('k_events', n(o, 'marketing.events.active')),
      ];
    }
    case 'ai': return [
      k('k_lim_barcode', n(o, 'ai.limits.barcode_per_day'), { s: t('s_per_user') }), k('k_lim_meals', n(o, 'ai.limits.meal_photos_per_day'), { s: t('s_per_user') }),
      k('uk_meal_photo', n(o, 'ai.usage.meal_photo.uses_cur'), { prev: n(o, 'ai.usage.meal_photo.uses_prev'), dir: 0 }),
      k('k_office_today', n(o, 'ai.office_tasks_today'), { s: t('s_office_today', { a: fmt(n(o, 'ai.fixed_caps.office') || 80) }) }),
    ];
    case 'activity': return [
      k('k_users', n(o, 'activity.users.total')), k('k_signups', n(o, 'activity.signups.cur'), { prev: n(o, 'activity.signups.prev') }),
      k('k_active', n(o, 'activity.active_users.cur'), { prev: n(o, 'activity.active_users.prev') }), k('k_present', n(o, 'activity.checkins.present_now')),
    ];
    case 'bookings': return [
      k('k_vbookings', n(o, 'bookings.venue_bookings.created.cur'), { prev: n(o, 'bookings.venue_bookings.created.prev') }),
      k('k_upcoming', n(o, 'bookings.venue_bookings.upcoming_7d')), k('k_memberships', n(o, 'bookings.memberships.live')),
      k('k_meals', n(o, 'bookings.meal_subscriptions.active')),
    ];
    case 'orders': return [
      k('k_orders', t('v_orders_off'), { txt: true, s: t('s_orders_off') }), k('k_products', n(o, 'store.products.live')),
      k('sold_out', n(o, 'store.products.sold_out'), { warn: n(o, 'store.products.sold_out') > 0 }),
      k('k_points', n(o, 'store.rewards.points.cur'), { prev: n(o, 'store.rewards.points.prev') }),
    ];
    case 'community': return [
      k('k_posts', n(o, 'community.posts.cur'), { prev: n(o, 'community.posts.prev') }), k('k_messages', n(o, 'community.chats.messages.cur'), { prev: n(o, 'community.chats.messages.prev') }),
      k('moderation', n(o, 'community.moderation.reported.open'), { warn: n(o, 'community.moderation.reported.open') > 0 }),
      k('k_friend_req', n(o, 'community.friend_requests.pending')),
    ];
    default: return [];
  }
}

/** صف مهمة (يتكرر في لوحة المهام وفي لوحة المكتب) */
function taskRow(task) {
  const p = phase(task);
  const d = DESK[deskOf(task.desk)];
  return h('button', { type: 'button', class: `task ${p}${state.fresh.has(task.id) ? ' fresh' : ''}`, onclick: () => openSheet(task.id), 'aria-haspopup': 'dialog' },
    h('span', { class: 'bar' }),
    h('span', { class: 'tt', dir: 'auto', text: taskName(task) }),
    h('span', { class: 'st' }, statusPill(task)),
    h('span', { class: 'tm' },
      h('span', { class: 'dk' }, h('i', { style: { background: d.shirt } }), t(`sign_${d.id}`)),
      h('span', { text: kindLabel(task) }),
      h('span', { class: 'num', text: ago(taskWhen(task)) })));
}

function agentBlock(id) {
  if (!AGENT_DESKS.includes(id)) {
    return h('div', { class: 'agent' }, h('div', { class: 'agent-top' }, h('span', { class: 'spark-ic' }, icon('db', 'sm')), h('strong', { text: t('agent') })), h('p', { text: t('agent_none') }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', disabled: true, 'aria-disabled': 'true' }, icon('play', 'sm'), t('agent_run'))));
  }
  const run = state.run && state.run.desk === id ? state.run : null;
  const running = run && (run.phase === 'queued' || run.phase === 'waiting');
  const otherRunning = state.run && state.run.desk !== id && (state.run.phase === 'queued' || state.run.phase === 'waiting');
  const kids = [h('div', { class: 'agent-top' }, h('span', { class: 'spark-ic' }, icon('sparkles', 'sm')), h('strong', { text: t('agent') })), h('p', { text: t(`agent_${id}`) })];
  if (id === 'marketing') {
    const dkey = 'brief:marketing';
    kids.push(h('div', { class: 'field' },
      h('label', { for: 'agentBrief', text: t('agent_brief_label') }),
      h('input', { id: 'agentBrief', class: 'input', maxlength: BRIEF_MAX, placeholder: t('agent_brief_ph'), value: (state.drafts[dkey] && state.drafts[dkey].note) || '', disabled: running || null,
        oninput: (e) => { state.drafts[dkey] = { note: e.target.value }; } })));
  }
  kids.push(h('div', { class: 'row' },
    h('button', { type: 'button', id: `run-${id}`, class: `btn dark${running ? ' busy' : ''}`, disabled: !canAct() || running || otherRunning || null, onclick: () => runAgent(id) },
      running ? h('span', { class: 'spin' }) : icon('play', 'sm'), t('agent_run'))));
  if (run) {
    if (running) kids.push(h('div', { class: 'run-state', role: 'status' }, h('span', { class: 'spin' }), t('run_waiting_new', { s: fmt(Math.round((Date.now() - run.started) / 1000)) })));
    else if (run.phase === 'done') {
      const news = arr(state.tasks).filter((x) => run.newIds.includes(x.id));
      kids.push(h('div', { class: 'ok-box', role: 'status', text: t('run_new', { n: fmt(news.length), w: fmt(news.filter((x) => phase(x) === 'waiting').length), p: fmt(news.filter((x) => phase(x) === 'working').length) }) }));
    } else if (run.phase === 'none') kids.push(h('div', { class: 'note-box', role: 'status', text: t('run_none') }));
    else if (run.phase === 'sample') kids.push(h('div', { class: 'note-box', role: 'status', text: t('run_sample') }));
    else if (run.phase === 'error') kids.push(h('div', { class: 'inline-err', role: 'alert', text: run.err }));
  }
  return h('div', { class: 'agent' }, kids);
}

/** بطاقة طلب شريك: قبول (بتأكيد) أو رفض (برسالة) — office_admin.review */
function partnerItem(it) {
  const key = `p:${it.id}`;
  const dr = state.drafts[key] || {};
  const busy = !!state.itemBusy[key];
  const at = it.agent_task;
  const agentTask = at ? arr(state.tasks).find((x) => x.id === at.id) : null;
  const chip = at ? (at.status === 'waiting_approval'
    ? h('button', { type: 'button', class: 'btn sm', onclick: () => openSheet(at.id) }, icon('sparkles', 'sm'), t('agent_ready'))
    : pill(t('agent_reviewing'), 'work', true)) : null;
  const actions = [];
  if (dr.mode === 'approve') {
    actions.push(h('div', { class: 'confirm' },
      h('span', { class: 'small', text: `${t('confirm_approve_hint')}${at && at.status === 'waiting_approval' ? ` ${t('closes_agent')}` : ''}` }),
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', class: `btn sm primary${busy ? ' busy' : ''}`, id: `${key}:ok`, disabled: busy || null, onclick: () => reviewItem(it, 'approve') }, busy ? h('span', { class: 'spin' }) : icon('check', 'sm'), t('confirm_approve')),
        h('button', { type: 'button', class: 'btn sm ghost', disabled: busy || null, onclick: () => setDraft(key, null) }, t('cancel')))));
  } else if (dr.mode === 'reject') {
    const id = `${key}:note`;
    actions.push(h('div', { class: 'confirm' },
      h('div', { class: 'field' }, h('label', { for: id, text: t('reject_note_label') }),
        h('textarea', { id, class: 'input', maxlength: NOTE_MAX, placeholder: t('reject_note_ph'), value: dr.note || '', oninput: (e) => { dr.note = e.target.value; } })),
      at && at.status === 'waiting_approval' ? h('span', { class: 'small muted', text: t('closes_agent') }) : null,
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', class: `btn sm danger${busy ? ' busy' : ''}`, id: `${key}:no`, disabled: busy || null, onclick: () => reviewItem(it, 'reject') }, busy ? h('span', { class: 'spin' }) : icon('x', 'sm'), t('confirm_reject')),
        h('button', { type: 'button', class: 'btn sm ghost', disabled: busy || null, onclick: () => setDraft(key, null) }, t('cancel')))));
  } else {
    actions.push(h('div', { class: 'item-actions' },
      h('button', { type: 'button', class: 'btn sm', id: `${key}:approve`, disabled: !canAct() || null, onclick: () => setDraft(key, { mode: 'approve' }) }, icon('check', 'sm'), t('approve')),
      h('button', { type: 'button', class: 'btn sm', id: `${key}:reject`, disabled: !canAct() || null, onclick: () => setDraft(key, { mode: 'reject', note: agentTask && isObj(agentTask.output) && agentTask.output.recommendation === 'reject' ? str(agentTask.output.note) : '' }) }, icon('x', 'sm'), t('reject')),
      chip));
  }
  return h('div', { class: 'item' },
    h('div', { class: 'item-top' },
      h('div', { class: 'item-main' },
        h('div', { class: 'item-name', dir: 'auto', text: str(it.name) || t('anon') }),
        h('div', { class: 'item-meta' }, h('span', { text: t(`kind_${it.kind}`) }), it.city ? h('span', { text: str(it.city) }) : null,
          it.username ? h('span', { dir: 'ltr', text: `@${str(it.username)}` }) : null, h('span', { class: 'num', text: ago(it.created_at) })))),
    actions,
    state.itemErr[key] ? h('div', { class: 'inline-err', role: 'alert', text: state.itemErr[key] }) : null);
}

/** بطاقة تقرير جديد: حالة (قيد الدراسة / تم / لن يُنفّذ) + رد اختياري — office_admin.report */
function reportItem(r) {
  const key = `r:${r.id}`;
  const dr = state.drafts[key] || {};
  const busy = !!state.itemBusy[key];
  const at = r.agent_task;
  const kids = [
    h('div', { class: 'item-top' },
      h('div', { class: 'item-main' },
        h('div', { class: 'item-meta' }, pill(t(`cat_${['bug', 'idea', 'design', 'other'].includes(r.category) ? r.category : 'other'}`), r.category === 'bug' ? 'wait' : 'plain'),
          h('span', { dir: r.username ? 'ltr' : null, text: r.username ? `@${str(r.username)}` : t('anon') }), h('span', { class: 'num', text: ago(r.created_at) })),
        h('div', { class: 'item-msg', dir: 'auto', text: str(r.message) }))),
  ];
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('report_status') }, REPORT_FINAL.map((s) =>
    h('button', { type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(dr.status === s), disabled: !canAct() || busy || null, onclick: () => setDraft(key, { status: s, note: dr.note || '' }) }, t(`st_${s}`))));
  kids.push(h('div', { class: 'item-actions' }, chips,
    at ? (at.status === 'waiting_approval' ? h('button', { type: 'button', class: 'btn sm', onclick: () => openSheet(at.id) }, icon('sparkles', 'sm'), t('agent_ready')) : pill(t('agent_reviewing'), 'work', true)) : null));
  if (dr.status) {
    const id = `${key}:reply`;
    kids.push(h('div', { class: 'confirm' },
      h('div', { class: 'field' }, h('label', { for: id, text: t('report_reply_label') }),
        h('textarea', { id, class: 'input', maxlength: REPLY_MAX, value: dr.note || '', oninput: (e) => { dr.note = e.target.value; } }),
        h('span', { class: 'hint', text: t('report_reply_hint') })),
      at && at.status === 'waiting_approval' ? h('span', { class: 'small muted', text: t('closes_agent') }) : null,
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', class: `btn sm primary${busy ? ' busy' : ''}`, id: `${key}:save`, disabled: busy || null, onclick: () => reportAction(r) }, busy ? h('span', { class: 'spin' }) : icon('check', 'sm'), t('save')),
        h('button', { type: 'button', class: 'btn sm ghost', disabled: busy || null, onclick: () => setDraft(key, null) }, t('cancel')))));
  }
  if (state.itemErr[key]) kids.push(h('div', { class: 'inline-err', role: 'alert', text: state.itemErr[key] }));
  return h('div', { class: 'item' }, kids);
}

function setDraft(key, v) {
  if (v) state.drafts[key] = v; else delete state.drafts[key];
  delete state.itemErr[key];
  renderDeskPanel();
  const focusId = v && v.mode === 'reject' ? `${key}:note` : v && v.mode === 'approve' ? `${key}:ok` : v && v.status ? `${key}:reply` : null;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}

function deskItems(id, o) {
  const out = [];
  const tasks = arr(state.tasks);
  const d = DESK[id];
  const linked = new Set();
  if (d.kinds.length) {
    const items = arr(get(o, 'partners.items')).filter((x) => x && d.kinds.includes(x.kind) && UUID_RE.test(str(x.id)));
    items.forEach((x) => x.agent_task && linked.add(x.agent_task.id));
    const more = d.kinds.reduce((a, k) => a + n(o, `partners.pending.${k}`), 0) - items.length;
    out.push(block(t('requests'), [
      items.length ? h('div', { class: 'tasks' }, items.map(partnerItem)) : h('div', { class: 'empty', text: t('nothing_here') }),
      more > 0 ? h('div', { class: 'small muted', text: t('more_in_app', { n: fmt(more) }) }) : null,
    ], { icon: 'clock' }));
  }
  if (id === 'reports') {
    const reps = arr(get(o, 'reports.latest_new')).filter((x) => x && UUID_RE.test(str(x.id)));
    reps.forEach((x) => x.agent_task && linked.add(x.agent_task.id));
    const more = n(o, 'reports.by_status.new') - reps.length;
    out.push(block(t('reports_new'), [
      reps.length ? h('div', { class: 'tasks' }, reps.map(reportItem)) : h('div', { class: 'empty', text: t('nothing_here') }),
      more > 0 ? h('div', { class: 'small muted', text: t('more_in_app', { n: fmt(more) }) }) : null,
    ], { icon: 'bug' }));
  }
  // اقتراحات الوكيل المفتوحة اللي مو مربوطة بعنصر ظاهر فوق
  const open = tasks.filter((x) => deskOf(x.desk) === id && (phase(x) === 'waiting' || phase(x) === 'working') && !linked.has(x.id));
  if (open.length) out.push(block(t('proposals'), h('div', { class: 'tasks' }, open.map(taskRow)), { icon: 'sparkles' }));
  return out;
}

function leadBlocks(o) {
  const st = deskStates();
  const out = [];
  const rows = DESKS.filter((d) => d.id !== 'lead' && (st[d.id].waiting || st[d.id].working || st[d.id].alert));
  out.push(block(t('waiting_by_desk'), rows.length ? h('div', { class: 'list' }, rows.map((d) => li(t(`desk_${d.id}`),
    [st[d.id].waiting ? t('n_waiting', { n: fmt(st[d.id].waiting) }) : null, st[d.id].working ? t('n_working', { n: fmt(st[d.id].working) }) : null, st[d.id].alert ? t('n_alert', { n: fmt(st[d.id].alert) }) : null].filter(Boolean),
    st[d.id].waiting ? h('span', { class: 'pill wait num', text: fmt(st[d.id].waiting) }) : null, () => selectDesk(d.id)))) : h('div', { class: 'empty', text: t('empty_waiting') }), { icon: 'clock' }));
  // ملخص اليوم: آخر daily_brief
  const brief = arr(state.tasks).filter((x) => x.kind === 'daily_brief' && isObj(x.output)).sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))[0];
  if (brief) {
    const ob = brief.output;
    out.push(block(t('daily_brief'), [
      h('div', { class: 'summary' }, h('strong', { text: L(ob.headline) }), h('div', { class: 'small muted num', text: ago(brief.created_at) })),
      arr(ob.points).length ? h('ul', { class: 'points' }, arr(ob.points).slice(0, 6).map((p) => h('li', { dir: 'auto', text: L(p) }))) : null,
      arr(ob.priorities).length ? h('div', { class: 'checks' }, arr(ob.priorities).slice(0, 4).map((p) => {
        const dd = deskOf(str(p.desk));
        return h('button', { type: 'button', class: 'prio', onclick: () => selectDesk(dd) }, deskBadge(dd), h('span', { class: 'item-main' }, h('span', { class: 'small', style: { fontWeight: 700, display: 'block' }, text: t(`sign_${dd}`) }), h('span', { class: 'small', text: L(p.text) })));
      })) : null,
    ], { icon: 'sparkles' }));
  } else out.push(block(t('daily_brief'), h('div', { class: 'empty', text: t('brief_none') }), { icon: 'sparkles' }));
  return out;
}

function deskExtras(id, o) {
  switch (id) {
    case 'clubs': return [block(t('top_gyms'), bars(arr(get(o, 'activity.top_gyms')).slice(0, 4).map((g) => ({ label: gymName(g), n: num(g.n) }))))];
    case 'stores': return [block(t('low_stock'), lowStock(o, 4))];
    case 'marketing': return [block(t('upcoming_events'), eventsList(o, 4))];
    case 'ai': return [block(t('ai_usage'), usageBars(o))];
    case 'activity': return [block(t('top_errors'), bars(arr(get(o, 'activity.errors.top')).map((e) => ({ label: str(e.kind), n: num(e.n) }))))];
    case 'bookings': return [block(t('attention'), attentionList(o, 6))];
    case 'orders': return [block(t('low_stock'), lowStock(o, 6))];
    case 'community': return [h('div', { class: 'standing' }, icon('alert', 'sm'), h('span', { text: t('mod_standing') })), block(t('moderation'), modList(o, 4))];
    case 'lead': return [block(t('attention'), attentionList(o, 3, true))];
    default: return [];
  }
}

function renderDeskPanel() {
  const panel = $('deskPanel');
  const keep = focusState();
  const id = state.desk;
  const o = state.data || {};
  const st = deskStates()[id];
  const head = h('div', { class: 'panel-head' },
    h('div', { class: 'desk-head' }, deskBadge(id), h('div', { class: 'item-main' }, h('h2', { class: 'desk-name', id: 'deskName', text: t(`desk_${id}`) }), h('p', { class: 'desk-role', text: t(`role_${id}`) }))),
    h('div', { class: 'counts' },
      st.waiting ? pill(t('n_waiting', { n: fmt(st.waiting) }), 'wait', true) : null,
      st.working ? pill(t('n_working', { n: fmt(st.working) }), 'work', true) : null,
      st.alert ? pill(t('n_alert', { n: fmt(st.alert) }), 'info') : null,
      !st.waiting && !st.working && !st.alert ? pill(t('idle'), 'ok', true) : null));
  const body = h('div', { class: 'panel-body' });
  if (!state.data && state.errs.overview) body.append(errBox(state.errs.overview));
  else {
    if (state.errs.overview) body.append(errBox(state.errs.overview));
    if (state.needAdmin) body.append(adminPicker());
    body.append(h('div', { class: 'mini-grid' }, deskMetrics(id, o).map(tile)));
    body.append(agentBlock(id));
    if (id === 'lead') body.append(...leadBlocks(o)); else body.append(...deskItems(id, o));
    body.append(...deskExtras(id, o));
    const area = AREA_OF[id];
    if (area) body.append(h('div', null, h('button', { type: 'button', class: 'link', onclick: () => goArea(area) }, t('details'), icon('arrowEnd', 'xs flip'))));
  }
  swapPanel(panel, head, body, id);
  restoreFocus(keep);
}

function adminPicker(suffix = '') {
  const id = `adminPick${suffix}`;
  const dr = state.drafts.admin || { note: state.adminId || '' };
  return h('div', { class: 'err-box' }, h('span', { text: t('err_choose_admin') }),
    h('div', { class: 'field' }, h('label', { for: id, text: t('admin_pick') }),
      h('input', { id, class: 'input num', dir: 'ltr', value: dr.note || '', placeholder: '00000000-0000-0000-0000-000000000000', oninput: (e) => { state.drafts.admin = { note: e.target.value }; } })),
    h('div', { class: 'item-actions' }, h('button', { type: 'button', class: 'btn sm', onclick: () => {
      const v = str((state.drafts.admin || {}).note).trim();
      if (!UUID_RE.test(v)) { toast(t('admin_pick_bad')); return; }
      state.adminId = v.toLowerCase(); store('adminId', state.adminId); state.needAdmin = false; refresh(true);
    } }, t('admin_pick_save'))));
}

const gymName = (g) => (state.lang === 'en' && g.name_en ? str(g.name_en) : str(g.name)) || t('anon');
function lowStock(o, max) {
  const items = arr(get(o, 'store.products.low_stock_items')).slice(0, max);
  if (!items.length) return h('div', { class: 'empty', text: t('v_none') });
  return h('div', { class: 'list' }, items.map((x) => li(str(x.product), [str(x.brand)], num(x.stock) === 0 ? pill(t('sold_out'), 'wait') : pill(t('in_stock', { n: fmt(num(x.stock)) }), 'work'))));
}
function eventsList(o, max) {
  const ev = arr(get(o, 'marketing.events.upcoming')).slice(0, max);
  if (!ev.length) return h('div', { class: 'empty', text: t('no_events') });
  return h('div', { class: 'list' }, ev.map((e) => li(state.lang === 'en' && e.title_en ? str(e.title_en) : str(e.title),
    [`${fmtDate(e.starts_on)}${e.ends_on ? ` – ${fmtDate(e.ends_on)}` : ''}`, e.city ? str(e.city) : null].filter(Boolean))));
}
function attentionList(o, max, onlyP1) {
  let items = arr(get(o, 'bookings.attention'));
  if (onlyP1) items = items.filter((x) => x.priority === 1);
  items = items.slice(0, max);
  if (!items.length) return h('div', { class: 'empty', text: t('att_none') });
  return h('div', { class: 'list' }, items.map((a) => h('div', { class: 'li' },
    h('span', { class: `pri p${[1, 2, 3].includes(a.priority) ? a.priority : 3}`, text: String(num(a.priority) || 3) }),
    h('div', { class: 'lm' }, h('div', { class: 'lt', dir: 'auto', text: str(a.name) || t('anon') }),
      h('div', { class: 'ls' }, h('span', { text: t(`att_${a.kind}`) !== `att_${a.kind}` ? t(`att_${a.kind}`) : str(a.kind) }), h('span', { class: 'num', text: `× ${fmt(num(a.n))}` }), h('span', { class: 'num', text: ago(a.since) }))))));
}
function modList(o, max) {
  const items = arr(get(o, 'community.moderation.latest')).slice(0, max);
  const open = n(o, 'community.moderation.reported.open');
  return [
    open ? h('div', { class: 'small', style: { fontWeight: 600 }, text: t('mod_open', { n: fmt(open) }) }) : null,
    items.length ? h('div', { class: 'list' }, items.map((m) => li(str(m.target_name) || t('gym_review'),
      [t('gym_review'), m.author_username ? `@${str(m.author_username)}` : null, t(`reason_${m.reason}`) !== `reason_${m.reason}` ? t(`reason_${m.reason}`) : str(m.reason), ago(m.created_at)].filter(Boolean),
      pill(t(`mst_${m.status}`) !== `mst_${m.status}` ? t(`mst_${m.status}`) : str(m.status), m.status === 'new' ? 'wait' : m.status === 'removed' ? 'fail' : 'plain')))) : h('div', { class: 'empty', text: t('v_none') }),
  ];
}
function usageBars(o) {
  return bars(['meal_photo', 'barcode', 'plan', 'office'].map((k) => ({ label: t(`uk_${k}`), n: n(o, `ai.usage.${k}.uses_cur`), sub: '' })));
}

// ===================== لوحة المهام =====================
function tabCounts(tasks) {
  const c = { all: tasks.length, waiting: 0, working: 0, done: 0 };
  for (const x of tasks) { const p = phase(x); if (p === 'waiting') c.waiting++; else if (p === 'working') c.working++; else c.done++; }
  return c;
}
function renderTasks() {
  const panel = $('taskPanel');
  const keep = focusState();
  const all = arr(state.tasks).filter((x) => !state.deskOnly || deskOf(x.desk) === state.desk);
  const c = tabCounts(all);
  const order = { waiting: 0, working: 1, done: 2, failed: 2 };
  const list = all.filter((x) => state.tab === 'all' || (state.tab === 'done' ? ['done', 'failed'].includes(phase(x)) : phase(x) === state.tab))
    .sort((a, b) => order[phase(a)] - order[phase(b)] || str(taskWhen(b)).localeCompare(str(taskWhen(a))));
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('tasks') }, ['all', 'waiting', 'working', 'done'].map((k) =>
    h('button', { type: 'button', role: 'tab', id: `tab-${k}`, 'aria-selected': String(state.tab === k), 'aria-controls': 'taskList', onclick: () => { state.tab = k; store('tab', k); renderTasks(); } },
      t(`tab_${k}`), h('span', { class: `c num${k === 'waiting' && c.waiting ? ' wait' : ''}`, text: fmt(c[k]) }))));
  const scopeId = 'deskOnly';
  const head = h('div', { class: 'panel-head' },
    h('h2', { class: 'panel-title', id: 'tasksTitle' }, icon('clock', 'sm'), t('tasks')), tabs,
    h('label', { class: 'scope', for: scopeId }, h('input', { type: 'checkbox', id: scopeId, checked: state.deskOnly || null, onchange: (e) => { state.deskOnly = e.target.checked; store('deskOnly', e.target.checked ? '1' : '0'); renderTasks(); } }),
      h('span', null, t('this_desk_only'), state.deskOnly ? h('span', { class: 'muted', text: ` · ${t(`sign_${state.desk}`)}` }) : null)));
  const body = h('div', { class: 'panel-body', id: 'taskList', role: 'tabpanel', 'aria-labelledby': `tab-${state.tab}` });
  if (state.errs.tasks) body.append(errBox(state.errs.tasks, t('tasks_error')));
  if (state.needAdmin && !state.data) body.append(adminPicker());
  const items = [];
  const run = state.run;
  if (run && (run.phase === 'queued' || run.phase === 'waiting') && (state.tab === 'all' || state.tab === 'working') && (!state.deskOnly || run.desk === state.desk)) {
    items.push(h('div', { class: 'task working pseudo', role: 'status' }, h('span', { class: 'bar' }), h('span', { class: 'tt', text: t('run_queued') }),
      h('span', { class: 'st' }, pill(t('st_in_progress'), 'work', true)),
      h('span', { class: 'tm' }, h('span', { class: 'dk' }, h('i', { style: { background: DESK[run.desk].shirt } }), t(`sign_${run.desk}`)), h('span', { class: 'num', text: t('run_waiting_new', { s: fmt(Math.round((Date.now() - run.started) / 1000)) }) }))));
  }
  items.push(...list.map(taskRow));
  if (items.length) body.append(h('div', { class: 'tasks' }, items));
  else if (state.tasks) body.append(h('div', { class: 'empty', text: state.tab === 'waiting' ? t('empty_waiting') : t('empty_tasks') }));
  swapPanel(panel, head, body, `${state.tab}:${state.deskOnly ? state.desk : '*'}`);
  restoreFocus(keep);
}

// ===================== نظام الشركة: الواجهة فوق المكتب =====================
// شريط الفرق ← العنوان والبطاقات ← المبنى (createCompanyOS أو المبنى المسطّح) ← خط سير العمل ← الأرقام
const show3d = () => state.view === '3d' && state.can3d;
const osClip = (s, max) => { const a = Array.from(str(s).replace(/\s+/g, ' ').trim()); return a.length > max ? `${a.slice(0, max - 1).join('')}…` : a.join(''); };
/** عدّادات طلبات التعديل (غرفة المهندسين)؛ loaded = false لو ما انحمّلت للحين */
function engCounts() {
  const c = { sent: 0, working: 0, needs_you: 0, review: 0, done: 0, failed: 0, cancelled: 0, open: 0, loaded: Array.isArray(app.requests) };
  for (const r of arr(app.requests)) if (c[r.status] !== undefined) c[r.status]++;
  c.open = c.sent + c.working + c.needs_you + c.review;
  return c;
}
/** حالة كل غرفة: المكاتب من deskStates، وغرفة المهندسين من الطلبات (ينتظرك = يحتاج ردّك أو جاهز للمراجعة) */
function roomStates(st) {
  const e = engCounts();
  return Object.assign({}, st, { eng: { waiting: e.needs_you + e.review, working: e.working, done: e.done, alert: e.failed } });
}
/** حالة الفريق: مجموع غرفه (المدير = كل اللي ينتظرك) */
function teamState(id, rs) {
  if (id === 'ceo') return rs.lead;
  return teamRooms(id).reduce((a, r) => { const s = rs[r] || {}; a.waiting += num(s.waiting); a.working += num(s.working); a.alert += num(s.alert); return a; }, { waiting: 0, working: 0, alert: 0 });
}
const roomName = (id) => (id === 'eng' ? t('os_s_eng') : t(`desk_${id}`));
/** الاسم المقروء للغرفة: الأسماء الظاهرة (اللافتة بكل درجاتها أو البطاقة) أول، بعدها اسم المكتب — بدون تكرار.
 * عشان اللي يقول اللي يشوفه («اضغط التقارير») يلقى الزر */
const roomLabel = (id, s, shown) => {
  const low = (x) => str(x).toLowerCase();
  const names = [];
  for (const x of [...arr(shown), roomName(id)]) if (x && !names.some((y) => low(y).includes(low(x)))) names.push(x);
  const a = t('a11y_desk', { name: names.join(' · '), w: num(s && s.waiting), p: num(s && s.working) });
  return s && num(s.alert) > 0 ? `${a}${state.lang === 'ar' ? '، ' : ', '}${t('n_alert', { n: num(s.alert) })}` : a;
};
function stateChip(s) {
  if (s.waiting) return h('span', { class: 'os-chip wait' }, h('i'), t('os_c_wait', { n: fmt(s.waiting) }));
  if (s.working) return h('span', { class: 'os-chip work' }, h('i'), t('os_c_work', { n: fmt(s.working) }));
  if (s.alert) return h('span', { class: 'os-chip alert' }, h('i'), t('os_c_alert', { n: fmt(s.alert) }));
  return h('span', { class: 'os-chip idle' }, h('i'), t('os_c_idle'));
}
const textChip = (cls, text) => h('span', { class: `os-chip ${cls}` }, h('i'), text);

// ---------- لافتات الأقسام على المبنى (نفس الأسماء والحالة بالمشهد وبالمبنى المسطّح) ----------
/** أسماء الغرفة على لافتتها بالترتيب (لو الأول ما كفّى عرض الغرفة ناخذ اللي بعده): المقر = القصير، الفريق = الكامل ثم القصير */
function plateNames(id, kind) {
  if (id === 'eng') return [t('os_s_eng')];
  if (id === 'lead') return kind === 'hq' ? [t('os_s_ceo')] : [t('os_room_ceo'), t('os_s_ceo')];
  return kind === 'hq' ? [t(`sign_${id}`)] : [t(`desk_${id}`), t(`sign_${id}`)];
}
const plateIcon = (id) => (id === 'eng' ? 'code' : DESK[id] ? DESK[id].icon : 'cube');
/** حالة اللافتة: ينتظرك (برتقالي) وإلا يشتغل (كهرماني) وإلا تحتاج نظرة (أزرق) وإلا هادي. المهندسين قبل ما تنحمّل طلباتهم: none */
function plateState(id, s) {
  if (id === 'eng' && !engCounts().loaded) return { cls: 'none', n: 0 };
  if (s && num(s.waiting)) return { cls: 'wait', n: num(s.waiting), key: 'os_c_wait' };
  if (s && num(s.working)) return { cls: 'work', n: num(s.working), key: 'os_c_work' };
  if (s && num(s.alert)) return { cls: 'alert', n: num(s.alert), key: 'os_c_alert' };
  return { cls: 'idle', n: 0, key: 'os_c_idle' };
}
/** شريحة الحالة: worded = «٢ ينتظرك» / «هادي»، وإلا الرقم بس (والهادي نقطة صغيرة) */
function plateChip(ps, worded) {
  if (ps.cls === 'none') return h('span', { class: 'os-pl-c idle num', text: '—' });
  if (ps.cls === 'idle') return worded ? h('span', { class: 'os-pl-c idle' }, h('i'), t('os_c_idle')) : h('span', { class: 'os-pl-c dot' });
  const v = ps.n > 99 ? '99+' : fmt(ps.n);
  return worded ? h('span', { class: `os-pl-c ${ps.cls}`, text: t(ps.key, { n: v }) }) : h('span', { class: `os-pl-c ${ps.cls} num`, text: v });
}

// ---------- الخطة اللي ينبني منها المبنى (نفس الخطة للمشهد وللمبنى المسطّح) ----------
/** فرق رقم عن الفترة السابقة: up = الاتجاه زين (true) أو شين (false) أو محايد (null) */
function deltaOf(cur, prev, dir) {
  const d = cur - prev;
  if (!d || !Number.isFinite(d)) return {};
  const pct = prev > 0 ? Math.round((Math.abs(d) / prev) * 100) : null;
  return { delta: `${d > 0 ? '+' : '−'}${pct === null ? fmt(Math.abs(d)) : `${fmt(pct)}%`}`, up: dir === 0 ? null : (d > 0) === (dir > 0) };
}
/** أرقام الشاشة من deskMetrics (نفس أرقام لوحة المكتب) */
function kpiItems(id, o, max) {
  const has = !!state.data;
  return deskMetrics(id, o).filter((m) => typeof m.v === 'number' || (m.v && Array.from(str(m.v)).length <= 18)).slice(0, max).map((m) => {
    const it = { label: osClip(m.k, 28), value: typeof m.v === 'number' ? (has ? fmt(m.v) : '—') : str(m.v) };
    return has && typeof m.v === 'number' && typeof m.prev === 'number' ? Object.assign(it, deltaOf(m.v, m.prev, m.dir === undefined ? 1 : m.dir)) : it;
  });
}
const OS_SERIES = { lead: ['activity.active_users', 'k_active'], clubs: ['activity.checkins', 'k_checkins'], activity: ['activity.signups', 'k_signups'], community: ['community.posts', 'k_posts'] };
function chartScreen(id, o) {
  const def = OS_SERIES[id];
  if (!def || !state.data) return null;
  const series = id === 'community' ? arr(get(o, 'community.daily')).map((x) => num(x && x.posts)) : arr(get(o, `${def[0]}.daily`)).map((x) => num(x && x.n));
  if (series.length < 2) return null;
  const cur = n(o, `${def[0]}.cur`);
  return Object.assign({ type: 'chart', title: t(def[1]), value: fmt(cur), series }, deltaOf(cur, n(o, `${def[0]}.prev`), 1));
}
/** قائمة الشاشة: مهام الوكيل المفتوحة أول، وإلا قائمة المكتب نفسه */
function listScreen(id, o) {
  const d = DESK[id];
  const L4 = (title, rows, empty) => ({ type: 'list', title, rows: rows.slice(0, 4), empty: empty || t('nothing_here') });
  if (id === 'lead') {
    const st = deskStates();
    const brief = arr(state.tasks).filter((x) => x.kind === 'daily_brief' && isObj(x.output)).sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))[0];
    const pr = brief ? arr(brief.output.priorities) : [];
    if (pr.length) return L4(t('daily_brief'), pr.map((p) => ({ text: osClip(L(p.text), 34), meta: t(`sign_${deskOf(str(p.desk))}`), tone: 'wait' })));
    return L4(t('os_sc_queue'), DESKS.filter((x) => x.id !== 'lead' && st[x.id].waiting).sort((a, b) => st[b.id].waiting - st[a.id].waiting)
      .map((x) => ({ text: t(`sign_${x.id}`), meta: t('os_sc_wait_n', { n: fmt(st[x.id].waiting) }), tone: 'wait' })), t('empty_waiting'));
  }
  if (d.kinds.length) {
    return L4(t('os_sc_requests'), arr(get(o, 'partners.items')).filter((x) => x && d.kinds.includes(x.kind)).map((x) => {
      const at = x.agent_task && isOpenStatus(x.agent_task.status) ? x.agent_task : null;
      return { text: osClip(x.name || t('anon'), 30), meta: at ? t(at.status === 'waiting_approval' ? 'agent_ready' : 'agent_reviewing') : ago(x.created_at), tone: at && at.status !== 'waiting_approval' ? 'work' : 'wait' };
    }));
  }
  if (id === 'reports') {
    return L4(t('reports_new'), arr(get(o, 'reports.latest_new')).map((r) => ({ text: osClip(r.message, 34), meta: t(`cat_${['bug', 'idea', 'design', 'other'].includes(r.category) ? r.category : 'other'}`), tone: 'wait' })));
  }
  const open = arr(state.tasks).filter((x) => deskOf(x.desk) === id && (phase(x) === 'waiting' || phase(x) === 'working'));
  if (open.length) return L4(t('os_sc_queue'), open.map((x) => ({ text: osClip(taskName(x), 34), meta: t(phase(x) === 'waiting' ? 'st_waiting' : 'st_in_progress'), tone: phase(x) === 'waiting' ? 'wait' : 'work' })));
  switch (id) {
    case 'bookings': return L4(t('attention'), arr(get(o, 'bookings.attention')).map((a) => ({ text: osClip(a.name || t('anon'), 30), meta: t(`att_${a.kind}`) !== `att_${a.kind}` ? osClip(t(`att_${a.kind}`), 30) : str(a.kind), tone: a.priority === 1 ? 'wait' : 'work' })), t('att_none'));
    case 'orders': return L4(t('low_stock'), arr(get(o, 'store.products.low_stock_items')).map((x) => ({ text: osClip(x.product, 30), meta: num(x.stock) === 0 ? t('sold_out') : t('in_stock', { n: fmt(num(x.stock)) }), tone: num(x.stock) === 0 ? 'wait' : 'work' })), t('v_none'));
    case 'marketing': return L4(t('upcoming_events'), arr(get(o, 'marketing.events.upcoming')).map((e) => ({ text: osClip(state.lang === 'en' && e.title_en ? e.title_en : e.title, 32), meta: fmtDate(e.starts_on), tone: 'ok' })), t('no_events'));
    case 'ai': return L4(t('ai_usage'), ['meal_photo', 'barcode', 'plan', 'office'].map((k) => ({ text: t(`uk_${k}`), meta: fmt(n(o, `ai.usage.${k}.uses_cur`)), tone: 'ok' })));
    case 'activity': return L4(t('top_errors'), arr(get(o, 'activity.errors.top')).map((e) => ({ text: osClip(e.kind, 30), meta: fmt(num(e.n)), tone: 'wait' })), t('v_none'));
    case 'community': return L4(t('moderation'), arr(get(o, 'community.moderation.latest')).map((m) => ({ text: osClip(m.target_name || t('gym_review'), 30), meta: t(`reason_${m.reason}`) !== `reason_${m.reason}` ? t(`reason_${m.reason}`) : str(m.reason), tone: m.status === 'new' ? 'wait' : 'ok' })), t('v_none'));
    default: return L4(t('os_sc_queue'), [], t('empty_waiting'));
  }
}
const roomType = (id) => (id === 'lead' ? 'ceo' : id === 'eng' ? 'eng' : 'team');
const roomStatus = (s) => (s && s.waiting ? 'waiting' : s && s.working ? 'working' : 'idle');
/** شاشات غرفة المهندسين: خط البناء، آخر الطلبات، والأرقام */
function engScreens(small) {
  const e = engCounts();
  const v = (x) => (e.loaded ? fmt(x) : '—');
  if (small) return [{ type: 'kpis', title: t('os_sc_kpis'), items: [{ label: t('os_sc_open'), value: v(e.open) }, { label: t('rs_review'), value: v(e.review) }] }];
  const tone = { needs_you: 'wait', review: 'wait', working: 'work', done: 'ok' };
  const rows = arr(app.requests).slice(0, 4).map((r) => ({ text: osClip(r.title, 34), meta: t(`rs_${REQ_STATUSES.includes(r.status) ? r.status : 'sent'}`), tone: tone[r.status] }));
  return [
    { type: 'flow', title: t('os_sc_pipeline'), steps: [0, 1, 2, 3].map((i) => t(`os_f_eng_${i}`)) },
    { type: 'list', title: t('os_sc_latest'), rows, empty: e.loaded ? t('os_sc_none') : app.reqErr ? osClip(app.reqErr.msg, 40) : appCanLoad() ? t('loading') : '—' },
    { type: 'kpis', title: t('os_sc_kpis'), items: [{ label: t('rs_working'), value: v(e.working) }, { label: t('rs_needs_you'), value: v(e.needs_you) }, { label: t('rs_review'), value: v(e.review) }, { label: t('rs_done'), value: v(e.done) }] },
  ];
}
function osRoom(id, rs, o, small, people) {
  const room = { id, label: id === 'eng' ? t('os_s_eng') : t(`sign_${id}`), type: roomType(id), people, status: roomStatus(rs[id]) };
  if (id === 'lead') room.vision = t('os_vision'); // لوحة «الرؤية» بغرفة المدير
  if (id === 'eng') room.screens = engScreens(small);
  else if (small) room.screens = [{ type: 'kpis', title: t('os_sc_kpis'), items: kpiItems(id, o, 2) }];
  else room.screens = [{ type: 'kpis', title: t('os_sc_kpis'), items: kpiItems(id, o, 4) }, chartScreen(id, o), listScreen(id, o)].filter(Boolean);
  return room;
}
/** خطة الشريحة لـ scene.show(): المقر = ٦ أدوار (فريق بكل دور)، والفريق = دور لكل مكتب */
function buildPlan(sid, rs, o) {
  const plan = { key: sid, kind: sid === 'hq' ? 'hq' : 'team', lang: state.lang, roof: { title: t(`os_roof_${sid}`), icon: OS_SLIDE[sid].icon } };
  if (sid === 'hq') {
    plan.floors = OS_TEAMS.map((team) => {
      const rooms = teamRooms(team.id);
      const people = rooms.length === 1 ? (team.id === 'ceo' ? 1 : 2) : rooms.length === 2 ? 2 : 1;
      return { id: team.id, label: t(`os_s_${team.id}`), rooms: rooms.map((r) => osRoom(r, rs, o, true, people)) };
    });
  } else if (sid === 'ceo') plan.floors = [{ id: 'lead', label: t('os_room_ceo'), rooms: [osRoom('lead', rs, o, false, 1)] }];
  else if (sid === 'eng') plan.floors = [{ id: 'eng', label: t('os_s_eng'), rooms: [osRoom('eng', rs, o, false, 3)] }];
  else plan.floors = OS_SLIDE[sid].desks.map((d) => ({ id: d, label: t(`sign_${d}`), rooms: [osRoom(d, rs, o, false, 3)] }));
  return plan;
}
const planRooms = (plan) => (plan ? plan.floors.flatMap((f) => f.rooms.map((r) => r.id)) : []);

// ---------- البطاقات (عمود النص) ----------
/** تبويب «التطبيق»: نموذج طلب جديد أو قائمة الطلبات */
function openApp(where) {
  showTop('app');
  const sec = $('reqSec');
  const target = where === 'form' ? $('reqFTitle') : sec && sec.querySelector('.req-list');
  if (!target) return;
  target.scrollIntoView({ behavior: smooth(), block: where === 'form' ? 'center' : 'start' });
  const f = where === 'form' ? target : target.querySelector('button:not(:disabled), a[href]');
  (f || $('topApp')).focus({ preventScroll: true });
}
/** رقم الدور بخانتين: أعلى دور = العدد، وأسفل دور = ٠١ */
const floorNo = (i, n) => String(n - i).padStart(2, '0');
function heroCards(sid, rs, o) {
  if (sid === 'hq') {
    // المهندسين: الطلبات تتحمّل لما تفتح شريحتهم (أو تبويب «التطبيق») — قبلها «—» مو «هادي»
    const engOff = !engCounts().loaded;
    // رقم الدور (٠٦ فوق … ٠١ تحت) نفس أرقام الأدوار جنب المبنى — بالجوال الأرقام بس جنب المبنى والأسماء هنا
    return OS_TEAMS.map((team, i) => {
      const chip = team.id === 'eng' && engOff ? textChip('idle', '—') : stateChip(teamState(team.id, rs));
      const fl = floorNo(i, OS_TEAMS.length);
      return { id: team.id, icon: team.icon, title: t(`os_s_${team.id}`), num: fl, desc: t(`os_cd_${team.id}`), chip,
        label: `${t('os_open_team', { name: t(`os_s_${team.id}`) })} · ${t('os_floor_n', { n: fl })} · ${chip.textContent}`, onClick: () => { setSlide(team.id); focusSlide(); } };
    });
  }
  if (sid === 'ceo') {
    const st = rs.lead;
    const working = DESKS.reduce((a, d) => a + num(rs[d.id].working), 0);
    const oldest = get(o, 'office.oldest_waiting_at');
    const brief = arr(state.tasks).filter((x) => x.kind === 'daily_brief' && isObj(x.output)).sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))[0];
    const run = state.run && state.run.desk === 'lead' && (state.run.phase === 'queued' || state.run.phase === 'waiting');
    const lead = () => selectDesk('lead');
    return [
      { id: 'ceo-wait', icon: 'target', title: t('os_ceo_wait'), desc: t('os_ceo_wait_d'), chip: st.waiting ? stateChip({ waiting: st.waiting }) : stateChip({}), onClick: lead },
      { id: 'ceo-work', icon: 'users', title: t('os_ceo_work'), desc: t('os_ceo_work_d'), chip: stateChip({ working }), onClick: lead },
      { id: 'ceo-old', icon: 'clock', title: t('os_ceo_old'), desc: t('os_ceo_old_d'), chip: oldest ? textChip('wait', ago(oldest)) : textChip('idle', t('v_none')), onClick: lead },
      { id: 'ceo-brief', icon: 'sparkles', title: t('os_ceo_brief'), desc: t('os_ceo_brief_d'),
        chip: run ? textChip('work', t('st_in_progress')) : brief ? textChip('ok', t('os_ceo_brief_ready', { t: ago(brief.created_at) })) : textChip('plain', t('os_ceo_brief_run')),
        onClick: () => { selectDesk('lead'); if (canAct()) runAgent('lead'); } },
    ];
  }
  if (sid === 'eng') {
    const e = engCounts();
    // ما انحمّلت: «…» وهي تتحمّل، و«—» لو ما فيه اتصال أو فشلت
    const none = () => textChip('idle', !app.reqErr && appCanLoad() ? '…' : '—');
    const cnt = (x, key, cls) => (!e.loaded ? none() : x ? textChip(cls, t(key, { n: fmt(x) })) : stateChip({}));
    return [
      { id: 'eng-new', icon: 'pen', title: t('os_eng_new'), desc: t('os_eng_new_d'), chip: textChip('plain', t('os_eng_new_go')), onClick: () => openApp('form') },
      { id: 'eng-build', icon: 'code', title: t('os_eng_build'), desc: !e.loaded && app.reqErr ? osClip(app.reqErr.msg, 90) : t('os_eng_build_d'), chip: e.loaded && e.needs_you ? textChip('wait', `${t('rs_needs_you')} · ${fmt(e.needs_you)}`) : cnt(e.working, 'os_c_work', 'work'), onClick: () => openApp('list') },
      { id: 'eng-review', icon: 'eye', title: t('os_eng_review'), desc: t('os_eng_review_d'), chip: cnt(e.review, 'os_c_wait', 'wait'), onClick: () => openApp('list') },
      { id: 'eng-done', icon: 'merge', title: t('os_eng_done'), desc: t('os_eng_done_d'), chip: cnt(e.done, 'os_eng_n', 'ok'), onClick: () => openApp('list') },
    ];
  }
  return OS_SLIDE[sid].desks.map((d) => ({ id: d, icon: DESK[d].icon, title: t(`sign_${d}`), desc: t(`os_cd_${d}`), chip: stateChip(rs[d]), sel: state.desk === d,
    label: roomLabel(d, rs[d], [t(`sign_${d}`)]), onClick: () => selectDesk(d) }));
}
/** وش تبرّز كل بطاقة بالمبنى: المقر = غرف الفريق ووسم دوره، الفريق = غرفة المكتب، المدير/المهندسين = غرفتهم */
let osCardHot = [];
let osCardHov = -1, osCardFoc = -1; // البطاقة تحت الماوس والمركّزة
/** المرور على بطاقة (أو التركيز عليها بالكيبورد: why = 'f') يبرّز خطها ولافتات غرفها */
function hiLink(i, on, why) {
  if (why === 'f') osCardFoc = on ? i : osCardFoc === i ? -1 : osCardFoc;
  else osCardHov = on ? i : osCardHov === i ? -1 : osCardHov;
  syncHot();
}
/** تركيز بالكيبورد (مو ضغطة ماوس) */
const focusRing = (el) => { try { return el.matches(':focus-visible'); } catch (e) { return true; } };
function syncHot() {
  const on = [osCardHov, osCardFoc].filter((i) => i >= 0);
  osHot = new Set(on.flatMap((i) => osCardHot[i] || []));
  for (const p of $('osLinks').querySelectorAll('.os-link')) p.classList.toggle('on', on.includes(Number(p.id.replace('os-link-', ''))));
  for (const el of $('signs').querySelectorAll('[data-hot]')) el.classList.toggle('hot', osHot.has(el.dataset.hot));
}
function renderCards(sid, rs, o) {
  const keep = focusState();
  const list = heroCards(sid, rs, o);
  osCardHot = list.map((c) => (sid === 'hq' ? [...teamRooms(c.id), `f:${c.id}`] : sid === 'ceo' || sid === 'eng' ? teamRooms(sid) : [c.id]));
  $('osCards').classList.toggle('many', list.length > 4);
  put($('osCards'), list.map((c, i) => h('button', { type: 'button', class: `os-card${c.sel ? ' sel' : ''}`, id: `os-card-${c.id}`, 'aria-pressed': c.sel === undefined ? null : String(!!c.sel),
    'aria-label': c.label ? `${c.label} — ${c.desc}` : null, onclick: c.onClick,
    onmouseenter: () => hiLink(i, true), onmouseleave: () => hiLink(i, false), onfocus: (e) => hiLink(i, focusRing(e.currentTarget), 'f'), onblur: () => hiLink(i, false, 'f') },
  h('span', { class: 'os-card-ic' }, icon(c.icon)),
  h('span', { class: 'os-card-m' }, h('span', { class: 'os-card-t' }, c.num ? h('b', { class: 'os-card-n num', text: c.num }) : null, c.title), h('span', { class: 'os-card-d', text: c.desc })),
  c.chip)));
  // البطاقات انرسمت من جديد: التبريز للي تحت الماوس أو المركّزة الحين بس
  const cards = [...$('osCards').children];
  osCardHov = cards.findIndex((c) => c.matches(':hover'));
  restoreFocus(keep);
  osCardFoc = cards.findIndex((c) => c === document.activeElement && focusRing(c));
  osHot = new Set([osCardHov, osCardFoc].filter((i) => i >= 0).flatMap((i) => osCardHot[i] || []));
}

// ---------- الشريط والعنوان وخط سير العمل والأرقام ----------
function renderStrip(rs) {
  const i = OS_SLIDES.findIndex((s) => s.id === state.slide);
  const box = $('osChips');
  box.setAttribute('aria-label', t('os_slides'));
  const keep = focusState();
  put(box, OS_SLIDES.map((s) => {
    const w = s.id === 'hq' ? 0 : teamState(s.id, rs).waiting;
    const name = t(`os_s_${s.id}`);
    return h('button', { type: 'button', class: 'os-tab', id: `os-tab-${s.id}`, 'aria-current': s.id === state.slide ? 'true' : null,
      'aria-label': w ? `${name} · ${t('os_c_wait', { n: fmt(w) })}` : name, onclick: () => setSlide(s.id) },
    icon(s.icon, 'sm'), h('span', { class: 'os-tab-l', text: name }), w ? h('span', { class: 'os-tab-b num', 'aria-hidden': 'true', text: w > 99 ? '99+' : fmt(w) }) : null);
  }));
  restoreFocus(keep);
  const prev = $('osPrev'), next = $('osNext');
  prev.replaceChildren(icon('arrowStart', 'sm flip')); next.replaceChildren(icon('arrowEnd', 'sm flip'));
  prev.setAttribute('aria-label', t('os_prev')); prev.title = t('os_prev');
  next.setAttribute('aria-label', t('os_next')); next.title = t('os_next');
  $('osCount').textContent = t('os_count', { n: fmt(i + 1), m: fmt(OS_SLIDES.length) });
}
/** الشريحة الحالية تبان داخل الشريط (يتمرر لحاله بالجوال) */
function revealTab() {
  const box = $('osChips'), b = $(`os-tab-${state.slide}`);
  if (!box || !b || box.scrollWidth <= box.clientWidth) return;
  const cr = box.getBoundingClientRect(), br = b.getBoundingClientRect();
  if (br.left < cr.left) box.scrollLeft -= cr.left - br.left + 12;
  else if (br.right > cr.right) box.scrollLeft += br.right - cr.right + 12;
}
function renderCopy(sid) {
  const a = t(`os_h_${sid}_a`), b = t(`os_h_${sid}_b`), c = t(`os_h_${sid}_c`);
  const tail = /^[.\s]*$/.test(c); // نقطة بس: تلحق الكلمة الملوّنة بنفس السطر
  // كلمتين قصار بسطر واحد مثل ملصق المدير («THE CEO.»، «THE ARQ») — العنوان أقصر والبطاقات تبان كلها
  const join = Array.from(`${a}${b}`).length <= 7;
  put($('osTitle'), join ? null : h('span', { class: 'os-h-a', text: a }), h('span', { class: 'os-h-b' }, join ? `${a} ` : null, h('em', { text: b }), tail ? c : null), tail ? null : h('span', { class: 'os-h-c', text: c }));
  put($('osTag'), h('span', { text: t(`os_t_${sid}_a`, { n: fmt(DESKS.length) }) }), ' ', h('span', { class: 'os-tag-b', text: t(`os_t_${sid}_b`) }));
}
const OS_FLOW = {
  hq: ['sparkles', 'clock', 'check', 'rocket'], ceo: ['eye', 'target', 'users', 'trend'], partners: ['inbox', 'scan', 'check', 'userPlus'],
  ops: ['calendar', 'clock', 'play', 'chart'], community: ['flag', 'filter', 'wrench', 'archive'], growth: ['bulb', 'pen', 'check', 'send', 'chart'], eng: ['inbox', 'code', 'eye', 'merge'],
};
/** رقم حي اختياري لكل خطوة: { n, tone } */
function flowCounts(sid, rs, o) {
  const has = !!state.data;
  const c = (v, tone) => (has && typeof v === 'number' ? { n: v, tone } : null);
  const team = sid === 'hq' || sid === 'eng' ? null : teamState(sid, rs);
  const working = DESKS.reduce((a, d) => a + num(rs[d.id].working), 0);
  switch (sid) {
    case 'hq': return [c(working, 'work'), c(rs.lead.waiting, 'wait')];
    case 'ceo': return [null, c(rs.lead.waiting, 'wait')];
    case 'partners': return [c(n(o, 'partners.pending_total')), c(team.working, 'work'), c(team.waiting, 'wait')];
    case 'ops': return [c(n(o, 'bookings.venue_bookings.created.cur')), c(arr(get(o, 'bookings.attention')).length, 'work')];
    case 'community': return [c(n(o, 'reports.by_status.new'), 'wait'), c(n(o, 'reports.by_status.seen'), 'work'), c(n(o, 'reports.by_status.fixed'), 'ok')];
    case 'growth': return [null, c(team.working, 'work'), c(team.waiting, 'wait'), c(n(o, 'marketing.nudges.cur')), c(n(o, 'marketing.ad_stats.cur.views'))];
    case 'eng': { const e = engCounts(); return e.loaded ? [{ n: e.sent }, { n: e.working, tone: 'work' }, { n: e.review, tone: 'wait' }, { n: e.done, tone: 'ok' }] : []; }
    default: return [];
  }
}
/** سهم طويل رفيع بين الخطوات (مثل المرجع) — ينعكس بالعربي */
function longArrow() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 24');
  svg.setAttribute('class', 'ic flip');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M2 12h31M27.5 6.5 33 12l-5.5 5.5');
  svg.append(p);
  return svg;
}
function renderFlow(sid, rs, o) {
  const counts = flowCounts(sid, rs, o);
  put($('osFlow'), h('ol', { class: 'os-steps' }, OS_FLOW[sid].map((ic, i) => {
    const c = counts[i];
    return h('li', { class: 'os-step' }, i ? h('span', { class: 'os-arr', 'aria-hidden': 'true' }, longArrow()) : null,
      icon(ic), h('span', { class: 'os-step-l', text: t(`os_f_${sid}_${i}`) }), c ? h('b', { class: `os-step-n num${c.tone ? ` ${c.tone}` : ''}`, text: fmt(c.n) }) : null);
  })));
}
function renderFoot(rs, o) {
  put($('legend'), [['wait', 'legend_wait'], ['work', 'legend_work'], ['alert', 'legend_alert'], ['idle', 'legend_idle']].map(([k, key]) => h('span', { class: `os-lg ${k}` }, h('i'), t(key))));
  const v3 = $('view3d'), vg = $('viewGrid');
  v3.replaceChildren(icon('cube', 'sm'), h('span', { text: '3D' }));
  vg.replaceChildren(icon('grid', 'sm'), h('span', { text: '2D' }));
  v3.setAttribute('aria-label', `3D — ${t('view_3d')}`); v3.title = t('view_3d');
  vg.setAttribute('aria-label', `2D — ${t('view_grid')}`); vg.title = t('view_grid');
  v3.setAttribute('aria-pressed', String(show3d())); vg.setAttribute('aria-pressed', String(!show3d()));
  v3.disabled = !state.can3d;
  $('viewTg').setAttribute('aria-label', `${t('view_3d')} / ${t('view_grid')}`);
  const working = DESKS.reduce((a, d) => a + num(rs[d.id].working), 0);
  const oldest = get(o, 'office.oldest_waiting_at');
  put($('stageFoot'),
    h('span', { class: 'os-stat wait' }, h('b', { class: 'num', text: fmt(rs.lead.waiting) }), t('sum_waiting')),
    h('span', { class: 'os-stat work' }, h('b', { class: 'num', text: fmt(working) }), t('sum_working')),
    oldest ? h('span', { class: 'os-stat' }, h('b', { class: 'txt', text: ago(oldest) }), t('sum_oldest')) : null,
    h('span', { class: 'os-stat' }, h('b', { class: 'num', text: fmt(n(o, 'ai.office_tasks_today')) }), t('sum_today_tasks')));
  $('osVerA').textContent = t('os_ver_a');
  $('osVerB').textContent = t('os_ver_b');
  const today = [
    ['k_signups', 'activity.signups.today'], ['k_checkins', 'activity.checkins.today'], ['k_workouts', 'activity.workouts.today'],
    ['k_vbookings', 'bookings.venue_bookings.created.today'], ['k_messages', 'community.chats.messages.today'], ['k_errors', 'activity.errors.today'],
  ];
  put($('todayStrip'), h('h3', { class: 'os-today-t', id: 'todayT', text: t('today_so_far') }),
    h('div', { class: 'os-today-g' }, today.map(([k, path]) => h('div', { class: `os-today-i${path === 'activity.errors.today' && n(o, path) > 0 ? ' hot' : ''}` },
      h('b', { class: 'num', text: state.data ? fmt(n(o, path)) : '—' }), h('span', { text: t(k) })))));
}

// ---------- المبنى: المشهد ثلاثي الأبعاد أو المسطّح ----------
let heroPlan = null;
let osPlanSig = '';
/** خط سقف الفتحة الأمامية لكل دور على الشاشة (من floors()): الحافة جهة النص = زاوية الواجهة عند الجدار المصمت، والمستطيل
 * = حدود الفتحة. الخط مايل بالمنظور: لو زاوية جهة النص هي الأعلى فأعلى كل غرفة (rooms) هو زاويتها جهة النص، وإلا نقيس
 * على الخط من الحافة لأعلى المستطيل بالجهة البعيدة */
function floorLines(floors, rtl) {
  const side = rtl ? 'r' : 'l';
  const ok = (e) => Array.isArray(e) && e.length >= 4 && e.every(Number.isFinite);
  return floors.map((f) => {
    const e = f && f.edge && f.edge[side], r = f && f.rect;
    if (!ok(e) || !r || ![r.left, r.top, r.w, r.h].every(Number.isFinite)) return null;
    const xFar = rtl ? r.left : r.left + r.w;
    const copyTop = e[1] <= r.top + 1;
    return { yAt: (x, roomTop) => (copyTop ? roomTop : e[1] + ((r.top - e[1]) * (x - e[0])) / (xFar - e[0] || 1)) };
  });
}
/** محتوى اللافتة لدرجة «v» من درجات التصغير: { name, worded, icon, xs, corner, tiny } */
function fillPlate(p, v) {
  const name = h('span', { class: 'os-pl-t', text: p.names[Math.min(v.name, p.names.length - 1)] });
  p.el.classList.toggle('xs', !!v.xs);
  p.el.classList.toggle('corner', !!v.corner);
  p.el.classList.toggle('tiny', !!v.tiny);
  put(p.el, v.icon ? icon(plateIcon(p.id), 'os-pl-ic') : null, name, plateChip(p.ps, v.worded));
  p.name = name;
}
/** درجات اللافتة من الأوضح للأصغر: الفريق = الاسم الكامل بحالة مكتوبة ← القصير ← الرقم بس ← بدون أيقونة ← أصغر؛
 * المقر = القصير بالرقم ← بدون أيقونة ← أصغر. آخرها: الرقم شارة تحت زاوية اللافتة والاسم ياخذ العرض كله (ويصغر شوي
 * لو لازم). بعدها «…» من CSS (اللافتة ما تطلع عن عرض غرفتها أبد) */
function plateSteps(kind, names) {
  const xs = { name: 1, worded: false, icon: false, xs: true };
  const tail = [xs, Object.assign({}, xs, { corner: true }), Object.assign({}, xs, { corner: true, tiny: true })];
  if (kind === 'hq') return [{ name: 0, worded: false, icon: true }, { name: 0, worded: false, icon: false }, ...tail];
  const steps = [{ name: 0, worded: true, icon: true }];
  if (names.length > 1) steps.push({ name: 1, worded: true, icon: true });
  steps.push({ name: 1, worded: false, icon: true }, { name: 1, worded: false, icon: false }, ...tail);
  return steps;
}
/** نقيس كل اللافتات مرة وحدة بكل درجة (قراءة بعد كتابة الكل = حساب تخطيط واحد بكل درجة). بعدها كل لافتات الشريحة
 * تاخذ نفس الدرجة (أصغر وحدة احتاجتها) عشان المبنى كله يبان بنفس الشكل: نفس المقاس، والأيقونات كلها أو ولا وحدة */
function fitPlates(plates) {
  let left = plates.filter((p) => p.el.isConnected);
  for (let step = 0; left.length; step++) {
    for (const p of left) { p.step = Math.min(step, p.steps.length - 1); fillPlate(p, p.steps[p.step]); }
    left = left.filter((p) => step < p.steps.length - 1 && (p.name.scrollWidth > p.name.clientWidth + 0.5 || p.el.scrollWidth > p.el.clientWidth + 0.5));
  }
  const top = Math.max(0, ...plates.map((p) => p.step || 0));
  for (const p of plates) if (p.el.isConnected && (p.step || 0) < top) { p.step = Math.min(top, p.steps.length - 1); fillPlate(p, p.steps[p.step]); }
}
/** أرقام الأدوار وأسماء الفرق (المقر بس): عمود على الجهة البعيدة (عكس عمود النص) برا المبنى، بخط قصير لحافة كل دور
 * عند ربعها العلوي (بعيد عن النباتات اللي تحت). كل الوسوم بنفس الشكل: الاسم كامل ← خط أصغر ← الرقم بس (الجوال والشاشة
 * الضيقة الطويلة — الاسم بالبطاقة اللي فيها نفس الرقم). ما ينقص اسم أبد، وما يغطي غرفة لأنه برا المبنى */
function floorTags(box, plan, floors, rtl, stageW) {
  if (plan.kind !== 'hq' || floors.length !== plan.floors.length) return;
  const far = rtl ? 'l' : 'r';
  const ok = (e) => Array.isArray(e) && e.length >= 4 && e.every(Number.isFinite);
  const es = floors.map((f) => f && f.edge && f.edge[far]);
  if (!es.every(ok)) return;
  const at = es.map((e) => ({ x: e[0] + (e[2] - e[0]) / 4, y: e[1] + (e[3] - e[1]) / 4 }));
  const outer = rtl ? Math.min(...at.map((a) => a.x)) : Math.max(...at.map((a) => a.x));
  const room = (rtl ? outer : stageW - outer) - 4;
  const bw = Math.max(...floors.map((f) => (f && f.rect ? f.rect.w : 0)));
  const gapMax = Math.max(22, Math.min(52, bw * 0.1));
  const n = plan.floors.length;
  const tags = plan.floors.map((f, i) => h('span', { class: `os-ftag${osHot.has(`f:${f.id}`) ? ' hot' : ''}`, id: `os-ftag-${f.id}`, dir: rtl ? 'rtl' : 'ltr', 'aria-hidden': 'true', 'data-hot': `f:${f.id}`,
    style: { top: `${Math.round(at[i].y)}px`, [rtl ? 'right' : 'left']: `${Math.round(rtl ? stageW - at[i].x : at[i].x)}px` } },
  h('i', { class: 'os-ftag-ln' }), h('b', { class: 'os-ftag-n num', text: floorNo(i, n) }), h('span', { class: 'os-ftag-t', text: f.label })));
  box.append(...tags);
  // أعرض وسم: المسافة بعد الخط + الرقم (+ المسافة والاسم لو ظاهر)؛ والخط من حافة المبنى للعمود = gap
  const need = () => Math.max(...tags.map((el) => {
    const nb = el.children[1], tt = el.children[2], sp = parseFloat(getComputedStyle(el).columnGap) || 0;
    return sp + nb.getBoundingClientRect().width + (getComputedStyle(tt).display === 'none' ? 0 : sp + tt.scrollWidth);
  }));
  let gap = -1;
  for (const [mode, min] of [['', 22], ['tight', 14], ['nums', 6]]) {
    for (const el of tags) { el.classList.toggle('tight', mode === 'tight'); el.classList.toggle('nums', mode === 'nums'); }
    const g = Math.min(gapMax, room - need());
    if (g >= min) { gap = g; break; }
  }
  if (gap < 0) { for (const el of tags) el.remove(); return; }
  const col = rtl ? outer - gap : outer + gap;
  tags.forEach((el, i) => { el.firstChild.style.width = `${Math.round(Math.abs(at[i].x - col))}px`; });
}
/** مستطيلات الغرف تتداخل عند البلاطة (الأرضية مايلة بالمنظور): اللافتة تنزل تحت أسفل أي غرفة فوقها بعرضها هي (بعد ما
 * انعرف مقاسها) — عشان ما تاخذ ضغطة الغرفة اللي فوق، وما تنزل لنص غرفتها */
function dropPlates(plates, plan, rects) {
  const box = $('signs').getBoundingClientRect();
  const spans = plates.map((p) => { const b = p.el.getBoundingClientRect(); return [b.left - box.left, b.right - box.left]; });
  plates.forEach((p, i) => {
    if (!p.fi || !p.el.isConnected) return;
    let y = p.y;
    for (const up of plan.floors[p.fi - 1].rooms) {
      const u = rects[up.id];
      if (u && u.w > 0 && u.left < spans[i][1] && u.left + u.w > spans[i][0]) y = Math.max(y, u.top + u.h);
    }
    y = Math.min(y, p.r.top + p.r.h * 0.3);
    if (y > p.y + 0.5) p.el.style.top = `${Math.round(y - p.r.top)}px`;
  });
}
/** اللافتات المبرّزة (بطاقتها تحت الماوس أو مركّزة): معرّفات غرف، و«f:فريق» = وسم دوره */
let osHot = new Set();
/** غرف الشريحة الحالية: أزرار شفافة فوق غرف المشهد (تركيز + لافتة باسم القسم وحالته) + أرقام الأدوار وأسماء الفرق بالمقر */
function renderHits(rs) {
  const box = $('signs');
  if (!osScene || !show3d() || !heroPlan) { box.replaceChildren(); return; }
  rs = rs || roomStates(deskStates());
  let rects = {}, floors = [];
  try {
    rects = Object.fromEntries(arr(osScene.rooms()).filter((r) => r && r.id).map((r) => [r.id, r]));
    floors = arr(osScene.floors());
  } catch (e) { fail3d(e); return; }
  const keep = focusState();
  const plan = heroPlan;
  const kind = plan.kind === 'hq' ? 'hq' : 'team';
  // التحديد بالمقر ما له معنى (ضغطة الغرفة تفتح شريحة فريقها): بس بشرائح الفرق اللي فيها أكثر من غرفة
  const multi = kind === 'team' && planRooms(plan).length > 1;
  const rtl = document.documentElement.dir === 'rtl';
  const lines = floorLines(floors, rtl);
  const stageW = box.clientWidth || $('stage').clientWidth;
  const ok = (r) => r && r.w > 0 && r.h > 0;
  const plates = [];
  const hits = [];
  plan.floors.forEach((f, fi) => f.rooms.forEach((room) => {
    const id = room.id;
    const r = rects[id];
    if (!ok(r)) return;
    const s = rs[id] || {};
    const sel = state.desk === id;
    // اللافتة معلّقة تحت البلاطة بزاوية الغرفة جهة النص: أعلاها على خط السقف المايل (مو فوق البلاطة) — كلها داخل
    // غرفتها، فما تاخذ ضغطة الغرفة اللي فوقها، وعرضها ما يتعدّى الغرفة
    const l = lines[fi];
    const inset = r.w < 60 ? 1 : r.w < 90 ? 3 : 6;
    const cx = rtl ? r.left + r.w - inset : r.left + inset;
    const y = Math.min(Math.max(l ? l.yAt(cx, r.top) : r.top, r.top), r.top + r.h * 0.3);
    const el = h('span', { class: `os-plate ${kind}${multi && sel ? ' sel' : ''}${osHot.has(id) ? ' hot' : ''}`, dir: rtl ? 'rtl' : 'ltr', 'aria-hidden': 'true', 'data-hot': id,
      style: { top: `${Math.round(y - r.top)}px`, maxWidth: `${Math.max(0, Math.floor(r.w - 2 * inset))}px`, [rtl ? 'right' : 'left']: `${inset}px` } });
    const names = plateNames(id, kind);
    plates.push({ el, id, r, y, fi, names, ps: plateState(id, s), steps: plateSteps(kind, names) });
    hits.push(h('button', { type: 'button', class: `os-hit${sel ? ' sel' : ''}`, id: `desk-${id}`, 'aria-pressed': String(sel), 'aria-label': roomLabel(id, s, names),
      style: { left: `${Math.round(r.left)}px`, top: `${Math.round(r.top)}px`, width: `${Math.round(r.w)}px`, height: `${Math.round(r.h)}px` }, onclick: () => roomClick(id) }, el));
  }));
  put(box, hits);
  fitPlates(plates);
  dropPlates(plates, plan, rects);
  floorTags(box, plan, floors, rtl, stageW);
  restoreFocus(keep);
}
/** المبنى المسطّح (بدون WebGL أو بزر 2D): نفس الخطة كصفوف وغرف */
function renderFlat(plan, rs, loading) {
  const g = $('grid2d');
  const keep = focusState();
  const hq = plan.kind === 'hq';
  // غرفة وحدة (المدير، المهندسين): غرفة طويلة فيها كل الأرقام + خط البناء + القائمة (بدل شريط رفيع بنص فراغ)
  const single = plan.floors.length === 1 && plan.floors[0].rooms.length === 1;
  const kpi = (it) => h('span', { class: 'os-cell-k' }, h('span', { text: it.label }),
    // رقم = كبير بخط الأرقام، ونص («مو شغّالة للحين») = أصغر بخط الواجهة
    h('b', { class: /^[\d\s.,%+−\-—KMB]+$/.test(str(it.value)) ? 'num' : 'txt', text: it.value }));
  const extra = (r) => {
    if (!single) return null;
    const flow = r.screens.find((x) => x.type === 'flow');
    const list = r.screens.find((x) => x.type === 'list');
    return [
      flow ? h('span', { class: 'os-cell-flow' }, arr(flow.steps).map((st, i) => h('span', { class: 'os-cell-step' }, i ? h('i', { 'aria-hidden': 'true', text: state.lang === 'ar' ? '←' : '→' }) : null, st))) : null,
      list ? h('span', { class: 'os-cell-list' }, h('span', { class: 'os-cell-lt', text: list.title }),
        arr(list.rows).length ? arr(list.rows).slice(0, 4).map((x) => h('span', { class: `os-cell-row ${x.tone || ''}` }, h('i'), h('span', { class: 'os-cell-rt', text: x.text }), x.meta ? h('span', { class: 'os-cell-rm', text: x.meta }) : null))
          : h('span', { class: 'os-cell-rm', text: list.empty || '—' })) : null,
    ];
  };
  // نفس كلام لافتات المشهد: المقر = الاسم القصير والرقم، والفريق = الاسم الكامل والحالة مكتوبة («٢ ينتظرك»)؛
  // الفريق بالجوال (غرفة لكل دور) = القصير مثل لافتات المشهد لما تضيق
  const kind = hq ? 'hq' : 'team';
  const narrow = !hq && !single && matchMedia('(max-width: 560px)').matches;
  const cell = (r) => {
    const s = rs[r.id] || {};
    const k = r.screens.find((x) => x.type === 'kpis');
    const lines = k ? arr(k.items).slice(0, single ? 4 : hq ? 1 : 2) : [];
    const alert = r.status === 'idle' && num(s.alert) > 0;
    const ps = plateState(r.id, s);
    const names = plateNames(r.id, kind);
    return h('button', { type: 'button', class: `os-cell ${r.status}${alert ? ' alert' : ''}${state.desk === r.id ? ' sel' : ''}`, id: `desk-${r.id}`, 'aria-pressed': String(state.desk === r.id), 'aria-label': roomLabel(r.id, s, names), onclick: () => roomClick(r.id) },
      h('span', { class: 'os-cell-h' }, icon(plateIcon(r.id), 'os-cell-ic'), h('span', { class: 'os-cell-l', text: names[narrow ? names.length - 1 : 0] }), plateChip(ps, !hq)),
      lines.length ? h('span', { class: 'os-cell-ks' }, lines.map(kpi)) : null,
      extra(r));
  };
  // ليش مسطّح: three.js يتحمّل، أو ما تحمّل (شبكة)، أو الجهاز ما يدعم/فقد WebGL
  const why = loading ? 'os_3d_loading' : state.can3d ? null : state.no3d === 'net' ? 'no3d_net' : state.no3d === 'lost' ? 'no3d_lost' : 'no3d';
  put(g, h('div', { class: `os-fb${hq ? ' hq' : ''}${single ? ' single' : ''}` },
    h('div', { class: 'os-fb-cube', 'aria-hidden': 'true' }, osMark()),
    h('div', { class: 'os-fb-roof' }, icon(plan.roof.icon), h('span', { text: plan.roof.title })),
    h('div', { class: 'os-fb-floors' }, plan.floors.map((f, i) => h('div', { class: 'os-fb-floor' },
      hq ? h('span', { class: 'os-fb-fl' }, h('b', { class: 'num', text: floorNo(i, plan.floors.length) }), h('span', { text: f.label })) : null,
      h('div', { class: 'os-fb-rooms' }, f.rooms.map(cell))))),
    h('div', { class: 'os-fb-base', 'aria-hidden': 'true' })),
  why ? h('p', { class: 'os-fb-note', text: t(why) }) : null);
  restoreFocus(keep);
}
/** شعار أرك: شيفرون A مع خط برتقالي */
function osMark() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, cls] of [['M4 20 12 4l8 16', 'a'], ['M7.9 14.2h8.2', 'b']]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('class', cls);
    svg.append(p);
  }
  return svg;
}
function sceneReady() { try { return !!osScene && osScene.ready() !== false; } catch (e) { return true; } }
/** شكل المبنى (للجوال: المسرح يطول مع الأدوار الكثيرة ويقصر مع الغرفة الوحدة) */
const planShape = (plan) => (plan.kind === 'hq' ? 'hq' : plan.floors.length >= 3 ? 'tall' : plan.floors.length === 2 ? 'mid' : 'wide');
function renderStageMode(plan, rs) {
  // three.js أو المشهد ما جهز بعد مهلة قصيرة (state.slow3d): نعرض المسطّح لين يجهز، بعدها نبدّل للـ 3D
  const loading = show3d() && !osScene && !!state.slow3d;
  const flat = !show3d() || loading;
  const g = $('grid2d');
  $('stage').dataset.shape = planShape(plan);
  g.hidden = !flat;
  $('stage').classList.toggle('flat', flat);
  $('cv').style.visibility = flat ? 'hidden' : 'visible';
  // «نجهّز المبنى…» لين يجهز المشهد (three.js يتحمّل، والخطوط وشاشات المبنى ما انرسمت للحين)
  const note = $('stageNote');
  note.hidden = flat || sceneReady();
  note.textContent = t('loading_3d');
  if (flat) renderFlat(plan, rs, loading); else g.replaceChildren();
}

/** الخطوط البرتقالية من البطاقات لحافة المبنى (جهة عمود النص) — بس بالشاشات العريضة مع 3D */
/** خط سير العمل تحت المبنى بالضبط (الشاشات العريضة): المبنى لاصق بجهة النص فنحسب نصّه من حواف الأدوار أو المبنى المسطّح */
function placeFlow(floors) {
  const fl = $('osFlow');
  const wide = matchMedia('(min-width: 1000px)').matches && state.top === 'office';
  const sr = $('stage').getBoundingClientRect();
  let x0 = Infinity, x1 = -Infinity;
  if (wide && show3d()) {
    for (const f of floors) for (const e of [f && f.edge && f.edge.l, f && f.edge && f.edge.r]) if (Array.isArray(e) && Number.isFinite(e[0]) && Number.isFinite(e[2])) { x0 = Math.min(x0, e[0], e[2]); x1 = Math.max(x1, e[0], e[2]); }
  } else if (wide) {
    const fb = document.querySelector('#grid2d .os-fb');
    if (fb) { const r = fb.getBoundingClientRect(); x0 = r.left - sr.left; x1 = r.right - sr.left; }
  }
  if (!(x1 > x0) || !sr.width) { fl.style.marginInlineStart = ''; return; }
  const fw = fl.getBoundingClientRect().width;
  const mid = document.documentElement.dir === 'rtl' ? sr.width - (x0 + x1) / 2 : (x0 + x1) / 2;
  fl.style.marginInlineStart = `${Math.round(Math.max(0, Math.min(sr.width - fw, mid - fw / 2)))}px`;
}
/** كل بطاقة بمستوى دورها (مثل الملصقات: الخطوط شبه أفقية) — بس لو بطاقة لكل دور. الزيادة تنزل البطاقات
 * (margin-top) بدون ما يطلع العمود تحت المسرح؛ ولو ما كفّت المسافة نقلّلها بنفس النسبة */
function alignCards(cards, floors, side) {
  const box = $('osCards');
  for (const c of box.children) if (c.style.marginTop) c.style.marginTop = '';
  if (cards.length < 2 || floors.length !== cards.length) return;
  const sr = $('stage').getBoundingClientRect();
  const rs = cards.map((c) => c.getBoundingClientRect());
  const ms = [];
  let shift = 0;
  cards.forEach((c, i) => {
    const e = floors[i] && floors[i].edge && floors[i].edge[side];
    const want = Array.isArray(e) && e.every(Number.isFinite) ? sr.top + (e[1] + e[3]) / 2 - rs[i].height / 2 : -Infinity;
    const m = Math.max(0, want - (rs[i].top + shift));
    ms.push(m);
    shift += m;
  });
  const room = sr.bottom - 8 - rs[rs.length - 1].bottom;
  const k = shift > room ? Math.max(0, room) / shift : 1;
  cards.forEach((c, i) => { const m = Math.round(ms[i] * k); if (m > 0) c.style.marginTop = `${m}px`; });
}
function drawLinks() {
  const svg = $('osLinks');
  const on = !!osScene && show3d() && !!heroPlan && state.top === 'office' && matchMedia('(min-width: 1000px)').matches;
  let floors = [];
  if (on) { try { floors = arr(osScene.floors()); } catch (e) { floors = []; } }
  placeFlow(floors);
  const cards = on ? [...$('osCards').children] : [];
  const rtl = document.documentElement.dir === 'rtl';
  const side = rtl ? 'r' : 'l';
  alignCards(cards, floors, side);
  if (!floors.length || !cards.length) { svg.replaceChildren(); return; }
  const sr = $('stage').getBoundingClientRect();
  const single = floors.length === 1;
  const lines = cards.map((c, i) => {
    const f = floors[Math.min(i, floors.length - 1)];
    const e = f && f.edge && f.edge[side];
    if (!Array.isArray(e) || e.length < 4 || !e.every(Number.isFinite)) return null;
    const k = single ? (i + 1) / (cards.length + 1) : 0.5;
    const r = c.getBoundingClientRect();
    const cy = r.top + r.height / 2 - sr.top;
    let ty = e[1] + (e[3] - e[1]) * k;
    // كوع صغير (أقل من ١٢ بكسل) يبان كأنه خط مكسور: لو مستوى البطاقة على حافة الدور نخليه مستقيم، وإلا كوع واضح
    const lo = Math.min(e[1], e[3]) + 4, hi = Math.max(e[1], e[3]) - 4;
    if (Math.abs(ty - cy) < 12) {
      if (cy >= lo && cy <= hi) ty = cy;
      else { const t2 = cy + (ty >= cy ? 12 : -12); if (t2 >= lo && t2 <= hi) ty = t2; }
    }
    const at = e[3] !== e[1] ? (ty - e[1]) / (e[3] - e[1]) : 0;
    return { i, cx: (rtl ? r.left : r.right) - sr.left, cy, tx: e[0] + (e[2] - e[0]) * at, ty };
  }).filter(Boolean);
  // الكوع: الخطوط النازلة تقرب من البطاقة كل ما نزلنا، والطالعة تبعد (عشان ما تتقاطع)
  const down = lines.filter((l) => l.ty > l.cy + 1), up = lines.filter((l) => l.ty < l.cy - 1);
  down.forEach((l, j) => { l.f = down.length > 1 ? 0.72 - (0.44 * j) / (down.length - 1) : 0.5; });
  up.forEach((l, j) => { l.f = up.length > 1 ? 0.28 + (0.44 * j) / (up.length - 1) : 0.5; });
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const x = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, v); return x; };
  const r1 = (v) => Math.round(v * 10) / 10;
  svg.replaceChildren(...lines.map((l) => {
    const ex = l.cx + (l.tx - l.cx) * (l.f === undefined ? 0.5 : l.f);
    const d = l.ty === l.cy ? `M${r1(l.cx)} ${r1(l.cy)}H${r1(l.tx)}` : `M${r1(l.cx)} ${r1(l.cy)}H${r1(ex)}V${r1(l.ty)}H${r1(l.tx)}`;
    return el('path', { class: `os-link${l.i === osCardHov || l.i === osCardFoc ? ' on' : ''}`, id: `os-link-${l.i}`, d });
  }), ...lines.map((l) => el('circle', { class: 'os-link-dot', cx: r1(l.tx), cy: r1(l.ty), r: 2.5 })));
}

/** يرسم الواجهة كلها ويبني الخطة ويعطيها للمشهد (المشهد يعيد رسم الشاشات بس لو نفس الغرف) */
function renderHero() {
  const keep = focusState();
  syncEng();
  const o = state.data || {};
  const rs = roomStates(deskStates());
  const sid = OS_SLIDE[state.slide] ? state.slide : 'hq';
  renderStrip(rs);
  renderCopy(sid);
  renderCards(sid, rs, o);
  renderFlow(sid, rs, o);
  renderFoot(rs, o);
  const plan = buildPlan(sid, rs, o);
  heroPlan = plan;
  if (osScene) {
    try {
      const sig = JSON.stringify(plan);
      if (sig !== osPlanSig) { osScene.show(plan); osPlanSig = sig; osLayoutFrames = 2; }
      const ids = planRooms(plan);
      // التحديد بس لو فيه أكثر من غرفة (المدير والمهندسين غرفة وحدة: الإطار البرتقالي ما يضيف شي)، وبالمقر لا
      // (ضغطة الغرفة هناك تفتح شريحة فريقها — إطار ثابت على المدير يتلخبط مع تبريز البطاقات)
      osScene.update(Object.fromEntries(ids.map((id) => [id, { waiting: num(rs[id] && rs[id].waiting), working: num(rs[id] && rs[id].working), alert: num(rs[id] && rs[id].alert) }])), plan.kind !== 'hq' && ids.length > 1 && ids.includes(state.desk) ? state.desk : null);
      kick();
    } catch (e) { fail3d(e); return; }
  }
  renderHits(rs);
  renderStageMode(plan, rs);
  drawLinks();
  restoreFocus(keep);
}
/** بيانات غرفة المهندسين: المعاينة من sample.json، والحي يتحمّل مرة لما تفتح شريحة المهندسين (ما نوقف الشريحة عليه) */
let engTry = 0;
function syncEng(force) {
  appSyncMode();
  // وهي ظاهرة: أول مرة، وبعدها مرة بالدقيقة بالكثير (مع تحديث المكتب) — ولو فشلت نعيد بعد دقيقة. force = زر «تحديث»
  if (state.top !== 'office' || state.slide !== 'eng' || app.isSample || app.reqLoading || !appCanLoad()) return;
  if (!force && Array.isArray(app.requests) && Date.now() - app.reqAt < REFRESH_MS) return;
  if (!force && engTry && Date.now() - engTry < REFRESH_MS) return;
  engTry = Date.now();
  loadRequests().then(() => { if (state.top === 'office') renderHero(); });
}

// ---------- التنقل ----------
let fadeTimer = 0;
/** يبدّل الشريحة بدون رسم (مع ظهور تدريجي ١٨٠ms، وبدونه مع تقليل الحركة). يرجّع true لو تغيّرت */
function switchSlide(id) {
  if (!OS_SLIDE[id] || state.slide === id) return false;
  state.slide = id;
  store('slide', id);
  if (!reducedMotion()) {
    const g = $('osGrid');
    g.classList.remove('os-in'); void g.offsetWidth; g.classList.add('os-in');
    clearTimeout(fadeTimer); fadeTimer = setTimeout(() => g.classList.remove('os-in'), 260);
  }
  return true;
}
function setSlide(id) {
  const changed = switchSlide(id);
  // فريق ما فيه المكتب المختار: نختار أول مكتب فيه (لوحة المكتب تحت تتبع الشريحة). المقر والمهندسين بدون مكاتب
  const desks = changed ? teamDesks(id) : [];
  if (desks.length && !desks.includes(state.desk)) { state.desk = desks[0]; store('desk', state.desk); renderAll(); }
  else renderHero();
  if (changed) revealTab();
}
/** بعد تبديل الشريحة من بطاقة: البطاقة انشالت والتركيز ضاع → أول بطاقة بالشريحة الجديدة */
function focusSlide() {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const c = $('osCards').querySelector('.os-card') || $(`os-tab-${state.slide}`);
  if (c) c.focus({ preventScroll: true });
}
function stepSlide(dir) {
  const i = OS_SLIDES.findIndex((s) => s.id === state.slide);
  setSlide(OS_SLIDES[(i + dir + OS_SLIDES.length) % OS_SLIDES.length].id);
}
/** ضغطة غرفة: بالمقر تفتح شريحة فريقها (وتختار المكتب)، وبالفريق تختار المكتب، والمهندسين يفتحون الطلبات */
function roomClick(id) {
  if (id === 'eng') { if (state.slide === 'hq') setSlide('eng'); else openApp('list'); return; }
  if (!DESK[id]) return;
  if (state.slide === 'hq') {
    state.desk = id; store('desk', id);
    switchSlide(teamOf(id));
    renderAll();
    revealTab();
    return;
  }
  selectDesk(id);
}

// ===================== لوحات الأقسام =====================
const AREA_OF = { lead: 'activity', activity: 'activity', bookings: 'bookings', orders: 'orders', community: 'community', clubs: 'partners', stores: 'partners', coaches: 'partners', care: 'partners', reports: 'reports', marketing: 'marketing', ai: 'ai' };
const AREA_DESK = { activity: 'activity', bookings: 'bookings', orders: 'orders', community: 'community', partners: 'clubs', reports: 'reports', marketing: 'marketing', ai: 'ai' };
const AREA_ICON = { partners: 'building' };

function areaBody(id, o) {
  const T = (k, v, extra) => tile(Object.assign({ k: t(k), v }, extra || {}));
  const ab = (path) => ({ v: n(o, `${path}.cur`), prev: n(o, `${path}.prev`) });
  switch (id) {
    case 'activity': return [
      h('div', { class: 'tiles' },
        T('k_users', n(o, 'activity.users.total'), { s: t('s_users', { a: fmt(n(o, 'activity.users.trainees')), b: fmt(n(o, 'activity.users.partners')) }) }),
        T('k_signups', n(o, 'activity.signups.cur'), { prev: n(o, 'activity.signups.prev'), series: get(o, 'activity.signups.daily') }),
        T('k_active', n(o, 'activity.active_users.cur'), { prev: n(o, 'activity.active_users.prev'), s: t('s_active'), series: get(o, 'activity.active_users.daily') }),
        T('k_checkins', n(o, 'activity.checkins.cur'), { prev: n(o, 'activity.checkins.prev'), s: t('s_checkins', { a: fmt(n(o, 'activity.checkins.today')), b: fmt(n(o, 'activity.checkins.present_now')) }), series: get(o, 'activity.checkins.daily') }),
        T('k_workouts', n(o, 'activity.workouts.cur'), { prev: n(o, 'activity.workouts.prev'), s: t('s_workouts', { a: fmt(n(o, 'activity.workouts.finished_cur')), b: fmt(n(o, 'activity.workouts.users_cur')) }) }),
        T('k_errors', n(o, 'activity.errors.cur'), { prev: n(o, 'activity.errors.prev'), dir: -1, s: t('s_errors', { a: fmt(n(o, 'activity.errors.users_cur')), b: fmt(n(o, 'activity.errors.today')) }), warn: n(o, 'activity.errors.today') > 0 })),
      h('div', { class: 'cols' },
        block(t('top_gyms'), bars(arr(get(o, 'activity.top_gyms')).map((g) => ({ label: gymName(g), n: num(g.n), title: `${gymName(g)} · ${fmt(num(g.users))}` })))),
        block(t('top_errors'), bars(arr(get(o, 'activity.errors.top')).map((e) => ({ label: str(e.kind), n: num(e.n), sub: '' })))),
        block(t('partner_intent'), [
          h('div', { class: 'small muted', text: `${fmt(n(o, 'activity.partner_intent.total'))} · ${t('s_intent', { a: fmt(n(o, 'activity.partner_intent.no_submission')) })}` }),
          bars(PARTNER_KINDS.map((k) => ({ label: t(`kind_${k}`), n: n(o, `activity.partner_intent.by_kind.${k}`) })))])),
    ];
    case 'bookings': {
      const vb = 'bookings.venue_bookings';
      return [
        h('div', { class: 'tiles' },
          T('k_vbookings', n(o, `${vb}.created.cur`), { prev: n(o, `${vb}.created.prev`), s: t('s_vbookings', { a: fmt(n(o, `${vb}.courts_cur`)), b: fmt(n(o, `${vb}.classes_cur`)) }) }),
          T('k_value', n(o, `${vb}.value_sar.cur`), { prev: n(o, `${vb}.value_sar.prev`), money: true, s: t('s_value') }),
          T('k_upcoming', n(o, `${vb}.upcoming_7d`), { s: t('s_upcoming', { a: fmt(n(o, `${vb}.awaiting_venue`)) }), warn: n(o, `${vb}.awaiting_venue`) > 0 }),
          T('k_classes', n(o, 'bookings.gym_classes.created.cur'), { prev: n(o, 'bookings.gym_classes.created.prev'), s: t('s_classes', { a: fmt(n(o, 'bookings.gym_classes.today.booked')), b: fmt(n(o, 'bookings.gym_classes.today.waitlist')) }) }),
          T('k_memberships', n(o, 'bookings.memberships.live'), { s: t('s_memberships', { a: fmt(n(o, 'bookings.memberships.expiring_7d')), b: fmt(n(o, 'bookings.memberships.frozen')) }) }),
          T('k_coaching', n(o, 'bookings.coaching.clients_active'), { s: t('s_coaching', { a: fmt(n(o, 'bookings.coaching.sessions.upcoming_7d')), b: fmt(n(o, 'bookings.coaching.link_requests.pending')) }) }),
          T('k_recovery', n(o, 'bookings.recovery.requests.cur'), { prev: n(o, 'bookings.recovery.requests.prev'), s: t('s_recovery', { a: fmt(n(o, 'bookings.recovery.open_requests')) }) }),
          T('k_meals', n(o, 'bookings.meal_subscriptions.active'), { s: t('s_meals', { a: fmt(n(o, 'bookings.meal_subscriptions.restaurants')), b: fmt(n(o, 'bookings.meal_subscriptions.open_requests')) }) })),
        h('div', { class: 'cols' },
          block(t('by_status_cur'), bars(['pending', 'confirmed', 'done', 'cancelled', 'declined', 'no_show'].map((k) => ({ label: t(`b_${k}`), n: n(o, `${vb}.by_status_cur.${k}`) })))),
          block(t('attention'), attentionList(o, 8))),
        h('div', { class: 'small muted', text: t('housekeeping', { a: fmt(n(o, `${vb}.stale_pending`)), b: fmt(n(o, `${vb}.unclosed`)), c: fmt(n(o, 'bookings.coaching.sessions.stale_booked')) }) }),
      ];
    }
    case 'orders': return [
      h('div', { class: 'tiles' },
        T('k_orders', t('v_orders_off'), { txt: true, s: t('s_orders_off') }),
        T('k_stores', n(o, 'store.brands.live'), { s: t('s_stores', { a: fmt(n(o, 'store.brands.pending')), b: fmt(n(o, 'store.brands.live_restaurants')) }) }),
        T('k_products', n(o, 'store.products.live'), { s: t('s_products', { a: fmt(n(o, 'store.products.sold_out')), b: fmt(n(o, 'store.products.low_stock')) }), warn: n(o, 'store.products.sold_out') > 0 }),
        T('k_offer_views', n(o, 'store.offers.views.cur'), { prev: n(o, 'store.offers.views.prev'), s: t('s_offer_views', { a: fmt(n(o, 'store.offers.reveals.cur')), b: fmt(n(o, 'store.offers.visits.cur')) }) }),
        T('k_followers', n(o, 'store.followers.new.cur'), { prev: n(o, 'store.followers.new.prev'), s: t('s_followers', { a: fmt(n(o, 'store.followers.total')) }) }),
        T('k_points', n(o, 'store.rewards.points.cur'), { prev: n(o, 'store.rewards.points.prev'), s: t('s_points', { a: fmt(n(o, 'store.rewards.earners_cur')) }) })),
      h('div', { class: 'cols' },
        block(t('low_stock'), lowStock(o, 10)),
        block(t('top_brands'), bars(arr(get(o, 'store.top_brands')).map((b) => ({ label: str(b.name), n: num(b.engagement) })))),
        block(t('top_dishes'), bars(arr(get(o, 'store.top_products')).map((p) => ({ label: `${str(p.product)} · ${str(p.brand)}`, n: num(p.meals) }))))),
    ];
    case 'community': return [
      h('div', { class: 'tiles' },
        T('k_posts', n(o, 'community.posts.cur'), { prev: n(o, 'community.posts.prev'), series: arr(get(o, 'community.daily')).map((x) => ({ day: x.day, n: x.posts })) }),
        T('k_comments', n(o, 'community.comments.cur'), { prev: n(o, 'community.comments.prev'), series: arr(get(o, 'community.daily')).map((x) => ({ day: x.day, n: x.comments })) }),
        T('k_reactions', n(o, 'community.reactions.cur'), { prev: n(o, 'community.reactions.prev'), series: arr(get(o, 'community.daily')).map((x) => ({ day: x.day, n: x.reactions })) }),
        T('k_messages', n(o, 'community.chats.messages.cur'), { prev: n(o, 'community.chats.messages.prev'), series: get(o, 'community.chats.daily') }),
        T('k_convs', n(o, 'community.chats.conversations.cur'), { prev: n(o, 'community.chats.conversations.prev') }),
        T('k_media', n(o, 'community.chats.media_pct_cur'), { pct: true, s: t('s_media', { a: fmt(n(o, 'community.chats.media.cur')) }) }),
        T('k_friend_req', n(o, 'community.friend_requests.pending'), { s: t('s_friend_req', { a: fmt(n(o, 'community.friend_requests.pending_over_7d')) }) }),
        T('k_challenges', n(o, 'community.challenges.running'), { s: t('s_challenges', { a: fmt(n(o, 'community.challenges.ended_unsettled')) }), warn: n(o, 'community.challenges.ended_unsettled') > 0 }),
        T('k_unread', n(o, 'community.chats.unread_over_24h'), { dir: -1 }),
        T('k_programs', n(o, 'community.programs.total'), { s: t('s_programs', { a: fmt(n(o, 'community.programs.adopts_cur')) }) })),
      h('div', { class: 'standing' }, icon('alert', 'sm'), h('span', null, h('strong', { text: `${t('standing')}: ` }), t('mod_standing'))),
      block(t('moderation'), modList(o, 10)),
    ];
    case 'partners': {
      const items = arr(get(o, 'partners.items'));
      return [
        h('div', { class: 'tiles' },
          T('k_pending_total', n(o, 'partners.pending_total'), { warn: n(o, 'partners.pending_total') > 0 }),
          T('k_oldest', items[0] ? ago(items[0].created_at) : t('v_none'), { txt: true, s: items[0] ? str(items[0].name) : null }),
          T('partner_intent', n(o, 'activity.partner_intent.total'), { s: t('s_intent', { a: fmt(n(o, 'activity.partner_intent.no_submission')) }) })),
        h('div', { class: 'cols' },
          block(t('pending_by_kind'), bars(PARTNER_KINDS.map((k) => ({ label: t(`kind_${k}`), n: n(o, `partners.pending.${k}`) })))),
          block(t('pending_list'), items.length ? h('div', { class: 'list' }, items.slice(0, 8).map((x) => li(str(x.name) || t('anon'),
            [t(`kind_${x.kind}`), x.city ? str(x.city) : null, ago(x.created_at)].filter(Boolean),
            x.agent_task ? pill(t(x.agent_task.status === 'waiting_approval' ? 'agent_ready' : 'agent_reviewing'), x.agent_task.status === 'waiting_approval' ? 'wait' : 'work') : null,
            () => selectDesk(KIND_DESK[x.kind] || 'clubs')))) : h('div', { class: 'empty', text: t('nothing_here') }))),
      ];
    }
    case 'reports': return [
      h('div', { class: 'tiles' },
        T('k_new_reports', n(o, 'reports.by_status.new'), { warn: n(o, 'reports.by_status.new') > 0 }),
        T('k_received', n(o, 'reports.received.cur'), { prev: n(o, 'reports.received.prev'), dir: 0, s: `${t('k_today')}: ${fmt(n(o, 'reports.received.today'))}` }),
        T('k_fixed', n(o, 'reports.by_status.fixed')),
        T('k_errors', n(o, 'activity.errors.cur'), { prev: n(o, 'activity.errors.prev'), dir: -1 })),
      h('div', { class: 'cols' },
        block(t('reports_by_status'), bars(REPORT_STATUSES.map((s) => ({ label: t(`st_${s}`), n: n(o, `reports.by_status.${s}`) })))),
        block(t('reports_new'), arr(get(o, 'reports.latest_new')).length ? h('div', { class: 'list' }, arr(get(o, 'reports.latest_new')).slice(0, 5).map((r) =>
          li(str(r.message), [t(`cat_${r.category}`) !== `cat_${r.category}` ? t(`cat_${r.category}`) : str(r.category), r.username ? `@${str(r.username)}` : null, ago(r.created_at)].filter(Boolean), null, () => selectDesk('reports')))) : h('div', { class: 'empty', text: t('nothing_here') }))),
    ];
    case 'marketing': {
      const ad = get(o, 'marketing.live_ad');
      const cur = get(o, 'marketing.ad_stats.cur') || {};
      const ctr = num(cur.views) ? Math.round((num(cur.clicks) / num(cur.views)) * 1000) / 10 : 0;
      return [
        h('div', { class: 'tiles' },
          T('k_live_ad', ad ? str(ad.title) : t('v_no_ad'), { txt: true, warn: !ad || n(o, 'marketing.ads.live_marketing') === 0,
            s: ad ? [t(`s_ad_kind_${ad.kind}`) !== `s_ad_kind_${ad.kind}` ? t(`s_ad_kind_${ad.kind}`) : '', ad.ends_at ? t('s_live_ad', { t: ago(ad.ends_at) }) : ''].filter(Boolean).join(' · ') : null }),
          T('k_ad_views', n(o, 'marketing.ad_stats.cur.views'), { prev: n(o, 'marketing.ad_stats.prev.views'), s: t('s_ad_views', { a: fmt(n(o, 'marketing.ad_stats.cur.reach')) }) }),
          T('k_ad_clicks', n(o, 'marketing.ad_stats.cur.clicks'), { prev: n(o, 'marketing.ad_stats.prev.clicks'), s: t('s_ad_clicks', { a: t('pct_v', { n: fmt(ctr) }) }) }),
          T('k_nudges', n(o, 'marketing.nudges.cur'), { prev: n(o, 'marketing.nudges.prev'), dir: 0 }),
          T('k_templates', n(o, 'marketing.nudges.templates_active'), { s: t('s_templates', { a: fmt(n(o, 'marketing.nudges.templates_paused')) }) }),
          T('k_events', n(o, 'marketing.events.active'), { s: t('s_events', { a: fmt(n(o, 'marketing.events.past_still_active')) }), warn: n(o, 'marketing.events.past_still_active') > 0 })),
        h('div', { class: 'cols' },
          block(t('nudges_by_cat'), bars(NUDGE_CATS.map((c) => ({ label: t(`ncat_${c}`), n: n(o, `marketing.nudges.by_category_cur.${c}`) })))),
          block(t('upcoming_events'), eventsList(o, 10))),
      ];
    }
    case 'ai': {
      const today = n(o, 'ai.office_tasks_today');
      const cap = n(o, 'ai.fixed_caps.office') || 80;
      return [
        h('div', { class: 'tiles' },
          T('k_lim_barcode', n(o, 'ai.limits.barcode_per_day'), { s: t('s_per_user') }),
          T('k_lim_meals', n(o, 'ai.limits.meal_photos_per_day'), { s: t('s_per_user') }),
          T('k_plan_cap', n(o, 'ai.fixed_caps.plan'), { s: t('s_per_user') }),
          h('div', { class: 'tile' }, h('span', { class: 'k', text: t('k_office_today') }), h('span', { class: 'v', text: fmt(today) }),
            h('div', { class: `meter${today / cap >= 0.8 ? ' hot' : ''}`, role: 'img', 'aria-label': `${fmt(today)} / ${fmt(cap)}` }, h('i', { style: { width: `${Math.min(100, (today / cap) * 100)}%` } })),
            h('span', { class: 's', text: t('s_office_today', { a: fmt(cap) }) }))),
        h('div', { class: 'cols' },
          block(t('ai_usage'), h('div', { class: 'table-wrap' }, h('table', { class: 't' },
            h('thead', null, h('tr', null, ['u_kind', 'u_today', 'u_cur', 'u_prev', 'u_users'].map((k) => h('th', { scope: 'col', text: t(k) })))),
            h('tbody', null, ['meal_photo', 'barcode', 'plan', 'office'].map((k) => h('tr', null,
              h('td', { text: t(`uk_${k}`) }), h('td', { text: fmt(n(o, `ai.usage.${k}.uses_today`)) }), h('td', { text: fmt(n(o, `ai.usage.${k}.uses_cur`)) }),
              h('td', { text: fmt(n(o, `ai.usage.${k}.uses_prev`)) }), h('td', { text: fmt(n(o, `ai.usage.${k}.users_cur`)) }))))))),
          block(t('u_cur'), usageBars(o))),
      ];
    }
    default: return [];
  }
}

function renderDash() {
  $('dashTitle').textContent = t('dash_title');
  $('dashSub').textContent = t('dash_sub', { d: fmt(num(get(state.data, 'meta.days')) || state.days) });
  const o = state.data;
  // آخر office_overview فشل والأرقام اللي تحت من قبل: تنبيه واحد فوق اللوحات
  const note = $('dashNote');
  if (o && state.errs.overview) { note.hidden = false; put(note, errBox(state.errs.overview, t('dash_stale'))); } else { note.hidden = true; note.replaceChildren(); }
  const sel = AREA_OF[state.desk];
  const areas = ['activity', 'bookings', 'orders', 'community', 'partners', 'reports', 'marketing', 'ai'];
  $('dash').replaceChildren(...areas.map((id) => {
    const desk = AREA_DESK[id];
    const head = h('div', { class: 'area-head' }, h('span', { class: 'desk-badge', style: { background: DESK[desk].shirt } }, icon(AREA_ICON[id] || DESK[desk].icon)),
      h('h3', { text: t(`area_${id}`) }),
      h('button', { type: 'button', class: 'link', onclick: () => { selectDesk(desk); document.getElementById('main').scrollIntoView({ behavior: smooth(), block: 'start' }); } }, t('open_desk'), icon('arrowEnd', 'xs flip')));
    let body;
    if (!o) body = [state.errs.overview ? errBox(state.errs.overview) : h('div', { class: 'empty', text: '…' })];
    else { try { body = areaBody(id, o); } catch (e) { body = [errBox({ msg: t('err_generic'), raw: str(e && e.message) })]; } }
    return h('section', { class: `area${sel === id ? ' sel' : ''}`, id: `area-${id}`, 'aria-labelledby': `area-${id}-t` }, head, body);
  }));
  $('dash').querySelectorAll('.area-head h3').forEach((el) => { el.id = `${el.closest('.area').id}-t`; });
  $('footPrivacy').textContent = t('foot_privacy');
  $('footSource').textContent = t('foot_source', { p: PROJECT });
}
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
function goArea(id) {
  const el = document.getElementById(`area-${id}`);
  if (el) { el.scrollIntoView({ behavior: smooth(), block: 'start' }); const hd = el.querySelector('.link'); if (hd) hd.focus({ preventScroll: true }); }
}

// ===================== ورقة المهمة =====================
const SEV_CLS = { critical: 'fail', high: 'wait', medium: 'work', low: 'ok' };
function openSheet(id) {
  const task = arr(state.tasks).find((x) => x.id === id);
  if (!task) return;
  state.sheet = { id, draft: draftFrom(task), rejecting: false, note: '', busy: null, err: null, errCode: null, status: task.status };
  renderSheet();
  const dlg = $('sheet');
  if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
}
function closeSheet() {
  const dlg = $('sheet');
  state.sheet = null;
  if (dlg.open) dlg.close();
}
function field(label, input, hint) { return h('div', { class: 'field' }, h('label', { for: input.id, text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null); }
function chipsRadio(id, options, value, onPick, editable) {
  if (!editable) { const cur = options.find((x) => x.value === value); return cur ? h('div', { class: 'chips' }, pill(cur.label, 'plain')) : null; }
  return h('div', { class: 'chips', role: 'radiogroup', id }, options.map((x) => h('button', { type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(x.value === value), onclick: () => onPick(x.value) }, x.label)));
}

function sheetProposal(task, sh, editable) {
  const o = isObj(task.output) ? task.output : null;
  if (!o) return [];
  // اللي خلص: نعرض اللي انطبق فعلاً (final)، وإلا اقتراح الوكيل
  const value = editable ? sh.draft : (task.decision === 'approved' && isObj(task.final) ? Object.assign({}, draftFrom(task) || {}, task.final) : draftFrom(task));
  const set = (patch) => { sh.draft = Object.assign({}, sh.draft || {}, patch); renderSheet(); };
  const out = [];
  const summary = o.summary || o.why;
  if (summary && task.kind !== 'daily_brief') out.push(h('div', { class: 'summary', dir: 'auto', text: L(summary) }));
  if (task.kind === 'triage_report') {
    const lang = t(`lang_${o.reply_locale === 'en' ? 'en' : 'ar'}`);
    out.push(h('div', { class: 'chips' }, o.severity ? pill(t(`sev_${o.severity}`), SEV_CLS[o.severity] || 'plain', true) : null, o.category_guess ? pill(t('sh_category', { v: t(`cat_${o.category_guess}`) }), 'plain') : null));
    out.push(h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: 600 }, text: t('sh_reportStatus') }),
      chipsRadio('shStatus', REPORT_FINAL.map((s) => ({ value: s, label: t(`st_${s}`) })), value && value.status, (v) => set({ status: v }), editable)));
    out.push(editable ? field(t('sh_reply'), h('textarea', { id: 'shReply', class: 'input', maxlength: REPLY_MAX, value: str(value && value.reply), oninput: (e) => { sh.draft.reply = e.target.value; } }), t('sh_replyHint', { lang }))
      : h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: 600 }, text: t('sh_reply') }), h('div', { class: 'item-msg', text: str(value && value.reply) || '—' })));
  } else if (task.kind === 'review_partner') {
    const lang = t(`lang_${o.note_locale === 'en' ? 'en' : 'ar'}`);
    if (o.confidence) out.push(h('div', { class: 'chips' }, pill(t('sh_confidence', { v: t(`conf_${o.confidence}`) }), o.confidence === 'high' ? 'ok' : o.confidence === 'medium' ? 'work' : 'fail')));
    if (arr(o.checks).length) out.push(h('div', { class: 'block' }, h('h4', { class: 'block-title', text: t('sh_checks') }),
      h('div', { class: 'checks' }, arr(o.checks).slice(0, 8).map((c) => h('div', { class: 'check' }, h('span', { class: `ci ${c && c.ok ? 'y' : 'n'}` }, icon(c && c.ok ? 'check' : 'x', 'xs')), h('span', { text: L(c && c.label) }))))));
    if (arr(o.missing).length) out.push(h('div', { class: 'block' }, h('h4', { class: 'block-title', text: t('sh_missing') }), h('ul', { class: 'points' }, arr(o.missing).slice(0, 6).map((m) => h('li', { dir: 'auto', text: L(m) })))));
    out.push(h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: 600 }, text: t('sh_decision') }),
      chipsRadio('shDecision', [{ value: 'approve', label: t('dec_approve') }, { value: 'reject', label: t('dec_reject') }], value && value.decision, (v) => set({ decision: v }), editable)));
    if (value && value.decision === 'reject') {
      out.push(editable ? field(t('sh_note'), h('textarea', { id: 'shNote', class: 'input', maxlength: NOTE_MAX, value: str(value.note), oninput: (e) => { sh.draft.note = e.target.value; } }), t('sh_noteHint', { lang }))
        : h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: 600 }, text: t('sh_note') }), h('div', { class: 'item-msg', text: str(value.note) || '—' })));
    }
  } else if (task.kind === 'draft_nudge') {
    const tp = (value && value.template) || o.template || {};
    const cat = NUDGE_CATS.includes(tp.category) ? tp.category : 'gym';
    const patch = (x) => set({ template: Object.assign({}, sh.draft && sh.draft.template, x) });
    if (isObj(task.input) && task.input.brief) out.push(h('div', { class: 'small muted', text: t('sh_brief', { v: str(task.input.brief) }) }));
    out.push(h('div', { class: 'chips' }, pill(t('sh_nudgeCat', { v: t(`ncat_${cat}`) }), 'wait')));
    if (editable) {
      out.push(field(t('sh_nudgeTitle'), h('input', { id: 'shTitle', class: 'input', maxlength: 80, value: str(tp.title), oninput: (e) => { sh.draft.template = Object.assign({}, sh.draft.template, { title: e.target.value }); } })));
      out.push(field(t('sh_nudgeBody'), h('textarea', { id: 'shBody', class: 'input', maxlength: 240, value: str(tp.body), oninput: (e) => { sh.draft.template = Object.assign({}, sh.draft.template, { body: e.target.value }); } }),
        t('sh_vars', { vars: NUDGE_VARS[cat].map((v) => `{${v}}`).join(' ') })));
    } else {
      out.push(h('div', { class: 'summary' }, h('strong', { text: str(tp.title) }), h('div', { text: str(tp.body) })));
    }
    out.push(h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: 600 }, text: t('sh_gender') }),
      chipsRadio('shGender', NUDGE_WHO.map((g) => ({ value: g, label: t(g === 'all' ? 'aud_all' : `g_${g}`) })), tp.gender, (v) => patch({ gender: v }), editable)));
    out.push(h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: 600 }, text: t('sh_locale') }),
      chipsRadio('shLocale', LANGS.map((l) => ({ value: l, label: t(`lang_${l}`) })), tp.locale, (v) => patch({ locale: v }), editable)));
    if (editable) out.push(h('div', { class: 'small muted', text: t('sh_paused') }));
  } else if (task.kind === 'review_ai_limits') {
    const was = isObj(task.input) && isObj(task.input.current) ? task.input.current : null;
    const live = get(state.data, 'ai.limits');
    const cur = (editable && isObj(live) ? live : was) || {};
    out.push(h('div', { class: 'block' }, h('h4', { class: 'block-title', text: t('sh_limits') }),
      ['barcode_per_day', 'meal_photos_per_day'].map((k) => h('div', { class: 'limits-row' },
        h('div', { class: 'item-main' }, h('label', { for: `shLim-${k}`, class: 'small', style: { fontWeight: 600, display: 'block' }, text: t(`lim_${k}`) }),
          h('span', { class: 'small muted num', text: t('sh_limitNow', { n: fmt(num(cur[k])), max: fmt(LIMIT_MAX[k]) }) })),
        editable ? h('input', { id: `shLim-${k}`, class: 'input num', inputmode: 'numeric', maxlength: 3, dir: 'ltr', value: str(value && value[k]), oninput: (e) => { sh.draft[k] = e.target.value; } })
          : h('span', { class: 'num', style: { fontWeight: 700, fontSize: '18px', textAlign: 'center' }, text: str(value && value[k]) })))));
  } else if (task.kind === 'daily_brief') {
    out.push(h('h3', { style: { margin: 0, fontSize: '17px' }, text: L(o.headline) }));
    if (arr(o.points).length) out.push(h('div', { class: 'block' }, h('h4', { class: 'block-title', text: t('sh_points') }), h('ul', { class: 'points' }, arr(o.points).slice(0, 6).map((p) => h('li', { dir: 'auto', text: L(p) })))));
    if (arr(o.priorities).length) out.push(h('div', { class: 'block' }, h('h4', { class: 'block-title', text: t('sh_priorities') }),
      h('div', { class: 'checks' }, arr(o.priorities).slice(0, 4).map((p) => { const dd = deskOf(str(p.desk)); return h('button', { type: 'button', class: 'prio', onclick: () => { closeSheet(); selectDesk(dd); } }, deskBadge(dd), h('span', { class: 'item-main' }, h('span', { class: 'small', style: { fontWeight: 700, display: 'block' }, text: t(`sign_${dd}`) }), h('span', { class: 'small', text: L(p.text) }))); }))));
  }
  return out;
}

function renderSheet() {
  const sh = state.sheet;
  const dlg = $('sheet');
  if (!sh) return;
  const task = arr(state.tasks).find((x) => x.id === sh.id);
  if (!task) { closeSheet(); return; }
  const keep = focusState();
  const p = phase(task);
  const waiting = p === 'waiting';
  if (!sh.draft && waiting) sh.draft = draftFrom(task);
  const editable = waiting && !!sh.draft && task.kind !== 'daily_brief' && canAct();
  const head = h('div', { class: 'sh-head' }, deskBadge(deskOf(task.desk)),
    h('div', { class: 'item-main' }, h('h2', { id: 'sheetTitle', text: kindLabel(task) }),
      h('div', { class: 'meta' }, [t(`sign_${deskOf(task.desk)}`), ago(taskWhen(task))].join(' · '))),
    statusPill(task),
    h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': t('close'), disabled: !!sh.busy || null, onclick: closeSheet }, icon('x')));
  const body = h('div', { class: 'sh-body' });
  if (task.title && task.kind !== 'daily_brief') body.append(h('div', { class: 'item-name', dir: 'auto', text: str(task.title) }));
  if (p === 'working') body.append(h('div', { class: 'note-box', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('span', { class: 'spin', style: { color: 'var(--work-ink)' } }), t('sh_working')));
  if (p === 'failed') {
    const reason = isStale(task) ? 'stale' : ['ai_failed', 'ai_bad_output', 'ai_refused', 'timeout', 'stale'].includes(task.error) ? task.error : 'other';
    body.append(h('div', { class: 'err-box' }, h('strong', { text: t('sh_failed') }), h('span', { text: t(`aerr_${reason}`) })));
  }
  if (p !== 'working' && p !== 'failed' && !isObj(task.output)) body.append(h('div', { class: 'small muted', text: t('sh_unreadable') }));
  body.append(...sheetProposal(task, sh, editable));
  if (task.decision) {
    body.append(h('div', { class: task.decision === 'approved' ? 'ok-box' : 'note-box' },
      h('strong', { text: `${t(task.decision === 'approved' ? 'sh_approved' : 'sh_rejected')} · ${ago(task.decided_at)}` }),
      task.decision_note ? h('div', { text: str(task.decision_note) }) : null));
  }
  if (task.model) body.append(h('div', { class: 'small muted num', text: t('sh_model', { v: str(task.model) }) }));
  if (sh.err) {
    const box = h('div', { class: 'err-box', role: 'alert' }, h('span', { text: sh.err }));
    if (sh.errCode === 'already_decided') box.append(h('div', null, h('button', { type: 'button', class: 'btn sm', onclick: () => sheetReject(t('closedNote')) }, t('closeTask'))));
    body.append(box);
  }
  if (sh.rejecting) {
    body.append(field(t('sh_rejectNotePh'), h('input', { id: 'shRejectNote', class: 'input', maxlength: NOTE_MAX, value: sh.note, oninput: (e) => { sh.note = e.target.value; } }), t('sh_rejectHint')));
  }
  const foot = h('div', { class: 'sh-foot' });
  if (waiting && canAct()) {
    if (sh.rejecting) {
      foot.append(h('div', { class: 'row' },
        h('button', { type: 'button', class: `btn danger${sh.busy === 'reject' ? ' busy' : ''}`, disabled: !!sh.busy || null, onclick: () => sheetReject(sh.note) }, sh.busy === 'reject' ? h('span', { class: 'spin' }) : icon('x', 'sm'), t('sh_rejectConfirm')),
        h('button', { type: 'button', class: 'btn ghost', disabled: !!sh.busy || null, onclick: () => { sh.rejecting = false; renderSheet(); } }, t('cancel'))));
    } else {
      if (editable) foot.append(h('button', { type: 'button', id: 'shApprove', class: `btn primary wide${sh.busy === 'approve' ? ' busy' : ''}`, disabled: !!sh.busy || null, onclick: sheetApprove }, sh.busy === 'approve' ? h('span', { class: 'spin' }) : icon('check', 'sm'), t('sh_approve')));
      foot.append(h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', disabled: !!sh.busy || null, onclick: () => { sh.rejecting = true; renderSheet(); const el = $('shRejectNote'); if (el) el.focus(); } }, t('sh_reject')),
        h('button', { type: 'button', class: 'btn ghost', disabled: !!sh.busy || null, onclick: closeSheet }, t('close'))));
    }
  } else foot.append(h('button', { type: 'button', class: 'btn wide', onclick: closeSheet }, t('close')));
  dlg.replaceChildren(head, body, foot);
  restoreFocus(keep);
}

// ===================== حفظ التركيز بين إعادات الرسم =====================
function focusState() {
  const a = document.activeElement;
  if (!a || !a.id || a === document.body) return null;
  const s = { id: a.id };
  try { if (typeof a.selectionStart === 'number') { s.start = a.selectionStart; s.end = a.selectionEnd; } } catch (e) { /* مو حقل نص */ }
  return s;
}
function restoreFocus(s) {
  if (!s || (document.activeElement && document.activeElement.id === s.id && document.activeElement.isConnected)) return;
  const el = document.getElementById(s.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { if (typeof s.start === 'number' && typeof el.setSelectionRange === 'function') el.setSelectionRange(s.start, s.end); } catch (e) { /* مو حقل نص */ }
}
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
