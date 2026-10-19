// توقعات الدوري: الحفظ والقفل مع البداية، الخصوصية (الأصدقاء بعد البداية)، الملخص، النقاط والترتيب، النشر في التايم لاين، وإشعار النهاية
// التشغيل: node supabase/tests/league_predictions.test.cjs
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const iso = (mins) => new Date(Date.now() + mins * 60e3).toISOString();
  const teams = [{ id: 2932, name: 'Al-Hilal Saudi FC', logo: 'https://x.com/h.png' }, { id: 2939, name: 'Al-Nassr', logo: null }, { id: 2938, name: 'Al-Ittihad FC', logo: null }];
  const ingest = (matches) => q(`select league_ingest('full', 2026, $1::jsonb, $2::jsonb, '[]'::jsonb, null, null)`, [JSON.stringify(teams), JSON.stringify(matches)]);
  await ingest([
    { id: 5001, league: 307, season: 2026, kickoff: iso(120), status: 'NS', home: 2932, away: 2939 },   // بعد ساعتين
    { id: 5002, league: 307, season: 2026, kickoff: iso(180), status: 'NS', home: 2938, away: 2932 },
    { id: 5003, league: 307, season: 2026, kickoff: iso(240), status: 'NS', home: 2939, away: 2938 },
  ]);
  // أ وب أصدقاء، ج مو صديق لأحد، د صديق أ
  await q(`insert into friendships (requester, addressee, status) values ($1, $2, 'accepted'), ($1, $3, 'accepted')`, [U.A, U.B, U.D]);

  const predict = (uid, m, h, a) => as(uid, `select league_predict($1, $2, $3) as r`, [m, h, a]).then((r) => r[0].r);
  const summary = (uid, m) => as(uid, `select league_pred_summary($1) as s`, [m]).then((r) => r[0].s);
  const board = (uid, scope = 'friends') => as(uid, `select * from league_pred_board($1, null, 50)`, [scope]);
  const kickoff = (m, mins) => q(`update league_matches set kickoff = $2 where id = $1`, [m, iso(mins)]);
  const finish = (m, hg, ag) => q(`update league_matches set status = 'FT', home_goals = $2, away_goals = $3, kickoff = $4 where id = $1`, [m, hg, ag, iso(-120)]);

  // ---------- الحفظ ----------
  const r1 = await predict(U.A, 5001, 2, 1);
  check('A predicts 2-1', r1.home === 2 && r1.away === 1);
  await predict(U.A, 5001, 3, 1);
  check('…and can change it before kick-off (one row)', (await q(`select home, away from league_predictions where user_id = $1`, [U.A])).map((x) => `${x.home}-${x.away}`).join() === '3-1');
  await expectErr('a score must be 0..20', () => predict(U.A, 5001, 21, 0), /bad_score/);
  await expectErr('negative score refused', () => predict(U.A, 5001, -1, 0), /bad_score/);
  await expectErr('unknown match', () => predict(U.A, 999, 1, 0), /not_found/);
  await expectErr('signed out cannot predict', () => as(null, `select league_predict(5001, 1, 0)`), /permission denied|not_signed_in/);
  await expectErr('no direct writes to the table', () => as(U.A, `insert into league_predictions (user_id, match_id, home, away) values ($1, 5002, 1, 1)`, [U.A]), /row-level security|permission denied/);
  await as(U.A, `update league_predictions set home = 9 where user_id = $1`, [U.A]).catch(() => {});
  check('…or direct edits', (await q(`select home from league_predictions where user_id = $1 and match_id = 5001`, [U.A]))[0].home === 3);

  await predict(U.B, 5001, 1, 1);
  await predict(U.C, 5001, 0, 2);
  await predict(U.D, 5001, 3, 1);

  // ---------- الخصوصية قبل البداية ----------
  check('before kick-off a friend’s pick is hidden', (await as(U.A, `select * from league_predictions where match_id = 5001 and user_id <> $1`, [U.A])).length === 0);
  let s = await summary(U.A, 5001);
  check('crowd split counts everyone (2 home, 1 draw, 1 away)', s.total === 4 && s.home_win === 2 && s.draw === 1 && s.away_win === 1 && s.locked === false, JSON.stringify(s));
  check('my pick in the summary, no points yet', s.mine.home === 3 && s.mine.away === 1 && s.mine.points === null && s.mine.shared === false);
  check('friends who predicted are listed without their score; strangers are not', s.friends.length === 2
    && s.friends.every((f) => !('home' in f)) && s.friends.some((f) => f.username === 'sara') && !s.friends.some((f) => f.username === 'khalid'), JSON.stringify(s.friends));

  // ---------- القفل ----------
  await kickoff(5001, -1);
  await expectErr('locked at kick-off', () => predict(U.A, 5001, 1, 0), /locked/);
  await q(`update league_matches set status = '1H' where id = 5002`);
  await expectErr('a match that started early is locked too', () => predict(U.A, 5002, 1, 0), /locked/);
  await q(`update league_matches set status = 'NS' where id = 5002`);

  // ---------- بعد البداية ----------
  check('after kick-off friends see each other’s picks', (await as(U.A, `select home, away from league_predictions where match_id = 5001 and user_id = $1`, [U.B])).length === 1);
  check('…a stranger never does', (await as(U.C, `select * from league_predictions where match_id = 5001 and user_id <> $1`, [U.C])).length === 0);
  s = await summary(U.A, 5001);
  check('summary reveals friends’ scores after kick-off', s.locked === true && s.friends.find((f) => f.username === 'sara').home === 1, JSON.stringify(s.friends));

  // ---------- النقاط ----------
  const pts = async (h, a, hg, ag) => (await q(`select league_pred_points($1, $2, $3, $4) as p`, [h, a, hg, ag]))[0].p;
  check('points: exact 3, right result 1, wrong 0, unfinished null', await pts(3, 1, 3, 1) === 3 && await pts(2, 0, 3, 1) === 1 && await pts(1, 1, 2, 2) === 1
    && await pts(0, 2, 3, 1) === 0 && await pts(1, 1, null, null) === null);
  await finish(5001, 3, 1);
  s = await summary(U.A, 5001);
  check('after full time my points show (exact = 3)', s.mine.points === 3 && s.friends.find((f) => f.username === 'sara').points === 0, JSON.stringify(s));

  // مباراة ثانية: أ يتوقع الفائز بس، ب بالضبط
  await predict(U.A, 5002, 2, 0);
  await predict(U.B, 5002, 1, 3);
  await finish(5002, 0, 2);
  let b = await board(U.A);
  const row = (uname) => b.find((x) => x.username === uname);
  // أ: ٥٠٠١ بالضبط (٣) و٥٠٠٢ غلط (٠) · ب: ٥٠٠١ غلط و٥٠٠٢ الفائز صح (١) · د: ٥٠٠١ بالضبط (٣)
  check('friends board: A 3 (one exact), Sara 1 (one result), D 3; strangers not listed', Number(row('ahmed').points) === 3 && Number(row('ahmed').exact) === 1
    && Number(row('sara').points) === 1 && Number(row('sara').outcome) === 1 && Number(row('manager1').points) === 3 && !row('khalid'), JSON.stringify(b));
  check('played counts finished picks', Number(row('ahmed').played) === 2 && Number(row('sara').played) === 2 && Number(row('manager1').played) === 1);
  check('rank: ties share a rank, ordered by points then exact', Number(row('ahmed').rank) === 1 && Number(row('manager1').rank) === 1, JSON.stringify(b.map((x) => [x.username, x.points, x.rank])));
  b = await board(U.A, 'all');
  check('“all” without opt-in shows only me and my friends', !b.some((x) => x.username === 'khalid'));
  await q(`update profiles set show_on_leaderboard = true where id = $1`, [U.C]);
  b = await board(U.A, 'all');
  check('…and people who chose to appear on leaderboards', b.some((x) => x.username === 'khalid'));
  await q(`insert into user_blocks (blocker, blocked) values ($1, $2)`, [U.A, U.C]).catch(async () => {
    await as(U.A, `select block_user($1)`, [U.C]);
  });
  b = await board(U.A, 'all');
  check('…but never someone I blocked', !b.some((x) => x.username === 'khalid'));
  check('someone with no picks is not listed (except me)', (await board(U.E)).length === 1 && (await board(U.E))[0].username === 'admin1');

  // ---------- النشر في التايم لاين ----------
  await predict(U.A, 5003, 1, 1);
  await expectErr('cannot share without a pick', () => as(U.B, `select league_share_prediction(5003)`), /no_prediction/);
  const post = (await as(U.A, `select league_share_prediction(5003) as p`))[0].p;
  const po = (await q(`select kind, visibility, caption, meta from posts where id = $1`, [post]))[0];
  check('shared as a friends-only post that links the match', po.kind === 'post' && po.visibility === 'friends' && po.meta.league_pred.m === 5003
    && po.caption.includes('النصر') && po.caption.includes('الاتحاد'), JSON.stringify(po));
  check('sharing twice keeps one post', (await as(U.A, `select league_share_prediction(5003) as p`))[0].p === post);
  const tl = await as(U.B, `select id, meta from timeline(now() + interval '1 minute', 50)`);
  check('the friend sees it in the timeline with its match link', tl.some((x) => x.id === post && x.meta.league_pred.m === 5003));
  const card = (await as(U.B, `select league_post_prediction($1) as c`, [post]))[0].c;
  check('the card shows the pick even before kick-off (A chose to share it)', card.pred_home === 1 && card.pred_away === 1 && card.match === 5003 && card.points === null && card.home_ar === 'النصر', JSON.stringify(card));
  check('a stranger gets nothing', (await as(U.C, `select league_post_prediction($1) as c`, [post]))[0].c === null);
  await predict(U.A, 5003, 2, 1);
  check('editing the pick updates the card', (await as(U.B, `select league_post_prediction($1) as c`, [post]))[0].c.pred_home === 2);
  check('summary knows it was shared', (await summary(U.A, 5003)).mine.shared === true);
  await q(`delete from posts where id = $1`, [post]);
  check('if the post is deleted the pick stays and can be shared again', (await summary(U.A, 5003)).mine.shared === false
    && (await as(U.A, `select league_share_prediction(5003) as p`))[0].p !== post);

  // ---------- إشعار النهاية ----------
  await predict(U.A, 5003, 2, 0);
  await predict(U.B, 5003, 0, 0);
  await q(`insert into league_fans (user_id, team_id) values ($1, 2939) on conflict (user_id) do update set team_id = 2939`, [U.A]);
  await q(`update league_matches set status = 'FT', home_goals = 2, away_goals = 0, ft_pending = true where id = 5003`);
  await q(`select _league_ft_notices()`);
  const notes = async (uid) => (await q(`select data from notifications where user_id = $1 and data->>'key' = 'league-ft:5003'`, [uid])).map((r) => r.data);
  const na = await notes(U.A);
  check('a predictor (who is also a fan) gets one notice with the points', na.length === 1 && na[0].title_ar === 'توقعك صح بالضبط! +٣ ⚽' && na[0].body_ar.includes('توقعك 2 - 0') && na[0].url === '/league/5003', JSON.stringify(na));
  const nb = await notes(U.B);
  check('a wrong pick gets the plain full-time notice with the pick', nb.length === 1 && nb[0].title_ar === 'انتهت المباراة ⚽' && nb[0].body_ar.includes('توقعك 0 - 0'), JSON.stringify(nb));

  // ---------- حذف الحساب ----------
  await q(`delete from auth.users where id = $1`, [U.B]);
  check('deleting an account removes its picks', (await q(`select count(*)::int as n from league_predictions where user_id = $1`, [U.B]))[0].n === 0);
})().catch((e) => { console.error(e); process.exit(1); });
