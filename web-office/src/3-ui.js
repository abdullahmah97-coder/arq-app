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
  conn.className = `conn ${m}`;
  $('connText').textContent = t(m === 'error' && state.isSample ? 'conn_error_sample' : `conn_${m}`);
  // «آخر تحديث» = آخر مرة وصلت نتيجة office_overview (حتى لو الاتصال انقطع بعدها)، وما نعرضه أبد مع بيانات تجريبية
  const liveShown = !state.isSample && (state.mode === 'live' || state.mode === 'error') && (state.data || state.tasks);
  $('updated').textContent = liveShown ? (state.updatedAt ? t('updated', { t: ago(new Date(state.updatedAt).toISOString()) }) : t('updated_never')) : '';
  $('period').setAttribute('aria-label', t('period'));
  for (const b of [$('days7'), $('days30')]) {
    b.textContent = t(`days_${b.dataset.days}`);
    b.setAttribute('aria-pressed', String(Number(b.dataset.days) === state.days));
  }
  const rb = $('refreshBtn');
  rb.replaceChildren(state.busyRefresh ? h('span', { class: 'spin' }) : icon('refresh', 'sm'), h('span', { text: state.busyRefresh ? t('refreshing') : t('refresh') }));
  rb.disabled = state.mode === 'connecting' || state.busyRefresh || !!(state.conn && state.conn.kind === 'user_changed');
  const lb = $('langBtn');
  lb.textContent = t('lang_switch');
  lb.setAttribute('lang', state.lang === 'ar' ? 'en' : 'ar');
  const dark = currentTheme() === 'dark';
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

function adminPicker() {
  const id = 'adminPick';
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

// ===================== المسرح: اللوحات والبطاقات والملخص =====================
function renderStageMeta() {
  $('stageTitle').textContent = t('office');
  $('legend').replaceChildren(
    h('span', null, h('i', { style: { background: '#F1551D' } }), t('legend_wait')),
    h('span', null, h('i', { style: { background: '#FEA94F' } }), t('legend_work')),
    h('span', null, h('i', { style: { background: '#8FD19E' } }), t('legend_idle')));
  const v3 = $('view3d'), vg = $('viewGrid');
  v3.replaceChildren(icon('cube', 'sm')); vg.replaceChildren(icon('grid', 'sm'));
  v3.setAttribute('aria-label', t('view_3d')); v3.title = t('view_3d');
  vg.setAttribute('aria-label', t('view_grid')); vg.title = t('view_grid');
  const show3d = state.view === '3d' && state.can3d;
  v3.setAttribute('aria-pressed', String(show3d)); vg.setAttribute('aria-pressed', String(!show3d));
  v3.disabled = !state.can3d;
  const st = deskStates();
  const o = state.data || {};
  const working = DESKS.reduce((a, d) => a + st[d.id].working, 0);
  const oldest = get(o, 'office.oldest_waiting_at');
  put($('stageFoot'),
    h('span', { class: 'stat wait' }, h('b', { text: fmt(st.lead.waiting) }), t('sum_waiting')),
    h('span', { class: 'stat work' }, h('b', { text: fmt(working) }), t('sum_working')),
    oldest ? h('span', { class: 'stat' }, h('b', { class: 'num', text: ago(oldest) }), t('sum_oldest')) : null,
    h('span', { class: 'stat' }, h('b', { text: fmt(n(o, 'ai.office_tasks_today')) }), t('sum_today_tasks')));
  const today = [
    ['k_signups', 'activity.signups.today'], ['k_checkins', 'activity.checkins.today'], ['k_workouts', 'activity.workouts.today'],
    ['k_vbookings', 'bookings.venue_bookings.created.today'], ['k_messages', 'community.chats.messages.today'], ['k_errors', 'activity.errors.today'],
  ];
  put($('todayStrip'), h('h3', { class: 'today-t', text: t('today_so_far') }),
    h('div', { class: 'today-g' }, today.map(([k, path]) => h('div', { class: `today-i${path === 'activity.errors.today' && n(o, path) > 0 ? ' hot' : ''}` },
      h('b', { text: state.data ? fmt(n(o, path)) : '—' }), h('span', { text: t(k) })))));
  renderSigns(st);
  renderGrid(st);
}

/** محتوى اللوحة فوق كل مكتب */
function signContent(d, s) {
  return h('span', { class: 'sign' }, icon(d.icon), h('span', { class: 'lbl', text: t(`sign_${d.id}`) }),
    s.waiting ? h('span', { class: 'cnt', text: s.waiting > 99 ? '99+' : String(s.waiting) })
      : s.working ? h('span', { class: 'cnt work', text: String(s.working) })
        : s.alert ? h('span', { class: 'alert', title: t('legend_alert') }) : h('span', { class: 'okd' }));
}
function renderSigns(st) {
  const box = $('signs');
  if (!office3d || state.view !== '3d' || !state.can3d) { box.replaceChildren(); return; }
  const keep = focusState();
  const spots = office3d.spots();
  box.replaceChildren(...spots.map((p) => {
    const d = DESK[p.id];
    const s = st[p.id];
    return h('button', { type: 'button', class: 'desk-hit', id: `desk-${p.id}`, 'aria-pressed': String(state.desk === p.id),
      'aria-label': t('a11y_desk', { name: t(`desk_${p.id}`), w: s.waiting, p: s.working }),
      style: { left: `${p.left}px`, top: `${p.top}px`, width: `${p.w}px`, height: `${p.h}px` }, onclick: () => selectDesk(p.id) }, signContent(d, s));
  }));
  restoreFocus(keep);
}
function renderGrid(st) {
  const g = $('grid2d');
  const show = state.view === 'grid' || !state.can3d;
  g.hidden = !show;
  $('stage').classList.toggle('gridmode', show);
  const note = $('stageNote');
  if (note) { note.hidden = show || !!office3d; note.textContent = t('loading_3d'); }
  $('cv').style.visibility = show ? 'hidden' : 'visible';
  if (!show) { g.replaceChildren(); return; }
  const keep = focusState();
  const order = [...DESKS].sort((a, b) => (a.id === 'lead' ? -1 : b.id === 'lead' ? 1 : 0));
  put(g, ...order.map((d) => {
    const s = st[d.id];
    const cls = s.waiting ? 'wait' : s.working ? 'work' : '';
    return h('button', { type: 'button', class: `card2d ${cls}`, id: `card-${d.id}`, 'aria-pressed': String(state.desk === d.id), onclick: () => selectDesk(d.id) },
      h('span', { class: 'n' }, icon(d.icon), t(`sign_${d.id}`)),
      h('span', { class: 'm', text: [s.waiting ? t('n_waiting', { n: fmt(s.waiting) }) : null, s.working ? t('n_working', { n: fmt(s.working) }) : null, s.alert ? t('n_alert', { n: fmt(s.alert) }) : null].filter(Boolean).join(' · ') || t('idle') }));
  }), state.can3d ? null : h('div', { class: 'small', style: { gridColumn: '1 / -1', color: 'var(--stage-muted)' }, text: t('no3d') }));
  restoreFocus(keep);
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
