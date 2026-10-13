// فحص نص واحد بنموذج Qwen3Guard-Gen عبر Hugging Face Inference Providers (واجهة متوافقة مع OpenAI)
// الرخصة: Apache-2.0 (تجاري مسموح). المزوّد مثبّت في اسم النموذج بعد «:» (مثل :featherless-ai) عشان ما يتغيّر لحاله.
// ما يروح للمزوّد إلا النص نفسه: بدون اسم صاحبه أو أي معرّف.

export const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
export const DEFAULT_MODEL = 'Qwen/Qwen3Guard-Gen-4B:featherless-ai';
/** الرسائل الخاصة: نسخة أصغر وأرخص أول، وأي نتيجة غير «آمن» تنعاد بالنموذج الأساسي */
export const DEFAULT_CHAT_MODEL = 'Qwen/Qwen3Guard-Gen-0.6B:featherless-ai';
export const CALL_TIMEOUT_MS = 15_000;
export const MAX_CHARS = 1000;

export type Label = 'safe' | 'unsafe' | 'controversial';
export interface Verdict { label: Label; categories: string[] }
/** أسباب الفشل: auth و credits و model مشكلة إعداد (توقف الدفعة كلها)، والباقي يعاد المحتوى نفسه لاحقاً.
 *  warming: المزوّد مو جاهز للنموذج: يحمّله (أول طلب بعد فترة، 400 model_pending_deploy) أو طاقته مليانة
 *  (503 capacity_exhausted). توقف الدفعة ويرجع بعد دقيقة بدون ما تنحسب محاولة، فما ينشال شي بدون فحص */
export type FailReason = 'auth' | 'credits' | 'model' | 'warming' | 'http_429' | 'http_5xx' | 'http_4xx' | 'timeout' | 'network' | 'bad_output';
export const FATAL: ReadonlySet<FailReason> = new Set(['auth', 'credits', 'model']);

export class GuardError extends Error {
  constructor(readonly reason: FailReason, detail = '') { super(`${reason}${detail ? `: ${detail}` : ''}`); }
}

// أسماء الفئات بالحرف من بطاقة النموذج ← رموزنا. (Non-violent قبل Violent عشان ما تنقرأ «عنف»)
const CATEGORY_CODES: [string, string][] = [
  ['Non-violent Illegal Acts', 'illegal'],
  ['Violent', 'violent'],
  ['Sexual Content or Sexual Acts', 'sexual'],
  ['Personally Identifiable Information', 'pii'],
  ['PII', 'pii'],
  ['Suicide & Self-Harm', 'self_harm'],
  ['Unethical Acts', 'unethical'],
  ['Politically Sensitive Topics', 'political'],
  ['Copyright Violation', 'copyright'],
  ['Jailbreak', 'jailbreak'],
];
const CATEGORY_RE = new RegExp(CATEGORY_CODES.map(([n]) => n.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')).join('|'), 'g');

/** رد النموذج: «Safety: Unsafe\nCategories: Violent, PII» ← { label, categories }. غير كذا = null */
export function parseGuard(content: unknown): Verdict | null {
  if (typeof content !== 'string') return null;
  const m = /Safety:\s*(Safe|Unsafe|Controversial)\b/.exec(content);
  if (!m) return null;
  const label = m[1].toLowerCase() as Label;
  const line = /Categories:\s*([^\n]*)/.exec(content)?.[1] ?? '';
  const map = new Map(CATEGORY_CODES);
  const categories = [...new Set([...line.matchAll(CATEGORY_RE)].map((x) => map.get(x[0])!))].sort();
  return { label, categories };
}

/** النص قبل ما يروح: بدون رموز التحكم، مسافات موحّدة، ١٠٠٠ حرف بالأكثر */
export function cleanText(v: unknown): string {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

/** اسم النموذج من متغير البيئة لو شكله صحيح (owner/name أو owner/name:provider)، وإلا الافتراضي */
export function modelFrom(v: string | undefined, dflt: string): string {
  const s = (v ?? '').trim();
  return /^[\w.-]+\/[\w.-]+(:[\w.-]+)?$/.test(s) ? s : dflt;
}

function reasonFor(status: number): FailReason {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'credits';
  if (status === 404) return 'model';
  if (status === 429) return 'http_429';
  if (status >= 500) return 'http_5xx';
  return 'http_4xx';
}

export async function checkText(token: string, model: string, text: string, timeoutMs = CALL_TIMEOUT_MS): Promise<Verdict> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(HF_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 32, temperature: 0, stream: false }),
      });
    } catch (e) {
      throw new GuardError((e as Error)?.name === 'AbortError' ? 'timeout' : 'network');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const warming = (res.status === 400 && /"code"\s*:\s*"model_pending_deploy"/.test(detail))
        || (res.status === 503 && /"code"\s*:\s*"capacity_exhausted"/.test(detail));
      throw new GuardError(warming ? 'warming' : reasonFor(res.status), `${res.status} ${detail.slice(0, 200)}`);
    }
    let body: { choices?: { message?: { content?: unknown } }[] };
    try { body = await res.json(); } catch (e) {
      throw new GuardError((e as Error)?.name === 'AbortError' ? 'timeout' : 'bad_output', 'not json');
    }
    const content = body?.choices?.[0]?.message?.content;
    const verdict = parseGuard(content);
    if (!verdict) throw new GuardError('bad_output', String(content ?? '').slice(0, 80));
    return verdict;
  } finally {
    clearTimeout(timer);
  }
}
