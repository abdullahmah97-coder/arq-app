// Supabase Edge Function: league-sync
// نتائج الدوري السعودي ومواعيده وترتيبه من SportScore (مجاني بدون مفتاح؛ الشروط تطلب «Powered by SportScore» في التطبيق).
// ما يناديها التطبيق: pg_cron كل دقيقة (run_league) يقرر متى نحتاج تحديث ويصحّيها عبر pg_net:
//   live: وقت المباريات (كل live_every_min دقايق): كل مباراة بدأت أو تبدأ الحين نطلب تفاصيلها ← النتيجة والدقيقة والنهاية
//   full: كل full_every_hours ساعات وبعد نهاية أي مباراة: الترتيب + جدول كل نادي (١٩ طلب بالتتابع) + الهدافين،
//         وبعدها نقفل نتائج المباريات اللي موعدها فات وما وصلتنا نهايتها (لين ١٢ طلب)،
//         ونكمّل تفاصيل المباريات المنتهية اللي ما عندنا تفاصيلها (لين ٨ طلبات، الأحدث أول)
// والنتيجة ترجع للقاعدة بـ league_ingest (هي اللي ترسل إشعار نهاية المباراة)، والتفاصيل (الأحداث والإحصائيات
// والتشكيلة ونتيجة الشوط الأول) والهدافين بـ league_ingest_details.
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
  parseTeamMatches, parseTopScorers, seasonFor, splitRef, USER_AGENT, type Detail, type Match, type Scorer, type Standing, type Team,
} from './api.ts';

export {
  apiError, eventKind, hash53, isLeague, matchRef, mergeMatches, minuteOf, parseEvents, parseLineups, parseMatchDetail, parseStandings,
  parseStats, parseTeamMatches, parseTopScorers, seasonFor, seasonWindow, splitRef, statusCode, teamId,
} from './api.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const FETCH_TIMEOUT_MS = 15_000;
/** فاصل بين الطلبات (المزوّد يرد 503 لو تتابعت بسرعة) */
export const GAP_MS = 350;
export const RETRY_MS = 2_000;
/** أقصى عدد مباريات نقفل نتيجتها بطلبات تفاصيل في التحديث الكامل */
export const SETTLE_MAX = 12;
/** أقصى عدد مباريات منتهية نكمّل تفاصيلها في التحديث الكامل */
export const BACKFILL_MAX = 8;
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

/** مباريات منتهية هالموسم ما طلبنا تفاصيلها للحين (الأحدث أول: الرابط يرجع آخر لقاء للزوج) */
async function detailsTodo(db: SupabaseClient, season: number, skip: Set<number>) {
  const { data, error } = await db.from('league_matches')
    .select('id, kickoff, status, source_ref')
    .eq('season', season)
    .in('status', DONE)
    .is('details_at', null)
    .not('source_ref', 'is', null)
    .order('kickoff', { ascending: false })
    .limit(BACKFILL_MAX + skip.size);
  if (error) {
    console.error('league_details_todo_failed', error.message);
    return [];
  }
  return ((data ?? []) as { id: number; source_ref: string }[]).filter((m) => !skip.has(m.id)).slice(0, BACKFILL_MAX);
}

/** تفاصيل مباريات معروفة (بالتتابع)، ونقبل بس اللي معرّفها يطابق. اللي طلع لقاء ثاني للزوج نسجله «طلبناها» بدون تفاصيل */
async function details(rows: { id: number; source_ref: string }[], season: number, league: number) {
  const teams: Team[] = [];
  const matches: Match[] = [];
  const found: Detail[] = [];
  let failed = 0;
  for (const [i, row] of rows.entries()) {
    const r = splitRef(row.source_ref);
    if (!r) continue;
    if (i > 0) await pause(GAP_MS);
    const g = await get('/match/', { sport: 'football', slug: r.slug });
    if (g.error) { failed++; continue; }
    const got = parseMatchDetail(g.body, r.key, season, league);
    if (got) { teams.push(...got.teams); matches.push(got.match); found.push(got.detail); }
    else if (Number.isSafeInteger(row.id)) found.push({ id: row.id });
  }
  return { teams, matches, details: found, failed };
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
  let extra: Detail[] = [];
  let scorers: Scorer[] | null = null;
  if (mode === 'live') {
    const rows = await liveCandidates(db, now, 6 * 3600e3, 10 * 60e3, 15);
    if (rows.length) {
      const d = await details(rows, season, league);
      if (d.failed === rows.length) return fail('live_unreachable');
      ({ teams, matches } = d);
      extra = d.details;
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
    // الهدافين (لو طاح الطلب نكمل بدونهم)
    await pause(GAP_MS);
    const ts = await get('/topscorers/', { sport: 'football', slug: COMPETITION_SLUG });
    if (!ts.error) {
      const list = parseTopScorers(ts.body, ps.slugTeam, new Set(teams.map((t) => t.id)));
      if (list.length) scorers = list;
    }
    // مباريات فات موعدها بأكثر من ساعتين (لين ٧ أيام) وما وصلتنا نهايتها من الجداول ← نطلب تفاصيلها
    const got = new Map(matches.map((m) => [m.id, m]));
    const stale = (await liveCandidates(db, now, 7 * 86400e3, -2 * 3600e3, 50))
      .filter((r) => { const m = got.get(r.id); return !m || !DONE.includes(m.status); })
      .slice(0, SETTLE_MAX);
    // ومباريات منتهية ما عندنا تفاصيلها
    const todo = await detailsTodo(db, season, new Set(stale.map((r) => r.id)));
    const rows = [...stale, ...todo];
    if (rows.length) {
      await pause(GAP_MS);
      const d = await details(rows, season, league);
      matches = mergeMatches(matches, d.matches);
      teams = mergeTeams(teams, d.teams);
      extra = d.details;
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
  // التفاصيل والهدافين بعد ما تنحفظ المباريات (خطأها ما يوقف شي: النتائج انحفظت)
  let saved = 0;
  if (extra.length || scorers) {
    const { data: dd, error: de } = await db.rpc('league_ingest_details', { p_season: season, p_details: extra, p_scorers: scorers });
    if (de) console.error('league_details_failed', de.message);
    else saved = Number((dd as { details?: number } | null)?.details ?? 0);
  }
  return { mode, season, ...(data as object), details: saved, scorers: scorers?.length ?? 0 };
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
