// الفحص الآلي للنصوص بعد النشر: الإعداد، الطابور، النتيجة، الإخفاء، طابور المشرف، والحد اليومي
// التشغيل: node supabase/tests/auto_moderation.test.cjs
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  const ADMIN = U.E;
  await q(`update profiles set is_owner = true where id = $1`, [ADMIN]);
  const setting = async () => (await q(`select value from app_settings where key = 'auto_moderation'`))[0]?.value;
  const save = (uid, v) => as(uid, `update app_settings set value = $1 where key = 'auto_moderation'`, [JSON.stringify(v)]);
  const jobs = () => q(`select target_type, target_id, attempts, next_at, queued_at from moderation_jobs order by queued_at`);
  const jobOf = async (type, id) => (await q(`select * from moderation_jobs where target_type = $1 and target_id = $2`, [type, id]))[0];
  const flagOf = async (type, id) => (await q(`select * from auto_flags where target_type = $1 and target_id = $2`, [type, id]))[0];
  const settle = (type, id, result, cats = [], queuedAt = null) =>
    q(`select moderation_settle($1, $2, $3, $4::text[], 'Qwen/Qwen3Guard-Gen-4B:featherless-ai', 900, $5) as r`, [type, id, result, cats, queuedAt]).then((r) => r[0].r);
  const queueOf = async (uid) => as(uid, `select * from admin_safety_queue('open', 100)`);
  const noticesOf = async (uid, like) => (await q(`select data from notifications where user_id = $1 and data->>'key' like $2`, [uid, like])).length;

  // ---------- الإعداد ----------
  const s0 = await setting();
  check('setting exists and starts off', s0 && s0.enabled === false && s0.action === 'flag' && s0.messages === false && s0.daily_cap === 3000, JSON.stringify(s0));
  check('every signed-in user can read it (no secrets in it)', (await as(U.A, `select value from app_settings where key = 'auto_moderation'`)).length === 1);
  await as(U.A, `update app_settings set value = '{"enabled": true, "action": "hide", "messages": true, "daily_cap": 9}' where key = 'auto_moderation'`).catch(() => null);
  check('a normal user cannot change it', (await setting()).enabled === false);
  await expectErr('bad action rejected', () => save(ADMIN, { enabled: true, action: 'delete', messages: false, daily_cap: 10 }), /bad_value/);
  await expectErr('negative cap rejected', () => save(ADMIN, { enabled: true, action: 'flag', messages: false, daily_cap: -1 }), /bad_value/);
  await expectErr('cap over 20000 rejected', () => save(ADMIN, { enabled: true, action: 'flag', messages: false, daily_cap: 20001 }), /bad_value/);
  await expectErr('messages must be a boolean', () => save(ADMIN, { enabled: true, action: 'flag', messages: 'yes', daily_cap: 10 }), /bad_value/);
  await expectErr('enabled must be a boolean', () => save(ADMIN, { enabled: 1, action: 'flag', messages: false, daily_cap: 10 }), /bad_value/);

  // مشرف ثاني (مو المالك): يوقف بس
  const OTHER = U.D;
  await q(`insert into app_admins (user_id) values ($1)`, [OTHER]);
  await expectErr('another admin cannot turn it on', () => save(OTHER, { enabled: true, action: 'flag', messages: false, daily_cap: 3000 }), /not_allowed/);
  await expectErr('another admin cannot change the mode', () => save(OTHER, { enabled: false, action: 'hide', messages: false, daily_cap: 3000 }), /not_allowed/);
  await expectErr('another admin cannot change the cap', () => save(OTHER, { enabled: false, action: 'flag', messages: false, daily_cap: 10 }), /not_allowed/);
  await expectErr('another admin cannot turn on messages', () => save(OTHER, { enabled: false, action: 'flag', messages: true, daily_cap: 3000 }), /not_allowed/);
  check('stats tell the owner apart (can_edit)', (await as(ADMIN, `select admin_moderation_stats() as s`))[0].s.can_edit === true
    && (await as(OTHER, `select admin_moderation_stats() as s`))[0].s.can_edit === false);

  // موقّف: ما ينضاف شي للطابور
  const offPost = (await as(U.A, `insert into posts (user_id, caption) values ($1, 'قبل التشغيل') returning id`, [U.A]))[0].id;
  check('while off nothing is queued', (await jobs()).length === 0);

  await save(ADMIN, { enabled: true, action: 'flag', messages: false, daily_cap: 3000, extra: 'x' });
  const s1 = await setting();
  check('the owner can turn it on; unknown keys are dropped', s1.enabled === true && !('extra' in s1), JSON.stringify(s1));
  await save(ADMIN, { enabled: true, action: 'flag', messages: true, daily_cap: 3000 });
  await save(OTHER, { enabled: true, action: 'flag', messages: false, daily_cap: 3000 });
  check('another admin can turn off message checks', (await setting()).messages === false && (await setting()).enabled === true);
  await save(OTHER, { enabled: false, action: 'flag', messages: false, daily_cap: 3000 });
  check('another admin can turn it off', (await setting()).enabled === false);
  await save(ADMIN, { enabled: true, action: 'flag', messages: false, daily_cap: 3000 });

  // ---------- الطابور ----------
  const post = (await as(U.A, `insert into posts (user_id, caption, visibility) values ($1, 'تمرين صدر اليوم', 'public') returning id`, [U.A]))[0].id;
  check('a post with a caption is queued', !!(await jobOf('post', post)));
  check('posts from before it was on are not queued', !(await jobOf('post', offPost)));
  const imgOnly = (await as(U.A, `insert into posts (user_id, image_path) values ($1, 'a/x.jpg') returning id`, [U.A]))[0].id;
  check('a photo post without text is not queued', !(await jobOf('post', imgOnly)));
  const wake = (await q(`insert into posts (user_id, caption, kind) values ($1, 'صحيت', 'wake') returning id`, [U.A]))[0].id;
  check('automatic wake/sleep posts are not queued', !(await jobOf('post', wake)));
  const comment = (await as(U.B, `insert into comments (post_id, user_id, body) values ($1, $2, 'تعليق') returning id`, [post, U.B]))[0].id;
  check('a comment is queued', !!(await jobOf('comment', comment)));
  const ci = (await visit(U.A, gym.id))[0].id;
  const ciComment = (await q(`insert into checkin_comments (check_in_id, user_id, body) values ($1, $2, 'كفو') returning id`, [ci, U.B]))[0].id;
  check('a check-in comment is queued', !!(await jobOf('checkin_comment', ciComment)));
  const msg = (await q(`insert into messages (sender, recipient, body) values ($1, $2, 'هلا') returning id`, [U.A, U.B]))[0].id;
  check('private messages are not queued while messages = false', !(await jobOf('message', msg)));

  const j1 = await jobOf('post', post);
  await as(U.A, `update posts set caption = caption where id = $1`, [post]);
  check('saving the same caption does not re-queue', (await jobOf('post', post)).queued_at.getTime() === j1.queued_at.getTime());
  await as(U.A, `update posts set caption = 'تمرين صدر وكتف' where id = $1`, [post]);
  check('editing the caption re-queues it (newer queued_at)', (await jobOf('post', post)).queued_at > j1.queued_at);

  // ---------- الصلاحيات ----------
  // (الترحيل يسحب الصلاحيات، بس أداة الاختبار ترجّع select للكل بعد الترحيلات: RLS بدون سياسة يرجع لا شي)
  check('users cannot read the queue', (await as(U.A, `select * from moderation_jobs`).catch(() => [])).length === 0);
  await expectErr('users cannot add to the queue', () => as(U.A, `insert into moderation_jobs (target_type, target_id) values ('post', $1)`, [post]), /permission denied|row-level security/);
  check('users cannot read the log', (await as(U.A, `select * from moderation_log`).catch(() => [])).length === 0);
  await expectErr('users cannot claim', () => as(U.A, `select * from moderation_claim(5)`), /permission denied/);
  await expectErr('users cannot settle', () => as(U.A, `select moderation_settle('post', $1, 'safe')`, [post]), /permission denied/);
  await expectErr('users cannot retry', () => as(U.A, `select moderation_retry('post', $1, 'error')`, [post]), /permission denied/);
  await expectErr('users cannot check the server key', () => as(U.A, `select moderation_key_ok('x')`), /permission denied/);
  await expectErr('users cannot run the cron job', () => as(U.A, `select run_moderation()`), /permission denied/);
  await expectErr('users cannot write flags', () => as(U.A, `insert into auto_flags (target_type, target_id, label) values ('post', $1, 'unsafe')`, [post]), /permission denied|row-level security/);
  await expectErr('users cannot read the stats', () => as(U.A, `select admin_moderation_stats()`), /not_allowed/);
  check('the server key is never ok without vault', (await q(`select moderation_key_ok('anything') as k`))[0].k === false);

  // ---------- الحجز ----------
  const claimed = await q(`select * from moderation_claim(10)`);
  const byId = Object.fromEntries(claimed.map((r) => [r.target_id, r]));
  check('claim returns every due job', claimed.length === 3, JSON.stringify(claimed.map((r) => r.target_type)));
  check('claim returns the text to check', byId[post]?.body === 'تمرين صدر وكتف' && byId[comment]?.body === 'تعليق' && byId[ciComment]?.body === 'كفو');
  check('claim counts the attempt', byId[post]?.attempts === 1);
  check('claimed jobs are held for 3 minutes', (await q(`select count(*)::int as n from moderation_jobs where next_at > now() + interval '2 minutes'`))[0].n === 3);
  check('a second claim gets nothing (held)', (await q(`select * from moderation_claim(10)`)).length === 0);

  // ---------- النتيجة ----------
  const rSafe = await settle('checkin_comment', ciComment, 'safe', [], byId[ciComment].queued_at);
  check('safe: removed from the queue, no flag', rSafe.flagged === false && !(await jobOf('checkin_comment', ciComment)) && !(await flagOf('checkin_comment', ciComment)));
  check('safe: logged without text or user', (await q(`select * from moderation_log where target_type = 'checkin_comment'`)).every((r) => r.result === 'safe' && !('target_id' in r) && !('body' in r)));

  const rFlag = await settle('comment', comment, 'unsafe', ['unethical', 'Unknown'], byId[comment].queued_at);
  const fc = await flagOf('comment', comment);
  check('unsafe comment: flagged for review', rFlag.flagged === true && fc?.status === 'open' && fc?.label === 'unsafe', JSON.stringify(rFlag));
  check('unknown categories are dropped', JSON.stringify(fc.categories) === '["unethical"]', JSON.stringify(fc.categories));
  check('flag mode: nothing is hidden', rFlag.hidden === false && (await q(`select hidden_at from comments where id = $1`, [comment]))[0].hidden_at === null);
  check('the flag keeps a copy of the text for review', fc.snapshot.body === 'تعليق' && fc.target_user === U.B);
  check('admins are told when the automatic queue starts', (await noticesOf(ADMIN, `auto:comment:${comment}%`)) === 1);
  check('the author is not told in flag mode', (await noticesOf(U.B, `hide:${comment}`)) === 0);
  check('users cannot see flags (not even their own)', (await as(U.B, `select * from auto_flags`)).length === 0);
  check('admins can read flags', (await as(ADMIN, `select * from auto_flags`)).length === 1);

  // طابور المشرف
  let queue = await queueOf(ADMIN);
  let item = queue.find((r) => r.target_id === comment);
  check('admin queue shows the automatic flag', !!item, JSON.stringify(queue.map((r) => r.target_type)));
  check('…with 0 people reports', item && Number(item.reports) === 0);
  check('…marked as automatic with its category', item && item.reasons.includes('auto_unsafe') && item.reasons.includes('cat_unethical'), JSON.stringify(item?.reasons));
  check('…with the text', item?.snapshot?.body === 'تعليق');
  check('counts include automatic flags', Number((await as(ADMIN, `select * from admin_safety_counts()`))[0].open_targets) === 1);
  // بلاغ من شخص على نفس التعليق: يندمج
  await as(U.C, `select report_content('comment', $1, 'harassment', 'يسب')`, [comment]).catch(() => null);
  queue = await queueOf(ADMIN);
  item = queue.filter((r) => r.target_id === comment);
  check('a person report on the same comment merges into one item', item.length <= 1);
  check('counts do not double-count the same comment', Number((await as(ADMIN, `select * from admin_safety_counts()`))[0].open_targets) === 1);

  // ---------- وضع hide ----------
  await save(ADMIN, { enabled: true, action: 'hide', messages: false, daily_cap: 3000 });
  const rHide = await settle('post', post, 'unsafe', ['sexual'], byId[post].queued_at);
  // (بين الحجز والنتيجة انعدّل المنشور؟ لا: آخر تعديل قبل الحجز)
  check('hide mode: unsafe post is hidden for now', rHide.hidden === true && (await q(`select hidden_reason from posts where id = $1`, [post]))[0].hidden_reason === 'reports', JSON.stringify(rHide));
  check('hide mode: the flag remembers it hid it', (await flagOf('post', post)).hidden === true);
  check('hide mode: others no longer see the post', (await as(U.C, `select 1 from posts where id = $1`, [post])).length === 0);
  check('hide mode: the author still sees it', (await as(U.A, `select 1 from posts where id = $1`, [post])).length === 1);
  check('hide mode: the author is told it is hidden for review', (await noticesOf(U.A, `hide:${post}`)) === 1);
  check('hide mode: admins are told when something is hidden', (await noticesOf(ADMIN, `auto:post:${post}%`)) === 1);

  // سياسي بس: «محل خلاف» وما ينخفى
  const pol = (await as(U.C, `insert into posts (user_id, caption, visibility) values ($1, 'رأي', 'public') returning id`, [U.C]))[0].id;
  const rPol = await settle('post', pol, 'unsafe', ['political']);
  const fp = await flagOf('post', pol);
  check('political only: reviewed as controversial', fp?.label === 'controversial' && rPol.label === 'controversial');
  check('political only: never hidden automatically', rPol.hidden === false && (await q(`select hidden_at from posts where id = $1`, [pol]))[0].hidden_at === null);
  // نسخ أو jailbreak بس: ما يخص المجتمع
  const cp = (await as(U.C, `insert into posts (user_id, caption) values ($1, 'كلمات أغنية') returning id`, [U.C]))[0].id;
  const rCp = await settle('post', cp, 'unsafe', ['copyright', 'jailbreak']);
  check('copyright/jailbreak only: not flagged', rCp.flagged === false && !(await flagOf('post', cp)) && !(await jobOf('post', cp)));
  // controversial على تعليق في وضع hide: يطلع للمراجعة بس
  const c2 = (await as(U.C, `insert into comments (post_id, user_id, body) values ($1, $2, 'ممكن') returning id`, [pol, U.C]))[0].id;
  const rC2 = await settle('comment', c2, 'controversial', ['unethical']);
  check('hide mode: controversial is flagged but not hidden', rC2.flagged === true && rC2.hidden === false);

  // المحتوى انحذف قبل النتيجة
  const gone = (await as(U.C, `insert into comments (post_id, user_id, body) values ($1, $2, 'بحذفه') returning id`, [pol, U.C]))[0].id;
  await q(`delete from comments where id = $1`, [gone]);
  const rGone = await settle('comment', gone, 'unsafe', ['violent']);
  check('deleted before the result: no flag, job cleared', rGone.flagged === false && !(await flagOf('comment', gone)) && !(await jobOf('comment', gone)));

  // ---------- انعدّل وهو ينفحص ----------
  const race = (await as(U.A, `insert into posts (user_id, caption) values ($1, 'نص أول') returning id`, [U.A]))[0].id;
  const rc = (await q(`select * from moderation_claim(10)`)).find((r) => r.target_id === race);
  await as(U.A, `update posts set caption = 'نص ثاني' where id = $1`, [race]);
  const rStale = await settle('post', race, 'unsafe', ['sexual'], rc.queued_at);
  check('edited while checking: old result is ignored', rStale.stale === true && !(await flagOf('post', race)), JSON.stringify(rStale));
  const rj = await jobOf('post', race);
  check('edited while checking: the new text stays queued with fresh attempts', rj && rj.attempts === 0 && rj.queued_at > rc.queued_at);
  await q(`select moderation_retry('post', $1, 'error', null, $2)`, [race, rc.queued_at]);
  check('a late failure of the old text does not touch the new job', (await jobOf('post', race)).attempts === 0 && (await jobOf('post', race)).next_at <= new Date(Date.now() + 1000));

  // ---------- الفشل ----------
  const rt = await jobOf('post', race);
  await q(`update moderation_jobs set attempts = 2 where target_type = 'post' and target_id = $1`, [race]);
  await q(`select moderation_retry('post', $1, 'timeout', 'm', $2)`, [race, rt.queued_at]);
  const after = await jobOf('post', race);
  check('error: back off (2^attempts minutes)', after.next_at > new Date(Date.now() + 3.5 * 60e3) && after.next_at < new Date(Date.now() + 4.5 * 60e3));
  check('error: logged with its reason', (await q(`select count(*)::int as n from moderation_log where result = 'error' and error = 'timeout'`))[0].n === 1);
  await q(`select moderation_retry('post', $1, 'credits', 'm', $2)`, [race, rt.queued_at]);
  const cred = await jobOf('post', race);
  check('credits/auth: the attempt does not count', cred.attempts === 1);
  await q(`select moderation_retry('post', $1, 'model', 'm', $2)`, [race, rt.queued_at]);
  check('model gone at the provider: the attempt does not count either', (await jobOf('post', race)).attempts === cred.attempts - 1);
  check('model gone at the provider: back in 15 minutes', (await jobOf('post', race)).next_at > new Date(Date.now() + 14 * 60e3));
  check('credits/auth: back in 15 minutes', cred.next_at > new Date(Date.now() + 14 * 60e3));
  const nLog = (await q(`select count(*)::int as n from moderation_log`))[0].n;
  await q(`select moderation_retry('post', $1, 'skipped', null, $2)`, [race, rt.queued_at]);
  check('skipped: not logged, attempt refunded', (await q(`select count(*)::int as n from moderation_log`))[0].n === nLog && (await jobOf('post', race)).attempts === 0);
  await q(`update moderation_jobs set attempts = 5 where target_type = 'post' and target_id = $1`, [race]);
  await q(`select moderation_retry('post', $1, 'http_500', 'm', $2)`, [race, rt.queued_at]);
  check('after 5 failed attempts the job is dropped', !(await jobOf('post', race)));
  await expectErr('bad type rejected', () => q(`select moderation_retry('user', $1)`, [race]), /bad_input/);
  await expectErr('bad result rejected', () => settle('post', race, 'maybe'), /bad_input/);

  // ---------- الرسائل ----------
  await save(ADMIN, { enabled: true, action: 'hide', messages: true, daily_cap: 3000 });
  const m2 = (await q(`insert into messages (sender, recipient, body) values ($1, $2, 'رسالة') returning id`, [U.C, U.B]))[0].id;
  check('messages = true: messages are queued', !!(await jobOf('message', m2)));
  const mc = (await q(`select * from moderation_claim(10)`)).find((r) => r.target_id === m2);
  check('claim returns the message text', mc?.body === 'رسالة');
  const rM = await settle('message', m2, 'unsafe', ['unethical'], mc.queued_at);
  check('unsafe message: flagged but never hidden', rM.flagged === true && rM.hidden === false && (await flagOf('message', m2))?.snapshot?.body === 'رسالة');
  const m3 = (await q(`insert into messages (sender, recipient, body) values ($1, $2, 'ثانية') returning id`, [U.C, U.B]))[0].id;
  await save(ADMIN, { enabled: true, action: 'hide', messages: false, daily_cap: 3000 });
  check('messages turned off: claim skips message jobs', !(await q(`select * from moderation_claim(10)`)).some((r) => r.target_id === m3));
  await q(`select run_moderation()`);
  check('run_moderation clears message jobs once messages are off (and runs without vault/pg_net)', !(await jobOf('message', m3)));

  // ---------- الحد اليومي ----------
  const capPost = (await as(U.B, `insert into posts (user_id, caption) values ($1, 'حد') returning id`, [U.B]))[0].id;
  const used = (await q(`select _automod_used() as n`))[0].n;
  const all = (await q(`select count(*)::int as n from moderation_log where result <> 'gone'`))[0].n;
  check('setup failures (auth/credits/model) do not use the daily cap', used === all - 2, `${used} vs ${all}`);
  await save(ADMIN, { enabled: true, action: 'flag', messages: false, daily_cap: used });
  check('daily cap reached: claim returns nothing', (await q(`select * from moderation_claim(10)`)).length === 0);
  await save(ADMIN, { enabled: true, action: 'flag', messages: false, daily_cap: used + 1 });
  check('daily cap: only what is left is claimed', (await q(`select * from moderation_claim(10)`)).length === 1);
  await save(ADMIN, { enabled: false, action: 'flag', messages: false, daily_cap: 3000 });
  await q(`update moderation_jobs set next_at = now() - interval '1 minute'`);
  check('turned off: claim returns nothing', (await q(`select * from moderation_claim(10)`)).length === 0);
  check('turned off: new posts are not queued', !(await jobOf('post', (await as(U.B, `insert into posts (user_id, caption) values ($1, 'بعد الإيقاف') returning id`, [U.B]))[0].id)));
  check('turning off keeps what was already queued', !!(await jobOf('post', capPost)));

  // ---------- قرار المشرف ----------
  await as(ADMIN, `select admin_safety_act('comment', $1, 'dismiss')`, [c2]);
  check('dismiss closes the automatic flag', (await flagOf('comment', c2)).status === 'dismissed' && (await flagOf('comment', c2)).action === 'dismiss');
  await as(ADMIN, `select admin_safety_act('post', $1, 'restore')`, [post]);
  check('restore brings back an auto-hidden post and closes the flag', (await q(`select hidden_at from posts where id = $1`, [post]))[0].hidden_at === null && (await flagOf('post', post)).status === 'dismissed');
  await as(ADMIN, `select admin_safety_act('comment', $1, 'hide')`, [comment]);
  check('hide closes the flag as actioned', (await flagOf('comment', comment)).status === 'actioned');
  await as(ADMIN, `select admin_safety_act('message', $1, 'suspend', 7)`, [m2]);
  check('suspend from a message flag works (owner = sender)', (await q(`select 1 from suspensions where user_id = $1`, [U.C])).length === 1 && (await flagOf('message', m2)).status === 'actioned');
  await as(ADMIN, `select admin_safety_act('message', $1, 'unsuspend')`, [m2]);
  // نص جديد سيء بعد ما انقفل: ينفتح من جديد
  await settle('comment', c2, 'unsafe', ['violent']);
  check('a new bad result reopens a closed flag', (await flagOf('comment', c2)).status === 'open' && (await flagOf('comment', c2)).action === null);
  check('the closed items leave the open queue', !(await queueOf(ADMIN)).some((r) => r.target_id === post));
  check('the all view still has them', (await as(ADMIN, `select * from admin_safety_queue('all', 200)`)).some((r) => r.target_id === post));

  // ---------- الأرقام ----------
  const st = (await as(ADMIN, `select admin_moderation_stats() as s`))[0].s;
  check('stats: settings, queue and 24h numbers', st.settings.enabled === false && typeof st.queued === 'number' && st.checked_24h >= 5 && st.flagged_24h >= 4 && st.errors_24h >= 3, JSON.stringify(st));
  check('stats: an old error is not shown after later successful checks', st.last_error === null, st.last_error);
  await q(`select moderation_retry('post', $1, 'credits', 'm')`, [capPost]);
  check('stats: a newer error is shown', (await as(ADMIN, `select admin_moderation_stats() as s`))[0].s.last_error === 'credits');
  check('stats: server not ready without vault', st.server_ready === false);
  check('stats: open flags', st.open_flags === Number((await q(`select count(*)::int as n from auto_flags where status = 'open'`))[0].n));

  // ---------- مراجعة: انعدّل وانفحص من دفعة ثانية قبل ما ترجع نتيجة الأولى ----------
  await save(ADMIN, { enabled: true, action: 'hide', messages: false, daily_cap: 3000 });
  await q(`delete from moderation_jobs`);
  const r2 = (await as(U.A, `insert into posts (user_id, caption, visibility) values ($1, 'نص قديم', 'public') returning id`, [U.A]))[0].id;
  const a1 = (await q(`select * from moderation_claim(10)`)).find((x) => x.target_id === r2);
  await as(U.A, `update posts set caption = 'نص جديد عادي' where id = $1`, [r2]);
  const b1 = (await q(`select * from moderation_claim(10)`)).find((x) => x.target_id === r2);
  check('the edited text is claimed again right away', !!b1 && b1.body === 'نص جديد عادي');
  await settle('post', r2, 'safe', [], b1.queued_at);
  const late = await settle('post', r2, 'unsafe', ['sexual'], a1.queued_at);
  check('a late result for the old text is stale even after the new one finished', late.stale === true && !(await flagOf('post', r2)), JSON.stringify(late));
  check('…and the edited post is not hidden', (await q(`select hidden_at from posts where id = $1`, [r2]))[0].hidden_at === null);

  // ---------- مراجعة: الدور بين الكتّاب وحد الكاتب ----------
  await q(`delete from moderation_jobs`);
  await save(ADMIN, { enabled: true, action: 'flag', messages: false, daily_cap: 20000 });
  for (let i = 0; i < 5; i++) await as(U.A, `insert into posts (user_id, caption) values ($1, $2)`, [U.A, `سبام ${i}`]);
  await q(`update moderation_jobs set next_at = now() - interval '10 minutes'`);
  const bOne = (await as(U.B, `insert into posts (user_id, caption) values ($1, 'منشور سارة') returning id`, [U.B]))[0].id;
  const two = await q(`select * from moderation_claim(2)`);
  check('a batch takes turns between authors (one busy author does not block others)', two.some((x) => x.target_id === bOne) && two.length === 2, JSON.stringify(two.map((x) => x.body)));
  check('jobs remember their author', (await q(`select count(*)::int as n from moderation_jobs where author = $1`, [U.A]))[0].n === 5);
  const before = Number((await q(`select coalesce((select n from moderation_usage where author = $1 and day = app_today()), 0) as n`, [U.B]))[0].n);
  await settle('post', bOne, 'safe', [], two.find((x) => x.target_id === bOne).queued_at);
  check('a finished check counts toward its author\'s day', Number((await q(`select n from moderation_usage where author = $1 and day = app_today()`, [U.B]))[0].n) === before + 1);
  await q(`insert into moderation_usage (author, day, n) values ($1, app_today(), 200) on conflict (author, day) do update set n = 200`, [U.A]);
  await q(`update moderation_jobs set next_at = now() - interval '1 minute'`);
  check('an author at 200 checks today waits (others still go)', !(await q(`select * from moderation_claim(10)`)).some((x) => x.target_id && x.body?.startsWith('سبام')));

  // ---------- مراجعة: نص طويل بإيموجي ----------
  const emoji = '😡'.repeat(1000);
  const ep = (await as(U.B, `insert into posts (user_id, caption) values ($1, $2) returning id`, [U.B, emoji]))[0].id;
  const rE = await settle('post', ep, 'unsafe', ['unethical']);
  const fe = await flagOf('post', ep);
  check('a 1000-emoji caption can still be flagged (copy shortened to fit)', rE.flagged === true && fe?.snapshot?.caption?.length >= 700 * 2 - 1, JSON.stringify(rE));

  // حذف الحساب يحذف علاماته
  await q(`delete from auth.users where id = $1`, [U.C]);
  check('deleting an account removes the flags on its content', (await q(`select count(*)::int as n from auto_flags where target_user = $1`, [U.C]))[0].n === 0);
})().catch((e) => { console.error(e); process.exit(1); });
