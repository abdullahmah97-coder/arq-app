// عدّاد الذكاء الاصطناعي (ترحيل 20261012000910_ai_metering.sql):
//   أعمدة التوكنات في ai_usage، والنوعين الجداد coach (٤٠ باليوم) و inbody (١٠ باليوم) في ai_take،
//   و ai_usage_note (تسجيل توكنات آخر صف للمستخدم نفسه)، و office_overview يعرض النوعين بدون ما يتغيّر شي ثاني.
// التشغيل: node supabase/tests/ai_metering.test.cjs
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U } = await setup();
  const MIG = path.join(__dirname, '../migrations/20261012000910_ai_metering.sql');
  const OLD = path.join(__dirname, '../migrations/20261008000890_office_web.sql');
  const one = async (sql, params) => (await q(sql, params))[0];
  const take = async (uid, kind) => (await as(uid, `select ai_take($1) as n`, [kind]))[0].n;
  const note = (uid, kind, model, i, o, cr, cw) => as(uid, `select ai_usage_note($1, $2, $3, $4, $5, $6)`, [kind, model, i, o, cr, cw]);
  const row = (id) => one(`select * from ai_usage where id = $1`, [id]);
  const lastId = async (uid, kind) => (await one(`select max(id)::int as id from ai_usage where user_id = $1 and kind = $2`, [uid, kind])).id;
  const used = async (uid, kind) => (await one(`select count(*)::int n from ai_usage where user_id = $1 and kind = $2`, [uid, kind])).n;
  const at = (id, ago) => q(`update ai_usage set created_at = now() - $2::interval where id = $1`, [id, ago]);
  const NOTE_SIG = 'ai_usage_note(text,text,integer,integer,integer,integer)';

  // ===================================================================
  // الأعمدة الجديدة: كلها تقبل null، والصفوف من ai_take تبدأ فاضية
  // ===================================================================
  const cols = await q(`select column_name, data_type, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_usage' order by column_name`);
  const col = (n) => cols.find((c) => c.column_name === n);
  check('ai_usage has the token columns, all nullable',
    col('model')?.data_type === 'text' && col('recorded_at')?.data_type === 'timestamp with time zone'
    && ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens'].every((c) => col(c)?.data_type === 'integer')
    && ['model', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'recorded_at'].every((c) => col(c).is_nullable === 'YES'),
    JSON.stringify(cols));

  // ===================================================================
  // ai_take: coach ٤٠ و inbody ١٠ (آخر ٢٤ ساعة)، والأنواع القديمة مثل ما هي
  // ===================================================================
  const coachLeft = [];
  for (let i = 0; i < 40; i++) coachLeft.push(await take(U.A, 'coach'));
  check('coach: 40 a day, counting down', coachLeft[0] === 39 && coachLeft[39] === 0 && coachLeft.every((n, i) => n === 39 - i), `${coachLeft[0]}…${coachLeft[39]}`);
  await expectErr('coach: the 41st message is blocked', () => take(U.A, 'coach'), /rate_limited/);
  check('coach: the blocked call isn’t recorded', (await used(U.A, 'coach')) === 40);
  const fresh = await one(`select bool_and(model is null and input_tokens is null and output_tokens is null and cache_read_tokens is null
    and cache_write_tokens is null and recorded_at is null) as ok from ai_usage where user_id = $1`, [U.A]);
  check('rows from ai_take start with no token numbers', fresh.ok === true);

  const inLeft = [];
  for (let i = 0; i < 10; i++) inLeft.push(await take(U.A, 'inbody'));
  check('inbody: 10 a day, counting down', inLeft.join() === '9,8,7,6,5,4,3,2,1,0', inLeft.join());
  await expectErr('inbody: the 11th read is blocked', () => take(U.A, 'inbody'), /rate_limited/);
  check('inbody: the blocked call isn’t recorded', (await used(U.A, 'inbody')) === 10);
  check('coach and inbody are separate quotas, and per user', (await take(U.B, 'coach')) === 39 && (await take(U.B, 'inbody')) === 9);

  // نافذة متحركة: ٢٤ ساعة من وقت الطلب، مو يوم تقويمي
  await q(`update ai_usage set created_at = now() - interval '23 hours 59 minutes' where user_id = $1 and kind = 'inbody'`, [U.A]);
  await expectErr('inbody: calls from 23h59m ago still count', () => take(U.A, 'inbody'), /rate_limited/);
  await q(`update ai_usage set created_at = now() - interval '24 hours 1 minute' where user_id = $1 and kind = 'inbody'`, [U.A]);
  check('inbody: frees up once they’re over 24h old', (await take(U.A, 'inbody')) === 9);
  await q(`update ai_usage set created_at = now() - interval '23 hours' where id in
    (select id from ai_usage where user_id = $1 and kind = 'coach' order by id limit 20)`, [U.A]);
  await q(`update ai_usage set created_at = now() - interval '25 hours' where user_id = $1 and kind = 'coach' and created_at > now() - interval '1 hour'`, [U.A]);
  check('coach: only the last 24h count (20 left in the window → 19 after this one)', (await take(U.A, 'coach')) === 19);

  // الأنواع القديمة: نفس الحدود، ولوحة التحكم لسا تتحكم بالباركود وصور الوجبات
  check('old kinds unchanged (meal_photo 25, barcode 2, plan 8, office 80)',
    (await take(U.B, 'meal_photo')) === 24 && (await take(U.B, 'barcode')) === 1 && (await take(U.B, 'plan')) === 7 && (await take(U.B, 'office')) === 79);
  await as(U.E, `update app_settings set value = '{"barcode_per_day": 5, "meal_photos_per_day": 10}' where key = 'ai_limits'`);
  check('the panel still sets the barcode and meal photo caps', (await take(U.D, 'barcode')) === 4 && (await take(U.D, 'meal_photo')) === 9);
  check('…and doesn’t touch the fixed coach/inbody caps', (await take(U.D, 'coach')) === 39 && (await take(U.D, 'inbody')) === 9);
  await as(U.E, `update app_settings set value = '{"barcode_per_day": 2, "meal_photos_per_day": 25}' where key = 'ai_limits'`);
  await expectErr('unknown kind still rejected', () => take(U.A, 'essay'), /bad_status/);
  await expectErr('signed-out callers can’t run ai_take', () => as(null, `select ai_take('coach')`), /permission denied/);
  await expectErr('can’t record coach calls directly', () => as(U.A, `insert into ai_usage (user_id, kind) values ($1, 'coach')`, [U.A]), /row-level security/);
  check('can’t delete own coach rows to reset the cap', (await as(U.A, `delete from ai_usage where kind = 'coach' returning 1`)).length === 0);

  // ===================================================================
  // القيود على الجدول نفسه
  // ===================================================================
  await expectErr('kind check rejects unknown kinds', () => q(`insert into ai_usage (user_id, kind) values ($1, 'essay')`, [U.C]), /ai_usage_kind_check/);
  await expectErr('…and an empty kind', () => q(`insert into ai_usage (user_id, kind) values ($1, '')`, [U.C]), /ai_usage_kind_check/);
  const ok6 = await q(`insert into ai_usage (user_id, kind) select $1, k from unnest(array['meal_photo','barcode','plan','office','coach','inbody']) k returning id`, [U.C]);
  check('kind check accepts all six kinds', ok6.length === 6);
  await q(`delete from ai_usage where id = any($1::bigint[])`, [ok6.map((r) => r.id)]);
  await expectErr('model longer than 60 chars rejected', () => q(`insert into ai_usage (user_id, kind, model) values ($1, 'coach', repeat('m', 61))`, [U.C]), /ai_usage_model_len/);
  await expectErr('negative token counts rejected', () => q(`insert into ai_usage (user_id, kind, input_tokens) values ($1, 'coach', -1)`, [U.C]), /ai_usage_tokens_range/);
  await expectErr('token counts above 5M rejected', () => q(`insert into ai_usage (user_id, kind, cache_write_tokens) values ($1, 'coach', 5000001)`, [U.C]), /ai_usage_tokens_range/);

  // ===================================================================
  // ai_usage_note: آخر صف غير مسجّل للمستخدم نفسه ومن نفس النوع، من آخر ١٥ دقيقة
  // ===================================================================
  await take(U.C, 'meal_photo'); const r1 = await lastId(U.C, 'meal_photo');
  await take(U.C, 'meal_photo'); const r2 = await lastId(U.C, 'meal_photo');
  await at(r1, '5 minutes'); await at(r2, '1 minute');
  await note(U.C, 'meal_photo', 'claude-sonnet-5-5', 1200, 300, 40, 7);
  let a = await row(r2), b = await row(r1);
  check('note fills the latest unrecorded row', a.model === 'claude-sonnet-5-5' && a.input_tokens === 1200 && a.output_tokens === 300
    && a.cache_read_tokens === 40 && a.cache_write_tokens === 7 && a.recorded_at !== null, JSON.stringify(a));
  check('…and leaves the older one alone', b.recorded_at === null && b.input_tokens === null && b.model === null);
  await note(U.C, 'meal_photo', 'claude-sonnet-5-5', 100, 50, null, null);
  a = await row(r2); b = await row(r1);
  check('the next note goes to the next unrecorded row', b.input_tokens === 100 && b.output_tokens === 50 && b.recorded_at !== null
    && a.input_tokens === 1200, JSON.stringify(b));
  check('missing counts stay null (not 0)', b.cache_read_tokens === null && b.cache_write_tokens === null);
  const snap = JSON.stringify(await q(`select * from ai_usage where user_id = $1 order by id`, [U.C]));
  const res = await note(U.C, 'meal_photo', 'claude-opus-5-5', 9, 9, 9, 9);
  check('nothing left to record → no-op, no error', JSON.stringify(await q(`select * from ai_usage where user_id = $1 order by id`, [U.C])) === snap && res.length === 1);

  await take(U.C, 'meal_photo'); const r3 = await lastId(U.C, 'meal_photo');
  await at(r3, '16 minutes');
  await note(U.C, 'meal_photo', 'claude-sonnet-5-5', 5, 5, 0, 0);
  check('a row older than 15 minutes isn’t recorded', (await row(r3)).recorded_at === null);
  await take(U.C, 'meal_photo'); const r4 = await lastId(U.C, 'meal_photo');
  await at(r4, '14 minutes');
  await note(U.C, 'meal_photo', 'claude-sonnet-5-5', 6, 6, 0, 0);
  check('a row from 14 minutes ago is', (await row(r4)).input_tokens === 6 && (await row(r3)).recorded_at === null);

  await take(U.C, 'barcode'); const r5 = await lastId(U.C, 'barcode');
  await note(U.C, 'plan', 'claude-sonnet-5-5', 77, 77, 0, 0);
  check('a note for another kind doesn’t touch it', (await row(r5)).recorded_at === null);
  await note(U.C, 'essay', 'x', 1, 1, 1, 1);
  await note(U.C, null, 'x', 1, 1, 1, 1);
  check('unknown or empty kind → no-op, no error', (await row(r5)).recorded_at === null);
  await note(U.C, 'barcode', 'claude-sonnet-5-5', 2000, 400, 0, 0);
  check('…and the right kind records it', (await row(r5)).input_tokens === 2000);
  check('recording tokens doesn’t change the cap (rows are counted, not tokens)', (await take(U.C, 'barcode')) === 0);

  // التقريب: كل رقم بين ٠ و ٥ مليون، والنموذج ٦٠ حرف بعد قص الفراغات، والفاضي null
  await take(U.D, 'inbody'); const c1 = await lastId(U.D, 'inbody');
  await note(U.D, 'inbody', 'm'.repeat(100), -5, 9000000, 2147483647, -2147483648);
  a = await row(c1);
  check('counts clamped to 0..5,000,000 and model cut to 60', a.input_tokens === 0 && a.output_tokens === 5000000 && a.cache_read_tokens === 5000000
    && a.cache_write_tokens === 0 && a.model === 'm'.repeat(60), JSON.stringify({ ...a, model: a.model?.length }));
  await take(U.D, 'coach'); const c2 = await lastId(U.D, 'coach');
  await note(U.D, 'coach', '  claude-haiku-5-5  ', 0, 0, 0, 0);
  check('model trimmed', (await row(c2)).model === 'claude-haiku-5-5');
  await take(U.D, 'plan'); const c3 = await lastId(U.D, 'plan');
  await note(U.D, 'plan', '   ', 10, 20, null, 0);
  a = await row(c3);
  check('blank model → null, still recorded', a.model === null && a.input_tokens === 10 && a.recorded_at !== null);

  // مستخدم ثاني: ما يقدر يوصل لصفوف غيره
  await q(`update ai_usage set recorded_at = now() where user_id = $1 and recorded_at is null`, [U.A]);
  await take(U.B, 'coach'); const bRow = await lastId(U.B, 'coach');
  const aBefore = JSON.stringify(await q(`select * from ai_usage where user_id = $1 order by id`, [U.A]));
  await note(U.A, 'coach', 'claude-opus-5-5', 999, 999, 999, 999);
  check('a note never lands on another user’s row', (await row(bRow)).recorded_at === null
    && JSON.stringify(await q(`select * from ai_usage where user_id = $1 order by id`, [U.A])) === aBefore);
  await note(U.B, 'coach', 'claude-sonnet-5-5', 11, 22, 0, 0);
  check('…while the owner of the row can', (await row(bRow)).input_tokens === 11);
  check('users still read only their own usage rows (with the new columns)',
    (await as(U.B, `select distinct user_id from ai_usage`)).every((r) => r.user_id === U.B)
    && (await as(U.B, `select input_tokens from ai_usage where id = $1`, [bRow]))[0].input_tokens === 11);
  check('users can’t edit token numbers directly', (await as(U.B, `update ai_usage set input_tokens = 1, recorded_at = null returning 1`)).length === 0
    && (await row(bRow)).input_tokens === 11);
  await expectErr('signed-out callers can’t run ai_usage_note', () => as(null, `select ai_usage_note('coach', 'x', 1, 1, 1, 1)`), /permission denied/);

  // الصلاحيات: authenticated بس، و security definer مع search_path ثابت
  const priv = await one(`select
      has_function_privilege('anon', '${NOTE_SIG}', 'EXECUTE') as n_anon,
      has_function_privilege('authenticated', '${NOTE_SIG}', 'EXECUTE') as n_auth,
      has_function_privilege('anon', 'ai_take(text)', 'EXECUTE') as t_anon,
      has_function_privilege('authenticated', 'ai_take(text)', 'EXECUTE') as t_auth,
      (select bool_or(x.grantee = 0) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
        where p.oid in ('${NOTE_SIG}'::regprocedure, 'ai_take(text)'::regprocedure)) as pub,
      (select bool_and(p.prosecdef and 'search_path=public' = any(p.proconfig)) from pg_proc p
        where p.oid in ('${NOTE_SIG}'::regprocedure, 'ai_take(text)'::regprocedure)) as sd,
      (select format_type(p.prorettype, null) from pg_proc p where p.oid = '${NOTE_SIG}'::regprocedure) as ret`);
  check('only authenticated can execute ai_take and ai_usage_note (not anon, not PUBLIC)',
    !priv.n_anon && priv.n_auth && !priv.t_anon && priv.t_auth && !priv.pub, JSON.stringify(priv));
  check('both are security definer with search_path=public; ai_usage_note returns void', priv.sd === true && priv.ret === 'void');

  // ===================================================================
  // office_overview: coach و inbody بالاستخدام والحدود الثابتة، وكل شي ثاني بالحرف
  // ===================================================================
  const ov = (await one(`select office_overview(7) as o`)).o;
  const exp = await one(`select
      count(*) filter (where kind = 'coach')::int as coach, count(distinct user_id) filter (where kind = 'coach')::int as coach_u,
      count(*) filter (where kind = 'inbody')::int as inbody, count(distinct user_id) filter (where kind = 'inbody')::int as inbody_u,
      count(*) filter (where kind = 'coach' and created_at >= app_today()::timestamp at time zone 'Asia/Riyadh')::int as coach_today
    from ai_usage`);
  check('overview: ai.usage has all six kinds', Object.keys(ov.ai.usage).sort().join() === 'barcode,coach,inbody,meal_photo,office,plan', Object.keys(ov.ai.usage).join());
  check('overview: coach/inbody usage counted like the others',
    ov.ai.usage.coach.uses_cur === exp.coach && ov.ai.usage.coach.users_cur === exp.coach_u && ov.ai.usage.coach.uses_prev === 0
    && ov.ai.usage.coach.uses_today === exp.coach_today && ov.ai.usage.inbody.uses_cur === exp.inbody && ov.ai.usage.inbody.users_cur === exp.inbody_u,
    JSON.stringify({ usage: ov.ai.usage, exp }));
  check('overview: fixed caps include coach 40 and inbody 10 (plan/office unchanged)',
    ov.ai.fixed_caps.plan === 8 && ov.ai.fixed_caps.office === 80 && ov.ai.fixed_caps.coach === 40 && ov.ai.fixed_caps.inbody === 10
    && Object.keys(ov.ai.fixed_caps).length === 4,
    JSON.stringify(ov.ai.fixed_caps));

  // نفس الدالة القديمة بالحرف (من ملف ترحيلها) باسم ثاني: نقارن النص والرد
  const src = fs.readFileSync(OLD, 'utf8');
  const s0 = src.indexOf('create or replace function public.office_overview(');
  const s1 = src.indexOf('\nend $$;', s0) + '\nend $$;'.length;
  await db.exec(src.slice(s0, s1).replace('public.office_overview(', 'public.office_overview_orig('));
  const A1 = "unnest(array['meal_photo', 'barcode', 'plan', 'office'])";
  const B1 = "unnest(array['meal_photo', 'barcode', 'plan', 'office', 'coach', 'inbody'])";
  const A2 = "'fixed_caps', jsonb_build_object('plan', 8, 'office', 80),";
  const B2 = "'fixed_caps', jsonb_build_object('plan', 8, 'office', 80, 'coach', 40, 'inbody', 10),";
  const same = await one(`select a.prosrc = replace(replace(b.prosrc, $1, $2), $3, $4) as src, a.prosrc <> b.prosrc as changed,
      a.prosecdef = b.prosecdef and a.provolatile = b.provolatile and a.proconfig = b.proconfig and a.prorettype = b.prorettype
      and pg_get_function_arguments(a.oid) = pg_get_function_arguments(b.oid) as attrs
    from pg_proc a, pg_proc b where a.oid = 'public.office_overview(integer)'::regprocedure and b.oid = 'public.office_overview_orig(integer)'::regprocedure`,
  [A1, B1, A2, B2]);
  check('office_overview source = the 20261008000890 one with only the two ai lines changed', same.src === true && same.changed === true);
  check('…same signature, default, volatility, security definer and search_path', same.attrs === true);
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
  for (const days of [1, 7, 30]) {
    const both = await one(`select office_overview($1) as a, office_overview_orig($1) as b`, [days]);
    const n = both.a;
    const drop = { ...n, ai: { ...n.ai, usage: { ...n.ai.usage }, fixed_caps: { ...n.ai.fixed_caps } } };
    delete drop.ai.usage.coach; delete drop.ai.usage.inbody; delete drop.ai.fixed_caps.coach; delete drop.ai.fixed_caps.inbody;
    check(`overview(${days}) equals the old one apart from the coach/inbody additions`,
      JSON.stringify(sortKeys(drop)) === JSON.stringify(sortKeys(both.b)));
  }
  await db.exec(`drop function public.office_overview_orig(integer)`);

  // ai_take: نفس دالة 20261007000880 بالحرف، والفرق سطري coach و inbody بس (القفل حق السباق باقي)
  const OLD_TAKE = path.join(__dirname, '../migrations/20261007000880_office_agents.sql');
  const tsrc = fs.readFileSync(OLD_TAKE, 'utf8');
  const t0 = tsrc.indexOf('create or replace function public.ai_take(');
  const t1 = tsrc.indexOf('\nend $$;', t0) + '\nend $$;'.length;
  await db.exec(tsrc.slice(t0, t1).replace('public.ai_take(', 'public.ai_take_orig('));
  const sameTake = await one(`select a.prosrc = replace(b.prosrc, $1, $2) as src, a.prosrc <> b.prosrc as changed,
      a.prosecdef and b.prosecdef and a.provolatile = b.provolatile and a.proconfig = b.proconfig and a.prorettype = b.prorettype
      and pg_get_function_arguments(a.oid) = pg_get_function_arguments(b.oid) as attrs
    from pg_proc a, pg_proc b where a.oid = 'public.ai_take(text)'::regprocedure and b.oid = 'public.ai_take_orig(text)'::regprocedure`,
  ["    when 'office' then 80\n  end;", "    when 'office' then 80\n    when 'coach' then 40\n    when 'inbody' then 10\n  end;"]);
  check('ai_take source = the 20261007000880 one plus the coach/inbody lines only (advisory lock kept)', sameTake.src === true && sameTake.changed === true);
  check('…same signature, volatility, security definer and search_path', sameTake.attrs === true);
  await db.exec(`drop function public.ai_take_orig(text)`);
  const noteSrc = (await one(`select prosrc from pg_proc where oid = '${NOTE_SIG}'::regprocedure`)).prosrc;
  check('ai_usage_note takes the same per-user, per-kind lock as ai_take',
    noteSrc.includes("pg_advisory_xact_lock(hashtext('ai_take:' || auth.uid()::text || ':' || p_kind))"));
  await expectErr('overview still closed to normal users', () => as(U.A, `select office_overview(7)`), /not_allowed/);
  check('…and open to the admin', (await as(U.E, `select office_overview(7) as o`))[0].o.ai.usage.coach.uses_cur === exp.coach);

  // ===================================================================
  // الترحيل ينعاد بدون مشاكل وبدون ما يمسح شي
  // ===================================================================
  const before = JSON.stringify(await q(`select * from ai_usage order by id`));
  // Supabase يعطي anon صلاحية تنفيذ كل دالة جديدة (default privileges)، والاختبار ما يعطيها: نعطيها بيدنا
  // ونتأكد إن revoke حق الترحيل نفسه هو اللي يشيلها (مو بس revoke من public)
  const TAKE_SIG = 'ai_take(text)', OV_SIG = 'office_overview(integer)';
  await db.exec(`grant execute on function public.${NOTE_SIG} to anon; grant execute on function public.${TAKE_SIG} to anon;
    grant execute on function public.${OV_SIG} to anon`);
  const anonCan = async () => (await one(`select has_function_privilege('anon', '${NOTE_SIG}', 'EXECUTE') as n,
    has_function_privilege('anon', '${TAKE_SIG}', 'EXECUTE') as t, has_function_privilege('anon', '${OV_SIG}', 'EXECUTE') as o`));
  const granted = await anonCan();
  check('(setup) anon granted EXECUTE like Supabase default privileges', granted.n && granted.t && granted.o);
  let rerun = true;
  try { await db.exec(fs.readFileSync(MIG, 'utf8')); } catch (e) { rerun = false; console.log(e.message); }
  check('the migration can be re-run safely (rows and token numbers kept)', rerun && JSON.stringify(await q(`select * from ai_usage order by id`)) === before);
  check('…ai_take still counts after it', (await take(U.B, 'coach')) === 37 && (await take(U.B, 'inbody')) === 8);
  check('…and ai_usage_note stays closed to anon', (await one(`select has_function_privilege('anon', '${NOTE_SIG}', 'EXECUTE') as x`)).x === false);
  const after = await anonCan();
  check('…the migration’s own revoke removes an explicit anon grant (ai_usage_note, ai_take, office_overview)', !after.n && !after.t && !after.o, JSON.stringify(after));
  check('…authenticated keeps EXECUTE on ai_usage_note and ai_take',
    (await one(`select has_function_privilege('authenticated', '${NOTE_SIG}', 'EXECUTE') and has_function_privilege('authenticated', '${TAKE_SIG}', 'EXECUTE') as x`)).x === true);
})();
