// اختبارات بحث الباركود بالذكاء الاصطناعي: حد يومي من لوحة التحكم (مرتين افتراضياً)، وذاكرة المنتجات يقراها الكل وما يكتب فيها إلا الخادم
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  // الحد الافتراضي: مرتين باليوم
  check('default limit is 2 searches a day', (await as(U.A, `select ai_take('barcode') as n`))[0].n === 1);
  check('second search allowed', (await as(U.A, `select ai_take('barcode') as n`))[0].n === 0);
  await expectErr('third search blocked', () => as(U.A, `select ai_take('barcode')`), /rate_limited/);
  check('meal photo limit is separate (25)', (await as(U.A, `select ai_take('meal_photo') as n`))[0].n === 24);
  check('other users unaffected', (await as(U.B, `select ai_take('barcode') as n`))[0].n === 1);
  await q(`update ai_usage set created_at = now() - interval '25 hours' where user_id = $1 and kind = 'barcode'`, [U.A]);
  check('limit resets after a day', (await as(U.A, `select ai_take('barcode') as n`))[0].n === 1);
  await expectErr('unknown kind still rejected', () => as(U.A, `select ai_take('essay')`), /bad_status/);

  // لوحة التحكم تغيّر الحد
  await q(`insert into app_admins (user_id) values ($1) on conflict do nothing`, [U.E]);
  await expectErr('normal users cannot change limits', () => as(U.A, `update app_settings set value = '{"barcode_per_day": 50, "meal_photos_per_day": 25}' where key = 'ai_limits' returning 1`).then((r) => { if (!r.length) throw new Error('row-level security: no rows'); }), /row-level security/);
  await as(U.E, `update app_settings set value = '{"barcode_per_day": 5, "meal_photos_per_day": 10, "junk": 1}' where key = 'ai_limits'`);
  const lim = (await q(`select value from app_settings where key = 'ai_limits'`))[0].value;
  check('admin sets the limits (unknown keys dropped)', lim.barcode_per_day === 5 && lim.meal_photos_per_day === 10 && !('junk' in lim), JSON.stringify(lim));
  check('new limit applies right away', (await as(U.A, `select ai_take('barcode') as n`))[0].n === 3);
  check('meal photo limit follows the panel too', (await as(U.C, `select ai_take('meal_photo') as n`))[0].n === 9);
  await expectErr('limit above 100 rejected', () => as(U.E, `update app_settings set value = '{"barcode_per_day": 500, "meal_photos_per_day": 10}' where key = 'ai_limits'`), /bad_value/);
  await expectErr('missing number rejected', () => as(U.E, `update app_settings set value = '{"barcode_per_day": 3}' where key = 'ai_limits'`), /bad_value/);
  await as(U.E, `update app_settings set value = '{"barcode_per_day": 0, "meal_photos_per_day": 10}' where key = 'ai_limits'`);
  await expectErr('0 turns barcode AI search off', () => as(U.B, `select ai_take('barcode')`), /rate_limited/);
  check('change is logged for the admin', (await q(`select count(*)::int n from admin_log where kind = 'setting' and target = 'ai_limits'`).catch(() => [{ n: -1 }]))[0].n >= 1);

  // الذاكرة المشتركة
  const prod = JSON.stringify({ name_ar: 'لبن', name_en: 'Laban', brand: 'Test', unit: 'ml', per100: { kcal: 60, protein_g: 3, carbs_g: 4.5, fat_g: 3 } });
  await q(`insert into barcode_products (code, found, product, confidence, source_url) values ('6281234567895', true, $1, 'high', 'https://example.com/p')`, [prod]);
  await q(`insert into barcode_products (code, found) values ('96385074', false)`);
  const rows = await as(U.B, `select code, found, product->>'name_en' as n from barcode_products order by code`);
  check('signed-in users read cached products', rows.length === 2 && rows.find((r) => r.code === '6281234567895').n === 'Laban');
  await expectErr('users cannot add products', () => as(U.A, `insert into barcode_products (code, found) values ('3017620422003', false)`), /row-level security/);
  const upd = await as(U.A, `update barcode_products set found = false, product = null returning 1`);
  check('users cannot change cached products', upd.length === 0);
  const del = await as(U.A, `delete from barcode_products returning 1`);
  check('users cannot delete cached products', del.length === 0);
  check('signed-out cannot read', (await as(null, `select count(*)::int n from barcode_products`).catch(() => [{ n: 0 }]))[0].n === 0);
  await expectErr('bad barcode rejected', () => q(`insert into barcode_products (code, found) values ('12ab', false)`), /check constraint/);
  await expectErr('found needs a product', () => q(`insert into barcode_products (code, found) values ('12345670', true)`), /check constraint/);
  await expectErr('not found cannot carry a product', () => q(`insert into barcode_products (code, found, product) values ('12345670', false, '{}')`), /check constraint/);
  await expectErr('source url must be https', () => q(`insert into barcode_products (code, found, product, source_url) values ('12345670', true, '{}', 'javascript:alert(1)')`), /check constraint/);
})();
