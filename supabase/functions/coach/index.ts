// Supabase Edge Function: coach — مدرب ARQ الذكي
// يرد على طلبات المستخدم (تمرين، شرح، وجبة، فتح صفحة) بصيغة JSON يفهمها التطبيق.
//
// النشر:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        (نفس مفتاح الخطة)
//   supabase functions deploy coach
//   (النموذج ANTHROPIC_COACH_MODEL ثم ANTHROPIC_MODEL — الافتراضي claude-sonnet-5-5،
//    والجهد ANTHROPIC_COACH_EFFORT: low|medium|high|xhigh|max — الافتراضي low، محادثة سريعة)
//
// الحد اليومي: ai_take('coach') = ٤٠ رسالة بآخر ٢٤ ساعة (بدل عدّ coach_log). لو القاعدة قبل الترحيل
//   (ما تعرف 'coach') نرجع للحد القديم: عدّ coach_log وإضافة صف له.
// حجم الطلب: آخر ١٢ رسالة، كل وحدة ٢٠٠٠ حرف، ومجموعها ١٢٠٠٠ حرف (نشيل الأقدم)،
//   والسياق (context) كائن JSON بـ ٤٠٠٠ حرف بالأكثر — أكبر = 413 too_large.
// مكتبة التمارين من الخادم (coach/library.ts، مولَّدة من دليل التطبيق: scripts/gen-coach-library.ts)، كاملة بدون قص.
//   library من الجوال (لو موجودة) تستخدم بس عشان ناخذ التمارين اللي يعرفها التطبيق (نسخة قديمة ممكن ما فيها الجديدة).
// أي خطأ (رفض، انقطاع، مهلة) يرجع { error } والتطبيق يرد بالمدرب المحلي (src/lib/coach/local.ts).
//
// الطلب (POST, بتوكن المستخدم): { messages: [{role:'user'|'assistant', content}], context, library? }
// الرد: { reply: CoachReply }  أو  { error }
//   405 method_not_allowed · 503 ai_not_configured · 401 unauthorized · 400 bad_json · 400 missing_input
//   413 too_large · 429 rate_limited · 500 ai_failed · 502 ai_failed · 502 ai_bad_output

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  Anthropic, arrayOf, effortFrom, enumOf, fallbackFor, afterResponse, INT, logError, logStop, modelFrom, noteUsage, nullable,
  obj, readJson, STR, takeResult, type Message, type MessageParam,
} from '../_shared/claude.ts';
import { COACH_LIBRARY } from './library.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** الحد القديم (قبل الترحيل): رسائل coach_log بآخر ٢٤ ساعة */
const MAX_MESSAGES_PER_DAY = 40;
export const ROUTES = ['health', 'inbody', 'plan', 'compete', 'devices', 'progress', 'friends', 'challenge_new', 'learn', 'programs'];
/** حدود الطلب (بالحروف) */
export const MAX_MESSAGES = 12;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_CHARS = 12_000;
/** نقرا من library الجوال المعرّفات بس، وبهالحد (قائمة التطبيق اليوم قرابة ٩٦٠٠ حرف) */
export const MAX_CLIENT_LIBRARY_CHARS = 64_000;
export const MAX_CONTEXT_CHARS = 4000;
/** محادثة: مهلة قصيرة ومحاولة إعادة وحدة */
export const AI_TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 1;
export const MAX_TOKENS = 8000;

/** شكل الرد (structured outputs) — نفس اللي تتحقق منه الدالة تحت */
export const SCHEMA = obj({
  text: STR,
  workout: nullable(obj({
    title: STR, minutes: INT, note: STR,
    exercises: arrayOf(obj({ exercise_id: STR, sets: INT, reps: STR, rest_sec: INT })),
  }, ['note'])),
  open: { anyOf: [obj({ kind: enumOf(['exercise']), id: STR }), obj({ kind: enumOf(['screen']), route: enumOf(ROUTES) }), { type: 'null' }] },
  chips: arrayOf(STR),
});

const SYSTEM = (library: string, context: string) => `You are "ARQ Coach", the in-app AI coach of ARQ (أرك), a Saudi gym & fitness app. Slogan: "Move with Intention / تحرّك بهدف".
Reply in the user's language (Arabic → friendly Saudi/Gulf Arabic; English → plain English). Be brief, warm and practical.

You can:
1. Build a workout ONLY from this exercise library (each has a 3D demo in the app). Format: id | name | primary muscles | equipment
${library}
2. Explain an exercise (open its 3D demo).
3. Give nutrition advice (general, no medical claims).
4. Open an app screen: ${ROUTES.join(', ')} (health = sleep/recovery/steps/heart; inbody = body composition reports; challenge_new = challenge friends; programs = ready-made programs like the 4-day full body).

User context (use it to personalise; recovery zone red → lighter session, yellow → moderate, green → can push):
${context}

Safety: you are not a doctor. For pain, injury, chest pain, dizziness, eating-disorder signs or medical conditions, advise seeing a professional and do not prescribe. Never invent exercise ids.

Answer with one JSON object in this shape:
{
  "text": string,                       // your message (markdown **bold** allowed, max ~120 words)
  "workout": null | { "title": string, "minutes": number, "note"?: string,
                      "exercises": [ { "exercise_id": string, "sets": number, "reps": string, "rest_sec": number } ] },
  "open": null | { "kind": "exercise", "id": string } | { "kind": "screen", "route": string },
  "chips": string[]                     // 2–4 short follow-up suggestions in the user's language
}`;

type Msg = { role: 'user' | 'assistant'; content: string };

export { COACH_LIBRARY };
const idOf = (line: string) => line.split('|')[0].trim();

/** سطور المكتبة للبرومبت: كل مكتبة الخادم، أو لو الجوال أرسل قائمته، التمارين اللي فيها بس
 *  («أضف لليوم» في التطبيق يفتح التمرين بمعرّفه، فما نقترح تمرين ما تعرفه نسخته). قائمة ما فيها ولا معرّف نعرفه = الكاملة */
export function libraryFor(client: unknown): string[] {
  if (typeof client !== 'string' || !client.trim()) return [...COACH_LIBRARY];
  const known = new Set(client.slice(0, MAX_CLIENT_LIBRARY_CHARS).split('\n').map(idOf).filter(Boolean));
  const lines = COACH_LIBRARY.filter((l) => known.has(idOf(l)));
  return lines.length ? lines : [...COACH_LIBRARY];
}

/** المحادثة من التطبيق: آخر ١٢ رسالة، كل وحدة ٢٠٠٠ حرف، ومجموعها ١٢٠٠٠ حرف (نشيل الأقدم)، وتبدأ برسالة المستخدم */
export function trimHistory(raw: unknown): Msg[] {
  const list = (Array.isArray(raw) ? raw : [])
    .filter((m): m is Msg => !!m && typeof m === 'object' && ((m as Msg).role === 'user' || (m as Msg).role === 'assistant') && typeof (m as Msg).content === 'string')
    // الرسالة الفاضية يرفضها الـ API (400)
    .filter((m) => m.content.trim() !== '')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  let total = 0;
  let from = list.length;
  while (from > 0 && total + list[from - 1].content.length <= MAX_HISTORY_CHARS) total += list[--from].content.length;
  const kept = list.slice(from);
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ai_not_configured' }, 503);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { messages?: unknown; context?: unknown; library?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'missing_input' }, 400);
  const messages = trimHistory(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'missing_input' }, 400);
  const lines = libraryFor(body.library);
  const library = lines.join('\n');
  const ids = new Set(lines.map(idOf));
  // السياق كائن JSON صغير (هدف، مستوى، استشفاء، تمرين اليوم...)؛ أكبر من الحد = طلب غلط (ما ننقصه عشان ما ينكسر JSON)
  const ctx = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
  const context = JSON.stringify(ctx);
  if (context.length > MAX_CONTEXT_CHARS) return json({ error: 'too_large' }, 413);

  // الحد اليومي (يتحجز قبل الاتصال بالذكاء الاصطناعي)
  const { error: takeErr } = await supabase.rpc('ai_take', { p_kind: 'coach' });
  const take = takeResult(takeErr);
  if (take === 'rate_limited') return json({ error: 'rate_limited' }, 429);
  if (take === 'failed') { console.error('coach_cap_failed', String(takeErr?.message ?? '').slice(0, 160)); return json({ error: 'ai_failed' }, 500); }
  if (take === 'legacy') {
    // القاعدة قبل الترحيل: الحد القديم (عدّ coach_log وإضافة صف)
    console.warn('coach_cap_legacy');
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabase.from('coach_log').select('id', { count: 'exact', head: true }).gte('created_at', since);
    if ((count ?? 0) >= MAX_MESSAGES_PER_DAY) return json({ error: 'rate_limited' }, 429);
    await supabase.from('coach_log').insert({ user_id: user.id });
  }

  const model = modelFrom('ANTHROPIC_COACH_MODEL', 'ANTHROPIC_MODEL');
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  let res: Message;
  try {
    res = await client.beta.messages.create({
      model, max_tokens: MAX_TOKENS,
      ...fallbackFor(model),
      output_config: { effort: effortFrom('ANTHROPIC_COACH_EFFORT', 'low'), format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM(library, context),
      messages: messages as MessageParam[],
    });
  } catch (e) {
    logError('coach', e);
    return json({ error: 'ai_failed' }, 502);
  }
  // التوكنات على صف الحد (بالخلفية، وفشلها ما يأثّر على الرد)
  await afterResponse(noteUsage(supabase, 'coach', [res], model));

  const out = readJson(res);
  if ('fail' in out) {
    // رفض أو انقطاع: التطبيق يرد بالمدرب المحلي
    logStop('coach', res, out.fail);
    return json({ error: out.fail === 'bad_output' || out.fail === 'truncated' ? 'ai_bad_output' : 'ai_failed' }, 502);
  }
  // deno-lint-ignore no-explicit-any
  const r = out.json as any;
  const reply = {
    text: String(r.text ?? '').slice(0, 2000),
    workout: r.workout && Array.isArray(r.workout.exercises) ? {
      title: String(r.workout.title ?? '').slice(0, 80),
      minutes: Math.max(5, Math.min(120, Number(r.workout.minutes) || 30)),
      note: r.workout.note ? String(r.workout.note).slice(0, 300) : undefined,
      exercises: r.workout.exercises
        // deno-lint-ignore no-explicit-any
        .filter((x: any) => ids.has(String(x?.exercise_id)))
        .slice(0, 10)
        // deno-lint-ignore no-explicit-any
        .map((x: any) => ({
          exercise_id: String(x.exercise_id),
          sets: Math.max(1, Math.min(8, Number(x.sets) || 3)),
          reps: String(x.reps ?? '10').slice(0, 20),
          rest_sec: Math.max(15, Math.min(300, Number(x.rest_sec) || 60)),
        })),
    } : null,
    open: r.open?.kind === 'exercise' && ids.has(String(r.open.id)) ? { kind: 'exercise', id: String(r.open.id) }
      : r.open?.kind === 'screen' && ROUTES.includes(r.open.route) ? { kind: 'screen', route: r.open.route } : null,
    chips: Array.isArray(r.chips) ? r.chips.slice(0, 4).map((c: unknown) => String(c).slice(0, 60)) : [],
    source: 'ai',
  };
  if (reply.workout && !reply.workout.exercises.length) reply.workout = null;
  // رد فاضي = التطبيق يرد بالمدرب المحلي
  if (!reply.text.trim()) return json({ error: 'ai_bad_output' }, 502);
  return json({ reply });
});
