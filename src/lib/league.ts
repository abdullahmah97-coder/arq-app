// الدوري السعودي: قراءة المباريات والفرق والترتيب (يكتبها الخادم من SportScore)، و«ذكّرني» و«فريقي»
import { supabase } from './supabase';
import type { LeagueMatch, LeagueSettings, LeagueStanding, LeagueTeam } from './leagueCore';

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
      supabase.from('league_teams').select('id, name, name_ar'),
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
export async function myTeam(): Promise<number | null> {
  const { data } = await supabase.from('league_fans').select('team_id').maybeSingle();
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
