// Supabase Edge Function: league-sync
// نتائج الدوري السعودي ومواعيده وترتيبه من SportScore (مجاني بدون مفتاح؛ الشروط تطلب «Powered by SportScore» في التطبيق).
// ما يناديها التطبيق: pg_cron كل دقيقة (run_league) يقرر متى نحتاج تحديث ويصحّيها عبر pg_net:
//   live: وقت المباريات (كل live_every_min دقايق): كل مباراة بدأت أو تبدأ الحين نطلب تفاصيلها ← النتيجة والدقيقة والنهاية
//   full: كل full_every_hours ساعات وبعد نهاية أي مباراة: الترتيب + جدول كل نادي (١٩ طلب بالتتابع)،
//         وبعدها نقفل نتائج المباريات اللي موعدها فات وما وصلتنا نهايتها (لين ١٢ طلب)
// والنتيجة ترجع للقاعدة بـ league_ingest (هي اللي ترسل إشعار نهاية المباراة).
//
// النشر (بدون تحقق البوابة من التوكن: القاعدة تناديها بدون توكن، والدالة تتأكد من x-league-key بنفسها):
//   supabase functions deploy league-sync --no-verify-jwt
//   والرابط بالـ vault مرة وحدة: select vault.create_secret('https://<ref>.supabase.co/functions/v1/league-sync', 'league_url');
//
// الطلب: POST {"mode": "full" | "live"} ومعه x-league-key = سر league_key بالـ vault (نتأكد منه بـ rpc league_key_ok).
// الرد: { ok, mode, season, teams, matches, finished } أو { ok: false, error }
//   405 method_not_allowed · 401 unauthorized
// خطأ المزوّد ينكتب بـ league_sync.last_error ويشوفه المشرف، والقاعدة تنتظر ١٠ دقايق قبل تعيد.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  API_BASE, apiError, COMPETITION_SLUG, DEFAULT_LEAGUE, mergeMatches, mergeTeams, parseMatchDetail, parseStandings,
  parseTeamMatches, seasonFor, splitRef, USER_AGENT, type Match, type Standing, type Team,
} from './api.ts';

export {
  apiError, hash53, isLeague, matchRef, mergeMatches, minuteOf, parseMatchDetail, parseStandings, parseTeamMatches,
  seasonFor, seasonWindow, splitRef, statusCode, teamId,
} from './api.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const FETCH_TIMEOUT_MS = 15_000;
/** فاصل بين الطلبات (المزوّد يرد 503 لو تتابعت بسرعة) */
export const GAP_MS = 350;
export const RETRY_MS = 2_000;
/** أقصى عدد مباريات نقفل نتيجتها بطلبات تفاصيل في التحديث الكامل */
export const SETTLE_MAX = 12;
const DONE = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const OFF = ['PST', 'CANC', 'ABD'];

type Got = { body?: unknown; error?: string };
let pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** للاختبار: بدون انتظار حقيقي */
export function setPause(fn: (ms: number) => Promise<void>) { pause = fn; }

async function get(path: string, params: Record<string, string | number>): Promise<Got> {
  const url = `${API_BASE}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (e) {
      console.error('league_fetch_failed', path, e instanceof Error ? e.message : String(e));
      return { error: 'network' };
    }
    // ضغط مؤقت: نعيد مرة وحدة بعد ثانيتين
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      await res.body?.cancel().catch(() => {});
      await pause(RETRY_MS);
      continue;
    }
    let body: unknown = null;
    try { body = await res.json(); } catch { /* مو JSON */ }
    if (!res.ok) return { error: apiError(body) ?? `http_${res.status}` };
    if (body == null || typeof body !== 'object') return { error: 'bad_json' };
    const err = apiError(body);
    return err ? { error: err } : { body };
  }
}

/** المباريات اللي تحتاج متابعة مباشرة: بدأت قبل أقل من ٦ ساعات أو تبدأ خلال ١٠ دقايق، وما انتهت */
async function liveCandidates(db: SupabaseClient, now: Date, from: number, to: number, limit: number) {
  const { data, error } = await db.from('league_matches')
    .select('id, kickoff, status, source_ref')
    .gte('kickoff', new Date(now.getTime() - from).toISOString())
    .lte('kickoff', new Date(now.getTime() + to).toISOString())
    .not('source_ref', 'is', null)
    .order('kickoff', { ascending: true })
    .limit(50);
  if (error) {
    console.error('league_candidates_failed', error.message);
    return [];
  }
  return ((data ?? []) as { id: number; kickoff: string; status: string; source_ref: string }[])
    .filter((m) => !DONE.includes(m.status) && !OFF.includes(m.status))
    .slice(0, limit);
}

/** تفاصيل مباريات معروفة (بالتتابع)، ونقبل بس اللي معرّفها يطابق */
async function details(rows: { source_ref: string }[], season: number, league: number) {
  const teams: Team[] = [];
  const matches: Match[] = [];
  let failed = 0;
  for (const [i, row] of rows.entries()) {
    const r = splitRef(row.source_ref);
    if (!r) continue;
    if (i > 0) await pause(GAP_MS);
    const g = await get('/match/', { sport: 'football', slug: r.slug });
    if (g.error) { failed++; continue; }
    const got = parseMatchDetail(g.body, r.key, season, league);
    if (got) { teams.push(...got.teams); matches.push(got.match); }
  }
  return { teams, matches, failed };
}

export async function sync(db: SupabaseClient, mode: 'full' | 'live', now = new Date()) {
  const { data: row } = await db.from('app_settings').select('value').eq('key', 'league').maybeSingle();
  const s = (row?.value ?? {}) as { league_id?: number; season?: number };
  const league = Number.isInteger(s.league_id) && (s.league_id as number) > 0 ? (s.league_id as number) : DEFAULT_LEAGUE;
  const season = seasonFor(now, s.season);

  const fail = async (error: string) => {
    const { error: e } = await db.rpc('league_ingest', { p_mode: mode, p_season: season, p_error: error, p_left: null });
    if (e) console.error('league_error_record_failed', e.message);
    return { ok: false, mode, season, error };
  };

  let teams: Team[] = [];
  let matches: Match[] = [];
  let standings: Standing[] = [];
  if (mode === 'live') {
    const rows = await liveCandidates(db, now, 6 * 3600e3, 10 * 60e3, 15);
    if (rows.length) {
      const d = await details(rows, season, league);
      if (d.failed === rows.length) return fail('live_unreachable');
      ({ teams, matches } = d);
    }
  } else {
    const st = await get('/standings/', { sport: 'football', slug: COMPETITION_SLUG });
    if (st.error) return fail(st.error);
    const ps = parseStandings(st.body);
    if (!ps.slugs.length) return fail('no_standings');
    standings = ps.standings;
    const lists: Match[][] = [];
    const found: Team[][] = [ps.teams];
    let failed = 0;
    for (const slug of ps.slugs) {
      await pause(GAP_MS);
      const g = await get('/team/', { sport: 'football', slug, limit: 30 });
      if (g.error) { failed++; continue; }
      const tm = parseTeamMatches(g.body, season, league);
      lists.push(tm.matches);
      found.push(tm.teams);
    }
    if (failed === ps.slugs.length) return fail('teams_unreachable');
    matches = mergeMatches(...lists);
    teams = mergeTeams(...found.slice(1), ps.teams); // أسماء الترتيب تغلب
    // مباريات فات موعدها بأكثر من ساعتين (لين ٧ أيام) وما وصلتنا نهايتها من الجداول ← نطلب تفاصيلها
    const got = new Map(matches.map((m) => [m.id, m]));
    const stale = (await liveCandidates(db, now, 7 * 86400e3, -2 * 3600e3, 50))
      .filter((r) => { const m = got.get(r.id); return !m || !DONE.includes(m.status); })
      .slice(0, SETTLE_MAX);
    if (stale.length) {
      await pause(GAP_MS);
      const d = await details(stale, season, league);
      matches = mergeMatches(matches, d.matches);
      teams = mergeTeams(teams, d.teams);
    }
  }

  const { data, error } = await db.rpc('league_ingest', {
    p_mode: mode, p_season: season, p_teams: teams, p_matches: matches, p_standings: standings, p_left: null,
  });
  if (error) {
    // ننكتب الخطأ عشان القاعدة تنتظر ١٠ دقايق (وإلا تطلب من المزوّد كل دقيقة) ويشوفه المشرف
    console.error('league_ingest_failed', error.message);
    return fail('ingest_failed');
  }
  return { mode, season, ...(data as object) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const key = req.headers.get('x-league-key') ?? '';
  if (!key || key.length > 500) return json({ error: 'unauthorized' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: ok, error } = await db.rpc('league_key_ok', { p_key: key });
  if (error || ok !== true) return json({ error: 'unauthorized' }, 401);

  let mode: 'full' | 'live' = 'full';
  try {
    const b = await req.json();
    if (b && typeof b === 'object' && (b as { mode?: unknown }).mode === 'live') mode = 'live';
  } catch { /* بدون جسم = full */ }

  // القاعدة تقطع الاتصال بعد ثانية، فالشغل يتسجّل بـ waitUntil ويكمل لحاله
  const work = sync(db, mode);
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work.catch(() => {}));
  try {
    return json(await work);
  } catch (e) {
    console.error('league_sync_failed', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'failed' }, 500);
  }
});
