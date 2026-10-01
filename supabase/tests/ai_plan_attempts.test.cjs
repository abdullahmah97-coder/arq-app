// اختبارات حد محاولات خطة الذكاء الاصطناعي: ٨ باليوم لكل مستخدم، تنحجز قبل الاستدعاء (ما تتعدّى ولو الطلبات متزامنة)
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  const left = [];
  for (let i = 0; i < 8; i++) left.push((await as(U.A, `select ai_take('plan') as n`))[0].n);
  check('8 plan attempts a day, counting down', left.join() === '7,6,5,4,3,2,1,0', left.join());
  await expectErr('9th attempt blocked', () => as(U.A, `select ai_take('plan')`), /rate_limited/);
  check('the blocked attempt is not recorded', (await q(`select count(*)::int n from ai_usage where user_id = $1 and kind = 'plan'`, [U.A]))[0].n === 8);
  check('other users unaffected', (await as(U.B, `select ai_take('plan') as n`))[0].n === 7);
  check('meal photos and barcode keep their own limits', (await as(U.A, `select ai_take('meal_photo') as n`))[0].n === 24 && (await as(U.A, `select ai_take('barcode') as n`))[0].n === 1);
  await q(`update ai_usage set created_at = now() - interval '25 hours' where user_id = $1 and kind = 'plan'`, [U.A]);
  check('limit resets after a day', (await as(U.A, `select ai_take('plan') as n`))[0].n === 7);
  await expectErr('signed-out callers rejected', () => as(null, `select ai_take('plan')`), /permission denied|not_authenticated/);
  await expectErr('unknown kind still rejected', () => as(U.A, `select ai_take('essay')`), /bad_status/);
  await expectErr('cannot insert attempts directly', () => as(U.A, `insert into ai_usage (user_id, kind) values ($1, 'plan')`, [U.A]), /row-level security/);
  const wiped = await as(U.A, `delete from ai_usage where kind = 'plan' returning 1`);
  check('cannot delete own attempts to reset the limit', wiped.length === 0);
})();
