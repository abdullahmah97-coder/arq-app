// اختبارات الشفافية: التقييم الموثّق والمفصّل، رد النادي، البلاغات، الذروة، الحضور، السعر الكامل، المقارنة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();

  // verified reviews
  await expectErr('no review without a visit', () => as(U.A, `insert into gym_reviews (gym_id, user_id, rating) values ($1, $2, 5)`, [gym.id, U.A]), /review_needs_visit/);
  await visit(U.A, gym.id);
  await as(U.A, `insert into gym_reviews (gym_id, user_id, rating, body, f_clean, f_equipment, f_crowd) values ($1, $2, 4, 'نظيف بس زحمة', 5, 4, 2)`, [gym.id, U.A]);
  await expectErr('facet 1..5 only', () => as(U.A, `update gym_reviews set f_staff = 9 where user_id = $1`, [U.A]), /check constraint/);
  await visit(U.B, gym.id);
  await as(U.B, `insert into gym_reviews (gym_id, user_id, rating, f_clean) values ($1, $2, 2, 3)`, [gym.id, U.B]);
  const f = (await as(U.C, `select * from gym_review_facets($1)`, [gym.id]))[0];
  check('facet averages', Number(f.clean) === 4 && Number(f.crowd) === 2 && f.rated === 2 && Number(f.verified_share) === 1, JSON.stringify(f));

  // manager reply, cannot delete/edit review
  await expectErr('member cannot reply as gym', () => as(U.B, `insert into gym_review_replies (gym_id, user_id, body) values ($1, $2, 'شكراً')`, [gym.id, U.A]), /row-level security/);
  await as(U.D, `insert into gym_review_replies (gym_id, user_id, body) values ($1, $2, 'شكراً لك، زودنا الأجهزة وقت الذروة')`, [gym.id, U.A]);
  await expectErr('one reply per review', () => as(U.D, `insert into gym_review_replies (gym_id, user_id, body) values ($1, $2, 'ثاني')`, [gym.id, U.A]), /duplicate key/);
  await as(U.D, `update gym_review_replies set body = 'شكراً لك! زودنا الأجهزة' where gym_id = $1 and user_id = $2`, [gym.id, U.A]);
  check('manager cannot delete review', (await as(U.D, `delete from gym_reviews where user_id = $1 returning rating`, [U.A])).length === 0);
  check('manager cannot edit review', (await as(U.D, `update gym_reviews set rating = 5 where user_id = $1 returning rating`, [U.B])).length === 0);
  const list = await as(U.C, `select * from gym_reviews_full($1)`, [gym.id]);
  const ra = list.find((r) => r.user_id === U.A);
  check('reviews list has reply + verified + facets', ra.reply.startsWith('شكراً لك!') && ra.visited === true && ra.f_clean === 5 && ra.can_reply === false);
  check('manager sees can_reply', (await as(U.D, `select * from gym_reviews_full($1)`, [gym.id]))[0].can_reply === true);
  check('reply notified the reviewer', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' like 'rr:%'`, [U.A]))[0].n === 1);

  // flags
  await as(U.C, `insert into review_flags (gym_id, user_id, reason) values ($1, $2, 'fake')`, [gym.id, U.B]);
  await expectErr('flag once', () => as(U.C, `insert into review_flags (gym_id, user_id, reason) values ($1, $2, 'spam')`, [gym.id, U.B]), /duplicate key/);
  check('admin sees flags, others only own', (await as(U.E, `select * from review_flags`)).length === 1 && (await as(U.A, `select * from review_flags`)).length === 0);

  // peak hours
  for (let i = 0; i < 12; i++) {
    await q(`insert into check_ins (user_id, gym_id, checked_in_at, checked_out_at)
             values ($1, $2, date_trunc('week', now()) - make_interval(weeks => $3) + interval '2 days 15 hours', date_trunc('week', now()) - make_interval(weeks => $3) + interval '2 days 16 hours 30 minutes')`,
      [i % 2 ? U.A : U.B, gym.id, 1 + (i % 6)]);
  }
  const peak = await as(U.C, `select * from gym_peak_hours($1, 8)`, [gym.id]);
  const top = peak.reduce((a, b) => (Number(b.avg_present) > Number(a.avg_present) ? b : a));
  check('peak hours aggregate by dow/hour', top.samples >= 12 && Number(top.avg_present) > 0 && peak.every((r) => r.hour >= 0 && r.hour < 24), JSON.stringify(top));
  check('my usual hours', (await as(U.A, `select * from my_usual_hours()`)).length >= 1);

  // attendance
  await as(U.A, `insert into attendance_goals (days_per_week) values (4)`);
  const at = (await as(U.A, `select * from my_attendance()`))[0];
  check('attendance: goal + planned + visits', at.days_per_week === 4 && at.planned_month >= 16 && at.visits >= 0 && Array.isArray(at.visit_days), JSON.stringify(at));
  check('attendance goals private', (await as(U.B, `select * from attendance_goals`)).length === 0);

  // full price
  const o = (await as(U.D, `insert into gym_offers (gym_id, title, price_sar, months, join_fee_sar, vat_included, min_months) values ($1, 'سنوي', 3000, 12, 199, true, 12) returning *`, [gym.id]))[0];
  check('offer full-price fields saved', Number(o.join_fee_sar) === 199 && o.vat_included === true && o.min_months === 12);

  // compare
  const other = (await q(`select id from gyms where verified and id <> $1 limit 1`, [gym.id]))[0];
  const cmp = await as(U.C, `select * from gym_compare($1)`, [[gym.id, other.id]]);
  const cg = cmp.find((r) => r.id === gym.id);
  check('compare returns both gyms with rating, facets, monthly price', cmp.length === 2 && Number(cg.rating) === 3 && Number(cg.clean) === 4 && Number(cg.best_monthly) === 250, JSON.stringify(cg));
})();
