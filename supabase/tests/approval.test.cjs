// موافقة الإدارة على الحسابات الجديدة: الحساب الجديد ينتظر، ما يقدر يسوي شي يمس الناس أو يكلّف لين ينقبل،
// والمشرف يقبل أو يرفض من لوحة الإدارة. تشغيل: node supabase/tests/approval.test.cjs
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const N = '66666666-6666-6666-6666-666666666666'; // مسجّل جديد
  const M = '77777777-7777-7777-7777-777777777777'; // مسجّل جديد ثاني (ينرفض)
  const O = '88888888-8888-8888-8888-888888888888'; // يسجّل والموافقة موقّفة
  const P = '99999999-9999-9999-9999-999999999999'; // يحذف حسابه وهو ينتظر

  check('existing accounts stay approved', (await q(`select count(*)::int n from profiles where approval <> 'approved'`))[0].n === 0);

  // المشرف يشغّل الموافقة (مثل الخادم بعد الترحيل)
  await as(U.E, `update app_settings set value = '{"enabled": true}' where key = 'signup_approval'`);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'new@arq.test', '{"username":"newbie","full_name":"New Person","gender":"male"}'),
    ($2, 'spam@arq.test', '{"username":"spammer"}'),
    ($3, 'gone@arq.test', '{"username":"gone"}')`, [N, M, P]);
  check('new sign-up starts pending', (await q(`select approval from profiles where id = $1`, [N]))[0].approval === 'pending');
  check('admins get a notification for each sign-up',
    (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' like 'signup:' || $2 || '%'`, [U.E, N]))[0].n === 1);
  check('the person sees their own status', (await as(N, `select approval from profiles where id = $1`, [N]))[0].approval === 'pending');
  await expectErr('cannot approve yourself', () => as(N, `update profiles set approval = 'approved' where id = $1`, [N]), /permission denied/);

  // ما يقدر يسوي شي يمس الناس أو يكلّف
  await expectErr('pending: no posts', () => as(N, `insert into posts (user_id, caption, visibility) values ($1, 'هلا', 'public')`, [N]), /not_approved/);
  const pub = (await as(U.A, `insert into posts (user_id, caption, visibility) values ($1, 'تمرين', 'public') returning id`, [U.A]))[0].id;
  await expectErr('pending: no comments', () => as(N, `insert into comments (post_id, user_id, body) values ($1, $2, 'كفو')`, [pub, N]), /not_approved/);
  await expectErr('pending: no likes', () => as(N, `insert into post_likes (post_id, user_id, emoji) values ($1, $2, 'fire')`, [pub, N]), /not_approved/);
  await expectErr('pending: no follows', () => as(N, `insert into follows (follower, followee) values ($1, $2)`, [N, U.A]), /not_approved/);
  await expectErr('pending: no friend requests', () => as(N, `insert into friendships (requester, addressee) values ($1, $2)`, [N, U.A]), /not_approved/);
  await expectErr('pending: no messages', () => as(N, `insert into messages (sender, recipient, body) values ($1, $2, 'هلا')`, [N, U.A]), /not_approved/);
  await expectErr('pending: no AI', () => as(N, `select ai_take('meal_photo')`), /not_approved/);
  await expectErr('pending: no reports', () => as(N, `select report_content('post', $1, 'spam')`, [pub]), /not_approved/);
  await expectErr('pending: no check-ins (even through server functions)',
    () => as(N, `insert into check_ins (user_id, gym_id) select $1, id from gyms limit 1`, [N]), /not_approved|permission denied|row-level security/);
  // يقدر يسجّل جهازه للإشعارات (عشان يوصله «تم قبول حسابك»)
  const pushOk = await as(N, `select register_push_token('ExponentPushToken[pending-test]', 'ios')`).then(() => true, (e) => e.message);
  check('pending: can register for push', pushOk === true, String(pushOk));
  // والناس المقبولين يقدرون يتعاملون معه عادي (طلب صداقة منهم)
  check('approved users can still send them a friend request',
    (await as(U.A, `insert into friendships (requester, addressee) values ($1, $2) returning 1`, [U.A, N])).length === 1);

  // لوحة الإدارة
  await expectErr('queue: admins only', () => as(N, `select * from admin_signups()`), /not_allowed/);
  const queue = await as(U.E, `select * from admin_signups()`);
  const row = queue.find((r) => r.id === N);
  check('queue: lists pending sign-ups with email and gender', row?.email === 'new@arq.test' && row?.gender === 'male' && row?.full_name === 'New Person', JSON.stringify(row));
  check('queue: oldest first, only pending', queue.every((r) => r.approval === 'pending') && queue.length === 3, JSON.stringify(queue.map((r) => r.username)));
  check('counts: pending sign-ups', (await as(U.E, `select admin_signup_counts() n`))[0].n === 3);
  await expectErr('counts: admins only', () => as(U.A, `select admin_signup_counts()`), /not_allowed/);
  await expectErr('set: admins only', () => as(U.A, `select admin_set_approval(array[$1]::uuid[], 'approved')`, [N]), /not_allowed/);
  await expectErr('set: bad status', () => as(U.E, `select admin_set_approval(array[$1]::uuid[], 'maybe')`, [N]), /bad_status/);
  await expectErr('set: never yourself', () => as(U.E, `select admin_set_approval(array[$1, $2]::uuid[], 'rejected')`, [N, U.E]), /cannot_change_self/);

  check('approve: changes one account', (await as(U.E, `select admin_set_approval(array[$1]::uuid[], 'approved', 'أعرفه') n`, [N]))[0].n === 1);
  const after = (await q(`select approval, approval_by, approval_at from profiles where id = $1`, [N]))[0];
  check('approve: stored with who and when', after.approval === 'approved' && after.approval_by === U.E && !!after.approval_at);
  check('approve: the person is notified', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' like 'approved:%'`, [N]))[0].n === 1);
  check('approve: logged', (await q(`select count(*)::int n from admin_log where kind = 'approval' and target = $1 and action = 'approved'`, [N]))[0].n === 1);
  check('approve: same status again changes nothing', (await as(U.E, `select admin_set_approval(array[$1]::uuid[], 'approved') n`, [N]))[0].n === 0);
  check('approved: can post now', (await as(N, `insert into posts (user_id, caption, visibility) values ($1, 'أول منشور', 'public') returning 1`, [N])).length === 1);
  check('approved: can use AI now', typeof (await as(N, `select ai_take('meal_photo') v`))[0].v === 'number');

  check('reject: works', (await as(U.E, `select admin_set_approval(array[$1]::uuid[], 'rejected') n`, [M]))[0].n === 1);
  await expectErr('rejected: still cannot post', () => as(M, `insert into posts (user_id, caption, visibility) values ($1, 'x', 'public')`, [M]), /not_approved/);
  check('reject: no approval notification', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' like 'approved:%'`, [M]))[0].n === 0);
  check('queue: rejected tab', (await as(U.E, `select * from admin_signups('rejected')`)).map((r) => r.id).join() === M);

  // يقدر يحذف حسابه وهو ينتظر (شرط المتجر)
  await as(P, 'select delete_my_account()');
  check('pending: can delete their account', (await q('select count(*)::int n from profiles where id = $1', [P]))[0].n === 0);

  // المشرف يوقّف الموافقة ← الجديد مقبول على طول
  await as(U.A, `update app_settings set value = '{"enabled": false}' where key = 'signup_approval'`);
  check('setting: only admins can switch it', (await q(`select value->>'enabled' v from app_settings where key = 'signup_approval'`))[0].v === 'true');
  await as(U.E, `update app_settings set value = '{"enabled": false}' where key = 'signup_approval'`);
  await q(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"username":"open_door"}')`, [O]);
  const o = (await q(`select approval, approval_at from profiles where id = $1`, [O]))[0];
  check('setting off: new accounts approved straight away', o.approval === 'approved' && !!o.approval_at);
  check('setting off: no admin notification', (await q(`select count(*)::int n from notifications where data->>'key' like 'signup:' || $1 || '%'`, [O]))[0].n === 0);
})().catch((e) => { console.error(e); process.exit(1); });
