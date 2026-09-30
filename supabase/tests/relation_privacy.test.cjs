// خصوصية العلاقات: ما تقدر تسأل «هل فلان صديق فلان؟» أو «مدرب مين؟» إلا عن نفسك (أو المشرف)
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, U } = await setup();
  // A و B أصدقاء، و C غريب
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);
  const rpc = async (name, uid, a, b) => {
    await q(`select set_config('request.path', $1, false)`, [`/rpc/${name}`]);
    try { return (await as(uid, `select ${name}($1, $2) v`, [a, b]))[0].v; }
    finally { await q(`select set_config('request.path', '', false)`); }
  };

  check('I can ask about me and my friend (mutual_follow)', (await rpc('mutual_follow', U.A, U.A, U.B)) === true);
  check('I can ask about me and my friend (are_friends)', (await rpc('are_friends', U.B, U.A, U.B)) === true);
  check('a stranger asking about two other people gets no answer (mutual_follow)', (await rpc('mutual_follow', U.C, U.A, U.B)) === false);
  check('a stranger asking about two other people gets no answer (are_friends)', (await rpc('are_friends', U.C, U.A, U.B)) === false);
  check('the admin can still check any pair', (await rpc('mutual_follow', U.E, U.A, U.B)) === true);
  check('signed-out visitors get nothing', (await rpc('are_friends', null, U.A, U.B)) === false);

  // داخل القاعدة ما تغيّر شي: الرسائل والتايم لاين والمنشورات للأصدقاء
  const m = await as(U.A, `insert into messages (sender, recipient, body) values ($1, $2, 'هلا') returning id`, [U.A, U.B]);
  check('friends can still message each other (the rule uses mutual_follow inside)', m.length === 1);
  const p = (await as(U.B, `insert into posts (user_id, caption, visibility) values ($1, 'للأصدقاء', 'friends') returning id`, [U.B]))[0].id;
  check('a friend still sees friends-only posts (can_see_post uses are_friends inside)', (await as(U.A, `select 1 from posts where id = $1`, [p])).length === 1);
  check('a stranger still does not', (await as(U.C, `select 1 from posts where id = $1`, [p])).length === 0);
  check('inbox still knows who I can message', (await as(U.A, `select can_message from inbox()`))[0]?.can_message === true);
})().catch((e) => { console.error(e); process.exit(1); });
