// مالك التطبيق (هو بس): شارة «المالك»، النشر بدون شرط الرتبة، وإخفاء أجزاء التطبيق عن الكل
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const DAYS = JSON.stringify([{ title: 'Upper', exercises: [{ exercise_id: 'bench_bb', sets: 3, reps: '8-10', rest_sec: 120, rir: '1-2' }] }]);
  const OWNER = 'c152b11b-8139-4553-811f-226935f18c3f';

  // المالك الحقيقي غير موجود في بيئة الاختبار: نعلّم B كمالك (مثل ما سوّت الهجرة لحسابه)
  check('only the real owner id is flagged (not in the test data, so nobody here)', (await q(`select count(*)::int n from profiles where is_owner`))[0].n === 0);
  check('the migration names the real owner', /c152b11b-8139-4553-811f-226935f18c3f/.test(require('fs').readFileSync(require('path').join(__dirname, '../migrations/20260930000800_owner_powers.sql'), 'utf8')) && !!OWNER);
  await q(`update profiles set is_owner = true where id = $1`, [U.B]);

  check('is_owner(): the owner yes, others no', (await as(U.B, `select is_owner() v`))[0].v === true && (await as(U.A, `select is_owner() v`))[0].v === false);
  check('an admin is not automatically the owner', (await as(U.E, `select is_owner() v`))[0].v === false);
  await expectErr('nobody can make themselves owner', () => as(U.A, `update profiles set is_owner = true where id = $1`, [U.A]), /permission denied/);

  // النشر
  await expectErr('a new user still cannot post tips', () => as(U.A, `insert into tips (author, body) values ($1, 'اشرب مويه')`, [U.A]), /row-level security/);
  await q(`update profiles set points = 0 where id = $1`, [U.B]);
  const tip = await as(U.B, `insert into tips (author, body, tag) values ($1, 'نم ٨ ساعات', 'recovery') returning id`, [U.B]);
  check('the owner posts tips with 0 points', tip.length === 1);
  const prog = await as(U.B, `insert into user_programs (author, title, level, days) values ($1, 'برنامج المالك', 'beginner', $2::jsonb) returning id`, [U.B, DAYS]);
  check('the owner publishes workout programs with 0 points', prog.length === 1);
  check('can_publish is true for the owner for both', (await as(U.B, `select can_publish('tip') a, can_publish('program') b`))[0].a === true);

  // إخفاء أجزاء التطبيق
  await as(U.B, `insert into app_hidden (key, label) values ('home.sleep', 'بطاقة النوم')`);
  check('the owner hides a part of the app', (await q(`select hidden_by from app_hidden where key = 'home.sleep'`))[0]?.hidden_by === U.B);
  check('everyone signed in can read what is hidden', (await as(U.A, `select key from app_hidden`)).some((r) => r.key === 'home.sleep'));
  await expectErr('others cannot hide parts', () => as(U.A, `insert into app_hidden (key) values ('home.pulse')`), /row-level security/);
  await expectErr('an admin who is not the owner cannot hide parts either', () => as(U.E, `insert into app_hidden (key) values ('home.pulse')`), /row-level security/);
  const un = await as(U.A, `delete from app_hidden where key = 'home.sleep' returning key`);
  check('others cannot un-hide', un.length === 0);
  await expectErr('bad keys are rejected', () => as(U.B, `insert into app_hidden (key) values ('Home Sleep!')`), /check constraint/);
  const del = await as(U.B, `delete from app_hidden where key = 'home.sleep' returning key`);
  check('the owner shows it again', del.length === 1);
  await expectErr('signed-out visitors cannot read the list', () => as(null, `select * from app_hidden`), /permission denied/);
})().catch((e) => { console.error(e); process.exit(1); });
