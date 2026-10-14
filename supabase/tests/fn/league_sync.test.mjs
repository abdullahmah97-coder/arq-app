// اختبار دالة league-sync بدون إنترنت: المفتاح، الموسم، طلبات API-Football، القراءة، والأخطاء
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 supabase/functions/league-sync/index.ts --bundle --format=esm --platform=node \
//     --alias:npm:@supabase/supabase-js@2=./supabase/tests/fn/supabase-mock-league.mjs --outfile=node_modules/.cache/fn/league_sync.bundle.mjs
//   node supabase/tests/fn/league_sync.test.mjs
import { db } from './supabase-mock-league.mjs';

let handler;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', API_FOOTBALL_KEY: 'af_test' };
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };

// API-Football: كل طلب يسجّل، والرد من دالة نغيّرها لكل اختبار
const sent = [];
let reply = () => ({ errors: [], response: [] });
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  sent.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers });
  const r = reply(u.pathname, Object.fromEntries(u.searchParams));
  if (r instanceof Error) throw r;
  if (r && r.__status) return new Response('oops', { status: r.__status, headers: { 'x-ratelimit-requests-remaining': '7' } });
  return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json', 'x-ratelimit-requests-remaining': r.__left ?? '7490' } });
};

const mod = await import('../../../node_modules/.cache/fn/league_sync.bundle.mjs');
const { seasonFor, liveRange, apiError, requestsLeft, parseFixtures, parseStandings } = mod;

let failed = 0;
const ok = (label, c, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', label, c ? '' : extra); if (!c) { failed++; process.exitCode = 1; } };
const call = async (body = { mode: 'full' }, headers = { 'x-league-key': db.key }, method = 'POST') => {
  const res = await handler(new Request('https://fn/league-sync', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: await res.json() };
};
const reset = () => { sent.length = 0; db.calls.length = 0; db.ingestError = null; db.keyError = null; };
const ingests = () => db.calls.filter((c) => c.fn === 'league_ingest').map((c) => c.args);

const fx = (id, home, away, extra = {}) => ({
  fixture: { id, date: '2026-10-16T21:00:00+03:00', status: { short: 'NS', elapsed: null }, venue: { name: 'Kingdom Arena', city: 'Riyadh' }, ...extra.fixture },
  league: { id: 307, season: 2026, round: 'Regular Season - 8', ...extra.league },
  teams: { home: { id: home, name: home === 2932 ? 'Al-Hilal Saudi FC' : 'Al-Nassr', logo: `https://media.api-sports.io/football/teams/${home}.png` },
           away: { id: away, name: away === 2939 ? 'Al-Nassr' : 'Al-Ittihad FC', logo: 'javascript:alert(1)' } },
  goals: { home: null, away: null, ...extra.goals },
});
const standing = (team, rank, points) => ({ rank, team: { id: team, name: 'T' + team, logo: null }, points, form: 'wwdlw',
  all: { played: 8, win: 5, draw: 2, lose: 1, goals: { for: 15, against: 6 } } });

// ---------- منطق بحت ----------
ok('season: October 2026 → 2026', seasonFor(new Date('2026-10-14T12:00:00Z')) === 2026);
ok('season: March 2027 → 2026 (same season)', seasonFor(new Date('2027-03-01T12:00:00Z')) === 2026);
ok('season: July 2027 → 2027 (new season)', seasonFor(new Date('2027-07-01T00:00:00Z')) === 2027);
ok('season: 30 June 23:30 UTC is already July in Riyadh', seasonFor(new Date('2027-06-30T23:30:00Z')) === 2027);
ok('season: owner override wins', seasonFor(new Date('2026-10-14T12:00:00Z'), 2025) === 2025);
ok('season: junk override ignored', seasonFor(new Date('2026-10-14T12:00:00Z'), 'x') === 2026 && seasonFor(new Date('2026-10-14T12:00:00Z'), 1999) === 2026 && seasonFor(new Date('2026-10-14T12:00:00Z'), null) === 2026);
const lr = liveRange(new Date('2026-10-14T22:30:00Z')); // ١:٣٠ الفجر ١٥ أكتوبر بالرياض
ok('live range: yesterday to tomorrow in Riyadh', lr.from === '2026-10-14' && lr.to === '2026-10-16', JSON.stringify(lr));
ok('api error: empty array / object = none', apiError({ errors: [] }) === null && apiError({ errors: {} }) === null && apiError({}) === null);
ok('api error: plan message', apiError({ errors: { plan: 'Free plans do not have access to this season, try from 2021 to 2023.' } }).startsWith('Free plans'));
ok('api error: token message', apiError({ errors: { token: 'Error/Missing application key.' } }) === 'Error/Missing application key.');
ok('api error: long text is cut to 300', apiError({ errors: { x: 'a'.repeat(500) } }).length === 300);
ok('requests left header', requestsLeft('42') === 42 && requestsLeft(null) === null && requestsLeft('abc') === null);

const p = parseFixtures({ response: [
  fx(1, 2932, 2939, { fixture: { status: { short: '2H', elapsed: 63 } }, goals: { home: 2, away: 1 } }),
  fx(2, 2932, 2932),                                    // نفس الفريق
  fx(3, 2932, 2939, { league: { id: 308 } }),           // دوري ثاني
  { fixture: { id: 4 } },                               // ناقصة
  fx(5, 2939, 2938, { fixture: { date: 'not a date' } }),
  fx(6, 2939, 2938, { fixture: { status: { short: 'ns<>' } }, goals: { home: 300 } }),
] }, 307);
ok('fixtures: only valid matches of our league', p.matches.map((m) => m.id).join() === '1,6', p.matches.map((m) => m.id).join());
const m1 = p.matches[0];
ok('fixtures: score, minute, status, kickoff in UTC', m1.status === '2H' && m1.elapsed === 63 && m1.hg === 2 && m1.ag === 1 && m1.kickoff === '2026-10-16T18:00:00.000Z' && m1.venue === 'Kingdom Arena' && m1.round === 'Regular Season - 8' && m1.season === 2026 && m1.league === 307, JSON.stringify(m1));
ok('fixtures: junk status → TBD, impossible goals → null', p.matches[1].status === 'TBD' && p.matches[1].hg === null);
ok('fixtures: teams collected once, only https logos', p.teams.length === 3 && p.teams.find((t) => t.id === 2932).logo.startsWith('https://') && p.teams.find((t) => t.id === 2938).logo === null, JSON.stringify(p.teams));
ok('fixtures: junk body → nothing', parseFixtures(null, 307).matches.length === 0 && parseFixtures({ response: 'x' }, 307).matches.length === 0);
const ps = parseStandings({ response: [{ league: { standings: [[standing(2932, 1, 22), standing(2939, 2, 19), standing(2932, 3, 1), { rank: 99, team: { id: 5 } }]] } }] });
ok('standings: rows, form upper-cased, duplicates and bad ranks skipped', ps.standings.length === 2 && ps.standings[0].form === 'WWDLW' && ps.standings[0].gf === 15 && ps.standings[1].points === 19, JSON.stringify(ps.standings));
ok('standings: junk body → nothing', parseStandings({ response: [] }).standings.length === 0 && parseStandings(undefined).standings.length === 0);

// ---------- الدخول ----------
reset();
ok('GET → 405', (await call(undefined, {}, 'GET')).status === 405);
ok('no key → 401 (no database call)', (await call(undefined, {})).status === 401 && db.calls.length === 0);
ok('wrong key → 401', (await call({ mode: 'full' }, { 'x-league-key': 'nope' })).status === 401);
db.keyError = 'boom';
ok('key check error → 401', (await call()).status === 401);
db.keyError = null;
reset();
ok('oversized key → 401 without asking the database', (await call({ mode: 'full' }, { 'x-league-key': 'k'.repeat(501) })).status === 401 && db.calls.length === 0 && sent.length === 0);

// ---------- بدون مفتاح المزوّد ----------
delete env.API_FOOTBALL_KEY;
reset();
let r = await call();
ok('no API_FOOTBALL_KEY → error recorded for the admin, no request', r.body.ok === false && sent.length === 0 && ingests()[0]?.p_error === 'API_FOOTBALL_KEY is not set', JSON.stringify(r.body));
env.API_FOOTBALL_KEY = 'af_test';

// ---------- full ----------
reset();
reply = (path) => path === '/fixtures'
  ? { errors: [], response: [fx(11, 2932, 2939), fx(12, 2939, 2938, { fixture: { status: { short: 'FT', elapsed: 90 } }, goals: { home: 0, away: 3 } })] }
  : { errors: [], response: [{ league: { standings: [[standing(2932, 1, 22), standing(2939, 2, 19), standing(2938, 3, 17)]] } }], __left: '7480' };
r = await call({ mode: 'full' });
ok('full: two requests (season fixtures + standings)', sent.length === 2 && sent[0].path === '/fixtures' && sent[1].path === '/standings', JSON.stringify(sent.map((s) => s.path)));
ok('full: key header, league 307, season 2026, Riyadh time', sent[0].headers['x-apisports-key'] === 'af_test' && sent[0].params.league === '307' && sent[0].params.season === String(seasonFor(new Date())) && sent[0].params.timezone === 'Asia/Riyadh' && !sent[0].params.from);
const g = ingests()[0];
ok('full: ingest gets teams, matches, standings and requests left', g.p_mode === 'full' && g.p_matches.length === 2 && g.p_standings.length === 3 && g.p_teams.length === 3 && g.p_left === 7480 && !g.p_error, JSON.stringify({ ...g, p_matches: g.p_matches.length }));
ok('full: response summarises', r.status === 200 && r.body.ok === true && r.body.mode === 'full' && r.body.matches === 2, JSON.stringify(r.body));
ok('the API key never reaches the database', !JSON.stringify(db.calls).includes('af_test'));

// standings طاح ← نكمل بالمباريات
reset();
reply = (path) => path === '/fixtures' ? { errors: [], response: [fx(11, 2932, 2939)] } : { __status: 500 };
r = await call({ mode: 'full' });
ok('full: standings failure still saves the matches', ingests().length === 1 && !ingests()[0].p_error && ingests()[0].p_matches.length === 1 && ingests()[0].p_standings.length === 0 && ingests()[0].p_left === 7);

// ---------- live ----------
reset();
reply = () => ({ errors: [], response: [fx(11, 2932, 2939, { fixture: { status: { short: '1H', elapsed: 12 } }, goals: { home: 1, away: 0 } })] });
r = await call({ mode: 'live' });
ok('live: one request, dates around today', sent.length === 1 && sent[0].path === '/fixtures' && /^\d{4}-\d{2}-\d{2}$/.test(sent[0].params.from) && /^\d{4}-\d{2}-\d{2}$/.test(sent[0].params.to) && sent[0].params.league === '307');
ok('live: ingest in live mode with the score', ingests()[0].p_mode === 'live' && ingests()[0].p_matches[0].hg === 1 && ingests()[0].p_matches[0].elapsed === 12 && ingests()[0].p_standings.length === 0);
reset();
r = await call(undefined);
ok('no body → full', sent.length === 2 && ingests()[0].p_mode === 'full');

// ---------- الإعداد ----------
reset();
db.settings = { ...db.settings, league_id: 308, season: 2025 };
await call({ mode: 'live' });
ok('league and season come from the owner setting', sent[0].params.league === '308' && sent[0].params.season === '2025' && ingests()[0].p_season === 2025);
db.settings = { ...db.settings, league_id: 307 };
delete db.settings.season;

// ---------- أخطاء المزوّد ----------
reset();
reply = () => ({ errors: { plan: 'Free plans do not have access to this season, try from 2021 to 2023.' }, response: [], __left: '95' });
r = await call({ mode: 'full' });
ok('plan error: recorded with requests left, standings not requested', r.body.ok === false && sent.length === 1 && ingests()[0].p_error.startsWith('Free plans') && ingests()[0].p_left === 95, JSON.stringify(ingests()[0]));
reset();
reply = () => ({ __status: 429 });
r = await call({ mode: 'live' });
ok('HTTP 429 → recorded as http_429', ingests()[0].p_error === 'http_429' && ingests()[0].p_mode === 'live');
reset();
reply = () => new Error('connect timeout');
r = await call({ mode: 'live' });
ok('network failure → recorded as network', ingests()[0].p_error === 'network');
reset();
reply = () => ({ errors: [], response: [] });
db.ingestError = 'deadlock';
r = await call({ mode: 'live' });
ok('database failure → ingest_failed', r.body.ok === false && r.body.error === 'ingest_failed');

if (failed) console.log(`${failed} failed`);
