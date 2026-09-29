// اختبارات اشتراك الوجبات: موافقة صريحة، المطعم يشوف الأهداف فقط، الوجبات تنزل للمشترك، والإنهاء يقطع الوصول
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  // مطعم صحي معتمد يملكه D، ومتجر ملابس يملكه C
  const [rest] = await as(U.D, `insert into brands (owner, name, category, city) values ($1, 'Fit Kitchen', 'restaurant', 'الرياض') returning id`, [U.D]);
  const [wear] = await as(U.C, `insert into brands (owner, name, category) values ($1, 'Desert Wear', 'apparel') returning id`, [U.C]);
  await q(`update brands set status = 'approved' where id in ($1, $2)`, [rest.id, wear.id]);
  const [dish] = await as(U.D, `insert into brand_products (brand_id, name, price_sar, kcal, protein_g, carbs_g, fat_g) values ($1, 'دجاج مشوي ورز بني', 38, 560, 48, 55, 14) returning id`, [rest.id]);
  await q(`insert into plans (user_id, source, data, active) values ($1, 'rules', $2, true)`,
    [U.A, JSON.stringify({ targets: { calories: 2250, protein_g: 172, carbs_g: 238, fat_g: 68, bmi: 25, bmr: 1800, water_l: 3 }, days: [], meals: [] })]);

  await expectErr('consent is required', () => as(U.A, `select request_meal_subscription($1, array['lunch','dinner'], null, false)`, [rest.id]), /consent_required/);
  await expectErr('only restaurants take subscriptions', () => as(U.A, `select request_meal_subscription($1, array['lunch'], null, true)`, [wear.id]), /brand_not_approved/);
  const sub = (await as(U.A, `select request_meal_subscription($1, array['lunch','dinner'], 'حساسية مكسرات', true) as id`, [rest.id]))[0].id;
  check('restaurant notified about the request', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'url' = '/store/manage'`, [U.D]))[0].n === 1);
  await expectErr('no duplicate open request', () => as(U.A, `select request_meal_subscription($1, array['lunch'], null, true)`, [rest.id]), /request_pending/);

  const subs = await as(U.D, `select * from restaurant_subscribers($1)`, [rest.id]);
  check('restaurant sees targets and notes only', subs.length === 1 && subs[0].calories === 2250 && subs[0].protein_g === 172 && subs[0].notes === 'حساسية مكسرات'
    && !('weight_kg' in subs[0]) && !('gender' in subs[0]));
  check('other users see nothing', (await as(U.C, `select * from restaurant_subscribers($1)`, [rest.id])).length === 0);
  await expectErr('cannot add meals before accepting', () => as(U.D, `insert into subscription_meals (subscription_id, day, slot, name, kcal) values ($1, current_date, 'lunch', 'x', 100)`, [sub]), /row-level security/);
  await expectErr('only the restaurant can accept', () => as(U.A, `select respond_meal_subscription($1, true)`, [sub]), /not_allowed/);
  await as(U.D, `select respond_meal_subscription($1, true)`, [sub]);
  check('subscriber told it is active', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'url' = '/(tabs)/plan'`, [U.A]))[0].n === 1);

  await as(U.D, `insert into subscription_meals (subscription_id, day, slot, product_id, name, kcal, protein_g, carbs_g, fat_g) values ($1, current_date, 'lunch', $2, 'دجاج مشوي ورز بني', 560, 48, 55, 14)`, [sub, dish.id]);
  const mine = await as(U.A, `select m.name, m.kcal, s.brand_id from subscription_meals m join meal_subscriptions s on s.id = m.subscription_id where m.day = current_date`);
  check('scheduled meal shows up for the subscriber', mine.length === 1 && mine[0].kcal === 560);
  check('strangers cannot see the meals', (await as(U.B, `select 1 from subscription_meals`)).length === 0);
  await expectErr('subscriber cannot edit the kitchen schedule', () => as(U.A, `insert into subscription_meals (subscription_id, day, slot, name, kcal) values ($1, current_date, 'dinner', 'fake', 10)`, [sub]), /row-level security/);

  await as(U.A, `select end_meal_subscription($1)`, [sub]);
  check('ending stops sharing targets', (await as(U.D, `select * from restaurant_subscribers($1)`, [rest.id])).length === 0);
  await expectErr('restaurant cannot add meals after it ends', () => as(U.D, `insert into subscription_meals (subscription_id, day, slot, name, kcal) values ($1, current_date + 1, 'lunch', 'x', 100)`, [sub]), /row-level security/);
  check('restaurant told the subscription ended', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' like 'mse:%'`, [U.D]))[0].n === 1);
  check('past meals stay in the subscriber history', (await as(U.A, `select count(*)::int n from subscription_meals`))[0].n === 1);
  const again = (await as(U.A, `select request_meal_subscription($1, array['dinner'], null, true) as id`, [rest.id]))[0].id;
  await as(U.D, `select respond_meal_subscription($1, false)`, [again]);
  check('restaurant can decline a request', (await q(`select status from meal_subscriptions where id = $1`, [again]))[0].status === 'declined');
})();
