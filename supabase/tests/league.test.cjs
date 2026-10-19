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
  check('setting starts off with league 307 and webook', s0.enabled === false && s0.league_id === 307 && s0.tickets_url.startsWith('https://webook.com'), JSON.stringify(s0));
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
  const na = await notices(U.A, 'league-remind:1001:%');
  check('reminder text: teams and Riyadh time', na.length === 1 && na[0].title_ar.includes('الهلال') && na[0].title_ar.includes('النصر') && /الساعة \d{1,2}:\d{2} [صم]/.test(na[0].body_ar) && na[0].url === '/league/1001', JSON.stringify(na[0]));
  check('fans get it too', (await notices(U.B, 'league-remind:1001:%')).length === 1 && (await notices(U.C, 'league-remind:1001:%')).length === 1);
  check('a second run sends nothing again', (await q(`select _league_remind() as n`))[0].n === 0);
  check('the far match is not reminded yet', (await notices(U.C, 'league-remind:1003:%')).length === 0);
  await q(`update league_matches set status = 'TBD' where id = 1003`);
  await q(`update league_matches set kickoff = now() + interval '20 minutes' where id = 1003`);
  check('a TBD time is never reminded', (await q(`select _league_remind() as n`))[0].n === 0);
  check('fans are not written as reminder rows (dropping the team stops everything)', (await q(`select count(*)::int as n from league_reminders where user_id in ($1, $2)`, [U.B, U.C]))[0].n === 0);
  check('the bell shows only what the user asked for', (await as(U.B, `select match_id from league_reminders`)).length === 0);
  // تأجيل: موعد جديد ← تذكير جديد للي طلب وللمشجعين
  await ingest('live', 2026, [], [{ ...m1, kickoff: iso(45) }]);
  check('a new kick-off time resets the reminder', (await q(`select sent_at from league_reminders where user_id = $1 and match_id = 1001`, [U.A]))[0].sent_at === null);
  check('…and everyone is reminded again for the new time', (await q(`select _league_remind() as n`))[0].n === 3);
  check('two reminders for A, one per time', (await notices(U.A, 'league-remind:1001:%')).length === 2 && (await notices(U.B, 'league-remind:1001:%')).length === 2);
  check('same time again → nothing', (await q(`select _league_remind() as n`))[0].n === 0);

  // ---------- النهاية ----------
  await ingest('live', 2026, [], [{ ...m2, status: 'FT', elapsed: 90, hg: 2, ag: 1 }]);
  await q(`select _league_ft_notices()`);
  check('full time: no notice for nobody (nobody follows these teams)', (await notices(U.A, 'league-ft:1002')).length === 0);
  await ingest('live', 2026, [], [{ ...m1, kickoff: iso(-100), status: '2H', elapsed: 80, hg: 2, ag: 2 }]);
  await q(`update league_sync set last_full_at = now()`);
  const before = (await sync()).last_full_at;
  const rFt = await ingest('live', 2026, [], [{ ...m1, kickoff: iso(-110), status: 'FT', elapsed: 90, hg: 3, ag: 2 }]);
  check('full time is detected and queued (not sent inside the API call)', rFt.finished === 1 && (await notices(U.B, 'league-ft:1001')).length === 0
    && (await q(`select ft_pending from league_matches where id = 1001`))[0].ft_pending === true);
  const nFt = (await q(`select _league_ft_notices() as n`))[0].n;
  check('the cron sends the queued full-time notices', nFt === 3 && (await q(`select ft_pending from league_matches where id = 1001`))[0].ft_pending === false, String(nFt));
  const ft = await notices(U.B, 'league-ft:1001');
  check('fans get the final score', ft.length === 1 && ft[0].body_ar === 'الهلال 3 - 2 النصر' && ft[0].url === '/league/1001', JSON.stringify(ft[0]));
  check('the one who asked for a reminder gets it too', (await notices(U.A, 'league-ft:1001')).length === 1 && (await notices(U.C, 'league-ft:1001')).length === 1);
  const ago = (await q(`select extract(epoch from now() - last_full_at) / 60 as m from league_sync`))[0].m;
  check('a finished match brings the standings update to ~70 minutes later (provider updates hourly)', before && ago > 108 && ago < 112, String(ago));
  await ingest('live', 2026, [], [{ ...m1, kickoff: iso(-110), status: 'FT', elapsed: 90, hg: 3, ag: 2 }]);
  await q(`select _league_ft_notices()`);
  check('no second full-time notice', (await notices(U.B, 'league-ft:1001')).length === 1);
  // مباراة قديمة تخلص بعد توقف أو أعطال: بدون إشعار
  await ingest('full', 2026, [], [{ ...m3, id: 1005, kickoff: iso(-60 * 24 * 10), status: 'NS' }]);
  await ingest('full', 2026, [], [{ ...m3, id: 1005, kickoff: iso(-60 * 24 * 10), status: 'FT', hg: 1, ag: 0 }]);
  await q(`select _league_ft_notices()`);
  check('a match from 10 days ago finishing late sends no notice', (await notices(U.C, 'league-ft:1005')).length === 0
    && (await q(`select ft_pending from league_matches where id = 1005`))[0].ft_pending === false);

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
  await q(`update league_sync set requested_at = now() - interval '2 minutes', last_ok_at = now() - interval '3 minutes', last_error_at = null`);
  check('a request still pending for 2 minutes → waiting (runs never overlap)', (await q(`select run_league() as r`))[0].r === 'waiting');
  await q(`update league_sync set requested_at = now() - interval '4 minutes'`);
  check('no answer for 4 minutes → asks again', (await q(`select run_league() as r`))[0].r === 'live:no_vault');
  await q(`update league_sync set requested_at = now(), last_ok_at = now() - interval '1 minute'`);
  check('a request still pending → waiting', (await q(`select run_league() as r`))[0].r === 'waiting');
  await q(`update league_sync set requested_at = null`);
  await ingest('live', 2026, [], [], [], 'You have reached the request limit for the day', 0);
  check('right after an API error → backoff (no request)', (await q(`select run_league() as r`))[0].r === 'backoff');
  await q(`update league_sync set last_error_at = now() - interval '11 minutes'`);
  check('10 minutes later it tries again', (await q(`select run_league() as r`))[0].r === 'live:no_vault');
  // حالة مباشرة قديمة (SUSP قبل ٣ أيام) ما تخلي التحديث المباشر شغّال
  await q(`update league_matches set status = 'FT' where id = 1003`);
  await q(`update league_matches set status = 'SUSP', kickoff = now() - interval '3 days' where id = 1002`);
  await q(`update league_sync set last_full_at = now(), last_live_at = null, last_error = null, requested_at = null`);
  check('a match stuck live for days does not keep live polling on', (await q(`select run_league() as r`))[0].r === 'idle');
  await q(`update league_matches set status = '2H', kickoff = now() - interval '70 minutes' where id = 1002`);
  check('a real live match does', (await q(`select run_league() as r`))[0].r === 'live:no_vault');
  // run_league يرسل إشعارات النهاية المعلّقة
  await q(`update league_matches set ft_pending = true where id = 1002`);
  await q(`insert into league_fans (user_id, team_id) values ($1, 2938) on conflict (user_id) do update set team_id = 2938`, [U.D]);
  await q(`select run_league()`);
  check('run_league sends pending full-time notices', (await notices(U.D, 'league-ft:1002')).length === 1);

  // ---------- SportScore: مرجع المباراة، وما نمسح الجولة والملعب ----------
  const ss = [{ id: 1987654321, name: 'Diraiyah' }, { id: 1987654322, name: 'NEOM Sports Club' }];
  await ingest('full', 2026, ss, [{ id: 7700000000001, league: 307, season: 2026, kickoff: iso(60 * 24), status: 'NS', home: 1987654321, away: 1987654322,
    round: 'Regular Season - 10', venue: 'Prince Faisal bin Fahd', ref: 'al-diraiyah-vs-neom-sports-club/2y8m4zh5od9xyz1' }]);
  const nm = Object.fromEntries((await q(`select id, name_ar from league_teams where id in (1987654321, 1987654322)`)).map((r) => [r.id, r.name_ar]));
  check('SportScore spellings get Arabic names (Diraiyah, NEOM)', nm[1987654321] === 'الدرعية' && nm[1987654322] === 'نيوم', JSON.stringify(nm));
  check('the provider match reference is stored', (await q(`select source_ref from league_matches where id = 7700000000001`))[0].source_ref === 'al-diraiyah-vs-neom-sports-club/2y8m4zh5od9xyz1');
  await ingest('live', 2026, ss, [{ id: 7700000000001, kickoff: iso(60 * 24), status: '1H', elapsed: 5, home: 1987654321, away: 1987654322, hg: 0, ag: 0 }]);
  const kept = (await q(`select source_ref, round, venue, status from league_matches where id = 7700000000001`))[0];
  check('an update without reference/round/venue keeps the saved ones', kept.source_ref === 'al-diraiyah-vs-neom-sports-club/2y8m4zh5od9xyz1' && kept.round === 'Regular Season - 10' && kept.venue === 'Prince Faisal bin Fahd' && kept.status === '1H', JSON.stringify(kept));
  await ingest('full', 2026, ss, [{ id: 7700000000002, kickoff: iso(60 * 48), status: 'NS', home: 1987654322, away: 1987654321, ref: "x'); drop table league_teams; --/abcdefg" }]);
  check('a junk reference is not stored', (await q(`select source_ref from league_matches where id = 7700000000002`))[0].source_ref === null);
  check('big match ids (from the provider key) fit', (await as(U.A, `select id from league_matches where id = 7700000000001`)).length === 1);

  // ---------- تفاصيل المباراة والهدافين ----------
  const details = (season, d, scorers = null) =>
    q(`select league_ingest_details($1, $2::jsonb, $3::jsonb) as r`, [season, JSON.stringify(d), scorers == null ? null : JSON.stringify(scorers)]).then((r) => r[0].r);
  const det = async () => (await q(`select ht_home, ht_away, events, stats, lineups, details_at from league_matches where id = 7700000000001`))[0];
  const ev = [{ min: 33, side: 'h', kind: 'goal', p: 'Lukáš Haraslín', hs: 1, as: 0 }, { min: 45, side: 'a', kind: 'sub', in: 'Joshua King', out: 'Thamer Al-Khaibri' }];
  const stats = [{ k: 'possession', h: 38, a: 62 }, { k: 'shots_on', h: 4, a: 4 }];
  const lineups = { ok: true, hf: '3-4-3', af: '4-4-2', hc: null, ac: null, h: [{ n: 'Adrian Šemper', no: 1, pos: 'G' }], a: [], hs: [], as: [] };
  const rd1 = await details(2026, [{ id: 7700000000001, ht: [1, 0], events: ev, stats, lineups }, { id: 123 }, { id: 'x' }, 'junk']);
  let d1 = await det();
  check('details saved: half-time score, events, stats, lineups and when', rd1.ok && rd1.details === 1 && d1.ht_home === 1 && d1.ht_away === 0 && d1.events.length === 2
    && d1.events[0].p === 'Lukáš Haraslín' && d1.stats[0].k === 'possession' && d1.lineups.hf === '3-4-3' && d1.details_at != null, JSON.stringify(rd1));
  await details(2026, [{ id: 7700000000001, events: [], stats: [] }]);
  d1 = await det();
  check('empty lists later (the provider drops stats after the match) keep what we saved', d1.events.length === 2 && d1.stats.length === 2 && d1.lineups.hf === '3-4-3' && d1.ht_home === 1);
  await details(2026, [{ id: 7700000000001, ht: ['x', 0], stats: Array.from({ length: 41 }, (_, i) => ({ k: 's' + i, h: 1, a: 1 })), lineups: 'nope' }]);
  d1 = await det();
  check('junk half-time, too many stats and a non-object lineup are ignored', d1.ht_home === 1 && d1.stats.length === 2 && d1.lineups.hf === '3-4-3');
  const rd2 = await details(2026, [], [{ rank: 1, name: 'Ivan Toney', team: 1987654321, goals: 11, assists: 1, matches: 8, minutes: 684 }]);
  check('top scorers saved for the season', rd2.scorers === true && (await as(U.A, `select scorers from league_leaders where season = 2026`))[0].scorers[0].name === 'Ivan Toney');
  await details(2026, [], [{ rank: 1, name: 'Mateo Retegui', team: null, goals: 6 }]);
  await details(2026, [], []);
  const lead = (await q(`select scorers from league_leaders where season = 2026`))[0].scorers;
  check('a new list replaces the old one; an empty list does not wipe it', lead.length === 1 && lead[0].name === 'Mateo Retegui');
  await expectErr('a user cannot write details', () => as(U.A, `select league_ingest_details(2026, '[]'::jsonb, null)`), /permission denied/);
  await expectErr('a user cannot write scorers', () => as(U.A, `insert into league_leaders (season, scorers) values (2030, '[]')`), /permission denied|row-level security/);
  check('signed-in users read details and scorers', (await as(U.A, `select events from league_matches where id = 7700000000001`))[0].events.length === 2
    && (await as(U.A, `select count(*)::int as n from league_leaders`))[0].n === 1);
  await expectErr('signed-out visitors cannot read scorers', () => as(null, `select * from league_leaders`), /permission denied/);

  // ---------- أسماء اللاعبين بالعربي ----------
  const seen = async () => (await q(`select name, name_ar, source, tries from league_players order by name`));
  const names0 = (await seen()).map((r) => r.name);
  check('names from events, lineups and scorers are recorded once, without Arabic yet',
    ['Lukáš Haraslín', 'Joshua King', 'Thamer Al-Khaibri', 'Adrian Šemper', 'Ivan Toney', 'Mateo Retegui'].every((n) => names0.includes(n))
    && names0.filter((n) => n === 'Joshua King').length === 1 && (await seen()).every((r) => r.name_ar === null), JSON.stringify(names0));
  const namesTodo = async (n = 60) => (await q(`select league_names_todo($1) as t`, [n]))[0].t;
  check('names waiting for Arabic are listed (limited)', (await namesTodo()).length === names0.length && (await namesTodo(2)).length === 2);
  const saveNames = (names, tried = []) => q(`select league_names_save($1::jsonb, $2::text[]) as n`, [JSON.stringify(names), tried]).then((r) => r[0].n);
  const nSaved = await saveNames([
    { name: 'Lukáš Haraslín', ar: 'لوكاس هاراسلين', source: 'wikidata', qid: 'Q18933936' },
    { name: 'Joshua King', ar: 'جوشوا كينغ', source: 'claude' },
    { name: 'Ivan Toney', ar: 'Ivan توني', source: 'claude' },          // لاتيني ← مرفوض
    { name: 'Adrian Šemper', ar: 'أدريان', source: 'someone' },          // مصدر غلط ← مرفوض
    { name: 'Not Seen', ar: 'مجهول', source: 'claude' },                 // اسم ما مر ← ما ينضاف
  ], ['Mateo Retegui']);
  const byName = Object.fromEntries((await seen()).map((r) => [r.name, r]));
  check('valid Arabic names saved with their source; Latin, bad sources and unknown names refused', nSaved === 2 && byName['Lukáš Haraslín'].name_ar === 'لوكاس هاراسلين'
    && byName['Lukáš Haraslín'].source === 'wikidata' && byName['Joshua King'].source === 'claude' && byName['Ivan Toney'].name_ar === null
    && byName['Adrian Šemper'].name_ar === null && !('Not Seen' in byName), JSON.stringify(byName['Ivan Toney']));
  check('a name we asked about without an answer counts a try', byName['Mateo Retegui'].tries === 1 && byName['Ivan Toney'].tries === 0);
  await q(`update league_players set tries = 3 where name = 'Mateo Retegui'`);
  check('after 3 failed tries a name waits a day', !(await namesTodo(300)).includes('Mateo Retegui') && !(await namesTodo(300)).includes('Joshua King'));
  await q(`update league_players set updated_at = now() - interval '2 days' where name = 'Mateo Retegui'`);
  check('…then it is tried again', (await namesTodo(300)).includes('Mateo Retegui'));
  await q(`update league_players set name_ar = 'جوشوا كنج', source = 'manual' where name = 'Joshua King'`);
  await saveNames([{ name: 'Joshua King', ar: 'جوشوا كينغ', source: 'claude' }]);
  check("the owner's correction is never overwritten", (await seen()).find((r) => r.name === 'Joshua King').name_ar === 'جوشوا كنج');
  const map = (await as(U.A, `select league_player_names(array['Lukáš Haraslín', 'Joshua King', 'Ivan Toney', 'Nobody']) as m`))[0].m;
  check('the app reads Arabic names for the names it shows', map['Lukáš Haraslín'] === 'لوكاس هاراسلين' && map['Joshua King'] === 'جوشوا كنج' && !('Ivan Toney' in map) && !('Nobody' in map), JSON.stringify(map));
  await expectErr('a user cannot list or save names', () => as(U.A, `select league_names_todo(5)`), /permission denied/);
  await expectErr('…or save them', () => as(U.A, `select league_names_save('[]'::jsonb, '{}')`), /permission denied/);
  await as(U.A, `update league_players set name_ar = 'سس' where name = 'Joshua King'`).catch(() => {});
  check('…or change the table', (await seen()).find((r) => r.name === 'Joshua King').name_ar === 'جوشوا كنج');
  await expectErr('signed-out visitors cannot read names', () => as(null, `select league_player_names(array['Joshua King'])`), /permission denied/);
  await expectErr('the table refuses Latin in the Arabic name', () => q(`update league_players set name_ar = 'Joshua' where name = 'Ivan Toney'`), /check constraint/);
  await q(`delete from league_matches where id in (7700000000001, 7700000000002)`);

  // حذف الحساب
  await q(`delete from auth.users where id = $1`, [U.C]);
  check('deleting an account removes its team and reminders', (await q(`select count(*)::int as n from league_fans where user_id = $1`, [U.C]))[0].n === 0
    && (await q(`select count(*)::int as n from league_reminders where user_id = $1`, [U.C]))[0].n === 0);
})().catch((e) => { console.error(e); process.exit(1); });
