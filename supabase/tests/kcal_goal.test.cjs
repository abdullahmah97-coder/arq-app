// اختبارات هدف السعرات الشخصي: كل واحد يعدّل هدفه هو بس، وبحدود معقولة، والهدف خاص (ما يطلع لغيره)
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U } = await setup();
  const goalOf = async (uid) => (await q(`select kcal_goal from health_profiles where user_id = $1`, [uid]))[0]?.kcal_goal ?? null;
  const publicGoal = async (uid) => (await q(`select kcal_goal from profiles where id = $1`, [uid]))[0].kcal_goal;

  // التطبيق الجديد: يكتب في health_profiles مباشرة
  await as(U.A, `update health_profiles set kcal_goal = 1900 where user_id = $1`, [U.A]);
  check('set my own goal (private table)', (await goalOf(U.A)) === 1900);
  check('I can read my own goal', (await as(U.A, `select kcal_goal from health_profiles where user_id = $1`, [U.A]))[0]?.kcal_goal === 1900);
  check('nobody else can read it', (await as(U.B, `select kcal_goal from health_profiles where user_id = $1`, [U.A])).length === 0);
  check('the public profile never carries it', (await as(U.B, `select kcal_goal from profiles where id = $1`, [U.A]))[0].kcal_goal === null);
  await as(U.A, `update health_profiles set kcal_goal = null where user_id = $1`, [U.A]);
  check('back to the plan goal (null)', (await goalOf(U.A)) === null);
  await expectErr('too low rejected', () => as(U.A, `update health_profiles set kcal_goal = 300 where user_id = $1`, [U.A]), /check constraint/);
  await expectErr('too high rejected', () => as(U.A, `update health_profiles set kcal_goal = 9000 where user_id = $1`, [U.A]), /check constraint/);
  const other = await as(U.A, `update health_profiles set kcal_goal = 2000 where user_id = $1 returning 1`, [U.B]);
  check("cannot change someone else's goal", other.length === 0 && (await goalOf(U.B)) === null);

  // نسخ التطبيق القديمة: تكتب profiles.kcal_goal ← ينتقل للجدول الخاص والعام يبقى فاضي
  await as(U.A, `update profiles set kcal_goal = 2100 where id = $1`, [U.A]);
  check('old app: goal lands in the private table', (await goalOf(U.A)) === 2100);
  check('old app: public column stays empty', (await publicGoal(U.A)) === null);
  await as(U.A, `update profiles set kcal_goal = null where id = $1`, [U.A]);
  check('old app: «back to plan goal» clears the private goal too', (await goalOf(U.A)) === null);
  await expectErr('old app: out-of-range still rejected', () => as(U.A, `update profiles set kcal_goal = 300 where id = $1`, [U.A]), /check constraint/);
  const viaOld = await as(U.A, `update profiles set kcal_goal = 2000 where id = $1 returning 1`, [U.B]);
  check("old app: cannot change someone else's goal", viaOld.length === 0 && (await goalOf(U.B)) === null);
  await as(U.A, `update health_profiles set kcal_goal = 1800 where user_id = $1`, [U.A]);
  await as(U.A, `update profiles set bio = 'hello' where id = $1`, [U.A]);
  check('other profile edits leave the goal alone', (await goalOf(U.A)) === 1800);
  await q(`delete from health_profiles where user_id = $1`, [U.C]);
  await as(U.C, `update profiles set kcal_goal = 2500 where id = $1`, [U.C]);
  check('old app: no health row yet → created with the goal', (await goalOf(U.C)) === 2500);

  // الترحيل: الأهداف اللي كانت بالجدول العام تنتقل (ولو ما عنده صف صحي ينشأ)، ويتشغّل مرتين بأمان
  await q(`alter table profiles disable trigger kcal_goal_private`);
  await q(`update profiles set kcal_goal = 2300 where id = $1`, [U.B]);
  await q(`delete from health_profiles where user_id = $1`, [U.D]);
  await q(`update profiles set kcal_goal = 1700 where id = $1`, [U.D]);
  await q(`alter table profiles enable trigger kcal_goal_private`);
  const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261002000830_kcal_goal_private.sql'), 'utf8');
  await db.exec(mig);
  check('migration copies existing goals', (await goalOf(U.B)) === 2300 && (await goalOf(U.D)) === 1700);
  check('migration empties the public column', (await q(`select count(*)::int n from profiles where kcal_goal is not null`))[0].n === 0);
  check('migration keeps goals already in the private table', (await goalOf(U.A)) === 1800 && (await goalOf(U.C)) === 2500);
  await db.exec(mig);
  check('running it again changes nothing', (await goalOf(U.B)) === 2300 && (await goalOf(U.D)) === 1700 && (await goalOf(U.A)) === 1800);
  await as(U.B, `update profiles set kcal_goal = 2000 where id = $1`, [U.B]);
  check('trigger still works after a re-run', (await goalOf(U.B)) === 2000 && (await publicGoal(U.B)) === null);
})();
