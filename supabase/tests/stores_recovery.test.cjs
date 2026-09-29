// اختبارات المتاجر (مطاعم صحية بماكروز) ودليل مراكز الاستشفاء (اعتماد المالك، قفل الحالة، الخصوصية)
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  // ---------- المتاجر ----------
  const [b] = await as(U.A, `insert into brands (owner, name, category, city, website) values ($1, 'Fit Bowl', 'restaurant', 'الرياض', 'https://fitbowl.example') returning id, status`, [U.A]);
  check('a healthy restaurant can register as a store (pending)', b.status === 'pending');
  await expectErr('unknown store category rejected', () => as(U.B, `insert into brands (owner, name, category) values ($1, 'X Shop', 'cars')`, [U.B]), /check constraint/);
  await as(U.A, `insert into brand_products (brand_id, name, price_sar, kcal, protein_g, carbs_g, fat_g) values ($1, 'بول دجاج وكينوا', 42, 520, 45, 48, 14)`, [b.id]);
  check('menu items carry calories and macros', (await as(U.A, `select kcal, protein_g from brand_products where brand_id = $1`, [b.id]))[0].kcal === 520);
  await expectErr('impossible calories rejected', () => as(U.A, `insert into brand_products (brand_id, name, kcal) values ($1, 'Mega', 9000)`, [b.id]), /check constraint/);
  await as(U.B, `insert into food_logs (slot, name, kcal, protein_g, carbs_g, fat_g, source) values ('lunch', 'بول دجاج وكينوا', 520, 45, 48, 14, 'store')`);
  check('a restaurant dish can be logged to the food diary', (await as(U.B, `select count(*)::int n from food_logs where source = 'store'`))[0].n === 1);

  // ---------- دليل الاستشفاء ----------
  const seeded = await as(U.C, `select count(*)::int n from recovery_centers where listed_by = 'arq' and status = 'approved'`);
  check('directory starts with centers listed from official sites', seeded[0].n >= 15, String(seeded[0].n));

  const [c] = await as(U.B, `insert into recovery_centers (owner, name, kind, cities, services, phone, status, listed_by) values ($1, 'مركز تجربة للعلاج الطبيعي', 'physio', array['الرياض'], array['sports_injury','massage'], '0550000000', 'approved', 'arq') returning id, status, listed_by`, [U.B]);
  check('new center is pending and marked as owner-listed even if the app says otherwise', c.status === 'pending' && c.listed_by === 'owner');
  check('pending center hidden from others', (await as(U.C, `select 1 from recovery_centers where id = $1`, [c.id])).length === 0);
  check('owner sees own pending center', (await as(U.B, `select 1 from recovery_centers where id = $1`, [c.id])).length === 1);
  check('admins notified about the new center', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'url' = '/owner'`, [U.E]))[0].n >= 1);
  await expectErr('owner cannot approve own center', () => as(U.B, `update recovery_centers set status = 'approved' where id = $1`, [c.id]), /status_locked/);
  await expectErr('second center per account blocked', () => as(U.B, `insert into recovery_centers (owner, name, kind, cities) values ($1, 'ثاني', 'physio', array['جدة'])`, [U.B]), /duplicate|unique/);
  await expectErr('unknown service rejected', () => as(U.C, `insert into recovery_centers (owner, name, kind, cities, services) values ($1, 'مركز', 'physio', array['جدة'], array['magic'])`, [U.C]), /check constraint/);
  await expectErr('non-admin cannot review', () => as(U.A, `select review_center($1, 'approved')`, [c.id]), /not_allowed/);
  await expectErr('rejecting an owner center needs a note', () => as(U.E, `select review_center($1, 'rejected')`, [c.id]), /consent_required/);
  await as(U.E, `select review_center($1, 'rejected', 'أضف رقم الترخيص')`, [c.id]);
  check('owner told what to fix', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'url' = '/recovery/join'`, [U.B]))[0].n === 1);
  await as(U.B, `update recovery_centers set license_no = 'MOH-12345' where id = $1`, [c.id]);
  check('editing a rejected center sends it back for review', (await q(`select status from recovery_centers where id = $1`, [c.id]))[0].status === 'pending');
  await as(U.E, `select review_center($1, 'approved')`, [c.id]);
  check('approved center visible to everyone', (await as(U.C, `select 1 from recovery_centers where id = $1`, [c.id])).length === 1);
  check('owner notified of approval', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'url' = '/recovery/centers'`, [U.B]))[0].n === 1);
  await as(U.B, `update recovery_centers set description = 'مساج رياضي وتأهيل إصابات' where id = $1`, [c.id]);
  check('owner edits keep the approval', (await q(`select status from recovery_centers where id = $1`, [c.id]))[0].status === 'approved');
  const r = await as(U.C, `update recovery_centers set name = 'اختراق' where id = $1 returning 1`, [c.id]);
  check('others cannot edit a center', r.length === 0);
  const arq = (await q(`select id from recovery_centers where listed_by = 'arq' limit 1`))[0].id;
  await as(U.E, `select review_center($1, 'rejected')`, [arq]);
  check('admin can hide a listed center without a note', (await as(U.C, `select 1 from recovery_centers where id = $1`, [arq])).length === 0);
})();
