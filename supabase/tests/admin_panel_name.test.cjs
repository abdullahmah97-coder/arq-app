// اسم اللوحة الجديد «لوحة إدارة التطبيق»: تنبيهات الإدارة الجديدة والقديمة كلها بالاسم الجديد
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, U } = await setup();

  // ما بقت أي دالة فيها الاسم القديم
  const old = await q(`select proname from pg_proc where prosrc like '%لوحة المالك%' or prosrc like '%the owner panel%'`);
  check('no function still says the old panel name', old.length === 0, old.map((r) => r.proname).join(','));

  // طلب نادي جديد: التنبيه للإدارة بالاسم الجديد
  await as(U.C, `select request_club_partner(null, null, 'نادي الاختبار', 'owner', null, '0551112222')`);
  const n = (await q(`select data from notifications where user_id = $1 and data->>'url' = '/owner' order by id desc limit 1`, [U.E]))[0]?.data;
  check('club request notice uses the new Arabic name', /لوحة إدارة التطبيق/.test(n?.body_ar ?? ''), n?.body_ar);
  check('club request notice uses the new English name', /App management/.test(n?.body_en ?? ''), n?.body_en);

  // تنبيه قديم محفوظ: التحديث في الترحيل يغيّر نصه
  await q(`insert into notifications (user_id, kind, data) values ($1, 'notice', $2)`, [U.E, JSON.stringify({
    key: 'old:1', title_ar: 'متجر ينتظر اعتمادك', body_ar: 'متجر طلب يظهر في المتاجر. راجعه من لوحة المالك.',
    title_en: 'Store to review', body_en: 'A store asked to appear in Stores. Review it in the owner panel.', url: '/owner',
  })]);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260929000600_admin_panel_name.sql'), 'utf8');
  await q(sql.slice(sql.indexOf('update public.notifications')));
  const o = (await q(`select data from notifications where data->>'key' = 'old:1'`))[0].data;
  check('old stored notice renamed (ar)', o.body_ar === 'متجر طلب يظهر في المتاجر. راجعه من لوحة إدارة التطبيق.', o.body_ar);
  check('old stored notice renamed (en)', o.body_en === 'A store asked to appear in Stores. Review it in App management.', o.body_en);
  check('other fields untouched', o.title_ar === 'متجر ينتظر اعتمادك' && o.url === '/owner' && o.key === 'old:1');
})();
