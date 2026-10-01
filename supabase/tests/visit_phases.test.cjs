// «في النادي» و«انتهى التمرين»: كل بطاقة بتفاعلها وتعليقاتها (ما يتكرر نفس التعليق على البطاقتين)
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U, gym, visit } = await setup();
  const tl = async (uid) => as(uid, `select item_type, id, like_count, comment_count, my_reaction, reactors from timeline(now() + interval '1 minute', 50)`);
  const card = async (uid, id, type) => (await tl(uid)).find((r) => r.id === id && r.item_type === type);

  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);
  const [{ id: ci }] = await visit(U.B, gym.id, "now() - interval '2 hours'"); // دخل قبل ساعتين وطلع بعد ساعة

  // ---------- التفاعل ----------
  await as(U.A, `insert into checkin_likes (check_in_id, user_id, emoji) values ($1, $2, 'fire')`, [ci, U.A]);
  let cin = await card(U.A, ci, 'checkin');
  let cout = await card(U.A, ci, 'checkout');
  check('a reaction without a card (old app) stays on the check-in card only', Number(cin.like_count) === 1 && cin.my_reaction === 'fire'
    && Number(cout.like_count) === 0 && cout.my_reaction === null && !cout.reactors.length);
  await as(U.A, `insert into checkin_likes (check_in_id, user_id, emoji, phase) values ($1, $2, 'strong', 'out')`, [ci, U.A]);
  cin = await card(U.A, ci, 'checkin');
  cout = await card(U.A, ci, 'checkout');
  check('«workout done» has its own reaction (same person can react to both)', Number(cout.like_count) === 1 && cout.my_reaction === 'strong'
    && cout.reactors[0].e === 'strong' && cin.my_reaction === 'fire' && Number(cin.like_count) === 1);
  check('«who reacted» per card', (await as(U.B, `select emoji from reactions_of('checkout', $1)`, [ci])).map((r) => r.emoji).join() === 'strong'
    && (await as(U.B, `select emoji from reactions_of('checkin', $1)`, [ci])).map((r) => r.emoji).join() === 'fire');
  await as(U.A, `update checkin_likes set emoji = 'clap' where check_in_id = $1 and user_id = $2 and phase = 'out'`, [ci, U.A]);
  check('changing one card’s reaction leaves the other', (await card(U.A, ci, 'checkout')).my_reaction === 'clap' && (await card(U.A, ci, 'checkin')).my_reaction === 'fire');
  await as(U.A, `delete from checkin_likes where check_in_id = $1 and user_id = $2 and phase = 'out'`, [ci, U.A]);
  check('removing the «workout done» reaction keeps the check-in one', Number((await card(U.A, ci, 'checkout')).like_count) === 0
    && (await card(U.A, ci, 'checkin')).my_reaction === 'fire');
  await expectErr('a card can’t be swapped on an existing reaction', () => as(U.A, `update checkin_likes set phase = 'out' where check_in_id = $1 and user_id = $2`, [ci, U.A]), /permission denied/);

  // ---------- التعليقات ----------
  await as(U.A, `insert into checkin_comments (check_in_id, user_id, body) values ($1, $2, 'يا وحش')`, [ci, U.A]);
  await as(U.A, `insert into checkin_comments (check_in_id, user_id, body, phase) values ($1, $2, 'عافية', 'out')`, [ci, U.A]);
  await as(U.A, `insert into checkin_comments (check_in_id, user_id, body, phase) values ($1, $2, 'كفو', 'out')`, [ci, U.A]);
  cin = await card(U.B, ci, 'checkin');
  cout = await card(U.B, ci, 'checkout');
  check('comment counts per card (not repeated)', Number(cin.comment_count) === 1 && Number(cout.comment_count) === 2, `${cin.comment_count}/${cout.comment_count}`);
  const outBodies = (await as(U.B, `select body from checkin_comments where check_in_id = $1 and phase = 'out' order by created_at`, [ci])).map((r) => r.body).join();
  check('each card lists its own comments', outBodies === 'عافية,كفو'
    && (await as(U.B, `select body from checkin_comments where check_in_id = $1 and phase = 'in'`, [ci])).map((r) => r.body).join() === 'يا وحش');

  // ---------- التنبيهات ----------
  await as(U.A, `insert into checkin_likes (check_in_id, user_id, emoji, phase) values ($1, $2, 'love', 'out')`, [ci, U.A]);
  const notes = await q(`select kind, data from notifications where user_id = $1 and actor_id = $2 and target_id = $3 order by id`, [U.B, U.A, ci]);
  const likes = notes.filter((n) => n.kind === 'checkin_like');
  const comments = notes.filter((n) => n.kind === 'checkin_comment');
  check('one reaction notice per card (reacting again on the same card doesn’t notify twice)', likes.length === 2
    && likes.some((n) => !n.data.phase) && likes.some((n) => n.data.phase === 'out'), JSON.stringify(likes));
  check('comment notices know their card', comments.length === 3 && comments.filter((n) => n.data.phase === 'out').length === 2 && comments.some((n) => !n.data.phase));

  // ---------- صفحة النادي «الموجودين»: الدخول بس ----------
  const pres = (await as(U.A, `select likes, comments, liked_by_me from gym_presence($1) where check_in_id = $2`, [gym.id, ci]))[0];
  check('gym page counts the check-in card only', pres && Number(pres.likes) === 1 && Number(pres.comments) === 1 && pres.liked_by_me === true, JSON.stringify(pres));

  // ---------- ما فيه «انتهى التمرين» = ما فيه تفاعل عليه ----------
  const [{ id: open }] = await q(`insert into check_ins (user_id, gym_id, checked_in_at) values ($1, $2, now() - interval '10 minutes') returning id`, [U.B, gym.id]);
  await expectErr('no reaction on a «workout done» that doesn’t exist yet', () => as(U.A, `insert into checkin_likes (check_in_id, user_id, phase) values ($1, $2, 'out')`, [open, U.A]), /row-level security/);
  await expectErr('…nor a comment', () => as(U.A, `insert into checkin_comments (check_in_id, user_id, body, phase) values ($1, $2, 'x', 'out')`, [open, U.A]), /row-level security/);
  check('…the check-in itself still works', (await as(U.A, `insert into checkin_likes (check_in_id, user_id) values ($1, $2) returning phase`, [open, U.A]))[0].phase === 'in');
  await expectErr('unknown card rejected', () => as(U.A, `insert into checkin_comments (check_in_id, user_id, body, phase) values ($1, $2, 'x', 'later')`, [ci, U.A]), /check constraint/);
  await expectErr('strangers still can’t react', () => as(U.C, `insert into checkin_likes (check_in_id, user_id, phase) values ($1, $2, 'out')`, [ci, U.C]), /row-level security/);

  // ---------- الترحيل: القديم يروح للبطاقة الصحيحة، ومرة ثانية ما يحرّك شي ----------
  await db.exec(`alter table checkin_likes drop constraint checkin_likes_pkey;
                 delete from checkin_likes where phase = 'out';
                 alter table checkin_likes drop column phase cascade;
                 alter table checkin_likes add primary key (check_in_id, user_id);
                 delete from checkin_comments;
                 alter table checkin_comments drop column phase cascade;
                 alter table checkin_likes disable trigger notify_checkin_like;
                 alter table checkin_comments disable trigger notify_checkin_comment;`);
  const [{ id: v1 }] = await q(`insert into check_ins (user_id, gym_id, checked_in_at, checked_out_at) values ($1, $2, now() - interval '5 hours', now() - interval '4 hours') returning id`, [U.B, gym.id]);
  const [{ id: v2 }] = await q(`insert into check_ins (user_id, gym_id, checked_in_at, checked_out_at) values ($1, $2, now() - interval '7 hours', now() - interval '7 hours' + interval '2 minutes') returning id`, [U.B, gym.id]);
  await q(`insert into checkin_likes (check_in_id, user_id, emoji, created_at) values ($1, $2, 'fire', now() - interval '270 minutes'), ($1, $3, 'clap', now() - interval '230 minutes')`, [v1, U.A, U.C]);
  await q(`insert into checkin_comments (check_in_id, user_id, body, created_at) values
           ($1, $2, 'قبل الخروج', now() - interval '260 minutes'), ($1, $2, 'بعد الخروج', now() - interval '200 minutes'),
           ($3, $2, 'زيارة قصيرة', now() - interval '6 hours')`, [v1, U.A, v2]);
  const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261002000850_visit_phases.sql'), 'utf8');
  await db.exec(mig);
  await db.exec(`alter table checkin_likes enable trigger notify_checkin_like; alter table checkin_comments enable trigger notify_checkin_comment;`);
  const phases = async () => ({
    likes: (await q(`select user_id, phase from checkin_likes where check_in_id = $1 order by created_at`, [v1])).map((r) => r.phase).join(),
    comments: (await q(`select phase from checkin_comments where check_in_id = $1 order by created_at`, [v1])).map((r) => r.phase).join(),
    short: (await q(`select phase from checkin_comments where check_in_id = $1`, [v2])).map((r) => r.phase).join(),
  });
  let ph = await phases();
  check('old reactions/comments: before check-out → check-in card, after → «workout done»', ph.likes === 'in,out' && ph.comments === 'in,out', JSON.stringify(ph));
  check('a visit with no «workout done» card keeps everything on the check-in', ph.short === 'in');
  await as(U.A, `insert into checkin_comments (check_in_id, user_id, body) values ($1, $2, 'تعليق جديد على الدخول')`, [v1, U.A]);
  await db.exec(mig);
  ph = await phases();
  check('running the migration again moves nothing', ph.likes === 'in,out' && ph.comments === 'in,out,in', JSON.stringify(ph));
  check('…and the rules are back', (await as(U.A, `insert into checkin_comments (check_in_id, user_id, body, phase) values ($1, $2, 'عافية', 'out') returning phase`, [v1, U.A]))[0].phase === 'out');
  await expectErr('…including the «workout done must exist» rule', () => as(U.A, `insert into checkin_likes (check_in_id, user_id, phase) values ($1, $2, 'out')`, [open, U.A]), /row-level security/);
})();
