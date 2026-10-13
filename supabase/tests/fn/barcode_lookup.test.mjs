// اختبار دالة barcode-lookup بدون إنترنت: Deno و supabase و Anthropic SDK كلها بدائل
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 supabase/functions/barcode-lookup/index.ts --bundle --format=esm --platform=node \
//     --alias:npm:@supabase/supabase-js@2=./supabase/tests/fn/supabase-mock.mjs \
//     --alias:npm:@anthropic-ai/sdk@0.131.0=./supabase/tests/fn/anthropic-mock.mjs --outfile=node_modules/.cache/fn/barcode_lookup.bundle.mjs
//   node supabase/tests/fn/barcode_lookup.test.mjs
import { state } from './supabase-mock.mjs';
import { anth, resetAnthropic } from './anthropic-mock.mjs';
import { requestProblems, hasFallback, noFallback } from './claude-checks.mjs';

let handler;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv', ANTHROPIC_API_KEY: 'k' };
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };
const mod = await import('../../../node_modules/.cache/fn/barcode_lookup.bundle.mjs');

const logs = [];
for (const k of ['log', 'warn', 'error']) console[k] = (...a) => logs.push(a.map(String).join(' '));
let failed = 0;
const ok = (c, label, extra = '') => { process.stdout.write(`${c ? 'ok  ' : 'FAIL'} ${label}${c ? '' : ` ${extra}`}\n`); if (!c) { failed++; process.exitCode = 1; } };
const call = async (body, auth = 'Bearer good') => {
  const res = await handler(new Request('https://fn/barcode-lookup', { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
resetAnthropic();
const calls = anth.requests;
const SEARCH = [
  { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: '6281234567895' } },
  { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://www.example.sa/laban-180', title: 'Laban', encrypted_content: 'x' }] },
];
// رد نهائي: بحث ثم نص تمهيدي ثم JSON (مع اقتباس، مثل ما يرجع بحث الويب)
const answer = (obj, usage) => ({ usage, content: [
  { type: 'text', text: "I'll search for {the barcode} first." }, ...SEARCH,
  { type: 'text', text: 'Here it is: ' },
  { type: 'text', text: JSON.stringify(obj), citations: [{ type: 'web_search_result_location', url: 'https://www.example.sa/laban-180', cited_text: 'Laban', encrypted_index: 'e' }] },
] });

const GOOD = '6281234567895';
const PRODUCT = { found: true, name_ar: 'لبن كامل الدسم', name_en: 'Full Fat Laban', brand: 'Test Dairy', unit: 'ml', package_size: 180, serving_size: 180,
  per_100: { kcal: 60, protein_g: 3.1, carbs_g: 4.6, fat_g: 3.2 }, per_serving: null, confidence: 'high', source_url: 'https://www.example.sa/laban-180' };

ok((await call({ code: GOOD }, '')).status === 401, 'signed-out → 401');
ok((await call({ code: '6281234567890' })).body.error === 'invalid_code', 'bad check digit → invalid_code');
ok((await call({ code: 'abc' })).body.error === 'invalid_code', 'junk → invalid_code');

// بحث ناجح مع pause_turn
anth.script = [{ pause: true, content: SEARCH.slice(0, 1), usage: { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 5, cache_creation_input_tokens: 7 } },
  answer(PRODUCT, { input_tokens: 2100, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 1 })];
let r = await call({ code: GOOD, hint: 'Laban <b>' });
ok(r.status === 200 && r.body.found === true && r.body.cached === false, 'AI finds the product', JSON.stringify(r.body).slice(0, 80));
ok(calls.length === 2 && calls[1].messages.length === 2 && calls[1].messages[1].role === 'assistant', 'continues after pause_turn');
ok(JSON.stringify(calls[1].messages[1].content) === JSON.stringify(SEARCH.slice(0, 1)) && calls[1].messages[0].content === calls[0].messages[0].content,
  'the paused turn is sent back unchanged, with no extra «continue» message');
const tool = calls[0].tools[0];
ok(calls[0].tools.length === 1 && tool.type === 'web_search_20260209' && tool.name === 'web_search' && tool.max_uses === 5, 'web_search_20260209 (dynamic filtering), max 5 searches, no separate code_execution tool');
ok(tool.user_location.type === 'approximate' && tool.user_location.country === 'SA' && tool.user_location.timezone === 'Asia/Riyadh', 'uses web search from Saudi Arabia');
ok(calls[0].messages[0].content.includes(GOOD) && calls[0].messages[0].content.includes('"Laban b"'), 'prompt has the code and the cleaned hint');
ok(r.body.product.unit === 'ml' && r.body.product.per100.kcal === 60 && r.body.product.servingSize === 180 && r.body.product.packageSize === 180, 'normalized values');
ok(r.body.source_url === 'https://www.example.sa/laban-180' && r.body.confidence === 'high' && r.body.remaining === 29, 'source, confidence and remaining');
ok(state.upserts.length === 0, 'a result steered by a name hint from the phone is not shared with everyone');
ok(JSON.stringify(Object.keys(r.body)) === '["found","product","confidence","source_url","cached","remaining"]', 'response shape unchanged for the app');

// الطلب نفسه
const q = calls[0];
ok(q.model === 'claude-sonnet-5-5' && hasFallback(q), 'default model claude-sonnet-5-5 with server-side fallbacks');
ok(q.output_config?.effort === 'medium' && !q.output_config.format, 'effort medium; no output_config.format (web search always cites, and citations + structured outputs is a 400)');
ok(requestProblems(q).length === 0 && requestProblems(calls[1]).length === 0, 'no temperature / thinking / prefill / forced tool_choice', requestProblems(q).join('; '));
ok(q.max_tokens === 16000, 'max_tokens 16000');
ok(anth.clients.at(-1).maxRetries === 0 && anth.clients.at(-1).timeout === 120000, 'SDK client: no retries (a search is long and costly), 120 s per request');
ok(anth.options.slice(-2).every((o) => o && o.timeout > 100000 && o.timeout <= 120000), 'each request gets a timeout within the budget', JSON.stringify(anth.options.slice(-2)));
ok(mod.AI_BUDGET_MS <= 130000, 'AI budget (from the start of the request) leaves room under the 150 s function limit');
const note = state.notes.at(-1);
ok(JSON.stringify(note) === JSON.stringify({ p_kind: 'barcode', p_model: 'claude-sonnet-5-5', p_input: 3000, p_output: 420, p_cache_read: 5, p_cache_write: 8 }),
  'ai_usage_note sums every turn (pause + answer)', JSON.stringify(note));

// بدون اسم من الجوال وبثقة عالية: ينحفظ للكل
anth.script = [answer(PRODUCT)];
r = await call({ code: GOOD });
ok(r.body.found && r.body.cached === false && state.upserts.length === 1 && state.upserts[0].found === true, 'high-confidence result without a hint is saved to the shared cache');

// ثقة متوسطة: ترجع لصاحب الطلب بس
anth.script = [answer({ ...PRODUCT, confidence: 'medium' })];
r = await call({ code: '6281000000014' });
ok(r.body.found && r.body.confidence === 'medium' && state.upserts.length === 1 && !state.cache.has('6281000000014'), 'medium-confidence results are not shared');
// «ما لقاه» بعد اسم من الجوال: ما ينحفظ (عشان محد يخفي منتج عن الباقين)
anth.script = [answer({ found: false })];
r = await call({ code: '6281000000021', hint: 'fake' });
ok(r.body.found === false && !state.cache.has('6281000000021'), '«not found» after a hint is not cached');

// نفس الباركود مرة ثانية: من الذاكرة بدون ذكاء اصطناعي ولا خصم
const before = calls.length, rpcBefore = state.rpcCalls;
r = await call({ code: GOOD });
ok(r.body.found && r.body.cached && calls.length === before && state.rpcCalls === rpcBefore, 'second scan comes from the cache, free');

// ما لقاه
anth.script = [answer({ found: false })];
r = await call({ code: '96385074' });
ok(r.body.found === false && state.cache.get('96385074').found === false, 'not found is cached');
const n = calls.length;
r = await call({ code: '96385074' });
ok(r.body.found === false && r.body.cached === true && calls.length === n, 'recent «not found» is not searched again');
state.cache.get('96385074').updated_at = new Date(Date.now() - 8 * 86400e3).toISOString();
anth.script = [answer(PRODUCT)];
r = await call({ code: '96385074' });
ok(r.body.found === true && calls.length === n + 1, 'old «not found» is searched again after a week');

// قيم غلط أو ناقصة = ما لقاه
anth.script = [answer({ ...PRODUCT, per_100: { kcal: 2400, protein_g: 3, carbs_g: 4, fat_g: 3 }, per_serving: null })];
r = await call({ code: '036000291452' });
ok(r.body.found === false, 'impossible values are rejected');
anth.script = [answer({ ...PRODUCT, name_ar: '', name_en: '' })];
r = await call({ code: '3017620422003' });
ok(r.body.found === false, 'no name → not found');
anth.script = [answer({ ...PRODUCT, source_url: 'javascript:alert(1)', confidence: 'certain' })];
r = await call({ code: '4006381333931' });
ok(r.body.found && r.body.source_url === null && r.body.confidence === 'low', 'bad url dropped, unknown confidence → low');

// رفض، انقطاع، رد بدون JSON، pause_turn بلا نهاية: خطأ وما ينحفظ «ما لقيناه» للكل
const failCase = async (steps, code, label) => {
  const up = state.upserts.length, notesBefore = state.notes.length, reqs = calls.length;
  anth.script = steps;
  const res = await call({ code });
  ok(res.status === 502 && res.body.error === 'ai_failed' && state.upserts.length === up && !state.cache.has(code), `${label} → 502 ai_failed, nothing cached`, JSON.stringify(res.body));
  return { notes: state.notes.length - notesBefore, reqs: calls.length - reqs };
};
let fc = await failCase([{ refusal: true, category: 'cyber' }], '5000112637922', 'refusal');
ok(fc.notes === 1, 'a refused response still records its tokens');
await failCase([{ truncated: true }], '5000112637939', 'max_tokens');
await failCase([{ content: [{ type: 'text', text: 'I could not find it, sorry.' }] }], '5000112637946', 'answer without JSON');
fc = await failCase([{ pause: true }, { pause: true }, { pause: true }, answer(PRODUCT)], '5000112637953', 'still paused after 3 requests');
ok(fc.reqs === 3 && anth.script.length === 1, 'pause_turn continuation is bounded (3 requests)');
anth.script = [];

// أخطاء البحث نفسه (ما ترمي: كتلة web_search_tool_result محتواها كائن خطأ بدل قائمة)
const searchErr = (code) => [
  { type: 'server_tool_use', id: 'srvtoolu_e', name: 'web_search', input: { query: GOOD } },
  { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_e', content: { type: 'web_search_tool_result_error', error_code: code } },
];
const reply = (blocks, obj, usage) => ({ usage, content: [...blocks, { type: 'text', text: JSON.stringify(obj) }] });
let up = state.upserts.length;
anth.script = [reply(searchErr('unavailable'), { found: false })];
r = await call({ code: '6281000000038' });
ok(r.status === 502 && r.body.error === 'ai_failed' && state.upserts.length === up && !state.cache.has('6281000000038'),
  'every search failed (unavailable) + «not found» → 502 ai_failed, nothing cached', JSON.stringify(r.body));
anth.script = [reply([...SEARCH, ...searchErr('too_many_requests')], { found: false })];
r = await call({ code: '6281000000045' });
ok(r.status === 200 && r.body.found === false && r.body.cached === false && state.upserts.length === up && !state.cache.has('6281000000045'),
  'one search worked, one failed + «not found» → told the user, not shared with everyone', JSON.stringify(r.body));
ok(logs.some((l) => l.startsWith('search_errors') && l.includes('too_many_requests')), 'search errors are logged (codes only)');
anth.script = [reply([...SEARCH, ...searchErr('max_uses_exceeded')], { found: false })];
r = await call({ code: '6281000000052' });
ok(r.body.found === false && state.cache.get('6281000000052')?.found === false, 'max_uses_exceeded after real searches is a normal «not found» (cached)');
anth.script = [reply([...SEARCH, ...searchErr('unavailable')], PRODUCT)];
r = await call({ code: '6281000000069' });
ok(r.body.found === true && state.cache.get('6281000000069')?.found === true, 'a found product is still shared even if one search failed');
anth.script = [reply([], { found: false }, { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 } })];
r = await call({ code: '6281000000076' });
ok(r.body.found === false && state.cache.get('6281000000076')?.found === false, 'searches inside code filtering (counted in usage, no result blocks) count as a real search');
up = state.upserts.length;
anth.script = [reply([], { found: false })];
r = await call({ code: '6281000000083' });
ok(r.status === 200 && r.body.found === false && state.upserts.length === up, '«not found» without any search is not shared');
ok(JSON.stringify(mod.searchState([{ content: [...SEARCH, ...searchErr('unavailable')], usage: {} }])) === JSON.stringify({ ok: true, failed: true, errors: ['unavailable'] })
  && mod.searchState([{ content: searchErr('query_too_long'), usage: {} }]).ok === false, 'searchState: list = worked, object = error');

// أخطاء الـ API
anth.script = [{ throw: 'bad_request', message: 'web search is not enabled for this organization' }];
r = await call({ code: '5449000000996' });
ok(r.status === 502 && r.body.error === 'search_unavailable', 'web search disabled → search_unavailable');
anth.script = [{ throw: 'bad_request', message: 'max_tokens: too large' }];
r = await call({ code: '5449000000996' });
ok(r.status === 502 && r.body.error === 'ai_failed', 'other 400 → ai_failed');
for (const s of ['timeout', 'api', 'rate_limit']) {
  anth.script = [{ throw: s }];
  r = await call({ code: '5449000000996' });
  ok(r.status === 502 && r.body.error === 'ai_failed', `${s} → ai_failed`);
}
ok(!state.cache.has('5449000000996'), 'errors are never cached');

// النموذج والجهد من البيئة
env.ANTHROPIC_BARCODE_MODEL = 'claude-sonnet-5'; env.ANTHROPIC_BARCODE_EFFORT = 'low';
anth.script = [answer(PRODUCT)];
await call({ code: '5901234123457' });
ok(calls.at(-1).model === 'claude-sonnet-5' && noFallback(calls.at(-1)) && calls.at(-1).output_config.effort === 'low', 'ANTHROPIC_BARCODE_MODEL / _EFFORT; no fallbacks for a model without support');
delete env.ANTHROPIC_BARCODE_MODEL; env.ANTHROPIC_MODEL = 'claude-opus-5-5'; env.ANTHROPIC_BARCODE_EFFORT = 'warp';
anth.script = [answer(PRODUCT)];
await call({ code: '4012345678901' });
ok(calls.at(-1).model === 'claude-opus-5-5' && hasFallback(calls.at(-1)) && calls.at(-1).output_config.effort === 'medium', 'ANTHROPIC_MODEL fallback; invalid effort → medium');
delete env.ANTHROPIC_MODEL; delete env.ANTHROPIC_BARCODE_EFFORT;

state.quota = 0;
r = await call({ code: '7622210449283' });
ok(r.status === 429 && r.body.error === 'rate_limited', 'daily limit → rate_limited');
state.quota = 5;
delete env.ANTHROPIC_API_KEY;
r = await call({ code: '7622210449283' });
ok(r.status === 503 && r.body.error === 'ai_not_configured', 'no API key → ai_not_configured');
env.ANTHROPIC_API_KEY = 'k';

// قراءة JSON من نص الرد (بدون مخرجات مهيكلة)
ok(mod.extractJson([{ type: 'text', text: 'نتيجة: {"found": true, "a": ' }, { type: 'web_search_tool_result' }, { type: 'text', text: '1}' }])?.a === 1, 'JSON split across text blocks');
ok(mod.extractJson([{ type: 'text', text: 'Searching {code} now' }, { type: 'web_search_tool_result' }, { type: 'text', text: 'Found: {"found": true, "name_en": "X {big}"}' }])?.name_en === 'X {big}',
  'braces in the preamble and inside strings do not break parsing');
ok(mod.extractJson([{ type: 'text', text: '```json\n{"found": false}\n```' }])?.found === false, 'code fences are stripped');
ok(mod.extractJson([{ type: 'text', text: '{"found": true, "v": 1}' }, { type: 'web_search_tool_result' }, { type: 'text', text: 'Final: {"found": false}' }])?.found === false, 'the final answer (after the last search) wins');
ok(mod.extractJson([{ type: 'text', text: 'Final: {"found": true, "per_100": {"kcal": 1}} and {"note": 1}' }])?.per_100?.kcal === 1, 'the object with "found" is picked over other objects');
ok(mod.extractJson([{ type: 'text', text: 'no json here {oops' }]) === null, 'no JSON → null');
ok(state.noteWho.length > 5 && state.noteWho.every((w) => w === 'user'), 'every usage note goes through the user-token client (with the service key auth.uid() is null and the note silently does nothing)', JSON.stringify([...new Set(state.noteWho)]));
process.stdout.write(failed ? `${failed} FAILED\n` : 'all barcode-lookup checks passed\n');
