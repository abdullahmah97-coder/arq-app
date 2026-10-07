// مكتب أرك أب على الويب — تبويب «التطبيق»: طلبات التعديل (office_change_requests) ودوال المحتوى والإعدادات في office_admin
// (إعلان البداية، الفعاليات، تنبيهات التحفيز، الإعدادات، الشركاء، المتدربين): مين يوصلها، كل دالة وأخطاؤها،
// إن سجل الإجراءات ينكتب، وإن قائمة المتدربين ما فيها إيميلات.
// التشغيل: node supabase/tests/office_app.test.cjs
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U, failed } = await setup();
  const MIG = path.join(__dirname, '../migrations/20261008000900_office_app.sql');
  // auth.uid() مثل Supabase الحقيقي (request.jwt.claim.sub ثم request.jwt.claims->>sub)، ومعه request.jwt.sub حق أداة الاختبار
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.sub', true), ''),
                    nullif(current_setting('request.jwt.claim.sub', true), ''),
                    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;`);
  const one = async (sql, params) => (await q(sql, params))[0];
  /** select <دالة> as r → r */
  const r = async (sql, params) => (await one(sql, params)).r;
  /** يشغّل أكثر من أمر بنفس العملية (مثل طلب execute_sql واحد) */
  const tx = (fn) => db.transaction(fn);
  /** نفس العملية بس ترجع كل شي (للتجربة على حالة مؤقتة) */
  const dryRun = async (fn) => {
    let out;
    try { await tx(async (t) => { out = await fn(t); throw new Error('ROLLBACK'); }); } catch (e) { if (e.message !== 'ROLLBACK') throw e; }
    return out;
  };
  const logs = (kind, target) => q(`select admin_id, action, note from admin_log where kind = $1 and target = $2 order by id`, [kind, String(target)]);
  const lastLog = async (kind, target) => (await logs(kind, target)).pop();
  const J = (v) => JSON.stringify(v);
  /** نفس القيمة بغض النظر عن ترتيب المفاتيح (jsonb يرتّبها على كيفه) */
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  const same = (a, b) => J(canon(a)) === J(canon(b));
  const SID = 'session_01AbCdEfGh123456';

  // ===================================================================
  // مين يوصل: office_admin مقفول على التطبيق، والجدول للقراءة من الأدمن بس
  // ===================================================================
  const FNS = ['requests', 'add_request', 'update_request', 'content', 'save_ad', 'set_ad_active', 'save_event', 'set_event_active',
    'save_nudge', 'set_nudge_active', 'save_setting', 'partners', 'partner_action', 'users', 'update_user', 'set_verified'];
  const have = (await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'office_admin'`)).map((x) => x.proname);
  check('all the new office_admin functions exist', FNS.every((f) => have.includes(f)), FNS.filter((f) => !have.includes(f)).join(','));
  const open = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'office_admin' and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))`);
  check('no office_admin function is executable by anon or authenticated', open.length === 0, open.map((x) => x.proname).join(','));
  check('…and the service role can run them', (await one(`select has_function_privilege('service_role', 'office_admin.content()', 'EXECUTE') as ok`)).ok === true);
  await expectErr('the admin from the app (authenticated) can’t reach office_admin', () => as(U.E, `select office_admin.requests()`), /permission denied/);
  await expectErr('anon can’t reach office_admin', () => as(null, `select office_admin.content()`), /permission denied/);
  await expectErr('…the admin can’t call the users list from the app either', () => as(U.E, `select office_admin.users()`), /permission denied/);
  await expectErr('even with access granted, the authenticated role is refused by _as_admin', () => tx(async (t) => {
    await t.exec(`grant usage on schema office_admin to authenticated; grant execute on function office_admin.content() to authenticated`);
    await t.query(`set local role authenticated`);
    await t.query(`select office_admin.content()`);
  }), /not_allowed/);
  await expectErr('a session that carries another user’s token is refused', () => tx(async (t) => {
    await t.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: U.A, role: 'authenticated' })]);
    await t.query(`select office_admin.add_request('Title', 'Some request', 'app', null, null)`);
  }), /not_allowed/);
  await expectErr('two admins and none picked → choose_admin', () => tx(async (t) => {
    await t.query(`insert into app_admins (user_id) values ($1)`, [U.D]);
    await t.query(`select office_admin.content()`);
  }), /choose_admin/);

  // ===================================================================
  // طلبات التعديل
  // ===================================================================
  const add = (title, req, area, sid, url) => r(`select office_admin.add_request($1, $2, $3, $4, $5) as r`, [title, req, area, sid, url]);
  const plain = await add('  Fix   the\n home  title ', '\n  Make the home title bigger.\nAnd bold.  \n', 'app', null, null);
  check('add_request without a session: status sent, cleaned title, trimmed text (inner lines kept), created by the admin',
    plain.status === 'sent' && plain.title === 'Fix the home title' && plain.request === 'Make the home title bigger.\nAnd bold.'
    && plain.area === 'app' && plain.session_id === null && plain.session_url === null && plain.pr_url === null && plain.created_by === U.E, J(plain));
  const withSession = await add('Coach filter', 'Add a city filter to the coaches list', 'coaches', SID, null);
  check('add_request with a session: status working and the session link built from the id', withSession.status === 'working'
    && withSession.session_id === SID && withSession.session_url === `https://claude.ai/code/${SID}`, J(withSession));
  const again = await add('Another title', 'Another text', 'clubs', SID, null);
  check('the same session saved twice returns the first request unchanged (no duplicate)', again.id === withSession.id && again.title === 'Coach filter'
    && (await one(`select count(*)::int n from office_change_requests where session_id = $1`, [SID])).n === 1);
  const noArea = await add('No area', 'General request text', '', 'session_XyZ98765432', `https://claude.ai/code/session_XyZ98765432`);
  check('add_request: empty area → null, explicit session link kept', noArea.area === null && noArea.session_url === 'https://claude.ai/code/session_XyZ98765432');
  await expectErr('add_request: a 1-character title → bad_input', () => add(' x ', 'Some request', 'app', null, null), /bad_input/);
  await expectErr('add_request: a 2-character request → bad_input', () => add('Title', ' ab ', 'app', null, null), /bad_input/);
  await expectErr('add_request: request over 4000 characters → bad_input', () => add('Title', 'x'.repeat(4001), 'app', null, null), /bad_input/);
  check('add_request: exactly 4000 characters is fine', (await add('Long one', 'y'.repeat(4000), 'ai', null, null)).request.length === 4000);
  await expectErr('add_request: unknown area → bad_input', () => add('Title', 'Some request', 'kitchen', null, null), /bad_input/);
  await expectErr('add_request: malformed session id → bad_input', () => add('Title', 'Some request', 'app', 'session_<script>', null), /bad_input/);
  await expectErr('add_request: a session link outside claude.ai → bad_input', () => add('Title', 'Some request', 'app', null, 'https://evil.example/code/session_abcdefgh12'), /bad_input/);
  await expectErr('add_request: a title over 120 characters → bad_input', () => add('t'.repeat(121), 'Some request', 'app', null, null), /bad_input/);
  await expectErr('the table itself rejects a bad status', () => q(`insert into office_change_requests (title, request, status) values ('Title', 'Request', 'merged')`), /check constraint/);
  await expectErr('…and a PR link that isn’t on github.com', () => q(`insert into office_change_requests (title, request, pr_url) values ('Title', 'Request', 'https://gitlab.com/x/y/pull/1')`), /check constraint/);

  await q(`update office_change_requests set created_at = now() - interval '2 days', updated_at = now() - interval '2 days' where id = $1`, [plain.id]);
  await q(`update office_change_requests set created_at = now() - interval '1 day' where id = $1`, [withSession.id]);
  const list = await r(`select office_admin.requests(50) as r`);
  const COLS = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'office_change_requests'`)).map((x) => x.column_name);
  check('requests(): every request, newest first, with every column', list.length === 4 && list[list.length - 1].id === plain.id
    && list[list.length - 2].id === withSession.id && list.every((x, i) => i === 0 || list[i - 1].created_at >= x.created_at)
    && list.every((x) => COLS.every((k) => k in x) && Object.keys(x).length === COLS.length), J(list.map((x) => x.title)));
  check('requests(1) → 1, requests(0) is clamped to 1, null → 50', (await r(`select office_admin.requests(1) as r`)).length === 1
    && (await r(`select office_admin.requests(0) as r`)).length === 1 && (await r(`select office_admin.requests(null) as r`)).length === 4);

  const upd = (id, st, pr) => r(`select office_admin.update_request($1, $2, $3) as r`, [id, st, pr]);
  const PR = 'https://github.com/abdullahmah97-coder/arq-app/pull/42';
  const u1 = await upd(plain.id, 'review', ` ${PR} `);
  check('update_request: status and PR link saved, updated_at moves, created_at/created_by stay', u1.status === 'review' && u1.pr_url === PR
    && Date.parse(u1.updated_at) > Date.parse(u1.created_at) + 86400000 && u1.created_by === U.E, J(u1));
  const u2 = await upd(plain.id, 'done', null);
  const u3 = await upd(plain.id, 'done', '  ');
  check('update_request: no PR link (null or blank) keeps the old one', u2.status === 'done' && u2.pr_url === PR && u3.pr_url === PR);
  check('update_request: cancel only marks it', (await upd(withSession.id, 'cancelled')).status === 'cancelled');
  await expectErr('update_request: unknown status → bad_status', () => upd(plain.id, 'merged', null), /bad_status/);
  await expectErr('update_request: null status → bad_status', () => upd(plain.id, null, null), /bad_status/);
  await expectErr('update_request: a PR link outside github.com → bad_input', () => upd(plain.id, 'review', 'http://github.com/x/y/pull/1'), /bad_input/);
  await expectErr('update_request: unknown id → not_found', () => upd('00000000-0000-4000-8000-000000000000', 'done', null), /not_found/);
  check('…and nothing changed after the errors', (await one(`select status, pr_url from office_change_requests where id = $1`, [plain.id])).status === 'done');

  // الجدول: الأدمن يقرأ من التطبيق، وما أحد يكتب مباشرة
  check('the admin can read the requests from the app (RLS)', (await as(U.E, `select count(*)::int n from office_change_requests`))[0].n === 4);
  check('a non-admin sees none', (await as(U.A, `select count(*)::int n from office_change_requests`))[0].n === 0);
  await expectErr('not even the admin can insert directly (writes only through office_admin)', () => as(U.E,
    `insert into office_change_requests (title, request) values ('Direct', 'Direct insert')`), /row-level security|permission denied/);
  const upDirect = await as(U.E, `update office_change_requests set status = 'done' where id = $1 returning id`, [withSession.id]);
  check('…or update directly (no write policy)', upDirect.length === 0 && (await one(`select status from office_change_requests where id = $1`, [withSession.id])).status === 'cancelled');

  // ===================================================================
  // المحتوى: إعلانات البداية (بحالاتها)، الفعاليات، التنبيهات، الإعدادات
  // ===================================================================
  const mkAd = async (title, extra) => (await one(`insert into launch_ads (kind, title, media_path, media_type, starts_at, ends_at, active, priority)
    values ('ad', $1, 'ads/x.jpg', 'image', $2::timestamptz, $3::timestamptz, $4, $5) returning id`, [title, extra.s ?? null, extra.e ?? null, extra.active ?? true, extra.p ?? 0])).id;
  const adLive = await mkAd('Live promo', { s: new Date(Date.now() - 86400000).toISOString(), e: new Date(Date.now() + 2 * 86400000).toISOString(), p: 5 });
  const adSched = await mkAd('Next week', { s: new Date(Date.now() + 7 * 86400000).toISOString() });
  const adEnded = await mkAd('Old promo', { s: new Date(Date.now() - 9 * 86400000).toISOString(), e: new Date(Date.now() - 8 * 86400000).toISOString() });
  const adOff = await mkAd('Paused', { active: false });
  const c0 = await r(`select office_admin.content() as r`);
  check('content(): exactly ads, events, nudges, settings', J(Object.keys(c0).sort()) === J(['ads', 'events', 'nudges', 'settings']));
  const AD_KEYS = ['id', 'kind', 'title', 'media_path', 'media_type', 'link', 'cta', 'audience', 'starts_at', 'ends_at', 'active', 'frequency',
    'auto_close', 'priority', 'created_at', 'updated_at', 'state'];
  const st = (id) => c0.ads.find((a) => a.id === id)?.state;
  check('content(): every ad with its fields', c0.ads.length === 4 && c0.ads.every((a) => J(Object.keys(a).sort()) === J([...AD_KEYS].sort())));
  check('content(): ad state like adState (live / scheduled / ended / off)', st(adLive) === 'live' && st(adSched) === 'scheduled'
    && st(adEnded) === 'ended' && st(adOff) === 'off', J(c0.ads.map((a) => [a.title, a.state])));

  const EV_COLS = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'local_events'`)).map((x) => x.column_name);
  await q(`insert into local_events (title, starts_on, created_at) select 'Event ' || i, app_today() - i, now() - interval '400 days' from generate_series(1, 85) i`);
  await q(`insert into local_events (title, created_at) values ('Undated new', now())`);
  const logsBefore = (await one(`select count(*)::int n from admin_log`)).n;
  const c1 = await r(`select office_admin.content() as r`);
  const top80 = (await q(`select id from local_events order by coalesce(starts_on, (created_at at time zone 'Asia/Riyadh')::date) desc, id limit 80`)).map((x) => x.id);
  check('content(): at most 80 events, latest date first (undated by the day they were added), with every column', c1.events.length === 80
    && J(c1.events.map((e) => e.id)) === J(top80) && c1.events.some((e) => e.title === 'Undated new') && c1.events.some((e) => e.title === 'Event 1')
    && !c1.events.some((e) => e.title === 'Event 85') && c1.events[0].title === 'جائزة السعودية الكبرى للفورمولا 1 2027'
    && c1.events.every((e) => EV_COLS.every((k) => k in e) && Object.keys(e).length === EV_COLS.length), J(c1.events.slice(0, 3).map((e) => e.title)));
  const NUDGE_KEYS = ['id', 'category', 'gender', 'friend_gender', 'locale', 'title', 'body', 'active', 'updated_at', 'last_broadcast_at', 'last_broadcast_n'];
  check('content(): nudges with their fields', c1.nudges.length > 0 && c1.nudges.every((n) => J(Object.keys(n).sort()) === J([...NUDGE_KEYS].sort())));
  await q(`insert into nudge_templates (category, title, body, active, created_at) select 'meal', 'Meal ' || i, 'Eat well {name}', false, now() - interval '30 days' from generate_series(1, 300) i`);
  await q(`insert into nudge_templates (category, title, body, active) values ('gym', 'Newest', 'Go to {gym}', false)`);
  const c2 = await r(`select office_admin.content() as r`);
  check('content(): at most 300 nudges, the newest kept', c2.nudges.length === 300 && c2.nudges.some((n) => n.title === 'Newest'));
  await q(`delete from nudge_templates where title like 'Meal %' or title = 'Newest'`);
  check('content(): settings as saved', c1.settings.ai_limits.barcode_per_day === 2 && c1.settings.ai_limits.meal_photos_per_day === 25
    && c1.settings.calorie_alert.threshold === 200 && c1.settings.calorie_alert.enabled === true && /\{n\}/.test(c1.settings.calorie_alert.title_ar));
  const cDef = await dryRun(async (t) => {
    await t.query(`delete from app_settings where key in ('ai_limits', 'calorie_alert')`);
    return (await t.query(`select office_admin.content() as r`)).rows[0].r;
  });
  check('content(): defaults when the settings are missing', same(cDef.settings.ai_limits, { barcode_per_day: 2, meal_photos_per_day: 25 })
    && cDef.settings.calorie_alert.threshold === 200 && cDef.settings.calorie_alert.enabled === true
    && cDef.settings.calorie_alert.body_en.startsWith('You\'ve had {eaten}'), J(cDef.settings));
  check('content(): read only — writes nothing to the admin log', (await one(`select count(*)::int n from admin_log`)).n === logsBefore);

  // ---------- إعلان البداية ----------
  const saveAd = (id, p) => r(`select office_admin.save_ad($1, $2::jsonb) as r`, [id, J(p)]);
  const ad1 = await saveAd(adSched, { title: '  New season  ', link: '/store/abc?x=1', cta: ' Shop now ', audience: 'women', starts_at: '2020-10-10',
    ends_at: '2020-10-12', frequency: 'once', auto_close: '٨', priority: 7 });
  const adRow = await one(`select * from launch_ads where id = $1`, [adSched]);
  check('save_ad: edits the fields and returns the ad with its state', ad1.title === 'New season' && ad1.link === '/store/abc?x=1' && ad1.cta === 'Shop now'
    && ad1.audience === 'women' && ad1.frequency === 'once' && ad1.auto_close === 8 && ad1.priority === 7 && ad1.kind === 'ad' && ad1.media_path === 'ads/x.jpg'
    && J(Object.keys(ad1).sort()) === J([...AD_KEYS].sort()) && adRow.title === 'New season', J(ad1));
  check('save_ad: a plain day starts at Riyadh midnight and ends at the end of the day (like the app)',
    new Date(adRow.starts_at).toISOString() === '2020-10-09T21:00:00.000Z' && new Date(adRow.ends_at).toISOString() === '2020-10-12T21:00:00.000Z'
    && ad1.state === 'ended', J([adRow.starts_at, adRow.ends_at]));
  const ad2 = await saveAd(adSched, { starts_at: '2099-11-01T10:00', ends_at: '2099-11-03T08:30:00Z', link: '', cta: null });
  const adRow2 = await one(`select * from launch_ads where id = $1`, [adSched]);
  check('save_ad: a time without a zone is Riyadh time, with a zone as given; blank/null clear link and cta; other fields kept',
    new Date(adRow2.starts_at).toISOString() === '2099-11-01T07:00:00.000Z' && new Date(adRow2.ends_at).toISOString() === '2099-11-03T08:30:00.000Z'
    && ad2.link === null && ad2.cta === null && ad2.title === 'New season' && ad2.priority === 7 && ad2.state === 'scheduled', J(ad2));
  const adLog = (await logs('ad', adSched)).filter((x) => x.action !== 'create');
  check('save_ad: the table’s own log writes an edit by the admin', adLog.length === 2 && adLog.every((x) => x.action === 'edit' && x.admin_id === U.E), J(adLog));
  await saveAd(adSched, { active: false });
  check('save_ad: turning it off is logged as hide', (await lastLog('ad', adSched)).action === 'hide');
  await expectErr('save_ad: no id (new ads need media from the app) → not_found', () => saveAd(null, { title: 'New ad' }), /not_found/);
  await expectErr('save_ad: unknown id → not_found', () => saveAd('00000000-0000-4000-8000-000000000000', { title: 'X ad' }), /not_found/);
  await expectErr('save_ad: p must be an object', () => q(`select office_admin.save_ad($1, '[]'::jsonb)`, [adLive]), /bad_input/);
  const badAd = [
    [{ title: 'x' }, 'title'], [{ title: 't'.repeat(81) }, 'title'], [{ title: null }, 'title'], [{ kind: 'spam' }, 'kind'],
    [{ link: 'javascript:alert(1)' }, 'link'], [{ link: 'http://example.com' }, 'link'], [{ link: '/store/a b' }, 'link'],
    [{ cta: 'c'.repeat(31) }, 'cta'], [{ audience: 'kids' }, 'audience'], [{ priority: 101 }, 'priority'], [{ auto_close: 1.5 }, 'auto_close'],
    [{ auto_close: '-1' }, 'auto_close'], [{ frequency: 'hourly' }, 'frequency'], [{ active: 'yes' }, 'active'],
    [{ starts_at: 'tomorrow' }, 'starts_at'], [{ starts_at: '2026-02-30' }, 'starts_at'], [{ starts_at: '2026-10-05', ends_at: '2026-10-04' }, 'ends_at'],
  ];
  for (const [p, field] of badAd) await expectErr(`save_ad: bad ${field} ${J(p)} → bad_value: ${field}`, () => saveAd(adLive, p), new RegExp(`bad_value: ${field}\\b`));
  const liveRow = await one(`select title, priority, link from launch_ads where id = $1`, [adLive]);
  check('…and a failed save changes nothing', liveRow.title === 'Live promo' && liveRow.priority === 5 && liveRow.link === null);
  const setAd = (id, v) => r(`select office_admin.set_ad_active($1, $2) as r`, [id, v]);
  check('set_ad_active: on', (await setAd(adOff, true)).ok === true && (await one(`select active from launch_ads where id = $1`, [adOff])).active === true
    && (await lastLog('ad', adOff)).action === 'show');
  check('set_ad_active: off', (await setAd(adOff, false)).ok === true && (await lastLog('ad', adOff)).action === 'hide');
  await expectErr('set_ad_active: unknown id → not_found', () => setAd('00000000-0000-4000-8000-000000000000', true), /not_found/);
  await expectErr('set_ad_active: null → bad_input', () => setAd(adOff, null), /bad_input/);

  // ---------- الفعاليات ----------
  const saveEv = (id, p) => r(`select office_admin.save_event($1, $2::jsonb) as r`, [id, J(p)]);
  const ev = await saveEv(null, { category: 'cycling', title: '  جولة الدراجات  ', title_en: ' Bike tour ', city: 'الرياض', city_en: '', venue: '   ',
    starts_on: '2026-12-01', ends_on: '2026-12-02', date_note: null, summary: ' Line one\nLine two ', url: 'https://example.com/ride', featured: true });
  check('save_event: adds an event (trimmed, blank → null, active by default) and returns every column', ev.title === 'جولة الدراجات'
    && ev.title_en === 'Bike tour' && ev.city_en === null && ev.venue === null && ev.summary === 'Line one\nLine two' && ev.starts_on === '2026-12-01'
    && ev.ends_on === '2026-12-02' && ev.featured === true && ev.active === true && ev.created_by === U.E && ev.image_path === null
    && EV_COLS.every((k) => k in ev), J(ev));
  check('save_event: the table’s log writes create', J(await logs('event', ev.id)) === J([{ admin_id: U.E, action: 'create', note: 'جولة الدراجات' }]));
  await q(`update local_events set image_path = 'events/ride.jpg' where id = $1`, [ev.id]);
  const ev2 = await saveEv(ev.id, { title: 'جولة الدراجات الكبرى', city: '' });
  check('save_event: edits only the given fields and never touches the image', ev2.title === 'جولة الدراجات الكبرى' && ev2.city === null
    && ev2.title_en === 'Bike tour' && ev2.category === 'cycling' && ev2.starts_on === '2026-12-01' && ev2.image_path === 'events/ride.jpg'
    && ev2.id === ev.id && (await lastLog('event', ev.id)).action === 'edit', J(ev2));
  check('save_event: a minimal event (title only)', (await saveEv(null, { title: 'Hike day' })).category === 'other');
  const badEv = [
    [{ title: 'x' }, 'title'], [{ title: 't'.repeat(91) }, 'title'], [{ category: 'chess' }, 'category'], [{ city: 'c'.repeat(41) }, 'city'],
    [{ starts_on: '2026-02-30' }, 'starts_on'], [{ starts_on: '01/12/2026' }, 'starts_on'], [{ ends_on: '2026-11-30' }, 'ends_on'],
    [{ url: 'http://example.com' }, 'url'], [{ summary: 's'.repeat(501) }, 'summary'], [{ date_note_en: 'd'.repeat(81) }, 'date_note_en'],
    [{ featured: 1 }, 'featured'], [{ title_en: 5 }, 'title_en'],
  ];
  for (const [p, field] of badEv) await expectErr(`save_event: bad ${field} ${J(p).slice(0, 40)} → bad_value: ${field}`, () => saveEv(ev.id, p), new RegExp(`bad_value: ${field}\\b`));
  await expectErr('save_event: a new event needs a title', () => saveEv(null, { city: 'جدة' }), /bad_value: title/);
  await expectErr('save_event: unknown id → not_found', () => saveEv('00000000-0000-4000-8000-000000000000', { title: 'Ghost' }), /not_found/);
  await expectErr('save_event: p must be an object', () => q(`select office_admin.save_event(null, '"x"'::jsonb)`), /bad_input/);
  const setEv = (id, v) => r(`select office_admin.set_event_active($1, $2) as r`, [id, v]);
  check('set_event_active: off (logged as hide)', (await setEv(ev.id, false)).ok === true
    && (await one(`select active from local_events where id = $1`, [ev.id])).active === false && (await lastLog('event', ev.id)).action === 'hide');
  await expectErr('set_event_active: unknown id → not_found', () => setEv('00000000-0000-4000-8000-000000000000', true), /not_found/);

  // ---------- تنبيهات التحفيز ----------
  const saveNudge = (id, p) => r(`select office_admin.save_nudge($1, $2::jsonb) as r`, [id, J(p)]);
  const n1 = await saveNudge(null, { category: 'gym', gender: 'female', friend_gender: 'male', locale: 'en', title: ' Go {name} ', body: ' {gym} is waiting ' });
  check('save_nudge: adds a paused template (friend audience only for friend nudges) with the listed fields', n1.active === false && n1.category === 'gym'
    && n1.gender === 'female' && n1.friend_gender === 'all' && n1.locale === 'en' && n1.title === 'Go {name}' && n1.body === '{gym} is waiting'
    && J(Object.keys(n1).sort()) === J([...NUDGE_KEYS].sort()), J(n1));
  check('save_nudge: logged as create by the admin', J(await logs('nudge', n1.id)) === J([{ admin_id: U.E, action: 'create', note: 'Go {name}' }]));
  const n2 = await saveNudge(null, { category: 'friend', friend_gender: 'female', title: 'يلا', body: '{friend} سبقك للنادي', active: true });
  check('save_nudge: friend nudge keeps its friend audience; defaults gender all / locale ar; active only when asked', n2.friend_gender === 'female'
    && n2.gender === 'all' && n2.locale === 'ar' && n2.active === true, J(n2));
  const n3 = await saveNudge(n2.id, { category: 'streak', body: 'سلسلتك {streak} يوم' });
  check('save_nudge: edit (changing away from friend resets the friend audience; title kept)', n3.category === 'streak' && n3.friend_gender === 'all'
    && n3.title === 'يلا' && n3.body === 'سلسلتك {streak} يوم' && n3.active === true && (await lastLog('nudge', n2.id)).action === 'edit', J(n3));
  const badNudge = [
    [{ category: 'gym', title: 'Hi', body: 'Your friend {friend} went' }, 'a placeholder from another category'],
    [{ category: 'meal', title: 'Hi {gym}', body: 'Eat now' }, 'meal allows only {name}'],
    [{ category: 'gym', title: 't'.repeat(81), body: 'Go now' }, 'title over 80'],
    [{ category: 'gym', title: 'Hi', body: 'Go' }, 'body under 3'],
    [{ category: 'gym', title: 'Hi', body: 'b'.repeat(241) }, 'body over 240'],
    [{ category: 'gym', title: 'Hi {name', body: 'Go now' }, 'a stray brace'],
    [{ category: 'gym', title: '  ', body: 'Go now' }, 'an empty title'],
  ];
  for (const [p, why] of badNudge) await expectErr(`save_nudge: ${why} → bad_nudge`, () => saveNudge(null, p), /bad_nudge/);
  await expectErr('save_nudge: a new nudge needs a category', () => saveNudge(null, { title: 'Hi', body: 'Go now' }), /bad_value: category/);
  await expectErr('save_nudge: unknown gender → bad_value', () => saveNudge(n1.id, { gender: 'kids' }), /bad_value: gender/);
  await expectErr('save_nudge: unknown locale → bad_value', () => saveNudge(n1.id, { locale: 'fr' }), /bad_value: locale/);
  await expectErr('save_nudge: editing into an invalid text → bad_nudge (nothing saved)', () => saveNudge(n1.id, { category: 'meal' }), /bad_nudge/);
  check('…the template is unchanged', (await one(`select category from nudge_templates where id = $1`, [n1.id])).category === 'gym');
  await expectErr('save_nudge: unknown id → not_found', () => saveNudge('00000000-0000-4000-8000-000000000000', { title: 'Hi' }), /not_found/);
  const setNudge = (id, v) => r(`select office_admin.set_nudge_active($1, $2) as r`, [id, v]);
  check('set_nudge_active: on (logged as show)', (await setNudge(n1.id, true)).ok === true
    && (await one(`select active from nudge_templates where id = $1`, [n1.id])).active === true && (await lastLog('nudge', n1.id)).action === 'show');
  check('set_nudge_active: off (logged as hide)', (await setNudge(n1.id, false)).ok === true && (await lastLog('nudge', n1.id)).action === 'hide');
  await expectErr('set_nudge_active: unknown id → not_found', () => setNudge('00000000-0000-4000-8000-000000000000', true), /not_found/);

  // ---------- الإعدادات ----------
  const saveSet = (k, v) => r(`select office_admin.save_setting($1, $2::jsonb) as r`, [k, J(v)]);
  const s1 = await saveSet('ai_limits', { barcode_per_day: 5, meal_photos_per_day: '30', extra: 1 });
  check('save_setting ai_limits: saved and cleaned by the table guard', s1.ok === true && same(s1.value, { barcode_per_day: 5, meal_photos_per_day: 30 })
    && same((await one(`select value from app_settings where key = 'ai_limits'`)).value, { barcode_per_day: 5, meal_photos_per_day: 30 }), J(s1));
  check('save_setting: the guard’s log writes the edit as the admin', J(await lastLog('setting', 'ai_limits')) === J({ admin_id: U.E, action: 'edit', note: null }));
  check('…and content() shows it', same((await r(`select office_admin.content() as r`)).settings.ai_limits, { barcode_per_day: 5, meal_photos_per_day: 30 }));
  await expectErr('save_setting ai_limits: over 100 → bad_value', () => saveSet('ai_limits', { barcode_per_day: 101, meal_photos_per_day: 30 }), /bad_value/);
  await expectErr('save_setting ai_limits: missing number → bad_value', () => saveSet('ai_limits', { barcode_per_day: 3 }), /bad_value/);
  await expectErr('save_setting ai_limits: fractions → bad_value', () => saveSet('ai_limits', { barcode_per_day: 2.5, meal_photos_per_day: 30 }), /bad_value/);
  const CAL = { enabled: false, threshold: '150', title_ar: ' باقي {n} ', body_ar: 'أكلت {eaten} من {goal}', title_en: '  ', body_en: null };
  const s2 = await saveSet('calorie_alert', CAL);
  check('save_setting calorie_alert: saved and cleaned (blank English → null)', same(s2.value, { body_ar: 'أكلت {eaten} من {goal}', body_en: null,
    enabled: false, title_ar: 'باقي {n}', title_en: null, threshold: 150 }), J(s2.value));
  await expectErr('save_setting calorie_alert: threshold under 50 → bad_value', () => saveSet('calorie_alert', { ...CAL, threshold: 49 }), /bad_value/);
  await expectErr('save_setting calorie_alert: enabled must be true/false', () => saveSet('calorie_alert', { ...CAL, enabled: 'yes' }), /bad_value/);
  await expectErr('save_setting calorie_alert: Arabic title required', () => saveSet('calorie_alert', { ...CAL, title_ar: ' ' }), /bad_value/);
  await expectErr('save_setting calorie_alert: unknown placeholder → bad_value', () => saveSet('calorie_alert', { ...CAL, body_en: 'You ate {kcal}' }), /bad_value: body_en/);
  await expectErr('save_setting calorie_alert: stray brace → bad_value', () => saveSet('calorie_alert', { ...CAL, title_ar: 'باقي {n' }), /bad_value: title_ar/);
  await expectErr('save_setting: other keys → bad_input', () => saveSet('feature_flags', { x: 1 }), /bad_input/);
  await expectErr('save_setting: the value must be an object', () => q(`select office_admin.save_setting('ai_limits', '[1,2]'::jsonb)`), /bad_value/);
  await q(`delete from app_settings where key = 'ai_limits'`);
  check('save_setting: creates the setting when missing', (await saveSet('ai_limits', { barcode_per_day: 0, meal_photos_per_day: 200 })).ok === true
    && same((await one(`select value from app_settings where key = 'ai_limits'`)).value, { barcode_per_day: 0, meal_photos_per_day: 200 }));

  // ===================================================================
  // الشركاء
  // ===================================================================
  const shop = (await one(`insert into brands (owner, name, category, status, listed_by) values ($1, 'Fit Wear', 'apparel', 'approved', 'owner') returning id`, [U.A])).id;
  const pendingShop = (await one(`insert into brands (owner, name, category, status) values ($1, 'Pending Co', 'supplements', 'pending') returning id`, [U.D])).id;
  await q(`insert into coach_profiles (user_id, status, city) values ($1, 'approved', 'الرياض')`, [U.D]);
  await q(`update profiles set is_coach = true where id = $1`, [U.D]);
  await q(`update recovery_centers set license_no = 'LIC-SECRET-1' where listed_by = 'arq'`);
  const partners = (k, s) => r(`select office_admin.partners($1, $2) as r`, [k, s]);
  const P_KEYS = ['id', 'name', 'subtitle', 'status', 'logo_path', 'avatar_url', 'owner_id', 'owner_username', 'listed_by', 'partner', 'meta', 'created_at'];
  const pl = {};
  for (const k of ['club', 'store', 'coach', 'center', 'venue']) pl[k] = await partners(k, null);
  check('partners(): every kind lists its rows with the same fields as the app', Object.values(pl).every((rows) => rows.length > 0
    && rows.every((x) => J(Object.keys(x).sort()) === J([...P_KEYS].sort()))), J(Object.fromEntries(Object.entries(pl).map(([k, v]) => [k, v.length]))));
  check('partners(): same order as the app (pending stores first)', pl.store[0].id === pendingShop && pl.store[0].status === 'pending');
  check('partners(): no centre licence numbers', pl.center.every((x) => !('license_no' in x.meta)) && !J(pl.center).includes('LIC-SECRET-1'));
  check('partners(): search', (await partners('store', '  fit ')).map((x) => x.id).join() === shop && (await partners('club', 'zzz-none')).length === 0);
  await q(`insert into brands (name, category, status, listed_by) select 'Bulk ' || i, 'apparel', 'approved', 'arq' from generate_series(1, 230) i`);
  check('partners(): at most 200 rows', (await partners('store', null)).length === 200);
  await expectErr('partners(): unknown kind → bad_status', () => partners('gym', null), /bad_status/);

  const act = (k, id, a, note) => r(`select office_admin.partner_action($1, $2, $3, $4) as r`, [k, id, a, note]);
  const chain = pl.club[0].id;
  check('partner_action club: hide / show', (await act('club', chain, 'hide', null)).ok === true
    && (await one(`select active from gym_chains where id = $1`, [chain])).active === false
    && (await act('club', chain, 'show', null)).ok === true && (await one(`select active from gym_chains where id = $1`, [chain])).active === true);
  await act('club', chain, 'partner_on', null);
  check('partner_action club: partner on', (await one(`select partner, partner_since from gym_chains where id = $1`, [chain])).partner === true);
  await act('club', chain, 'partner_off', null);
  check('partner_action club: partner off', (await one(`select partner from gym_chains where id = $1`, [chain])).partner === false);
  check('partner_action: every action is in the admin log as the admin (from admin_partner_action)',
    J((await logs('club', chain)).map((x) => [x.action, x.admin_id])) === J([['hide', U.E], ['show', U.E], ['partner_on', U.E], ['partner_off', U.E]]));
  await act('store', shop, 'hide', '  Missing return policy  ');
  check('partner_action store: hide an approved store with a note', J(await one(`select status, review_note from brands where id = $1`, [shop]))
    === J({ status: 'suspended', review_note: 'Missing return policy' }) && J(await lastLog('store', shop)) === J({ admin_id: U.E, action: 'hide', note: 'Missing return policy' }));
  await act('store', shop, 'show', null);
  check('partner_action store: show it again', (await one(`select status from brands where id = $1`, [shop])).status === 'approved');
  await act('coach', U.D, 'hide', null);
  check('partner_action coach: hide → suspended and no longer verified', J(await one(`select c.status, p.is_coach from coach_profiles c join profiles p on p.id = c.user_id where c.user_id = $1`, [U.D]))
    === J({ status: 'suspended', is_coach: false }));
  await act('coach', U.D, 'show', null);
  const venueId = pl.venue[0].id;
  await act('venue', venueId, 'hide', 'Closed for now');
  check('partner_action venue: hide', (await one(`select status from venues where id = $1`, [venueId])).status === 'suspended');
  await expectErr('partner_action: show on a pending store would approve it → bad_status', () => act('store', pendingShop, 'show', null), /bad_status/);
  await expectErr('partner_action: hide on a pending store → bad_status', () => act('store', pendingShop, 'hide', 'x'), /bad_status/);
  check('…the pending store is still pending', (await one(`select status from brands where id = $1`, [pendingShop])).status === 'pending');
  for (const a of ['approve', 'reject', 'delete', 'nuke']) {
    await expectErr(`partner_action: '${a}' isn’t available here → bad_status`, () => act('store', shop, a, 'Some note'), /bad_status/);
  }
  await expectErr('partner_action: partner flag is clubs only (from admin_partner_action) → bad_status', () => act('store', shop, 'partner_on', null), /bad_status/);
  await expectErr('partner_action: unknown kind → bad_status', () => act('gym', shop, 'hide', null), /bad_status/);
  await expectErr('partner_action: unknown store → request_not_found', () => act('store', '00000000-0000-4000-8000-000000000000', 'hide', null), /request_not_found/);
  await expectErr('partner_action: unknown club → request_not_found (from admin_partner_action)', () => act('club', '00000000-0000-4000-8000-000000000000', 'hide', null), /request_not_found/);
  check('…the store still exists', (await one(`select count(*)::int n from brands where id = $1`, [shop])).n === 1);

  // ===================================================================
  // المتدربين: بدون إيميلات
  // ===================================================================
  await q(`update auth.users set email = lower(raw_user_meta_data->>'username') || '@mail-secret.test', last_sign_in_at = now(), email_confirmed_at = now()`);
  await q(`update auth.users set email = 'sara.private@mail-secret.test' where id = $1`, [U.B]);
  const users = (s, k, l, o) => r(`select office_admin.users($1, $2, $3, $4) as r`, [s, k, l, o]);
  const all = await r(`select office_admin.users() as r`);
  const U_KEYS = ['id', 'username', 'full_name', 'avatar_url', 'account_type', 'gender', 'created_at', 'email_confirmed', 'points', 'gym_name', 'gym_name_en',
    'is_admin', 'partner_intent', 'is_coach', 'total'];
  check('users(): everyone (kind all by default) with total', all.length === 5 && all.every((x) => x.total === 5), J(all.map((x) => x.username)));
  check('users(): exactly the listed fields — no email, no last sign-in', all.every((x) => J(Object.keys(x).sort()) === J([...U_KEYS].sort()))
    && all.every((x) => !('email' in x) && !('last_sign_in_at' in x)), J(Object.keys(all[0])));
  check('users(): no email anywhere in the result', !J(all).includes('@') && !J(all).includes('mail-secret'));
  const byMail = await users('sara.private', 'all', 50, 0);
  check('users(): searching by email finds the person but never returns the email', byMail.length === 1 && byMail[0].id === U.B && !J(byMail).includes('mail-secret'));
  check('users(): search by username / name', (await users('  AHM ', 'all', 50, 0)).map((x) => x.id).join() === U.A && (await users('Gym Manager', 'all', 50, 0))[0].id === U.D);
  check('users(): verified flag', all.find((x) => x.id === U.D).is_coach === true && all.find((x) => x.id === U.A).is_coach === false);
  await q(`update profiles set account_type = 'store' where id = $1`, [U.D]);
  check('users(): kind filter', (await users(null, 'partner', 50, 0)).map((x) => x.id).join() === U.D && (await users(null, 'trainee', 50, 0)).length === 4);
  const pg1 = await users(null, 'all', 2, 0); const pg2 = await users(null, 'all', 2, 2); const pg3 = await users(null, 'all', 2, 4);
  check('users(): paging', pg1.length === 2 && pg2.length === 2 && pg3.length === 1 && new Set([...pg1, ...pg2, ...pg3].map((x) => x.id)).size === 5
    && pg1[0].total === 5 && J(await users(null, 'all', 2, 50)) === '[]');
  await expectErr('users(): unknown kind → bad_input', () => users(null, 'robots', 50, 0), /bad_input/);

  const updUser = (id, name, un) => r(`select office_admin.update_user($1, $2, $3) as r`, [id, name, un]);
  const uu = await updUser(U.C, '  Khalid A  ', ' Khalid_A ');
  check('update_user: saved (username lower-cased) and returned', same(uu, { ok: true, id: U.C, username: 'khalid_a', full_name: 'Khalid A' })
    && J(await one(`select username, full_name from profiles where id = $1`, [U.C])) === J({ username: 'khalid_a', full_name: 'Khalid A' }), J(uu));
  check('update_user: in the admin log (from admin_update_user)', J(await lastLog('user', U.C)) === J({ admin_id: U.E, action: 'edit', note: 'khalid → khalid_a (Khalid A)' }));
  await expectErr('update_user: taken username → username_taken', () => updUser(U.C, 'K', 'sara'), /username_taken/);
  await expectErr('update_user: bad username → bad_username', () => updUser(U.C, 'K', 'no spaces!'), /bad_username/);
  await expectErr('update_user: name over 60 → name_too_long', () => updUser(U.C, 'n'.repeat(61), 'khalid_a'), /name_too_long/);
  await expectErr('update_user: unknown user → user_not_found', () => updUser('00000000-0000-4000-8000-000000000000', 'X', 'xyz'), /user_not_found/);

  const verify = (id, v) => r(`select office_admin.set_verified($1, $2) as r`, [id, v]);
  check('set_verified: on', same(await verify(U.A, true), { ok: true, is_coach: true }) && J(await lastLog('coach', U.A)) === J({ admin_id: U.E, action: 'verify', note: null }));
  await q(`insert into coach_profiles (user_id, status, city) values ($1, 'pending', 'جدة')`, [U.B]);
  await verify(U.B, true);
  check('set_verified: follows the coach profile (pending → approved)', (await one(`select status from coach_profiles where user_id = $1`, [U.B])).status === 'approved');
  check('set_verified: off', same(await verify(U.B, false), { ok: true, is_coach: false })
    && (await one(`select status from coach_profiles where user_id = $1`, [U.B])).status === 'suspended' && (await lastLog('coach', U.B)).action === 'unverify');
  await expectErr('set_verified: unknown user → user_not_found', () => verify('00000000-0000-4000-8000-000000000000', true), /user_not_found/);
  await expectErr('set_verified: null → bad_input', () => verify(U.A, null), /bad_input/);

  // ===================================================================
  // تشغيل الترحيل مرة ثانية: ما يفشل، ما يمسح شي، ويبقى مقفول
  // ===================================================================
  let rerun = true;
  try { await db.exec(fs.readFileSync(MIG, 'utf8')); } catch (e) { rerun = false; console.log(e.message); }
  check('re-running the migration works and keeps the requests', rerun && (await one(`select count(*)::int n from office_change_requests`)).n === 4);
  check('…office_admin stays closed after the re-run', (await q(`select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'office_admin' and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))`)).length === 0);
  check('…and the overview still works', (await one(`select office_overview(7) as o`)).o.meta.days === 7);

  console.log(failed() ? `\n${failed()} FAIL` : '\nall office app checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
