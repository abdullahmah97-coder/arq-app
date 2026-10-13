// اختبار دالة analyze-inbody بدون إنترنت: Deno و supabase و Anthropic SDK كلها بدائل
// الحد اليومي ai_take('inbody') (يعدّ الطلبات، مو التقارير المحفوظة)، المخرجات المهيكلة (قائمة {key, value})،
// والرد بنفس شكل InBodyMetrics القديم
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 supabase/functions/analyze-inbody/index.ts --bundle --format=esm --platform=node \
//     --alias:npm:@supabase/supabase-js@2=./supabase/tests/fn/supabase-mock-ai.mjs \
//     --alias:npm:@anthropic-ai/sdk@0.131.0=./supabase/tests/fn/anthropic-mock.mjs \
//     --alias:jsr:@std/encoding@1/base64=./supabase/tests/fn/base64-shim.mjs --outfile=node_modules/.cache/fn/analyze_inbody.bundle.mjs
//   node supabase/tests/fn/analyze_inbody.test.mjs
import { ai as db, reset } from './supabase-mock-ai.mjs';
import { anth, resetAnthropic } from './anthropic-mock.mjs';
import { schemaProblems, schemaStats, requestProblems, hasFallback, noFallback } from './claude-checks.mjs';

let handler;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', ANTHROPIC_API_KEY: 'k' };
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };
const mod = await import('../../../node_modules/.cache/fn/analyze_inbody.bundle.mjs');

const logs = [];
for (const k of ['log', 'warn', 'error']) console[k] = (...a) => logs.push(a.map(String).join(' '));
let failed = 0;
const ok = (c, label, extra = '') => { process.stdout.write(`${c ? 'ok  ' : 'FAIL'} ${label}${c ? '' : ` ${extra}`}\n`); if (!c) { failed++; process.exitCode = 1; } };
const call = async (body, auth = 'Bearer good') => {
  const res = await handler(new Request('https://fn/analyze-inbody', { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
// أول بايتات كل نوع (الدالة تعرف النوع منها، مو من الاسم)
const MAGIC = { jpeg: [0xff, 0xd8, 0xff, 0xe0], png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0], pdf: [...'%PDF-1.7'].map((c) => c.charCodeAt(0)),
  heic: [0, 0, 0, 0x18, ...'ftypheic'].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c)), junk: [7, 7, 7] };
const file = (type, magic = MAGIC.jpeg) => new Blob([new Uint8Array(magic)], { type });
const big = (type, size, magic) => ({ size, type, arrayBuffer: async () => { const b = new Uint8Array(size); b.set(magic); return b.buffer; } });
const setFiles = () => {
  db.files.set('inbody/u1/report.jpg', file('image/jpeg'));
  db.files.set('inbody/u1/report.pdf', file('application/pdf', MAGIC.pdf));
  db.files.set('inbody/u1/scan', file('application/octet-stream', MAGIC.png));
  db.files.set('inbody/u1/junk.jpg', file('image/jpeg', MAGIC.junk));
  db.files.set('inbody/u1/photo.heic', file('image/heic', MAGIC.heic));
  db.files.set('inbody/u1/huge.jpg', { size: 16 * 1024 * 1024, type: 'image/jpeg', arrayBuffer: async () => new ArrayBuffer(1) });
  // ٨ ميقا: تحت حد الملف (١٥) بس فوق حد Claude للصورة (١٠ ميقا بعد base64)
  db.files.set('inbody/u1/big.jpg', big('image/jpeg', 8 * 1024 * 1024, MAGIC.jpeg));
  db.files.set('inbody/u1/big.pdf', big('application/pdf', 8 * 1024 * 1024, MAGIC.pdf));
};
setFiles();
db.quota.inbody = 1000; // الأقسام ١-٦ تختبر غير الحد (القسم ٧ يرجعه)
const v = (key, value) => ({ key, value });
const READ = {
  is_inbody: true, device_model: ' InBody770 ', test_date: '2026-10-01', gender: 'male',
  values: [v('age', 29), v('height_cm', 178), v('weight_kg', 86.4), v('smm_kg', 38.1), v('body_fat_mass_kg', 19.2), v('pbf_pct', 22.2), v('bmi', 27.3),
    v('ecw_ratio', 0.381), v('visceral_fat_area_cm2', 92.5), v('weight_control_kg', -6.3), v('fat_control_kg', -8.1), v('muscle_control_kg', 1.8), v('weight_kg', 99)],
  segments: [{ part: 'lean', segment: 'right_arm', unit: 'kg', value: 3.9 }, { part: 'lean', segment: 'right_arm', unit: 'pct', value: 116.6 },
    { part: 'lean', segment: 'trunk', unit: 'kg', value: 29.1 }, { part: 'fat', segment: 'left_leg', unit: 'pct', value: 140.2 }],
  ranges: [{ key: 'weight', min: 60.1, max: 81.3 }, { key: 'pbf', min: 10, max: 20 }],
};
let step = { json: READ };
resetAnthropic();
anth.respond = () => step;
const last = () => anth.requests[anth.requests.length - 1];
const takes = () => db.rpcCalls.filter((c) => c.fn === 'ai_take');
const notes = () => db.rpcCalls.filter((c) => c.fn === 'ai_usage_note');

// ١) قراءة كاملة → نفس شكل InBodyMetrics القديم
let r = await call({ file_path: 'u1/report.jpg' });
const m = r.body.metrics;
ok(r.status === 200 && JSON.stringify(Object.keys(r.body)) === '["metrics"]', 'response is { metrics } (unchanged for the app)', JSON.stringify(r.body).slice(0, 100));
const KEYS = ['device_model', 'test_date', 'gender', 'age', 'height_cm', 'weight_kg', 'smm_kg', 'body_fat_mass_kg', 'pbf_pct', 'bmi', 'ffm_kg', 'total_body_water_l', 'protein_kg',
  'minerals_kg', 'bmr_kcal', 'ecw_ratio', 'visceral_fat_level', 'visceral_fat_area_cm2', 'inbody_score', 'waist_hip_ratio', 'phase_angle', 'target_weight_kg', 'weight_control_kg',
  'fat_control_kg', 'muscle_control_kg', 'segmental_lean', 'segmental_fat', 'ranges'];
ok(KEYS.every((k) => k in m) && Object.keys(m).length === KEYS.length, 'every InBodyMetrics key is present', JSON.stringify(Object.keys(m)));
ok(m.device_model === 'InBody770' && m.test_date === '2026-10-01' && m.gender === 'male' && m.weight_kg === 86.4 && m.ecw_ratio === 0.381, 'printed values pass through (first value per key wins)');
ok(m.ffm_kg === null && m.bmr_kcal === null && m.visceral_fat_level === null, 'values not printed are null (never estimated)');
ok(m.weight_control_kg === -6.3 && m.fat_control_kg === -8.1 && m.muscle_control_kg === 1.8, 'signed control values kept');
ok(JSON.stringify(m.segmental_lean) === JSON.stringify({ right_arm: { kg: 3.9, pct: 116.6 }, left_arm: { kg: null, pct: null }, trunk: { kg: 29.1, pct: null }, right_leg: { kg: null, pct: null }, left_leg: { kg: null, pct: null } }),
  'segmental lean rebuilt with all 5 segments', JSON.stringify(m.segmental_lean));
ok(m.segmental_fat?.left_leg?.pct === 140.2 && m.segmental_fat.trunk.kg === null, 'segmental fat rebuilt');
ok(JSON.stringify(m.ranges) === JSON.stringify({ weight: [60.1, 81.3], smm: null, body_fat_mass: null, pbf: [10, 20], bmi: null }), 'ranges rebuilt as [min, max] pairs');
ok(takes().length === 1 && takes()[0].args.p_kind === 'inbody' && takes()[0].seq < notes().at(-1)?.seq, 'daily cap via ai_take("inbody"), reserved before the AI call');

// ٢) الطلب نفسه
const q = last();
ok(q.model === 'claude-sonnet-5-5' && hasFallback(q), 'default model claude-sonnet-5-5 with server-side fallbacks');
ok(q.output_config?.effort === 'low' && q.output_config.format?.type === 'json_schema', 'default effort low (extraction, as approved) + structured outputs');
const sch = q.output_config.format.schema;
ok(schemaProblems(sch).length === 0, 'schema valid (additionalProperties false, no unsupported constraints)', schemaProblems(sch).join('; '));
const st = schemaStats(sch);
ok(st.unions === 0 && st.optional === 0, 'no nullable/optional fields (the API allows only 16 union fields; the old shape had ~50)', JSON.stringify(st));
ok(sch.properties.values.items.properties.key.enum.length === 22 && JSON.stringify(sch.properties.segments.items.properties.segment.enum) === '["right_arm","left_arm","trunk","right_leg","left_leg"]', 'value keys and segments are enums');
ok(requestProblems(q).length === 0 && !('thinking' in q), 'no temperature / thinking / prefill / forced tool_choice');
const content = q.messages[0].content;
ok(content[0].type === 'image' && content[0].source.media_type === 'image/jpeg' && content[0].source.data === '/9j/4A==' && content[1].type === 'text', 'image block then the prompt');
ok(/EXACTLY as printed/.test(content[1].text) && /Keep signs for control values/.test(content[1].text) && /116\.6/.test(content[1].text) && !/Return ONLY/.test(content[1].text), 'prompt keeps the extraction rules');
ok(q.max_tokens === 16000 && JSON.stringify(anth.clients.at(-1)) === JSON.stringify({ apiKey: 'k', timeout: 55000, maxRetries: 1 }), 'max_tokens 16000, client timeout 55 s with one retry (2 tries + download stay under 150 s)');
ok(JSON.stringify(notes().at(-1)?.args) === JSON.stringify({ p_kind: 'inbody', p_model: 'claude-sonnet-5-5', p_input: 100, p_output: 50, p_cache_read: 0, p_cache_write: 0 }), 'ai_usage_note with kind inbody');

// ٣) PDF، ونوع ملف مو صورة
r = await call({ file_path: 'u1/report.pdf' });
ok(r.status === 200 && last().messages[0].content[0].type === 'document' && last().messages[0].content[0].source.media_type === 'application/pdf', 'PDF → document block');
r = await call({ file_path: 'u1/scan' });
ok(r.status === 200 && last().messages[0].content[0].source.media_type === 'image/png', 'image type comes from the bytes (PNG stored as octet-stream → image/png)');

// ٤) مو تقرير InBody، ورد ناقص
step = { json: { is_inbody: false, device_model: '', test_date: '', gender: '', values: [], segments: [], ranges: [] } };
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 422 && r.body.error === 'not_inbody', 'not an InBody report → 422 not_inbody');
step = { json: { is_inbody: true, device_model: '', test_date: '01/10/2026', gender: '', values: [v('weight_kg', 'heavy'), v('nope', 3), v('smm_kg', 30)], segments: [{ part: 'x', segment: 'trunk', unit: 'kg', value: 1 }], ranges: [{ key: 'bmi', min: 'a', max: 2 }] } };
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 200 && r.body.metrics.device_model === null && r.body.metrics.test_date === null && r.body.metrics.gender === null, 'empty texts and a bad date → null');
ok(r.body.metrics.weight_kg === null && r.body.metrics.smm_kg === 30 && !('nope' in r.body.metrics), 'non-numbers and unknown keys are dropped');
ok(r.body.metrics.segmental_lean === null && r.body.metrics.segmental_fat === null && r.body.metrics.ranges === null, 'no valid segments / ranges → null (old shape)');
step = { json: READ };

// ٥) رفض، انقطاع، أخطاء
const nb = notes().length;
step = { refusal: true, category: 'bio' };
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 502 && r.body.error === 'ai_bad_output', 'refusal → 502 ai_bad_output (no crash; the app offers manual entry)');
ok(notes().length === nb + 1, 'a refused response still records its tokens');
step = { truncated: true };
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 502 && r.body.error === 'ai_bad_output', 'max_tokens → 502 ai_bad_output');
step = { text: 'The weight is 86 kg.' };
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 502 && r.body.error === 'ai_bad_output', 'non-JSON → ai_bad_output');
const nb2 = notes().length;
for (const s of ['timeout', 'api', 'rate_limit', 'connection']) {
  step = { throw: s };
  r = await call({ file_path: 'u1/report.jpg' });
  ok(r.status === 502 && r.body.error === 'ai_failed', `${s} → 502 ai_failed`);
}
ok(notes().length === nb2, 'no usage note when no response came back');
step = { json: READ };
db.noteError = 'function ai_usage_note does not exist';
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 200 && r.body.metrics && logs.some((l) => l.includes('ai_usage_note_failed')), 'usage note fails → logged, metrics still returned');
db.noteError = null;

// ٦) النموذج والجهد من البيئة (InBody ما له متغير نموذج خاص: ANTHROPIC_MODEL بس، مثل قبل)
env.ANTHROPIC_MODEL = 'claude-haiku-5-5'; env.ANTHROPIC_INBODY_EFFORT = 'medium';
await call({ file_path: 'u1/report.jpg' });
ok(last().model === 'claude-haiku-5-5' && noFallback(last()) && last().output_config.effort === 'medium', 'ANTHROPIC_MODEL / ANTHROPIC_INBODY_EFFORT; haiku gets no fallbacks');
env.ANTHROPIC_INBODY_EFFORT = 'extreme';
await call({ file_path: 'u1/report.jpg' });
ok(last().output_config.effort === 'low', 'invalid effort → low');
delete env.ANTHROPIC_MODEL; delete env.ANTHROPIC_INBODY_EFFORT;

// ٧) الحد اليومي: يعدّ الطلبات (حتى اللي ما انحفظت)
reset(); setFiles();
db.quota.inbody = 2;
const before = anth.requests.length;
await call({ file_path: 'u1/report.jpg' }); await call({ file_path: 'u1/report.jpg' });
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 429 && r.body.error === 'rate_limited' && anth.requests.length === before + 2, 'calls are counted, not saved reports: the 3rd read with quota 2 → 429');
db.quota.inbody = 5;
r = await call({ file_path: 'u1/missing.jpg' });
ok(r.status === 404 && r.body.error === 'file_not_found' && db.quota.inbody === 5, 'missing file → 404 without using the quota');
r = await call({ file_path: 'u1/huge.jpg' });
ok(r.status === 413 && r.body.error === 'file_too_large' && db.quota.inbody === 5, 'file over 15 MB → 413 without using the quota');
const reqs = anth.requests.length;
r = await call({ file_path: 'u1/photo.heic' });
ok(r.status === 400 && r.body.error === 'bad_image' && db.quota.inbody === 5 && anth.requests.length === reqs, 'HEIC (Claude takes JPEG/PNG/WebP/GIF only) → 400 bad_image without using the quota');
r = await call({ file_path: 'u1/junk.jpg' });
ok(r.status === 400 && r.body.error === 'bad_image' && db.quota.inbody === 5, 'not really an image (bytes) → 400 bad_image without using the quota');
r = await call({ file_path: 'u1/big.jpg' });
ok(r.status === 413 && r.body.error === 'file_too_large' && db.quota.inbody === 5 && anth.requests.length === reqs, 'image over 10 MB after base64 → 413 without using the quota');
db.takeError = 'connection refused';
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 500 && r.body.error === 'ai_failed' && anth.requests.length === before + 2, 'cap check fails → 500 ai_failed (never skipped)');
// القاعدة قبل الترحيل (ما تعرف 'inbody'): الحد القديم بعدّ التقارير المحفوظة
db.takeError = 'bad_status';
db.counts.inbody_reports = 9;
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 200 && db.queries.some((x) => x.table === 'inbody_reports' && x.op === 'count' && JSON.stringify(x.filters).includes('"source","ai"')), 'database not migrated → old cap (saved AI reports)');
db.counts.inbody_reports = 10;
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 429 && r.body.error === 'rate_limited', 'old cap still enforced (10 saved reports) → 429');
db.takeError = null;
db.quota.inbody = 5;
r = await call({ file_path: 'u1/big.pdf' });
ok(r.status === 200 && db.quota.inbody === 4 && last().messages[0].content[0].type === 'document', 'the same size as a PDF is fine (PDF limit is the request size)');

// ٨) المسار، الدخول، المفتاح، JSON
r = await call({ file_path: 'someone-else/report.jpg' });
ok(r.status === 400 && r.body.error === 'bad_path', 'another user’s file → 400 bad_path');
r = await call({ file_path: { evil: true } });
ok(r.status === 400 && r.body.error === 'bad_path', 'non-string path → 400 bad_path');
r = await call({ file_path: 'u1/report.jpg' }, 'Bearer bad');
ok(r.status === 401 && r.body.error === 'unauthorized', 'signed out → 401');
delete env.ANTHROPIC_API_KEY;
r = await call({ file_path: 'u1/report.jpg' });
ok(r.status === 503 && r.body.error === 'ai_not_configured', 'no API key → 503 ai_not_configured');
env.ANTHROPIC_API_KEY = 'k';
ok(typeof mod.toMetrics === 'function' && mod.toMetrics({}).ranges === null && mod.toMetrics({}).weight_kg === null, 'toMetrics({}) gives an all-null metrics object');

ok(notes().length > 3 && notes().every((c) => c.who === 'user'), 'usage notes go through the user-token client (auth.uid() finds the row)');
process.stdout.write(failed ? `\n${failed} FAILED\n` : '\nall analyze-inbody checks passed\n');
