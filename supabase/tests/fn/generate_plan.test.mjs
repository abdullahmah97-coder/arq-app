// اختبار دالة generate-plan (الإصدار ٢) بدون إنترنت: Deno و supabase و Anthropic كلها بدائل
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 supabase/functions/generate-plan/index.ts --bundle --format=esm --platform=node \
//     --alias:npm:@supabase/supabase-js@2=./supabase/tests/fn/supabase-mock-plan.mjs \
//     --alias:jsr:@std/encoding@1/base64=./supabase/tests/fn/base64-shim.mjs --outfile=node_modules/.cache/fn/generate_plan.bundle.mjs
//   npx esbuild@0.25 src/lib/plan/validate.ts --bundle --format=esm --platform=node --outfile=node_modules/.cache/fn/validate.bundle.mjs
//   node supabase/tests/fn/generate_plan.test.mjs
import { plan as db } from './supabase-mock-plan.mjs';

let handler;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', ANTHROPIC_API_KEY: 'k' };
const waited = [];
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };
globalThis.EdgeRuntime = { waitUntil: (p) => waited.push(p) };

// Anthropic البديل: يرد حسب البرومبت (تمارين أو وجبات)، ونسجّل متى بدأ كل طلب ومتى خلص
const calls = [];
let reply = { training: null, meals: null };
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const kind = body.system.includes('TRAINING part') ? 'training' : 'meals';
  const entry = { kind, body, start: Date.now(), end: null };
  calls.push(entry);
  const r = reply[kind];
  await new Promise((res) => setTimeout(res, 60));
  entry.end = Date.now();
  if (!r) return new Response('{"error":"down"}', { status: 529 });
  return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: typeof r === 'string' ? r : 'Here:\n' + JSON.stringify(r) }] }), { status: 200 });
};

const mod = await import('../../../node_modules/.cache/fn/generate_plan.bundle.mjs');
const { isWeeklyPlan } = await import('../../../node_modules/.cache/fn/validate.bundle.mjs');

let failed = 0;
const ok = (c, label, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', label, extra); if (!c) { failed++; process.exitCode = 1; } };
const call = async (body, auth = 'Bearer good') => {
  const res = await handler(new Request('https://fn/generate-plan', { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

const input = { gender: 'male', age: 29, height_cm: 178, weight_kg: 86, goal: 'lose', level: 'intermediate', days_per_week: 4 };
const targets = { bmi: 27.1, bmr: 1850, calories: 2400, protein_g: 150, carbs_g: 250, fat_g: 72, water_l: 3.4 };
const T = (ar, en) => ({ ar, en });
const TRAINING = {
  summary: T('تقسيم علوي/سفلي ٤ أيام', 'Upper/lower split, 4 days'),
  days: [
    { day: 0, rest: false, focus: T('علوي', 'Upper'), ex: [{ id: 'bench_bb', sets: 4, reps: '6-8', rest: 120, rir: '1-2' }, { id: 'row_bb', sets: 4, reps: '8-10', rest: 120 }, { id: 'made_up_move', sets: 3, reps: '10' }, { id: 'lateral_raise', sets: 3, reps: '12-15', rest: 60, note: T('ببطء', 'Slowly') }] },
    { day: 1, rest: false, focus: T('سفلي', 'Lower'), ex: [{ id: 'back_squat', sets: 4, reps: '6-8', rest: 150 }, { id: 'rdl_bb', sets: 3, reps: '8-10', rest: 120 }, { id: 'calf_raise', sets: 3, reps: '12-15', rest: 60 }] },
    { day: 2, rest: true, focus: T('راحة', 'Rest'), ex: [], cardio: T('مشي ٣٠ دقيقة', '30 min walk') },
    { day: 3, rest: false, focus: T('علوي ٢', 'Upper 2'), ex: [{ id: 'ohp_standing', sets: 3, reps: '6-8', rest: 120 }, { id: 'lat_pulldown', sets: 3, reps: '10-12', rest: 90 }, { id: 'curl_db', sets: 3, reps: '10-12', rest: 60 }] },
    { day: 4, rest: false, focus: T('سفلي ٢', 'Lower 2'), ex: [{ id: 'leg_press', sets: 3, reps: '10-12', rest: 90 }, { id: 'leg_curl_lying', sets: 3, reps: '10-12', rest: 60 }, { id: 'plank', sets: 3, reps: '30-45s', rest: 45 }] },
    { day: 5, rest: true, focus: T('راحة', 'Rest'), ex: [] },
    { day: 6, rest: true, focus: T('راحة', 'Rest'), ex: [] },
  ],
  tips: [T('نم ٧-٩ ساعات', 'Sleep 7-9 h'), T('بروتين كافي', 'Enough protein'), 'bad tip'],
  photo_notes: T('ملاحظة', 'Note'),
};
const MEALS = { meals: ['breakfast', 'lunch', 'snack', 'dinner'].flatMap((slot, k) => [0, 1, 2].map((i) => ({
  slot, name: T(`وجبة ${slot} ${i}`, `${slot} ${i}`), kcal: [600, 840, 360, 600][k], p: [30, 50, 15, 35][k],
  items: [{ ar: 'دجاج', en: 'Chicken', q: 150, u: 'g' }, { ar: 'بيض', en: 'Eggs', q: 2, u: 'pc' }, { ar: 'حليب', en: 'Milk', q: 200, u: 'ml' }],
}))) };

// ---- الحماية ----
ok((await call({ input, targets }, '')).status === 401, 'signed-out → 401');
ok((await call({ input })).body.error === 'missing_input', 'missing targets → 400');
ok((await call({ input: { ...input, days_per_week: 9 }, targets })).body.error === 'missing_input', 'days out of range → 400');
ok((await call({ input, targets: { ...targets, calories: 99999 } })).body.error === 'missing_input', 'absurd targets → 400');
db.aiCount = 5;
let r = await call({ input, targets });
ok(r.status === 429 && r.body.error === 'rate_limited', '5 AI plans today → rate_limited');
ok(JSON.stringify(db.countFilters.at(-1)).includes('"is","data->program",null'), 'program adoptions are not counted against the limit');
db.aiCount = 1;

// ---- خطة كاملة (نسخة التطبيق القديمة: بدون حفظ) ----
reply = { training: TRAINING, meals: MEALS };
calls.length = 0;
r = await call({ input, targets, photo_path: 'someone-else/x.jpg' });
ok(r.status === 200 && r.body.plan && !r.body.plan_id, 'old clients get the plan without saving', r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
const p = r.body.plan;
ok(isWeeklyPlan(p), 'passes the app’s plan validator (old and new app versions)');
ok(calls.length === 2 && calls[1].start < calls[0].end, 'training and meals are requested in parallel');
ok(calls.every((c) => c.body.max_tokens <= 4000), 'short outputs (≤ 4000 tokens each)');
ok(p.days.length === 7 && p.days.filter((d) => !d.rest).length === 4, '7 days, 4 training days');
const d0 = p.days[0];
ok(d0.exercises.length === 3 && !d0.exercises.some((e) => e.exercise_id === 'made_up_move'), 'unknown exercise ids are dropped');
ok(d0.exercises[0].name.ar === 'بنش برس بالبار' || d0.exercises[0].name.ar.length > 2, 'names come from the app library', d0.exercises[0].name.ar);
ok(d0.exercises[0].rir === '1-2' && d0.exercises[0].rest_sec === 120 && d0.exercises[2].notes?.en === 'Slowly', 'sets/reps/rest/rir/notes kept');
ok(p.days[2].rest && p.days[2].cardio?.en === '30 min walk' && p.days[2].exercises.length === 0, 'rest day with light cardio');
ok(p.meals.length === 7 && p.meals.every((d) => d.meals.length === 4), '7 meal days × 4 meals');
const dayKcal = p.meals[0].meals.reduce((a, m) => a + m.kcal, 0);
ok(Math.abs(dayKcal - targets.calories) <= 60, 'each day’s meals add up to the calorie target', String(dayKcal));
ok(p.meals[0].meals[0].portions.some((x) => /^\d+ g$/.test(x.amount)) && p.meals[0].meals[0].portions.some((x) => /^\d+$/.test(x.amount)), 'portions scaled with units (g / ml / pieces)');
ok(new Set(p.meals.map((d) => d.meals[0].name.en)).size === 3, 'breakfast rotates through the 3 options');
ok(r.body.meals_source === 'ai' && p.tips.length === 2 && p.targets.calories === 2400, 'tips cleaned, targets kept');
ok(!p.photo_notes, 'no photo → no photo notes (photo of another user is ignored)');
ok(calls[0].body.system.includes('bench_bb (Barbell Bench Press; bb)') || calls[0].body.system.includes('bench_bb ('), 'gym prompt lists barbell exercises');

// ---- البيت: الأدوات تتفلتر ----
calls.length = 0;
r = await call({ input, targets, place: 'home' });
const homeSystem = calls.find((c) => c.kind === 'training').body.system;
ok(!homeSystem.includes('bench_bb (') && homeSystem.includes('push_up (') && homeSystem.includes('HOME'), 'home prompt lists only home equipment');
ok(r.body.plan.days[0].exercises.every((e) => !['bench_bb', 'row_bb'].includes(e.exercise_id)), 'gym-only picks are dropped for home plans');

// ---- الوجبات فشلت: قوالب محلية بدل ما تفشل الخطة ----
reply = { training: TRAINING, meals: null };
r = await call({ input, targets });
ok(r.status === 200 && r.body.meals_source === 'templates' && isWeeklyPlan(r.body.plan), 'meals AI down → local meal templates, plan still ready');
ok(r.body.plan.meals[0].meals[1].name.en === 'Healthy chicken kabsa' || r.body.plan.meals.some((d) => d.meals.some((m) => m.name.en.includes('kabsa'))), 'templates are the Saudi meal set');

// ---- التمارين فشلت ----
reply = { training: 'sorry, cannot help', meals: MEALS };
r = await call({ input, targets });
ok(r.status === 502 && r.body.error === 'ai_bad_output', 'training output without JSON → ai_bad_output');
reply = { training: { days: [{ day: 0, ex: [{ id: 'nope' }] }] }, meals: MEALS };
r = await call({ input, targets });
ok(r.status === 502, 'no valid training day → error (not an empty plan)');
reply = { training: null, meals: MEALS };
r = await call({ input, targets });
ok(r.status === 502 && r.body.error === 'ai_failed', 'Anthropic down → ai_failed');

// ---- التطبيق الجديد: الدالة تحفظ الخطة بنفسها ----
reply = { training: TRAINING, meals: MEALS };
db.inbody.add('11111111-2222-4333-8444-555555555555');
waited.length = 0;
r = await call({ input, targets, save: true, request_id: 'req-12345678', inbody_report_id: '11111111-2222-4333-8444-555555555555' });
ok(r.status === 200 && r.body.plan_id === `plan-${db.nextId - 1}`, 'save:true → plan saved, id returned');
const ins = db.inserts.at(-1);
ok(ins.source === 'ai' && ins.active === true && ins.user_id === 'u1' && ins.data.request_id === 'req-12345678', 'saved as the active AI plan with the request id');
ok(ins.inbody_report_id === '11111111-2222-4333-8444-555555555555', 'own InBody report is linked');
ok(db.updates.at(-1).at === db.inserts.length - 1 && JSON.stringify(db.updates.at(-1).filters).includes('"active",true'), 'old active plan deactivated before insert');
ok(waited.length === 1, 'work continues in the background (EdgeRuntime.waitUntil)');
r = await call({ input, targets, save: true, inbody_report_id: '99999999-2222-4333-8444-555555555555' });
ok(db.inserts.at(-1).inbody_report_id === null, 'someone else’s InBody report id is ignored');
db.failInsert = 1;
r = await call({ input, targets, save: true });
ok(r.status === 200 && r.body.plan_id, 'a racing save is retried once');
db.failInsert = 5;
r = await call({ input, targets, save: true });
ok(r.status === 500 && r.body.error === 'save_failed', 'save keeps failing → save_failed');
db.failInsert = 0;

// ---- وجبات بصيغة قريبة (qty/unit/name) تنقبل ----
reply = { training: TRAINING, meals: { meals: MEALS.meals.map((m) => ({ ...m, items: m.items.map((it) => ({ name: { ar: it.ar, en: it.en }, qty: it.q, unit: it.u === 'pc' ? 'pieces' : it.u })) })) } };
r = await call({ input, targets });
ok(r.status === 200 && r.body.meals_source === 'ai', 'meal items with qty/unit/name keys are accepted');

// ---- تمرين مكتوب باسمه بدل المعرّف ينقبل ----
reply = { training: { ...TRAINING, days: [{ day: 0, focus: T('ص', 'P'), ex: [{ name: { en: 'Barbell Bench Press' }, sets: 3, reps: '8' }, { id: 'goblet squat', sets: 3, reps: '10' }] }, ...TRAINING.days.slice(1)] }, meals: MEALS };
r = await call({ input, targets });
ok(r.status === 200 && r.body.plan.days[0].exercises.map((e) => e.exercise_id).join() === 'bench_bb,goblet_squat', 'exercise given by English name or spaced id is matched', r.body.plan?.days[0].exercises.map((e) => e.exercise_id).join());

// ---- المكتبة ----
ok(mod.LIBRARY.length >= 150 && mod.LIBRARY.every((x) => x.length === 5 && x[3] && x[4]), 'library has every exercise with both names');
ok(mod.libraryPrompt('home').split('\n').every((l) => !/\(.*; (bb|machine|cable)\)/.test(l)), 'home library has no barbell/machine/cable');

if (!failed) console.log('\nall generate-plan tests passed');
