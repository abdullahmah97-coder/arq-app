// Supabase Edge Function: analyze-inbody
// تقرأ صورة أو PDF لتقرير InBody (أي جهاز) وتستخرج كل الأرقام كـ JSON.
// التحليل والتوصيات تتم في التطبيق (src/lib/inbody/analyze.ts) بشكل حتمي وقابل للاختبار،
// والذكاء الاصطناعي هنا فقط لقراءة التقرير بدقة.
//
// النشر:
//   supabase functions deploy analyze-inbody
//   (ANTHROPIC_API_KEY، والنموذج ANTHROPIC_MODEL — الافتراضي claude-sonnet-5-5،
//    والجهد ANTHROPIC_INBODY_EFFORT: low|medium|high|xhigh|max — الافتراضي low، استخراج أرقام)
//
// الحد اليومي: ai_take('inbody') = ١٠ قراءات بآخر ٢٤ ساعة (يعدّ الطلبات نفسها، مو التقارير المحفوظة).
//   لو القاعدة قبل الترحيل (ما تعرف 'inbody') نرجع للحد القديم: التقارير المحفوظة من الذكاء الاصطناعي.
// Claude عن طريق الـ SDK بمخرجات مهيكلة: الأرقام تجي قائمة {key, value} (الـ API ما يقبل أكثر من ١٦ حقل
// يقبل null بالشكل)، والدالة ترجعها بنفس شكل InBodyMetrics القديم (null لكل رقم مو مطبوع).
//
// الطلب: { file_path: "<uid>/<file>" }   الرد: { metrics: InBodyMetrics }
//   أو { error }: 405 method_not_allowed · 503 ai_not_configured · 401 unauthorized · 400 bad_json · 400 bad_path
//   404 file_not_found · 413 file_too_large · 400 bad_image · 429 rate_limited · 500 ai_failed · 422 not_inbody
//   (bad_image = صورة بنوع ما يقبله Claude مثل HEIC؛ الصورة لازم JPEG/PNG/WebP/GIF وتحت ١٠ ميقا بعد base64.
//    هذي والملف الكبير تنرفض قبل الحد اليومي، عشان طلب ما ينجح أبداً ما ياخذ من القراءات العشر)
//   502 ai_failed (خطأ/مهلة) · 502 ai_bad_output (رفض/انقطاع/رد غلط)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import {
  Anthropic, arrayOf, b64Length, BOOL, effortFrom, enumOf, fallbackFor, afterResponse, IMAGE_MAX_B64, logError, logStop, modelFrom,
  noteUsage, NUM, obj, readJson, sniffImage, STR, takeResult, type Message,
} from '../_shared/claude.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** الحد القديم (قبل الترحيل): التقارير المحفوظة من الذكاء الاصطناعي بآخر ٢٤ ساعة */
const MAX_PER_DAY = 10;
/** مهلة الطلب ومحاولة إعادة وحدة: بالأكثر قرابة دقيقتين (مع تنزيل الملف)، تحت حد الدالة (١٥٠ ثانية) */
export const AI_TIMEOUT_MS = 55_000;
/** حد الملف (PDF؛ الصورة حدها IMAGE_MAX_B64 بعد base64) */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_RETRIES = 1;
export const MAX_TOKENS = 16_000;

/** الأرقام المفردة بالتقرير (نفس مفاتيح InBodyMetrics) */
export const NUMBER_KEYS = [
  'age', 'height_cm', 'weight_kg', 'smm_kg', 'body_fat_mass_kg', 'pbf_pct', 'bmi', 'ffm_kg', 'total_body_water_l', 'protein_kg',
  'minerals_kg', 'bmr_kcal', 'ecw_ratio', 'visceral_fat_level', 'visceral_fat_area_cm2', 'inbody_score', 'waist_hip_ratio',
  'phase_angle', 'target_weight_kg', 'weight_control_kg', 'fat_control_kg', 'muscle_control_kg',
] as const;
export const SEGMENTS = ['right_arm', 'left_arm', 'trunk', 'right_leg', 'left_leg'] as const;
export const RANGE_KEYS = ['weight', 'smm', 'body_fat_mass', 'pbf', 'bmi'] as const;

/** شكل الرد (structured outputs): بدون null — اللي مو مطبوع ما يدخل القائمة، والنصوص "" */
export const SCHEMA = obj({
  is_inbody: BOOL,
  device_model: STR,
  test_date: STR,
  gender: enumOf(['male', 'female', '']),
  values: arrayOf(obj({ key: enumOf(NUMBER_KEYS), value: NUM })),
  segments: arrayOf(obj({ part: enumOf(['lean', 'fat']), segment: enumOf(SEGMENTS), unit: enumOf(['kg', 'pct']), value: NUM })),
  ranges: arrayOf(obj({ key: enumOf(RANGE_KEYS), min: NUM, max: NUM })),
});

const PROMPT = `You are reading a body composition report from an InBody device (models vary: InBody 270/370/570/770/970, H20/H30, Dial, etc.; the sheet may be in English, Arabic or another language, photographed at an angle, or a PDF).

Extract the numbers EXACTLY as printed. Never estimate or compute a value that is not printed — leave it out instead.
Answer with one JSON object:
- "is_inbody": false if the image is not an InBody / body composition report (then leave the lists empty and the texts "").
- "device_model" (e.g. "InBody770"), "test_date" ("YYYY-MM-DD") and "gender" ("male" or "female"): "" when not printed.
- "values": one {"key", "value"} item for every number below that is printed on the sheet:
    age, height_cm, weight_kg,
    smm_kg (Skeletal Muscle Mass), body_fat_mass_kg, pbf_pct (Percent Body Fat), bmi, ffm_kg (Fat Free Mass),
    total_body_water_l, protein_kg, minerals_kg, bmr_kcal (Basal Metabolic Rate), ecw_ratio (ECW/TBW),
    visceral_fat_level (a level 1-20, some models), visceral_fat_area_cm2 (an area in cm², e.g. InBody770 VFA),
    inbody_score, waist_hip_ratio, phase_angle (whole body, 50 kHz),
    target_weight_kg, weight_control_kg (signed: negative means lose), fat_control_kg (signed), muscle_control_kg (signed)
- "segments": one item per printed segmental number: "part" is "lean" (segmental lean) or "fat" (segmental fat),
  "segment" is right_arm, left_arm, trunk, right_leg or left_leg, "unit" is "kg" or "pct".
- "ranges": the normal range printed for weight, smm, body_fat_mass, pbf and bmi, as {"key", "min", "max"}.

Rules:
- Segmental lean "pct" is the percentage relative to ideal (the "%" row, e.g. 116.6). "kg" is the mass in kg.
- Segmental fat "pct" is the % shown next to each segment.
- Keep signs for control values ("- 3.7 kg" => -3.7).`;

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
type SegmentValue = { kg: number | null; pct: number | null };

/** الرد المهيكل → نفس شكل InBodyMetrics القديم (كل رقم مو مطبوع null). التطبيق ينظّف الحدود بعدين (normalizeMetrics) */
export function toMetrics(p: Record<string, unknown>) {
  const m: Record<string, unknown> = {
    device_model: typeof p.device_model === 'string' && p.device_model.trim() ? p.device_model.trim().slice(0, 40) : null,
    test_date: typeof p.test_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.test_date.trim()) ? p.test_date.trim() : null,
    gender: p.gender === 'male' || p.gender === 'female' ? p.gender : null,
  };
  for (const k of NUMBER_KEYS) m[k] = null;
  for (const it of Array.isArray(p.values) ? p.values : []) {
    const x = it as { key?: unknown; value?: unknown };
    const v = finite(x?.value);
    // أول قيمة لكل مفتاح
    if (v != null && (NUMBER_KEYS as readonly unknown[]).includes(x.key) && m[x.key as string] == null) m[x.key as string] = v;
  }
  const seg = { lean: null as Record<string, SegmentValue> | null, fat: null as Record<string, SegmentValue> | null };
  for (const it of Array.isArray(p.segments) ? p.segments : []) {
    const x = it as { part?: unknown; segment?: unknown; unit?: unknown; value?: unknown };
    const v = finite(x?.value);
    if (v == null || (x.part !== 'lean' && x.part !== 'fat') || !(SEGMENTS as readonly unknown[]).includes(x.segment) || (x.unit !== 'kg' && x.unit !== 'pct')) continue;
    const part = (seg[x.part] ??= Object.fromEntries(SEGMENTS.map((s) => [s, { kg: null, pct: null }])));
    const cell = part[x.segment as string];
    if (cell[x.unit] == null) cell[x.unit] = v;
  }
  m.segmental_lean = seg.lean;
  m.segmental_fat = seg.fat;
  let ranges: Record<string, [number, number] | null> | null = null;
  for (const it of Array.isArray(p.ranges) ? p.ranges : []) {
    const x = it as { key?: unknown; min?: unknown; max?: unknown };
    const lo = finite(x?.min), hi = finite(x?.max);
    if (lo == null || hi == null || !(RANGE_KEYS as readonly unknown[]).includes(x.key)) continue;
    ranges ??= Object.fromEntries(RANGE_KEYS.map((k) => [k, null]));
    if (ranges[x.key as string] == null) ranges[x.key as string] = [lo, hi];
  }
  m.ranges = ranges;
  return m;
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

  let body: { file_path?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const path = body.file_path;
  if (!path || typeof path !== 'string' || !path.startsWith(`${user.id}/`)) return json({ error: 'bad_path' }, 400);

  const { data: file, error: dlErr } = await supabase.storage.from('inbody').download(path);
  if (dlErr || !file) return json({ error: 'file_not_found' }, 404);
  if (file.size > MAX_FILE_BYTES) return json({ error: 'file_too_large' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = path.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
    || String.fromCharCode(...bytes.subarray(0, 4)) === '%PDF';
  // الصورة: نوعها من أول بايتاتها (HEIC من منتقي الملفات وغيره يرفضه Claude بـ 400)، وحجمها تحت حد Claude
  const imageType = isPdf ? null : sniffImage(bytes);
  if (!isPdf && !imageType) return json({ error: 'bad_image' }, 400);
  if (!isPdf && b64Length(bytes.length) > IMAGE_MAX_B64) return json({ error: 'file_too_large' }, 413);

  // الحد اليومي: كل قراءة تحجز مكانها قبل الذكاء الاصطناعي (بعد ما نتأكد من الملف، عشان الملف الغلط ما ينحسب)
  const { error: takeErr } = await supabase.rpc('ai_take', { p_kind: 'inbody' });
  const take = takeResult(takeErr);
  if (take === 'rate_limited') return json({ error: 'rate_limited' }, 429);
  if (take === 'failed') { console.error('inbody_cap_failed', String(takeErr?.message ?? '').slice(0, 160)); return json({ error: 'ai_failed' }, 500); }
  if (take === 'legacy') {
    // القاعدة قبل الترحيل: الحد القديم (التقارير المحفوظة من الذكاء الاصطناعي)
    console.warn('inbody_cap_legacy');
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabase.from('inbody_reports').select('id', { count: 'exact', head: true })
      .eq('source', 'ai').gte('created_at', since);
    if ((count ?? 0) >= MAX_PER_DAY) return json({ error: 'rate_limited' }, 429);
  }

  const block: Anthropic.Beta.BetaContentBlockParam = isPdf || !imageType
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) } }
    : { type: 'image', source: { type: 'base64', media_type: imageType, data: encodeBase64(bytes) } };

  const model = modelFrom('ANTHROPIC_MODEL');
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  let res: Message;
  try {
    res = await client.beta.messages.create({
      model, max_tokens: MAX_TOKENS,
      ...fallbackFor(model),
      output_config: { effort: effortFrom('ANTHROPIC_INBODY_EFFORT', 'low'), format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [block, { type: 'text', text: PROMPT }] }],
    });
  } catch (e) {
    logError('analyze-inbody', e);
    return json({ error: 'ai_failed' }, 502);
  }
  // التوكنات على صف الحد (بالخلفية، وفشلها ما يأثّر على الرد)
  await afterResponse(noteUsage(supabase, 'inbody', [res], model));

  const out = readJson(res);
  if ('fail' in out) {
    logStop('analyze-inbody', res, out.fail);
    return json({ error: 'ai_bad_output' }, 502);
  }
  if (out.json.is_inbody !== true) return json({ error: 'not_inbody' }, 422);
  return json({ metrics: toMetrics(out.json) });
});
