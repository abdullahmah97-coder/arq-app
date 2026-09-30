// تنبيهات التحفيز: النص الجديد (أو المعدّل / المفعّل من جديد) يوصل أول لكل متدرب، وبعدها تتناوب النصوص
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, U } = await setup();
  const addTpl = async (title, locale = 'ar', gender = 'all') => (await as(U.E, `insert into nudge_templates (category, gender, locale, title, body)
      values ('gym', $1, $2, $3, 'روح النادي يا {name}') returning id`, [gender, locale, title]))[0].id;
  // المجدول نفسه (_send_nudge) ليوم معيّن، ويرجع أي نص انرسل
  const send = async (uid, day, locale = 'ar') => {
    await q(`select _send_nudge($1, $2::date, 'gym', 'gym', 'male', $3, '{"name":"أحمد"}'::jsonb, '/checkin')`, [uid, `2030-02-${day}`, locale]);
    return (await q(`select template_id from nudge_log where user_id = $1 and day = $2::date and slot = 'gym'`, [uid, `2030-02-${day}`]))[0]?.template_id;
  };
  await q(`update profiles set onboarded = true where id in ($1, $2)`, [U.A, U.B]);
  // النصوص الجاهزة من البداية توقف عشان نختبر نصوصنا بس
  await q(`update nudge_templates set active = false`);

  const t1 = await addTpl('نص قديم ١');
  const t2 = await addTpl('نص قديم ٢');
  check('the newest text goes first', (await send(U.A, '01')) === t2);
  check('then the one they have not had yet', (await send(U.A, '02')) === t1);
  check('when they had them all, the one they had longest ago (rotation)', (await send(U.A, '03')) === t2);

  const t3 = await addTpl('نص جديد كتبته الإدارة الحين');
  check('a text written now goes out next (not an old one)', (await send(U.A, '04')) === t3);
  check('…also to someone who never got a nudge (newest first)', (await send(U.B, '04')) === t3);
  const pushed = (await q(`select data from notifications where user_id = $1 and kind = 'nudge' order by id desc limit 1`, [U.A]))[0];
  check('the notification carries the new text', pushed?.data.title === 'نص جديد كتبته الإدارة الحين', JSON.stringify(pushed?.data));

  await as(U.E, `update nudge_templates set body = 'نص معدّل: يلا يا {name}' where id = $1`, [t1]);
  check('an edited text counts as new → goes out next', (await send(U.A, '05')) === t1);
  const n5 = (await q(`select data from notifications where user_id = $1 and kind = 'nudge' order by id desc limit 1`, [U.A]))[0];
  check('…with the edited words', n5?.data.body === 'نص معدّل: يلا يا أحمد', JSON.stringify(n5?.data));

  await as(U.E, `update nudge_templates set active = false where id = $1`, [t2]);
  check('a stopped text is never sent', (await send(U.A, '06')) !== t2);
  await as(U.E, `update nudge_templates set active = true where id = $1`, [t2]);
  check('turning it back on counts as new', (await send(U.A, '07')) === t2);

  const before = (await q(`select content_at from nudge_templates where id = $1`, [t3]))[0].content_at;
  await q(`update nudge_templates set last_broadcast_at = now(), last_broadcast_n = 3 where id = $1`, [t3]);
  const after = (await q(`select content_at from nudge_templates where id = $1`, [t3]))[0].content_at;
  check('«send now» bookkeeping does not make a text «new» again', +before === +after);

  const en = await addTpl('English newest', 'en');
  check('the person\'s language still comes first (Arabic user never gets the newer English text)', (await send(U.A, '08')) !== en);
  check('English user gets the English text', (await send(U.B, '08', 'en')) === en);

  const men = await addTpl('للرجال فقط', 'ar', 'male');
  const women = await addTpl('للنساء فقط', 'ar', 'female');
  check('gender still respected (men text for a man, never the women text)', (await send(U.A, '09')) === men);
  check('…the women text is skipped for him', (await q(`select count(*)::int n from nudge_log where user_id = $1 and template_id = $2`, [U.A, women]))[0].n === 0);

  console.log('\nnudge rotation tests done');
})().catch((e) => { console.error(e); process.exit(1); });
