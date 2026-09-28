// اختبارات المدربين: الملف، النادي يعتمد، الربط بموافقة وصلاحيات، السجل الكامل حسب الصلاحية، سجل الاطلاع،
// الملاحظات الخاصة، البرنامج والالتزام، الحصص، التقييم للمتدربين فقط، التقرير الشهري، المراسلة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  // B = مدربة (sara)، A = متدرب (ahmed)، C = شخص ثاني (khalid)، D = مدير النادي

  // ---------- ملف المدرب ----------
  await expectErr('invite needs a coach profile', () => as(U.B, `select coach_invite('ahmed')`), /not_a_coach/);
  await as(U.B, `insert into coach_profiles (user_id, headline, specialties, years_exp, city, price_from_sar) values ($1, 'مدربة لياقة وتنشيف', '{fat_loss,women}', 6, 'الرياض', 250)`, [U.B]);
  await expectErr('bad specialty rejected', () => as(U.B, `update coach_profiles set specialties = '{magic}' where user_id = $1`, [U.B]), /check constraint/);
  await expectErr('cannot create a profile for someone else', () => as(U.C, `insert into coach_profiles (user_id) values ($1)`, [U.A]), /row-level security/);
  check('directory lists the coach', (await as(U.C, `select * from coaches_directory(null, 'fat_loss', null, null)`)).some((c) => c.user_id === U.B && c.verified === false));

  // ---------- النادي يعتمد ----------
  await as(U.B, `insert into coach_gyms (coach_id, gym_id, status) values ($1, $2, 'approved')`, [U.B, gym.id]);
  check('coach cannot self-approve', (await q(`select status from coach_gyms where coach_id = $1`, [U.B]))[0].status === 'pending');
  check('manager notified', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' like 'cg:%'`, [U.D]))[0].n === 1);
  check('pending coach hidden from public gym list', (await as(U.C, `select * from gym_coaches($1)`, [gym.id])).length === 0);
  check('manager sees pending', (await as(U.D, `select * from gym_coaches($1)`, [gym.id]))[0]?.status === 'pending');
  check('stranger cannot approve', (await as(U.C, `update coach_gyms set status = 'approved' where coach_id = $1 returning 1`, [U.B])).length === 0);
  await as(U.D, `update coach_gyms set status = 'approved' where coach_id = $1 and gym_id = $2`, [U.B, gym.id]);
  check('approved coach shows on gym page', (await as(U.C, `select * from gym_coaches($1)`, [gym.id]))[0]?.user_id === U.B);

  // ---------- الربط ----------
  const link = (await as(U.B, `select coach_invite('@Ahmed', 'أهلاً')::text id`))[0].id;
  await expectErr('no duplicate invite', () => as(U.B, `select coach_invite('ahmed')`), /already_linked/);
  await expectErr('coach cannot accept own invite', () => as(U.B, `select coach_link_respond($1, true, '{workouts}')`, [link]), /not_allowed/);
  await expectErr('no data before acceptance', () => as(U.B, `select * from client_timeline($1)`, [U.A]), /not_allowed/);
  await as(U.A, `select coach_link_respond($1, true, '{workouts,visits,bogus}')`, [link]);
  const l1 = (await q(`select * from coach_links where id = $1`, [link]))[0];
  check('link active with cleaned scopes', l1.status === 'active' && JSON.stringify(l1.scopes) === '["visits","workouts"]', JSON.stringify(l1.scopes));
  check('coach notified of acceptance', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' = $2`, [U.B, 'cla:' + link]))[0].n === 1);

  // بيانات المتدرب
  const s = (await as(U.A, `insert into workout_sessions (user_id, title, started_at, finished_at) values ($1, 'صدر', now() - interval '2 hours', now() - interval '1 hour') returning id`, [U.A]))[0];
  await as(U.A, `insert into workout_sets (session_id, user_id, exercise_id, set_index, reps, weight_kg) values ($1, $2, 'bench', 1, 10, 60), ($1, $2, 'bench', 2, 8, 70)`, [s.id, U.A]);
  await visit(U.A, gym.id);
  await as(U.A, `insert into inbody_reports (user_id, test_date, metrics) values ($1, app_today(), '{"weight_kg": 82.5, "pbf_pct": 21}')`, [U.A]);
  await as(U.A, `insert into food_logs (slot, name, kcal, protein_g) values ('lunch', 'رز ودجاج', 650, 45)`);

  const tl = await as(U.B, `select * from client_timeline($1)`, [U.A]);
  const kinds = new Set(tl.map((r) => r.kind));
  check('coach sees only granted kinds', kinds.has('workout') && kinds.has('visit') && !kinds.has('inbody') && !kinds.has('food'), [...kinds].join(','));
  check('workout detail has volume', Number(tl.find((r) => r.kind === 'workout').detail.volume) === 1160);
  check('access logged for client', (await as(U.A, `select what from coach_access_log order by what`)).map((r) => r.what).join(',') === 'visits,workouts');
  const own = new Set((await as(U.A, `select distinct kind from client_timeline($1)`, [U.A])).map((r) => r.kind));
  check('client sees own full record', ['workout', 'visit', 'inbody', 'food'].every((k) => own.has(k)), [...own].join(','));
  await expectErr('stranger cannot read the record', () => as(U.C, `select * from client_timeline($1)`, [U.A]), /not_allowed/);
  check('health tables still private (RLS)', (await as(U.B, `select * from inbody_reports`)).length === 0 && (await as(U.B, `select * from food_logs`)).length === 0);

  // المتدرب يوسّع ويسحب الصلاحيات
  await as(U.A, `select coach_link_scopes($1, '{workouts,visits,inbody}')`, [link]);
  check('granted inbody now visible', (await as(U.B, `select * from client_timeline($1)`, [U.A])).some((r) => r.kind === 'inbody' && Number(r.detail.weight_kg) === 82.5));
  await expectErr('coach cannot change scopes', () => as(U.B, `select coach_link_scopes($1, '{food}')`, [link]), /link_not_found/);

  // ---------- ملاحظات، برنامج، حصص ----------
  await as(U.B, `insert into coach_notes (client_id, body) values ($1, 'ركبته اليسار تحتاج انتباه')`, [U.A]);
  check('notes private to coach', (await as(U.A, `select * from coach_notes`)).length === 0 && (await as(U.B, `select * from coach_notes`)).length === 1);
  await expectErr('cannot note a non-client', () => as(U.B, `insert into coach_notes (client_id, body) values ($1, 'x')`, [U.C]), /row-level security/);
  await as(U.B, `insert into coach_assignments (client_id, title, days_per_week) values ($1, 'تنشيف ٤ أيام', 4)`, [U.A]);
  const cc = (await as(U.B, `select * from coach_clients()`))[0];
  check('coach clients: program + adherence', cc.program === 'تنشيف ٤ أيام' && cc.adherence >= 0 && cc.adherence <= 100 && cc.last_workout_at, JSON.stringify(cc));
  const sess = (await as(U.B, `insert into coach_sessions (client_id, starts_at, place) values ($1, now() + interval '2 days', 'النادي') returning id`, [U.A]))[0];
  check('client notified of session', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'key' = $2`, [U.A, 'cs:' + sess.id]))[0].n === 1);
  const mc = (await as(U.A, `select * from my_coaches()`))[0];
  check('my coaches: next session + program + last access', mc.next_session_at && mc.program === 'تنشيف ٤ أيام' && mc.last_access_at);
  await expectErr('client cannot mark session done', async () => {
    const r = await as(U.A, `update coach_sessions set status = 'done' where id = $1 returning 1`, [sess.id]);
    if (!r.length) throw new Error('row-level security: no rows');
  }, /row-level security/);
  await as(U.A, `select cancel_coach_session($1)`, [sess.id]);
  check('client cancelled session', (await q(`select status from coach_sessions where id = $1`, [sess.id]))[0].status === 'cancelled');
  const done = (await as(U.B, `insert into coach_sessions (client_id, starts_at, status) values ($1, now() - interval '1 day', 'done') returning id`, [U.A]))[0];

  // التقرير الشهري
  const rep = (await as(U.B, `select * from client_month_report($1)`, [U.A]))[0];
  check('month report scoped', rep.workouts === 1 && rep.visits >= 1 && Number(rep.weight_end) === 82.5 && rep.avg_kcal === null && rep.sessions_done >= 1, JSON.stringify(rep));
  const repSelf = (await as(U.A, `select * from client_month_report($1)`, [U.A]))[0];
  check('self report includes food', repSelf.avg_kcal === 650 && repSelf.avg_protein === 45);

  // ---------- التقييم ----------
  await expectErr('non-client cannot review coach', () => as(U.C, `insert into coach_reviews (coach_id, rating) values ($1, 5)`, [U.B]), /not_a_client/);
  await as(U.A, `insert into coach_reviews (coach_id, rating, body) values ($1, 5, 'ممتازة')`, [U.B]);
  const det = (await as(U.C, `select * from coach_detail($1)`, [U.B]))[0];
  check('coach detail: rating, clients, gyms', Number(det.rating) === 5 && det.reviews === 1 && det.clients === 1 && det.gyms.length === 1, JSON.stringify(det).slice(0, 200));
  check('can_review only for clients', (await as(U.A, `select can_review from coach_detail($1)`, [U.B]))[0].can_review === true && det.can_review === false);

  // ---------- المراسلة بين المدرب والمتدرب ----------
  await as(U.B, `insert into messages (sender, recipient, body) values ($1, $2, 'لا تنسى تمرين بكرة')`, [U.B, U.A]);
  check('linked coach can message client', (await as(U.A, `select count(*)::int n from messages`))[0].n === 1);

  // ---------- طلب من المتدرب + الإنهاء ----------
  await as(U.C, `insert into coach_profiles (user_id, accepting) values ($1, false)`, [U.C]);
  await expectErr('coach not accepting', () => as(U.A, `select coach_request($1, '{workouts}')`, [U.C]), /not_a_coach/);
  await as(U.C, `update coach_profiles set accepting = true where user_id = $1`, [U.C]);
  const l2 = (await as(U.A, `select coach_request($1, '{health}', 'ابي أنزل وزن')::text id`, [U.C]))[0].id;
  await expectErr('client cannot accept own request', () => as(U.A, `select coach_link_respond($1, true)`, [l2]), /not_allowed/);
  await as(U.C, `select coach_link_respond($1, false)`, [l2]);
  check('declined request', (await q(`select status from coach_links where id = $1`, [l2]))[0].status === 'declined');

  await as(U.A, `select coach_link_end($1)`, [link]);
  await expectErr('ended link: no more access', () => as(U.B, `select * from client_timeline($1)`, [U.A]), /not_allowed/);
  await expectErr('ended link: no more messages', () => as(U.B, `insert into messages (sender, recipient, body) values ($1, $2, 'x')`, [U.B, U.A]), /row-level security/);
  check('review stays after ending', (await q(`select count(*)::int n from coach_reviews where coach_id = $1`, [U.B]))[0].n === 1);
  void done;

  // توثيق المدرب: طابور المالك
  await as(U.B, `update coach_profiles set verify_requested_at = now() where user_id = $1`, [U.B]);
  check('owner sees verification queue', (await as(U.E, `select * from coach_verification_queue()`)).length === 1 && (await as(U.A, `select * from coach_verification_queue()`)).length === 0);
})();
