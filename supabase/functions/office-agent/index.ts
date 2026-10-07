// Supabase Edge Function: office-agent
// وكلاء مكتب أرك أب (للإدارة بس): المالك يضغط «شغّل الوكيل» على مكتب، والوكيل (Claude) يجهّز الشغل
// ويحفظه صفوف في office_tasks. الاقتراحات تنتظر موافقة المالك (waiting_approval): التطبيق هو اللي يطبّقها
// بجلسة المالك نفسه بعد ما يوافق، والوكيل ما يغيّر أي بيانات بالتطبيق. ملخص المدير اليومي للعلم بس (done على طول).
//
// المكاتب: reports (فرز البلاغات الجديدة) · clubs / stores / coaches / care (مراجعة طلبات الشركاء) · marketing (مسودة تنبيه)
//   ai (مراجعة حدود الذكاء الاصطناعي) · lead (ملخص اليوم). users ما له وكيل للحين (agent_unavailable).
// كل عنصر ينراجع مرة وحدة: اللي له مهمة بأي حالة غير failed ما يرجع له (إلا طلب شريك وافق المالك على رفضه ورجع
// معلّق: الشريك عدّله وقدّمه من جديد). ٥ عناصر بالأكثر بالتشغيلة، أقدمها أول (الطابور يتقلّب صفحات لين نلقاها).
// كل مهمة تحجز من حد المالك اليومي قبل الذكاء الاصطناعي: ai_take('office') = ٨٠ باليوم (ترحيل 20261007000880).
// الوقت: كل مهام التشغيلة تطلع مع بعض بجولة وحدة وبدون إعادة (٩٠ ثانية بالأكثر للطلب)، فالتشغيلة تخلص تحت حد
// Supabase للدالة (١٥٠ ثانية بالخطة المجانية). لو انقطعت قبل، مهامها تبقى in_progress لين تصير stale.
//
// النشر (بدون تحقق البوابة من التوكن: الدالة تتحقق بنفسها، عشان المكتب على الويب يوصلها من القاعدة بدون توكن):
//   supabase functions deploy office-agent --no-verify-jwt
//   (ANTHROPIC_API_KEY، و ANTHROPIC_OFFICE_MODEL اختياري — الافتراضي claude-opus-5-5)
//
// مين يطلب (طريقتين):
//   ١) التطبيق: Authorization: Bearer <توكن المالك> — نفس الطريقة القديمة بالحرف (getUser + is_admin + ai_take بتوكنه)
//   ٢) المكتب على الويب (office_admin.run_agent بالقاعدة عبر pg_net): بدون Authorization، ومعه x-office-key
//      = سر office_agent_key بالـ vault (نتأكد منه بـ rpc office_agent_key_ok بمفتاح الخدمة)، والطلب فيه admin_id
//      (لازم يكون من app_admins) والمهام تنحفظ باسمه. الحد: مهامه بآخر ٢٤ ساعة (٨٠ بالأكثر، بدل ai_take)،
//      وإحصائيات المستخدمين بملخص المدير null (تحتاج توكن المالك). القاعدة تقطع الاتصال بعد ثانية، فالتشغيلة كلها
//      تتسجّل بـ waitUntil من أولها وتكمل لحالها، والصفحة تتابع المهام من office_tasks.
//   لا هذا ولا هذا = 401 unauthorized.
//
// الطلب (POST): { desk: DeskId, brief?: string, request_id?: string }  (+ admin_id: uuid من الويب)
//   brief: ملاحظة المالك لمكتب التسويق (٣٠٠ حرف، بدون < > ورموز التحكم، وتروح للنموذج داخل وسم <owner_brief>)
//   request_id: ينحفظ مع كل مهمة عشان التطبيق يلقاها لو انقطع الاتصال
// الرد: { ran, waiting, done, failed, skipped }  أو  { error }
//   405 method_not_allowed · 503 ai_not_configured · 401 unauthorized · 400 bad_json · 403 not_allowed
//   400 bad_input · 400 agent_unavailable · 429 rate_limited · 503 busy · 500 save_failed
// المهمة اللي تفشل تنحفظ failed مع error: ai_failed | ai_bad_output | ai_refused | timeout (والمعلّقة أكثر من ربع ساعة: stale)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { clean, DESK_IDS, cleanOutput, type DeskId } from './agents.ts';
import { collectJobs, PER_RUN, type Job } from './jobs.ts';

export { clean, cleanOutput, schemaFor, systemFor, validNudgeText, inLocale, NUDGE_VARS } from './agents.ts';
export { aggregateUsage, PER_RUN, SCAN, MAX_PAGES } from './jobs.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const AI_TIMEOUT_MS = 90_000;
export const MAX_TOKENS = 16_000;
/** كم مهمة تشتغل مع بعض: كلها (PER_RUN) بجولة وحدة، لأن جولة ثانية تطوّل التشغيلة فوق حد الدالة */
export const CONCURRENCY = PER_RUN;
/** المهمة اللي بقت in_progress أكثر من كذا: الدالة انقطعت قبل ما تخلص */
const STALE_MS = 15 * 60_000;
/** حد المكتب على الويب: مهام المالك بآخر ٢٤ ساعة (نفس حد ai_take('office') بالقاعدة) */
export const WEB_DAILY = 80;
const DAY_MS = 24 * 3600_000;
/** مفتاح x-office-key أطول من كذا ما نسأل عنه القاعدة (السر ٦٤ حرف hex) */
const MAX_KEY = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FailCode = 'ai_failed' | 'ai_bad_output' | 'ai_refused' | 'timeout';
type Outcome = 'waiting' | 'done' | 'failed';
/** حجز مهمة من الحد: null = تمام، وإلا الخطأ (رسالته فيها rate_limited لو الحد خلص) */
type Take = () => Promise<{ message?: string } | null>;
/** صاحب الطلب: المالك بتوكنه (user = عميل التوكن)، أو المكتب على الويب باسم مالك (user = null) */
type Caller = { id: string; user: SupabaseClient | null };

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
    const output = cleanOutput(job.kind, parsed, job.locale, job.title);
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
// المكتب على الويب: بدون توكن، بمفتاح x-office-key
// ---------------------------------------------------------------------------
/** طلب من المكتب على الويب؟ (بدون Authorization ومعه x-office-key). اللي معه توكن يمشي بالطريقة القديمة دايماً */
export const fromWeb = (req: Request) =>
  req.method === 'POST' && !req.headers.get('Authorization') && !!req.headers.get('x-office-key');

/** يتحقق من طلب الويب: المفتاح يطابق سر الـ vault (القاعدة تقارن، بمفتاح الخدمة)، والطلب يحدد المالك (admin_id)
 *  ولازم يكون من app_admins. الترتيب: المفتاح أول (401) قبل ما نقرا الطلب، بعدين الـ JSON (400) والمالك (403) */
async function webCaller(db: SupabaseClient, req: Request, key: string): Promise<Response | { caller: Caller; body: unknown }> {
  if (key.length > MAX_KEY) return json({ error: 'unauthorized' }, 401);
  const { data: keyOk, error: keyError } = await db.rpc('office_agent_key_ok', { p_key: key });
  // ما نسجّل المفتاح نفسه أبد
  if (keyError) console.error('office_key_check_failed', String(keyError.message ?? '').slice(0, 160));
  if (keyError || keyOk !== true) return json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const adminId = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).admin_id : null;
  if (typeof adminId !== 'string' || !UUID.test(adminId)) return json({ error: 'not_allowed' }, 403);
  const { data: admin, error: adminError } = await db.from('app_admins').select('user_id').eq('user_id', adminId).maybeSingle();
  if (adminError) console.error('office_admin_check_failed', String(adminError.message ?? '').slice(0, 160));
  const id = (admin as { user_id?: unknown } | null)?.user_id;
  if (adminError || typeof id !== 'string' || !id) return json({ error: 'not_allowed' }, 403);
  return { caller: { id, user: null }, body };
}

/** حد الويب (بدون توكن المالك ما فيه ai_take): نعدّ مهامه بآخر ٢٤ ساعة مرة وحدة بالتشغيلة، وكل مهمة تحجز وحدة
 *  لين توصل WEB_DAILY. فشل العدّ = خطأ عادي (busy) */
function webQuota(db: SupabaseClient, adminId: string): Take {
  let used: number | null = null;
  return async () => {
    if (used === null) {
      const { count, error } = await db.from('office_tasks').select('id', { count: 'exact', head: true })
        .eq('created_by', adminId).gt('created_at', new Date(Date.now() - DAY_MS).toISOString());
      if (error || typeof count !== 'number') return { message: `count: ${String(error?.message ?? 'no count')}` };
      used = count;
    }
    if (used >= WEB_DAILY) return { message: 'rate_limited' };
    used++;
    return null;
  };
}

// ---------------------------------------------------------------------------
// الدالة
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
const runtime = () => (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;

Deno.serve((req) => {
  const res = handle(req);
  // الويب: القاعدة (pg_net) تقطع الاتصال بعد ثانية، فالتشغيلة كلها (الجمع والحفظ والذكاء) تتسجّل من أولها عشان تكمل
  if (fromWeb(req)) runtime()?.waitUntil?.(res.catch(() => {}));
  return res;
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ai_not_configured' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  let caller: Caller;
  let body: unknown;
  let webDb: SupabaseClient | null = null;

  if (fromWeb(req)) {
    webDb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const web = await webCaller(webDb, req, req.headers.get('x-office-key') ?? '');
    if (web instanceof Response) return web;
    ({ caller, body } = web);
  } else {
    const supabase = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

    // للإدارة بس: نسأل القاعدة بتوكن المالك نفسه
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
    if (adminError || isAdmin !== true) return json({ error: 'not_allowed' }, 403);
    caller = { id: user.id, user: supabase };
  }

  const r = checkRequest(body);
  if ('error' in r) return json({ error: r.error }, 400);

  // مفتاح الخدمة: قراءة الطلبات والبلاغات وكتابة office_tasks (المالك يقرا المهام بس، والقرار عبر office_decide)
  const db = webDb ?? createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // تنظيف: مهمة بقت in_progress أكثر من ربع ساعة = الدالة انقطعت قبل ما تخلص، فتنفك عن عنصرها
  const { error: staleError } = await db.from('office_tasks').update({ status: 'failed', error: 'stale' })
    .eq('status', 'in_progress').lt('created_at', new Date(Date.now() - STALE_MS).toISOString());
  if (staleError) console.warn('office_stale_failed', staleError.message);

  let jobs: Job[];
  try {
    jobs = await collectJobs(r.desk, { db, user: caller.user, brief: r.brief });
  } catch (e) {
    console.error('office_collect_failed', r.desk, String(e).slice(0, 160));
    return json({ error: 'busy' }, 503);
  }
  const counts = { ran: 0, waiting: 0, done: 0, failed: 0, skipped: 0 };
  if (!jobs.length) return json(counts);

  // كل مهمة تحجز من الحد قبل ما تنحفظ. الحد خلص قبل أول مهمة = 429، وبعدها نوقف ونحسب الباقي skipped
  // (بتوكن المالك: ai_take('office')؛ من الويب: عدّ مهامه بآخر ٢٤ ساعة)
  const user = caller.user;
  const take: Take = user ? async () => (await user.rpc('ai_take', { p_kind: 'office' })).error : webQuota(db, caller.id);
  const model = Deno.env.get('ANTHROPIC_OFFICE_MODEL') ?? 'claude-opus-5-5';
  const created: { id: string; job: Job }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const takeError = await take();
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
      status: 'in_progress', input: job.input, model: model.slice(0, 60), request_id: r.requestId, created_by: caller.id,
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
  // بدون إعادة: إعادة بعد مهلة ٩٠ ثانية تطلع فوق حد الدالة، والمهمة الفاشلة ترجع بالتشغيلة الجاية
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  const work = (async () => {
    await pool(created, CONCURRENCY, async (t) => { counts[await runTask(db, client, model, t.id, t.job)]++; });
    return counts;
  })();
  const rt = runtime();
  if (rt?.waitUntil) rt.waitUntil(work.catch(() => {}));

  try {
    return json(await work);
  } catch (e) {
    console.error('office_run_failed', String(e).slice(0, 160));
    return json(counts);
  }
}
