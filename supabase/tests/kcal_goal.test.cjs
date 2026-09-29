// اختبارات هدف السعرات الشخصي: كل واحد يعدّل هدفه هو بس، وبحدود معقولة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  await as(U.A, `update profiles set kcal_goal = 1900 where id = $1`, [U.A]);
  check('set my own goal', (await q(`select kcal_goal from profiles where id = $1`, [U.A]))[0].kcal_goal === 1900);
  await as(U.A, `update profiles set kcal_goal = null where id = $1`, [U.A]);
  check('back to the plan goal (null)', (await q(`select kcal_goal from profiles where id = $1`, [U.A]))[0].kcal_goal === null);
  await expectErr('too low rejected', () => as(U.A, `update profiles set kcal_goal = 300 where id = $1`, [U.A]), /check constraint/);
  await expectErr('too high rejected', () => as(U.A, `update profiles set kcal_goal = 9000 where id = $1`, [U.A]), /check constraint/);
  const other = await as(U.A, `update profiles set kcal_goal = 2000 where id = $1 returning 1`, [U.B]);
  check("cannot change someone else's goal", other.length === 0 && (await q(`select kcal_goal from profiles where id = $1`, [U.B]))[0].kcal_goal === null);
})();
