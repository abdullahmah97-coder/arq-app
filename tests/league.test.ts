// اختبار منطق الدوري السعودي: الحالة، الدقيقة، الأسماء والشارات، التجميع بالأيام، الأضواء، المواجهات، والتذاكر
// التشغيل: npx esbuild@0.25 tests/league.test.ts --bundle --platform=node --log-level=error --outfile=node_modules/.cache/league.test.js && node node_modules/.cache/league.test.js
import {
  canBuyTickets, canRemind, countdown, finishedMatches, formOf, goalDiff, groupByDay, headToHead, kickoffLabel, lastResults, liveLabel,
  matchDayTitle, matchState, resultFor, roundNumber, shortEnName, signed, sortStandings, spotlight, teamColors, teamInitial, teamName,
  upcomingMatches, type LeagueMatch, type LeagueStanding, type LeagueTeam,
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
ok(upcomingMatches(rows).map((x) => x.id).join() === '2,1,7,3', 'upcoming: live first, then nearest', upcomingMatches(rows).map((x) => x.id).join());
ok(finishedMatches(rows).map((x) => x.id).join() === '6,4,5', 'results: newest first, postponed kept', finishedMatches(rows).map((x) => x.id).join());
const g = groupByDay(upcomingMatches(rows));
ok(g.length === 2 && g[0].day === '2026-10-16' && g[0].rows.length === 2 && g[1].day === '2026-10-17' && g[1].rows.map((x) => x.id).join() === '7,3', 'grouped by Riyadh day (00:30 belongs to the next day)', JSON.stringify(g.map((x) => [x.day, x.rows.map((r) => r.id)])));

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

if (fail) process.exit(1);
console.log('ALL LEAGUE TESTS PASSED');
