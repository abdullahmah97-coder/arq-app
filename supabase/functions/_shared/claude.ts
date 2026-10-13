// أدوات Claude المشتركة لدوال الذكاء الاصطناعي الخمس (analyze-meal، barcode-lookup، analyze-inbody، coach، generate-plan).
// كلها تكلّم Claude عن طريق الـ SDK (نفس نسخة office-agent)، بنموذج وجهد (effort) يتغيّرون من متغيرات البيئة،
// ومخرجات مهيكلة (JSON schema) لما الدالة تقرا JSON، والرجوع لنموذج بديل لو النموذج يدعمه، وتسجيل التوكنات
// على صف ai_usage حق الطلب (ai_usage_note) بدون ما يأثّر على رد المستخدم لو فشل.
//
// Supabase يجمع هذا الملف مع كل دالة تستورده عند النشر (supabase functions deploy <name>).

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export { Anthropic };
export type Message = Anthropic.Beta.BetaMessage;
export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type ContentBlock = Anthropic.Beta.BetaContentBlock;

/** النموذج الافتراضي لكل الدوال الخمس (نفس سعر claude-sonnet-5: ٢$ / ١٠$ للمليون) */
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

/** النموذج: أول متغير بيئة موجود (بالترتيب)، وإلا الافتراضي */
export function modelFrom(...names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n)?.trim();
    if (v) return v;
  }
  return DEFAULT_MODEL;
}

/** الجهد من متغير البيئة؛ قيمة غلط أو فاضية = الافتراضي */
export function effortFrom(name: string, dflt: Effort): Effort {
  const v = (Deno.env.get(name) ?? '').trim().toLowerCase();
  return (EFFORTS as readonly string[]).includes(v) ? (v as Effort) : dflt;
}

/** النماذج اللي تقبل fallbacks: "default" (غيرها يرجع 400، فما نرسله لها) */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

/** لو الطلب انرفض، Anthropic يعيده على النموذج البديل اللي يوصي فيه (بنفس الطلب) — للنماذج اللي تدعمه بس */
export function fallbackFor(model: string): { betas?: string[]; fallbacks?: 'default' } {
  return FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
}

// ---------------------------------------------------------------------------
// شكل الرد (structured outputs): type / properties / required / additionalProperties / enum / items / anyOf بس
// (بدون minimum/maximum/minLength: الـ API ما يقبلها، والتنظيف والحدود تبقى بالدالة)
// ---------------------------------------------------------------------------
export type Schema = Record<string, unknown>;
export const STR: Schema = { type: 'string' };
export const NUM: Schema = { type: 'number' };
export const INT: Schema = { type: 'integer' };
export const BOOL: Schema = { type: 'boolean' };
export const arrayOf = (items: Schema): Schema => ({ type: 'array', items });
export const enumOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
export const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
/** كائن: كل الحقول مطلوبة إلا اللي في optional */
export const obj = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({
  type: 'object', properties, required: Object.keys(properties).filter((k) => !optional.includes(k)), additionalProperties: false,
});
/** نص بلغتين {ar, en} */
export const BI: Schema = obj({ ar: STR, en: STR });

// ---------------------------------------------------------------------------
// الصور: الأنواع اللي يقبلها Claude وحد حجم الصورة (١٠ ميقا بعد base64 مع Claude API مباشرة)
// ---------------------------------------------------------------------------
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
export const IMAGE_MAX_B64 = 10_000_000;
/** طول base64 لملف بهالحجم */
export const b64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

/** نوع الصورة من أول بايتات الملف (مو من الاسم أو content-type)؛ null = نوع ما يقبله Claude (HEIC وغيره) */
export function sniffImage(b: Uint8Array): ImageType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (b.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b.length > 6 && ascii(0, 4) === 'GIF8') return 'image/gif';
  return null;
}

// ---------------------------------------------------------------------------
// قراءة الرد
// ---------------------------------------------------------------------------
/** نص الرد (كتل text بس، بالترتيب؛ كتل التفكير والبحث وغيرها تنشال) */
export const textOf = (content: readonly { type: string; text?: string }[] | null | undefined) =>
  (content ?? []).flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');

/** ليش ما طلع JSON نستخدمه: refused = رفض، truncated = انقطع عند max_tokens، bad_output = غير كذا */
export type JsonFail = 'refused' | 'truncated' | 'bad_output';

/** رد بمخرجات مهيكلة → كائن JSON، أو سبب الفشل. نشيّك stop_reason قبل ما نقرا المحتوى */
export function readJson(res: Pick<Message, 'stop_reason' | 'content'>): { json: Record<string, unknown> } | { fail: JsonFail } {
  if (res.stop_reason === 'refusal') return { fail: 'refused' };
  if (res.stop_reason === 'max_tokens') return { fail: 'truncated' };
  if (res.stop_reason !== 'end_turn' && res.stop_reason !== 'stop_sequence') return { fail: 'bad_output' };
  try {
    const v: unknown = JSON.parse(textOf(res.content));
    if (v && typeof v === 'object' && !Array.isArray(v)) return { json: v as Record<string, unknown> };
  } catch { /* مو JSON */ }
  return { fail: 'bad_output' };
}

/** سبب الوقوف بالسجل (أرقام وأنواع بس، بدون محتوى المستخدم) */
export function logStop(fn: string, res: Pick<Message, 'stop_reason' | 'stop_details' | 'model'>, why: string) {
  console.warn('ai_stop', JSON.stringify({ fn, why, stop: res.stop_reason ?? null, category: res.stop_details?.category ?? null, model: res.model ?? null }));
}

/** خطأ من الـ SDK → سطر بالسجل (النوع والحالة بس) */
export function logError(fn: string, e: unknown) {
  const kind = e instanceof Anthropic.APIConnectionTimeoutError ? 'timeout'
    : e instanceof Anthropic.APIConnectionError ? 'network'
    : e instanceof Anthropic.RateLimitError ? 'rate_limit'
    : e instanceof Anthropic.BadRequestError ? 'bad_request'
    : e instanceof Anthropic.InternalServerError ? 'server'
    : e instanceof Anthropic.APIError ? 'api'
    : 'other';
  const status = e instanceof Anthropic.APIError ? (e.status ?? null) : null;
  console.error('anthropic_error', JSON.stringify({ fn, kind, status, message: String((e as Error)?.message ?? e).slice(0, 200) }));
  return kind;
}

// ---------------------------------------------------------------------------
// تسجيل التوكنات (ai_usage_note): يكتب على آخر صف ai_usage لنفس النوع للمستخدم (آخر ربع ساعة)، وما يرمي أبداً
// ---------------------------------------------------------------------------
const USAGE_KEYS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const;
type UsageKey = (typeof USAGE_KEYS)[number];
type Counts = Record<UsageKey, number | null>;

/** مجموع رقم من عدة مصادر؛ لو ولا واحد فيه الرقم = null (القاعدة تخليه فاضي، مو صفر) */
function sumCounts(rows: readonly Partial<Record<UsageKey, unknown>>[]): Counts {
  const out = {} as Counts;
  for (const k of USAGE_KEYS) {
    let s: number | null = null;
    for (const r of rows) {
      const v = r?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) s = (s ?? 0) + Math.max(0, Math.round(v));
    }
    out[k] = s;
  }
  return out;
}

/** توكنات رد واحد. لو اشتغل النموذج البديل (fallback_message في usage.iterations): الـ usage فوق فيه المحاولة
 *  اللي رجع ردها بس، والمحاولة المرفوضة تنحسب بعد، فنجمع كل المحاولات (message و fallback_message؛ بدون compaction).
 *  غير كذا الـ usage فوق (فيه دورات البحث كلها) */
export function usageOf(r: Pick<Message, 'usage'>): Counts {
  const its = (r.usage?.iterations ?? []) as readonly { type?: string }[];
  if (its.some((it) => it?.type === 'fallback_message')) {
    return sumCounts(its.filter((it) => it?.type === 'message' || it?.type === 'fallback_message') as Partial<Record<UsageKey, unknown>>[]);
  }
  return sumCounts(r.usage ? [r.usage as unknown as Partial<Record<UsageKey, unknown>>] : []);
}

export async function noteUsage(db: SupabaseClient, kind: string, responses: readonly Message[], requested: string): Promise<void> {
  if (!responses.length) return;
  const total = sumCounts(responses.map(usageOf));
  // النماذج اللي اشتغلت: اللي رفض (كتلة fallback ← from) ثم اللي رد فعلاً؛ لو أكثر من واحد نجمعهم
  const models = responses.flatMap((r) => [
    ...(r.content ?? []).flatMap((b) => (b?.type === 'fallback' && typeof b.from?.model === 'string' ? [b.from.model] : [])),
    (typeof r.model === 'string' && r.model) || requested,
  ]);
  const model = [...new Set(models)].join(',').slice(0, 60);
  try {
    const { error } = await db.rpc('ai_usage_note', {
      p_kind: kind, p_model: model,
      p_input: total.input_tokens, p_output: total.output_tokens,
      p_cache_read: total.cache_read_input_tokens, p_cache_write: total.cache_creation_input_tokens,
    });
    if (error) console.warn('ai_usage_note_failed', kind, String(error.message ?? '').slice(0, 160));
  } catch (e) {
    console.warn('ai_usage_note_failed', kind, String((e as Error)?.message ?? e).slice(0, 160));
  }
}

/** شغل بالخلفية بعد الرد (EdgeRuntime.waitUntil)؛ بدونه (الاختبارات) ننتظره */
export function afterResponse(p: Promise<unknown>): Promise<unknown> {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(p); return Promise.resolve(); }
  return p;
}

/** الحد اليومي: رد ai_take. legacy = القاعدة قبل الترحيل (ما تعرف هالنوع) فالدالة ترجع لحدها القديم */
export function takeResult(error: { message?: string } | null): 'ok' | 'rate_limited' | 'legacy' | 'failed' {
  if (!error) return 'ok';
  const m = String(error.message ?? '');
  if (/rate_limited/.test(m)) return 'rate_limited';
  if (/bad_status|ai_usage_kind_check/.test(m)) return 'legacy';
  return 'failed';
}
