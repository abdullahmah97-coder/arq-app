// Supabase Edge Function: office-agent
// وكلاء مكتب أرك أب (للإدارة بس): المالك يضغط «شغّل الوكيل» على مكتب، والوكيل (Claude) يجهّز الشغل
// ويحفظه صفوف في office_tasks. الاقتراحات تنتظر موافقة المالك (waiting_approval): التطبيق هو اللي يطبّقها
// بجلسة المالك نفسه بعد ما يوافق، والوكيل ما يغيّر أي بيانات بالتطبيق. ملخص المدير اليومي للعلم بس (done على طول).
//
// المكاتب: reports (فرز البلاغات الجديدة) · clubs / stores / coaches / care (مراجعة طلبات الشركاء) · marketing (مسودة تنبيه)
//   ai (مراجعة حدود الذكاء الاصطناعي) · lead (ملخص اليوم). users ما له وكيل للحين (agent_unavailable).
// كل عنصر ينراجع مرة وحدة: اللي له مهمة بأي حالة غير failed ما يرجع له. ٥ عناصر بالأكثر بالتشغيلة.
// كل مهمة تحجز من حد المالك اليومي قبل الذكاء الاصطناعي: ai_take('office') = ٨٠ باليوم (ترحيل 20261007000880).
//
// النشر:
//   supabase functions deploy office-agent
//   (ANTHROPIC_API_KEY، و ANTHROPIC_OFFICE_MODEL اختياري — الافتراضي claude-opus-5-5)
//
// الطلب (POST، بتوكن المالك): { desk: DeskId, brief?: string, request_id?: string }
//   brief: ملاحظة المالك لمكتب التسويق (٣٠٠ حرف، بدون < > ورموز التحكم، وتروح للنموذج داخل وسم <owner_brief>)
//   request_id: ينحفظ مع كل مهمة عشان التطبيق يلقاها لو انقطع الاتصال
// الرد: { ran, waiting, done, failed, skipped }  أو  { error }
//   405 method_not_allowed · 503 ai_not_configured · 401 unauthorized · 400 bad_json · 403 not_allowed
//   400 bad_input · 400 agent_unavailable · 429 rate_limited · 503 busy · 500 save_failed
// المهمة اللي تفشل تنحفظ failed مع error: ai_failed | ai_bad_output | ai_refused | timeout (والمعلّقة أكثر من ربع ساعة: stale)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { clean, DESK_IDS, cleanOutput, type DeskId } from './agents.ts';
import { collectJobs, type Job } from './jobs.ts';

export { clean, cleanOutput, schemaFor, systemFor, validNudgeText, inLocale, NUDGE_VARS } from './agents.ts';
export { aggregateUsage, PER_RUN } from './jobs.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const AI_TIMEOUT_MS = 90_000;
export const MAX_TOKENS = 16_000;
/** كم مهمة تشتغل مع بعض */
export const CONCURRENCY = 3;
/** المهمة اللي بقت in_progress أكثر من كذا: الدالة انقطعت قبل ما تخلص */
const STALE_MS = 15 * 60_000;

type FailCode = 'ai_failed' | 'ai_bad_output' | 'ai_refused' | 'timeout';
type Outcome = 'waiting' | 'done' | 'failed';

/** يتحقق من الطلب: المكتب معروف، و request_id بالشكل الصحيح لو موجود */
export function checkRequest(body: unknown): { desk: DeskId; brief: string | null; requestId: string | null } | { error: 'bad_input' | 'agent_unavailable' } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_input' };
  const b = body as Record<string, unknown>;
  if (!(DESK_IDS as unknown[]).includes(b.desk)) return { error: 'bad_input' };
  let requestId: string | null = null;
  if (b.request_id !== undefined && b.request_id !== null) {
    if (typeof b.request_id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(b.request_id)) return { error: 'bad_input' };
    requestId = b.request_id;
  }
  if (b.desk === 'users') return { error: 'agent_unavailable' };
  return { desk: b.desk as DeskId, brief: clean(b.brief, 300) || null, requestId };
}

/** خطأ الذكاء الاصطناعي → رمز قصير ينحفظ بالمهمة */
function failCode(e: unknown): FailCode {
  const m = e instanceof Error ? e.message : '';
  if (m === 'ai_refused' || m === 'ai_bad_output') return m;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  return 'ai_failed';
}

/** يشغّل المهام بالتوازي (CONCURRENCY بالمرة) */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/** مهمة وحدة: Claude → تنظيف الرد → waiting_approval (أو done لملخص المدير)، وأي خطأ → failed برمزه */
async function runTask(db: SupabaseClient, client: Anthropic, model: string, id: string, job: Job): Promise<Outcome> {
  const started = Date.now();
  try {
    const { text, images } = await job.build();
    const res = await client.beta.messages.create({
      model, max_tokens: MAX_TOKENS,
      // لو رفض الطلب، Anthropic يعيده على النموذج البديل اللي يوصي فيه (بنفس الطلب)
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: job.schema } },
      system: job.system,
      messages: [{ role: 'user', content: [...images, { type: 'text', text }] }],
    });
    if (res.stop_reason === 'refusal') throw new Error('ai_refused');
    // انقطع الرد قبل ما يكمل الـ JSON
    if (res.stop_reason === 'max_tokens') throw new Error('ai_bad_output');
    const raw = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('ai_bad_output'); }
    const output = cleanOutput(job.kind, parsed, job.locale);
    const status = job.kind === 'daily_brief' ? 'done' : 'waiting_approval';
    const served = typeof res.model === 'string' && res.model ? res.model.slice(0, 60) : model.slice(0, 60);
    const { error } = await db.from('office_tasks').update({ status, output, model: served }).eq('id', id).eq('status', 'in_progress');
    if (error) throw Object.assign(new Error('ai_failed'), { why: `save: ${error.message}` });
    console.log('office_task', JSON.stringify({ kind: job.kind, status, ms: Date.now() - started }));
    return status === 'done' ? 'done' : 'waiting';
  } catch (e) {
    const code = failCode(e);
    // نسجّل الرمز والسبب (بدون محتوى المستخدمين)
    console.error('office_task_failed', JSON.stringify({ kind: job.kind, code, why: (e as { why?: string })?.why ?? String((e as Error)?.message ?? e).slice(0, 160), status: (e as { status?: number })?.status ?? null }));
    const { error } = await db.from('office_tasks').update({ status: 'failed', error: code }).eq('id', id).eq('status', 'in_progress');
    if (error) console.error('office_fail_save_failed', error.message);
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// الدالة
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ai_not_configured' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  // للإدارة بس: نسأل القاعدة بتوكن المالك نفسه
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || isAdmin !== true) return json({ error: 'not_allowed' }, 403);

  const r = checkRequest(body);
  if ('error' in r) return json({ error: r.error }, 400);

  // مفتاح الخدمة: قراءة الطلبات والبلاغات وكتابة office_tasks (المالك يقرا المهام بس، والقرار عبر office_decide)
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // تنظيف: مهمة بقت in_progress أكثر من ربع ساعة = الدالة انقطعت قبل ما تخلص، فتنفك عن عنصرها
  const { error: staleError } = await db.from('office_tasks').update({ status: 'failed', error: 'stale' })
    .eq('status', 'in_progress').lt('created_at', new Date(Date.now() - STALE_MS).toISOString());
  if (staleError) console.warn('office_stale_failed', staleError.message);

  let jobs: Job[];
  try {
    jobs = await collectJobs(r.desk, { db, user: supabase, brief: r.brief });
  } catch (e) {
    console.error('office_collect_failed', r.desk, String(e).slice(0, 160));
    return json({ error: 'busy' }, 503);
  }
  const counts = { ran: 0, waiting: 0, done: 0, failed: 0, skipped: 0 };
  if (!jobs.length) return json(counts);

  // كل مهمة تحجز من الحد قبل ما تنحفظ. الحد خلص قبل أول مهمة = 429، وبعدها نوقف ونحسب الباقي skipped
  const model = Deno.env.get('ANTHROPIC_OFFICE_MODEL') ?? 'claude-opus-5-5';
  const created: { id: string; job: Job }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const { error: takeError } = await supabase.rpc('ai_take', { p_kind: 'office' });
    if (takeError) {
      const m = String(takeError.message ?? '');
      if (!created.length) {
        if (/rate_limited/.test(m)) return json({ error: 'rate_limited' }, 429);
        console.error('office_take_failed', m);
        return json({ error: 'busy' }, 503);
      }
      // المهام اللي انحفظت تكمّل (لو وقفنا هنا تبقى معلّقة لين تصير stale)
      if (!/rate_limited/.test(m)) console.error('office_take_failed', m);
      counts.skipped += jobs.length - i;
      break;
    }
    const { data, error } = await db.from('office_tasks').insert({
      desk: job.desk, kind: job.kind, target_kind: job.target_kind, target_id: job.target_id, title: job.title,
      status: 'in_progress', input: job.input, model: model.slice(0, 60), request_id: r.requestId, created_by: user.id,
    }).select('id').single();
    if (error) {
      // تشغيلة ثانية أخذت نفس العنصر بنفس اللحظة (فهرس office_tasks_open_target)
      if (error.code === '23505') { counts.skipped++; continue; }
      console.error('office_save_failed', error.message);
      if (!created.length) return json({ error: 'save_failed' }, 500);
      counts.skipped += jobs.length - i;
      break;
    }
    created.push({ id: String((data as { id: string }).id), job });
  }
  counts.ran = created.length;
  if (!created.length) return json(counts);

  // الشغل هنا: يكمل ويحفظ حتى لو التطبيق انقفل أو انقطع الاتصال (waitUntil)، والتطبيق يحدّث المهام
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  const work = (async () => {
    await pool(created, CONCURRENCY, async (t) => { counts[await runTask(db, client, model, t.id, t.job)]++; });
    return counts;
  })();
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work.catch(() => {}));

  try {
    return json(await work);
  } catch (e) {
    console.error('office_run_failed', String(e).slice(0, 160));
    return json(counts);
  }
});
