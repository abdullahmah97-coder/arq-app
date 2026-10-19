// أسماء لاعبي الدوري بالعربي. المزوّد (SportScore) يرسل الأسماء بالإنجليزي، فنكتبها بالعربي مرة وحدة ونحفظها (league_players):
//   ١) Wikidata أول (بياناتها CC0): اللاعب اللي اسمه الإنجليزي نفس اسمه هناك ومهنته «لاعب كرة قدم» وله اسم عربي ← نأخذه
//      (لو أكثر من لاعب بنفس الاسم: اللي اسمه الأساسي يطابق قبل الاسم البديل، وبعدها الأشهر = أكثر روابط ويكيبيديا)
//   ٢) والباقي يكتبه Claude بالطريقة الشائعة في الإعلام الرياضي السعودي (مصدره «claude» عشان نعرف إنه آلي)
// ما ينرسل أي شي عن المستخدمين: أسماء لاعبين عامة بس.
import {
  Anthropic, arrayOf, effortFrom, fallbackFor, logError, logStop, modelFrom, obj, readJson, STR,
} from '../_shared/claude.ts';

export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
/** لاعب كرة قدم (Q937857) */
export const FOOTBALLER = 'Q937857';
export const WIKIDATA_BATCH = 40;
export const CLAUDE_MAX = 150;
export const CLAUDE_TIMEOUT_MS = 60_000;

export type ArName = { name: string; ar: string; source: 'wikidata' | 'claude'; qid?: string };

/** اسم عربي صالح: حروف عربية ومسافات (والشرطة والنقطة)، بدون لاتيني ولا أرقام ولا أقواس. الأقواس التوضيحية تنشال */
export function cleanAr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s*\([^)]*\)/g, ' ').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 60) return null;
  if (!/[\u0621-\u064a]/.test(s)) return null;
  return /^[\u0600-\u06ff\u0750-\u077f .'\-]+$/.test(s) ? s : null;
}

const lit = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"@en`;

/** استعلام SPARQL لمجموعة أسماء: الاسم الأساسي أو البديل، مهنته لاعب كرة قدم، واسمه العربي والإنجليزي وعدد روابطه.
 *  (مسار label|altLabel بدل UNION مع BIND: الثاني يخلي Blazegraph يمسح كل الأسماء ويطوّل لين ينقطع) */
export function sparqlFor(names: string[]): string {
  return `SELECT ?name ?item ?ar ?en ?links WHERE {
  VALUES ?name { ${names.map(lit).join(' ')} }
  ?item rdfs:label|skos:altLabel ?name .
  ?item wdt:P106 wd:${FOOTBALLER} .
  ?item rdfs:label ?ar . FILTER(LANG(?ar) = "ar")
  OPTIONAL { ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wikibase:sitelinks ?links }
}`;
}

// deno-lint-ignore no-explicit-any
type Any = any;

/** رد SPARQL ← الاسم العربي لكل اسم لقيناه (الأفضل لكل اسم) */
export function parseSparql(body: Any, names: string[]): Map<string, { ar: string; qid: string }> {
  const want = new Set(names);
  const best = new Map<string, { ar: string; qid: string; m: number; links: number }>();
  const rows: Any[] = Array.isArray(body?.results?.bindings) ? body.results.bindings : [];
  for (const b of rows) {
    const name = b?.name?.value;
    const qid = /\/(Q\d{1,12})$/.exec(String(b?.item?.value ?? ''))?.[1];
    const ar = cleanAr(b?.ar?.value);
    if (typeof name !== 'string' || !want.has(name) || !qid || !ar) continue;
    // اسمه الإنجليزي الأساسي نفس الاسم = 1، والاسم البديل = 2
    const m = b?.en?.value === name ? 1 : 2;
    const links = Number(b?.links?.value) || 0;
    const old = best.get(name);
    if (!old || m < old.m || (m === old.m && links > old.links)) best.set(name, { ar, qid, m, links });
  }
  return new Map([...best].map(([k, v]) => [k, { ar: v.ar, qid: v.qid }]));
}

type Fetch = typeof fetch;

/** Wikidata على دفعات (٤٠ اسم). دفعة طاحت ← نكمل، والأسماء اللي فيها تروح لـ Claude */
export async function fromWikidata(names: string[], userAgent: string, pause: (ms: number) => Promise<void>, f: Fetch = fetch): Promise<ArName[]> {
  const out: ArName[] = [];
  for (let i = 0; i < names.length; i += WIKIDATA_BATCH) {
    const batch = names.slice(i, i + WIKIDATA_BATCH);
    if (i > 0) await pause(300);
    try {
      const url = `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(sparqlFor(batch))}`;
      const res = await f(url, { headers: { 'User-Agent': userAgent, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { await res.body?.cancel().catch(() => {}); console.error('league_names_wikidata', res.status); continue; }
      const got = parseSparql(await res.json(), batch);
      for (const [name, v] of got) out.push({ name, ar: v.ar, source: 'wikidata', qid: v.qid });
    } catch (e) {
      console.error('league_names_wikidata', e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}

const SCHEMA = obj({ names: arrayOf(obj({ name: STR, ar: STR })) });

export const claudePrompt = (names: string[]) => `These are football players in the Saudi Pro League (Roshn Saudi League), written in Latin letters exactly as our data provider sends them.
Write each player's name in Arabic letters the way Saudi sports media usually writes it.
- Saudi and other Arab players: their real Arabic name (e.g. "Salem Al-Dawsari" → "سالم الدوسري", "Mohammed Kanno" → "محمد كنو").
- Everyone else: the common Arabic transliteration (e.g. "Cristiano Ronaldo" → "كريستيانو رونالدو", "Ivan Toney" → "إيفان توني").
- "Al-" / "Al " before a family name is written joined: "الدوسري".
- A leading initial like "A." stays a short initial.
- Arabic letters and spaces only: no Latin letters, digits, brackets or notes.
Return every input name exactly as given (same spelling) in "name", with its Arabic form in "ar".

Players:
${names.map((n) => `- ${n}`).join('\n')}`;

/** الأسماء اللي ما لقيناها في Wikidata ← Claude (طلب واحد). null = ما قدرنا نسأله (بدون مفتاح أو خطأ) */
export async function fromClaude(names: string[]): Promise<ArName[] | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey || !names.length) return null;
  const ask = names.slice(0, CLAUDE_MAX);
  const model = modelFrom('ANTHROPIC_LEAGUE_MODEL', 'ANTHROPIC_MODEL');
  const client = new Anthropic({ apiKey, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 1 });
  let res;
  try {
    res = await client.beta.messages.create({
      model, max_tokens: 1000 + ask.length * 60, ...fallbackFor(model),
      output_config: { effort: effortFrom('ANTHROPIC_LEAGUE_EFFORT', 'low'), format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: claudePrompt(ask) }],
    });
  } catch (e) {
    logError('league-sync', e);
    return null;
  }
  const r = readJson(res);
  if ('fail' in r) { logStop('league-sync', res, r.fail); return null; }
  const want = new Set(ask);
  const out: ArName[] = [];
  const list = Array.isArray(r.json.names) ? r.json.names : [];
  for (const x of list as { name?: unknown; ar?: unknown }[]) {
    const ar = cleanAr(x?.ar);
    if (typeof x?.name !== 'string' || !want.has(x.name) || !ar) continue;
    want.delete(x.name);
    out.push({ name: x.name, ar, source: 'claude' });
  }
  return out;
}
