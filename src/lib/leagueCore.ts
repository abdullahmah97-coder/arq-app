// الدوري السعودي: منطق بحت بدون شبكة (حالة المباراة، الدقيقة، تجميع بالأيام، اسم الفريق وشارته، الترتيب، المواجهات)
// عشان يتختبر بسهولة (tests/league.test.ts). الأوقات كلها بتوقيت الرياض (UTC+3 طول السنة).
import { clockLabel, dayLabel, riyadhDate, riyadhMinute } from './bookingsCore';
import { riyadhDay } from './launchAdsCore';

export type LeagueTeam = { id: number; name: string; name_ar: string | null; logo_url?: string | null };
export type LeagueMatch = {
  id: number; season: number; round: string | null; kickoff: string; status: string; elapsed: number | null;
  home_id: number; away_id: number; home_goals: number | null; away_goals: number | null; venue: string | null; city: string | null;
};
export type LeagueStanding = {
  season: number; team_id: number; rank: number; points: number; played: number | null; win: number | null;
  draw: number | null; lose: number | null; goals_for: number | null; goals_against: number | null; form: string | null;
};
export type LeagueSettings = { enabled: boolean; tickets_url: string | null; remind_minutes: number };

// رموز الحالات (بأسلوب API-Football؛ دالة الخادم تحوّل حالات SportScore لها)
export const LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'];
export const DONE_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
export const OFF_STATUSES = ['PST', 'CANC', 'ABD'];

export type MatchState = 'upcoming' | 'live' | 'finished' | 'off';

/** حالة مباشرة لمباراة بدأت قبل أكثر من ٤ ساعات = معلّقة (SUSP لليوم الثاني) أو بيانات قديمة: ما نعرضها «مباشر» */
export const STALE_LIVE_MS = 4 * 3600_000;
/** مباراة «قادمة» فات موعدها بأكثر من ٣ ساعات وما تحدثت = نطلّعها من القادمة */
export const STALE_UPCOMING_MS = 3 * 3600_000;

export function matchState(status: string, kickoff?: string, now = Date.now()): MatchState {
  if (LIVE_STATUSES.includes(status)) return kickoff && Date.parse(kickoff) < now - STALE_LIVE_MS ? 'off' : 'live';
  if (DONE_STATUSES.includes(status)) return 'finished';
  if (OFF_STATUSES.includes(status)) return 'off';
  return 'upcoming'; // NS و TBD
}

/** حالة المباراة مع وقتها (الأفضل في كل مكان فيه مباراة كاملة) */
export const stateOf = (m: Pick<LeagueMatch, 'status' | 'kickoff'>, now = Date.now()) => matchState(m.status, m.kickoff, now);

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

/** شعار النادي من المزوّد (رابط https بس)، وإلا null ← نعرض الحرف بألوان النادي */
export function teamLogo(t: LeagueTeam | undefined | null): string | null {
  const u = t?.logo_url?.trim();
  return u && /^https:\/\/[^\s]{4,300}$/.test(u) ? u : null;
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

/** المباشرة أول، بعدها القادمة الأقرب فالأبعد (بدون اللي فات موعدها من زمان وما تحدثت) */
export function upcomingMatches(rows: LeagueMatch[], now = Date.now()): LeagueMatch[] {
  const live = rows.filter((m) => stateOf(m, now) === 'live').sort(byKick);
  const next = rows.filter((m) => stateOf(m, now) === 'upcoming' && Date.parse(m.kickoff) > now - STALE_UPCOMING_MS).sort(byKick);
  return [...live, ...next];
}

/** النتائج: الأحدث أول (والملغاة والمؤجلة والمعلّقة معها عشان ما تختفي) */
export function finishedMatches(rows: LeagueMatch[], now = Date.now()): LeagueMatch[] {
  return rows.filter((m) => ['finished', 'off'].includes(stateOf(m, now))).sort((a, b) => byKick(b, a));
}

export const involves = (m: Pick<LeagueMatch, 'home_id' | 'away_id'>, teamId: number | null | undefined) =>
  teamId != null && (m.home_id === teamId || m.away_id === teamId);

/** للرئيسية: مباراة مباشرة (فريقي أول)، وإلا القادمة لفريقي، وإلا أقرب قادمة */
export function spotlight(rows: LeagueMatch[], myTeam?: number | null, now = Date.now()): LeagueMatch | null {
  const live = rows.filter((m) => stateOf(m, now) === 'live').sort(byKick);
  const liveMine = live.find((m) => involves(m, myTeam));
  if (liveMine) return liveMine;
  const next = rows.filter((m) => stateOf(m, now) === 'upcoming' && Date.parse(m.kickoff) > now - STALE_UPCOMING_MS).sort(byKick);
  const mine = myTeam != null ? next.find((m) => involves(m, myTeam)) : undefined;
  // مباراة فريقي خلال ٧ أيام تغلب، وإلا المباشرة، وإلا الأقرب
  if (mine && Date.parse(mine.kickoff) - now < 7 * 86_400_000) return mine;
  return live[0] ?? next[0] ?? null;
}

/** نتيجة المباراة من جهة فريق: W فوز، D تعادل، L خسارة (null لو ما خلصت) */
export function resultFor(m: LeagueMatch, teamId: number): 'W' | 'D' | 'L' | null {
  if (stateOf(m) !== 'finished' || m.home_goals == null || m.away_goals == null) return null;
  const mine = m.home_id === teamId ? m.home_goals : m.away_goals;
  const theirs = m.home_id === teamId ? m.away_goals : m.home_goals;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

/** مواجهات الفريقين اللي خلصت (الأحدث أول)، بدون المباراة نفسها */
export function headToHead(rows: LeagueMatch[], m: LeagueMatch, limit = 5): LeagueMatch[] {
  return finishedMatches(rows)
    .filter((x) => x.id !== m.id && involves(x, m.home_id) && involves(x, m.away_id) && stateOf(x) === 'finished')
    .slice(0, limit);
}

/** آخر نتائج فريق (الأحدث أول) */
export function lastResults(rows: LeagueMatch[], teamId: number, limit = 5): LeagueMatch[] {
  return finishedMatches(rows).filter((x) => involves(x, teamId) && stateOf(x) === 'finished').slice(0, limit);
}

/** شكل الفريق آخر ٥: من الترتيب لو موجود، وإلا من النتائج («WWDLW»، الأحدث آخر شي) */
export function formOf(teamId: number, standings: LeagueStanding[], rows: LeagueMatch[]): string[] {
  const s = standings.find((x) => x.team_id === teamId)?.form;
  if (s && /^[WDL]+$/.test(s)) return s.slice(-5).split('');
  return lastResults(rows, teamId, 5).map((x) => resultFor(x, teamId)!).reverse();
}

export const sortStandings = (rows: LeagueStanding[]) => [...rows].sort((a, b) => a.rank - b.rank || b.points - a.points);

/** فرق الموسم (من المباريات أو الترتيب) لاختيار «فريقي» بضغطة: بترتيب الجدول، واللي ما له ترتيب بالاسم آخر شي */
export function seasonTeams(teams: Map<number, LeagueTeam>, matches: Pick<LeagueMatch, 'home_id' | 'away_id'>[], standings: Pick<LeagueStanding, 'team_id' | 'rank'>[], lng: string): LeagueTeam[] {
  const rank = new Map(standings.map((s) => [s.team_id, s.rank]));
  const ids = new Set<number>([...matches.flatMap((m) => [m.home_id, m.away_id]), ...standings.map((s) => s.team_id)]);
  return [...teams.values()].filter((x) => ids.has(x.id))
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || teamName(a, lng).localeCompare(teamName(b, lng), lng === 'en' ? 'en' : 'ar'));
}

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
  !!url && /^https:\/\/\S+$/.test(url) && stateOf(m, now) === 'upcoming' && Date.parse(m.kickoff) > now;

/** «ذكّرني» للمباراة اللي ما بدأت (والقاعدة ترفض غيرها) */
export const canRemind = (m: Pick<LeagueMatch, 'status' | 'kickoff'>, now = Date.now()) =>
  stateOf(m, now) === 'upcoming' && Date.parse(m.kickoff) > now;

// ---------- تفاصيل المباراة (الأحداث، الإحصائيات، التشكيلة) والهدافين ----------
// يكتبها الخادم (league-sync ← league_ingest_details) بشكل مختصر، وهنا نقراها بحذر (أي شي غريب ينشال)

export type EventKind = 'goal' | 'pen' | 'og' | 'yc' | 'rc' | 'y2' | 'sub' | 'pmiss' | 'var';
export type MatchEvent = { min: number; side: 'h' | 'a'; kind: EventKind; p?: string; in?: string; out?: string; hs?: number; as?: number };
export type StatRow = { k: string; h: number; a: number };
export type LineupPlayer = { n: string; no: number | null; pos: 'G' | 'D' | 'M' | 'F' | null; c?: boolean };
export type Lineups = {
  ok: boolean; hf: string | null; af: string | null; hc: string | null; ac: string | null;
  h: LineupPlayer[]; a: LineupPlayer[]; hs: LineupPlayer[]; as: LineupPlayer[];
};
export type MatchDetails = { ht: [number, number] | null; events: MatchEvent[]; stats: StatRow[]; lineups: Lineups | null };
export type Scorer = { rank: number; name: string; team: number | null; goals: number; assists: number | null; matches: number | null; minutes: number | null };

const KINDS: EventKind[] = ['goal', 'pen', 'og', 'yc', 'rc', 'y2', 'sub', 'pmiss', 'var'];
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const txt = (v: unknown, max = 60): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function readEvent(x: unknown): MatchEvent | null {
  const e = x as Record<string, unknown> | null;
  if (!e || typeof e !== 'object') return null;
  if (!isInt(e.min, 0, 200) || (e.side !== 'h' && e.side !== 'a') || !KINDS.includes(e.kind as EventKind)) return null;
  const out: MatchEvent = { min: e.min, side: e.side, kind: e.kind as EventKind };
  const p = txt(e.p); const pin = txt(e.in); const pout = txt(e.out);
  if (p) out.p = p;
  if (pin) out.in = pin;
  if (pout) out.out = pout;
  if (isInt(e.hs, 0, 99) && isInt(e.as, 0, 99)) { out.hs = e.hs; out.as = e.as; }
  return out;
}

function readPlayers(v: unknown, max: number): LineupPlayer[] {
  if (!Array.isArray(v)) return [];
  const out: LineupPlayer[] = [];
  for (const x of v.slice(0, max)) {
    const n = txt((x as { n?: unknown })?.n);
    if (!n) continue;
    const no = (x as { no?: unknown }).no;
    const pos = (x as { pos?: unknown }).pos;
    out.push({ n, no: isInt(no, 0, 99) ? no : null, pos: pos === 'G' || pos === 'D' || pos === 'M' || pos === 'F' ? pos : null, c: (x as { c?: unknown }).c === true });
  }
  return out;
}

const formationOk = (v: unknown) => (typeof v === 'string' && /^[1-6](-[1-6]){1,4}$/.test(v) ? v : null);

/** صف المباراة من القاعدة ← التفاصيل (فاضية لو ما فيه شي) */
export function readDetails(row: { ht_home?: unknown; ht_away?: unknown; events?: unknown; stats?: unknown; lineups?: unknown } | null | undefined): MatchDetails {
  const ht: [number, number] | null = row && isInt(row.ht_home, 0, 99) && isInt(row.ht_away, 0, 99) ? [row.ht_home, row.ht_away] : null;
  const events = Array.isArray(row?.events) ? (row!.events as unknown[]).slice(0, 150).map(readEvent).filter((e): e is MatchEvent => !!e) : [];
  events.sort((a, b) => a.min - b.min);
  const stats = Array.isArray(row?.stats)
    ? (row!.stats as { k?: unknown; h?: unknown; a?: unknown }[]).slice(0, 40)
      .filter((s) => typeof s?.k === 'string' && /^[a-z_]{2,20}$/.test(s.k) && isInt(s.h, 0, 100000) && isInt(s.a, 0, 100000))
      .map((s) => ({ k: s.k as string, h: s.h as number, a: s.a as number }))
    : [];
  const l = row?.lineups as Record<string, unknown> | null | undefined;
  let lineups: Lineups | null = null;
  if (l && typeof l === 'object' && !Array.isArray(l)) {
    const h = readPlayers(l.h, 11); const a = readPlayers(l.a, 11);
    if (h.length || a.length) {
      lineups = { ok: l.ok === true, hf: formationOk(l.hf), af: formationOk(l.af), hc: txt(l.hc) ?? null, ac: txt(l.ac) ?? null,
        h, a, hs: readPlayers(l.hs, 20), as: readPlayers(l.as, 20) };
    }
  }
  return { ht, events, stats, lineups };
}

export const hasDetails = (d: MatchDetails | null | undefined) => !!d && (d.events.length > 0 || d.stats.length > 0 || !!d.lineups);

/** قائمة الهدافين من القاعدة (بحذر) */
export function readScorers(v: unknown): Scorer[] {
  if (!Array.isArray(v)) return [];
  const out: Scorer[] = [];
  for (const x of v.slice(0, 40)) {
    const s = x as Record<string, unknown>;
    const name = txt(s?.name);
    if (!name || !isInt(s.rank, 1, 200) || !isInt(s.goals, 0, 200)) continue;
    out.push({ rank: s.rank, name, team: isInt(s.team, 1, 2147483647) ? s.team : null, goals: s.goals,
      assists: isInt(s.assists, 0, 200) ? s.assists : null, matches: isInt(s.matches, 0, 99) ? s.matches : null, minutes: isInt(s.minutes, 0, 10000) ? s.minutes : null });
  }
  return out.sort((a, b) => a.rank - b.rank || b.goals - a.goals);
}

const GOALS: EventKind[] = ['goal', 'pen', 'og'];
export const isGoal = (e: MatchEvent) => GOALS.includes(e.kind);

/** الأهداف بجهة الفريق المستفيد: من فرق النتيجة قبل وبعد (أضمن للهدف العكسي)، وإلا جهة الحدث */
export function goalsWithSide(events: MatchEvent[]): (MatchEvent & { for: 'h' | 'a' })[] {
  let ph = 0; let pa = 0;
  const out: (MatchEvent & { for: 'h' | 'a' })[] = [];
  for (const e of events) {
    if (!isGoal(e)) continue;
    let side: 'h' | 'a' = e.kind === 'og' ? (e.side === 'h' ? 'a' : 'h') : e.side;
    if (e.hs != null && e.as != null) {
      if (e.hs > ph && e.as === pa) side = 'h';
      else if (e.as > pa && e.hs === ph) side = 'a';
      ph = e.hs; pa = e.as;
    }
    out.push({ ...e, for: side });
  }
  return out;
}

/** «Ali Saeed Ali Al Shaafi» ← «Al Shaafi»، «Cristiano Ronaldo» ← «Ronaldo»، «Fawaz Al-Sagour» ← «Al-Sagour» */
export function shortPlayer(name: string): string {
  const parts = name.trim().split(/\s+/);
  // «A. Alamine Ali»: الحرف الأول اختصار، واللي بعده اسم العائلة
  if (parts.length >= 3 && /^[A-Za-z]\.$/.test(parts[0])) return parts[1];
  if (parts.length < 2) return name.trim();
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (/^(al|el|ad|as|ash|at|az|abu|bin|ben|de|da|di|van|von|le|la|dos|del)$/i.test(prev)) return `${prev} ${last}`;
  return last;
}

/** هدافين المباراة لكل فريق: «Kanga 33'، 60'» (الهدف العكسي والجزائي يحددها اللي يعرض). display = اسم العرض (العربي) */
export function scorerLines(events: MatchEvent[], display: (n: string) => string = (n) => n): Record<'h' | 'a', { name: string; mins: { min: number; kind: EventKind }[] }[]> {
  const out: Record<'h' | 'a', { name: string; mins: { min: number; kind: EventKind }[] }[]> = { h: [], a: [] };
  for (const g of goalsWithSide(events)) {
    const name = g.p ? shortPlayer(display(g.p)) : '—';
    const list = out[g.for];
    const hit = list.find((x) => x.name === name);
    if (hit) hit.mins.push({ min: g.min, kind: g.kind });
    else list.push({ name, mins: [{ min: g.min, kind: g.kind }] });
  }
  return out;
}

/** بطاقات حمراء لكل فريق (تبان تحت النتيجة) */
export function redCards(events: MatchEvent[]): Record<'h' | 'a', number> {
  const r = { h: 0, a: 0 };
  for (const e of events) if (e.kind === 'rc' || e.kind === 'y2') r[e.side]++;
  return r;
}

/** ترتيب عرض الإحصائيات، وحصة كل فريق (٠..١) للشريط */
export const STAT_ORDER = ['possession', 'shots', 'shots_on', 'shots_off', 'blocked', 'corners', 'attacks', 'dangerous', 'fouls', 'yellow', 'red', 'offsides', 'saves', 'passes', 'free_kicks', 'goal_kicks', 'throw_ins'];
export function statBars(stats: StatRow[]): (StatRow & { share: number })[] {
  return [...stats]
    .sort((a, b) => (STAT_ORDER.indexOf(a.k) + 1 || 99) - (STAT_ORDER.indexOf(b.k) + 1 || 99))
    .map((s) => ({ ...s, share: s.h + s.a > 0 ? s.h / (s.h + s.a) : 0.5 }));
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** نفس اللاعب؟ المزوّد يكتب الاسم بأكثر من شكل («Ali Alamine» و«A. Alamine Ali»): الاسم كامل، أو كلمة مميزة (٤ حروف وأكثر)
 *  مشتركة غير الاسم الأول */
export function samePlayer(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = norm(a); const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = x.split(' ').slice(1).filter((t) => t.length >= 4);
  const ty = new Set(y.split(' ').slice(1).filter((t) => t.length >= 4));
  return tx.some((t) => ty.has(t));
}

/** وش صار للاعب في المباراة (للتشكيلة): أهدافه، بطاقاته، ومتى طلع أو دخل */
export function playerMarks(name: string, side: 'h' | 'a', events: MatchEvent[]) {
  const m = { goals: 0, og: 0, yellow: false, red: false, outMin: null as number | null, inMin: null as number | null };
  for (const e of events) {
    // الهدف العكسي: المزوّد ممكن يحطه بجهة المستفيد، فنطابقه بالاسم بس
    if (e.kind === 'og') { if (samePlayer(e.p, name)) m.og++; continue; }
    if (e.side !== side) continue;
    if ((e.kind === 'goal' || e.kind === 'pen') && samePlayer(e.p, name)) m.goals++;
    else if (e.kind === 'yc' && samePlayer(e.p, name)) m.yellow = true;
    else if ((e.kind === 'rc' || e.kind === 'y2') && samePlayer(e.p, name)) m.red = true;
    else if (e.kind === 'sub') {
      if (m.outMin == null && samePlayer(e.out, name)) m.outMin = e.min;
      if (m.inMin == null && samePlayer(e.in, name)) m.inMin = e.min;
    }
  }
  return m;
}

const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 } as const;

/** خطوط التشكيلة من الحارس للهجوم. الخطة («4-2-3-1») تحدد عدد كل خط، واللاعبين بترتيب المراكز (حارس، دفاع، وسط، هجوم).
 *  لو الخطة ناقصة أو ما تطابق العدد: خط لكل مركز */
export function lineupRows(players: LineupPlayer[], formation: string | null): LineupPlayer[][] {
  if (!players.length) return [];
  const sorted = players.map((p, i) => [p, i] as const)
    .sort((a, b) => (a[0].pos ? POS_ORDER[a[0].pos] : 2) - (b[0].pos ? POS_ORDER[b[0].pos] : 2) || a[1] - b[1]).map((x) => x[0]);
  const gkFirst = sorted[0]?.pos === 'G' || !sorted.some((p) => p.pos === 'G');
  const counts = formation ? formation.split('-').map(Number) : [];
  const outfield = gkFirst ? sorted.slice(1) : sorted;
  if (gkFirst && counts.length && counts.reduce((s, n) => s + n, 0) === outfield.length) {
    const rows: LineupPlayer[][] = [[sorted[0]]];
    let i = 0;
    for (const n of counts) { rows.push(outfield.slice(i, i + n)); i += n; }
    return rows;
  }
  const by = (pos: LineupPlayer['pos']) => sorted.filter((p) => (p.pos ?? 'M') === pos);
  return (['G', 'D', 'M', 'F'] as const).map(by).filter((r) => r.length);
}

/** كل أسماء اللاعبين في تفاصيل المباراة (نجيب أسماءهم بالعربي مرة وحدة) */
export function playerNamesIn(d: MatchDetails | null | undefined): string[] {
  if (!d) return [];
  const out = new Set<string>();
  for (const e of d.events) for (const n of [e.p, e.in, e.out]) if (n) out.add(n);
  const l = d.lineups;
  if (l) for (const p of [...l.h, ...l.a, ...l.hs, ...l.as]) out.add(p.n);
  return [...out];
}

/** اسم اللاعب للعرض: بالعربي لو عندنا اسمه (والواجهة عربية)، وإلا مثل ما يرسله المزوّد */
export const nameFor = (ar: ReadonlyMap<string, string> | null | undefined, lng: string) =>
  (n: string): string => (lng !== 'en' && ar?.get(n)) || n;

/** «٣٣'» — المزوّد يعطي الوقت بدقيقة وحدة (٩٣ = ٩٠+٣) */
export const minuteText = (min: number) => (min > 90 ? `90+${min - 90}'` : `${min}'`);

// ---------- توقعات المباريات (تحدي الأصدقاء) ----------
// النقاط مثل القاعدة (league_pred_points): النتيجة بالضبط = ٣، الفائز أو التعادل صح = ١، غير كذا = ٠
export const PRED_EXACT = 3;
export const PRED_OUTCOME = 1;
export const PRED_MAX_GOALS = 20;

export function predPoints(ph: number | null | undefined, pa: number | null | undefined, hg: number | null | undefined, ag: number | null | undefined): number | null {
  if (ph == null || pa == null || hg == null || ag == null) return null;
  if (ph === hg && pa === ag) return PRED_EXACT;
  return Math.sign(ph - pa) === Math.sign(hg - ag) ? PRED_OUTCOME : 0;
}

export type PredFriend = { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; home?: number; away?: number; points?: number | null };
export type PredSummary = {
  total: number; home_win: number; draw: number; away_win: number; locked: boolean;
  mine: { home: number; away: number; points: number | null; shared: boolean } | null;
  friends: PredFriend[];
};
export type PredBoardRow = {
  user_id: string; username: string | null; full_name: string | null; avatar_url: string | null;
  points: number; exact: number; outcome: number; played: number; rank: number;
};

const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const intOrNull = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** رد league_pred_summary (بحذر) */
export function readPredSummary(v: unknown): PredSummary | null {
  const s = v as Record<string, unknown> | null;
  if (!s || typeof s !== 'object') return null;
  const m = s.mine as Record<string, unknown> | null;
  const friends = Array.isArray(s.friends) ? (s.friends as Record<string, unknown>[]) : [];
  return {
    total: n0(s.total), home_win: n0(s.home_win), draw: n0(s.draw), away_win: n0(s.away_win), locked: s.locked === true,
    mine: m && intOrNull(m.home) != null && intOrNull(m.away) != null
      ? { home: m.home as number, away: m.away as number, points: intOrNull(m.points), shared: m.shared === true } : null,
    friends: friends.filter((f) => typeof f?.user_id === 'string').slice(0, 100).map((f) => ({
      user_id: f.user_id as string, username: (f.username as string) ?? null, full_name: (f.full_name as string) ?? null, avatar_url: (f.avatar_url as string) ?? null,
      ...(intOrNull(f.home) != null && intOrNull(f.away) != null ? { home: f.home as number, away: f.away as number } : {}),
      points: intOrNull(f.points),
    })),
  };
}

/** نسب توقعات الجمهور (تكمل ١٠٠ بالضبط)، null لو ما فيه توقعات */
export function crowdShares(s: Pick<PredSummary, 'total' | 'home_win' | 'draw' | 'away_win'> | null | undefined): { home: number; draw: number; away: number } | null {
  if (!s || s.total <= 0) return null;
  const raw = [s.home_win, s.draw, s.away_win].map((x) => (x / s.total) * 100);
  const out = raw.map(Math.floor);
  // نوزّع الباقي على الأكبر كسراً عشان المجموع ١٠٠
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return { home: out[0], draw: out[1], away: out[2] };
}

/** خطأ من القاعدة ← مفتاح ترجمة */
export function predErrorKey(message: string | undefined | null): string {
  const m = message ?? '';
  if (/locked/.test(m)) return 'league.predLocked';
  if (/bad_score/.test(m)) return 'league.predBadScore';
  if (/account_suspended/.test(m)) return 'safety.isSuspended';
  return 'errors.generic';
}

/** التوقع مقفول؟ (بدأت أو فات موعدها أو تأجلت) */
export const predLocked = (m: Pick<LeagueMatch, 'kickoff' | 'status'>, now = Date.now()) =>
  Date.parse(m.kickoff) <= now || !['NS', 'TBD'].includes(m.status);
