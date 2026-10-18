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
} = mod;
const waits = [];
setPause(async (ms) => { waits.push(ms); });

let failed = 0;
const ok = (label, c, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', label, c ? '' : extra); if (!c) { failed++; process.exitCode = 1; } };
const call = async (body = { mode: 'full' }, headers = { 'x-league-key': db.key }, method = 'POST') => {
  const res = await handler(new Request('https://fn/league-sync', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: await res.json() };
};
const reset = () => { sent.length = 0; waits.length = 0; db.calls.length = 0; db.ingestError = null; db.keyError = null; db.matches = []; db.matchesError = null; };
const ingests = () => db.calls.filter((c) => c.fn === 'league_ingest').map((c) => c.args);
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
ok('full: standings then each club, in order, no API key anywhere', sent.length === 4 && sent[0].path === '/api/widget/standings/' && sent[0].params.slug === 'saudi-professional-league'
  && sent.slice(1).map((s) => s.params.slug).join() === 'al-qadsiah,al-hilal,al-nassr' && sent.slice(1).every((s) => s.path === '/api/widget/team/' && s.params.limit === '30'), JSON.stringify(sent.map((s) => s.path + '?' + s.params.slug)));
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
ok('full: a 503 is retried once after a pause', sent.length === 5 && waits.includes(2000) && ingests()[0].p_matches.length === 2 && !ingests()[0].p_error);

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
