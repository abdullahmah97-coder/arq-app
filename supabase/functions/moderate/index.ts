// Supabase Edge Function: moderate
// الفحص الآلي للنصوص بعد النشر (ترحيل 20261014000940_auto_moderation): المنشورات والتعليقات، والرسائل الخاصة
// لو شغّلها المالك. ما يناديها التطبيق: pg_cron كل دقيقة (run_moderation) يصحّيها عبر pg_net لو فيه شي بالطابور،
// وهي تاخذ دفعات (moderation_claim) وتفحص كل نص بـ Qwen3Guard وترجع النتيجة (moderation_settle).
// النتيجة «غير آمن» أو «محل خلاف» تطلع للمشرف في بلاغات المجتمع، والقرار له (أو تنخفى مؤقتاً لو اختار وضع hide).
//
// النشر (بدون تحقق البوابة من التوكن: القاعدة تناديها بدون توكن، والدالة تتأكد من x-moderation-key بنفسها):
//   supabase functions deploy moderate --no-verify-jwt
//   الأسرار: HF_TOKEN (توكن Hugging Face من نوع fine-grained بصلاحية «Inference Providers» بس؛ يضيفه المالك بنفسه)
//   اختياري: HF_MODERATION_MODEL (الافتراضي Qwen/Qwen3Guard-Gen-4B:featherless-ai)
//            HF_MODERATION_CHAT_MODEL للرسائل (الافتراضي Qwen/Qwen3Guard-Gen-0.6B:featherless-ai)
//   والرابط بالـ vault مرة وحدة: select vault.create_secret('https://<ref>.supabase.co/functions/v1/moderate', 'moderation_url');
//
// الطلب: POST بدون جسم، ومعه x-moderation-key = سر moderation_key بالـ vault (نتأكد منه بـ rpc moderation_key_ok).
// الرد: { checked, flagged, failed, gone, skipped }  أو  { error }
//   405 method_not_allowed · 401 unauthorized · 503 hf_not_configured
// القاعدة تقطع الاتصال بعد ثانية، فالشغل كله يتسجّل بـ waitUntil ويكمل لحاله (٥٠ ثانية بالأكثر، قبل التصحية الجاية).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { checkText, cleanText, DEFAULT_CHAT_MODEL, DEFAULT_MODEL, FATAL, GuardError, modelFrom, type Verdict } from './guard.ts';

export { parseGuard, cleanText, modelFrom } from './guard.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const BATCH = 16;
export const PARALLEL = 4;
/** وقت التشغيلة كلها: أقل من دقيقة عشان ما تتداخل كثير مع التصحية الجاية */
export const BUDGET_MS = 50_000;
/** ما نحجز دفعة جديدة إذا باقي أقل من كذا (وقت نداء واحد مع هامش) */
const CLAIM_MARGIN_MS = 20_000;

type Job = { target_type: 'post' | 'comment' | 'checkin_comment' | 'message'; target_id: string; body: string | null; attempts: number; queued_at: string };
type Totals = { checked: number; flagged: number; failed: number; gone: number; skipped: number };

async function handle(db: SupabaseClient, token: string, job: Job, t: Totals, state: { stop: boolean }) {
  const ref = { p_type: job.target_type, p_id: job.target_id, p_queued_at: job.queued_at };
  if (state.stop) {
    t.skipped++;
    await db.rpc('moderation_retry', { ...ref, p_reason: 'skipped' });
    return;
  }
  const text = cleanText(job.body);
  if (!text) {
    t.gone++;
    await db.rpc('moderation_settle', { ...ref, p_result: 'gone' });
    return;
  }
  const main = modelFrom(Deno.env.get('HF_MODERATION_MODEL'), DEFAULT_MODEL);
  let model = job.target_type === 'message' ? modelFrom(Deno.env.get('HF_MODERATION_CHAT_MODEL'), DEFAULT_CHAT_MODEL) : main;
  const started = Date.now();
  let verdict: Verdict;
  try {
    verdict = await checkText(token, model, text);
    // الرسائل: الصغير قال غير آمن أو محل خلاف ← نتأكد بالأساسي (والقرار له)
    if (verdict.label !== 'safe' && model !== main) {
      model = main;
      verdict = await checkText(token, model, text);
    }
  } catch (e) {
    const reason = e instanceof GuardError ? e.reason : 'network';
    console.error('moderate_check_failed', job.target_type, reason, e instanceof Error ? e.message : String(e));
    // النموذج يتجهّز عند المزوّد: الباقي بيطيح بنفس الشي، فنوقف ونرجع بعد دقيقة بدون ما تنحسب محاولة
    if (reason === 'warming') {
      state.stop = true;
      t.skipped++;
      await db.rpc('moderation_retry', { ...ref, p_reason: 'skipped' });
      return;
    }
    if (FATAL.has(reason)) state.stop = true;
    t.failed++;
    await db.rpc('moderation_retry', { ...ref, p_reason: reason, p_model: model });
    return;
  }
  const { data, error } = await db.rpc('moderation_settle', {
    ...ref, p_result: verdict.label, p_categories: verdict.categories, p_model: model, p_ms: Date.now() - started,
  });
  if (error) {
    console.error('moderate_settle_failed', job.target_type, error.message);
    t.failed++;
    return;
  }
  t.checked++;
  if ((data as { flagged?: boolean } | null)?.flagged) t.flagged++;
}

/** دفعات لين يخلص الطابور أو الوقت. النداءات PARALLEL مع بعض */
export async function drain(db: SupabaseClient, token: string, now = () => Date.now()): Promise<Totals> {
  const started = now();
  const t: Totals = { checked: 0, flagged: 0, failed: 0, gone: 0, skipped: 0 };
  const state = { stop: false };
  while (!state.stop && now() - started < BUDGET_MS - CLAIM_MARGIN_MS) {
    const { data, error } = await db.rpc('moderation_claim', { p_limit: BATCH });
    if (error) { console.error('moderate_claim_failed', error.message); break; }
    const jobs = (data ?? []) as Job[];
    if (!jobs.length) break;
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try { await handle(db, token, job, t, state); }
        catch (e) { t.failed++; console.error('moderate_job_failed', e instanceof Error ? e.message : String(e)); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
    if (jobs.length < BATCH) break;
  }
  return t;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const key = req.headers.get('x-moderation-key') ?? '';
  if (!key || key.length > 500) return json({ error: 'unauthorized' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: ok, error } = await db.rpc('moderation_key_ok', { p_key: key });
  if (error || ok !== true) return json({ error: 'unauthorized' }, 401);

  const token = Deno.env.get('HF_TOKEN');
  if (!token) return json({ error: 'hf_not_configured' }, 503);

  const work = drain(db, token);
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work.catch(() => {}));
  try {
    return json(await work);
  } catch (e) {
    console.error('moderate_failed', e instanceof Error ? e.message : String(e));
    return json({ error: 'failed' }, 500);
  }
});
