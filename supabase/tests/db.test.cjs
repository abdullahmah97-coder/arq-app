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
                 grant update (username, full_name, avatar_url, bio, gym_id, locale, onboarded, presence_visibility, notify_prefs) on public.profiles to authenticated;
                 revoke insert, update on public.program_adopts from authenticated;
                 revoke insert, update, delete on public.app_admins from authenticated;`);
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
  // ينتهي قبل يومين: تسجيل B (قبل ساعة) يبقى خارج الفترة حتى لو شغّلنا الاختبار بعد منتصف الليل بتوقيت الرياض
  await q(`update challenges set starts_on = app_today() - 8, ends_on = app_today() - 2 where id = $1`, [ch.id]);
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

  // gym presence (Swarm-like) with privacy
  await q(`update check_ins set checked_out_at = coalesce(checked_out_at, now()) - interval '2 days', checked_in_at = checked_in_at - interval '2 days'`);
  const ciB2 = (await q(`insert into check_ins (user_id, gym_id, checked_in_at) values ($1, $2, now() - interval '20 minutes') returning id`, [B, gym.id]))[0];
  const ciC2 = (await q(`insert into check_ins (user_id, gym_id, checked_in_at) values ($1, $2, now() - interval '5 minutes') returning id`, [C, gym.id]))[0];
  const seen = async (uid) => (await as(uid, 'select username from gym_presence($1)', [gym.id])).map(r => r.username).sort().join(',');
  const cSees = await seen(C);
  check('stranger present at gym sees B and self', cSees === 'sara,user_33333333', cSees);
  const aSees = await seen(A);
  check('friend not at gym sees only friend', aSees === 'sara', aSees);
  check('anonymous present count', (await as(A, 'select gym_present_count($1) n', [gym.id]))[0].n === 2);
  await as(C, `insert into checkin_likes (check_in_id, user_id) values ($1, $2)`, [ciB2.id, C]);
  const cm = (await as(C, `insert into checkin_comments (check_in_id, user_id, body) values ($1, $2, 'كفو 🔥') returning id`, [ciB2.id, C]))[0];
  const row = (await as(B, 'select * from gym_presence($1) where is_me', [gym.id]))[0];
  check('like + comment counted on my check-in', Number(row.likes) === 1 && Number(row.comments) === 1, JSON.stringify([row.likes, row.comments]));
  await as(B, 'delete from checkin_comments where id = $1', [cm.id]);
  check('owner can delete comments on own check-in', (await q('select count(*)::int n from checkin_comments'))[0].n === 0);
  await as(B, `update profiles set presence_visibility = 'friends' where id = $1`, [B]);
  check('friends-only hides from gym strangers', !(await seen(C)).includes('sara') && (await seen(A)) === 'sara');
  await expectErr('stranger cannot react when hidden from them', () => as(C, `insert into checkin_comments (check_in_id, user_id, body) values ($1, $2, 'hi')`, [ciB2.id, C]), /row-level security/);
  await as(B, `update profiles set presence_visibility = 'hidden' where id = $1`, [B]);
  check('hidden mode hides even from friends', (await seen(A)) === '' && (await as(A, 'select gym_present_count($1) n', [gym.id]))[0].n === 2);
  await expectErr('invalid visibility rejected', () => as(B, `update profiles set presence_visibility = 'world' where id = $1`, [B]), /check constraint/);
  await as(B, `update profiles set presence_visibility = 'gym' where id = $1`, [B]);

  // best lift among friends (A and B are friends, C is not)
  const sB = (await as(B, `insert into workout_sessions (user_id, title) values ($1, 'ظهر') returning id`, [B]))[0];
  await as(B, `insert into workout_sets (session_id, user_id, exercise_id, set_index, reps, weight_kg) values ($1, $2, 'row_bb', 1, 8, 80), ($1, $2, 'row_bb', 2, 12, 60)`, [sB.id, B]);
  const sC = (await as(C, `insert into workout_sessions (user_id, title) values ($1, 'ظهر') returning id`, [C]))[0];
  await as(C, `insert into workout_sets (session_id, user_id, exercise_id, set_index, reps, weight_kg) values ($1, $2, 'row_bb', 1, 10, 140)`, [sC.id, C]);
  const fb = await as(A, `select * from friends_best(array['row_bb','curl_db'])`);
  const rb = fb.filter(r => r.exercise_id === 'row_bb');
  check('friends best: friend first, me included, stranger excluded', rb.length === 2 && rb[0].username === 'sara' && Number(rb[0].weight_kg) === 80 && rb[0].reps === 8 && rb[1].is_me && !rb.some(r => r.username.startsWith('user_3')), JSON.stringify(rb.map(r => [r.username, +r.weight_kg, r.reps, r.place])));
  check('friends best: stranger sees only own', (await as(C, `select * from friends_best(array['row_bb'])`)).every(r => r.is_me));

  // add-your-store brands
  const br = (await as(A, `insert into brands (owner, name, status, website) values ($1, 'Desert Wear', 'approved', 'https://desert.example') returning id, status`, [A]))[0];
  check('new brand forced to pending', br.status === 'pending');
  await as(A, `insert into brand_products (brand_id, name, price_sar, url) values ($1, 'تيشيرت تدريب', 129, 'https://desert.example/tee'), ($1, 'مسودة', 10, null)`, [br.id]);
  check('pending brand invisible to others', (await as(B, 'select * from brands')).length === 0 && (await as(B, 'select * from brand_products')).length === 0);
  check('owner sees own pending brand + products', (await as(A, 'select * from brand_products')).length === 2);
  await expectErr('owner cannot self-approve', () => as(A, `update brands set status = 'approved' where id = $1`, [br.id]), /status_locked/);
  await expectErr('one brand per account', () => as(A, `insert into brands (owner, name) values ($1, 'Second')`, [A]), /duplicate key/);
  await expectErr('website must be https', () => as(B, `insert into brands (owner, name, website) values ($1, 'Bad', 'javascript:alert(1)')`, [B]), /check constraint/);
  await q(`update brands set status = 'approved' where id = $1`, [br.id]);  // admin
  await as(A, `update brand_products set active = false where name = 'مسودة'`);
  check('approved brand visible with active products only', (await as(B, 'select * from brands')).length === 1 && (await as(B, 'select name from brand_products')).map(r => r.name).join() === 'تيشيرت تدريب');
  await expectErr('others cannot add products to my brand', () => as(B, `insert into brand_products (brand_id, name) values ($1, 'fake')`, [br.id]), /row-level security/);
  check('owner can edit brand details', (await as(A, `update brands set tagline = 'ملابس رياضية من الرياض' where id = $1 returning id`, [br.id])).length === 1);

  // direct messages: mutual follow only
  await expectErr('no chat without mutual follow', () => as(A, `insert into messages (sender, recipient, body) values ($1, $2, 'هلا')`, [A, B]), /row-level security/);
  await as(B, `insert into follows (follower, followee) values ($1, $2)`, [B, A]);
  const msg = (await as(A, `insert into messages (sender, recipient, body) values ($1, $2, 'هلا سارة، نتمرن بكرة؟') returning id`, [A, B]))[0];
  const ib = await as(B, 'select * from inbox()');
  check('inbox shows conversation with unread', ib.length === 1 && ib[0].username === 'ahmed' && Number(ib[0].unread) === 1 && ib[0].can_message === true, JSON.stringify(ib.map(r => [r.username, Number(r.unread)])));
  check('outsider cannot read messages', (await as(C, 'select * from messages')).length === 0);
  await expectErr('cannot send as someone else', () => as(C, `insert into messages (sender, recipient, body) values ($1, $2, 'x')`, [A, B]), /row-level security/);
  check('recipient marks read', (await as(B, 'update messages set read_at = now() where id = $1 returning id', [msg.id])).length === 1);
  await expectErr('recipient cannot edit text', () => as(B, `update messages set body = 'تعديل' where id = $1`, [msg.id]), /read_only_message/);
  check('sender cannot mark read', (await as(A, 'update messages set read_at = now() where id = $1 returning id', [msg.id])).length === 0);
  check('mutual followers list', (await as(A, 'select username from mutual_followers()')).map(r => r.username).join() === 'sara');
  await as(A, `delete from follows where follower = $1 and followee = $2`, [A, B]);
  await expectErr('unfollow stops new messages', () => as(B, `insert into messages (sender, recipient, body) values ($1, $2, 'رد')`, [B, A]), /row-level security/);
  const ib2 = await as(A, 'select * from inbox()');
  check('old chat kept but locked', ib2.length === 1 && ib2[0].can_message === false);
  await as(A, `insert into follows (follower, followee) values ($1, $2)`, [A, B]);

  // owner panel: reports + brand review + coach verification (B is the owner)
  await expectErr('nobody can make themselves owner', () => as(C, `insert into app_admins (user_id) values ($1)`, [C]), /permission denied|row-level security/);
  await q(`insert into app_admins (user_id) values ($1)`, [B]);
  check('is_admin only for owner', (await as(B, 'select is_admin() a'))[0].a === true && (await as(A, 'select is_admin() a'))[0].a === false);
  const rep2 = (await as(C, `insert into beta_feedback (user_id, category, message, screenshot_path) values ($1, 'bug', 'زر الحفظ ما يشتغل في تعديل الملف', $2) returning id`, [C, `${C}/shot.jpg`]))[0];
  await expectErr('cannot attach someone else screenshot path', () => as(C, `insert into beta_feedback (user_id, message, screenshot_path) values ($1, 'hello there', $2)`, [C, `${A}/x.jpg`]), /row-level security/);
  await expectErr('reporter cannot pre-fill owner note', () => as(C, `insert into beta_feedback (user_id, message, admin_note) values ($1, 'hello there', 'x')`, [C]), /row-level security/);
  check('owner sees all reports', (await as(B, 'select * from beta_feedback')).length >= 2);
  check('non-owner sees only own reports', (await as(A, 'select * from beta_feedback')).every(r => r.user_id === A));
  check('owner triages report', (await as(B, `update beta_feedback set status = 'fixed', admin_note = 'اتصلح في 1.0.1' where id = $1 returning status`, [rep2.id]))[0].status === 'fixed');
  await expectErr('owner cannot rewrite report text', () => as(B, `update beta_feedback set message = 'changed text' where id = $1`, [rep2.id]), /report_locked/);
  check('reporter cannot change status', (await as(C, `update beta_feedback set status = 'wontfix' where id = $1 returning id`, [rep2.id])).length === 0);
  const pbr = (await as(C, `insert into brands (owner, name, instagram) values ($1, 'Najd Fit', 'najdfit') returning id`, [C]))[0];
  check('owner sees pending brand requests', (await as(B, `select * from brands where status = 'pending'`)).length === 1);
  check('owner approves brand', (await as(B, `update brands set status = 'approved' where id = $1 returning status`, [pbr.id]))[0].status === 'approved');
  await expectErr('brand owner still cannot change status', () => as(C, `update brands set status = 'pending' where id = $1`, [pbr.id]), /status_locked/);
  await as(B, 'select set_coach($1, true)', [A]);
  check('owner verifies coach', (await q('select is_coach from profiles where id = $1', [A]))[0].is_coach === true);
  await expectErr('non-owner cannot verify coaches', () => as(A, 'select set_coach($1, true)', [C]), /forbidden/);
  const oc = (await as(B, 'select * from owner_counts()'))[0];
  check('owner counts', Number(oc.new_reports) >= 0 && Number(oc.pending_brands) === 0);
  check('owner counts hidden from others', (await as(A, 'select * from owner_counts()')).length === 0);

  // gym offers, ratings and reviews (B is owner/admin from the owner-panel block)
  const g2 = (await q(`select id from gyms where name_en like '%Narjis'`))[0];
  await expectErr('regular user cannot post gym offers', () => as(A, `insert into gym_offers (gym_id, title, price_sar, months) values ($1, 'عرض وهمي', 99, 1)`, [gym.id]), /row-level security/);
  const off = (await as(B, `insert into gym_offers (gym_id, title, price_sar, old_price_sar, months) values ($1, 'اشتراك ٣ شهور', 450, 600, 3) returning id, created_by`, [gym.id]))[0];
  check('owner posts offer (stamped)', off.created_by === B);
  await as(B, `insert into gym_managers (gym_id, user_id) values ($1, $2)`, [g2.id, C]);
  await as(C, `insert into gym_offers (gym_id, title, price_sar, months) values ($1, 'اشتراك شهري', 199, 1)`, [g2.id]);
  await expectErr('manager only for own gym', () => as(C, `insert into gym_offers (gym_id, title, price_sar, months) values ($1, 'x x x', 10, 1)`, [gym.id]), /row-level security/);
  await as(B, `insert into gym_offers (gym_id, title, price_sar, months, ends_on) values ($1, 'عرض منتهي', 50, 1, current_date - 1)`, [gym.id]);
  check('expired offers hidden from users', (await as(A, 'select title from gym_offers where gym_id = $1', [gym.id])).length === 1);
  await expectErr('old price must be higher', () => as(B, `insert into gym_offers (gym_id, title, price_sar, old_price_sar) values ($1, 'غلط غلط', 100, 90)`, [gym.id]), /check constraint/);
  await as(A, `insert into gym_reviews (gym_id, user_id, rating, body) values ($1, $2, 5, 'أجهزة ممتازة ونظيف')`, [gym.id, A]);
  await as(C, `insert into gym_reviews (gym_id, user_id, rating, body) values ($1, $2, 3, 'زحمة وقت الذروة')`, [gym.id, C]);
  await expectErr('one review per user per gym', () => as(A, `insert into gym_reviews (gym_id, user_id, rating) values ($1, $2, 4)`, [gym.id, A]), /duplicate key/);
  await expectErr('rating 1..5 only', () => as(A, `insert into gym_reviews (gym_id, user_id, rating) values ($1, $2, 6)`, [g2.id, A]), /check constraint/);
  await expectErr('cannot review as someone else', () => as(A, `insert into gym_reviews (gym_id, user_id, rating) values ($1, $2, 1)`, [g2.id, C]), /row-level security/);
  const dir = await as(A, 'select * from gyms_directory(24.69, 46.685)');
  const dg = dir.find(d => d.id === gym.id);
  check('directory: avg rating, count, best monthly price, distance', Number(dg.rating) === 4 && Number(dg.reviews) === 2 && Number(dg.best_monthly) === 150 && dg.distance_m < 1000 && dir[0].id === gym.id, JSON.stringify([dg.rating, dg.reviews, dg.best_monthly, Math.round(dg.distance_m)]));
  const rl = await as(C, 'select * from gym_reviews_list($1)', [gym.id]);
  check('reviews: mine first, visited badge from check-ins', rl[0].is_me && rl.find(r => r.username === 'ahmed').visited === true, JSON.stringify(rl.map(r => [r.username, r.visited])));
  check('owner can remove abusive review', (await as(B, `delete from gym_reviews where gym_id = $1 and user_id = $2 returning rating`, [gym.id, C])).length === 1);
  check('user cannot delete others review', (await as(C, `delete from gym_reviews where user_id = $1 returning rating`, [A])).length === 0);

  // gym chains + chain-level offers (seeded from research) + managers
  const chains = await as(A, 'select * from chains_directory()');
  check('seeded chains visible', chains.length >= 15 && chains.some(c => c.slug === 'puregym' && Number(c.offers) >= 10), `${chains.length} chains`);
  const pgc = chains.find(c => c.slug === 'puregym');
  check('chain best monthly price', Number(pgc.best_monthly) === 96, String(pgc.best_monthly));
  const bm = chains.find(c => c.slug === 'body-masters');
  check('dated offers counted until they end', Number(bm.offers) === (new Date().toISOString().slice(0, 10) <= '2026-09-30' ? 6 : 0));
  await q(`update gyms set chain_id = $1 where id = $2`, [pgc.id, gym.id]);
  const gd = (await as(A, 'select * from gyms_directory() where id = $1', [gym.id]))[0];
  check('branch directory includes chain offers + name', Number(gd.best_monthly) === 96 && gd.chain === 'PureGym KSA' && gd.chain_id === pgc.id, JSON.stringify([gd.best_monthly, gd.chain]));
  const cd = (await as(A, 'select * from chains_directory(24.69, 46.685)')).find(c => c.slug === 'puregym');
  check('chain: branches, aggregated rating, nearest branch', Number(cd.branches) === 1 && Number(cd.reviews) >= 1 && cd.nearest_m < 1000, JSON.stringify([cd.branches, cd.rating, cd.reviews, Math.round(cd.nearest_m)]));
  await expectErr('users cannot add chain offers', () => as(A, `insert into gym_offers (chain_id, title, price_sar) values ($1, 'عرض مزيف', 1)`, [pgc.id]), /row-level security/);
  await expectErr('users cannot edit chains', () => as(A, `update gym_chains set name = 'x' where id = $1 returning id`, [pgc.id]).then(r => { if (!r.length) throw new Error('row-level security: no rows'); }), /row-level security/);
  await as(B, `insert into chain_managers (chain_id, user_id) values ($1, $2)`, [bm.id, A]);
  const cof = (await as(A, `insert into gym_offers (chain_id, title, price_sar, months, source_url) values ($1, 'عرض من السلسلة', 999, 6, 'https://example.com/o') returning confidence, seen_on`, [bm.id]))[0];
  check('chain manager posts offer (partner, dated today)', cof.confidence === 'partner' && cof.seen_on != null);
  check('chain manager can upload logo path', (await as(A, `update gym_chains set logo_path = $2 where id = $1 returning id`, [bm.id, `${A}/logo.png`])).length === 1);
  await expectErr('offer needs a gym or chain', () => as(B, `insert into gym_offers (title, price_sar) values ('بدون هدف', 10)`), /gym_offers_target|row-level security/);
  await expectErr('source must be https', () => as(B, `insert into gym_offers (chain_id, title, price_sar, source_url) values ($1, 'رابط غلط', 10, 'http://x.com')`, [bm.id]), /check constraint/);

  // nearby
  const nb = await as(A, 'select * from nearby_gyms(24.69, 46.685, 5)');
  check('nearby gyms', nb.length >= 1 && nb[0].name === gym.name);

  // provider gyms (map lookup via edge function, service role only)
  const places = JSON.stringify([
    { id: 'node/1', name: 'وقت اللياقة - النخيل', name_en: 'Fitness Time Al Nakheel', lat: 24.75, lng: 46.64, address: 'حي النخيل' },
    { id: 'way/2', name: "Gold's Gym", lat: 24.751, lng: 46.641 },
    { id: 'node/3', name: 'وقت اللياقة بلس', lat: 24.752, lng: 46.642 },
    { id: 'node/4', name: 'نادي الحي', lat: 24.753, lng: 46.643 },
    { id: 'node/5', name: '', lat: 1, lng: 1 },
    { id: 'node/6', name: 'bad coords', lat: 200, lng: 1 },
  ]);
  await expectErr('users cannot add map gyms', () => as(A, 'select upsert_provider_gyms($1, $2::jsonb)', ['osm', places]), /permission denied/);
  await db.exec('set role service_role;');
  const nIns = (await q('select upsert_provider_gyms($1, $2::jsonb) n', ['osm', places]))[0].n;
  const nAgain = (await q('select upsert_provider_gyms($1, $2::jsonb) n', ['osm', places]))[0].n;
  await db.exec('reset role;');
  check('map gyms: valid places added, bad ones skipped', nIns === 4 && nAgain === 4, `${nIns}/${nAgain}`);
  const pg = await q(`select external_id, verified, radius_m, (select slug from gym_chains c where c.id = g.chain_id) slug from gyms g where source = 'osm' order by external_id`);
  check('map gyms: idempotent + verified', pg.length === 4 && pg.every(r => r.verified && r.radius_m === 200), JSON.stringify(pg));
  const slugOf = (id) => pg.find(r => r.external_id === id)?.slug ?? null;
  check('map gyms linked to their chain', slugOf('node/1') === 'fitness-time' && slugOf('way/2') === 'golds-gym' && slugOf('node/3') === 'fitness-time-plus' && slugOf('node/4') === null,
    JSON.stringify(pg.map(r => [r.external_id, r.slug])));
  const nbm = await as(A, 'select * from nearby_gyms(24.7505, 46.6405, 1)');
  check('nearby includes map gyms with address', nbm.length === 4 && nbm.some(g => g.address === 'حي النخيل'));
  const mg = nbm.find(g => g.address === 'حي النخيل');
  const ciMap = (await as(A, 'select * from check_in($1, $2, $3, 10)', [mg.id, mg.lat + 0.001, mg.lng]))[0];
  check('check-in at a map gym (within 200m) works', !!ciMap.id, `dist=${ciMap.distance_m}`);
  await as(A, 'select * from check_out($1)', [ciMap.id]);

  // a second map provider (Foursquare) must not duplicate gyms we already have
  const fsq = JSON.stringify([
    { id: 'fsq-a', name: "Gold's Gym", lat: 24.7512, lng: 46.6411 },                      // same gym as way/2 (~15 m away)
    { id: 'fsq-b', name: 'Fitness Time Al Nakheel', lat: 24.7501, lng: 46.6401 },          // matches node/1 by English name
    { id: 'fsq-c', name: 'CrossFit Nakheel', lat: 24.7540, lng: 46.6440, address: 'طريق الملك فهد' }, // new
    { id: 'fsq-d', name: "Gold's Gym", lat: 24.7600, lng: 46.6500 },                      // same name but ~1 km away → another branch
  ]);
  await db.exec('set role service_role;');
  const ids1 = (await q('select upsert_provider_gyms_ids($1, $2::jsonb) m', ['foursquare', fsq]))[0].m;
  const ids2 = (await q('select upsert_provider_gyms_ids($1, $2::jsonb) m', ['foursquare', fsq]))[0].m;
  await db.exec('reset role;');
  const idOf = async (src, ext) => (await q('select id from gyms where source = $1 and external_id = $2', [src, ext]))[0]?.id;
  check('foursquare: same gym from another map is reused, not duplicated',
    ids1['fsq-a'] === await idOf('osm', 'way/2') && ids1['fsq-b'] === await idOf('osm', 'node/1'), JSON.stringify(ids1));
  check('foursquare: new gyms and far branches are added once',
    ids1['fsq-c'] === await idOf('foursquare', 'fsq-c') && ids1['fsq-d'] === await idOf('foursquare', 'fsq-d') && JSON.stringify(ids1) === JSON.stringify(ids2)
    && (await q(`select count(*)::int n from gyms where source = 'foursquare'`))[0].n === 2);
  await expectErr('foursquare: unknown sources rejected', async () => { await db.exec('set role service_role;'); try { await q('select upsert_provider_gyms_ids($1, $2::jsonb)', ['yelp', fsq]); } finally { await db.exec('reset role;'); } }, /bad_source/);

  // food log (calories)
  await as(A, `insert into food_logs (slot, name, food_id, servings, kcal, protein_g, carbs_g, fat_g) values
    ('breakfast', 'فول مدمس', 'foul', 1, 260, 13, 35, 8), ('lunch', 'كبسة دجاج', 'kabsa_chicken', 1.5, 1125, 60, 127.5, 39)`);
  await as(B, `insert into food_logs (slot, name, kcal, source) values ('snack', 'تمر', 85, 'custom')`);
  const ft = (await as(A, 'select * from food_day_totals()'))[0];
  check('food: day totals are my own only', Number(ft.kcal) === 1385 && Number(ft.items) === 2 && Number(ft.protein_g) === 73, JSON.stringify(ft));
  check('food: others cannot read my log', (await as(B, 'select * from food_logs')).length === 1);
  await expectErr('food: cannot log for someone else', () => as(B, `insert into food_logs (user_id, slot, name, kcal) values ($1, 'lunch', 'x', 10)`, [A]), /row-level security/);
  await expectErr('food: calories must be sane', () => as(A, `insert into food_logs (slot, name, kcal) values ('lunch', 'x', 99999)`), /check constraint/);
  check('food: delete own entry', (await as(A, `delete from food_logs where food_id = 'foul' returning id`)).length === 1);

  // app events (beta diagnostics): write own, only the owner reads
  await as(A, `insert into app_events (kind, detail) values ('3d_timeout', '{"motion":"bench_bb"}')`);
  await expectErr('events: cannot write as someone else', () => as(A, `insert into app_events (user_id, kind) values ($1, 'x')`, [B]), /row-level security/);
  check('events: normal users cannot read', (await as(A, 'select * from app_events')).length === 0);
  const isAdminB = (await q('select count(*)::int n from app_admins where user_id = $1', [B]))[0].n === 1;
  check('events: owner reads them', !isAdminB || (await as(B, 'select * from app_events')).length === 1);
  { let hidden = false; try { hidden = (await as(A, 'select * from gym_area_scans')).length === 0; } catch (e) { hidden = /permission denied/.test(e.message); }
    check('scan log is private', hidden); }
  { let hidden = false; try { hidden = (await as(A, 'select * from gym_search_log')).length === 0; } catch (e) { hidden = /permission denied/.test(e.message); }
    check('gym search log is private', hidden); }
  await expectErr('gym search log: users cannot write it', () => as(A, `insert into gym_search_log (user_id, q) values ($1, 'x')`, [A]), /permission denied|row-level security/);

  // notifications: written by the server from what happened above, private, deduplicated
  const nA = await as(A, 'select * from my_notifications()');
  const nB = await as(B, 'select * from my_notifications()');
  const kinds = (rows) => rows.map(r => r.kind);
  check('notif: A told about the comment with a preview', nA.some(r => r.kind === 'post_comment' && r.data.preview === 'كفو!' && r.username));
  check('notif: A told about the like', nA.filter(r => r.kind === 'post_like').length === 1);
  check('notif: A told friend request accepted', kinds(nA).includes('friend_accept'));
  check('notif: B got the friend request', kinds(nB).includes('friend_request'));
  check('notif: B invited to the challenge with its title', nB.some(r => r.kind === 'challenge_invite' && r.data.title === 'تحدي الأسبوع'));
  check('notif: A told they won the challenge', nA.some(r => r.kind === 'challenge_win' && Number(r.data.points) === 50));
  check('notif: B told about check-in like and comment', kinds(nB).includes('checkin_like') && kinds(nB).includes('checkin_comment'));
  check('notif: follow/unfollow/follow notifies once', nB.filter(r => r.kind === 'follow' && r.actor_id === A).length === 1, JSON.stringify(kinds(nB)));
  check('notif: follow-back is marked mutual', nA.some(r => r.kind === 'follow' && r.actor_id === B && r.data.mutual === true));
  check('notif: gym members told about a new offer (not expired ones)',
    nA.filter(r => r.kind === 'gym_offer').length === 1 && nA.some(r => r.kind === 'gym_offer' && r.data.price === '450' && r.data.gym === gym.name),
    JSON.stringify(nA.filter(r => r.kind === 'gym_offer').map(r => r.data)));
  const selfLikeBefore = (await q(`select count(*)::int n from notifications where user_id = $1 and actor_id = $1`, [A]))[0].n;
  await as(A, `insert into post_likes (post_id, user_id) values ($1, $2)`, [post.id, A]);
  check('notif: liking your own post does not notify you', (await q(`select count(*)::int n from notifications where user_id = $1 and actor_id = $1`, [A]))[0].n === selfLikeBefore && selfLikeBefore === 0);
  check('notif: others cannot read mine', (await as(B, 'select * from notifications where user_id = $1', [A])).length === 0);
  await expectErr('notif: users cannot write notifications', () => as(A, `insert into notifications (user_id, kind) values ($1, 'follow')`, [B]), /row-level security|permission denied/);
  check('notif: users cannot edit notifications directly', (await as(B, `update notifications set read_at = now() where user_id = $1 returning id`, [A])).length === 0);
  await expectErr('notif: users cannot fire notifications themselves', () => as(A, `select _notify($1, $2, 'follow', $2, '{}', '/')`, [B, A]), /permission denied/);
  const unread = async (u) => (await as(u, 'select count(*)::int n from notifications where read_at is null'))[0].n;
  const unreadB = await unread(B);
  await as(A, 'select mark_notifications_read()');
  check('notif: mark all read (only mine)', (await unread(A)) === 0 && (await unread(B)) === unreadB && unreadB > 0);
  const lvlBefore = (await q('select rank_level(points) l from profiles where id = $1', [B]))[0].l;
  await q(`update profiles set points = 2600 where id = $1`, [B]);
  check('notif: rank up', (await as(B, `select * from my_notifications() where kind = 'rank_up'`)).some(r => r.data.level === 4) && lvlBefore < 4);
  await q(`update profiles set points = 10 where id = $1`, [B]);
  await q(`update profiles set points = 2600 where id = $1`, [B]);
  check('notif: same rank not announced twice', (await as(B, `select * from my_notifications() where kind = 'rank_up'`)).length === 1);
  const txt = (await q(`select _notif_text('gym_offer', null, '{"gym":"وقت اللياقة","title":"شهر","price":"199"}', 'ar') t`))[0].t;
  check('notif: push text in Arabic', txt[0] === 'عرض جديد في وقت اللياقة' && txt[1] === 'شهر — 199 ر.س', JSON.stringify(txt));
  const txtEn = (await q(`select _notif_text('rank_up', null, '{"level":3}', 'en') t`))[0].t;
  check('notif: push text in English', txtEn[1] === 'You reached “Pro”', JSON.stringify(txtEn));
  // phone push tokens
  const TOK = 'ExponentPushToken[abcDEF123456789xyz]';
  await as(A, 'select register_push_token($1, $2)', [TOK, 'ios']);
  check('push: device registered to me', (await as(A, 'select * from push_tokens')).length === 1);
  await expectErr('push: junk tokens rejected', () => as(A, 'select register_push_token($1, $2)', ['http://evil', 'ios']), /check constraint/);
  await as(B, 'select register_push_token($1, $2)', [TOK, 'ios']);
  check('push: same phone signing into another account moves the token', (await as(A, 'select * from push_tokens')).length === 0 && (await as(B, 'select * from push_tokens')).length === 1);
  check('push: tokens are private', (await as(A, 'select * from push_tokens where user_id = $1', [B])).length === 0);
  await as(B, `insert into messages (sender, recipient, body) values ($1, $2, 'تجربة إشعار')`, [B, A]).catch(() => {});
  await as(A, `insert into follows (follower, followee) values ($1, $2) on conflict do nothing`, [A, B]);
  await as(A, `insert into messages (sender, recipient, body) values ($1, $2, 'وصل؟')`, [A, B]);
  check('push: message with a registered device still sends fine without pg_net', true);
  await as(B, `update profiles set notify_prefs = '{"messages":false,"social":true,"activity":true,"progress":true,"offers":false}' where id = $1`, [B]);
  check('push: user can change notification settings', (await as(B, 'select notify_prefs from profiles where id = $1', [B]))[0].notify_prefs.messages === false);
  await as(B, 'select unregister_push_token($1)', [TOK]);
  check('push: sign-out removes the device', (await as(B, 'select * from push_tokens')).length === 0);

  // delete account (store requirement)
  await as(C, 'select delete_my_account()');
  check('account deleted with its data', (await q('select count(*)::int n from profiles where id = $1', [C]))[0].n === 0 && (await q('select count(*)::int n from auth.users where id = $1', [C]))[0].n === 0);

  // new user trigger with duplicate username
  await q(`insert into auth.users (id, raw_user_meta_data) values (gen_random_uuid(), '{"username":"ahmed"}')`);
  check('duplicate username handled', (await q(`select count(*)::int n from profiles where username like 'ahmed%'`))[0].n === 2);

  console.log(process.exitCode ? '\nSOME TESTS FAILED' : '\nALL SQL TESTS PASSED');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
