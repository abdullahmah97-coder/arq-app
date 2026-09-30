// التايم لاين: أنا وأصدقائي بس — المنشورات، «صحى ☀️»، والحضور، مع اللايك والتعليق وخيارات المشاركة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  const tl = async (uid) => as(uid, `select item_type, id, user_id, caption, gym_name, meta, like_count, comment_count, liked_by_me from timeline(now() + interval '1 minute', 50)`);
  const has = (rows, pred) => rows.some(pred);

  // A و B أصدقاء، C مو صديق
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);

  // منشورات
  const pA = (await as(U.A, `insert into posts (user_id, caption) values ($1, 'تمرين صدر اليوم 💪') returning id`, [U.A]))[0].id;
  const pB = (await as(U.B, `insert into posts (user_id, caption, visibility) values ($1, 'صباح الخير', 'friends') returning id`, [U.B]))[0].id;
  const pC = (await as(U.C, `insert into posts (user_id, caption, visibility) values ($1, 'منشور عام من غريب', 'public') returning id`, [U.C]))[0].id;

  // حضور
  const [{ id: ciB }] = await visit(U.B, gym.id, "now() - interval '2 hours'");
  const [{ id: ciA }] = await visit(U.A, gym.id, "now() - interval '3 hours'");
  const [{ id: ciC }] = await visit(U.C, gym.id, "now() - interval '1 hours'");

  let a = await tl(U.A);
  check('my own post is in my timeline', has(a, (r) => r.id === pA && r.item_type === 'post'));
  check('a friend\'s post shows', has(a, (r) => r.id === pB));
  check('a stranger\'s public post does NOT show (friends only)', !has(a, (r) => r.id === pC));
  check('a friend\'s gym check-in shows with the gym name', has(a, (r) => r.id === ciB && r.item_type === 'checkin' && r.gym_name === gym.name));
  check('my own check-in shows', has(a, (r) => r.id === ciA && r.item_type === 'checkin'));
  check('a stranger\'s check-in does NOT show', !has(a, (r) => r.id === ciC));
  check('check-in item carries its check-out time', has(a, (r) => r.id === ciB && r.meta && 'out' in r.meta));
  const order = a.map((r) => r.id);
  check('newest first', order.indexOf(pB) < order.indexOf(ciB) && order.indexOf(ciB) < order.indexOf(ciA));

  // خيارات المشاركة
  await as(U.B, `update profiles set share_checkins = false where id = $1`, [U.B]);
  check('friend turned off check-in sharing → hidden from me', !has(await tl(U.A), (r) => r.id === ciB));
  check('…but I still see my own check-ins in my timeline', has(await tl(U.B), (r) => r.id === ciB));
  await as(U.B, `update profiles set share_checkins = true, presence_visibility = 'hidden' where id = $1`, [U.B]);
  check('friend in hidden mode → check-ins hidden', !has(await tl(U.A), (r) => r.id === ciB));
  await as(U.B, `update profiles set presence_visibility = 'gym' where id = $1`, [U.B]);
  check('back to normal → shows again', has(await tl(U.A), (r) => r.id === ciB));

  // «صحى ☀️»
  const hour = Number((await q(`select extract(hour from now() at time zone 'Asia/Riyadh') h`))[0].h);
  if (hour < 3) {
    await expectErr('before 3 AM Riyadh → bad_time', () => as(U.A, `select post_wake(now(), 'open', 'صحى')`), /bad_time/);
  } else {
    const w1 = (await as(U.A, `select post_wake(now() - interval '1 minute', 'alarm', 'صحى ☀️ ٦:٣٠') id`))[0].id;
    check('wake post created', !!w1);
    const w2 = (await as(U.A, `select post_wake(now(), 'open', 'مرة ثانية') id`))[0].id;
    check('only one wake post a day (same id returned)', w2 === w1);
    const wakes = await q(`select meta, caption, visibility from posts where user_id = $1 and kind = 'wake'`, [U.A]);
    check('stored once, friends-only, with the time and source', wakes.length === 1 && wakes[0].visibility === 'friends' && wakes[0].meta.src === 'alarm' && !!wakes[0].meta.at);
    check('wake shows in my friend\'s timeline', has(await tl(U.B), (r) => r.id === w1 && r.item_type === 'wake'));
    check('…and not in a stranger\'s', !has(await tl(U.C), (r) => r.id === w1));

    // لايك وتعليق
    await as(U.B, `insert into post_likes (post_id, user_id) values ($1, $2)`, [w1, U.B]);
    await as(U.B, `insert into comments (post_id, user_id, body) values ($1, $2, 'صباح النور 🌞')`, [w1, U.B]);
    const wB = (await tl(U.B)).find((r) => r.id === w1);
    check('like + comment counted on the wake post', Number(wB.like_count) === 1 && Number(wB.comment_count) === 1 && wB.liked_by_me === true);
    const wA = (await tl(U.A)).find((r) => r.id === w1);
    check('liked_by_me is per viewer', wA.liked_by_me === false);
    const f = (await as(U.B, `select kind, meta from feed(now(), 1, $1)`, [w1]))[0];
    check('post page (feed) returns kind + meta', f && f.kind === 'wake' && f.meta.src === 'alarm');

    // تحقق من المدخلات
    await expectErr('unknown source', () => as(U.B, `select post_wake(now(), 'x', 'a')`), /bad_input/);
    await expectErr('tomorrow is not allowed', () => as(U.B, `select post_wake(now() + interval '1 day', 'open', 'a')`), /bad_time/);
    await expectErr('yesterday is not allowed', () => as(U.B, `select post_wake(now() - interval '1 day', 'open', 'a')`), /bad_time/);
    await expectErr('wake posts cannot be inserted directly', () => as(U.B, `insert into posts (user_id, kind, caption) values ($1, 'wake', 'x')`, [U.B]), /row-level security/);
    await as(U.C, `update profiles set share_wake = false where id = $1`, [U.C]);
    check('sharing off → nothing posted', (await as(U.C, `select post_wake(now(), 'open', 'x') id`))[0].id === null);
  }

  // لايك على حضور صديق من التايم لاين
  await as(U.A, `insert into checkin_likes (check_in_id, user_id) values ($1, $2)`, [ciB, U.A]);
  const cB = (await tl(U.A)).find((r) => r.id === ciB);
  check('like on a friend\'s check-in counted', Number(cB.like_count) === 1 && cB.liked_by_me === true);
  await expectErr('a stranger cannot like my friend\'s check-in', () => as(U.C, `insert into checkin_likes (check_in_id, user_id) values ($1, $2)`, [ciA, U.C]), /row-level security/);

  // بعد إلغاء الصداقة
  await q(`delete from friendships where requester = $1 and addressee = $2`, [U.A, U.B]);
  a = await tl(U.A);
  check('after unfriending, their posts and check-ins disappear', !has(a, (r) => r.user_id === U.B));
  check('anonymous users cannot read the timeline', await as(null, `select 1 from timeline()`).then(() => false, () => true));

  console.log('\ntimeline tests done');
})().catch((e) => { console.error(e); process.exit(1); });
