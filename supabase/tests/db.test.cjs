// اختبارات قاعدة البيانات: تشغّل المخطط على Postgres داخل Node (PGlite) وتختبر النقاط والصلاحيات.
// التشغيل: npm run test:db
// Test harness: runs the migration against PGlite with Supabase-like stubs, then exercises RPCs.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');

const ROOT = require('path').join(__dirname, '..');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

const stubs = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
grant usage on schema public, auth, storage to authenticated;
`;

(async () => {
  const db = new PGlite();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const as = async (uid, sql, params) => {
    await db.exec(`reset role; select set_config('request.jwt.sub', '${uid}', false); set role authenticated;`);
    try { return await q(sql, params); } finally { await db.exec('reset role;'); }
  };
  const expectErr = async (label, fn, pattern) => {
    try { await fn(); console.log('FAIL (no error):', label); process.exitCode = 1; }
    catch (e) { const ok = pattern.test(e.message); console.log(ok ? 'ok  ' : 'FAIL', label, '->', e.message); if (!ok) process.exitCode = 1; }
  };
  const check = (label, cond, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', label, extra); if (!cond) process.exitCode = 1; };

  await db.exec(stubs);
  for (const f of fs.readdirSync(`${ROOT}/migrations`).sort()) await db.exec(fs.readFileSync(`${ROOT}/migrations/${f}`, 'utf8'));
  await db.exec(fs.readFileSync(`${ROOT}/seed.sql`, 'utf8'));
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
                 revoke update on public.profiles from authenticated;
                 grant update (username, full_name, avatar_url, bio, gym_id, locale, onboarded) on public.profiles to authenticated;
                 revoke insert, update on public.program_adopts from authenticated;`);
  console.log('ok   migration + seed applied');

  await q(`insert into auth.users (id, raw_user_meta_data) values
    ($1, '{"username":"ahmed","full_name":"Ahmed","gender":"male"}'), ($2, '{"username":"sara","gender":"female"}'), ($3, '{}')`, [A, B, C]);
  const gs = await q('select gender from health_profiles order by gender nulls last');
  check('gender saved from sign-up', gs[0].gender === 'female' && gs[1].gender === 'male' && gs[2].gender === null, JSON.stringify(gs));
  const profs = await q('select username from profiles order by username');
  check('profiles auto-created', profs.length === 3, JSON.stringify(profs.map(p => p.username)));

  const gym = (await q(`select * from gyms where name_en like '%Olaya'`))[0];

  // points column is not user-writable
  await expectErr('user cannot set own points', () => as(A, `update profiles set points = 9999 where id = $1`, [A]), /permission denied/);

  // check-in too far
  await expectErr('check-in far away rejected', () => as(A, 'select * from check_in($1, 24.80, 46.70, 10)', [gym.id]), /too_far/);

  // valid check-in
  const ci = (await as(A, 'select * from check_in($1, $2, $3, 10)', [gym.id, gym.lat + 0.0005, gym.lng]))[0];
  check('check-in inside radius awards 10 pts', ci.points_awarded === 10, `dist=${ci.distance_m}m`);
  await expectErr('double open check-in rejected', () => as(A, 'select * from check_in($1, $2, $3, 0)', [gym.id, gym.lat, gym.lng]), /already_checked_in/);

  // checkout immediately: no long-session bonus
  const co = (await as(A, 'select * from check_out($1)', [ci.id]))[0];
  check('quick check-out no bonus', co.points_awarded === 10);
  // second check-in same day: no points
  const ci2 = (await as(A, 'select * from check_in($1, $2, $3, 0)', [gym.id, gym.lat, gym.lng]))[0];
  check('second check-in same day no points', ci2.points_awarded === 0);
  // simulate long session on ci2? ci2 had 0 points -> no bonus. Test long session on a fresh day instead.
  await as(A, 'select * from check_out($1)', [ci2.id]);

  // streak: fake yesterday
  await q(`update profiles set last_checkin_on = app_today() - 1, streak = 6 where id = $1`, [B]);
  const ciB = (await as(B, 'select * from check_in($1, $2, $3, 0)', [gym.id, gym.lat, gym.lng]))[0];
  check('7-day streak bonus (+25)', ciB.points_awarded === 35);
  // long session bonus for B
  await q(`update check_ins set checked_in_at = now() - interval '1 hour' where id = $1`, [ciB.id]);
  const coB = (await as(B, 'select * from check_out($1)', [ciB.id]))[0];
  check('long session bonus (+5)', coB.points_awarded === 40);
  const pb = (await q('select points, streak, best_streak from profiles where id=$1', [B]))[0];
  check('profile B points/streak', pb.points === 40 && pb.streak === 7 && pb.best_streak === 7, JSON.stringify(pb));

  // unverified gym: no points
  const ug = (await as(C, `insert into gyms (name, lat, lng, created_by) values ('بيتي', 10, 10, $1) returning id`, [C]))[0];
  const ciC = (await as(C, 'select * from check_in($1, 10, 10, 0)', [ug.id]))[0];
  check('unverified gym gives 0 pts', ciC.points_awarded === 0);
  await expectErr('user cannot self-verify gym', () => as(C, `insert into gyms (name, lat, lng, created_by, verified) values ('x',1,1,$1,true)`, [C]), /row-level security/);

  // plans + workout
  const plan = (await as(A, `insert into plans (user_id, source, data) values ($1, 'rules', '{}') returning id`, [A]))[0];
  const w1 = (await as(A, 'select complete_workout($1, 0) as p', [plan.id]))[0].p;
  const w2 = (await as(A, 'select complete_workout($1, 0) as p', [plan.id]))[0].p;
  check('workout +15 once per day', w1 === 15 && w2 === 0);
  await expectErr('cannot complete others plan', () => as(B, 'select complete_workout($1, 0)', [plan.id]), /plan_not_found/);

  // privacy
  const hp = await as(B, 'select * from health_profiles');
  check('health profile only own row visible', hp.length === 1 && hp[0].user_id === B);
  const planB = await as(B, 'select * from plans');
  check('plans private', planB.length === 0);

  // friendships
  await as(A, `insert into friendships (requester, addressee) values ($1, $2)`, [A, B]);
  await expectErr('duplicate reverse request rejected', () => as(B, `insert into friendships (requester, addressee) values ($1, $2)`, [B, A]), /duplicate key/);
  const upd = await as(A, `update friendships set status='accepted' where requester=$1 returning id`, [A]);
  check('requester cannot accept own request', upd.length === 0);
  await as(B, `update friendships set status='accepted' where requester=$1`, [A]);
  check('are_friends after accept', (await q('select are_friends($1,$2) as f', [A, B]))[0].f === true);

  // leaderboard
  const lbF = await as(A, `select * from leaderboard('friends', now() - interval '7 days')`);
  check('friends leaderboard has A+B, B first', lbF.length === 2 && lbF[0].user_id === B, JSON.stringify(lbF.map(r => [r.username, Number(r.points), Number(r.rank)])));
  const lbG = await as(A, `select * from leaderboard('global', now() - interval '7 days')`);
  check('global leaderboard has 3', lbG.length === 3);
  await as(A, 'update profiles set gym_id = $1 where id = $2', [gym.id, A]);
  const lbGym = await as(A, `select * from leaderboard('gym', now() - interval '7 days')`);
  check('gym leaderboard only same gym', lbGym.length === 1);

  // posts & visibility
  const post = (await as(A, `insert into posts (user_id, caption, check_in_id) values ($1, 'تمرين اليوم 💪', $2) returning id`, [A, ci.id]))[0];
  check('friend sees post', (await as(B, 'select * from feed()')).length === 1);
  check('stranger does not see friends-only post', (await as(C, 'select * from feed()')).length === 0);
  await expectErr('stranger cannot comment', () => as(C, `insert into comments (post_id, user_id, body) values ($1, $2, 'hi')`, [post.id, C]), /row-level security/);
  await as(B, `insert into comments (post_id, user_id, body) values ($1, $2, 'كفو!')`, [post.id, B]);
  await as(B, `insert into post_likes (post_id, user_id) values ($1, $2)`, [post.id, B]);
  const fB = (await as(B, 'select * from feed()'))[0];
  check('feed counts', Number(fB.like_count) === 1 && Number(fB.comment_count) === 1 && fB.liked_by_me === true && fB.gym_name === gym.name);
  await expectErr('cannot attach others check-in to post', () => as(B, `insert into posts (user_id, caption, check_in_id) values ($1,'x',$2)`, [B, ci.id]), /row-level security/);

  // challenges
  const ch = (await as(A, `insert into challenges (creator, title, metric, starts_on, ends_on)
      values ($1, 'تحدي الأسبوع', 'checkins', app_today() - 1, app_today() + 6) returning id`, [A]))[0];
  await as(A, `insert into challenge_members (challenge_id, user_id) values ($1, $2)`, [ch.id, B]);
  await expectErr('cannot invite non-friend', () => as(A, `insert into challenge_members (challenge_id, user_id) values ($1, $2)`, [ch.id, C]), /row-level security/);
  check('invitee sees challenge', (await as(B, 'select * from challenges')).length === 1);
  check('outsider does not see challenge', (await as(C, 'select * from challenges')).length === 0);
  await as(B, 'select join_challenge($1)', [ch.id]);
  const st = await as(A, 'select * from challenge_standings($1)', [ch.id]);
  check('standings', st.length === 2 && st.every(s => Number(s.score) === 1 && s.status === 'joined'), JSON.stringify(st.map(s => [s.username, Number(s.score)])));
  await expectErr('outsider cannot view standings', () => as(C, 'select * from challenge_standings($1)', [ch.id]), /forbidden/);

  // settle (make it ended)
  await q(`update challenges set starts_on = app_today() - 8, ends_on = app_today() - 1 where id = $1`, [ch.id]);
  await q(`update check_ins set checked_in_at = now() - interval '2 days' where user_id = $1 and points_awarded > 0`, [A]);
  const before = (await q('select points from profiles where id=$1', [A]))[0].points;
  await as(A, 'select settle_challenge($1)', [ch.id]);
  await as(A, 'select settle_challenge($1)', [ch.id]);
  const after = (await q('select points from profiles where id=$1', [A]))[0].points;
  const bAfter = (await q('select points from profiles where id=$1', [B]))[0].points;
  check('winner gets +50 once, loser none', after - before === 50 && bAfter === 40, `A ${before}->${after}, B ${bAfter}`);

  // inbody reports: private to owner, linkable from plans
  const rep = (await as(A, `insert into inbody_reports (user_id, metrics, test_date) values ($1, '{"weight_kg":66.4}', '2017-03-08') returning id`, [A]))[0];
  check('owner sees own inbody report', (await as(A, 'select * from inbody_reports')).length === 1);
  check('friend cannot see inbody report', (await as(B, 'select * from inbody_reports')).length === 0);
  await expectErr('cannot insert report for someone else', () => as(B, `insert into inbody_reports (user_id, metrics) values ($1, '{}')`, [A]), /row-level security/);
  await as(A, 'update plans set inbody_report_id = $1 where id = $2', [rep.id, plan.id]);
  check('plan linked to report', (await as(A, 'select inbody_report_id from plans where id = $1', [plan.id]))[0].inbody_report_id === rep.id);

  // daily health (phone / watch sync)
  const pA0 = (await q('select points from profiles where id=$1', [A]))[0].points;
  const n1 = await as(A, `select sync_daily_health($1::jsonb) n`, [JSON.stringify([
    { day: new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), steps: 10450, sleep_min: 420, hrv_ms: 62, resting_hr: 55, recovery: 71, strain: 9.4, source: 'apple_health' },
    { day: '2001-01-01', steps: 99999, source: 'apple_health' },
  ])]);
  check('sync accepts today, ignores stale days', n1[0].n === 1, JSON.stringify(n1));
  await as(A, `select sync_daily_health($1::jsonb)`, [JSON.stringify([{ day: new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), steps: 8000, source: 'health_connect' }])]);
  const hA = await as(A, 'select * from daily_health');
  check('steps never decrease, sleep kept', hA.length === 1 && hA[0].steps === 10450 && hA[0].sleep_min === 420, JSON.stringify(hA[0] && [hA[0].steps, hA[0].sleep_min]));
  const pA1 = (await q('select points from profiles where id=$1', [A]))[0].points;
  check('10k steps = +5 points once', pA1 - pA0 === 5, `${pA0}->${pA1}`);
  check('friend cannot read raw health rows', (await as(B, 'select * from daily_health')).length === 0);
  await expectErr('direct insert blocked', () => as(B, `insert into daily_health (user_id, day, steps) values ($1, app_today(), 50000)`, [B]), /row-level security|permission denied/);
  await expectErr('absurd steps rejected', () => as(B, `select sync_daily_health($1::jsonb)`, [JSON.stringify([{ day: new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), steps: 900000 }])]), /check constraint/);
  const sl = await as(B, 'select * from steps_leaderboard(app_today() - 6, app_today())');
  check('steps leaderboard shows friends', sl.length === 2 && sl[0].username === 'ahmed' && Number(sl[0].steps) === 10450, JSON.stringify(sl.map(r => [r.username, Number(r.steps)])));
  const chS = (await as(A, `insert into challenges (creator, title, metric, starts_on, ends_on) values ($1, 'تحدي الخطوات', 'steps', app_today(), app_today() + 6) returning id`, [A]))[0];
  const stS = await as(A, 'select * from challenge_standings($1)', [chS.id]);
  check('steps challenge standings', Number(stS[0].score) === 10450, JSON.stringify(stS.map(s => Number(s.score))));

  // beta feedback
  await as(A, `insert into beta_feedback (user_id, category, message, app_version, platform) values ($1, 'bug', 'الزر ما يشتغل', '1.0.0', 'ios')`, [A]);
  check('tester sends feedback', (await as(A, 'select * from beta_feedback')).length === 1);
  check('other users cannot read it', (await as(B, 'select * from beta_feedback')).length === 0);
  await expectErr('cannot send as someone else', () => as(B, `insert into beta_feedback (user_id, message) values ($1, 'test msg')`, [A]), /row-level security/);
  await expectErr('cannot mark own feedback fixed', () => as(A, `insert into beta_feedback (user_id, message, status) values ($1, 'hello', 'fixed')`, [A]), /row-level security/);

  // coach usage log (rate limit)
  await as(A, `insert into coach_log (user_id) values ($1)`, [A]);
  check('coach log own only', (await as(A, 'select * from coach_log')).length === 1 && (await as(B, 'select * from coach_log')).length === 0);
  await expectErr('cannot log as another user', () => as(B, `insert into coach_log (user_id) values ($1)`, [A]), /row-level security/);

  // detailed workout log
  const ses = (await as(A, `insert into workout_sessions (user_id, title, source) values ($1, 'ظهر وترابيس', 'free') returning id`, [A]))[0];
  await as(A, `insert into workout_sets (session_id, user_id, exercise_id, set_index, reps, weight_kg) values ($1, $2, 'row_bb', 1, 10, 60), ($1, $2, 'row_bb', 2, 9, 60)`, [ses.id, A]);
  check('owner logs sets', (await as(A, 'select * from workout_sets where session_id = $1', [ses.id])).length === 2);
  check('others cannot read sets', (await as(B, 'select * from workout_sets')).length === 0 && (await as(B, 'select * from workout_sessions')).length === 0);
  await expectErr('cannot add sets to another user session', () => as(B, `insert into workout_sets (session_id, user_id, exercise_id, set_index, reps, weight_kg) values ($1, $2, 'row_bb', 3, 10, 60)`, [ses.id, B]), /row-level security/);
  await expectErr('absurd weight rejected', () => as(A, `insert into workout_sets (session_id, user_id, exercise_id, set_index, reps, weight_kg) values ($1, $2, 'row_bb', 3, 10, 5000)`, [ses.id, A]), /check constraint/);

  // follows + ranks + publishing (programs & tips)
  await as(A, `insert into follows (follower, followee) values ($1, $2)`, [A, B]);
  await as(C, `insert into follows (follower, followee) values ($1, $2)`, [C, B]);
  let cnt = (await q('select followers_count, following_count from profiles where id = $1', [B]))[0];
  check('follower count maintained by trigger', cnt.followers_count === 2 && cnt.following_count === 0, JSON.stringify(cnt));
  check('following count', (await q('select following_count from profiles where id = $1', [A]))[0].following_count === 1);
  await expectErr('cannot follow self', () => as(A, `insert into follows (follower, followee) values ($1, $1)`, [A]), /check constraint/);
  await expectErr('cannot follow on behalf of others', () => as(A, `insert into follows (follower, followee) values ($1, $2)`, [C, A]), /row-level security/);
  await expectErr('cannot fake follower count', () => as(B, `update profiles set followers_count = 10000 where id = $1`, [B]), /permission denied/);
  await expectErr('cannot self-grant coach', () => as(B, `update profiles set is_coach = true where id = $1`, [B]), /permission denied/);
  await as(C, `delete from follows where follower = $1`, [C]);
  check('unfollow decrements', (await q('select followers_count from profiles where id = $1', [B]))[0].followers_count === 1);
  check('rank levels', JSON.stringify((await q(`select array[rank_level(0), rank_level(149), rank_level(150), rank_level(500), rank_level(1200), rank_level(2500)] r`))[0].r) === '[0,0,1,2,3,4]');

  const DAYS = JSON.stringify([{ title: 'Upper', exercises: [{ exercise_id: 'bench_bb', sets: 3, reps: '8-10', rest_sec: 120, rir: '1-2' }] }]);
  await q('update profiles set points = 100 where id = $1', [A]);
  await expectErr('beginner cannot post tips', () => as(A, `insert into tips (author, body) values ($1, 'اشرب مويه')`, [A]), /row-level security/);
  await q('update profiles set points = 600 where id = $1', [A]);
  await as(A, `insert into tips (author, body, tag) values ($1, 'نم ٨ ساعات قبل يوم الأرجل', 'recovery')`, [A]);
  check('advanced can post tips', (await as(B, 'select * from tips')).length === 1);
  await expectErr('advanced cannot publish programs yet', () => as(A, `insert into user_programs (author, title, days) values ($1, 'برنامجي', $2::jsonb)`, [A, DAYS]), /row-level security/);
  await q('update profiles set points = 1300 where id = $1', [A]);
  const up = (await as(A, `insert into user_programs (author, title, level, days) values ($1, 'علوي سفلي', 'beginner', $2::jsonb) returning id`, [A, DAYS]))[0];
  check('pro publishes a program visible to all', (await as(B, 'select * from user_programs')).length === 1);
  await expectErr('cannot publish as someone else', () => as(B, `insert into user_programs (author, title, days) values ($1, 'x x x', $2::jsonb)`, [A, DAYS]), /row-level security/);
  await expectErr('empty days rejected', () => as(A, `insert into user_programs (author, title, days) values ($1, 'فاضي', '[]'::jsonb)`, [A]), /check constraint/);
  await q('update profiles set is_coach = true where id = $1', [B]);
  await as(B, `insert into tips (author, body) values ($1, 'verified coach tip')`, [B]);
  check('verified coach can post regardless of points', (await as(A, 'select * from tips where author = $1', [B])).length === 1);
  await expectErr('others cannot delete my program', () => as(B, `delete from user_programs where id = $1 returning id`, [up.id]).then(r => { if (!r.length) throw new Error('row-level security: nothing deleted'); }), /row-level security/);

  const pA2 = (await q('select points from profiles where id=$1', [A]))[0].points;
  const a1 = (await as(B, 'select adopt_program($1) p', [up.id]))[0].p;
  const a2 = (await as(B, 'select adopt_program($1) p', [up.id]))[0].p;
  const a3 = (await as(A, 'select adopt_program($1) p', [up.id]))[0].p;
  const pA3 = (await q('select points from profiles where id=$1', [A]))[0].points;
  check('author +10 once per adopter, not for self', a1 === 10 && a2 === 0 && a3 === 0 && pA3 - pA2 === 10, `${a1},${a2},${a3} ${pA2}->${pA3}`);
  await expectErr('adopts only via RPC', () => as(C, `insert into program_adopts (program_id, user_id) values ($1, $2)`, [up.id, C]), /permission denied|row-level security/);
  check('adopt count', (await as(C, 'select count(*)::int n from program_adopts where program_id = $1', [up.id]))[0].n === 2);
  const tip = (await as(B, 'select id from tips where author = $1', [A]))[0];
  await as(B, `insert into tip_likes (tip_id, user_id) values ($1, $2)`, [tip.id, B]);
  await expectErr('cannot like as someone else', () => as(B, `insert into tip_likes (tip_id, user_id) values ($1, $2)`, [tip.id, A]), /row-level security/);
  check('can_publish reflects rank', (await as(A, `select can_publish('program') p`))[0].p === true && (await as(C, `select can_publish('tip') p`))[0].p === false);

  // nearby
  const nb = await as(A, 'select * from nearby_gyms(24.69, 46.685, 5)');
  check('nearby gyms', nb.length >= 1 && nb[0].name === gym.name);

  // delete account (store requirement)
  await as(C, 'select delete_my_account()');
  check('account deleted with its data', (await q('select count(*)::int n from profiles where id = $1', [C]))[0].n === 0 && (await q('select count(*)::int n from auth.users where id = $1', [C]))[0].n === 0);

  // new user trigger with duplicate username
  await q(`insert into auth.users (id, raw_user_meta_data) values (gen_random_uuid(), '{"username":"ahmed"}')`);
  check('duplicate username handled', (await q(`select count(*)::int n from profiles where username like 'ahmed%'`))[0].n === 2);

  console.log(process.exitCode ? '\nSOME TESTS FAILED' : '\nALL SQL TESTS PASSED');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
