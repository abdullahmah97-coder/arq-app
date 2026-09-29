// الإعجاب في صفحة النادي: الإعجاب بالفرع وبالسلسلة، والإعجاب بتعليقات الأعضاء، وتعليقات السلسلة كاملة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  const chain = (await q(`select id from gym_chains order by name limit 1`))[0];
  await q(`update gyms set chain_id = $1 where id = $2`, [chain.id, gym.id]);
  const state = async (uid, g, c) => (await as(uid, `select * from club_like_state($1, $2)`, [g, c]))[0];

  // ---------- الإعجاب بالفرع ----------
  let r = (await as(U.A, `select * from toggle_club_like($1, null)`, [gym.id]))[0];
  check('like a gym', r.likes === 1 && r.liked === true, JSON.stringify(r));
  check('others see the count but not as liked', (await state(U.B, gym.id, null)).likes === 1 && (await state(U.B, gym.id, null)).liked === false);
  await as(U.B, `select * from toggle_club_like($1, null)`, [gym.id]);
  check('two people like it', (await state(U.C, gym.id, null)).likes === 2);
  r = (await as(U.A, `select * from toggle_club_like($1, null)`, [gym.id]))[0];
  check('pressing again removes the like', r.likes === 1 && r.liked === false, JSON.stringify(r));

  // ---------- الإعجاب بالسلسلة ----------
  r = (await as(U.A, `select * from toggle_club_like(null, $1)`, [chain.id]))[0];
  check('like a chain', r.likes === 1 && r.liked === true);
  check('chain likes are separate from branch likes', (await state(U.A, gym.id, null)).likes === 1 && (await state(U.A, null, chain.id)).likes === 1);
  await expectErr('one target only', () => as(U.A, `select * from toggle_club_like($1, $2)`, [gym.id, chain.id]), /bad_target/);
  await expectErr('a target is required', () => as(U.A, `select * from toggle_club_like(null, null)`), /bad_target/);
  await expectErr('unknown club', () => as(U.A, `select * from toggle_club_like($1, null)`, ['99999999-9999-4999-8999-999999999999']), /not_found/);
  await expectErr('no direct inserts', () => as(U.A, `insert into club_likes (user_id, gym_id) values ($1, $2)`, [U.A, gym.id]), /permission denied|row-level security/);
  await expectErr('signed-out users cannot like', () => as(null, `select * from toggle_club_like($1, null)`, [gym.id]), /not_authenticated|permission denied/);
  check('people only read their own likes', (await as(U.C, `select 1 from club_likes`)).length === 0);

  // ---------- الإعجاب بتعليقات الأعضاء ----------
  await visit(U.B, gym.id);
  await as(U.B, `insert into gym_reviews (gym_id, user_id, rating, body) values ($1, $2, 5, 'نظيف والأجهزة جديدة')`, [gym.id, U.B]);
  r = (await as(U.A, `select * from toggle_review_like($1, $2)`, [gym.id, U.B]))[0];
  check('like a comment', r.likes === 1 && r.liked === true);
  await expectErr('no liking your own comment', () => as(U.B, `select * from toggle_review_like($1, $2)`, [gym.id, U.B]), /own_review/);
  await expectErr('comment must exist', () => as(U.A, `select * from toggle_review_like($1, $2)`, [gym.id, U.C]), /not_found/);
  let full = (await as(U.A, `select user_id, likes, liked, visited from gym_reviews_full($1)`, [gym.id]))[0];
  check('branch comments carry likes and my like', full.likes === 1 && full.liked === true && full.visited === true, JSON.stringify(full));
  full = (await as(U.C, `select likes, liked from gym_reviews_full($1)`, [gym.id]))[0];
  check('someone else sees the count, not liked', full.likes === 1 && full.liked === false);

  // ---------- تعليقات السلسلة ----------
  const cr = await as(U.C, `select gym_id, gym_name, user_id, rating, likes, liked, can_reply from chain_reviews_full($1)`, [chain.id]);
  check('chain page lists comments from its branches', cr.length === 1 && cr[0].gym_id === gym.id && cr[0].gym_name && cr[0].rating === 5, JSON.stringify(cr));
  check('chain comments carry likes', cr[0].likes === 1 && cr[0].liked === false);
  r = (await as(U.A, `select * from toggle_review_like($1, $2)`, [gym.id, U.B]))[0];
  check('pressing again removes the comment like', r.likes === 0 && r.liked === false);

  // حذف التعليق يحذف إعجاباته
  await as(U.C, `select * from toggle_review_like($1, $2)`, [gym.id, U.B]);
  await q(`delete from gym_reviews where gym_id = $1 and user_id = $2`, [gym.id, U.B]);
  check('deleting a comment removes its likes', (await q(`select count(*)::int n from review_likes`))[0].n === 0);
})();
