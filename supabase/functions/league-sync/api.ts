// قراءة ردود API-Football (v3) وتحويلها للشكل اللي تاخذه league_ingest. منطق بحت بدون شبكة، عشان يتختبر.
// المراجع: https://www.api-football.com/documentation-v3 (fixtures, standings)

export const API_BASE = 'https://v3.football.api-sports.io';
export const DEFAULT_LEAGUE = 307; // دوري روشن السعودي للمحترفين
export const TIMEZONE = 'Asia/Riyadh';

export type Team = { id: number; name: string; logo: string | null };
export type Match = {
  id: number; league: number; season: number | null; round: string | null; kickoff: string; status: string;
  elapsed: number | null; home: number; away: number; hg: number | null; ag: number | null; venue: string | null; city: string | null;
};
export type Standing = {
  team: number; rank: number; points: number; played: number | null; win: number | null; draw: number | null;
  lose: number | null; gf: number | null; ga: number | null; form: string | null;
};

// deno-lint-ignore no-explicit-any
type Any = any;

const int = (v: unknown, min = 0, max = 1e9): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null;
const logo = (v: unknown): string | null => {
  const s = str(v, 300);
  return s && /^https:\/\/[^\s]+$/.test(s) ? s : null;
};
const status = (v: unknown): string => {
  const s = str(v, 5)?.toUpperCase() ?? '';
  return /^[A-Z0-9]{1,5}$/.test(s) ? s : 'TBD';
};

/** الموسم = سنة بدايته. الدوري السعودي يبدأ بأغسطس: من يوليو ولين آخر السنة = السنة نفسها، وقبلها = السنة اللي قبل */
export function seasonFor(now: Date, override?: unknown): number {
  const o = Number(override);
  if (override != null && override !== '' && Number.isInteger(o) && o >= 2000 && o <= 2100) return o;
  const riyadh = new Date(now.getTime() + 3 * 3600e3);
  return riyadh.getUTCMonth() >= 6 ? riyadh.getUTCFullYear() : riyadh.getUTCFullYear() - 1;
}

/** تاريخ الرياض YYYY-MM-DD بعد إزاحة أيام */
export function riyadhDate(now: Date, days = 0): string {
  return new Date(now.getTime() + 3 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);
}

/** وقت المباريات: أمس لين بكرة بتوقيت الرياض (مباراة تعدّي نص الليل تنمسك، ومباراة تبدأ بعد نص الليل بعد) */
export function liveRange(now: Date): { from: string; to: string } {
  return { from: riyadhDate(now, -1), to: riyadhDate(now, 1) };
}

/** خطأ المزوّد: يجي بحقل errors (مصفوفة فاضية أو كائن نصوص) حتى لو الرد 200 */
export function apiError(body: Any): string | null {
  const e = body?.errors;
  if (!e || (Array.isArray(e) && e.length === 0)) return null;
  const vals = Array.isArray(e) ? e : typeof e === 'object' ? Object.values(e) : [e];
  for (const v of vals) {
    const s = str(typeof v === 'string' ? v : JSON.stringify(v), 300);
    if (s && s !== '{}' && s !== '[]') return s;
  }
  return null;
}

/** الطلبات الباقية اليوم من الهيدر x-ratelimit-requests-remaining */
export function requestsLeft(h: string | null): number | null {
  if (h == null || !/^\d{1,9}$/.test(h.trim())) return null;
  return Number(h.trim());
}

/** /fixtures ← الفرق والمباريات (نتجاهل أي مباراة من دوري ثاني أو ناقصة) */
export function parseFixtures(body: Any, league: number): { teams: Team[]; matches: Match[] } {
  const list: Any[] = Array.isArray(body?.response) ? body.response : [];
  const teams = new Map<number, Team>();
  const matches: Match[] = [];
  for (const f of list) {
    const id = int(f?.fixture?.id, 1);
    const lg = int(f?.league?.id, 1);
    const home = f?.teams?.home;
    const away = f?.teams?.away;
    const hid = int(home?.id, 1);
    const aid = int(away?.id, 1);
    const kickoff = str(f?.fixture?.date, 40);
    if (id == null || hid == null || aid == null || hid === aid || !kickoff || Number.isNaN(Date.parse(kickoff))) continue;
    if (lg != null && lg !== league) continue;
    for (const [tid, t] of [[hid, home], [aid, away]] as const) {
      const name = str(t?.name, 80);
      if (name) teams.set(tid, { id: tid, name, logo: logo(t?.logo) });
    }
    matches.push({
      id, league: lg ?? league, season: int(f?.league?.season, 2000, 2100), round: str(f?.league?.round, 60),
      kickoff: new Date(kickoff).toISOString(), status: status(f?.fixture?.status?.short),
      elapsed: int(f?.fixture?.status?.elapsed, 0, 200), home: hid, away: aid,
      hg: int(f?.goals?.home, 0, 99), ag: int(f?.goals?.away, 0, 99),
      venue: str(f?.fixture?.venue?.name, 80), city: str(f?.fixture?.venue?.city, 60),
    });
  }
  return { teams: [...teams.values()], matches };
}

/** /standings ← جدول الترتيب (والفرق اللي فيه، لو ما جت من المباريات) */
export function parseStandings(body: Any): { teams: Team[]; standings: Standing[] } {
  const groups = body?.response?.[0]?.league?.standings;
  const rows: Any[] = Array.isArray(groups) ? groups.flat() : [];
  const teams = new Map<number, Team>();
  const standings = new Map<number, Standing>();
  for (const r of rows) {
    const team = int(r?.team?.id, 1);
    const rank = int(r?.rank, 1, 40);
    if (team == null || rank == null || standings.has(team)) continue;
    const name = str(r?.team?.name, 80);
    if (name) teams.set(team, { id: team, name, logo: logo(r?.team?.logo) });
    const form = str(r?.form, 10)?.toUpperCase() ?? null;
    standings.set(team, {
      team, rank, points: int(r?.points, -50, 200) ?? 0,
      played: int(r?.all?.played, 0, 99), win: int(r?.all?.win, 0, 99), draw: int(r?.all?.draw, 0, 99),
      lose: int(r?.all?.lose, 0, 99), gf: int(r?.all?.goals?.for, 0, 999), ga: int(r?.all?.goals?.against, 0, 999),
      form: form && /^[WDL]+$/.test(form) ? form : null,
    });
  }
  return { teams: [...teams.values()], standings: [...standings.values()] };
}

/** دمج قوائم الفرق (الأخير يغلب) */
export function mergeTeams(...lists: Team[][]): Team[] {
  const m = new Map<number, Team>();
  for (const l of lists) for (const t of l) m.set(t.id, t);
  return [...m.values()];
}
