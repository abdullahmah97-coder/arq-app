// المنافسة: «أظهرني في المتصدرين» — غير أصدقائك ما يطلعون إلا إذا اختاروا، واللي نقاطهم صفر ما يطلعون في «ناديي» و«الكل»
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym } = await setup();
  const names = (rows) => rows.map((r) => r.username);
  const lb = (uid, scope) => as(uid, `select * from leaderboard($1, now() - interval '7 days')`, [scope]);

  // A و B أصدقاء. A و C و D بنفس النادي. E بعيد
  await q(`insert into friendships (requester, addressee, status) values ($1, $2, 'accepted')`, [U.A, U.B]);
  await q(`update profiles set gym_id = $1 where id = any($2::uuid[])`, [gym.id, [U.A, U.C, U.D]]);
  const pts = [[U.A, 30], [U.B, 20], [U.C, 50], [U.E, 40]];
  for (const [u, n] of pts) await q(`insert into points_ledger (user_id, amount, reason) values ($1, $2, 'workout')`, [u, n]);
  // نقاط قديمة (قبل هالأسبوع) ما تحسب
  await q(`insert into points_ledger (user_id, amount, reason, created_at) values ($1, 99, 'workout', now() - interval '30 days')`, [U.D]);

  check('everyone starts hidden (default off)', (await q(`select count(*)::int as n from profiles where show_on_leaderboard`))[0].n === 0);

  // «الأصدقاء»: زي ما هو
  const f = await lb(U.A, 'friends');
  check('friends: me + my friend', JSON.stringify(names(f)) === JSON.stringify(['ahmed', 'sara']), JSON.stringify(names(f)));

  // «الكل» و«ناديي»: ما يطلع غير أنا وأصدقائي
  let g = await lb(U.A, 'global');
  check('global: strangers who did not opt in are hidden', JSON.stringify(names(g)) === JSON.stringify(['ahmed', 'sara']), JSON.stringify(names(g)));
  let gy = await lb(U.A, 'gym');
  check('gym: only me (khalid and manager1 are strangers)', JSON.stringify(names(gy)) === JSON.stringify(['ahmed']), JSON.stringify(names(gy)));

  // C يشغّل «أظهرني» بنفسه ← يطلع للكل
  await as(U.C, `update profiles set show_on_leaderboard = true where id = $1`, [U.C]);
  g = await lb(U.A, 'global');
  check('global: opted-in stranger shows, ranked first', JSON.stringify(names(g)) === JSON.stringify(['khalid', 'ahmed', 'sara']) && Number(g[0].rank) === 1, JSON.stringify(g.map((r) => [r.username, Number(r.points), Number(r.rank)])));
  gy = await lb(U.A, 'gym');
  check('gym: opted-in gym mate shows', JSON.stringify(names(gy)) === JSON.stringify(['khalid', 'ahmed']), JSON.stringify(names(gy)));

  // D شغّله بس نقاطه هالأسبوع صفر ← ما يطلع
  await as(U.D, `update profiles set show_on_leaderboard = true where id = $1`, [U.D]);
  gy = await lb(U.A, 'gym');
  check('opted in but zero points this week → hidden', !names(gy).includes('manager1'), JSON.stringify(names(gy)));

  // أنا دايم أشوف ترتيبي حتى لو نقاطي صفر وأنا مخفي
  const mine = await lb(U.D, 'global');
  check('I always see myself (even at zero)', names(mine).includes('manager1'), JSON.stringify(names(mine)));
  const eSees = await lb(U.E, 'global');
  check('a hidden user sees himself, others do not see him', names(eSees).includes('admin1') && !names(g).includes('admin1'), JSON.stringify(names(eSees)));

  // صديقي بنقاط صفر ما يطلع في «الكل» بس يطلع في «الأصدقاء»
  await q(`delete from points_ledger where user_id = $1`, [U.B]);
  g = await lb(U.A, 'global');
  const f2 = await lb(U.A, 'friends');
  check('friend at zero: hidden in global, still in friends', !names(g).includes('sara') && names(f2).includes('sara'), JSON.stringify([names(g), names(f2)]));

  // يطفيه ← يختفي
  await as(U.C, `update profiles set show_on_leaderboard = false where id = $1`, [U.C]);
  g = await lb(U.A, 'global');
  check('turned off → gone again', !names(g).includes('khalid'), JSON.stringify(names(g)));

  // ما أحد يقدر يغيّره لغيره، والزوار ما يقدرون يستدعون الدالة
  const other = await as(U.A, `update profiles set show_on_leaderboard = true where id = $1 returning 1`, [U.C]);
  check("cannot turn it on for someone else", other.length === 0 && (await q(`select show_on_leaderboard from profiles where id = $1`, [U.C]))[0].show_on_leaderboard === false);
  await expectErr('anon cannot call leaderboard', () => as(null, `select * from leaderboard('global', now() - interval '7 days')`), /permission denied/);
})();
