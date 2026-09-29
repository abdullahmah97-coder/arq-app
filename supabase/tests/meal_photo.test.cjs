// اختبارات حد تحليل صور الوجبات: ٢٥ باليوم لكل مستخدم، ما أحد يزوّر العداد، ولازم تسجيل دخول
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  const left = [];
  for (let i = 0; i < 25; i++) left.push((await as(U.A, `select ai_take('meal_photo') as n`))[0].n);
  check('25 analyses allowed per day, remaining counts down', left[0] === 24 && left[24] === 0, JSON.stringify(left.slice(0, 3)));
  await expectErr('26th analysis blocked', () => as(U.A, `select ai_take('meal_photo')`), /rate_limited/);
  check('other users unaffected', (await as(U.B, `select ai_take('meal_photo') as n`))[0].n === 24);

  await q(`update ai_usage set created_at = now() - interval '25 hours' where user_id = $1`, [U.A]);
  check('limit resets after a day', (await as(U.A, `select ai_take('meal_photo') as n`))[0].n === 24);

  await expectErr('unknown kind rejected', () => as(U.A, `select ai_take('essay')`), /bad_status/);
  await expectErr('signed-out users blocked', () => as(null, `select ai_take('meal_photo')`), /not_authenticated|permission denied/);
  await expectErr('cannot insert usage rows directly', () => as(U.A, `insert into ai_usage (user_id, kind) values ($1, 'meal_photo')`, [U.A]), /row-level security/);
  const rows = await as(U.A, `update ai_usage set created_at = now() - interval '3 days' returning 1`);
  check('cannot rewind own usage', rows.length === 0);
  check('users see only their own usage', (await as(U.B, `select count(*)::int n from ai_usage`))[0].n === 1);
})();
