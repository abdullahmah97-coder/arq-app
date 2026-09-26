// Supabase Edge Function: analyze-inbody
// تقرأ صورة أو PDF لتقرير InBody (أي جهاز) وتستخرج كل الأرقام كـ JSON.
// التحليل والتوصيات تتم في التطبيق (src/lib/inbody/analyze.ts) بشكل حتمي وقابل للاختبار،
// والذكاء الاصطناعي هنا فقط لقراءة التقرير بدقة.
//
// النشر:
//   supabase functions deploy analyze-inbody
//   (يستخدم نفس ANTHROPIC_API_KEY و ANTHROPIC_MODEL)
//
// الطلب: { file_path: "<uid>/<file>" }   الرد: { metrics: InBodyMetrics }

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_PER_DAY = 10;

const PROMPT = `You are reading a body composition report from an InBody device (models vary: InBody 270/370/570/770/970, H20/H30, Dial, etc.; the sheet may be in English, Arabic or another language, photographed at an angle, or a PDF).

Extract the numbers EXACTLY as printed. Never estimate or compute a value that is not printed — use null instead.
Return ONLY one JSON object with exactly these keys:

{
  "device_model": string|null,            // e.g. "InBody770"
  "test_date": "YYYY-MM-DD"|null,
  "gender": "male"|"female"|null,
  "age": number|null,
  "height_cm": number|null,
  "weight_kg": number|null,
  "smm_kg": number|null,                  // Skeletal Muscle Mass
  "body_fat_mass_kg": number|null,
  "pbf_pct": number|null,                 // Percent Body Fat
  "bmi": number|null,
  "ffm_kg": number|null,                  // Fat Free Mass
  "total_body_water_l": number|null,
  "protein_kg": number|null,
  "minerals_kg": number|null,
  "bmr_kcal": number|null,                // Basal Metabolic Rate
  "ecw_ratio": number|null,               // ECW/TBW
  "visceral_fat_level": number|null,      // a level 1-20 (some models)
  "visceral_fat_area_cm2": number|null,   // an area in cm² (e.g. InBody770 VFA)
  "inbody_score": number|null,
  "waist_hip_ratio": number|null,
  "phase_angle": number|null,             // whole body, 50 kHz
  "target_weight_kg": number|null,
  "weight_control_kg": number|null,       // signed: negative means lose
  "fat_control_kg": number|null,          // signed
  "muscle_control_kg": number|null,       // signed
  "segmental_lean": { "right_arm": {"kg": number|null, "pct": number|null}, "left_arm": {...}, "trunk": {...}, "right_leg": {...}, "left_leg": {...} } | null,
  "segmental_fat":  { same shape } | null,   // pct is the % shown next to each segment
  "ranges": { "weight": [min,max]|null, "smm": [min,max]|null, "body_fat_mass": [min,max]|null, "pbf": [min,max]|null, "bmi": [min,max]|null } | null
}

Rules:
- Segmental lean "pct" is the percentage relative to ideal (the "%" row, e.g. 116.6). "kg" is the mass in kg.
- Keep signs for control values ("- 3.7 kg" => -3.7).
- If the image is not an InBody / body composition report, return {"error":"not_inbody"}.`;

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

  let body: { file_path?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const path = body.file_path;
  if (!path || !path.startsWith(`${user.id}/`)) return json({ error: 'bad_path' }, 400);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from('inbody_reports').select('id', { count: 'exact', head: true })
    .eq('source', 'ai').gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_DAY) return json({ error: 'rate_limited' }, 429);

  const { data: file, error: dlErr } = await supabase.storage.from('inbody').download(path);
  if (dlErr || !file) return json({ error: 'file_not_found' }, 404);
  if (file.size > 15 * 1024 * 1024) return json({ error: 'file_too_large' }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = path.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) } }
    : { type: 'image', source: { type: 'base64', media_type: file.type?.startsWith('image/') ? file.type : 'image/jpeg', data: encodeBase64(bytes) } };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: [block, { type: 'text', text: PROMPT }] }],
    }),
  });
  if (!res.ok) {
    console.error('anthropic_error', res.status, await res.text());
    return json({ error: 'ai_failed' }, 502);
  }
  const out = await res.json();
  const text: string = (out.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e <= s) return json({ error: 'ai_bad_output' }, 502);
  try {
    const metrics = JSON.parse(text.slice(s, e + 1));
    if (metrics.error) return json({ error: metrics.error }, 422);
    return json({ metrics });
  } catch {
    return json({ error: 'ai_bad_output' }, 502);
  }
});
