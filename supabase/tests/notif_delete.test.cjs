// اختبارات حذف التنبيهات وتعليمها مقروءة: كل واحد يحذف تنبيهاته هو بس
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, U } = await setup();
  await q(`delete from notifications`);
  await q(`insert into notifications (user_id, actor_id, kind, target_id) values
    ($1, $2, 'follow', null), ($1, $3, 'follow', null), ($1, $2, 'post_like', gen_random_uuid()), ($2, $1, 'follow', null)`, [U.A, U.B, U.C]);
  const mine = await as(U.A, `select id from notifications order by id`);
  check('I see only my notifications', mine.length === 3);

  const one = await as(U.A, `delete from notifications where id = $1 returning id`, [mine[0].id]);
  check('delete one of mine', one.length === 1);
  const others = (await q(`select id from notifications where user_id = $1`, [U.B]))[0].id;
  const blocked = await as(U.A, `delete from notifications where id = $1 returning id`, [others]);
  check("cannot delete someone else's notification", blocked.length === 0 && (await q(`select count(*)::int n from notifications where id = $1`, [others]))[0].n === 1);

  await as(U.A, `select mark_notifications_read(null)`);
  check('mark all as read', (await q(`select count(*)::int n from notifications where user_id = $1 and read_at is null`, [U.A]))[0].n === 0);

  const all = await as(U.A, `delete from notifications where user_id = $1 returning id`, [U.A]);
  check('delete all of mine', all.length === 2 && (await q(`select count(*)::int n from notifications where user_id = $1`, [U.A]))[0].n === 0);
  check("the other user's notifications stay", (await q(`select count(*)::int n from notifications where user_id = $1`, [U.B]))[0].n === 1);
  const sneaky = await as(U.A, `delete from notifications returning id`);
  check('an unfiltered delete only touches my rows', sneaky.length === 0);
})();
