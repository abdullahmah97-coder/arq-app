// Supabase Edge Function: league-sync
// نتائج الدوري السعودي ومواعيده وترتيبه من API-Football (ترحيل 20261015000960_saudi_league).
// ما يناديها التطبيق: pg_cron كل دقيقة (run_league) يقرر متى نحتاج تحديث ويصحّيها عبر pg_net:
//   live: وقت المباريات (كل live_every_min دقايق): مباريات أمس واليوم وبكرة بطلب واحد ← النتيجة والدقيقة والنهاية
//   full: كل full_every_hours ساعات وبعد نهاية أي مباراة: الموسم كامل + جدول الترتيب (طلبين)
// والنتيجة ترجع للقاعدة بـ league_ingest (هي اللي ترسل إشعار نهاية المباراة).
//
// النشر (بدون تحقق البوابة من التوكن: القاعدة تناديها بدون توكن، والدالة تتأكد من x-league-key بنفسها):
//   supabase functions deploy league-sync --no-verify-jwt
//   السر: API_FOOTBALL_KEY (مفتاح api-football.com / dashboard.api-football.com؛ يضيفه المالك بنفسه، ما ينكتب بالكود)
//   والرابط بالـ vault مرة وحدة: select vault.create_secret('https://<ref>.supabase.co/functions/v1/league-sync', 'league_url');
//
// الطلب: POST {"mode": "full" | "live"} ومعه x-league-key = سر league_key بالـ vault (نتأكد منه بـ rpc league_key_ok).
// الرد: { ok, mode, season, teams, matches, finished } أو { ok: false, error }
//   405 method_not_allowed · 401 unauthorized
// خطأ المزوّد (خطة، مفتاح، حد يومي) ينكتب بـ league_sync.last_error ويشوفه المشرف، والقاعدة تنتظر ١٠ دقايق قبل تعيد.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  API_BASE, apiError, DEFAULT_LEAGUE, liveRange, mergeTeams, parseFixtures, parseStandings, requestsLeft, seasonFor, TIMEZONE,
  type Match, type Standing, type Team,
} from './api.ts';

export { apiError, liveRange, parseFixtures, parseStandings, requestsLeft, seasonFor } from './api.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const FETCH_TIMEOUT_MS = 20_000;

type Got = { body?: unknown; error?: string; left: number | null };

async function get(apiKey: string, path: string, params: Record<string, string | number>): Promise<Got> {
  const url = `${API_BASE}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'x-apisports-key': apiKey }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    console.error('league_fetch_failed', path, e instanceof Error ? e.message : String(e));
    return { error: 'network', left: null };
  }
  const left = requestsLeft(res.headers.get('x-ratelimit-requests-remaining'));
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return { error: `http_${res.status}`, left };
  }
  let body: unknown;
  try { body = await res.json(); } catch { return { error: 'bad_json', left }; }
  const err = apiError(body);
  return err ? { error: err, left } : { body, left };
}

export async function sync(db: SupabaseClient, mode: 'full' | 'live', apiKey: string | undefined, now = new Date()) {
  const { data: row } = await db.from('app_settings').select('value').eq('key', 'league').maybeSingle();
  const s = (row?.value ?? {}) as { league_id?: number; season?: number };
  const league = Number.isInteger(s.league_id) && (s.league_id as number) > 0 ? (s.league_id as number) : DEFAULT_LEAGUE;
  const season = seasonFor(now, s.season);

  const fail = async (error: string, left: number | null) => {
    const { error: e } = await db.rpc('league_ingest', { p_mode: mode, p_season: season, p_error: error, p_left: left });
    if (e) console.error('league_error_record_failed', e.message);
    return { ok: false, mode, season, error };
  };
  if (!apiKey) return fail('API_FOOTBALL_KEY is not set', null);

  let teams: Team[];
  let matches: Match[];
  let standings: Standing[] = [];
  let left: number | null;
  if (mode === 'live') {
    const f = await get(apiKey, '/fixtures', { league, season, ...liveRange(now), timezone: TIMEZONE });
    if (f.error) return fail(f.error, f.left);
    ({ teams, matches } = parseFixtures(f.body, league));
    left = f.left;
  } else {
    const f = await get(apiKey, '/fixtures', { league, season, timezone: TIMEZONE });
    if (f.error) return fail(f.error, f.left);
    const fx = parseFixtures(f.body, league);
    matches = fx.matches;
    teams = fx.teams;
    left = f.left;
    // الترتيب: لو طاح نكمل بالمباريات (الترتيب يتحدث المرة الجاية)
    const st = await get(apiKey, '/standings', { league, season });
    if (st.error) console.error('league_standings_failed', st.error);
    else {
      const ps = parseStandings(st.body);
      teams = mergeTeams(ps.teams, fx.teams);
      standings = ps.standings;
    }
    left = st.left ?? left;
  }

  const { data, error } = await db.rpc('league_ingest', {
    p_mode: mode, p_season: season, p_teams: teams, p_matches: matches, p_standings: standings, p_left: left,
  });
  if (error) {
    // ننكتب الخطأ عشان القاعدة تنتظر ١٠ دقايق (وإلا تطلب من المزوّد كل دقيقة) ويشوفه المشرف
    console.error('league_ingest_failed', error.message);
    return fail('ingest_failed', left);
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
  const work = sync(db, mode, Deno.env.get('API_FOOTBALL_KEY'));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work.catch(() => {}));
  try {
    return json(await work);
  } catch (e) {
    console.error('league_sync_failed', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'failed' }, 500);
  }
});
