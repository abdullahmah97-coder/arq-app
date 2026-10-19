// اختبار منطق الدوري السعودي: الحالة، الدقيقة، الأسماء والشارات، التجميع بالأيام، الأضواء، المواجهات، والتذاكر
// التشغيل: npx esbuild@0.25 tests/league.test.ts --bundle --platform=node --log-level=error --outfile=node_modules/.cache/league.test.js && node node_modules/.cache/league.test.js
import {
  canBuyTickets, canRemind, countdown, finishedMatches, formOf, goalDiff, groupByDay, headToHead, kickoffLabel, lastResults, liveLabel,
  matchDayTitle, matchState, resultFor, roundNumber, shortEnName, signed, sortStandings, spotlight, teamColors, teamInitial, teamLogo, teamName,
  upcomingMatches, type LeagueMatch, type LeagueStanding, type LeagueTeam,
  goalsWithSide, hasDetails, lineupRows, minuteText, playerMarks, readDetails, readScorers, redCards, samePlayer, scorerLines, shortPlayer, statBars,
  type LineupPlayer,
} from '../src/lib/leagueCore';

let fail = 0;
const ok = (c: boolean, m: string, extra = '') => { if (!c) { fail++; console.log('FAIL', m, extra); } else console.log('ok  ', m); };

const HIL: LeagueTeam = { id: 2932, name: 'Al-Hilal Saudi FC', name_ar: 'الهلال' };
const NAS: LeagueTeam = { id: 2939, name: 'Al-Nassr', name_ar: 'النصر' };
const NEW: LeagueTeam = { id: 9999, name: 'Some New Club', name_ar: null };
const NOW = Date.parse('2026-10-16T15:00:00Z'); // ٦ العصر بالرياض، الخميس ١٦ أكتوبر
const m = (id: number, kickoff: string, status: string, home = 2932, away = 2939, hg: number | null = null, ag: number | null = null, extra: Partial<LeagueMatch> = {}): LeagueMatch =>
  ({ id, season: 2026, round: 'Regular Season - 8', kickoff, status, elapsed: null, home_id: home, away_id: away, home_goals: hg, away_goals: ag, venue: null, city: null, ...extra });

// الحالة والدقيقة
ok(matchState('NS') === 'upcoming' && matchState('TBD') === 'upcoming', 'NS/TBD are upcoming');
ok(matchState('1H') === 'live' && matchState('HT') === 'live' && matchState('P') === 'live', 'in-play statuses are live');
ok(matchState('FT') === 'finished' && matchState('PEN') === 'finished' && matchState('AWD') === 'finished', 'FT/PEN/AWD are finished');
ok(matchState('PST') === 'off' && matchState('CANC') === 'off', 'postponed/cancelled are off');
ok(JSON.stringify(liveLabel({ status: '2H', elapsed: 63 })) === `{"minute":"63'"}`, "2H 63 → 63'");
ok(JSON.stringify(liveLabel({ status: 'HT', elapsed: 45 })) === '{"key":"league.st_break"}', 'HT → break');
ok(JSON.stringify(liveLabel({ status: 'P', elapsed: 120 })) === '{"key":"league.st_pens"}', 'P → penalties');
ok(JSON.stringify(liveLabel({ status: '1H', elapsed: null })) === '{"key":"league.st_live"}', 'no minute yet → live');

// الأسماء والشارات
ok(teamName(HIL, 'ar') === 'الهلال' && teamName(HIL, 'en') === 'Al-Hilal', 'Arabic name, short English name');
ok(teamName(NEW, 'ar') === 'Some New', 'no Arabic name → short English (Club dropped)', teamName(NEW, 'ar'));
ok(shortEnName('Al-Ittihad FC') === 'Al-Ittihad' && shortEnName('Al Qadsiah') === 'Al Qadsiah', 'English suffixes dropped');
ok(teamInitial(HIL, 'ar') === 'ه' && teamInitial(NAS, 'ar') === 'ن' && teamInitial({ id: 1, name: 'Damac', name_ar: 'ضمك' }, 'ar') === 'ض', 'Arabic initials skip ال');
ok(teamInitial(HIL, 'en') === 'H' && teamInitial(NAS, 'en') === 'N' && teamInitial(NEW, 'en') === 'S', 'English initials skip Al-');
ok(teamLogo({ id: 1, name: 'Al Hilal', name_ar: null, logo_url: 'https://img.thesports.com/football/team/07a5.png' }) === 'https://img.thesports.com/football/team/07a5.png', 'club crest: https link used');
ok(teamLogo({ id: 1, name: 'X', name_ar: null, logo_url: 'http://x.com/a.png' }) === null && teamLogo({ id: 1, name: 'X', name_ar: null, logo_url: 'javascript:alert(1)' }) === null
  && teamLogo({ id: 1, name: 'X', name_ar: null }) === null && teamLogo(null) === null, 'club crest: no https link → letter badge');
ok(teamColors(HIL).bg === '#1B4FA0' && teamColors(NAS).bg === '#F6C516', 'known club colours');
ok(teamColors(NEW).bg === teamColors({ ...NEW }).bg && /^#/.test(teamColors(NEW).bg) && teamColors(null).bg === '#9AA69E', 'other clubs get a stable colour');
ok(roundNumber('Regular Season - 8') === 8 && roundNumber('Regular Season - 34') === 34 && roundNumber('Final') === null && roundNumber(null) === null, 'round number');

// الأوقات بتوقيت الرياض
ok(kickoffLabel('2026-10-16T18:00:00Z', 'ar', '2026-10-16') === 'اليوم · 9:00 م', 'today 9 PM', kickoffLabel('2026-10-16T18:00:00Z', 'ar', '2026-10-16'));
ok(kickoffLabel('2026-10-17T13:30:00Z', 'en', '2026-10-16') === 'Tomorrow · 4:30 PM', 'tomorrow 4:30 PM', kickoffLabel('2026-10-17T13:30:00Z', 'en', '2026-10-16'));
ok(kickoffLabel('2026-10-20T17:00:00Z', 'ar', '2026-10-16').endsWith('20/10 · 8:00 م'), 'later: weekday and date', kickoffLabel('2026-10-20T17:00:00Z', 'ar', '2026-10-16'));
ok(matchDayTitle('2026-10-15', 'ar', '2026-10-16') === 'أمس 15/10', 'yesterday');
ok(kickoffLabel('2026-10-16T21:30:00Z', 'ar', '2026-10-16').startsWith('بكرة · 12:30 ص'), 'after midnight in Riyadh is tomorrow', kickoffLabel('2026-10-16T21:30:00Z', 'ar', '2026-10-16'));

// التجميع والترتيب
const rows = [
  m(1, '2026-10-16T18:00:00Z', 'NS'),
  m(2, '2026-10-16T13:00:00Z', '2H', 2938, 9999, 1, 0, { elapsed: 63 }),
  m(3, '2026-10-17T15:00:00Z', 'NS', 2938, 2939),
  m(4, '2026-10-10T18:00:00Z', 'FT', 2939, 2932, 1, 2),
  m(5, '2026-10-03T18:00:00Z', 'FT', 2932, 2939, 1, 1),
  m(6, '2026-10-12T18:00:00Z', 'PST', 2938, 2932),
  m(7, '2026-10-16T21:30:00Z', 'NS', 9999, 2938),
];
ok(upcomingMatches(rows, NOW).map((x) => x.id).join() === '2,1,7,3', 'upcoming: live first, then nearest', upcomingMatches(rows, NOW).map((x) => x.id).join());
ok(finishedMatches(rows, NOW).map((x) => x.id).join() === '6,4,5', 'results: newest first, postponed kept', finishedMatches(rows, NOW).map((x) => x.id).join());
const g = groupByDay(upcomingMatches(rows, NOW));
ok(g.length === 2 && g[0].day === '2026-10-16' && g[0].rows.length === 2 && g[1].day === '2026-10-17' && g[1].rows.map((x) => x.id).join() === '7,3', 'grouped by Riyadh day (00:30 belongs to the next day)', JSON.stringify(g.map((x) => [x.day, x.rows.map((r) => r.id)])));

// مباشرة قديمة (معلّقة لليوم الثاني) وقادمة فات وقتها
const stale = [...rows, m(9, '2026-10-13T18:00:00Z', 'SUSP', 2932, 2938), m(10, '2026-10-16T09:00:00Z', 'NS', 2939, 9999)];
ok(matchState('SUSP', '2026-10-13T18:00:00Z', NOW) === 'off' && matchState('2H', '2026-10-16T13:00:00Z', NOW) === 'live', 'live status older than 4h is not live');
ok(!upcomingMatches(stale, NOW).some((x) => x.id === 9 || x.id === 10), 'stale live and long-passed upcoming leave the upcoming list');
ok(finishedMatches(stale, NOW).some((x) => x.id === 9), 'a suspended match shows with the results');
ok(spotlight(stale.filter((x) => x.id !== 2), null, NOW)?.id === 1, 'the home tile ignores a match stuck live');
const dup = groupByDay(upcomingMatches(stale, NOW));
ok(new Set(dup.map((x) => x.day)).size === dup.length, 'no day appears twice');

// الأضواء للرئيسية
ok(spotlight(rows, null, NOW)?.id === 2, 'spotlight: a live match');
ok(spotlight(rows, 2932, NOW)?.id === 1, 'spotlight: my team today beats another live match');
ok(spotlight(rows.filter((x) => x.id !== 2), null, NOW)?.id === 1, 'spotlight: otherwise the nearest upcoming');
ok(spotlight(rows.filter((x) => x.status === 'FT'), 2932, NOW) === null, 'spotlight: nothing ahead → null');
ok(spotlight([...rows.filter((x) => x.id !== 1 && x.id !== 2), m(8, '2026-11-20T18:00:00Z', 'NS')], 2932, NOW)?.id === 7, 'my team more than a week away → nearest instead');

// النتائج والشكل
ok(resultFor(rows[3], 2932) === 'W' && resultFor(rows[3], 2939) === 'L' && resultFor(rows[4], 2932) === 'D' && resultFor(rows[0], 2932) === null, 'result per team');
ok(headToHead(rows, rows[0]).map((x) => x.id).join() === '4,5', 'head to head: finished meetings, newest first');
ok(lastResults(rows, 2932).map((x) => x.id).join() === '4,5', 'last results skip postponed');
const st: LeagueStanding[] = [
  { season: 2026, team_id: 2939, rank: 2, points: 19, played: 8, win: 6, draw: 1, lose: 1, goals_for: 17, goals_against: 7, form: 'WLWWW' },
  { season: 2026, team_id: 2932, rank: 1, points: 22, played: 8, win: 7, draw: 1, lose: 0, goals_for: 20, goals_against: 4, form: null },
];
ok(sortStandings(st).map((x) => x.team_id).join() === '2932,2939', 'standings sorted by rank');
ok(formOf(2939, st, rows).join('') === 'WLWWW', 'form from the standings');
ok(formOf(2932, st, rows).join('') === 'DW', 'no form in standings → from results (oldest first)', formOf(2932, st, rows).join(''));
ok(signed(goalDiff(st[0])) === '+10' && signed(-3) === '-3' && signed(0) === '0' && signed(goalDiff({ goals_for: null, goals_against: 1 })) === '—', 'goal difference');

// العد التنازلي والتذاكر والتذكير
ok(JSON.stringify(countdown('2026-10-16T18:00:00Z', NOW)) === '{"d":0,"h":3,"m":0}', 'countdown 3h');
ok(JSON.stringify(countdown('2026-10-18T16:01:30Z', NOW)) === '{"d":2,"h":1,"m":2}', 'countdown rounds up minutes', JSON.stringify(countdown('2026-10-18T16:01:30Z', NOW)));
ok(countdown('2026-10-16T14:00:00Z', NOW) === null, 'started → no countdown');
ok(canBuyTickets(rows[0], 'https://webook.com/ar/spl', NOW) && !canBuyTickets(rows[1], 'https://webook.com/ar/spl', NOW), 'tickets only before kick-off');
ok(!canBuyTickets(rows[0], 'http://x.com', NOW) && !canBuyTickets(rows[0], null, NOW), 'tickets need an https link');
ok(canRemind(rows[0], NOW) && !canRemind(rows[1], NOW) && !canRemind(rows[3], NOW), 'reminders only before kick-off');

// تفاصيل المباراة (بشكل ما يكتبه الخادم)
const row = {
  ht_home: 1, ht_away: 0,
  events: [
    { min: 60, side: 'h', kind: 'goal', p: 'Wilfried Kanga', hs: 2, as: 0 },
    { min: 33, side: 'h', kind: 'goal', p: 'Lukáš Haraslín', hs: 1, as: 0 },
    { min: 38, side: 'h', kind: 'yc', p: 'Ali Alamine' },
    { min: 45, side: 'a', kind: 'sub', in: 'Joshua King', out: 'Thamer Al-Khaibri' },
    { min: 78, side: 'a', kind: 'og', p: 'Mihai Lixandru', hs: 2, as: 1 },
    { min: 84, side: 'a', kind: 'pen', p: 'Joshua King', hs: 2, as: 2 },
    { min: 93, side: 'a', kind: 'goal', p: 'Joshua King', hs: 2, as: 3 },
    { min: 95, side: 'h', kind: 'y2', p: 'Ali Alamine' },
    { min: 'x', side: 'h', kind: 'goal' }, { min: 10, side: 'z', kind: 'goal' }, { min: 10, side: 'h', kind: 'dance' }, null,
  ],
  stats: [{ k: 'shots_on', h: 4, a: 4 }, { k: 'possession', h: 38, a: 62 }, { k: 'BAD KEY', h: 1, a: 1 }, { k: 'fouls', h: -1, a: 2 }, { k: 'corners', h: 0, a: 0 }],
  lineups: { ok: true, hf: '3-4-3', af: '4-2-3-1; x', hc: null, ac: 'Coach', h: [{ n: 'Adrian Šemper', no: 1, pos: 'G' }, { n: '', no: 2 }], a: [{ n: 'X', no: 300, pos: 'Q' }], hs: 'nope', as: [] },
};
const det = readDetails(row);
ok(JSON.stringify(det.ht) === '[1,0]' && det.events.length === 8 && det.events.map((e) => e.min).join() === '33,38,45,60,78,84,93,95', 'details: junk events dropped, sorted by minute', det.events.map((e) => e.min).join());
ok(det.stats.map((x) => x.k).join() === 'shots_on,possession,corners', 'details: bad stat rows dropped');
ok(det.lineups?.hf === '3-4-3' && det.lineups.af === null && det.lineups.h.length === 1 && det.lineups.a[0].no === null && det.lineups.a[0].pos === null && det.lineups.hs.length === 0, 'details: lineups read defensively');
ok(!hasDetails(readDetails(null)) && readDetails({ lineups: [] }).lineups === null && hasDetails(det), 'details: empty row → nothing');
const gs = goalsWithSide(det.events);
ok(gs.map((g) => g.for).join('') === 'hhaaa', 'goals: each goal (own goal too) counts for the side whose score went up', gs.map((g) => g.for).join(''));
ok(goalsWithSide([{ min: 5, side: 'a', kind: 'og', p: 'X', hs: 1, as: 0 }])[0].for === 'h', 'goals: the score decides over the listed side');
ok(goalsWithSide([{ min: 5, side: 'h', kind: 'og', p: 'X' }])[0].for === 'a', 'goals: own goal without a score → the other side');
const sl = scorerLines(det.events);
ok(sl.h.map((x) => `${x.name}:${x.mins.map((m) => m.min).join('+')}`).join() === 'Haraslín:33,Kanga:60'
  && sl.a.map((x) => `${x.name}:${x.mins.map((m) => m.kind).join('+')}`).join() === 'Lixandru:og,King:pen+goal', 'scorer lines grouped per player and side', JSON.stringify(sl));
ok(JSON.stringify(redCards(det.events)) === '{"h":1,"a":0}', 'red cards (second yellow counts)');
ok(shortPlayer('Ali Saeed Ali Al Shaafi') === 'Al Shaafi' && shortPlayer('Cristiano Ronaldo') === 'Ronaldo' && shortPlayer('Fawaz Al-Sagour') === 'Al-Sagour' && shortPlayer('Kanga') === 'Kanga' && shortPlayer('A. Alamine Ali') === 'Alamine', 'short player names');
ok(samePlayer('Ali Alamine', 'A. Alamine Ali') && samePlayer('Lukáš Haraslín', 'Lukas Haraslin') && !samePlayer('Mohammed Abbas Al Ibrahim', 'Mohammed Al-Khabrani')
  && !samePlayer('Ali Al-Hassan', 'Ali Al Masoud') && !samePlayer(undefined, 'x'), 'same player across spellings, not across shared first names');
const mk = playerMarks('A. Alamine Ali', 'h', det.events);
ok(mk.yellow && mk.red && mk.goals === 0, 'player marks: cards matched across spellings');
const mk2 = playerMarks('Joshua King', 'a', det.events);
ok(mk2.goals === 2 && mk2.inMin === 45 && mk2.outMin === null && playerMarks('Thamer Al-Khaibri', 'a', det.events).outMin === 45, 'player marks: goals and substitution minutes');
ok(playerMarks('Joshua King', 'h', det.events).goals === 0, 'player marks: only that side');
const P = (n: string, pos: LineupPlayer['pos'], no = 1): LineupPlayer => ({ n, no, pos });
const xi343 = [P('G1', 'G'), P('M1', 'M'), P('D1', 'D'), P('F1', 'F'), P('F2', 'F'), P('F3', 'F'), P('M2', 'M'), P('D2', 'D'), P('M3', 'M'), P('M4', 'M'), P('D3', 'D')];
ok(lineupRows(xi343, '3-4-3').map((r) => r.map((p) => p.n).join('')).join('|') === 'G1|D1D2D3|M1M2M3M4|F1F2F3', 'lineup rows follow the formation');
const xi4231 = [P('G', 'G'), P('D1', 'D'), P('D2', 'D'), P('D3', 'D'), P('D4', 'D'), P('M1', 'M'), P('M2', 'M'), P('M3', 'M'), P('M4', 'M'), P('M5', 'M'), P('F1', 'F')];
ok(lineupRows(xi4231, '4-2-3-1').map((r) => r.length).join('-') === '1-4-2-3-1', 'lineup rows: 4-2-3-1 splits the midfield');
ok(lineupRows(xi4231, '4-4-3').map((r) => r.length).join('-') === '1-4-5-1' && lineupRows(xi4231, null).map((r) => r.length).join('-') === '1-4-5-1', 'lineup rows: wrong or missing formation → one line per position');
ok(playerMarks('Mihai Lixandru', 'h', det.events).og === 1, 'player marks: an own goal is found whichever side it is listed under');
ok(lineupRows([], '4-4-2').length === 0, 'lineup rows: nobody → nothing');
const sb = statBars(det.stats);
ok(sb.map((x) => x.k).join() === 'possession,shots_on,corners' && sb[0].share === 0.38 && sb[2].share === 0.5, 'stats ordered with each side share');
ok(minuteText(33) === "33'" && minuteText(93) === "90+3'", 'minute text');
const sc = readScorers([{ rank: 2, name: 'B', team: 5, goals: 6 }, { rank: 1, name: 'A', team: null, goals: 11, assists: 1 }, { rank: 'x', name: 'C', goals: 1 }, { rank: 3, name: '', goals: 1 }]);
ok(sc.map((x) => x.name).join() === 'A,B' && sc[0].assists === 1 && sc[1].assists === null && readScorers(null).length === 0, 'scorers read defensively and sorted by rank');

if (fail) process.exit(1);
console.log('ALL LEAGUE TESTS PASSED');
