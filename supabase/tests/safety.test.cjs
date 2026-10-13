// أمان المجتمع: الحظر، الإبلاغ، الإخفاء، الإيقاف، الكلمات الممنوعة، وفحص صور المنشورات
// التشغيل: node supabase/tests/safety.test.cjs
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  const befriend = async (a, b) => {
    await as(a, `insert into friendships (requester, addressee) values ($1, $2)`, [a, b]);
    await as(b, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [a, b]);
  };
  const rpc = async (name, uid, args) => {
    await q(`select set_config('request.path', $1, false)`, [`/rpc/${name}`]);
    try { return await as(uid, `select * from ${name}(${args.map((_, i) => `$${i + 1}`).join(', ')})`, args); }
    finally { await q(`select set_config('request.path', '', false)`); }
  };
  const feedOf = async (uid, post) => (await as(uid, `select * from feed(p_post => $1)`, [post]))[0];
  const timelineIds = async (uid) => (await as(uid, `select id from timeline()`)).map((r) => r.id);

  // ---------- الحظر ----------
  await befriend(U.A, U.B);
  await as(U.A, `insert into follows (follower, followee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `insert into follows (follower, followee) values ($1, $2)`, [U.B, U.A]);
  const pub = (await as(U.A, `insert into posts (user_id, caption, visibility) values ($1, 'تمرين اليوم', 'public') returning id`, [U.A]))[0].id;
  await as(U.B, `insert into comments (post_id, user_id, body) values ($1, $2, 'كفو')`, [pub, U.B]);
  await as(U.B, `insert into post_likes (post_id, user_id, emoji) values ($1, $2, 'fire')`, [pub, U.B]);
  await q(`insert into coach_links (coach_id, client_id, status, requested_by, scopes) values ($1, $2, 'active', 'coach', array['workouts'])`, [U.B, U.A]);
  check('before blocking: B sees A\'s public post', (await as(U.B, `select 1 from posts where id = $1`, [pub])).length === 1);

  await as(U.A, `select block_user($1)`, [U.B]);
  check('blocking removes the friendship', (await q(`select 1 from friendships where $1 in (requester, addressee) and $2 in (requester, addressee)`, [U.A, U.B])).length === 0);
  check('blocking removes follows both ways', (await q(`select 1 from follows where (follower = $1 and followee = $2) or (follower = $2 and followee = $1)`, [U.A, U.B])).length === 0);
  check('blocking ends the coaching link (and its access)', (await q(`select status, scopes from coach_links where coach_id = $1 and client_id = $2`, [U.B, U.A]))[0]?.status === 'ended');
  check('my_blocks lists who I blocked', (await as(U.A, `select username from my_blocks()`)).map((r) => r.username).join() === 'sara');
  check('the blocked person cannot see that they were blocked', (await as(U.B, `select 1 from user_blocks`)).length === 0);
  check('blocked: B no longer sees A\'s public post', (await as(U.B, `select 1 from posts where id = $1`, [pub])).length === 0);
  check('blocked: the post page is empty for B', !(await feedOf(U.B, pub)));
  const forA = await feedOf(U.A, pub);
  check('blocked: A no longer sees B\'s comment in the count', Number(forA.comment_count) === 0, JSON.stringify(forA.comment_count));
  check('blocked: A no longer sees B\'s comment', (await as(U.A, `select 1 from comments where post_id = $1`, [pub])).length === 0);
  check('blocked: B\'s reaction is gone from A\'s count', Number(forA.like_count) === 0);
  await expectErr('blocked: B cannot comment on A\'s post', () => as(U.B, `insert into comments (post_id, user_id, body) values ($1, $2, 'هلا')`, [pub, U.B]), /not_allowed|row-level security|blocked_user/);
  await expectErr('blocked: B cannot follow A', () => as(U.B, `insert into follows (follower, followee) values ($1, $2)`, [U.B, U.A]), /blocked_user/);
  await expectErr('blocked: B cannot send a friend request', () => as(U.B, `insert into friendships (requester, addressee) values ($1, $2)`, [U.B, U.A]), /blocked_user/);
  await expectErr('blocked: A cannot follow B either', () => as(U.A, `insert into follows (follower, followee) values ($1, $2)`, [U.A, U.B]), /blocked_user/);
  // رسالة مباشرة من الخادم (حتى لو صارت بينهم علاقة تدريب جديدة) ما تنرسل
  await expectErr('blocked: no messages between them, whatever the route', () => q(`insert into messages (sender, recipient, body) values ($1, $2, 'هلا')`, [U.B, U.A]), /blocked_user/);
  check('a stranger cannot probe who blocked whom', (await rpc('is_blocked_pair', U.C, [U.A, U.B]))[0].is_blocked_pair === false);
  check('a party can ask about themselves', (await rpc('is_blocked_pair', U.B, [U.A, U.B]))[0].is_blocked_pair === true);
  // الحضور: حتى لو B في نفس النادي ووضع A «النادي»
  await q(`update profiles set presence_visibility = 'gym' where id = $1`, [U.A]);
  const vA = (await visit(U.A, gym.id, "now() - interval '1 hour'"))[0].id;
  check('blocked: B cannot see A\'s check-in', (await as(U.B, `select can_see_checkin($1) v`, [vA]))[0].v === false);

  await as(U.A, `select unblock_user($1)`, [U.B]);
  check('unblock: B sees the public post again', (await as(U.B, `select 1 from posts where id = $1`, [pub])).length === 1);
  check('unblock: B can follow again', (await as(U.B, `insert into follows (follower, followee) values ($1, $2) returning 1`, [U.B, U.A])).length === 1);
  await expectErr('cannot block yourself', () => as(U.A, `select block_user($1)`, [U.A]), /user_not_found/);

  // ---------- الكلمات الممنوعة ----------
  const post = (uid, caption) => as(uid, `insert into posts (user_id, caption, visibility) values ($1, $2, 'public') returning id`, [uid, caption]);
  await expectErr('filter: «يا كلب» is refused', () => post(U.C, 'يا كلب'), /content_blocked/);
  await expectErr('filter: diacritics and stretching do not get around it', () => post(U.C, 'يَا كَـــلْبْ'), /content_blocked/);
  await expectErr('filter: repeated letters do not get around it', () => post(U.C, 'fuuuuck this'), /content_blocked/);
  await expectErr('filter: ة written as ة still matches', () => post(U.C, 'هذي شرموطة'), /content_blocked/);
  await expectErr('filter: a prefix like «وال» still matches', () => post(U.C, 'والشرموطه'), /content_blocked/);
  check('filter: «كلب» on its own is fine (a dog is a dog)', (await post(U.C, 'شفت كلب جميل في الحديقة')).length === 1);
  check('filter: a word that only contains a banned one is fine (كسل)', (await post(U.C, 'اليوم فيني كسل')).length === 1);
  check('filter: names like عبدالله are fine', (await post(U.C, 'يا عبدالله وينك')).length === 1);
  await expectErr('filter: comments too', () => as(U.B, `insert into comments (post_id, user_id, body) values ($1, $2, 'يلعن ابوك')`, [pub, U.B]), /content_blocked/);
  await expectErr('filter: editing a caption too', () => as(U.A, `update posts set caption = 'kys' where id = $1`, [pub]), /content_blocked/);
  await expectErr('filter: only admins manage the list', () => as(U.C, `insert into moderation_terms (term) values ('كلمه')`), /row-level security/);
  await as(U.E, `insert into moderation_terms (term) values ('سبام')`);
  await expectErr('filter: a term the admin added applies at once', () => post(U.C, 'هذا سبام'), /content_blocked/);

  // ---------- فحص الصور ----------
  await befriend(U.C, U.D);
  const img = (await as(U.C, `insert into posts (user_id, image_path, caption, visibility, screen) values ($1, $2, 'صورة', 'friends', 'ok') returning id, screen`, [U.C, `${U.C}/a.jpg`]))[0];
  check('screen: a photo post starts pending, even if the app says ok', img.screen === 'pending');
  check('screen: the owner sees it with a «pending» flag', (await feedOf(U.C, img.id))?.meta?.screen === 'pending');
  check('screen: friends do not see it yet', !(await feedOf(U.D, img.id)) && !(await timelineIds(U.D)).includes(img.id));
  check('screen: and not through the table either', (await as(U.D, `select 1 from posts where id = $1`, [img.id])).length === 0);
  await expectErr('screen: the owner cannot mark it ok', () => as(U.C, `update posts set screen = 'ok' where id = $1`, [img.id]), /not_allowed/);
  await q(`update posts set screen = 'ok' where id = $1`, [img.id]); // the moderate-post function (service role)
  check('screen: after the check friends see it', (await timelineIds(U.D)).includes(img.id) && !!(await feedOf(U.D, img.id)));
  check('screen: no flag once it passed', !(await feedOf(U.C, img.id)).meta?.screen);
  await as(U.C, `update posts set image_path = $2 where id = $1`, [img.id, `${U.C}/b.jpg`]);
  check('screen: a new photo is checked again', (await q(`select screen from posts where id = $1`, [img.id]))[0].screen === 'pending');
  await q(`update posts set screen = 'ok' where id = $1`, [img.id]);
  const stuck = (await as(U.C, `insert into posts (user_id, image_path, visibility) values ($1, $2, 'friends') returning id`, [U.C, `${U.C}/c.jpg`]))[0].id;
  await q(`update posts set created_at = now() - interval '20 minutes' where id = $1`, [stuck]);
  const q1 = await as(U.E, `select * from admin_safety_queue()`);
  check('queue: a photo stuck in checking reaches the admin', q1.some((r) => r.target_id === stuck && r.reasons.includes('unscreened')));
  await as(U.E, `select admin_safety_act('post', $1, 'approve')`, [stuck]);
  check('queue: approving it shows it to friends', !!(await feedOf(U.D, stuck)));
  // حد فحص الصور: ٤٠ منشور فيه صورة آخر ٢٤ ساعة (كل منشور ينفحص مرة)
  const imgPosts = Number((await q(`select count(*) n from posts where user_id = $1 and image_path is not null and created_at > now() - interval '1 day'`, [U.C]))[0].n);
  check('photo-check quota counts your photo posts', Number((await as(U.C, `select moderation_quota() v`))[0].v) === 40 - imgPosts);
  await q(`insert into posts (user_id, image_path, visibility) select $1::uuid, $1::text || '/q' || g || '.jpg', 'friends' from generate_series(1, $2::int) g`, [U.C, 41 - imgPosts]);
  await expectErr('photo-check quota: the 41st photo in a day is refused', () => as(U.C, `select moderation_quota()`), /rate_limited/);
  await q(`delete from posts where user_id = $1 and image_path like '%/q%.jpg'`, [U.C]);

  // ---------- الإبلاغ ----------
  await expectErr('report: not your own content', () => as(U.A, `select report_content('post', $1, 'spam')`, [pub]), /not_allowed/);
  await expectErr('report: only things you can see', () => as(U.B, `select report_content('post', $1, 'spam')`, [img.id]), /target_not_found/);
  await expectErr('report: a valid reason is needed', () => as(U.B, `select report_content('post', $1, 'boring')`, [pub]), /bad_status/);
  const r1 = (await as(U.B, `select report_content('post', $1, 'harassment', 'يسب الناس') v`, [pub]))[0].v;
  check('report: accepted, not hidden after one report', r1.ok === true && r1.hidden === false);
  check('report: the reporter sees their report', (await as(U.B, `select reason, note, snapshot from content_reports`))[0]?.snapshot?.caption === 'تمرين اليوم');
  check('report: the reported person does not', (await as(U.A, `select 1 from content_reports`)).length === 0);
  check('report: admins get a notice', (await q(`select 1 from notifications where user_id = $1 and kind = 'notice' and data->>'key' like 'rep:post:%'`, [U.E])).length === 1);
  await as(U.B, `select report_content('post', $1, 'hate')`, [pub]);
  check('report: reporting twice updates, does not double count', (await q(`select count(*)::int n from content_reports where target_id = $1`, [pub]))[0].n === 1);
  await as(U.C, `select report_content('post', $1, 'spam')`, [pub]);
  const r3 = (await as(U.D, `select report_content('post', $1, 'spam') v`, [pub]))[0].v;
  check('report: three different people hide it until review', r3.hidden === true);
  check('report: hidden for others', !(await feedOf(U.C, pub)));
  check('report: the owner still sees it, marked hidden', (await feedOf(U.A, pub))?.meta?.hidden === true);
  check('report: the owner is told', (await q(`select 1 from notifications where user_id = $1 and data->>'key' = $2`, [U.A, `hide:${pub}`])).length === 1);
  await expectErr('report: the owner cannot unhide it', () => as(U.A, `update posts set hidden_at = null where id = $1`, [pub]), /not_allowed/);
  const q2 = (await as(U.E, `select * from admin_safety_queue()`)).find((r) => r.target_id === pub);
  check('queue: grouped by post with 3 reports, reasons and the note', q2?.reports == 3 && q2.reasons.includes('spam') && q2.notes[0] === 'يسب الناس' && q2.hidden === true);
  await expectErr('queue: admins only', () => as(U.A, `select * from admin_safety_queue()`), /not_allowed/);
  await as(U.E, `select admin_safety_act('post', $1, 'restore')`, [pub]);
  check('restore: visible again', !!(await feedOf(U.C, pub)));
  check('restore: reports closed as dismissed', (await q(`select distinct status from content_reports where target_id = $1`, [pub]))[0].status === 'dismissed');
  check('counts: nothing open', Number((await as(U.E, `select * from admin_safety_counts()`))[0].open_targets) === 0);

  // تعليق ورسالة وحساب
  const cm = (await as(U.C, `insert into comments (post_id, user_id, body) values ($1, $2, 'تعليق') returning id`, [pub, U.C]))[0].id;
  await as(U.A, `select report_content('comment', $1, 'harassment')`, [cm]);
  await as(U.E, `select admin_safety_act('comment', $1, 'hide')`, [cm]);
  check('hide comment: gone for others', (await as(U.B, `select 1 from comments where id = $1`, [cm])).length === 0);
  check('hide comment: the writer still sees it', (await as(U.C, `select 1 from comments where id = $1`, [cm])).length === 1);
  check('hide comment: reports actioned', (await q(`select status, action from content_reports where target_id = $1`, [cm]))[0].action === 'hide');
  await befriend(U.B, U.D);
  const msg = (await as(U.D, `insert into messages (sender, recipient, body) values ($1, $2, 'رسالة') returning id`, [U.D, U.B]))[0].id;
  await expectErr('report message: only the recipient', () => as(U.C, `select report_content('message', $1, 'spam')`, [msg]), /target_not_found/);
  check('report message: the recipient can', (await as(U.B, `select report_content('message', $1, 'spam') v`, [msg]))[0].v.ok === true);
  check('report user: works for a profile', (await as(U.B, `select report_content('user', $1, 'other', 'اسم مسيء') v`, [U.C]))[0].v.ok === true);

  // ---------- الإيقاف ----------
  await expectErr('suspend: days must be 1–365', () => as(U.E, `select admin_safety_act('user', $1, 'suspend', 0)`, [U.C]), /bad_days/);
  await as(U.E, `select admin_safety_act('user', $1, 'suspend', 7, 'إساءة')`, [U.C]);
  check('suspend: the person knows until when', !!(await as(U.C, `select my_suspension() v`))[0].v);
  await expectErr('suspend: no posts', () => post(U.C, 'رجعت'), /account_suspended/);
  await expectErr('suspend: no comments', () => as(U.C, `insert into comments (post_id, user_id, body) values ($1, $2, 'هلا')`, [pub, U.C]), /account_suspended/);
  await expectErr('suspend: no messages', () => as(U.C, `insert into messages (sender, recipient, body) values ($1, $2, 'هلا')`, [U.C, U.D]), /account_suspended/);
  check('suspend: others cannot look it up', (await rpc('is_suspended', U.A, [U.C]))[0].is_suspended === false);
  check('suspend: logged', (await q(`select 1 from admin_log where kind = 'safety' and action = 'suspend'`)).length === 1);
  await as(U.E, `select admin_safety_act('user', $1, 'unsuspend')`, [U.C]);
  check('unsuspend: can post again', (await post(U.C, 'رجعت')).length === 1);

  // ---------- إرشادات المجتمع ----------
  check('guidelines: accepting stores the time', !!(await as(U.B, `select accept_guidelines() v`))[0].v);
  await expectErr('guidelines: not writable directly', () => as(U.B, `update profiles set guidelines_at = null where id = $1`, [U.B]), /permission denied/);

  // ---------- حذف الحساب: البلاغات عنه ونسخة محتواه تنحذف (سياسة الخصوصية) ----------
  const aboutC = `select count(*)::int n from content_reports where target_id = any($1::uuid[])`;
  check('delete account: reports about C exist first', (await q(aboutC, [[cm, U.C]]))[0].n === 2);
  await as(U.C, 'select delete_my_account()');
  check('delete account: reports about C and their snapshots are gone', (await q(aboutC, [[cm, U.C]]))[0].n === 0);
  check('delete account: other reports stay', (await q(`select count(*)::int n from content_reports where target_id = $1`, [msg]))[0].n === 1);
})().catch((e) => { console.error(e); process.exit(1); });
