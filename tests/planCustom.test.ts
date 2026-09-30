// خطتك الخاصة: تمارينك مكان تمارين الخطة، والسعرات والوجبات تبقى، وتعدّي فحص الخطة في التطبيق
import assert from 'node:assert/strict';
import { buildCustomPlan, builderDaysFromPlan, cleanReps, planDaysFromBuilder, planKind, validReps } from '../src/lib/plan/custom.ts';
import { generateRulesPlan } from '../src/lib/plan/rules.ts';
import type { PlanDay } from '../src/lib/plan/types.ts';
import { isWeeklyPlan } from '../src/lib/plan/validate.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };
const T = (ar: string, en: string) => ({ ar, en });

const base = generateRulesPlan({ gender: 'male', age: 29, height_cm: 178, weight_kg: 86, goal: 'lose', level: 'intermediate', days_per_week: 4 }, new Date('2026-09-30T00:00:00Z'));
const days: PlanDay[] = [3, 0, 1, 2, 4, 5, 6].map((d) => d === 0 || d === 3
  ? { day: d, rest: false, focus: T('صدر', 'Chest'), exercises: [{ name: T('بنش', 'Bench'), exercise_id: 'bench_bb', sets: 4, reps: '6-8', rest_sec: 120, rir: '1-2' }] }
  : { day: d, rest: true, focus: T('راحة', 'Rest'), exercises: [] });

test('custom plan keeps meals/targets, replaces workouts, passes the validator', () => {
  const p = buildCustomPlan(days, { ...base, program: { id: 'arq_ppl_3d', name: T('ب', 'P') }, photo_notes: T('x', 'x'), request_id: 'r1' }, new Date('2026-10-01T00:00:00Z'));
  assert.ok(isWeeklyPlan(p));
  assert.equal(p.custom, true);
  assert.deepEqual(p.days.map((d) => d.day), [0, 1, 2, 3, 4, 5, 6], 'days sorted by weekday');
  assert.equal(p.days.filter((d) => !d.rest).length, 2);
  assert.deepEqual(p.meals, base.meals, 'meals unchanged');
  assert.deepEqual(p.targets, base.targets, 'targets unchanged');
  assert.equal(p.program, undefined, 'no longer a ready program');
  assert.equal(p.request_id, undefined);
  assert.equal(p.photo_notes, undefined, 'old photo notes are not about these workouts');
  assert.ok(p.summary.ar.includes('2') && p.summary.en.includes('2 training days'));
  assert.equal(p.generated_at, '2026-10-01T00:00:00.000Z');
});

test('a day with no exercises marked as training fails the validator (the builder blocks it)', () => {
  const bad = buildCustomPlan([...days.slice(1), { day: 3, rest: false, focus: T('x', 'x'), exercises: [] }], base);
  assert.equal(isWeeklyPlan(bad), false);
});

test('plan kind for the header label', () => {
  assert.equal(planKind(null), null);
  assert.equal(planKind({ source: 'ai', data: base }), 'ai');
  assert.equal(planKind({ source: 'rules', data: base }), 'rules');
  assert.equal(planKind({ source: 'ai', data: { ...base, program: { id: 'x', name: T('a', 'b') } } }), 'program');
  assert.equal(planKind({ source: 'rules', data: { ...base, custom: true } }), 'custom');
});

test('reps: Arabic digits become Latin, junk is dropped, a lone dash is not valid', () => {
  assert.equal(cleanReps('١٠-١٢'), '10-12');
  assert.equal(cleanReps('۸–۱۰'), '8-10', 'Persian digits and an en dash');
  assert.equal(cleanReps('٣٠ ث'), '30 ث');
  assert.equal(cleanReps('12 reps!'), '12 s', 'letters other than s/ث are removed');
  assert.equal(cleanReps('1234567890'), '12345678');
  assert.equal(validReps('10-12'), true);
  assert.equal(validReps('-'), false);
  assert.equal(validReps(' '), false);
  assert.equal(validReps(cleanReps('١٢')), true);
});

test('editing an existing plan keeps both-language titles, cardio and unmatched exercises', () => {
  const L = (x: { ar: string; en: string }) => x.ar;
  const plan: PlanDay[] = [
    { day: 0, rest: false, focus: T('صدر', 'Chest'), cardio: T('مشي ١٠ دقائق', '10 min walk'),
      exercises: [{ name: T('بنش', 'Bench'), exercise_id: 'bench_bb', sets: 4, reps: '6-8', rest_sec: 120 },
        { name: T('تمرين غريب', 'Odd move'), sets: 3, reps: '10', rest_sec: 60 }] },
    { day: 1, rest: true, focus: T('راحة', 'Rest'), exercises: [] },
    { day: 3, rest: false, focus: T('ظهر', 'Back'), exercises: [{ name: T('سحب', 'Row'), exercise_id: 'row_bb', sets: 3, reps: '8-10', rest_sec: 90 }] },
  ];
  const resolve = (e: { exercise_id?: string }) => (e.exercise_id ? { ...e, name: T('مربوط', 'Linked') } as never : null);
  const b = builderDaysFromPlan(plan, L, resolve);
  assert.deepEqual(b.map((d) => d.on), [true, false, false, true, false, false, false]);
  assert.equal(b[0].exercises.length, 2, 'the unmatched exercise is kept');
  assert.equal(b[0].exercises[0].name.en, 'Linked');
  assert.equal(b[0].exercises[1].name.en, 'Odd move');
  assert.equal(b[0].title, 'صدر');

  // بدون أي تعديل: العناوين باللغتين والكارديو يبقون
  const same = planDaysFromBuilder(b, L, (i) => T(`يوم ${i}`, `Day ${i}`));
  assert.deepEqual(same[0].focus, T('صدر', 'Chest'));
  assert.deepEqual(same[0].cardio, T('مشي ١٠ دقائق', '10 min walk'));
  assert.deepEqual(same[3].focus, T('ظهر', 'Back'));
  assert.equal(same[1].rest, true);

  // عدّل عنوان يوم، وأضاف يوم بدون اسم
  b[3] = { ...b[3], title: 'ظهر وباي' };
  b[5] = { on: true, title: '  ', exercises: b[3].exercises };
  const edited = planDaysFromBuilder(b, L, (i) => T(`يوم ${i}`, `Day ${i}`));
  assert.deepEqual(edited[3].focus, T('ظهر وباي', 'ظهر وباي'), 'an edited title is used for both languages');
  assert.deepEqual(edited[5].focus, T('يوم 5', 'Day 5'), 'unnamed day gets the default title in both languages');
  assert.equal(edited[5].cardio, undefined);
  assert.ok(isWeeklyPlan(buildCustomPlan(edited, base)), 'the result passes the validator');
});

console.log(`\n${passed} custom plan tests passed`);
