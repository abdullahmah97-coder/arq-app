// Supabase Edge Function: coach — مدرب ARQ الذكي
// يرد على طلبات المستخدم (تمرين، شرح، وجبة، فتح صفحة) بصيغة JSON يفهمها التطبيق.
//
// النشر:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        (نفس مفتاح الخطة)
//   supabase functions deploy coach
//
// الطلب (POST, بتوكن المستخدم): { messages: [{role:'user'|'assistant', content}], context, library }
// الرد: { reply: CoachReply }  أو  { error }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_MESSAGES_PER_DAY = 40;
const ROUTES = ['health', 'inbody', 'plan', 'compete', 'devices', 'progress', 'friends', 'challenge_new', 'learn', 'programs'];

const SYSTEM = (library: string, context: unknown) => `You are "ARQ Coach", the in-app AI coach of ARQ (أرك), a Saudi gym & fitness app. Slogan: "Move with Intention / تحرّك بهدف".
Reply in the user's language (Arabic → friendly Saudi/Gulf Arabic; English → plain English). Be brief, warm and practical.

You can:
1. Build a workout ONLY from this exercise library (each has a 3D demo in the app). Format: id | name | primary muscles | equipment
${library}
2. Explain an exercise (open its 3D demo).
3. Give nutrition advice (general, no medical claims).
4. Open an app screen: ${ROUTES.join(', ')} (health = sleep/recovery/steps/heart; inbody = body composition reports; challenge_new = challenge friends; programs = ready-made programs like the 4-day full body).

User context (use it to personalise; recovery zone red → lighter session, yellow → moderate, green → can push):
${JSON.stringify(context)}

Safety: you are not a doctor. For pain, injury, chest pain, dizziness, eating-disorder signs or medical conditions, advise seeing a professional and do not prescribe. Never invent exercise ids.

Respond with ONLY a JSON object, no prose outside it:
{
  "text": string,                       // your message (markdown **bold** allowed, max ~120 words)
  "workout": null | { "title": string, "minutes": number, "note"?: string,
                      "exercises": [ { "exercise_id": string, "sets": number, "reps": string, "rest_sec": number } ] },
  "open": null | { "kind": "exercise", "id": string } | { "kind": "screen", "route": string },
  "chips": string[]                     // 2–4 short follow-up suggestions in the user's language
}`;

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

  let body: { messages?: { role: string; content: string }[]; context?: unknown; library?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'missing_input' }, 400);
  const library = String(body.library ?? '').slice(0, 8000);
  const ids = new Set(library.split('\n').map((l) => l.split('|')[0].trim()).filter(Boolean));

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from('coach_log').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if ((count ?? 0) >= MAX_MESSAGES_PER_DAY) return json({ error: 'rate_limited' }, 429);
  await supabase.from('coach_log').insert({ user_id: user.id });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_COACH_MODEL') ?? Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5',
      max_tokens: 1500,
      system: SYSTEM(library, body.context ?? {}),
      messages,
    }),
  });
  if (!res.ok) {
    console.error('anthropic_error', res.status, await res.text());
    return json({ error: 'ai_failed' }, 502);
  }
  const out = await res.json();
  const text: string = (out.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const s = text.indexOf('{'); const e = text.lastIndexOf('}');
  try {
    const r = JSON.parse(text.slice(s, e + 1));
    const reply = {
      text: String(r.text ?? '').slice(0, 2000),
      workout: r.workout && Array.isArray(r.workout.exercises) ? {
        title: String(r.workout.title ?? '').slice(0, 80),
        minutes: Math.max(5, Math.min(120, Number(r.workout.minutes) || 30)),
        note: r.workout.note ? String(r.workout.note).slice(0, 300) : undefined,
        exercises: r.workout.exercises
          .filter((x: any) => ids.has(String(x.exercise_id)))
          .slice(0, 10)
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
    return json({ reply });
  } catch {
    return json({ reply: { text: text.slice(0, 1500) || '…', source: 'ai' } });
  }
});
