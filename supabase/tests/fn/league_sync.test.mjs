// اختبار دالة league-sync بدون إنترنت: الدخول، الموسم، طلبات SportScore، القراءة، المتابعة المباشرة، والأخطاء
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 supabase/functions/league-sync/index.ts --bundle --format=esm --platform=node \
//     --alias:npm:@supabase/supabase-js@2=./supabase/tests/fn/supabase-mock-league.mjs --outfile=node_modules/.cache/fn/league_sync.bundle.mjs
//   node supabase/tests/fn/league_sync.test.mjs
import { db } from './supabase-mock-league.mjs';

let handler;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };

// SportScore: كل طلب يسجّل، والرد من دالة نغيّرها لكل اختبار
const sent = [];
let reply = () => ({});
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  sent.push({ host: u.host, path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers });
  const r = reply(u.pathname, Object.fromEntries(u.searchParams), sent.length);
  if (r instanceof Error) throw r;
  if (r && r.__status) return new Response(r.__body ?? '<!doctype html>busy', { status: r.__status });
  return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const mod = await import('../../../node_modules/.cache/fn/league_sync.bundle.mjs');
const {
  seasonFor, seasonWindow, hash53, teamId, matchRef, splitRef, statusCode, minuteOf, apiError, isLeague,
  parseTeamMatches, parseMatchDetail, parseStandings, mergeMatches, setPause,
  eventKind, parseEvents, parseStats, parseLineups, parseTopScorers,
} = mod;
const waits = [];
setPause(async (ms) => { waits.push(ms); });

let failed = 0;
const ok = (label, c, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', label, c ? '' : extra); if (!c) { failed++; process.exitCode = 1; } };
const call = async (body = { mode: 'full' }, headers = { 'x-league-key': db.key }, method = 'POST') => {
  const res = await handler(new Request('https://fn/league-sync', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: await res.json() };
};
const reset = () => { sent.length = 0; waits.length = 0; db.calls.length = 0; db.ingestError = null; db.keyError = null; db.matches = []; db.matchesError = null; db.detailsError = null; };
const ingests = () => db.calls.filter((c) => c.fn === 'league_ingest').map((c) => c.args);
const detailCalls = () => db.calls.filter((c) => c.fn === 'league_ingest_details').map((c) => c.args);
const iso = (mins) => new Date(Date.now() + mins * 60e3).toISOString();

// ردود بنفس شكل SportScore الحقيقي
const LOGO = (h) => `https://img.thesports.com/football/team/${h}.png`;
const SPL = 'Saudi Professional League';
const mx = (home, away, key, time, extra = {}) => ({
  home, away, home_logo: LOGO(home.length), away_logo: LOGO(away.length), home_score: null, away_score: null,
  status: 'upcoming', status_text: 'Not started', time, competition: SPL, competition_logo: LOGO('c'),
  url: `/football/match/${home.toLowerCase().replace(/\s+/g, '-')}-vs-${away.toLowerCase().replace(/\s+/g, '-')}/${key}/`, ...extra,
});
const row = (pos, team, slug, pts) => ({ pos, team, team_logo: LOGO(slug), team_slug: slug, team_url: `/football/team/${slug}/`, p: 8, w: 6, d: 1, l: 1, gf: 19, ga: 7, gd: 12, pts });
const standingsBody = { sport: 'football', competition: SPL, competition_slug: 'saudi-professional-league',
  tables: [{ group: '', rows: [row(1, 'Al Qadsiah', 'al-qadsiah', 22), row(2, 'Al Hilal', 'al-hilal', 21), row(3, 'Al Nassr', 'al-nassr', 19)] }] };

// ---------- منطق بحت ----------
ok('season: October 2026 → 2026', seasonFor(new Date('2026-10-14T12:00:00Z')) === 2026);
ok('season: March 2027 → 2026 (same season)', seasonFor(new Date('2027-03-01T12:00:00Z')) === 2026);
ok('season: July 2027 → 2027 (new season)', seasonFor(new Date('2027-07-01T00:00:00Z')) === 2027);
ok('season: 30 June 23:30 UTC is already July in Riyadh', seasonFor(new Date('2027-06-30T23:30:00Z')) === 2027);
ok('season: owner override wins, junk ignored', seasonFor(new Date('2026-10-14T12:00:00Z'), 2025) === 2025 && seasonFor(new Date('2026-10-14T12:00:00Z'), 'x') === 2026 && seasonFor(new Date('2026-10-14T12:00:00Z'), 1999) === 2026);
const sw = seasonWindow(2026);
ok('season window: 1 July Riyadh to 1 July Riyadh', new Date(sw.from).toISOString() === '2026-06-30T21:00:00.000Z' && new Date(sw.to).toISOString() === '2027-06-30T21:00:00.000Z');

ok('hash: stable, positive, within 2^53', hash53('abc') === hash53('abc') && hash53('abc') !== hash53('abd') && hash53('abc') > 0 && hash53('x'.repeat(500)) <= Number.MAX_SAFE_INTEGER);
ok('team id: same club however it is written', teamId('Al Hilal') === teamId('al-hilal') && teamId('Al Hilal') === teamId('  AL  HILAL '));
ok('team id: different clubs differ, fits in integer', teamId('Al Hilal') !== teamId('Al Nassr') && teamId('Al Hilal') > 0 && teamId('Al Hilal') <= 2147483647);

const ref = matchRef('/football/match/al-nassr-fc-vs-al-hilal/x7lm7phj6d6km2w/');
ok('match ref: pair slug, key and a stable numeric id', ref.slug === 'al-nassr-fc-vs-al-hilal' && ref.key === 'x7lm7phj6d6km2w' && ref.ref === 'al-nassr-fc-vs-al-hilal/x7lm7phj6d6km2w' && ref.id === hash53('match:x7lm7phj6d6km2w'));
ok('match ref: junk rejected', matchRef('https://evil.com/football/match/a-vs-b/abcdef1/') === null && matchRef('/football/match/A-vs-B/abcdef1/') === null
  && matchRef('/football/match/a-vs-b/ab/') === null && matchRef('/football/match/a-vs-b/abcdef1/../x') === null && matchRef(null) === null);
ok('split ref', splitRef('al-nassr-fc-vs-al-hilal/x7lm7phj6d6km2w')?.key === 'x7lm7phj6d6km2w' && splitRef('x/../y') === null && splitRef(undefined) === null);

const st = (s, t) => statusCode(s, t);
ok('status: upcoming → NS, delayed → PST, TBD', st('upcoming', 'Not started') === 'NS' && st('upcoming', 'Delayed') === 'PST' && st('upcoming', 'To be determined') === 'TBD');
ok('status: finished → FT / AET / PEN', st('finished', 'Finished') === 'FT' && st('finished', 'After extra time') === 'AET' && st('finished', 'After penalties') === 'PEN');
ok('status: live halves, break, extra time, shoot-out', st('live', '1st half') === '1H' && st('live', 'Half-time') === 'HT' && st('live', 'Halftime') === 'HT'
  && st('live', '2nd half') === '2H' && st('live', 'Extra time') === 'ET' && st('live', 'Penalty shootout') === 'P' && st('live', 'Second half') === '2H');
ok('status: off states', st('cancelled', 'Cancelled') === 'CANC' && st('live', 'Interrupted') === 'INT' && st('x', 'Abandoned') === 'ABD' && st('x', 'Cut in half') === 'ABD');
ok('status: unknown live → LIVE, unknown anything → TBD', st('live', '') === 'LIVE' && st('weird', '???') === 'TBD' && st(null, null) === 'TBD');
ok('minute: 63, "63\'", "45+2", junk', minuteOf(63) === 63 && minuteOf("63'") === 63 && minuteOf('45+2') === 45 && minuteOf('x') === null && minuteOf(999) === null);
ok('api error message', apiError({ error: 'Match not found' }) === 'Match not found' && apiError({ sport: 'football' }) === null && apiError(null) === null);
ok('league filter: only the Pro League', isLeague(SPL) && !isLeague('Saudi Arabia Kings Cup') && !isLeague('AFC Champions League Elite') && !isLeague('Saudi First Division League') && !isLeague(undefined));

const tm = parseTeamMatches({ matches: [
  mx('Al Hilal', 'Al Nassr', 'x7lm7phj6d6km2w', '2027-05-28T17:00:00+00:00'),
  mx('Al Nassr', 'Pakhtakor', 'aaaaaaa1', '2026-11-02T13:45:00+00:00', { competition: 'AFC Champions League Elite' }),
  mx('Al Faisaly', 'Al Hazem', 'bbbbbbb2', '2026-09-05T15:50:00+00:00', { status: 'finished', status_text: 'Finished', home_score: '2', away_score: '1' }),
  mx('Al Hilal', 'Al Nassr', 'ccccccc3', '2026-05-12T18:00:00+00:00', { status: 'finished', home_score: '1', away_score: '1' }), // الموسم اللي قبل
  mx('Al Hilal', 'Al Hilal', 'ddddddd4', '2026-10-20T18:00:00+00:00'),
  mx('Al Ahli SC', 'Al Fayha', 'eeeeeee5', 'not a date'),
  { home: 'A', away: 'B', time: '2026-10-20T18:00:00+00:00', competition: SPL, url: 'javascript:alert(1)' },
  mx('Al Ettifaq', 'Al Ittihad', 'fffffff6', '2026-10-20T18:00:00+00:00', { home_score: '9', status: 'upcoming' }),
] }, 2026);
ok('team list: only valid league matches of this season', tm.matches.map((m) => m.ref.split('/')[1]).join() === 'x7lm7phj6d6km2w,bbbbbbb2,fffffff6', tm.matches.map((m) => m.ref).join());
const fin = tm.matches.find((m) => m.ref.endsWith('bbbbbbb2'));
ok('team list: finished score as numbers, status FT, UTC kickoff, league 307', fin.status === 'FT' && fin.hg === 2 && fin.ag === 1 && fin.kickoff === '2026-09-05T15:50:00.000Z' && fin.league === 307 && fin.season === 2026 && fin.round === null, JSON.stringify(fin));
ok('team list: upcoming never carries a score', tm.matches.find((m) => m.ref.endsWith('fffffff6')).hg === null);
ok('team list: home/away ids from names, teams collected once with https logos', tm.matches[0].home === teamId('Al Hilal') && tm.matches[0].away === teamId('Al Nassr')
  && tm.teams.length === 6 && tm.teams.every((t) => t.logo === null || t.logo.startsWith('https://')), JSON.stringify(tm.teams.map((t) => t.name)));
ok('team list: junk body → nothing', parseTeamMatches(null, 2026).matches.length === 0 && parseTeamMatches({ matches: 'x' }, 2026).matches.length === 0);

const liveBody = { sport: 'football', match: mx('Al Hilal', 'Al Hazem', 'kkkkkkk7', iso(-50), { status: 'live', status_text: '2nd half', home_score: '2', away_score: '0', live_minute: "63'" }) };
const d1 = parseMatchDetail(liveBody, 'kkkkkkk7', seasonFor(new Date()));
ok('detail: our match → live score and minute', d1 && d1.match.status === '2H' && d1.match.hg === 2 && d1.match.ag === 0 && d1.match.elapsed === 63 && d1.teams.length === 2, JSON.stringify(d1?.match));
ok('detail: a different meeting of the same pair is refused', parseMatchDetail(liveBody, 'zzzzzzz9', seasonFor(new Date())) === null);
ok('detail: junk → null', parseMatchDetail({ error: 'Match not found' }, 'kkkkkkk7', 2026) === null && parseMatchDetail(null, 'kkkkkkk7', 2026) === null);

// تفاصيل حقيقية (الفتح ٢-٣ الخليج، ١٨ أكتوبر ٢٠٢٦) بشكل رد SportScore
const P = (name, number, position, captain = false) => ({ name, number, rating: '0.0', captain, position });
const realDetail = { sport: 'football', match: {
  ...mx('Al Fateh', 'Al Khaleej', 'y39mp1h6l80vmoj', '2026-10-18T18:00:00+00:00', { status: 'finished', status_text: 'Finished', home_score: '2', away_score: '3' }),
  url: '/football/match/al-fateh-sc-vs-al-khaleej-club/y39mp1h6l80vmoj/', home_ht_score: 1, away_ht_score: 0,
  stats: [
    { away: 62, home: 38, label: 'Ball Possession', suffix: '%', away_pct: 62, home_pct: 38 },
    { away: 4, home: 4, label: 'Shots on Target', suffix: '', away_pct: 50, home_pct: 50 },
    { away: 7, home: 6, label: 'Shots off Target', suffix: '', away_pct: 54, home_pct: 46 },
    { away: 107, home: 81, label: 'Attacks', suffix: '', away_pct: 57, home_pct: 43 },
    { away: 58, home: 40, label: 'Dangerous Attacks', suffix: '', away_pct: 59, home_pct: 41 },
    { away: 1, home: 2, label: 'Something New', suffix: '' },
  ],
  lineups: {
    confirmed: true, home_formation: '3-4-3', away_formation: '4-4-2', home_coach: null, away_coach: 'Some Coach',
    home_xi: [P('Adrian Šemper', 1, 'G'), P('Ali Al-Hassan', 6, 'M'), P('Mihai Lixandru', 8, 'D'), P('Wilfried Kanga', 9, 'F'), P('Lukáš Haraslín', 10, 'F'),
      P('Mourad Batna', 11, 'F'), P('Abdulelah Al Khaibari', 16, 'M'), P('Marwane Saadane', 17, 'D', true), P('Hossam Essadak', 20, 'M'), P('A. Alamine Ali', 27, 'M'), P('Abdulaziz Al-Suwailem', 78, 'D')],
    away_xi: [P('Boubakar Kouyate', 4, 'D'), P('Omar Mascarell', 8, 'M'), P('Mateo Benegas', 9, 'F'), P('Ahmad Asiri', 13, 'D'), P('Ali Saeed Ali Al Shaafi', 14, 'D'),
      P('Mansour Hamzi', 15, 'M'), P('Nawaf Al-Sadi', 18, 'M'), P('Fawaz Al-Sagour', 27, 'D'), P('Hussain Al Issa', 28, 'M'), P('Thamer Al-Khaibri', 90, 'F'), P('Marwan Al-Haidari', 96, 'G')],
    home_subs: [P('Fahad Al Zubaidi', 7, 'F'), P('Robin Kelder', 19, 'D')], away_subs: [P('Joshua King', 7, 'F'), P('Musa Barrow', 99, 'F'), { name: '', number: 3 }],
  },
  incidents: [
    { side: 'home', time: 33, type: 'Goal', player: 'Lukáš Haraslín', is_goal: true, type_id: 1, away_score: 0, home_score: 1 },
    { side: 'home', time: 37, type: 'Yellow card', player: 'Ali Al-Hassan', is_card: true, type_id: 3 },
    { side: 'away', time: 45, type: 'Substitution', is_sub: true, player: '', type_id: 9, player_in: 'Joshua King', player_out: 'Thamer Al-Khaibri' },
    { side: 'home', time: 60, type: 'Goal', player: 'Wilfried Kanga', is_goal: true, type_id: 1, away_score: 0, home_score: 2 },
    { side: 'away', time: 78, type: 'Goal', player: 'Musa Barrow', is_goal: true, type_id: 1, away_score: 1, home_score: 2 },
    { side: 'home', time: 2, type: 'Corner', type_id: 2 },
    { side: 'away', time: 84, type: 'Goal', player: 'Joshua King', is_goal: true, type_id: 1, away_score: 2, home_score: 2 },
    { side: 'away', time: 93, type: 'Goal', player: 'Omar Mascarell', is_goal: true, type_id: 1, away_score: 3, home_score: 2 },
    { side: 'nobody', time: 50, type: 'Goal', type_id: 1 },
  ],
} };
const rd = parseMatchDetail(realDetail, 'y39mp1h6l80vmoj', 2026);
ok('detail: the id the details belong to is the match id', rd && rd.detail.id === rd.match.id && rd.match.status === 'FT' && rd.match.hg === 2 && rd.match.ag === 3);
ok('detail: half-time score once the first half is over', JSON.stringify(rd.detail.ht) === '[1,0]');
ok('detail: events sorted by minute, corners and junk dropped', rd.detail.events.length === 7 && rd.detail.events.map((e) => e.min).join() === '33,37,45,60,78,84,93', JSON.stringify(rd.detail.events.map((e) => e.min)));
const ev0 = rd.detail.events[0];
ok('detail: goal carries scorer, side and the score after it', ev0.kind === 'goal' && ev0.side === 'h' && ev0.p === 'Lukáš Haraslín' && ev0.hs === 1 && ev0.as === 0);
const sub = rd.detail.events.find((e) => e.kind === 'sub');
ok('detail: substitution keeps in and out, no empty player', sub.side === 'a' && sub.in === 'Joshua King' && sub.out === 'Thamer Al-Khaibri' && !('p' in sub));
ok('detail: yellow card', rd.detail.events[1].kind === 'yc' && rd.detail.events[1].p === 'Ali Al-Hassan' && !('hs' in rd.detail.events[1]));
ok('detail: stats mapped to our keys, unknown labels dropped', rd.detail.stats.map((x) => x.k).join() === 'possession,shots_on,shots_off,attacks,dangerous'
  && rd.detail.stats[0].h === 38 && rd.detail.stats[0].a === 62, JSON.stringify(rd.detail.stats));
const lu = rd.detail.lineups;
ok('detail: lineups with formations, eleven each, captain, coach', lu.ok === true && lu.hf === '3-4-3' && lu.af === '4-4-2' && lu.h.length === 11 && lu.a.length === 11
  && lu.h.find((x) => x.c)?.n === 'Marwane Saadane' && lu.hc === null && lu.ac === 'Some Coach' && lu.h[0].pos === 'G' && lu.h[0].no === 1);
ok('detail: subs without a name skipped', lu.hs.length === 2 && lu.as.length === 2);
const firstHalf = parseMatchDetail({ match: { ...liveBody.match, status_text: '1st half', home_ht_score: 0, away_ht_score: 0, incidents: [], stats: [], lineups: {} } }, 'kkkkkkk7', seasonFor(new Date()));
ok('detail: no half-time score during the first half, empty lists left out', firstHalf && !('ht' in firstHalf.detail) && !('events' in firstHalf.detail) && !('stats' in firstHalf.detail) && !('lineups' in firstHalf.detail), JSON.stringify(firstHalf?.detail));

const k = (x) => eventKind(x);
ok('event kinds: own goal, penalty, missed penalty, second yellow, red, VAR', k({ type: 'Own goal', is_goal: true, type_id: 17 }) === 'og' && k({ type_id: 8, type: 'Penalty' }) === 'pen'
  && k({ type: 'Penalty missed', type_id: 16 }) === 'pmiss' && k({ type: 'Yellow-red card' }) === 'y2' && k({ type: 'Red card', type_id: 4 }) === 'rc' && k({ type: 'VAR', type_id: 28 }) === 'var');
ok('event kinds: corners, goal kicks, offsides, unknown → not shown', k({ type: 'Corner', type_id: 2 }) === null && k({ type: 'Goal kick', type_id: 7 }) === null && k({ type: 'Offside', type_id: 5 }) === null && k({}) === null);
ok('events: junk → nothing, sub with nobody skipped', parseEvents(null).length === 0 && parseEvents([{ side: 'home', time: 10, type_id: 9, player_in: '', player_out: '' }]).length === 0
  && parseEvents([{ side: 'home', time: 'x', type_id: 1 }]).length === 0);
ok('stats: duplicates and impossible possession dropped', parseStats([{ label: 'Ball Possession', home: 150, away: 20 }, { label: 'Corner Kicks', home: 3, away: 5 }, { label: 'Corners', home: 9, away: 9 }]).map((x) => `${x.k}:${x.h}`).join() === 'corners:3');
ok('lineups: nothing / bad formation', parseLineups(null) === null && parseLineups({ home_xi: [], away_xi: [] }) === null && parseLineups({ home_xi: [P('A B', 1, 'G')], home_formation: '4-4-2; drop' }).hf === null);

const sc = parseTopScorers({ scorers: [
  { rank: 1, player: 'Ivan Toney', team: 'Al Ahli SC', team_slug: 'al-ahli-sc', goals: 11, assists: 1, matches: 8, minutes: 684 },
  { rank: 2, player: 'Mateo Retegui', team: 'Al Qadsiah', team_slug: 'unknown-slug', goals: 6, assists: 2, matches: 9, minutes: 707 },
  { rank: 3, player: 'Someone', team: 'Nobody FC', team_slug: '__proto__', goals: 5 },
  { rank: 4, player: '', team: 'Al Hilal', goals: 4 },
  { rank: 'x', player: 'Bad', goals: 1 },
] }, { 'al-ahli-sc': 77 }, new Set([teamId('Al Qadsiah')]));
ok('scorers: team from the club link, else from a known name, else none', sc.length === 3 && sc[0].team === 77 && sc[0].goals === 11 && sc[0].assists === 1
  && sc[1].team === teamId('Al Qadsiah') && sc[2].team === null && sc[2].assists === null, JSON.stringify(sc));
ok('scorers: junk body → nothing', parseTopScorers(null).length === 0 && parseTopScorers({ scorers: 'x' }).length === 0);

const ps = parseStandings({ tables: [{ rows: [row(1, 'Al Qadsiah', 'al-qadsiah', 22), row(2, 'Al Hilal', 'al-hilal', 21), row(3, 'Al Hilal', 'al-hilal', 1), { pos: 99, team: 'X' }, row(4, 'Bad Slug', 'Bad Slug!', 3)] }] });
ok('standings: rows, numbers, duplicates and bad ranks skipped, no form', ps.standings.length === 3 && ps.standings[0].points === 22 && ps.standings[0].gf === 19 && ps.standings[0].form === null && ps.standings[1].team === teamId('Al Hilal'), JSON.stringify(ps.standings));
ok('standings: club slugs for the team requests (bad slug dropped)', ps.slugs.join() === 'al-qadsiah,al-hilal');
ok('standings: junk → nothing', parseStandings({}).standings.length === 0 && parseStandings(undefined).slugs.length === 0);

const a = { id: 1, status: 'NS' }; const b = { id: 1, status: 'FT', hg: 1 }; const c = { id: 1, status: '2H' };
ok('merge: the furthest-along state wins whatever the order', mergeMatches([a], [b], [c])[0].status === 'FT' && mergeMatches([b], [a])[0].status === 'FT' && mergeMatches([a], [c])[0].status === '2H');

// ---------- الدخول ----------
reset();
ok('GET → 405', (await call(undefined, {}, 'GET')).status === 405);
ok('no key → 401 (no database call)', (await call(undefined, {})).status === 401 && db.calls.length === 0);
ok('wrong key → 401', (await call({ mode: 'full' }, { 'x-league-key': 'nope' })).status === 401);
db.keyError = 'boom';
ok('key check error → 401', (await call()).status === 401);
reset();
ok('oversized key → 401 without asking the database', (await call({ mode: 'full' }, { 'x-league-key': 'k'.repeat(501) })).status === 401 && db.calls.length === 0 && sent.length === 0);

// ---------- full ----------
const teamReply = (slug) => ({ sport: 'football', team: { name: slug, slug }, count: 2, matches: {
  'al-qadsiah': [mx('Al Qadsiah', 'Al Hilal', 'qh000001', iso(60 * 24 * 3)), mx('Al Nassr', 'Al Qadsiah', 'nq000002', iso(-60 * 24 * 10), { status: 'finished', status_text: 'Finished', home_score: '0', away_score: '3' })],
  'al-hilal': [mx('Al Qadsiah', 'Al Hilal', 'qh000001', iso(60 * 24 * 3)), mx('Al Hilal', 'Pakhtakor', 'hp000003', iso(60), { competition: 'AFC Champions League Elite' })],
  'al-nassr': [mx('Al Nassr', 'Al Qadsiah', 'nq000002', iso(-60 * 24 * 10))], // جدول النصر ما فيه النهاية، وجدول القادسية فيه
}[slug] ?? [] });
reset();
reply = (path, p) => path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug);
let r = await call({ mode: 'full' });
ok('full: standings, each club in order, then top scorers; no API key anywhere', sent.length === 5 && sent[0].path === '/api/widget/standings/' && sent[0].params.slug === 'saudi-professional-league'
  && sent.slice(1, 4).map((s) => s.params.slug).join() === 'al-qadsiah,al-hilal,al-nassr' && sent.slice(1, 4).every((s) => s.path === '/api/widget/team/' && s.params.limit === '30')
  && sent[4].path === '/api/widget/topscorers/' && sent[4].params.slug === 'saudi-professional-league', JSON.stringify(sent.map((s) => s.path + '?' + s.params.slug)));
ok('full: sportscore.com, our User-Agent, paced', sent.every((s) => s.host === 'sportscore.com' && /^arq-league\//.test(s.headers['User-Agent'])) && waits.filter((w) => w === 350).length >= 3);
const g = ingests()[0];
const nq = g.p_matches.find((m) => m.ref === 'al-nassr-vs-al-qadsiah/nq000002');
ok('full: league matches merged across clubs, cups dropped, finished state kept', g.p_mode === 'full' && g.p_matches.length === 2 && nq?.status === 'FT' && nq.ag === 3, JSON.stringify(g.p_matches));
ok('full: standings and teams sent, nothing about requests left', g.p_standings.length === 3 && g.p_teams.length === 3 && g.p_left === null && !g.p_error, JSON.stringify(g.p_teams));
ok('full: response summarises', r.status === 200 && r.body.ok === true && r.body.mode === 'full' && r.body.matches === 2, JSON.stringify(r.body));

// ضغط مؤقت: 503 ثم ينجح
reset();
let busy = true;
reply = (path, p) => {
  if (path === '/api/widget/team/' && p.slug === 'al-hilal' && busy) { busy = false; return { __status: 503 }; }
  return path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug);
};
await call({ mode: 'full' });
ok('full: a 503 is retried once after a pause', sent.length === 6 && waits.includes(2000) && ingests()[0].p_matches.length === 2 && !ingests()[0].p_error);

// نادي واحد طاح ← نكمل بالباقي
reset();
reply = (path, p) => (path === '/api/widget/team/' && p.slug === 'al-nassr' ? { __status: 500 } : path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug));
await call({ mode: 'full' });
ok('full: one club failing still saves the rest', ingests().length === 1 && !ingests()[0].p_error && ingests()[0].p_matches.length === 2);

// الترتيب طاح ← خطأ، وما نطلب الأندية
reset();
reply = () => ({ __status: 404, __body: JSON.stringify({ error: 'Competition not found' }) });
r = await call({ mode: 'full' });
ok('full: standings error recorded with the provider message, no club requests', r.body.ok === false && sent.length === 1 && ingests()[0].p_error === 'Competition not found', JSON.stringify(ingests()[0]));

reset();
reply = (path) => (path === '/api/widget/standings/' ? standingsBody : { __status: 500 });
r = await call({ mode: 'full' });
ok('full: every club failing → teams_unreachable', r.body.error === 'teams_unreachable' && ingests()[0].p_error === 'teams_unreachable');

// تقفيل النتائج: مباراة فات موعدها وما وصلت نهايتها من الجداول ← نطلب تفاصيلها
reset();
db.matches = [
  { id: 1, kickoff: iso(-180), status: 'NS', source_ref: 'al-hilal-vs-al-hazem/settle01' },
  { id: 2, kickoff: iso(-60 * 24 * 9), status: 'NS', source_ref: 'a-vs-b/tooold01' },   // أقدم من ٧ أيام
  { id: 3, kickoff: iso(-300), status: 'FT', source_ref: 'c-vs-d/alreadyft' },          // خلصت
];
reply = (path, p) => {
  if (path === '/api/widget/match/') return { sport: 'football', match: mx('Al Hilal', 'Al Hazem', 'settle01', iso(-180), { status: 'finished', status_text: 'Finished', home_score: '4', away_score: '1' }) };
  return path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug);
};
await call({ mode: 'full' });
const settled = ingests()[0].p_matches.find((m) => m.ref === 'al-hilal-vs-al-hazem/settle01');
ok('full: overdue match settled from its detail (only that one)', sent.filter((s) => s.path === '/api/widget/match/').length === 1 && sent.at(-1).params.slug === 'al-hilal-vs-al-hazem' && settled?.status === 'FT' && settled.hg === 4, JSON.stringify(sent.map((s) => s.path)));
ok('full: …and its details saved after the results', detailCalls().length === 1 && detailCalls()[0].p_details.length === 1 && detailCalls()[0].p_details[0].id === hash53('match:settle01')
  && db.calls.findIndex((c) => c.fn === 'league_ingest') < db.calls.findIndex((c) => c.fn === 'league_ingest_details'));

// الهدافين + تكملة تفاصيل المباريات المنتهية
const S = seasonFor(new Date());
const scorersBody = { sport: 'football', competition: SPL, stat_type: 'goals', scorers: [
  { rank: 1, player: 'Mateo Retegui', team: 'Al Qadsiah', team_slug: 'al-qadsiah', goals: 6, assists: 2, matches: 9, minutes: 707 },
  { rank: 2, player: 'Ollie Watkins', team: 'Al Hilal FC', team_slug: 'al-hilal', goals: 4, assists: 4, matches: 5, minutes: 394 },
] };
reset();
db.matches = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, season: S, kickoff: iso(-60 * 24 * (i + 1)), status: 'FT', source_ref: `al-hilal-vs-al-hazem/back${String(i).padStart(4, '0')}`, details_at: null })),
  { id: 200, season: S, kickoff: iso(-60 * 24 * 2), status: 'FT', source_ref: 'a-vs-b/havedetail', details_at: iso(-60) },
  { id: 201, season: S, kickoff: iso(60 * 24), status: 'NS', source_ref: 'a-vs-b/notplayed', details_at: null },
  { id: 202, season: S - 1, kickoff: iso(-60 * 24 * 300), status: 'FT', source_ref: 'a-vs-b/lastseason', details_at: null },
];
reply = (path, p) => {
  if (path === '/api/widget/topscorers/') return scorersBody;
  if (path === '/api/widget/match/') return realDetail; // لقاء ثاني للزوج: ما يطابق أي مفتاح
  return path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug);
};
r = await call({ mode: 'full' });
const backReqs = sent.filter((s) => s.path === '/api/widget/match/');
ok('full: finished matches without details, newest first, at most 8; never ones with details, unplayed or last season', backReqs.length === 8
  && db.calls.some((c) => c.fn === 'league_matches' && c.args.eq.season === S && c.args.isNull.includes('details_at') && c.args.asc === false), String(backReqs.length));
const dc = detailCalls()[0];
ok('full: a different meeting of the pair is marked as asked (id only)', dc.p_details.length === 8 && dc.p_details.every((d) => Object.keys(d).join() === 'id') && dc.p_details[0].id === 100, JSON.stringify(dc.p_details));
ok('full: top scorers sent with the club from the standings link', dc.p_scorers.length === 2 && dc.p_scorers[0].team === teamId('Al Qadsiah') && dc.p_scorers[1].team === teamId('Al Hilal') && dc.p_season === S, JSON.stringify(dc.p_scorers));
ok('full: response counts details and scorers', r.body.details === 8 && r.body.scorers === 2, JSON.stringify(r.body));

// الهدافين طاحوا والتفاصيل طاحت ← النتائج محفوظة والتشغيل ناجح
reset();
db.detailsError = 'boom';
reply = (path, p) => (path === '/api/widget/topscorers/' ? { __status: 500 } : path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug));
r = await call({ mode: 'full' });
ok('full: top scorers failing → results still saved, no details call needed', r.body.ok === true && ingests().length === 1 && !ingests()[0].p_error && detailCalls().length === 0, JSON.stringify(r.body));

// ---------- live ----------
reset();
db.matches = [
  { id: 10, kickoff: iso(-50), status: '1H', source_ref: 'al-hilal-vs-al-hazem/kkkkkkk7' },
  { id: 11, kickoff: iso(5), status: 'NS', source_ref: 'al-ettifaq-vs-al-ittihad/notyet01' },   // ما بدأت: يرجع لقاء قديم
  { id: 12, kickoff: iso(-30), status: 'FT', source_ref: 'x-vs-y/doneeeee' },                   // خلصت: ما نطلبها
  { id: 13, kickoff: iso(-60 * 8), status: '2H', source_ref: 'p-vs-q/tooold02' },              // أقدم من ٦ ساعات
  { id: 14, kickoff: iso(-20), status: 'NS', source_ref: null },
];
reply = (path, p) => p.slug === 'al-hilal-vs-al-hazem' ? liveBody
  : { sport: 'football', match: mx('Al Ettifaq', 'Al Ittihad', 'oldmeet1', '2026-03-01T18:00:00+00:00', { status: 'finished', home_score: '1', away_score: '2' }) };
r = await call({ mode: 'live' });
ok('live: only unfinished matches around now, one detail request each', sent.length === 2 && sent.map((s) => s.params.slug).join() === 'al-hilal-vs-al-hazem,al-ettifaq-vs-al-ittihad' && sent.every((s) => s.path === '/api/widget/match/'), JSON.stringify(sent.map((s) => s.params.slug)));
const lv = ingests()[0];
ok('live: our match saved with score and minute; an older meeting ignored', lv.p_mode === 'live' && lv.p_matches.length === 1 && lv.p_matches[0].hg === 2 && lv.p_matches[0].elapsed === 63 && lv.p_matches[0].status === '2H' && lv.p_standings.length === 0, JSON.stringify(lv));
ok('live: match id stays the one we stored (same key ← same id)', lv.p_matches[0].id === hash53('match:kkkkkkk7'));
const ld = detailCalls()[0];
ok('live: details for our match, an older meeting marked by id only', ld && ld.p_details.length === 2 && ld.p_details[0].id === hash53('match:kkkkkkk7')
  && ld.p_details[1].id === 11 && Object.keys(ld.p_details[1]).join() === 'id' && ld.p_scorers === null, JSON.stringify(ld));

reset();
db.matches = [{ id: 10, kickoff: iso(-50), status: '1H', source_ref: 'al-hilal-vs-al-hazem/kkkkkkk7' }];
db.detailsError = 'boom';
reply = () => liveBody;
r = await call({ mode: 'live' });
ok('live: a details failure does not fail the run (the score is saved)', r.status === 200 && ingests().length === 1 && !ingests()[0].p_error && r.body.details === 0, JSON.stringify(r.body));

reset();
r = await call({ mode: 'live' });
ok('live: nothing to follow → no request, ingest still marks the run', sent.length === 0 && ingests().length === 1 && ingests()[0].p_matches.length === 0 && !ingests()[0].p_error);

reset();
db.matches = [{ id: 10, kickoff: iso(-50), status: '1H', source_ref: 'al-hilal-vs-al-hazem/kkkkkkk7' }];
reply = () => new Error('connect timeout');
r = await call({ mode: 'live' });
ok('live: provider unreachable for every match → recorded (database backs off)', r.body.ok === false && ingests()[0].p_error === 'live_unreachable' && ingests()[0].p_mode === 'live');

reset();
db.matchesError = 'boom';
r = await call({ mode: 'live' });
ok('live: database read failure → no request, empty run', sent.length === 0 && ingests()[0].p_matches.length === 0);

reset();
r = await call(undefined);
ok('no body → full', sent[0]?.path === '/api/widget/standings/' && ingests()[0].p_mode === 'full');

// ---------- الإعداد ----------
reset();
db.settings = { ...db.settings, season: 2025 };
reply = (path, p) => path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug);
await call({ mode: 'full' });
ok('season comes from the owner setting (and filters matches to it)', ingests()[0].p_season === 2025 && ingests()[0].p_matches.length === 0);
delete db.settings.season;

// ---------- أخطاء ----------
reset();
reply = () => new Error('connect timeout');
await call({ mode: 'full' });
ok('network failure → recorded as network', ingests()[0].p_error === 'network');
reset();
reply = () => ({ __status: 503 });
await call({ mode: 'full' });
ok('still busy after the retry → http_503', ingests()[0].p_error === 'http_503' && sent.length === 2);
reset();
reply = (path, p) => path === '/api/widget/standings/' ? standingsBody : teamReply(p.slug);
db.ingestError = 'deadlock';
r = await call({ mode: 'full' });
ok('database failure → ingest_failed', r.body.ok === false && r.body.error === 'ingest_failed');
ok('…and the failure is recorded (so the database backs off instead of asking every minute)', ingests().length === 2 && ingests()[1].p_error === 'ingest_failed');

if (failed) console.log(`${failed} failed`);
