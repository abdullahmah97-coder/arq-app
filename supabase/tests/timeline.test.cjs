// التايم لاين: أنا وأصدقائي بس — المنشورات، «صباح الخير ☀️» و«تصبحون على خير 🌙»، والحضور،
// مع التفاعل بالإيموجي والتعليق وخيارات المشاركة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  const tl = async (uid) => as(uid, `select item_type, id, user_id, caption, gym_name, meta, like_count, comment_count, my_reaction, reactors
                                     from timeline(now() + interval '1 minute', 50)`);
  const has = (rows, pred) => rows.some(pred);
  const R = (t) => `2030-01-${t}+03`; // وقت الرياض
  const wake = async (uid, at, src, now) => (await q(`select _post_wake($1, $2, $3, 'صباح الخير ☀️', $4) id`, [uid, R(at), src, R(now)]))[0].id;
  const sleep = async (uid, now) => (await q(`select _post_sleep($1, 'تصبحون على خير 🌙', $2) id`, [uid, R(now)]))[0].id;
  const post = async (id) => (await q(`select kind, meta, caption, visibility, created_at from posts where id = $1`, [id]))[0];

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
  check('no reactions yet → 0, none of mine, empty list', has(a, (r) => r.id === pB && Number(r.like_count) === 0 && r.my_reaction === null && Array.isArray(r.reactors) && !r.reactors.length));

  // خيارات المشاركة
  await as(U.B, `update profiles set share_checkins = false where id = $1`, [U.B]);
  check('friend turned off check-in sharing → hidden from me', !has(await tl(U.A), (r) => r.id === ciB));
  check('…but I still see my own check-ins in my timeline', has(await tl(U.B), (r) => r.id === ciB));
  await as(U.B, `update profiles set share_checkins = true, presence_visibility = 'hidden' where id = $1`, [U.B]);
  check('friend in hidden mode → check-ins hidden', !has(await tl(U.A), (r) => r.id === ciB));
  await as(U.B, `update profiles set presence_visibility = 'gym' where id = $1`, [U.B]);
  check('back to normal → shows again', has(await tl(U.A), (r) => r.id === ciB));

  // ---------- التفاعل بالإيموجي ----------
  await as(U.B, `insert into post_likes (post_id, user_id, emoji) values ($1, $2, 'fire')`, [pA, U.B]);
  let rA = (await tl(U.A)).find((r) => r.id === pA);
  let rB = (await tl(U.B)).find((r) => r.id === pA);
  check('reaction counted, with who and which emoji', Number(rA.like_count) === 1 && rA.reactors.length === 1
    && rA.reactors[0].u === U.B && rA.reactors[0].e === 'fire' && rA.reactors[0].n === 'Sara', JSON.stringify(rA.reactors));
  check('my_reaction is per viewer', rA.my_reaction === null && rB.my_reaction === 'fire');
  const notif = async () => q(`select data from notifications where user_id = $1 and kind = 'post_like' and target_id = $2`, [U.A, pA]);
  const ns = await notif();
  check('owner notified once, with the emoji', ns.length === 1 && ns[0].data.emoji === 'fire' && ns[0].data.post_kind === 'post', JSON.stringify(ns));
  await as(U.B, `update post_likes set emoji = 'strong' where post_id = $1 and user_id = $2`, [pA, U.B]);
  rB = (await tl(U.B)).find((r) => r.id === pA);
  check('changing the reaction keeps one reaction', Number(rB.like_count) === 1 && rB.my_reaction === 'strong' && rB.reactors[0].e === 'strong');
  check('…and does not send a second notification', (await notif()).length === 1);
  await as(U.C, `update post_likes set emoji = 'laugh' where post_id = $1`, [pA]);
  check('nobody can change someone else\'s reaction', (await q(`select emoji from post_likes where post_id = $1`, [pA]))[0].emoji === 'strong');
  await expectErr('a reaction cannot be moved to another post', () => as(U.B, `update post_likes set post_id = $1 where post_id = $2 and user_id = $3`, [pC, pA, U.B]), /permission denied/);
  await expectErr('unknown emoji rejected', () => as(U.A, `insert into post_likes (post_id, user_id, emoji) values ($1, $2, 'poop')`, [pB, U.A]), /check constraint/);
  await as(U.A, `insert into post_likes (post_id, user_id) values ($1, $2)`, [pB, U.A]);
  check('old app versions (no emoji) → ❤️ on posts', (await q(`select emoji from post_likes where post_id = $1 and user_id = $2`, [pB, U.A]))[0].emoji === 'love');
  await as(U.A, `insert into checkin_likes (check_in_id, user_id) values ($1, $2)`, [ciB, U.A]);
  const cB = (await tl(U.A)).find((r) => r.id === ciB);
  check('…and 👏 on check-ins; check-in reactions show in the timeline', cB.my_reaction === 'clap' && Number(cB.like_count) === 1 && cB.reactors[0].e === 'clap');
  await as(U.A, `update checkin_likes set emoji = 'fire' where check_in_id = $1 and user_id = $2`, [ciB, U.A]);
  check('check-in reaction can change too', (await tl(U.A)).find((r) => r.id === ciB).my_reaction === 'fire');
  await expectErr('a stranger cannot react to my friend\'s check-in', () => as(U.C, `insert into checkin_likes (check_in_id, user_id) values ($1, $2)`, [ciA, U.C]), /row-level security/);
  const who = await as(U.A, `select user_id, emoji, full_name from reactions_of('post', $1)`, [pA]);
  check('«who reacted» list for friends', who.length === 1 && who[0].user_id === U.B && who[0].emoji === 'strong', JSON.stringify(who));
  check('…empty for a stranger (friends-only post)', (await as(U.C, `select 1 from reactions_of('post', $1)`, [pA])).length === 0);
  check('«who reacted» on a check-in', (await as(U.B, `select emoji from reactions_of('checkin', $1)`, [ciB]))[0]?.emoji === 'fire');
  await as(U.B, `delete from post_likes where post_id = $1 and user_id = $2`, [pA, U.B]);
  rA = (await tl(U.A)).find((r) => r.id === pA);
  check('removing the reaction', Number(rA.like_count) === 0 && !rA.reactors.length);

  // نص إشعار الجوال
  const txt = async (kind, data, loc) => (await q(`select _notif_text($1, 'فيصل', $2::jsonb, $3) t`, [kind, JSON.stringify(data), loc]))[0].t;
  const t1 = await txt('post_like', { emoji: 'fire', post_kind: 'wake' }, 'ar');
  check('push text: reaction on a good morning (ar)', t1[0].includes('🔥') && t1[1] === 'فيصل تفاعل 🔥 مع صباحك ☀️', JSON.stringify(t1));
  const t2 = await txt('post_like', { emoji: 'laugh', post_kind: 'post' }, 'en');
  check('push text: reaction on a post (en)', t2[1] === 'فيصل reacted 😂 to your post', JSON.stringify(t2));
  const t3 = await txt('checkin_like', { emoji: 'strong' }, 'ar');
  check('push text: reaction on a check-in', t3[1] === 'فيصل تفاعل 💪 مع حضورك للنادي', JSON.stringify(t3));
  const t4 = await txt('post_like', {}, 'ar');
  check('old notifications without emoji keep the old text', t4[1] === 'فيصل أعجبه منشورك', JSON.stringify(t4));

  // ---------- «صباح الخير ☀️» ----------
  const w1 = await wake(U.A, '06 06:30', 'alarm', '06 08:10');
  let w = await post(w1);
  check('morning post created: friends-only, alarm time + source', w.kind === 'wake' && w.visibility === 'friends' && w.meta.src === 'alarm'
    && Date.parse(w.meta.at) === Date.parse(R('06 06:30')) && !('slept' in w.meta), JSON.stringify(w.meta));
  check('only one a day (same id)', (await wake(U.A, '06 09:00', 'open', '06 09:00')) === w1);
  check('…even from the + button', (await wake(U.A, '06 09:05', 'manual', '06 09:05')) === w1);
  await expectErr('before 3 AM Riyadh (no sleep before it) → bad_time', () => wake(U.B, '06 02:30', 'open', '06 02:30'), /bad_time/);
  await expectErr('in the future → bad_time', () => wake(U.B, '06 12:00', 'open', '06 10:00'), /bad_time/);
  await expectErr('yesterday → bad_time', () => wake(U.B, '05 07:00', 'open', '06 09:00'), /bad_time/);
  await expectErr('unknown source', () => wake(U.B, '06 09:00', 'x', '06 09:00'), /bad_input/);
  await q(`update profiles set share_wake = false where id = $1`, [U.C]);
  check('sharing off → nothing posted automatically', (await wake(U.C, '06 07:00', 'open', '06 07:00')) === null);
  check('…but the + button still works', !!(await wake(U.C, '06 07:00', 'manual', '06 07:00')));

  // ---------- «تصبحون على خير 🌙» ثم «صباح الخير» مع كم نام ----------
  const s1 = await sleep(U.A, '06 23:30');
  check('good night posted (friends-only)', (await post(s1)).kind === 'sleep' && (await post(s1)).visibility === 'friends');
  check('pressing again while still asleep → same post', (await sleep(U.A, '06 23:45')) === s1);
  const w2 = await wake(U.A, '07 06:45', 'open', '07 06:50');
  w = await post(w2);
  check('waking after it → how long you slept (7h15m) from the two times only', w2 !== w1 && w.meta.slept === 435 && w.meta.sleep_id === s1, JSON.stringify(w.meta));
  check('then one a day again', (await wake(U.A, '07 09:00', 'open', '07 09:00')) === w2);
  // قيلولة العصر: ينام ٢:٥٢ ويصحى ٩:١٤ الليل
  const s2 = await sleep(U.A, '07 14:52');
  check('a nap is a new good night', s2 !== s1);
  const w3 = await wake(U.A, '07 21:14', 'open', '07 21:14');
  check('waking from a nap → a second morning post that day, with 6h22m', w3 !== w2 && (await post(w3)).meta.slept === 382);
  const s3 = await sleep(U.A, '07 22:00');
  await expectErr('an automatic wake time before the good night → too_soon (try later)', () => wake(U.A, '07 21:50', 'alarm', '07 22:05'), /too_soon/);
  const w4 = await wake(U.A, '07 21:50', 'manual', '07 22:10');
  w = await post(w4);
  check('the + button right after → uses now, no sleep length under 20 min', Date.parse(w.meta.at) === Date.parse(R('07 22:10')) && !('slept' in w.meta) && w.meta.sleep_id === s3, JSON.stringify(w.meta));
  // حد ٤ «تصبحون على خير» خلال ٢٤ ساعة (٢٣:٣٠، ١٤:٥٢، ٢٢:٠٠، ٢٢:٢٠)
  await sleep(U.A, '07 22:20'); await wake(U.A, '07 22:30', 'manual', '07 22:30');
  await expectErr('max 4 good nights a day', () => sleep(U.A, '07 22:40'), /rate_limited/);

  // (الأوقات في ٢٠٣٠، فنطلب التايم لاين قبل فبراير ٢٠٣٠)
  const tl30 = async (uid) => as(uid, `select item_type, id, meta from timeline('2030-02-01', 50)`);
  check('good night shows in my friend\'s timeline', has(await tl30(U.B), (r) => r.id === s1 && r.item_type === 'sleep'));
  check('…and morning with how long I slept', has(await tl30(U.B), (r) => r.id === w2 && r.item_type === 'wake' && r.meta.slept === 435));
  check('…not in a stranger\'s', !has(await tl30(U.C), (r) => r.id === w2 || r.id === s1));

  // الصلاحيات
  await expectErr('the inner functions are not callable by users', () => as(U.A, `select _post_wake($1, now(), 'open', 'x', now())`, [U.A]), /permission denied/);
  await expectErr('…nor the sleep one', () => as(U.A, `select _post_sleep($1, 'x', now())`, [U.A]), /permission denied/);
  check('post_sleep works for a signed-in user', !!(await as(U.D, `select post_sleep('🌙') id`))[0].id);
  await expectErr('anonymous cannot post', () => as(null, `select post_sleep('x')`), /permission denied/);
  await expectErr('morning / night posts cannot be inserted directly', () => as(U.B, `insert into posts (user_id, kind, caption) values ($1, 'wake', 'x')`, [U.B]), /row-level security/);
  await expectErr('…nor turned into one by editing', () => as(U.A, `update posts set kind = 'wake' where id = $1`, [pA]), /not_allowed/);
  await expectErr('…and their time cannot be edited', () => as(U.A, `update posts set meta = '{"at":"2030-01-07T03:00:00Z"}' where id = $1`, [w2]), /not_allowed/);
  await as(U.A, `update posts set caption = 'تعديل النص عادي' where id = $1`, [pA]);
  check('editing the text of a post still works', (await post(pA)).caption === 'تعديل النص عادي');

  // صفحة المنشور
  await as(U.B, `insert into post_likes (post_id, user_id, emoji) values ($1, $2, 'clap')`, [w2, U.B]);
  await as(U.B, `insert into comments (post_id, user_id, body) values ($1, $2, 'صباح النور 🌞')`, [w2, U.B]);
  const f = (await as(U.B, `select kind, meta, like_count, comment_count, liked_by_me, my_reaction, reactors from feed(now(), 1, $1)`, [w2]))[0];
  check('post page (feed) returns kind, meta and reactions', f && f.kind === 'wake' && f.meta.slept === 435 && Number(f.like_count) === 1
    && Number(f.comment_count) === 1 && f.liked_by_me === true && f.my_reaction === 'clap' && f.reactors[0].e === 'clap', JSON.stringify(f));
  const nW = (await q(`select data from notifications where user_id = $1 and kind = 'post_like' and target_id = $2`, [U.A, w2]))[0];
  check('reaction notification knows it was a good morning', nW?.data.post_kind === 'wake' && nW.data.emoji === 'clap');

  // بعد إلغاء الصداقة
  await q(`delete from friendships where requester = $1 and addressee = $2`, [U.A, U.B]);
  a = await tl(U.A);
  check('after unfriending, their posts and check-ins disappear', !has(a, (r) => r.user_id === U.B));
  check('anonymous users cannot read the timeline', await as(null, `select 1 from timeline()`).then(() => false, () => true));

  console.log('\ntimeline tests done');
})().catch((e) => { console.error(e); process.exit(1); });
