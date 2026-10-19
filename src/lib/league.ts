// الدوري السعودي: قراءة المباريات والفرق والترتيب (يكتبها الخادم من SportScore)، و«ذكّرني» و«فريقي»
import { supabase } from './supabase';
import {
  readDetails, readPredSummary, readScorers, type LeagueMatch, type LeagueSettings, type LeagueStanding, type LeagueTeam, type MatchDetails,
  type PredBoardRow, type PredSummary, type Scorer,
} from './leagueCore';

export * from './leagueCore';

export type LeagueData = {
  settings: LeagueSettings;
  season: number | null;
  teams: Map<number, LeagueTeam>;
  matches: LeagueMatch[];
  standings: LeagueStanding[];
};

const MATCH_COLS = 'id, season, round, kickoff, status, elapsed, home_id, away_id, home_goals, away_goals, venue, city';

// نحتفظ بالبيانات دقيقة وحدة (الخادم يحدّثها كل ٥ دقايق وقت المباريات) عشان الرئيسية ما تطلبها كل ما رجعت لها
let cache: { at: number; data: LeagueData } | null = null;
const CACHE_MS = 60_000;

export async function loadLeagueSettings(): Promise<LeagueSettings> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'league').maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    tickets_url: typeof v.tickets_url === 'string' && /^https:\/\/\S+$/.test(v.tickets_url) ? v.tickets_url : null,
    remind_minutes: typeof v.remind_minutes === 'number' ? v.remind_minutes : 60,
  };
}

export async function loadLeague(force = false): Promise<LeagueData> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const settings = await loadLeagueSettings();
  // الموسم المعروض = آخر موسم فيه مباريات
  const { data: last, error: e0 } = await supabase.from('league_matches').select('season').order('season', { ascending: false }).limit(1).maybeSingle();
  if (e0) throw e0;
  const season = (last?.season as number | undefined) ?? null;
  let data: LeagueData = { settings, season, teams: new Map(), matches: [], standings: [] };
  if (season != null) {
    const [t, m, s] = await Promise.all([
      supabase.from('league_teams').select('id, name, name_ar, logo_url'),
      supabase.from('league_matches').select(MATCH_COLS).eq('season', season).order('kickoff', { ascending: true }).limit(1000),
      supabase.from('league_standings').select('*').eq('season', season),
    ]);
    if (t.error) throw t.error;
    if (m.error) throw m.error;
    data = {
      settings, season,
      teams: new Map(((t.data ?? []) as LeagueTeam[]).map((x) => [x.id, x])),
      matches: (m.data ?? []) as LeagueMatch[],
      standings: (s.data ?? []) as LeagueStanding[],
    };
  }
  cache = { at: Date.now(), data };
  return data;
}

export const leagueCached = () => cache?.data ?? null;

/** مباراة وحدة (لصفحة المباراة لو انفتحت من إشعار قبل ما تنحمّل القائمة) */
export async function loadMatch(id: number): Promise<LeagueMatch | null> {
  const { data } = await supabase.from('league_matches').select(MATCH_COLS).eq('id', id).maybeSingle();
  return (data as LeagueMatch | null) ?? null;
}

/** تفاصيل المباراة (الأحداث، الإحصائيات، التشكيلة، نتيجة الشوط الأول): تنطلب لحالها لأنها أثقل من سطر المباراة */
export async function loadMatchDetails(id: number): Promise<MatchDetails> {
  const { data, error } = await supabase.from('league_matches').select('ht_home, ht_away, events, stats, lineups').eq('id', id).maybeSingle();
  if (error) throw error;
  return readDetails(data);
}

// أسماء اللاعبين بالعربي (league_players، يكتبها الخادم من Wikidata أو Claude). نحتفظ باللي لقيناه، واللي ما لقيناه نعيد نسأل عنه بعد ٥ دقايق
const arNames = new Map<string, string>();
const missingAt = new Map<string, number>();
export async function loadPlayerNames(names: string[]): Promise<ReadonlyMap<string, string>> {
  const now = Date.now();
  const want = [...new Set(names.filter((n) => typeof n === 'string' && n.trim()))]
    .filter((n) => !arNames.has(n) && now - (missingAt.get(n) ?? 0) > 5 * 60_000).slice(0, 300);
  if (want.length) {
    const { data, error } = await supabase.rpc('league_player_names', { p_names: want });
    if (!error && data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (typeof v === 'string' && v.trim()) arNames.set(k, v.trim());
    }
    for (const n of want) if (!arNames.has(n)) missingAt.set(n, now);
  }
  return new Map(arNames);
}

// الهدافين: تتحدث مع التحديث الكامل (كل ٣ ساعات)، فنحتفظ فيها ٥ دقايق
let scorersCache: { season: number; at: number; list: Scorer[] } | null = null;
export async function loadScorers(season: number, force = false): Promise<Scorer[]> {
  if (!force && scorersCache && scorersCache.season === season && Date.now() - scorersCache.at < 5 * 60_000) return scorersCache.list;
  const { data, error } = await supabase.from('league_leaders').select('scorers').eq('season', season).maybeSingle();
  if (error) throw error;
  const list = readScorers(data?.scorers);
  scorersCache = { season, at: Date.now(), list };
  return list;
}

// ---------- التوقعات ----------
/** يحفظ أو يعدّل توقعي (قبل البداية بس؛ القاعدة ترفض بعدها بـ locked) */
export async function predict(matchId: number, home: number, away: number): Promise<void> {
  const { error } = await supabase.rpc('league_predict', { p_match: matchId, p_home: home, p_away: away });
  if (error) throw error;
}

/** توقعات الجمهور، توقعي ونقاطي، وأصدقائي (نتايجهم تنكشف مع البداية) */
export async function loadPredSummary(matchId: number): Promise<PredSummary | null> {
  const { data, error } = await supabase.rpc('league_pred_summary', { p_match: matchId });
  if (error) throw error;
  return readPredSummary(data);
}

/** ترتيب التوقعات: أصدقائي، أو الكل (اللي اختاروا يظهرون + أصدقائي) */
export async function loadPredBoard(scope: 'friends' | 'all'): Promise<PredBoardRow[]> {
  const { data, error } = await supabase.rpc('league_pred_board', { p_scope: scope, p_season: null, p_limit: 100 });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    user_id: String(r.user_id), username: (r.username as string) ?? null, full_name: (r.full_name as string) ?? null, avatar_url: (r.avatar_url as string) ?? null,
    points: Number(r.points) || 0, exact: Number(r.exact) || 0, outcome: Number(r.outcome) || 0, played: Number(r.played) || 0, rank: Number(r.rank) || 0,
  }));
}

/** توقعاتي كلها (رقم المباراة ← النتيجة) */
export async function myPredictions(userId: string): Promise<Map<number, { home: number; away: number }>> {
  const { data, error } = await supabase.from('league_predictions').select('match_id, home, away').eq('user_id', userId).limit(1000);
  if (error) throw error;
  return new Map(((data ?? []) as { match_id: number; home: number; away: number }[]).map((r) => [Number(r.match_id), { home: r.home, away: r.away }]));
}

/** ينشر توقعي في التايم لاين (لأصدقائي) ← رقم المنشور */
export async function sharePrediction(matchId: number): Promise<string> {
  const { data, error } = await supabase.rpc('league_share_prediction', { p_match: matchId });
  if (error) throw error;
  return String(data);
}

export type PostPrediction = {
  match: number; kickoff: string; status: string; home_goals: number | null; away_goals: number | null;
  home_id: number; away_id: number; home_name: string; home_ar: string | null; home_logo: string | null;
  away_name: string; away_ar: string | null; away_logo: string | null; pred_home: number; pred_away: number; points: number | null;
};
const postPredCache = new Map<string, { at: number; v: PostPrediction | null }>();
/** بطاقة منشور التوقع في التايم لاين (نحتفظ فيها دقيقة) */
export async function loadPostPrediction(postId: string): Promise<PostPrediction | null> {
  const hit = postPredCache.get(postId);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const { data, error } = await supabase.rpc('league_post_prediction', { p_post: postId });
  if (error) throw error;
  const v = data && typeof data === 'object' ? (data as PostPrediction) : null;
  postPredCache.set(postId, { at: Date.now(), v });
  return v;
}

// ---------- ذكّرني ----------
export async function myReminders(): Promise<Set<number>> {
  const { data } = await supabase.from('league_reminders').select('match_id');
  return new Set(((data ?? []) as { match_id: number }[]).map((r) => r.match_id));
}

/** يشغّل أو يطفي التذكير (إشعار قبل المباراة وبالنتيجة بعدها). القاعدة ترفض مباراة بدأت */
export async function setReminder(matchId: number, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase.from('league_reminders').insert({ match_id: matchId });
    if (error && error.code !== '23505') throw error; // موجود من قبل = تمام
  } else {
    const { error } = await supabase.from('league_reminders').delete().eq('match_id', matchId);
    if (error) throw error;
  }
}

// ---------- فريقي ----------
/** فريقي (null = بدون فريق). يرمي خطأ لو ما قدر يقرأ، عشان ما نعامل «ما ندري» كأنه «بدون فريق» */
export async function myTeam(): Promise<number | null> {
  const { data, error } = await supabase.from('league_fans').select('team_id').maybeSingle();
  if (error) throw error;
  return (data?.team_id as number | undefined) ?? null;
}

/** فريق واحد: تذكير بكل مبارياته ونتيجتها. null = بدون فريق */
export async function setMyTeam(userId: string, teamId: number | null): Promise<void> {
  if (teamId == null) {
    const { error } = await supabase.from('league_fans').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('league_fans').upsert({ user_id: userId, team_id: teamId }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** فريقي + تذكير التوقع (قبل مبارياته بثلاث ساعات لو ما توقعت). بدون فريق = ما فيه تذكير توقع */
export type FanPrefs = { team: number | null; predRemind: boolean };
export async function myFanPrefs(): Promise<FanPrefs> {
  const { data, error } = await supabase.from('league_fans').select('team_id, pred_remind').maybeSingle();
  if (error) throw error;
  return { team: (data?.team_id as number | undefined) ?? null, predRemind: data?.pred_remind !== false };
}

export async function setPredRemind(userId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('league_fans').update({ pred_remind: on }).eq('user_id', userId);
  if (error) throw error;
}

// ---------- لوحة إدارة التطبيق ----------
export type LeagueAdminStatus = {
  settings: { enabled: boolean; league_id: number; remind_minutes: number; live_every_min: number; full_every_hours: number; tickets_url: string; season?: number };
  server_ready: boolean; season: number | null; last_ok_at: string | null; last_full_at: string | null; last_live_at: string | null;
  last_error: string | null; last_error_at: string | null; requests_left: number | null;
  teams: number; matches: number; reminders: number; fans: number;
};

export async function adminLeagueStatus(): Promise<LeagueAdminStatus> {
  const { data, error } = await supabase.rpc('admin_league_status');
  if (error) throw error;
  return data as LeagueAdminStatus;
}

/** المالك بس (القاعدة ترفض غيره وتتحقق من القيم) */
export async function saveLeagueSettings(v: LeagueAdminStatus['settings']): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key: 'league', value: v });
  if (error) throw error;
  cache = null;
}
