// تبديل الخطة بخطوة وحدة، وحد الدقيقة لفيديو المحادثة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const plan = async (uid, active) => (await q(`insert into plans (user_id, source, data, active) values ($1, 'rules', '{}'::jsonb, $2) returning id`, [uid, active]))[0].id;
  const p1 = await plan(U.A, true);
  const p2 = await plan(U.A, false);
  await as(U.A, `select activate_plan($1)`, [p2]);
  const act = await q(`select id from plans where user_id = $1 and active`, [U.A]);
  check('the new plan becomes the only active one in one step', act.length === 1 && act[0].id === p2);
  await as(U.A, `select activate_plan($1)`, [p2]);
  check('activating the active plan again changes nothing', (await q(`select count(*)::int n from plans where user_id = $1 and active`, [U.A]))[0].n === 1);
  await expectErr('nobody can activate someone else’s plan', () => as(U.B, `select activate_plan($1)`, [p1]), /not_allowed/);
  check('…and the owner’s active plan stays', (await q(`select active from plans where id = $1`, [p2]))[0].active === true);
  await expectErr('signed-out visitors cannot', () => as(null, `select activate_plan($1)`, [p1]), /permission denied|not_allowed/);

  // فيديو المحادثة
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);
  const vid = (dur) => as(U.A, `insert into messages (sender, recipient, body, media_path, media_type, media_dur) values ($1, $2, '', $3, 'video', $4) returning id`,
    [U.A, U.B, `${U.A}/${U.B}/v${Math.random().toString(36).slice(2, 7)}.mp4`, dur]);
  check('a 58-second video is fine', (await vid(58.4)).length === 1);
  await expectErr('a 3-minute video is refused', () => vid(180), /messages_video_minute/);
})().catch((e) => { console.error(e); process.exit(1); });
