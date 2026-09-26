// Supabase Edge Function: generate-plan
// يولّد خطة أسبوعية (تمارين + وجبات) مخصصة بالذكاء الاصطناعي (Claude)
// اعتماداً على الوزن والطول والهدف وصورة الجسم (اختيارية).
//
// النشر:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5     (اختياري)
//   supabase functions deploy generate-plan
//
// الطلب (POST, بتوكن المستخدم):
//   { input: PlanInput, targets: PlanTargets, photo_path?: string }
// الرد:
//   { plan: WeeklyPlan }  أو  { error: string }

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_AI_PLANS_PER_DAY = 5;

const SYSTEM_PROMPT = `You are a certified strength coach and sports nutritionist writing a weekly plan for a gym app used mainly in Saudi Arabia.

Return ONLY one JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "version": 1,
  "generated_at": "<ISO date>",
  "summary": {"ar": "...", "en": "..."},
  "targets": {"bmi": number, "bmr": number, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "water_l": number},
  "days": [ 7 items, day 0 = Sunday ... 6 = Saturday:
    {"day": 0, "rest": boolean, "focus": {"ar","en"},
     "exercises": [{"exercise_id": string, "name": {"ar","en"}, "sets": number, "reps": "8-10", "rest_sec": number, "notes"?: {"ar","en"}}],
     "cardio"?: {"ar","en"}} ],
  "meals": [ 7 items: {"day": 0, "meals": [ {"slot": "breakfast"|"lunch"|"snack"|"dinner", "name": {"ar","en"},
            "portions": [{"name": {"ar","en"}, "amount": "120 g"}], "kcal": number, "protein_g": number} ]} ],
  "tips": [{"ar","en"}, ...],
  "photo_notes"?: {"ar","en"}
}

Rules:
- Use the provided "targets" numbers as-is (they were computed with Mifflin-St Jeor); daily meal kcal must sum within ±5% of targets.calories and protein near targets.protein_g.
- Exactly the requested number of training days; rest days have "rest": true and an empty exercises array. Prefer Friday (day 5) as a rest day.
- 4–7 exercises per training day, appropriate to the level, gym equipment available.
- Pick exercises ONLY from this library (each has a 3D demo in the app) and set "exercise_id" to its id: goblet_squat, back_squat, leg_press, hack_squat, leg_extension, leg_curl_lying, leg_curl_seated, split_squat, walking_lunge, bulgarian_split_squat, rdl_db, rdl_bb, deadlift, glute_bridge, hip_thrust_db, hip_thrust_bb, calf_raise, bench_bb, bench_db, chest_press_machine, incline_db_press, pec_deck, cable_fly, dips, ohp_standing, shoulder_press_db_seated, shoulder_press_machine, lateral_raise, lateral_raise_cable, rear_delt_raise, lat_pulldown, lat_pulldown_close, pullup, row_cable_seated, row_db_one_arm, row_bb, curl_db, curl_hammer, curl_bb, triceps_pushdown, triceps_overhead_db, plank, hanging_knee_raise, ab_wheel.
- Meals: practical, affordable, halal foods common in Saudi Arabia (dates, laban, foul, kabsa with lean chicken, grilled fish, etc.). Vary across the week.
- Arabic must be natural Modern Standard / Gulf-friendly Arabic. English must be concise.
- If a body photo is provided: give only brief, respectful, non-judgmental observations useful for training (e.g. apparent posture, which areas to prioritize) in "photo_notes". Never diagnose medical conditions, never estimate exact body-fat percentage as fact, never comment on attractiveness. If the photo is not a person's body, unclear, or inappropriate, ignore it and omit photo_notes.
- If the profile contains "inbody" (analysis of the user's InBody body-composition report), it is the most important input:
  respect recommended_goal and weekly_rate_kg, add extra volume for weak_segments, prescribe unilateral (one-arm/one-leg) work starting with the weaker side when imbalance.arms or imbalance.legs > 5,
  add cardio when extra_cardio is true, keep intensity moderate and advise a doctor visit when caution_ecw is true, and set "based_on_inbody": true.
- This is general fitness guidance, not medical advice; include one tip recommending a doctor check if the BMI is >= 35 or the user is new to exercise.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ai_not_configured' }, 503);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { input?: any; targets?: any; photo_path?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const { input, targets, photo_path } = body;
  if (!input || !targets) return json({ error: 'missing_input' }, 400);

  // حد بسيط لعدد الخطط بالذكاء الاصطناعي يومياً لكل مستخدم (للتحكم في التكلفة)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from('plans').select('id', { count: 'exact', head: true })
    .eq('source', 'ai').gte('created_at', since);
  if ((count ?? 0) >= MAX_AI_PLANS_PER_DAY) return json({ error: 'rate_limited' }, 429);

  const content: any[] = [];
  if (photo_path && photo_path.startsWith(`${user.id}/`)) {
    const { data: file } = await supabase.storage.from('body').download(photo_path);
    if (file && file.size < 5 * 1024 * 1024) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mediaType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: encodeBase64(bytes) } });
    }
  }
  content.push({
    type: 'text',
    text: `User profile:\n${JSON.stringify(input, null, 2)}\n\nComputed targets (use as-is):\n${JSON.stringify(targets, null, 2)}\n\nToday: ${new Date().toISOString().slice(0, 10)}. Write the weekly plan JSON now.`,
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    console.error('anthropic_error', res.status, await res.text());
    return json({ error: 'ai_failed' }, 502);
  }

  const out = await res.json();
  const text: string = (out.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return json({ error: 'ai_bad_output' }, 502);

  try {
    const plan = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(plan.days) || plan.days.length !== 7 || !Array.isArray(plan.meals)) {
      return json({ error: 'ai_bad_output' }, 502);
    }
    plan.version = 1;
    plan.generated_at = new Date().toISOString();
    plan.targets = { ...targets, ...plan.targets, calories: targets.calories, protein_g: targets.protein_g };
    return json({ plan });
  } catch {
    return json({ error: 'ai_bad_output' }, 502);
  }
});
