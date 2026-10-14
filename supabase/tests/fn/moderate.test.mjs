// اختبار دالة moderate بدون إنترنت: المفتاح، الدفعات، Qwen3Guard عبر Hugging Face، والنتيجة أو إعادة المحاولة
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 supabase/functions/moderate/index.ts --bundle --format=esm --platform=node \
//     --alias:npm:@supabase/supabase-js@2=./supabase/tests/fn/supabase-mock-automod.mjs --outfile=node_modules/.cache/fn/moderate.bundle.mjs
//   node supabase/tests/fn/moderate.test.mjs
import { db } from './supabase-mock-automod.mjs';

let handler;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', HF_TOKEN: 'hf_test' };
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };

// Hugging Face: كل نداء يسجّل، والرد من دالة نغيّرها لكل اختبار
const sent = [];
let reply = () => 'Safety: Safe\nCategories: None';
let inFlight = 0;
let maxInFlight = 0;
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  sent.push({ url, headers: init.headers, body });
  inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  try {
    await new Promise((r) => setTimeout(r, 2));
    const r = reply(body);
    if (r instanceof Error) throw r;
    if (r && typeof r === 'object' && 'status' in r) return new Response(r.text ?? 'err', { status: r.status });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: r } }] }), { status: 200 });
  } finally { inFlight--; }
};

const mod = await import('../../../node_modules/.cache/fn/moderate.bundle.mjs');
const { parseGuard, cleanText, modelFrom, BATCH, PARALLEL } = mod;

let failed = 0;
const ok = (label, c, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', label, c ? '' : extra); if (!c) { failed++; process.exitCode = 1; } };
const call = async (headers = { 'x-moderation-key': db.key }, method = 'POST') => {
  const res = await handler(new Request('https://fn/moderate', { method, headers }));
  return { status: res.status, body: await res.json() };
};
const reset = () => { sent.length = 0; db.calls.length = 0; db.batches = []; db.claimError = null; db.settleError = null; db.keyError = null; maxInFlight = 0; };
const job = (type, id, body, extra = {}) => ({ target_type: type, target_id: id, body, attempts: 1, queued_at: `2026-10-14T10:00:00.${id.slice(-6)}+00:00`, ...extra });
const calls = (fn) => db.calls.filter((c) => c.fn === fn).map((c) => c.args);

// ---------- قراءة رد النموذج ----------
ok('parse: safe', JSON.stringify(parseGuard('Safety: Safe\nCategories: None')) === '{"label":"safe","categories":[]}');
ok('parse: unsafe with two categories (sorted, our codes)', JSON.stringify(parseGuard('Safety: Unsafe\nCategories: Violent, PII')) === '{"label":"unsafe","categories":["pii","violent"]}');
ok('parse: Non-violent Illegal Acts is not read as violent', JSON.stringify(parseGuard('Safety: Unsafe\nCategories: Non-violent Illegal Acts')?.categories) === '["illegal"]');
ok('parse: controversial political', JSON.stringify(parseGuard('Safety: Controversial\nCategories: Politically Sensitive Topics')) === '{"label":"controversial","categories":["political"]}');
ok('parse: long PII name', JSON.stringify(parseGuard('Safety: Unsafe\nCategories: Personally Identifiable Information')?.categories) === '["pii"]');
ok('parse: every category name', JSON.stringify(parseGuard('Safety: Unsafe\nCategories: Sexual Content or Sexual Acts, Suicide & Self-Harm, Unethical Acts, Copyright Violation, Jailbreak')?.categories)
  === '["copyright","jailbreak","self_harm","sexual","unethical"]');
ok('parse: response moderation lines are ignored', parseGuard('Safety: Safe\nCategories: None\nRefusal: Yes')?.label === 'safe');
ok('parse: categories only from the Categories line', JSON.stringify(parseGuard('Safety: Unsafe Violent\nCategories: PII')?.categories) === '["pii"]');
ok('parse: no Safety line = null', parseGuard('I think this is fine') === null);
ok('parse: lowercase label = null (exact format only)', parseGuard('safety: unsafe') === null);
ok('parse: not a string = null', parseGuard(null) === null && parseGuard({ a: 1 }) === null);
ok('clean: control chars and spaces', cleanText(' هلا\n\twallah\u0000  ') === 'هلا wallah');
ok('clean: 1000 chars max', cleanText('x'.repeat(1500)).length === 1000);
ok('clean: null → empty', cleanText(null) === '');
ok('model: valid override kept', modelFrom('Qwen/Qwen3Guard-Gen-8B:featherless-ai', 'd') === 'Qwen/Qwen3Guard-Gen-8B:featherless-ai');
ok('model: no provider is fine', modelFrom('Qwen/Qwen3Guard-Gen-8B', 'd') === 'Qwen/Qwen3Guard-Gen-8B');
ok('model: junk → default', modelFrom('https://evil/x', 'd') === 'd' && modelFrom('', 'd') === 'd' && modelFrom(undefined, 'd') === 'd');

// ---------- الدخول ----------
reset();
ok('GET → 405', (await call({}, 'GET')).status === 405);
ok('no key → 401 (and no database call)', (await call({})).status === 401 && db.calls.length === 0);
ok('wrong key → 401', (await call({ 'x-moderation-key': 'nope' })).status === 401);
db.keyError = 'boom';
ok('key check error → 401', (await call()).status === 401);
db.keyError = null;
ok('oversized key → 401 without asking the database', (db.calls.length = 0, (await call({ 'x-moderation-key': 'k'.repeat(501) })).status === 401 && db.calls.length === 0));
delete env.HF_TOKEN;
reset();
db.batches = [[job('post', 'p-000001', 'نص')]];
let r = await call();
ok('no HF_TOKEN → 503 hf_not_configured, nothing claimed', r.status === 503 && r.body.error === 'hf_not_configured' && calls('moderation_claim').length === 0);
env.HF_TOKEN = 'hf_test';

// ---------- دفعة عادية ----------
reset();
reply = ({ messages }) => (messages[0].content.includes('سيء') ? 'Safety: Unsafe\nCategories: Unethical Acts, PII' : 'Safety: Safe\nCategories: None');
db.batches = [[
  job('post', 'p-000001', 'تمرين صدر اليوم'),
  job('comment', 'c-000002', 'كلام سيء\u0000 هنا'),
  job('checkin_comment', 'k-000003', null),
]];
r = await call();
ok('batch → 200 with totals', r.status === 200 && r.body.checked === 2 && r.body.flagged === 1 && r.body.gone === 1 && r.body.failed === 0, JSON.stringify(r.body));
ok('one HF call per text (none for the empty one)', sent.length === 2);
const first = sent[0];
ok('calls the HF router chat completions', first.url === 'https://router.huggingface.co/v1/chat/completions');
ok('bearer HF_TOKEN', first.headers.Authorization === 'Bearer hf_test');
ok('default model is Qwen3Guard-Gen-4B pinned to featherless-ai', first.body.model === 'Qwen/Qwen3Guard-Gen-4B:featherless-ai');
ok('only the text is sent (one user message, no ids or names)', first.body.messages.length === 1 && first.body.messages[0].role === 'user'
  && !JSON.stringify(first.body).includes('p-000001') && Object.keys(first.body).sort().join() === 'max_tokens,messages,model,stream,temperature');
ok('short output', first.body.max_tokens === 32 && first.body.temperature === 0);
ok('posts and comments never use the small chat model', sent.every((x) => x.body.model === 'Qwen/Qwen3Guard-Gen-4B:featherless-ai'));
ok('text is cleaned before sending', sent.some((s) => s.body.messages[0].content === 'كلام سيء هنا'));
const settles = calls('moderation_settle');
const sc = settles.find((s) => s.p_id === 'c-000002');
ok('unsafe settled with our category codes', sc?.p_result === 'unsafe' && JSON.stringify(sc.p_categories) === '["pii","unethical"]', JSON.stringify(sc));
ok('settle carries the model, time and queued_at', sc?.p_model === 'Qwen/Qwen3Guard-Gen-4B:featherless-ai' && Number.isInteger(sc.p_ms) && sc.p_queued_at === '2026-10-14T10:00:00.000002+00:00');
ok('safe settled as safe', settles.find((s) => s.p_id === 'p-000001')?.p_result === 'safe');
ok('empty text settled as gone (no call)', settles.find((s) => s.p_id === 'k-000003')?.p_result === 'gone');
ok('a short batch stops claiming', calls('moderation_claim').length === 1 && calls('moderation_claim')[0].p_limit === BATCH);

// ---------- الرسائل: الصغير أول ----------
reset();
reply = ({ model, messages }) => (messages[0].content === 'رسالة عادية' ? 'Safety: Safe\nCategories: None'
  : model.includes('0.6B') ? 'Safety: Controversial\nCategories: Unethical Acts' : 'Safety: Safe\nCategories: None');
db.batches = [[job('message', 'm-000001', 'رسالة عادية'), job('message', 'm-000002', 'رسالة فيها شي')]];
r = await call();
const m1 = sent.filter((s) => s.body.messages[0].content === 'رسالة عادية');
const m2 = sent.filter((s) => s.body.messages[0].content === 'رسالة فيها شي');
ok('message: the small model first', m1.length === 1 && m1[0].body.model === 'Qwen/Qwen3Guard-Gen-0.6B:featherless-ai');
ok('message: not safe on the small one → re-checked by the main model', m2.length === 2 && m2[1].body.model === 'Qwen/Qwen3Guard-Gen-4B:featherless-ai');
const ms = calls('moderation_settle').find((s) => s.p_id === 'm-000002');
ok('message: the main model has the last word (and is recorded)', ms?.p_result === 'safe' && ms.p_model === 'Qwen/Qwen3Guard-Gen-4B:featherless-ai');
ok('message: safe on the small one is recorded with the small model', calls('moderation_settle').find((s) => s.p_id === 'm-000001')?.p_model === 'Qwen/Qwen3Guard-Gen-0.6B:featherless-ai');

// ---------- النماذج من البيئة ----------
reset();
env.HF_MODERATION_MODEL = 'Qwen/Qwen3Guard-Gen-8B:featherless-ai';
env.HF_MODERATION_CHAT_MODEL = 'not a model';
reply = () => 'Safety: Safe\nCategories: None';
db.batches = [[job('post', 'p-000009', 'نص'), job('message', 'm-000009', 'نص')]];
await call();
ok('HF_MODERATION_MODEL override', sent.find((s) => s.body.messages && s.body.model.includes('8B')) !== undefined);
ok('bad HF_MODERATION_CHAT_MODEL falls back to the 0.6B default', sent.some((s) => s.body.model === 'Qwen/Qwen3Guard-Gen-0.6B:featherless-ai'));
delete env.HF_MODERATION_MODEL; delete env.HF_MODERATION_CHAT_MODEL;

// ---------- الأخطاء ----------
const failWith = async (resp, n = 1) => {
  reset();
  reply = () => resp;
  db.batches = [Array.from({ length: n }, (_, i) => job('post', `p-00010${i}`, `نص ${i}`))];
  const res = await call();
  return { res, retries: calls('moderation_retry'), settles: calls('moderation_settle') };
};
let f = await failWith({ status: 500 }, 3);
ok('500: each job retried as http_5xx, the batch continues', f.retries.length === 3 && f.retries.every((x) => x.p_reason === 'http_5xx') && sent.length === 3);
ok('500: retry carries model and queued_at', f.retries[0].p_model === 'Qwen/Qwen3Guard-Gen-4B:featherless-ai' && !!f.retries[0].p_queued_at);
ok('500: totals', f.res.body.failed === 3 && f.res.body.checked === 0);
f = await failWith({ status: 429 });
ok('429 → http_429', f.retries[0]?.p_reason === 'http_429');
f = await failWith({ status: 400 });
ok('400 → http_4xx', f.retries[0]?.p_reason === 'http_4xx');
f = await failWith('I am not sure');
ok('unreadable answer → bad_output, nothing settled', f.retries[0]?.p_reason === 'bad_output' && f.settles.length === 0);
f = await failWith(new TypeError('fetch failed'));
ok('network error → network', f.retries[0]?.p_reason === 'network');
f = await failWith(Object.assign(new Error('aborted'), { name: 'AbortError' }));
ok('abort (timeout) → timeout', f.retries[0]?.p_reason === 'timeout');

// إعداد خربان: نوقف الدفعة كلها وما نحرق محاولات
for (const [status, reason] of [[402, 'credits'], [401, 'auth'], [403, 'auth'], [404, 'model']]) {
  f = await failWith({ status }, 8);
  const failedOnes = f.retries.filter((x) => x.p_reason === reason);
  const skipped = f.retries.filter((x) => x.p_reason === 'skipped');
  ok(`${status}: ${reason} stops the batch (no more HF calls after the first wave)`, sent.length <= PARALLEL && failedOnes.length === sent.length, `sent=${sent.length}`);
  ok(`${status}: the rest are put back as skipped`, skipped.length === 8 - sent.length && failedOnes.length + skipped.length === 8);
  ok(`${status}: no new claim after stopping`, calls('moderation_claim').length === 1);
}

// النموذج يتجهّز عند المزوّد (أول طلب): نوقف الدفعة ونرجّع الكل بعد دقيقة بدون ما تنحسب محاولة
f = await failWith({ status: 400, text: JSON.stringify({ error: { message: 'The model `Qwen/Qwen3Guard-Gen-4B` is not ready for inference yet. Please try again shortly.', type: 'invalid_request_error', code: 'model_pending_deploy' } }) }, 8);
ok('model warming up: every job goes back as skipped (no attempt used, nothing logged)', f.retries.length === 8 && f.retries.every((x) => x.p_reason === 'skipped'), JSON.stringify(f.retries.map((x) => x.p_reason)));
ok('model warming up: no more calls after the first wave', sent.length <= PARALLEL && f.res.body.skipped === 8 && f.res.body.failed === 0, JSON.stringify(f.res.body));
f = await failWith({ status: 503, text: JSON.stringify({ error: { message: 'Qwen/Qwen3Guard-Gen-4B is temporarily at capacity. Please try again shortly.', type: 'server_error', code: 'capacity_exhausted', param: null } }) }, 8);
ok('provider at capacity: same as warming (all skipped, no attempt used)', f.retries.length === 8 && f.retries.every((x) => x.p_reason === 'skipped') && sent.length <= PARALLEL);
f = await failWith({ status: 503, text: 'Service Unavailable' });
ok('any other 503 is still http_5xx (counts an attempt)', f.retries[0]?.p_reason === 'http_5xx');
f = await failWith({ status: 400, text: JSON.stringify({ error: { message: 'bad', code: 'other' } }) });
ok('another 400 is still http_4xx', f.retries[0]?.p_reason === 'http_4xx');

// ---------- دفعات متتالية والتوازي ----------
reset();
reply = () => 'Safety: Safe\nCategories: None';
db.batches = [Array.from({ length: BATCH }, (_, i) => job('comment', `c-1${String(i).padStart(5, '0')}`, `تعليق ${i}`)),
              Array.from({ length: 4 }, (_, i) => job('comment', `c-2${String(i).padStart(5, '0')}`, `تعليق ب ${i}`))];
r = await call();
ok('a full batch claims again; a short one stops', calls('moderation_claim').length === 2 && r.body.checked === BATCH + 4, JSON.stringify(r.body));
ok(`at most ${PARALLEL} calls at the same time`, maxInFlight <= PARALLEL && maxInFlight > 1, `max=${maxInFlight}`);

// ---------- أعطال القاعدة ----------
reset();
db.claimError = 'boom';
r = await call();
ok('claim error → 200 with zero totals (cron tries again next minute)', r.status === 200 && r.body.checked === 0 && sent.length === 0);
reset();
db.settleError = 'boom';
db.batches = [[job('post', 'p-000200', 'نص')]];
r = await call();
ok('settle error → counted as failed, not as checked', r.body.failed === 1 && r.body.checked === 0);

console.log(failed ? `\n${failed} FAILED` : '\nALL MODERATE TESTS PASSED');
