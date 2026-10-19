// قراءة ردود SportScore (الواجهة المجانية: sportscore.com/api/widget) وتحويلها للشكل اللي تاخذه league_ingest.
// منطق بحت بدون شبكة، عشان يتختبر. الشروط: https://sportscore.com/developers/terms/
//   - مجاني بدون مفتاح، بشرط «Powered by SportScore» ظاهر في كل شاشة تعرض بياناتهم (التطبيق يعرضه)
//   - التخزين المؤقت عندنا مسموح، وإعادة نشر الرد كخدمة بيانات ممنوع
//
// وش يرجع لنا:
//   /standings?slug=saudi-professional-league ← جدول الترتيب (ومنه أسماء الأندية وروابطها)
//   /team?slug=<النادي>&limit=30              ← آخر ٣٠ مباراة في جدول النادي (الأبعد أول). نجمعها لكل الأندية:
//        نادي جدوله فيه أقل من ٣٠ مباراة باقية يجيب معها نتائجه الأخيرة، فالمجموع يغطي الموسم تقريباً
//   /match?slug=<الزوج>                         ← آخر مواجهة بدأت بين الفريقين (مباشرة أو انتهت). نتأكد إنها مباراتنا
//        من معرّفها في الرابط قبل ما نقبلها، لأن الرابط حق الزوج مو حق المباراة. ومعها تفاصيلها: الأحداث (incidents)،
//        الإحصائيات (stats، تختفي بعد النهاية بفترة)، التشكيلة (lineups)، ونتيجة الشوط الأول
//   /topscorers?slug=saudi-professional-league ← هدافي الدوري (أول ٢٠) بأهدافهم وصناعتهم
// ما فيه معرّفات رقمية: معرّف الفريق رقم ثابت من اسمه، ومعرّف المباراة رقم ثابت من معرّفها في الرابط.

export const API_BASE = 'https://sportscore.com/api/widget';
export const SITE = 'https://sportscore.com';
export const COMPETITION_SLUG = 'saudi-professional-league';
/** رقم الدوري في الجداول (من أول مزوّد، ونخليه عشان ما يتغير شي في التطبيق) */
export const DEFAULT_LEAGUE = 307;
export const USER_AGENT = 'arq-league/1.0 (+https://github.com/abdullahmah97-coder/arq-app)';

export type Team = { id: number; name: string; logo: string | null };
export type Match = {
  id: number; league: number; season: number | null; round: string | null; kickoff: string; status: string;
  elapsed: number | null; home: number; away: number; hg: number | null; ag: number | null; venue: string | null; city: string | null;
  ref: string | null;
};
export type EventKind = 'goal' | 'pen' | 'og' | 'yc' | 'rc' | 'y2' | 'sub' | 'pmiss' | 'var';
export type MatchEvent = { min: number; side: 'h' | 'a'; kind: EventKind; p?: string; in?: string; out?: string; hs?: number; as?: number };
export type StatRow = { k: string; h: number; a: number };
export type LineupPlayer = { n: string; no: number | null; pos: 'G' | 'D' | 'M' | 'F' | null; c?: true };
export type Lineups = {
  ok: boolean; hf: string | null; af: string | null; hc: string | null; ac: string | null;
  h: LineupPlayer[]; a: LineupPlayer[]; hs: LineupPlayer[]; as: LineupPlayer[];
};
/** تفاصيل مباراة لـ league_ingest_details. عنصر فيه id بس = طلبناها وطلع لقاء ثاني للزوج */
export type Detail = { id: number; ht?: [number, number]; events?: MatchEvent[]; stats?: StatRow[]; lineups?: Lineups };
export type Scorer = { rank: number; name: string; team: number | null; goals: number; assists: number | null; matches: number | null; minutes: number | null };
export type Standing = {
  team: number; rank: number; points: number; played: number | null; win: number | null; draw: number | null;
  lose: number | null; gf: number | null; ga: number | null; form: string | null;
};

// deno-lint-ignore no-explicit-any
type Any = any;

const int = (v: unknown, min = 0, max = 1e9): number | null => {
  const n = typeof v === 'string' && /^-?\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null;
const logo = (v: unknown): string | null => {
  const s = str(v, 300);
  return s && /^https:\/\/[^\s]+$/.test(s) ? s : null;
};

/** الموسم = سنة بدايته. الدوري السعودي يبدأ بأغسطس: من يوليو ولين آخر السنة = السنة نفسها، وقبلها = السنة اللي قبل */
export function seasonFor(now: Date, override?: unknown): number {
  const o = Number(override);
  if (override != null && override !== '' && Number.isInteger(o) && o >= 2000 && o <= 2100) return o;
  const riyadh = new Date(now.getTime() + 3 * 3600e3);
  return riyadh.getUTCMonth() >= 6 ? riyadh.getUTCFullYear() : riyadh.getUTCFullYear() - 1;
}

/** حدود الموسم: من ١ يوليو بتوقيت الرياض لين ١ يوليو اللي بعده */
export function seasonWindow(season: number): { from: number; to: number } {
  return { from: Date.UTC(season, 6, 1) - 3 * 3600e3, to: Date.UTC(season + 1, 6, 1) - 3 * 3600e3 };
}

/** FNV-1a بـ 64 بت، مقصوص لـ 53 بت (يطلع رقم صحيح آمن في جافاسكربت وفي bigint) */
export function hash53(s: string): number {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(s)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  const n = Number(h & 0x1fffffffffffffn);
  return n === 0 ? 1 : n;
}

/** اسم النادي بشكل ثابت للمقارنة: «Al Hilal» و«al-hilal» نفس الشي */
export const teamKey = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

/** معرّف الفريق: رقم ثابت (١..٢١٤٧٤٨٣٦٤٧) من اسمه */
export function teamId(name: string): number {
  return (hash53('team:' + teamKey(name)) % 2147483646) + 1;
}

/** رابط المباراة «/football/match/<الزوج>/<المعرّف>/» ← المرجع اللي نحفظه، ومعرّف رقمي ثابت */
export function matchRef(url: unknown): { ref: string; slug: string; key: string; id: number } | null {
  const s = str(url, 300);
  const m = s ? /^\/football\/match\/([a-z0-9]+(?:-[a-z0-9]+){0,15})\/([a-z0-9]{6,32})\/?$/.exec(s) : null;
  if (!m) return null;
  return { ref: `${m[1]}/${m[2]}`, slug: m[1], key: m[2], id: hash53('match:' + m[2]) };
}

/** المرجع المحفوظ «<الزوج>/<المعرّف>» ← أجزاؤه (للتحديث المباشر) */
export function splitRef(ref: unknown): { slug: string; key: string } | null {
  const s = str(ref, 200);
  const m = s ? /^([a-z0-9]+(?:-[a-z0-9]+){0,15})\/([a-z0-9]{6,32})$/.exec(s) : null;
  return m ? { slug: m[1], key: m[2] } : null;
}

/** حالة SportScore ← رموز API-Football اللي يفهمها التطبيق والقاعدة (NS، 1H، HT، 2H، ET، P، FT، AET، PEN، PST، CANC…) */
export function statusCode(status: unknown, text: unknown): string {
  const s = (str(status, 30) ?? '').toLowerCase();
  const t = (str(text, 60) ?? '').toLowerCase();
  const x = `${s} ${t}`;
  if (/cancel/.test(x)) return 'CANC';
  if (/abandon|cut in half/.test(x)) return 'ABD';
  if (/interrupt/.test(x)) return 'INT';
  if (/suspend/.test(x)) return 'SUSP';
  if (/postpon|delay/.test(x)) return 'PST';
  if (/to be determined|\btbd\b/.test(x)) return 'TBD';
  if (s === 'finished' || /finish|ended|full.?time|^ft$/.test(t)) {
    if (/pen/.test(t)) return 'PEN';
    if (/extra|overtime|aet/.test(t)) return 'AET';
    if (/award|walkover/.test(t)) return 'AWD';
    return 'FT';
  }
  if (s === 'upcoming' || s === 'scheduled' || /not started/.test(t)) return 'NS';
  if (/half.?time|^ht$/.test(t)) return 'HT';
  if (/break/.test(t)) return 'BT';
  if (/penalt/.test(t)) return 'P';
  if (/extra|overtime/.test(t)) return 'ET';
  if (/2nd|second/.test(t)) return '2H';
  if (/1st|first/.test(t)) return '1H';
  if (s === 'live' || s === 'inprogress' || s === 'in_progress' || /live|playing/.test(t)) return 'LIVE';
  return 'TBD';
}

/** الدقيقة: 63 أو «63'» أو «45+2» ← 63 / 45 */
export function minuteOf(v: unknown): number | null {
  if (typeof v === 'number') return int(v, 0, 200);
  const m = typeof v === 'string' ? /^\s*(\d{1,3})/.exec(v) : null;
  return m ? int(Number(m[1]), 0, 200) : null;
}

/** رسالة خطأ المزوّد: {"error": "..."} */
export function apiError(body: Any): string | null {
  return body && typeof body === 'object' && !Array.isArray(body) ? str(body.error, 300) : null;
}

/** مباراة واحدة من ردود SportScore ← شكل league_ingest (وفرقها). null لو ناقصة أو مو من موسمنا */
function toMatch(x: Any, season: number, league: number): { match: Match; teams: Team[] } | null {
  const r = matchRef(x?.url);
  const home = str(x?.home, 80);
  const away = str(x?.away, 80);
  const time = str(x?.time, 40);
  if (!r || !home || !away || !time) return null;
  const at = Date.parse(time);
  const w = seasonWindow(season);
  if (Number.isNaN(at) || at < w.from || at >= w.to) return null;
  const hid = teamId(home);
  const aid = teamId(away);
  if (hid === aid) return null;
  const status = statusCode(x?.status, x?.status_text);
  const started = status !== 'NS' && status !== 'TBD' && status !== 'PST' && status !== 'CANC';
  return {
    match: {
      id: r.id, league, season, round: null, kickoff: new Date(at).toISOString(), status,
      elapsed: started ? minuteOf(x?.live_minute) : null, home: hid, away: aid,
      hg: started ? int(x?.home_score, 0, 99) : null, ag: started ? int(x?.away_score, 0, 99) : null,
      venue: null, city: null, ref: r.ref,
    },
    teams: [{ id: hid, name: home, logo: logo(x?.home_logo) }, { id: aid, name: away, logo: logo(x?.away_logo) }],
  };
}

/** هل المباراة من الدوري السعودي للمحترفين (مو كأس ولا دوري يلو ولا آسيا) */
export function isLeague(competition: unknown): boolean {
  const c = (str(competition, 120) ?? '').toLowerCase();
  return /saudi/.test(c) && /(professional|pro) league/.test(c) && !/division|first|youth|u\d{2}|women|cup/.test(c);
}

/** /team ← مباريات الدوري في جدول النادي هالموسم */
export function parseTeamMatches(body: Any, season: number, league = DEFAULT_LEAGUE): { teams: Team[]; matches: Match[] } {
  const list: Any[] = Array.isArray(body?.matches) ? body.matches : [];
  const teams = new Map<number, Team>();
  const matches: Match[] = [];
  for (const x of list) {
    if (!isLeague(x?.competition)) continue;
    const got = toMatch(x, season, league);
    if (!got) continue;
    for (const t of got.teams) teams.set(t.id, t);
    matches.push(got.match);
  }
  return { teams: [...teams.values()], matches };
}

/** /match ← المباراة وتفاصيلها، بس لو معرّفها نفس اللي ننتظره (الرابط حق الزوج ويرجع آخر مواجهة بدأت) */
export function parseMatchDetail(body: Any, key: string, season: number, league = DEFAULT_LEAGUE): { teams: Team[]; match: Match; detail: Detail } | null {
  const x = body?.match;
  const r = matchRef(x?.url);
  if (!r || r.key !== key || !isLeague(x?.competition)) return null;
  const got = toMatch(x, season, league);
  if (!got) return null;
  const detail: Detail = { id: got.match.id };
  const st = got.match.status;
  // نتيجة الشوط الأول بس بعد ما يخلص (وقت الشوط الأول المزوّد يرجع ٠-٠)
  const hh = int(x?.home_ht_score, 0, 99);
  const ha = int(x?.away_ht_score, 0, 99);
  if (hh != null && ha != null && ['HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN'].includes(st)) detail.ht = [hh, ha];
  const events = parseEvents(x?.incidents);
  if (events.length) detail.events = events;
  const stats = parseStats(x?.stats);
  if (stats.length) detail.stats = stats;
  const lineups = parseLineups(x?.lineups);
  if (lineups) detail.lineups = lineups;
  return { teams: got.teams, match: got.match, detail };
}

/** نوع الحدث من رقمه (أرقام TheSports اللي يستخدمها المزوّد) أو اسمه. null = ما نعرضه (ركنية، تسلل، بداية…) */
export function eventKind(x: Any): EventKind | null {
  const id = int(x?.type_id, 0, 999);
  const t = (str(x?.type, 60) ?? '').toLowerCase();
  if (id === 17 || /own goal/.test(t)) return 'og';
  if (id === 16 || id === 30 || (/miss/.test(t) && /pen/.test(t))) return 'pmiss';
  if (id === 8 || (/pen/.test(t) && /goal|scored/.test(t))) return 'pen';
  if (x?.is_goal === true || id === 1 || (/goal/.test(t) && !/kick/.test(t))) return /pen/.test(t) ? 'pen' : 'goal';
  if (id === 15 || /second yellow|2nd yellow|yellow.?red/.test(t)) return 'y2';
  if (id === 4 || /red card/.test(t)) return 'rc';
  if (id === 3 || /yellow card/.test(t)) return 'yc';
  if (id === 9 || x?.is_sub === true || /substitut/.test(t)) return 'sub';
  if (id === 28 || /\bvar\b/.test(t)) return 'var';
  return null;
}

const name = (v: unknown) => str(v, 60);

/** incidents ← أحداث مرتبة بالدقيقة (حد أعلى ١٥٠) */
export function parseEvents(list: unknown): MatchEvent[] {
  if (!Array.isArray(list)) return [];
  const out: MatchEvent[] = [];
  for (const x of list.slice(0, 200)) {
    const kind = eventKind(x);
    const min = minuteOf(x?.time);
    const side = x?.side === 'home' ? 'h' : x?.side === 'away' ? 'a' : null;
    if (!kind || min == null || !side) continue;
    const e: MatchEvent = { min, side, kind };
    if (kind === 'sub') {
      const pin = name(x?.player_in);
      const pout = name(x?.player_out);
      if (!pin && !pout) continue;
      if (pin) e.in = pin;
      if (pout) e.out = pout;
    } else {
      const p = name(x?.player);
      if (p) e.p = p;
    }
    if (kind === 'goal' || kind === 'pen' || kind === 'og') {
      const hs = int(x?.home_score, 0, 99);
      const as = int(x?.away_score, 0, 99);
      if (hs != null && as != null) { e.hs = hs; e.as = as; }
    }
    out.push(e);
    if (out.length >= 150) break;
  }
  // ترتيب ثابت بالدقيقة (والأحداث بنفس الدقيقة بترتيب المزوّد)
  return out.map((e, i) => [e, i] as const).sort((p, q) => p[0].min - q[0].min || p[1] - q[1]).map((p) => p[0]);
}

/** أسماء الإحصائيات عند المزوّد ← مفاتيحنا (التطبيق يترجمها). اللي ما نعرفه ما نحفظه */
const STAT_KEYS: [RegExp, string][] = [
  [/^(ball )?possession$/, 'possession'],
  [/^(total )?shots$/, 'shots'],
  [/^shots on (target|goal)$/, 'shots_on'],
  [/^shots off (target|goal)$/, 'shots_off'],
  [/^blocked shots$/, 'blocked'],
  [/^corner( kick)?s$/, 'corners'],
  [/^attacks$/, 'attacks'],
  [/^dangerous attacks$/, 'dangerous'],
  [/^fouls$/, 'fouls'],
  [/^yellow cards$/, 'yellow'],
  [/^red cards$/, 'red'],
  [/^offsides?$/, 'offsides'],
  [/^(goalkeeper )?saves$/, 'saves'],
  [/^(total )?passes$/, 'passes'],
  [/^free kicks$/, 'free_kicks'],
  [/^goal kicks$/, 'goal_kicks'],
  [/^throw[- ]ins$/, 'throw_ins'],
];

export function parseStats(list: unknown): StatRow[] {
  if (!Array.isArray(list)) return [];
  const out: StatRow[] = [];
  const seen = new Set<string>();
  for (const x of list.slice(0, 60)) {
    const label = (str(x?.label, 60) ?? str(x?.name, 60) ?? '').toLowerCase();
    const k = STAT_KEYS.find(([re]) => re.test(label))?.[1];
    const h = int(x?.home, 0, 100000);
    const a = int(x?.away, 0, 100000);
    if (!k || seen.has(k) || h == null || a == null) continue;
    if (k === 'possession' && (h > 100 || a > 100)) continue;
    seen.add(k);
    out.push({ k, h, a });
  }
  return out;
}

function players(list: unknown, max: number): LineupPlayer[] {
  if (!Array.isArray(list)) return [];
  const out: LineupPlayer[] = [];
  for (const x of list.slice(0, 40)) {
    const n = name(x?.name);
    if (!n) continue;
    const pos = (str(x?.position, 20) ?? '').charAt(0).toUpperCase();
    const p: LineupPlayer = { n, no: int(x?.number, 0, 99), pos: pos === 'G' || pos === 'D' || pos === 'M' || pos === 'F' ? pos : null };
    if (x?.captain === true) p.c = true;
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

const formation = (v: unknown) => {
  const s = str(v, 20);
  return s && /^[1-6](-[1-6]){1,4}$/.test(s) ? s : null;
};

/** lineups ← التشكيلة (null لو ما فيه لاعبين) */
export function parseLineups(x: Any): Lineups | null {
  if (!x || typeof x !== 'object') return null;
  const h = players(x.home_xi, 11);
  const a = players(x.away_xi, 11);
  if (!h.length && !a.length) return null;
  return {
    ok: x.confirmed === true, hf: formation(x.home_formation), af: formation(x.away_formation),
    hc: name(x.home_coach), ac: name(x.away_coach),
    h, a, hs: players(x.home_subs, 20), as: players(x.away_subs, 20),
  };
}

/** /topscorers ← الهدافين. الفريق من رابط النادي في الترتيب (أضمن من الاسم)، وإلا من الاسم لو نعرفه */
export function parseTopScorers(body: Any, slugTeam: Record<string, number> = {}, known: Set<number> = new Set()): Scorer[] {
  const list: Any[] = Array.isArray(body?.scorers) ? body.scorers : [];
  const out: Scorer[] = [];
  for (const x of list.slice(0, 60)) {
    const n = name(x?.player);
    const goals = int(x?.goals, 0, 200);
    const rank = int(x?.rank, 1, 200);
    if (!n || goals == null || rank == null) continue;
    const slug = str(x?.team_slug, 80) ?? '';
    const tname = str(x?.team, 80);
    const byName = tname ? teamId(tname) : null;
    const team = Object.hasOwn(slugTeam, slug) ? slugTeam[slug] : byName != null && known.has(byName) ? byName : null;
    out.push({ rank, name: n, team, goals, assists: int(x?.assists, 0, 200), matches: int(x?.matches, 0, 99), minutes: int(x?.minutes, 0, 10000) });
    if (out.length >= 30) break;
  }
  return out;
}

/** /standings ← جدول الترتيب، والفرق اللي فيه، وروابط الأندية (نطلب جدول كل نادي منها) */
export function parseStandings(body: Any): { teams: Team[]; standings: Standing[]; slugs: string[]; slugTeam: Record<string, number> } {
  const groups: Any[] = Array.isArray(body?.tables) ? body.tables : [];
  const rows: Any[] = groups.flatMap((g) => (Array.isArray(g?.rows) ? g.rows : []));
  const teams = new Map<number, Team>();
  const standings = new Map<number, Standing>();
  const slugs: string[] = [];
  const slugTeam: Record<string, number> = {};
  for (const r of rows) {
    const name = str(r?.team, 80);
    const rank = int(r?.pos, 1, 40);
    if (!name || rank == null) continue;
    const id = teamId(name);
    if (standings.has(id)) continue;
    teams.set(id, { id, name, logo: logo(r?.team_logo) });
    const slug = str(r?.team_slug, 80);
    if (slug && /^[a-z0-9]+(?:-[a-z0-9]+){0,10}$/.test(slug)) { slugs.push(slug); slugTeam[slug] = id; }
    standings.set(id, {
      team: id, rank, points: int(r?.pts, -50, 200) ?? 0,
      played: int(r?.p, 0, 99), win: int(r?.w, 0, 99), draw: int(r?.d, 0, 99), lose: int(r?.l, 0, 99),
      gf: int(r?.gf, 0, 999), ga: int(r?.ga, 0, 999), form: null,
    });
  }
  return { teams: [...teams.values()], standings: [...standings.values()], slugs, slugTeam };
}

const DONE = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const rank = (m: Match) => (DONE.includes(m.status) ? 3 : m.status === 'NS' || m.status === 'TBD' ? 1 : 2);

/** نفس المباراة تجي من جدول الفريقين: نخلي الأحدث حالة (انتهت > مباشرة/مؤجلة > قادمة) */
export function mergeMatches(...lists: Match[][]): Match[] {
  const m = new Map<number, Match>();
  for (const l of lists) for (const x of l) {
    const old = m.get(x.id);
    if (!old || rank(x) >= rank(old)) m.set(x.id, x);
  }
  return [...m.values()];
}

/** دمج قوائم الفرق (الأخير يغلب، بس الشعار ما ينمسح) */
export function mergeTeams(...lists: Team[][]): Team[] {
  const m = new Map<number, Team>();
  for (const l of lists) for (const t of l) m.set(t.id, { ...t, logo: t.logo ?? m.get(t.id)?.logo ?? null });
  return [...m.values()];
}
