// الدوري السعودي: الإعداد، الصلاحيات، الإدخال من الخادم، «ذكّرني» و«فريقي»، إشعار النهاية، وجدولة التحديث
// التشغيل: node supabase/tests/league.test.cjs
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const OWNER = U.E;
  await q(`update profiles set is_owner = true where id = $1`, [OWNER]);
  const setting = async () => (await q(`select value from app_settings where key = 'league'`))[0].value;
  const save = (uid, v) => as(uid, `update app_settings set value = $1 where key = 'league'`, [JSON.stringify(v)]);
  const base = { enabled: true, league_id: 307, remind_minutes: 60, live_every_min: 5, full_every_hours: 3, tickets_url: 'https://webook.com/ar/spl' };
  const ingest = (mode, season, teams, matches, standings = [], err = null, left = null) =>
    q(`select league_ingest($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7) as r`,
      [mode, season, JSON.stringify(teams), JSON.stringify(matches), JSON.stringify(standings), err, left]).then((r) => r[0].r);
  const notices = async (uid, like) => (await q(`select data from notifications where user_id = $1 and data->>'key' like $2`, [uid, like])).map((r) => r.data);
  const iso = (mins) => new Date(Date.now() + mins * 60e3).toISOString();
  const sync = async () => (await q(`select * from league_sync`))[0];

  // ---------- الإعداد ----------
  const s0 = await setting();
  check('setting starts off with API-Football league 307 and webook', s0.enabled === false && s0.league_id === 307 && s0.tickets_url.startsWith('https://webook.com'), JSON.stringify(s0));
  check('while off, the cron job does nothing', (await q(`select run_league() as r`))[0].r === 'off');
  await expectErr('an admin who is not the owner cannot change it', async () => {
    await q(`insert into app_admins (user_id) values ($1) on conflict do nothing`, [U.D]);
    await save(U.D, base);
  }, /not_allowed/);
  // مستخدم عادي: RLS يخلي التحديث يمر على صفر صفوف، أو يرفض. المهم إن القيمة ما تتغير
  await save(U.A, base).catch(() => {});
  check('a user cannot change it', (await setting()).enabled === false);
  await expectErr('reminder minutes 5..1440', () => save(OWNER, { ...base, remind_minutes: 1 }), /bad_value/);
  await expectErr('tickets link must be https', () => save(OWNER, { ...base, tickets_url: 'http://x.com/a' }), /bad_value/);
  await expectErr('live interval 1..60', () => save(OWNER, { ...base, live_every_min: 0 }), /bad_value/);
  await save(OWNER, { ...base, extra: 1 });
  check('the owner turns it on; unknown keys dropped', (await setting()).enabled === true && !('extra' in (await setting())));
  await save(OWNER, { ...base, season: 2026 });
  check('optional season override is kept', (await setting()).season === 2026);

  // ---------- الإدخال ----------
  const teams = [
    { id: 2932, name: 'Al-Hilal Saudi FC', logo: 'https://media.api-sports.io/football/teams/2932.png' },
    { id: 2939, name: 'Al-Nassr', logo: null },
    { id: 2938, name: 'Al-Ittihad FC' },
    { id: 9999, name: 'Some New Club' },
  ];
  const m1 = { id: 1001, league: 307, season: 2026, round: 'Regular Season - 8', kickoff: iso(30), status: 'NS', home: 2932, away: 2939, venue: 'Kingdom Arena', city: 'Riyadh' };
  const m2 = { id: 1002, league: 307, season: 2026, round: 'Regular Season - 8', kickoff: iso(-60), status: '2H', elapsed: 63, home: 2938, away: 9999, hg: 1, ag: 0 };
  const m3 = { id: 1003, league: 307, season: 2026, round: 'Regular Season - 9', kickoff: iso(60 * 24 * 3), status: 'NS', home: 2939, away: 2938 };
  const bad = { id: 1004, league: 307, season: 2026, kickoff: iso(10), status: 'NS', home: 2932, away: 12345 };
  const r1 = await ingest('full', 2026, teams, [m1, m2, m3, bad], [
    { team: 2932, rank: 1, points: 22, played: 8, win: 7, draw: 1, lose: 0, gf: 20, ga: 4, form: 'WWDWW' },
    { team: 2939, rank: 2, points: 19, played: 8, win: 6, draw: 1, lose: 1, gf: 17, ga: 7, form: 'WLWWW' },
  ]);
  check('ingest: teams, matches and standings saved', r1.ok === true && r1.teams === 4 && r1.matches === 3, JSON.stringify(r1));
  const names = Object.fromEntries((await q(`select id, name_ar from league_teams`)).map((r) => [r.id, r.name_ar]));
  check('Arabic names filled from the English ones', names[2932] === 'الهلال' && names[2939] === 'النصر' && names[2938] === 'الاتحاد' && names[9999] === null, JSON.stringify(names));
  check('a match with an unknown team is skipped', (await q(`select 1 from league_matches where id = 1004`)).length === 0);
  check('standings saved', (await q(`select rank, points from league_standings where season = 2026 and team_id = 2932`))[0]?.points === 22);
  await q(`update league_teams set name_ar = 'نادي جديد' where id = 9999`);
  await ingest('full', 2026, teams, []);
  check('an Arabic name set by the owner is not overwritten', (await q(`select name_ar from league_teams where id = 9999`))[0].name_ar === 'نادي جديد');
  check('sync state after a full update', !!(await sync()).last_full_at && (await sync()).season === 2026 && (await sync()).last_error === null);
  await ingest('full', 2026, [], [], [], 'Free plans do not have access to this season, try from 2021 to 2023.', 0);
  check('an API error is recorded for the admin', (await sync()).last_error.startsWith('Free plans') && (await sync()).requests_left === 0);

  // ---------- الصلاحيات ----------
  check('signed-in users read matches, teams, standings', (await as(U.A, `select id from league_matches`)).length === 3
    && (await as(U.A, `select id from league_teams`)).length === 4 && (await as(U.A, `select 1 from league_standings`)).length === 2);
  check('users cannot read the sync state', (await as(U.A, `select * from league_sync`)).length === 0);
  await as(U.A, `update league_matches set home_goals = 9 where id = 1001`).catch(() => {});
  check('users cannot write matches', (await q(`select home_goals from league_matches where id = 1001`))[0].home_goals !== 9);
  await expectErr('users cannot call ingest', () => as(U.A, `select league_ingest('full', 2026)`), /permission denied/);
  await expectErr('users cannot run the cron job', () => as(U.A, `select run_league()`), /permission denied/);
  await expectErr('users cannot read the status', () => as(U.A, `select admin_league_status()`), /not_allowed/);
  const st = (await as(OWNER, `select admin_league_status() as s`))[0].s;
  check('admin status: counts and no secrets', st.teams === 4 && st.matches === 3 && st.server_ready === false && !JSON.stringify(st).includes('key'), JSON.stringify(st));

  // ---------- ذكّرني وفريقي ----------
  await as(U.A, `insert into league_reminders (match_id) values (1001)`);
  check('a user sets a reminder on an upcoming match', (await as(U.A, `select match_id from league_reminders`)).length === 1);
  check('others cannot see it', (await as(U.B, `select * from league_reminders`)).length === 0);
  await expectErr('no reminder on a match that started', () => as(U.A, `insert into league_reminders (match_id) values (1002)`), /row-level security/);
  await expectErr('no reminder for someone else', () => as(U.A, `insert into league_reminders (user_id, match_id) values ($1, 1003)`, [U.B]), /row-level security/);
  await expectErr('cannot pre-mark as sent', () => as(U.A, `insert into league_reminders (match_id, sent_at) values (1003, now())`), /row-level security/);
  await as(U.A, `insert into league_reminders (match_id) values (1003)`);
  await as(U.A, `delete from league_reminders where match_id = 1003`);
  check('a user removes their reminder', (await as(U.A, `select 1 from league_reminders where match_id = 1003`)).length === 0);

  await as(U.B, `insert into league_fans (team_id) values (2939)`);
  check('a user picks a team', (await as(U.B, `select team_id from league_fans`))[0]?.team_id === 2939);
  await as(U.B, `update league_fans set team_id = 2932 where user_id = $1`, [U.B]);
  check('…and can change it', (await as(U.B, `select team_id from league_fans`))[0]?.team_id === 2932);
  check('nobody else sees it', (await as(U.A, `select * from league_fans`)).length === 0);
  await expectErr('cannot pick for someone else', () => as(U.A, `insert into league_fans (user_id, team_id) values ($1, 2939)`, [U.C]), /row-level security/);
  await q(`insert into league_fans (user_id, team_id) values ($1, 2939)`, [U.C]);  // C يشجع النصر

  // ---------- التذكير (m1 بعد ٣٠ دقيقة، والتذكير قبل ٦٠) ----------
  const sent = (await q(`select _league_remind() as n`))[0].n;
  check('reminders go to the one who asked and to both teams\' fans', sent === 3, String(sent));
  const na = await notices(U.A, 'league-remind:1001');
  check('reminder text: teams and Riyadh time', na.length === 1 && na[0].title_ar.includes('الهلال') && na[0].title_ar.includes('النصر') && /الساعة \d{1,2}:\d{2} [صم]/.test(na[0].body_ar) && na[0].url === '/league/1001', JSON.stringify(na[0]));
  check('fans get it too', (await notices(U.B, 'league-remind:1001')).length === 1 && (await notices(U.C, 'league-remind:1001')).length === 1);
  check('a second run sends nothing again', (await q(`select _league_remind() as n`))[0].n === 0);
  check('the far match is not reminded yet', (await notices(U.C, 'league-remind:1003')).length === 0);
  await q(`update league_matches set status = 'TBD' where id = 1003`);
  await q(`update league_matches set kickoff = now() + interval '20 minutes' where id = 1003`);
  check('a TBD time is never reminded', (await q(`select _league_remind() as n`))[0].n === 0);

  // ---------- النهاية ----------
  await ingest('live', 2026, [], [{ ...m2, status: 'FT', elapsed: 90, hg: 2, ag: 1 }]);
  check('full time: no notice for nobody (nobody follows these teams)', (await notices(U.A, 'league-ft:1002')).length === 0);
  await ingest('live', 2026, [], [{ ...m1, kickoff: iso(-100), status: '2H', elapsed: 80, hg: 2, ag: 2 }]);
  await q(`update league_sync set last_full_at = now()`);
  const before = (await sync()).last_full_at;
  const rFt = await ingest('live', 2026, [], [{ ...m1, kickoff: iso(-110), status: 'FT', elapsed: 90, hg: 3, ag: 2 }]);
  check('full time is detected', rFt.finished === 1);
  const ft = await notices(U.B, 'league-ft:1001');
  check('fans get the final score', ft.length === 1 && ft[0].body_ar === 'الهلال 3 - 2 النصر' && ft[0].url === '/league/1001', JSON.stringify(ft[0]));
  check('the one who asked for a reminder gets it too', (await notices(U.A, 'league-ft:1001')).length === 1 && (await notices(U.C, 'league-ft:1001')).length === 1);
  check('a finished match forces a standings update', before && (await sync()).last_full_at === null);
  await ingest('live', 2026, [], [{ ...m1, kickoff: iso(-110), status: 'FT', elapsed: 90, hg: 3, ag: 2 }]);
  check('no second full-time notice', (await notices(U.B, 'league-ft:1001')).length === 1);

  // ---------- الجدولة ----------
  await q(`update league_matches set status = 'FT' where id in (1001, 1002)`);
  await q(`update league_matches set status = 'NS', kickoff = now() + interval '3 days' where id = 1003`);
  await q(`update league_sync set last_full_at = now(), last_live_at = null, requested_at = null`);
  check('nothing live and a fresh full update → idle', (await q(`select run_league() as r`))[0].r === 'idle');
  await q(`update league_sync set last_full_at = now() - interval '4 hours'`);
  check('full update due → full (no vault here)', (await q(`select run_league() as r`))[0].r === 'full:no_vault');
  await q(`update league_matches set status = '1H', kickoff = now() - interval '10 minutes' where id = 1003`);
  await q(`update league_sync set last_full_at = now()`);
  check('a live match → live', (await q(`select run_league() as r`))[0].r === 'live:no_vault');
  await q(`update league_sync set last_live_at = now() - interval '2 minutes'`);
  check('live but updated 2 minutes ago (every 5) → idle', (await q(`select run_league() as r`))[0].r === 'idle');
  await q(`update league_matches set status = 'NS', kickoff = now() + interval '2 minutes' where id = 1003`);
  await q(`update league_sync set last_live_at = null`);
  check('about to kick off counts as live', (await q(`select run_league() as r`))[0].r === 'live:no_vault');
  await q(`update league_sync set requested_at = now(), last_ok_at = now() - interval '1 minute'`);
  check('a request still pending → waiting', (await q(`select run_league() as r`))[0].r === 'waiting');
  await q(`update league_sync set requested_at = null`);
  await ingest('live', 2026, [], [], [], 'You have reached the request limit for the day', 0);
  check('right after an API error → backoff (no request)', (await q(`select run_league() as r`))[0].r === 'backoff');
  await q(`update league_sync set last_error_at = now() - interval '11 minutes'`);
  check('10 minutes later it tries again', (await q(`select run_league() as r`))[0].r === 'live:no_vault');

  // حذف الحساب
  await q(`delete from auth.users where id = $1`, [U.C]);
  check('deleting an account removes its team and reminders', (await q(`select count(*)::int as n from league_fans where user_id = $1`, [U.C]))[0].n === 0
    && (await q(`select count(*)::int as n from league_reminders where user_id = $1`, [U.C]))[0].n === 0);
})().catch((e) => { console.error(e); process.exit(1); });
