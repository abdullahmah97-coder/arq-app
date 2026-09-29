// اختبار دالة barcode-lookup بدون إنترنت: Deno و supabase و Anthropic كلها بدائل
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 supabase/functions/barcode-lookup/index.ts --bundle --format=esm --platform=node \
//     --alias:npm:@supabase/supabase-js@2=./supabase/tests/fn/supabase-mock.mjs --outfile=node_modules/.cache/fn/barcode_lookup.bundle.mjs
//   node supabase/tests/fn/barcode_lookup.test.mjs
import { state } from './supabase-mock.mjs';

let handler;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv', ANTHROPIC_API_KEY: 'k' };
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };
const calls = [];
let script = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  const next = script.shift();
  if (!next) throw new Error('unexpected fetch');
  return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), { status: next.status ?? 200 });
};
const mod = await import('../../../node_modules/.cache/fn/barcode_lookup.bundle.mjs');

let failed = 0;
const ok = (c, label, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', label, extra); if (!c) { failed++; process.exitCode = 1; } };
const call = async (body, auth = 'Bearer good') => {
  const res = await handler(new Request('https://fn/barcode-lookup', { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const answer = (obj, extra = []) => ({ body: { stop_reason: 'end_turn', content: [...extra, { type: 'text', text: 'Here it is: ' }, { type: 'text', text: JSON.stringify(obj) }] } });

const GOOD = '6281234567895';
const PRODUCT = { found: true, name_ar: 'لبن كامل الدسم', name_en: 'Full Fat Laban', brand: 'Test Dairy', unit: 'ml', package_size: 180, serving_size: 180,
  per_100: { kcal: 60, protein_g: 3.1, carbs_g: 4.6, fat_g: 3.2 }, per_serving: null, confidence: 'high', source_url: 'https://www.example.sa/laban-180' };

ok((await call({ code: GOOD }, '')).status === 401, 'signed-out → 401');
ok((await call({ code: '6281234567890' })).body.error === 'invalid_code', 'bad check digit → invalid_code');
ok((await call({ code: 'abc' })).body.error === 'invalid_code', 'junk → invalid_code');

// بحث ناجح مع pause_turn
script = [{ body: { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: GOOD } }] } }, answer(PRODUCT)];
let r = await call({ code: GOOD, hint: 'Laban <b>' });
ok(r.status === 200 && r.body.found === true && r.body.cached === false, 'AI finds the product', JSON.stringify(r.body).slice(0, 80));
ok(calls.length === 2 && calls[1].body.messages.length === 2 && calls[1].body.messages[1].role === 'assistant', 'continues after pause_turn');
ok(calls[0].body.tools[0].type === 'web_search_20250305' && calls[0].body.tools[0].user_location.country === 'SA', 'uses web search from Saudi Arabia');
ok(calls[0].body.messages[0].content.includes(GOOD) && calls[0].body.messages[0].content.includes('"Laban b"'), 'prompt has the code and the cleaned hint');
ok(r.body.product.unit === 'ml' && r.body.product.per100.kcal === 60 && r.body.product.servingSize === 180 && r.body.product.packageSize === 180, 'normalized values');
ok(r.body.source_url === 'https://www.example.sa/laban-180' && r.body.confidence === 'high' && r.body.remaining === 29, 'source, confidence and remaining');
ok(state.upserts.length === 1 && state.upserts[0].found === true, 'saved to the shared cache');

// نفس الباركود مرة ثانية: من الذاكرة بدون ذكاء اصطناعي ولا خصم
const before = calls.length, rpcBefore = state.rpcCalls;
r = await call({ code: GOOD });
ok(r.body.found && r.body.cached && calls.length === before && state.rpcCalls === rpcBefore, 'second scan comes from the cache, free');

// ما لقاه
script = [answer({ found: false })];
r = await call({ code: '96385074' });
ok(r.body.found === false && state.cache.get('96385074').found === false, 'not found is cached');
const n = calls.length;
r = await call({ code: '96385074' });
ok(r.body.found === false && r.body.cached === true && calls.length === n, 'recent «not found» is not searched again');
state.cache.get('96385074').updated_at = new Date(Date.now() - 8 * 86400e3).toISOString();
script = [answer(PRODUCT)];
r = await call({ code: '96385074' });
ok(r.body.found === true && calls.length === n + 1, 'old «not found» is searched again after a week');

// قيم غلط أو ناقصة = ما لقاه
script = [answer({ ...PRODUCT, per_100: { kcal: 2400, protein_g: 3, carbs_g: 4, fat_g: 3 }, per_serving: null })];
r = await call({ code: '036000291452' });
ok(r.body.found === false, 'impossible values are rejected');
script = [answer({ ...PRODUCT, name_ar: '', name_en: '' })];
r = await call({ code: '3017620422003' });
ok(r.body.found === false, 'no name → not found');
script = [answer({ ...PRODUCT, source_url: 'javascript:alert(1)', confidence: 'certain' })];
r = await call({ code: '4006381333931' });
ok(r.body.found && r.body.source_url === null && r.body.confidence === 'low', 'bad url dropped, unknown confidence → low');

// أخطاء
script = [{ status: 400, body: '{"type":"error","error":{"message":"web search is not enabled for this organization"}}' }];
r = await call({ code: '5449000000996' });
ok(r.status === 502 && r.body.error === 'search_unavailable', 'web search disabled → search_unavailable');
state.quota = 0;
r = await call({ code: '7622210449283' });
ok(r.status === 429 && r.body.error === 'rate_limited', 'daily limit → rate_limited');
state.quota = 5;
delete env.ANTHROPIC_API_KEY;
r = await call({ code: '7622210449283' });
ok(r.status === 503 && r.body.error === 'ai_not_configured', 'no API key → ai_not_configured');
env.ANTHROPIC_API_KEY = 'k';

ok(mod.extractJson([{ type: 'text', text: 'نتيجة: {"found": true, "a": ' }, { type: 'web_search_tool_result' }, { type: 'text', text: '1}' }])?.a === 1, 'JSON split across text blocks');
console.log(failed ? `${failed} FAILED` : 'all barcode-lookup checks passed');
