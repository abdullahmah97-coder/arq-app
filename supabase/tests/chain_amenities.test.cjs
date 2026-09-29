// خدمات السلاسل من المصادر الرسمية: تنزل كافتراضي للسلسلة، تظهر في صفحة الفرع، وما تغلب تعديل المدير
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, U } = await setup();
  const chainOf = (slug) => `(select id from gym_chains where slug = '${slug}')`;

  const n = (await q(`select count(*)::int n from chain_amenities where source = 'public_info'`))[0].n;
  check('public-info services seeded for the chains', n >= 95, `(${n})`);
  const pg = (await q(`select amenity from chain_amenities where chain_id = ${chainOf('puregym')}`)).map((r) => r.amenity);
  check('PureGym: 24h, parking, lockers, showers, wifi, classes', ['open_24h', 'parking', 'lockers', 'showers', 'wifi', 'group_classes'].every((k) => pg.includes(k)), pg.join(','));
  const golds = (await q(`select amenity from chain_amenities where chain_id = ${chainOf('golds-gym')}`)).map((r) => r.amenity);
  check("Gold's Gym: classes listed, pool not guessed", golds.includes('group_classes') && !golds.includes('pool'), golds.join(','));
  const bm = (await q(`select note from chain_amenities where chain_id = ${chainOf('body-masters')} and amenity = 'pool'`))[0];
  check('per-branch items carry «حسب الفرع»', bm?.note === 'حسب الفرع');

  // صفحة الفرع وملخص السلسلة يقرون القيم (للمستخدم العادي)
  // فرع تابع لسلسلة: خدمات السلسلة تظهر في صفحته (إلا لو الفرع عدّلها)
  const br = (await q(`select g.id, g.chain_id from gyms g where g.verified and exists (select 1 from chain_amenities ca where ca.chain_id = g.chain_id and ca.source = 'public_info') limit 1`))[0];
  if (!br) await q(`update gyms set chain_id = ${chainOf('puregym')} where id = (select id from gyms where verified order by name limit 1)`);
  const gid = br?.id ?? (await q(`select id from gyms where chain_id = ${chainOf('puregym')} limit 1`))[0].id;
  const want = (await q(`select amenity from chain_amenities where chain_id = (select chain_id from gyms where id = $1)`, [gid])).map((r) => r.amenity);
  const svc = await as(U.A, `select key, available, source from gym_services($1)`, [gid]);
  check('branch page shows every chain service', want.length > 0 && want.every((k) => svc.find((s) => s.key === k)?.available === true), `${want.length} items`);
  const cs = await as(U.A, `select key, chain_default, note from chain_services(${chainOf('golds-gym')})`);
  check('chain summary returns the new defaults', cs.some((s) => s.key === 'women_section' && s.chain_default === true && s.note === 'فروع نسائية'));

  // تعديل المدير يبقى لو انعاد تشغيل الملف
  await q(`update chain_amenities set available = false, source = 'manager' where amenity = 'wifi' and chain_id = ${chainOf('puregym')}`);
  await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/20260929000650_chain_amenities_public.sql'), 'utf8'));
  const w = (await q(`select available, source from chain_amenities where amenity = 'wifi' and chain_id = ${chainOf('puregym')}`))[0];
  check('re-running keeps the manager edit', w.available === false && w.source === 'manager');
})().catch((e) => { console.error(e); process.exit(1); });
