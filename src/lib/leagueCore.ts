// الدوري السعودي: منطق بحت بدون شبكة (حالة المباراة، الدقيقة، تجميع بالأيام، اسم الفريق وشارته، الترتيب، المواجهات)
// عشان يتختبر بسهولة (tests/league.test.ts). الأوقات كلها بتوقيت الرياض (UTC+3 طول السنة).
import { clockLabel, dayLabel, riyadhDate, riyadhMinute } from './bookingsCore';
import { riyadhDay } from './launchAdsCore';

export type LeagueTeam = { id: number; name: string; name_ar: string | null };
export type LeagueMatch = {
  id: number; season: number; round: string | null; kickoff: string; status: string; elapsed: number | null;
  home_id: number; away_id: number; home_goals: number | null; away_goals: number | null; venue: string | null; city: string | null;
};
export type LeagueStanding = {
  season: number; team_id: number; rank: number; points: number; played: number | null; win: number | null;
  draw: number | null; lose: number | null; goals_for: number | null; goals_against: number | null; form: string | null;
};
export type LeagueSettings = { enabled: boolean; tickets_url: string | null; remind_minutes: number };

// حالات API-Football
export const LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'];
export const DONE_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
export const OFF_STATUSES = ['PST', 'CANC', 'ABD'];

export type MatchState = 'upcoming' | 'live' | 'finished' | 'off';

export function matchState(status: string): MatchState {
  if (LIVE_STATUSES.includes(status)) return 'live';
  if (DONE_STATUSES.includes(status)) return 'finished';
  if (OFF_STATUSES.includes(status)) return 'off';
  return 'upcoming'; // NS و TBD
}

/** وش نكتب مكان النتيجة وقت المباراة: الدقيقة («63'»)، أو مفتاح ترجمة (استراحة، ركلات ترجيح، متوقفة) */
export function liveLabel(m: Pick<LeagueMatch, 'status' | 'elapsed'>): { minute: string } | { key: string } {
  if (m.status === 'HT' || m.status === 'BT') return { key: 'league.st_break' };
  if (m.status === 'P') return { key: 'league.st_pens' };
  if (m.status === 'SUSP' || m.status === 'INT') return { key: 'league.st_stopped' };
  if (m.elapsed != null && m.elapsed > 0) return { minute: `${m.elapsed}'` };
  return { key: 'league.st_live' };
}

/** «Al-Hilal Saudi FC» ← «Al-Hilal» */
export const shortEnName = (name: string) =>
  name.replace(/\s+(Saudi\s+)?(FC|SC|Club|Saudi Club)$/i, '').replace(/\s+Saudi$/i, '').trim() || name;

export function teamName(t: LeagueTeam | undefined | null, lng: string): string {
  if (!t) return '—';
  if (lng !== 'en' && t.name_ar) return t.name_ar;
  return shortEnName(t.name);
}

/** حرف الشارة: أول حرف بعد «ال» أو «Al-» (الهلال ← ه، Al-Nassr ← N) */
export function teamInitial(t: LeagueTeam | undefined | null, lng: string): string {
  const n = teamName(t, lng).trim();
  const ar = n.replace(/^ال/, '');
  if (ar !== n) return ar.charAt(0) || n.charAt(0);
  const en = n.replace(/^(Al|Ad|Ar|As|Ash|At|Az|Ad-)[-\s]+/i, '');
  return (en.charAt(0) || n.charAt(0)).toUpperCase();
}

// ألوان الأندية المعروفة (ألوان اللبس، مو الشعار)، والباقي لون ثابت من المعرّف
const CLUB_COLORS: { re: RegExp; bg: string; fg: string }[] = [
  { re: /hilal/i, bg: '#1B4FA0', fg: '#FFFFFF' },
  { re: /nass?r/i, bg: '#F6C516', fg: '#123A7A' },
  { re: /ittihad/i, bg: '#111111', fg: '#F6C516' },
  { re: /ahli/i, bg: '#0B7A3E', fg: '#FFFFFF' },
  { re: /shabab/i, bg: '#FFFFFF', fg: '#111111' },
  { re: /ettifaq|ittifaq/i, bg: '#0F7A3A', fg: '#E0312B' },
  { re: /qads|qadis/i, bg: '#C8102E', fg: '#F2C14E' },
];
const PALETTE = ['#2F4B3C', '#7A3E1D', '#3B5B8C', '#6B4C9A', '#8C2F39', '#1F6F78', '#5E6B2E', '#9A5B13'];

export function teamColors(t: LeagueTeam | undefined | null): { bg: string; fg: string } {
  if (!t) return { bg: '#9AA69E', fg: '#FFFFFF' };
  const hit = CLUB_COLORS.find((c) => c.re.test(t.name));
  if (hit) return { bg: hit.bg, fg: hit.fg };
  return { bg: PALETTE[Math.abs(t.id) % PALETTE.length], fg: '#F8EDDA' };
}

/** «Regular Season - 8» ← 8 (أو null لو مو جولة عادية) */
export function roundNumber(round: string | null | undefined): number | null {
  const m = /regular season\s*-\s*(\d{1,2})\s*$/i.exec(round ?? '');
  return m ? Number(m[1]) : null;
}

export const kickoffClock = (iso: string, lng: string) => clockLabel(riyadhMinute(iso), lng);

/** «اليوم» / «بكرة» / «الخميس 16/10» */
export function matchDayTitle(day: string, lng: string, today = riyadhDay()): string {
  const d = dayLabel(day, lng, today);
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === -1) return lng === 'en' ? `Yesterday ${d.bottom}` : `أمس ${d.bottom}`;
  return diff === 0 || diff === 1 ? d.top : `${d.top} ${d.bottom}`;
}

/** «الخميس 16/10 · 9:00 م» */
export function kickoffLabel(iso: string, lng: string, today = riyadhDay()): string {
  return `${matchDayTitle(riyadhDate(iso), lng, today)} · ${kickoffClock(iso, lng)}`;
}

/** تجميع المباريات بيوم الرياض (بنفس ترتيب القائمة) */
export function groupByDay<M extends Pick<LeagueMatch, 'kickoff'>>(rows: M[]): { day: string; rows: M[] }[] {
  const out: { day: string; rows: M[] }[] = [];
  for (const m of rows) {
    const day = riyadhDate(m.kickoff);
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(m);
    else out.push({ day, rows: [m] });
  }
  return out;
}

const byKick = (a: LeagueMatch, b: LeagueMatch) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id;

/** المباشرة أول، بعدها القادمة الأقرب فالأبعد */
export function upcomingMatches(rows: LeagueMatch[]): LeagueMatch[] {
  const live = rows.filter((m) => matchState(m.status) === 'live').sort(byKick);
  const next = rows.filter((m) => matchState(m.status) === 'upcoming').sort(byKick);
  return [...live, ...next];
}

/** النتائج: الأحدث أول (والملغاة والمؤجلة معها عشان ما تختفي) */
export function finishedMatches(rows: LeagueMatch[]): LeagueMatch[] {
  return rows.filter((m) => ['finished', 'off'].includes(matchState(m.status))).sort((a, b) => byKick(b, a));
}

export const involves = (m: Pick<LeagueMatch, 'home_id' | 'away_id'>, teamId: number | null | undefined) =>
  teamId != null && (m.home_id === teamId || m.away_id === teamId);

/** للرئيسية: مباراة مباشرة (فريقي أول)، وإلا القادمة لفريقي، وإلا أقرب قادمة */
export function spotlight(rows: LeagueMatch[], myTeam?: number | null, now = Date.now()): LeagueMatch | null {
  const live = rows.filter((m) => matchState(m.status) === 'live').sort(byKick);
  const liveMine = live.find((m) => involves(m, myTeam));
  if (liveMine) return liveMine;
  const next = rows.filter((m) => matchState(m.status) === 'upcoming' && Date.parse(m.kickoff) > now - 3 * 3600_000).sort(byKick);
  const mine = myTeam != null ? next.find((m) => involves(m, myTeam)) : undefined;
  // مباراة فريقي خلال ٧ أيام تغلب، وإلا المباشرة، وإلا الأقرب
  if (mine && Date.parse(mine.kickoff) - now < 7 * 86_400_000) return mine;
  return live[0] ?? next[0] ?? null;
}

/** نتيجة المباراة من جهة فريق: W فوز، D تعادل، L خسارة (null لو ما خلصت) */
export function resultFor(m: LeagueMatch, teamId: number): 'W' | 'D' | 'L' | null {
  if (matchState(m.status) !== 'finished' || m.home_goals == null || m.away_goals == null) return null;
  const mine = m.home_id === teamId ? m.home_goals : m.away_goals;
  const theirs = m.home_id === teamId ? m.away_goals : m.home_goals;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

/** مواجهات الفريقين اللي خلصت (الأحدث أول)، بدون المباراة نفسها */
export function headToHead(rows: LeagueMatch[], m: LeagueMatch, limit = 5): LeagueMatch[] {
  return finishedMatches(rows)
    .filter((x) => x.id !== m.id && involves(x, m.home_id) && involves(x, m.away_id) && matchState(x.status) === 'finished')
    .slice(0, limit);
}

/** آخر نتائج فريق (الأحدث أول) */
export function lastResults(rows: LeagueMatch[], teamId: number, limit = 5): LeagueMatch[] {
  return finishedMatches(rows).filter((x) => involves(x, teamId) && matchState(x.status) === 'finished').slice(0, limit);
}

/** شكل الفريق آخر ٥: من الترتيب لو موجود، وإلا من النتائج («WWDLW»، الأحدث آخر شي) */
export function formOf(teamId: number, standings: LeagueStanding[], rows: LeagueMatch[]): string[] {
  const s = standings.find((x) => x.team_id === teamId)?.form;
  if (s && /^[WDL]+$/.test(s)) return s.slice(-5).split('');
  return lastResults(rows, teamId, 5).map((x) => resultFor(x, teamId)!).reverse();
}

export const sortStandings = (rows: LeagueStanding[]) => [...rows].sort((a, b) => a.rank - b.rank || b.points - a.points);

export const goalDiff = (s: Pick<LeagueStanding, 'goals_for' | 'goals_against'>) =>
  s.goals_for == null || s.goals_against == null ? null : s.goals_for - s.goals_against;

/** «+12» / «-3» / «0» */
export const signed = (n: number | null) => (n == null ? '—' : n > 0 ? `+${n}` : String(n));

/** كم باقي على البداية: {d, h, m} (null لو بدأت) */
export function countdown(iso: string, now = Date.now()): { d: number; h: number; m: number } | null {
  const ms = Date.parse(iso) - now;
  if (!(ms > 0)) return null;
  const mins = Math.ceil(ms / 60_000);
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
}

/** «احجز تذكرتك» يظهر للمباراة اللي ما بدأت للحين، ولو فيه رابط https */
export const canBuyTickets = (m: Pick<LeagueMatch, 'status' | 'kickoff'>, url: string | null | undefined, now = Date.now()) =>
  !!url && /^https:\/\/\S+$/.test(url) && matchState(m.status) === 'upcoming' && Date.parse(m.kickoff) > now;

/** «ذكّرني» للمباراة اللي ما بدأت (والقاعدة ترفض غيرها) */
export const canRemind = (m: Pick<LeagueMatch, 'status' | 'kickoff'>, now = Date.now()) =>
  matchState(m.status) === 'upcoming' && Date.parse(m.kickoff) > now;
