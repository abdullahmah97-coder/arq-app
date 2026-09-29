// اختبارات إعلان البداية: المالك فقط يضيف ويعدّل، المستخدم ياخذ الإعلان المناسب له، والأرقام أشخاص مو تكرار
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const cur = async (uid) => (await as(uid, `select * from current_launch_ad()`))[0];

  await expectErr('non-admin cannot add a launch ad', () => as(U.A, `insert into launch_ads (title, media_path) values ('x', 'a.jpg')`), /row-level security/);
  check('no ad yet', !(await cur(U.A)));

  const [{ id: a1 }] = await as(U.E, `insert into launch_ads (title, media_path, link, cta) values ('خصم الجمعة', 'ads/1.jpg', '/store', 'تسوّق') returning id`);
  check('admin can add an ad and it shows to users', (await cur(U.A))?.id === a1);
  check('created_by filled', (await q(`select created_by from launch_ads where id = $1`, [a1]))[0].created_by === U.E);
  check('users cannot read the table directly', (await as(U.A, `select 1 from launch_ads`)).length === 0);
  await expectErr('link must be in-app or https', () => as(U.E, `insert into launch_ads (title, media_path, link) values ('bad', 'x.jpg', 'javascript:alert(1)')`), /check constraint/);
  await expectErr('non-admin cannot edit', async () => { const r = await as(U.A, `update launch_ads set active = false where id = $1 returning 1`, [a1]); if (!r.length) throw new Error('row-level security: 0 rows'); }, /row-level security/);

  const [{ id: aw }] = await as(U.E, `insert into launch_ads (kind, title, media_path, active) values ('awareness', 'اشرب ماء', 'ads/w.jpg', false) returning id`);
  check('awareness messages are a kind of their own', !!aw);
  await expectErr('unknown kind rejected', () => as(U.E, `insert into launch_ads (kind, title, media_path) values ('promo', 'x', 'x.jpg')`), /check constraint/);

  // جمهور ومدة وأولوية
  const [{ id: a2 }] = await as(U.E, `insert into launch_ads (kind, title, media_path, media_type, audience, priority) values ('occasion', 'اليوم الوطني', 'ads/2.gif', 'gif', 'women', 10) returning id`);
  check('higher priority ad wins for its audience', (await cur(U.B))?.id === a2);
  check('audience filter: men do not get a women ad', (await cur(U.A))?.id === a1);
  check('unknown gender gets only "all" ads', (await cur(U.C))?.id === a1);
  await as(U.E, `update launch_ads set starts_at = now() + interval '1 day' where id = $1`, [a2]);
  check('scheduled ad waits for its start', (await cur(U.B))?.id === a1);
  await as(U.E, `update launch_ads set starts_at = null, ends_at = now() - interval '1 minute', updated_at = now() where id = $1`, [a2]).catch(() => {});
  await as(U.E, `update launch_ads set starts_at = now() - interval '2 day', ends_at = now() - interval '1 minute' where id = $1`, [a2]);
  check('ended ad disappears', (await cur(U.B))?.id === a1);
  await as(U.E, `update launch_ads set active = false where id = $1`, [a1]);
  check('turned-off ad disappears', !(await cur(U.A)));
  check('anon gets nothing', await as(null, `select * from current_launch_ad()`).then((r) => !r.length, () => true));

  // الأرقام
  await as(U.E, `update launch_ads set active = true where id = $1`, [a1]);
  await as(U.A, `select launch_ad_event($1, 'view')`, [a1]);
  await as(U.A, `select launch_ad_event($1, 'view')`, [a1]);
  await as(U.B, `select launch_ad_event($1, 'view')`, [a1]);
  await as(U.A, `select launch_ad_event($1, 'click')`, [a1]);
  await as(U.B, `select launch_ad_event($1, 'close')`, [a1]);
  await expectErr('bad event kind', () => as(U.A, `select launch_ad_event($1, 'hack')`, [a1]), /bad_status/);
  await expectErr('non-admin cannot read stats', () => as(U.A, `select * from launch_ad_stats()`), /not_allowed/);
  const st = (await as(U.E, `select * from launch_ad_stats() where ad_id = $1`, [a1]))[0];
  check('views count one per person per day', Number(st.views) === 2 && Number(st.reach) === 2, JSON.stringify(st));
  check('clicks and closes counted', Number(st.clicks) === 1 && Number(st.closes) === 1);
  check('users cannot read raw events', (await as(U.A, `select 1 from launch_ad_events`).catch(() => [])).length === 0);

  // السجل والحذف
  await as(U.E, `delete from launch_ads where id = $1`, [a2]);
  const log = (await q(`select action from admin_log where kind = 'ad' order by id`)).map((r) => r.action);
  check('owner actions logged', log.includes('create') && log.includes('hide') && log.includes('show') && log.includes('delete'), log.join(','));
  check('deleting an ad removes its events', (await q(`select count(*)::int n from launch_ad_events where ad_id = $1`, [a2]))[0].n === 0);

  // التخزين
  check('ads bucket is public', (await q(`select public from storage.buckets where id = 'ads'`))[0]?.public === true);
  const pols = (await q(`select policyname, cmd, coalesce(qual, '') || coalesce(with_check, '') expr from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%ads'`));
  check('ad media writes are admin-only', pols.length === 4 && pols.every((p) => /is_admin/.test(p.expr) && /'ads'/.test(p.expr)), pols.map((p) => p.cmd).join(','));
})();
