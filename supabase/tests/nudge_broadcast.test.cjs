// «أرسل الحين» للتنبيهات التحفيزية: الإدارة ترسل نص الحين لجمهوره بنفس شروط نوعه
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym } = await setup();
  const bc = async (tpl, when, send) => (await q('select _nudge_broadcast($1, $2, $3) n', [tpl, when, send]))[0].n;
  const last = async (uid) => (await q(`select data, actor_id from notifications where user_id = $1 and kind = 'nudge' order by id desc limit 1`, [uid]))[0];
  const addTpl = async (row) => (await as(U.E, `insert into nudge_templates (category, gender, friend_gender, locale, title, body)
      values ($1, $2, $3, $4, $5, $6) returning id`, [row.category, row.gender ?? 'all', row.friend_gender ?? 'all', row.locale ?? 'ar', row.title, row.body]))[0].id;

  // A رجل، B امرأة، C بدون جنس (يعامل رجل) — D و E ما أكملوا التسجيل
  await q(`update profiles set onboarded = true, notify_prefs = notify_prefs - 'nudges' where id in ($1, $2, $3)`, [U.A, U.B, U.C]);
  await q(`update health_profiles set gender = 'male' where user_id = $1`, [U.A]);
  await q(`update health_profiles set gender = 'female' where user_id = $1`, [U.B]);
  await q(`update plans set active = false`);

  const gymM = await addTpl({ category: 'gym', gender: 'male', title: 'يلا {name} 💪', body: 'روح {gym} اليوم يا {name}' });
  const noon = (d) => `2030-01-${d} 12:00:00+03`;

  // الصلاحيات
  await expectErr('regular users cannot send to everyone', () => as(U.A, 'select admin_broadcast_nudge($1, true)', [gymM]), /not_allowed/);
  await expectErr('regular users cannot call the inner function', () => as(U.A, 'select _nudge_broadcast($1, now(), true)', [gymM]), /permission denied/);
  await expectErr('deleted text → clear error', () => as(U.E, 'select admin_broadcast_nudge($1, true)', ['00000000-0000-0000-0000-000000000000']), /nudge_not_found/);

  // ساعات الهدوء
  await expectErr('quiet at night (11 PM)', () => bc(gymM, '2030-01-06 23:00:00+03', true), /quiet_hours/);
  await expectErr('quiet early morning (7:30 AM)', () => bc(gymM, '2030-01-06 07:30:00+03', true), /quiet_hours/);

  // المعاينة ما ترسل شي
  const dry = await bc(gymM, noon('06'), false);
  check('preview counts the men (A + C without gender), not the woman', dry === 2, `n=${dry}`);
  check('preview sends nothing', (await q(`select count(*)::int n from nudge_log`))[0].n === 0
    && (await q(`select count(*)::int n from notifications where kind = 'nudge'`))[0].n === 0);

  // الإرسال
  const sent = await bc(gymM, noon('06'), true);
  const nA = await last(U.A);
  check('send reaches the same 2 people', sent === 2, `n=${sent}`);
  check('text is filled for each person (name + gym, no {braces})', nA?.data.title === 'يلا Ahmed 💪' && nA.data.body === 'روح النادي اليوم يا Ahmed'
    && nA.data.cat === 'gym' && nA.data.url === '/checkin', JSON.stringify(nA));
  check('the woman gets nothing from a men text', !(await last(U.B)));
  check('it is logged like the scheduler (slot gym, this text)',
    (await q(`select template_id from nudge_log where user_id = $1 and day = '2030-01-06' and slot = 'gym'`, [U.A]))[0]?.template_id === gymM);
  check('pressing again the same day sends nothing (one per type per day)', (await bc(gymM, '2030-01-06 15:00:00+03', true)) === 0);
  check('the scheduler does not repeat the gym slot that day', (await q('select run_nudges($1) n', ['2030-01-06 17:10:00+03']))[0].n >= 0
    && (await q(`select count(*)::int n from nudge_log where user_id = $1 and day = '2030-01-06' and slot = 'gym'`, [U.A]))[0].n === 1);

  // اللي حضر اليوم ما يوصله «روح النادي»
  await q(`insert into check_ins (user_id, gym_id, checked_in_at) values ($1, $2, '2030-01-07 10:00:00+03')`, [U.C, gym.id]);
  check('who already checked in today is skipped', (await bc(gymM, noon('07'), false)) === 1);

  // اللي موقف التحفيز
  await q(`update profiles set notify_prefs = notify_prefs || '{"nudges": false}' where id = $1`, [U.A]);
  check('respects "motivation off" in settings', (await bc(gymM, noon('08'), false)) === 1);
  await q(`update profiles set notify_prefs = notify_prefs - 'nudges' where id = $1`, [U.A]);

  // الحد ٣ باليوم
  await q(`insert into nudge_log (user_id, day, slot, category) values ($1, '2030-01-09', 'workout', 'workout'), ($1, '2030-01-09', 'meal', 'meal'), ($1, '2030-01-09', 'streak', 'streak')`, [U.C]);
  check('never more than 3 a day', (await bc(gymM, noon('09'), false)) === 1);

  // حسابات الشركاء ما توصلها
  await q(`update profiles set account_type = 'club' where id = $1`, [U.C]);
  check('partner accounts are not included', (await bc(gymM, noon('10'), false)) === 1);
  await q(`update profiles set account_type = 'trainee' where id = $1`, [U.C]);

  // اللغة: النص الإنجليزي للي لغتهم إنجليزي بس
  const gymEn = await addTpl({ category: 'gym', locale: 'en', title: 'Gym time', body: '{name}, head to {gym}!' });
  await q(`update profiles set locale = 'en' where id = $1`, [U.B]);
  check('English text only reaches English users', (await bc(gymEn, noon('10'), false)) === 1);
  await bc(gymEn, noon('10'), true);
  const nB = await last(U.B);
  check('English filling (the gym)', nB?.data.body === 'Sara, head to the gym!', JSON.stringify(nB));
  await q(`update profiles set locale = 'ar' where id = $1`, [U.B]);

  // صديقك سبقك: لازم صديق حضر اليوم، واسمه يتعبّى
  const frF = await addTpl({ category: 'friend', gender: 'female', title: '{friend} سبقك 👀', body: '{friend} في النادي وأنتِ لا يا {name}' });
  check('friend text: nobody if no friend checked in', (await bc(frF, noon('13'), false)) === 0);
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);
  await q(`insert into check_ins (user_id, gym_id, checked_in_at) values ($1, $2, '2030-01-13 09:00:00+03')`, [U.A, gym.id]);
  check('friend text: counted once her friend checked in', (await bc(frF, noon('13'), true)) === 1);
  const fB = await last(U.B);
  check('friend text: friend name filled and friend shown as the sender', fB?.actor_id === U.A && fB.data.title === 'Ahmed سبقك 👀'
    && fB.data.cat === 'friend' && !fB.data.body.includes('{'), JSON.stringify(fB));
  const frOnlyF = await addTpl({ category: 'friend', gender: 'female', friend_gender: 'female', title: '{friend} سبقتك', body: '{friend} راحت النادي يا {name}' });
  await q(`insert into check_ins (user_id, gym_id, checked_in_at) values ($1, $2, '2030-01-14 09:00:00+03')`, [U.A, gym.id]);
  check('friend text written for a female friend is skipped when the friend is a man',
    (await bc(frOnlyF, noon('14'), false)) === 0 && (await bc(frF, noon('14'), false)) === 1);

  // السلسلة: يومين فأكثر وآخر حضور أمس
  const stk = await addTpl({ category: 'streak', title: 'سلسلتك {streak} يوم 🔥', body: 'لا تكسرها يا {name}' });
  await q(`update profiles set streak = 4, last_checkin_on = '2030-01-14' where id = $1`, [U.C]);
  await q(`update profiles set streak = 0 where id in ($1, $2)`, [U.A, U.B]);
  check('streak text only for a 2+ streak that ends yesterday', (await bc(stk, noon('15'), true)) === 1);
  check('streak number filled', (await last(U.C))?.data.title === 'سلسلتك 4 يوم 🔥', JSON.stringify(await last(U.C)));

  // التمرين: لمن عنده خطة وتمرين اليوم وما بدأه
  const wk = await addTpl({ category: 'workout', gender: 'male', title: 'يوم {workout}', body: 'تمرينك اليوم: {workout}' });
  check('workout text: nobody without a plan', (await bc(wk, noon('16'), false)) === 0);
  // 2030-01-16 أربعاء = 3
  await q(`insert into plans (user_id, source, data, active) values ($1, 'rules', $2, true)`,
    [U.A, JSON.stringify({ days: [{ day: 3, focus: { ar: 'صدر وتراي', en: 'Chest' } }, { day: 4, rest: true }] })]);
  check('workout text: plan day counts', (await bc(wk, noon('16'), true)) === 1);
  check('workout name filled from the plan', (await last(U.A))?.data.body === 'تمرينك اليوم: صدر وتراي', JSON.stringify(await last(U.A)));
  check('workout text: rest day skipped', (await bc(wk, noon('17'), false)) === 0);

  // الوجبات: يتابع أكله وما سجّل اليوم
  const ml = await addTpl({ category: 'meal', title: 'وش أكلت؟', body: 'سجّل وجبتك يا {name}' });
  await q(`insert into food_logs (user_id, eaten_on, slot, name, kcal) values ($1, '2030-01-15', 'lunch', 'رز', 500)`, [U.B]);
  await q(`insert into food_logs (user_id, eaten_on, slot, name, kcal) values ($1, '2030-01-16', 'lunch', 'رز', 500)`, [U.C]);
  // A: عنده خطة، B: سجّل قبل أمس، C: سجّل اليوم → A و B
  check('meal text: plan or recent food logging, and nothing logged today', (await bc(ml, noon('16'), false)) === 2);

  // من التطبيق (الوقت الحقيقي): المعاينة ترجع رقم أو «وقت الهدوء»
  let real;
  try { real = (await as(U.E, 'select admin_broadcast_nudge($1, false) n', [gymEn]))[0].n; }
  catch (e) { real = e.message; }
  if (typeof real === 'number') {
    const row = (await q(`select last_broadcast_at, last_broadcast_n from nudge_templates where id = $1`, [gymEn]))[0];
    const log = (await q(`select action from admin_log where kind = 'nudge' and target = $1`, [gymEn]))[0];
    check('real send saves "last sent" on the text and the admin log', row.last_broadcast_at && row.last_broadcast_n === real && log?.action === 'broadcast');
  } else {
    check('real send at night is refused with quiet_hours', /quiet_hours/.test(real), real);
  }
})().catch((e) => { console.error(e); process.exit(1); });
